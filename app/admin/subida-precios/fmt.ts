export const eur = (v: number, d = 0) => (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
export const pct = (v: number | null | undefined, d = 1) => (v == null || !isFinite(v) ? '—' : (v < 0 ? '−' : '') + Math.abs(v * 100).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %');
export const pts = (a: number | null, b: number | null) => (a == null || b == null ? '—' : `${a >= b ? '+' : '−'}${Math.abs((a - b) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} pts`);
export const num = (v: number) => v.toLocaleString('es-ES');
