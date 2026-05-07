import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { calculateProfit, enrichWithProfit, calcKpi, formatProfit } from '@/lib/calculations'
import { SessionControls } from './session-controls'
import type { Hanchan, Preset, Session } from '@/lib/types'

const RANK_COLOR = ['', 'text-yellow-400', 'text-zinc-300', 'text-orange-400', 'text-red-400']

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: presetsData }, { data: hanchansData }, { data: allHanchansData }, { data: activeSessionData }] = await Promise.all([
    supabase.from('presets').select('*').eq('user_id', user.id).order('created_at'),
    supabase
      .from('hanchans')
      .select('*, session:sessions(*, preset:presets(*))')
      .eq('user_id', user.id)
      .order('played_at', { ascending: false })
      .limit(5),
    supabase
      .from('hanchans')
      .select('*, session:sessions(*, preset:presets(*))')
      .eq('user_id', user.id)
      .order('played_at', { ascending: true }),
    supabase
      .from('sessions')
      .select('*, preset:presets(*)')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1),
  ])

  const presets = (presetsData ?? []) as Preset[]
  const recentHanchans = (hanchansData ?? []) as (Hanchan & { session: Session & { preset: Preset } })[]
  const allHanchans = (allHanchansData ?? []) as (Hanchan & { session: Session & { preset: Preset } })[]
  const activeSession = activeSessionData?.[0] as (Session & { preset: Preset }) | undefined

  const enriched = enrichWithProfit(allHanchans, presets)
  const kpi = calcKpi(enriched, presets)

  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-50">🀄 麻雀スコア</h1>
        </div>
      </div>

      {/* 累計収支サマリ */}
      {kpi.hanchanCount > 0 && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 mb-1">累計収支 ({kpi.hanchanCount}半荘)</p>
          <p className={`text-3xl font-black tracking-tight ${kpi.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatProfit(kpi.totalProfit)}
          </p>
          <div className="flex gap-4 mt-3 text-xs text-zinc-500">
            <span>平均 {kpi.avgRank.toFixed(2)}位</span>
            <span>トップ {kpi.topRate.toFixed(0)}%</span>
            <span>ラス {kpi.lastRate.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* アクティブセッション */}
      {activeSession && (
        <SessionControls session={activeSession} />
      )}

      {/* 直近の半荘 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-zinc-400">直近の記録</h2>
          {recentHanchans.length > 0 && (
            <Link href="/history" className="flex items-center gap-0.5 text-xs text-zinc-500 hover:text-zinc-300">
              すべて見る <ChevronRight size={12} />
            </Link>
          )}
        </div>
        {recentHanchans.length === 0 ? (
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-8 text-center">
            <p className="text-zinc-500 text-sm">記録がありません</p>
            <p className="text-zinc-600 text-xs mt-1">+ボタンから最初の半荘を記録しましょう</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentHanchans.map(h => {
              const preset = h.session?.preset
              const profit = preset ? calculateProfit(h, preset) : 0
              return (
                <div key={h.id} className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-bold w-8 text-center ${RANK_COLOR[h.my_rank]}`}>
                      {h.my_rank}位
                    </span>
                    <div>
                      <p className="text-sm text-zinc-300">{h.scores[h.my_seat_index].toLocaleString()}点</p>
                      <p className="text-xs text-zinc-500">
                        {new Date(h.played_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                        　{preset?.name}
                      </p>
                    </div>
                  </div>
                  <span className={`text-base font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatProfit(profit)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* プリセット未設定の案内 */}
      {presets.length === 0 && (
        <div className="rounded-xl bg-amber-950/40 border border-amber-800/40 p-4">
          <p className="text-amber-400 text-sm font-medium">プリセットを設定してください</p>
          <p className="text-amber-500/70 text-xs mt-1">「ルール」タブからレート・ウマ等を登録すると記録を開始できます</p>
        </div>
      )}

      {/* FAB */}
      <div className="fixed bottom-20 right-4">
        <Link
          href="/record"
          className="flex items-center justify-center w-14 h-14 rounded-full bg-zinc-50 text-zinc-950 shadow-lg shadow-zinc-950/50 active:scale-95 transition-transform"
          aria-label="新規記録"
        >
          <Plus size={28} strokeWidth={2.5} />
        </Link>
      </div>
    </div>
  )
}
