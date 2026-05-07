'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Minus, Plus, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { calculateRank } from '@/lib/calculations'
import type { Preset, Session, OcrResult } from '@/lib/types'

type Props = {
  presets: Preset[]
  userId: string
  activeSession: (Session & { preset: Preset }) | null
  needsNewSession: boolean
}

const SEAT_LABELS = ['東家', '南家', '西家', '北家']

export function RecordForm({ presets, userId, activeSession, needsNewSession }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [sessionModalOpen, setSessionModalOpen] = useState(needsNewSession || !activeSession)
  const [selectedPresetId, setSelectedPresetId] = useState(
    activeSession?.preset_id ?? presets.find(p => p.is_default)?.id ?? presets[0]?.id ?? ''
  )
  const [currentSession, setCurrentSession] = useState<(Session & { preset: Preset }) | null>(activeSession)

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [ocrScores, setOcrScores] = useState<(number | null)[]>([null, null, null, null])
  const [myIndex, setMyIndex] = useState<number | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [chipCount, setChipCount] = useState(0)
  const [notes, setNotes] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectedPreset = presets.find(p => p.id === selectedPresetId)
  const validScores = ocrScores.filter((s): s is number => s !== null)
  const totalScore = validScores.reduce((a, b) => a + b, 0)
  const scoreMismatch = validScores.length === 4 && Math.abs(totalScore - 100000) > 500

  async function startSession() {
    if (!selectedPresetId) { toast.error('プリセットを選択してください'); return }
    const supabase = createClient()
    const { data, error } = await supabase
      .from('sessions')
      .insert({ user_id: userId, preset_id: selectedPresetId })
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
    if (file.size > 10 * 1024 * 1024) { toast.error('ファイルサイズは10MB以下にしてください'); return }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    runOcr(file)
  }

  async function runOcr(file: File) {
    setOcrLoading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch('/api/ocr', { method: 'POST', body: formData })
      if (!res.ok) throw new Error()
      const result: OcrResult = await res.json()
      setOcrScores(result.scores)
      if (result.confidence === 'low') toast.warning('スコアの読み取り精度が低いです。確認してください。')
    } catch {
      toast.error('OCRに失敗しました。手動で入力してください。')
      setOcrScores([null, null, null, null])
    }
    setOcrLoading(false)
  }

  function startEdit(index: number) {
    setEditingIndex(index)
    setEditValue(String(ocrScores[index] ?? ''))
  }

  function commitEdit() {
    if (editingIndex === null) return
    const v = parseInt(editValue)
    setOcrScores(s => s.map((x, i) => i === editingIndex ? (isNaN(v) ? x : v) : x))
    setEditingIndex(null)
  }

  async function handleSave() {
    if (!currentSession) { toast.error('セッションを開始してください'); return }
    if (myIndex === null) { toast.error('自分の席を選択してください'); return }
    if (ocrScores.some(s => s === null)) { toast.error('4人分のスコアを入力してください'); return }

    const scores = ocrScores as number[]
    const myRank = calculateRank(scores, myIndex)
    setSaving(true)

    const supabase = createClient()
    let photoUrl: string | null = null

    if (imageFile) {
      const path = `${userId}/${Date.now()}_${imageFile.name}`
      const { error: uploadError } = await supabase.storage.from('hanchan-photos').upload(path, imageFile)
      if (!uploadError) photoUrl = path
    }

    const { error } = await supabase.from('hanchans').insert({
      user_id: userId,
      session_id: currentSession.id,
      scores,
      my_seat_index: myIndex,
      my_rank: myRank,
      chip_count: chipCount,
      photo_url: photoUrl,
      notes: notes.trim() || null,
    })

    if (error) {
      toast.error('保存に失敗しました')
      setSaving(false)
      return
    }

    if (navigator.vibrate) navigator.vibrate(100)
    toast.success(`${myRank}位で記録しました！`)
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
    <div className="px-4 pt-6 pb-8 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/" className="p-1 text-zinc-400"><ChevronLeft size={20} /></Link>
        <h1 className="text-xl font-bold text-zinc-50">新規記録</h1>
      </div>

      {/* セッション表示 */}
      {currentSession && (
        <div className="rounded-lg bg-zinc-800/60 border border-zinc-700 px-4 py-2 flex items-center justify-between">
          <span className="text-sm text-zinc-300">{currentSession.preset?.name}</span>
          <button onClick={() => setSessionModalOpen(true)} className="text-xs text-zinc-500 underline">変更</button>
        </div>
      )}

      {/* カメラ */}
      <div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
        {imagePreview ? (
          <div className="relative rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
            <img src={imagePreview} alt="撮影した得点表示" className="w-full object-contain max-h-48" />
            <button onClick={() => fileRef.current?.click()} className="absolute bottom-2 right-2 bg-zinc-900/80 text-zinc-200 text-xs px-3 py-1.5 rounded-full border border-zinc-700">
              撮り直す
            </button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} className="w-full rounded-xl bg-zinc-900 border-2 border-dashed border-zinc-700 p-8 flex flex-col items-center gap-2 active:border-zinc-500 transition-colors">
            <Camera size={32} className="text-zinc-500" />
            <span className="text-zinc-400 text-sm">卓の得点表示を撮影</span>
            <span className="text-zinc-600 text-xs">またはライブラリから選択</span>
          </button>
        )}
        {ocrLoading && <p className="text-center text-zinc-400 text-sm mt-2 animate-pulse">スコアを読み取り中...</p>}
      </div>

      {/* スコアカード */}
      <div>
        <p className="text-sm text-zinc-400 mb-2">
          自分の席をタップして選択。長押しで編集。
        </p>
        <div className="grid grid-cols-2 gap-3">
          {ocrScores.map((score, i) => (
            <button
              key={i}
              className={`rounded-xl border-2 p-4 text-center transition-all active:scale-95 ${
                myIndex === i
                  ? 'border-zinc-50 bg-zinc-800'
                  : 'border-zinc-700 bg-zinc-900'
              }`}
              onClick={() => setMyIndex(i)}
              onContextMenu={e => { e.preventDefault(); startEdit(i) }}
              onPointerDown={e => {
                const t = setTimeout(() => startEdit(i), 600)
                const cancel = () => clearTimeout(t)
                e.currentTarget.addEventListener('pointerup', cancel, { once: true })
                e.currentTarget.addEventListener('pointermove', cancel, { once: true })
              }}
            >
              <p className="text-xs text-zinc-500 mb-1">{SEAT_LABELS[i]}</p>
              <p className={`text-xl font-bold ${myIndex === i ? 'text-zinc-50' : 'text-zinc-300'}`}>
                {score !== null ? score.toLocaleString() : '---'}
              </p>
              {myIndex === i && <p className="text-xs text-zinc-400 mt-1">← 自分</p>}
            </button>
          ))}
        </div>
        {scoreMismatch && (
          <p className="text-amber-400 text-xs mt-2 text-center">
            ⚠ 合計 {totalScore.toLocaleString()}点（100,000点との差: {Math.abs(totalScore - 100000).toLocaleString()}点）
          </p>
        )}
        {myIndex !== null && ocrScores[myIndex] !== null && (
          <p className="text-center text-zinc-400 text-sm mt-2">
            自動着順: <span className="font-bold text-zinc-200">{calculateRank(ocrScores as number[], myIndex)}位</span>
          </p>
        )}
      </div>

      {/* チップ枚数 */}
      <div>
        <Label className="text-sm text-zinc-400 mb-2 block">チップ枚数（マイナス可）</Label>
        <div className="flex items-center gap-4 justify-center">
          <button onClick={() => setChipCount(c => c - 1)} className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center active:bg-zinc-700 transition-colors">
            <Minus size={20} />
          </button>
          <Input
            value={chipCount}
            onChange={e => setChipCount(Number(e.target.value))}
            type="number"
            inputMode="numeric"
            className="w-24 text-center text-xl font-bold bg-zinc-900 border-zinc-700 h-12"
          />
          <button onClick={() => setChipCount(c => c + 1)} className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center active:bg-zinc-700 transition-colors">
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* メモ */}
      <div>
        <Label className="text-sm text-zinc-400 mb-2 block">メモ（任意）</Label>
        <Input
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="例: ○○雀荘"
          className="bg-zinc-900 border-zinc-700 text-zinc-50"
        />
      </div>

      <Button onClick={handleSave} disabled={saving || myIndex === null} className="w-full h-14 text-base font-bold">
        {saving ? '保存中...' : '保存'}
      </Button>

      {/* スコア編集ダイアログ */}
      <Dialog open={editingIndex !== null} onOpenChange={open => !open && setEditingIndex(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-50">
          <DialogHeader>
            <DialogTitle>{editingIndex !== null ? SEAT_LABELS[editingIndex] : ''}のスコアを編集</DialogTitle>
          </DialogHeader>
          <Input
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            type="number"
            inputMode="numeric"
            className="bg-zinc-900 border-zinc-700 text-zinc-50 h-12 text-lg text-center"
            autoFocus
          />
          <Button onClick={commitEdit} className="w-full h-12">確定</Button>
        </DialogContent>
      </Dialog>

      {/* セッション選択モーダル */}
      <Dialog open={sessionModalOpen} onOpenChange={open => { if (!open && currentSession) setSessionModalOpen(false) }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-50">
          <DialogHeader>
            <DialogTitle>プリセット選択</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400">今回使用するルールを選択してください</p>
          <div className="space-y-2">
            {presets.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPresetId(p.id)}
                className={`w-full rounded-lg border p-4 text-left transition-colors ${
                  selectedPresetId === p.id ? 'border-zinc-50 bg-zinc-800' : 'border-zinc-700 bg-zinc-900'
                }`}
              >
                <p className="font-semibold text-zinc-100">{p.name}</p>
                <p className="text-xs text-zinc-500 mt-1">{p.rate}円/千点 ウマ{p.uma_first}/{p.uma_second}/{p.uma_third}/{p.uma_fourth}</p>
              </button>
            ))}
          </div>
          <Button onClick={startSession} className="w-full h-12">このルールで開始</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
