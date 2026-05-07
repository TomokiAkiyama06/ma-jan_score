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
  is_default: boolean
  created_at: string
}

export type Session = {
  id: string
  user_id: string
  preset_id: string
  started_at: string
  ended_at: string | null
  location_memo: string | null
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
  chip_count: number
  photo_url: string | null
  notes: string | null
  created_at: string
  session?: Session
}

export type HanchanWithProfit = Hanchan & {
  profit: number
}

export type OcrResult = {
  scores: (number | null)[]
  confidence: 'high' | 'medium' | 'low'
}

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
