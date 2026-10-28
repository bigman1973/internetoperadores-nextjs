import { createHash } from 'node:crypto'

/** Immutable partial-payment proof for one positive B4 REMESA bank credit. */
export const B7_REMESA_RECEIPT_SCHEMA_VERSION = 'B7_REMESA_RECIBO_V1' as const
export const B7_REMESA_RECEIPT_MAX_LINES = 2_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

export class RemittancePaymentReceiptError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message)
    this.name = 'RemittancePaymentReceiptError'
  }
}
export function receiptFail(status: number, code: string, message: string, details?: unknown): never {
  throw new RemittancePaymentReceiptError(status, code, message, details)
}

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json }
type Row = Record<string, unknown>
function object(value: unknown, code = 'COMPOSICION_REMESA_INEXACTA'): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) receiptFail(422, code, 'La composición de la remesa no conserva una fila verificable.')
  return value as Row
}
function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) receiptFail(422, 'COMPOSICION_REMESA_INEXACTA', `${field} no es un UUID verificable.`)
  return value.toLowerCase()
}
function positiveInt(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 2_147_483_647) {
    receiptFail(422, 'COMPOSICION_REMESA_INEXACTA', `${field} debe ser un importe positivo exacto en céntimos.`)
  }
  return value as number
}
function day(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DAY.test(value)) receiptFail(422, 'FECHA_FUENTE_DESCONOCIDA', `${field} no contiene una fecha ISO verificable.`)
  return value
}
function safeNumber(value: bigint, code: string): number {
  if (value < BigInt(-2_147_483_648) || value > BigInt(2_147_483_647)) receiptFail(422, code, 'La suma de céntimos sale del rango exacto admitido.')
  return Number(value)
}
function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('B7_REMESA_CANONICAL_NON_FINITE')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const row = value as Row
    return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${canonical(row[key])}`).join(',')}}`
  }
  throw new Error('B7_REMESA_CANONICAL_UNSUPPORTED')
}
export function remittanceReceiptHash(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex')
}
export function isReceiptHash(value: unknown): value is string { return typeof value === 'string' && SHA256.test(value) }

export type ReceiptCompositionEntry = Readonly<{
  ordinal: number
  facturaEmitidaId: string
  importeCentimos: number
  raw: Readonly<Row>
}>
export type ReceiptComposition = Readonly<{
  hash: string
  entries: readonly ReceiptCompositionEntry[]
  totalCentimos: number
}>
/**
 * Composition is source evidence, not browser input.  We retain its original row
 * ordinal and whole JSON snapshot while accepting only an explicit FI UUID and a
 * positive integer-cent allocation.  No client/customer/name inference exists.
 */
export function parseReceiptComposition(raw: unknown): ReceiptComposition {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > B7_REMESA_RECEIPT_MAX_LINES) {
    receiptFail(422, 'COMPOSICION_REMESA_INEXACTA', 'La composición de la remesa debe contener entre una y 2.000 filas.')
  }
  let total = BigInt(0)
  const entries = raw.map((value, index) => {
    const row = object(value)
    const facturaEmitidaId = uuid(row.facturaEmitidaId, `composicion[${index}].facturaEmitidaId`)
    const importeCentimos = positiveInt(row.importeCentimos, `composicion[${index}].importeCentimos`)
    total += BigInt(importeCentimos)
    return { ordinal: index + 1, facturaEmitidaId, importeCentimos, raw: row }
  })
  return { hash: remittanceReceiptHash({ schemaVersion: B7_REMESA_RECEIPT_SCHEMA_VERSION, composition: raw }), entries, totalCentimos: safeNumber(total, 'SUMA_COMPOSICION_FUERA_DE_RANGO') }
}

export type ReceiptRemittanceLine = Readonly<{ tipo: 'DOCUMENTO' | 'DIFERENCIA'; tipoDocumento?: 'REMESA' | 'FACTURA_EMITIDA'; sourceId?: string; importeCentimos: number; motivoDiferencia?: string }>
export type ReceiptProposalSource = Readonly<{
  propuestaId: string
  generacionId: string
  movimientoId: string
  metodo: string
  fingerprint: string
  estadoPropuesto: string
  nivel: string
  importeMovimientoCentimos: number
  fechaBanco: string
  versionB4: number
  lineas: readonly ReceiptRemittanceLine[]
  composicion: unknown
}>
export type ReceiptInvoiceSource = Readonly<{
  facturaEmitidaId: string
  facturaISPId: number | null
  facturaISPGestionId: number | null
  facturaEmitidaTotalCentimos: number | null
  facturaEmitidaFecha: string | null
  facturaISPTotalCentimos: number | null
  facturaISPFecha: string | null
  remesaId: number | null
}>
export type ReceiptAllocation = Readonly<{
  facturaEmitidaId: string
  facturaISPId: number
  importeCentimos: number
  compositionOrdinals: readonly number[]
  sourceHash: string
  snapshot: Readonly<Record<string, unknown>>
}>
export type ReceiptPlan = Readonly<{
  schemaVersion: typeof B7_REMESA_RECEIPT_SCHEMA_VERSION
  propuestaId: string
  generacionId: string
  movimientoId: string
  remesaId: number
  proposalFingerprint: string
  compositionHash: string
  importeBancoCentimos: number
  fechaBanco: string
  versionB4: number
  allocations: readonly ReceiptAllocation[]
}>

export function remittanceMethod(value: unknown): value is 'REMESA_VENCIMIENTO' | 'REMESA_UNION' | 'REMESA_RESIDUO' {
  return value === 'REMESA_VENCIMIENTO' || value === 'REMESA_UNION' || value === 'REMESA_RESIDUO'
}
function remesaFromLines(lines: readonly ReceiptRemittanceLine[], bankCents: number): number {
  if (!Array.isArray(lines) || lines.length !== 1) receiptFail(422, 'REMESA_LINEAS_B4_INEXACTAS', 'La propuesta de remesa debe tener una sola línea documental.')
  const line = lines[0]
  if (!line || line.tipo !== 'DOCUMENTO' || line.tipoDocumento !== 'REMESA' || typeof line.sourceId !== 'string' || !/^\d+$/.test(line.sourceId)
    || !Number.isSafeInteger(line.importeCentimos) || line.importeCentimos !== bankCents || bankCents <= 0) {
    receiptFail(422, 'REMESA_LINEAS_B4_INEXACTAS', 'La remesa debe cerrar el abono positivo con una única línea REMESA exacta y sin diferencias.')
  }
  const remesaId = Number(line.sourceId)
  if (!Number.isSafeInteger(remesaId) || remesaId < 1) receiptFail(422, 'REMESA_LINEAS_B4_INEXACTAS', 'La remesa no tiene identificador numérico verificable.')
  return remesaId
}
/**
 * Produces the only allowed receipt allocation.  Every allocation is the sum of
 * explicit composition rows, never a proportional share of the remittance.
 */
export function buildRemittanceReceiptPlan(proposal: ReceiptProposalSource, sources: readonly ReceiptInvoiceSource[]): ReceiptPlan {
  if (!remittanceMethod(proposal.metodo) || proposal.estadoPropuesto !== 'JUSTIFICADO' || proposal.importeMovimientoCentimos <= 0) {
    receiptFail(422, 'REMESA_PROPUESTA_NO_CONFIRMABLE', 'La propuesta no es un abono positivo de remesa justificable.')
  }
  if (!isReceiptHash(proposal.fingerprint) || !Number.isSafeInteger(proposal.versionB4) || proposal.versionB4 < 1) {
    receiptFail(409, 'REMESA_PROPUESTA_CAMBIADA', 'La propuesta de remesa no conserva una huella o versión B4 verificable.')
  }
  const fechaBanco = day(proposal.fechaBanco, 'movimiento.fecha')
  const remesaId = remesaFromLines(proposal.lineas, proposal.importeMovimientoCentimos)
  const composition = parseReceiptComposition(proposal.composicion)
  if (composition.totalCentimos !== proposal.importeMovimientoCentimos) {
    receiptFail(422, 'COMPOSICION_REMESA_NO_CIERRA_BANCO', 'Las líneas de composición deben sumar exactamente el abono bancario; no se prorratea.')
  }
  const sourceByFi = new Map<string, ReceiptInvoiceSource>()
  for (const source of sources) {
    if (!source || !UUID.test(source.facturaEmitidaId) || sourceByFi.has(source.facturaEmitidaId)) {
      receiptFail(422, 'MAPA_FI_ISP_AMBIGUO', 'El mapa FacturaEmitida–Factura ISP no es único.')
    }
    sourceByFi.set(source.facturaEmitidaId.toLowerCase(), source)
  }
  const grouped = new Map<string, { source: ReceiptInvoiceSource; amount: bigint; ordinals: number[] }>()
  for (const entry of composition.entries) {
    const source = sourceByFi.get(entry.facturaEmitidaId)
    if (!source || !Number.isSafeInteger(source.facturaISPId) || source.facturaISPId < 1 || !Number.isSafeInteger(source.facturaISPGestionId) || source.facturaISPGestionId < 1 || source.remesaId !== remesaId) {
      receiptFail(422, 'MAPA_FI_ISP_REMESA_INEXACTO', 'Una factura del abono no tiene un mapa FI–ISP–remesa explícito y vigente.')
    }
    if (!Number.isSafeInteger(source.facturaEmitidaTotalCentimos) || !Number.isSafeInteger(source.facturaISPTotalCentimos)
      || source.facturaEmitidaTotalCentimos <= 0 || source.facturaISPTotalCentimos <= 0
      || source.facturaEmitidaTotalCentimos !== source.facturaISPTotalCentimos
      || day(source.facturaEmitidaFecha, `factura emitida ${entry.facturaEmitidaId}.fecha`) > fechaBanco
      || day(source.facturaISPFecha, `factura ISP ${source.facturaISPId}.fecha`) > fechaBanco) {
      receiptFail(422, 'FUENTE_FI_ISP_INEXACTA', 'La factura FI/ISP no conserva importes positivos idénticos y fechas no posteriores al abono.')
    }
    const current = grouped.get(entry.facturaEmitidaId) ?? { source, amount: BigInt(0), ordinals: [] }
    current.amount += BigInt(entry.importeCentimos)
    current.ordinals.push(entry.ordinal)
    grouped.set(entry.facturaEmitidaId, current)
  }
  const allocations: ReceiptAllocation[] = []
  for (const [facturaEmitidaId, item] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const amount = safeNumber(item.amount, 'SUMA_FACTURA_RECIBO_FUERA_DE_RANGO')
    if (amount <= 0 || amount > item.source.facturaEmitidaTotalCentimos!) {
      receiptFail(422, 'RECIBO_REMESA_CAPACIDAD_EXCEDIDA', 'El abono supera la capacidad exacta de una factura; no se prorratea.')
    }
    const snapshot = {
      schemaVersion: B7_REMESA_RECEIPT_SCHEMA_VERSION,
      facturaEmitida: { id: facturaEmitidaId, totalCentimos: item.source.facturaEmitidaTotalCentimos, fecha: item.source.facturaEmitidaFecha },
      facturaISP: { id: item.source.facturaISPId, totalCentimos: item.source.facturaISPTotalCentimos, fecha: item.source.facturaISPFecha },
      fechaBanco,
      importeCentimos: amount,
      compositionOrdinals: [...item.ordinals],
    }
    allocations.push({ facturaEmitidaId, facturaISPId: item.source.facturaISPId!, importeCentimos: amount, compositionOrdinals: item.ordinals, sourceHash: remittanceReceiptHash(snapshot), snapshot })
  }
  if (!allocations.length) receiptFail(422, 'COMPOSICION_REMESA_INEXACTA', 'El abono no contiene ninguna factura asignable.')
  return {
    schemaVersion: B7_REMESA_RECEIPT_SCHEMA_VERSION,
    propuestaId: uuid(proposal.propuestaId, 'propuestaId'), generacionId: uuid(proposal.generacionId, 'generacionId'), movimientoId: proposal.movimientoId,
    remesaId, proposalFingerprint: proposal.fingerprint.toLowerCase(), compositionHash: composition.hash,
    importeBancoCentimos: proposal.importeMovimientoCentimos, fechaBanco, versionB4: proposal.versionB4, allocations,
  }
}

export function receiptSourceHash(input: Readonly<{
  receiptId?: string
  remesaId: number
  movimientoId: string
  vinculoB4Id: string
  operacionB4Id: string
  auditoriaB6Id: string
  propuestaId: string
  proposalFingerprint: string
  compositionHash: string
  allocations: readonly Pick<ReceiptAllocation, 'facturaEmitidaId' | 'facturaISPId' | 'importeCentimos' | 'sourceHash'>[]
}>): string {
  return remittanceReceiptHash({
    schemaVersion: B7_REMESA_RECEIPT_SCHEMA_VERSION,
    remesaId: input.remesaId, movimientoId: input.movimientoId, vinculoB4Id: input.vinculoB4Id,
    operacionB4Id: input.operacionB4Id, auditoriaB6Id: input.auditoriaB6Id, propuestaId: input.propuestaId,
    proposalFingerprint: input.proposalFingerprint, compositionHash: input.compositionHash,
    allocations: [...input.allocations].sort((left, right) => left.facturaEmitidaId.localeCompare(right.facturaEmitidaId)).map(line => ({
      facturaEmitidaId: line.facturaEmitidaId, facturaISPId: line.facturaISPId, importeCentimos: line.importeCentimos, sourceHash: line.sourceHash,
    })),
  })
}

export function receiptRequestHash(input: Readonly<{ actorId: number; propuestaId: string; movimientoId: string; fingerprint: string; compositionHash: string }>): string {
  return remittanceReceiptHash({ schemaVersion: B7_REMESA_RECEIPT_SCHEMA_VERSION, ...input })
}
