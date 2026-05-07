'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Preset, Session } from '@/lib/types'

type Props = {
  session: Session & { preset: Preset }
}

export function SessionControls({ session }: Props) {
  const router = useRouter()
  const [ending, setEnding] = useState(false)

  async function handleEndSession() {
    if (!confirm('セッションを終了しますか？')) return
    setEnding(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', session.id)
    if (error) {
      toast.error('セッション終了に失敗しました')
      setEnding(false)
      return
    }
    toast.success('セッションを終了しました')
    router.refresh()
  }

  const startedAt = new Date(session.started_at)
  const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 60000)
  const elapsedText = elapsed < 60
    ? `${elapsed}分前開始`
    : `${Math.floor(elapsed / 60)}時間${elapsed % 60}分前開始`

  return (
    <div className="rounded-xl bg-zinc-800/60 border border-zinc-700 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <p className="text-xs text-zinc-400">進行中のセッション</p>
          </div>
          <p className="font-semibold text-zinc-100 truncate">{session.preset?.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{elapsedText}</p>
          {session.location_memo && (
            <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
              <MapPin size={10} /> {session.location_memo}
            </p>
          )}
        </div>
        <button
          onClick={handleEndSession}
          disabled={ending}
          className="flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-700 text-zinc-300 text-xs font-medium hover:bg-zinc-600 transition-colors disabled:opacity-50"
        >
          <X size={12} />
          終了
        </button>
      </div>
    </div>
  )
}
