/**
 * Área 5 · Gastos del trabajador y nóminas — núcleo puro (sin base de datos ni red).
 * Todos los importes internos se manejan en céntimos enteros.
 */
import { z } from 'zod';

export const KM_EXENTO_EUR = 0.26; // límite exento de IRPF por km (referencia; el panel solo avisa)
export const MAX_ADJUNTO_BYTES = 8 * 1024 * 1024;
export const MIMES_ADJUNTO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const;
export const TIPOS_IVA = [0, 4, 10, 21] as const;
export const CATEGORIAS = ['COMIDA', 'DIETA', 'DESPLAZAMIENTO', 'COMBUSTIBLE', 'PARKING', 'PEAJE', 'ALOJAMIENTO', 'MATERIAL', 'FORMACION', 'OTROS'] as const;
export const ESTADOS = ['BORRADOR', 'PENDIENTE', 'ACLARACION', 'APROBADO', 'RECHAZADO'] as const;
export type EstadoGasto = (typeof ESTADOS)[number];
export type AccionRevisor = 'aprobar' | 'rechazar' | 'aclaracion' | 'reabrir';

export const cents = (euros: number) => Math.round((euros + Number.EPSILON) * 100);
export const euros = (c: number) => c / 100;
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Revisores: solo David y Víctor (ampliable por entorno, nunca por rol: Lorena no revisa). */
const REVISORES_POR_DEFECTO = ['david.perez@internetoperadores.com', 'victor@internetoperadores.com', 'victor@lfgd.es'];
export function listaRevisores(env: string | undefined = process.env.AREA5_REVISORES): string[] {
  const extra = (env || '').split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(s => s.includes('@'));
  return [...new Set([...REVISORES_POR_DEFECTO, ...extra])];
}
export function esRevisor(email: string | null | undefined, env?: string): boolean {
  return !!email && listaRevisores(env).includes(email.trim().toLowerCase());
}

/* ------------------------------ IVA y kilometraje ------------------------------ */

/** Desglosa un total con IVA incluido. */
export function desglosarIva(totalEur: number, tipoIva: number) {
  const total = cents(totalEur);
  const base = Math.round(total / (1 + tipoIva / 100));
  return { baseEur: euros(base), cuotaEur: euros(total - base), totalEur: euros(total) };
}
export const importeKm = (km: number, eurKm: number) => euros(cents(km * eurKm));

const hoyIso = () => new Date().toISOString().slice(0, 10);
export function fechaValida(iso: string, hoy = hoyIso()): string | null {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00Z') : null;
  if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return 'Fecha no válida'; // rechaza 31/02
  if (iso > hoy) return 'La fecha no puede ser futura';
  const limite = new Date(hoy + 'T00:00:00Z'); limite.setUTCMonth(limite.getUTCMonth() - 18);
  if (iso < limite.toISOString().slice(0, 10)) return 'El gasto tiene más de 18 meses';
  return null;
}

const texto = (max: number) => z.string().trim().max(max);
const opcional = (max: number) => texto(max).optional().nullable().transform(v => (v ? v : null));
const num = z.coerce.number().finite();

/** Campos editables de un gasto (ticket o kilometraje). */
export const gastoSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('TICKET'),
    fecha: z.string(),
    concepto: texto(200).min(1, 'Indica el concepto'),
    categoria: z.enum(CATEGORIAS).optional().nullable().transform(v => v ?? null),
    proyecto: opcional(200), cliente: opcional(200), comercio: opcional(200), cifComercio: opcional(40),
    importe: num.positive('El importe debe ser mayor que 0').max(20000),
    tipoIva: num.min(0).max(30).optional().nullable().transform(v => v ?? null),
    importeIva: num.min(0).optional().nullable().transform(v => v ?? null),
  }),
  z.object({
    tipo: z.literal('KILOMETRAJE'),
    fecha: z.string(),
    concepto: texto(200).min(1, 'Indica origen, destino o motivo del viaje'),
    proyecto: opcional(200), cliente: opcional(200),
    km: num.positive('Indica los km').max(5000),
    eurKm: num.positive('Indica el €/km').max(2),
  }),
]);
export type GastoInput = z.infer<typeof gastoSchema>;

export interface GastoNormalizado {
  tipo: 'TICKET' | 'KILOMETRAJE'; fecha: string; concepto: string; categoria: string | null;
  proyecto: string | null; cliente: string | null; comercio: string | null; cifComercio: string | null;
  importe: number; tipoIva: number | null; baseImponible: number | null; importeIva: number | null;
  km: number | null; eurKm: number | null; avisos: string[];
}
/** Valida y completa los derivados (IVA, importe de km). Lanza Error con mensaje en español si algo no cuadra. */
export function normalizarGasto(input: unknown, hoy = hoyIso()): GastoNormalizado {
  const g = gastoSchema.parse(input);
  const errFecha = fechaValida(g.fecha, hoy);
  if (errFecha) throw new Error(errFecha);
  const avisos: string[] = [];
  if (g.tipo === 'KILOMETRAJE') {
    if (g.eurKm > KM_EXENTO_EUR) avisos.push(`El precio por km supera ${KM_EXENTO_EUR.toString().replace('.', ',')} €/km: el exceso tributa en nómina.`);
    return {
      tipo: 'KILOMETRAJE', fecha: g.fecha, concepto: g.concepto, categoria: 'DESPLAZAMIENTO', proyecto: g.proyecto, cliente: g.cliente,
      comercio: null, cifComercio: null, importe: importeKm(g.km, g.eurKm), tipoIva: null, baseImponible: null, importeIva: null,
      km: r2(g.km), eurKm: Math.round(g.eurKm * 10000) / 10000, avisos,
    };
  }
  let tipoIva = g.tipoIva; let importeIva = g.importeIva;
  if (tipoIva === null && importeIva !== null) {
    // Solo cuota: deducir el tipo más cercano.
    const base = g.importe - importeIva;
    if (base <= 0) throw new Error('La cuota de IVA no puede ser mayor o igual que el importe');
    const ratio = (importeIva / base) * 100;
    tipoIva = [...TIPOS_IVA].sort((a, b) => Math.abs(a - ratio) - Math.abs(b - ratio))[0];
  }
  let baseImponible: number | null = null;
  if (tipoIva !== null) {
    const d = desglosarIva(g.importe, tipoIva);
    if (importeIva !== null && Math.abs(importeIva - d.cuotaEur) > 0.05) avisos.push('La cuota de IVA indicada no coincide con el tipo; revisa el ticket.');
    importeIva = importeIva !== null && Math.abs(importeIva - d.cuotaEur) <= 0.05 ? r2(importeIva) : d.cuotaEur;
    baseImponible = r2(g.importe - importeIva);
  }
  if (tipoIva === null) avisos.push('Sin IVA indicado: si el ticket lo desglosa, añádelo.');
  return {
    tipo: 'TICKET', fecha: g.fecha, concepto: g.concepto, categoria: g.categoria, proyecto: g.proyecto, cliente: g.cliente,
    comercio: g.comercio, cifComercio: g.cifComercio, importe: r2(g.importe), tipoIva, baseImponible, importeIva,
    km: null, eurKm: null, avisos,
  };
}

/* --------------------------------- Estados --------------------------------- */

/** Transiciones permitidas. «trabajador» y «revisor» son los únicos actores. */
export function transicion(estado: EstadoGasto, accion: 'enviar' | AccionRevisor, cerrado = false): EstadoGasto | null {
  if (cerrado) return null; // un gasto incluido en un cierre ya no se toca
  switch (accion) {
    case 'enviar': return estado === 'BORRADOR' || estado === 'ACLARACION' ? 'PENDIENTE' : null;
    case 'aprobar': return estado === 'PENDIENTE' ? 'APROBADO' : null;
    case 'rechazar': return estado === 'PENDIENTE' ? 'RECHAZADO' : null;
    case 'aclaracion': return estado === 'PENDIENTE' ? 'ACLARACION' : null;
    case 'reabrir': return estado === 'APROBADO' || estado === 'RECHAZADO' ? 'PENDIENTE' : null;
  }
}
export const editable = (estado: EstadoGasto, cerrado: boolean) => !cerrado && (estado === 'BORRADOR' || estado === 'ACLARACION');

/* ----------------------------------- OCR ----------------------------------- */

export interface SugerenciaOcr {
  comercio: string | null; cifComercio: string | null; fecha: string | null; concepto: string | null;
  importe: number | null; tipoIva: number | null; importeIva: number | null; categoria: string | null; confianza: number | null;
}
/** Interpreta la respuesta del modelo de visión sin fiarse de ella (nunca lanza). */
export function parseOcrJson(raw: string, hoy = hoyIso()): SugerenciaOcr | null {
  let s = (raw || '').trim();
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let o: any;
  try { o = JSON.parse(s.slice(a, b + 1)); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const n = (v: unknown) => { const x = typeof v === 'string' ? Number(v.replace(',', '.')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
  const t = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const importe = n(o.importe);
  const tipoIvaRaw = n(o.tipoIva);
  const fecha = typeof o.fecha === 'string' && !fechaValida(o.fecha, hoy) ? o.fecha : null;
  const cat = typeof o.categoria === 'string' && (CATEGORIAS as readonly string[]).includes(o.categoria.toUpperCase()) ? o.categoria.toUpperCase() : null;
  const conf = n(o.confianza);
  return {
    comercio: t(o.comercio, 200), cifComercio: t(o.cifComercio, 40), fecha, concepto: t(o.concepto, 200),
    importe: importe !== null && importe > 0 && importe <= 20000 ? r2(importe) : null,
    tipoIva: tipoIvaRaw !== null && tipoIvaRaw >= 0 && tipoIvaRaw <= 30 ? tipoIvaRaw : null,
    importeIva: n(o.importeIva) !== null && (n(o.importeIva) as number) >= 0 ? r2(n(o.importeIva) as number) : null,
    categoria: cat, confianza: conf !== null && conf >= 0 && conf <= 1 ? conf : null,
  };
}

/* ------------------------- Conceptos de la nómina ------------------------- */

export interface ConceptoNomina { codigo: string; concepto: string; importeCents: number; esGasto: boolean; dudoso: boolean }
const EXPENSE = /\b(?:kilometraje|dietas?|gastos?\s+(?:de\s+)?(?:desplazamiento|viaje|transporte|manutenci[oó]n|estancia)|reintegro\s+de\s+gastos?|locomoci[oó]n|suplidos?|peajes?|aparcamiento|parking|reembolso)\b/i;
const POSIBLE = /\b(?:gastos?|dietas?|kilometraje|desplazamiento|locomoci[oó]n|manutenci[oó]n|estancia|reembolso|reintegro|suplidos?|peajes?|aparcamiento|parking)\b/i;
const IMPORTE = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g;
const aCents = (s: string) => Math.round(Number(s.replace(/\./g, '').replace(',', '.')) * 100);

/**
 * Lee las líneas «NNN - CONCEPTO ... importe» de la nómina individual y separa las de gasto/suplido.
 * Si una línea parece de gasto pero no se puede fijar el importe sin duda (varias cifras, negativa),
 * se devuelve como `dudoso` para que una persona la revise; nunca se adivina.
 */
export function extraerConceptosNomina(text: string): ConceptoNomina[] {
  const out: ConceptoNomina[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/\b(\d{3})\s*-\s*([^\n]+)/);
    if (!m) continue;
    const etiqueta = m[2];
    const esGasto = EXPENSE.test(etiqueta);
    if (!esGasto && !POSIBLE.test(etiqueta)) continue;
    const importes = etiqueta.match(IMPORTE) || [];
    const nombre = etiqueta.replace(IMPORTE, '').replace(/\s+/g, ' ').trim().slice(0, 200) || m[1];
    let c: number | null = null;
    if (importes.length === 1 && !importes[0].startsWith('-')) c = aCents(importes[0]);
    else if (importes.length >= 3) {
      // «unidades × precio = importe»: se acepta solo si el producto cuadra al céntimo.
      const v = importes.map(i => Number(i.replace(/\./g, '').replace(',', '.')));
      const total = v[v.length - 1];
      if (v.slice(0, -1).some((a, i) => v.slice(i + 1, -1).some(b => Math.abs(a * b - total) <= 0.011)) && total >= 0) c = aCents(importes[importes.length - 1]);
    }
    out.push({ codigo: m[1], concepto: nombre, importeCents: c ?? 0, esGasto: esGasto && c !== null, dudoso: c === null || !esGasto });
  }
  return out;
}

/* --------------------------------- Cuadre --------------------------------- */

export type EstadoCuadre = 'CUADRA' | 'DIFERENCIA' | 'SIN_NOMINA' | 'SIN_DESGLOSE' | 'REVISAR';
export interface CuadreEntrada {
  empleadoId: string; nombre: string;
  gastosCents: number; numGastos: number; kmCents: number;
  nominaImportada: boolean;
  conceptos: ConceptoNomina[];
  /** Total de reintegros que el importador general extrajo del PDF (null = no verificado). */
  respaldoNominaCents: number | null;
}
export interface CuadreFila {
  empleadoId: string; nombre: string; estado: EstadoCuadre;
  aprobadoCents: number; numGastos: number; nominaCents: number | null; diferenciaCents: number | null;
  kmAprobadoCents: number; kmNominaCents: number | null; fuente: 'CONCEPTOS' | 'TOTAL_NOMINA' | 'NINGUNA';
  conceptos: ConceptoNomina[]; mensaje: string;
}
const KM_CONCEPTO = /kilometraje|locomoci[oó]n/i;
const fmt = (c: number) => (c / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export function cuadrar(e: CuadreEntrada): CuadreFila {
  const base = { empleadoId: e.empleadoId, nombre: e.nombre, aprobadoCents: e.gastosCents, numGastos: e.numGastos, kmAprobadoCents: e.kmCents, conceptos: e.conceptos };
  const gasto = e.conceptos.filter(c => c.esGasto);
  const dudosos = e.conceptos.filter(c => c.dudoso);
  if (!e.nominaImportada) return { ...base, estado: 'SIN_NOMINA', nominaCents: null, diferenciaCents: null, kmNominaCents: null, fuente: 'NINGUNA', mensaje: 'La nómina de este mes todavía no está importada.' };
  if (dudosos.length) {
    return { ...base, estado: 'REVISAR', nominaCents: null, diferenciaCents: null, kmNominaCents: null, fuente: 'CONCEPTOS', mensaje: `La nómina tiene ${dudosos.length} línea(s) de gasto con importe ambiguo; revísalas a mano.` };
  }
  let nominaCents: number; let fuente: CuadreFila['fuente']; let kmNomina: number | null = null;
  if (gasto.length) {
    nominaCents = gasto.reduce((s, c) => s + c.importeCents, 0); fuente = 'CONCEPTOS';
    kmNomina = gasto.filter(c => KM_CONCEPTO.test(c.concepto)).reduce((s, c) => s + c.importeCents, 0);
  } else if (e.respaldoNominaCents !== null) { nominaCents = e.respaldoNominaCents; fuente = 'TOTAL_NOMINA'; }
  else if (e.conceptos.length === 0 && e.gastosCents === 0) { nominaCents = 0; fuente = 'NINGUNA'; }
  else return { ...base, estado: 'SIN_DESGLOSE', nominaCents: null, diferenciaCents: null, kmNominaCents: null, fuente: 'NINGUNA', mensaje: 'La nómina no trae el desglose de gastos: sube la nómina individual para poder cuadrar.' };
  const dif = nominaCents - e.gastosCents;
  if (dif === 0) return { ...base, estado: 'CUADRA', nominaCents, diferenciaCents: 0, kmNominaCents: kmNomina, fuente, mensaje: 'Cuadra con la nómina.' };
  const msg = dif > 0 ? `La nómina paga ${fmt(dif)} más de lo aprobado.` : `La nómina paga ${fmt(-dif)} menos de lo aprobado.`;
  return { ...base, estado: 'DIFERENCIA', nominaCents, diferenciaCents: dif, kmNominaCents: kmNomina, fuente, mensaje: msg };
}
