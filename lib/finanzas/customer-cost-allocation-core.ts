import { createHash } from 'node:crypto'

export const CUSTOMER_COST_ALLOCATION_AREA = 'admin.finanzas.analitica_costes'
export const CUSTOMER_COST_ALLOCATION_SCHEMA = 'CUSTOMER_COST_ALLOCATION_V1'
export const SERVICE_PERIOD = /^(20\d{2})-(0[1-9]|1[0-2])$/
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const SHA256 = /^[a-f0-9]{64}$/i
const ZERO = BigInt(0)
const ONE = BigInt(1)
const TWELVE = BigInt(12)

export type CustomerCostClassification = 'REPARTIBLE' | 'PUNTUAL' | 'ABONO_EXPLICITO'
export type SelectionInput = Readonly<{ clienteId: number; contratoId: number }>
export type AllocationRequest = Readonly<{
  action: 'preview' | 'confirm'
  fuenteId: string
  sourceVersion: number
  invoiceSnapshotHash: string
  periodoServicio: string
  clasificacion: CustomerCostClassification
  selecciones: readonly SelectionInput[]
  reversionDeRepartoId?: string
  idempotencyKey?: string
}>
export type AllocationPreparationRequest = Readonly<{
  action: 'prepare'
  facturaId: string
  invoiceSnapshotHash: string
  confirmarPreparacion: true
}>
export type ValidContractSale = Readonly<{
  clienteId: number
  clienteNombre: string
  contratoId: number
  contratoTitulo: string
  ventaPeriodoCentimos: bigint
  unidadesPeriodoMeses: 1 | 3 | 12
  ventaNormalizadaDoceavosCentimo: bigint
  snapshot: Record<string, unknown>
}>
export type AllocationLine = Readonly<{
  clienteId: number
  clienteNombre: string
  ventaNormalizadaDoceavosCentimo: bigint
  costeCentimos: bigint
  restoNumerador: bigint
  ordenResto: number
  contratoIds: readonly number[]
}>

export class CustomerCostAllocationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
function exactKeys(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) throw new CustomerCostAllocationError('PAYLOAD_INVALID', 'El cuerpo debe ser un objeto JSON.')
  const actual = Object.keys(value)
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key)) || keys.some(key => !(key in value))) {
    throw new CustomerCostAllocationError('PAYLOAD_INVALID', 'El cuerpo contiene claves fuera del contrato.')
  }
  return value
}
function allowedKeys(value: unknown, required: readonly string[], optional: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) throw new CustomerCostAllocationError('PAYLOAD_INVALID', 'El cuerpo debe ser un objeto JSON.')
  const actual = Object.keys(value)
  const permitted = [...required, ...optional]
  if (actual.some(key => !permitted.includes(key)) || required.some(key => !(key in value))) {
    throw new CustomerCostAllocationError('PAYLOAD_INVALID', 'El cuerpo contiene claves fuera del contrato.')
  }
  return value
}
function safeInteger(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new CustomerCostAllocationError('PAYLOAD_INVALID', `${field} debe ser un entero válido.`)
  return Number(value)
}
function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new CustomerCostAllocationError('PAYLOAD_INVALID', `${field} debe ser un UUID válido.`)
  return value.toLowerCase()
}
function hash(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new CustomerCostAllocationError('PAYLOAD_INVALID', `${field} debe ser un SHA-256 válido.`)
  return value
}
function period(value: unknown): string {
  if (typeof value !== 'string' || !SERVICE_PERIOD.test(value)) throw new CustomerCostAllocationError('PAYLOAD_INVALID', 'periodoServicio debe ser YYYY-MM.')
  return value
}

/** Strict parser shared by preview and confirmation. */
export function parseAllocationRequest(raw: unknown): AllocationRequest {
  if (!isRecord(raw)) throw new CustomerCostAllocationError('PAYLOAD_INVALID', 'El cuerpo debe ser un objeto JSON.')
  const action = raw.action
  if (action !== 'preview' && action !== 'confirm') throw new CustomerCostAllocationError('ACTION_INVALID', 'action debe ser preview o confirm.')
  const required = ['action', 'fuenteId', 'sourceVersion', 'invoiceSnapshotHash', 'periodoServicio', 'clasificacion', 'selecciones']
  const optional = action === 'confirm' ? ['reversionDeRepartoId', 'idempotencyKey'] : ['reversionDeRepartoId']
  const value = allowedKeys(raw, required, optional)
  const clasificacion = value.clasificacion
  if (clasificacion !== 'REPARTIBLE' && clasificacion !== 'PUNTUAL' && clasificacion !== 'ABONO_EXPLICITO') {
    throw new CustomerCostAllocationError('CLASSIFICATION_INVALID', 'La clasificación no es válida.')
  }
  if (!Array.isArray(value.selecciones) || value.selecciones.length > 250) throw new CustomerCostAllocationError('SELECTION_INVALID', 'selecciones debe contener como máximo 250 contratos.')
  const seenContracts = new Set<number>()
  const selections = value.selecciones.map((item, index) => {
    const selected = exactKeys(item, ['clienteId', 'contratoId'])
    const clienteId = safeInteger(selected.clienteId, `selecciones[${index}].clienteId`, 1)
    const contratoId = safeInteger(selected.contratoId, `selecciones[${index}].contratoId`, 1)
    if (seenContracts.has(contratoId)) throw new CustomerCostAllocationError('SELECTION_DUPLICATED', 'Un contrato sólo puede seleccionarse una vez.')
    seenContracts.add(contratoId)
    return { clienteId, contratoId }
  })
  const reverse = value.reversionDeRepartoId === undefined || value.reversionDeRepartoId === null
    ? undefined : uuid(value.reversionDeRepartoId, 'reversionDeRepartoId')
  if (clasificacion === 'PUNTUAL' && selections.length) throw new CustomerCostAllocationError('PUNTUAL_WITH_SELECTION', 'Un coste puntual no admite clientes ni contratos repartidos.')
  if (clasificacion === 'REPARTIBLE' && selections.length === 0) throw new CustomerCostAllocationError('SELECTION_REQUIRED', 'Selecciona explícitamente al menos un contrato.')
  if (clasificacion === 'ABONO_EXPLICITO' && (!reverse || selections.length === 0)) {
    throw new CustomerCostAllocationError('NEGATIVE_MAPPING_REQUIRED', 'Un abono exige reparto previo y mapeo manual explícito.')
  }
  return {
    action,
    fuenteId: uuid(value.fuenteId, 'fuenteId'),
    sourceVersion: safeInteger(value.sourceVersion, 'sourceVersion', 1),
    invoiceSnapshotHash: hash(value.invoiceSnapshotHash, 'invoiceSnapshotHash'),
    periodoServicio: period(value.periodoServicio),
    clasificacion,
    selecciones: selections,
    ...(reverse ? { reversionDeRepartoId: reverse } : {}),
    ...(action === 'confirm' ? { idempotencyKey: uuid(value.idempotencyKey, 'idempotencyKey') } : {}),
  }
}

/**
 * Preparing a source is deliberately a separate, explicit human action. It
 * never mutates the received invoice: it only creates additive source,
 * document and audit evidence before a later allocation decision.
 */
export function parseAllocationPreparationRequest(raw: unknown): AllocationPreparationRequest {
  const value = exactKeys(raw, ['action', 'facturaId', 'invoiceSnapshotHash', 'confirmarPreparacion'])
  if (value.action !== 'prepare') throw new CustomerCostAllocationError('ACTION_INVALID', 'action debe ser prepare.')
  if (value.confirmarPreparacion !== true) {
    throw new CustomerCostAllocationError('PREPARATION_CONFIRMATION_REQUIRED', 'Confirma la preparación de la factura antes de continuar.')
  }
  return {
    action: 'prepare',
    facturaId: uuid(value.facturaId, 'facturaId'),
    invoiceSnapshotHash: hash(value.invoiceSnapshotHash, 'invoiceSnapshotHash'),
    confirmarPreparacion: true,
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('CUSTOMER_COST_CANONICAL_NON_FINITE')
    return JSON.stringify(value)
  }
  if (typeof value === 'bigint') return JSON.stringify(value.toString())
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  throw new Error('CUSTOMER_COST_CANONICAL_UNSUPPORTED')
}
export function sha256Canonical(value: unknown): string { return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex') }
export function currentUtcPeriod(now = new Date()): string { return now.toISOString().slice(0, 7) }
export function periodBounds(periodoServicio: string): Readonly<{ start: Date; endExclusive: Date }> {
  if (!SERVICE_PERIOD.test(periodoServicio)) throw new CustomerCostAllocationError('SERVICE_PERIOD_INVALID', 'Período de servicio no válido.')
  const start = new Date(`${periodoServicio}-01T00:00:00.000Z`)
  const endExclusive = new Date(start); endExclusive.setUTCMonth(endExclusive.getUTCMonth() + 1)
  return { start, endExclusive }
}
export function eurosToCentsExact(value: unknown, label: string): bigint {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) throw new CustomerCostAllocationError('MONEY_INVALID', `${label} no es un importe finito.`)
  const cents = Math.round(number * 100)
  if (!Number.isSafeInteger(cents) || Math.abs(number * 100 - cents) > 1e-7) throw new CustomerCostAllocationError('MONEY_INVALID', `${label} debe tener como máximo dos decimales.`)
  return BigInt(cents)
}
export function verifiedUnits(value: unknown): 1 | 3 | 12 | null {
  return value === 1 || value === 3 || value === 12 ? value : null
}
export function normalizedTwelfthCents(ventaPeriodoCentimos: bigint, units: 1 | 3 | 12): bigint {
  if (ventaPeriodoCentimos <= ZERO) throw new CustomerCostAllocationError('SALE_NOT_POSITIVE', 'La venta contractual debe ser positiva.')
  return ventaPeriodoCentimos * (TWELVE / BigInt(units))
}

/**
 * Largest-remainder allocation. We allocate at the client level (not contract
 * level) so a client's weight is exactly the sum of its selected contract sales.
 */
export function apportionCostLargestRemainder(
  costeCentimos: bigint,
  sales: readonly Pick<ValidContractSale, 'clienteId' | 'clienteNombre' | 'contratoId' | 'ventaNormalizadaDoceavosCentimo'>[],
): readonly AllocationLine[] {
  if (costeCentimos === ZERO) throw new CustomerCostAllocationError('ZERO_COST', 'Una base cero no genera reparto.')
  const grouped = new Map<number, { clienteNombre: string; sales: bigint; contratoIds: number[] }>()
  for (const sale of sales) {
    if (!Number.isSafeInteger(sale.clienteId) || sale.clienteId <= 0 || sale.ventaNormalizadaDoceavosCentimo <= ZERO) {
      throw new CustomerCostAllocationError('SALE_NOT_POSITIVE', 'No se puede generar un peso con venta no positiva.')
    }
    const current = grouped.get(sale.clienteId) || { clienteNombre: sale.clienteNombre, sales: ZERO, contratoIds: [] }
    current.sales += sale.ventaNormalizadaDoceavosCentimo
    current.contratoIds.push(sale.contratoId)
    grouped.set(sale.clienteId, current)
  }
  if (!grouped.size) throw new CustomerCostAllocationError('SALE_REQUIRED', 'No hay ventas positivas seleccionadas.')
  const totalSales = [...grouped.values()].reduce((sum, value) => sum + value.sales, ZERO)
  if (totalSales <= ZERO) throw new CustomerCostAllocationError('SALE_REQUIRED', 'La venta contractual total debe ser positiva.')
  const absoluteCost = costeCentimos < ZERO ? -costeCentimos : costeCentimos
  const candidates = [...grouped.entries()].map(([clienteId, value]) => {
    const numerator = absoluteCost * value.sales
    return { clienteId, clienteNombre: value.clienteNombre, sales: value.sales, contratoIds: value.contratoIds.sort((a, b) => a - b), base: numerator / totalSales, remainder: numerator % totalSales }
  })
  const floorSum = candidates.reduce((sum, item) => sum + item.base, ZERO)
  const unitsToDistribute = absoluteCost - floorSum
  const ordered = [...candidates].sort((a, b) => b.remainder === a.remainder ? a.clienteId - b.clienteId : (a.remainder > b.remainder ? -1 : 1))
  const recipients = new Set(ordered.slice(0, Number(unitsToDistribute)).map(item => item.clienteId))
  const rank = new Map(ordered.map((item, index) => [item.clienteId, index + 1]))
  const sign = costeCentimos < ZERO ? -ONE : ONE
  const output = candidates.sort((a, b) => a.clienteId - b.clienteId).map(item => Object.freeze({
    clienteId: item.clienteId,
    clienteNombre: item.clienteNombre,
    ventaNormalizadaDoceavosCentimo: item.sales,
    costeCentimos: sign * (item.base + (recipients.has(item.clienteId) ? ONE : ZERO)),
    restoNumerador: item.remainder,
    ordenResto: rank.get(item.clienteId) || 0,
    contratoIds: Object.freeze(item.contratoIds),
  }))
  const closed = output.reduce((sum, line) => sum + line.costeCentimos, ZERO)
  if (closed !== costeCentimos) throw new Error('CUSTOMER_COST_ALLOCATION_DOES_NOT_CLOSE')
  return Object.freeze(output)
}

export function allocationPayloadHash(input: AllocationRequest): string {
  const { action: _action, idempotencyKey: _idempotencyKey, ...semantic } = input
  return sha256Canonical({ schema: CUSTOMER_COST_ALLOCATION_SCHEMA, ...semantic })
}

export function assertClassificationForCost(clasificacion: CustomerCostClassification, costeCentimos: bigint): void {
  if (clasificacion === 'PUNTUAL') {
    if (costeCentimos < ZERO) throw new CustomerCostAllocationError('NEGATIVE_EXPLICIT_MAPPING_REQUIRED', 'Un abono no puede registrarse como puntual; exige mapeo negativo explícito.')
    if (costeCentimos === ZERO) throw new CustomerCostAllocationError('ZERO_COST', 'Una base cero no puede registrarse como reparto ni como coste puntual.')
    return
  }
  if (clasificacion === 'REPARTIBLE' && costeCentimos <= ZERO) {
    throw new CustomerCostAllocationError(costeCentimos < ZERO ? 'NEGATIVE_EXPLICIT_MAPPING_REQUIRED' : 'ZERO_COST', costeCentimos < ZERO ? 'Un abono sólo admite mapeo negativo explícito.' : 'Una base cero no se reparte.')
  }
  if (clasificacion === 'ABONO_EXPLICITO' && costeCentimos >= ZERO) {
    throw new CustomerCostAllocationError('ABONO_SIGN_INVALID', 'El mapeo de abono sólo admite una base negativa.')
  }
}
