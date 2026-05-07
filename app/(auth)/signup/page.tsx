'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${location.origin}/` },
    })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('確認メールを送信しました。メールをご確認ください。')
      router.push('/login')
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 bg-zinc-950">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-zinc-50">🀄 麻雀スコア</h1>
          <p className="mt-2 text-zinc-400">新規登録</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="bg-zinc-900 border-zinc-700 text-zinc-50 placeholder:text-zinc-500 h-12"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">パスワード（8文字以上）</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
              className="bg-zinc-900 border-zinc-700 text-zinc-50 placeholder:text-zinc-500 h-12"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full h-12 text-base font-semibold">
            {loading ? '登録中...' : '新規登録'}
          </Button>
        </form>
        <p className="text-center text-zinc-400">
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-zinc-50 underline underline-offset-4">
            ログイン
          </Link>
        </p>
      </div>
    </div>
  )
}
