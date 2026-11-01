/** Exact source validators extracted from Conciliar handlers. PRECHECK never
 * acquires locks. Apply calls the same predicates after acquiring live locks. */
import { Prisma } from '@prisma/client'
import { bibliotecaFinancieraConfigurada } from './archivo-fuente-controlada'
import { inspectEasyCandidatesTx } from './easy-reconciliation-db'
import { readConciliarConfirmingCandidates } from './conciliar-confirming'
import { evaluarDocumentoExacto, isConciliarBankFee, type ConciliarProjectionSource } from './conciliar-contract'
import { conciliarAliasesMatch, safeInteger } from './conciliar-core'
import { movementPartyAliases, payrollPeriodMatches, unresolvedMovements } from './conciliar-db'
import { ConciliarDbError } from './conciliar-errors'
import { lockConciliarDocumentSourceForConfirmationTx, readConciliarDocumentSourceEligibilityTx, supportsConciliarDocumentSourceGuard, conciliarDocumentSourceGuardMessage } from './conciliar-document-source-guard'
import { exactMoney } from './conciliar-projection-read'
export type PrecheckRow = Readonly<{id:string; importeCentimos:number; source:ConciliarProjectionSource}>
type Tx = Prisma.TransactionClient & Record<string, any>
function fail(status:number,code:string,message:string):never { throw new ConciliarDbError(status,code,message) }
function b4Version(value:unknown):number { const version=safeInteger(value); if(version===null || version<1 || version>2147483647) fail(409,'VERSION_OBSOLETA','El movimiento cambió. Actualiza la lista.'); return version }
function requireMovement(source:ConciliarProjectionSource):string { if(!source.movimientoId) fail(409,'FILA_SIN_MOVIMIENTO','Falta el movimiento bancario de esta fila.'); return source.movimientoId }
const exactCents = exactMoney
function controlledPayrollItem(value:unknown):boolean { return typeof value==='string' && /^\/api\/admin\/nominas\/download\/[A-Za-z0-9!_.~-]{4,220}$/.test(value) }
export async function preflightConciliarLifecycleTx(tx:Tx,source:ConciliarProjectionSource,lock=false) {
  if (!supportsConciliarDocumentSourceGuard(source)) return
  const live = lock ? await lockConciliarDocumentSourceForConfirmationTx(tx,{source,expectedVersionState:source.documentLifecycleVersionState}) : await readConciliarDocumentSourceEligibilityTx(tx,source)
  if (!live.elegible) fail(409,live.codigo,conciliarDocumentSourceGuardMessage(live.codigo))
  if (!source.documentLifecycleVersionState || live.versionEstado !== source.documentLifecycleVersionState) fail(409,'FUENTE_DOCUMENTAL_CAMBIADA','La fuente documental cambió desde que se preparó la fila. Actualiza la lista.')
}
type LiveB5TicketSource = Readonly<{
  adjuntoB5Id: string
  gastoId: string
  documentoConciliableId: string
  driveId: string | null
  itemId: string | null
}>

/**
 * The persisted projection source is only a sealed pointer. Before touching B4,
 * prove its exact B5 attachment is still complete, still belongs to this same
 * movement and still owns the reviewed Gasto/TICKET wrapper pair. No provider
 * text, external URL or browser-supplied identifier participates in this check.
 */
async function liveB5TicketSourceTx(tx: Tx, source: ConciliarProjectionSource, movimientoId: string, lock = false): Promise<LiveB5TicketSource> {
  const adjuntoB5Id = source.adjuntoB5Id, gastoId = source.gastoId, documentoConciliableId = source.documentoConciliableId
  if (!adjuntoB5Id || !gastoId || !documentoConciliableId) {
    fail(409, 'DECISION_CAMBIADA', 'El ticket B5 ya no conserva su identidad documental sellada. Actualiza la lista.')
  }
  const rows = await tx.$queryRaw<Array<LiveB5TicketSource>>(Prisma.sql`
    SELECT a.id::text AS "adjuntoB5Id",a.gasto_id AS "gastoId",a.documento_conciliable_id::text AS "documentoConciliableId",
      a.drive_id AS "driveId",a.onedrive_item_id AS "itemId"
    FROM adjuntos_pendientes_b5 a
    JOIN movimientos_bancarios m ON m.id=a.movimiento_id
    JOIN gastos g ON g.id=a.gasto_id AND g.estado IN ('APROBADO','CONTABILIZADO') AND g.metodo_pago='TARJETA_EMPRESA'
    JOIN documentos_conciliables d ON d.id=a.documento_conciliable_id AND d.gasto_id=g.id
      AND d.tipo='TICKET'::"TipoDocumentoConciliable" AND d.activo=true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(v.importe_centimos),0)::bigint AS asignado
      FROM vinculos_movimiento_documento v
      WHERE v.activo AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo" AND v.documento_conciliable_id=d.id
    ) capacity ON TRUE
    WHERE a.id=CAST(${adjuntoB5Id} AS uuid) AND a.movimiento_id=${movimientoId}
      AND a.tipo_documento='TICKET' AND a.estado='UPLOAD_COMPLETO'::"EstadoAdjuntoPendienteB5"
      AND a.gasto_id=${gastoId} AND a.documento_conciliable_id=CAST(${documentoConciliableId} AS uuid)
      AND a.fecha_documento::date=g.fecha::date
      AND a.importe_documento_centimos=b4_importe_bancario_centimos(g.importe)
      AND d.importe_objetivo_centimos=-b4_importe_bancario_centimos(g.importe)
      AND b4_importe_bancario_centimos(m.importe)=-b4_importe_bancario_centimos(g.importe)
      AND g.fecha::date<=m.fecha_operacion::date AND capacity.asignado=0
    LIMIT 1
    ${lock ? Prisma.sql`FOR KEY SHARE OF a,m,g,d` : Prisma.empty}
  `)
  const current = rows[0]
  const configuredDrive = bibliotecaFinancieraConfigurada()
  if (!current || !configuredDrive || current.driveId !== configuredDrive
    || typeof current.itemId !== 'string' || !/^[A-Za-z0-9!_.~-]{4,220}$/.test(current.itemId)) {
    fail(409, 'EVIDENCIA_B5_CAMBIADA', 'El ticket B5 o su archivo privado controlado cambiaron. Actualiza la lista.')
  }
  return current
}


export async function preflightConciliarBankFeeTx(tx: Tx, row: PrecheckRow, lock = false) {
  const movementId = requireMovement(row.source)
  const sourceRows = await tx.$queryRaw<Array<{ id: string; version: number | bigint; amount: number | bigint; concepto: string | null; referencia: string | null; info: string | null; tercero: string | null; banco: string | null }>>(Prisma.sql`
    SELECT m.id,COALESCE(e.version,1) AS version,b4_importe_bancario_centimos(m.importe) AS amount,m.concepto,m.referencia,m.info_adicional AS info,m.tercero,c.banco
    FROM movimientos_bancarios m JOIN cuentas_bancarias c ON c.id=m.cuenta_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE m.id=${movementId} AND COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO' ${lock ? Prisma.sql`FOR UPDATE OF m` : Prisma.empty}
  `)
  const source = sourceRows[0]
  if (!source || safeInteger(source.amount) === null || safeInteger(source.version) === null) fail(409, 'DECISION_CAMBIADA', 'El movimiento cambió. Actualiza la lista.')
  const fee = row.source.kind === 'COMISION_BANCARIA' && isConciliarBankFee({ importeCentimos: Number(source.amount), concepto: source.concepto, referencia: source.referencia, infoAdicional: source.info, tercero: source.tercero, banco: source.banco })
  if (!fee || Number(source.amount) !== row.importeCentimos || Number(source.version) !== b4Version(row.source.versionB4)) fail(409, 'DECISION_CAMBIADA', 'El cargo ya no cumple la regla de gasto bancario. Actualiza la lista.')
  return source
}

export async function preflightConciliarReceivedInvoiceTx(tx: Tx, row: PrecheckRow, lock = false) {
  const movementId = requireMovement(row.source), invoiceId = row.source.facturaRecibidaId
  if (!invoiceId) fail(409, 'DECISION_CAMBIADA', 'La propuesta ya no identifica una factura recibida. Actualiza la lista.')
  await preflightConciliarLifecycleTx(tx, row.source, lock)
  const movement = (await unresolvedMovements(tx, movementId, lock))[0]
  const invoice = await tx.facturaRecibida.findUnique({ where: { id: invoiceId }, select: { numFactura: true, fecha: true, total: true, proveedor: true } })
  const total = invoice ? exactCents(String(invoice.total)) : null
  if (!movement || !invoice || total === null) fail(409, 'DECISION_CAMBIADA', 'La factura o el movimiento cambiaron. Actualiza la lista.')
  const exact = evaluarDocumentoExacto({ importeBancoCentimos: Number(movement.importeCentimos), importeDocumentoCentimos: -total,
    fechaBanco: movement.fecha, fechaDocumento: invoice.fecha instanceof Date ? invoice.fecha.toISOString().slice(0, 10) : null,
    conceptoBanco: String(movement.concepto ?? ''), referenciaDocumento: String(invoice.numFactura ?? ''),
    unicoTercero: conciliarAliasesMatch(movementPartyAliases(movement), [invoice.proveedor]) })
  if (!exact.seleccionable || Number(movement.importeCentimos) !== row.importeCentimos) fail(409, 'DECISION_CAMBIADA', exact.motivo || 'La propuesta cambió. Actualiza la lista.')
  const candidates = await inspectEasyCandidatesTx(tx, movementId, lock)
  const current = candidates.find(item => item.suggestion.sourceId === invoiceId && item.suggestion.tipo === 'FACTURA_RECIBIDA' && item.suggestion.exacta)
  if (!current) fail(409, 'DECISION_CAMBIADA', 'La factura propuesta ya no coincide exactamente con el movimiento. Actualiza la lista.')
  return current
}

export async function preflightConciliarPayrollTx(tx: Tx, row: PrecheckRow, lock = false) {
  const movementId = requireMovement(row.source), nominaId = row.source.nominaId
  if (!nominaId) fail(409, 'DECISION_CAMBIADA', 'La nómina propuesta ya no está identificada. Actualiza la lista.')
  await preflightConciliarLifecycleTx(tx, row.source, lock)
  const movement = (await unresolvedMovements(tx, movementId, lock))[0]
  const sourceRows = await tx.$queryRaw<Array<{ id: string; mes: number; anio: number; empleadoNombre: string; total: string | null; itemId: string | null; legacyUrl: string | null; version: number | bigint; amount: number | bigint }>>(Prisma.sql`
    SELECT n.id,n.mes,n.anio,employee.nombre_completo AS "empleadoNombre",n.neto_percibir::text AS total,COALESCE(nd.drive_item_id,'') AS "itemId",n.archivo_url AS "legacyUrl",COALESCE(e.version,1) AS version,b4_importe_bancario_centimos(m.importe) AS amount
    FROM movimientos_bancarios m JOIN nominas n ON n.id=${nominaId}
    JOIN empleados employee ON employee.id=n.empleado_id
    LEFT JOIN LATERAL (SELECT drive_item_id FROM nomina_documentos WHERE nomina_id=n.id AND tipo='NOMINA' ORDER BY created_at DESC,id DESC LIMIT 1) nd ON TRUE
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE m.id=${movementId} AND COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO' ${lock ? Prisma.sql`FOR UPDATE OF m` : Prisma.empty}
  `)
  const source = sourceRows[0]
  if (!source || typeof source.total !== 'string' || safeInteger(source.amount) === null || safeInteger(source.version) === null) fail(409, 'DECISION_CAMBIADA', 'La nómina o el movimiento cambió. Actualiza la lista.')
  const net = exactCents(source.total)
  const hasFile = typeof source.itemId === 'string' && source.itemId.length >= 4 || controlledPayrollItem(source.legacyUrl)
  if (!movement || !payrollPeriodMatches(movement.fecha, source) || !conciliarAliasesMatch(movementPartyAliases(movement), [source.empleadoNombre])) fail(409, 'DECISION_CAMBIADA', 'El empleado o el mes de la nómina ya no coinciden con la transferencia. Actualiza la lista.')
  if (net === null || !hasFile || Number(source.amount) !== -net || Number(source.version) !== b4Version(row.source.versionB4)) fail(409, 'DECISION_CAMBIADA', 'La nómina ya no coincide exactamente o no conserva su archivo controlado.')
  return source
}

export async function preflightConciliarConfirmingTx(tx: Tx, row: PrecheckRow, lock = false) {
  const movementId = requireMovement(row.source), confirmingId = row.source.confirmingId, sourceHash = row.source.confirmingSourceHash
  if (!confirmingId || !sourceHash) fail(409, 'DECISION_CAMBIADA', 'El confirming ya no conserva su fuente documental. Actualiza la lista.')
  await preflightConciliarLifecycleTx(tx, row.source, lock)
  const live = await readConciliarConfirmingCandidates(tx, { movimientoIds: [movementId] })
  const candidate = live.candidates.find(item => item.movimientoId === movementId && item.confirmingId === confirmingId && item.sourceHash === sourceHash)
  if (!candidate || candidate.evidenceSchema !== 'C11' || candidate.estado !== 'LISTO_PARA_CONFIRMACION_B4'
    || candidate.sourceHash !== sourceHash || candidate.totalLineasB4Centimos !== row.importeCentimos || candidate.lineasB4.length < 1) {
    fail(409, 'EVIDENCIA_C11_CAMBIADA', 'La liquidación confirming C11, sus facturas o sus deducciones explícitas cambiaron. Actualiza la lista.')
  }
  if (candidate.lineasB4.some(line => line.tipo === 'DOCUMENTO' && !line.documentoConciliableId)) fail(409, 'EVIDENCIA_C11_INCOMPLETA', 'Falta un documento B4 C11 vigente.')
  return candidate
}

export async function preflightConciliarB5TicketTx(tx: Tx, row: PrecheckRow, lock = false) {
  const movimientoId = requireMovement(row.source)
  await preflightConciliarLifecycleTx(tx, row.source, lock)
  const candidates = await inspectEasyCandidatesTx(tx, movimientoId, lock)
  const live = await liveB5TicketSourceTx(tx, row.source, movimientoId, lock)
  const current = candidates.find(item => item.suggestion.tipo === 'TICKET'
    && item.suggestion.sourceId === live.gastoId
    && item.suggestion.documentoConciliableId === live.documentoConciliableId
    && item.suggestion.exacta === true
    && item.suggestion.archivoDisponible === true
    && item.suggestion.importeCentimos === row.importeCentimos)
  if (!current) {
    fail(409, 'DECISION_CAMBIADA', 'El ticket B5 ya no es la candidata exacta y disponible del mismo movimiento. Actualiza la lista.')
  }
  return {current,live}
}
