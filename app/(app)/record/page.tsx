import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RecordForm } from './record-form'
import type { Preset, Hanchan, Session } from '@/lib/types'
import { isNewSessionNeeded } from '@/lib/calculations'

export default async function RecordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: presetsData }, { data: lastHanchan }, { data: activeSessionData }] = await Promise.all([
    supabase.from('presets').select('*').eq('user_id', user.id).order('created_at'),
    supabase
      .from('hanchans')
      .select('played_at, session_id')
      .eq('user_id', user.id)
      .order('played_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('sessions')
      .select('*, preset:presets(*)')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1),
  ])

  const presets = (presetsData ?? []) as Preset[]
  const activeSession = activeSessionData?.[0] as (Session & { preset: Preset }) | undefined
  const needsNewSession = isNewSessionNeeded(lastHanchan?.played_at ?? null)

  return (
    <RecordForm
      presets={presets}
      userId={user.id}
      activeSession={activeSession ?? null}
      needsNewSession={needsNewSession}
    />
  )
}
