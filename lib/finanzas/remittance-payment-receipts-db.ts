import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety'
import { confirmarB4Tx, createDocumentoB4Tx } from '@/lib/finanzas/reconciliation-db'
import {
  B6_AUDIT_SCHEMA_VERSION,
  B6_MAX_FACTURAS_POR_ASOCIACION,
  canonicalSha256,
  facturasSourceHash,
  remesaSourceFingerprint,
} from './b6-remesas-pure'
import { confirmarAsociacionFacturasRemesaB6Tx, requireB6TransactionActorTx } from './b6-remesas-db'
import {
  B7_REMESA_RECEIPT_SCHEMA_VERSION,
  RemittancePaymentReceiptError,
  buildRemittanceReceiptPlan,
  receiptFail,
  receiptRequestHash,
  receiptSourceHash,
  isReceiptHash,
  remittanceReceiptHash,
  remittanceMethod,
  parseReceiptComposition,
  type ReceiptProposalSource,
  type ReceiptInvoiceSource,
} from './remittance-payment-receipts-core'
import type { EasyCollectionSelection } from './easy-collections-core'
import type { EasyCollectionsRemittanceSeal } from './easy-collections-preview'
import { derivedUuidV4 } from './easy-auto-core'

type Tx = Prisma.TransactionClient & Record<string, any>
type Raw = Record<string, unknown>
type ProposalRow = {
  propuestaId: string
  generacionId: string
  movimientoId: string
  metodo: string
  nivel: string
  estadoPropuesto: string
  importeMovimientoCentimos: number | bigint | string
  fingerprint: string
  lineas: unknown
  composicion: unknown
  fechaBanco: string | Date | null
  versionB4: number | bigint | string | null
  estadoB4: string
}
type InvoiceRow = {
  facturaEmitidaId: string
  facturaISPId: number | bigint | string | null
  facturaISPGestionId: number | bigint | string | null
  facturaEmitidaTotalTexto: string | null
  facturaEmitidaFecha: string | Date | null
  facturaISPTotalTexto: string | null
  facturaISPFecha: string | Date | null
  remesaId: number | bigint | string | null
}
type RemesaRow = { id: number | bigint | string; ispGestionId: number | bigint | string; fecha: string | Date | null; totalTexto: string | null }
type B4LinkRow = { id: string; movementId: string; signedCents: number | bigint | string; documentId: string; operationId: string; operationApplied: boolean; operationReverted: boolean; movementJustified: boolean; activeCount: number | bigint | string; activeLineCount: number | bigint | string; closure: number | bigint | string; physical: number | bigint | string | null }
type PriorReceiptRow = { id: string; requestHash: string; snapshotResultado: unknown }

const RECEIPT_CAPACITY_SCAN_LIMIT = 10_001
export type ConfirmarReciboRemesaCompuestaInput = Readonly<{
  selection: EasyCollectionSelection
  idempotencyKey: string
  /** Easy's HMAC-authenticated composition seal. */
  seal?: EasyCollectionsRemittanceSeal
  /** Conciliar's server-projected, decision-hash-covered composition hash. */
  expectedCompositionHash?: string
  blockId: string
  keyHash: string
  requestHash: string
}>

export { RemittancePaymentReceiptError } from './remittance-payment-receipts-core'
function int(value: unknown, code: string, label: string): number {
  try {
    const parsed = typeof value === 'bigint' ? value : typeof value === 'number' && Number.isSafeInteger(value) ? BigInt(value) : typeof value === 'string' && /^-?\d+$/.test(value) ? BigInt(value) : null
    if (parsed === null || parsed < BigInt(-2_147_483_648) || parsed > BigInt(2_147_483_647)) throw new Error('bad')
    return Number(parsed)
  } catch { return receiptFail(422, code, `${label} no conserva céntimos enteros exactos.`) }
}
function date(value: unknown, code: string, label: string): string {
  const result = value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null
  if (!result) receiptFail(422, code, `${label} no conserva una fecha verificable.`)
  return result
}
function json(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return null }
}
function lines(value: unknown): readonly any[] {
  const result = json(value)
  if (!Array.isArray(result)) receiptFail(422, 'REMESA_LINEAS_B4_INEXACTAS', 'La propuesta no conserva líneas B4 verificables.')
  return result
}
function proposalLines(value: unknown): ReceiptProposalSource['lineas'] {
  return lines(value).map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) receiptFail(422, 'REMESA_LINEAS_B4_INEXACTAS', 'La propuesta no conserva líneas B4 verificables.')
    const row = entry as Raw
    if (row.tipo === 'DOCUMENTO') return { tipo: 'DOCUMENTO', tipoDocumento: row.tipoDocumento === 'REMESA' ? 'REMESA' : row.tipoDocumento === 'FACTURA_EMITIDA' ? 'FACTURA_EMITIDA' : undefined, sourceId: typeof row.sourceId === 'string' ? row.sourceId : undefined, importeCentimos: int(row.importeCentimos, 'REMESA_LINEAS_B4_INEXACTAS', 'La línea B4') }
    if (row.tipo === 'DIFERENCIA') return { tipo: 'DIFERENCIA', motivoDiferencia: typeof row.motivoDiferencia === 'string' ? row.motivoDiferencia : undefined, importeCentimos: int(row.importeCentimos, 'REMESA_LINEAS_B4_INEXACTAS', 'La línea B4') }
    receiptFail(422, 'REMESA_LINEAS_B4_INEXACTAS', 'La propuesta no conserva líneas B4 verificables.')
  })
}
function proposalFrom(row: ProposalRow): ReceiptProposalSource & { estadoB4: string } {
  return {
    propuestaId: row.propuestaId, generacionId: row.generacionId, movimientoId: row.movimientoId, metodo: row.metodo,
    fingerprint: row.fingerprint, estadoPropuesto: row.estadoPropuesto,
    estadoB4: row.estadoB4,
    nivel: row.nivel, importeMovimientoCentimos: int(row.importeMovimientoCentimos, 'REMESA_PROPUESTA_CAMBIADA', 'El importe propuesto'),
    fechaBanco: date(row.fechaBanco, 'FECHA_FUENTE_DESCONOCIDA', 'La fecha del movimiento'),
    versionB4: row.versionB4 === null ? 1 : int(row.versionB4, 'REMESA_PROPUESTA_CAMBIADA', 'La versión B4'),
    lineas: proposalLines(row.lineas), composicion: json(row.composicion),
  }
}
function moneyToCents(value: string | null, code: string, label: string): number {
  if (typeof value !== 'string' || !/^[+]?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) receiptFail(422, code, `${label} no conserva un importe fuente exacto.`)
  const [whole, fractional = ''] = value.replace(/^\+/, '').split('.')
  const result = BigInt(whole) * BigInt(100) + BigInt((fractional + '00').slice(0, 2))
  if (result < BigInt(1) || result > BigInt(2_147_483_647)) receiptFail(422, code, `${label} no conserva un importe positivo dentro de Int.`)
  return Number(result)
}
function selectionMatch(row: ReceiptProposalSource, selection: EasyCollectionSelection) {
  if (row.propuestaId !== selection.propuestaId || row.movimientoId !== selection.movimientoId || row.fingerprint !== selection.fingerprint) {
    receiptFail(409, 'SELECCION_CAMBIADA', 'La propuesta de remesa cambió; actualiza la lista.')
  }
}
function isRemesaLine(row: ReceiptProposalSource): number | null {
  try {
    if (!remittanceMethod(row.metodo) || row.lineas.length !== 1) return null
    const line = row.lineas[0]
    if (line.tipo !== 'DOCUMENTO' || line.tipoDocumento !== 'REMESA' || typeof line.sourceId !== 'string' || !/^\d+$/.test(line.sourceId) || line.importeCentimos !== row.importeMovimientoCentimos) return null
    const id = Number(line.sourceId)
    return Number.isSafeInteger(id) && id > 0 ? id : null
  } catch { return null }
}

/**
 * Preview seal only checks immutable proposal shape/hash. The confirmation below
 * repeats all source, membership, B4, capacity and date validation under locks.
 */
export function remittanceSealForProposal(row: Readonly<{ propuestaId: string; movimientoId: string; fingerprint: string; metodo: string; importeMovimientoCentimos: number; lineas: unknown; composicion: unknown }>): EasyCollectionsRemittanceSeal | null {
  try {
    const proposal = proposalFrom({ ...row, generacionId: '00000000-0000-4000-8000-000000000000', nivel: 'EXACTA', estadoPropuesto: 'JUSTIFICADO', fechaBanco: '2000-01-01', versionB4: 1, estadoB4: 'SIN_DOCUMENTO' })
    const remesaId = isRemesaLine(proposal)
    if (!remesaId || proposal.importeMovimientoCentimos <= 0) return null
    // Signs the exact whole JSON, including rows a compact UI may not show.
    return { propuestaId: proposal.propuestaId, movimientoId: proposal.movimientoId, fingerprint: proposal.fingerprint, compositionHash: parseReceiptComposition(proposal.composicion).hash, remesaId }
  } catch { return null }
}

async function lockProposal(tx: Tx, propuestaId: string): Promise<ReceiptProposalSource & { estadoB4: string }> {
  const rows = await tx.$queryRaw<ProposalRow[]>(Prisma.sql`
    SELECT p.id::text AS "propuestaId",p.generacion_id::text AS "generacionId",p.movimiento_id AS "movimientoId",p.metodo,p.nivel,
      p.estado_propuesto AS "estadoPropuesto",p.importe_movimiento_centimos AS "importeMovimientoCentimos",p.fingerprint,p.lineas,p.composicion,
      m.fecha_operacion AS "fechaBanco",COALESCE(e.version,1) AS "versionB4",COALESCE(e.estado::text,'SIN_DOCUMENTO') AS "estadoB4"
    FROM modo_facil_propuestas_cobro p
    JOIN movimientos_bancarios m ON m.id=p.movimiento_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE p.id=CAST(${propuestaId} AS uuid)
    LIMIT 2 FOR UPDATE OF p
  `)
  if (rows.length !== 1) receiptFail(409, 'SELECCION_CAMBIADA', 'La propuesta de remesa ya no existe; actualiza la lista.')
  return proposalFrom(rows[0])
}
async function currentGeneration(tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id::text AS id FROM modo_facil_generaciones_cobro ORDER BY creada_at DESC,id DESC LIMIT 1 FOR UPDATE`)
  if (!rows[0]?.id) receiptFail(409, 'SELECCION_CAMBIADA', 'No hay una generación vigente de propuestas.')
  return rows[0].id
}
async function lockMovementBeforeProposal(tx: Tx, movimientoId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${movimientoId} AS text),0))::text AS locked`)
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM movimientos_bancarios WHERE id=${movimientoId} LIMIT 2 FOR UPDATE
  `)
  if (rows.length !== 1) receiptFail(409, 'SELECCION_CAMBIADA', 'El movimiento bancario ya no está disponible; actualiza la lista.')
}
async function advisoryRemesaBeforeComposition(tx: Tx, remesaId: number): Promise<void> {
  const key = `B6:remesa:${remesaId}`
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${key} AS text),0))::text AS locked`)
}
async function lockRemesaProposals(tx: Tx, generationId: string, remesaId: number): Promise<ReceiptProposalSource[]> {
  const rows = await tx.$queryRaw<ProposalRow[]>(Prisma.sql`
    SELECT p.id::text AS "propuestaId",p.generacion_id::text AS "generacionId",p.movimiento_id AS "movimientoId",p.metodo,p.nivel,
      p.estado_propuesto AS "estadoPropuesto",p.importe_movimiento_centimos AS "importeMovimientoCentimos",p.fingerprint,p.lineas,p.composicion,
      m.fecha_operacion AS "fechaBanco",COALESCE(e.version,1) AS "versionB4",COALESCE(e.estado::text,'SIN_DOCUMENTO') AS "estadoB4"
    FROM modo_facil_propuestas_cobro p
    JOIN movimientos_bancarios m ON m.id=p.movimiento_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE p.generacion_id=CAST(${generationId} AS uuid)
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.lineas)='array' THEN p.lineas ELSE '[]'::jsonb END) line
        WHERE line->>'tipo'='DOCUMENTO' AND line->>'tipoDocumento'='REMESA' AND line->>'sourceId'=${String(remesaId)}
      )
    ORDER BY p.id ASC
    LIMIT ${B6_MAX_FACTURAS_POR_ASOCIACION + 1} FOR UPDATE OF p
  `)
  if (rows.length > B6_MAX_FACTURAS_POR_ASOCIACION) receiptFail(422, 'REMESA_COMPOSICION_COMPLETA_INEXACTA', 'La remesa supera el límite de composición verificable.')
  const sources = rows.map(proposalFrom)
  if (!sources.length || sources.some(row => isRemesaLine(row) !== remesaId)) receiptFail(422, 'REMESA_COMPOSICION_COMPLETA_INEXACTA', 'La generación contiene una referencia de remesa ambigua o incompleta.')
  return sources
}
async function lockInvoiceSources(tx: Tx, invoiceIds: readonly string[]): Promise<ReceiptInvoiceSource[]> {
  if (!invoiceIds.length) receiptFail(422, 'COMPOSICION_REMESA_INEXACTA', 'La composición no contiene facturas emitidas.')
  const rows = await tx.$queryRaw<InvoiceRow[]>(Prisma.sql`
    SELECT fi.id AS "facturaEmitidaId",fi.factura_isp_id AS "facturaISPId",f.isp_gestion_id AS "facturaISPGestionId",fi.total::text AS "facturaEmitidaTotalTexto",fi.fecha::date::text AS "facturaEmitidaFecha",
      f.total::text AS "facturaISPTotalTexto",f.fecha::date::text AS "facturaISPFecha",f.remesa_id AS "remesaId"
    FROM facturas_emitidas fi
    JOIN facturas f ON f.id=fi.factura_isp_id
    WHERE fi.id IN (${Prisma.join(invoiceIds.map(id => Prisma.sql`${id}`))})
    ORDER BY fi.id ASC
    LIMIT ${invoiceIds.length + 1} FOR UPDATE OF fi,f
  `)
  if (rows.length !== invoiceIds.length) receiptFail(422, 'MAPA_FI_ISP_REMESA_INEXACTO', 'Falta una FacturaEmitida de la composición.')
  return rows.map(row => ({
    facturaEmitidaId: row.facturaEmitidaId.toLowerCase(), facturaISPId: row.facturaISPId === null ? null : int(row.facturaISPId, 'MAPA_FI_ISP_REMESA_INEXACTO', 'El ID ISP'),
    facturaISPGestionId: row.facturaISPGestionId === null ? null : int(row.facturaISPGestionId, 'MAPA_FI_ISP_REMESA_INEXACTO', 'El identificador de gestión ISP'),
    facturaEmitidaTotalCentimos: moneyToCents(row.facturaEmitidaTotalTexto, 'FUENTE_FI_ISP_INEXACTA', `FacturaEmitida ${row.facturaEmitidaId}`),
    facturaEmitidaFecha: date(row.facturaEmitidaFecha, 'FECHA_FUENTE_DESCONOCIDA', `FacturaEmitida ${row.facturaEmitidaId}`),
    facturaISPTotalCentimos: row.facturaISPTotalTexto === null ? null : moneyToCents(row.facturaISPTotalTexto, 'FUENTE_FI_ISP_INEXACTA', `Factura ISP ${String(row.facturaISPId)}`),
    facturaISPFecha: row.facturaISPFecha === null ? null : date(row.facturaISPFecha, 'FECHA_FUENTE_DESCONOCIDA', `Factura ISP ${String(row.facturaISPId)}`),
    remesaId: row.remesaId === null ? null : int(row.remesaId, 'MAPA_FI_ISP_REMESA_INEXACTO', 'La remesa ISP'),
  }))
}
async function lockedRemesa(tx: Tx, remesaId: number): Promise<{ id: number; ispGestionId: number; fecha: string; totalCentimos: number }> {
  const rows = await tx.$queryRaw<RemesaRow[]>(Prisma.sql`
    SELECT id,isp_gestion_id AS "ispGestionId",fecha::date::text AS fecha,total_importe::text AS "totalTexto" FROM remesas WHERE id=${remesaId} LIMIT 2 FOR UPDATE
  `)
  const row = rows[0]
  if (!row) receiptFail(404, 'REMESA_NO_ENCONTRADA', 'La remesa ya no existe.')
  return { id: int(row.id, 'REMESA_FUENTE_INEXACTA', 'La remesa'), ispGestionId: int(row.ispGestionId, 'REMESA_FUENTE_INEXACTA', 'El ID ISP de remesa'), fecha: date(row.fecha, 'FECHA_FUENTE_DESCONOCIDA', 'La fecha de remesa'), totalCentimos: moneyToCents(row.totalTexto, 'REMESA_FUENTE_INEXACTA', 'El total de remesa') }
}
async function priorReceipt(tx: Tx, actorId: number, idempotencyKey: string): Promise<PriorReceiptRow | null> {
  const rows = await tx.$queryRaw<PriorReceiptRow[]>(Prisma.sql`
    SELECT id::text AS id,request_hash AS "requestHash",snapshot_resultado AS "snapshotResultado"
    FROM recibos_cobro_remesa_b7 WHERE actor_id=${actorId} AND idempotency_key=CAST(${idempotencyKey} AS uuid) LIMIT 2 FOR KEY SHARE
  `)
  return rows[0] ?? null
}
async function capacityAndDirectOverlap(tx: Tx, plan: Awaited<ReturnType<typeof buildRemittanceReceiptPlan>>): Promise<void> {
  const ids = plan.allocations.map(line => line.facturaEmitidaId)
  const receiptRows = await tx.$queryRaw<Array<{ facturaEmitidaId: string; importeCentimos: number | bigint | string }>>(Prisma.sql`
    SELECT l.factura_emitida_id AS "facturaEmitidaId",l.importe_centimos AS "importeCentimos"
    FROM lineas_recibo_cobro_remesa_b7 l
    JOIN recibos_cobro_remesa_b7 r ON r.id=l.recibo_id
    JOIN vinculos_movimiento_documento v ON v.id=r.vinculo_b4_id AND v.activo=true
    JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id AND d.activo=true AND d.tipo='REMESA'::"TipoDocumentoConciliable"
    JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
    JOIN estado_justificacion_movimientos e ON e.movimiento_id=v.movimiento_id AND e.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento"
    WHERE l.factura_emitida_id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}`))})
    ORDER BY l.factura_emitida_id,l.recibo_id,l.ordinal LIMIT ${RECEIPT_CAPACITY_SCAN_LIMIT} FOR UPDATE OF l
  `)
  if (receiptRows.length >= RECEIPT_CAPACITY_SCAN_LIMIT) receiptFail(409, 'RECIBO_REMESA_B7_CAPACIDAD_NO_ACOTADA', 'La capacidad histórica de la factura requiere revisión; no se calcula de forma parcial.')
  const direct = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT fi.id
    FROM facturas_emitidas fi
    WHERE fi.id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}`))})
      AND EXISTS (
        SELECT 1 FROM documentos_conciliables d
        JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo=true
        JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
        JOIN estado_justificacion_movimientos e ON e.movimiento_id=v.movimiento_id AND e.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento"
        WHERE d.factura_emitida_id=fi.id AND d.tipo='FACTURA_EMITIDA'::"TipoDocumentoConciliable" AND d.activo=true
      )
    ORDER BY fi.id ASC LIMIT ${ids.length + 1} FOR UPDATE OF fi
  `)
  if (direct.length) receiptFail(409, 'SOLAPAMIENTO_FI_DIRECTA_Y_REMESA', 'Una factura del abono ya conserva un B4 directo vigente.')
  const used = new Map<string, bigint>()
  for (const row of receiptRows) used.set(row.facturaEmitidaId, (used.get(row.facturaEmitidaId) ?? BigInt(0)) + BigInt(int(row.importeCentimos, 'RECIBO_REMESA_B7_CAPACIDAD_EXCEDIDA', 'La capacidad previa')))
  for (const line of plan.allocations) {
    const capacity = BigInt(line.snapshot.facturaEmitida && typeof line.snapshot.facturaEmitida === 'object' ? (line.snapshot.facturaEmitida as Raw).totalCentimos as number : 0)
    if (capacity <= BigInt(0) || (used.get(line.facturaEmitidaId) ?? BigInt(0)) + BigInt(line.importeCentimos) > capacity) {
      receiptFail(422, 'RECIBO_REMESA_B7_CAPACIDAD_EXCEDIDA', 'El abono excede la capacidad documental disponible de una factura.')
    }
  }
}
async function insertReceipt(tx: Tx, input: Readonly<{
  actorId: number; idempotencyKey: string; requestHash: string; plan: Awaited<ReturnType<typeof buildRemittanceReceiptPlan>>
  vinculoB4Id: string; operacionB4Id: string; auditoriaB6Id: string; snapshotSolicitud: Raw; snapshotResultado: Raw
}>): Promise<string> {
  const id = randomUUID()
  const sourceHash = receiptSourceHash({ remesaId: input.plan.remesaId, movimientoId: input.plan.movimientoId, vinculoB4Id: input.vinculoB4Id, operacionB4Id: input.operacionB4Id, auditoriaB6Id: input.auditoriaB6Id, propuestaId: input.plan.propuestaId, proposalFingerprint: input.plan.proposalFingerprint, compositionHash: input.plan.compositionHash, allocations: input.plan.allocations })
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO recibos_cobro_remesa_b7(id,schema_version,estado,remesa_id,movimiento_id,vinculo_b4_id,operacion_b4_id,auditoria_asociacion_b6_id,propuesta_id,proposal_fingerprint,composition_hash,actor_id,idempotency_key,request_hash,source_hash,snapshot_solicitud,snapshot_resultado)
    VALUES(CAST(${id} AS uuid),${B7_REMESA_RECEIPT_SCHEMA_VERSION},'CONFIRMADO'::"EstadoReciboCobroRemesaB7",${input.plan.remesaId},${input.plan.movimientoId},CAST(${input.vinculoB4Id} AS uuid),CAST(${input.operacionB4Id} AS uuid),CAST(${input.auditoriaB6Id} AS uuid),CAST(${input.plan.propuestaId} AS uuid),${input.plan.proposalFingerprint},${input.plan.compositionHash},${input.actorId},CAST(${input.idempotencyKey} AS uuid),${input.requestHash},${sourceHash},CAST(${JSON.stringify(input.snapshotSolicitud)} AS jsonb),CAST(${JSON.stringify(input.snapshotResultado)} AS jsonb))
  `)
  const batchSize = 250
  for (let start = 0; start < input.plan.allocations.length; start += batchSize) {
    const values = input.plan.allocations.slice(start, start + batchSize).map((line, index) =>
      Prisma.sql`(CAST(${id} AS uuid),${start + index + 1},${line.facturaEmitidaId},${line.facturaISPId},${line.importeCentimos},${line.sourceHash},CAST(${JSON.stringify(line.snapshot)} AS jsonb))`,
    )
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO lineas_recibo_cobro_remesa_b7(recibo_id,ordinal,factura_emitida_id,factura_isp_id,importe_centimos,source_hash,snapshot)
      VALUES ${Prisma.join(values)}
    `)
  }
  return id
}
async function b4Link(tx: Tx, movementId: string, operationId: string, remesaId: number, amount: number): Promise<B4LinkRow> {
  const rows = await tx.$queryRaw<B4LinkRow[]>(Prisma.sql`
    SELECT v.id::text AS id,v.movimiento_id AS "movementId",v.importe_centimos AS "signedCents",d.id::text AS "documentId",o.id::text AS "operationId",
      (o.estado='APLICADA'::"EstadoOperacionB4") AS "operationApplied",(o.revertida_at IS NOT NULL) AS "operationReverted",
      (e.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento") AS "movementJustified", closure.document_count AS "activeCount",closure.active_line_count AS "activeLineCount",closure.sum_active AS closure,b4_importe_bancario_centimos(m.importe) AS physical
    FROM vinculos_movimiento_documento v
    JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id
    JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id
    JOIN estado_justificacion_movimientos e ON e.movimiento_id=v.movimiento_id
    JOIN movimientos_bancarios m ON m.id=v.movimiento_id
    JOIN LATERAL (SELECT COUNT(*) FILTER(WHERE x.tipo_linea='DOCUMENTO'::"TipoLineaVinculo")::integer AS document_count,COUNT(*)::integer AS active_line_count,COALESCE(SUM(x.importe_centimos),0)::bigint AS sum_active FROM vinculos_movimiento_documento x WHERE x.movimiento_id=v.movimiento_id AND x.activo) closure ON true
    WHERE v.movimiento_id=${movementId} AND v.operacion_creacion_id=CAST(${operationId} AS uuid) AND v.activo=true AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo" AND d.activo=true AND d.tipo='REMESA'::"TipoDocumentoConciliable" AND d.remesa_id=${remesaId}
    LIMIT 2 FOR UPDATE OF v,d,o,e,m
  `)
  if (rows.length !== 1) receiptFail(422, 'RECIBO_REMESA_B4_INEXACTO', 'B4 no conserva una única línea REMESA activa creada por esta confirmación.')
  const row = rows[0]
  if (int(row.signedCents, 'RECIBO_REMESA_B4_INEXACTO', 'El vínculo B4') !== amount || int(row.activeCount, 'RECIBO_REMESA_B4_INEXACTO', 'El número de documentos B4') !== 1 || int(row.activeLineCount, 'RECIBO_REMESA_B4_INEXACTO', 'El número de líneas B4') !== 1 || int(row.closure, 'RECIBO_REMESA_B4_INEXACTO', 'El cierre B4') !== amount || int(row.physical, 'RECIBO_REMESA_B4_INEXACTO', 'El importe bancario') !== amount || !row.operationApplied || row.operationReverted || !row.movementJustified) {
    receiptFail(422, 'RECIBO_REMESA_B4_INEXACTO', 'El vínculo B4 no cierra el abono físico como remesa única vigente.')
  }
  return row
}

export async function confirmarReciboRemesaCompuestaTx(base: Prisma.TransactionClient, actorId: number, input: ConfirmarReciboRemesaCompuestaInput) {
  const tx = base as Tx
  await requireB6TransactionActorTx(tx, actorId)
  const expectedCompositionHash = input.seal?.compositionHash ?? input.expectedCompositionHash
  if (!isReceiptHash(expectedCompositionHash)) receiptFail(409, 'PREVISUALIZACION_CADUCADA', 'Falta una huella de composición verificable para esta remesa.')
  if (input.seal && (input.seal.propuestaId !== input.selection.propuestaId || input.seal.movimientoId !== input.selection.movimientoId || input.seal.fingerprint !== input.selection.fingerprint)) {
    receiptFail(409, 'PREVISUALIZACION_CADUCADA', 'El sello de composición no corresponde a la propuesta.')
  }
  const receiptHash = receiptRequestHash({ actorId, propuestaId: input.selection.propuestaId, movimientoId: input.selection.movimientoId, fingerprint: input.selection.fingerprint, compositionHash: expectedCompositionHash })
  const replay = await priorReceipt(tx, actorId, input.idempotencyKey)
  if (replay) {
    if (replay.requestHash !== receiptHash) receiptFail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave de idempotencia pertenece a otra confirmación de remesa.')
    return { idempotente: true as const, reciboId: replay.id, resultado: json(replay.snapshotResultado) }
  }
  // Canonical cross-service order: B4 movement advisory/row, selected proposal,
  // remesa advisory/row, ISP memberships, FI and receipt capacity, then B4 link.
  // The caller may already hold the movement lock; PostgreSQL xact locks are
  // re-entrant for the same transaction.
  await lockMovementBeforeProposal(tx, input.selection.movimientoId)
  const generationId = await currentGeneration(tx)
  const proposal = await lockProposal(tx, input.selection.propuestaId)
  selectionMatch(proposal, input.selection)
  if (proposal.generacionId !== generationId || proposal.estadoB4 !== 'SIN_DOCUMENTO' || proposal.nivel !== 'EXACTA') receiptFail(409, 'SELECCION_CAMBIADA', 'La propuesta ya no es confirmable en la generación vigente.')
  const remesaId = isRemesaLine(proposal)
  if (!remesaId || !remittanceMethod(proposal.metodo) || proposal.importeMovimientoCentimos <= 0 || (input.seal && remesaId !== input.seal.remesaId)) receiptFail(422, 'REMESA_REQUIERE_RECIBO_VERSIONADO', 'La propuesta no es un abono positivo de una única remesa.')
  await advisoryRemesaBeforeComposition(tx, remesaId)
  const remesa = await lockedRemesa(tx, remesaId)
  const remesaProposals = await lockRemesaProposals(tx, generationId, remesaId)
  const allCompositionIds = new Set<string>()
  for (const row of remesaProposals) {
    for (const item of parseReceiptComposition(row.composicion).entries) {
      allCompositionIds.add(item.facturaEmitidaId)
      if (allCompositionIds.size > B6_MAX_FACTURAS_POR_ASOCIACION) receiptFail(422, 'REMESA_COMPOSICION_COMPLETA_INEXACTA', 'La remesa supera el límite de facturas verificables.')
    }
  }
  const invoiceSources = await lockInvoiceSources(tx, [...allCompositionIds].sort())
  const selectedComposition = parseReceiptComposition(proposal.composicion)
  const selectedCompositionIds = new Set(selectedComposition.entries.map(item => item.facturaEmitidaId))
  if (selectedComposition.hash !== expectedCompositionHash) receiptFail(409, 'COMPOSICION_CAMBIADA', 'La composición exacta cambió desde la previsualización; actualiza la lista.')
  const b6Facturas = invoiceSources.map(source => {
    if (!Number.isSafeInteger(source.facturaISPId) || !Number.isSafeInteger(source.facturaISPGestionId) || (source.remesaId !== null && source.remesaId !== remesaId) || source.facturaISPTotalCentimos === null || source.facturaISPFecha === null) receiptFail(422, 'REMESA_COMPOSICION_COMPLETA_INEXACTA', 'La composición completa no conserva el mapa ISP requerido para B6.')
    return { id: source.facturaISPId!, ispGestionId: source.facturaISPGestionId!, fecha: source.facturaISPFecha, totalCentimos: source.facturaISPTotalCentimos }
  }).sort((left, right) => left.id - right.id)
  if (new Set(b6Facturas.map(item => item.id)).size !== b6Facturas.length) receiptFail(422, 'MAPA_FI_ISP_AMBIGUO', 'Dos FacturaEmitida apuntan a la misma Factura ISP.')
  const associationHash = canonicalSha256({ version: B6_AUDIT_SCHEMA_VERSION, remesa, facturas: b6Facturas })
  const existingAssociation = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id::text AS id FROM auditoria_remesa_b6 WHERE remesa_id=${remesaId} AND accion='ASOCIACION_FACTURAS_CONFIRMADA'::"AccionAuditoriaRemesaB6" AND source_hash=${associationHash} ORDER BY id ASC LIMIT 1 FOR KEY SHARE
  `)
  let auditoriaB6Id = existingAssociation[0]?.id
  if (!auditoriaB6Id) {
    const b6Key = derivedUuidV4('B7_REMESA_B6', `${input.idempotencyKey}:${remesaId}:${associationHash}`)
    const association: any = await confirmarAsociacionFacturasRemesaB6Tx(tx, actorId, {
      action: 'asociar_facturas', remesaId, facturaIdsISP: b6Facturas.map(item => item.id), confirmacion: true, idempotencyKey: b6Key,
      expectedRemesaTotalCentimos: remesa.totalCentimos, expectedRemesaHashSHA256: remesaSourceFingerprint(remesa), expectedFacturasHashSHA256: facturasSourceHash(b6Facturas),
    })
    auditoriaB6Id = String(association.auditoriaId)
  }
  if (!auditoriaB6Id) receiptFail(422, 'ASOCIACION_B6_INEXACTA', 'No se conserva una asociación B6 completa verificable.')
  // B6 may add its explicit membership for the first time in this same human
  // confirmation. Re-read it under the same locks; no inferred membership enters
  // the receipt plan, and a failed receipt rolls the association back as well.
  const associatedSources = await lockInvoiceSources(tx, [...allCompositionIds].sort())
  const plan = buildRemittanceReceiptPlan(proposal, associatedSources.filter(source => selectedCompositionIds.has(source.facturaEmitidaId)))
  await capacityAndDirectOverlap(tx, plan)
  const wrapper: any = await createDocumentoB4Tx(tx, actorId, { action: 'documento', tipoDocumento: 'REMESA', sourceId: String(remesaId) })
  const b4: any = await confirmarB4Tx(tx, actorId, {
    action: 'confirmar', confirmacion: true, idempotencyKey: `MFC:${input.idempotencyKey}:${remittanceReceiptHash(proposal.movimientoId).slice(0, 24)}`,
    version: proposal.versionB4,
    borrador: { movimientoId: proposal.movimientoId, importeMovimientoCentimos: plan.importeBancoCentimos, estado: 'JUSTIFICADO', lineas: [{ tipo: 'DOCUMENTO', documentoConciliableId: wrapper.documento.id, importeCentimos: plan.importeBancoCentimos }] },
  })
  if (b4.idempotente) receiptFail(409, 'B4_IDEMPOTENCY_EXTERNA', 'La confirmación B4 ya existe fuera del recibo versionado.')
  const link = await b4Link(tx, proposal.movimientoId, String(b4.operacion.id), remesaId, plan.importeBancoCentimos)
  const snapshotSolicitud = { schemaVersion: B7_REMESA_RECEIPT_SCHEMA_VERSION, confirmacionHumana: true, propuestaId: plan.propuestaId, movimientoId: plan.movimientoId, fingerprint: plan.proposalFingerprint, compositionHash: plan.compositionHash, remesaId }
  const snapshotResultado: Raw = { schemaVersion: B7_REMESA_RECEIPT_SCHEMA_VERSION, reciboId: null, remesaId, movimientoId: plan.movimientoId, vinculoB4Id: link.id, operacionB4Id: String(b4.operacion.id), auditoriaB6Id, importeCentimos: plan.importeBancoCentimos, facturas: plan.allocations.map(line => ({ facturaEmitidaId: line.facturaEmitidaId, facturaISPId: line.facturaISPId, importeCentimos: line.importeCentimos, compositionOrdinals: line.compositionOrdinals })) }
  const receiptId = await insertReceipt(tx, { actorId, idempotencyKey: input.idempotencyKey, requestHash: receiptHash, plan, vinculoB4Id: link.id, operacionB4Id: String(b4.operacion.id), auditoriaB6Id, snapshotSolicitud, snapshotResultado: { ...snapshotResultado, reciboId: undefined } })
  const detail = { origen: 'PROPUESTA_COBRO', confirmacionHumana: true, bulkKind: 'COBROS_CONFIRMACION', bulkKeyHash: input.keyHash, bulkRequestHash: input.requestHash, bloqueId: input.blockId, propuestaId: plan.propuestaId, generacionId: plan.generacionId, metodo: proposal.metodo, fingerprint: plan.proposalFingerprint, compositionHash: plan.compositionHash, reciboCobroRemesaB7Id: receiptId, schemaVersion: B7_REMESA_RECEIPT_SCHEMA_VERSION, rol: 'PRINCIPAL' }
  await tx.eventoJustificacionB4.create({ data: { operacionId: String(b4.operacion.id), movimientoId: plan.movimientoId, actorId, accion: 'APROBACION', detalle: detail } })
  return { idempotente: false as const, reciboId: receiptId, operationB4Id: String(b4.operacion.id), resultado: { ...snapshotResultado, reciboId: receiptId }, detail }
}

export async function confirmarReciboRemesaCompuesta(actorId: number, input: ConfirmarReciboRemesaCompuestaInput, db: PrismaClient = prisma as PrismaClient) {
  await assertFinanceRuntimeReady()
  return db.$transaction(tx => confirmarReciboRemesaCompuestaTx(tx, actorId, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 90_000 })
}
