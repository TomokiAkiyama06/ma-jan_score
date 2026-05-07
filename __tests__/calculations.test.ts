import { describe, it, expect } from 'vitest'
import {
  calculateRank,
  calculateProfit,
  calcKpi,
  isNewSessionNeeded,
  formatProfit,
  calcCumulative,
} from '@/lib/calculations'
import type { Hanchan, Preset, HanchanWithProfit } from '@/lib/types'

const basePreset: Preset = {
  id: 'p1',
  user_id: 'u1',
  name: 'テンゴ・10-20',
  rate: 50,
  uma_first: 20,
  uma_second: 10,
  uma_third: -10,
  uma_fourth: -20,
  starting_score: 25000,
  return_score: 30000,
  oka_enabled: true,
  chip_rate: 100,
  is_default: true,
  created_at: '2024-01-01T00:00:00Z',
}

const baseHanchan: Hanchan = {
  id: 'h1',
  user_id: 'u1',
  session_id: 's1',
  played_at: '2024-01-01T10:00:00Z',
  scores: [30000, 25000, 25000, 20000],
  my_seat_index: 0,
  my_rank: 1,
  chip_count: 0,
  photo_url: null,
  notes: null,
  created_at: '2024-01-01T10:00:00Z',
}

describe('calculateRank', () => {
  it('1位を正しく計算する', () => {
    expect(calculateRank([30000, 25000, 25000, 20000], 0)).toBe(1)
  })

  it('4位を正しく計算する', () => {
    expect(calculateRank([30000, 25000, 25000, 20000], 3)).toBe(4)
  })

  it('同点は席順（インデックス小さい方が上位）', () => {
    // index 1 と index 2 が同点25000 → index 1 が2位
    expect(calculateRank([30000, 25000, 25000, 20000], 1)).toBe(2)
    expect(calculateRank([30000, 25000, 25000, 20000], 2)).toBe(3)
  })

  it('全員同点でも席順で決まる', () => {
    expect(calculateRank([25000, 25000, 25000, 25000], 0)).toBe(1)
    expect(calculateRank([25000, 25000, 25000, 25000], 3)).toBe(4)
  })
})

describe('calculateProfit', () => {
  it('1位・オカあり・チップなしの収支を正しく計算する', () => {
    // scores[0]=30000, rank=1, preset: rate=50, uma_first=20, starting=25000, return=30000, oka=true
    // baseProfit = (30000 - 25000) / 1000 * 50 = 250
    // uma = 20 * 50 = 1000
    // oka = (30000 - 25000) * 4 / 1000 * 50 = 1000
    // chips = 0
    // total = 250 + 1000 + 1000 = 2250
    const h = { ...baseHanchan, scores: [30000, 25000, 25000, 20000], my_seat_index: 0, my_rank: 1, chip_count: 0 }
    expect(calculateProfit(h, basePreset)).toBe(2250)
  })

  it('4位の収支を正しく計算する（オカなし・チップなし）', () => {
    // scores[3]=20000, rank=4
    // baseProfit = (20000 - 25000) / 1000 * 50 = -250
    // uma = -20 * 50 = -1000
    // oka = 0 (4位)
    // total = -1250
    const h = { ...baseHanchan, scores: [30000, 25000, 25000, 20000], my_seat_index: 3, my_rank: 4, chip_count: 0 }
    expect(calculateProfit(h, basePreset)).toBe(-1250)
  })

  it('チップがある場合に正しく加算される', () => {
    const h = { ...baseHanchan, scores: [30000, 25000, 25000, 20000], my_seat_index: 0, my_rank: 1, chip_count: 3 }
    // base=2250, chips=3*100=300 → 2550
    expect(calculateProfit(h, basePreset)).toBe(2550)
  })

  it('チップがマイナスの場合', () => {
    const h = { ...baseHanchan, scores: [30000, 25000, 25000, 20000], my_seat_index: 0, my_rank: 1, chip_count: -2 }
    // base=2250, chips=-2*100=-200 → 2050
    expect(calculateProfit(h, basePreset)).toBe(2050)
  })

  it('okaが無効の場合オカを加算しない', () => {
    const preset = { ...basePreset, oka_enabled: false }
    const h = { ...baseHanchan, scores: [30000, 25000, 25000, 20000], my_seat_index: 0, my_rank: 1, chip_count: 0 }
    // base=250, uma=1000, oka=0 → 1250
    expect(calculateProfit(h, preset)).toBe(1250)
  })

  it('2位のウマを正しく計算する', () => {
    const h = { ...baseHanchan, scores: [30000, 25000, 25000, 20000], my_seat_index: 1, my_rank: 2, chip_count: 0 }
    // baseProfit = (25000 - 25000) / 1000 * 50 = 0
    // uma = 10 * 50 = 500
    // oka = 0 (2位)
    expect(calculateProfit(h, basePreset)).toBe(500)
  })

  it('原点ちょうどで1位ならオカのみ', () => {
    // score=25000 = starting_score → baseProfit=0
    const h = { ...baseHanchan, scores: [25000, 25000, 25000, 25000], my_seat_index: 0, my_rank: 1, chip_count: 0 }
    // uma=1000, oka=1000 → 2000
    expect(calculateProfit(h, basePreset)).toBe(2000)
  })
})

describe('isNewSessionNeeded', () => {
  it('lastPlayedAtがnullなら新セッション必要', () => {
    expect(isNewSessionNeeded(null)).toBe(true)
  })

  it('5時間以内なら不要', () => {
    const t = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    expect(isNewSessionNeeded(t)).toBe(false)
  })

  it('5時間以上経過なら必要', () => {
    const t = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    expect(isNewSessionNeeded(t)).toBe(true)
  })

  it('カスタムタイムアウトが効く', () => {
    const t = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    expect(isNewSessionNeeded(t, 2)).toBe(true)
    expect(isNewSessionNeeded(t, 4)).toBe(false)
  })
})

describe('formatProfit', () => {
  it('正数は+符号付きで表示', () => {
    expect(formatProfit(1500)).toBe('+1,500円')
  })

  it('負数は-符号で表示', () => {
    expect(formatProfit(-2000)).toBe('-2,000円')
  })

  it('0は+0円', () => {
    expect(formatProfit(0)).toBe('+0円')
  })

  it('小数は四捨五入', () => {
    expect(formatProfit(1500.6)).toBe('+1,501円')
    expect(formatProfit(1500.4)).toBe('+1,500円')
  })
})

describe('calcKpi', () => {
  const makeHanchan = (rank: number, score: number, profit: number): HanchanWithProfit => ({
    ...baseHanchan,
    my_rank: rank,
    scores: [score, 25000, 25000, 25000],
    profit,
  })

  it('空配列ではゼロを返す', () => {
    const kpi = calcKpi([], [basePreset])
    expect(kpi.hanchanCount).toBe(0)
    expect(kpi.totalProfit).toBe(0)
    expect(kpi.avgRank).toBe(0)
  })

  it('累計収支・平均着順・トップ率・ラス率を正しく計算する', () => {
    const hanchans = [
      makeHanchan(1, 30000, 2250),
      makeHanchan(2, 25000, 500),
      makeHanchan(4, 20000, -1250),
    ]
    const kpi = calcKpi(hanchans, [basePreset])
    expect(kpi.hanchanCount).toBe(3)
    expect(kpi.totalProfit).toBeCloseTo(1500)
    expect(kpi.avgRank).toBeCloseTo(7 / 3)
    expect(kpi.topRate).toBeCloseTo(100 / 3)
    expect(kpi.lastRate).toBeCloseTo(100 / 3)
  })
})

describe('calcCumulative', () => {
  it('時系列順に累計収支を計算する', () => {
    const hanchans: HanchanWithProfit[] = [
      { ...baseHanchan, id: 'h1', played_at: '2024-01-01T10:00:00Z', profit: 1000 },
      { ...baseHanchan, id: 'h2', played_at: '2024-01-02T10:00:00Z', profit: -500 },
      { ...baseHanchan, id: 'h3', played_at: '2024-01-03T10:00:00Z', profit: 300 },
    ]
    const result = calcCumulative(hanchans)
    expect(result[0].cumulative).toBe(1000)
    expect(result[1].cumulative).toBe(500)
    expect(result[2].cumulative).toBe(800)
  })

  it('played_atで昇順ソートされる', () => {
    const hanchans: HanchanWithProfit[] = [
      { ...baseHanchan, id: 'h2', played_at: '2024-01-02T10:00:00Z', profit: -500 },
      { ...baseHanchan, id: 'h1', played_at: '2024-01-01T10:00:00Z', profit: 1000 },
    ]
    const result = calcCumulative(hanchans)
    expect(result[0].profit).toBe(1000)
    expect(result[1].profit).toBe(-500)
  })
})
