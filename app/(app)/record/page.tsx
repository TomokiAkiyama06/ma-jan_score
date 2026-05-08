import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RecordForm } from './record-form'
import type { Preset, Session } from '@/lib/types'
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
      .maybeSingle(),
    supabase
      .from('sessions')
      .select('*, preset:presets(*)')
      .eq('user_id', user.id)
      .eq('mode', 'free')
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1),
  ])

  const presets = (presetsData ?? []) as Preset[]
  let activeSession = activeSessionData?.[0] as (Session & { preset: Preset }) | undefined
  const needsNewSession = isNewSessionNeeded(lastHanchan?.played_at ?? null)

  // フリーモードが5時間超過していたら自動クローズ
  if (activeSession && needsNewSession) {
    await supabase
      .from('sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', activeSession.id)
    activeSession = undefined
  }

  // アクティブセッション内の半荘数（場替えリマインダー用）
  let hanchansInSession = 0
  if (activeSession && !needsNewSession) {
    const { count } = await supabase
      .from('hanchans')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', activeSession.id)
    hanchansInSession = count ?? 0
  }

  return (
    <RecordForm
      presets={presets}
      userId={user.id}
      activeSession={activeSession ?? null}
      needsNewSession={needsNewSession}
      hanchansInSession={hanchansInSession}
    />
  )
}
