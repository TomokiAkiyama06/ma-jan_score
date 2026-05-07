import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const client = new Anthropic()

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('image')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 })
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `この画像は全自動麻雀卓の最終得点表示です。
卓を上から（または斜め上から）撮影した画像で、撮影者は卓の南側（画像下側）に座っています。

4人分の最終得点を抽出し、各得点が画像内のどの位置（north/east/south/west）にあるかを判定してJSON形式のみで返してください。説明文は不要です。

出力形式:
{
  "scores": [
    {"value": 25000, "position": "south"},
    {"value": 30000, "position": "west"},
    {"value": 20000, "position": "north"},
    {"value": 25000, "position": "east"}
  ],
  "confidence": "high|medium|low"
}

ルール:
- value は整数（カンマ・スペース・記号なし）
- 読み取れない場合 value は null
- position は画像内の表示位置に基づく（south=画像下端側、north=上端側、west=左、east=右）
- 撮影者は通常 south 側に座る
- 4人麻雀の点数合計は通常100,000点。大きく異なる場合は confidence を low に`,
          },
        ],
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    const parsed = JSON.parse(jsonMatch[0])

    // レスポンスを正規化（旧形式との互換性）
    if (Array.isArray(parsed.scores) && typeof parsed.scores[0] === 'number') {
      // 旧形式 [25000, 30000, ...] → 新形式に変換
      const positions = ['south', 'west', 'north', 'east']
      parsed.scores = parsed.scores.map((v: number, i: number) => ({
        value: v,
        position: positions[i] ?? 'south',
      }))
    }

    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({
      scores: [
        { value: null, position: 'south' },
        { value: null, position: 'west' },
        { value: null, position: 'north' },
        { value: null, position: 'east' },
      ],
      confidence: 'low',
    })
  }
}
