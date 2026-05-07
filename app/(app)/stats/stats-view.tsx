'use client'

import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
const CHART_COLORS = { pos: '#4ADE80', neg: '#F87171', line: '#A1A1AA' }

type Period = 'all' | 'month' | '30d' | '90d'

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
    { label: '累計収支', value: formatProfit(kpi.totalProfit), positive: kpi.totalProfit >= 0 },
    { label: '半荘数', value: `${kpi.hanchanCount}回` },
    { label: '平均着順', value: kpi.hanchanCount > 0 ? `${kpi.avgRank.toFixed(2)}位` : '-' },
    { label: 'トップ率', value: kpi.hanchanCount > 0 ? `${kpi.topRate.toFixed(1)}%` : '-' },
    { label: 'ラス率', value: kpi.hanchanCount > 0 ? `${kpi.lastRate.toFixed(1)}%` : '-' },
    { label: '平均素点', value: kpi.hanchanCount > 0 ? `${Math.round(kpi.avgScore).toLocaleString()}点` : '-' },
    { label: 'チップ累計', value: `${kpi.totalChips >= 0 ? '+' : ''}${kpi.totalChips}枚` },
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
    <div className="px-4 pt-6 pb-8 space-y-6">
      <h1 className="text-2xl font-bold text-zinc-50">統計</h1>

      {/* フィルタ */}
      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {(['all', 'month', '30d', '90d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-none px-4 py-2 rounded-full text-sm font-medium transition-colors ${period === p ? 'bg-zinc-50 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}
            >
              {p === 'all' ? '全期間' : p === 'month' ? '今月' : p === '30d' ? '30日' : '90日'}
            </button>
          ))}
        </div>
        {presets.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button onClick={() => setFilterPresetId('all')} className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium ${filterPresetId === 'all' ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-500'}`}>全て</button>
            {presets.map(p => (
              <button key={p.id} onClick={() => setFilterPresetId(p.id)} className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium ${filterPresetId === p.id ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-500'}`}>{p.name}</button>
            ))}
          </div>
        )}
      </div>

      {/* KPIカード */}
      <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
        {kpiCards.map(({ label, value, positive }) => (
          <div key={label} className="flex-none rounded-xl bg-zinc-900 border border-zinc-800 p-4 min-w-[110px] text-center">
            <p className="text-xs text-zinc-500 mb-1">{label}</p>
            <p className={`text-lg font-bold leading-tight ${positive === true ? 'text-green-400' : positive === false ? 'text-red-400' : 'text-zinc-100'}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {enriched.length === 0 ? (
        <p className="text-center text-zinc-500 py-8">この期間の記録はありません</p>
      ) : (
        <>
          {/* 累計収支 */}
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-zinc-300">累計収支推移</h2>
              <div className="flex gap-1">
                {(['index', 'date'] as const).map(t => (
                  <button key={t} onClick={() => setCumulativeTab(t)} className={`text-xs px-2 py-1 rounded ${cumulativeTab === t ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500'}`}>
                    {t === 'index' ? '半荘番号' : '日付'}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cumulative}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey={cumulativeTab === 'index' ? 'index' : 'date'} tick={{ fontSize: 10, fill: '#71717a' }} />
                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} tickFormatter={v => `${v >= 0 ? '+' : ''}${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                  labelStyle={{ color: '#a1a1aa' }}
                  formatter={(v) => [formatProfit(Number(v)), '累計収支']}
                />
                <Line type="monotone" dataKey="cumulative" stroke={CHART_COLORS.line} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey={0} stroke="#52525b" strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 着順分布 */}
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <h2 className="text-sm font-medium text-zinc-300 mb-3">着順分布</h2>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={rankDist} dataKey="count" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
                    {rankDist.map((_, i) => <Cell key={i} fill={RANK_COLORS[i]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {rankDist.map((d, i) => (
                  <div key={d.rank} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: RANK_COLORS[i] }} />
                    <span className="text-xs text-zinc-400 w-8">{d.rank}位</span>
                    <span className="text-sm font-medium text-zinc-200">{d.count}回</span>
                    <span className="text-xs text-zinc-500">{d.rate.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 月次収支 */}
          {monthly.length > 0 && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
              <h2 className="text-sm font-medium text-zinc-300 mb-3">月次収支</h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#71717a' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#71717a' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                    formatter={(v) => [formatProfit(Number(v)), '収支']}
                  />
                  <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                    {monthly.map((d, i) => <Cell key={i} fill={d.profit >= 0 ? CHART_COLORS.pos : CHART_COLORS.neg} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* プリセット別 */}
          {presetStats.length > 1 && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
              <h2 className="text-sm font-medium text-zinc-300 mb-3">ルール別収支</h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={presetStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="presetName" tick={{ fontSize: 10, fill: '#71717a' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#71717a' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                    formatter={(v, name) => [name === 'profit' ? formatProfit(Number(v)) : `${v}回`, name === 'profit' ? '収支' : '半荘数']}
                  />
                  <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                    {presetStats.map((d, i) => <Cell key={i} fill={d.profit >= 0 ? CHART_COLORS.pos : CHART_COLORS.neg} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
