import type { Hanchan, Preset, HanchanWithProfit, KpiStats, MonthlyStats, RankDistribution, PresetStats, CumulativePoint } from './types'

export function calculateRank(scores: number[], mySeatIndex: number): number {
  const sorted = scores
    .map((score, idx) => ({ score, idx }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
  return sorted.findIndex(s => s.idx === mySeatIndex) + 1
}

export function calculateProfit(hanchan: Hanchan, preset: Preset): number {
  const myScore = hanchan.scores[hanchan.my_seat_index]
  const rank = hanchan.my_rank

  const baseProfit = (myScore - preset.starting_score) / 1000 * preset.rate

  const umaArr = [preset.uma_first, preset.uma_second, preset.uma_third, preset.uma_fourth]
  const uma = umaArr[rank - 1] * preset.rate

  let oka = 0
  if (preset.oka_enabled && rank === 1) {
    oka = (preset.return_score - preset.starting_score) * 4 / 1000 * preset.rate
  }

  const chips = hanchan.chip_count * preset.chip_rate

  return baseProfit + uma + oka + chips
}

export function enrichWithProfit(hanchans: Hanchan[], presets: Preset[]): HanchanWithProfit[] {
  const presetMap = new Map(presets.map(p => [p.id, p]))
  return hanchans.map(h => {
    const preset = h.session?.preset ?? presetMap.get(h.session?.preset_id ?? '')
    const profit = preset ? calculateProfit(h, preset) : 0
    return { ...h, profit }
  })
}

export function calcKpi(hanchans: HanchanWithProfit[], presets: Preset[]): KpiStats {
  if (hanchans.length === 0) {
    return { totalProfit: 0, hanchanCount: 0, avgRank: 0, topRate: 0, lastRate: 0, avgScore: 0, totalChips: 0, totalChipProfit: 0 }
  }

  const presetMap = new Map(presets.map(p => [p.id, p]))
  const totalProfit = hanchans.reduce((s, h) => s + h.profit, 0)
  const avgRank = hanchans.reduce((s, h) => s + h.my_rank, 0) / hanchans.length
  const topRate = (hanchans.filter(h => h.my_rank === 1).length / hanchans.length) * 100
  const lastRate = (hanchans.filter(h => h.my_rank === 4).length / hanchans.length) * 100
  const avgScore = hanchans.reduce((s, h) => s + h.scores[h.my_seat_index], 0) / hanchans.length
  const totalChips = hanchans.reduce((s, h) => s + h.chip_count, 0)

  const totalChipProfit = hanchans.reduce((sum, h) => {
    const preset = h.session?.preset ?? presetMap.get(h.session?.preset_id ?? '')
    return sum + (preset ? h.chip_count * preset.chip_rate : 0)
  }, 0)

  return { totalProfit, hanchanCount: hanchans.length, avgRank, topRate, lastRate, avgScore, totalChips, totalChipProfit }
}

export function calcMonthlyStats(hanchans: HanchanWithProfit[]): MonthlyStats[] {
  const map = new Map<string, { profit: number; count: number }>()
  for (const h of hanchans) {
    const month = h.played_at.slice(0, 7)
    const prev = map.get(month) ?? { profit: 0, count: 0 }
    map.set(month, { profit: prev.profit + h.profit, count: prev.count + 1 })
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { profit, count }]) => ({ month, profit, count }))
}

export function calcRankDistribution(hanchans: HanchanWithProfit[]): RankDistribution[] {
  const total = hanchans.length
  return [1, 2, 3, 4].map(rank => {
    const count = hanchans.filter(h => h.my_rank === rank).length
    return { rank, count, rate: total > 0 ? (count / total) * 100 : 0 }
  })
}

export function calcPresetStats(hanchans: HanchanWithProfit[], presets: Preset[]): PresetStats[] {
  const presetMap = new Map(presets.map(p => [p.id, p]))
  const map = new Map<string, { profit: number; count: number; name: string }>()
  for (const h of hanchans) {
    const presetId = h.session?.preset_id ?? ''
    const preset = presetMap.get(presetId)
    if (!preset) continue
    const prev = map.get(presetId) ?? { profit: 0, count: 0, name: preset.name }
    map.set(presetId, { profit: prev.profit + h.profit, count: prev.count + 1, name: preset.name })
  }
  return Array.from(map.entries()).map(([presetId, { profit, count, name }]) => ({
    presetId, presetName: name, profit, count
  }))
}

export function calcCumulative(hanchans: HanchanWithProfit[]): CumulativePoint[] {
  let cumulative = 0
  return hanchans
    .slice()
    .sort((a, b) => a.played_at.localeCompare(b.played_at))
    .map((h, i) => {
      cumulative += h.profit
      return { index: i + 1, date: h.played_at.slice(0, 10), cumulative, profit: h.profit }
    })
}

export function formatProfit(profit: number): string {
  const sign = profit >= 0 ? '+' : ''
  return `${sign}${Math.round(profit).toLocaleString()}円`
}

export function isNewSessionNeeded(lastPlayedAt: string | null, timeoutHours = 5): boolean {
  if (!lastPlayedAt) return true
  const diff = Date.now() - new Date(lastPlayedAt).getTime()
  return diff >= timeoutHours * 60 * 60 * 1000
}
