/** Reglas de coste de los operadores para Subida de precios (sin acceso a BD: se puede probar con datos simulados). */
export interface MesCoste { real: number; est: number }
export interface MesTendencia { mes: string; total: number; estimado: number; pendiente: boolean }
export interface Tendencia {
  producto: string;
  meses: MesTendencia[];
  /** Últimos 3 meses con datos del periodo: el coste actual del operador se calcula con ellos. */
  ultimos: string[];
  /** Media mensual (real + estimado) de los meses anteriores con factura, y de los últimos 3 con factura. */
  previo: number | null;
  actual: number | null;
  variacionPct: number | null;
  /** Meses con la factura del operador pendiente: lo que hay es un estimado. */
  pendientes: string[];
}

/** Operadores cuyo coste «actual» es el de los últimos 3 meses (suben o bajan con el año), no la media del periodo. */
export const OPERADORES = new Set(['Cablemóvil/Xfera', 'Aire Networks', 'Telefónica']);
/** Un mes está «pendiente de factura» si más de un 40 % de su coste es estimado y el estimado supera 300 €
 *  (el estimado fijo de Vola, p. ej. 293 € de Xfera, no cuenta como factura pendiente). */
export const mesPendiente = (m: MesCoste): boolean => {
  const t = m.real + m.est;
  return t > 0 && m.est >= 300 && m.est / t > 0.4;
};
const media = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Coste mensual actual: media de los últimos `n` meses con datos del periodo. */
export function costeUltimosMeses(mm: Map<string, MesCoste>, n = 3): { real: number; est: number; meses: string[] } | null {
  const meses = Array.from(mm.keys()).sort().slice(-n);
  if (!meses.length) return null;
  const real = meses.reduce((s, k) => s + mm.get(k)!.real, 0) / meses.length;
  const est = meses.reduce((s, k) => s + mm.get(k)!.est, 0) / meses.length;
  return { real, est, meses };
}

export function tendencia(producto: string, mm: Map<string, MesCoste>, n = 3): Tendencia | null {
  const claves = Array.from(mm.keys()).sort();
  if (!claves.length) return null;
  const meses: MesTendencia[] = claves.map(k => { const m = mm.get(k)!; return { mes: k, total: r2(m.real + m.est), estimado: r2(m.est), pendiente: mesPendiente(m) }; });
  const ultimos = claves.slice(-n);
  const conFactura = (ks: string[]) => meses.filter(m => ks.includes(m.mes) && !m.pendiente).map(m => m.total);
  const previo = media(conFactura(claves.slice(0, -n)));
  const actual = media(conFactura(ultimos));
  const variacionPct = previo != null && actual != null && previo > 0 ? (actual - previo) / previo : null;
  return { producto, meses, ultimos, previo: previo == null ? null : r2(previo), actual: actual == null ? null : r2(actual), variacionPct, pendientes: meses.filter(m => m.pendiente).map(m => m.mes) };
}
