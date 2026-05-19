'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  summarizePerParticipant,
  calculatePoolFlows,
  calculateProfitsForHanchan,
  calculateRank,
  formatElapsed,
} from '@/lib/calculations'
import type { Preset, Session, Hanchan, ParticipantSummary, PoolFlow } from '@/lib/types'

type Props = { session: Session & { preset: Preset }; hanchans: Hanchan[] }

// design canvas 由来のテーマ（oklch + 半透明白を基調にしたダーク）
const T = {
  bg: '#0a0a0c',
  surface: '#15151a',
  surface2: '#1d1d24',
  surface3: '#262630',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.12)',
  text: '#f5f5f7',
  textSub: 'rgba(245,245,247,0.58)',
  textDim: 'rgba(245,245,247,0.36)',
  pos: 'oklch(0.78 0.17 152)',
  neg: 'oklch(0.72 0.20 22)',
  shop: 'oklch(0.82 0.14 75)',
  shopSoft: 'oklch(0.82 0.14 75 / 0.14)',
  me: 'oklch(0.80 0.13 220)',
  font: '"Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",-apple-system,BlinkMacSystemFont,system-ui,sans-serif',
  mono: '"SF Mono","JetBrains Mono",ui-monospace,Menlo,monospace',
}

const yen = (n: number) => {
  const abs = Math.abs(n).toLocaleString('ja-JP')
  if (n > 0) return `+${abs}円`
  if (n < 0) return `−${abs}円`
  return '0円'
}

export function SetResult({ session, hanchans }: Props) {
  const preset = session.preset
  const participants = session.participants ?? []
  const summaries = summarizePerParticipant(session, hanchans, preset)
  const totalFee = session.total_fee ?? 0
  const collector = participants[0] ?? '自分'

  const pool = calculatePoolFlows(summaries, totalFee)
  const sortedByNet = [...summaries].sort((a, b) => b.netProfit - a.netProfit)

  return (
    <div
      style={{
        background: T.bg,
        color: T.text,
        minHeight: '100vh',
        fontFamily: T.font,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {/* ヘッダ */}
      <div style={{ padding: '8px 20px 14px', borderBottom: `1px solid ${T.border}` }}>
        <Link
          href="/"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            color: T.textSub, fontSize: 13, marginBottom: 4, textDecoration: 'none',
          }}
        >
          <ChevronLeft size={16} />戻る
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', margin: 0 }}>セット結果</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 11, color: T.textDim, flexWrap: 'wrap' }}>
          <span style={{ color: T.textSub }}>{session.set_name ?? preset.name}</span>
          <span>·</span><span>{hanchans.length}半荘</span>
          <span>·</span><span>{formatElapsed(session.started_at, session.ended_at ?? undefined)}</span>
        </div>
      </div>

      {/* 場の流れ */}
      <div style={{ padding: '14px 16px 4px' }}>
        <SectionHead title="場の流れ" right="1000円単位" />
        <div
          style={{
            background: `radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.05), transparent 60%), ${T.surface}`,
            border: `1px solid ${T.border}`,
            borderRadius: 18,
            padding: '14px 8px 12px',
          }}
        >
          <PoolDiagram inflows={pool.inflows} outflows={pool.outflows} poolTotal={pool.poolTotal} />
          {totalFee > 0 && (
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 6,
                padding: '6px 10px', background: T.shopSoft, borderRadius: 8,
                fontSize: 11, color: T.shop,
              }}
            >
              <span>🏠</span>
              <span>代表 <strong style={{ fontWeight: 700 }}>{collector}</strong> が場の現金を管理</span>
            </div>
          )}
        </div>
      </div>

      {/* 全員の収支 */}
      <div style={{ padding: '18px 20px 4px' }}>
        <SectionHead title="全員の収支" right="着順順" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedByNet.map((s, idx) => (
            <DetailedRow key={s.participant} s={s} rank={idx + 1} totalHanchans={hanchans.length} />
          ))}
        </div>
      </div>

      {/* 半荘ごとの記録 */}
      <div style={{ padding: '18px 16px 8px' }}>
        <SectionHead title="半荘ごとの記録" right={`${hanchans.length}半荘`} />
        <HanchanTable hanchans={hanchans} preset={preset} participants={participants} summaries={summaries} />
      </div>

      <div style={{ padding: '8px 16px 24px' }}>
        <Link href="/">
          <Button className="w-full h-12">完了</Button>
        </Link>
      </div>
    </div>
  )
}

function SectionHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 4px', marginBottom: 10 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: 0 }}>{title}</h3>
      {right && <span style={{ fontSize: 10, color: T.textDim }}>{right}</span>}
    </div>
  )
}

function Avatar({ name, isMe, size = 28 }: { name: string; isMe?: boolean; size?: number }) {
  const letter = isMe ? '自' : name
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isMe ? T.me : T.surface3,
        color: isMe ? '#0a0a0c' : T.text,
        fontSize: size * 0.42, fontWeight: 700, flexShrink: 0,
      }}
    >
      {letter}
    </div>
  )
}

function RankMedal({ rank, size = 22 }: { rank: number; size?: number }) {
  const bg =
    rank === 1 ? T.shop :
    rank === 2 ? 'rgba(255,255,255,0.55)' :
    rank === 3 ? 'oklch(0.62 0.10 40)' : T.surface3
  const fg = rank <= 3 ? '#0a0a0c' : T.textSub
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: bg, color: fg,
        fontSize: size * 0.5, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {rank}
    </div>
  )
}

// ─── 場ダイアグラム ────────────────────────────────────────

function PoolDiagram({ inflows, outflows, poolTotal }: { inflows: PoolFlow[]; outflows: PoolFlow[]; poolTotal: number }) {
  const W = 350, H = 340
  const poolR = 50, nodeR = 26
  const pool = { x: W / 2, y: H / 2 + 6 }

  const inflowNodes = inflows.map((f, i, arr) => ({
    ...f,
    x: W / 2 + (i - (arr.length - 1) / 2) * 150,
    y: 36,
    kind: 'in' as const,
  }))
  const outflowNodes = outflows.map((f, i, arr) => ({
    ...f,
    x: W / 2 + (i - (arr.length - 1) / 2) * 125,
    y: H - 44,
    kind: 'out' as const,
  }))

  type Node = (typeof inflowNodes)[number] | (typeof outflowNodes)[number]

  const lineToPool = (node: Node) => {
    const dx = pool.x - node.x, dy = pool.y - node.y
    const len = Math.sqrt(dx * dx + dy * dy)
    const ux = dx / len, uy = dy / len
    const ax = node.x + ux * (nodeR + 3), ay = node.y + uy * (nodeR + 3)
    const bx = pool.x - ux * (poolR + 3), by = pool.y - uy * (poolR + 3)
    const t = 0.42
    return { ax, ay, bx, by, lx: ax + (bx - ax) * t, ly: ay + (by - ay) * t }
  }
  const lineFromPool = (node: Node) => {
    const dx = node.x - pool.x, dy = node.y - pool.y
    const len = Math.sqrt(dx * dx + dy * dy)
    const ux = dx / len, uy = dy / len
    const ax = pool.x + ux * (poolR + 3), ay = pool.y + uy * (poolR + 3)
    const bx = node.x - ux * (nodeR + 3), by = node.y - uy * (nodeR + 3)
    const t = 0.58
    return { ax, ay, bx, by, lx: ax + (bx - ax) * t, ly: ay + (by - ay) * t }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: H }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <marker id="m-in" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L8 4 L0 8 Z" fill={T.neg} />
          </marker>
          <marker id="m-out" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L8 4 L0 8 Z" fill={T.pos} />
          </marker>
          <marker id="m-shop" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L8 4 L0 8 Z" fill={T.shop} />
          </marker>
          <radialGradient id="poolGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        {inflowNodes.map(node => {
          const l = lineToPool(node)
          return (
            <g key={`l-in-${node.pid}`}>
              <line x1={l.ax} y1={l.ay} x2={l.bx} y2={l.by} stroke={T.neg} strokeWidth={2.4} markerEnd="url(#m-in)" />
              <ArrowLabel x={l.lx} y={l.ly} text={`${node.amount.toLocaleString()}円`} color={T.neg} />
            </g>
          )
        })}

        {outflowNodes.map(node => {
          const l = lineFromPool(node)
          const isShop = !!node.isShop
          const color = isShop ? T.shop : T.pos
          return (
            <g key={`l-out-${node.pid}`}>
              <line
                x1={l.ax} y1={l.ay} x2={l.bx} y2={l.by}
                stroke={color} strokeWidth={2.4}
                strokeDasharray={isShop ? '4 3' : 'none'}
                markerEnd={isShop ? 'url(#m-shop)' : 'url(#m-out)'}
              />
              <ArrowLabel x={l.lx} y={l.ly} text={`${node.amount.toLocaleString()}円`} color={color} />
            </g>
          )
        })}

        <circle cx={pool.x} cy={pool.y} r={poolR + 10} fill="url(#poolGlow)" />
        <circle cx={pool.x} cy={pool.y} r={poolR} fill={T.surface2} stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
        <text x={pool.x} y={pool.y - 12} textAnchor="middle" fontSize="10" fill={T.textDim} fontWeight="600" letterSpacing="0.18em">場</text>
        <text x={pool.x} y={pool.y + 9} textAnchor="middle" fontSize="17" fill={T.text} fontWeight="700" fontFamily={T.mono} letterSpacing="-0.01em">
          {poolTotal.toLocaleString()}
        </text>
        <text x={pool.x} y={pool.y + 24} textAnchor="middle" fontSize="9" fill={T.textDim}>円・合計</text>
      </svg>

      {inflowNodes.map(n => <PoolNode key={`n-in-${n.pid}`} {...n} />)}
      {outflowNodes.map(n => <PoolNode key={`n-out-${n.pid}`} {...n} />)}
    </div>
  )
}

function ArrowLabel({ x, y, text, color }: { x: number; y: number; text: string; color: string }) {
  return (
    <text
      x={x} y={y + 4} textAnchor="middle"
      fontSize="11" fontWeight="700" fontFamily={T.mono}
      fill={color}
      stroke={T.bg} strokeWidth="4" paintOrder="stroke"
      style={{ letterSpacing: '-0.02em' }}
    >
      {text}
    </text>
  )
}

function PoolNode({ name, x, y, kind, isShop }: PoolFlow & { x: number; y: number; kind: 'in' | 'out' }) {
  const size = 52
  const isIn = kind === 'in'
  const isMe = name === '自分'
  const baseColor = isShop ? T.shop : isIn ? T.neg : T.pos

  return (
    <div
      style={{
        position: 'absolute',
        left: x, top: y,
        transform: 'translate(-50%, -50%)',
        width: size + 22,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: size, height: size, borderRadius: '50%',
          background: isShop ? T.shopSoft : isMe ? 'oklch(0.80 0.13 220 / 0.14)' : T.surface2,
          border: `2px solid ${baseColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: isShop ? T.shop : isMe ? T.me : T.text,
          fontWeight: 700, fontSize: isShop ? 20 : 16,
        }}
      >
        {isShop ? '🏠' : isMe ? '自' : name}
      </div>
      <div style={{ fontSize: 11, color: isShop ? T.shop : isMe ? T.me : T.text, fontWeight: 600 }}>{name}</div>
    </div>
  )
}

// ─── 詳細サマリ行 ──────────────────────────────────────────

function DetailedRow({ s, rank, totalHanchans }: { s: ParticipantSummary; rank: number; totalHanchans: number }) {
  const isMe = s.participant === '自分'
  const avgRank = s.ranks.length > 0 ? s.ranks.reduce((a, b) => a + b, 0) / s.ranks.length : 0
  return (
    <div
      style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <RankMedal rank={rank} />
        <Avatar name={s.participant} isMe={isMe} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{s.participant}</div>
          <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>
            平均着順 <span style={{ color: T.textSub, fontWeight: 600 }}>{avgRank.toFixed(2)}</span>位 · {totalHanchans}半荘
          </div>
        </div>
        <div
          style={{
            fontSize: 22, fontWeight: 700,
            color: s.netProfit >= 0 ? T.pos : T.neg,
            letterSpacing: '-0.01em',
          }}
        >
          {yen(s.netProfit)}
        </div>
      </div>

      <div
        style={{
          padding: '10px 12px', borderRadius: 10,
          background: 'rgba(255,255,255,0.025)',
          fontSize: 12,
          display: 'flex', flexDirection: 'column', gap: 5,
        }}
      >
        <BreakdownRow label="半荘収支" value={s.scoreProfit} />
        <BreakdownRow label={`チップ (${s.chipCount >= 0 ? '+' : ''}${s.chipCount}枚)`} value={s.chipProfit} />
        <BreakdownRow label={`場代負担 (${s.topCount}半荘で1位)`} value={-s.feeShare} />
        <div style={{ height: 1, background: T.border, margin: '3px 0' }} />
        <BreakdownRow label="正味" value={s.netProfit} bold />
      </div>
    </div>
  )
}

function BreakdownRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ color: bold ? T.text : T.textSub, fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span
        style={{
          color: value > 0 ? T.pos : value < 0 ? T.neg : T.textDim,
          fontWeight: bold ? 700 : 600,
          letterSpacing: '-0.01em',
        }}
      >
        {value === 0 ? '±0円' : yen(value)}
      </span>
    </div>
  )
}

// ─── 半荘ごとの記録テーブル ────────────────────────────────

function HanchanTable({
  hanchans, preset, participants, summaries,
}: {
  hanchans: Hanchan[]
  preset: Preset
  participants: string[]
  summaries: ParticipantSummary[]
}) {
  const summaryByName = new Map(summaries.map(s => [s.participant, s]))

  return (
    <div
      style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      {/* ヘッダ行（アバター） */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `28px repeat(${participants.length}, 1fr)`,
          padding: '8px 10px',
          background: T.surface2,
          borderBottom: `1px solid ${T.border}`,
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 10, color: T.textDim, fontWeight: 600, letterSpacing: '0.05em' }}>#</span>
        {participants.map(name => (
          <div key={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <Avatar name={name} isMe={name === '自分'} size={22} />
            <span style={{ fontSize: 10, color: T.textSub, fontWeight: 600 }}>{name}</span>
          </div>
        ))}
      </div>

      {hanchans.map((h, i) => {
        const profits = calculateProfitsForHanchan(h.scores, preset)
        return (
          <div
            key={h.id}
            style={{
              display: 'grid',
              gridTemplateColumns: `28px repeat(${participants.length}, 1fr)`,
              padding: '10px 10px',
              alignItems: 'center',
              borderBottom: i < hanchans.length - 1 ? `1px solid ${T.border}` : 'none',
              background: i % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent',
            }}
          >
            <span style={{ fontSize: 11, color: T.textDim, fontWeight: 600 }}>{i + 1}</span>
            {participants.map(name => {
              const seatIdx = h.participants_per_seat?.indexOf(name) ?? -1
              if (seatIdx === -1) {
                return (
                  <div key={name} style={{ display: 'flex', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, color: T.textDim }}>—</span>
                  </div>
                )
              }
              const rank = calculateRank(h.scores, seatIdx)
              const profit = profits[seatIdx]
              return (
                <div key={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <RankMedal rank={rank} size={16} />
                  <span
                    style={{
                      fontSize: 11, fontWeight: 600,
                      color: profit > 0 ? T.pos : profit < 0 ? T.neg : T.textDim,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {profit === 0 ? '±0' : `${profit > 0 ? '+' : '−'}${Math.abs(profit / 1000).toFixed(1)}`}
                  </span>
                </div>
              )
            })}
          </div>
        )
      })}

      {/* フッタ（参加者ごとの半荘収支合計） */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `28px repeat(${participants.length}, 1fr)`,
          padding: '10px 10px',
          background: 'rgba(255,255,255,0.03)',
          borderTop: `1px solid ${T.borderStrong}`,
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 10, color: T.textDim, fontWeight: 700 }}>計</span>
        {participants.map(name => {
          const s = summaryByName.get(name)
          const total = s?.scoreProfit ?? 0
          return (
            <div key={name} style={{ display: 'flex', justifyContent: 'center' }}>
              <span
                style={{
                  fontSize: 12, fontWeight: 700,
                  color: total > 0 ? T.pos : total < 0 ? T.neg : T.textDim,
                  letterSpacing: '-0.01em',
                }}
              >
                {total === 0 ? '±0' : `${total > 0 ? '+' : '−'}${Math.abs(total).toLocaleString('ja-JP')}`}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ padding: '8px 12px', fontSize: 10, color: T.textDim, background: 'rgba(255,255,255,0.02)' }}>
        ※ スコアは千点単位（例: +1.2 = +1,200円）
      </div>
    </div>
  )
}
