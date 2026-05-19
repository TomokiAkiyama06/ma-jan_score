import { describe, it, expect } from 'vitest'
import {
  calculateRank,
  calculateProfit,
  calculateProfitsForHanchan,
  calcKpi,
  isNewSessionNeeded,
  formatProfit,
  calcCumulative,
  calculatePerHanchanFee,
  calculateTransfers,
  splitFee,
  summarizePerParticipant,
  calculatePoolFlows,
} from '@/lib/calculations'
import type { Hanchan, Preset, HanchanWithProfit, Session, ParticipantSummary } from '@/lib/types'

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
  seat_change_interval: null,
  hako_shita_enabled: true,
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
  participants_per_seat: null,
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
    expect(calculateRank([30000, 25000, 25000, 20000], 1)).toBe(2)
    expect(calculateRank([30000, 25000, 25000, 20000], 2)).toBe(3)
  })

  it('全員同点でも席順で決まる', () => {
    expect(calculateRank([25000, 25000, 25000, 25000], 0)).toBe(1)
    expect(calculateRank([25000, 25000, 25000, 25000], 3)).toBe(4)
  })
})

describe('calculateProfitsForHanchan（ゼロサム保証）', () => {
  it('合計が常に0になる（基本ケース）', () => {
    const profits = calculateProfitsForHanchan([30000, 25000, 25000, 20000], basePreset)
    expect(profits.reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('1位は返し点と原点の差×4＋ウマを受け取る（基本ケース）', () => {
    // baseRef = return = 30000
    // P1 (25000, 2位): base=-250, uma=500 → 250
    // P2 (25000, 3位): base=-250, uma=-500 → -750
    // P3 (20000, 4位): base=-500, uma=-1000 → -1500
    // 他3人合計 = -2000 → P0 (1位) = +2000
    expect(calculateProfitsForHanchan([30000, 25000, 25000, 20000], basePreset))
      .toEqual([2000, 250, -750, -1500])
  })

  it('ユーザー例: rate=100, 返し30000, 箱下OFF, [35000,20000,65000,-20000]', () => {
    const preset: Preset = {
      ...basePreset, rate: 100, hako_shita_enabled: false,
    }
    // P0 (35000, 2位): base=+500, uma=+1000 → +1500
    // P1 (20000, 3位): base=-1000, uma=-1000 → -2000
    // P2 (65000, 1位): ゼロサム調整 → +5500
    // P3 (-20000→0, 4位): base=-3000, uma=-2000 → -5000
    expect(calculateProfitsForHanchan([35000, 20000, 65000, -20000], preset))
      .toEqual([1500, -2000, 5500, -5000])
  })

  it('箱下OFF: マイナス素点の負担軽減分はトップが吸収する', () => {
    const preset = { ...basePreset, hako_shita_enabled: false }
    // scores=[52000, 26000, 25000, -3000]
    // P3 effective=0, base=-1500, uma=-1000 → -2500
    // P1 base=-200, uma=500 → 300
    // P2 base=-250, uma=-500 → -750
    // 他3人合計 = -2950 → P0(1位) = +2950
    expect(calculateProfitsForHanchan([52000, 26000, 25000, -3000], preset))
      .toEqual([2950, 300, -750, -2500])
  })

  it('箱下ON: マイナス素点をそのまま計上、ゼロサム成立', () => {
    const preset = { ...basePreset, hako_shita_enabled: true }
    // P3 base=-1650, uma=-1000 → -2650
    // 他3人合計 = 300 - 750 - 2650 = -3100 → P0 = +3100
    expect(calculateProfitsForHanchan([52000, 26000, 25000, -3000], preset))
      .toEqual([3100, 300, -750, -2650])
  })

  it('オカ無効: baseRef=starting_score、1位は他3人の合計のみ吸収', () => {
    const preset = { ...basePreset, oka_enabled: false }
    // baseRef=25000
    // P1 base=0, uma=500 → 500
    // P2 base=0, uma=-500 → -500
    // P3 base=-250, uma=-1000 → -1250
    // 他3人合計 = -1250 → P0(1位) = +1250
    expect(calculateProfitsForHanchan([30000, 25000, 25000, 20000], preset))
      .toEqual([1250, 500, -500, -1250])
  })
})

describe('calculateProfit（席指定の最終収支）', () => {
  it('1位・チップなしの収支', () => {
    const h = { ...baseHanchan, my_seat_index: 0, my_rank: 1, chip_count: 0 }
    expect(calculateProfit(h, basePreset)).toBe(2000)
  })

  it('4位・チップなしの収支', () => {
    const h = { ...baseHanchan, my_seat_index: 3, my_rank: 4, chip_count: 0 }
    expect(calculateProfit(h, basePreset)).toBe(-1500)
  })

  it('チップが正しく加算される', () => {
    const h = { ...baseHanchan, my_seat_index: 0, my_rank: 1, chip_count: 3 }
    expect(calculateProfit(h, basePreset)).toBe(2000 + 300)
  })

  it('チップがマイナスでも加算される', () => {
    const h = { ...baseHanchan, my_seat_index: 0, my_rank: 1, chip_count: -2 }
    expect(calculateProfit(h, basePreset)).toBe(2000 - 200)
  })

  it('2位のウマを正しく計算する', () => {
    const h = { ...baseHanchan, my_seat_index: 1, my_rank: 2, chip_count: 0 }
    expect(calculateProfit(h, basePreset)).toBe(250)
  })
})

describe('1000点単位四捨五入', () => {
  it('素点差の端数を1000点単位で四捨五入する', () => {
    // [27300, 26000, 25000, 21700]
    // P0 base = round(-2.7)*50 = -150, uma=1000 → 850
    // P1 base = round(-4.0)*50 = -200, uma=500 → 300
    // P2 base = round(-5.0)*50 = -250, uma=-500 → -750
    // P3 base = round(-8.3)*50 = -400, uma=-1000 → -1400
    // 他3人合計=-1850 → P0=1850
    const h = { ...baseHanchan, scores: [27300, 26000, 25000, 21700], my_seat_index: 0, my_rank: 1 }
    expect(calculateProfit(h, basePreset)).toBe(1850)
  })

  it('マイナス側の四捨五入も働く（4位）', () => {
    // [27300, 25000, 25000, 22700]
    // P3 base = round(-7.3)*50 = -350, uma=-1000 → -1350
    const h = { ...baseHanchan, scores: [27300, 25000, 25000, 22700], my_seat_index: 3, my_rank: 4 }
    expect(calculateProfit(h, basePreset)).toBe(-1350)
  })
})

describe('calculatePerHanchanFee（1半荘あたりの場代）', () => {
  it('割り切れる場合は素直に総額÷半荘数', () => {
    expect(calculatePerHanchanFee(6000, 6)).toBe(1000)
  })

  it('100円未満の端数は切り上げる', () => {
    // 6250 / 6 = 1041.67 → 1100 (切り上げ)
    expect(calculatePerHanchanFee(6250, 6)).toBe(1100)
    // 6800 / 6 = 1133.33 → 1200
    expect(calculatePerHanchanFee(6800, 6)).toBe(1200)
  })

  it('半荘0または総額0は0', () => {
    expect(calculatePerHanchanFee(0, 6)).toBe(0)
    expect(calculatePerHanchanFee(6000, 0)).toBe(0)
  })

  it('切り上げにより合計が総額を下回らない', () => {
    const totalFee = 7000
    const hanchanCount = 6
    const perFee = calculatePerHanchanFee(totalFee, hanchanCount)
    expect(perFee * hanchanCount).toBeGreaterThanOrEqual(totalFee)
  })
})

describe('splitFee（per_hanchan_winner 固定・100円単位）', () => {
  const baseSession: Session = {
    id: 's1',
    user_id: 'u1',
    preset_id: 'p1',
    mode: 'set',
    started_at: '2024-01-01T10:00:00Z',
    ended_at: null,
    location_memo: null,
    participants: ['A', 'B', 'C', 'D'],
    total_fee: 7000,
    created_at: '2024-01-01T10:00:00Z',
  }

  function makeHanchan(id: string, scores: number[], seats: string[]): Hanchan {
    return { ...baseHanchan, id, scores, participants_per_seat: seats }
  }

  it('各半荘のトップが1半荘単価ぶん負担', () => {
    // totalFee=7000, 6半荘 → perFee = ceil(7000/6/100)*100 = ceil(11.67)*100 = 1200
    // 6半荘すべてAが1位 → A=7200, 他=0
    const hanchans = Array.from({ length: 6 }, (_, i) =>
      makeHanchan(`h${i}`, [40000, 25000, 20000, 15000], ['A', 'B', 'C', 'D']))
    const share = splitFee({ ...baseSession }, hanchans)
    expect(share).toEqual({ A: 7200, B: 0, C: 0, D: 0 })
  })

  it('1位が分散している場合は回数で按分', () => {
    // perFee=1200。A=3回, B=2回, C=1回 → A=3600, B=2400, C=1200, D=0
    const hanchans = [
      ...Array.from({ length: 3 }, (_, i) => makeHanchan(`h${i}`, [40000, 25000, 20000, 15000], ['A', 'B', 'C', 'D'])),
      ...Array.from({ length: 2 }, (_, i) => makeHanchan(`hb${i}`, [25000, 40000, 20000, 15000], ['A', 'B', 'C', 'D'])),
      makeHanchan('hc', [25000, 20000, 40000, 15000], ['A', 'B', 'C', 'D']),
    ]
    const share = splitFee({ ...baseSession }, hanchans)
    expect(share).toEqual({ A: 3600, B: 2400, C: 1200, D: 0 })
  })

  it('participants_per_seat 未設定の半荘は無視される', () => {
    const hanchans = [
      makeHanchan('h1', [40000, 25000, 20000, 15000], ['A', 'B', 'C', 'D']),
      { ...baseHanchan, id: 'h2', scores: [40000, 25000, 20000, 15000], participants_per_seat: null },
    ]
    const share = splitFee({ ...baseSession, total_fee: 1200 }, hanchans)
    // perFee = ceil(1200/2/100)*100 = 600。Aが1半荘だけ1位 → A=600
    expect(share).toEqual({ A: 600, B: 0, C: 0, D: 0 })
  })
})

describe('calculateTransfers（1000円単位）', () => {
  function makeSummary(participant: string, scoreProfit: number, topCount = 0): ParticipantSummary {
    return {
      participant, scoreProfit, chipCount: 0, chipProfit: 0,
      feeShare: 0, netProfit: scoreProfit, hanchanCount: 0, ranks: [], topCount,
    }
  }

  it('1000円単位で送金が生成される（ピッタリ）', () => {
    // 残高 [A=5000, B=2000, C=-3000, D=-4000] (合計0)
    // グリーディマッチング: 最大マイナスから最大プラスへ
    const summaries = [
      makeSummary('A', 5000, 2),
      makeSummary('B', 2000, 1),
      makeSummary('C', -3000, 0),
      makeSummary('D', -4000, 0),
    ]
    const transfers = calculateTransfers(summaries)
    expect(transfers).toEqual([
      { from: 'D', to: 'A', amount: 4000 },
      { from: 'C', to: 'B', amount: 2000 },
      { from: 'C', to: 'A', amount: 1000 },
    ])
  })

  it('残高は1000円単位に四捨五入され、ゼロサム崩れはトップ最多者が吸収', () => {
    // A=5400, B=2100, C=-3700, D=-3800 (合計0)
    // 丸め: A=5000, B=2000, C=-4000, D=-4000 (合計-1000)
    // トップ最多=A → A=6000 (合計0)
    const summaries = [
      makeSummary('A', 5400, 2),
      makeSummary('B', 2100, 1),
      makeSummary('C', -3700, 0),
      makeSummary('D', -3800, 0),
    ]
    const transfers = calculateTransfers(summaries)
    expect(transfers).toEqual([
      { from: 'C', to: 'A', amount: 4000 },
      { from: 'D', to: 'A', amount: 2000 },
      { from: 'D', to: 'B', amount: 2000 },
    ])
  })

  it('トップ最多が複数なら1000円単位で均等振り分け', () => {
    // A=2400(top2), B=2400(top2), C=-2400, D=-2400 (合計0)
    // 丸め: A=2000, B=2000, C=-2000, D=-2000 (合計0)
    // 補正不要
    const summaries = [
      makeSummary('A', 2400, 2),
      makeSummary('B', 2400, 2),
      makeSummary('C', -2400, 0),
      makeSummary('D', -2400, 0),
    ]
    const transfers = calculateTransfers(summaries)
    expect(transfers).toEqual([
      { from: 'C', to: 'B', amount: 2000 },
      { from: 'D', to: 'A', amount: 2000 },
    ])
  })

  it('collector 指定時: 場代込みで精算し collector が代表受取する', () => {
    // シードデータと同条件:
    // 自分 scoreProfit=7800, feeShare=2600 → netProfit=5200
    // A    scoreProfit=11600, feeShare=2600 → netProfit=9000
    // B    scoreProfit=-5200, feeShare=1300 → netProfit=-6500
    // C    scoreProfit=-14200, feeShare=1300 → netProfit=-15500
    // collector=自分, totalFee=7800
    // balance: 自分=5200+7800=13000, A=9000, B=-6500, C=-15500
    // 丸め: 自分=13000, A=9000, B=-6000, C=-15000 (合計+1000)
    // トップ最多(自分・A、topCount=2)で吸収 → 自分=12000, A=9000
    // 送金: C→自分 12000, B→A 6000, C→A 3000
    const summaries: ParticipantSummary[] = [
      { participant: '自分', scoreProfit: 7800, chipCount: 0, chipProfit: 0, feeShare: 2600, netProfit: 5200, hanchanCount: 6, ranks: [], topCount: 2 },
      { participant: 'A', scoreProfit: 11600, chipCount: 0, chipProfit: 0, feeShare: 2600, netProfit: 9000, hanchanCount: 6, ranks: [], topCount: 2 },
      { participant: 'B', scoreProfit: -5200, chipCount: 0, chipProfit: 0, feeShare: 1300, netProfit: -6500, hanchanCount: 6, ranks: [], topCount: 1 },
      { participant: 'C', scoreProfit: -14200, chipCount: 0, chipProfit: 0, feeShare: 1300, netProfit: -15500, hanchanCount: 6, ranks: [], topCount: 1 },
    ]
    const transfers = calculateTransfers(summaries, { collector: '自分', totalFee: 7800 })
    expect(transfers).toEqual([
      { from: 'C', to: '自分', amount: 12000 },
      { from: 'B', to: 'A', amount: 6000 },
      { from: 'C', to: 'A', amount: 3000 },
    ])
  })

  it('collector なしの場合は場代を含めない（旧挙動）', () => {
    // collector を指定しなければ feeShare を無視して scoreProfit+chipProfit ベースで計算
    const summaries: ParticipantSummary[] = [
      { participant: 'A', scoreProfit: 5000, chipCount: 0, chipProfit: 0, feeShare: 1000, netProfit: 4000, hanchanCount: 0, ranks: [], topCount: 2 },
      { participant: 'B', scoreProfit: -5000, chipCount: 0, chipProfit: 0, feeShare: 1000, netProfit: -6000, hanchanCount: 0, ranks: [], topCount: 0 },
    ]
    // collector なし: balance=[A=5000, B=-5000] → B→A 5000
    expect(calculateTransfers(summaries)).toEqual([{ from: 'B', to: 'A', amount: 5000 }])
  })

  it('500円未満は送金しない', () => {
    // 全員 ±300円 → 全員0扱い
    const summaries = [
      makeSummary('A', 300, 1),
      makeSummary('B', 300, 0),
      makeSummary('C', -300, 0),
      makeSummary('D', -300, 0),
    ]
    expect(calculateTransfers(summaries)).toEqual([])
  })

  it('全員topCount=0の場合は participants 先頭が吸収', () => {
    // A=600, B=600, C=-600, D=-600 (全員topCount=0)
    // 丸め: A=1000, B=1000, C=-1000, D=-1000 (合計0、補正不要)
    const summaries = [
      makeSummary('A', 600, 0),
      makeSummary('B', 600, 0),
      makeSummary('C', -600, 0),
      makeSummary('D', -600, 0),
    ]
    const transfers = calculateTransfers(summaries)
    expect(transfers).toEqual([
      { from: 'C', to: 'B', amount: 1000 },
      { from: 'D', to: 'A', amount: 1000 },
    ])
  })

  it('空配列を返す', () => {
    expect(calculateTransfers([])).toEqual([])
  })
})

describe('calculatePoolFlows（場ダイアグラム）', () => {
  it('シードと同条件の場の流れを生成する', () => {
    // 自分 netProfit=+5,200, A=+9,000, B=-6,500, C=-15,500, totalFee=7,800
    // shopAmount=8000、各 netProfit を1000円丸め → 自分=5000, A=9000, B=-6000(Math.round(-6.5)=-6), C=-15000(Math.round(-15.5)=-15)
    // 合計=-7000、target=-8000、diff=-1000 → トップ最多(自分とA、topCount=2)で吸収
    //   units=-1, baseUnit=0, remainder=-1, sign=-1, absRem=1
    //   自分(先頭)に -1000 → 自分=4000
    // 結果: inflows=[B 6000, C 15000], outflows=[自分 4000, A 9000, 店 8000]
    const summaries: ParticipantSummary[] = [
      { participant: '自分', scoreProfit: 7800, chipCount: 0, chipProfit: 0, feeShare: 2600, netProfit: 5200, hanchanCount: 6, ranks: [], topCount: 2 },
      { participant: 'A', scoreProfit: 11600, chipCount: 0, chipProfit: 0, feeShare: 2600, netProfit: 9000, hanchanCount: 6, ranks: [], topCount: 2 },
      { participant: 'B', scoreProfit: -5200, chipCount: 0, chipProfit: 0, feeShare: 1300, netProfit: -6500, hanchanCount: 6, ranks: [], topCount: 1 },
      { participant: 'C', scoreProfit: -14200, chipCount: 0, chipProfit: 0, feeShare: 1300, netProfit: -15500, hanchanCount: 6, ranks: [], topCount: 1 },
    ]
    const flow = calculatePoolFlows(summaries, 7800)
    expect(flow.shopAmount).toBe(8000)
    expect(flow.inflows).toEqual([
      { pid: 'B', name: 'B', amount: 6000 },
      { pid: 'C', name: 'C', amount: 15000 },
    ])
    expect(flow.outflows).toEqual([
      { pid: '自分', name: '自分', amount: 4000 },
      { pid: 'A', name: 'A', amount: 9000 },
      { pid: 'shop', name: 'お店', amount: 8000, isShop: true },
    ])
    expect(flow.poolTotal).toBe(21000)
    // 流入と (参加者流出 + 店) は一致する
    const sumIn = flow.inflows.reduce((s, f) => s + f.amount, 0)
    const sumOut = flow.outflows.reduce((s, f) => s + f.amount, 0)
    expect(sumIn).toBe(sumOut)
  })

  it('totalFee=0 でも参加者間の流れは生成される', () => {
    // フリー精算（場代なし）想定。inflows = 負け、outflows = 勝ち
    const summaries: ParticipantSummary[] = [
      { participant: 'A', scoreProfit: 5000, chipCount: 0, chipProfit: 0, feeShare: 0, netProfit: 5000, hanchanCount: 0, ranks: [], topCount: 1 },
      { participant: 'B', scoreProfit: -5000, chipCount: 0, chipProfit: 0, feeShare: 0, netProfit: -5000, hanchanCount: 0, ranks: [], topCount: 0 },
    ]
    const flow = calculatePoolFlows(summaries, 0)
    expect(flow.shopAmount).toBe(0)
    expect(flow.inflows).toEqual([{ pid: 'B', name: 'B', amount: 5000 }])
    expect(flow.outflows).toEqual([{ pid: 'A', name: 'A', amount: 5000 }])
    expect(flow.poolTotal).toBe(5000)
  })

  it('空配列を返す', () => {
    expect(calculatePoolFlows([], 0)).toEqual({ inflows: [], outflows: [], poolTotal: 0, shopAmount: 0 })
  })
})

describe('summarizePerParticipant（場代・チップ含む）', () => {
  const session: Session = {
    id: 's1',
    user_id: 'u1',
    preset_id: 'p1',
    mode: 'set',
    started_at: '2024-01-01T10:00:00Z',
    ended_at: null,
    location_memo: null,
    participants: ['A', 'B', 'C', 'D'],
    total_fee: 6000,
    chip_rate: 100,
    participant_chips: { A: 2, B: -2, C: 0, D: 0 },
    created_at: '2024-01-01T10:00:00Z',
  }

  it('netProfit = scoreProfit + chipProfit - feeShare', () => {
    // 6半荘、すべて A が1位（scores=[40000,25000,20000,15000]）
    const hanchans: Hanchan[] = Array.from({ length: 6 }, (_, i) => ({
      ...baseHanchan,
      id: `h${i}`,
      scores: [40000, 25000, 20000, 15000],
      participants_per_seat: ['A', 'B', 'C', 'D'],
    }))
    // 1半荘あたりの A の収支:
    //   baseRef=30000, A base=(40000-30000)/1000*50=500, uma=1000 → 1500
    //     他: B=-250+500=250, C=-500-500=-1000, D=-750-1000=-1750
    //     他合計=-2500 → A=+2500
    // 6半荘で A scoreProfit = 15000、各他は単純に6倍
    //   B: 250 * 6 = 1500
    //   C: -1000 * 6 = -6000
    //   D: -1750 * 6 = -10500
    // 場代: perFee = ceil(6000/6/100)*100 = 1000、A が6回1位 → A feeShare = 6000
    // チップ: A=2*100=200, B=-2*100=-200
    const summaries = summarizePerParticipant(session, hanchans, basePreset)
    const a = summaries.find(s => s.participant === 'A')!
    expect(a.scoreProfit).toBe(15000)
    expect(a.chipProfit).toBe(200)
    expect(a.feeShare).toBe(6000)
    expect(a.netProfit).toBe(15000 + 200 - 6000)
    expect(a.topCount).toBe(6)

    const b = summaries.find(s => s.participant === 'B')!
    expect(b.scoreProfit).toBe(1500)
    expect(b.chipProfit).toBe(-200)
    expect(b.feeShare).toBe(0)
    expect(b.netProfit).toBe(1300)
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
      makeHanchan(1, 30000, 2000),
      makeHanchan(2, 25000, 250),
      makeHanchan(4, 20000, -1500),
    ]
    const kpi = calcKpi(hanchans, [basePreset])
    expect(kpi.hanchanCount).toBe(3)
    expect(kpi.totalProfit).toBeCloseTo(750)
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
