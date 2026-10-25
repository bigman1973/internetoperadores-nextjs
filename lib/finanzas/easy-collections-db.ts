import { Prisma, PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import prisma from '@/lib/prisma'
import { assertFinanceEasyRuntime, FinanceEasyRuntimeError } from '@/lib/finanzas/prototype-staging'
import { B4_CONCILIACION_AREA } from '@/lib/finanzas/reconciliation-auth'
import { verificarPermisoServer } from '@/lib/permisos'
import { B4ServiceError, confirmarB4Tx, createDocumentoB4Tx, deshacerB4Tx } from '@/lib/finanzas/reconciliation-db'
import {
  EASY_COLLECTIONS_MAX_ITEMS,
  EASY_COLLECTIONS_MAX_BLOCK_ITEMS,
  EasyCollectionsValidationError,
  assertEasyCollectionBlockSelection,
  easyCollectionFingerprint,
  easyCollectionSelection,
  easyCollectionsDigest,
  easyCollectionsRequestHash,
  methodLabel,
  parseEasyCollectionLines,
  parseEasyCollectionsCommand,
  type EasyCollectionCommand,
  type EasyCollectionLevel,
  type EasyCollectionMethod,
  type EasyCollectionPreviewInput,
  type EasyCollectionSelection,
  type EasyCollectionState,
} from '@/lib/finanzas/easy-collections-core'
import { signEasyCollectionsPreview, verifyEasyCollectionsPreview } from '@/lib/finanzas/easy-collections-preview'

type Db = PrismaClient & Record<string, any>
type Tx = Prisma.TransactionClient & Record<string, any>
type QueryDb = (PrismaClient | Prisma.TransactionClient) & Record<string, any>
type Raw = Record<string, any>
const db = () => prisma as Db
const asTx = (tx: Prisma.TransactionClient) => tx as Tx
const MAX_PREVIEW_POPULATION = 10_000
const MAX_RECENT_BLOCKS = 20
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class EasyCollectionsServiceError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message) }
}
const fail = (status: number, code: string, message: string): never => { throw new EasyCollectionsServiceError(status, code, message) }

function exactInteger(value: unknown, field: string): number {
  if (typeof value === 'bigint') {
    const result = Number(value)
    if (Number.isSafeInteger(result)) return result
  }
  if (Number.isSafeInteger(value)) return value as number
  fail(409, 'PROPUESTA_INTEGRA_INVALIDA', `${field} ya no es válido.`)
}
function string(value: unknown, field: string, max = 600): string {
  if (typeof value !== 'string' || !value || value.length > max) fail(409, 'PROPUESTA_INTEGRA_INVALIDA', `${field} ya no es válido.`)
  return value as string
}
function optionalText(value: unknown, max = 600): string | null {
  return typeof value === 'string' && value.length <= max ? value : null
}
function json(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return null }
}
function iso(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value))) return value.slice(0, 10)
  return null
}
function state(value: unknown): EasyCollectionState {
  if (value === 'JUSTIFICADO' || value === 'NO_REQUIERE') return value
  fail(409, 'PROPUESTA_INTEGRA_INVALIDA', 'El estado propuesto ya no es válido.')
}
function level(value: unknown): EasyCollectionLevel {
  if (value === 'EXACTA' || value === 'REVISAR') return value
  fail(409, 'PROPUESTA_INTEGRA_INVALIDA', 'El nivel propuesto ya no es válido.')
}
function method(value: unknown): EasyCollectionMethod {
  const methods: readonly string[] = ['REMESA_VENCIMIENTO', 'REMESA_UNION', 'REMESA_RESIDUO', 'REF_FACTURA', 'REF_FACTURA_PARCIAL', 'COBRO_ISP', 'CLIENTE_IMPORTE', 'SUMA_CLIENTE', 'CONFIRMING_C9', 'TRASPASO_PROPIO', 'DEVOLUCION_RECIBO']
  if (typeof value === 'string' && methods.includes(value)) return value as EasyCollectionMethod
  fail(409, 'PROPUESTA_INTEGRA_INVALIDA', 'El método propuesto ya no es válido.')
}
function sinDocumento(value: unknown): boolean { return value === 'SIN_DOCUMENTO' }
function safeJsonDetail(value: unknown): Raw { return value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {} }

/** Una proyección con todo el contexto de banco y B4 necesario para revalidar. */
type ProposalRow = Raw & {
  propuestaId: string; generacionId: string; movimientoId: string; movimientoParId: string | null
  importePropuesto: unknown; metodo: unknown; nivel: unknown; estadoPropuesto: unknown; motivoNoRequiere: unknown
  lineas: unknown; composicion?: unknown; explicacion: unknown; fingerprint: unknown
  fecha: unknown; banco: unknown; cuentaAlias: unknown; concepto: unknown; importeBanco: unknown; cuentaId: unknown; estadoB4: unknown; versionB4: unknown
  parFecha?: unknown; parCuentaAlias?: unknown; parConcepto?: unknown; parImporteBanco?: unknown; parCuentaId?: unknown; parEstadoB4?: unknown; parVersionB4?: unknown
}
type CheckedProposal = Readonly<{
  propuestaId: string; generacionId: string; movimientoId: string; movimientoParId: string | null
  importeMovimientoCentimos: number; metodo: EasyCollectionMethod; nivel: EasyCollectionLevel; estadoPropuesto: EasyCollectionState; motivoNoRequiere: 'TRASPASO_INTERNO_SIN_DOCUMENTO' | null
  lineas: readonly ReturnType<typeof parseEasyCollectionLines>[number][]; fingerprint: string; explicacion: string
  fecha: string; banco: string; cuentaAlias: string | null; concepto: string; cuentaId: string; version: number
  par: null | { movimientoId: string; fecha: string; cuentaAlias: string | null; concepto: string; importeCentimos: number; cuentaId: string; estado: string; version: number }
}>

function proposalFromRow(row: ProposalRow): CheckedProposal {
  const propuestaId = string(row.propuestaId, 'La propuesta', 64).toLowerCase()
  const generacionId = string(row.generacionId, 'La generación', 64).toLowerCase()
  const movimientoId = string(row.movimientoId, 'El movimiento', 160)
  const movimientoParId = row.movimientoParId === null || row.movimientoParId === undefined ? null : string(row.movimientoParId, 'El movimiento de la otra cuenta', 160)
  if (!UUID.test(propuestaId) || !UUID.test(generacionId)) fail(409, 'PROPUESTA_INTEGRA_INVALIDA', 'La propuesta ya no tiene un identificador válido.')
  const importeMovimientoCentimos = exactInteger(row.importePropuesto, 'El importe propuesto')
  const importeBanco = exactInteger(row.importeBanco, 'El importe del banco')
  const metodo = method(row.metodo), nivel = level(row.nivel), estadoPropuesto = state(row.estadoPropuesto)
  const motivo = row.motivoNoRequiere === null || row.motivoNoRequiere === undefined ? null : String(row.motivoNoRequiere)
  const motivoNoRequiere = motivo === 'TRASPASO_INTERNO_SIN_DOCUMENTO' ? motivo : null
  if ((estadoPropuesto === 'NO_REQUIERE') !== (motivoNoRequiere !== null)) fail(409, 'PROPUESTA_INTEGRA_INVALIDA', 'El motivo de la propuesta ya no es válido.')
  if ((metodo === 'TRASPASO_PROPIO') !== (movimientoParId !== null)) fail(409, 'PROPUESTA_INTEGRA_INVALIDA', 'La pareja de movimientos de la propuesta ya no es válida.')
  const lineas = parseEasyCollectionLines(json(row.lineas), importeMovimientoCentimos, estadoPropuesto, motivoNoRequiere)
  const fingerprint = string(row.fingerprint, 'La huella de la propuesta', 64)
  const recalculated = easyCollectionFingerprint({ v: 1, movimientoId, movimientoParId, importeMovimientoCentimos, metodo, nivel, estadoPropuesto, motivoNoRequiere, lineas })
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || fingerprint !== recalculated) fail(409, 'PROPUESTA_INTEGRA_INVALIDA', 'La propuesta ya no conserva la misma información.')
  if (importeBanco !== importeMovimientoCentimos) fail(409, 'SELECCION_CAMBIADA', 'El importe del banco ya no coincide con la propuesta.')
  const fecha = iso(row.fecha), banco = optionalText(row.banco, 240), concepto = optionalText(row.concepto, 1_000), cuentaId = optionalText(row.cuentaId, 160)
  if (!fecha || !banco || concepto === null || !cuentaId) fail(409, 'PROPUESTA_INTEGRA_INVALIDA', 'Faltan datos actuales del movimiento bancario.')
  const version = row.versionB4 === null || row.versionB4 === undefined ? 1 : exactInteger(row.versionB4, 'La versión del movimiento')
  let par: CheckedProposal['par'] = null
  if (movimientoParId !== null) {
    const parFecha = iso(row.parFecha), parCuentaId = optionalText(row.parCuentaId, 160), parConcepto = optionalText(row.parConcepto, 1_000)
    if (!parFecha || !parCuentaId || parConcepto === null) fail(409, 'SELECCION_CAMBIADA', 'El otro movimiento del traspaso ya no está disponible.')
    par = {
      movimientoId: movimientoParId, fecha: parFecha, cuentaAlias: optionalText(row.parCuentaAlias, 240), concepto: parConcepto,
      importeCentimos: exactInteger(row.parImporteBanco, 'El importe del otro movimiento'), cuentaId: parCuentaId,
      estado: String(row.parEstadoB4 ?? 'SIN_DOCUMENTO'), version: row.parVersionB4 === null || row.parVersionB4 === undefined ? 1 : exactInteger(row.parVersionB4, 'La versión del otro movimiento'),
    }
  }
  return {
    propuestaId, generacionId, movimientoId, movimientoParId, importeMovimientoCentimos, metodo, nivel, estadoPropuesto, motivoNoRequiere,
    lineas, fingerprint, explicacion: string(row.explicacion, 'La explicación', 600), fecha, banco, cuentaAlias: optionalText(row.cuentaAlias, 240), concepto, cuentaId, version, par,
  }
}
function transferValid(item: CheckedProposal): boolean {
  return item.metodo === 'TRASPASO_PROPIO' && item.estadoPropuesto === 'NO_REQUIERE' && item.importeMovimientoCentimos > 0
    && !!item.par && sinDocumento(item.par.estado) && item.par.importeCentimos === -item.importeMovimientoCentimos && item.par.cuentaId !== item.cuentaId
}
function selectionFacts(item: CheckedProposal) {
  return { importeMovimientoCentimos: item.importeMovimientoCentimos, metodo: item.metodo, nivel: item.nivel, estadoPropuesto: item.estadoPropuesto, movimientoParId: item.movimientoParId, parValido: transferValid(item) }
}

async function currentGenerationTx(tx: QueryDb, lock = false): Promise<{ id: string; creadaAt: string; fuente: string } | null> {
  const rows = await tx.$queryRaw<Array<{ id: string; creadaAt: Date | string; fuente: string }>>(Prisma.sql`
    SELECT id::text AS id,creada_at AS "creadaAt",fuente
    FROM modo_facil_generaciones_cobro
    ORDER BY creada_at DESC,id DESC
    LIMIT 1 ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}
  `)
  const row = rows[0]
  const creadaAt = row ? (row.creadaAt instanceof Date ? row.creadaAt.toISOString() : new Date(row.creadaAt).toISOString()) : null
  return row && creadaAt && Number.isFinite(Date.parse(creadaAt)) ? { id: row.id, creadaAt, fuente: row.fuente } : null
}

function proposalPopulationSql(generationId: string, proposalIds?: readonly string[], lock = false): Prisma.Sql {
  const idClause = proposalIds ? Prisma.sql`AND p.id IN (${Prisma.join(proposalIds.map(id => Prisma.sql`CAST(${id} AS uuid)`) )})` : Prisma.empty
  return Prisma.sql`
    SELECT p.id::text AS "propuestaId",p.generacion_id::text AS "generacionId",p.movimiento_id AS "movimientoId",p.movimiento_par_id AS "movimientoParId",
      p.importe_movimiento_centimos AS "importePropuesto",p.metodo,p.nivel,p.estado_propuesto AS "estadoPropuesto",p.motivo_no_requiere AS "motivoNoRequiere",p.lineas,p.explicacion,p.fingerprint,
      m.fecha_operacion AS fecha,c.banco,c.alias AS "cuentaAlias",m.concepto,b4_importe_bancario_centimos(m.importe) AS "importeBanco",m.cuenta_id AS "cuentaId",
      COALESCE(e.estado::text,'SIN_DOCUMENTO') AS "estadoB4",e.version AS "versionB4",
      pm.fecha_operacion AS "parFecha",pc.alias AS "parCuentaAlias",pm.concepto AS "parConcepto",b4_importe_bancario_centimos(pm.importe) AS "parImporteBanco",pm.cuenta_id AS "parCuentaId",
      COALESCE(pe.estado::text,'SIN_DOCUMENTO') AS "parEstadoB4",pe.version AS "parVersionB4"
    FROM modo_facil_propuestas_cobro p
    JOIN movimientos_bancarios m ON m.id=p.movimiento_id
    JOIN cuentas_bancarias c ON c.id=m.cuenta_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    LEFT JOIN movimientos_bancarios pm ON pm.id=p.movimiento_par_id
    LEFT JOIN cuentas_bancarias pc ON pc.id=pm.cuenta_id
    LEFT JOIN estado_justificacion_movimientos pe ON pe.movimiento_id=pm.id
    WHERE p.generacion_id=CAST(${generationId} AS uuid) ${idClause}
    ORDER BY p.movimiento_id ASC
    ${lock ? Prisma.sql`FOR UPDATE OF p` : Prisma.empty}
  `
}
async function proposalsTx(tx: QueryDb, generationId: string, proposalIds?: readonly string[], lock = false, discardInvalid = false): Promise<CheckedProposal[]> {
  const rows = await tx.$queryRaw<ProposalRow[]>(proposalPopulationSql(generationId, proposalIds, lock))
  if (!proposalIds && rows.length > MAX_PREVIEW_POPULATION) fail(409, 'PROPUESTAS_DEMASIADAS', 'Hay demasiadas propuestas para revisarlas con seguridad; acota la generación antes de continuar.')
  if (!discardInvalid) return rows.map(proposalFromRow)
  const accepted: CheckedProposal[] = []
  for (const row of rows) {
    try { accepted.push(proposalFromRow(row)) }
    catch (error) {
      if (!(error instanceof EasyCollectionsServiceError)) throw error
      // La fuente es append-only: una fila dañada no se repara ni se expone.
    }
  }
  return accepted
}
async function compositionsTx(tx: QueryDb, ids: readonly string[]): Promise<Map<string, unknown>> {
  if (!ids.length) return new Map()
  const rows = await tx.$queryRaw<Array<{ propuestaId: string; composicion: unknown }>>(Prisma.sql`
    SELECT id::text AS "propuestaId",composicion FROM modo_facil_propuestas_cobro
    WHERE id IN (${Prisma.join(ids.map(id => Prisma.sql`CAST(${id} AS uuid)`))})
    LIMIT ${ids.length}
  `)
  return new Map(rows.map(row => [row.propuestaId, json(row.composicion)]))
}
function compositionView(raw: unknown) {
  const input = Array.isArray(raw) ? raw : []
  const complete = input.map(value => {
    const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {}
    return {
      numFactura: optionalText(row.numFactura, 240), cliente: optionalText(row.cliente, 240),
      importeCentimos: Number.isSafeInteger(row.importeCentimos) ? row.importeCentimos as number : 0,
      vencimiento: iso(row.vencimiento), facturaEmitidaId: row.facturaEmitidaId === null || row.facturaEmitidaId === undefined ? null : optionalText(row.facturaEmitidaId, 160),
    }
  })
  return { composicion: complete.slice(0, 60), composicionTotal: complete.length, composicionImporteCentimos: complete.reduce((sum, row) => sum + row.importeCentimos, 0) }
}
function lineView(item: CheckedProposal) {
  return item.lineas.map(line => line.tipo === 'DOCUMENTO'
    ? { tipo: 'DOCUMENTO', referencia: line.tipoDocumento === 'REMESA' ? `Remesa ${line.sourceId}` : `Factura emitida ${line.sourceId}`, importeCentimos: line.importeCentimos }
    : { tipo: 'DIFERENCIA', referencia: line.motivoDiferencia === 'COMISION' ? 'Diferencia por comisión' : line.motivoDiferencia === 'INTERESES' ? 'Diferencia por intereses' : 'Diferencia por redondeo', importeCentimos: line.importeCentimos })
}
function sortPreview(items: readonly CheckedProposal[]): CheckedProposal[] {
  return [...items].sort((left, right) => Math.abs(right.importeMovimientoCentimos) - Math.abs(left.importeMovimientoCentimos) || left.movimientoId.localeCompare(right.movimientoId))
}
function filtered(items: readonly CheckedProposal[], input: EasyCollectionPreviewInput): CheckedProposal[] {
  const needle = input.q?.toLocaleLowerCase('es-ES')
  return items.filter(item => input.nivel === 'TODAS' || item.nivel === input.nivel)
    .filter(item => !input.metodo || item.metodo === input.metodo)
    .filter(item => !needle || [item.concepto, item.banco, item.cuentaAlias ?? ''].some(value => value.toLocaleLowerCase('es-ES').includes(needle)))
}
function totals(items: readonly CheckedProposal[]) {
  const sum = (rows: readonly CheckedProposal[]) => rows.reduce((total, item) => total + item.importeMovimientoCentimos, 0)
  const exactas = items.filter(item => item.nivel === 'EXACTA'), revisar = items.filter(item => item.nivel === 'REVISAR')
  const methods = ['REMESA_VENCIMIENTO', 'REMESA_UNION', 'REMESA_RESIDUO', 'REF_FACTURA', 'REF_FACTURA_PARCIAL', 'COBRO_ISP', 'CLIENTE_IMPORTE', 'SUMA_CLIENTE', 'CONFIRMING_C9', 'TRASPASO_PROPIO', 'DEVOLUCION_RECIBO'] as EasyCollectionMethod[]
  return {
    pendientes: items.length, pendientesImporteCentimos: sum(items), exactas: exactas.length, exactasImporteCentimos: sum(exactas), revisar: revisar.length, revisarImporteCentimos: sum(revisar),
    porMetodo: methods.flatMap(metodo => {
      const rows = items.filter(item => item.metodo === metodo)
      return rows.length ? [{ metodo, etiqueta: methodLabel(metodo), exactas: rows.filter(item => item.nivel === 'EXACTA').length, revisar: rows.filter(item => item.nivel === 'REVISAR').length, importeCentimos: sum(rows) }] : []
    }),
  }
}

async function recentBlocksTx(tx: QueryDb, actorId: number) {
  const rows = await tx.$queryRaw<Array<{ bloqueId: string; at: Date | string; confirmadas: bigint | number; importeCentimos: bigint | number; revertido: boolean }>>(Prisma.sql`
    WITH bloques AS (
      SELECT e.detalle->>'bloqueId' AS "bloqueId",MAX(e.created_at) AS at,COUNT(DISTINCT e.detalle->>'propuestaId') AS confirmadas,
        COALESCE(SUM(b4_importe_bancario_centimos(m.importe)),0) AS "importeCentimos"
      FROM eventos_justificacion_b4 e
      JOIN movimientos_bancarios m ON m.id=e.movimiento_id
      WHERE e.actor_id=${actorId} AND e.accion='APROBACION'::"AccionEventoJustificacionB4"
        AND e.detalle->>'origen'='PROPUESTA_COBRO' AND e.detalle->>'bulkKind'='COBROS_CONFIRMACION' AND e.detalle->>'rol'='PRINCIPAL'
      GROUP BY e.detalle->>'bloqueId'
    )
    SELECT b."bloqueId",b.at,b.confirmadas,b."importeCentimos",EXISTS(
      SELECT 1 FROM eventos_justificacion_b4 r
      WHERE r.accion='REVERSION'::"AccionEventoJustificacionB4" AND r.detalle->>'bloqueId'=b."bloqueId" AND r.detalle->>'bulkKind'='COBROS_REVERSION'
    ) AS revertido
    FROM bloques b ORDER BY b.at DESC,b."bloqueId" DESC LIMIT ${MAX_RECENT_BLOCKS}
  `)
  return rows.map(row => ({ bloqueId: row.bloqueId, at: row.at instanceof Date ? row.at.toISOString() : new Date(row.at).toISOString(), confirmadas: exactInteger(row.confirmadas, 'El bloque'), importeCentimos: exactInteger(row.importeCentimos, 'El bloque'), revertido: row.revertido === true }))
}

/** Lectura dentro de una transacción propiedad del llamador; no escribe B4. */
export async function readEasyCollectionsPreviewTx(base: Prisma.TransactionClient, input: EasyCollectionPreviewInput, actorId: number) {
      const generation = await currentGenerationTx(base)
      if (!generation) return { generacion: null, totales: totals([]), items: [], limit: input.limit, offset: input.offset, previewToken: null, bloquesRecientes: await recentBlocksTx(base, actorId) }
      const all = await proposalsTx(base, generation.id, undefined, false, true)
      // The row parser has checked integrity; state must be read from the same SQL row.
      const rawRows = await base.$queryRaw<ProposalRow[]>(proposalPopulationSql(generation.id))
      const byId = new Map(rawRows.map(row => [String(row.propuestaId), row]))
      const valid = all.filter(item => {
        const row = byId.get(item.propuestaId)
        return !!row && sinDocumento(row.estadoB4) && (item.movimientoParId === null || sinDocumento(row.parEstadoB4))
      })
      const scope = filtered(valid, input)
      const ordered = sortPreview(scope)
      const page = ordered.slice(input.offset, input.offset + input.limit)
      const compositions = await compositionsTx(base, page.map(item => item.propuestaId))
      const items = page.map(item => {
        const choice = easyCollectionSelection(selectionFacts(item))
        return {
          propuestaId: item.propuestaId, movimientoId: item.movimientoId, fecha: item.fecha, banco: item.banco, cuentaAlias: item.cuentaAlias, concepto: item.concepto,
          importeMovimientoCentimos: item.importeMovimientoCentimos, metodo: item.metodo, etiquetaMetodo: methodLabel(item.metodo), nivel: item.nivel,
          explicacion: item.explicacion, lineas: lineView(item), ...compositionView(compositions.get(item.propuestaId)),
          par: item.par ? { movimientoId: item.par.movimientoId, fecha: item.par.fecha, cuentaAlias: item.par.cuentaAlias, concepto: item.par.concepto, importeCentimos: item.par.importeCentimos } : null,
          fingerprint: item.fingerprint, seleccionable: choice.seleccionable, motivoNoSeleccionable: choice.motivoNoSeleccionable,
        }
      })
      const selected = page.map(item => ({ propuestaId: item.propuestaId, movimientoId: item.movimientoId, fingerprint: item.fingerprint }))
      return { generacion: generation, totales: totals(valid), items, limit: input.limit, offset: input.offset, previewToken: selected.length ? signEasyCollectionsPreview(actorId, selected) : null, bloquesRecientes: await recentBlocksTx(base, actorId) }
}
/** Sólo lectura: nunca crea envoltorios B4 ni estados. */
export async function readEasyCollectionsPreview(input: EasyCollectionPreviewInput, actorId: number) {
  await assertFinanceEasyRuntime()
  try {
    return await db().$transaction(async base => {
      await base.$executeRaw`SET TRANSACTION READ ONLY`
      return readEasyCollectionsPreviewTx(base, input, actorId)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10_000, timeout: 45_000 })
  } catch (error) { throwKnown(error) }
}

async function liveActorTx(tx: Tx, actorId: number) {
  if (!Number.isSafeInteger(actorId) || actorId <= 0) fail(403, 'SIN_PERMISO_ACTUAL', 'Ya no tienes permiso para confirmar propuestas de cobro.')
  const rows = await tx.$queryRaw<Array<{ id: number; activo: boolean; rol: string; roles: unknown }>>(Prisma.sql`
    SELECT id,activo,rol,roles FROM usuarios_admin WHERE id=${actorId} LIMIT 1 FOR SHARE
  `)
  await tx.$queryRaw(Prisma.sql`SELECT id FROM permiso_usuarios WHERE usuario_id=${actorId} FOR SHARE`)
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM permiso_areas
    WHERE codigo IN ('admin','admin.finanzas','admin.finanzas.conciliacion')
    FOR SHARE
  `)
  const actor = rows[0]
  if (!actor?.activo) fail(403, 'SIN_PERMISO_ACTUAL', 'Ya no tienes permiso para confirmar propuestas de cobro.')
  const permission = await verificarPermisoServer(actor.id, B4_CONCILIACION_AREA, actor.rol, tx)
  if (permission.escritura) return { id: actor.id, rol: actor.rol }
  const roles = Array.isArray(actor.roles) ? actor.roles.filter((role): role is string => typeof role === 'string') : []
  const assigned = await tx.permisoUsuario.count({ where: { usuarioId: actor.id, OR: [{ lectura: true }, { escritura: true }] } })
  if (assigned === 0 && [actor.rol, ...roles].includes('CONTABILIDAD')) return { id: actor.id, rol: actor.rol }
  fail(403, 'SIN_PERMISO_ACTUAL', 'Ya no tienes permiso para confirmar propuestas de cobro.')
}
async function batchLock(tx: Tx, actorId: number, key: string) {
  const clave = `easy-collections:${actorId}:${key}`
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))::text AS locked`)
}
async function lockMovements(tx: Tx, ids: readonly string[]) {
  for (const id of [...new Set(ids)].sort((left, right) => left.localeCompare(right))) {
    // Mantiene el mismo orden que B4: primero el cerrojo consultivo por movimiento
    // y después FOR UPDATE. Así no se cruza con una confirmación individual.
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text AS locked`)
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM movimientos_bancarios WHERE id=${id} FOR UPDATE`)
    if (rows.length !== 1) fail(409, 'SELECCION_CAMBIADA', 'Uno de los movimientos ya no está disponible; actualiza la lista.')
  }
}
function keyHash(actorId: number, key: string) { return easyCollectionsDigest({ actorId, key }) }
async function receiptTx(tx: Tx, actorId: number, hash: string, accion: 'APROBACION' | 'REVERSION') {
  return tx.eventoJustificacionB4.findMany({
    where: { actorId, accion, detalle: { path: ['bulkKeyHash'], equals: hash } }, include: { operacion: true }, orderBy: { createdAt: 'asc' }, take: EASY_COLLECTIONS_MAX_BLOCK_ITEMS * 2 + 1,
  })
}
function replay(rows: readonly any[], requestHash: string, kind: 'COBROS_CONFIRMACION' | 'COBROS_REVERSION') {
  if (!rows.length) return null
  if (rows.length > EASY_COLLECTIONS_MAX_BLOCK_ITEMS * 2 || rows.some(row => {
    const detail = safeJsonDetail(row.detalle)
    return detail.origen !== 'PROPUESTA_COBRO' || detail.bulkKind !== kind || detail.bulkRequestHash !== requestHash || typeof detail.bloqueId !== 'string' || typeof detail.propuestaId !== 'string'
  })) fail(409, 'IDEMPOTENCIA_NO_COINCIDE', 'Esta clave ya se usó para otra selección.')
  const details = rows.map(row => safeJsonDetail(row.detalle))
  const bloqueId = String(details[0].bloqueId)
  if (details.some(detail => detail.bloqueId !== bloqueId)) fail(409, 'IDEMPOTENCIA_NO_COINCIDE', 'Esta clave ya se usó para otra selección.')
  const count = new Set(details.map(detail => String(detail.propuestaId))).size
  if (count < 1 || count > EASY_COLLECTIONS_MAX_BLOCK_ITEMS) fail(409, 'IDEMPOTENCIA_NO_COINCIDE', 'El recibo del bloque no es válido.')
  return kind === 'COBROS_CONFIRMACION'
    ? { ok: true as const, bloqueId, confirmadas: count, importeCentimos: 0, idempotente: true as const }
    : { ok: true as const, bloqueId, revertidas: count, idempotente: true as const }
}
async function initialSelectedTx(tx: Tx, generationId: string, selected: readonly EasyCollectionSelection[]) {
  const candidates = await proposalsTx(tx, generationId, selected.map(item => item.propuestaId))
  const byId = new Map(candidates.map(item => [item.propuestaId, item]))
  if (byId.size !== selected.length) fail(409, 'SELECCION_CAMBIADA', 'Alguna propuesta ya no pertenece a la generación actual; actualiza la lista.')
  return selected.map(choice => {
    const item = byId.get(choice.propuestaId)
    if (!item || item.movimientoId !== choice.movimientoId || item.fingerprint !== choice.fingerprint) fail(409, 'SELECCION_CAMBIADA', 'La selección cambió; actualiza la lista.')
    return item
  })
}
async function selectedUnderLockTx(tx: Tx, generationId: string, selected: readonly EasyCollectionSelection[]) {
  const rows = await proposalsTx(tx, generationId, selected.map(item => item.propuestaId), true)
  const byId = new Map(rows.map(item => [item.propuestaId, item]))
  const result = selected.map(choice => {
    const item = byId.get(choice.propuestaId)
    if (!item || item.movimientoId !== choice.movimientoId || item.fingerprint !== choice.fingerprint) fail(409, 'SELECCION_CAMBIADA', 'Una propuesta cambió; actualiza la lista.')
    return item
  })
  // proposalFromRow validates bank amount and its own immutable fingerprint. State is
  // re-read once more from the locked projection to reject a B4 confirmation race.
  const sourceRows = await tx.$queryRaw<ProposalRow[]>(proposalPopulationSql(generationId, selected.map(item => item.propuestaId), true))
  const stateById = new Map(sourceRows.map(row => [String(row.propuestaId), row]))
  for (const item of result) {
    const row = stateById.get(item.propuestaId)
    if (!row || !sinDocumento(row.estadoB4) || (item.movimientoParId !== null && !sinDocumento(row.parEstadoB4))) fail(409, 'SELECCION_CAMBIADA', 'Uno de los movimientos ya tiene documento; no se ha confirmado nada.')
    if (item.metodo === 'TRASPASO_PROPIO' && !transferValid(item)) fail(409, 'SELECCION_CAMBIADA', 'El traspaso ya no tiene dos movimientos opuestos entre cuentas distintas.')
  }
  assertEasyCollectionBlockSelection(result.map(selectionFacts))
  return result
}
function b4Lines(item: CheckedProposal, wrappers: Map<number, string>) {
  return item.lineas.map(line => line.tipo === 'DOCUMENTO'
    ? { tipo: 'DOCUMENTO' as const, documentoConciliableId: wrappers.get(item.lineas.indexOf(line))!, importeCentimos: line.importeCentimos }
    : { tipo: 'DIFERENCIA' as const, motivoDiferencia: line.motivoDiferencia, importeCentimos: line.importeCentimos })
}
async function applyItemTx(tx: Tx, actorId: number, item: CheckedProposal, idempotencyKey: string) {
  const wrappers = new Map<number, string>()
  for (let index = 0; index < item.lineas.length; index += 1) {
    const line = item.lineas[index]
    if (line.tipo !== 'DOCUMENTO') continue
    const created = await createDocumentoB4Tx(tx, actorId, { action: 'documento', tipoDocumento: line.tipoDocumento, sourceId: line.sourceId })
    wrappers.set(index, created.documento.id)
  }
  return confirmarB4Tx(tx, actorId, {
    action: 'confirmar', confirmacion: true, idempotencyKey, version: item.version,
    borrador: { movimientoId: item.movimientoId, importeMovimientoCentimos: item.importeMovimientoCentimos, estado: item.estadoPropuesto, ...(item.estadoPropuesto === 'NO_REQUIERE' ? { motivoNoRequiere: 'TRASPASO_INTERNO_SIN_DOCUMENTO' } : {}), lineas: b4Lines(item, wrappers) },
  })
}
function auditDetail(input: { keyHash: string; requestHash: string; bloqueId: string; item: CheckedProposal; rol: 'PRINCIPAL' | 'PAR' }) {
  return { origen: 'PROPUESTA_COBRO', confirmacionHumana: true, bulkKind: 'COBROS_CONFIRMACION', bulkKeyHash: input.keyHash, bulkRequestHash: input.requestHash, bloqueId: input.bloqueId, propuestaId: input.item.propuestaId, generacionId: input.item.generacionId, metodo: input.item.metodo, fingerprint: input.item.fingerprint, rol: input.rol }
}
async function eventApprovalTx(tx: Tx, actorId: number, operationId: string, movimientoId: string, detail: Raw) {
  await tx.eventoJustificacionB4.create({ data: { operacionId: operationId, movimientoId, actorId, accion: 'APROBACION', detalle: detail } })
}

async function confirmTx(base: Prisma.TransactionClient, actorId: number, command: Extract<EasyCollectionCommand, { action: 'confirmar_bloque' }>) {
  const tx = asTx(base), requestHash = easyCollectionsRequestHash(actorId, command), bulkKeyHash = keyHash(actorId, command.idempotencyKey)
  await batchLock(tx, actorId, command.idempotencyKey)
  await liveActorTx(tx, actorId)
  const already = replay(await receiptTx(tx, actorId, bulkKeyHash, 'APROBACION'), requestHash, 'COBROS_CONFIRMACION')
  if (already) return already
  if (!verifyEasyCollectionsPreview(command.previewToken, actorId, command.items)) fail(409, 'PREVISUALIZACION_CADUCADA', 'La lista previa ha caducado o no corresponde a esta selección; actualízala. No se ha confirmado nada.')
  const generation = await currentGenerationTx(tx, true)
  if (!generation) fail(409, 'SELECCION_CAMBIADA', 'No hay una generación actual de propuestas; actualiza la lista.')
  const first = await initialSelectedTx(tx, generation.id, command.items)
  await lockMovements(tx, first.flatMap(item => item.par ? [item.movimientoId, item.par.movimientoId] : [item.movimientoId]))
  const selected = await selectedUnderLockTx(tx, generation.id, command.items)
  const bloqueId = randomUUID()
  const ordered = [...selected].sort((left, right) => left.movimientoId.localeCompare(right.movimientoId))
  const pairs: Array<{ item: CheckedProposal; operationId: string }> = []
  for (const item of ordered) {
    const main = await applyItemTx(tx, actorId, item, `MFC:${command.idempotencyKey}:${easyCollectionsDigest(item.movimientoId).slice(0, 24)}`)
    await eventApprovalTx(tx, actorId, main.operacion.id, item.movimientoId, auditDetail({ keyHash: bulkKeyHash, requestHash, bloqueId, item, rol: 'PRINCIPAL' }))
    if (transferValid(item) && item.par) pairs.push({ item, operationId: main.operacion.id })
  }
  // Todas las propuestas principales son cobros; las patas de cargo de traspaso
  // se aplican siempre después de esos cobros dentro de la misma transacción.
  for (const { item } of pairs) {
    if (item.par) {
      const pairResult = await confirmarB4Tx(tx, actorId, {
        action: 'confirmar', confirmacion: true, idempotencyKey: `MFC:${command.idempotencyKey}:${easyCollectionsDigest(item.par.movimientoId).slice(0, 24)}`, version: item.par.version,
        borrador: { movimientoId: item.par.movimientoId, importeMovimientoCentimos: item.par.importeCentimos, estado: 'NO_REQUIERE', motivoNoRequiere: 'TRASPASO_INTERNO_SIN_DOCUMENTO', lineas: [] },
      })
      await eventApprovalTx(tx, actorId, pairResult.operacion.id, item.par.movimientoId, auditDetail({ keyHash: bulkKeyHash, requestHash, bloqueId, item, rol: 'PAR' }))
    }
  }
  return { ok: true as const, bloqueId, confirmadas: selected.length, importeCentimos: selected.reduce((sum, item) => sum + item.importeMovimientoCentimos, 0), idempotente: false as const }
}

async function mayUndoOtherActorTx(tx: Tx, actorId: number): Promise<boolean> {
  const user = await tx.usuarioAdmin.findUnique({ where: { id: actorId }, select: { activo: true, rol: true, roles: true } })
  return !!user?.activo && (user.rol === 'SUPER_ADMIN' || (user.roles ?? []).includes('SUPER_ADMIN'))
}
async function undoTx(base: Prisma.TransactionClient, actorId: number, command: Extract<EasyCollectionCommand, { action: 'deshacer_bloque' }>) {
  const tx = asTx(base)
  const requestHash = easyCollectionsRequestHash(actorId, command), bulkKeyHash = keyHash(actorId, command.idempotencyKey)
  await batchLock(tx, actorId, command.idempotencyKey)
  await liveActorTx(tx, actorId)
  const already = replay(await receiptTx(tx, actorId, bulkKeyHash, 'REVERSION'), requestHash, 'COBROS_REVERSION')
  if (already) return already
  const events = await tx.eventoJustificacionB4.findMany({ where: { accion: 'APROBACION', detalle: { path: ['bloqueId'], equals: command.bloqueId } }, include: { operacion: true }, orderBy: { createdAt: 'asc' }, take: EASY_COLLECTIONS_MAX_BLOCK_ITEMS * 2 + 1 })
  const originals = events.filter(event => {
    const detail = safeJsonDetail(event.detalle)
    return detail.origen === 'PROPUESTA_COBRO' && detail.bulkKind === 'COBROS_CONFIRMACION'
  })
  if (!originals.length || originals.length > EASY_COLLECTIONS_MAX_BLOCK_ITEMS * 2) fail(404, 'BLOQUE_NO_ENCONTRADO', 'No se encontró un bloque de propuestas que se pueda deshacer.')
  const originalActor = originals[0].actorId
  if (!originalActor || originals.some(event => event.actorId !== originalActor)) fail(409, 'BLOQUE_CAMBIADO', 'El bloque de propuestas no es coherente y no se puede deshacer.')
  if (originalActor !== actorId && !await mayUndoOtherActorTx(tx, actorId)) fail(403, 'REVISION_NO_AUTORIZADA', 'Sólo quien confirmó el bloque o un superadministrador puede deshacerlo.')
  const proposalIds = new Set(originals.map(event => String(safeJsonDetail(event.detalle).propuestaId)))
  if (proposalIds.size < 1 || proposalIds.size > EASY_COLLECTIONS_MAX_BLOCK_ITEMS || originals.some(event => !UUID.test(String(safeJsonDetail(event.detalle).propuestaId)))) fail(409, 'BLOQUE_CAMBIADO', 'El bloque de propuestas no es coherente y no se puede deshacer.')
  if (new Set(originals.map(event => event.operacionId)).size !== originals.length) fail(409, 'BLOQUE_CAMBIADO', 'El bloque de propuestas no es coherente y no se puede deshacer.')
  await lockMovements(tx, originals.map(event => event.movimientoId))
  for (const event of originals) {
    if (event.operacion.estado !== 'APLICADA' || event.operacion.revertidaAt || event.operacion.revierteOperacionId !== null) fail(409, 'BLOQUE_CAMBIADO', 'Alguna operación del bloque ya cambió; no se ha deshecho nada.')
  }
  for (const event of originals) {
    const current = await tx.estadoJustificacionMovimientoB4.findUnique({ where: { movimientoId: event.movimientoId } })
    if (!current) fail(409, 'BLOQUE_CAMBIADO', 'Falta el estado actual de una operación del bloque.')
    const active = await tx.vinculoMovimientoDocumento.findMany({ where: { operacionCreacionId: event.operacionId, activo: true }, select: { id: true, importeCentimos: true } })
    const result = await deshacerB4Tx(tx, actorId, { action: 'deshacer', confirmacion: true, idempotencyKey: `MFCU:${command.idempotencyKey}:${easyCollectionsDigest(event.movimientoId).slice(0, 24)}`, version: current.version, operacionId: event.operacionId, lineas: active.map(line => ({ id: line.id, importeCentimos: line.importeCentimos })) })
    const original = safeJsonDetail(event.detalle)
    await tx.eventoJustificacionB4.create({ data: {
      operacionId: result.operacion.id, movimientoId: event.movimientoId, actorId, accion: 'REVERSION',
      detalle: { origen: 'PROPUESTA_COBRO', confirmacionHumana: true, bulkKind: 'COBROS_REVERSION', bulkKeyHash, bulkRequestHash: requestHash, bloqueId: command.bloqueId, propuestaId: original.propuestaId, generacionId: original.generacionId, metodo: original.metodo, fingerprint: original.fingerprint, rol: original.rol },
    } })
  }
  return { ok: true as const, bloqueId: command.bloqueId, revertidas: proposalIds.size, idempotente: false as const }
}

/** Variante para pruebas con transacción propiedad del llamador. */
export async function runEasyCollectionsActionTx(tx: Prisma.TransactionClient, actorId: number, raw: unknown) {
  const command = parseEasyCollectionsCommand(raw)
  await assertFinanceEasyRuntime()
  try { return command.action === 'confirmar_bloque' ? await confirmTx(tx, actorId, command) : await undoTx(tx, actorId, command) } catch (error) { throwKnown(error) }
}
export async function runEasyCollectionsAction(actorId: number, raw: unknown) {
  const command = parseEasyCollectionsCommand(raw)
  await assertFinanceEasyRuntime()
  try {
    return await db().$transaction(async (base): Promise<Record<string, unknown>> => command.action === 'confirmar_bloque'
      ? await confirmTx(base, actorId, command)
      : await undoTx(base, actorId, command), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 55_000 })
  } catch (error) { throwKnown(error) }
}
function throwKnown(error: unknown): never {
  if (error instanceof EasyCollectionsServiceError || error instanceof EasyCollectionsValidationError || error instanceof FinanceEasyRuntimeError || error instanceof B4ServiceError) throw error
  const code = String((error as { code?: unknown } | null)?.code ?? '')
  if (['P2002', 'P2034', '40001', '40P01', '55P03'].includes(code)) fail(409, 'SELECCION_CAMBIADA', 'La selección cambió mientras se revisaba; actualiza la lista. No se ha confirmado nada.')
  throw error
}
export function easyCollectionsErrorResponse(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof FinanceEasyRuntimeError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  if (error instanceof EasyCollectionsServiceError || error instanceof EasyCollectionsValidationError || error instanceof B4ServiceError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  return { status: 500, body: { error: 'No se pudo completar el bloque. Actualiza la lista antes de volver a intentarlo.', codigo: 'PROPUESTAS_COBRO_ERROR' } }
}
