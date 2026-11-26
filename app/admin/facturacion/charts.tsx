'use client'
/** Gráficos de Facturación: mismo dibujo SVG que la maqueta aprobada (stacked, hbars y antigüedad). */
import { eur } from '@/components/io-ui/kit'
import { MES3, fmtK } from './model'

function stepFor(max: number): number {
  for (const s of [5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000, 1000000]) if (max / s <= 6) return s
  return 1000000
}

export function Stacked({ series, colors, line, lineLabel, n, dimLast, onPick, label }: { series: number[][]; colors: string[]; line?: (number | null)[]; lineLabel?: string; n: number; dimLast?: boolean; onPick?: (i: number) => void; label: string }) {
  const W = 900, H = 260, pl = 48, pb = 26, pt = 10
  const cut = series.map(s => s.slice(0, n))
  const tot = Array.from({ length: n }, (_, i) => cut.reduce((a, s) => a + (s[i] || 0), 0))
  const peak = Math.max(0, ...tot, ...((line ?? []).slice(0, n).map(v => v ?? 0)))
  const step = stepFor(peak || 1)
  const max = Math.max(step, Math.ceil(peak / step) * step)
  const bw = (W - pl) / Math.max(1, n)
  const grid: React.ReactNode[] = []
  for (let v = 0; v <= max; v += step) { const y = H - pb - (H - pb - pt) * v / max; grid.push(<g key={v}><line x1={pl} x2={W} y1={y} y2={y} stroke="var(--line)" /><text x={pl - 6} y={y + 4} textAnchor="end">{fmtK(v)}</text></g>) }
  const bars: React.ReactNode[] = []
  for (let i = 0; i < n; i++) {
    let y = H - pb; const x = pl + i * bw + bw * .18, w = bw * .64
    cut.forEach((s, j) => { const h = (H - pb - pt) * (s[i] || 0) / max; y -= h; bars.push(<rect key={`${i}-${j}`} x={x} y={y} width={w} height={h} fill={colors[j]} opacity={dimLast && i === n - 1 ? .55 : undefined} style={onPick ? { cursor: 'pointer' } : undefined} onClick={onPick ? () => onPick(i) : undefined}><title>{`${MES3[i]}: ${eur(s[i] || 0)}`}</title></rect>) })
    bars.push(<text key={`t${i}`} x={x + w / 2} y={y - 4} textAnchor="middle" style={{ fill: 'var(--fg)' }}>{tot[i] > 0 ? fmtK(tot[i]) : ''}</text>, <text key={`m${i}`} x={x + w / 2} y={H - 8} textAnchor="middle">{MES3[i]}</text>)
  }
  let path = ''; const dots: React.ReactNode[] = []
  if (line) line.slice(0, n).forEach((v, i) => { if (v === null) return; const x = pl + i * bw + bw / 2, y = H - pb - (H - pb - pt) * v / max; path += (path ? 'L' : 'M') + x + ',' + y; dots.push(<circle key={i} cx={x} cy={y} r={3} fill="var(--good)"><title>{`${lineLabel ?? 'Remesado'} ${MES3[i]}: ${eur(v)}`}</title></circle>) })
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>{grid}{bars}{path && <path d={path} fill="none" stroke="var(--good)" strokeWidth={2} />}{dots}</svg>
}

export type HRow = { label: string; value: number; color?: string; onClick?: () => void }
export function HBarsF({ rows, color, label }: { rows: HRow[]; color: string; label: string }) {
  const W = 560, rh = 24, pl = 170
  const max = Math.max(1, ...rows.map(r => r.value))
  return <svg viewBox={`0 0 ${W} ${rows.length * rh + 8}`} role="img" aria-label={label}>{rows.map((r, i) => {
    const y = i * rh + 4, w = (W - pl - 70) * r.value / max
    const name = r.label.length > 26 ? `${r.label.slice(0, 25)}…` : r.label
    return <g key={r.label} style={r.onClick ? { cursor: 'pointer' } : undefined} onClick={r.onClick}><title>{`${r.label}: ${eur(r.value)}`}</title><text x={pl - 8} y={y + 14} textAnchor="end" style={{ fill: 'var(--fg)' }}>{name}</text><rect x={pl} y={y + 3} width={Math.max(0, w)} height={15} rx={3} fill={r.color || color} /><text x={pl + w + 6} y={y + 14}>{fmtK(r.value)}</text></g>
  })}</svg>
}

export function AgeChart({ buckets }: { buckets: { tramo: string; real: number; sin: number }[] }) {
  const W = 560, H = 220, pl = 44, pb = 26
  const peak = Math.max(1, ...buckets.map(b => b.real + b.sin))
  const step = stepFor(peak); const max = Math.max(step, Math.ceil(peak / step) * step)
  const bw = (W - pl) / buckets.length
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Antigüedad de lo no confirmado">
    {[0, .5, 1].map(t => { const y = H - pb - (H - pb - 10) * t; return <g key={t}><line x1={pl} x2={W} y1={y} y2={y} stroke="var(--line)" /><text x={pl - 6} y={y + 4} textAnchor="end">{fmtK(max * t)}</text></g> })}
    {buckets.map((b, i) => {
      const x = pl + i * bw + bw * .15, w = bw * .7, hr = (H - pb - 10) * b.real / max, hs = (H - pb - 10) * b.sin / max, v = b.real + b.sin
      return <g key={b.tramo}><title>{`${b.tramo}: por confirmar ${eur(b.real)} · sin extracto ${eur(b.sin)}`}</title>
        {b.real > 0 && <rect x={x} y={H - pb - hr} width={w} height={hr} rx={2} fill="var(--warn)" />}
        {b.sin > 0 && <rect x={x} y={H - pb - hr - hs} width={w} height={hs} rx={2} fill="var(--before)" />}
        {v > 0 && <text x={x + w / 2} y={H - pb - hr - hs - 4} textAnchor="middle" style={{ fill: 'var(--fg)' }}>{fmtK(v)}</text>}
        <text x={x + w / 2} y={H - 8} textAnchor="middle">{b.tramo.replace(' días', '').replace('Más de 1 año', '+1 año')}</text></g>
    })}
  </svg>
}
