import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PresetList } from './preset-list'
import type { Preset } from '@/lib/types'

export default async function PresetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('presets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at')

  const presets = (data ?? []) as Preset[]

  return (
    <div className="px-4 pt-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-50">ルール設定</h1>
      </div>
      <PresetList presets={presets} userId={user.id} />
    </div>
  )
}
