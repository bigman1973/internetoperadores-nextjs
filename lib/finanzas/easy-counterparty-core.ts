import { createHash } from 'node:crypto'

export const EASY_COUNTERPARTY_SCHEMA = 'EASY_COUNTERPARTY_V1' as const
export const EASY_COUNTERPARTY_SUGGESTION_PREFIX = 'p1_' as const
export const EASY_COUNTERPARTY_MAX_LIMIT = 100
export const EASY_COUNTERPARTY_MAX_OFFSET = 100_000
export const EASY_COUNTERPARTY_MAX_QUERY = 120
export const EASY_COUNTERPARTY_MAX_SEARCH_LIMIT = 50

export const COUNTERPARTY_TYPES = ['CLIENTE', 'PROVEEDOR', 'BANCO', 'CUENTA_PROPIA', 'EMPLEADO'] as const
export type CounterpartyType = typeof COUNTERPARTY_TYPES[number]
/**
 * These are review outcomes, never fiscal-role corrections.  They are deliberately
 * pure so a preview, its signed re-read and the individual selector apply exactly
 * the same conservative context/sign rule.
 */
export const COUNTERPARTY_CONTEXTUAL_CODES = [
  'CONTEXTO_CONFIRMING',
  'CONTEXTO_NOMINA',
  'CONTEXTO_SEGURIDAD_SOCIAL',
  'CONTEXTO_IMPUESTO',
  'CONTEXTO_PRESTAMO',
  'CONTEXTO_TRASPASO',
  'IMPORTE_CERO_O_INVALIDO',
  'SIGNO_COMPATIBLE_PROVEEDOR',
  'SIGNO_INCOHERENTE_PROVEEDOR',
  'SIGNO_COMPATIBLE_CLIENTE',
  'SIGNO_INCOHERENTE_CLIENTE',
  'SIGNO_COMPATIBLE_EMPLEADO',
  'SIGNO_INCOHERENTE_EMPLEADO',
  'CUENTA_PROPIA_SIN_TRASPASO',
  'BANCO_SIGNO_NEUTRO',
] as const
export type CounterpartyContextualCode = typeof COUNTERPARTY_CONTEXTUAL_CODES[number]
export type CounterpartyContextualClassification = Readonly<{
  bloque: 'ADMISIBLE' | 'REVISION_INDIVIDUAL'
  codigo: CounterpartyContextualCode
  /** Always explicit: this surface may warn, but it never rewrites a fiscal role. */
  aviso: string
}>
export type CounterpartyContextualInput = Readonly<{
  tipoTercero: CounterpartyType
  importeCentimos: number
  concepto?: string | null
  propuestaTexto?: string | null
}>

function contextualText(value: string | null | undefined): string {
  return typeof value === 'string'
    ? value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').normalize('NFKC').toLocaleUpperCase('es-ES')
    : ''
}
function hasContext(text: string, expression: RegExp): boolean { return expression.test(text) }
function contextualReview(codigo: CounterpartyContextualCode, aviso: string): CounterpartyContextualClassification {
  return { bloque: 'REVISION_INDIVIDUAL', codigo, aviso: `${aviso} La ficha fiscal no se corrige automáticamente.` }
}

/**
 * Classifies a proposed *role* against the signed movement and only the visible
 * bank context.  It does not identify a person/entity and does not mutate a fiscal
 * record.  Any uncertainty is review-individual; callers may use ADMISIBLE solely
 * for the explicit human bulk package.
 */
export function classifyCounterpartyContext(input: CounterpartyContextualInput): CounterpartyContextualClassification {
  const amount = input.importeCentimos
  if (!Number.isSafeInteger(amount) || amount === 0) {
    return contextualReview('IMPORTE_CERO_O_INVALIDO', 'El movimiento no tiene un signo bancario utilizable para aceptar un tercero en bloque.')
  }
  const text = `${contextualText(input.concepto)} ${contextualText(input.propuestaTexto)}`
  // A special financial context does not change a fiscal role.  It is admissible
  // only where the signed amount and the already-existing exact-match type agree.
  if (hasContext(text, /\b(?:CONFIRMING|CESION\s+DE\s+CREDITOS|ANTICIPO\s+CONFIRMING)\b/u)) {
    return input.tipoTercero === 'CLIENTE' && amount > 0
      ? { bloque: 'ADMISIBLE', codigo: 'CONTEXTO_CONFIRMING', aviso: 'Cobro de confirming compatible con cliente existente; confirme la coincidencia exacta.' }
      : contextualReview('CONTEXTO_CONFIRMING', `El concepto indica confirming o cesión de créditos; la ficha actual es ${input.tipoTercero.toLocaleLowerCase('es-ES')} y el tipo esperado para este cobro es cliente.`)
  }
  if (hasContext(text, /\b(?:NOMINAS?|SALARIOS?|REMUNERACIONES?)\b/u)) {
    return input.tipoTercero === 'EMPLEADO' && amount < 0
      ? { bloque: 'ADMISIBLE', codigo: 'CONTEXTO_NOMINA', aviso: 'Cargo de nómina compatible con empleado existente; confirme la coincidencia exacta.' }
      : contextualReview('CONTEXTO_NOMINA', `El concepto indica nómina o salario; la ficha actual es ${input.tipoTercero.toLocaleLowerCase('es-ES')} y el tipo esperado para este cargo es empleado.`)
  }
  if (hasContext(text, /\b(?:TGSS|SEGURIDAD\s+SOCIAL|TESORERIA\s+GENERAL)\b/u)) {
    return contextualReview('CONTEXTO_SEGURIDAD_SOCIAL', 'El concepto indica Seguridad Social; no hay un tipo administrativo para aceptación en bloque y requiere revisión individual.')
  }
  if (hasContext(text, /\b(?:AEAT|AGENCIA\s+TRIBUTARIA|HACIENDA|IMPUESTOS?|MODELO\s*(?:111|115|123|130|190|200|202|303|347|390))\b/u)) {
    return contextualReview('CONTEXTO_IMPUESTO', 'El concepto indica un impuesto o administración tributaria; no hay un tipo administrativo para aceptación en bloque y requiere revisión individual.')
  }
  if (hasContext(text, /\b(?:PRESTAMOS?|CREDITOS?|LEASING|FINANCIACION|CUOTA\s+(?:PRESTAMO|CREDITO|LEASING))\b/u)) {
    return input.tipoTercero === 'BANCO'
      ? { bloque: 'ADMISIBLE', codigo: 'CONTEXTO_PRESTAMO', aviso: 'Préstamo o financiación compatible con banco existente; confirme la coincidencia exacta.' }
      : contextualReview('CONTEXTO_PRESTAMO', `El concepto indica préstamo, crédito o financiación; la ficha actual es ${input.tipoTercero.toLocaleLowerCase('es-ES')} y el tipo esperado es banco.`)
  }
  if (hasContext(text, /\b(?:TRASPASO|TRANSFERENCIA\s+(?:ENTRE|INTERNA|PROPIA))\b/u)) {
    return contextualReview('CONTEXTO_TRASPASO', 'El concepto indica un traspaso o transferencia interna y requiere revisión individual.')
  }
  if (input.tipoTercero === 'PROVEEDOR') {
    return amount < 0
      ? { bloque: 'ADMISIBLE', codigo: 'SIGNO_COMPATIBLE_PROVEEDOR', aviso: 'Cargo compatible con proveedor para el bloque; confirme la coincidencia exacta.' }
      : contextualReview('SIGNO_INCOHERENTE_PROVEEDOR', 'El movimiento es un cobro y la ficha propuesta es un proveedor.')
  }
  if (input.tipoTercero === 'CLIENTE') {
    return amount > 0
      ? { bloque: 'ADMISIBLE', codigo: 'SIGNO_COMPATIBLE_CLIENTE', aviso: 'Cobro compatible con cliente para el bloque; confirme la coincidencia exacta.' }
      : contextualReview('SIGNO_INCOHERENTE_CLIENTE', 'El movimiento es un cargo y la ficha propuesta es un cliente.')
  }
  if (input.tipoTercero === 'EMPLEADO') {
    return amount < 0
      ? { bloque: 'ADMISIBLE', codigo: 'SIGNO_COMPATIBLE_EMPLEADO', aviso: 'Cargo compatible con empleado para el bloque; confirme la coincidencia exacta.' }
      : contextualReview('SIGNO_INCOHERENTE_EMPLEADO', 'El movimiento es un cobro y la ficha propuesta es un empleado.')
  }
  if (input.tipoTercero === 'CUENTA_PROPIA') {
    return contextualReview('CUENTA_PROPIA_SIN_TRASPASO', 'Una cuenta propia exige evidencia de traspaso acreditada y no se acepta en bloque.')
  }
  // A bank may be debit or credit (fees, settlements, financing); the sign alone
  // cannot reclassify it. Special financial contexts above remain fail-closed.
  return { bloque: 'ADMISIBLE', codigo: 'BANCO_SIGNO_NEUTRO', aviso: 'El signo no determina un banco; la coincidencia exacta acreditada se conserva para revisión.' }
}
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
