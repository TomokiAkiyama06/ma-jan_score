'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ImageIcon, Minus, Plus, ChevronLeft, Keyboard, CheckCircle2, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { calculateRank, getSeatChangeReminder, pickMySeatIndex } from '@/lib/calculations'
import type { Preset, Session, OcrResult, OcrScore } from '@/lib/types'

type Props = {
  presets: Preset[]
  userId: string
  activeSession: (Session & { preset: Preset }) | null
  needsNewSession: boolean
  hanchansInSession: number
}

// 卓配置: [北, 西, 南, 東] の表示順
const POSITION_LAYOUT = [
  { pos: 'north', label: '北', gridArea: 'north' },
  { pos: 'west',  label: '西', gridArea: 'west' },
  { pos: 'south', label: '南', gridArea: 'south' },
  { pos: 'east',  label: '東', gridArea: 'east' },
] as const

const RANK_COLOR = ['', 'text-yellow-400', 'text-zinc-300', 'text-orange-400', 'text-red-400']

type OcrStep = 'idle' | 'compressing' | 'uploading' | 'analyzing' | 'done'

const OCR_STEP_LABEL: Record<OcrStep, string> = {
  idle: '',
  compressing: '画像を最適化中...',
  uploading: 'アップロード中...',
  analyzing: 'AIがスコアを解析中...',
  done: '解析完了',
}

async function compressImage(file: File, maxPx = 1280, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob(blob => {
        resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file)
      }, 'image/jpeg', quality)
    }
    img.onerror = () => resolve(file)
    img.src = URL.createObjectURL(file)
  })
}

export function RecordForm({ presets, userId, activeSession, needsNewSession, hanchansInSession }: Props) {
  const router = useRouter()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [sessionModalOpen, setSessionModalOpen] = useState(needsNewSession || !activeSession)
  const [selectedPresetId, setSelectedPresetId] = useState(
    activeSession?.preset_id ?? presets.find(p => p.is_default)?.id ?? presets[0]?.id ?? ''
  )
  const [currentSession, setCurrentSession] = useState<(Session & { preset: Preset }) | null>(activeSession)

  // OCRスコアは位置情報付きで保持
  const [ocrData, setOcrData] = useState<OcrScore[]>([
    { value: null, position: 'south' },
    { value: null, position: 'west' },
    { value: null, position: 'north' },
    { value: null, position: 'east' },
  ])
  const [ocrConfidence, setOcrConfidence] = useState<OcrResult['confidence'] | null>(null)
  const [myIndex, setMyIndex] = useState<number | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [chipCount, setChipCount] = useState(0)
  const [notes, setNotes] = useState('')
  const [ocrStep, setOcrStep] = useState<OcrStep>('idle')
  const [saving, setSaving] = useState(false)
  const [manualMode, setManualMode] = useState(false)

  const selectedPreset = presets.find(p => p.id === selectedPresetId)
  const scores = ocrData.map(d => d.value)
  const validScores = scores.filter((s): s is number => s !== null)
  const totalScore = validScores.reduce((a, b) => a + b, 0)
  const scoreMismatch = validScores.length === 4 && Math.abs(totalScore - 100000) > 500
  const allScoresFilled = scores.every(s => s !== null)
  const myRank = myIndex !== null && allScoresFilled ? calculateRank(scores as number[], myIndex) : null
  const isOcrRunning = ocrStep !== 'idle' && ocrStep !== 'done'

  async function startSession() {
    if (!selectedPresetId) { toast.error('プリセットを選択してください'); return }
    const supabase = createClient()
    const { data, error } = await supabase
      .from('sessions')
      .insert({ user_id: userId, preset_id: selectedPresetId, mode: 'free' })
      .select('*, preset:presets(*)')
      .single()
    if (error) { toast.error('セッション開始に失敗しました'); return }
    setCurrentSession(data as Session & { preset: Preset })
    setSessionModalOpen(false)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('画像ファイルを選択してください'); return }
    if (file.size > 20 * 1024 * 1024) { toast.error('ファイルサイズは20MB以下にしてください'); return }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setManualMode(false)
    runOcr(file)
  }

  async function runOcr(file: File) {
    setOcrStep('compressing')
    setOcrData([
      { value: null, position: 'south' },
      { value: null, position: 'west' },
      { value: null, position: 'north' },
      { value: null, position: 'east' },
    ])
    setOcrConfidence(null)
    setMyIndex(null)

    let compressed = file
    if (file.size > 500 * 1024) compressed = await compressImage(file)

    setOcrStep('analyzing')
    try {
      const formData = new FormData()
      formData.append('image', compressed)
      const res = await fetch('/api/ocr', { method: 'POST', body: formData })
      if (!res.ok) throw new Error()
      const result: OcrResult = await res.json()
      setOcrData(result.scores)
      setOcrConfidence(result.confidence)
      setOcrStep('done')

      // south位置を自動で自席に設定
      const autoIdx = pickMySeatIndex(result.scores)
      setMyIndex(autoIdx)

      if (result.confidence === 'low') {
        toast.warning('読み取り精度が低めです。スコアを確認してください。')
      } else if (result.scores.some(s => s.value === null)) {
        toast.warning('一部のスコアが読み取れませんでした。確認してください。')
      }
    } catch {
      toast.error('OCRに失敗しました。手動で入力してください。')
      setOcrStep('idle')
      setManualMode(true)
    }
  }

  function startEdit(index: number) {
    setEditingIndex(index)
    setEditValue(String(ocrData[index].value ?? ''))
  }

  function commitEdit() {
    if (editingIndex === null) return
    const v = parseInt(editValue)
    setOcrData(d => d.map((x, i) => i === editingIndex ? { ...x, value: isNaN(v) ? x.value : v } : x))
    setEditingIndex(null)
  }

  async function handleSave() {
    if (!currentSession) { toast.error('セッションを開始してください'); return }
    if (myIndex === null) { toast.error('自分の席を選択してください'); return }
    if (!allScoresFilled) { toast.error('4人分のスコアを入力してください'); return }

    const scoreValues = scores as number[]
    const myRank = calculateRank(scoreValues, myIndex)
    setSaving(true)

    const supabase = createClient()
    let photoUrl: string | null = null
    if (imageFile) {
      const path = `${userId}/${Date.now()}_${imageFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: uploadError } = await supabase.storage.from('hanchan-photos').upload(path, imageFile)
      if (!uploadError) photoUrl = path
    }

    const { error } = await supabase.from('hanchans').insert({
      user_id: userId,
      session_id: currentSession.id,
      scores: scoreValues,
      my_seat_index: myIndex,
      my_rank: myRank,
      chip_count: chipCount,
      photo_url: photoUrl,
      notes: notes.trim() || null,
    })

    if (error) { toast.error('保存に失敗しました'); setSaving(false); return }

    if (navigator.vibrate) navigator.vibrate([100, 50, 100])

    // 場替えリマインダー
    const preset = currentSession.preset
    const reminder = getSeatChangeReminder(hanchansInSession + 1, preset?.seat_change_interval ?? null)
    if (reminder) {
      toast.info(reminder, { duration: 5000 })
    } else {
      toast.success(`${myRank}位で記録しました！`)
    }

    router.push('/')
    router.refresh()
  }

  if (presets.length === 0) {
    return (
      <div className="px-4 pt-6 space-y-4">
        <Link href="/" className="flex items-center gap-1 text-zinc-400 text-sm"><ChevronLeft size={16} />戻る</Link>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 text-center">
          <p className="text-zinc-400">プリセットが未設定です</p>
          <Link href="/presets" className="text-zinc-200 underline text-sm mt-2 block">ルール設定へ</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/" className="p-1 text-zinc-400"><ChevronLeft size={20} /></Link>
        <h1 className="text-xl font-bold text-zinc-50">新規記録</h1>
      </div>

      {currentSession && (
        <div className="rounded-lg bg-zinc-800/60 border border-zinc-700 px-4 py-2.5 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500">使用ルール</p>
            <p className="text-sm font-semibold text-zinc-100">{currentSession.preset?.name}</p>
          </div>
          <button onClick={() => setSessionModalOpen(true)} className="text-xs text-zinc-500 underline px-2 py-1">変更</button>
        </div>
      )}

      {/* カメラ / OCR */}
      <div className="space-y-3">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

        {imagePreview ? (
          <div className="relative rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
            <img src={imagePreview} alt="撮影した得点表示" className="w-full object-contain max-h-52" />
            {isOcrRunning && (
              <div className="absolute inset-0 bg-zinc-950/70 flex flex-col items-center justify-center gap-2">
                <div className="w-8 h-8 border-2 border-zinc-50 border-t-transparent rounded-full animate-spin" />
                <p className="text-zinc-200 text-sm font-medium">{OCR_STEP_LABEL[ocrStep]}</p>
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
              <button onClick={() => cameraRef.current?.click()} className="bg-zinc-900/80 text-zinc-200 text-xs px-3 py-1.5 rounded-full border border-zinc-700 flex items-center gap-1">
                <Camera size={12} /> 撮り直す
              </button>
              <button onClick={() => galleryRef.current?.click()} className="bg-zinc-900/80 text-zinc-200 text-xs px-3 py-1.5 rounded-full border border-zinc-700 flex items-center gap-1">
                <ImageIcon size={12} /> 選び直す
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => cameraRef.current?.click()} className="rounded-xl bg-zinc-900 border-2 border-dashed border-zinc-700 p-6 flex flex-col items-center gap-2 active:border-zinc-500 active:bg-zinc-800 transition-colors">
                <Camera size={28} className="text-zinc-400" />
                <span className="text-zinc-300 text-sm font-medium">撮影する</span>
                <span className="text-zinc-600 text-xs">カメラを起動</span>
              </button>
              <button onClick={() => galleryRef.current?.click()} className="rounded-xl bg-zinc-900 border-2 border-dashed border-zinc-700 p-6 flex flex-col items-center gap-2 active:border-zinc-500 active:bg-zinc-800 transition-colors">
                <ImageIcon size={28} className="text-zinc-400" />
                <span className="text-zinc-300 text-sm font-medium">写真を選ぶ</span>
                <span className="text-zinc-600 text-xs">ライブラリから</span>
              </button>
            </div>
            <button onClick={() => { setManualMode(true); setOcrData(d => d.map(x => ({ ...x, value: null }))) }} className="w-full flex items-center justify-center gap-2 py-3 text-zinc-500 text-sm hover:text-zinc-300 transition-colors">
              <Keyboard size={16} />手動で入力する
            </button>
          </div>
        )}
      </div>

      {/* スコアカード（卓配置風: 北上・南下） */}
      {(manualMode || imagePreview || ocrData.some(d => d.value !== null)) && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">
            {myIndex === null ? '自分の席をタップして選択（南が自動選択されます）' : '長押しでスコアを編集'}
          </p>

          {/* 卓配置: 北 / 西・東 / 南 */}
          <div className="space-y-2">
            {/* 北 */}
            {['north'].map(pos => {
              const idx = ocrData.findIndex(d => d.position === pos)
              if (idx === -1) return null
              const score = ocrData[idx].value
              return (
                <div key={pos} className="flex justify-center">
                  <ScoreCard idx={idx} pos={pos} label="北" score={score} myIndex={myIndex} onSelect={setMyIndex} onEdit={startEdit} ocrData={ocrData} />
                </div>
              )
            })}
            {/* 西・東 */}
            <div className="grid grid-cols-2 gap-3">
              {['west', 'east'].map(pos => {
                const idx = ocrData.findIndex(d => d.position === pos)
                if (idx === -1) return <div key={pos} />
                const score = ocrData[idx].value
                return <ScoreCard key={pos} idx={idx} pos={pos} label={pos === 'west' ? '西' : '東'} score={score} myIndex={myIndex} onSelect={setMyIndex} onEdit={startEdit} ocrData={ocrData} />
              })}
            </div>
            {/* 南 */}
            {['south'].map(pos => {
              const idx = ocrData.findIndex(d => d.position === pos)
              if (idx === -1) return null
              const score = ocrData[idx].value
              return (
                <div key={pos} className="flex justify-center">
                  <ScoreCard idx={idx} pos={pos} label="南（自分）" score={score} myIndex={myIndex} onSelect={setMyIndex} onEdit={startEdit} ocrData={ocrData} highlighted />
                </div>
              )
            })}
          </div>

          {allScoresFilled && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${scoreMismatch ? 'bg-amber-950/40 border border-amber-800/40' : 'bg-zinc-900 border border-zinc-800'}`}>
              {scoreMismatch ? (
                <><AlertCircle size={14} className="text-amber-400 flex-none" /><span className="text-amber-400">合計 {totalScore.toLocaleString()}点（100,000との差: {Math.abs(totalScore - 100000).toLocaleString()}点）</span></>
              ) : (
                <><CheckCircle2 size={14} className="text-green-400 flex-none" /><span className="text-zinc-400">合計 {totalScore.toLocaleString()}点</span></>
              )}
            </div>
          )}

          {myRank !== null && (
            <p className="text-center text-sm text-zinc-400">
              自動計算着順: <span className={`font-bold text-lg ${RANK_COLOR[myRank]}`}>{myRank}位</span>
            </p>
          )}
        </div>
      )}

      {/* チップ枚数 */}
      <div>
        <Label className="text-sm text-zinc-400 mb-3 block">チップ枚数（マイナス可）</Label>
        <div className="flex items-center gap-4 justify-center">
          <button onClick={() => setChipCount(c => c - 1)} className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center active:bg-zinc-700 transition-colors">
            <Minus size={20} />
          </button>
          <Input value={chipCount} onChange={e => setChipCount(Number(e.target.value))} type="number" inputMode="decimal" className="w-24 text-center text-xl font-bold bg-zinc-900 border-zinc-700 h-12" />
          <button onClick={() => setChipCount(c => c + 1)} className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center active:bg-zinc-700 transition-colors">
            <Plus size={20} />
          </button>
        </div>
        {currentSession?.preset && chipCount !== 0 && (
          <p className="text-center text-xs text-zinc-500 mt-1.5">
            チップ収支: {chipCount > 0 ? '+' : ''}{(chipCount * currentSession.preset.chip_rate).toLocaleString()}円
          </p>
        )}
      </div>

      {/* メモ */}
      <div>
        <Label className="text-sm text-zinc-400 mb-2 block">メモ（任意）</Label>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="例: ○○雀荘、友人宅" className="bg-zinc-900 border-zinc-700 text-zinc-50 placeholder:text-zinc-600" />
      </div>

      <Button onClick={handleSave} disabled={saving || myIndex === null || !allScoresFilled || isOcrRunning} className="w-full h-14 text-base font-bold">
        {saving ? '保存中...' : myIndex === null ? '自分の席を選択してください' : '保存する'}
      </Button>

      {/* スコア編集ダイアログ */}
      <Dialog open={editingIndex !== null} onOpenChange={open => !open && setEditingIndex(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-50">
          <DialogHeader>
            <DialogTitle>{editingIndex !== null ? (['南', '西', '北', '東'][editingIndex] ?? '') : ''}のスコアを入力</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditValue(v => v.startsWith('-') ? v.slice(1) : `-${v}`)} className="flex-none w-14 h-14 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xl font-bold hover:bg-zinc-700 transition-colors">
              +/−
            </button>
            <Input value={editValue} onChange={e => setEditValue(e.target.value)} type="number" inputMode="decimal" className="flex-1 bg-zinc-900 border-zinc-700 text-zinc-50 h-14 text-2xl text-center font-bold" autoFocus onKeyDown={e => e.key === 'Enter' && commitEdit()} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[25000, 30000, 20000, 15000].map(v => (
              <button key={v} onClick={() => setEditValue(String(v))} className="rounded-lg bg-zinc-800 border border-zinc-700 py-2 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors">{(v / 1000).toFixed(0)}k</button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[-5000, -10000, -15000, -20000].map(v => (
              <button key={v} onClick={() => setEditValue(String(v))} className="rounded-lg bg-zinc-800 border border-zinc-700 py-2 text-xs text-red-400 hover:bg-zinc-700 transition-colors">{(v / 1000).toFixed(0)}k</button>
            ))}
          </div>
          <Button onClick={commitEdit} className="w-full h-12">確定</Button>
        </DialogContent>
      </Dialog>

      {/* セッション選択モーダル */}
      <Dialog open={sessionModalOpen} onOpenChange={open => { if (!open && currentSession) setSessionModalOpen(false) }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-50">
          <DialogHeader><DialogTitle>プリセット選択</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-400">今回使用するルールを選択してください</p>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {presets.map(p => (
              <button key={p.id} onClick={() => setSelectedPresetId(p.id)} className={`w-full rounded-lg border p-4 text-left transition-colors ${selectedPresetId === p.id ? 'border-zinc-50 bg-zinc-800' : 'border-zinc-700 bg-zinc-900'}`}>
                <p className="font-semibold text-zinc-100">{p.name}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {p.rate}円/千点　ウマ {p.uma_first}/{p.uma_second}/{p.uma_third}/{p.uma_fourth}
                  {p.seat_change_interval ? `　場替え ${p.seat_change_interval}半荘ごと` : ''}
                </p>
              </button>
            ))}
          </div>
          <Button onClick={startSession} disabled={!selectedPresetId} className="w-full h-12">このルールで開始</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// スコアカードコンポーネント
function ScoreCard({
  idx, pos, label, score, myIndex, onSelect, onEdit, ocrData, highlighted
}: {
  idx: number; pos: string; label: string; score: number | null
  myIndex: number | null; onSelect: (i: number) => void; onEdit: (i: number) => void
  ocrData: { value: number | null; position: string }[]; highlighted?: boolean
}) {
  const isMe = myIndex === idx
  return (
    <button
      className={`rounded-xl border-2 p-4 text-center transition-all active:scale-[0.97] w-full ${
        isMe ? 'border-zinc-50 bg-zinc-800' : highlighted ? 'border-zinc-600 bg-zinc-900' : 'border-zinc-700 bg-zinc-900'
      }`}
      onClick={() => {
        if (score === null) { onEdit(idx); return }
        onSelect(idx)
      }}
      onContextMenu={e => { e.preventDefault(); onEdit(idx) }}
      onPointerDown={e => {
        const target = e.currentTarget
        const t = setTimeout(() => onEdit(idx), 600)
        const cancel = () => clearTimeout(t)
        target.addEventListener('pointerup', cancel, { once: true })
        target.addEventListener('pointermove', cancel, { once: true })
      }}
    >
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      {score !== null ? (
        <p className={`text-2xl font-bold ${isMe ? 'text-zinc-50' : 'text-zinc-300'}`}>
          {score.toLocaleString()}
        </p>
      ) : (
        <p className="text-2xl font-bold text-zinc-600">---</p>
      )}
      {isMe && (
        <div className="flex items-center justify-center gap-1 mt-1">
          <CheckCircle2 size={12} className="text-zinc-400" />
          <span className="text-xs text-zinc-400">自分</span>
        </div>
      )}
      {score === null && <p className="text-[10px] text-zinc-600 mt-1">タップして入力</p>}
    </button>
  )
}
