import { createHash } from 'node:crypto'
import { MOTIVOS_NO_REQUIERE, convertirImporteUiACentimos, type MotivoNoRequiere } from '@/lib/finanzas/reconciliation-core'

export const EASY_MODE = 'SOLO_PROPONER' as const
export const EASY_MAX_LIMIT = 100
export const EASY_MAX_OFFSET = 100_000
export const EASY_MAX_QUERY = 120
export const EASY_SUGGESTION_PREFIX = 'mf1_'

export type EasyDirection = 'TODOS' | 'CARGOS' | 'COBROS'
export type EasyAction = 'confirmar_factura' | 'no_requiere'
export type EasyDocumentType = 'FACTURA_RECIBIDA' | 'FACTURA_EMITIDA' | 'TICKET'

export class EasyReconciliationValidationError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}

function fail(status: number, code: string, message: string): never {
  throw new EasyReconciliationValidationError(status, code, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) fail(400, 'VALIDATION_ERROR', 'El cuerpo debe ser un objeto JSON.')
  const keys = Object.keys(value)
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key)) || allowed.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    fail(400, 'VALIDATION_ERROR', 'El cuerpo contiene claves fuera del contrato Modo Fácil.')
  }
  return value
}

function boundedInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(400, 'VALIDATION_ERROR', `${field} debe ser un entero entre ${minimum} y ${maximum}.`)
  }
  return value as number
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > maximum) {
    fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  }
  return value
}

function uuidV4(value: unknown, field: string): string {
  const string = requiredText(value, field, 64)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(string)) {
    fail(400, 'VALIDATION_ERROR', `${field} debe ser un UUID v4.`)
  }
  return string.toLowerCase()
}

export function parseIsoDay(value: string | null | undefined, field: string, required = false): string | undefined {
  if (value === null || value === undefined || value === '') {
    if (required) fail(400, 'VALIDATION_ERROR', `${field} es obligatorio.`)
    return undefined
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, 'VALIDATION_ERROR', `${field} debe usar YYYY-MM-DD.`)
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail(400, 'VALIDATION_ERROR', `${field} no es una fecha válida.`)
  return value
}

export type EasyReadInput = Readonly<{
  desde: string
  hasta: string
  limit: number
  offset: number
  q?: string
  sentido: EasyDirection
  tarjeta?: '9029' | '6440'
}>

/** Parses only the documented Modo Fácil GET parameters; dates are calendar days. */
export function parseEasyReadInput(raw: Readonly<Record<string, string | null | undefined>>): EasyReadInput {
  const desde = parseIsoDay(raw.desde, 'desde', true)!
  const hasta = parseIsoDay(raw.hasta, 'hasta', true)!
  if (desde > hasta) fail(400, 'VALIDATION_ERROR', 'desde no puede ser posterior a hasta.')
  const limitText = raw.limit ?? '25'
  const offsetText = raw.offset ?? '0'
  if (!/^\d{1,3}$/.test(limitText) || !/^\d{1,6}$/.test(offsetText)) fail(400, 'VALIDATION_ERROR', 'limit u offset no son válidos.')
  const limit = boundedInteger(Number(limitText), 'limit', 1, EASY_MAX_LIMIT)
  const offset = boundedInteger(Number(offsetText), 'offset', 0, EASY_MAX_OFFSET)
  const sentido = raw.sentido ?? 'TODOS'
  if (sentido !== 'TODOS' && sentido !== 'CARGOS' && sentido !== 'COBROS') fail(400, 'VALIDATION_ERROR', 'sentido no es válido.')
  const qRaw = raw.q
  const q = qRaw === undefined || qRaw === null ? undefined : qRaw.trim()
  if (q !== undefined && (q.length === 0 || q.length > EASY_MAX_QUERY)) fail(400, 'VALIDATION_ERROR', 'q no es válido.')
  const tarjetaRaw = raw.tarjeta
  if (tarjetaRaw !== undefined && tarjetaRaw !== null && tarjetaRaw !== '' && tarjetaRaw !== '9029' && tarjetaRaw !== '6440') {
    fail(400, 'VALIDATION_ERROR', 'tarjeta sólo admite 9029 o 6440.')
  }
  return { desde, hasta, limit, offset, q, sentido, ...(tarjetaRaw === '9029' || tarjetaRaw === '6440' ? { tarjeta: tarjetaRaw } : {}) }
}

export type ConfirmarFacturaInput = Readonly<{
  action: 'confirmar_factura'
  movimientoId: string
  version: number
  sugerenciaId: string
  idempotencyKey: string
  confirmacion: true
}>
export type NoRequiereInput = Readonly<{
  action: 'no_requiere'
  movimientoId: string
  version: number
  motivoNoRequiere: MotivoNoRequiere
  idempotencyKey: string
  confirmacion: true
}>
export type EasyWriteInput = ConfirmarFacturaInput | NoRequiereInput

function suggestionId(value: unknown): string {
  const id = requiredText(value, 'sugerenciaId', 80)
  if (!new RegExp(`^${EASY_SUGGESTION_PREFIX}[a-f0-9]{64}$`).test(id)) fail(400, 'VALIDATION_ERROR', 'sugerenciaId no tiene el formato estable esperado.')
  return id
}

/** Closed request contract; the browser never supplies amounts, documents or source IDs. */
export function parseEasyWriteInput(raw: unknown): EasyWriteInput {
  if (!isRecord(raw) || typeof raw.action !== 'string') fail(400, 'VALIDATION_ERROR', 'action es obligatoria.')
  if (raw.action === 'confirmar_factura') {
    const value = exactKeys(raw, ['action', 'movimientoId', 'version', 'sugerenciaId', 'idempotencyKey', 'confirmacion'])
    if (value.confirmacion !== true) fail(422, 'CONFIRMACION_REQUERIDA', 'confirmacion debe ser exactamente true.')
    return {
      action: 'confirmar_factura', movimientoId: requiredText(value.movimientoId, 'movimientoId', 160),
      version: boundedInteger(value.version, 'version', 1, 2_147_483_647), sugerenciaId: suggestionId(value.sugerenciaId),
      idempotencyKey: uuidV4(value.idempotencyKey, 'idempotencyKey'), confirmacion: true,
    }
  }
  if (raw.action === 'no_requiere') {
    const value = exactKeys(raw, ['action', 'movimientoId', 'version', 'motivoNoRequiere', 'idempotencyKey', 'confirmacion'])
    if (value.confirmacion !== true) fail(422, 'CONFIRMACION_REQUERIDA', 'confirmacion debe ser exactamente true.')
    if (typeof value.motivoNoRequiere !== 'string' || !(MOTIVOS_NO_REQUIERE as readonly string[]).includes(value.motivoNoRequiere)) {
      fail(400, 'VALIDATION_ERROR', 'motivoNoRequiere debe ser un motivo B4 cerrado.')
    }
    return {
      action: 'no_requiere', movimientoId: requiredText(value.movimientoId, 'movimientoId', 160),
      version: boundedInteger(value.version, 'version', 1, 2_147_483_647), motivoNoRequiere: value.motivoNoRequiere as MotivoNoRequiere,
      idempotencyKey: uuidV4(value.idempotencyKey, 'idempotencyKey'), confirmacion: true,
    }
  }
  fail(400, 'VALIDATION_ERROR', 'action no está admitida en Modo Fácil.')
}

export type CrearReglaInput = Readonly<{
  action: 'crear'
  operacionId: string
  nombreOpcional?: string
  modo: typeof EASY_MODE
  confirmacion: true
}>
export type DesactivarReglaInput = Readonly<{
  action: 'desactivar'
  reglaId: string
  version: number
  confirmacion: true
}>
export type EasyRuleInput = CrearReglaInput | DesactivarReglaInput

function canonicalUuid(value: unknown, field: string): string {
  const id = requiredText(value, field, 64)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) fail(400, 'VALIDATION_ERROR', `${field} debe ser un UUID canónico.`)
  return id.toLowerCase()
}

/** `nombreOpcional` is presentation-only and is intentionally never a rule pattern. */
export function parseEasyRuleInput(raw: unknown): EasyRuleInput {
  if (!isRecord(raw) || typeof raw.action !== 'string') fail(400, 'VALIDATION_ERROR', 'action es obligatoria.')
  if (raw.action === 'crear') {
    const keys = Object.keys(raw)
    const allowed = ['action', 'operacionId', 'nombreOpcional', 'modo', 'confirmacion']
    if (keys.some((key) => !allowed.includes(key)) || !['action', 'operacionId', 'modo', 'confirmacion'].every((key) => Object.prototype.hasOwnProperty.call(raw, key))) {
      fail(400, 'VALIDATION_ERROR', 'crear contiene claves fuera del contrato.')
    }
    if (raw.confirmacion !== true || raw.modo !== EASY_MODE) fail(422, 'CONFIRMACION_REQUERIDA', 'La regla exige confirmacion:true y modo SOLO_PROPONER.')
    if (raw.nombreOpcional !== undefined && (typeof raw.nombreOpcional !== 'string' || raw.nombreOpcional.trim().length === 0 || raw.nombreOpcional.length > 160)) {
      fail(400, 'VALIDATION_ERROR', 'nombreOpcional no es válido.')
    }
    return { action: 'crear', operacionId: canonicalUuid(raw.operacionId, 'operacionId'), ...(typeof raw.nombreOpcional === 'string' ? { nombreOpcional: raw.nombreOpcional.trim() } : {}), modo: EASY_MODE, confirmacion: true }
  }
  if (raw.action === 'desactivar') {
    const value = exactKeys(raw, ['action', 'reglaId', 'version', 'confirmacion'])
    if (value.confirmacion !== true) fail(422, 'CONFIRMACION_REQUERIDA', 'Desactivar exige confirmacion:true.')
    return { action: 'desactivar', reglaId: canonicalUuid(value.reglaId, 'reglaId'), version: boundedInteger(value.version, 'version', 1, 2_147_483_647), confirmacion: true }
  }
  fail(400, 'VALIDATION_ERROR', 'action de reglas no admitida.')
}

/** Exact decimal units returned by PostgreSQL `numeric/float::text`; never rounds.
 * A bank movement may be zero only for contextual NO_REQUIERE; evidence sources
 * continue to reject zero so they never fabricate documentary capacity. */
export function centsFromSqlText(value: unknown, field = 'importe', allowZero = false): number {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) {
    fail(422, 'IMPORTE_FUENTE_NO_EXACTO', `${field} no contiene un decimal SQL exacto de hasta dos decimales.`)
  }
  if (allowZero && /^-?0(?:\.0{1,2})?$/.test(value)) return 0
  const converted = convertirImporteUiACentimos(value)
  if (!converted.ok) fail(422, 'IMPORTE_FUENTE_NO_EXACTO', `${field} no se puede expresar exactamente en céntimos.`)
  return converted.value
}

export function normalizeCounterparty(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed || trimmed.length > 300) return null
  return trimmed.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES')
}

/**
 * Modo Fácil cannot turn an arbitrary charge into NO_REQUIERE merely because a
 * person chose a dropdown value. A B4 reason is accepted only with an explicit
 * matching bank-origin cue. This intentionally has no amount threshold: a
 * bank commission with 0,00 wording is still a commission cue, never ignored.
 */
export function noRequireBankContextError(
  motivo: MotivoNoRequiere,
  bankOriginText: readonly (string | null | undefined)[],
): string | null {
  const text = bankOriginText
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('es-ES').replace(/\s+/g, ' ').trim()
  if (!text) return 'NO_REQUIERE_SIN_CONTEXTO_BANCARIO'

  // These are documentary/fiscal/payroll/financing families even where legacy
  // FKs are absent. `MODELO nnn` covers the fiscal family (including 244).
  if (/\b(?:NOMINA|TGSS|AEAT|SEGURIDAD\s+SOCIAL|SS|PRESTAMO|LEASING|COMPRA)\b/.test(text)
    || /\b(?:MODELO|MOD\.?)[ ]*\d{2,3}\b/.test(text)) {
    return 'NO_REQUIERE_FUERA_DE_AMBITO'
  }

  const contextual: Record<MotivoNoRequiere, RegExp> = {
    COMISION_BANCARIA: /\b(?:COMISION(?:ES)?|GASTOS?\s+BANCARIOS?|MANTENIMIENTO\s+(?:DE\s+)?CUENTA)\b/,
    INTERES_BANCARIO: /\b(?:INTERES(?:ES)?|INTEREST)\b/,
    REDONDEO_BANCARIO: /\b(?:REDONDEO|AJUSTE\s+DE\s+REDONDEO)\b/,
    TRASPASO_INTERNO_SIN_DOCUMENTO: /\b(?:TRASPASO|TRANSFERENCIA\s+INTERNA|ENTRE\s+CUENTAS)\b/,
    MOVIMIENTO_TECNICO_BANCO: /\b(?:MOVIMIENTO\s+TECNICO|APUNTE\s+TECNICO|OPERACION\s+TECNICA|REGULARIZACION\s+BANCARIA)\b/,
    CORRECCION_BANCARIA: /\b(?:CORRECCION\s+BANCARIA|RECTIFICACION\s+BANCARIA|ANULACION\s+BANCARIA)\b/,
  }
  return contextual[motivo].test(text) ? null : 'NO_REQUIERE_SIN_CONTEXTO_BANCARIO'
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

export type StableSuggestionSeed = Readonly<{
  movimientoId: string
  importeMovimientoCentimos: number
  fechaBanco: string
  tipo: EasyDocumentType
  sourceId: string
  documentoConciliableId: string | null
  sourceTargetCentimos: number
  asignadoActivoCentimos: number
  fechaDocumento: string | null
  referencia: string
  tercero: string | null
  archivoDisponible: boolean
}>

/** Source fingerprint includes capacity and current wrapper identity, not a client-selected ID. */
export function sourceSuggestionHash(seed: StableSuggestionSeed): string {
  // documentoConciliableId is intentionally a projection field, not source
  // identity. An explicit click may create the legal B4 wrapper in the same
  // transaction; that must not turn the pre-click stable suggestion into a
  // different client-selectable ID.
  const { documentoConciliableId: _wrapperProjection, ...source } = seed
  return sha256Canonical({ schema: 'MODO_FACIL_SUGERENCIA_V1', ...source })
}

export function stableSuggestionId(seed: StableSuggestionSeed): string {
  return `${EASY_SUGGESTION_PREFIX}${sourceSuggestionHash(seed)}`
}

export function isExactSuggestion(seed: StableSuggestionSeed): boolean {
  const remaining = seed.sourceTargetCentimos - seed.asignadoActivoCentimos
  if (!Number.isSafeInteger(remaining)) return false
  if (seed.fechaDocumento === null || seed.fechaDocumento > seed.fechaBanco) return false
  if (seed.sourceTargetCentimos !== seed.importeMovimientoCentimos || remaining !== seed.importeMovimientoCentimos) return false
  // A new charge must carry controlled evidence. Cobros have no B4 file prerequisite.
  return seed.importeMovimientoCentimos >= 0 || seed.archivoDisponible
}

/** Sorts a unified queue only. Matching itself never calls Math.abs(). */
export function compareByMagnitudeOnly<T extends { importeCentimos: number; fecha: string; id: string }>(left: T, right: T): number {
  const magnitude = Math.abs(right.importeCentimos) - Math.abs(left.importeCentimos)
  return magnitude || right.fecha.localeCompare(left.fecha) || left.id.localeCompare(right.id)
}

export function requestHash(actorId: number, input: EasyWriteInput): string {
  return sha256Canonical({ schema: 'MODO_FACIL_REQUEST_V1', actorId, input })
}
