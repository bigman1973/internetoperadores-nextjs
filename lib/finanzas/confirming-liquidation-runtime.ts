import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety'
import { requireB4ActorAccess } from '@/lib/finanzas/reconciliation-auth'
import { trustedImpersonationContextResolutionFromRequest, type SignedImpersonationContextResolution } from '@/lib/impersonation-context'
import {
  buildConfirmingLiquidationCandidates,
  type ConfirmingLiquidationB4Line,
  type ConfirmingLiquidationCandidate,
  type StoredLiquidationDocumentoB4,
  type StoredLiquidationFacturaEmitida,
  type StoredLiquidationMovimiento,
} from './confirming-liquidation-candidate-core'
import {
  CONFIRMING_LIQUIDATION_SCHEMA,
  type ConfirmingLiquidationEvidence,
  type ConfirmingLiquidationInvoiceLine,
  type ConfirmingLiquidationSourceDocument,
} from './confirming-liquidation-core'

/**
 * Runtime C11 de confirming.
 *
 * Sólo consume las tablas C11 ya persistidas y revalida sus identidades vivas
 * (FacturaEmitida, DocumentoConciliable/capacidad B4 y cuenta real del abono).
 * No importa loaders, parsers, Graph, OneDrive ni rutas aportadas por cliente.
 */

export type ConfirmingLiquidationQueryClient = Readonly<{
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>
  $executeRaw?: (query: Prisma.Sql) => Promise<unknown>
  $transaction?: <T>(fn: (tx: ConfirmingLiquidationQueryClient) => Promise<T>, options?: unknown) => Promise<T>
  [key: string]: unknown
}>

export type ReadConfirmingLiquidationCandidatesOptions = Readonly<{
  movimientoIds?: readonly string[]
  allRebuild?: boolean
  limit?: number
}>

export type ConfirmingLiquidationRuntimeCandidate = Readonly<{
  /** Discriminante para impedir que una liquidación C11 viaje por la senda C9. */
  evidenceSchema: 'C11' | 'C9_BLOQUEADO'
  id: string
  liquidacionId: string
  liquidacionVersion: number
  movimientoId: string
  confirmingId: string
  fechaDocumento: string | null
  fechaLiquidacion: string | null
  grupoBusqueda: 'GRUPO_DRAXTON'
  sociedadDocumento: string | null
  estado: ConfirmingLiquidationCandidate['estado'] | 'BLOQUEADO_EVIDENCIA_C11_AUSENTE'
  bloqueos: readonly string[]
  requiereConfirmacionHumana: true
  noEscrituras: true
  bancoDepositario: string | null
  cuentaDepositaria: string | null
  cuentaDepositariaId: string | null
  importeMovimientoCentimos: number
  totalFacturasCentimos: number | null
  totalInteresesExplicitosCentimos: number | null
  totalComisionesExplicitasCentimos: number | null
  totalIvaComisionCentimos: number | null
  totalLineasB4Centimos: number | null
  lineasB4: readonly ConfirmingLiquidationB4Line[]
  facturas: readonly Readonly<{
    confirmingLineaId: string
    facturaEmitidaId: string
    numeroDocumento: string
    numeroFacturaEmitida: string | null
    sociedadFactura: string | null
    importeCentimos: number | null
    fechaFactura: string | null
    documentoConciliableId: string | null
    restanteB4Centimos: number | null
  }>[]
  /** C11 nunca deriva gasto histórico ni reparte IVA entre facturas. */
  gastosFinancierosHistoricosIgnorados: false
  soportesIntereses: readonly []
  sourceHash: string
}>

export type ReadConfirmingLiquidationCandidatesResult = Readonly<{
  candidates: readonly ConfirmingLiquidationRuntimeCandidate[]
  documentosBloqueados: readonly []
  warningCodes: readonly string[]
  modo: 'LIMITADO' | 'ALL_REBUILD'
  movimientosLeidos: number
  movimientosTruncados: boolean
  noEscrituras: true
}>

export class ConfirmingLiquidationRuntimeError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}

export type ConfirmingLiquidationSupportResult = Readonly<{
  soporteId: string
  estado: 'CONFIRMADO' | 'REVOCADO'
  version: 1
  liquidacionId: string
  movimientoId: string
  operacionB4Id: string
  sourceHash: string
}>

const MAX_MOVEMENT_IDS = 100
const DEFAULT_MOVEMENT_LIMIT = 100
const MAX_ALL_REBUILD = 5_000
const MAX_LIQUIDATIONS = 1_000
const MAX_LINES = 10_000
const MAX_DOCUMENTS = 3_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ID = /^[A-Za-z0-9_.:-]{1,220}$/
const HASH = /^[a-f0-9]{64}$/

function fail(status: number, code: string, message: string): never {
  throw new ConfirmingLiquidationRuntimeError(status, code, message)
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  return normalized && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : null
}

function identifier(value: unknown, field: string): string {
  const parsed = text(value)
  if (!parsed || !ID.test(parsed)) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return parsed
}

function uuid(value: unknown, field: string): string {
  const parsed = text(value)
  if (!parsed || !UUID.test(parsed)) fail(400, 'VALIDATION_ERROR', `${field} debe ser UUID canónico.`)
  return parsed.toLowerCase()
}

function integer(value: unknown): number | null {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'bigint'
      ? Number(value)
      : typeof value === 'string' && /^-?\d+$/.test(value)
        ? Number(value)
        : NaN
  return Number.isSafeInteger(parsed) && Math.abs(parsed) <= 2_147_483_647 ? parsed : null
}

function isoDay(value: unknown): string | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10)
  return null
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  const parsed = typeof value === 'string'
    ? (() => { try { return JSON.parse(value) } catch { return null } })()
    : value
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  throw new Error('CONFIRMING_LIQUIDATION_RUNTIME_CANONICAL_INVALID')
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

function sameNullableText(left: unknown, right: unknown): boolean {
  return text(left) === text(right)
}

function withReadTransaction<T>(db: ConfirmingLiquidationQueryClient, fn: (tx: ConfirmingLiquidationQueryClient) => Promise<T>): Promise<T> {
  if (!db.$transaction) return fn(db)
  return db.$transaction(async (tx) => {
    if (tx.$executeRaw) await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`)
    return fn(tx)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20_000 })
}

function withWriteTransaction<T>(db: ConfirmingLiquidationQueryClient, fn: (tx: ConfirmingLiquidationQueryClient) => Promise<T>): Promise<T> {
  if (!db.$transaction) return fn(db)
  return db.$transaction((tx) => fn(tx), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 })
}

function uniqueMovementIds(values: readonly string[] | undefined): string[] {
  if (values === undefined) return []
  if (!Array.isArray(values) || values.length > MAX_MOVEMENT_IDS) {
    fail(400, 'MOVIMIENTOS_INVALIDOS', `movimientoIds admite como máximo ${MAX_MOVEMENT_IDS} identificadores.`)
  }
  return [...new Set(values.map((value) => identifier(value, 'movimientoIds')))].sort()
}

type RawLiquidation = {
  id: unknown
  confirmingId: unknown
  proveedorConfirming: unknown
  liquidacionKey: unknown
  version: unknown
  banco: unknown
  tipoDocumento: unknown
  estadoDocumental: unknown
  fechaLiquidacion: unknown
  cuentaDepositariaId: unknown
  nominalCentimos: unknown
  interesesCentimos: unknown
  comisionCentimos: unknown
  ivaComisionCentimos: unknown
  deduccionTotalCentimos: unknown
  netoBancarioCentimos: unknown
  sourceHash: unknown
  sourceSnapshot: unknown
}

type RawDocument = {
  liquidacionId: unknown
  facturaRecibidaId: unknown
  rol: unknown
  hashBinario: unknown
  procedencia: unknown
  archivoControladoId: unknown
  oneDriveDriveId: unknown
  oneDriveItemId: unknown
  nombreOriginal: unknown
}

type RawLine = {
  liquidacionId: unknown
  confirmingLineaId: unknown
  facturaEmitidaId: unknown
  numeroFactura: unknown
  nominalCentimos: unknown
  fechaEmision: unknown
  fechaVencimiento: unknown
  interesesExplicitosCentimos: unknown
  comisionExplicitaCentimos: unknown
}

type RawInvoice = {
  id: unknown
  numFactura: unknown
  cliente: unknown
  fecha: unknown
  totalCentimos: unknown
}

type RawB4 = {
  id: unknown
  facturaEmitidaId: unknown
  activo: unknown
  objetivoCentimos: unknown
  asignadoCentimos: unknown
}

type RawMovement = {
  id: unknown
  fecha: unknown
  cuentaId: unknown
  importeCentimos: unknown
  estadoB4: unknown
  banco: unknown
  cuenta: unknown
  concepto: unknown
  tercero: unknown
}

type PersistedLiquidation = Readonly<{
  id: string
  version: number
  proveedorConfirming: string | null
  evidence: ConfirmingLiquidationEvidence
}>

function invalidHash(): string {
  return '0'.repeat(64)
}

function sourceDocumentFromSnapshot(value: unknown): ConfirmingLiquidationSourceDocument | null {
  const row = jsonObject(value)
  if (!row) return null
  const id = text(row.id)
  const rol = row.rol
  const facturaRecibidaId = text(row.facturaRecibidaId)
  const hashBinario = text(row.hashBinario)
  const procedencia = row.procedencia
  const archivoControladoId = text(row.archivoControladoId)
  if (!id || (rol !== 'LIQUIDACION_PDF' && rol !== 'DETALLE_FACTURAS_XLS' && rol !== 'AVISO_CESION_PDF') || !facturaRecibidaId || !hashBinario || procedencia !== 'ARCHIVO_DESCARGADO_CONTROLADO' || !archivoControladoId) return null
  return {
    id,
    rol,
    facturaRecibidaId,
    hashBinario,
    procedencia,
    archivoControladoId,
    oneDriveDriveId: text(row.oneDriveDriveId),
    oneDriveItemId: text(row.oneDriveItemId),
    nombreOriginal: text(row.nombreOriginal),
  }
}

function lineFromSnapshot(value: unknown): ConfirmingLiquidationInvoiceLine | null {
  const row = jsonObject(value)
  if (!row) return null
  const id = text(row.id)
  const facturaEmitidaId = text(row.facturaEmitidaId)
  const numeroFactura = text(row.numeroFactura)
  if (!id || !facturaEmitidaId || !numeroFactura) return null
  const cents = (field: string): number | null => row[field] === null ? null : integer(row[field])
  return {
    id,
    confirmingLineaId: text(row.confirmingLineaId),
    facturaEmitidaId,
    numeroFactura,
    nominalCentimos: cents('nominalCentimos'),
    fechaEmision: isoDay(row.fechaEmision),
    // La fecha canónica es la FI registrada cuando el PDF/Excel no declara
    // emisión. La fecha que sí aparece en el detalle se conserva literalmente
    // como dato documental y no se reinterpreta para cuadrar identidades.
    fechaEmisionProcedencia: row.fechaEmisionProcedencia === 'FACTURA_EMITIDA_REGISTRADA'
      ? 'FACTURA_EMITIDA_REGISTRADA'
      : 'DOCUMENTO',
    fechaLineaDocumental: row.fechaLineaDocumental === null || row.fechaLineaDocumental === undefined
      ? null
      : isoDay(row.fechaLineaDocumental),
    fechaVencimiento: row.fechaVencimiento === null ? null : isoDay(row.fechaVencimiento),
    interesesExplicitosCentimos: cents('interesesExplicitosCentimos'),
    comisionExplicitaCentimos: cents('comisionExplicitaCentimos'),
  }
}

function documentMatchesPersisted(document: ConfirmingLiquidationSourceDocument, row: RawDocument): boolean {
  return document.facturaRecibidaId === text(row.facturaRecibidaId)
    && document.rol === row.rol
    && document.hashBinario === text(row.hashBinario)
    && document.procedencia === row.procedencia
    && document.archivoControladoId === text(row.archivoControladoId)
    && sameNullableText(document.oneDriveDriveId, row.oneDriveDriveId)
    && sameNullableText(document.oneDriveItemId, row.oneDriveItemId)
    && sameNullableText(document.nombreOriginal, row.nombreOriginal)
}

function lineMatchesPersisted(line: ConfirmingLiquidationInvoiceLine, row: RawLine): boolean {
  return sameNullableText(line.confirmingLineaId, row.confirmingLineaId)
    && line.facturaEmitidaId === text(row.facturaEmitidaId)
    && line.numeroFactura === text(row.numeroFactura)
    && line.nominalCentimos === integer(row.nominalCentimos)
    && line.fechaEmision === isoDay(row.fechaEmision)
    && line.fechaVencimiento === isoDay(row.fechaVencimiento)
    && line.interesesExplicitosCentimos === integer(row.interesesExplicitosCentimos)
    && line.comisionExplicitaCentimos === integer(row.comisionExplicitaCentimos)
}

/** Rebuilds the hashable C11 evidence only from its persisted snapshot plus its
 * relational rows. Any divergence becomes LIQUIDACION_HASH_INVALIDO downstream. */
function materializeEvidence(row: RawLiquidation, documents: readonly RawDocument[], lines: readonly RawLine[]): PersistedLiquidation | null {
  const id = text(row.id)
  const confirmingId = text(row.confirmingId)
  const liquidacionKey = text(row.liquidacionKey)
  const version = integer(row.version)
  if (!id || !confirmingId || !liquidacionKey || version === null || version < 1) return null
  const snapshot = jsonObject(row.sourceSnapshot)
  const snapshotDocuments = Array.isArray(snapshot?.documentos) ? snapshot!.documentos.map(sourceDocumentFromSnapshot) : []
  const snapshotLines = Array.isArray(snapshot?.lineas) ? snapshot!.lineas.map(lineFromSnapshot) : []
  const documentsValid = snapshotDocuments.length === documents.length
    && snapshotDocuments.every((document) => document !== null)
    && new Set(snapshotDocuments.filter(Boolean).map((document) => document!.rol)).size === snapshotDocuments.length
    && snapshotDocuments.filter(Boolean).every((document) => documents.some((persisted) => documentMatchesPersisted(document!, persisted)))
  const linesValid = snapshotLines.length === lines.length
    && snapshotLines.every((line) => line !== null)
    && new Set(snapshotLines.filter(Boolean).map((line) => line!.facturaEmitidaId)).size === snapshotLines.length
    && snapshotLines.filter(Boolean).every((line) => lines.some((persisted) => lineMatchesPersisted(line!, persisted)))
  const banco = row.banco === 'BBVA' || row.banco === 'CAIXABANK' ? row.banco : 'BBVA'
  const tipoDocumento = row.tipoDocumento === 'LIQUIDACION' || row.tipoDocumento === 'AVISO_CESION' ? row.tipoDocumento : 'AVISO_CESION'
  const estadoDocumental = row.estadoDocumental === 'CUADRA' || row.estadoDocumental === 'REQUIERE_REVISION_DOCUMENTAL'
    ? row.estadoDocumental
    : 'REQUIERE_REVISION_DOCUMENTAL'
  const databaseHash = text(row.sourceHash)
  const snapshotHash = text(snapshot?.sourceHash)
  const rootConsistent = snapshot?.schema === CONFIRMING_LIQUIDATION_SCHEMA
    && snapshot?.liquidacionKey === liquidacionKey
    && snapshot?.confirmingId === confirmingId
    && snapshotHash === databaseHash
  const evidence: ConfirmingLiquidationEvidence = {
    id: liquidacionKey,
    confirmingId,
    banco,
    tipoDocumento,
    estadoDocumental,
    fechaLiquidacion: isoDay(row.fechaLiquidacion),
    cuentaDepositariaId: text(row.cuentaDepositariaId),
    documentos: snapshotDocuments.filter((item): item is ConfirmingLiquidationSourceDocument => item !== null),
    nominalCentimos: integer(row.nominalCentimos),
    interesesCentimos: integer(row.interesesCentimos),
    comisionCentimos: integer(row.comisionCentimos),
    ivaComisionCentimos: integer(row.ivaComisionCentimos),
    deduccionTotalCentimos: row.deduccionTotalCentimos === null ? null : integer(row.deduccionTotalCentimos),
    netoBancarioCentimos: integer(row.netoBancarioCentimos),
    lineas: snapshotLines.filter((item): item is ConfirmingLiquidationInvoiceLine => item !== null),
    sourceHash: documentsValid && linesValid && rootConsistent && databaseHash && HASH.test(databaseHash) ? databaseHash : invalidHash(),
  }
  return { id, version, proveedorConfirming: text(row.proveedorConfirming), evidence }
}

async function readPersistedEvidence(tx: ConfirmingLiquidationQueryClient): Promise<PersistedLiquidation[]> {
  const liquidations = await tx.$queryRaw<RawLiquidation[]>(Prisma.sql`
    WITH ranked AS (
      SELECT l.*
      FROM liquidaciones_confirming_documentales l
      WHERE NOT EXISTS (
        SELECT 1 FROM liquidaciones_confirming_documentales newer
        WHERE newer.confirming_id=l.confirming_id AND newer.liquidacion_key=l.liquidacion_key AND newer.version>l.version
      )
    )
    SELECT ranked.id::text AS id,ranked.confirming_id AS "confirmingId",fr.proveedor AS "proveedorConfirming",ranked.liquidacion_key AS "liquidacionKey",ranked.version,
      ranked.banco::text AS banco,ranked.tipo_documento::text AS "tipoDocumento",ranked.estado_documental::text AS "estadoDocumental",
      ranked.fecha_liquidacion::date::text AS "fechaLiquidacion",ranked.cuenta_depositaria_id AS "cuentaDepositariaId",
      ranked.nominal_centimos AS "nominalCentimos",ranked.intereses_centimos AS "interesesCentimos",ranked.comision_centimos AS "comisionCentimos",
      ranked.iva_comision_centimos AS "ivaComisionCentimos",ranked.deduccion_total_centimos AS "deduccionTotalCentimos",
      ranked.neto_bancario_centimos AS "netoBancarioCentimos",ranked.fuente_hash AS "sourceHash",ranked.fuente_snapshot AS "sourceSnapshot"
    FROM ranked JOIN facturas_recibidas fr ON fr.id=ranked.confirming_id
    ORDER BY ranked.confirming_id ASC,ranked.liquidacion_key ASC,ranked.id ASC
    LIMIT ${MAX_LIQUIDATIONS + 1}
  `)
  if (liquidations.length > MAX_LIQUIDATIONS) fail(409, 'LIQUIDACIONES_C11_TRUNCADAS', 'La población C11 supera el límite seguro de lectura.')
  if (!liquidations.length) return []
  const ids = liquidations.map((row) => uuid(row.id, 'liquidacionId'))
  const [documents, lines] = await Promise.all([
    tx.$queryRaw<RawDocument[]>(Prisma.sql`
      SELECT liquidacion_id::text AS "liquidacionId",factura_recibida_id AS "facturaRecibidaId",rol::text AS rol,
        hash_binario AS "hashBinario",procedencia::text AS procedencia,archivo_controlado_id AS "archivoControladoId",
        onedrive_drive_id AS "oneDriveDriveId",onedrive_item_id AS "oneDriveItemId",nombre_original AS "nombreOriginal"
      FROM documentos_liquidacion_confirming
      WHERE liquidacion_id IN (${Prisma.join(ids.map((value) => Prisma.sql`CAST(${value} AS uuid)`))})
      ORDER BY liquidacion_id ASC,rol ASC
      LIMIT ${MAX_DOCUMENTS + 1}
    `),
    tx.$queryRaw<RawLine[]>(Prisma.sql`
      SELECT liquidacion_id::text AS "liquidacionId",confirming_linea_id AS "confirmingLineaId",factura_emitida_id AS "facturaEmitidaId",
        numero_factura AS "numeroFactura",nominal_centimos AS "nominalCentimos",fecha_emision::date::text AS "fechaEmision",
        fecha_vencimiento::date::text AS "fechaVencimiento",intereses_explicitos_centimos AS "interesesExplicitosCentimos",
        comision_explicita_centimos AS "comisionExplicitaCentimos"
      FROM lineas_liquidacion_confirming
      WHERE liquidacion_id IN (${Prisma.join(ids.map((value) => Prisma.sql`CAST(${value} AS uuid)`))})
      ORDER BY liquidacion_id ASC,id ASC
      LIMIT ${MAX_LINES + 1}
    `),
  ])
  if (documents.length > MAX_DOCUMENTS || lines.length > MAX_LINES) fail(409, 'LIQUIDACIONES_C11_TRUNCADAS', 'El detalle C11 supera el límite seguro de lectura.')
  return liquidations.flatMap((row) => materializeEvidence(
    row,
    documents.filter((document) => text(document.liquidacionId) === text(row.id)),
    lines.filter((line) => text(line.liquidacionId) === text(row.id)),
  ) ?? [])
}

async function readLiveInvoicesAndB4(tx: ConfirmingLiquidationQueryClient, evidence: readonly PersistedLiquidation[]) {
  const invoiceIds = [...new Set(evidence.flatMap((item) => item.evidence.lineas.map((line) => line.facturaEmitidaId)))].sort()
  if (!invoiceIds.length) return { invoices: [] as StoredLiquidationFacturaEmitida[], b4: [] as StoredLiquidationDocumentoB4[], invoiceDetails: new Map<string, { numFactura: string; cliente: string | null; fecha: string | null; totalCentimos: number | null }>() }
  const [invoiceRows, b4Rows] = await Promise.all([
    tx.$queryRaw<RawInvoice[]>(Prisma.sql`
      SELECT fe.id,fe.num_factura AS "numFactura",fe.cliente,fe.fecha::date::text AS fecha,
        (fe.total::text::numeric*100)::bigint AS "totalCentimos"
      FROM facturas_emitidas fe
      WHERE fe.id IN (${Prisma.join(invoiceIds.map((value) => Prisma.sql`${value}`))})
      ORDER BY fe.id ASC
      LIMIT ${invoiceIds.length + 1}
    `),
    tx.$queryRaw<RawB4[]>(Prisma.sql`
      SELECT d.id::text AS id,d.factura_emitida_id AS "facturaEmitidaId",d.activo,
        d.importe_objetivo_centimos AS "objetivoCentimos",
        COALESCE(SUM(v.importe_centimos) FILTER (WHERE v.activo),0)::bigint AS "asignadoCentimos"
      FROM documentos_conciliables d
      LEFT JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id
      WHERE d.tipo='FACTURA_EMITIDA'::"TipoDocumentoConciliable"
        AND d.factura_emitida_id IN (${Prisma.join(invoiceIds.map((value) => Prisma.sql`${value}`))})
      GROUP BY d.id
      ORDER BY d.id ASC
      LIMIT ${invoiceIds.length + 1}
    `),
  ])
  if (invoiceRows.length > invoiceIds.length || b4Rows.length > invoiceIds.length) fail(409, 'FUENTE_C11_TRUNCADA', 'La fuente de facturas C11 superó el límite seguro.')
  const invoiceDetails = new Map<string, { numFactura: string; cliente: string | null; fecha: string | null; totalCentimos: number | null }>()
  const invoices: StoredLiquidationFacturaEmitida[] = []
  for (const row of invoiceRows) {
    const id = text(row.id), numFactura = text(row.numFactura)
    if (!id || !numFactura) continue
    const detail = { numFactura, cliente: text(row.cliente), fecha: isoDay(row.fecha), totalCentimos: integer(row.totalCentimos) }
    invoiceDetails.set(id, detail)
    invoices.push({ id, numFactura, fecha: detail.fecha, totalCentimos: detail.totalCentimos })
  }
  const b4: StoredLiquidationDocumentoB4[] = b4Rows.flatMap((row) => {
    const id = text(row.id), facturaEmitidaId = text(row.facturaEmitidaId)
    const objetivoCentimos = row.objetivoCentimos === null ? null : integer(row.objetivoCentimos)
    const asignadoCentimos = integer(row.asignadoCentimos)
    return id && facturaEmitidaId && asignadoCentimos !== null
      ? [{ id, facturaEmitidaId, activo: row.activo === true, objetivoCentimos, asignadoCentimos }]
      : []
  })
  return { invoices, b4, invoiceDetails }
}

async function readMovements(tx: ConfirmingLiquidationQueryClient, options: ReadConfirmingLiquidationCandidatesOptions): Promise<{ movements: StoredLiquidationMovimiento[]; details: Map<string, { banco: string | null; cuenta: string | null; concepto: string | null; tercero: string | null }>; modo: 'LIMITADO' | 'ALL_REBUILD'; truncados: boolean }> {
  const selectedIds = uniqueMovementIds(options.movimientoIds)
  if (selectedIds.length && options.allRebuild) fail(400, 'MODO_LECTURA_AMBIGUO', 'No se puede combinar movimientoIds con allRebuild.')
  const limit = options.allRebuild
    ? MAX_ALL_REBUILD
    : selectedIds.length || options.limit === undefined
      ? (selectedIds.length || DEFAULT_MOVEMENT_LIMIT)
      : options.limit
  if (!Number.isInteger(limit) || limit < 1 || limit > (options.allRebuild ? MAX_ALL_REBUILD : DEFAULT_MOVEMENT_LIMIT)) {
    fail(400, 'LIMITE_INVALIDO', 'El límite de movimientos no es válido.')
  }
  const where = selectedIds.length
    ? Prisma.sql`m.id IN (${Prisma.join(selectedIds.map((value) => Prisma.sql`${value}`))})`
    : Prisma.sql`COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO' AND m.importe>0`
  const rows = await tx.$queryRaw<RawMovement[]>(Prisma.sql`
    SELECT m.id,m.fecha_operacion::date::text AS fecha,m.cuenta_id AS "cuentaId",
      (m.importe::text::numeric*100)::bigint AS "importeCentimos",COALESCE(e.estado::text,'SIN_DOCUMENTO') AS "estadoB4",
      cb.banco,cb.alias AS cuenta,m.concepto,m.tercero
    FROM movimientos_bancarios m
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    LEFT JOIN cuentas_bancarias cb ON cb.id=m.cuenta_id
    WHERE ${where}
    ORDER BY m.fecha_operacion::date DESC,m.id ASC
    LIMIT ${limit + 1}
  `)
  const truncados = rows.length > limit
  const details = new Map<string, { banco: string | null; cuenta: string | null; concepto: string | null; tercero: string | null }>()
  const movements: StoredLiquidationMovimiento[] = []
  for (const row of rows.slice(0, limit)) {
    const id = text(row.id), fecha = isoDay(row.fecha), importeCentimos = integer(row.importeCentimos)
    if (!id || !fecha || importeCentimos === null) continue
    const estadoB4 = row.estadoB4 === 'SIN_DOCUMENTO' || row.estadoB4 === 'JUSTIFICADO' || row.estadoB4 === 'NO_REQUIERE' ? row.estadoB4 : 'DESCONOCIDO'
    movements.push({ id, fecha, cuentaId: text(row.cuentaId), importeCentimos, estadoB4 })
    details.set(id, { banco: text(row.banco), cuenta: text(row.cuenta), concepto: text(row.concepto), tercero: text(row.tercero) })
  }
  return { movements, details, modo: options.allRebuild ? 'ALL_REBUILD' : 'LIMITADO', truncados }
}

function asRuntimeCandidate(input: {
  candidate: ConfirmingLiquidationCandidate
  persisted: PersistedLiquidation
  movementDetails: { banco: string | null; cuenta: string | null; concepto: string | null; tercero: string | null } | undefined
  invoiceDetails: ReadonlyMap<string, { numFactura: string; cliente: string | null; fecha: string | null; totalCentimos: number | null }>
}): ConfirmingLiquidationRuntimeCandidate {
  const { candidate, persisted, movementDetails, invoiceDetails } = input
  const b4DocumentByInvoice = new Map(candidate.lineasB4.flatMap((line) => line.tipo === 'DOCUMENTO' ? [[line.facturaEmitidaId, line] as const] : []))
  return {
    evidenceSchema: 'C11',
    id: candidate.id,
    liquidacionId: persisted.id,
    liquidacionVersion: persisted.version,
    movimientoId: candidate.movimientoId,
    confirmingId: candidate.confirmingId,
    fechaDocumento: candidate.fechaLiquidacion,
    fechaLiquidacion: candidate.fechaLiquidacion,
    grupoBusqueda: 'GRUPO_DRAXTON',
    sociedadDocumento: persisted.proveedorConfirming,
    estado: candidate.estado,
    bloqueos: candidate.bloqueos,
    requiereConfirmacionHumana: true,
    noEscrituras: true,
    bancoDepositario: movementDetails?.banco ?? null,
    cuentaDepositaria: movementDetails?.cuenta ?? null,
    cuentaDepositariaId: candidate.cuentaDepositariaId,
    importeMovimientoCentimos: candidate.importeMovimientoCentimos,
    totalFacturasCentimos: candidate.nominalCentimos,
    totalInteresesExplicitosCentimos: candidate.interesesCentimos,
    totalComisionesExplicitasCentimos: candidate.comisionCentimos,
    totalIvaComisionCentimos: candidate.ivaComisionCentimos,
    totalLineasB4Centimos: candidate.totalLineasB4Centimos,
    lineasB4: candidate.lineasB4,
    facturas: persisted.evidence.lineas.map((line) => {
      const invoice = invoiceDetails.get(line.facturaEmitidaId)
      const b4 = b4DocumentByInvoice.get(line.facturaEmitidaId)
      return {
        confirmingLineaId: line.confirmingLineaId ?? `c11:${persisted.id}:${line.id}`,
        facturaEmitidaId: line.facturaEmitidaId,
        numeroDocumento: line.numeroFactura,
        numeroFacturaEmitida: invoice?.numFactura ?? null,
        sociedadFactura: invoice?.cliente ?? null,
        importeCentimos: line.nominalCentimos,
        fechaFactura: invoice?.fecha ?? null,
        documentoConciliableId: b4?.documentoConciliableId ?? null,
        restanteB4Centimos: b4 ? line.nominalCentimos : null,
      }
    }),
    gastosFinancierosHistoricosIgnorados: false,
    soportesIntereses: [],
    sourceHash: candidate.sourceHash,
  }
}

function civilDay(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? Math.floor(date.getTime() / 86_400_000) : null
}

function confirmingSignal(value: string | null): boolean {
  if (!value) return false
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES')
  return /\bCONFIRMING\b/.test(normalized) || /\bDRAXTON\b/.test(normalized)
}

/** The candidate core deliberately returns its movement × liquidation matrix for
 * diagnostics. Exposing it directly would make every archived settlement an
 * amber option for every credit. A public C11 candidate is therefore limited to
 * either the exact documented account/net pair (date blockers remain visible),
 * or an in-window review lead on that same account with a confirming or Draxton
 * signal from the bank record. No difference is accepted or absorbed as a fee. */
export function isRelevantC11LiquidationCandidate(candidate: ConfirmingLiquidationCandidate, movement: StoredLiquidationMovimiento, detail: { banco: string | null; cuenta: string | null; concepto: string | null; tercero: string | null } | undefined): boolean {
  const sameAccount = candidate.cuentaDepositariaId !== null && candidate.cuentaDepositariaId === movement.cuentaId
  const exactNet = candidate.netoBancarioCentimos !== null && candidate.netoBancarioCentimos === movement.importeCentimos
  if (sameAccount && exactNet) return true
  const settlementDay = civilDay(candidate.fechaLiquidacion)
  const movementDay = civilDay(movement.fecha)
  const inWindow = settlementDay !== null && movementDay !== null && movementDay >= settlementDay && movementDay - settlementDay <= 4
  return sameAccount && inWindow && (confirmingSignal(detail?.concepto ?? null) || confirmingSignal(detail?.tercero ?? null))
}

function ambiguousC11Candidate(movement: StoredLiquidationMovimiento, detail: { banco: string | null; cuenta: string | null; concepto: string | null; tercero: string | null } | undefined, choices: readonly ConfirmingLiquidationRuntimeCandidate[]): ConfirmingLiquidationRuntimeCandidate {
  const first = [...choices].sort((left, right) => left.liquidacionId.localeCompare(right.liquidacionId))[0]!
  return {
    ...first,
    id: `confirming-liquidation:ambiguous:${movement.id}`,
    // Synthetic opaque IDs cannot resolve to a source document or pass the
    // live-action gate. They deliberately prevent arbitrary .find() selection.
    confirmingId: 'C11_AMBIGUO',
    liquidacionId: 'C11_AMBIGUO',
    liquidacionVersion: 0,
    fechaDocumento: null,
    fechaLiquidacion: null,
    sociedadDocumento: null,
    estado: 'REQUIERE_REVISION_AMBIGUEDAD',
    bloqueos: [...new Set(choices.flatMap((choice) => choice.bloqueos).concat(['LIQUIDACIONES_C11_RELEVANTES_MULTIPLES']))].sort(),
    bancoDepositario: detail?.banco ?? null,
    cuentaDepositaria: detail?.cuenta ?? null,
    cuentaDepositariaId: movement.cuentaId,
    totalFacturasCentimos: null,
    totalInteresesExplicitosCentimos: null,
    totalComisionesExplicitasCentimos: null,
    totalIvaComisionCentimos: null,
    totalLineasB4Centimos: null,
    lineasB4: [],
    facturas: [],
    sourceHash: invalidHash(),
  }
}

function selectCandidatesByMovement(input: Readonly<{
  coreCandidates: readonly ConfirmingLiquidationCandidate[]
  persistedByEvidence: ReadonlyMap<string, PersistedLiquidation>
  movements: readonly StoredLiquidationMovimiento[]
  details: ReadonlyMap<string, { banco: string | null; cuenta: string | null; concepto: string | null; tercero: string | null }>
  invoiceDetails: ReadonlyMap<string, { numFactura: string; cliente: string | null; fecha: string | null; totalCentimos: number | null }>
}>): ConfirmingLiquidationRuntimeCandidate[] {
  const movementById = new Map(input.movements.map((movement) => [movement.id, movement]))
  const relevantByMovement = new Map<string, ConfirmingLiquidationRuntimeCandidate[]>()
  for (const candidate of input.coreCandidates) {
    const movement = movementById.get(candidate.movimientoId)
    const detail = movement ? input.details.get(movement.id) : undefined
    if (!movement || !isRelevantC11LiquidationCandidate(candidate, movement, detail)) continue
    const persisted = input.persistedByEvidence.get(`${candidate.confirmingId}\u0000${candidate.liquidacionId}\u0000${candidate.sourceHash}`)
    if (!persisted) continue
    const runtime = asRuntimeCandidate({ candidate, persisted, movementDetails: detail, invoiceDetails: input.invoiceDetails })
    relevantByMovement.set(movement.id, [...(relevantByMovement.get(movement.id) ?? []), runtime])
  }
  const selected: ConfirmingLiquidationRuntimeCandidate[] = []
  for (const movement of input.movements) {
    const choices = relevantByMovement.get(movement.id) ?? []
    if (!choices.length) continue
    const green = choices.filter((choice) => choice.estado === 'LISTO_PARA_CONFIRMACION_B4')
    if (green.length === 1) {
      selected.push(green[0]!)
    } else if (green.length > 1 || choices.length > 1) {
      selected.push(ambiguousC11Candidate(movement, input.details.get(movement.id), choices))
    } else {
      selected.push(choices[0]!)
    }
  }
  return selected.sort((left, right) => left.movimientoId.localeCompare(right.movimientoId) || left.id.localeCompare(right.id))
}

export async function readConfirmingLiquidationCandidates(
  db: ConfirmingLiquidationQueryClient,
  options: ReadConfirmingLiquidationCandidatesOptions = {},
): Promise<ReadConfirmingLiquidationCandidatesResult> {
  return withReadTransaction(db, async (tx) => {
    const [hasC11, movementRead] = await Promise.all([c11TablesExist(tx), readMovements(tx, options)])
    // A single-row revalidation must not hide another pending credit matching
    // the same settlement. The returned scope remains the requested one, while
    // uniqueness is checked against the complete bounded live population.
    const universe = options.allRebuild ? movementRead : await readMovements(tx, { allRebuild: true })
    const requestedIds = new Set(movementRead.movements.map(movement => movement.id))
    const allMovements = [...new Map([...universe.movements, ...movementRead.movements].map(movement => [movement.id, movement])).values()]
    const allDetails = new Map([...universe.details, ...movementRead.details])
    if (!hasC11) {
      return {
        candidates: [],
        documentosBloqueados: [],
        warningCodes: ['C11_MIGRACION_PENDIENTE', 'C9_LEGACY_NO_CONFIRMABLE_SIN_EVIDENCIA_C11'],
        modo: movementRead.modo,
        movimientosLeidos: movementRead.movements.length,
        movimientosTruncados: movementRead.truncados,
        noEscrituras: true,
      }
    }
    const persisted = await readPersistedEvidence(tx)
    const { invoices, b4, invoiceDetails } = await readLiveInvoicesAndB4(tx, persisted)
    const evidence = persisted.map((item) => {
      const fiChanged = item.evidence.lineas.some((line) => line.fechaEmision !== invoiceDetails.get(line.facturaEmitidaId)?.fecha)
      // C11 admite la fecha FI como fuente canónica y conserva la fecha literal
      // de XLS por separado. Si la FI se modifica después de la carga, no se
      // reescribe la evidencia: se invalida su hash local y queda ámbar.
      return fiChanged ? { ...item, evidence: { ...item.evidence, sourceHash: invalidHash() } } : item
    })
    const core = buildConfirmingLiquidationCandidates({
      liquidaciones: evidence.map((item) => item.evidence),
      facturasEmitidas: invoices,
      documentosB4: b4,
      movimientos: allMovements,
    })
    const byEvidenceKey = new Map(evidence.map((item) => [`${item.evidence.confirmingId}\u0000${item.evidence.id}\u0000${item.evidence.sourceHash}`, item]))
    const candidates = selectCandidatesByMovement({
      coreCandidates: core.candidates,
      persistedByEvidence: byEvidenceKey,
      movements: allMovements,
      details: allDetails,
      invoiceDetails,
    }).filter(candidate => requestedIds.has(candidate.movimientoId)).map(candidate => universe.truncados
      ? { ...candidate, estado: 'REQUIERE_REVISION_DOCUMENTAL' as const, bloqueos: [...candidate.bloqueos, 'UNIVERSO_BANCARIO_C11_TRUNCADO'], lineasB4: [] }
      : candidate)
    return {
      candidates,
      documentosBloqueados: [],
      warningCodes: [...core.warningCodes, 'C11_SOLO_EVIDENCIA_PERSISTIDA_CURRENT_LATEST', 'C9_LEGACY_NO_CONFIRMABLE_SIN_EVIDENCIA_C11'],
      modo: movementRead.modo,
      movimientosLeidos: allMovements.length,
      movimientosTruncados: movementRead.truncados || universe.truncados,
      noEscrituras: true,
    }
  })
}

async function assertLiveFinanceWriter(tx: ConfirmingLiquidationQueryClient, actorId: number): Promise<void> {
  const access = await requireB4ActorAccess(actorId, 'escritura', tx as unknown as Prisma.TransactionClient)
  if (!access.ok) fail(403, 'PERMISO_REVOCADO', 'Sin permiso financiero de escritura.')
}

export function c11AuditActors(actorId: number, resolution: SignedImpersonationContextResolution): Readonly<{ actorRealId: number; actorEfectivoId: number }> {
  if (resolution.status === 'invalid' || (resolution.status === 'valid' && resolution.context.targetId !== actorId)) {
    fail(403, 'CONTEXTO_ACTUACION_C11_INVALIDO', 'La identidad efectiva de la auditoría confirming no coincide con la sesión firmada.')
  }
  return { actorRealId: resolution.status === 'valid' ? resolution.context.actorId : actorId, actorEfectivoId: actorId }
}

function supportResultSnapshot(result: ConfirmingLiquidationSupportResult): Record<string, unknown> {
  return { schema: CONFIRMING_LIQUIDATION_SCHEMA, ...result }
}

function parseSupportResult(value: unknown): ConfirmingLiquidationSupportResult | null {
  const row = jsonObject(value)
  const soporteId = text(row?.soporteId)
  const liquidacionId = text(row?.liquidacionId)
  const movimientoId = text(row?.movimientoId)
  const operacionB4Id = text(row?.operacionB4Id)
  const sourceHash = text(row?.sourceHash)
  if (!soporteId || !UUID.test(soporteId) || !liquidacionId || !UUID.test(liquidacionId) || !movimientoId || !operacionB4Id || !UUID.test(operacionB4Id) || !sourceHash || !HASH.test(sourceHash) || (row?.estado !== 'CONFIRMADO' && row?.estado !== 'REVOCADO') || row?.version !== 1) return null
  return { soporteId, estado: row.estado, version: 1, liquidacionId, movimientoId, operacionB4Id, sourceHash }
}

async function c11TablesExist(tx: ConfirmingLiquidationQueryClient): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ supportTable: string | null }>>(Prisma.sql`
    SELECT to_regclass('public.soportes_liquidacion_confirming')::text AS "supportTable"
  `)
  return rows.length === 1 && rows[0]?.supportTable === 'soportes_liquidacion_confirming'
}

type LiveLiquidationSupport = {
  liquidacionId: string
  confirmingId: string
  liquidacionKey: string
  version: number
  sourceHash: string
  movimientoId: string
  operacionB4Id: string
  interesesCentimos: number
  comisionCentimos: number
  ivaComisionCentimos: number
}

async function readLiveLiquidationForSupport(tx: ConfirmingLiquidationQueryClient, input: { liquidacionId: string; movimientoId: string; operacionB4Id: string; sourceHash: string }): Promise<LiveLiquidationSupport> {
  const rows = await tx.$queryRaw<Array<{
    liquidacionId: string; confirmingId: string; liquidacionKey: string; version: unknown; sourceHash: string; movimientoId: string; operacionB4Id: string
    interesesCentimos: unknown; comisionCentimos: unknown; ivaComisionCentimos: unknown
  }>>(Prisma.sql`
    SELECT l.id::text AS "liquidacionId",l.confirming_id AS "confirmingId",l.liquidacion_key AS "liquidacionKey",l.version,
      l.fuente_hash AS "sourceHash",o.movimiento_id AS "movimientoId",o.id::text AS "operacionB4Id",
      l.intereses_centimos AS "interesesCentimos",l.comision_centimos AS "comisionCentimos",l.iva_comision_centimos AS "ivaComisionCentimos"
    FROM liquidaciones_confirming_documentales l
    JOIN operaciones_justificacion_b4 o ON o.id=CAST(${input.operacionB4Id} AS uuid)
    JOIN movimientos_bancarios m ON m.id=o.movimiento_id
    WHERE l.id=CAST(${input.liquidacionId} AS uuid)
      AND l.fuente_hash=${input.sourceHash}
      AND o.movimiento_id=${input.movimientoId}
      AND m.cuenta_id=l.cuenta_depositaria_id
      AND (m.importe::text::numeric*100)::bigint=l.neto_bancario_centimos
      AND m.fecha_operacion::date>=l.fecha_liquidacion
      AND m.fecha_operacion::date<=l.fecha_liquidacion+4
      AND NOT EXISTS (
        SELECT 1
        FROM lineas_liquidacion_confirming x
        LEFT JOIN facturas_emitidas fe ON fe.id=x.factura_emitida_id
        WHERE x.liquidacion_id=l.id
          AND (fe.id IS NULL OR btrim(fe.num_factura)<>btrim(x.numero_factura)
            OR fe.fecha::date<>x.fecha_emision
            OR (fe.total::text::numeric*100)::bigint<>x.nominal_centimos)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM documentos_liquidacion_confirming d
        LEFT JOIN facturas_recibidas fr ON fr.id=d.factura_recibida_id
        WHERE d.liquidacion_id=l.id
          AND (fr.id IS NULL OR (COALESCE(fr.onedrive_item_id,'')='' AND COALESCE(fr.archivo_onedrive,'')='' AND COALESCE(fr.archivo_url,'')=''))
      )
      AND NOT EXISTS (
        SELECT 1 FROM liquidaciones_confirming_documentales newer
        WHERE newer.confirming_id=l.confirming_id AND newer.liquidacion_key=l.liquidacion_key AND newer.version>l.version
      )
    LIMIT 2 FOR KEY SHARE OF l,o
  `)
  const row = rows[0]
  const version = integer(row?.version)
  const interesesCentimos = integer(row?.interesesCentimos)
  const comisionCentimos = integer(row?.comisionCentimos)
  const ivaComisionCentimos = integer(row?.ivaComisionCentimos)
  if (rows.length !== 1 || !row || version === null || version < 1 || interesesCentimos === null || interesesCentimos < 0 || comisionCentimos === null || comisionCentimos < 0 || ivaComisionCentimos === null || ivaComisionCentimos < 0) {
    fail(409, 'EVIDENCIA_C11_CAMBIADA', 'La liquidación confirming C11 ya no es la versión vigente o no conserva su cierre documental.')
  }
  return {
    liquidacionId: row.liquidacionId,
    confirmingId: row.confirmingId,
    liquidacionKey: row.liquidacionKey,
    version,
    sourceHash: row.sourceHash,
    movimientoId: row.movimientoId,
    operacionB4Id: row.operacionB4Id,
    interesesCentimos,
    comisionCentimos,
    ivaComisionCentimos,
  }
}

async function differenceLinks(tx: ConfirmingLiquidationQueryClient, input: LiveLiquidationSupport): Promise<{ intereses: string | null; comision: string | null; iva: string | null; lineasB4: readonly Record<string, unknown>[] }> {
  const rows = await tx.$queryRaw<Array<{ id: string; motivo: string; importeCentimos: unknown }>>(Prisma.sql`
    SELECT id::text AS id,motivo_diferencia::text AS motivo,importe_centimos AS "importeCentimos"
    FROM vinculos_movimiento_documento
    WHERE operacion_creacion_id=CAST(${input.operacionB4Id} AS uuid)
      AND movimiento_id=${input.movimientoId}
      AND activo=true
      AND tipo_linea='DIFERENCIA'::"TipoLineaVinculo"
    ORDER BY motivo_diferencia::text ASC,id ASC
    LIMIT 4 FOR KEY SHARE
  `)
  const expected = new Map<string, number>([
    ['INTERESES', input.interesesCentimos],
    ['COMISION', input.comisionCentimos],
    ['IVA_COMISION', input.ivaComisionCentimos],
  ])
  const links = new Map<string, string>()
  for (const row of rows) {
    const amount = integer(row.importeCentimos)
    const expectedAmount = expected.get(row.motivo)
    if (!row.id || expectedAmount === undefined || expectedAmount <= 0 || amount !== -expectedAmount || links.has(row.motivo)) {
      fail(409, 'SOPORTE_C11_DIFERENCIAS_CAMBIADAS', 'Las deducciones B4 ya no coinciden exactamente con la liquidación C11.')
    }
    links.set(row.motivo, row.id)
  }
  for (const [motivo, amount] of expected) {
    if ((amount > 0) !== links.has(motivo)) {
      fail(409, 'SOPORTE_C11_DIFERENCIAS_CAMBIADAS', 'Falta o sobra una deducción B4 explícita de la liquidación C11.')
    }
  }
  return {
    intereses: links.get('INTERESES') ?? null,
    comision: links.get('COMISION') ?? null,
    iva: links.get('IVA_COMISION') ?? null,
    lineasB4: rows.map((row) => ({ tipo: 'DIFERENCIA', motivoDiferencia: row.motivo, importeCentimos: integer(row.importeCentimos) })),
  }
}

export async function applyDocumentedConfirmingLiquidationSupport(
  db: ConfirmingLiquidationQueryClient,
  actorId: number,
  input: Readonly<{ liquidacionId: string; movimientoId: string; operacionB4Id: string; sourceHash: string; idempotencyKey: string }>,
): Promise<Readonly<{ idempotente: boolean; resultado: ConfirmingLiquidationSupportResult }>> {
  const safe = {
    liquidacionId: uuid(input.liquidacionId, 'liquidacionId'),
    movimientoId: identifier(input.movimientoId, 'movimientoId'),
    operacionB4Id: uuid(input.operacionB4Id, 'operacionB4Id'),
    sourceHash: text(input.sourceHash),
    idempotencyKey: uuid(input.idempotencyKey, 'idempotencyKey'),
  }
  if (!safe.sourceHash || !HASH.test(safe.sourceHash)) fail(400, 'FUENTE_C11_NO_REVISADA', 'El hash C11 no es válido.')
  const auditActors = c11AuditActors(actorId, await trustedImpersonationContextResolutionFromRequest())
  const payloadHash = sha256({ schema: 'C11_CONFIRMING_SUPPORT_APPLY_V1', actorId, auditActors, input: safe })
  return withWriteTransaction(db, async (tx) => {
    if (!await c11TablesExist(tx)) fail(409, 'C11_MIGRACION_PENDIENTE', 'La evidencia C11 todavía no está disponible.')
    await assertFinanceRuntimeReady(tx as unknown as Prisma.TransactionClient)
    await assertLiveFinanceWriter(tx, actorId)
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`confirming-c11:${safe.movimientoId}:${safe.liquidacionId}`},0))::text AS locked`)
    const replays = await tx.$queryRaw<Array<{ payloadHash: string; snapshot: unknown }>>(Prisma.sql`
      SELECT payload_hash AS "payloadHash",snapshot
      FROM auditorias_liquidacion_confirming
      WHERE actor_real_id=${auditActors.actorRealId} AND idempotency_key=${safe.idempotencyKey}
      LIMIT 2 FOR KEY SHARE
    `)
    if (replays.length) {
      const replay = parseSupportResult(replays[0]?.snapshot)
      if (replays.length !== 1 || replays[0]?.payloadHash !== payloadHash || !replay || replay.estado !== 'CONFIRMADO') {
        fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave idempotente C11 ya se usó con otra decisión.')
      }
      return { idempotente: true, resultado: replay }
    }
    const live = await readLiveLiquidationForSupport(tx, safe)
    const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id::text AS id FROM soportes_liquidacion_confirming
      WHERE operacion_b4_id=CAST(${safe.operacionB4Id} AS uuid)
      LIMIT 2 FOR KEY SHARE
    `)
    if (existing.length) fail(409, 'SOPORTE_C11_EXISTENTE', 'La operación B4 ya conserva un soporte C11; no se duplica.')
    const links = await differenceLinks(tx, live)
    const soporteId = randomUUID()
    const supportSnapshot = {
      schema: CONFIRMING_LIQUIDATION_SCHEMA,
      liquidacionId: live.liquidacionId,
      movimientoId: live.movimientoId,
      operacionB4Id: live.operacionB4Id,
      sourceHash: live.sourceHash,
      lineasB4: links.lineasB4,
    }
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO soportes_liquidacion_confirming
        (id,liquidacion_id,movimiento_id,operacion_b4_id,vinculo_intereses_id,vinculo_comision_id,vinculo_iva_comision_id,
         estado,fuente_hash,fuente_snapshot,actor_real_id,actor_efectivo_id)
      VALUES
        (CAST(${soporteId} AS uuid),CAST(${live.liquidacionId} AS uuid),${live.movimientoId},CAST(${live.operacionB4Id} AS uuid),
         ${links.intereses ? Prisma.sql`CAST(${links.intereses} AS uuid)` : Prisma.sql`NULL`},
         ${links.comision ? Prisma.sql`CAST(${links.comision} AS uuid)` : Prisma.sql`NULL`},
         ${links.iva ? Prisma.sql`CAST(${links.iva} AS uuid)` : Prisma.sql`NULL`},
         'CONFIRMADO'::"EstadoSoporteLiquidacionConfirming",${live.sourceHash},CAST(${JSON.stringify(supportSnapshot)} AS jsonb),${auditActors.actorRealId},${auditActors.actorEfectivoId})
    `)
    const result: ConfirmingLiquidationSupportResult = {
      soporteId,
      estado: 'CONFIRMADO',
      version: 1,
      liquidacionId: live.liquidacionId,
      movimientoId: live.movimientoId,
      operacionB4Id: live.operacionB4Id,
      sourceHash: live.sourceHash,
    }
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO auditorias_liquidacion_confirming
        (id,soporte_id,actor_real_id,actor_efectivo_id,accion,idempotency_key,payload_hash,snapshot)
      VALUES
        (CAST(${randomUUID()} AS uuid),CAST(${soporteId} AS uuid),${auditActors.actorRealId},${auditActors.actorEfectivoId},
         'CONFIRMACION_SOPORTE'::"AccionAuditoriaLiquidacionConfirming",${safe.idempotencyKey},${payloadHash},
         CAST(${JSON.stringify(supportResultSnapshot(result))} AS jsonb))
    `)
    return { idempotente: false, resultado: result }
  })
}

export async function undoDocumentedConfirmingLiquidationSupport(
  db: ConfirmingLiquidationQueryClient,
  actorId: number,
  input: Readonly<{ soporteId: string; version: number; motivo: string; idempotencyKey: string }>,
): Promise<Readonly<{ idempotente: boolean; resultado: ConfirmingLiquidationSupportResult }>> {
  const safe = {
    soporteId: uuid(input.soporteId, 'soporteId'),
    version: input.version,
    motivo: text(input.motivo),
    idempotencyKey: uuid(input.idempotencyKey, 'idempotencyKey'),
  }
  if (safe.version !== 1 || !safe.motivo || safe.motivo.length > 2_000) fail(400, 'VALIDATION_ERROR', 'La revocación C11 no conserva una versión o motivo válido.')
  const auditActors = c11AuditActors(actorId, await trustedImpersonationContextResolutionFromRequest())
  const payloadHash = sha256({ schema: 'C11_CONFIRMING_SUPPORT_UNDO_V1', actorId, auditActors, input: safe })
  return withWriteTransaction(db, async (tx) => {
    if (!await c11TablesExist(tx)) fail(404, 'SOPORTE_C11_NO_ENCONTRADO', 'El soporte C11 no existe.')
    await assertFinanceRuntimeReady(tx as unknown as Prisma.TransactionClient)
    await assertLiveFinanceWriter(tx, actorId)
    const rows = await tx.$queryRaw<Array<{
      soporteId: string; liquidacionId: string; movimientoId: string; operacionB4Id: string; sourceHash: string; version: unknown; estadoOperacion: string; revertidaAt: unknown
    }>>(Prisma.sql`
      SELECT s.id::text AS "soporteId",s.liquidacion_id::text AS "liquidacionId",s.movimiento_id AS "movimientoId",
        s.operacion_b4_id::text AS "operacionB4Id",s.fuente_hash AS "sourceHash",s.version,
        o.estado::text AS "estadoOperacion",o.revertida_at AS "revertidaAt"
      FROM soportes_liquidacion_confirming s
      JOIN operaciones_justificacion_b4 o ON o.id=s.operacion_b4_id
      WHERE s.id=CAST(${safe.soporteId} AS uuid)
      LIMIT 2 FOR KEY SHARE OF s,o
    `)
    const current = rows[0]
    if (rows.length !== 1 || !current || integer(current.version) !== 1) fail(404, 'SOPORTE_C11_NO_ENCONTRADO', 'El soporte C11 no existe o está corrupto.')
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`confirming-c11-revoke:${safe.soporteId}`},0))::text AS locked`)
    const replays = await tx.$queryRaw<Array<{ payloadHash: string; snapshot: unknown }>>(Prisma.sql`
      SELECT payload_hash AS "payloadHash",snapshot
      FROM revocaciones_soporte_liquidacion_confirming
      WHERE actor_real_id=${auditActors.actorRealId} AND idempotency_key=${safe.idempotencyKey}
      LIMIT 2 FOR KEY SHARE
    `)
    if (replays.length) {
      const replay = parseSupportResult(replays[0]?.snapshot)
      if (replays.length !== 1 || replays[0]?.payloadHash !== payloadHash || !replay || replay.estado !== 'REVOCADO') {
        fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave idempotente C11 ya se usó con otra decisión.')
      }
      return { idempotente: true, resultado: replay }
    }
    if (current.estadoOperacion !== 'REVERTIDA' || current.revertidaAt === null) {
      fail(409, 'REVOCACION_C11_EXIGE_B4_REVERTIDA', 'Primero debe deshacerse B4 antes de revocar el soporte C11.')
    }
    const previous = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id::text AS id FROM revocaciones_soporte_liquidacion_confirming
      WHERE soporte_id=CAST(${safe.soporteId} AS uuid) AND version_soporte=1
      LIMIT 2 FOR KEY SHARE
    `)
    if (previous.length) fail(409, 'SOPORTE_C11_YA_REVOCADO', 'El soporte C11 ya conserva una revocación append-only.')
    const result: ConfirmingLiquidationSupportResult = {
      soporteId: current.soporteId,
      estado: 'REVOCADO',
      version: 1,
      liquidacionId: current.liquidacionId,
      movimientoId: current.movimientoId,
      operacionB4Id: current.operacionB4Id,
      sourceHash: current.sourceHash,
    }
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO revocaciones_soporte_liquidacion_confirming
        (id,soporte_id,actor_real_id,actor_efectivo_id,version_soporte,motivo,idempotency_key,payload_hash,snapshot)
      VALUES
        (CAST(${randomUUID()} AS uuid),CAST(${safe.soporteId} AS uuid),${auditActors.actorRealId},${auditActors.actorEfectivoId},1,${safe.motivo},${safe.idempotencyKey},${payloadHash},
         CAST(${JSON.stringify(supportResultSnapshot(result))} AS jsonb))
    `)
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO auditorias_liquidacion_confirming
        (id,soporte_id,actor_real_id,actor_efectivo_id,accion,idempotency_key,payload_hash,snapshot)
      VALUES
        (CAST(${randomUUID()} AS uuid),CAST(${safe.soporteId} AS uuid),${auditActors.actorRealId},${auditActors.actorEfectivoId},
         'REVOCACION_SOPORTE'::"AccionAuditoriaLiquidacionConfirming",${safe.idempotencyKey},${payloadHash},
         CAST(${JSON.stringify(supportResultSnapshot(result))} AS jsonb))
    `)
    return { idempotente: false, resultado: result }
  })
}

/** Returns null for a legacy C10 id and C11 tables not yet migrated.  It lets
 * the retained C10 undo wrapper dispatch old receipts without a schema fork. */
export async function tryUndoDocumentedConfirmingLiquidationSupport(
  db: ConfirmingLiquidationQueryClient,
  actorId: number,
  input: Readonly<{ soporteId: string; version: number; motivo: string; idempotencyKey: string }>,
): Promise<Readonly<{ idempotente: boolean; resultado: ConfirmingLiquidationSupportResult }> | null> {
  const supportId = uuid(input.soporteId, 'soporteId')
  const exists = await (async () => {
    if (!await c11TablesExist(db)) return false
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id::text AS id FROM soportes_liquidacion_confirming WHERE id=CAST(${supportId} AS uuid) LIMIT 2
    `)
    return rows.length === 1
  })()
  return exists ? undoDocumentedConfirmingLiquidationSupport(db, actorId, { ...input, soporteId: supportId }) : null
}
