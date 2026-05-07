'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="px-4 pt-16 flex flex-col items-center gap-6 text-center">
      <div className="space-y-2">
        <p className="text-zinc-300 font-semibold">エラーが発生しました</p>
        <p className="text-zinc-500 text-sm">{error.message || '予期しないエラーが発生しました'}</p>
      </div>
      <Button onClick={reset} variant="outline" className="border-zinc-700 text-zinc-300">
        再試行
      </Button>
    </div>
  )
}
