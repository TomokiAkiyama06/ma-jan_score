import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { calculateProfit, enrichWithProfit, calcKpi, formatProfit, formatElapsed, calculateSetFee } from '@/lib/calculations'
import { SessionControls } from './session-controls'
import { ModeSelectFab } from './mode-select-fab'
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
  let activeSession = activeSessionData?.[0] as (Session & { preset: Preset }) | undefined

  // フリーモードセッションが5時間超過していたら自動クローズ
  if (activeSession?.mode === 'free') {
    const age = Date.now() - new Date(activeSession.started_at).getTime()
    if (age >= 5 * 60 * 60 * 1000) {
      await supabase
        .from('sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', activeSession.id)
      activeSession = undefined
    }
  }

  const enriched = enrichWithProfit(allHanchans, presets)
  const kpi = calcKpi(enriched, presets)

  const isSetActive = activeSession?.mode === 'set'
  const isFreeActive = activeSession?.mode === 'free'

  // セット中の半荘リスト
  const setHanchans = isSetActive
    ? recentHanchans.filter(h => h.session_id === activeSession?.id)
    : []

  const approxFee = isSetActive && activeSession ? calculateSetFee(activeSession, new Date()) : 0

  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-bold text-zinc-50">🀄 麻雀スコア</h1>
      </div>

      {/* 累計収支（フリーモード時のみ） */}
      {!isSetActive && kpi.hanchanCount > 0 && (
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

      {/* セット進行中バナー */}
      {isSetActive && activeSession && (
        <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <p className="text-xs text-zinc-400">セット進行中</p>
              </div>
              <p className="font-semibold text-zinc-100">{activeSession.set_name ?? activeSession.preset?.name}</p>
            </div>
            <Link href={`/record/set/${activeSession.id}/end`}>
              <button className="text-xs border border-zinc-600 text-zinc-300 rounded-lg px-3 py-1.5">終了</button>
            </Link>
          </div>
          <div className="flex gap-4 text-xs text-zinc-400">
            <span>{formatElapsed(activeSession.started_at)}</span>
            <span>{setHanchans.length}半荘完了</span>
            <span>概算 {approxFee.toLocaleString()}円</span>
          </div>
          <Link href={`/record/set/${activeSession.id}`}>
            <button className="w-full rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-100 text-sm font-medium py-2.5 transition-colors">
              + 半荘を記録
            </button>
          </Link>
        </div>
      )}

      {/* フリーモード: アクティブセッション */}
      {isFreeActive && activeSession && (
        <SessionControls session={activeSession} />
      )}

      {/* 直近の半荘 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-zinc-400">直近の記録</h2>
          {recentHanchans.length > 0 && (
            <Link href="/history" className="text-xs text-zinc-500 hover:text-zinc-300">すべて見る</Link>
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
                    <span className={`text-lg font-bold w-8 text-center ${RANK_COLOR[h.my_rank]}`}>{h.my_rank}位</span>
                    <div>
                      <p className="text-sm text-zinc-300">{h.scores[h.my_seat_index].toLocaleString()}点</p>
                      <p className="text-xs text-zinc-500">
                        {new Date(h.played_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}　{preset?.name}
                        {h.session?.mode === 'set' && ' 🎴'}
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

      {presets.length === 0 && (
        <div className="rounded-xl bg-amber-950/40 border border-amber-800/40 p-4">
          <p className="text-amber-400 text-sm font-medium">プリセットを設定してください</p>
          <p className="text-amber-500/70 text-xs mt-1">「ルール」タブからレート・ウマ等を登録すると記録を開始できます</p>
        </div>
      )}

      {/* FAB */}
      {isSetActive && activeSession ? (
        /* セット中はセット記録画面へ直接 */
        <div className="fixed bottom-20 right-4">
          <Link href={`/record/set/${activeSession.id}`} className="flex items-center justify-center w-14 h-14 rounded-full bg-zinc-50 text-zinc-950 shadow-lg active:scale-95 transition-transform" aria-label="半荘を記録">
            <Plus size={28} strokeWidth={2.5} />
          </Link>
        </div>
      ) : (
        /* セットなし: モード選択 */
        <ModeSelectFab hasFreeSession={isFreeActive} freeSessionActive={activeSession ?? null} />
      )}
    </div>
  )
}
