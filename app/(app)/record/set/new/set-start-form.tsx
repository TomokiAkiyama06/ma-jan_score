'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { Preset } from '@/lib/types'

type Props = { presets: Preset[]; userId: string }

export function SetStartForm({ presets, userId }: Props) {
  const router = useRouter()
  const defaultPreset = presets.find(p => p.is_default) ?? presets[0]

  const [setName, setSetName] = useState('')
  const [presetId, setPresetId] = useState(defaultPreset?.id ?? '')
  const [hourlyRate, setHourlyRate] = useState(2000)
  const [reserveFee, setReserveFee] = useState(1000)
  const [chipRate, setChipRate] = useState(defaultPreset?.chip_rate ?? 100)
  const [participants, setParticipants] = useState(['自分', '', '', ''])
  const [loading, setLoading] = useState(false)

  const selectedPreset = presets.find(p => p.id === presetId)

  function updateParticipant(i: number, val: string) {
    setParticipants(ps => ps.map((p, idx) => idx === i ? val : p))
  }

  function addParticipant() {
    setParticipants(ps => [...ps, ''])
  }

  function removeParticipant(i: number) {
    if (i === 0) return  // 「自分」は削除不可
    setParticipants(ps => ps.filter((_, idx) => idx !== i))
  }

  async function handleStart() {
    const validParticipants = participants.map(p => p.trim()).filter(Boolean)
    if (validParticipants.length < 2) { toast.error('参加者を2名以上入力してください'); return }
    if (!presetId) { toast.error('プリセットを選択してください'); return }

    // 重複チェック
    const unique = new Set(validParticipants)
    if (unique.size !== validParticipants.length) { toast.error('参加者名が重複しています'); return }

    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        user_id: userId,
        preset_id: presetId,
        mode: 'set',
        set_name: setName.trim() || null,
        participants: validParticipants,
        hourly_rate: hourlyRate,
        reserve_fee: reserveFee,
        chip_rate: chipRate,
      })
      .select('id')
      .single()

    if (error) {
      console.error('session insert error:', error)
      toast.error(`セット開始に失敗しました: ${error.message}`)
      setLoading(false)
      return
    }
    toast.success('セットを開始しました')
    router.push(`/record/set/${data.id}`)
    router.refresh()
  }

  if (presets.length === 0) {
    return (
      <div className="px-4 pt-6 space-y-4">
        <Link href="/" className="flex items-center gap-1 text-zinc-400 text-sm"><ChevronLeft size={16} />戻る</Link>
        <p className="text-zinc-400">プリセットを先に作成してください。</p>
        <Link href="/presets"><Button className="w-full">ルール設定へ</Button></Link>
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/" className="p-1 text-zinc-400"><ChevronLeft size={20} /></Link>
        <h1 className="text-xl font-bold text-zinc-50">新しいセットを開始</h1>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-sm text-zinc-400">セット名（任意）</Label>
          <Input value={setName} onChange={e => setSetName(e.target.value)} placeholder="例: 5/7 雀荘XX" className="bg-zinc-900 border-zinc-700 text-zinc-50 placeholder:text-zinc-600 h-12" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm text-zinc-400">使用プリセット</Label>
          <div className="space-y-2">
            {presets.map(p => (
              <button key={p.id} onClick={() => { setPresetId(p.id); setChipRate(p.chip_rate) }} className={`w-full rounded-lg border p-3 text-left transition-colors ${presetId === p.id ? 'border-zinc-50 bg-zinc-800' : 'border-zinc-700 bg-zinc-900'}`}>
                <p className="font-medium text-zinc-100 text-sm">{p.name}</p>
                <p className="text-xs text-zinc-500">{p.rate}円/千点　ウマ {p.uma_first}/{p.uma_second}/{p.uma_third}/{p.uma_fourth}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm text-zinc-400">時間料金（円/時間）</Label>
            <Input value={hourlyRate} onChange={e => setHourlyRate(Number(e.target.value))} type="number" inputMode="numeric" className="bg-zinc-900 border-zinc-700 text-zinc-50 h-12" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-zinc-400">予備料金（円）</Label>
            <Input value={reserveFee} onChange={e => setReserveFee(Number(e.target.value))} type="number" inputMode="numeric" className="bg-zinc-900 border-zinc-700 text-zinc-50 h-12" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm text-zinc-400">チップレート（円/枚）</Label>
          <Input value={chipRate} onChange={e => setChipRate(Number(e.target.value))} type="number" inputMode="numeric" className="bg-zinc-900 border-zinc-700 text-zinc-50 h-12" />
          <p className="text-xs text-zinc-600">プリセット値: {selectedPreset?.chip_rate ?? '-'}円</p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-zinc-400">参加者</Label>
          {participants.map((name, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                value={name}
                onChange={e => updateParticipant(i, e.target.value)}
                placeholder={i === 0 ? '自分（変更可）' : `参加者${i + 1}`}
                className="bg-zinc-900 border-zinc-700 text-zinc-50 h-11 flex-1"
                disabled={i === 0}
              />
              {i > 0 && (
                <button onClick={() => removeParticipant(i)} className="p-2 text-zinc-500 hover:text-red-400 transition-colors">
                  <X size={18} />
                </button>
              )}
            </div>
          ))}
          {participants.length < 6 && (
            <button onClick={addParticipant} className="flex items-center gap-2 text-zinc-500 text-sm hover:text-zinc-300 transition-colors py-1">
              <Plus size={16} /> 参加者を追加
            </button>
          )}
          {participants.filter(Boolean).length !== 4 && (
            <p className="text-xs text-amber-400">※ 4人での参加を推奨</p>
          )}
        </div>
      </div>

      <Button onClick={handleStart} disabled={loading} className="w-full h-14 text-base font-bold">
        {loading ? '開始中...' : 'セット開始'}
      </Button>
    </div>
  )
}
