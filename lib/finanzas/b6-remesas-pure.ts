/*
 * B6 remesas — funciones puras.
 *
 * Este módulo no importa Prisma, no lee el entorno ni toca red/BD. Es el contrato
 * determinista que comparten la ruta, el servicio y las pruebas externas.
 */
import { createHash } from 'crypto'

export const B6_AUDIT_SCHEMA_VERSION = 'B6_REMESAS_V1'
export const B6_FACTURAS_SOURCE_HASH_VERSION = 'B6_FACTURAS_SOURCE_V1'
export const B6_MAX_FACTURAS_POR_ASOCIACION = 2_000
export const B6_INT_MIN = -2_147_483_648
export const B6_INT_MAX = 2_147_483_647

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[0-9a-f]{64}$/i

type JsonRecord = Record<string, unknown>

export class B6RemesaServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'B6RemesaServiceError'
  }
}

export function b6Fail(status: number, code: string, message: string, details?: unknown): never {
  throw new B6RemesaServiceError(status, code, message, details)
}

function own(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

export function exactObjectKeys(value: unknown, keys: readonly string[], label = 'El cuerpo'): asserts value is JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    b6Fail(400, 'VALIDATION_ERROR', `${label} debe ser un objeto JSON.`)
  }
  const record = value as JsonRecord
  const actual = Object.keys(record)
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)) || keys.some((key) => !own(record, key))) {
    b6Fail(400, 'VALIDATION_ERROR', `${label} contiene claves fuera del contrato.`)
  }
}

export function positiveInt(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > B6_INT_MAX) {
    b6Fail(400, 'VALIDATION_ERROR', `${label} debe ser un entero positivo dentro de Int.`)
  }
  return value as number
}

export function signedInt(value: unknown, label: string, nonZero = false): number {
  if (!Number.isSafeInteger(value) || (value as number) < B6_INT_MIN || (value as number) > B6_INT_MAX || (nonZero && value === 0)) {
    b6Fail(400, 'VALIDATION_ERROR', `${label} debe ser un Int firmado${nonZero ? ' distinto de cero' : ''}.`)
  }
  return value as number
}

export function opaqueId(value: unknown, label: string, maxLength = 160): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength) {
    b6Fail(400, 'VALIDATION_ERROR', `${label} no es un identificador válido.`)
  }
  return value
}

export function uuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    b6Fail(400, 'VALIDATION_ERROR', `${label} debe ser UUID.`)
  }
  return value.toLowerCase()
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Canonical JSON restricted to JSON values; object keys are lexicographically sorted. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('B6_CANONICAL_NON_FINITE_NUMBER')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as JsonRecord
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  throw new Error('B6_CANONICAL_UNSUPPORTED_VALUE')
}

export function canonicalSha256(value: unknown): string {
  return sha256(canonicalJson(value))
}

export type AsociarFacturasInput = Readonly<{
  action: 'asociar_facturas'
  remesaId: number
  facturaIdsISP: readonly number[]
  confirmacion: true
  idempotencyKey: string
  expectedRemesaTotalCentimos: number
  expectedRemesaHashSHA256: string
  expectedFacturasHashSHA256: string
}>

export type AsociarDevolucionInput = Readonly<{
  action: 'asociar_devolucion'
  remesaId: number
  facturaISPId: number
  vinculoId: string
  movimientoId: string
  confirmacion: true
  idempotencyKey: string
}>

/**
 * The external list is normalized to ascending canonical order before hashing.
 * This keeps the same set selected by a human idempotent even if its UI order
 * changes; duplicate source IDs remain an explicit validation error.
 */
export function parseAsociarFacturasInput(raw: unknown): AsociarFacturasInput {
  exactObjectKeys(raw, [
    'action', 'remesaId', 'facturaIdsISP', 'confirmacion', 'idempotencyKey',
    'expectedRemesaTotalCentimos', 'expectedRemesaHashSHA256', 'expectedFacturasHashSHA256',
  ])
  const value = raw as JsonRecord
  if (value.action !== 'asociar_facturas') b6Fail(400, 'VALIDATION_ERROR', 'action debe ser asociar_facturas.')
  if (!Array.isArray(value.facturaIdsISP) || value.facturaIdsISP.length < 1 || value.facturaIdsISP.length > B6_MAX_FACTURAS_POR_ASOCIACION) {
    b6Fail(400, 'VALIDATION_ERROR', `facturaIdsISP debe contener entre 1 y ${B6_MAX_FACTURAS_POR_ASOCIACION} IDs.`)
  }
  const suppliedIds = value.facturaIdsISP.map((id, index) => positiveInt(id, `facturaIdsISP[${index}]`))
  if (new Set(suppliedIds).size !== suppliedIds.length) {
    b6Fail(400, 'VALIDATION_ERROR', 'facturaIdsISP no admite duplicados.')
  }
  const facturaIdsISP = [...suppliedIds].sort((left, right) => left - right)
  if (value.confirmacion !== true) b6Fail(400, 'CONFIRMACION_REQUERIDA', 'La asociación requiere confirmacion: true.')
  if(typeof value.expectedRemesaHashSHA256!=='string'||!SHA256.test(value.expectedRemesaHashSHA256))b6Fail(400,'VALIDATION_ERROR','expectedRemesaHashSHA256 debe ser SHA-256.')
  if (typeof value.expectedFacturasHashSHA256 !== 'string' || !SHA256.test(value.expectedFacturasHashSHA256)) {
    b6Fail(400, 'VALIDATION_ERROR', 'expectedFacturasHashSHA256 debe ser SHA-256 hexadecimal.')
  }
  return {
    action: 'asociar_facturas',
    remesaId: positiveInt(value.remesaId, 'remesaId'),
    facturaIdsISP,
    confirmacion: true,
    idempotencyKey: uuid(value.idempotencyKey, 'idempotencyKey'),
    expectedRemesaHashSHA256: (value.expectedRemesaHashSHA256 as string).toLowerCase(),
    expectedRemesaTotalCentimos: signedInt(value.expectedRemesaTotalCentimos, 'expectedRemesaTotalCentimos', true),
    expectedFacturasHashSHA256: value.expectedFacturasHashSHA256.toLowerCase(),
  }
}

export function parseAsociarDevolucionInput(raw: unknown): AsociarDevolucionInput {
  exactObjectKeys(raw, ['action', 'remesaId', 'facturaISPId', 'vinculoId', 'movimientoId', 'confirmacion', 'idempotencyKey'])
  const value = raw as JsonRecord
  if (value.action !== 'asociar_devolucion') b6Fail(400, 'VALIDATION_ERROR', 'action debe ser asociar_devolucion.')
  if (value.confirmacion !== true) b6Fail(400, 'CONFIRMACION_REQUERIDA', 'La asociación de devolución requiere confirmacion: true.')
  return {
    action: 'asociar_devolucion',
    remesaId: positiveInt(value.remesaId, 'remesaId'),
    facturaISPId: positiveInt(value.facturaISPId, 'facturaISPId'),
    vinculoId: uuid(value.vinculoId, 'vinculoId'),
    movimientoId: opaqueId(value.movimientoId, 'movimientoId'),
    confirmacion: true,
    idempotencyKey: uuid(value.idempotencyKey, 'idempotencyKey'),
  }
}

/** Stable request hash: it never includes source rows or mutable membership. */
export function requestHash(input: AsociarFacturasInput | AsociarDevolucionInput): string {
  return canonicalSha256(input)
}

export type FacturaFuenteHash = Readonly<{
  id: number
  ispGestionId: number
  fecha: string
  totalCentimos: number
}>

/**
 * This is the value sent in expectedFacturasHashSHA256. It covers only immutable
 * invoice identity/date/signed source cents: never Factura.remesaId, legacy state,
 * FI mirror, or an audit timestamp.
 */
export function facturasSourceHash(facturas: readonly FacturaFuenteHash[]): string {
  const sorted = [...facturas].sort((left, right) => left.id - right.id)
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1].id === sorted[index].id) throw new Error('B6_SOURCE_DUPLICATE_FACTURA')
  }
  return canonicalSha256({ version: B6_FACTURAS_SOURCE_HASH_VERSION, facturas: sorted })
}

export function remesaSourceFingerprint(remesa: Readonly<{ id: number; ispGestionId: number; fecha: string; totalCentimos: number }>): string {
  return canonicalSha256({ version: B6_FACTURAS_SOURCE_HASH_VERSION, remesa })
}

export type FacturaFuenteActual = FacturaFuenteHash & Readonly<{
  remesaIdAntes: number | null
  facturaEmitidaActual: Readonly<{ id: string; totalCentimos: number }> | null
}>

export type SimulacionAsociacionFuente = Readonly<{
  remesa: Readonly<{ id: number; ispGestionId: number; fecha: string; totalCentimos: number }>
  facturas: readonly FacturaFuenteActual[]
}>

function sumSignedInt(values: readonly number[], label: string): number {
  let total = BigInt(0)
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < B6_INT_MIN || value > B6_INT_MAX) {
      b6Fail(422, 'IMPORTE_FUENTE_NO_EXACTO', `${label} contiene un Int de céntimos inválido.`)
    }
    total += BigInt(value)
  }
  if (total < BigInt(B6_INT_MIN) || total > BigInt(B6_INT_MAX)) {
    b6Fail(422, 'SUMA_CENTIMOS_FUERA_DE_RANGO', `${label} desborda Int de céntimos.`)
  }
  return Number(total)
}

/**
 * Pure closure proof used after the service has read and locked its real source
 * rows. It permits signed invoices; it never applies abs() or a rounding residual.
 */
export function simulateAssociationValidation(input: AsociarFacturasInput, source: SimulacionAsociacionFuente): Readonly<{
  facturasHashSHA256: string
  sumaFacturasCentimos: number
}> {
  if (source.remesa.id !== input.remesaId) b6Fail(409, 'REMESA_CAMBIADA', 'La fuente de remesa no corresponde a la solicitud.')
  if (source.remesa.totalCentimos !== input.expectedRemesaTotalCentimos) {
    b6Fail(409, 'TOTAL_REMESA_CAMBIADO', 'El total firmado de la remesa cambió; relea antes de confirmar.')
  }
  if(remesaSourceFingerprint(source.remesa)!==input.expectedRemesaHashSHA256)b6Fail(409,'FUENTE_REMESA_CAMBIADA','La identidad, fecha o total de remesa cambió; relea antes de confirmar.')
  const byId = new Map(source.facturas.map((factura) => [factura.id, factura]))
  if (byId.size !== source.facturas.length || input.facturaIdsISP.some((id) => !byId.has(id))) {
    b6Fail(404, 'FACTURA_ISP_NO_ENCONTRADA', 'Una factura ISP no existe.')
  }
  const selected = input.facturaIdsISP.map((id) => byId.get(id)!)
  for (const factura of selected) {
    if (factura.remesaIdAntes !== null && factura.remesaIdAntes !== input.remesaId) {
      b6Fail(409, 'FACTURA_YA_EN_OTRA_REMESA', 'B6 no reasigna una factura ISP.')
    }
    if (factura.facturaEmitidaActual && factura.facturaEmitidaActual.totalCentimos !== factura.totalCentimos) {
      b6Fail(422, 'ESPEJO_FI_ISP_INCOHERENTE', 'El espejo FacturaEmitida con FK explícita no coincide exactamente con Factura ISP.')
    }
  }
  const actualHash = facturasSourceHash(selected.map(({ id, ispGestionId, fecha, totalCentimos }) => ({ id, ispGestionId, fecha, totalCentimos })))
  if (actualHash !== input.expectedFacturasHashSHA256) {
    b6Fail(409, 'FUENTE_FACTURAS_CAMBIADA', 'La identidad, fecha o importe firmado de una factura cambió; relea antes de confirmar.')
  }
  const sum = sumSignedInt(selected.map((factura) => factura.totalCentimos), 'La suma de facturas')
  if (sum !== source.remesa.totalCentimos) {
    b6Fail(422, 'SUMA_FACTURAS_NO_CIERRA_REMESA', 'La suma firmada exacta de facturas debe igualar el total firmado de la remesa.')
  }
  return { facturasHashSHA256: actualHash, sumaFacturasCentimos: sum }
}

export type SimulacionDevolucionFuente = Readonly<{
  remesaId: number
  facturaISPId: number
  facturaRemesaId: number | null
  facturaObjetivoCentimos: number
  bancoCentimos: number
  cierreB4Centimos: number
  numeroLineasDocumentoB4: number
  vinculo: Readonly<{
    id: string
    movimientoId: string
    activo: boolean
    tipoLinea: 'DOCUMENTO' | 'DIFERENCIA'
    importeCentimos: number
    documentoActivo: boolean
    documentoTipo: string
    documentoRemesaId: number | null
    operacionEstado: string
    operacionRevertida: boolean
    movimientoEstado: string
  }>
  yaDevueltoVigenteCentimos: number
  vinculoYaUsado: boolean
}>

/** Pure, non-prorating refund proof; the DB service supplies only locked rows. */
export function simulateRefundValidation(input: AsociarDevolucionInput, source: SimulacionDevolucionFuente): Readonly<{ importeCentimos: number; capacidadRestanteCentimos: number }> {
  const link = source.vinculo
  if (source.remesaId !== input.remesaId || source.facturaISPId !== input.facturaISPId || source.facturaRemesaId !== input.remesaId) {
    b6Fail(409, 'MEMBRESIA_REMESA_INVALIDA', 'La factura ISP no pertenece a la remesa indicada.')
  }
  if (source.vinculoYaUsado) b6Fail(409, 'VINCULO_B4_YA_ASIGNADO', 'La línea B4 ya conserva una asignación de devolución B6.')
  if (!link.activo || link.tipoLinea !== 'DOCUMENTO' || !link.documentoActivo || link.documentoTipo !== 'REMESA' || link.documentoRemesaId !== input.remesaId || link.movimientoId !== input.movimientoId || link.operacionEstado !== 'APLICADA' || link.operacionRevertida || link.movimientoEstado !== 'JUSTIFICADO') {
    b6Fail(422, 'EVIDENCIA_B4_DEVOLUCION_INVALIDA', 'El vínculo no es una línea B4 REMESA activa y actualmente justificada.')
  }
  if (!Number.isSafeInteger(source.bancoCentimos) || source.bancoCentimos >= 0 || source.cierreB4Centimos !== source.bancoCentimos || source.numeroLineasDocumentoB4 !== 1 || link.importeCentimos >= 0) {
    b6Fail(422, 'IMPORTE_BANCO_VINCULO_INVALIDO', 'La línea principal negativa y las diferencias explícitas deben cerrar exactamente el banco con un único documento; no se prorratea.')
  }
  if (!Number.isSafeInteger(source.facturaObjetivoCentimos) || source.facturaObjetivoCentimos <= 0) {
    b6Fail(422, 'OBJETIVO_FACTURA_INVALIDO', 'La factura ISP no tiene un objetivo positivo exacto para una devolución.')
  }
  if (!Number.isSafeInteger(source.yaDevueltoVigenteCentimos) || source.yaDevueltoVigenteCentimos < 0 || source.yaDevueltoVigenteCentimos > B6_INT_MAX) {
    b6Fail(422, 'DEVOLUCIONES_PREVIAS_INVALIDAS', 'Las devoluciones vigentes no son exactas.')
  }
  const next = BigInt(source.yaDevueltoVigenteCentimos) + (-BigInt(link.importeCentimos))
  if (next > BigInt(source.facturaObjetivoCentimos) || next > BigInt(B6_INT_MAX)) {
    b6Fail(422, 'DEVOLUCION_EXCEDE_FACTURA', 'La línea completa excede la capacidad positiva de la factura; no existe prorrateo B6.')
  }
  return { importeCentimos: link.importeCentimos, capacidadRestanteCentimos: source.facturaObjetivoCentimos - Number(next) }
}
