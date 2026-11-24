'use client';
/* Gráficos de maqueta_rentabilidad_aprobada.html portados a React sin cambiar el dibujo:
   trend(), rank(), spark() y heat(). Las fracciones (0,25 = 25 %) son las de la maqueta. */
import { eur, MESES } from '@/components/io-ui/kit';
import type { ReactNode } from 'react';

export const frac = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v / 100);
export const mg = (i: number | null, c: number | null) => (i && c != null ? (i - c) / i : null);
const pctF = (v: number | null, d = 1) => (v == null || !Number.isFinite(v) ? '—' : (v < 0 ? '−' : '') + Math.abs(v * 100).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %');
export const cls = (m: number | null) => (m == null ? 'ok' : m < 0 ? 'bad' : m < 0.2 ? 'low' : 'ok');
export const Chip = ({ m }: { m: number | null }) => <span className={`m ${cls(m)}`}>{pctF(m)}</span>;

export type MV = { i: number | null; c: number | null; e: number; forecast: boolean };

export function Trend({ data, cur }: { data: MV[]; cur: number }) {
  const W = 760, H = 260, pl = 48, pr = 44, pt = 16, pb = 30, n = 12, cw = (W - pl - pr) / n;
  const max = (Math.max(1, ...data.map(d => Math.max(d.i ?? 0, d.c ?? 0)))) * 1.1;
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / max), y2 = (v: number) => pt + (H - pt - pb) * (1 - (v + 0.2) / 1);
  const o: ReactNode[] = [];
  for (let g = 0; g <= 4; g++) { const v = max * g / 4; o.push(<g key={`g${g}`}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 4} textAnchor="end">{Math.round(v / 1000)}k</text></g>); }
  for (const v of [0, 0.4, 0.8]) o.push(<text key={`p${v}`} x={W - pr + 6} y={y2(v) + 4}>{pctF(v, 0)}</text>);
  let line = ''; const dots: ReactNode[] = [];
  data.forEach((d, k) => {
    const x = pl + k * cw, bw = cw * 0.34, fc = d.forecast ? 0.45 : undefined;
    if (d.i != null) o.push(<rect key={`i${k}`} x={x + cw * 0.14} y={y(d.i)} width={bw} height={Math.max(0, H - pb - y(d.i))} rx="2" fill="var(--before)" opacity={fc} />);
    if (d.c != null) o.push(<rect key={`c${k}`} x={x + cw * 0.14 + bw + 2} y={y(d.c)} width={bw} height={Math.max(0, H - pb - y(d.c))} rx="2" fill="var(--accent)" opacity={fc} />);
    if (d.c != null && d.e > 0 && !d.forecast) o.push(<circle key={`e${k}`} cx={x + cw * 0.14 + bw * 1.5 + 2} cy={y(d.c) - 6} r="3" fill="var(--warn)"><title>Incluye coste estimado</title></circle>);
    const mp = mg(d.i, d.c);
    if (mp != null) { line += (line ? 'L' : 'M') + (x + cw / 2) + ',' + y2(mp); dots.push(<circle key={`m${k}`} cx={pl + k * cw + cw / 2} cy={y2(mp)} r={k === cur ? 4.5 : 3} fill="var(--good)" />); }
    o.push(<text key={`t${k}`} x={x + cw / 2} y={H - 10} textAnchor="middle" className={k === cur ? 'lbl' : undefined}>{MESES[k]}</text>);
    if (k === cur) o.push(<rect key={`s${k}`} x={x + 2} y={pt - 6} width={cw - 4} height={H - pt - pb + 8} fill="none" stroke="var(--accent)" strokeDasharray="3 3" rx="4" />);
  });
  return <div className="chart" id="trend"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ingreso, coste y margen de los últimos 12 meses">{o}{line && <path d={line} fill="none" stroke="var(--good)" strokeWidth="2.5" />}{dots}</svg></div>;
}

export type RankRow = { p: string; mm: number; mp: number | null; e: number };
export function Rank({ rows, onPick }: { rows: RankRow[]; onPick: (p: string) => void }) {
  if (!rows.length) return <div className="empty">Todavía no hay productos con ingreso y coste conocidos.</div>;
  const W = 760, rh = 24, pl = 210, pr = 90, H = rows.length * rh + 10;
  const lo = Math.min(0, ...rows.map(r => r.mm)), hi = Math.max(0, ...rows.map(r => r.mm)), x = (v: number) => pl + (W - pl - pr) * (v - lo) / (hi - lo || 1);
  return <div className="chart" id="rank"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Margen por producto">
    <line x1={x(0)} x2={x(0)} y1="0" y2={H} stroke="var(--line)" strokeWidth="1.5" />
    {rows.map((r, k) => { const yy = k * rh + 4, col = r.mm < 0 ? 'var(--bad)' : (r.mp ?? 1) < 0.2 ? 'var(--warn)' : 'var(--accent)';
      return <g key={r.p} className="rowclick" onClick={() => onPick(r.p)}><rect x="0" y={yy - 2} width={W} height={rh} fill="transparent" />
        <text x={pl - 8} y={yy + 13} textAnchor="end" className="lbl">{r.p}{r.e > 0 ? ' •' : ''}</text>
        <rect x={Math.min(x(0), x(r.mm))} y={yy + 3} width={Math.max(2, Math.abs(x(r.mm) - x(0)))} height="13" rx="3" fill={col} />
        <text x={Math.max(x(0), x(r.mm)) + 6} y={yy + 14}>{eur(r.mm)} · {pctF(r.mp, 0)}</text></g>; })}
  </svg></div>;
}

/** vals: margen (fracción) por mes; null = sin dato. */
export function Spark({ vals, cur }: { vals: (number | null)[]; cur: number }) {
  const v = vals.map(x => (x == null ? null : Math.max(-1, Math.min(1, x))));
  const W = 96, H = 24, x = (k: number) => k * (W / 11), y = (a: number) => H / 2 - (a * H / 2.2);
  let d = ''; let pen = false; v.forEach((a, k) => { if (a == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(k).toFixed(1) + ',' + y(a).toFixed(1); pen = true; });
  const c = v[cur];
  return <svg className="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--line)" /><path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" />{c != null && <circle cx={x(cur)} cy={y(c)} r="2.5" fill="var(--accent)" />}</svg>;
}

export type HeatRow = { name: string; cells: { m: number | null; est: boolean }[] };
export function Heat({ rows, total, cur, months }: { rows: HeatRow[]; total: (number | null)[]; cur: number; months: string[] }) {
  const col = (m: number | null) => (m == null ? 'transparent' : m < 0 ? 'var(--bad-soft)' : m < 0.2 ? 'var(--warn-soft)' : 'var(--good-soft)');
  const tc = (m: number | null) => (m == null ? 'var(--muted)' : m < 0 ? 'var(--bad)' : m < 0.2 ? 'var(--warn)' : 'var(--good)');
  return <table className="heat"><thead><tr><th>Producto</th>{months.map(x => <th key={x} className="n">{x}</th>)}</tr></thead><tbody>
    {rows.map(r => <tr key={r.name}><td>{r.name}</td>{r.cells.map((c, k) => <td key={k} className="h" style={{ background: col(c.m), color: tc(c.m), ...(k === cur ? { outline: '2px solid var(--accent)', outlineOffset: -2 } : {}) }}>{c.m == null ? '·' : (c.m < -9.99 ? '−∞' : Math.round(c.m * 100) + ' %') + (c.est ? ' •' : '')}</td>)}</tr>)}
    <tr className="tot"><td>Total</td>{total.map((m, k) => <td key={k} className="h"><Chip m={m} /></td>)}</tr></tbody></table>;
}
