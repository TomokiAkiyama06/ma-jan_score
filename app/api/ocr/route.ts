import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const client = new Anthropic()

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 20 * 1024 * 1024

const OCR_PROMPT = `この画像は全自動麻雀卓（AMOS REXX IIIなど）の得点表示パネルです。
プレイヤーが自分の手前側にあるパネルを撮影しています。

【south（自分の得点）の見分け方 ★最重要★】
パネルには以下の2種類の表示エリアがあります：

(A) メイン表示 ＝ 撮影者自身（south）の得点
    - 他より物理的に大きいLEDディスプレイ
    - 「万」「千」「百」などの桁ラベルが表示の下または横にある
    - パネルの中央下寄りに配置されることが多い

(B) サブ表示 ×3 ＝ 対戦相手3名の得点
    - (A)より小さいLEDディスプレイ
    - 桁ラベルがない
    - パネル上部や左右に配置される

まず (A) を見つけてその値を south に割り当ててください。
(B) の3つは大きい数字の上側 → north、左 → west、右 → east に割り当てます。

【数字の読み取りと変換】
表示は「万・千・百」単位のため、読み取った4桁の表示値 × 100 = 実際の点数です。
  表示 0450 → 45,000点
  表示 0250 → 25,000点
  表示 0050 →  5,000点

【出力形式】JSONのみ。説明文不要。
{
  "scores": [
    {"value": 45000, "position": "south"},
    {"value": 25000, "position": "north"},
    {"value": 25000, "position": "east"},
    {"value": 5000, "position": "west"}
  ],
  "confidence": "high|medium|low"
}

【注意事項】
- value は ×100 変換後の整数（例: 45000）
- 4人の合計は通常 100,000点。大きくずれる場合 confidence を low に
- 7セグメントLEDの誤読注意: 0と6と8、1と7
- 必ずJSONのみ返すこと`

const OCR_RETRY_PROMPT = OCR_PROMPT + `

【再試行】
「万・千・百」ラベルが付いているメイン表示を必ず south にしてください。
数字は1桁ずつ確認し、×100変換を忘れずに。`

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

  type ScoreEntry = { value: number | null; position: string }

  if (Array.isArray(parsed.scores)) {
    // ×100 変換: 最大値が 1000 以下なら表示値のまま返ってきたと判断
    const maxRaw = Math.max(...(parsed.scores as ScoreEntry[])
      .map(s => s.value ?? 0)
      .filter(v => v > 0))
    const needsConversion = maxRaw > 0 && maxRaw <= 1000

    parsed.scores = (parsed.scores as ScoreEntry[]).map(s => {
      if (s.value === null || typeof s.value !== 'number') return s
      const converted = needsConversion ? s.value * 100 : s.value
      return { ...s, value: Math.round(converted / 100) * 100 }
    })

    // south の割当チェック:
    // south が返ってきていない or south が null の場合、
    // 最大値の score を south に割り当て直す（メイン表示が最大の場合が多いため）
    const scores = parsed.scores as ScoreEntry[]
    const hasSouth = scores.some(s => s.position === 'south' && s.value !== null)
    if (!hasSouth) {
      const maxVal = Math.max(...scores.map(s => s.value ?? 0))
      let reassigned = false
      parsed.scores = scores.map(s => {
        if (!reassigned && s.value === maxVal) {
          reassigned = true
          return { ...s, position: 'south' }
        }
        return s
      })
      parsed.confidence = 'medium'
    }
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
