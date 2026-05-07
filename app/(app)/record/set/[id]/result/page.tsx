import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SetResult } from './set-result'
import type { Preset, Session, Hanchan } from '@/lib/types'

export default async function SetResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: sessionData }, { data: hanchansData }] = await Promise.all([
    supabase.from('sessions').select('*, preset:presets(*)').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('hanchans').select('*').eq('session_id', id).order('played_at', { ascending: true }),
  ])

  if (!sessionData) notFound()

  const session = sessionData as Session & { preset: Preset }
  const hanchans = (hanchansData ?? []) as Hanchan[]

  return <SetResult session={session} hanchans={hanchans} />
}
