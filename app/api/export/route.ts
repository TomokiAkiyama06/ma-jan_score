import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateProfit } from '@/lib/calculations'
import type { Hanchan, Preset, Session } from '@/lib/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: hanchansData }, { data: presetsData }] = await Promise.all([
    supabase
      .from('hanchans')
      .select('*, session:sessions(*, preset:presets(*))')
      .eq('user_id', user.id)
      .order('played_at', { ascending: true }),
    supabase.from('presets').select('*').eq('user_id', user.id),
  ])

  const hanchans = (hanchansData ?? []) as (Hanchan & { session: Session & { preset: Preset } })[]
  const presets = (presetsData ?? []) as Preset[]
  const presetMap = new Map(presets.map(p => [p.id, p]))

  const header = '日時,ルール,着順,素点,収支(円),チップ枚数,メモ'
  const rows = hanchans.map(h => {
    const preset = h.session?.preset ?? presetMap.get(h.session?.preset_id ?? '')
    const profit = preset ? calculateProfit(h, preset) : 0
    const date = new Date(h.played_at).toLocaleString('ja-JP')
    return [
      `"${date}"`,
      `"${preset?.name ?? ''}"`,
      h.my_rank,
      h.scores[h.my_seat_index],
      Math.round(profit),
      h.chip_count,
      `"${h.notes ?? ''}"`,
    ].join(',')
  })

  const csv = [header, ...rows].join('\n')
  const bom = '﻿'

  return new NextResponse(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mahjong_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
