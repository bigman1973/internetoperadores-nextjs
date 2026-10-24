import { Prisma, type PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging'
import { requireB4ActorAccess } from '@/lib/finanzas/reconciliation-auth'
import { B4ServiceError, deshacerB4Tx } from '@/lib/finanzas/reconciliation-db'

type Tx = Prisma.TransactionClient & Record<string, any>
type Db = PrismaClient & Record<string, any>
const db = () => prisma as Db

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class EasyUndoServiceError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message)
  }
}

function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new EasyUndoServiceError(status, code, message, details)
}

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!record(value)) fail(400, 'VALIDATION_ERROR', 'El cuerpo debe ser un objeto JSON.')
  const received = Object.keys(value)
  if (received.length !== keys.length || received.some((key) => !keys.includes(key)) || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    fail(400, 'VALIDATION_ERROR', 'El cuerpo contiene claves fuera del contrato de deshacer Modo Fácil.')
  }
  return value
}

function uuid(value: unknown, field: string, v4 = false): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length !== 36 || !(v4 ? UUID_V4 : UUID).test(value)) {
    fail(400, 'VALIDATION_ERROR', `${field} no es un UUID válido${v4 ? ' v4' : ''}.`)
  }
  return value.toLowerCase()
}

/** Contrato cerrado del navegador: no expone versión, movimiento ni líneas B4. */
export type EasyUndoInput = Readonly<{
  action: 'deshacer'
  confirmacion: true
  operacionId: string
  idempotencyKey: string
}>

/** Parser puro para el contrato de cuatro claves de reversión Modo Fácil. */
export function parseEasyUndoInput(raw: unknown): EasyUndoInput {
  const value = exactKeys(raw, ['action', 'confirmacion', 'operacionId', 'idempotencyKey'])
  if (value.action !== 'deshacer') fail(400, 'VALIDATION_ERROR', 'action debe ser deshacer.')
  if (value.confirmacion !== true) fail(422, 'CONFIRMACION_REQUERIDA', 'deshacer exige confirmacion:true.')
  return {
    action: 'deshacer',
    confirmacion: true,
    operacionId: uuid(value.operacionId, 'operacionId'),
    idempotencyKey: uuid(value.idempotencyKey, 'idempotencyKey', true),
  }
}

type Original = Readonly<{
  id: string
  movimientoId: string
  versionResultante: number | null
}>
type OriginalLine = Readonly<{ id: string; importeCentimos: number }>

function integer(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail(409, 'OPERACION_NO_REVERSIBLE', `${field} de la operación no es verificable.`)
  return value
}

/** Locks the audited Modo Fácil receipt before exposing the originating B4 operation.
 * The ownership predicate intentionally prevents an administrator from adopting or
 * reversing an operation made by another session/account. */
async function lockOwnOriginal(tx: Tx, actorId: number, operationId: string): Promise<Original> {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT o.id::text AS id,o.movimiento_id AS movimiento_id,o.version_resultante,
      r.actor_id AS receipt_actor_id
    FROM operaciones_justificacion_b4 o
    JOIN recibos_modo_facil r ON r.operacion_b4_id=o.id
    WHERE o.id=CAST(${operationId} AS uuid)
      AND r.actor_id=${actorId}
      AND r.accion IN ('confirmar_factura','no_requiere')
    LIMIT 1
    FOR UPDATE OF o,r
  `)
  const row = rows[0]
  if (!row || Number(row.receipt_actor_id) !== actorId) {
    // A missing receipt is not a legacy-adoption path and a foreign receipt is not
    // disclosed to the caller.
    fail(404, 'OPERACION_MODO_FACIL_NO_ENCONTRADA', 'La operación no corresponde a una confirmación Modo Fácil propia.')
  }
  return {
    id: String(row.id),
    movimientoId: String(row.movimiento_id),
    versionResultante: row.version_resultante === null ? null : integer(row.version_resultante, 'versionResultante'),
  }
}

/** Uses the exact B4 advisory lock order before reading its immutable line set. */
async function lockMovementB4(tx: Tx, movimientoId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${movimientoId} AS text), 0))::text AS locked`
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM movimientos_bancarios WHERE id=CAST(${movimientoId} AS text) FOR UPDATE
  `
  if (rows.length !== 1) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'El movimiento original ya no existe.')
}

/** Includes inactive rows deliberately: the B4 payload hash must stay unchanged on a
 * retry after the first committed reversal made the original lines inactive. */
async function originalLines(tx: Tx, operationId: string): Promise<OriginalLine[]> {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id::text AS id,importe_centimos AS importe_centimos
    FROM vinculos_movimiento_documento
    WHERE operacion_creacion_id=CAST(${operationId} AS uuid)
    ORDER BY id ASC
    FOR UPDATE
  `)
  return rows.map((row) => ({ id: String(row.id), importeCentimos: integer(row.importe_centimos, 'importeCentimos') }))
}

function asEasyError(error: unknown): never {
  if (error instanceof EasyUndoServiceError || error instanceof PrototypeStagingError) throw error
  if (error instanceof B4ServiceError) throw new EasyUndoServiceError(error.status, error.code, error.message, error.details)
  throw error
}

/** Both permission facets are re-read from the live UsuarioAdmin row. A stale
 * session or a write-only accidental grant cannot expose an audited receipt. */
async function requireLiveEasyUndoAccess(actorId: number): Promise<void> {
  const read = await requireB4ActorAccess(actorId, 'lectura')
  if ('response' in read) fail(read.response.status, 'ACCESS_REVOKED', 'No dispone de permiso B4 de lectura activo.')
  const write = await requireB4ActorAccess(actorId, 'escritura')
  if ('response' in write) fail(write.response.status, 'ACCESS_REVOKED', 'No dispone de permiso B4 de escritura activo.')
}

async function undoEasyParsedTx(tx: Tx, actorId: number, input: EasyUndoInput) {
  const original = await lockOwnOriginal(tx, actorId, input.operacionId)
  await lockMovementB4(tx, original.movimientoId)
  const lines = await originalLines(tx, original.id)
  const version = original.versionResultante
  if (!Number.isSafeInteger(version) || (version as number) < 0) {
    fail(409, 'OPERACION_NO_REVERSIBLE', 'La operación original no conserva una versión B4 reversible.')
  }

  // A live authorization check sits immediately before the only operation that
  // can write. It is repeated even after the outer service/route authorization.
  await requireLiveEasyUndoAccess(actorId)

  // Do not use the current state or active-only links here. deshacerB4Tx checks
  // replay before state validity, then enforces that no other B4 change occurred.
  const result = await deshacerB4Tx(tx, actorId, {
    action: 'deshacer',
    confirmacion: true,
    idempotencyKey: input.idempotencyKey,
    version,
    operacionId: original.id,
    lineas: lines.map((line) => ({ id: line.id, importeCentimos: line.importeCentimos })),
  })
  return { ok: true as const, idempotente: result.idempotente }
}

/** Reverses a Modo Fácil receipt inside a caller-owned SERIALIZABLE transaction. */
export async function undoEasyTx(tx: Prisma.TransactionClient, actorId: number, raw: unknown) {
  const input = parseEasyUndoInput(raw)
  // This remains before every database read, including the permission lookup.
  await assertPrototypeStaging()
  await requireLiveEasyUndoAccess(actorId)
  try {
    return await undoEasyParsedTx(tx as Tx, actorId, input)
  } catch (error) {
    return asEasyError(error)
  }
}

/** Owns the SERIALIZABLE transaction used by the Modo Fácil undo endpoint. */
export async function undoEasy(actorId: number, raw: unknown) {
  const input = parseEasyUndoInput(raw)
  // This must precede the live actor lookup and opening of the write transaction.
  await assertPrototypeStaging()
  await requireLiveEasyUndoAccess(actorId)
  try {
    return await db().$transaction(
      (tx) => undoEasyParsedTx(tx as Tx, actorId, input),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 45_000 },
    )
  } catch (error) {
    return asEasyError(error)
  }
}

/** Route-facing conversion does not disclose foreign receipt identities or internals. */
export function easyUndoErrorResponse(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof PrototypeStagingError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  if (error instanceof EasyUndoServiceError) return { status: error.status, body: { error: error.message, codigo: error.code, ...(error.details === undefined ? {} : { errors: error.details }) } }
  const code = (error as any)?.code
  if (code === 'P2002' || code === 'P2034') return { status: 409, body: { error: 'Conflicto concurrente; relea y reintente con la misma clave.', codigo: 'CONCURRENT_CONFLICT' } }
  return { status: 500, body: { error: 'No se pudo deshacer Modo Fácil.' } }
}
