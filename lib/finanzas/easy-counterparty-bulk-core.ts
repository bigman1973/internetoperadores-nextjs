import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const EASY_COUNTERPARTY_BULK_SCHEMA = 'EASY_COUNTERPARTY_BULK_V1' as const
export const EASY_COUNTERPARTY_BULK_MAX_ITEMS = 25
export const EASY_COUNTERPARTY_BULK_MAX_QUERY = 120
export const EASY_COUNTERPARTY_BULK_PREVIEW_MAX = 16_000
export const EASY_COUNTERPARTY_BULK_PREVIEW_TTL_MS = 10 * 60 * 1_000

export type EasyBulkDirection = 'TODOS' | 'CARGOS' | 'COBROS'
export type EasyBulkPreviewInput = Readonly<{
  desde: string
  hasta: string
  limit: number
  offset: number
  q?: string
  sentido: EasyBulkDirection
  tarjeta?: '9029' | '6440'
}>
export type EasyBulkPreviewItem = Readonly<{
  movimientoId: string
  version: number
  sugerenciaId: string
  fingerprint: string
  fecha: string
  importeCentimos: number
  tipoTercero: 'CLIENTE' | 'PROVEEDOR' | 'BANCO'
  etiqueta: string
  /** Contexto visible para revisión humana; nunca incluye IDs internos de cuenta. */
  concepto?: string
  banco?: string
  alias?: string | null
}>
export type EasyBulkPreviewSelection = Readonly<{
  movimientoId: string
  version: number
  sugerenciaId: string
  fingerprint: string
}>
export type EasyBulkConfirmCommand = Readonly<{
  action: 'aceptar_seleccionados'
  confirmacion: true
  idempotencyKey: string
  previewToken: string
  items: readonly EasyBulkPreviewSelection[]
}>
export type EasyBulkUndoCommand = Readonly<{
  action: 'deshacer_lote'
  confirmacion: true
  idempotencyKey: string
  loteId: string
}>
export type EasyBulkCommand = EasyBulkConfirmCommand | EasyBulkUndoCommand

export class EasyCounterpartyBulkValidationError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}
const fail = (status: number, code: string, message: string): never => { throw new EasyCounterpartyBulkValidationError(status, code, message) }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) fail(400, 'VALIDATION_ERROR', 'La solicitud no es válida.')
  return value as Record<string, unknown>
}
function exactKeys(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const raw = record(value)
  const actual = Object.keys(raw)
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key)) || keys.some(key => !Object.prototype.hasOwnProperty.call(raw, key))) fail(400, 'VALIDATION_ERROR', 'La solicitud contiene campos no admitidos.')
  return raw
}
function string(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  const text = value as string
  if (text.trim() !== text || !text || text.length > max) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return text
}
function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return value as number
}
function uuid(value: unknown, field: string): string {
  const parsed = string(value, field, 64).toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(parsed)) fail(400, 'VALIDATION_ERROR', `${field} debe ser un UUID v4.`)
  return parsed
}
function canonicalUuid(value: unknown, field: string): string {
  const parsed = string(value, field, 64).toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(parsed)) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return parsed
}
function day(value: unknown, field: string): string {
  const parsed = string(value, field, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  const date = new Date(`${parsed}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== parsed) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return parsed
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export function easyCounterpartyBulkHash(value: unknown): string { return createHash('sha256').update(stable(value)).digest('hex') }

/** Same conservative normalization used by finance suggestions: it folds only
 * Unicode/accents/whitespace, never does substring or token matching. */
export function normalizarNombreTerceroBulk(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const result = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').normalize('NFKC').replace(/[\s\u00A0]+/g, ' ').trim().toLocaleUpperCase('es-ES')
  return result && result.length <= 300 ? result : null
}
export function normalizarCifTerceroBulk(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const original = value.normalize('NFKC').trim().toLocaleUpperCase('es-ES')
  if (!original || original.length > 60 || !/^[A-Z0-9 ._\-/]+$/.test(original)) return null
  const normalized = original.replace(/[\s._\-/]+/g, '')
  return normalized.length >= 7 && normalized.length <= 20 && /[A-Z0-9]/.test(normalized) ? normalized : null
}

export type EasyBulkExistingRecord = Readonly<{
  sourceIdentity: string
  /** Stable internal proof only; browser text never supplies or sees it. */
  identityProof?: string | null
  tipoTercero: 'CLIENTE' | 'PROVEEDOR' | 'BANCO'
  origen: 'ENTIDAD_FISCAL' | 'CLIENTE_CONTRATO_ACTUAL'
  nombre: string
  nifCif: string | null
  aliases: readonly string[]
}>
export type EasyBulkLogicalRecord = Readonly<{
  sourceIdentity: string
  tipoTercero: 'CLIENTE' | 'PROVEEDOR' | 'BANCO'
  origen: 'ENTIDAD_FISCAL' | 'CLIENTE_CONTRATO_ACTUAL'
  nombre: string
  nifCif: string | null
  nombresExactos: readonly string[]
}>
export type EasyBulkTextMatch =
  | Readonly<{ kind: 'UNICO'; record: EasyBulkLogicalRecord }>
  | Readonly<{ kind: 'AMBIGUO' }>
  | Readonly<{ kind: 'SIN_COINCIDENCIA' }>

/**
 * Builds a logical set of pre-existing records.  Two sources are merged only if
 * their type and normalized CIF/NIF are equal; an equal display name is never
 * proof of identity.  A fiscal source is preferred for the receipt if it shares
 * that tax identity with a current client-contract source, but aliases of both
 * records remain exact keys of that single, proven identity.
 */
export function logicalEasyBulkRecords(records: readonly EasyBulkExistingRecord[]): readonly EasyBulkLogicalRecord[] {
  const usable = records.flatMap(record => {
    const nombre = normalizarNombreTerceroBulk(record.nombre)
    if (!nombre || !record.sourceIdentity) return []
    return [{ ...record, nifCif: normalizarCifTerceroBulk(record.nifCif), identityProof: typeof record.identityProof === 'string' && record.identityProof.trim() ? record.identityProof.trim() : null }]
  })
  // A graph, rather than one preferred key, handles a current record with a CIF
  // and a linked older/current representation with only the same accredited ID.
  // Display names never appear in `keyToIndex`, so equal names cannot merge.
  const parent = usable.map((_, index) => index)
  const find = (index: number): number => { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index] } return index }
  const union = (left: number, right: number) => { const a = find(left), b = find(right); if (a !== b) parent[b] = a }
  const keyToIndex = new Map<string, number>()
  usable.forEach((record, index) => {
    const keys = [
      record.nifCif ? `${record.tipoTercero}:NIF:${record.nifCif}` : null,
      record.identityProof ? `${record.tipoTercero}:PROOF:${record.identityProof}` : null,
    ].filter((key): key is string => key !== null)
    for (const key of keys) { const prior = keyToIndex.get(key); if (prior === undefined) keyToIndex.set(key, index); else union(prior, index) }
  })
  const grouped = new Map<number, typeof usable>()
  usable.forEach((record, index) => { const key = find(index); const group = grouped.get(key) ?? []; group.push(record); grouped.set(key, group) })
  return [...grouped.values()].map(group => {
    const preferred = [...group].sort((left, right) => {
      const fiscal = Number(right.origen === 'ENTIDAD_FISCAL') - Number(left.origen === 'ENTIDAD_FISCAL')
      return fiscal || left.sourceIdentity.localeCompare(right.sourceIdentity)
    })[0]
    const names = new Set<string>()
    for (const entry of group) for (const value of [entry.nombre, ...entry.aliases]) {
      const normalized = normalizarNombreTerceroBulk(value)
      if (normalized) names.add(normalized)
    }
    return {
      sourceIdentity: preferred.sourceIdentity,
      tipoTercero: preferred.tipoTercero,
      origen: preferred.origen,
      nombre: preferred.nombre.trim(),
      nifCif: normalizarCifTerceroBulk(preferred.nifCif),
      nombresExactos: [...names].sort(),
    }
  }).sort((left, right) => left.sourceIdentity.localeCompare(right.sourceIdentity))
}

/** Text can equal one accredited full name/alias or one CIF/NIF.  There is no
 * prefix, substring, token, concept, invoice or “first candidate” fallback. */
export function matchEasyBulkText(text: unknown, records: readonly EasyBulkLogicalRecord[]): EasyBulkTextMatch {
  const nombre = normalizarNombreTerceroBulk(text)
  const cif = normalizarCifTerceroBulk(text)
  if (!nombre) return { kind: 'SIN_COINCIDENCIA' }
  const matches = records.filter(record => record.nombresExactos.includes(nombre) || (cif !== null && record.nifCif === cif))
  return matches.length === 1 ? { kind: 'UNICO', record: matches[0] } : matches.length > 1 ? { kind: 'AMBIGUO' } : { kind: 'SIN_COINCIDENCIA' }
}

export function parseEasyCounterpartyBulkPreviewInput(raw: Readonly<Record<string, string | null | undefined>>): EasyBulkPreviewInput {
  const desde = day(raw.desde, 'desde'), hasta = day(raw.hasta, 'hasta')
  if (desde > hasta) fail(400, 'VALIDATION_ERROR', 'El periodo no es válido.')
  const limitText = raw.limit ?? '25', offsetText = raw.offset ?? '0'
  if (!/^\d{1,2}$/.test(limitText) || !/^\d{1,6}$/.test(offsetText)) fail(400, 'VALIDATION_ERROR', 'La paginación no es válida.')
  const limit = integer(Number(limitText), 'limit', 1, EASY_COUNTERPARTY_BULK_MAX_ITEMS)
  const offset = integer(Number(offsetText), 'offset', 0, 100_000)
  const requestedDirection = raw.sentido ?? 'TODOS'
  if (requestedDirection !== 'TODOS' && requestedDirection !== 'CARGOS' && requestedDirection !== 'COBROS') fail(400, 'VALIDATION_ERROR', 'El tipo de movimiento no es válido.')
  const sentido = requestedDirection as EasyBulkDirection
  const q = raw.q === null || raw.q === undefined ? undefined : raw.q.trim()
  if (q !== undefined && (!q || q.length > EASY_COUNTERPARTY_BULK_MAX_QUERY)) fail(400, 'VALIDATION_ERROR', 'La búsqueda no es válida.')
  const tarjeta = raw.tarjeta
  if (tarjeta !== undefined && tarjeta !== null && tarjeta !== '' && tarjeta !== '9029' && tarjeta !== '6440') fail(400, 'VALIDATION_ERROR', 'La tarjeta no es válida.')
  return { desde, hasta, limit, offset, sentido, ...(q === undefined ? {} : { q }), ...(tarjeta === '9029' || tarjeta === '6440' ? { tarjeta } : {}) }
}

function parseSelection(value: unknown): readonly EasyBulkPreviewSelection[] {
  if (!Array.isArray(value)) fail(400, 'VALIDATION_ERROR', 'Selecciona entre uno y veinticinco movimientos.')
  const selection = value as readonly unknown[]
  if (!selection.length || selection.length > EASY_COUNTERPARTY_BULK_MAX_ITEMS) fail(400, 'VALIDATION_ERROR', 'Selecciona entre uno y veinticinco movimientos.')
  const seen = new Set<string>()
  const items = selection.map((value, index) => {
    const row = exactKeys(value, ['movimientoId', 'version', 'sugerenciaId', 'fingerprint'])
    const movimientoId = string(row.movimientoId, `items[${index}].movimientoId`, 160)
    const version = integer(row.version, `items[${index}].version`, 0, 2_147_483_647)
    const sugerenciaId = string(row.sugerenciaId, `items[${index}].sugerenciaId`, 80)
    if (!/^p1_[a-f0-9]{64}$/.test(sugerenciaId)) fail(400, 'VALIDATION_ERROR', 'La propuesta seleccionada no es válida.')
    const fingerprint = string(row.fingerprint, `items[${index}].fingerprint`, 64)
    if (!/^[a-f0-9]{64}$/.test(fingerprint) || seen.has(movimientoId)) fail(400, 'VALIDATION_ERROR', 'La selección contiene movimientos repetidos o no válidos.')
    seen.add(movimientoId)
    return { movimientoId, version, sugerenciaId, fingerprint }
  })
  return [...items].sort((left, right) => left.movimientoId.localeCompare(right.movimientoId))
}

export function parseEasyCounterpartyBulkCommand(value: unknown): EasyBulkCommand {
  const raw = record(value)
  if (raw.action === 'aceptar_seleccionados') {
    const input = exactKeys(raw, ['action', 'confirmacion', 'idempotencyKey', 'previewToken', 'items'])
    if (input.confirmacion !== true) fail(422, 'CONFIRMACION_REQUERIDA', 'Confirma la selección antes de continuar.')
    const previewToken = string(input.previewToken, 'previewToken', EASY_COUNTERPARTY_BULK_PREVIEW_MAX)
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(previewToken)) fail(400, 'VALIDATION_ERROR', 'La selección debe actualizarse antes de aceptar.')
    return { action: 'aceptar_seleccionados', confirmacion: true, idempotencyKey: uuid(input.idempotencyKey, 'idempotencyKey'), previewToken, items: parseSelection(input.items) }
  }
  if (raw.action === 'deshacer_lote') {
    const input = exactKeys(raw, ['action', 'confirmacion', 'idempotencyKey', 'loteId'])
    if (input.confirmacion !== true) fail(422, 'CONFIRMACION_REQUERIDA', 'Confirma la reversión antes de continuar.')
    return { action: 'deshacer_lote', confirmacion: true, idempotencyKey: uuid(input.idempotencyKey, 'idempotencyKey'), loteId: canonicalUuid(input.loteId, 'loteId') }
  }
  fail(400, 'VALIDATION_ERROR', 'La acción no es válida.')
}

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET
  if (!value || value.length < 24) throw new Error('EASY_COUNTERPARTY_BULK_SECRET_UNAVAILABLE')
  return value
}
function mac(body: string): string { return createHmac('sha256', secret()).update(`easy-counterparty-bulk-preview:v1:${body}`).digest('base64url') }
export function signEasyCounterpartyBulkPreview(actorId: number, items: readonly EasyBulkPreviewItem[], now = Date.now()): string {
  if (!Number.isSafeInteger(actorId) || actorId <= 0 || !items.length || items.length > EASY_COUNTERPARTY_BULK_MAX_ITEMS) throw new Error('EASY_COUNTERPARTY_BULK_PREVIEW_INVALID')
  const payload = {
    v: 1, actorId, issuedAt: now, expiresAt: now + EASY_COUNTERPARTY_BULK_PREVIEW_TTL_MS,
    items: items.map(({ movimientoId, version, sugerenciaId, fingerprint }) => ({ movimientoId, version, sugerenciaId, fingerprint })),
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const token = `${body}.${mac(body)}`
  if (token.length > EASY_COUNTERPARTY_BULK_PREVIEW_MAX) throw new Error('EASY_COUNTERPARTY_BULK_PREVIEW_TOO_LARGE')
  return token
}
export function verifyEasyCounterpartyBulkPreview(token: string, actorId: number, selection: readonly EasyBulkPreviewSelection[], now = Date.now()): boolean {
  try {
    if (typeof token !== 'string' || token.length > EASY_COUNTERPARTY_BULK_PREVIEW_MAX || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return false
    const [body, signature] = token.split('.')
    const supplied = Buffer.from(signature, 'base64url'), expected = Buffer.from(mac(body), 'base64url')
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (payload?.v !== 1 || payload.actorId !== actorId || !Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt) || payload.issuedAt > now || payload.expiresAt < now || payload.expiresAt - payload.issuedAt !== EASY_COUNTERPARTY_BULK_PREVIEW_TTL_MS || !Array.isArray(payload.items) || payload.items.length > EASY_COUNTERPARTY_BULK_MAX_ITEMS) return false
    if (selection.length < 1 || selection.length > EASY_COUNTERPARTY_BULK_MAX_ITEMS || payload.items.length < selection.length) return false
    return selection.every(selected => payload.items.some((item: unknown) => {
      if (!item || typeof item !== 'object') return false
      const row = item as Record<string, unknown>
      return row.movimientoId === selected.movimientoId && row.version === selected.version && row.sugerenciaId === selected.sugerenciaId && row.fingerprint === selected.fingerprint
    }))
  } catch { return false }
}

export function easyCounterpartyBulkRequestHash(actorId: number, command: EasyBulkCommand): string {
  return easyCounterpartyBulkHash({ schema: EASY_COUNTERPARTY_BULK_SCHEMA, actorId, command })
}
