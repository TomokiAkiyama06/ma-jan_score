import type {
  Hanchan, Preset, Session, HanchanWithProfit,
  KpiStats, MonthlyStats, RankDistribution, PresetStats, CumulativePoint,
  ParticipantSummary, Transfer, SplitMethod
} from './types'

// ─── 着順計算 ─────────────────────────────────────────────

export function calculateRank(scores: number[], mySeatIndex: number): number {
  const sorted = scores
    .map((score, idx) => ({ score, idx }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
  return sorted.findIndex(s => s.idx === mySeatIndex) + 1
}

// ─── 収支計算 ─────────────────────────────────────────────

export function calculateProfitForSeat(score: number, rank: number, preset: Preset): number {
  const baseProfit = (score - preset.starting_score) / 1000 * preset.rate
  const umaArr = [preset.uma_first, preset.uma_second, preset.uma_third, preset.uma_fourth]
  const uma = umaArr[rank - 1] * preset.rate
  let oka = 0
  if (preset.oka_enabled && rank === 1) {
    oka = (preset.return_score - preset.starting_score) * 4 / 1000 * preset.rate
  }
  return baseProfit + uma + oka
}

export function calculateProfit(hanchan: Hanchan, preset: Preset): number {
  const myScore = hanchan.scores[hanchan.my_seat_index]
  const scoreProfit = calculateProfitForSeat(myScore, hanchan.my_rank, preset)
  const chipProfit = hanchan.chip_count * preset.chip_rate
  return scoreProfit + chipProfit
}

export function enrichWithProfit(hanchans: Hanchan[], presets: Preset[]): HanchanWithProfit[] {
  const presetMap = new Map(presets.map(p => [p.id, p]))
  return hanchans.map(h => {
    const preset = h.session?.preset ?? presetMap.get(h.session?.preset_id ?? '')
    const profit = preset ? calculateProfit(h, preset) : 0
    return { ...h, profit }
  })
}

// ─── KPI・統計 ────────────────────────────────────────────

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

// ─── セットモード計算 ──────────────────────────────────────

export function calculateSetFee(session: Session, endedAt: Date): number {
  if (session.mode !== 'set' || !session.hourly_rate) return 0
  const startedAt = new Date(session.started_at)
  const elapsedMs = endedAt.getTime() - startedAt.getTime()
  const elapsedHours = elapsedMs / (1000 * 60 * 60)
  const billedHours = Math.ceil(elapsedHours * 2) / 2  // 30分単位切り上げ
  const reserve = session.reserve_fee ?? 1000
  return Math.round((session.hourly_rate * billedHours) + reserve)
}

export function calculateFeePerHanchan(totalFee: number, hanchanCount: number): number[] {
  if (hanchanCount === 0) return []
  const base = Math.floor(totalFee / hanchanCount)
  const remainder = totalFee - base * hanchanCount
  return Array.from({ length: hanchanCount }, (_, i) => base + (i < remainder ? 1 : 0))
}

function equalSplit(fee: number, participants: string[]): Record<string, number> {
  if (participants.length === 0) return {}
  const per = Math.floor(fee / participants.length)
  const remainder = fee - per * participants.length
  return Object.fromEntries(
    participants.map((name, i) => [name, per + (i < remainder ? 1 : 0)])
  )
}

function feeSharePerHanchanWinner(session: Session, hanchans: Hanchan[]): Record<string, number> {
  const total = session.total_fee ?? 0
  const fees = calculateFeePerHanchan(total, hanchans.length)
  const share: Record<string, number> = {}
  for (const name of session.participants ?? []) share[name] = 0

  const sorted = [...hanchans].sort((a, b) => a.played_at.localeCompare(b.played_at))
  for (let i = 0; i < sorted.length; i++) {
    const h = sorted[i]
    const seats = h.participants_per_seat
    if (!seats) continue
    const topIdx = seats.findIndex((_, idx) => calculateRank(h.scores, idx) === 1)
    if (topIdx === -1) continue
    const topPlayer = seats[topIdx]
    if (topPlayer in share) share[topPlayer] += fees[i]
  }
  return share
}

export function splitFee(session: Session, hanchans: Hanchan[]): Record<string, number> {
  const fee = session.total_fee ?? 0
  const participants = session.participants ?? []
  const method: SplitMethod = session.split_method ?? 'per_hanchan_winner'
  switch (method) {
    case 'per_hanchan_winner':
      return feeSharePerHanchanWinner(session, hanchans)
    case 'manual':
      return session.manual_split ?? equalSplit(fee, participants)
    case 'equal':
    default:
      return equalSplit(fee, participants)
  }
}

export function summarizePerParticipant(
  session: Session,
  hanchans: Hanchan[],
  preset: Preset
): ParticipantSummary[] {
  const chipRate = session.chip_rate ?? preset.chip_rate
  const feeSplit = splitFee(session, hanchans)

  return (session.participants ?? []).map(name => {
    let scoreProfit = 0
    let hanchanCount = 0
    const ranks: number[] = []

    for (const h of hanchans) {
      const seatIndex = h.participants_per_seat?.indexOf(name) ?? -1
      if (seatIndex === -1) continue
      const rank = calculateRank(h.scores, seatIndex)
      scoreProfit += calculateProfitForSeat(h.scores[seatIndex], rank, preset)
      ranks.push(rank)
      hanchanCount++
    }

    const chipCount = session.participant_chips?.[name] ?? 0
    const chipProfit = chipCount * chipRate
    const feeShare = feeSplit[name] ?? 0
    const topCount = ranks.filter(r => r === 1).length

    return {
      participant: name,
      scoreProfit,
      chipCount,
      chipProfit,
      feeShare,
      netProfit: scoreProfit + chipProfit - feeShare,
      hanchanCount,
      ranks,
      topCount,
    }
  })
}

export function calculateTransfers(summaries: ParticipantSummary[]): Transfer[] {
  const balances = summaries.map(s => ({
    name: s.participant,
    amount: s.scoreProfit + s.chipProfit,
  }))

  const transfers: Transfer[] = []
  const epsilon = 1

  while (true) {
    balances.sort((a, b) => a.amount - b.amount)
    const debtor = balances[0]
    const creditor = balances[balances.length - 1]
    if (Math.abs(debtor.amount) < epsilon || creditor.amount < epsilon) break
    const amount = Math.min(-debtor.amount, creditor.amount)
    if (amount < epsilon) break
    transfers.push({ from: debtor.name, to: creditor.name, amount: Math.round(amount) })
    debtor.amount += amount
    creditor.amount -= amount
  }

  return transfers
}

// ─── 場替えリマインダー ───────────────────────────────────

export function getSeatChangeReminder(hanchansInSession: number, interval: number | null): string | null {
  if (!interval) return null
  const remaining = interval - (hanchansInSession % interval)
  if (remaining === interval) return '📍 場替えのタイミングです'
  return `次の場替えまであと ${remaining} 半荘`
}

// ─── ユーティリティ ───────────────────────────────────────

export function formatProfit(profit: number): string {
  const sign = profit >= 0 ? '+' : ''
  return `${sign}${Math.round(profit).toLocaleString()}円`
}

export function isNewSessionNeeded(lastPlayedAt: string | null, timeoutHours = 5): boolean {
  if (!lastPlayedAt) return true
  const diff = Date.now() - new Date(lastPlayedAt).getTime()
  return diff >= timeoutHours * 60 * 60 * 1000
}

export function formatElapsed(startedAt: string, endedAt?: string): string {
  const start = new Date(startedAt)
  const end = endedAt ? new Date(endedAt) : new Date()
  const mins = Math.floor((end.getTime() - start.getTime()) / 60000)
  if (mins < 60) return `${mins}分`
  return `${Math.floor(mins / 60)}時間${mins % 60 > 0 ? `${mins % 60}分` : ''}`
}

// OCR: south位置を自動選択
export function pickMySeatIndex(scores: { value: number | null; position: string }[]): number {
  const southIndex = scores.findIndex(s => s.position === 'south')
  return southIndex !== -1 ? southIndex : 0
}
