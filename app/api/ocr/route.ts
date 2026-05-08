import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const client = new Anthropic()

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 20 * 1024 * 1024

const OCR_PROMPT = `この画像は全自動麻雀卓の最終得点表示です。
卓を上から（または斜め上から）撮影しており、撮影者は卓の南側（画像の下側）に座っています。

【タスク】
4人分の最終得点（持ち点）を読み取り、各得点が画像内のどの方向にあるかを判定して、JSON形式のみで返してください。説明文・コメントは一切不要です。

【出力形式】
{
  "scores": [
    {"value": 25000, "position": "south"},
    {"value": 30000, "position": "west"},
    {"value": 20000, "position": "north"},
    {"value": 25000, "position": "east"}
  ],
  "confidence": "high|medium|low"
}

【読み取りルール】
- value は整数のみ（カンマ・スペース・小数点・記号なし）
- 読み取れない・不明確な場合は value を null にする
- position は画像内の表示位置（south=画像下側、north=上側、west=左、east=右）
- 撮影者は通常 south 側に座るため、south の得点が自分の点数になる

【得点の特徴】
- 4人の合計は通常 100,000点（10万点）
- 各得点は通常 0〜50,000点の範囲（マイナスになることもある）
- 得点は 100点単位（末尾2桁は常に 00）
- 例: 25000, 31200, 18400, 25400 など

【confidenceの基準】
- high: 4つ全て明確に読み取れ、合計が 100,000点に近い
- medium: 一部が不鮮明だが推定できる、または合計が多少ずれる
- low: 画像が不鮮明/傾いている/合計が大きくずれる/1つ以上が null

必ずJSONのみを返してください。`

async function callOcr(
  base64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
  retryPrompt = false
) {
  const prompt = retryPrompt
    ? OCR_PROMPT + '\n\n【再試行】前回の読み取りに自信がありません。数字を1つずつ丁寧に確認してください。特に似た数字（1と7、6と8など）に注意してください。'
    : OCR_PROMPT

  return client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  })
}

function parseOcrResponse(text: string) {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found')
  const parsed = JSON.parse(jsonMatch[0])

  // 旧形式 (scores が数値配列) との後方互換
  if (Array.isArray(parsed.scores) && typeof parsed.scores[0] === 'number') {
    const positions = ['south', 'west', 'north', 'east']
    parsed.scores = parsed.scores.map((v: number, i: number) => ({
      value: v,
      position: positions[i] ?? 'south',
    }))
  }

  // 末尾2桁を00に補正（100点単位の丸め）
  if (Array.isArray(parsed.scores)) {
    parsed.scores = parsed.scores.map((s: { value: number | null; position: string }) => ({
      ...s,
      value: s.value !== null && typeof s.value === 'number'
        ? Math.round(s.value / 100) * 100
        : s.value,
    }))
  }

  return parsed
}

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

  try {
    // 1回目
    const message = await callOcr(base64, mediaType, false)
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const result = parseOcrResponse(text)

    // confidence が low の場合はリトライ
    if (result.confidence === 'low') {
      try {
        const retryMessage = await callOcr(base64, mediaType, true)
        const retryText = retryMessage.content[0].type === 'text' ? retryMessage.content[0].text : ''
        const retryResult = parseOcrResponse(retryText)

        // リトライ結果が medium 以上なら採用、そうでなければ元の結果を返す
        if (retryResult.confidence !== 'low') {
          return NextResponse.json(retryResult)
        }
      } catch {
        // リトライ失敗は無視して元の結果を返す
      }
    }

    return NextResponse.json(result)
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
