'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function ExportButton() {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    setLoading(true)
    try {
      const res = await fetch('/api/export')
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mahjong_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSVをダウンロードしました')
    } catch {
      toast.error('エクスポートに失敗しました')
    }
    setLoading(false)
  }

  return (
    <Button
      variant="outline"
      className="w-full h-12 border-zinc-700 text-zinc-300 hover:text-zinc-50 gap-2"
      onClick={handleExport}
      disabled={loading}
    >
      <Download size={16} />
      {loading ? 'エクスポート中...' : 'CSVエクスポート'}
    </Button>
  )
}
