import { Prisma, type PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import {
  CONCILIAR_COLORS,
  CONCILIAR_TABS,
  type ConciliarColor,
  type ConciliarDocument,
  type ConciliarGetInput,
  type ConciliarProjectionSource,
  type ConciliarRow,
  type ConciliarTab,
  textoSeguro,
} from './conciliar-contract'
import { conciliarDecisionHash, isoDay, safeInteger } from './conciliar-core'
import { ConciliarDbError } from './conciliar-errors'

type Tx = Prisma.TransactionClient & Record<string, any>
type Db = PrismaClient & Record<string, any>
export type ProjectionSqlRow = Record<string, unknown>

const db = () => prisma as Db
const fail = (status: number, code: string, message: string): never => { throw new ConciliarDbError(status, code, message) }

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}
export function json(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return object(value)
  try { return object(JSON.parse(value)) } catch { return {} }
}
export function cents(value: unknown, field: string): number {
  const parsed = safeInteger(value)
  if (parsed === null || parsed < -2_147_483_648 || parsed > 2_147_483_647) fail(409, 'PROYECCION_IMPORTE_INVALIDO', `${field} no contiene céntimos exactos.`)
  return parsed
}
export function day(value: unknown, field: string): string {
  const parsed = isoDay(value)
  if (!parsed) fail(409, 'PROYECCION_FECHA_INVALIDA', `${field} no contiene una fecha verificable.`)
  return parsed
}
export function nullableText(value: unknown, max = 1_200): string | null {
  if (typeof value !== 'string') return null
  const parsed = textoSeguro(value)
  return parsed && parsed.length <= max ? parsed : null
}
export function exactMoney(value: unknown): number | null {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return null
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.')
  try {
    const integer = BigInt(whole) * BigInt(100) + BigInt((fraction + '00').slice(0, 2))
    const signed = negative ? -integer : integer
    if (signed < BigInt(-2_147_483_648) || signed > BigInt(2_147_483_647)) return null
    return Number(signed)
  } catch { return null }
}
export function document(value: unknown): ConciliarDocument | null {
  if (value === null || value === undefined) return null
  const row = json(value)
  const referencia = nullableText(row.referencia, 300)
  const importeCentimos = safeInteger(row.importeCentimos)
  if (!referencia || importeCentimos === null) return null
  return {
    referencia,
    tercero: nullableText(row.tercero, 300),
    importeCentimos,
    fecha: typeof row.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.fecha) ? row.fecha : null,
    href: typeof row.href === 'string' && row.href.startsWith('/api/admin/finanzas/conciliar/archivo/') ? row.href : null,
  }
}
function links(value: unknown): ConciliarRow['linksMovimiento'] {
  if (!Array.isArray(value)) return undefined
  const result = value.flatMap(item => {
    const row = object(item)
    const id = nullableText(row.id, 160), href = nullableText(row.href, 300), etiqueta = nullableText(row.etiqueta, 300)
    return id && href && etiqueta ? [{ id, href, etiqueta }] : []
  })
  return result.length ? result : undefined
}
function storedSource(value: unknown): ConciliarProjectionSource | null {
  const row = json(value)
  const kind = row.kind
  if (!['COBRO_PROPUESTA', 'COBRO_CONFIRMING', 'PAGO_FACTURA_RECIBIDA', 'PAGO_NOMINA', 'COMISION_BANCARIA', 'PENDIENTE_FACTURA_EMITIDA', 'TRANSFERENCIA_PROPIA'].includes(String(kind))) return null
  const scalar = (key: string) => typeof row[key] === 'string' && row[key].length > 0 && row[key].length <= 200 ? row[key] : undefined
  const integer = (key: string) => Number.isSafeInteger(row[key]) ? Number(row[key]) : undefined
  const remesaIds = Array.isArray(row.remesaIds) && row.remesaIds.every(item => Number.isSafeInteger(item) && Number(item) > 0)
    ? row.remesaIds.map(Number).sort((a, b) => a - b) : undefined
  return {
    kind: kind as ConciliarProjectionSource['kind'],
    ...(scalar('movimientoId') ? { movimientoId: scalar('movimientoId') } : {}),
    ...(scalar('propuestaId') ? { propuestaId: scalar('propuestaId') } : {}),
    ...(scalar('proposalFingerprint') ? { proposalFingerprint: scalar('proposalFingerprint') } : {}),
    ...(scalar('confirmingId') ? { confirmingId: scalar('confirmingId') } : {}),
    ...(scalar('confirmingSourceHash') ? { confirmingSourceHash: scalar('confirmingSourceHash') } : {}),
    ...(scalar('facturaEmitidaId') ? { facturaEmitidaId: scalar('facturaEmitidaId') } : {}),
    ...(scalar('facturaRecibidaId') ? { facturaRecibidaId: scalar('facturaRecibidaId') } : {}),
    ...(scalar('nominaId') ? { nominaId: scalar('nominaId') } : {}),
    ...(scalar('movimientoParId') ? { movimientoParId: scalar('movimientoParId') } : {}),
    ...(scalar('transferFingerprint') ? { transferFingerprint: scalar('transferFingerprint') } : {}),
    ...(integer('versionB4') !== undefined ? { versionB4: integer('versionB4') } : {}),
    ...(remesaIds ? { remesaIds } : {}),
  } as ConciliarProjectionSource
}

export function projectionRow(row: ProjectionSqlRow): ConciliarRow & { source: ConciliarProjectionSource; sourceFingerprint: string; updatedAt: string } {
  const tab = String(row.tab)
  const color = String(row.color)
  if (!(CONCILIAR_TABS as readonly string[]).includes(tab) || !(CONCILIAR_COLORS as readonly string[]).includes(color)) {
    fail(409, 'PROYECCION_CORRUPTA', 'La proyección contiene una clasificación no válida.')
  }
  const source = storedSource(row.source)
  const sourceFingerprint = typeof row.source_fingerprint === 'string' && /^[a-f0-9]{64}$/.test(row.source_fingerprint) ? row.source_fingerprint : null
  if (!source || !sourceFingerprint) fail(409, 'PROYECCION_CORRUPTA', 'La proyección no conserva su identidad de fuente.')
  const view: Omit<ConciliarRow, 'decisionHash'> = {
    id: String(row.id), movimientoId: row.movimiento_id === null || row.movimiento_id === undefined ? null : String(row.movimiento_id),
    fecha: day(row.fecha, 'La fila'), concepto: textoSeguro(row.concepto), banco: nullableText(row.banco, 300), cuenta: nullableText(row.cuenta, 300),
    importeCentimos: cents(row.importe_centimos, 'La fila'), pendienteCentimos: cents(row.pendiente_centimos, 'La fila'), color: color as ConciliarColor,
    grupo: nullableText(row.grupo, 120), motivo: textoSeguro(row.motivo), documento: document(row.documento), propuesta: nullableText(row.propuesta, 500),
    seleccionable: row.seleccionable === true, diferenciaCentimos: cents(row.diferencia_centimos, 'La fila'),
    ...(links(row.links_movimiento) ? { linksMovimiento: links(row.links_movimiento) } : {}), detail: nullableText(row.detail, 1_600),
  }
  const updated = new Date(String(row.updated_at))
  if (!Number.isFinite(updated.getTime())) fail(409, 'PROYECCION_CORRUPTA', 'La proyección no conserva una fecha de actualización válida.')
  return { ...view, decisionHash: conciliarDecisionHash({ row: view, source, sourceFingerprint }), source, sourceFingerprint, updatedAt: updated.toISOString() }
}

function filters(input: Omit<ConciliarGetInput, 'tab'>): Prisma.Sql {
  const pieces: Prisma.Sql[] = []
  if (input.desde) pieces.push(Prisma.sql`p.fecha >= CAST(${input.desde} AS date)`)
  if (input.hasta) pieces.push(Prisma.sql`p.fecha <= CAST(${input.hasta} AS date)`)
  if (input.cuentaId) pieces.push(Prisma.sql`p.cuenta_id=${input.cuentaId}`)
  if (input.q) {
    // Search text is literal. % and _ must not silently broaden a user query.
    const pattern = `%${input.q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
    pieces.push(Prisma.sql`(
      p.id=${input.q} OR p.movimiento_id=${input.q} OR p.concepto ILIKE ${pattern} OR COALESCE(p.banco,'') ILIKE ${pattern} OR COALESCE(p.cuenta,'') ILIKE ${pattern}
      OR COALESCE(p.grupo,'') ILIKE ${pattern} OR COALESCE(p.documento->>'referencia','') ILIKE ${pattern}
      OR COALESCE(p.documento->>'tercero','') ILIKE ${pattern} OR CAST(p.importe_centimos AS text) ILIKE ${pattern}
    )`)
  }
  return pieces.length ? Prisma.join(pieces, ' AND ') : Prisma.sql`TRUE`
}
type MutableConciliarTabSummary = {
  tab: ConciliarTab
  count: number
  amountCentimos: number
  colors: Record<ConciliarColor, { count: number; amountCentimos: number }>
}
function summaryZero(tab: ConciliarTab): MutableConciliarTabSummary {
  return { tab, count: 0, amountCentimos: 0, colors: { VERDE: { count: 0, amountCentimos: 0 }, AMBAR: { count: 0, amountCentimos: 0 }, ROJO: { count: 0, amountCentimos: 0 } } }
}
function count(value: unknown): number { const parsed = safeInteger(value); return parsed === null || parsed < 0 ? 0 : parsed }

export async function readConciliarProjection(input: ConciliarGetInput) {
  const shared = filters(input)
  const [rows, totalRows, summaryRows, accounts, stateRows] = await Promise.all([
    db().$queryRaw<ProjectionSqlRow[]>(Prisma.sql`
      SELECT p.* FROM conciliar_proyecciones p
      WHERE p.tab=${input.tab} AND ${shared}
      ORDER BY CASE p.color WHEN 'VERDE' THEN 0 WHEN 'AMBAR' THEN 1 WHEN 'ROJO' THEN 2 ELSE 3 END ASC,
        abs(p.importe_centimos::bigint) DESC,p.fecha DESC,p.id ASC
      LIMIT ${input.limit} OFFSET ${input.offset}
    `),
    db().$queryRaw<Array<{ total: bigint | number | string }>>(Prisma.sql`
      SELECT COUNT(*) AS total FROM conciliar_proyecciones p WHERE p.tab=${input.tab} AND ${shared}
    `),
    db().$queryRaw<Array<{ tab: string; color: string; total: bigint | number | string; amount: bigint | number | string }>>(Prisma.sql`
      SELECT p.tab,p.color,COUNT(*) AS total,COALESCE(SUM(p.pendiente_centimos::bigint),0)::text AS amount
      FROM conciliar_proyecciones p WHERE ${shared} GROUP BY p.tab,p.color
    `),
    db().$queryRaw<Array<{ id: string; banco: string; alias: string | null }>>(Prisma.sql`
      SELECT id,banco,alias FROM cuentas_bancarias WHERE activa=true ORDER BY banco ASC,alias ASC NULLS LAST,id ASC LIMIT 100
    `),
    db().$queryRaw<Array<{ dirtyAt: Date | null; dirtyReason: string | null; rebuiltAt: Date | null; projectionVersion: bigint | number | string }>>(Prisma.sql`
      SELECT dirty_at AS "dirtyAt",dirty_reason AS "dirtyReason",rebuilt_at AS "rebuiltAt",projection_version AS "projectionVersion"
      FROM estado_proyeccion_conciliar WHERE singleton=true LIMIT 1
    `),
  ])
  const summaries = new Map<ConciliarTab, MutableConciliarTabSummary>(CONCILIAR_TABS.map(tab => [tab, summaryZero(tab)]))
  for (const row of summaryRows) {
    if (!(CONCILIAR_TABS as readonly string[]).includes(row.tab) || !(CONCILIAR_COLORS as readonly string[]).includes(row.color)) continue
    const item = summaries.get(row.tab as ConciliarTab)!
    const amountCentimos = cents(row.amount, 'El resumen')
    const color = row.color as ConciliarColor
    item.colors[color] = { count: count(row.total), amountCentimos }
    item.count += count(row.total)
    item.amountCentimos += amountCentimos
  }
  const state = stateRows[0]
  // An initial dirty migration has no trustworthy page timestamp. Returning null
  // would be rejected by the browser contract and could look like an empty queue.
  if (!state?.rebuiltAt) fail(503, 'PROYECCION_NO_PREPARADA', 'La conciliación se está preparando por primera vez. Vuelve a intentarlo en unos instantes.')
  return {
    tabs: CONCILIAR_TABS.map(tab => summaries.get(tab)!), rows: rows.map(projectionRow).map(({ source: _source, sourceFingerprint: _fingerprint, updatedAt: _updatedAt, ...row }) => row),
    total: count(totalRows[0]?.total), limit: input.limit, offset: input.offset,
    updatedAt: state.rebuiltAt.toISOString(),
    projectionVersion: state ? count(state.projectionVersion) : 0,
    stale: !!state?.dirtyAt,
    staleReason: state?.dirtyAt ? 'Hay cambios pendientes de actualizar. Las filas no se confirmarán sin volver a comprobarlas.' : null,
    cuentas: accounts.map(row => ({ id: row.id, banco: row.banco, cuenta: row.alias })),
  }
}

export async function readConciliarRow(id: string) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9:_-]{1,240}$/.test(id)) fail(400, 'FILA_INVALIDA', 'La fila solicitada no es válida.')
  const rows = await db().$queryRaw<ProjectionSqlRow[]>(Prisma.sql`SELECT * FROM conciliar_proyecciones WHERE id=${id} LIMIT 1`)
  if (!rows.length) fail(404, 'FILA_NO_ENCONTRADA', 'La fila ya no está disponible; actualiza la lista.')
  const result = projectionRow(rows[0])
  const { source: _source, sourceFingerprint: _fingerprint, updatedAt: _updatedAt, ...row } = result
  return row
}

export async function readConciliarRowForAction(tx: Prisma.TransactionClient, id: string) {
  const rows = await (tx as Tx).$queryRaw<ProjectionSqlRow[]>(Prisma.sql`SELECT * FROM conciliar_proyecciones WHERE id=${id} LIMIT 1 FOR UPDATE`)
  if (!rows.length) fail(409, 'FILA_OBSOLETA', 'La fila ya no está disponible. Actualiza la lista.')
  return projectionRow(rows[0])
}

export async function readConciliarHistory(actorId: number, limit: number, offset: number) {
  if (!Number.isSafeInteger(actorId) || actorId < 1) fail(401, 'NO_AUTORIZADO', 'No autorizado.')
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) fail(400, 'PAGINACION_INVALIDA', 'La paginación no es válida.')
  const [rows, totals] = await Promise.all([
    db().$queryRaw<Array<{ id: string; accion: string; estado: string; resultado: unknown; createdAt: Date; revertedAt: Date | null; parentId: string | null }>>(Prisma.sql`
      SELECT id::text,accion::text,estado::text,resultado,created_at AS "createdAt",revertida_at AS "revertedAt",operacion_padre_id::text AS "parentId"
      FROM operaciones_conciliar WHERE actor_id=${actorId} ORDER BY created_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}
    `),
    db().$queryRaw<Array<{ total: bigint | number | string }>>(Prisma.sql`SELECT COUNT(*) AS total FROM operaciones_conciliar WHERE actor_id=${actorId}`),
  ])
  return { total: count(totals[0]?.total), limit, offset, operations: rows.map(row => ({
    id: row.id, action: row.accion, state: row.estado, createdAt: row.createdAt.toISOString(), revertedAt: row.revertedAt?.toISOString() ?? null,
    reversible: row.accion === 'CONFIRMAR' && row.estado !== 'REVERTIDA', parentId: row.parentId, result: json(row.resultado),
  })) }
}
