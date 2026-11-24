/**
 * Subida de precios · motor de cálculo puro (sin acceso a BD). Se usa igual en el navegador (simulación al vuelo)
 * y en el servidor (aprobación y exportaciones), de modo que lo que se ve es lo que se exporta.
 * Réplica y mejora del simulador de referencia de Víctor.
 */
export type TipoCliente = 'E' | 'R' | 'P';
export type Periodicidad = 'M' | 'T' | 'S' | 'A';
export const TIPO_LABEL: Record<TipoCliente, string> = { E: 'Empresa', R: 'Particular', P: 'Sector público' };

export interface Grupo { nombre: string; fijoCoste: boolean; sinPrecio: boolean; propuesta: number }
export interface Cliente { id: string; nombre: string; cif: string | null; tipo: TipoCliente; tipoOrigen: 'MANUAL' | 'CRM' | 'NIF' | 'NOMBRE'; email?: string | null }
export interface Contrato {
  clave: string; cliente: number; grupo: number; codigo: string; tarifa: string; periodicidad: Periodicidad;
  ingreso: number; coste: number; costeEstimado: number; importe?: number; descuento?: number; sinContrato?: boolean;
}
export interface Dataset { grupos: Grupo[]; clientes: Cliente[]; contratos: Contrato[] }

export interface Estado {
  nombre: string; nota: string;
  ing: Record<string, number>; cost: Record<string, number>;
  pub: number; capR: number; inclAnual: boolean; rounding: number; churnE: number; churnR: number;
  cli: Record<string, number>; con: Record<string, number>;
  aviso: Record<TipoCliente, number>; fechaEfecto: string;
}

export interface Agg { i0: number; c0: number; i1: number; c1: number; n: number }
export interface ContratoRes { p: number; i1: number; c1: number; iE: number; cE: number; dI: number }
export interface Resultado {
  tot: Agg & { dI: number; dC: number; lost: number; nUp: number };
  byG: Record<string, Agg>;
  byT: Record<TipoCliente, Agg & { dI: number; nC: number }>;
  cli: (Agg & { dI: number })[];
  con: ContratoRes[];
}

export const MESES_PERIODO: Record<Periodicidad, number> = { M: 1, T: 3, S: 6, A: 12 };
export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Redondeo al alza al paso indicado (0 = solo céntimos). */
export function roundUp(v: number, step: number): number {
  if (!step || v <= 0) return r2(v);
  return r2(Math.ceil(v / step - 1e-9) * step);
}

export function propuestaPorDefecto(nombre: string): number {
  return PROPUESTA[nombre] ?? 5;
}
export const PROPUESTA: Record<string, number> = {
  'Red propia': 5, 'Telefónica': 7, 'Draxton telecomunicaciones': 0, 'Acens': 10, 'Aire Networks': 5,
  'Cablemóvil/Xfera': 5, 'Wildix Borges': 0, 'Wildix': 5, 'Google Workspace': 10, 'Cloud 101': 10, 'Starlink': 5,
  'Adamo': 10, 'Dacast': 5, 'Dominios': 5, 'Servicios IO': 5, 'Sheetgo': 5, 'Zoom': 5,
  'Comisiones Aire': 0, 'Comisiones Xfera': 0, 'Hotspot': 0, 'Otros': 5,
};
export const SIN_PRECIO = (nombre: string) => /^Comisiones|^Hotspot/.test(nombre);
export const COSTE_FIJO = (nombre: string) => nombre === 'Red propia';
export const OPERADORES = ['Telefónica', 'Aire Networks', 'Cablemóvil/Xfera'];

export function estadoBase(ds: Pick<Dataset, 'grupos'>): Estado {
  const ing: Record<string, number> = {};
  for (const g of ds.grupos) ing[g.nombre] = g.propuesta;
  return {
    nombre: 'Propuesta inicial', nota: '', ing, cost: {}, pub: 0, capR: 15, inclAnual: true, rounding: 0,
    churnE: 0, churnR: 0, cli: {}, con: {}, aviso: { E: 1, R: 1, P: 1 }, fechaEfecto: '2027-01-01',
  };
}

export const PRESETS: { id: string; nombre: string; build: (ds: Dataset) => Estado }[] = [
  { id: 'prop', nombre: 'Propuesta inicial', build: ds => estadoBase(ds) },
  { id: 'ipc', nombre: 'IPC 4,9 % a todo', build: ds => uniforme(ds, 'IPC 4,9 % a todo', 4.9) },
  { id: 'ipc1', nombre: 'IPC + 1 punto', build: ds => uniforme(ds, 'IPC + 1 punto', 5.9) },
  {
    id: 'low', nombre: 'Solo productos con margen bajo',
    build: ds => {
      const s = estadoBase(ds); s.nombre = 'Solo productos con margen bajo';
      const base = calcular(ds, { ...estadoBase(ds), ing: {}, cost: {} });
      for (const g of ds.grupos) {
        const a = base.byG[g.nombre]; const m = a && a.i0 > 0 ? (a.i0 - a.c0) / a.i0 : 1;
        s.ing[g.nombre] = g.sinPrecio || g.nombre.startsWith('Draxton') ? 0 : m < 0 ? 12 : m < 0.35 ? 7 : 0;
      }
      return s;
    },
  },
  {
    id: 'cost', nombre: 'Propuesta + operadores suben 3 % de coste',
    build: ds => { const s = estadoBase(ds); s.nombre = 'Propuesta + operadores suben 3 % de coste'; for (const o of OPERADORES) s.cost[o] = 3; return s; },
  },
  { id: 'none', nombre: 'Sin subida', build: ds => { const s = estadoBase(ds); s.nombre = 'Sin subida'; for (const g of ds.grupos) s.ing[g.nombre] = 0; return s; } },
];
function uniforme(ds: Dataset, nombre: string, v: number): Estado {
  const s = estadoBase(ds); s.nombre = nombre;
  for (const g of ds.grupos) s.ing[g.nombre] = g.sinPrecio || g.nombre.startsWith('Draxton') ? 0 : v;
  return s;
}

const vacio = (): Agg => ({ i0: 0, c0: 0, i1: 0, c1: 0, n: 0 });

/** Porcentaje efectivo que se aplica a un contrato y de dónde sale. */
export function porcentajeContrato(st: Estado, g: Grupo, cliente: Cliente, k: Contrato): { p: number; origen: 'CONTRATO' | 'CLIENTE' | 'PRODUCTO' } {
  const propio = st.con[k.clave];
  if (propio != null) return { p: propio, origen: 'CONTRATO' };
  const sinAnual = k.periodicidad !== 'M' && !st.inclAnual;
  const cli = st.cli[cliente.id];
  if (cli != null) return { p: sinAnual ? 0 : cli, origen: 'CLIENTE' };
  let p = st.ing[g.nombre] ?? 0;
  if (cliente.tipo === 'P') p = Math.min(st.pub, p);
  if (cliente.tipo === 'R') p = Math.min(p, st.capR);
  if (sinAnual || g.sinPrecio) p = 0;
  return { p, origen: 'PRODUCTO' };
}

export function calcular(ds: Dataset, st: Estado): Resultado {
  const r: Resultado = {
    tot: { ...vacio(), dI: 0, dC: 0, lost: 0, nUp: 0 }, byG: {}, byT: {} as Resultado['byT'],
    cli: ds.clientes.map(() => ({ ...vacio(), dI: 0 })), con: new Array(ds.contratos.length),
  };
  for (const g of ds.grupos) r.byG[g.nombre] = vacio();
  for (const t of ['E', 'R', 'P'] as TipoCliente[]) r.byT[t] = { ...vacio(), dI: 0, nC: 0 };
  ds.contratos.forEach((k, idx) => {
    const g = ds.grupos[k.grupo]; const c = ds.clientes[k.cliente]; const t = c.tipo;
    const { p } = porcentajeContrato(st, g, c, k);
    const meses = MESES_PERIODO[k.periodicidad];
    let i1 = k.ingreso;
    if (k.ingreso > 0 && p !== 0) i1 = roundUp(r2(k.ingreso * meses) * (1 + p / 100), +st.rounding) / meses;
    if (i1 < k.ingreso && p >= 0) i1 = k.ingreso;
    const c1 = k.coste * (1 + (st.cost[g.nombre] || 0) / 100);
    const ch = i1 > k.ingreso + 1e-9 ? (t === 'R' ? st.churnR : st.churnE) / 100 : 0;
    const iE = i1 * (1 - ch); const cE = g.fijoCoste ? c1 : c1 * (1 - ch);
    const dI = i1 - k.ingreso;
    r.con[idx] = { p, i1, c1, iE, cE, dI };
    for (const a of [r.tot, r.byG[g.nombre], r.byT[t], r.cli[k.cliente]]) { a.i0 += k.ingreso; a.c0 += k.coste; a.i1 += iE; a.c1 += cE; a.n++; }
    r.tot.dI += dI; r.tot.dC += c1 - k.coste; r.tot.lost += (i1 - iE) - (c1 - cE); if (dI > 0.005) r.tot.nUp++;
    r.byT[t].dI += dI; r.cli[k.cliente].dI += dI;
  });
  for (const t of ['E', 'R', 'P'] as TipoCliente[]) r.byT[t].nC = r.cli.filter((c, i) => ds.clientes[i].tipo === t && c.n).length;
  return r;
}

export interface Kpis {
  ingresoHoy: number; ingresoNuevo: number; extraAnual: number; margenHoy: number; margenNuevo: number;
  margenPctHoy: number | null; margenPctNuevo: number | null; clientesConSubida: number; contratosConSubida: number; particularesConSubida: number; clientes: number;
}
export function kpis(ds: Dataset, r: Resultado): Kpis {
  const t = r.tot;
  return {
    ingresoHoy: r2(t.i0), ingresoNuevo: r2(t.i1), extraAnual: r2((t.i1 - t.i0) * 12), margenHoy: r2(t.i0 - t.c0), margenNuevo: r2(t.i1 - t.c1),
    margenPctHoy: t.i0 ? (t.i0 - t.c0) / t.i0 : null, margenPctNuevo: t.i1 ? (t.i1 - t.c1) / t.i1 : null,
    clientesConSubida: r.cli.filter(c => c.dI > 0.005).length, contratosConSubida: t.nUp,
    particularesConSubida: r.cli.filter((c, i) => ds.clientes[i].tipo === 'R' && c.dI > 0.005).length, clientes: ds.clientes.length,
  };
}

export const TRAMOS = [
  { id: '0', label: 'Sin subida', test: (p: number) => p <= 0.0001 },
  { id: '3', label: 'Hasta 3 %', test: (p: number) => p > 0 && p <= 3 },
  { id: '5', label: '3 – 5 %', test: (p: number) => p > 3 && p <= 5 },
  { id: '7', label: '5 – 7 %', test: (p: number) => p > 5 && p <= 7 },
  { id: '10', label: '7 – 10 %', test: (p: number) => p > 7 && p <= 10 },
  { id: '99', label: 'Más de 10 %', test: (p: number) => p > 10 },
];
/** Histograma por tramo de subida efectiva sobre el ingreso de cada cliente. */
export function histograma(ds: Dataset, r: Resultado) {
  const out = TRAMOS.map(t => ({ ...t, n: 0, extra: 0 }));
  r.cli.forEach((c, i) => {
    if (!c.n) return;
    const pct = c.i0 > 0 ? (c.dI / c.i0) * 100 : 0;
    const tr = out.find(t => t.test(pct)) as (typeof out)[number];
    tr.n++; tr.extra += c.dI;
  });
  return out.map(({ id, label, n, extra }) => ({ id, label, n, extra }));
}

/** Fecha límite de aviso: fecha de efecto menos N meses (calendario). */
export function fechaLimiteAviso(fechaEfecto: string, meses: number): string {
  const [y, m, d] = fechaEfecto.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 - meses, d));
  return dt.toISOString().slice(0, 10);
}

/** Detección del tipo de cliente cuando el CRM no lo dice. */
const PUBLICO_NOMBRE = /ajuntament|ayuntamiento|consell|consorci|consorcio|institut|instituto|diputaci|generalitat|mancomunitat|ministerio|universitat|universidad/i;
export function tipoPorNombre(nombre: string): boolean { return PUBLICO_NOMBRE.test(nombre || ''); }
export function tipoPorDocumento(doc: string | null | undefined): TipoCliente | null {
  const d = (doc || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[PQS]\d{7}[A-J0-9]$/.test(d) && /^[PS]/.test(d)) return 'P';
  if (/^(\d{8}[A-Z]|[XYZ]\d{7}[A-Z])$/.test(d)) return 'R';
  return null;
}
