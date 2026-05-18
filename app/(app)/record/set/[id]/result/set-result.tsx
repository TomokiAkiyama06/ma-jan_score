'use client'

import Link from 'next/link'
import { Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  summarizePerParticipant, calculateTransfers, calculateRank,
  calculateProfitsForHanchan, calculatePerHanchanFee, formatProfit, formatElapsed
} from '@/lib/calculations'
import type { Preset, Session, Hanchan } from '@/lib/types'

type Props = { session: Session & { preset: Preset }; hanchans: Hanchan[] }

const RANK_COLOR = ['', 'text-yellow-400', 'text-zinc-300', 'text-orange-400', 'text-red-400']
const RANK_BG = ['', 'bg-yellow-400/10', '', 'bg-orange-400/10', 'bg-red-400/10']

export function SetResult({ session, hanchans }: Props) {
  const preset = session.preset
  const participants = session.participants ?? []
  const summaries = summarizePerParticipant(session, hanchans, preset)

  // 場代は participants[0]（記録者=自分）が代表で店に全額を支払う前提
  const collector = participants[0]
  const totalFee = session.total_fee ?? 0
  const transfers = calculateTransfers(summaries, { collector, totalFee })

  // 1半荘あたりの場代（全半荘で同額、100円単位切り上げ）
  const feePerHanchan = calculatePerHanchanFee(totalFee, hanchans.length)

  // 受取人ごとに送金をグルーピング
  const transfersByRecipient = new Map<string, { from: string; amount: number }[]>()
  for (const t of transfers) {
    const list = transfersByRecipient.get(t.to) ?? []
    list.push({ from: t.from, amount: t.amount })
    transfersByRecipient.set(t.to, list)
  }

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">セット結果</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {session.set_name ?? preset.name} ・ {hanchans.length}半荘 ・ {formatElapsed(session.started_at, session.ended_at ?? undefined)}
        </p>
      </div>

      {/* 店への支払い */}
      {totalFee > 0 && collector && (
        <div className="rounded-xl bg-amber-950/40 border border-amber-800/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Store size={16} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-amber-300">店への支払い</h2>
          </div>
          <p className="text-zinc-200">
            <span className="font-bold text-zinc-50">{collector}</span> が代表で
            <span className="font-black text-amber-300 mx-1.5 text-lg">{totalFee.toLocaleString()}円</span>
            をお店にお支払い
          </p>
          <p className="text-xs text-zinc-500 mt-1">※ 他の参加者は下記「お金の動き」で {collector} に渡す</p>
        </div>
      )}

      {/* お金の動き（受取人グループ型） */}
      {transfers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-300">お金の動き</h2>
          {Array.from(transfersByRecipient.entries()).map(([to, items]) => {
            const total = items.reduce((s, i) => s + i.amount, 0)
            return (
              <div key={to} className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="font-semibold text-zinc-100">{to}</span>
                    <span className="text-xs text-zinc-500">受取</span>
                  </div>
                  <span className="text-green-400 font-black text-lg">{total.toLocaleString()}円</span>
                </div>
                <div className="space-y-1 pl-4 border-l-2 border-zinc-800">
                  {items.map((i, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-400">← {i.from}</span>
                      <span className="text-zinc-200 font-medium">{i.amount.toLocaleString()}円</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          <p className="text-xs text-zinc-600">※ 送金額は1000円単位。丸め誤差はトップ最多者で吸収</p>
        </div>
      )}

      {/* 参加者別サマリ */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-300">参加者別サマリ</h2>
        {summaries.map(s => (
          <div key={s.participant} className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-100">{s.participant}</span>
              <span className={`text-lg font-black ${s.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatProfit(s.netProfit)}
              </span>
            </div>
            <p className="text-xs text-zinc-500">平均着順 {s.hanchanCount > 0 ? (s.ranks.reduce((a, b) => a + b, 0) / s.ranks.length).toFixed(2) : '-'}位 ・ {s.hanchanCount}半荘</p>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>半荘収支</span>
                <span className={s.scoreProfit >= 0 ? 'text-green-400' : 'text-red-400'}>{formatProfit(s.scoreProfit)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>チップ ({s.chipCount >= 0 ? '+' : ''}{s.chipCount}枚)</span>
                <span className={s.chipProfit >= 0 ? 'text-green-400' : 'text-red-400'}>{formatProfit(s.chipProfit)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>場代負担 ({s.topCount}半荘で1位)</span>
                <span className="text-red-400">−{(s.feeShare).toLocaleString()}円</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-zinc-800 pt-1 text-zinc-200">
                <span>正味</span>
                <span className={s.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}>{formatProfit(s.netProfit)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 半荘ごとの表 */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">半荘ごとの結果</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-800 no-scrollbar">
          <table className="w-full text-xs min-w-[340px]">
            <thead>
              <tr className="bg-zinc-900 border-b border-zinc-800">
                <th className="py-2 px-3 text-zinc-500 font-medium text-left w-8">#</th>
                {participants.map(p => (
                  <th key={p} className="py-2 px-2 text-zinc-500 font-medium text-center">{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hanchans.map((h, hIdx) => {
                const profits = calculateProfitsForHanchan(h.scores, preset)
                return (
                  <tr key={h.id} className="border-b border-zinc-800/50 last:border-0">
                    <td className="py-3 px-3 text-zinc-500 align-top">{hIdx + 1}</td>
                    {participants.map(name => {
                      const seatIdx = h.participants_per_seat?.indexOf(name) ?? -1
                      if (seatIdx === -1) return <td key={name} className="py-3 px-2 text-zinc-600 text-center">—</td>
                      const score = h.scores[seatIdx]
                      const rank = calculateRank(h.scores, seatIdx)
                      const profit = profits[seatIdx]
                      const isWinner = rank === 1
                      return (
                        <td key={name} className={`py-3 px-2 text-center align-top ${RANK_BG[rank]}`}>
                          <p className="text-zinc-200">{score.toLocaleString()}</p>
                          <p className={`font-semibold ${RANK_COLOR[rank]}`}>{rank}位</p>
                          <p className={profit >= 0 ? 'text-green-400' : 'text-red-400'}>{formatProfit(profit)}</p>
                          {isWinner && feePerHanchan > 0 && (
                            <p className="text-amber-400 text-[9px] mt-0.5">場代 −{feePerHanchan.toLocaleString()}</p>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Link href="/">
        <Button className="w-full h-12">完了</Button>
      </Link>
    </div>
  )
}
