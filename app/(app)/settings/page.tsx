import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LogoutButton } from './logout-button'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="px-4 pt-6 space-y-6">
      <h1 className="text-2xl font-bold text-zinc-50">設定</h1>

      <div className="rounded-xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800">
        <div className="p-4">
          <p className="text-xs text-zinc-500 mb-1">アカウント</p>
          <p className="text-zinc-200 text-sm">{user.email}</p>
        </div>
      </div>

      <LogoutButton />
    </div>
  )
}
