'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus, ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { calculateSetFee, calculatePerHanchanFee, splitFee } from '@/lib/calculations'
import type { Preset, Session, Hanchan } from '@/lib/types'

type Props = { session: Session & { preset: Preset }; hanchans: Hanchan[]; userId: string }

export function SetEndFlow({ session, hanchans, userId }: Props) {
  const router = useRouter()
  const participants = session.participants ?? []
  const preset = session.preset
  const chipRate = session.chip_rate ?? preset.chip_rate

  const [step, setStep] = useState<1 | 2>(1)
  const [chips, setChips] = useState<Record<string, number>>(
    Object.fromEntries(participants.map(p => [p, 0]))
  )
  const [saving, setSaving] = useState(false)

  const now = new Date()
  const totalFee = calculateSetFee(session, now)
  const elapsedMs = now.getTime() - new Date(session.started_at).getTime()
  const elapsedHours = elapsedMs / (1000 * 60 * 60)
  const billedHours = Math.ceil(elapsedHours * 2) / 2
  const feePerHanchan = calculatePerHanchanFee(totalFee, hanchans.length)

  const chipTotal = Object.values(chips).reduce((a, b) => a + b, 0)

  // 場代分担プレビュー
  const previewSession = { ...session, total_fee: totalFee, participant_chips: chips }
  const feeShare = splitFee(previewSession, hanchans)

  async function handleFinish() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('sessions').update({
      ended_at: now.toISOString(),
      total_fee: totalFee,
      participant_chips: chips,
    }).eq('id', session.id)

    if (error) { toast.error('保存に失敗しました'); setSaving(false); return }
    toast.success('セットを終了しました')
    router.push(`/record/set/${session.id}/result`)
  }

  // Step 1: チップ入力
  if (step === 1) {
    return (
      <div className="px-4 pt-6 pb-8 space-y-5">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="p-1 text-zinc-400"><ChevronLeft size={20} /></button>
          <div>
            <h1 className="text-xl font-bold text-zinc-50">セット終了 (1/2)</h1>
            <p className="text-sm text-zinc-500">チップ枚数を入力</p>
          </div>
        </div>

        <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2">
          <p className="text-xs text-zinc-500">チップレート: {chipRate.toLocaleString()}円/枚</p>
        </div>

        <div className="space-y-3">
          {participants.map(name => (
            <div key={name} className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-zinc-200">{name}</p>
                {chips[name] !== 0 && (
                  <p className={`text-sm font-semibold ${chips[name] > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {chips[name] > 0 ? '+' : ''}{(chips[name] * chipRate).toLocaleString()}円
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 justify-center">
                <button onClick={() => setChips(c => ({ ...c, [name]: c[name] - 1 }))} className="w-11 h-11 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center active:bg-zinc-700">
                  <Minus size={18} />
                </button>
                <Input
                  value={chips[name]}
                  onChange={e => setChips(c => ({ ...c, [name]: Number(e.target.value) }))}
                  type="number"
                  inputMode="decimal"
                  className="w-20 text-center text-xl font-bold bg-zinc-800 border-zinc-700 h-11"
                />
                <button onClick={() => setChips(c => ({ ...c, [name]: c[name] + 1 }))} className="w-11 h-11 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center active:bg-zinc-700">
                  <Plus size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className={`rounded-lg px-4 py-2.5 border text-sm ${chipTotal === 0 ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-amber-950/40 border-amber-800/40 text-amber-400'}`}>
          合計: {chipTotal >= 0 ? '+' : ''}{chipTotal}枚
          {chipTotal !== 0 && ' ⚠️ チップ合計が0ではありません'}
        </div>

        <Button onClick={() => setStep(2)} className="w-full h-14 text-base font-bold">
          次へ（料金確認）
        </Button>
      </div>
    )
  }

  // Step 2: 料金確認 + 場代分担
  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={() => setStep(1)} className="p-1 text-zinc-400"><ChevronLeft size={20} /></button>
        <div>
          <h1 className="text-xl font-bold text-zinc-50">セット終了 (2/2)</h1>
          <p className="text-sm text-zinc-500">料金を確認</p>
        </div>
      </div>

      {/* 料金内訳 */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
        <div className="flex justify-between text-sm text-zinc-400">
          <span>開始</span>
          <span>{new Date(session.started_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="flex justify-between text-sm text-zinc-400">
          <span>終了</span>
          <span>{now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="flex justify-between text-sm text-zinc-400">
          <span>経過（切り上げ）</span>
          <span>{billedHours}時間</span>
        </div>
        <div className="border-t border-zinc-800 my-1" />
        <div className="flex justify-between text-sm text-zinc-400">
          <span>時給 {session.hourly_rate?.toLocaleString()}円 × {billedHours}h</span>
          <span>{((session.hourly_rate ?? 0) * billedHours).toLocaleString()}円</span>
        </div>
        <div className="flex justify-between text-sm text-zinc-400">
          <span>予備料金</span>
          <span>+{(session.reserve_fee ?? 1000).toLocaleString()}円</span>
        </div>
        <div className="border-t border-zinc-800 my-1" />
        <div className="flex justify-between font-bold text-zinc-100">
          <span>合計</span>
          <span>{totalFee.toLocaleString()}円</span>
        </div>
        <p className="text-xs text-zinc-500">{hanchans.length}半荘 ・ 1半荘あたり {feePerHanchan.toLocaleString()}円（100円単位切り上げ）</p>
      </div>

      {/* 場代プレビュー */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
        <p className="text-xs text-zinc-500 mb-1">各人の場代負担（半荘ごとのトップが負担）</p>
        {participants.map(name => (
          <div key={name} className="flex justify-between text-sm">
            <span className="text-zinc-300">{name}</span>
            <span className="text-zinc-200 font-medium">{(feeShare[name] ?? 0).toLocaleString()}円</span>
          </div>
        ))}
        <div className="border-t border-zinc-800 pt-2 flex justify-between text-sm font-bold">
          <span className="text-zinc-400">合計</span>
          <span className="text-zinc-100">{Object.values(feeShare).reduce((a, b) => a + b, 0).toLocaleString()}円</span>
        </div>
      </div>

      <Button onClick={handleFinish} disabled={saving} className="w-full h-14 text-base font-bold">
        {saving ? '保存中...' : '確定して結果を見る'}
      </Button>
    </div>
  )
}
