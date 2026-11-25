/**
 * Facturación · funciones puras de la pantalla. No calculan cobros ni conciliación:
 * solo ordenan, suman y rotulan lo que ya devuelve el servidor (cálculo B7 y resumen ISP).
 */
import type { B7Analytics, B7InvoiceSettlement, B7ReadDto } from '@/components/finanzas/facturacion-banco/typesparser'
import type { MonthlyInvoicingDto } from '@/components/finanzas/monthly-invoicing/response-parser'

export type Tone = 'g' | 'w' | 'o' | 'b'
export type Bucket = 'COBRADA' | 'REAL' | 'SIN_EXTRACTO' | 'REVISION'
export const MES3 = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Céntimos a euros (solo para pintar). */
export const eu = (cents: number | null | undefined): number | null => (cents === null || cents === undefined ? null : cents / 100)
export const fmtEur = (cents: number | null | undefined, d = 0): string => {
  const v = eu(cents)
  if (v === null) return 'sin dato'
  return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' }) + ' €'
}
export const fmtK = (v: number): string => `${Math.round(v / 1000).toLocaleString('es-ES', { useGrouping: 'always' })} k€`
export const fmtDate = (iso: string | null | undefined): string => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : 'sin dato')
export const fmtDay = (iso: string | null | undefined): string => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : 'sin dato')
export const fmtNum = (n: number): string => n.toLocaleString('es-ES', { useGrouping: 'always' })
export const pctOf = (part: number, total: number): number | null => (total > 0 ? (part / total) * 100 : null)
export const fmtPct = (v: number | null, d = 0): string => (v === null ? 'sin dato' : `${v.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: 0 })} %`)

/** Misma regla que la analítica del servidor (lib/finanzas/bank-invoicing-analytics.ts · classifyInvoice). */
export function bucketOf(inv: Pick<B7InvoiceSettlement, 'paymentState' | 'fechaISO' | 'fechaVencimientoISO'>, cutoff: string | null): Bucket {
  if (inv.paymentState === 'PENDIENTE_COBRO_REVISION') return 'REVISION'
  if (inv.paymentState === 'COBRADA_CALCULADA') return 'COBRADA'
  const reference = inv.fechaVencimientoISO ?? inv.fechaISO
  return cutoff !== null && reference !== null && reference <= cutoff ? 'REAL' : 'SIN_EXTRACTO'
}
export const BUCKET_LABEL: Record<Bucket, string> = { COBRADA: 'Cobrada (banco)', REAL: 'Por confirmar', SIN_EXTRACTO: 'Sin extracto', REVISION: 'En revisión' }
export const BUCKET_TONE: Record<Bucket, Tone> = { COBRADA: 'g', REAL: 'w', SIN_EXTRACTO: 'o', REVISION: 'w' }

/** Motivos de revisión en lenguaje llano (sin códigos internos). */
export const REASON_PLAIN: Record<string, string> = {
  FUENTE_B2_NO_ECONOMICA: 'La factura no está acreditada como definitiva.',
  IMPORTE_FUENTE_INEXACTO_O_AUSENTE: 'El total de la factura no es exacto o falta.',
  TOTAL_CERO_SIN_COBRO_EXIGIBLE: 'Total cero: no hay nada que cobrar.',
  FECHA_FUENTE_DESCONOCIDA: 'Falta la fecha de la factura.',
  ENVOLTORIO_FI_NO_COINCIDE_CON_FUENTE: 'El documento del banco no coincide exactamente con la factura.',
  EVIDENCIA_B4_DIRECTA_NO_VIGENTE: 'El cobro asociado ya no está vigente o está incompleto.',
  SOLAPAMIENTO_FI_DIRECTA_Y_REMESA: 'Hay un cobro directo y otro por remesa a la vez; hay que revisarlo.',
  REMESA_FUENTE_O_MAPA_FI_INEXACTO: 'La remesa no cuadra exactamente con la factura.',
  REMESA_EVIDENCIA_B4_NO_VIGENTE: 'El cobro de la remesa ya no está vigente.',
  REMESA_SUMA_NO_SEGURA: 'La suma de la remesa no es segura.',
  REMESA_DEVOLUCION_SIN_ATRIBUCION_B6_EXACTA: 'Hay una devolución de remesa sin atribuir con certeza.',
  REMESA_DEVOLUCION_FUERA_DE_RANGO: 'La devolución de la remesa queda fuera del rango de la factura.',
  SUMA_NO_SEGURA_O_FUENTE_INEXACTA: 'No se ha podido verificar una suma.',
  COBRO_DOCUMENTAL_FUERA_DE_RANGO_FIRMADO: 'El cobro queda fuera del rango permitido.',
}
export const reasonPlain = (code: string): string => REASON_PLAIN[code] ?? 'Motivo sin descripción; revisar en Conciliar.'

export type Totales = { facturado: number | null; base: number; confirmado: number; porConfirmar: number; sinExtracto: number; nPorConfirmar: number; nSinExtracto: number; nFacturas: number }
/**
 * Reparto del facturado del año: confirmado + por confirmar (incluye las facturas en revisión) + sin extracto.
 * Todo sale de la analítica del servidor (mismos céntimos que B7); `facturado` es el total oficial del resumen.
 */
export function totales(dto: B7ReadDto): Totales {
  const a = dto.analitica
  const real = a?.desglosePendiente.real ?? { cents: 0, count: 0 }
  const rev = a?.desglosePendiente.revision ?? { cents: 0, count: 0 }
  const sin = a?.desglosePendiente.sinExtracto ?? { cents: 0, count: 0 }
  const base = a ? a.mensual.reduce((s, m) => s + m.facturado, 0) : 0
  return {
    facturado: dto.summary.facturado.cents ?? dto.summary.facturado.knownCents,
    base,
    confirmado: a ? a.mensual.reduce((s, m) => s + m.cobrado, 0) : 0,
    porConfirmar: real.cents + rev.cents, nPorConfirmar: real.count + rev.count,
    sinExtracto: sin.cents, nSinExtracto: sin.count,
    nFacturas: dto.summary.invoicesTotal,
  }
}
/** La comprobación ✔: el reparto suma exactamente lo facturado (y coincide con el total oficial si este es conocido). */
export const cuadra = (t: Totales): { ok: boolean; diff: number } => {
  const diff = t.base - (t.confirmado + t.porConfirmar + t.sinExtracto)
  const official = t.facturado === null ? 0 : t.facturado - t.base
  return { ok: Math.abs(diff) <= 1 && Math.abs(official) <= 1, diff: Math.abs(diff) > 1 ? diff : official }
}

/** Meses visibles: el año en curso llega hasta el mes actual; los años cerrados, 12. */
export function visibleMonths(year: number | null, today: Date): number {
  if (year === null) return 12
  const cy = today.getFullYear()
  return year === cy ? today.getMonth() + 1 : year < cy ? 12 : 0
}

export type MonthRow = { i: number; fact: number; may: number | null; rem: number | null; nRem: number | null; n: number }
/** Facturado por mes (B7) con mayoristas y remesas del resumen ISP (si lo hay). */
export function monthRows(a: B7Analytics, resumen: MonthlyInvoicingDto | null, year: number | null): MonthRow[] {
  return a.mensual.map((m, idx) => {
    const key = year === null ? '' : `${year}-${String(idx + 1).padStart(2, '0')}`
    const r = resumen?.resumenMensual.find(x => x.mes === key) ?? null
    const fact = m.facturado / 100
    return { i: idx, fact, may: r ? Math.min(r.mayoristasTotalCents / 100, fact) : null, rem: r ? r.totalRemesadoCents / 100 : null, nRem: r ? r.numRemesas : null, n: m.facturas }
  })
}

export type Alert = { tone: Tone; head: string; title: string; text: string; action: string; to: 'conciliar' | 'importar' | 'revision' | 'meses' | 'sin' | 'cobros' }
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length === 0 ? 0 : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** «Lo que hay que mirar»: se saca de los datos; si no hay nada, la lista queda vacía. */
export function buildAlerts(dto: B7ReadDto, rows: MonthRow[], resumen: MonthlyInvoicingDto | null, year: number | null, today: Date): Alert[] {
  const a = dto.analitica
  if (!a) return []
  const t = totales(dto)
  const out: Alert[] = []
  const real = a.desglosePendiente.real
  if (real.count > 0) out.push({ tone: 'w', head: fmtEur(real.cents), title: 'Por confirmar en banco', text: `${fmtNum(real.count)} facturas${a.corte.fecha ? ` anteriores al ${fmtDay(a.corte.fecha)}` : ''} sin cobro encontrado.`, action: 'Conciliar', to: 'conciliar' })
  const faltan = a.corte.cuentasActivas - a.corte.cuentasVerificadas
  if (a.desglosePendiente.sinExtracto.count > 0 || faltan > 0) out.push({ tone: 'o', head: faltan > 0 ? `${faltan} ${faltan === 1 ? 'cuenta' : 'cuentas'}` : 'Extractos', title: 'Faltan extractos', text: a.corte.fecha ? `Hay ${fmtNum(a.desglosePendiente.sinExtracto.count)} facturas posteriores al ${fmtDay(a.corte.fecha)}. Carga los extractos nuevos de todas las cuentas.` : `Solo ${a.corte.cuentasVerificadas} de ${a.corte.cuentasActivas} cuentas tienen corte verificable; sin eso no se puede dar ninguna factura por pendiente.`, action: 'Cargar', to: 'importar' })
  if (a.desglosePendiente.revision.count > 0) out.push({ tone: 'w', head: fmtNum(a.desglosePendiente.revision.count), title: 'Facturas en revisión', text: 'Importe o cliente que no encaja con el cobro.', action: 'Revisar', to: 'revision' })
  if (a.sinImporte > 0) out.push({ tone: 'w', head: fmtNum(a.sinImporte), title: 'Facturas sin importe verificable', text: 'No entran en ninguna suma hasta que se confirme su total.', action: 'Ver', to: 'sin' })
  const closed = rows.filter(r => r.fact > 0 && (year === null || year !== today.getFullYear() || r.i < today.getMonth()))
  if (closed.length >= 4) {
    const med = median(closed.map(r => r.fact)); const top = closed.reduce((m, r) => (r.fact > m.fact ? r : m), closed[0])
    if (med > 0 && top.fact >= med * 1.6) out.push({ tone: 'o', head: `${MES_LARGO[top.i][0].toUpperCase()}${MES_LARGO[top.i].slice(1)}: ${fmtK(top.fact)}`, title: 'Mes atípico', text: top.may !== null && top.may > 0 ? `Incluye ${fmtEur(Math.round(top.may * 100))} de mayoristas.` : `Está muy por encima de la mediana mensual (${fmtK(med)}).`, action: 'Ver', to: 'meses' })
  }
  if (resumen && year === today.getFullYear()) { const cur = rows[today.getMonth()]; if (cur && cur.nRem === 0 && today.getDate() >= 10) out.push({ tone: 'o', head: '0 remesas', title: `${MES_LARGO[today.getMonth()][0].toUpperCase()}${MES_LARGO[today.getMonth()].slice(1)} sin remesar`, text: 'La remesa de domiciliaciones de este mes aún no figura en el histórico.', action: 'Ver', to: 'meses' }) }
  void t
  return out.slice(0, 5)
}

/** Líneas de una factura (JSON guardado en la factura emitida). Lo que falte sale como «sin dato». */
export type Linea = { concepto: string | null; contrato: string | null; importe: number | null }
export function parseLineas(raw: unknown): Linea[] {
  let v: unknown = raw
  if (typeof raw === 'string') { try { v = JSON.parse(raw) } catch { return [] } }
  if (!Array.isArray(v)) return []
  const s = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : typeof x === 'number' ? String(x) : null)
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x.replace(',', '.'))) ? Number(x.replace(',', '.')) : null)
  return v.slice(0, 200).filter(x => x && typeof x === 'object').map(x => {
    const r = x as Record<string, unknown>
    return { concepto: s(r.concepto) ?? s(r.descripcion) ?? s(r.description) ?? s(r.texto), contrato: s(r.contrato) ?? s(r.codigoContrato) ?? s(r.contratoId), importe: n(r.importe) ?? n(r.base) ?? n(r.total) ?? n(r.precio) }
  })
}

/** Texto de «ISP sincronizado …» a partir de la última sincronización registrada. */
export function syncText(finishedAt: string | null | undefined, status: string | null | undefined, corte: string | null): string {
  const banks = corte ? `bancos hasta ${fmtDay(corte)}` : 'bancos sin corte verificable'
  if (!finishedAt) return `ISP sin sincronización registrada · ${banks}`
  const d = new Date(finishedAt)
  if (Number.isNaN(d.getTime())) return `ISP sin sincronización registrada · ${banks}`
  const sameDay = d.toDateString() === new Date().toDateString()
  const f = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(d)
  const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(d)
  const inc = status === 'FAILED' ? ' (con error)' : status === 'COMPLETED_WITH_ERRORS' ? ' (con incidencias)' : ''
  return `ISP sincronizado ${sameDay ? `hoy ${hora}` : f}${inc} · ${banks}`
}
