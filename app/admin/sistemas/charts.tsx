'use client';
import { eur } from '../subida-precios/fmt';

const PALETA = ['#FF5300', '#1f2937', '#2563eb', '#15803d', '#a855f7', '#0891b2', '#ca8a04', '#be185d', '#64748b', '#84cc16', '#f43f5e', '#0d9488'];
export const colorServicio = (i: number) => PALETA[i % PALETA.length];
const mesCorto = (m: string) => ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m.slice(5)) - 1] + ' ' + m.slice(2, 4);

export interface SerieMes { nombre: string; valores: number[] }
/** Barras apiladas por servicio y mes. El mes en curso se dibuja con trama porque aún no está cerrado. */
export function EvolucionCostes({ meses, series, mesActual }: { meses: string[]; series: SerieMes[]; mesActual: string }) {
  const W = 880, H = 300, pt = 22, pb = 40, pl = 56, pr = 10;
  const tot = meses.map((_, i) => series.reduce((a, s) => a + s.valores[i], 0));
  const max = Math.max(...tot, 1) * 1.08; const y = (v: number) => pt + (H - pt - pb) * (1 - v / max);
  const bw = (W - pl - pr) / meses.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución mensual del coste de los servicios" className="w-full">
      <defs><pattern id="rayas" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="rgba(255,255,255,.55)" /></pattern></defs>
      {[0, 1, 2, 3, 4].map(g => { const v = (max * g) / 4; return (<g key={g}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="#e5e7eb" /><text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#6b7280">{eur(v)}</text></g>); })}
      {meses.map((m, i) => {
        let acum = 0; const x = pl + i * bw + bw * 0.14; const w = bw * 0.72;
        return (<g key={m}>
          {series.map((s, k) => { const v = s.valores[i]; if (v <= 0) return null; const top = y(acum + v); const h = y(acum) - top; acum += v;
            return (<g key={s.nombre}><rect x={x} y={top} width={w} height={Math.max(h, 0.5)} fill={colorServicio(k)}><title>{`${s.nombre} · ${mesCorto(m)}: ${eur(v, 2)}`}</title></rect>{m === mesActual && <rect x={x} y={top} width={w} height={Math.max(h, 0.5)} fill="url(#rayas)" />}</g>); })}
          <text x={x + w / 2} y={y(tot[i]) - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="#111827">{tot[i] > 0 ? eur(tot[i]) : ''}</text>
          <text x={x + w / 2} y={H - pb + 16} textAnchor="middle" fontSize={11} fill={m === mesActual ? '#b45309' : '#4b5563'}>{mesCorto(m)}{m === mesActual ? ' (en curso)' : ''}</text>
        </g>);
      })}
    </svg>
  );
}
export function Leyenda({ nombres }: { nombres: string[] }) {
  return (<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">{nombres.map((n, i) => (<span key={n} className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colorServicio(i) }} />{n}</span>))}</div>);
}
