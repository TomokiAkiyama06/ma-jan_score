import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SetRecordForm } from './set-record-form'
import type { Preset, Session, Hanchan } from '@/lib/types'

export default async function SetRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: sessionData }, { data: hanchansData }] = await Promise.all([
    supabase
      .from('sessions')
      .select('*, preset:presets(*)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('hanchans')
      .select('*')
      .eq('session_id', id)
      .order('played_at', { ascending: true }),
  ])

  if (!sessionData) notFound()

  const session = sessionData as Session & { preset: Preset }
  const hanchans = (hanchansData ?? []) as Hanchan[]

  if (session.ended_at) {
    redirect(`/record/set/${id}/result`)
  }

  return <SetRecordForm session={session} hanchans={hanchans} userId={user.id} />
}
