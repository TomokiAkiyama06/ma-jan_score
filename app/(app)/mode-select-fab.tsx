'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, X, Zap, Users } from 'lucide-react'
import type { Session, Preset } from '@/lib/types'

type Props = {
  hasFreeSession: boolean
  freeSessionActive: (Session & { preset: Preset }) | null
}

export function ModeSelectFab({ hasFreeSession, freeSessionActive }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* オーバーレイ */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}

      <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-3">
        {open && (
          <>
            <div className="flex items-center gap-3">
              <span className="bg-zinc-800 text-zinc-200 text-xs rounded-full px-3 py-1.5 border border-zinc-700">セットモード</span>
              <Link
                href="/record/set/new"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center w-12 h-12 rounded-full bg-zinc-700 text-zinc-50 shadow-lg active:scale-95 transition-transform"
              >
                <Users size={22} />
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-zinc-800 text-zinc-200 text-xs rounded-full px-3 py-1.5 border border-zinc-700">フリーモード</span>
              <Link
                href="/record"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center w-12 h-12 rounded-full bg-zinc-700 text-zinc-50 shadow-lg active:scale-95 transition-transform"
              >
                <Zap size={22} />
              </Link>
            </div>
          </>
        )}
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center justify-center w-14 h-14 rounded-full bg-zinc-50 text-zinc-950 shadow-lg active:scale-95 transition-transform"
          aria-label="新規記録"
        >
          {open ? <X size={26} strokeWidth={2.5} /> : <Plus size={28} strokeWidth={2.5} />}
        </button>
      </div>
    </>
  )
}
