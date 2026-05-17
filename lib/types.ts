export type Preset = {
  id: string
  user_id: string
  name: string
  rate: number
  uma_first: number
  uma_second: number
  uma_third: number
  uma_fourth: number
  starting_score: number
  return_score: number
  oka_enabled: boolean
  chip_rate: number
  seat_change_interval: number | null
  hako_shita_enabled: boolean
  is_default: boolean
  created_at: string
}

export type Session = {
  id: string
  user_id: string
  preset_id: string
  mode: 'free' | 'set'
  started_at: string
  ended_at: string | null
  location_memo: string | null
  // セットモード専用
  set_name?: string | null
  participants?: string[] | null
  hourly_rate?: number | null
  reserve_fee?: number | null
  chip_rate?: number | null
  total_fee?: number | null
  participant_chips?: Record<string, number> | null
  created_at: string
  preset?: Preset
}

export type Hanchan = {
  id: string
  user_id: string
  session_id: string
  played_at: string
  scores: number[]
  my_seat_index: number
  my_rank: number
  participants_per_seat: string[] | null
  chip_count: number
  photo_url: string | null
  notes: string | null
  created_at: string
  session?: Session
}

export type HanchanWithProfit = Hanchan & { profit: number }

// OCR レスポンス（位置情報付き）
export type OcrPosition = 'north' | 'east' | 'south' | 'west'

export type OcrScore = {
  value: number | null
  position: OcrPosition
}

export type OcrResult = {
  scores: OcrScore[]
  confidence: 'high' | 'medium' | 'low'
}

// 統計・集計
export type KpiStats = {
  totalProfit: number
  hanchanCount: number
  avgRank: number
  topRate: number
  lastRate: number
  avgScore: number
  totalChips: number
  totalChipProfit: number
}

export type MonthlyStats = {
  month: string
  profit: number
  count: number
}

export type RankDistribution = {
  rank: number
  count: number
  rate: number
}

export type PresetStats = {
  presetId: string
  presetName: string
  profit: number
  count: number
}

export type CumulativePoint = {
  index: number
  date: string
  cumulative: number
  profit: number
}

// セットモード
export type ParticipantSummary = {
  participant: string
  scoreProfit: number
  chipCount: number
  chipProfit: number
  feeShare: number
  netProfit: number
  hanchanCount: number
  ranks: number[]
  topCount: number
}

export type Transfer = {
  from: string
  to: string
  amount: number
}

export type SetSummary = {
  session: Session
  hanchans: Hanchan[]
  summaries: ParticipantSummary[]
  transfers: Transfer[]
  totalFee: number
  elapsedMinutes: number
}
