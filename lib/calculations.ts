import type {
  Hanchan, Preset, Session, HanchanWithProfit,
  KpiStats, MonthlyStats, RankDistribution, PresetStats, CumulativePoint,
  ParticipantSummary, Transfer
} from './types'

// ─── 着順計算 ─────────────────────────────────────────────

export function calculateRank(scores: number[], mySeatIndex: number): number {
  const sorted = scores
    .map((score, idx) => ({ score, idx }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
  return sorted.findIndex(s => s.idx === mySeatIndex) + 1
}

// ─── 収支計算（ゼロサム保証） ─────────────────────────────

// 1半荘・4人分の収支を一括計算。
// 1位以外は base+uma を独立計算し、1位は他3人の合計の符号反転で算出することで、
// オカ・箱下のマイナス補填を1位が自動的に吸収する（=合計が常に0）。
export function calculateProfitsForHanchan(scores: number[], preset: Preset): number[] {
  const ranks = scores.map((_, i) => calculateRank(scores, i))
  const hakoShita = preset.hako_shita_enabled ?? true
  // オカが有効なら return_score を基準点に。無効なら starting_score を基準点に。
  const baseRef = (preset.oka_enabled ?? true) ? preset.return_score : preset.starting_score
  const umaArr = [preset.uma_first, preset.uma_second, preset.uma_third, preset.uma_fourth]

  const profits = scores.map((score, i) => {
    const effectiveScore = hakoShita ? score : Math.max(0, score)
    const base = Math.round((effectiveScore - baseRef) / 1000) * preset.rate
    const uma = umaArr[ranks[i] - 1] * preset.rate
    return base + uma
  })

  // 1位はゼロサムになるよう他3人の合計の符号反転で確定
  const topIdx = ranks.indexOf(1)
  if (topIdx !== -1) {
    const othersSum = profits.reduce((s, p, i) => i === topIdx ? s : s + p, 0)
    profits[topIdx] = -othersSum
  }
  return profits
}

export function calculateProfitForSeat(scores: number[], seatIndex: number, preset: Preset): number {
  return calculateProfitsForHanchan(scores, preset)[seatIndex]
}

export function calculateProfit(hanchan: Hanchan, preset: Preset): number {
  const scoreProfit = calculateProfitForSeat(hanchan.scores, hanchan.my_seat_index, preset)
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

// 1半荘あたりの場代を100円単位で切り上げ。全半荘で同額。
// 切り上げにより合計が請求総額を下回らないようにする。
export function calculatePerHanchanFee(totalFee: number, hanchanCount: number): number {
  if (hanchanCount <= 0) return 0
  return Math.ceil(totalFee / hanchanCount / 100) * 100
}

// 各人の場代負担額 = その人が1位を取った半荘数 × 1半荘単価
function feeSharePerHanchanWinner(session: Session, hanchans: Hanchan[]): Record<string, number> {
  const totalFee = session.total_fee ?? 0
  const perFee = calculatePerHanchanFee(totalFee, hanchans.length)
  const share: Record<string, number> = {}
  for (const name of session.participants ?? []) share[name] = 0
  for (const h of hanchans) {
    const seats = h.participants_per_seat
    if (!seats) continue
    const topIdx = seats.findIndex((_, idx) => calculateRank(h.scores, idx) === 1)
    if (topIdx === -1) continue
    const topPlayer = seats[topIdx]
    if (topPlayer in share) share[topPlayer] += perFee
  }
  return share
}

export function splitFee(session: Session, hanchans: Hanchan[]): Record<string, number> {
  return feeSharePerHanchanWinner(session, hanchans)
}

export function summarizePerParticipant(
  session: Session,
  hanchans: Hanchan[],
  preset: Preset
): ParticipantSummary[] {
  const chipRate = session.chip_rate ?? preset.chip_rate
  const feeSplit = splitFee(session, hanchans)

  // 各半荘の収支を1回だけ計算してキャッシュ
  const profitsByHanchan = hanchans.map(h => calculateProfitsForHanchan(h.scores, preset))

  return (session.participants ?? []).map(name => {
    let scoreProfit = 0
    let hanchanCount = 0
    const ranks: number[] = []

    hanchans.forEach((h, hIdx) => {
      const seatIndex = h.participants_per_seat?.indexOf(name) ?? -1
      if (seatIndex === -1) return
      const rank = calculateRank(h.scores, seatIndex)
      scoreProfit += profitsByHanchan[hIdx][seatIndex]
      ranks.push(rank)
      hanchanCount++
    })

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

// 参加者間の送金を1000円単位で算出。
// 残高（素点+チップ収支、場代は店に各自直接支払う前提のため除外）を1000円単位に四捨五入し、
// 丸めで生じたゼロサム崩れはトップ最多者で吸収する。
export function calculateTransfers(summaries: ParticipantSummary[]): Transfer[] {
  if (summaries.length === 0) return []

  const balances = summaries.map(s => ({
    name: s.participant,
    amount: Math.round((s.scoreProfit + s.chipProfit) / 1000) * 1000,
  }))

  const sum = balances.reduce((s, b) => s + b.amount, 0)
  if (sum !== 0) {
    const maxTop = Math.max(0, ...summaries.map(s => s.topCount))
    const tops = maxTop > 0
      ? summaries.filter(s => s.topCount === maxTop).map(s => s.participant)
      : [summaries[0].participant]

    const totalUnits = -sum / 1000
    const baseUnit = Math.trunc(totalUnits / tops.length)
    const remainderUnits = totalUnits - baseUnit * tops.length
    const sign = Math.sign(remainderUnits)
    const absRem = Math.abs(remainderUnits)
    tops.forEach((name, i) => {
      const target = balances.find(b => b.name === name)!
      target.amount += baseUnit * 1000 + (i < absRem ? sign * 1000 : 0)
    })
  }

  const transfers: Transfer[] = []
  const epsilon = 500
  while (true) {
    balances.sort((a, b) => a.amount - b.amount)
    const debtor = balances[0]
    const creditor = balances[balances.length - 1]
    if (Math.abs(debtor.amount) < epsilon || creditor.amount < epsilon) break
    const amount = Math.min(-debtor.amount, creditor.amount)
    if (amount < epsilon) break
    transfers.push({ from: debtor.name, to: creditor.name, amount })
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
