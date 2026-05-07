import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { HanchanHistory } from './hanchan-history'
import type { Hanchan, Preset, Session } from '@/lib/types'

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: hanchansData }, { data: presetsData }] = await Promise.all([
    supabase
      .from('hanchans')
      .select('*, session:sessions(*, preset:presets(*))')
      .eq('user_id', user.id)
      .order('played_at', { ascending: false }),
    supabase.from('presets').select('*').eq('user_id', user.id),
  ])

  const hanchans = (hanchansData ?? []) as (Hanchan & { session: Session & { preset: Preset } })[]
  const presets = (presetsData ?? []) as Preset[]

  return <HanchanHistory hanchans={hanchans} presets={presets} />
}
