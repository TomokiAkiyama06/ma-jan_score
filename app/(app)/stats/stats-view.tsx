'use client'

import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, ReferenceLine
} from 'recharts'
import {
  calcKpi, calcCumulative, calcRankDistribution, calcMonthlyStats,
  calcPresetStats, enrichWithProfit, formatProfit
} from '@/lib/calculations'
import type { Hanchan, Preset, Session } from '@/lib/types'

type Props = {
  hanchans: (Hanchan & { session: Session & { preset: Preset } })[]
  presets: Preset[]
}

const RANK_COLORS = ['#FBBF24', '#D4D4D8', '#F97316', '#EF4444']
const RANK_LABELS = ['1位', '2位', '3位', '4位']

type Period = 'all' | 'month' | '30d' | '90d'

const PERIOD_LABELS: Record<Period, string> = {
  all: '全期間',
  month: '今月',
  '30d': '30日',
  '90d': '90日',
}

export function StatsView({ hanchans: raw, presets }: Props) {
  const [period, setPeriod] = useState<Period>('all')
  const [filterPresetId, setFilterPresetId] = useState<string>('all')
  const [cumulativeTab, setCumulativeTab] = useState<'index' | 'date'>('index')

  const filteredHanchans = useMemo(() => {
    let result = raw
    const now = new Date()
    if (period === 'month') {
      const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      result = result.filter(h => h.played_at.startsWith(m))
    } else if (period === '30d') {
      const t = new Date(now.getTime() - 30 * 86400_000).toISOString()
      result = result.filter(h => h.played_at >= t)
    } else if (period === '90d') {
      const t = new Date(now.getTime() - 90 * 86400_000).toISOString()
      result = result.filter(h => h.played_at >= t)
    }
    if (filterPresetId !== 'all') {
      result = result.filter(h => h.session?.preset_id === filterPresetId)
    }
    return result
  }, [raw, period, filterPresetId])

  const enriched = useMemo(() => enrichWithProfit(filteredHanchans, presets), [filteredHanchans, presets])
  const kpi = useMemo(() => calcKpi(enriched, presets), [enriched, presets])
  const cumulative = useMemo(() => calcCumulative(enriched), [enriched])
  const rankDist = useMemo(() => calcRankDistribution(enriched), [enriched])
  const monthly = useMemo(() => calcMonthlyStats(enriched), [enriched])
  const presetStats = useMemo(() => calcPresetStats(enriched, presets), [enriched, presets])

  const kpiCards = [
    { label: '累計収支', value: formatProfit(kpi.totalProfit), colorClass: kpi.totalProfit >= 0 ? 'text-green-400' : 'text-red-400' },
    { label: '半荘数', value: `${kpi.hanchanCount}回`, colorClass: 'text-zinc-100' },
    { label: '平均着順', value: kpi.hanchanCount > 0 ? `${kpi.avgRank.toFixed(2)}位` : '-', colorClass: 'text-zinc-100' },
    { label: 'トップ率', value: kpi.hanchanCount > 0 ? `${kpi.topRate.toFixed(1)}%` : '-', colorClass: 'text-yellow-400' },
    { label: 'ラス率', value: kpi.hanchanCount > 0 ? `${kpi.lastRate.toFixed(1)}%` : '-', colorClass: 'text-red-400' },
    { label: '平均素点', value: kpi.hanchanCount > 0 ? `${Math.round(kpi.avgScore).toLocaleString()}` : '-', colorClass: 'text-zinc-100' },
    { label: 'チップ累計', value: kpi.hanchanCount > 0 ? `${kpi.totalChips >= 0 ? '+' : ''}${kpi.totalChips}枚` : '-', colorClass: kpi.totalChips >= 0 ? 'text-green-400' : 'text-red-400' },
  ]

  if (raw.length === 0) {
    return (
      <div className="px-4 pt-6 flex flex-col items-center justify-center min-h-[60dvh] text-center">
        <p className="text-zinc-500 text-lg">まだ記録がありません</p>
        <p className="text-zinc-600 text-sm mt-2">半荘を記録するとグラフが表示されます</p>
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      <h1 className="text-2xl font-bold text-zinc-50">統計</h1>

      {/* 期間フィルタ */}
      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-none px-4 py-2 rounded-full text-sm font-medium transition-colors ${period === p ? 'bg-zinc-50 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        {presets.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setFilterPresetId('all')}
              className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterPresetId === 'all' ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-500'}`}
            >
              全ルール
            </button>
            {presets.map(p => (
              <button
                key={p.id}
                onClick={() => setFilterPresetId(p.id)}
                className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterPresetId === p.id ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-500'}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* KPIカード横スクロール */}
      <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4">
        {kpiCards.map(({ label, value, colorClass }) => (
          <div key={label} className="flex-none rounded-xl bg-zinc-900 border border-zinc-800 p-4 w-28 text-center">
            <p className="text-[10px] text-zinc-500 mb-1.5 leading-tight">{label}</p>
            <p className={`text-base font-bold leading-tight ${colorClass}`}>{value}</p>
          </div>
        ))}
      </div>

      {enriched.length === 0 ? (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-8 text-center">
          <p className="text-zinc-500">この期間の記録はありません</p>
        </div>
      ) : (
        <>
          {/* 累計収支推移 */}
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-300">累計収支推移</h2>
              <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
                {(['index', 'date'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setCumulativeTab(t)}
                    className={`text-xs px-2.5 py-1 rounded-md transition-colors ${cumulativeTab === t ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500'}`}
                  >
                    {t === 'index' ? '番号' : '日付'}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cumulative} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey={cumulativeTab === 'index' ? 'index' : 'date'}
                  tick={{ fontSize: 10, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${v >= 0 ? '+' : ''}${(v / 1000).toFixed(0)}k`}
                  width={45}
                />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, padding: '8px 12px' }}
                  labelStyle={{ color: '#a1a1aa', fontSize: 11 }}
                  formatter={(v) => [formatProfit(Number(v)), '累計収支']}
                />
                <ReferenceLine y={0} stroke="#52525b" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#a1a1aa"
                  strokeWidth={2}
                  dot={enriched.length <= 20 ? { r: 3, fill: '#a1a1aa', strokeWidth: 0 } : false}
                  activeDot={{ r: 5, fill: '#fff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 着順分布 */}
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">着順分布</h2>
            <div className="flex items-center gap-6">
              <div className="flex-none">
                <ResponsiveContainer width={130} height={130}>
                  <PieChart>
                    <Pie
                      data={rankDist}
                      dataKey="count"
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={58}
                      paddingAngle={2}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {rankDist.map((_, i) => <Cell key={i} fill={RANK_COLORS[i]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                      formatter={(v, _name, entry) => [`${v}回 (${entry.payload.rate.toFixed(1)}%)`, RANK_LABELS[entry.payload.rank - 1]]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2.5">
                {rankDist.map((d, i) => (
                  <div key={d.rank} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: RANK_COLORS[i] }} />
                        <span className="text-xs text-zinc-400">{d.rank}位</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">{d.count}回</span>
                        <span className="text-xs font-semibold text-zinc-300 w-10 text-right">{d.rate.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${d.rate}%`, background: RANK_COLORS[i] }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 月次収支 */}
          {monthly.length > 0 && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
              <h2 className="text-sm font-semibold text-zinc-300 mb-4">月次収支</h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={36} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                    formatter={(v) => [formatProfit(Number(v)), '収支']}
                  />
                  <ReferenceLine y={0} stroke="#52525b" />
                  <Bar dataKey="profit" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {monthly.map((d, i) => <Cell key={i} fill={d.profit >= 0 ? '#4ade80' : '#f87171'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ルール別収支 */}
          {presetStats.length > 1 && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
              <h2 className="text-sm font-semibold text-zinc-300 mb-4">ルール別収支</h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={presetStats} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="presetName" tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={36} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                    formatter={(v, name) => [
                      name === 'profit' ? formatProfit(Number(v)) : `${v}回`,
                      name === 'profit' ? '収支' : '半荘数',
                    ]}
                  />
                  <ReferenceLine y={0} stroke="#52525b" />
                  <Bar dataKey="profit" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {presetStats.map((d, i) => <Cell key={i} fill={d.profit >= 0 ? '#4ade80' : '#f87171'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1">
                {presetStats.map(d => (
                  <div key={d.presetId} className="flex justify-between text-xs text-zinc-500">
                    <span>{d.presetName}</span>
                    <span>{d.count}半荘</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
