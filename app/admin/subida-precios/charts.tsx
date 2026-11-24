'use client';
import { eur } from './fmt';

const ORANGE = '#FF5300'; const GOOD = '#15803d'; const BAD = '#b91c1c'; const BEFORE = '#9ca3af'; const GRID = '#e5e7eb';

export function Waterfall({ m0, subida, masCoste, bajas, m1 }: { m0: number; subida: number; masCoste: number; bajas: number; m1: number }) {
  const steps: [string, number, 'base' | 'delta'][] = [['Margen hoy', m0, 'base'], ['Subida de precios', subida, 'delta'], ['Más coste', masCoste, 'delta'], ['Bajas', bajas, 'delta'], ['Margen nuevo', m1, 'base']];
  const W = 760, H = 250, pt = 24, pb = 44, pl = 10, pr = 10;
  const max = Math.max(m0, m1, m0 + subida, 1) * 1.1; const y = (v: number) => pt + (H - pt - pb) * (1 - v / max);
  const bw = (W - pl - pr) / steps.length; let run = 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cascada del margen mensual" className="w-full">
      {[0, 1, 2, 3, 4].map(g => <line key={g} x1={pl} x2={W - pr} y1={y((max * g) / 4)} y2={y((max * g) / 4)} stroke={GRID} />)}
      {steps.map(([lab, v, kind], i) => {
        let a: number, b: number, col: string;
        if (kind === 'base') { a = 0; b = v; run = v; col = i === 0 ? BEFORE : ORANGE; } else { a = run; b = run + v; run = b; col = v >= 0 ? GOOD : BAD; }
        const top = y(Math.max(a, b)); const h = Math.max(1, Math.abs(y(a) - y(b))); const x = pl + i * bw + bw * 0.18; const w = bw * 0.64;
        return (<g key={lab}><rect x={x} y={top} width={w} height={h} rx={3} fill={col} />
          <text x={x + w / 2} y={top - 7} textAnchor="middle" fontSize={12} fontWeight={600} fill="#111827">{kind === 'base' ? eur(v) : (v >= 0 ? '+' : '') + eur(v)}</text>
          <text x={x + w / 2} y={H - pb + 18} textAnchor="middle" fontSize={12} fill="#4b5563">{lab}</text></g>);
      })}
    </svg>
  );
}

export function BeforeAfter({ rows }: { rows: { name: string; m0: number; m1: number }[] }) {
  const data = rows.filter(r => Math.abs(r.m0) + Math.abs(r.m1) > 0.5).sort((a, b) => b.m1 - a.m1);
  const max = Math.max(1, ...data.flatMap(d => [d.m0, d.m1])); const min = Math.min(0, ...data.flatMap(d => [d.m0, d.m1]));
  const rowH = 30; const W = 760; const lw = 190; const pw = W - lw - 90; const x = (v: number) => lw + ((v - min) / (max - min)) * pw; const H = data.length * rowH + 34;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Margen por producto antes y después" className="w-full">
        <line x1={x(0)} x2={x(0)} y1={0} y2={H - 28} stroke="#9ca3af" />
        {data.map((d, i) => (<g key={d.name} transform={`translate(0 ${i * rowH})`}>
          <text x={lw - 8} y={13} textAnchor="end" fontSize={12} fill="#374151">{d.name.length > 26 ? d.name.slice(0, 25) + '…' : d.name}</text>
          <rect x={Math.min(x(0), x(d.m0))} y={3} width={Math.max(1, Math.abs(x(d.m0) - x(0)))} height={9} fill={BEFORE} rx={2} />
          <rect x={Math.min(x(0), x(d.m1))} y={14} width={Math.max(1, Math.abs(x(d.m1) - x(0)))} height={9} fill={d.m1 < 0 ? BAD : ORANGE} rx={2} />
          <text x={Math.max(x(d.m0), x(d.m1), x(0)) + 6} y={20} fontSize={11} fill="#374151">{eur(d.m0)} → {eur(d.m1)}</text></g>))}
        <g transform={`translate(${lw} ${H - 14})`} fontSize={11} fill="#4b5563"><rect width={10} height={8} fill={BEFORE} /><text x={14} y={8}>Hoy</text><rect x={60} width={10} height={8} fill={ORANGE} /><text x={74} y={8}>Con la subida</text></g>
      </svg>
    </div>
  );
}

export function Histo({ data }: { data: { id: string; label: string; n: number; extra: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.n)); const W = 420; const H = 220; const pb = 40; const bw = W / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Clientes por tramo de subida" className="w-full">
      {data.map((d, i) => { const h = ((H - pb - 24) * d.n) / max; const x = i * bw + bw * 0.15; const w = bw * 0.7;
        return (<g key={d.id}><rect x={x} y={H - pb - h} width={w} height={h} rx={3} fill={d.id === '0' ? BEFORE : ORANGE} />
          <text x={x + w / 2} y={H - pb - h - 6} textAnchor="middle" fontSize={12} fontWeight={600} fill="#111827">{d.n}</text>
          <text x={x + w / 2} y={H - pb + 16} textAnchor="middle" fontSize={11} fill="#4b5563">{d.label}</text>
          <text x={x + w / 2} y={H - pb + 30} textAnchor="middle" fontSize={10} fill="#9ca3af">{d.extra > 0 ? `+${eur(d.extra)}` : ''}</text></g>); })}
    </svg>
  );
}
