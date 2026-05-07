import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { calculateProfit, formatProfit } from '@/lib/calculations'
import type { Hanchan, Preset, Session } from '@/lib/types'

const RANK_LABEL = ['', '1位', '2位', '3位', '4位']
const RANK_COLOR = ['', 'text-yellow-400', 'text-zinc-300', 'text-orange-400', 'text-red-400']

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: presetsData }, { data: hanchansData }, { data: sessionsData }] = await Promise.all([
    supabase.from('presets').select('*').eq('user_id', user.id).order('created_at'),
    supabase
      .from('hanchans')
      .select('*, session:sessions(*, preset:presets(*))')
      .eq('user_id', user.id)
      .order('played_at', { ascending: false })
      .limit(5),
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
  const activeSession = sessionsData?.[0] as (Session & { preset: Preset }) | undefined

  return (
    <div className="px-4 pt-6 space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">🀄 麻雀スコア</h1>
      </div>

      {/* アクティブセッション */}
      {activeSession && (
        <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-4">
          <p className="text-xs text-zinc-400 mb-1">進行中のセッション</p>
          <p className="font-semibold text-zinc-100">{activeSession.preset?.name}</p>
          <p className="text-sm text-zinc-400 mt-1">
            開始: {new Date(activeSession.started_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      )}

      {/* 直近の半荘 */}
      <div>
        <h2 className="text-sm font-medium text-zinc-400 mb-3">直近の記録</h2>
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

      {/* FAB: 新規記録ボタン */}
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
