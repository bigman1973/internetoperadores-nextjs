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
}

export interface SyncJobsStateDTO {
  enabled: boolean
  canWrite: boolean
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

  return {
    id: nonEmptyText(row.id, `${path}.id`, MAX_ID_LENGTH),
    source: oneOf(row.source, SYNC_JOB_SOURCES, `${path}.source`),
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
    const activeJob = nullableJob(row.activeJob, 'activeJob')
    const lastJob = nullableJob(row.lastJob, 'lastJob')
    return { ok: true, value: { enabled: row.enabled, canWrite: row.canWrite, activeJob, lastJob } }
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
