'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ImageIcon, Keyboard, ChevronLeft, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { calculateRank, getSeatChangeReminder, pickMySeatIndex, formatElapsed, calculateSetFee } from '@/lib/calculations'
import type { Preset, Session, Hanchan, OcrResult, OcrScore } from '@/lib/types'

type Props = {
  session: Session & { preset: Preset }
  hanchans: Hanchan[]
  userId: string
}

type OcrStep = 'idle' | 'compressing' | 'analyzing' | 'done'
const OCR_STEP_LABEL: Record<OcrStep, string> = {
  idle: '', compressing: '画像を最適化中...', analyzing: 'AIがスコアを解析中...', done: '解析完了'
}

const RANK_COLOR = ['', 'text-yellow-400', 'text-zinc-300', 'text-orange-400', 'text-red-400']

async function compressImage(file: File): Promise<File> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file), 'image/jpeg', 0.85)
    }
    img.onerror = () => resolve(file)
    img.src = URL.createObjectURL(file)
  })
}

export function SetRecordForm({ session, hanchans, userId }: Props) {
  const router = useRouter()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const participants = session.participants ?? []
  const preset = session.preset

  // 前回の席配置をデフォルトに。初回は参加者順に自動割当
  const lastHanchan = hanchans[hanchans.length - 1]
  const defaultSeats = lastHanchan?.participants_per_seat ?? (() => {
    // south(0)=自分、west(1)/north(2)/east(3) に残り参加者を順番に割当
    const nonSelf = participants.filter(p => p !== '自分')
    return [
      '自分',
      nonSelf[0] ?? '',
      nonSelf[1] ?? '',
      nonSelf[2] ?? '',
    ]
  })()

  const [ocrData, setOcrData] = useState<OcrScore[]>([
    { value: null, position: 'south' },
    { value: null, position: 'west' },
    { value: null, position: 'north' },
    { value: null, position: 'east' },
  ])
  const [ocrConfidence, setOcrConfidence] = useState<OcrResult['confidence'] | null>(null)
  const [seats, setSeats] = useState<string[]>(defaultSeats)  // 4席の参加者名
  const [myIndex, setMyIndex] = useState<number>(defaultSeats.indexOf('自分') !== -1 ? defaultSeats.indexOf('自分') : 0)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [notes, setNotes] = useState('')
  const [ocrStep, setOcrStep] = useState<OcrStep>('idle')
  const [saving, setSaving] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [usePrevSeats, setUsePrevSeats] = useState(hanchans.length > 0)
  const [endingSet, setEndingSet] = useState(false)

  const scores = ocrData.map(d => d.value)
  const allScoresFilled = scores.every(s => s !== null)
  const totalScore = (scores.filter(Boolean) as number[]).reduce((a, b) => a + b, 0)
  const scoreMismatch = allScoresFilled && Math.abs(totalScore - 100000) > 500
  const myRank = allScoresFilled ? calculateRank(scores as number[], myIndex) : null
  const isOcrRunning = ocrStep !== 'idle' && ocrStep !== 'done'

  // 席ごとの参加者選択で重複を防ぐ
  const availableFor = (seatIdx: number) =>
    participants.filter(p => p === seats[seatIdx] || !seats.includes(p))

  function updateSeat(seatIdx: number, name: string) {
    setSeats(s => s.map((v, i) => i === seatIdx ? name : v))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setManualMode(false)
    runOcr(file)
  }

  async function runOcr(file: File) {
    setOcrStep('compressing')
    setOcrData(d => d.map(x => ({ ...x, value: null })))
    setOcrConfidence(null)
    let compressed = file
    if (file.size > 500 * 1024) compressed = await compressImage(file)
    setOcrStep('analyzing')
    try {
      const fd = new FormData()
      fd.append('image', compressed)
      const res = await fetch('/api/ocr', { method: 'POST', body: fd })
      if (!res.ok) throw new Error()
      const result: OcrResult = await res.json()
      setOcrData(result.scores)
      setOcrConfidence(result.confidence)
      setOcrStep('done')
      // south位置を自分の席とする
      const southOcrIdx = result.scores.findIndex(s => s.position === 'south')
      if (southOcrIdx !== -1) setMyIndex(southOcrIdx)
      if (result.confidence === 'low') toast.warning('読み取り精度が低めです。確認してください。')
    } catch {
      toast.error('OCRに失敗しました。手動で入力してください。')
      setOcrStep('idle')
      setManualMode(true)
    }
  }

  function startEdit(i: number) { setEditingIndex(i); setEditValue(String(ocrData[i].value ?? '')) }
  function commitEdit() {
    if (editingIndex === null) return
    const v = parseInt(editValue)
    setOcrData(d => d.map((x, i) => i === editingIndex ? { ...x, value: isNaN(v) ? x.value : v } : x))
    setEditingIndex(null)
  }

  async function handleSave() {
    if (!allScoresFilled) { toast.error('4人分のスコアを入力してください'); return }
    const validSeats = seats.filter(Boolean)
    if (validSeats.length !== 4) {
      const empty = ['北', '西', '東'].filter((_, i) => !seats[i + 1])
      toast.error(`${empty.join('・')}の席の参加者を選択してください`)
      return
    }
    const scoreValues = scores as number[]
    const rank = calculateRank(scoreValues, myIndex)
    setSaving(true)
    const supabase = createClient()
    let photoUrl: string | null = null
    if (imageFile) {
      const path = `${userId}/${Date.now()}_${imageFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('hanchan-photos').upload(path, imageFile)
      if (!error) photoUrl = path
    }
    const { error } = await supabase.from('hanchans').insert({
      user_id: userId,
      session_id: session.id,
      scores: scoreValues,
      my_seat_index: myIndex,
      my_rank: rank,
      chip_count: 0,
      participants_per_seat: seats,
      photo_url: photoUrl,
      notes: notes.trim() || null,
    })
    if (error) { toast.error('保存に失敗しました'); setSaving(false); return }
    if (navigator.vibrate) navigator.vibrate([100, 50, 100])

    const reminder = getSeatChangeReminder(hanchans.length + 1, preset.seat_change_interval)
    toast.success(reminder ?? `第${hanchans.length + 1}半荘 ${rank}位で記録しました！`, { duration: reminder ? 5000 : 3000 })
    router.refresh()
    setSaving(false)
    // フォームリセット
    setOcrData([{ value: null, position: 'south' }, { value: null, position: 'west' }, { value: null, position: 'north' }, { value: null, position: 'east' }])
    setOcrConfidence(null)
    setImageFile(null)
    setImagePreview(null)
    setNotes('')
    setOcrStep('idle')
    setUsePrevSeats(true)
  }

  async function handleEndSet() {
    setEndingSet(true)
    router.push(`/record/set/${session.id}/end`)
  }

  const approxFee = calculateSetFee(session, new Date())

  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="p-1 text-zinc-400"><ChevronLeft size={20} /></Link>
          <div>
            <h1 className="text-lg font-bold text-zinc-50">{session.set_name ?? 'セット進行中'}</h1>
            <p className="text-xs text-zinc-500">{preset.name} ・ 第{hanchans.length + 1}半荘</p>
          </div>
        </div>
        <Button onClick={handleEndSet} disabled={endingSet} size="sm" variant="outline" className="border-zinc-700 text-zinc-300 text-xs">
          セット終了
        </Button>
      </div>

      {/* セット状態バナー */}
      <div className="rounded-lg bg-zinc-800/60 border border-zinc-700 px-4 py-2.5 flex items-center justify-between text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <Clock size={12} />
          <span>{formatElapsed(session.started_at)}</span>
        </div>
        <span>概算 {approxFee.toLocaleString()}円</span>
        <span>{hanchans.length}半荘完了</span>
      </div>

      {/* カメラ */}
      <div className="space-y-3">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        {imagePreview ? (
          <div className="relative rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
            <img src={imagePreview} alt="得点表示" className="w-full object-contain max-h-44" />
            {isOcrRunning && (
              <div className="absolute inset-0 bg-zinc-950/70 flex flex-col items-center justify-center gap-2">
                <div className="w-7 h-7 border-2 border-zinc-50 border-t-transparent rounded-full animate-spin" />
                <p className="text-zinc-200 text-sm">{OCR_STEP_LABEL[ocrStep]}</p>
              </div>
            )}
            {ocrStep === 'done' && ocrConfidence && (
              <div className="absolute top-2 right-2">
                <Badge variant={ocrConfidence === 'high' ? 'default' : ocrConfidence === 'medium' ? 'secondary' : 'destructive'} className="text-xs">
                  {ocrConfidence === 'high' ? '高精度' : ocrConfidence === 'medium' ? '中精度' : '低精度'}
                </Badge>
              </div>
            )}
            <div className="absolute bottom-2 right-2 flex gap-2">
              <button onClick={() => cameraRef.current?.click()} className="bg-zinc-900/80 text-zinc-200 text-xs px-2.5 py-1.5 rounded-full border border-zinc-700 flex items-center gap-1"><Camera size={11} /> 撮り直す</button>
              <button onClick={() => galleryRef.current?.click()} className="bg-zinc-900/80 text-zinc-200 text-xs px-2.5 py-1.5 rounded-full border border-zinc-700 flex items-center gap-1"><ImageIcon size={11} /> 選び直す</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => cameraRef.current?.click()} className="rounded-xl bg-zinc-900 border-2 border-dashed border-zinc-700 p-5 flex flex-col items-center gap-2 active:bg-zinc-800 transition-colors">
                <Camera size={24} className="text-zinc-400" />
                <span className="text-zinc-300 text-sm font-medium">撮影する</span>
              </button>
              <button onClick={() => galleryRef.current?.click()} className="rounded-xl bg-zinc-900 border-2 border-dashed border-zinc-700 p-5 flex flex-col items-center gap-2 active:bg-zinc-800 transition-colors">
                <ImageIcon size={24} className="text-zinc-400" />
                <span className="text-zinc-300 text-sm font-medium">写真を選ぶ</span>
              </button>
            </div>
            <button onClick={() => { setManualMode(true) }} className="w-full flex items-center justify-center gap-2 py-2 text-zinc-500 text-sm hover:text-zinc-300 transition-colors">
              <Keyboard size={15} /> 手動で入力する
            </button>
          </div>
        )}
      </div>

      {/* スコア + 席割当（卓配置風）*/}
      {(manualMode || imagePreview || ocrData.some(d => d.value !== null)) && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">スコアと席を確認（長押しで編集）</p>

          {/* 北 */}
          <div className="flex justify-center">
            <SetSeatCard i={ocrData.findIndex(d => d.position === 'north')} label="北" ocrData={ocrData} seats={seats} myIndex={myIndex} participants={participants} onEdit={startEdit} onSeatChange={updateSeat} />
          </div>
          {/* 西・東 */}
          <div className="grid grid-cols-2 gap-3">
            <SetSeatCard i={ocrData.findIndex(d => d.position === 'west')} label="西" ocrData={ocrData} seats={seats} myIndex={myIndex} participants={participants} onEdit={startEdit} onSeatChange={updateSeat} />
            <SetSeatCard i={ocrData.findIndex(d => d.position === 'east')} label="東" ocrData={ocrData} seats={seats} myIndex={myIndex} participants={participants} onEdit={startEdit} onSeatChange={updateSeat} />
          </div>
          {/* 南（自分・固定） */}
          <div className="flex justify-center">
            <SetSeatCard i={ocrData.findIndex(d => d.position === 'south')} label="南（自分）" ocrData={ocrData} seats={seats} myIndex={myIndex} participants={participants} onEdit={startEdit} onSeatChange={updateSeat} isMe />
          </div>

          {allScoresFilled && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${scoreMismatch ? 'bg-amber-950/40 border border-amber-800/40' : 'bg-zinc-900 border border-zinc-800'}`}>
              {scoreMismatch
                ? <><AlertCircle size={14} className="text-amber-400 flex-none" /><span className="text-amber-400">合計 {totalScore.toLocaleString()}点（差: {Math.abs(totalScore - 100000).toLocaleString()}点）</span></>
                : <><CheckCircle2 size={14} className="text-green-400 flex-none" /><span className="text-zinc-400">合計 {totalScore.toLocaleString()}点</span></>
              }
            </div>
          )}
          {myRank !== null && (
            <p className="text-center text-sm text-zinc-400">着順: <span className={`font-bold text-lg ${RANK_COLOR[myRank]}`}>{myRank}位</span></p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-sm text-zinc-400">メモ（任意）</label>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="例: 東場南場の区切り" className="bg-zinc-900 border-zinc-700 text-zinc-50 placeholder:text-zinc-600" />
      </div>

      <Button onClick={handleSave} disabled={saving || !allScoresFilled || isOcrRunning} className="w-full h-14 text-base font-bold">
        {saving ? '保存中...' : `第${hanchans.length + 1}半荘を記録`}
      </Button>

      {/* スコア編集ダイアログ */}
      <Dialog open={editingIndex !== null} onOpenChange={open => !open && setEditingIndex(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-50">
          <DialogHeader><DialogTitle>スコアを入力</DialogTitle></DialogHeader>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditValue(v => v.startsWith('-') ? v.slice(1) : `-${v}`)} className="flex-none w-14 h-14 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xl font-bold">+/−</button>
            <Input value={editValue} onChange={e => setEditValue(e.target.value)} type="number" inputMode="decimal" className="flex-1 bg-zinc-900 border-zinc-700 text-zinc-50 h-14 text-2xl text-center font-bold" autoFocus onKeyDown={e => e.key === 'Enter' && commitEdit()} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[25000, 30000, 20000, 15000].map(v => (
              <button key={v} onClick={() => setEditValue(String(v))} className="rounded-lg bg-zinc-800 border border-zinc-700 py-2 text-xs text-zinc-300">{(v / 1000).toFixed(0)}k</button>
            ))}
          </div>
          <Button onClick={commitEdit} className="w-full h-12">確定</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SetSeatCard({
  i, label, ocrData, seats, myIndex, participants, onEdit, onSeatChange, isMe
}: {
  i: number; label: string
  ocrData: OcrScore[]; seats: string[]; myIndex: number; participants: string[]
  onEdit: (i: number) => void; onSeatChange: (i: number, name: string) => void; isMe?: boolean
}) {
  if (i === -1) return <div className="rounded-xl border-2 border-zinc-800 bg-zinc-900 p-4 text-center text-zinc-600 text-sm w-full">—</div>
  const score = ocrData[i].value
  const seat = seats[i] ?? ''
  return (
    <div className={`rounded-xl border-2 p-3 w-full ${isMe ? 'border-zinc-600 bg-zinc-800' : 'border-zinc-700 bg-zinc-900'}`}>
      <p className="text-xs text-zinc-500 text-center mb-1">{label}</p>
      <button
        className="w-full text-center"
        onContextMenu={e => { e.preventDefault(); onEdit(i) }}
        onPointerDown={e => {
          const t = setTimeout(() => onEdit(i), 600)
          const cancel = () => clearTimeout(t)
          e.currentTarget.addEventListener('pointerup', cancel, { once: true })
          e.currentTarget.addEventListener('pointermove', cancel, { once: true })
        }}
        onClick={() => !isMe && score === null && onEdit(i)}
      >
        <p className="text-xl font-bold text-zinc-200">{score !== null ? score.toLocaleString() : '---'}</p>
      </button>
      {isMe ? (
        <p className="text-center text-xs text-zinc-400 mt-1">自分</p>
      ) : (
        <select
          value={seat}
          onChange={e => onSeatChange(i, e.target.value)}
          className="w-full mt-1.5 bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-md px-2 py-1.5"
        >
          <option value="">— 選択 —</option>
          {participants.filter(p => p !== '自分').map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      )}
    </div>
  )
}
