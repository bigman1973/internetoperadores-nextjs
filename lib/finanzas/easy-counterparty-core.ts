import { createHash } from 'node:crypto'

export const EASY_COUNTERPARTY_SCHEMA = 'EASY_COUNTERPARTY_V1' as const
export const EASY_COUNTERPARTY_SUGGESTION_PREFIX = 'p1_' as const
export const EASY_COUNTERPARTY_MAX_LIMIT = 100
export const EASY_COUNTERPARTY_MAX_OFFSET = 100_000
export const EASY_COUNTERPARTY_MAX_QUERY = 120
export const EASY_COUNTERPARTY_MAX_SEARCH_LIMIT = 50

export const COUNTERPARTY_TYPES = ['CLIENTE', 'PROVEEDOR', 'BANCO', 'CUENTA_PROPIA', 'EMPLEADO'] as const
export type CounterpartyType = typeof COUNTERPARTY_TYPES[number]
export const COUNTERPARTY_ORIGINS = [
  'ENTIDAD_FISCAL', 'EMPLEADO', 'NOMINA_EMPLEADO', 'FACTURA_RECIBIDA', 'FACTURA_EMITIDA',
  'CLIENTE_CONTRATO_ACTUAL', 'CUENTA_PROPIA_ACTUAL', 'MANUAL', 'AUTO_RECIBO',
] as const
export type CounterpartyOrigin = typeof COUNTERPARTY_ORIGINS[number]
export type CounterpartyStepState = 'IDENTIFICADO' | 'PROPUESTO' | 'SIN_IDENTIFICAR'
export type CounterpartyDirection = 'TODOS' | 'CARGOS' | 'COBROS'

export class EasyCounterpartyValidationError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}
function fail(status: number, code: string, message: string): never {
  throw new EasyCounterpartyValidationError(status, code, message)
}
function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
function exactKeys(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) fail(400, 'VALIDATION_ERROR', 'El cuerpo debe ser un objeto JSON.')
  const keys = Object.keys(value)
  if (keys.length !== allowed.length || keys.some(key => !allowed.includes(key)) || allowed.some(key => !Object.prototype.hasOwnProperty.call(value, key))) {
    fail(400, 'VALIDATION_ERROR', 'El cuerpo contiene claves fuera del contrato de terceros.')
  }
  return value
}
function text(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > maximum) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return value
}
function integer(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return value as number
}
function uuidV4(value: unknown, field: string): string {
  const candidate = text(value, field, 64)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) fail(400, 'VALIDATION_ERROR', `${field} debe ser un UUID v4.`)
  return candidate.toLowerCase()
}
function canonicalUuid(value: unknown, field: string): string {
  const candidate = text(value, field, 64)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)) fail(400, 'VALIDATION_ERROR', `${field} debe ser un UUID canónico.`)
  return candidate.toLowerCase()
}
function day(value: string | null | undefined, field: string, required = false): string | undefined {
  if (value === null || value === undefined || value === '') {
    if (required) fail(400, 'VALIDATION_ERROR', `${field} es obligatorio.`)
    return undefined
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, 'VALIDATION_ERROR', `${field} debe usar YYYY-MM-DD.`)
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(400, 'VALIDATION_ERROR', `${field} no es una fecha válida.`)
  return value
}

export type CounterpartyReadInput = Readonly<{
  desde: string
  hasta: string
  limit: number
  offset: number
  q?: string
  sentido: CounterpartyDirection
  tarjeta?: '9029' | '6440'
  /** Closed queue selector. When true, pagination happens over P1 non-identified rows. */
  pendientes?: true
}>

/** Reads use the same closed query surface as Modo Fácil, but P1 contains every movement in the window. */
export function parseCounterpartyReadInput(raw: Readonly<Record<string, string | null | undefined>>): CounterpartyReadInput {
  const desde = day(raw.desde, 'desde', true)!
  const hasta = day(raw.hasta, 'hasta', true)!
  if (desde > hasta) fail(400, 'VALIDATION_ERROR', 'desde no puede ser posterior a hasta.')
  const rawLimit = raw.limit ?? '25'
  const rawOffset = raw.offset ?? '0'
  if (!/^\d{1,3}$/.test(rawLimit) || !/^\d{1,6}$/.test(rawOffset)) fail(400, 'VALIDATION_ERROR', 'limit u offset no son válidos.')
  const limit = integer(Number(rawLimit), 'limit', 1, EASY_COUNTERPARTY_MAX_LIMIT)
  const offset = integer(Number(rawOffset), 'offset', 0, EASY_COUNTERPARTY_MAX_OFFSET)
  const sentido = raw.sentido ?? 'TODOS'
  if (sentido !== 'TODOS' && sentido !== 'CARGOS' && sentido !== 'COBROS') fail(400, 'VALIDATION_ERROR', 'sentido no es válido.')
  const q = raw.q === null || raw.q === undefined ? undefined : raw.q.trim()
  if (q !== undefined && (q.length === 0 || q.length > EASY_COUNTERPARTY_MAX_QUERY)) fail(400, 'VALIDATION_ERROR', 'q no es válido.')
  const card = raw.tarjeta
  if (card !== undefined && card !== null && card !== '' && card !== '9029' && card !== '6440') fail(400, 'VALIDATION_ERROR', 'tarjeta sólo admite 9029 o 6440.')
  const pendientes = raw.pendientes
  if (pendientes !== undefined && pendientes !== null && pendientes !== '' && pendientes !== 'SI') fail(400, 'VALIDATION_ERROR', 'pendientes sólo admite SI.')
  return {
    desde, hasta, limit, offset, sentido,
    ...(q === undefined ? {} : { q }),
    ...(card === '9029' || card === '6440' ? { tarjeta: card } : {}),
    ...(pendientes === 'SI' ? { pendientes: true as const } : {}),
  }
}

/** A candidate search is deliberately separate from the queue filter `q`. */
export type CounterpartySearchInput = Readonly<{
  movimientoId: string
  buscar: string
  limit: number
}>
export function parseCounterpartySearchInput(raw: Readonly<Record<string, string | null | undefined>>): CounterpartySearchInput {
  const movimientoId = text(raw.movimientoId, 'movimientoId', 160)
  const buscar = raw.buscar?.trim()
  if (!buscar || buscar.length > EASY_COUNTERPARTY_MAX_QUERY) fail(400, 'VALIDATION_ERROR', 'buscar no es válido.')
  const rawLimit = raw.limit ?? String(EASY_COUNTERPARTY_MAX_SEARCH_LIMIT)
  if (!/^\d{1,2}$/.test(rawLimit)) fail(400, 'VALIDATION_ERROR', 'limit no es válido.')
  return { movimientoId, buscar, limit: integer(Number(rawLimit), 'limit', 1, EASY_COUNTERPARTY_MAX_SEARCH_LIMIT) }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
export function counterpartySha256(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

/** `sourceIdentity` is internal-only and enters just the hash; browsers receive no source FK or CIF. */
export type CounterpartyCandidateSeed = Readonly<{
  movimientoId: string
  tipoTercero: CounterpartyType
  /** AUTO_RECIBO exists only for the private automatic adapter; browser DTOs
   * still exclude it through CounterpartyCandidateDto. */
  origen: CounterpartyOrigin
  sourceIdentity: string
}>
export function counterpartyCandidateHash(seed: CounterpartyCandidateSeed): string {
  return counterpartySha256({ schema: EASY_COUNTERPARTY_SCHEMA, ...seed })
}
export function counterpartySuggestionId(seed: CounterpartyCandidateSeed): string {
  return `${EASY_COUNTERPARTY_SUGGESTION_PREFIX}${counterpartyCandidateHash(seed)}`
}
export function isCounterpartySuggestionId(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^${EASY_COUNTERPARTY_SUGGESTION_PREFIX}[a-f0-9]{64}$`).test(value)
}

export type ConfirmCounterpartyInput = Readonly<{
  action: 'confirmar'
  movimientoId: string
  version: number
  sugerenciaId: string
  idempotencyKey: string
  confirmacion: true
}>
export type ReverseCounterpartyInput = Readonly<{
  action: 'revertir'
  decisionId: string
  version: number
  idempotencyKey: string
  confirmacion: true
}>
export type CounterpartyWriteInput = ConfirmCounterpartyInput | ReverseCounterpartyInput

/** Closed action shape: the browser cannot submit a name, source FK, CIF, amount or B4 state. */
export function parseCounterpartyWriteInput(raw: unknown): CounterpartyWriteInput {
  if (!isRecord(raw) || typeof raw.action !== 'string') fail(400, 'VALIDATION_ERROR', 'action es obligatoria.')
  if (raw.action === 'confirmar') {
    const input = exactKeys(raw, ['action', 'movimientoId', 'version', 'sugerenciaId', 'idempotencyKey', 'confirmacion'])
    if (input.confirmacion !== true) fail(422, 'CONFIRMACION_REQUERIDA', 'confirmacion debe ser exactamente true.')
    const suggestion = text(input.sugerenciaId, 'sugerenciaId', 80)
    if (!isCounterpartySuggestionId(suggestion)) fail(400, 'VALIDATION_ERROR', 'sugerenciaId no tiene el formato estable esperado.')
    return {
      action: 'confirmar', movimientoId: text(input.movimientoId, 'movimientoId', 160), version: integer(input.version, 'version', 0, 2_147_483_647),
      sugerenciaId: suggestion, idempotencyKey: uuidV4(input.idempotencyKey, 'idempotencyKey'), confirmacion: true,
    }
  }
  if (raw.action === 'revertir') {
    const input = exactKeys(raw, ['action', 'decisionId', 'version', 'idempotencyKey', 'confirmacion'])
    if (input.confirmacion !== true) fail(422, 'CONFIRMACION_REQUERIDA', 'confirmacion debe ser exactamente true.')
    return {
      action: 'revertir', decisionId: canonicalUuid(input.decisionId, 'decisionId'), version: integer(input.version, 'version', 1, 2_147_483_647),
      idempotencyKey: uuidV4(input.idempotencyKey, 'idempotencyKey'), confirmacion: true,
    }
  }
  fail(400, 'VALIDATION_ERROR', 'action no está admitida para terceros.')
}

export function counterpartyRequestHash(actorId: number, input: CounterpartyWriteInput): string {
  return counterpartySha256({ schema: 'EASY_COUNTERPARTY_REQUEST_V1', actorId, input })
}

/** P1 holds signed values untouched; magnitude is presentation order only. */
export function compareCounterpartyMagnitude<T extends { importeCentimos: number; fecha: string; id: string }>(left: T, right: T): number {
  const magnitude = Math.abs(right.importeCentimos) - Math.abs(left.importeCentimos)
  return magnitude || right.fecha.localeCompare(left.fecha) || left.id.localeCompare(right.id)
}
