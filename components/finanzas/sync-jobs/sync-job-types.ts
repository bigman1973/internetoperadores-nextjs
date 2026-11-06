/**
 * Browser DTO boundary for durable finance sync jobs.
 *
 * This parser intentionally rejects malformed values rather than turning absent
 * counters into zero. It is independent of the backend implementation and of
 * Prisma so it can be shared by each finance screen.
 */
export const SYNC_JOB_SOURCES = ['ONEDRIVE', 'ISP'] as const
export type SyncJobSource = (typeof SYNC_JOB_SOURCES)[number]

export const SYNC_JOB_STATUSES = [
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED',
  'CANCEL_REQUESTED',
  'CANCELLED',
] as const
export type SyncJobStatus = (typeof SYNC_JOB_STATUSES)[number]

export const SYNC_JOB_PHASES = ['INVENTORY', 'PROCESSING', 'FINALIZING'] as const
export type SyncJobPhase = (typeof SYNC_JOB_PHASES)[number]

/** Server-owned snapshot. The browser never sends these bounds back to create a job. */
export type IspSyncScope = {
  version: 1
  fromInclusive: string
  toExclusive: string
  zone: 'Europe/Madrid'
} & ({ mode: 'RECENT_3_MONTHS' } | { mode: 'YEAR'; year: number })

export interface SyncJobErrorDetail {
  code: string
  name: string
  operation: string
  sqlState: string | null
  constraint: string | null
  message: string
}

export interface SyncJobDTO {
  id: string
  source: SyncJobSource
  status: SyncJobStatus
  phase: SyncJobPhase
  /** Null only while server-side enumeration has not completed. */
  total: number | null
  processed: number
  nuevas: number
  actualizadas: number
  errores: number
  unchanged: number
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  /** Server-sanitized diagnostic. Rendered only as text, never as HTML. */
  lastError: string | null
  /** Optional extensions keep old responses and existing callers compatible. */
  scope?: IspSyncScope | null
  requestedById?: number | null
  lastErrorDetail?: SyncJobErrorDetail | null
}

export interface SyncJobsStateDTO {
  enabled: boolean
  canWrite: boolean
  /** Server authorization only; missing means annual reads are forbidden. */
  canAnnual?: boolean
  activeJob: SyncJobDTO | null
  lastJob: SyncJobDTO | null
}

export type SyncJobsStateParseResult =
  | { ok: true; value: SyncJobsStateDTO }
  | { ok: false; error: string }
export type SyncJobMutationParseResult =
  | { ok: true; value: { job: SyncJobDTO } }
  | { ok: false; error: string }

type UnknownRecord = Record<string, unknown>

const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
const MAX_ID_LENGTH = 200
const MAX_SAFE_ERROR_LENGTH = 1_000

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function record(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${path} debe ser un objeto.`)
  return value
}

function oneOf<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new Error(`${path} no tiene un valor permitido.`)
  }
  return value as T[number]
}

function nonEmptyText(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new Error(`${path} debe ser texto no vacío de hasta ${maxLength} caracteres.`)
  }
  return value
}

function nonNegativeCounter(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${path} debe ser un entero seguro no negativo.`)
  }
  return value
}

function nullableCounter(value: unknown, path: string): number | null {
  return value === null ? null : nonNegativeCounter(value, path)
}

function timestamp(value: unknown, path: string): string {
  const result = nonEmptyText(value, path, 64)
  if (!TIMESTAMP_RE.test(result) || Number.isNaN(Date.parse(result))) {
    throw new Error(`${path} debe ser fecha-hora ISO válida.`)
  }
  return result
}

function nullableTimestamp(value: unknown, path: string): string | null {
  return value === null ? null : timestamp(value, path)
}

function nullableSafeError(value: unknown, path: string): string | null {
  if (value === null) return null
  const result = nonEmptyText(value, path, MAX_SAFE_ERROR_LENGTH)
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(result)) {
    throw new Error(`${path} contiene caracteres de control no permitidos.`)
  }
  return result
}

function parseIspScope(value: unknown, path: string): IspSyncScope | null {
  if (value === undefined || value === null) return null
  const row = record(value, path)
  // Legacy ISP jobs used {} before the server persisted a scope snapshot.
  if (Object.keys(row).length === 0) return null
  const mode = oneOf(row.mode, ['RECENT_3_MONTHS', 'YEAR'] as const, `${path}.mode`)
  if (row.version !== 1 || row.zone !== 'Europe/Madrid') throw new Error(`${path} no tiene versión o zona permitida.`)
  const fromInclusive = nonEmptyText(row.fromInclusive, `${path}.fromInclusive`, 10)
  const toExclusive = nonEmptyText(row.toExclusive, `${path}.toExclusive`, 10)
  const monthStart = /^\d{4}-(?:0[1-9]|1[0-2])-01$/
  if (!monthStart.test(fromInclusive) || !monthStart.test(toExclusive) || fromInclusive >= toExclusive) {
    throw new Error(`${path} debe contener límites mensuales válidos y ordenados.`)
  }
  const bounds = { version: 1 as const, fromInclusive, toExclusive, zone: 'Europe/Madrid' as const }
  if (mode === 'YEAR') {
    const year = nonNegativeCounter(row.year, `${path}.year`)
    if (year < 1900 || year > 9998 || fromInclusive !== `${year}-01-01` || toExclusive !== `${year + 1}-01-01`) {
      throw new Error(`${path} no corresponde al año indicado.`)
    }
    return { ...bounds, mode, year }
  }
  const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
  if (row.year !== undefined || monthIndex(toExclusive) - monthIndex(fromInclusive) !== 3) {
    throw new Error(`${path} no corresponde a tres meses.`)
  }
  return { ...bounds, mode }
}

function parseErrorDetail(value: unknown, path: string): SyncJobErrorDetail | null {
  if (value === undefined || value === null) return null
  const row = record(value, path)
  const text = (key: string) => {
    const result = nullableSafeError(row[key], `${path}.${key}`)
    if (result === null) throw new Error(`${path}.${key} debe ser texto.`)
    return result
  }
  // Copy only the documented sanitized fields, never raw errors/SQL/payloads.
  return {
    code: text('code'), name: text('name'), operation: text('operation'), message: text('message'),
    sqlState: nullableSafeError(row.sqlState, `${path}.sqlState`),
    constraint: nullableSafeError(row.constraint, `${path}.constraint`),
  }
}

function parseJob(value: unknown, path: string): SyncJobDTO {
  const row = record(value, path)
  const total = nullableCounter(row.total, `${path}.total`)
  const processed = nonNegativeCounter(row.processed, `${path}.processed`)
  if (total !== null && processed > total) {
    throw new Error(`${path}.processed no puede superar ${path}.total.`)
  }

  const createdAt = timestamp(row.createdAt, `${path}.createdAt`)
  const startedAt = nullableTimestamp(row.startedAt, `${path}.startedAt`)
  const finishedAt = nullableTimestamp(row.finishedAt, `${path}.finishedAt`)
  if (Date.parse(createdAt) > (startedAt === null ? Infinity : Date.parse(startedAt))) {
    throw new Error(`${path}.startedAt no puede ser anterior a createdAt.`)
  }
  if (startedAt !== null && finishedAt !== null && Date.parse(startedAt) > Date.parse(finishedAt)) {
    throw new Error(`${path}.finishedAt no puede ser anterior a startedAt.`)
  }

  const source = oneOf(row.source, SYNC_JOB_SOURCES, `${path}.source`)
  const requestedById = row.requestedById === undefined || row.requestedById === null
    ? null : nonNegativeCounter(row.requestedById, `${path}.requestedById`)
  if (requestedById === 0) throw new Error(`${path}.requestedById debe ser un identificador positivo.`)

  return {
    id: nonEmptyText(row.id, `${path}.id`, MAX_ID_LENGTH),
    source,
    status: oneOf(row.status, SYNC_JOB_STATUSES, `${path}.status`),
    phase: oneOf(row.phase, SYNC_JOB_PHASES, `${path}.phase`),
    total,
    processed,
    nuevas: nonNegativeCounter(row.nuevas, `${path}.nuevas`),
    actualizadas: nonNegativeCounter(row.actualizadas, `${path}.actualizadas`),
    errores: nonNegativeCounter(row.errores, `${path}.errores`),
    unchanged: nonNegativeCounter(row.unchanged, `${path}.unchanged`),
    createdAt,
    startedAt,
    finishedAt,
    lastError: nullableSafeError(row.lastError, `${path}.lastError`),
    // OneDrive scope remains unrelated to the ISP extension and is not interpreted.
    scope: source === 'ISP' ? parseIspScope(row.scope, `${path}.scope`) : null,
    requestedById,
    lastErrorDetail: parseErrorDetail(row.lastErrorDetail, `${path}.lastErrorDetail`),
  }
}

function nullableJob(value: unknown, path: string): SyncJobDTO | null {
  return value === null ? null : parseJob(value, path)
}

/** Validates the durable GET state without replacing unknown data with zeros. */
export function parseSyncJobsState(value: unknown): SyncJobsStateParseResult {
  try {
    const row = record(value, 'respuesta')
    if (typeof row.enabled !== 'boolean') throw new Error('enabled debe ser booleano.')
    if (typeof row.canWrite !== 'boolean') throw new Error('canWrite debe ser booleano.')
    if (row.canAnnual !== undefined && typeof row.canAnnual !== 'boolean') throw new Error('canAnnual debe ser booleano.')
    const activeJob = nullableJob(row.activeJob, 'activeJob')
    const lastJob = nullableJob(row.lastJob, 'lastJob')
    return { ok: true, value: { enabled: row.enabled, canWrite: row.canWrite, canAnnual: row.canAnnual === true, activeJob, lastJob } }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Estado de sincronización inválido.' }
  }
}

/** Validates the POST/PATCH response envelope. */
export function parseSyncJobMutation(value: unknown): SyncJobMutationParseResult {
  try {
    const row = record(value, 'respuesta')
    return { ok: true, value: { job: parseJob(row.job, 'job') } }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Respuesta de trabajo inválida.' }
  }
}

export function isActiveSyncJob(status: SyncJobStatus): boolean {
  return status === 'QUEUED' || status === 'RUNNING' || status === 'CANCEL_REQUESTED'
}

export function isTerminalSyncJob(status: SyncJobStatus): boolean {
  return !isActiveSyncJob(status)
}

/** Civil year selection must not depend on the browser's local timezone. */
export function currentMadridYear(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid', calendar: 'gregory', numberingSystem: 'latn', year: 'numeric',
  }).format(now))
}

export function canReadAnnualIsp(source: SyncJobSource, state: SyncJobsStateDTO | null): boolean {
  return source === 'ISP' && state?.canAnnual === true
}

/** Prefix the random token with the intent to prevent cross-year/mode collisions. */
export function syncJobIntentKey(source: SyncJobSource, year?: number): string {
  if (year !== undefined) {
    if (source !== 'ISP') throw new Error('La lectura anual solo está disponible para ISP.')
    return `${source}:YEAR:${year}`
  }
  return source === 'ISP' ? 'ISP:RECENT_3_MONTHS' : 'ONEDRIVE:DEFAULT'
}

export function ispAnnualConfirmation(year: number): string {
  return `¿Leer el año completo ${year}? Se leerán las facturas ISP de todo el año ${year}. Esta lectura no modifica los cobros financieros.`
}

/** Closed ISP intent: no actor, scope, bounds or unconfirmed annual request. */
export function syncJobCreateRequest(
  source: SyncJobSource,
  idempotencyKey: string,
  options: { scope?: Record<string, unknown>; year?: number } = {},
  now: Date = new Date(),
) {
  if (options.year !== undefined) {
    if (source !== 'ISP' || !Number.isInteger(options.year) || options.year < 2010 || options.year > currentMadridYear(now)) {
      throw new Error('Selecciona un año válido entre 2010 y el año actual de Madrid.')
    }
    return { source, idempotencyKey, mode: 'YEAR' as const, year: options.year, confirmed: true as const }
  }
  return { source, idempotencyKey, ...(source === 'ONEDRIVE' && options.scope !== undefined ? { scope: options.scope } : {}) }
}
