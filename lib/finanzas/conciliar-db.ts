import { Prisma, type PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { readBankInvoicingPopulation, type B7ReadDatabase } from '@/lib/finanzas/bank-invoicing-db'
import { archivoRecibidaControlado, bibliotecaFinancieraConfigurada } from '@/lib/finanzas/archivo-fuente-controlada'
import { driveItemDesdeArchivoUrlNominaControlada } from '@/lib/finanzas/nominas-propuestas-db'
import { facturaEconomicaSQL } from '@/lib/finanzas/invoice-economic-filter'
import { readConciliarConfirmingCandidates, resolveConfirmedInterestPdf, resolveStoredConfirmingFile, type ConfirmingQueryClient } from '@/lib/finanzas/conciliar-confirming'
import { centsFromExactSqlText, proveLocalBalanceNeighborhoods, selectBilateralTransfers, type EasyAutoBalanceRow, type EasyAutoMovement } from '@/lib/finanzas/easy-auto-core'
import {
  CONCILIAR_COLORS,
  CONCILIAR_TABS,
  type ConciliarColor,
  type ConciliarDocument,
  type ConciliarGetInput,
  type ConciliarProjectionPayload,
  type ConciliarProjectionSource,
  type ConciliarRow,
  type ConciliarTab,
  type ConciliarTabSummary,
  evaluarDocumentoExacto,
  isConciliarBankFee,
  normalizarReferenciaFactura,
  redReasonForMovement,
  referenciasFacturaCitadas,
  textoSeguro,
} from './conciliar-contract'
import { classifyReceivedInvoicePaymentCandidates, conciliarAliasesContainDocumentaryAlias, conciliarAliasesMatch, conciliarColorRank, conciliarDecisionHash, conciliarExactCounterparty, conciliarHash, conciliarProjectionRowId, isoDay, safeInteger } from './conciliar-core'
import { ConciliarDbError, conciliarDbErrorResponse } from './conciliar-errors'
import { cents, day, document, exactMoney, json, nullableText, object, projectionRow, type ProjectionSqlRow } from './conciliar-projection-read'

export { ConciliarDbError, conciliarDbErrorResponse } from './conciliar-errors'
export { readConciliarHistory, readConciliarProjection, readConciliarRow, readConciliarRowForAction } from './conciliar-projection-read'
// The thin reader retains the exact aggregate: COALESCE(SUM(p.pendiente_centimos::bigint),0)::text AS amount

/** No Prisma schema edit is needed for Conciliar's additive migration. */
type Tx = Prisma.TransactionClient & Record<string, any>
type Db = PrismaClient & Record<string, any>
const db = () => prisma as Db
const asTx = (tx: Prisma.TransactionClient) => tx as Tx
const MAX_REBUILD_ROWS = 25_000
const fail = (status: number, code: string, message: string): never => { throw new ConciliarDbError(status, code, message) }

export type ConciliarReceiptLeg = Readonly<{
  ordinal: number
  rowId: string
  movimientoId: string | null
  operationB4Id?: string
  actionB5?: 'PEDIDO'
  proposalBlockId?: string
  result: Record<string, unknown>
}>

export async function createConciliarOperation(actorId: number, action: 'CONFIRMAR' | 'PEDIR' | 'DESHACER', idempotencyKey: string, requestHash: string, parentId?: string) {
  return db().$transaction(async tx => {
    const work = asTx(tx)
    await work.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`conciliar:${actorId}:${idempotencyKey}`},0))::text AS locked`)
    const existing = await work.$queryRaw<Array<{ id: string; requestHash: string; result: unknown; state: string }>>(Prisma.sql`
      SELECT id::text,request_hash AS "requestHash",resultado AS result,estado::text AS state
      FROM operaciones_conciliar WHERE actor_id=${actorId} AND idempotency_key=CAST(${idempotencyKey} AS uuid) LIMIT 1 FOR UPDATE
    `)
    if (existing[0]) {
      if (existing[0].requestHash !== requestHash) fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave de idempotencia pertenece a otra acción.')
      return { replay: true as const, id: existing[0].id, result: json(existing[0].result), state: existing[0].state }
    }
    const inserted = await work.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO operaciones_conciliar(actor_id,accion,estado,idempotency_key,request_hash,operacion_padre_id,resultado,created_at)
      VALUES(${actorId},CAST(${action} AS "AccionOperacionConciliar"),'APLICADA'::"EstadoOperacionConciliar",CAST(${idempotencyKey} AS uuid),${requestHash},${parentId ? Prisma.sql`CAST(${parentId} AS uuid)` : Prisma.sql`NULL`},'{}'::jsonb,CURRENT_TIMESTAMP)
      RETURNING id::text
    `)
    if (!inserted[0]?.id) fail(409, 'RECIBO_NO_CREADO', 'No se pudo crear el recibo de la acción.')
    return { replay: false as const, id: inserted[0].id, result: {}, state: 'APLICADA' }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 })
}

export async function appendConciliarLeg(operationId: string, leg: ConciliarReceiptLeg) {
  await db().$transaction(async tx => {
    const work = asTx(tx)
    await work.$executeRaw(Prisma.sql`
      INSERT INTO patas_operacion_conciliar(operacion_conciliar_id,ordinal,fila_id,movimiento_id,operacion_b4_id,accion_b5,bloque_propuesta_cobro_id,resultado,created_at)
      VALUES(CAST(${operationId} AS uuid),${leg.ordinal},${leg.rowId},${leg.movimientoId},
        ${leg.operationB4Id ? Prisma.sql`CAST(${leg.operationB4Id} AS uuid)` : Prisma.sql`NULL`},
        ${leg.actionB5 ? leg.actionB5 : Prisma.sql`NULL`},
        ${leg.proposalBlockId ? Prisma.sql`CAST(${leg.proposalBlockId} AS uuid)` : Prisma.sql`NULL`},
        CAST(${JSON.stringify(leg.result)} AS jsonb),CURRENT_TIMESTAMP)
      ON CONFLICT (operacion_conciliar_id,fila_id) DO NOTHING
    `)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 })
}

export async function finalizeConciliarOperation(operationId: string, state: 'APLICADA' | 'PARCIAL' | 'REVERTIDA', result: Record<string, unknown>, reverted = false) {
  await db().$executeRaw(Prisma.sql`
    UPDATE operaciones_conciliar
    SET estado=CAST(${state} AS "EstadoOperacionConciliar"),resultado=CAST(${JSON.stringify(result)} AS jsonb),revertida_at=${reverted ? Prisma.sql`CURRENT_TIMESTAMP` : Prisma.sql`NULL`}
    WHERE id=CAST(${operationId} AS uuid)
  `)
}

export async function legsForConciliarOperation(operationId: string) {
  return db().$queryRaw<Array<{ ordinal: number; rowId: string; movimientoId: string | null; operationB4Id: string | null; actionB5: string | null; proposalBlockId: string | null; result: unknown }>>(Prisma.sql`
    SELECT ordinal,fila_id AS "rowId",movimiento_id AS "movimientoId",operacion_b4_id::text AS "operationB4Id",accion_b5 AS "actionB5",bloque_propuesta_cobro_id::text AS "proposalBlockId",resultado AS result
    FROM patas_operacion_conciliar WHERE operacion_conciliar_id=CAST(${operationId} AS uuid) ORDER BY ordinal ASC
  `)
}

export async function readConciliarOperationForUndo(operationId: string, actorId: number) {
  const rows = await db().$queryRaw<Array<{ id: string; actorId: number; action: string; state: string }>>(Prisma.sql`
    SELECT id::text,actor_id AS "actorId",accion::text AS action,estado::text AS state
    FROM operaciones_conciliar WHERE id=CAST(${operationId} AS uuid) LIMIT 1
  `)
  const row = rows[0]
  if (!row) fail(404, 'RECIBO_NO_ENCONTRADO', 'No se encontró la acción para deshacer.')
  if (row.actorId !== actorId) fail(403, 'RECIBO_ACTOR_DISTINTO', 'Sólo quien realizó la acción puede deshacerla.')
  if (row.action !== 'CONFIRMAR' || row.state === 'REVERTIDA') fail(409, 'RECIBO_NO_REVERSIBLE', 'Esta acción ya no se puede deshacer.')
  return row
}

export async function markConciliarReverted(originalId: string) {
  await db().$executeRaw(Prisma.sql`UPDATE operaciones_conciliar SET estado='REVERTIDA'::"EstadoOperacionConciliar",revertida_at=CURRENT_TIMESTAMP WHERE id=CAST(${originalId} AS uuid) AND estado<>'REVERTIDA'::"EstadoOperacionConciliar"`)
}

/** Direct resolver used only by the limited Conciliar archivo proxy. It rechecks
 * the current row source and never accepts a drive/url/item from the browser. */
export async function resolveConciliarProjectionFile(rowId: string): Promise<Readonly<{ nombre: string; mimeType: 'application/pdf'; locator: { driveId: string; itemId: string } | { configured: true; itemId: string } }>> {
  const rows = await db().$queryRaw<ProjectionSqlRow[]>(Prisma.sql`SELECT * FROM conciliar_proyecciones WHERE id=${rowId} LIMIT 1`)
  if (!rows.length) {
    const durable = await resolveConfirmedInterestPdf(db() as unknown as ConfirmingQueryClient, rowId)
    if (durable) return { nombre: durable.nombre, mimeType: 'application/pdf', locator: durable.locator }
    fail(404, 'ARCHIVO_FUERA_DE_AMBITO', 'El archivo no pertenece a una fila o un soporte confirming vigente.')
  }
  const row = projectionRow(rows[0])
  if (row.documento?.href !== `/api/admin/finanzas/conciliar/archivo/${encodeURIComponent(row.id)}`) fail(404, 'ARCHIVO_FUERA_DE_AMBITO', 'La fila no tiene un archivo documental disponible.')
  if (row.source.kind === 'COBRO_CONFIRMING' && row.source.confirmingId) {
    const file = await resolveStoredConfirmingFile(db() as unknown as ConfirmingQueryClient, row.source.confirmingId)
    if (!file) fail(404, 'ARCHIVO_NO_DISPONIBLE', 'El confirming ya no conserva su PDF controlado.')
    return { ...file, mimeType: 'application/pdf' }
  }
  if (row.source.kind === 'PAGO_FACTURA_RECIBIDA' && row.source.facturaRecibidaId) {
    const source = await (db() as any).facturaRecibida.findUnique({ where: { id: row.source.facturaRecibidaId }, select: { oneDriveDriveId: true, oneDriveItemId: true, archivoOneDrive: true } })
    const location = archivoRecibidaControlado(source)
    if (!location) fail(404, 'ARCHIVO_NO_DISPONIBLE', 'La factura ya no tiene un archivo controlado disponible.')
    return { nombre: textoSeguro(source.archivoOneDrive?.split(/[\\/]/).pop(), 'factura.pdf'), mimeType: 'application/pdf', locator: { driveId: location.driveId, itemId: location.itemId } }
  }
  if (row.source.kind === 'PAGO_NOMINA' && row.source.nominaId) {
    const source = await (db() as any).nomina.findUnique({ where: { id: row.source.nominaId }, select: { archivoUrl: true, archivoNombre: true, documentos: { select: { driveItemId: true, nombre: true, tipo: true }, take: 10 } } })
    const configured = bibliotecaFinancieraConfigurada()
    const item = source?.documentos?.find((item: any) => item?.tipo === 'NOMINA' && typeof item.driveItemId === 'string') ?? null
    const fallback = driveItemDesdeArchivoUrlNominaControlada(source?.archivoUrl)
    const itemId = item?.driveItemId ?? fallback
    if (!configured || typeof itemId !== 'string') fail(404, 'ARCHIVO_NO_DISPONIBLE', 'La nómina ya no tiene un archivo controlado disponible.')
    return { nombre: textoSeguro(item?.nombre ?? source?.archivoNombre, 'nomina.pdf'), mimeType: 'application/pdf', locator: { configured: true, itemId } }
  }
  fail(404, 'ARCHIVO_FUERA_DE_AMBITO', 'El archivo no pertenece a una fuente documental admitida.')
}

// ---------------------- Rebuild and refresh projection ---------------------

type RebuildRow = Omit<ConciliarProjectionPayload, 'row'> & {
  tab: ConciliarTab
  row: Omit<ConciliarRow, 'decisionHash'>
  cuentaId: string | null
}
function baseRow(input: Omit<ConciliarRow, 'decisionHash'>): Omit<ConciliarRow, 'decisionHash'> { return input }
function projection(tab: ConciliarTab, input: Omit<ConciliarRow, 'decisionHash'>, source: ConciliarProjectionSource, cuentaId: string | null): RebuildRow {
  return {
    tab, row: input, source,
    sourceFingerprint: conciliarHash({ schema: 'CONCILIAR_SOURCE_V2', tab, source, row: { id: input.id, movimientoId: input.movimientoId, fecha: input.fecha, importeCentimos: input.importeCentimos, pendienteCentimos: input.pendienteCentimos, documento: input.documento, propuesta: input.propuesta, linksMovimiento: input.linksMovimiento } }),
    cuentaId,
  }
}
function candidateFileHref(id: string, available: boolean): string | null { return available ? `/api/admin/finanzas/conciliar/archivo/${encodeURIComponent(id)}` : null }
function rowId(tab: ConciliarTab, sourceIdentity: string): string { return conciliarProjectionRowId(tab, sourceIdentity) }

/** A received source keeps its signed economic amount. A supplier credit therefore
 * becomes a positive B4 target and is never erased or silently netted with debt. */
export function receivedInvoicePendingSettlement(input: Readonly<{ totalCentimos: number; assignedCentimos: number }>): Readonly<{ targetCentimos: number; pendingCentimos: number }> | null {
  if (!Number.isSafeInteger(input.totalCentimos) || !Number.isSafeInteger(input.assignedCentimos) || input.totalCentimos === 0) return null
  const targetCentimos = -input.totalCentimos
  const pendingCentimos = targetCentimos - input.assignedCentimos
  if (!Number.isSafeInteger(targetCentimos) || !Number.isSafeInteger(pendingCentimos) || pendingCentimos === 0 || Math.sign(pendingCentimos) !== Math.sign(targetCentimos)) return null
  return { targetCentimos, pendingCentimos }
}

export type ReceivedInvoicePendingPaymentCandidate = Readonly<{ rowId: string; color: ConciliarColor }>
export function receivedInvoicePendingCandidate(candidates: readonly ReceivedInvoicePendingPaymentCandidate[]): Readonly<{
  color: ConciliarColor
  motivo: string
  candidate: ReceivedInvoicePendingPaymentCandidate | null
}> {
  if (candidates.length === 0) return { color: 'ROJO', motivo: 'Aún no consta un pago confirmado.', candidate: null }
  if (candidates.length > 1) return { color: 'AMBAR', motivo: 'Hay varios pagos propuestos para esta factura; revísalos antes de confirmar.', candidate: null }
  const candidate = candidates[0]
  return candidate.color === 'VERDE'
    ? { color: 'VERDE', motivo: 'Hay un pago que coincide; ábrelo para confirmarlo.', candidate }
    : { color: 'AMBAR', motivo: 'Hay un pago propuesto que necesita revisión.', candidate }
}

export async function unresolvedMovements(tx: Tx, movementId?: string) {
  return tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT m.id,m.fecha_operacion::date::text AS fecha,m.concepto,m.referencia,m.info_adicional,m.tercero,
      b4_importe_bancario_centimos(m.importe) AS "importeCentimos",c.id AS "cuentaId",c.banco,c.alias AS cuenta,
      ef.razon_social AS "entidadRazonSocial",ef.nombre_comercial AS "entidadNombreComercial",p1.label AS "terceroConfirmado",
      COALESCE(e.version,1) AS "versionB4"
    FROM movimientos_bancarios m JOIN cuentas_bancarias c ON c.id=m.cuenta_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    LEFT JOIN entidades_fiscales ef ON ef.id=m.entidad_fiscal_id
    LEFT JOIN LATERAL (
      SELECT NULLIF(btrim(d.snapshot->>'label'),'') AS label
      FROM decisiones_tercero_modo_facil d
      WHERE d.movimiento_id=m.id AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
        AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil")
      ORDER BY d.created_at DESC,d.id DESC LIMIT 1
    ) p1 ON TRUE
    WHERE COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO' AND b4_importe_bancario_centimos(m.importe) IS NOT NULL
      ${movementId ? Prisma.sql`AND m.id=${movementId}` : Prisma.empty}
    ORDER BY m.fecha_operacion DESC,m.id ASC LIMIT ${movementId ? 1 : MAX_REBUILD_ROWS}
      ${movementId ? Prisma.sql`FOR UPDATE OF m` : Prisma.empty}
  `)
}
async function liveCollectionProposals(tx: Tx) {
  return tx.$queryRaw<Array<any>>(Prisma.sql`
    WITH current_generation AS (SELECT id FROM modo_facil_generaciones_cobro ORDER BY creada_at DESC,id DESC LIMIT 1)
    SELECT p.id::text AS "propuestaId",p.movimiento_id AS "movimientoId",p.movimiento_par_id AS "movimientoParId",p.fingerprint,p.metodo,p.nivel,p.estado_propuesto AS "estadoPropuesto",p.composicion,p.explicacion,
      p.lineas,p.importe_movimiento_centimos AS "importeCentimos",p.motivo_no_requiere AS "motivoNoRequiere"
    FROM modo_facil_propuestas_cobro p JOIN current_generation g ON g.id=p.generacion_id
    WHERE p.estado_propuesto IN ('JUSTIFICADO','NO_REQUIERE') ORDER BY p.movimiento_id ASC,p.id ASC LIMIT ${MAX_REBUILD_ROWS}
  `)
}
async function receivedInvoices(tx: Tx) {
  return tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT fr.id::text AS id,fr.num_factura AS referencia,fr.proveedor,fr.fecha::date::text AS fecha,fr.fecha_vencimiento::date::text AS vencimiento,fr.total::text AS total_text,
      fr.onedrive_drive_id AS "driveId",fr.onedrive_item_id AS "itemId",fr.archivo_onedrive AS archivo,
      d.id::text AS "documentoId",d.importe_objetivo_centimos AS "objetivoCentimos",d.activo AS "documentoActivo",COALESCE(a.asignado,0)::bigint AS asignado
    FROM facturas_recibidas fr
    LEFT JOIN LATERAL (
      SELECT id,importe_objetivo_centimos,activo FROM documentos_conciliables
      WHERE factura_recibida_id=fr.id AND tipo='FACTURA_RECIBIDA'::"TipoDocumentoConciliable"
      ORDER BY activo DESC,created_at ASC,id ASC LIMIT 1
    ) d ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(v.importe_centimos)::bigint AS asignado FROM vinculos_movimiento_documento v
      JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
      JOIN estado_justificacion_movimientos e ON e.movimiento_id=v.movimiento_id AND e.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento"
      WHERE v.activo AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo" AND v.documento_conciliable_id=d.id
    ) a ON TRUE
    WHERE ${facturaEconomicaSQL('fr')}
      AND fr.conflicto_identidad=false AND fr.duplicado_externo=false
    ORDER BY fr.fecha DESC,fr.id ASC LIMIT ${MAX_REBUILD_ROWS}
  `)
}
async function payrollSources(tx: Tx) {
  return tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT n.id,n.mes,n.anio,n.neto_percibir::text AS total_text,n.archivo_url AS archivo_url,n.archivo_nombre AS archivo_nombre,
      e.nombre_completo AS "empleadoNombre",
      d.id::text AS "documentoId",d.importe_objetivo_centimos AS "objetivoCentimos",d.activo AS "documentoActivo",
      nd.drive_item_id AS "driveItemId",nd.nombre AS "documentoNombre"
    FROM nominas n JOIN empleados e ON e.id=n.empleado_id
    LEFT JOIN LATERAL (
      SELECT id,importe_objetivo_centimos,activo FROM documentos_conciliables
      WHERE nomina_id=n.id AND tipo='NOMINA'::"TipoDocumentoConciliable"
      ORDER BY activo DESC,created_at ASC,id ASC LIMIT 1
    ) d ON TRUE
    LEFT JOIN LATERAL (SELECT drive_item_id,nombre FROM nomina_documentos WHERE nomina_id=n.id AND tipo='NOMINA' ORDER BY created_at DESC,id DESC LIMIT 1) nd ON TRUE
    ORDER BY n.anio DESC,n.mes DESC,n.id ASC LIMIT ${MAX_REBUILD_ROWS}
  `)
}

function proposalComposition(raw: unknown): Array<{ facturaEmitidaId: string | null; numFactura: string | null; cliente: string | null; importeCentimos: number | null; vencimiento: string | null }> {
  const items = Array.isArray(raw) ? raw : Array.isArray(json(raw).items) ? json(raw).items as unknown[] : []
  return items.flatMap(item => {
    const value = object(item)
    const invoice = nullableText(value.facturaEmitidaId, 160)
    const amount = safeInteger(value.importeCentimos)
    return [{ facturaEmitidaId: invoice, numFactura: nullableText(value.numFactura, 240), cliente: nullableText(value.cliente, 300), importeCentimos: amount, vencimiento: typeof value.vencimiento === 'string' ? value.vencimiento.slice(0, 10) : null }]
  })
}

type ProposalLine = Readonly<{ tipo: 'DOCUMENTO' | 'DIFERENCIA'; tipoDocumento?: 'FACTURA_EMITIDA' | 'REMESA'; sourceId?: string; importeCentimos: number; motivoDiferencia?: string }>
function proposalLines(raw: unknown): ProposalLine[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 40) return null
  const result: ProposalLine[] = []
  for (const value of raw) {
    const line = object(value), amount = safeInteger(line.importeCentimos)
    if (amount === null || amount === 0) return null
    if (line.tipo === 'DOCUMENTO' && (line.tipoDocumento === 'FACTURA_EMITIDA' || line.tipoDocumento === 'REMESA') && typeof line.sourceId === 'string' && line.sourceId.length > 0 && line.sourceId.length <= 160) {
      result.push({ tipo: 'DOCUMENTO', tipoDocumento: line.tipoDocumento, sourceId: line.sourceId, importeCentimos: amount })
    } else if (line.tipo === 'DIFERENCIA' && typeof line.motivoDiferencia === 'string' && line.motivoDiferencia.length <= 80) {
      result.push({ tipo: 'DIFERENCIA', motivoDiferencia: line.motivoDiferencia, importeCentimos: amount })
    } else return null
  }
  const total = result.reduce((sum, line) => sum + line.importeCentimos, 0)
  return Number.isSafeInteger(total) ? result : null
}
function proposalLineTotal(lines: readonly ProposalLine[]): number | null {
  const total = lines.reduce((sum, line) => sum + line.importeCentimos, 0)
  return Number.isSafeInteger(total) ? total : null
}
function isRemittanceMethod(value: unknown): boolean {
  return value === 'REMESA_VENCIMIENTO' || value === 'REMESA_UNION' || value === 'REMESA_RESIDUO'
}
function compactCompositionDetail(composition: readonly ReturnType<typeof proposalComposition>[number][]): string | null {
  if (!composition.length) return null
  const listed = composition.slice(0, 12).map(item => `${item.numFactura ?? 'Factura'}${item.cliente ? ` · ${item.cliente}` : ''}`).join(' · ')
  const suffix = composition.length > 12 ? ` · y ${composition.length - 12} más` : ''
  return textoSeguro(`${composition.length} recibos: ${listed}${suffix}`).slice(0, 1_600)
}
export function movementPartyAliases(movement: any): string[] {
  return [movement.tercero, movement.terceroConfirmado, movement.entidadRazonSocial, movement.entidadNombreComercial]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}
export function payrollPeriodMatches(fechaBanco: string, payroll: any): boolean {
  const year = Number(fechaBanco.slice(0, 4)), month = Number(fechaBanco.slice(5, 7))
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isSafeInteger(payroll.anio) || !Number.isSafeInteger(payroll.mes)) return false
  return (payroll.anio === year && payroll.mes === month) || (month === 1 ? payroll.anio === year - 1 && payroll.mes === 12 : payroll.anio === year && payroll.mes === month - 1)
}
function collectionProposalStatus(input: Readonly<{
  proposal: any | undefined
  amount: number
  fechaBanco: string
  conceptoBanco: string
  movementAliases: readonly string[]
  invoiceDates: ReadonlyMap<string, string | null>
}>): Readonly<{ green: boolean; reason: string; composition: ReturnType<typeof proposalComposition>; lines: readonly ProposalLine[]; remesaIds: number[] }> {
  const proposal = input.proposal
  const composition = proposal ? proposalComposition(proposal.composicion) : []
  const lines = proposal ? proposalLines(proposal.lineas) : null
  if (!proposal || !lines || proposalLineTotal(lines) !== input.amount || Number(proposal.importeCentimos) !== input.amount || proposal.estadoPropuesto !== 'JUSTIFICADO' || proposal.nivel !== 'EXACTA') {
    return { green: false, reason: proposal ? 'La propuesta de cobro cambió o necesita revisión.' : 'Falta el documento que explica este cobro.', composition, lines: lines ?? [], remesaIds: [] }
  }
  const documents = lines.filter((line): line is ProposalLine & { tipo: 'DOCUMENTO'; sourceId: string; tipoDocumento: 'FACTURA_EMITIDA' | 'REMESA' } => line.tipo === 'DOCUMENTO' && !!line.sourceId && !!line.tipoDocumento)
  if (!documents.length || !composition.length || composition.some(item => item.importeCentimos === null || item.importeCentimos! <= 0)) {
    return { green: false, reason: 'La propuesta no conserva la composición completa de los recibos.', composition, lines, remesaIds: [] }
  }
  const compositionTotal = composition.reduce((sum, item) => sum + (item.importeCentimos ?? 0), 0)
  if (!Number.isSafeInteger(compositionTotal) || compositionTotal !== input.amount) {
    return { green: false, reason: 'La suma de los recibos no coincide exactamente con el ingreso.', composition, lines, remesaIds: [] }
  }
  const cited = referenciasFacturaCitadas(input.conceptoBanco)
  const references = new Set(composition.map(item => normalizarReferenciaFactura(item.numFactura)).filter((value): value is string => value !== null))
  if (cited.length && !cited.every(reference => references.has(reference))) {
    return { green: false, reason: 'El número de factura citado por el banco no coincide con los recibos de la propuesta.', composition, lines, remesaIds: [] }
  }
  const invoiceDates = composition.map(item => item.facturaEmitidaId ? input.invoiceDates.get(item.facturaEmitidaId) ?? null : null)
  if (invoiceDates.some(date => date === null || date > input.fechaBanco)) {
    return { green: false, reason: 'Falta una fecha de factura verificable anterior al cobro.', composition, lines, remesaIds: [] }
  }
  if (!isRemittanceMethod(proposal.metodo) && input.movementAliases.length > 0 && !conciliarAliasesMatch(input.movementAliases, composition.map(item => item.cliente))) {
    return { green: false, reason: 'El cliente identificado no coincide exactamente con la factura propuesta.', composition, lines, remesaIds: [] }
  }
  const remesaIds = documents.filter(line => line.tipoDocumento === 'REMESA' && /^\d+$/.test(line.sourceId)).map(line => Number(line.sourceId)).filter(Number.isSafeInteger).sort((left, right) => left - right)
  return { green: true, reason: isRemittanceMethod(proposal.metodo) ? 'La remesa y todos sus recibos cierran exactamente con el ingreso.' : 'Importe, cliente y facturas de la propuesta coinciden.', composition, lines, remesaIds }
}

const PROJECTION_INSERT_BATCH = 500
async function assertProjectionSnapshot(tx: Tx): Promise<void> {
  // The advisory lock serializes rebuilds from imports, confirmations and explicit
  // refreshes. The surrounding caller owns the transaction; it must already give
  // us a repeatable snapshot before any source population is read.
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'conciliar:projection:rebuild:v1'},0))::text AS locked`)
  const rows = await tx.$queryRaw<Array<{ isolation: string }>>(Prisma.sql`SELECT lower(current_setting('transaction_isolation')) AS isolation`)
  if (!['repeatable read', 'serializable'].includes(rows[0]?.isolation ?? '')) {
    fail(409, 'PROYECCION_SNAPSHOT_REQUERIDO', 'La actualización de Conciliar requiere una lectura repetible.')
  }
}

function projectionInsertValue(item: RebuildRow) {
  return {
    id: item.row.id, tab: item.tab, movimientoId: item.row.movimientoId, cuentaId: item.cuentaId, fecha: item.row.fecha,
    importeCentimos: item.row.importeCentimos, pendienteCentimos: item.row.pendienteCentimos, color: item.row.color,
    grupo: item.row.grupo, motivo: item.row.motivo, concepto: item.row.concepto, banco: item.row.banco, cuenta: item.row.cuenta,
    documento: item.row.documento, propuesta: item.row.propuesta, seleccionable: item.row.seleccionable,
    diferenciaCentimos: item.row.diferenciaCentimos, linksMovimiento: item.row.linksMovimiento ?? null, detail: item.row.detail,
    source: item.source, sourceFingerprint: item.sourceFingerprint,
  }
}

async function insertProjectionBatches(tx: Tx, rows: readonly RebuildRow[]): Promise<void> {
  for (let start = 0; start < rows.length; start += PROJECTION_INSERT_BATCH) {
    const batch = rows.slice(start, start + PROJECTION_INSERT_BATCH).map(projectionInsertValue)
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO conciliar_proyecciones(
        id,tab,movimiento_id,cuenta_id,fecha,importe_centimos,pendiente_centimos,color,grupo,motivo,concepto,banco,cuenta,
        documento,propuesta,seleccionable,diferencia_centimos,links_movimiento,detail,source,source_fingerprint,updated_at
      )
      SELECT x.id,x.tab,x."movimientoId",x."cuentaId",CAST(x.fecha AS date),x."importeCentimos",x."pendienteCentimos",x.color,
        x.grupo,x.motivo,x.concepto,x.banco,x.cuenta,x.documento,x.propuesta,x.seleccionable,x."diferenciaCentimos",
        x."linksMovimiento",x.detail,x.source,x."sourceFingerprint",CURRENT_TIMESTAMP
      FROM jsonb_to_recordset(CAST(${JSON.stringify(batch)} AS jsonb)) AS x(
        id text,tab text,"movimientoId" text,"cuentaId" text,fecha text,"importeCentimos" integer,"pendienteCentimos" integer,
        color text,grupo text,motivo text,concepto text,banco text,cuenta text,documento jsonb,propuesta text,seleccionable boolean,
        "diferenciaCentimos" integer,"linksMovimiento" jsonb,detail text,source jsonb,"sourceFingerprint" text
      )
    `)
  }
}

type StrictTransferLeg = Readonly<{ movementId: string; oppositeMovementId: string; fingerprint: string }>
/**
 * Conciliar deliberately reuses the same fail-closed ingredients as the approved
 * Modo fácil automation: bilateral candidates, account attestation, exact local
 * balance chain and extract coverage. A pair that lacks any one proof is simply
 * not returned; it must remain human review, never an amount-only transfer.
 */
export async function readStrictOwnTransfers(tx: Tx): Promise<ReadonlyMap<string, StrictTransferLeg>> {
  const seeds = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT m.id,m.cuenta_id AS "cuentaId",m.fecha_operacion::date::text AS fecha,m.importe::text AS "importeText",
      m.concepto,m.referencia,m.info_adicional AS "infoAdicional",m.tercero,c.banco AS "bancoCuenta",COALESCE(e.version,1) AS "versionB4"
    FROM movimientos_bancarios m
    JOIN cuentas_bancarias c ON c.id=m.cuenta_id AND c.activa=true
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO'
      AND m.factura_id IS NULL AND m.gasto_id IS NULL AND m.factura_emitida_id IS NULL AND m.nomina_id IS NULL
      AND m.entrega_a_cuenta_empleado_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM patas_recibo_auto_modo_facil p WHERE p.movimiento_id=m.id)
      AND NOT EXISTS (
        SELECT 1 FROM decisiones_tercero_modo_facil d
        WHERE d.movimiento_id=m.id AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
          AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id)
      )
    ORDER BY m.fecha_operacion::date ASC,m.id ASC LIMIT ${MAX_REBUILD_ROWS + 1}
  `)
  if (seeds.length > MAX_REBUILD_ROWS) return new Map()
  const movements: EasyAutoMovement[] = []
  for (const row of seeds) {
    try {
      const amount = centsFromExactSqlText(row.importeText, `traspaso ${String(row.id)}.importe`)
      const version = safeInteger(row.versionB4)
      if (version === null || version < 1) continue
      movements.push({
        id: String(row.id), cuentaId: String(row.cuentaId), fecha: day(row.fecha, 'El movimiento'), importeCentimos: amount, versionB4: version,
        concepto: nullableText(row.concepto), referencia: nullableText(row.referencia), infoAdicional: nullableText(row.infoAdicional), tercero: nullableText(row.tercero), bancoCuenta: nullableText(row.bancoCuenta),
      })
    } catch { /* malformed source never becomes a transfer proof */ }
  }
  const pairs = selectBilateralTransfers(movements)
  if (!pairs.length) return new Map()
  const accountIds = [...new Set(pairs.flatMap(pair => pair.movimientos.map(item => item.cuentaId)))].sort()
  const movementIds = pairs.flatMap(pair => pair.movimientos.map(item => item.id))
  const attestations = await tx.$queryRaw<Array<{ cuentaId: string }>>(Prisma.sql`
    SELECT DISTINCT a.cuenta_id AS "cuentaId"
    FROM atestaciones_cuenta_auto_modo_facil a
    JOIN politicas_auto_modo_facil p ON p.id=a.politica_id AND p.estado='ACTIVA'
      AND p.entorno=CASE WHEN current_database()='io_staging_finanzas' THEN 'STAGING' ELSE 'PRODUCTION' END
    WHERE a.cuenta_id IN (${Prisma.join(accountIds.map(id => Prisma.sql`${id}`))})
    ORDER BY a.cuenta_id ASC LIMIT ${accountIds.length}
  `)
  const owned = new Set(attestations.map(row => row.cuentaId))
  if (pairs.some(pair => pair.movimientos.some(item => !owned.has(item.cuentaId)))) return new Map()
  const balances = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT m.id,m.cuenta_id AS "cuentaId",m.fecha_operacion::date::text AS fecha,m.importe::text AS "importeText",m.saldo::text AS "saldoText",
      c.fecha_corte_extracto::date::text AS "cutoff"
    FROM movimientos_bancarios m JOIN cuentas_bancarias c ON c.id=m.cuenta_id AND c.activa=true
    WHERE m.cuenta_id IN (${Prisma.join(accountIds.map(id => Prisma.sql`${id}`))})
    ORDER BY m.cuenta_id ASC,m.fecha_operacion::date ASC,m.id ASC LIMIT ${MAX_REBUILD_ROWS + 1}
  `)
  if (balances.length > MAX_REBUILD_ROWS) return new Map()
  const sourceById = new Map<string, any>()
  const balanceRows: EasyAutoBalanceRow[] = balances.map(row => {
    let importeCentimos: number | null = null, saldoCentimos: number | null = null
    try { importeCentimos = centsFromExactSqlText(row.importeText, `saldo ${String(row.id)}.importe`, true) } catch { /* invalid proof is retained */ }
    try { saldoCentimos = row.saldoText === null ? null : centsFromExactSqlText(row.saldoText, `saldo ${String(row.id)}.saldo`, true) } catch { /* invalid proof is retained */ }
    sourceById.set(String(row.id), row)
    return { id: String(row.id), cuentaId: String(row.cuentaId), fecha: day(row.fecha, 'El movimiento'), importeCentimos, saldoCentimos }
  })
  const evidence = proveLocalBalanceNeighborhoods(balanceRows, movementIds)
  const result = new Map<string, StrictTransferLeg>()
  for (const pair of pairs) {
    const [left, right] = pair.movimientos
    const valid = [left, right].every(leg => {
      const proof = evidence.get(leg.id), source = sourceById.get(leg.id), cutoff = typeof source?.cutoff === 'string' ? source.cutoff.slice(0, 10) : null
      return proof?.ok === true && (!cutoff || cutoff >= leg.fecha)
    })
    if (!valid) continue
    result.set(left.id, { movementId: left.id, oppositeMovementId: right.id, fingerprint: pair.fingerprint })
    result.set(right.id, { movementId: right.id, oppositeMovementId: left.id, fingerprint: pair.fingerprint })
  }
  return result
}

export async function rebuildConciliarProjectionTx(base: Prisma.TransactionClient, rebuiltById: number | null) {
  const tx = asTx(base)
  await assertProjectionSnapshot(tx)
  const [movements, proposals, invoices, payroll, bank, confirming, transfers] = await Promise.all([
    unresolvedMovements(tx), liveCollectionProposals(tx), receivedInvoices(tx), payrollSources(tx),
    readBankInvoicingPopulation(tx as unknown as B7ReadDatabase, { enabled: true, assertIsolatedStaging: async () => undefined }),
    readConciliarConfirmingCandidates(tx, { allRebuild: true }),
    readStrictOwnTransfers(tx),
  ])
  const rows: RebuildRow[] = []
  const proposalByMovement = new Map<string, any>()
  for (const proposal of proposals) if (!proposalByMovement.has(String(proposal.movimientoId))) proposalByMovement.set(String(proposal.movimientoId), proposal)
  const invoiceDates = new Map(bank.invoices.map(item => [item.invoiceId, item.fechaISO]))
  const receivedByCounterparty = new Map<string, any[]>()
  for (const invoice of invoices) {
    const total = exactMoney(invoice.total_text), counterparty = conciliarExactCounterparty(invoice.proveedor)
    if (total === null || total === 0 || counterparty === null) continue
    receivedByCounterparty.set(counterparty, [...(receivedByCounterparty.get(counterparty) ?? []), invoice])
  }
  const confirmingByMovement = new Map(confirming.candidates.map(item => [item.movimientoId, item]))
  const invoiceCandidate = new Map<string, { movementId: string; color: ConciliarColor; rowId: string; propuestaId: string | null }>()
  const receivedInvoicePaymentCandidates = new Map<string, ReceivedInvoicePendingPaymentCandidate[]>()

  for (const movement of movements) {
    const id = String(movement.id), amount = cents(movement.importeCentimos, 'El movimiento')
    const fecha = day(movement.fecha, 'El movimiento'), concepto = textoSeguro(movement.concepto)
    const cuentaId = String(movement.cuentaId), banco = nullableText(movement.banco, 300), cuenta = nullableText(movement.cuenta, 300)
    const transfer = transfers.get(id)
    if (transfer) {
      const tab: ConciliarTab = amount > 0 ? 'COBROS' : 'PAGOS'
      const opaqueId = rowId(tab, `TRANSFERENCIA_PROPIA:${id}:${transfer.oppositeMovementId}:${transfer.fingerprint}`)
      const pairTab = amount > 0 ? 'PAGOS' : 'COBROS'
      rows.push(projection(tab, baseRow({
        id: opaqueId, movimientoId: id, fecha, concepto, banco, cuenta, importeCentimos: amount, pendienteCentimos: amount,
        color: 'VERDE', grupo: 'TRASPASOS_PROPIOS', motivo: 'Traspaso entre dos cuentas propias comprobado.', documento: null,
        propuesta: null, seleccionable: true, diferenciaCentimos: 0,
        linksMovimiento: [{ id: transfer.oppositeMovementId, href: `/admin/finanzas/conciliar?tab=${pairTab}&q=${encodeURIComponent(transfer.oppositeMovementId)}`, etiqueta: 'Ver el movimiento de la otra cuenta' }], detail: null,
      }), {
        kind: 'TRANSFERENCIA_PROPIA', movimientoId: id, movimientoParId: transfer.oppositeMovementId,
        transferFingerprint: transfer.fingerprint, versionB4: cents(movement.versionB4, 'La versión'),
      } as ConciliarProjectionSource, cuentaId))
      continue
    }
    if (amount > 0) {
      const confirmingCandidate = confirmingByMovement.get(id)
      if (confirmingCandidate) {
        const exact = confirmingCandidate.estado === 'LISTO_PARA_CONFIRMACION_B4'
          && confirmingCandidate.totalLineasB4Centimos === amount
          && confirmingCandidate.sourceHash !== null
        const documents = confirmingCandidate.facturas
        const single = documents.length === 1 ? documents[0] : null
        const opaqueId = rowId('COBROS', `COBRO_CONFIRMING:${id}:${confirmingCandidate.confirmingId}`)
        const confirmingFile = await resolveStoredConfirmingFile(tx as unknown as ConfirmingQueryClient, confirmingCandidate.confirmingId)
        const documentValue = confirmingCandidate.totalFacturasCentimos !== null ? {
          referencia: single ? single.numeroFacturaEmitida ?? single.numeroDocumento : `Confirming · ${documents.length} facturas`,
          tercero: single?.sociedadFactura ?? 'Grupo Draxton',
          importeCentimos: confirmingCandidate.totalFacturasCentimos,
          fecha: confirmingCandidate.fechaDocumento,
          href: candidateFileHref(opaqueId, !!confirmingFile),
        } : null
        rows.push(projection('COBROS', baseRow({
          id: opaqueId, movimientoId: id, fecha, concepto, banco, cuenta, importeCentimos: amount, pendienteCentimos: amount,
          color: exact ? 'VERDE' : 'AMBAR', grupo: 'CONFIRMING_DRAXTON',
          motivo: exact ? 'El documento de confirming, sus facturas y las deducciones indicadas cierran exactamente.' : 'El confirming necesita revisión antes de confirmarlo.',
          documento: documentValue, propuesta: `confirming:${confirmingCandidate.confirmingId}`, seleccionable: exact,
          diferenciaCentimos: exact ? 0 : amount - (confirmingCandidate.totalLineasB4Centimos ?? 0),
          detail: confirmingCandidate.gastosFinancierosHistoricosIgnorados ? 'Sólo se han usado las deducciones que aparecen expresamente en el documento.' : null,
        }), {
          kind: 'COBRO_CONFIRMING', movimientoId: id, confirmingId: confirmingCandidate.confirmingId,
          confirmingSourceHash: confirmingCandidate.sourceHash ?? undefined, versionB4: cents(movement.versionB4, 'La versión'),
        }, cuentaId))
        continue
      }
      const proposalRow = proposalByMovement.get(id)
      const status = collectionProposalStatus({ proposal: proposalRow, amount, fechaBanco: fecha, conceptoBanco: concepto, movementAliases: movementPartyAliases(movement), invoiceDates })
      const one = status.composition.length === 1 ? status.composition[0] : null
      const documentValue = one && one.importeCentimos !== null ? { referencia: one.numFactura ?? 'Factura emitida', tercero: one.cliente, importeCentimos: one.importeCentimos, fecha: one.facturaEmitidaId ? invoiceDates.get(one.facturaEmitidaId) ?? null : null, href: null } : null
      const green = status.green
      const color: ConciliarColor = green ? 'VERDE' : proposalRow ? 'AMBAR' : 'ROJO'
      const motivo = green ? status.reason : proposalRow
        ? status.reason
        : redReasonForMovement({ importeCentimos: amount, concepto, tarjeta: false })
      const source: ConciliarProjectionSource = proposalRow ? { kind: 'COBRO_PROPUESTA', movimientoId: id, propuestaId: String(proposalRow.propuestaId), proposalFingerprint: String(proposalRow.fingerprint), versionB4: cents(movement.versionB4, 'La versión') } : { kind: 'COBRO_PROPUESTA', movimientoId: id, versionB4: cents(movement.versionB4, 'La versión') }
      const opaqueId = rowId('COBROS', `COBRO_PROPUESTA:${id}:${String(proposalRow?.propuestaId ?? 'SIN_PROPUESTA')}`)
      rows.push(projection('COBROS', baseRow({ id: opaqueId, movimientoId: id, fecha, concepto, banco, cuenta, importeCentimos: amount, pendienteCentimos: amount, color, grupo: proposalRow ? nullableText(proposalRow.metodo, 120) : null, motivo, documento: documentValue, propuesta: proposalRow ? String(proposalRow.propuestaId) : null, seleccionable: green, diferenciaCentimos: green ? 0 : amount - (proposalLineTotal(status.lines) ?? amount), detail: proposalRow ? compactCompositionDetail(status.composition) ?? textoSeguro(proposalRow.explicacion).slice(0, 1_600) : null }), source, cuentaId))
      if (proposalRow) for (const item of status.composition) {
        if (!item.facturaEmitidaId) continue
        const prior = invoiceCandidate.get(item.facturaEmitidaId)
        if (!prior || conciliarColorRank(color) < conciliarColorRank(prior.color)) invoiceCandidate.set(item.facturaEmitidaId, { movementId: id, color, rowId: opaqueId, propuestaId: String(proposalRow.propuestaId) })
      }
      continue
    }

    const fee = isConciliarBankFee({ importeCentimos: amount, concepto, referencia: nullableText(movement.referencia), infoAdicional: nullableText(movement.info_adicional), tercero: nullableText(movement.tercero), banco })
    if (fee) {
      rows.push(projection('PAGOS', baseRow({ id: rowId('PAGOS', `COMISION_BANCARIA:${id}`), movimientoId: id, fecha, concepto, banco, cuenta, importeCentimos: amount, pendienteCentimos: amount, color: 'VERDE', grupo: 'GASTOS_BANCO', motivo: 'Cargo bancario admitido: se registrará como comisión bancaria.', documento: null, propuesta: null, seleccionable: true, diferenciaCentimos: 0, detail: 'La regla excluye compras con tarjeta, intereses, préstamo y comisiones a cero.' }), { kind: 'COMISION_BANCARIA', movimientoId: id, versionB4: cents(movement.versionB4, 'La versión') }, cuentaId))
      continue
    }
    const aliases = movementPartyAliases(movement)
    const payrollCandidates = payroll.filter(candidate => {
      const net = exactMoney(candidate.total_text)
      return net !== null && -net === amount && payrollPeriodMatches(fecha, candidate) && conciliarAliasesMatch(aliases, [candidate.empleadoNombre])
    })
    if (payrollCandidates.length === 1) {
      const payrollSource = payrollCandidates[0], payrollCents = exactMoney(payrollSource.total_text)!, payrollFile = !!(typeof payrollSource.driveItemId === 'string' || driveItemDesdeArchivoUrlNominaControlada(payrollSource.archivo_url)) && !!bibliotecaFinancieraConfigurada()
      const opaqueId = rowId('PAGOS', `PAGO_NOMINA:${id}:${String(payrollSource.id)}`)
      const doc: ConciliarDocument = { referencia: `Nómina ${String(payrollSource.mes).padStart(2, '0')}/${payrollSource.anio}`, tercero: nullableText(payrollSource.empleadoNombre), importeCentimos: -payrollCents, fecha: null, href: candidateFileHref(opaqueId, payrollFile) }
      rows.push(projection('PAGOS', baseRow({ id: opaqueId, movimientoId: id, fecha, concepto, banco, cuenta, importeCentimos: amount, pendienteCentimos: amount, color: payrollFile ? 'VERDE' : 'AMBAR', grupo: 'NOMINAS', motivo: payrollFile ? 'Empleado, mes y líquido de la nómina coinciden con la transferencia.' : 'La nómina coincide, pero falta su archivo controlado.', documento: doc, propuesta: null, seleccionable: payrollFile, diferenciaCentimos: 0, detail: null }), { kind: 'PAGO_NOMINA', movimientoId: id, nominaId: String(payrollSource.id), versionB4: cents(movement.versionB4, 'La versión') }, cuentaId))
      continue
    }
    const matchingReceived = new Map<string, any>()
    for (const [providerAlias, providerInvoices] of receivedByCounterparty) {
      // Some bank imports store the literal payee plus the payment concept in
      // `tercero`. A complete already-stored supplier name inside that literal
      // is sufficient to surface a review candidate, never to make it green.
      if (!conciliarAliasesMatch(aliases, [providerAlias]) && !conciliarAliasesContainDocumentaryAlias(aliases, [providerAlias])) continue
      for (const invoice of providerInvoices) matchingReceived.set(String(invoice.id), invoice)
    }
    const receivedMatch = classifyReceivedInvoicePaymentCandidates({
      importeBancoCentimos: amount,
      fechaBanco: fecha,
      conceptoBanco: concepto,
      includeFutureDateReview: true,
      candidates: [...matchingReceived.values()].flatMap(invoice => {
        const total = exactMoney(invoice.total_text)
        if (total === null || total === 0) return []
        return [{
          id: String(invoice.id), referencia: nullableText(invoice.referencia, 300),
          fecha: typeof invoice.fecha === 'string' ? invoice.fecha : null,
          vencimiento: typeof invoice.vencimiento === 'string' ? invoice.vencimiento : null,
          importeDocumentoCentimos: -total,
          matchesCounterparty: true, source: invoice,
        }]
      }),
    })
    if (receivedMatch.kind !== 'NONE') {
      const invoice = receivedMatch.candidate.source, total = exactMoney(invoice.total_text)!
      const file = archivoRecibidaControlado({ oneDriveDriveId: invoice.driveId, oneDriveItemId: invoice.itemId, archivoOneDrive: invoice.archivo }) !== null
      const opaqueId = rowId('PAGOS', `PAGO_FACTURA_RECIBIDA:${id}:${String(invoice.id)}`)
      const exactCounterparty = conciliarAliasesMatch(aliases, [invoice.proveedor])
      const evalExact = evaluarDocumentoExacto({ importeBancoCentimos: amount, importeDocumentoCentimos: -total, fechaBanco: fecha, fechaDocumento: typeof invoice.fecha === 'string' ? invoice.fecha : null, conceptoBanco: concepto, referenciaDocumento: String(invoice.referencia ?? 'Factura recibida'), unicoTercero: exactCounterparty })
      const green = receivedMatch.kind === 'EXACT' && exactCounterparty && evalExact.color === 'VERDE' && file
      const color: ConciliarColor = green ? 'VERDE' : 'AMBAR'
      const amountDifference = amount - -total
      const referenceDiscrepancy = receivedMatch.kind === 'REVIEW' && receivedMatch.reason === 'REFERENCIA_DISCREPANTE'
      const laterIssueDate = receivedMatch.kind === 'REVIEW' && receivedMatch.reason === 'FECHA_POSTERIOR'
      const discrepancy = receivedMatch.kind === 'REVIEW'
        ? amountDifference !== 0
          ? 'La candidata es del mismo proveedor, pero el importe no coincide exactamente; revísala antes de confirmar.'
          : laterIssueDate
            ? 'La candidata es del mismo proveedor, pero la fecha de emisión es posterior al movimiento bancario; revísala antes de confirmar.'
          : referenceDiscrepancy
            ? 'La candidata es del mismo proveedor, pero no hay una referencia de factura documental exacta; revísala antes de confirmar.'
            : !exactCounterparty
              ? 'La candidata contiene el nombre completo del proveedor en el literal bancario, pero no un alias idéntico; revísala antes de confirmar.'
              : 'Hay varias candidatas del mismo proveedor; revísalas antes de confirmar.'
        : !exactCounterparty
          ? 'La candidata contiene el nombre completo del proveedor en el literal bancario, pero no un alias idéntico; revísala antes de confirmar.'
          : null
      const dueHint = typeof invoice.vencimiento === 'string' ? ` Vencimiento: ${invoice.vencimiento}.` : ''
      rows.push(projection('PAGOS', baseRow({ id: opaqueId, movimientoId: id, fecha, concepto, banco, cuenta, importeCentimos: amount, pendienteCentimos: amount, color, grupo: 'FACTURA_RECIBIDA', motivo: green ? evalExact.motivo : discrepancy ?? (file ? evalExact.motivo : 'La factura coincide, pero falta su PDF controlado para poder confirmarla.'), documento: { referencia: String(invoice.referencia ?? 'Factura recibida'), tercero: nullableText(invoice.proveedor), importeCentimos: -total, fecha: typeof invoice.fecha === 'string' ? invoice.fecha : null, href: candidateFileHref(opaqueId, file) }, propuesta: null, seleccionable: green, diferenciaCentimos: amountDifference, detail: discrepancy ? `${discrepancy}${dueHint}` : dueHint.trim() || null }), { kind: 'PAGO_FACTURA_RECIBIDA', movimientoId: id, facturaRecibidaId: String(invoice.id), versionB4: cents(movement.versionB4, 'La versión') }, cuentaId))
      const invoiceId = String(invoice.id)
      receivedInvoicePaymentCandidates.set(invoiceId, [...(receivedInvoicePaymentCandidates.get(invoiceId) ?? []), { rowId: opaqueId, color }])
      continue
    }
    rows.push(projection('PAGOS', baseRow({ id: rowId('PAGOS', `PAGO_SIN_DOCUMENTO:${id}`), movimientoId: id, fecha, concepto, banco, cuenta, importeCentimos: amount, pendienteCentimos: amount, color: payrollCandidates.length > 1 ? 'AMBAR' : 'ROJO', grupo: null, motivo: payrollCandidates.length > 1 ? 'Hay varias nóminas posibles; revisa empleado y mes.' : redReasonForMovement({ importeCentimos: amount, concepto, tarjeta: /\b(?:TARJETA|VISA|MASTERCARD|AMEX|TPV|POS)\b/i.test(concepto) }), documento: null, propuesta: null, seleccionable: false, diferenciaCentimos: 0, detail: null }), { kind: 'PAGO_FACTURA_RECIBIDA', movimientoId: id, versionB4: cents(movement.versionB4, 'La versión') }, cuentaId))
  }

  for (const settlement of bank.invoices) {
    if (settlement.paymentState === 'COBRADA_CALCULADA') continue
    const target = settlement.targetCents, pending = settlement.remainingCents
    const color: ConciliarColor = pending === null || target === null || settlement.paymentState === 'PENDIENTE_COBRO_REVISION' ? 'AMBAR' : 'ROJO'
    const reason = pending === null ? 'No se puede comprobar el saldo de esta factura con la evidencia bancaria disponible.'
      : settlement.paymentState === 'PENDIENTE_COBRO_REVISION' ? 'La factura tiene una asignación que requiere revisión; no se considera cobrada.'
        : 'Factura emitida pendiente de cobro documental.'
    const candidate = invoiceCandidate.get(settlement.invoiceId)
    const rowColor = candidate?.color === 'VERDE' ? 'VERDE' : candidate ? 'AMBAR' : color
    const rowReason = candidate?.color === 'VERDE' ? 'Hay un cobro que coincide; ábrelo para confirmarlo.' : candidate ? 'Hay un cobro propuesto que necesita revisión.' : reason
    rows.push(projection('EMITIDAS', baseRow({ id: rowId('EMITIDAS', `PENDIENTE_FACTURA_EMITIDA:${settlement.invoiceId}`), movimientoId: candidate?.movementId ?? null, fecha: settlement.fechaISO ?? '1970-01-01', concepto: settlement.numFactura ?? 'Factura emitida', banco: null, cuenta: null, importeCentimos: pending ?? 0, pendienteCentimos: pending ?? 0, color: rowColor, grupo: 'FACTURAS_EMITIDAS', motivo: rowReason, documento: target === null ? null : { referencia: settlement.numFactura ?? `Factura ${settlement.invoiceId}`, tercero: settlement.cliente, importeCentimos: target, fecha: settlement.fechaISO, href: null }, propuesta: candidate?.propuestaId ?? null, seleccionable: false, diferenciaCentimos: 0, linksMovimiento: candidate ? [{ id: candidate.rowId, href: `/admin/finanzas/conciliar?tab=COBROS&q=${encodeURIComponent(settlement.numFactura ?? '')}`, etiqueta: 'Abrir el cobro propuesto' }] : undefined, detail: settlement.reasons.join(' · ').slice(0, 1_600) || null }), { kind: 'PENDIENTE_FACTURA_EMITIDA', facturaEmitidaId: settlement.invoiceId, ...(candidate ? { movimientoId: candidate.movementId } : {}) } as ConciliarProjectionSource, null))
  }

  for (const invoice of invoices) {
    const total = exactMoney(invoice.total_text)
    if (total === null || total === 0) continue
    const assigned = safeInteger(invoice.asignado) ?? 0
    const settlement = receivedInvoicePendingSettlement({ totalCentimos: total, assignedCentimos: assigned })
    if (!settlement) continue
    const { targetCentimos: target, pendingCentimos: pending } = settlement
    const file = archivoRecibidaControlado({ oneDriveDriveId: invoice.driveId, oneDriveItemId: invoice.itemId, archivoOneDrive: invoice.archivo }) !== null
    const opaqueId = rowId('RECIBIDAS', `PENDIENTE_FACTURA_RECIBIDA:${String(invoice.id)}`)
    const candidate = receivedInvoicePendingCandidate(receivedInvoicePaymentCandidates.get(String(invoice.id)) ?? [])
    const reference = String(invoice.referencia ?? 'Factura recibida')
    const invoiceDate = day(invoice.fecha, 'La factura recibida')
    const motive = total < 0 && candidate.candidate === null ? 'Abono proveedor pendiente de aplicar.' : candidate.motivo
    rows.push(projection('RECIBIDAS', baseRow({ id: opaqueId, movimientoId: null, fecha: invoiceDate, concepto: reference, banco: null, cuenta: null, importeCentimos: pending, pendienteCentimos: pending, color: candidate.color, grupo: 'FACTURAS_RECIBIDAS', motivo: motive, documento: { referencia: reference, tercero: nullableText(invoice.proveedor), importeCentimos: target, fecha: invoiceDate, href: candidateFileHref(opaqueId, file) }, propuesta: null, seleccionable: false, diferenciaCentimos: 0, linksMovimiento: candidate.candidate ? [{ id: candidate.candidate.rowId, href: `/admin/finanzas/conciliar?tab=PAGOS&q=${encodeURIComponent(reference)}`, etiqueta: 'Abrir movimiento' }] : undefined, detail: file ? null : 'La factura existe, pero falta su PDF controlado; no se puede confirmar un pago nuevo sin el documento.' }), { kind: 'PAGO_FACTURA_RECIBIDA', facturaRecibidaId: String(invoice.id) }, null))
  }

  if (rows.length > MAX_REBUILD_ROWS) fail(409, 'PROYECCION_DEMASIADA', 'La proyección supera el límite de rebuild manual; acota o revisa las fuentes.')
  await tx.$executeRaw(Prisma.sql`DELETE FROM conciliar_proyecciones`)
  await insertProjectionBatches(tx, rows)
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO estado_proyeccion_conciliar(singleton,dirty_at,dirty_reason,rebuilt_at,rebuilt_by_id,projection_version)
    VALUES(true,NULL,NULL,CURRENT_TIMESTAMP,${rebuiltById},1)
    ON CONFLICT(singleton) DO UPDATE SET dirty_at=NULL,dirty_reason=NULL,rebuilt_at=CURRENT_TIMESTAMP,rebuilt_by_id=${rebuiltById},projection_version=estado_proyeccion_conciliar.projection_version+1
  `)
  return { rows: rows.length, emitted: bank.invoices.length, rebuiltAt: new Date().toISOString() }
}

export async function rebuildConciliarProjection(rebuiltById: number | null) {
  return db().$transaction(tx => rebuildConciliarProjectionTx(tx, rebuiltById), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 })
}
