import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const client = new Anthropic()

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 20 * 1024 * 1024

const OCR_PROMPT = `この画像は全自動麻雀卓（AMOS REXX IIIなど）の得点表示パネルです。
プレイヤーが自分の手前側にあるパネルを撮影しています。

【パネルの構造】
- 中央の大きな数字: 撮影者自身（south）の得点
- 周囲の小さな数字3つ: 他の3プレイヤー（north・east・west）の得点
- 位置の目安: 大きい数字の上側がnorth、左がwest、右がeast

【数字の読み方】
パネルは「万・千・百」単位で表示されます。
表示値をそのまま読んだあと、×100 して実際の点数に変換してください。
例:
  表示 0450 → 実際の点数 45,000
  表示 0250 → 実際の点数 25,000
  表示 0050 → 実際の点数  5,000
  表示 0270 → 実際の点数 27,000

【変換ルール】
- 読み取った4桁の表示値 × 100 = 実際の点数（valueに入れる値）
- 4人の実際の点数の合計は通常 100,000点
- 合計が大きくずれる場合は confidence を low にする

【出力形式】JSONのみ返してください。説明文不要。
{
  "scores": [
    {"value": 45000, "position": "south"},
    {"value": 25000, "position": "north"},
    {"value": 25000, "position": "east"},
    {"value": 5000, "position": "west"}
  ],
  "confidence": "high|medium|low"
}

【注意】
- value は変換後の実際の点数（整数、例: 45000）
- 読み取れない場合は value を null
- 7セグメントLEDの誤読に注意（0と6と8、1と7など）
- 必ずJSONのみ返すこと`

const OCR_RETRY_PROMPT = OCR_PROMPT + `

【再試行】数字を1桁ずつ丁寧に確認してください。
特に注意: 0と6と8の区別、1と7の区別、×100 変換を忘れずに。`

async function callOcr(
  base64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
  retry = false
) {
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
          { type: 'text', text: retry ? OCR_RETRY_PROMPT : OCR_PROMPT },
        ],
      },
    ],
  })
}

function parseOcrResponse(text: string) {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found')
  const parsed = JSON.parse(jsonMatch[0])

  // 旧形式（scores が数値配列）との後方互換
  if (Array.isArray(parsed.scores) && typeof parsed.scores[0] === 'number') {
    const positions = ['south', 'west', 'north', 'east']
    parsed.scores = parsed.scores.map((v: number, i: number) => ({
      value: v,
      position: positions[i] ?? 'south',
    }))
  }

  // スコアが表示値のまま（100未満）の場合は×100して補正
  // 例: Claudeが 0450 をそのまま返した場合 → 45000 に変換
  if (Array.isArray(parsed.scores)) {
    parsed.scores = parsed.scores.map((s: { value: number | null; position: string }) => {
      if (s.value === null || typeof s.value !== 'number') return s
      // 最大スコアが 1000 以下なら ×100 変換が必要と判断
      const maxScore = Math.max(...parsed.scores
        .map((x: { value: number | null }) => x.value ?? 0)
        .filter((v: number) => v > 0))
      const needsConversion = maxScore <= 1000
      const converted = needsConversion ? s.value * 100 : s.value
      // 100点単位に丸める
      return { ...s, value: Math.round(converted / 100) * 100 }
    })
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
    const message = await callOcr(base64, mediaType, false)
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const result = parseOcrResponse(text)

    // confidence が low の場合はリトライ
    if (result.confidence === 'low') {
      try {
        const retryMessage = await callOcr(base64, mediaType, true)
        const retryText = retryMessage.content[0].type === 'text' ? retryMessage.content[0].text : ''
        const retryResult = parseOcrResponse(retryText)
        if (retryResult.confidence !== 'low') {
          return NextResponse.json(retryResult)
        }
      } catch {
        // リトライ失敗は無視
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
