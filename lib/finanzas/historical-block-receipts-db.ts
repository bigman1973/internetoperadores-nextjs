import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety'

export const HISTORICAL_BLOCK_RECEIPTS_MAX_BLOCKS = 100
export const HISTORICAL_BLOCK_RECEIPTS_MAX_OPERATIONS = 25
export const HISTORICAL_DELEGATION_TEXT = 'Ejecutado por Manus por instrucción de Víctor Giró el 23/10/2026'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CENTS = /^-?(?:0|[1-9]\d*)$/
const OPERATION_STATES = new Set(['APLICADA', 'REVERTIDA'])

type Raw = Record<string, unknown>

type HistoricalBlockEvent = Readonly<{
  bloqueId: string
  movimientoId: string
  createdAt: string
  actor: string
  estadoOperacion: string
  totalCargosCentimos: string
  totalCobrosCentimos: string
  delegation: boolean
}>

export type HistoricalBlockReceipt = Readonly<{
  bloqueId: string
  fechaPrimeraConfirmacion: string
  fechaUltimaConfirmacion: string
  actor: string
  confirmadas: number
  operacionesAplicadas: number
  operacionesRevertidas: number
  operacionesPendientes: number
  totalCargosCentimos: string
  totalCobrosCentimos: string
  delegacion: string | null
}>

type HistoricalBlockEventRow = Readonly<{
  bloqueId: string
  movimientoId: string
  createdAt: Date
  actorNombre: string | null
  estadoOperacion: string
  totalCargosCentimos: string | null
  totalCobrosCentimos: string | null
  ejecutor: string | null
  instruccionDe: string | null
  fechaInstruccion: string | null
}>

function isRecord(value: unknown): value is Raw {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function safeText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, '')
  return normalized.length > 0 && normalized.length <= maximum ? normalized : null
}

function safeDate(value: unknown): string | null {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function cents(value: unknown, sign: 'cargo' | 'cobro'): string | null {
  if (typeof value !== 'string' || !CENTS.test(value) || value.length > 31 || value === '-0') return null
  const parsed = BigInt(value)
  if ((sign === 'cargo' && parsed > BigInt(0)) || (sign === 'cobro' && parsed < BigInt(0))) return null
  return value
}

function actorDisplay(value: unknown): string {
  return safeText(value, 120) || 'Usuario autorizado'
}

function isDelegated(event: Pick<HistoricalBlockEventRow, 'ejecutor' | 'instruccionDe' | 'fechaInstruccion'>): boolean {
  return event.ejecutor === 'Manus'
    && event.instruccionDe === 'Víctor Giró'
    && event.fechaInstruccion === '2026-10-23'
}

/**
 * Normaliza una fila de evento antes de agruparla. Nunca convierte importes a
 * número ni completa metadatos ausentes: un recibo incompleto se rechaza.
 */
function parseHistoricalBlockEvent(value: unknown): HistoricalBlockEvent {
  if (!isRecord(value)) throw new Error('El evento de recibo histórico no tiene una forma verificable.')
  const bloqueId = safeText(value.bloqueId, 36)
  const movimientoId = safeText(value.movimientoId, 160)
  const createdAt = safeDate(value.createdAt)
  const actor = actorDisplay(value.actorNombre ?? value.actor)
  const estadoOperacion = safeText(value.estadoOperacion, 40)
  const totalCargosCentimos = cents(value.totalCargosCentimos, 'cargo')
  const totalCobrosCentimos = cents(value.totalCobrosCentimos, 'cobro')
  if (!bloqueId || !UUID.test(bloqueId) || !movimientoId || !createdAt || !estadoOperacion || !OPERATION_STATES.has(estadoOperacion) || !totalCargosCentimos || !totalCobrosCentimos) {
    throw new Error('El evento de recibo histórico contiene datos no verificables.')
  }
  const delegation = value.delegation === true || isDelegated({
    ejecutor: typeof value.ejecutor === 'string' ? value.ejecutor : null,
    instruccionDe: typeof value.instruccionDe === 'string' ? value.instruccionDe : null,
    fechaInstruccion: typeof value.fechaInstruccion === 'string' ? value.fechaInstruccion : null,
  })
  return Object.freeze({ bloqueId, movimientoId, createdAt, actor, estadoOperacion, totalCargosCentimos, totalCobrosCentimos, delegation })
}

/**
 * Agrupa los eventos de aprobación ya seleccionados por SQL. Los cargos/cobros
 * se leen una sola vez del detalle común del bloque y se exige que cada evento
 * conserve exactamente el mismo recibo; por eso nunca se suman por movimiento.
 */
export function groupHistoricalBlockReceiptEvents(rows: readonly unknown[]): readonly HistoricalBlockReceipt[] {
  const grouped = new Map<string, HistoricalBlockEvent[]>()
  for (const row of rows) {
    const event = parseHistoricalBlockEvent(row)
    const events = grouped.get(event.bloqueId) || []
    events.push(event)
    grouped.set(event.bloqueId, events)
  }

  const receipts: HistoricalBlockReceipt[] = []
  for (const [bloqueId, events] of grouped) {
    if (events.length === 0 || events.length > HISTORICAL_BLOCK_RECEIPTS_MAX_OPERATIONS) {
      throw new Error('El bloque histórico supera el límite seguro de 25 operaciones.')
    }
    const first = events[0]
    const movements = new Set(events.map((event) => event.movimientoId))
    if (movements.size !== events.length) {
      throw new Error('El bloque histórico contiene más de una confirmación por movimiento.')
    }
    if (events.some((event) => event.totalCargosCentimos !== first.totalCargosCentimos || event.totalCobrosCentimos !== first.totalCobrosCentimos)) {
      throw new Error('Los eventos del bloque no conservan los mismos totales auditados.')
    }
    const actors = new Set(events.map((event) => event.actor))
    const dates = events.map((event) => event.createdAt).sort()
    const operacionesAplicadas = events.filter((event) => event.estadoOperacion === 'APLICADA').length
    const operacionesRevertidas = events.filter((event) => event.estadoOperacion === 'REVERTIDA').length
    const operacionesPendientes = events.length - operacionesAplicadas - operacionesRevertidas
    receipts.push(Object.freeze({
      bloqueId,
      fechaPrimeraConfirmacion: dates[0],
      fechaUltimaConfirmacion: dates[dates.length - 1],
      actor: actors.size === 1 ? first.actor : 'Varias personas autorizadas',
      confirmadas: events.length,
      operacionesAplicadas,
      operacionesRevertidas,
      operacionesPendientes,
      totalCargosCentimos: first.totalCargosCentimos,
      totalCobrosCentimos: first.totalCobrosCentimos,
      // Sólo se muestra la delegación si todo el bloque contiene el metadato
      // canónico. No se expone referencia, hash ni identificador del actor.
      delegacion: events.every((event) => event.delegation) ? HISTORICAL_DELEGATION_TEXT : null,
    }))
  }

  return Object.freeze(receipts.sort((a, b) => b.fechaUltimaConfirmacion.localeCompare(a.fechaUltimaConfirmacion) || a.bloqueId.localeCompare(b.bloqueId)))
}

/**
 * Lee recibos de confirmación histórica sin devolver hashes, referencias legacy
 * ni identidades técnicas. El CTE selecciona como máximo cien bloques antes de
 * recuperar sus eventos, y la transacción se declara explícitamente de lectura.
 */
export async function readHistoricalBlockReceipts(limit = HISTORICAL_BLOCK_RECEIPTS_MAX_BLOCKS): Promise<readonly HistoricalBlockReceipt[]> {
  const boundedLimit = Math.max(1, Math.min(HISTORICAL_BLOCK_RECEIPTS_MAX_BLOCKS, Math.trunc(limit)))
  if (!Number.isSafeInteger(boundedLimit)) throw new Error('El límite de recibos históricos no es válido.')
  await assertFinanceRuntimeReady()
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`
    const rows = await tx.$queryRaw<HistoricalBlockEventRow[]>(Prisma.sql`
      WITH eventos_confirmacion AS (
        SELECT
          e.detalle->>'bloqueId' AS "bloqueId",
          e.movimiento_id AS "movimientoId",
          e.created_at AS "createdAt",
          u.nombre AS "actorNombre",
          o.estado::text AS "estadoOperacion",
          e.detalle->>'totalCargosCentimos' AS "totalCargosCentimos",
          e.detalle->>'totalCobrosCentimos' AS "totalCobrosCentimos",
          e.detalle->>'ejecutor' AS ejecutor,
          e.detalle->>'instruccionDe' AS "instruccionDe",
          e.detalle->>'fechaInstruccion' AS "fechaInstruccion"
        FROM eventos_justificacion_b4 e
        INNER JOIN operaciones_justificacion_b4 o ON o.id = e.operacion_id
        LEFT JOIN usuarios_admin u ON u.id = e.actor_id
        WHERE e.accion = 'APROBACION'
          AND e.detalle->>'bulkKind' = 'CONFIRMACION'
          AND jsonb_typeof(e.detalle) = 'object'
          AND (e.detalle->>'bloqueId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      ), bloques_seleccionados AS (
        SELECT "bloqueId", MAX("createdAt") AS ultima_confirmacion
        FROM eventos_confirmacion
        GROUP BY "bloqueId"
        ORDER BY ultima_confirmacion DESC, "bloqueId" ASC
        LIMIT ${boundedLimit}
      )
      SELECT e.*
      FROM eventos_confirmacion e
      INNER JOIN bloques_seleccionados b ON b."bloqueId" = e."bloqueId"
      ORDER BY b.ultima_confirmacion DESC, e."bloqueId" ASC, e."createdAt" ASC
    `)
    return groupHistoricalBlockReceiptEvents(rows)
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    timeout: 60_000,
    maxWait: 10_000,
  })
}
