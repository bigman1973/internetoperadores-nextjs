'use client';
/* Gráficos del simulador de referencia portados tal cual (mismo SVG, mismas medidas y colores). */
import { eur, pct } from '@/components/io-ui/kit';

const p100 = (v: number | null) => (v == null || !Number.isFinite(v) ? '—' : pct(v * 100, 0));

/** Cascada del margen mensual: 760 × 250, cinco pasos. */
export function Waterfall({ m0, subida, masCoste, bajas, m1 }: { m0: number; subida: number; masCoste: number; bajas: number; m1: number }) {
  const steps: [string, number, 'base' | 'd'][] = [['Margen hoy', m0, 'base'], ['Subida de precios', subida, 'd'], ['Más coste de proveedores', masCoste, 'd'], ['Bajas estimadas', bajas, 'd'], ['Margen con el escenario', m1, 'base']];
  const W = 760, H = 250, pl = 10, pr = 10, pt = 24, pb = 44;
  const max = Math.max(m0, m1, m0 + subida, 1) * 1.08;
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / max);
  const bw = (W - pl - pr) / steps.length;
  let run = 0;
  const out: React.ReactNode[] = [];
  for (let g = 0; g <= 4; g++) { const v = max * g / 4; out.push(<line key={`g${g}`} x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" />); }
  steps.forEach(([lab, v, kind], i) => {
    const x = pl + i * bw + bw * .18, w = bw * .64; let a: number, b: number, col: string;
    if (kind === 'base') { a = 0; b = v; run = v; col = i === 0 ? 'var(--before)' : 'var(--after)'; }
    else { a = run; b = run + v; run = b; col = v >= 0 ? 'var(--good)' : 'var(--bad)'; }
    const top = y(Math.max(a, b)), h = Math.max(1, Math.abs(y(a) - y(b)));
    const lv = kind === 'base' ? eur(v) : (v >= 0 ? '+' : '') + eur(v);
    const long = lab.length > 18;
    out.push(<g key={lab}>
      <rect x={x} y={top} width={w} height={h} rx={3} fill={col} />
      <text x={x + w / 2} y={top - 7} textAnchor="middle" className="lbl">{lv}</text>
      <text x={x + w / 2} y={H - pb + 16} textAnchor="middle">{long ? lab.split(' ').slice(0, 2).join(' ') : lab}</text>
      {long && <text x={x + w / 2} y={H - pb + 30} textAnchor="middle">{lab.split(' ').slice(2).join(' ')}</text>}
    </g>);
  });
  return <div className="chart"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cascada del margen mensual">{out}</svg></div>;
}

/** Histograma de clientes por tramo de subida: 380 × 200, seis tramos. */
export function Histo({ data }: { data: { label: string; n: number }[] }) {
  const W = 380, H = 200, pb = 34, pt = 18; const max = Math.max(...data.map(d => d.n), 1), bw = W / data.length;
  return <div className="chart"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Clientes por tramo de subida">
    {data.map((d, i) => { const h = (H - pb - pt) * d.n / max, x = i * bw + bw * .15, w = bw * .7;
      return <g key={d.label}><rect x={x} y={H - pb - h} width={w} height={Math.max(h, 1)} rx={3} fill={i === 0 ? 'var(--before)' : 'var(--after)'} />
        <text x={x + w / 2} y={H - pb - h - 5} textAnchor="middle" className="lbl">{d.n}</text>
        <text x={x + w / 2} y={H - pb + 15} textAnchor="middle">{d.label.replace(/ – /g, '–')}</text></g>; })}
  </svg></div>;
}

/** Barras horizontales de margen por producto, hoy y con el escenario (dos barras por fila). */
export function ProdChart({ rows }: { rows: { name: string; m0: number | null; m1: number | null }[] }) {
  const W = 760, rowH = 26, pl = 230, pr = 60, H = rows.length * rowH + 30;
  const vals = rows.flatMap(r => [r.m0 ?? 0, r.m1 ?? 0]);
  const lo = Math.max(-1.5, Math.min(0, ...vals)), hi = 1;
  const x = (v: number) => pl + (W - pl - pr) * (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo);
  const ticks = [lo, 0, .25, .5, .75, 1].filter(v => v >= lo);
  return <div className="chart prodchart"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Margen por producto, hoy y con el escenario">
    {ticks.map(v => <g key={v}><line x1={x(v)} x2={x(v)} y1={0} y2={H - 22} stroke="var(--line)" strokeWidth={v === 0 ? 1.5 : undefined} /><text x={x(v)} y={H - 6} textAnchor="middle">{p100(v)}</text></g>)}
    {rows.map((r, i) => { const m0 = r.m0 ?? 0, m1 = r.m1 ?? 0, yy = i * rowH + 6;
      return <g key={r.name}>
        <text x={pl - 8} y={yy + 14} textAnchor="end" className="lbl">{r.name.length > 32 ? r.name.slice(0, 31) + '…' : r.name}</text>
        <rect x={Math.min(x(0), x(m0))} y={yy + 2} width={Math.abs(x(m0) - x(0))} height={8} rx={2} fill="var(--before)" />
        <rect x={Math.min(x(0), x(m1))} y={yy + 11} width={Math.abs(x(m1) - x(0))} height={8} rx={2} fill="var(--after)" />
        <text x={Math.max(x(m1), x(0)) + 6} y={yy + 19}>{p100(r.m1)}</text></g>; })}
  </svg></div>;
}
