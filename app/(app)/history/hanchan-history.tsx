'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calculateProfit, formatProfit } from '@/lib/calculations'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { Hanchan, Preset, Session } from '@/lib/types'

type HanchanRow = Hanchan & { session: Session & { preset: Preset } }

const RANK_COLOR = ['', 'text-yellow-400', 'text-zinc-300', 'text-orange-400', 'text-red-400']
const RANK_BG = ['', 'bg-yellow-400/10', 'bg-zinc-400/10', 'bg-orange-400/10', 'bg-red-400/10']

export function HanchanHistory({ hanchans: initial, presets }: { hanchans: HanchanRow[]; presets: Preset[] }) {
  const router = useRouter()
  const [hanchans, setHanchans] = useState(initial)
  const [selected, setSelected] = useState<HanchanRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(id: string) {
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('hanchans').delete().eq('id', id)
    if (error) {
      toast.error('削除に失敗しました')
      setDeleting(false)
      return
    }
    setHanchans(prev => prev.filter(h => h.id !== id))
    setSelected(null)
    toast.success('記録を削除しました')
    setDeleting(false)
    router.refresh()
  }

  if (hanchans.length === 0) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-zinc-50 mb-6">履歴</h1>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-8 text-center">
          <p className="text-zinc-500">記録がありません</p>
        </div>
      </div>
    )
  }

  // 日付でグルーピング
  const grouped = hanchans.reduce<Record<string, HanchanRow[]>>((acc, h) => {
    const date = h.played_at.slice(0, 10)
    if (!acc[date]) acc[date] = []
    acc[date].push(h)
    return acc
  }, {})

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <h1 className="text-2xl font-bold text-zinc-50">履歴</h1>
      <p className="text-zinc-500 text-sm">全 {hanchans.length} 半荘</p>

      {Object.entries(grouped).map(([date, items]) => {
        const dayTotal = items.reduce((sum, h) => {
          const preset = h.session?.preset
          return sum + (preset ? calculateProfit(h, preset) : 0)
        }, 0)

        return (
          <div key={date} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-medium text-zinc-400">
                {new Date(date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
              </span>
              <span className={`text-sm font-semibold ${dayTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatProfit(dayTotal)}
              </span>
            </div>
            {items.map((h, i) => {
              const preset = h.session?.preset
              const profit = preset ? calculateProfit(h, preset) : 0
              return (
                <button
                  key={h.id}
                  onClick={() => setSelected(h)}
                  className={`w-full rounded-xl border border-zinc-800 p-4 flex items-center justify-between text-left active:scale-[0.99] transition-transform ${RANK_BG[h.my_rank]}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-xl font-black w-10 text-center ${RANK_COLOR[h.my_rank]}`}>
                      {h.my_rank}位
                    </span>
                    <div>
                      <p className="text-sm text-zinc-200 font-medium">{h.scores[h.my_seat_index].toLocaleString()}点</p>
                      <p className="text-xs text-zinc-500">
                        {preset?.name}
                        {h.chip_count !== 0 && ` ・ チップ${h.chip_count > 0 ? '+' : ''}${h.chip_count}枚`}
                      </p>
                    </div>
                  </div>
                  <span className={`text-base font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatProfit(profit)}
                  </span>
                </button>
              )
            })}
          </div>
        )
      })}

      {/* 詳細ダイアログ */}
      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-50">
          <DialogHeader>
            <DialogTitle>半荘詳細</DialogTitle>
          </DialogHeader>
          {selected && (() => {
            const preset = selected.session?.preset
            const profit = preset ? calculateProfit(selected, preset) : 0
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: '着順', value: `${selected.my_rank}位`, colored: true },
                    { label: '素点', value: `${selected.scores[selected.my_seat_index].toLocaleString()}点` },
                    { label: '収支', value: formatProfit(profit), profit: true },
                    { label: 'チップ', value: `${selected.chip_count >= 0 ? '+' : ''}${selected.chip_count}枚` },
                  ].map(({ label, value, colored, profit: isProfit }) => (
                    <div key={label} className="rounded-lg bg-zinc-900 p-3">
                      <p className="text-xs text-zinc-500 mb-1">{label}</p>
                      <p className={`font-semibold ${colored ? RANK_COLOR[selected.my_rank] : isProfit ? (profit >= 0 ? 'text-green-400' : 'text-red-400') : 'text-zinc-100'}`}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg bg-zinc-900 p-3 space-y-2">
                  <p className="text-xs text-zinc-500">4人のスコア</p>
                  <div className="grid grid-cols-4 gap-2">
                    {selected.scores.map((s, i) => (
                      <div key={i} className={`text-center ${i === selected.my_seat_index ? 'text-zinc-50 font-bold' : 'text-zinc-400'}`}>
                        <p className="text-xs text-zinc-600 mb-0.5">{'東南西北'[i]}</p>
                        <p className="text-sm">{s.toLocaleString()}</p>
                        {i === selected.my_seat_index && <p className="text-[10px] text-zinc-500">自分</p>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1 text-sm text-zinc-400">
                  <p>日時: {new Date(selected.played_at).toLocaleString('ja-JP')}</p>
                  <p>ルール: {preset?.name ?? '不明'}</p>
                  {selected.notes && <p>メモ: {selected.notes}</p>}
                </div>

                <Button
                  variant="destructive"
                  className="w-full h-12"
                  disabled={deleting}
                  onClick={() => handleDelete(selected.id)}
                >
                  <Trash2 size={16} className="mr-2" />
                  {deleting ? '削除中...' : 'この記録を削除'}
                </Button>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
