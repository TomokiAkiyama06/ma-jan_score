import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SetStartForm } from './set-start-form'
import type { Preset } from '@/lib/types'

export default async function SetNewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('presets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at')

  const presets = (data ?? []) as Preset[]

  return <SetStartForm presets={presets} userId={user.id} />
}
