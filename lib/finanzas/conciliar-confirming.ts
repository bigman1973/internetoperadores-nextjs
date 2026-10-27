import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { conciliarProjectionRowId } from './conciliar-core'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety'
import { requireB4ActorAccess } from '@/lib/finanzas/reconciliation-auth'
import { archivoRecibidaControlado } from '@/lib/finanzas/archivo-fuente-controlada'
import {
  applyDocumentedConfirmingLiquidationSupport,
  ConfirmingLiquidationRuntimeError,
  readConfirmingLiquidationCandidates,
  tryUndoDocumentedConfirmingLiquidationSupport,
  type ConfirmingLiquidationRuntimeCandidate,
  type ConfirmingLiquidationSupportResult,
} from './confirming-liquidation-runtime'
import {
  buildConciliarConfirmingCandidates,
  centsFromExactDecimal,
  hashConfirmingInterestSource,
  hashConfirmingInterestEvidence,
  hasUnexplainedConfirmingHistoricalExpense,
  hasConfirmingDraxtonPath,
  normalizeConfirmingInvoiceNumber,
  type ConciliarConfirmingCoreResult,
  type ConfirmingInterestEvidenceLine,
  type ConfirmingInterestSupportSeed,
  type StoredConfirmingDocument,
  type StoredConfirmingLine,
  type StoredDocumentoB4,
  type StoredFacturaEmitida,
  type StoredMovimientoConfirming,
} from './conciliar-confirming-core'

/**
 * Adaptador servidor para confirming documental.
 *
 * - Sólo lee ConfirmingLinea ya almacenada: nunca llama a parser, OneDrive, Graph
 *   ni sincronización.
 * - Nunca exige banco emisor = cuenta de ingreso: CaixaBank puede liquidar en
 *   Santander y BBVA en BBVA u otra cuenta registrada.
 * - Las facturas se identifican por ConfirmingLinea.facturaEmitidaId, número de
 *   factura y el importe exacto; el grupo Draxton sólo es contexto de búsqueda.
 */

export type ConfirmingQueryClient = Readonly<{
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>
  $executeRaw?: (query: Prisma.Sql) => Promise<unknown>
  $transaction?: <T>(fn: (tx: ConfirmingQueryClient) => Promise<T>, options?: unknown) => Promise<T>
  [key: string]: unknown
}>

export type ReadConciliarConfirmingCandidatesOptions = Readonly<{
  /** Selección acotada para una pantalla/cola. Máximo 100 IDs, sin inferir otros. */
  movimientoIds?: readonly string[]
  /** Reconstruye todos los abonos B4 aún SIN_DOCUMENTO, acotado a 5.000. */
  allRebuild?: boolean
  /** Límite sólo cuando no se pide lista explícita ni reconstrucción total. 1..100. */
  limit?: number
}>

export type ReadConciliarConfirmingCandidatesResult = Readonly<{
  candidates: readonly ConfirmingLiquidationRuntimeCandidate[]
  documentosBloqueados: readonly []
  warningCodes: readonly string[]
  modo: 'LIMITADO' | 'ALL_REBUILD'
  movimientosLeidos: number
  movimientosTruncados: boolean
  /** La lectura es preparatoria; B4 se bloquea y vuelve a validar al confirmar. */
  noEscrituras: true
}>

export class ConciliarConfirmingServiceError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}

function fail(status: number, code: string, message: string): never {
  throw new ConciliarConfirmingServiceError(status, code, message)
}

const MAX_MOVEMENT_IDS = 100
const DEFAULT_MOVEMENT_LIMIT = 100
const MAX_ALL_REBUILD = 5_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ID = /^[A-Za-z0-9_-]{1,160}$/

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  throw new Error('CONFIRMING_CANONICAL_VALUE_INVALID')
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  return normalized && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : null
}

function id(value: unknown, field: string): string {
  const parsed = text(value)
  if (!parsed || !ID.test(parsed)) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return parsed
}

function uuid(value: unknown, field: string): string {
  const parsed = text(value)
  if (!parsed || !UUID.test(parsed)) fail(400, 'VALIDATION_ERROR', `${field} debe ser UUID canónico.`)
  return parsed.toLowerCase()
}

function isoDay(value: unknown): string | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10)
  return null
}

function decimalText(value: unknown): string | null {
  return typeof value === 'string' && centsFromExactDecimal(value) !== null ? value : null
}

function integer(value: unknown): number | null {
  const candidate = typeof value === 'bigint' ? Number(value) : typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(candidate) && candidate >= -2_147_483_647 && candidate <= 2_147_483_647 ? candidate : null
}

function historyHasConfirming(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  const serialized = typeof value === 'string' ? value : value === null || value === undefined ? '' : JSON.stringify(value)
  return /(?:^|[\\/])3\.\s*confirming\s+draxton\s+2026(?:[\\/]|$)/iu.test(serialized)
}

function activeState(value: unknown): StoredMovimientoConfirming['estadoB4'] {
  return value === 'SIN_DOCUMENTO' || value === 'JUSTIFICADO' || value === 'NO_REQUIERE' ? value : 'DESCONOCIDO'
}

function civilDay(value: string | null): number | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? Math.floor(date.getTime() / 86_400_000) : null
}

async function withReadTransaction<T>(db: ConfirmingQueryClient, fn: (tx: ConfirmingQueryClient) => Promise<T>): Promise<T> {
  if (!db.$transaction) return fn(db)
  return db.$transaction(async (tx) => {
    if (tx.$executeRaw) await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`)
    return fn(tx)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20_000 })
}

function uniqueMovementIds(values: readonly string[] | undefined): string[] {
  if (values === undefined) return []
  if (!Array.isArray(values) || values.length > MAX_MOVEMENT_IDS) fail(400, 'MOVIMIENTOS_INVALIDOS', `movimientoIds admite como máximo ${MAX_MOVEMENT_IDS} identificadores.`)
  return [...new Set(values.map((value) => id(value, 'movimientoIds')))].sort()
}

type RawDocument = {
  id: string; fechaDocumento: unknown; proveedor: unknown; referenciaDocumento: unknown; carpetaOrigen: unknown; archivoOneDrive: unknown; oneDriveRutaActual: unknown
  oneDriveItemId: unknown; oneDriveDriveId: unknown; historialConfirming: unknown
}
type RawLine = {
  id: string; confirmingId: string; numFactura: unknown; importeDecimal: unknown; interesesDecimal: unknown; comisionDecimal: unknown
  gastosFinancierosDecimal: unknown; facturaEmitidaId: unknown
}
type RawInvoice = { id: string; numFactura: unknown; cliente: unknown; fecha: unknown; totalDecimal: unknown }
type RawB4 = { id: string; facturaEmitidaId: string; activo: unknown; objetivoCentimos: unknown; asignadoCentimos: unknown }
type RawMovement = {
  id: string; fecha: unknown; importeDecimal: unknown; estadoB4: unknown; banco: unknown; cuenta: unknown; concepto: unknown; tercero: unknown
}

function mapDocuments(rows: readonly RawDocument[]): StoredConfirmingDocument[] {
  return rows.flatMap((row) => {
    const identifier = text(row.id)
    if (!identifier) return []
    const controlled = archivoRecibidaControlado({
      oneDriveDriveId: text(row.oneDriveDriveId),
      oneDriveItemId: text(row.oneDriveItemId),
      archivoOneDrive: text(row.archivoOneDrive),
    })
    return [{
      id: identifier,
      fechaDocumento: isoDay(row.fechaDocumento),
      proveedor: text(row.proveedor),
      referenciaDocumento: text(row.referenciaDocumento),
      carpetaOrigen: text(row.carpetaOrigen),
      archivoOneDrive: text(row.archivoOneDrive),
      oneDriveRutaActual: text(row.oneDriveRutaActual),
      rutaConfirmingHistorica: historyHasConfirming(row.historialConfirming),
      oneDriveItemId: controlled?.itemId ?? null,
      oneDriveDriveId: controlled?.driveId ?? null,
    }]
  })
}

function mapLines(rows: readonly RawLine[]): StoredConfirmingLine[] {
  return rows.flatMap((row) => {
    const identifier = text(row.id), confirmingId = text(row.confirmingId), numFactura = text(row.numFactura), importeDecimal = decimalText(row.importeDecimal)
    if (!identifier || !confirmingId || !numFactura || !importeDecimal) return []
    const interest = row.interesesDecimal === null ? null : decimalText(row.interesesDecimal)
    const commission = row.comisionDecimal === null ? null : decimalText(row.comisionDecimal)
    const expenses = row.gastosFinancierosDecimal === null ? null : decimalText(row.gastosFinancierosDecimal)
    return [{ id: identifier, confirmingId, numFactura, importeDecimal, interesesDecimal: interest, comisionDecimal: commission, gastosFinancierosDecimal: expenses, facturaEmitidaId: text(row.facturaEmitidaId) }]
  })
}

function mapInvoices(rows: readonly RawInvoice[]): StoredFacturaEmitida[] {
  return rows.flatMap((row) => {
    const identifier = text(row.id), numFactura = text(row.numFactura), total = decimalText(row.totalDecimal)
    if (!identifier || !numFactura || !total) return []
    return [{ id: identifier, numFactura, cliente: text(row.cliente), fecha: isoDay(row.fecha), totalDecimal: total }]
  })
}

function mapB4(rows: readonly RawB4[]): StoredDocumentoB4[] {
  return rows.flatMap((row) => {
    const identifier = text(row.id), invoice = text(row.facturaEmitidaId), target = integer(row.objetivoCentimos), assigned = integer(row.asignadoCentimos)
    if (!identifier || !invoice || assigned === null) return []
    return [{ id: identifier, facturaEmitidaId: invoice, activo: row.activo === true, objetivoCentimos: target, asignadoCentimos: assigned }]
  })
}

function mapMovements(rows: readonly RawMovement[]): StoredMovimientoConfirming[] {
  return rows.flatMap((row) => {
    const identifier = text(row.id), date = isoDay(row.fecha), amount = decimalText(row.importeDecimal)
    const cents = amount === null ? null : centsFromExactDecimal(amount)
    if (!identifier || !date || cents === null) return []
    return [{ id: identifier, fecha: date, importeCentimos: cents, estadoB4: activeState(row.estadoB4), banco: text(row.banco), cuenta: text(row.cuenta), concepto: text(row.concepto) ?? '', tercero: text(row.tercero) }]
  })
}

async function readStoredDocumentalData(tx: ConfirmingQueryClient) {
  const documents = tx.$queryRaw<RawDocument[]>(Prisma.sql`
    SELECT fr.id, fr.fecha::date::text AS "fechaDocumento", fr.proveedor, fr.num_factura AS "referenciaDocumento",
      fr.carpeta_origen AS "carpetaOrigen", fr.archivo_onedrive AS "archivoOneDrive",
      fr.onedrive_ruta_actual AS "oneDriveRutaActual", fr.onedrive_item_id AS "oneDriveItemId",
      fr.onedrive_drive_id AS "oneDriveDriveId",
      EXISTS (
        SELECT 1 FROM historial_ubicaciones_facturas_recibidas h
        WHERE h.factura_id=fr.id
          AND (h.anterior::text ILIKE ${'%3. Confirming Draxton 2026%'} OR h.actual::text ILIKE ${'%3. Confirming Draxton 2026%'})
      ) AS "historialConfirming"
    FROM facturas_recibidas fr
    WHERE EXISTS (SELECT 1 FROM confirming_lineas cl WHERE cl.confirming_id=fr.id)
    ORDER BY fr.id ASC
    LIMIT 1_001
  `)
  const lines = tx.$queryRaw<RawLine[]>(Prisma.sql`
    SELECT cl.id, cl.confirming_id AS "confirmingId", cl.num_factura AS "numFactura",
      cl.importe::text AS "importeDecimal", cl.intereses::text AS "interesesDecimal",
      cl.comision::text AS "comisionDecimal", cl.gastos_financieros::text AS "gastosFinancierosDecimal",
      cl.factura_emitida_id AS "facturaEmitidaId"
    FROM confirming_lineas cl
    ORDER BY cl.confirming_id ASC, cl.id ASC
    LIMIT 10_001
  `)
  const invoices = tx.$queryRaw<RawInvoice[]>(Prisma.sql`
    SELECT fe.id, fe.num_factura AS "numFactura", fe.cliente, fe.fecha::date::text AS fecha, fe.total::text AS "totalDecimal"
    FROM facturas_emitidas fe
    WHERE EXISTS (SELECT 1 FROM confirming_lineas cl WHERE cl.factura_emitida_id=fe.id)
    ORDER BY fe.id ASC
    LIMIT 10_001
  `)
  const b4 = tx.$queryRaw<RawB4[]>(Prisma.sql`
    SELECT d.id, d.factura_emitida_id AS "facturaEmitidaId", d.activo,
      d.importe_objetivo_centimos AS "objetivoCentimos",
      COALESCE(SUM(v.importe_centimos) FILTER (WHERE v.activo), 0)::text AS "asignadoCentimos"
    FROM documentos_conciliables d
    LEFT JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id
    WHERE d.tipo='FACTURA_EMITIDA'::"TipoDocumentoConciliable"
      AND d.factura_emitida_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM confirming_lineas cl WHERE cl.factura_emitida_id=d.factura_emitida_id)
    GROUP BY d.id
    ORDER BY d.id ASC
    LIMIT 10_001
  `)
  const [documentRows, lineRows, invoiceRows, b4Rows] = await Promise.all([documents, lines, invoices, b4])
  if (documentRows.length > 1_000 || lineRows.length > 10_000 || invoiceRows.length > 10_000 || b4Rows.length > 10_000) {
    fail(409, 'CONFIRMING_FUENTE_TRUNCADA', 'La población documental confirming supera el límite seguro de lectura; acota y revisa la fuente.')
  }
  return { documents: mapDocuments(documentRows), lines: mapLines(lineRows), invoices: mapInvoices(invoiceRows), b4: mapB4(b4Rows) }
}

async function readMovements(tx: ConfirmingQueryClient, options: ReadConciliarConfirmingCandidatesOptions): Promise<{ movements: StoredMovimientoConfirming[]; modo: 'LIMITADO' | 'ALL_REBUILD'; truncados: boolean }> {
  const selectedIds = uniqueMovementIds(options.movimientoIds)
  if (selectedIds.length && options.allRebuild) fail(400, 'MODO_LECTURA_AMBIGUO', 'No se puede combinar movimientoIds con allRebuild.')
  const limit = options.allRebuild ? MAX_ALL_REBUILD : selectedIds.length || options.limit === undefined ? (selectedIds.length || DEFAULT_MOVEMENT_LIMIT) : options.limit
  if (!Number.isInteger(limit) || limit < 1 || limit > (options.allRebuild ? MAX_ALL_REBUILD : DEFAULT_MOVEMENT_LIMIT)) {
    fail(400, 'LIMITE_INVALIDO', 'El límite de movimientos no es válido.')
  }
  const onlyIds = selectedIds.length > 0
  const where = onlyIds
    ? Prisma.sql`m.id IN (${Prisma.join(selectedIds.map((value) => Prisma.sql`${value}`))})`
    : options.allRebuild
      ? Prisma.sql`COALESCE(e.estado::text, 'SIN_DOCUMENTO')='SIN_DOCUMENTO' AND m.importe > 0`
      : Prisma.sql`COALESCE(e.estado::text, 'SIN_DOCUMENTO')='SIN_DOCUMENTO' AND m.importe > 0`
  const rows = await tx.$queryRaw<RawMovement[]>(Prisma.sql`
    SELECT m.id, m.fecha_operacion::date::text AS fecha, m.importe::text AS "importeDecimal",
      COALESCE(e.estado::text, 'SIN_DOCUMENTO') AS "estadoB4", cb.banco, cb.alias AS cuenta,
      m.concepto, m.tercero
    FROM movimientos_bancarios m
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    LEFT JOIN cuentas_bancarias cb ON cb.id=m.cuenta_id
    WHERE ${where}
    ORDER BY m.fecha_operacion::date DESC, m.id ASC
    LIMIT ${limit + 1}
  `)
  const truncados = rows.length > limit
  return { movements: mapMovements(rows.slice(0, limit)), modo: options.allRebuild ? 'ALL_REBUILD' : 'LIMITADO', truncados }
}

/**
 * API de lectura que consume el backend. Acepta un PrismaClient o TransactionClient
 * inyectado; no importa el singleton ni abre red. `allRebuild` es la única lectura
 * amplia; el modo normal es limitado o una lista explícita de IDs.
 */
export async function readConciliarConfirmingCandidates(
  db: ConfirmingQueryClient,
  options: ReadConciliarConfirmingCandidatesOptions = {},
): Promise<ReadConciliarConfirmingCandidatesResult> {
  // C11 sustituye la lectura C9 para cualquier candidato nuevo. El runtime lee
  // exclusivamente liquidaciones persistidas current/latest y las revalida con
  // FI, capacidad B4, cuenta depositaria y movimiento vivos. No parsea ni abre
  // PDF/XLS/Graph en ejecución. C9 sólo sobrevive como soporte de undo histórico.
  const c11 = await readConfirmingLiquidationCandidates(db, options)
  const c11Movements = new Set(c11.candidates.map((candidate) => candidate.movimientoId))
  const legacy = await withReadTransaction(db, async (tx) => {
    const [{ documents, lines, invoices, b4 }, movementRead] = await Promise.all([
      readStoredDocumentalData(tx),
      readMovements(tx, options),
    ])
    return { core: buildConciliarConfirmingCandidates({ documentos: documents, lineas: lines, facturasEmitidas: invoices, documentosB4: b4, movimientos: movementRead.movements }), movementRead }
  })
  // Si una liquidación C11 ya describe el abono, no se muestra un candidato C9
  // paralelo. Si no existe C11, el legado se conserva sólo como diagnóstico ámbar
  // con razón explícita: nunca aporta líneas B4 ni un hash confirmable.
  const blockedLegacy: ConfirmingLiquidationRuntimeCandidate[] = legacy.core.candidates
    .filter((candidate) => !c11Movements.has(candidate.movimientoId))
    .map((candidate) => ({
      evidenceSchema: 'C9_BLOQUEADO' as const,
      id: `c9-bloqueado:${candidate.id}`,
      liquidacionId: `C9:${candidate.confirmingId}`,
      liquidacionVersion: 0,
      movimientoId: candidate.movimientoId,
      confirmingId: candidate.confirmingId,
      fechaDocumento: candidate.fechaDocumento,
      fechaLiquidacion: null,
      grupoBusqueda: candidate.grupoBusqueda,
      sociedadDocumento: candidate.sociedadDocumento,
      estado: 'BLOQUEADO_EVIDENCIA_C11_AUSENTE' as const,
      bloqueos: [...new Set([...candidate.bloqueos, 'EVIDENCIA_C11_AUSENTE_PARA_CONFIRMING_C9'])].sort(),
      requiereConfirmacionHumana: true as const,
      noEscrituras: true as const,
      bancoDepositario: candidate.bancoDepositario,
      cuentaDepositaria: candidate.cuentaDepositaria,
      cuentaDepositariaId: null,
      importeMovimientoCentimos: candidate.importeMovimientoCentimos,
      totalFacturasCentimos: candidate.totalFacturasCentimos,
      totalInteresesExplicitosCentimos: candidate.totalInteresesExplicitosCentimos,
      totalComisionesExplicitasCentimos: candidate.totalComisionesExplicitasCentimos,
      totalIvaComisionCentimos: null,
      totalLineasB4Centimos: null,
      lineasB4: [],
      facturas: candidate.facturas,
      gastosFinancierosHistoricosIgnorados: false as const,
      soportesIntereses: [],
      sourceHash: candidate.sourceHash ?? '0'.repeat(64),
    }))
  return {
    ...c11,
    candidates: [...c11.candidates, ...blockedLegacy].sort((left, right) => left.movimientoId.localeCompare(right.movimientoId) || left.id.localeCompare(right.id)),
    warningCodes: [...new Set([...c11.warningCodes, ...legacy.core.warningCodes, 'C9_LEGACY_BLOQUEADO_SIN_EVIDENCIA_C11'])].sort(),
  }
}

export { applyDocumentedConfirmingLiquidationSupport, tryUndoDocumentedConfirmingLiquidationSupport }
export type { ConfirmingLiquidationSupportResult }

export type ApplyDocumentedConfirmingInterestSupportInput = Readonly<{
  action: 'aplicar'
  confirmar: true
  movimientoId: string
  confirmingId: string
  vinculoDiferenciaB4Id: string
  sourceHash: string
  idempotencyKey: string
}>

export type UndoDocumentedConfirmingInterestSupportInput = Readonly<{
  action: 'deshacer'
  loteId: string
  version: number
  motivo: string
  idempotencyKey: string
}>

export type ApplyDocumentedConfirmingInterestInvoiceSupportInput = Readonly<{
  action: 'vincular_factura_interes'
  confirmar: true
  loteId: string
  facturaInteresId: string
  referenciaDocumental: string
  emisorBanco: string
  idempotencyKey: string
}>

export type UndoDocumentedConfirmingInterestInvoiceSupportInput = Readonly<{
  action: 'desvincular_factura_interes'
  loteId: string
  facturaInteresId: string
  motivo: string
  idempotencyKey: string
}>

export type ConfirmingInterestSupportResult = Readonly<{
  loteId: string
  estado: 'CONFIRMADO' | 'REVOCADO'
  version: number
  movimientoId: string
  vinculoDiferenciaB4Id: string
  importeInteresCentimos: number
}>

export type ConfirmingInterestInvoiceSupportResult = Readonly<{
  loteId: string
  facturaInteresId: string | null
  estado: 'VINCULADA' | 'DESVINCULADA'
}>

function exactKeys(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'VALIDATION_ERROR', 'La solicitud debe ser un objeto JSON.')
  const record = value as Record<string, unknown>
  const actual = Object.keys(record)
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)) || keys.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) {
    fail(400, 'VALIDATION_ERROR', 'La solicitud contiene claves fuera del contrato confirming.')
  }
  return record
}

export function parseApplyDocumentedConfirmingInterestSupport(raw: unknown): ApplyDocumentedConfirmingInterestSupportInput {
  const body = exactKeys(raw, ['action', 'confirmar', 'movimientoId', 'confirmingId', 'vinculoDiferenciaB4Id', 'sourceHash', 'idempotencyKey'])
  if (body.action !== 'aplicar' || body.confirmar !== true) fail(422, 'CONFIRMACION_HUMANA_REQUERIDA', 'Aplicar soporte exige action: aplicar y confirmar: true.')
  const sourceHash = text(body.sourceHash)
  if (!sourceHash || !/^[0-9a-f]{64}$/.test(sourceHash)) fail(400, 'FUENTE_NO_REVISADA', 'sourceHash confirming no es válido.')
  return {
    action: 'aplicar', confirmar: true, movimientoId: id(body.movimientoId, 'movimientoId'), confirmingId: id(body.confirmingId, 'confirmingId'),
    vinculoDiferenciaB4Id: uuid(body.vinculoDiferenciaB4Id, 'vinculoDiferenciaB4Id'), sourceHash,
    idempotencyKey: uuid(body.idempotencyKey, 'idempotencyKey'),
  }
}

export function parseUndoDocumentedConfirmingInterestSupport(raw: unknown): UndoDocumentedConfirmingInterestSupportInput {
  const body = exactKeys(raw, ['action', 'loteId', 'version', 'motivo', 'idempotencyKey'])
  if (body.action !== 'deshacer') fail(400, 'VALIDATION_ERROR', 'La acción debe ser deshacer.')
  const motive = text(body.motivo)
  if (!motive || motive.length > 2_000) fail(400, 'MOTIVO_REVOCACION_REQUERIDO', 'Deshacer exige un motivo humano no vacío.')
  if (!Number.isInteger(body.version) || (body.version as number) < 1) fail(400, 'VALIDATION_ERROR', 'version debe ser un entero positivo.')
  return { action: 'deshacer', loteId: uuid(body.loteId, 'loteId'), version: body.version as number, motivo: motive, idempotencyKey: uuid(body.idempotencyKey, 'idempotencyKey') }
}

function documentaryReference(value: unknown): string {
  const parsed = text(value)
  if (!parsed || parsed.length > 160 || parsed.length < 3) fail(400, 'REFERENCIA_DOCUMENTAL_INVALIDA', 'La referencia documental debe tener entre 3 y 160 caracteres.')
  return parsed
}

export function parseApplyDocumentedConfirmingInterestInvoiceSupport(raw: unknown): ApplyDocumentedConfirmingInterestInvoiceSupportInput {
  const body = exactKeys(raw, ['action', 'confirmar', 'loteId', 'facturaInteresId', 'referenciaDocumental', 'emisorBanco', 'idempotencyKey'])
  if (body.action !== 'vincular_factura_interes' || body.confirmar !== true) fail(422, 'CONFIRMACION_HUMANA_REQUERIDA', 'Vincular la factura de interés exige confirmación humana explícita.')
  const emisorBanco = normalizeInterestInvoiceIssuer(documentaryReference(body.emisorBanco))
  if (!emisorBanco) fail(400, 'EMISOR_BANCARIO_INVALIDO', 'El emisor bancario humano no es válido.')
  return {
    action: 'vincular_factura_interes', confirmar: true, loteId: uuid(body.loteId, 'loteId'),
    facturaInteresId: id(body.facturaInteresId, 'facturaInteresId'), referenciaDocumental: documentaryReference(body.referenciaDocumental),
    emisorBanco,
    idempotencyKey: uuid(body.idempotencyKey, 'idempotencyKey'),
  }
}

export function parseUndoDocumentedConfirmingInterestInvoiceSupport(raw: unknown): UndoDocumentedConfirmingInterestInvoiceSupportInput {
  const body = exactKeys(raw, ['action', 'loteId', 'facturaInteresId', 'motivo', 'idempotencyKey'])
  if (body.action !== 'desvincular_factura_interes') fail(400, 'VALIDATION_ERROR', 'La acción debe ser desvincular_factura_interes.')
  const motive = text(body.motivo)
  if (!motive || motive.length > 2_000) fail(400, 'MOTIVO_REVOCACION_REQUERIDO', 'Desvincular exige un motivo humano no vacío.')
  return {
    action: 'desvincular_factura_interes', loteId: uuid(body.loteId, 'loteId'), facturaInteresId: id(body.facturaInteresId, 'facturaInteresId'),
    motivo: motive, idempotencyKey: uuid(body.idempotencyKey, 'idempotencyKey'),
  }
}

type Tx = ConfirmingQueryClient & {
  usuarioAdmin?: { findUnique: (args: unknown) => Promise<{ activo?: boolean; rol?: string; roles?: unknown } | null> }
  permisoUsuario?: { count: (args: unknown) => Promise<number> }
}

/** C10 uses the same live B4 gate as the Lorena profile.  It never opens a
 * separate ACL based on a broad finance role or a stale route permission. */
async function assertLiveFinanceWriter(tx: Tx, actorId: number): Promise<void> {
  const access = await requireB4ActorAccess(actorId, 'escritura', tx as unknown as Prisma.TransactionClient)
  if (!access.ok) fail(403, 'PERMISO_REVOCADO', 'Sin permiso financiero de escritura.')
}

async function withWriteTransaction<T>(db: ConfirmingQueryClient, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!db.$transaction) return fn(db as Tx)
  return db.$transaction((tx) => fn(tx as Tx), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 })
}

type InterestSourceRaw = {
  lineaId: string; confirmingId: string; facturaEmitidaId: string | null; numFactura: unknown; importeDecimal: unknown; interesesDecimal: unknown; comisionDecimal: unknown; gastosDecimal: unknown
  documentoId: string; fechaDocumento: unknown; proveedorDocumento: unknown; referenciaDocumento: unknown; carpetaOrigen: unknown; archivoOneDrive: unknown; oneDriveRutaActual: unknown; oneDriveItemId: unknown; oneDriveDriveId: unknown; historialConfirming: unknown
  facturaNumero: unknown; facturaFecha: unknown; facturaTotalDecimal: unknown
}

async function readAndValidateInterestSources(tx: Tx, confirmingId: string, movimientoId: string, selectedInvoices: ReadonlySet<string>): Promise<{ document: StoredConfirmingDocument; sources: ConfirmingInterestSupportSeed[]; evidenceLines: ConfirmingInterestEvidenceLine[]; sourceHash: string; total: number }> {
  const rows = await tx.$queryRaw<InterestSourceRaw[]>(Prisma.sql`
    SELECT cl.id AS "lineaId", cl.confirming_id AS "confirmingId", cl.factura_emitida_id AS "facturaEmitidaId", cl.num_factura AS "numFactura",
      cl.importe::text AS "importeDecimal", cl.intereses::text AS "interesesDecimal", cl.comision::text AS "comisionDecimal", cl.gastos_financieros::text AS "gastosDecimal",
      fr.id AS "documentoId", fr.fecha::date::text AS "fechaDocumento", fr.proveedor AS "proveedorDocumento", fr.num_factura AS "referenciaDocumento", fr.carpeta_origen AS "carpetaOrigen",
      fr.archivo_onedrive AS "archivoOneDrive", fr.onedrive_ruta_actual AS "oneDriveRutaActual",
      fr.onedrive_item_id AS "oneDriveItemId", fr.onedrive_drive_id AS "oneDriveDriveId",
      EXISTS (SELECT 1 FROM historial_ubicaciones_facturas_recibidas h WHERE h.factura_id=fr.id
        AND (h.anterior::text ILIKE ${'%3. Confirming Draxton 2026%'} OR h.actual::text ILIKE ${'%3. Confirming Draxton 2026%'})) AS "historialConfirming",
      fe.num_factura AS "facturaNumero", fe.fecha::date::text AS "facturaFecha", fe.total::text AS "facturaTotalDecimal"
    FROM confirming_lineas cl
    JOIN facturas_recibidas fr ON fr.id=cl.confirming_id
    LEFT JOIN facturas_emitidas fe ON fe.id=cl.factura_emitida_id
    WHERE cl.confirming_id=${confirmingId}
    ORDER BY cl.id ASC
    LIMIT 101
    FOR KEY SHARE OF cl, fr
  `)
  if (rows.length < 1 || rows.length > 100) fail(409, 'FUENTE_CONFIRMING_INCOMPLETA', 'El confirming no tiene un conjunto documental acotado de líneas.')
  const first = rows[0]
  const controlled = archivoRecibidaControlado({
    oneDriveDriveId: text(first.oneDriveDriveId), oneDriveItemId: text(first.oneDriveItemId), archivoOneDrive: text(first.archivoOneDrive),
  })
  const document: StoredConfirmingDocument = {
    id: text(first.documentoId) ?? '', fechaDocumento: isoDay(first.fechaDocumento), proveedor: text(first.proveedorDocumento), referenciaDocumento: text(first.referenciaDocumento),
    carpetaOrigen: text(first.carpetaOrigen), archivoOneDrive: text(first.archivoOneDrive), oneDriveRutaActual: text(first.oneDriveRutaActual),
    rutaConfirmingHistorica: historyHasConfirming(first.historialConfirming), oneDriveItemId: controlled?.itemId ?? null, oneDriveDriveId: controlled?.driveId ?? null,
  }
  if (!document.id || !hasConfirmingDraxtonPath(document) || !document.oneDriveItemId || !document.oneDriveDriveId || !document.fechaDocumento) {
    fail(409, 'FALTA_DOCUMENTO_CONTROLADO', 'El confirming no conserva metadata controlada suficiente; se requiere lectura documental.')
  }

  const sources: ConfirmingInterestSupportSeed[] = []
  const evidenceLines: ConfirmingInterestEvidenceLine[] = []
  let total = 0
  for (const row of rows) {
    const lineId = text(row.lineaId), lineDocument = text(row.confirmingId), invoiceId = text(row.facturaEmitidaId)
    const docNumber = normalizeConfirmingInvoiceNumber(row.numFactura)
    const invoiceNumber = normalizeConfirmingInvoiceNumber(row.facturaNumero)
    const lineAmount = decimalText(row.importeDecimal), invoiceTotal = decimalText(row.facturaTotalDecimal)
    const interestText = row.interesesDecimal === null ? null : decimalText(row.interesesDecimal)
    const commissionText = row.comisionDecimal === null ? null : decimalText(row.comisionDecimal)
    const expenseText = row.gastosDecimal === null ? null : decimalText(row.gastosDecimal)
    const interest = interestText === null ? null : centsFromExactDecimal(interestText)
    const commission = commissionText === null ? null : centsFromExactDecimal(commissionText)
    const expense = expenseText === null ? null : centsFromExactDecimal(expenseText)
    if (!lineId || lineDocument !== confirmingId || !invoiceId || !docNumber || !invoiceNumber || docNumber !== invoiceNumber || !lineAmount || !invoiceTotal || centsFromExactDecimal(lineAmount) !== centsFromExactDecimal(invoiceTotal)) {
      fail(409, 'IDENTIDAD_FACTURA_CONFIRMING_CAMBIADA', 'La línea confirming ya no identifica una factura emitida exacta.')
    }
    const selected = selectedInvoices.has(invoiceId)
    if (selected && (interest === null || interest < 0)) {
      fail(409, 'INTERES_NO_EXPLICITO', 'No se puede derivar interés desde gastos o diferencias: la línea requiere interés explícito.')
    }
    if (selected && commission !== null && commission < 0) fail(409, 'COMISION_NO_EXACTA', 'La comisión confirming explícita no es válida.')
    if (selected && hasUnexplainedConfirmingHistoricalExpense({ importeInteresCentimos: interest, importeComisionCentimos: commission, gastosFinancierosCentimos: expense })) {
      fail(409, 'INTERES_NO_EXPLICITO', 'No se puede derivar interés desde gastos o diferencias: la línea requiere interés explícito.')
    }
    evidenceLines.push({
      confirmingLineaId: lineId, confirmingId, facturaEmitidaId: invoiceId, numeroDocumento: docNumber,
      importeFacturaCentimos: centsFromExactDecimal(lineAmount), facturaNumero: invoiceNumber, facturaFecha: isoDay(row.facturaFecha),
      facturaTotalCentimos: centsFromExactDecimal(invoiceTotal), importeInteresCentimos: interest,
      importeComisionCentimos: commission, gastosFinancierosCentimos: expense,
    })
    if (selected && interest > 0) {
      total += interest
      if (!Number.isSafeInteger(total) || total > 2_147_483_647) fail(409, 'INTERES_FUERA_DE_RANGO', 'El total de intereses confirming no es válido.')
      sources.push({ confirmingLineaId: lineId, confirmingId, movimientoId, facturaEmitidaId: invoiceId, importeInteresCentimos: interest, documento: document, facturaNumero: invoiceNumber, facturaFecha: isoDay(row.facturaFecha) })
    }
  }
  if (!sources.length || total <= 0) fail(409, 'INTERES_NO_EXPLICITO', 'El confirming no contiene intereses explícitos positivos que soportar.')
  const sourceHash = hashConfirmingInterestEvidence({ movimientoId, documento: document, lineas: evidenceLines })
  return { document, sources, evidenceLines, sourceHash, total }
}

async function assertDifferenceB4ForInterest(tx: Tx, input: { movimientoId: string; vinculoDiferenciaB4Id: string; total: number }) {
  const rows = await tx.$queryRaw<Array<{ movimientoId: string; importeCentimos: unknown; tipo: string; motivo: string; activo: boolean; estadoOperacion: string; revertidaAt: unknown; estadoB4: string | null }>>(Prisma.sql`
    SELECT v.movimiento_id AS "movimientoId", v.importe_centimos AS "importeCentimos", v.tipo_linea::text AS tipo,
      v.motivo_diferencia::text AS motivo, v.activo, o.estado::text AS "estadoOperacion", o.revertida_at AS "revertidaAt", e.estado::text AS "estadoB4"
    FROM vinculos_movimiento_documento v
    JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=v.movimiento_id
    WHERE v.id=CAST(${input.vinculoDiferenciaB4Id} AS uuid)
    LIMIT 2 FOR UPDATE OF v, o
  `)
  const row = rows[0]
  if (rows.length !== 1 || row.movimientoId !== input.movimientoId || row.tipo !== 'DIFERENCIA' || row.motivo !== 'INTERESES' || row.activo !== true || row.estadoOperacion !== 'APLICADA' || row.revertidaAt !== null || row.estadoB4 !== 'JUSTIFICADO' || integer(row.importeCentimos) !== -input.total) {
    fail(409, 'DIFERENCIA_B4_NO_VIGENTE', 'La diferencia B4 de intereses no está activa, aplicada o no coincide exactamente con el documento.')
  }
}

async function assertB4DocumentsMatchConfirmingEvidence(tx: Tx, input: { movimientoId: string; vinculoDiferenciaB4Id: string; evidenceLines: readonly ConfirmingInterestEvidenceLine[] }) {
  if (!input.evidenceLines.length || input.evidenceLines.length > 100) fail(409, 'LINEAS_B4_NO_CORRESPONDEN', 'La evidencia confirming no contiene un conjunto completo y acotado de líneas.')
  const rows = await tx.$queryRaw<Array<{ confirmingLineaId: string; documentoId: string }>>(Prisma.sql`
    SELECT cl.id AS "confirmingLineaId",d.id::text AS "documentoId"
    FROM confirming_lineas cl
    JOIN vinculos_movimiento_documento vd ON vd.movimiento_id=${input.movimientoId} AND vd.activo
    JOIN vinculos_movimiento_documento vi ON vi.id=CAST(${input.vinculoDiferenciaB4Id} AS uuid)
      AND vd.operacion_creacion_id=vi.operacion_creacion_id
    JOIN documentos_conciliables d ON d.id=vd.documento_conciliable_id
      AND d.factura_emitida_id=cl.factura_emitida_id
    WHERE cl.id IN (${Prisma.join(input.evidenceLines.map((line) => Prisma.sql`${line.confirmingLineaId}`))})
      AND vd.tipo_linea='DOCUMENTO'::"TipoLineaVinculo"
      AND vd.importe_centimos::numeric = cl.importe::text::numeric * 100
    ORDER BY cl.id ASC
    LIMIT 101
    FOR KEY SHARE OF cl, d
  `)
  const found = new Set(rows.map((row) => row.confirmingLineaId))
  const documents = new Set(rows.map(row => row.documentoId))
  const counts = await tx.$queryRaw<Array<{ total: number }>>(Prisma.sql`
    SELECT count(*)::integer AS total FROM vinculos_movimiento_documento vd
    JOIN vinculos_movimiento_documento vi ON vi.id=CAST(${input.vinculoDiferenciaB4Id} AS uuid) AND vd.operacion_creacion_id=vi.operacion_creacion_id
    WHERE vd.movimiento_id=${input.movimientoId} AND vd.activo AND vd.tipo_linea='DOCUMENTO'::"TipoLineaVinculo" LIMIT 1
  `)
  if (!rows.length || found.size !== rows.length || documents.size !== rows.length || counts[0]?.total !== rows.length) {
    fail(409, 'LINEAS_B4_NO_CORRESPONDEN', 'Las facturas B4 aplicadas no coinciden exactamente con las líneas del confirming.')
  }
  return found
}

async function idempotencyReplay<T>(tx: Tx, actorId: number, idempotencyKey: string, payloadHash: string): Promise<T | null> {
  const rows = await tx.$queryRaw<Array<{ payloadHash: string; snapshot: unknown }>>(Prisma.sql`
    SELECT payload_hash AS "payloadHash", snapshot
    FROM auditorias_soporte_interes_confirming_draxton
    WHERE actor_id=${actorId} AND idempotency_key=${idempotencyKey}
    LIMIT 2 FOR KEY SHARE
  `)
  if (!rows.length) return null
  if (rows.length !== 1 || rows[0].payloadHash !== payloadHash || !rows[0].snapshot || typeof rows[0].snapshot !== 'object') {
    fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave idempotente ya se usó con otra decisión confirming.')
  }
  return rows[0].snapshot as T
}

/**
 * Registra soporte por factura para una diferencia B4 de INTERESES ya aprobada.
 * No crea ni consume ninguna línea B4, no modifica saldo/cobro y exige que el
 * caller haya confirmado B4 y esta evidencia documental de manera humana.
 */
export async function applyDocumentedConfirmingInterestSupport(
  db: ConfirmingQueryClient,
  actorId: number,
  raw: unknown,
): Promise<Readonly<{ idempotente: boolean; resultado: ConfirmingInterestSupportResult }>> {
  const input = parseApplyDocumentedConfirmingInterestSupport(raw)
  const payloadHash = sha256({ schema: 'CONFIRMING_INTEREST_APPLY_V1', actorId, input })
  return withWriteTransaction(db, async (tx) => {
    await assertFinanceRuntimeReady(tx as unknown as Prisma.TransactionClient)
    await assertLiveFinanceWriter(tx, actorId)
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`confirming-interest:${input.movimientoId}:${input.confirmingId}`}, 0))::text AS locked`)
    const replay = await idempotencyReplay<ConfirmingInterestSupportResult>(tx, actorId, input.idempotencyKey, payloadHash)
    if (replay) return { idempotente: true, resultado: replay }
    const movement = await tx.$queryRaw<Array<{ id: string; fecha: unknown }>>(Prisma.sql`SELECT id,fecha_operacion::date::text AS fecha FROM movimientos_bancarios WHERE id=${input.movimientoId} LIMIT 2 FOR UPDATE`)
    if (movement.length !== 1) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'El movimiento bancario no existe.')
    const selectedDocuments = await tx.$queryRaw<Array<{ invoiceId: string | null }>>(Prisma.sql`
      SELECT d.factura_emitida_id AS "invoiceId" FROM vinculos_movimiento_documento vd
      JOIN vinculos_movimiento_documento vi ON vi.id=CAST(${input.vinculoDiferenciaB4Id} AS uuid) AND vd.operacion_creacion_id=vi.operacion_creacion_id
      JOIN documentos_conciliables d ON d.id=vd.documento_conciliable_id
      WHERE vd.movimiento_id=${input.movimientoId} AND vd.activo AND vd.tipo_linea='DOCUMENTO'::"TipoLineaVinculo" LIMIT 101
    `)
    if (!selectedDocuments.length || selectedDocuments.length>100 || selectedDocuments.some(row => !row.invoiceId)) fail(409,'LINEAS_B4_NO_CORRESPONDEN','La operación no contiene un conjunto acotado de facturas emitidas.')
    const source = await readAndValidateInterestSources(tx, input.confirmingId, input.movimientoId, new Set(selectedDocuments.map(row => row.invoiceId!)))
    if (source.sourceHash !== input.sourceHash) fail(409, 'FUENTE_CONFIRMING_CAMBIADA', 'La fuente confirming cambió; relee y vuelve a confirmar.')
    const movementDay = civilDay(isoDay(movement[0].fecha))
    const documentDay = civilDay(source.document.fechaDocumento)
    if (movementDay === null || documentDay === null || movementDay - documentDay < 0 || movementDay - documentDay > 4) {
      fail(409, 'VENTANA_DOCUMENTAL_CAMBIADA', 'La fecha del abono no está dentro de la ventana documental confirming; requiere revisión.')
    }
    const selected = await assertB4DocumentsMatchConfirmingEvidence(tx, { movimientoId: input.movimientoId, vinculoDiferenciaB4Id: input.vinculoDiferenciaB4Id, evidenceLines: source.evidenceLines })
    const selectedSources = source.sources.filter(line => selected.has(line.confirmingLineaId))
    const selectedTotal = selectedSources.reduce((sum,line) => sum+line.importeInteresCentimos,0)
    if (!selectedSources.length || !Number.isSafeInteger(selectedTotal) || selectedTotal<=0) fail(409,'INTERES_NO_EXPLICITO','Las facturas pagadas no conservan intereses explícitos positivos.')
    await assertDifferenceB4ForInterest(tx, { movimientoId: input.movimientoId, vinculoDiferenciaB4Id: input.vinculoDiferenciaB4Id, total: selectedTotal })
    const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id::text AS id FROM lotes_soporte_interes_confirming_draxton
      WHERE vinculo_diferencia_id=CAST(${input.vinculoDiferenciaB4Id} AS uuid)
      LIMIT 2 FOR UPDATE
    `)
    if (existing.length) fail(409, 'SOPORTE_INTERES_EXISTENTE', 'La diferencia B4 ya tiene soporte confirming; no se duplica.')
    const loteId = randomUUID()
    const sourceSnapshot = {
      schema: 'CONFIRMING_INTERES_DOCUMENTAL_V2', confirmingId: input.confirmingId, movimientoId: input.movimientoId,
      fuenteHash: source.sourceHash, documento: source.document, evidenciaLineas: source.evidenceLines,
      lineasIntereses: selectedSources.map((item) => ({
        confirmingLineaId: item.confirmingLineaId, facturaEmitidaId: item.facturaEmitidaId,
        importeInteresCentimos: item.importeInteresCentimos, fuenteHash: hashConfirmingInterestSource(item),
      })),
    }
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO lotes_soporte_interes_confirming_draxton
        (id,movimiento_id,vinculo_diferencia_id,factura_recibida_id,importe_total_centimos,fuente_hash,fuente_snapshot,confirmado_por_id,updated_at)
      VALUES
        (CAST(${loteId} AS uuid),${input.movimientoId},CAST(${input.vinculoDiferenciaB4Id} AS uuid),${source.document.id},${selectedTotal},${source.sourceHash},CAST(${JSON.stringify(sourceSnapshot)} AS jsonb),${actorId},CURRENT_TIMESTAMP)
    `)
    for (const sourceLine of selectedSources) {
      await tx.$queryRaw(Prisma.sql`
        INSERT INTO lineas_soporte_interes_confirming_draxton
          (id,lote_id,confirming_linea_id,factura_emitida_id,importe_interes_centimos,fuente_hash,fuente_snapshot,updated_at)
        VALUES
          (CAST(${randomUUID()} AS uuid),CAST(${loteId} AS uuid),${sourceLine.confirmingLineaId},${sourceLine.facturaEmitidaId},${sourceLine.importeInteresCentimos},${hashConfirmingInterestSource(sourceLine)},CAST(${JSON.stringify(sourceLine)} AS jsonb),CURRENT_TIMESTAMP)
      `)
    }
    const result: ConfirmingInterestSupportResult = { loteId, estado: 'CONFIRMADO', version: 1, movimientoId: input.movimientoId, vinculoDiferenciaB4Id: input.vinculoDiferenciaB4Id, importeInteresCentimos: selectedTotal }
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO auditorias_soporte_interes_confirming_draxton
        (id,lote_id,actor_id,accion,idempotency_key,payload_hash,snapshot)
      VALUES
        (CAST(${randomUUID()} AS uuid),CAST(${loteId} AS uuid),${actorId},'CONFIRMACION'::"AccionAuditoriaSoporteInteresConfirmingDraxton",${input.idempotencyKey},${payloadHash},CAST(${JSON.stringify(result)} AS jsonb))
    `)
    return { idempotente: false, resultado: result }
  })
}

/**
 * Revoca exclusivamente la relación C10 después de que B4 haya sido deshecho.
 * No reactiva ni deshace B4 automáticamente y no borra evidencia ni auditoría.
 */
export async function undoDocumentedConfirmingInterestSupport(
  db: ConfirmingQueryClient,
  actorId: number,
  raw: unknown,
): Promise<Readonly<{ idempotente: boolean; resultado: ConfirmingInterestSupportResult | ConfirmingLiquidationSupportResult }>> {
  const input = parseUndoDocumentedConfirmingInterestSupport(raw)
  // Wrapper conservado para los recibos de Conciliar del refactor C9/C10. Un
  // UUID que pertenece a C11 no toca tablas C10: tras revertir B4 se registra
  // exclusivamente su recibo append-only de revocación C11. El caller de
  // acciones no depende de la forma concreta del resultado de soporte.
  try {
    const c11 = await tryUndoDocumentedConfirmingLiquidationSupport(db, actorId, {
      soporteId: input.loteId,
      version: input.version,
      motivo: input.motivo,
      idempotencyKey: input.idempotencyKey,
    })
    if (c11) return c11
  } catch (error) {
    if (error instanceof ConfirmingLiquidationRuntimeError) fail(error.status, error.code, error.message)
    throw error
  }
  const payloadHash = sha256({ schema: 'CONFIRMING_INTEREST_UNDO_V1', actorId, input })
  return withWriteTransaction(db, async (tx) => {
    await assertFinanceRuntimeReady(tx as unknown as Prisma.TransactionClient)
    await assertLiveFinanceWriter(tx, actorId)
    const lock = await tx.$queryRaw<Array<{ movimientoId: string; vinculoDiferenciaB4Id: string; importeInteresCentimos: unknown; estado: string; version: unknown }>>(Prisma.sql`
      SELECT l.movimiento_id AS "movimientoId", l.vinculo_diferencia_id::text AS "vinculoDiferenciaB4Id",
        l.importe_total_centimos AS "importeInteresCentimos", l.estado::text AS estado, l.version
      FROM lotes_soporte_interes_confirming_draxton l
      WHERE l.id=CAST(${input.loteId} AS uuid)
      LIMIT 2 FOR UPDATE
    `)
    const current = lock[0]
    if (lock.length !== 1) fail(404, 'SOPORTE_INTERES_NO_ENCONTRADO', 'El soporte documental de intereses no existe.')
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`confirming-interest:${current.movimientoId}:${input.loteId}`}, 0))::text AS locked`)
    const replay = await idempotencyReplay<ConfirmingInterestSupportResult>(tx, actorId, input.idempotencyKey, payloadHash)
    if (replay) return { idempotente: true, resultado: replay }
    if (current.estado !== 'CONFIRMADO' || integer(current.version) !== input.version) fail(409, 'VERSION_CONFLICT', 'El soporte ya cambió; relee antes de deshacer.')
    const total = integer(current.importeInteresCentimos)
    if (!total || total <= 0) fail(409, 'SOPORTE_INTERES_CORRUPTO', 'El soporte documental tiene un total inválido.')
    // La guarda SQL C10 verifica de nuevo que la diferencia B4 ya no está activa.
    await tx.$queryRaw(Prisma.sql`
      UPDATE lotes_soporte_interes_confirming_draxton
      SET estado='REVOCADO'::"EstadoSoporteInteresConfirmingDraxton",version=version+1,
        revocado_por_id=${actorId},revocado_at=CURRENT_TIMESTAMP,motivo_revocacion=${input.motivo},updated_at=CURRENT_TIMESTAMP
      WHERE id=CAST(${input.loteId} AS uuid) AND estado='CONFIRMADO'::"EstadoSoporteInteresConfirmingDraxton" AND version=${input.version}
    `)
    const result: ConfirmingInterestSupportResult = { loteId: input.loteId, estado: 'REVOCADO', version: input.version + 1, movimientoId: current.movimientoId, vinculoDiferenciaB4Id: current.vinculoDiferenciaB4Id, importeInteresCentimos: total }
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO auditorias_soporte_interes_confirming_draxton
        (id,lote_id,actor_id,accion,idempotency_key,payload_hash,snapshot)
      VALUES
        (CAST(${randomUUID()} AS uuid),CAST(${input.loteId} AS uuid),${actorId},'REVOCACION'::"AccionAuditoriaSoporteInteresConfirmingDraxton",${input.idempotencyKey},${payloadHash},CAST(${JSON.stringify(result)} AS jsonb))
    `)
    return { idempotente: false, resultado: result }
  })
}

export type ReadDocumentedConfirmingInterestInvoiceCandidatesOptions = Readonly<{
  loteIds?: readonly string[]
}>

export type ConfirmingInterestInvoicePdf = Readonly<{
  rowId: string
  href: string
}>

export type DocumentedConfirmingInterestInvoiceCandidate = Readonly<{
  loteId: string
  confirmingId: string
  importeInteresCentimos: number
  /** Referencia común proporcionada por la persona revisora, no un número del confirming. */
  referenciaDocumental: string | null
  /** Emisor de la factura bancaria normalizado para revisión humana. */
  emisorBancoDocumento: string | null
  fechaConfirming: string | null
  estado: 'LISTA_PARA_VINCULO_MANUAL' | 'AMBAR_EVIDENCIA_INSUFICIENTE' | 'YA_VINCULADA'
  facturaInteresId: string | null
  coincidencias: readonly Readonly<{
    facturaInteresId: string
    referenciaDocumental: string | null
    emisorBanco: string | null
    fechaFactura: string | null
    importeCentimos: number | null
  }>[]
  bloqueos: readonly string[]
  /** Sólo aparece si el proxy actual ya expone una fila/archivo controlado. */
  pdfConfirming: ConfirmingInterestInvoicePdf | null
  requiereConfirmacionHumana: true
  noEscrituras: true
}>

type InterestInvoiceLotRaw = {
  loteId: string; confirmingId: string; importeInteresCentimos: unknown; fechaConfirming: unknown
  facturaInteresId: unknown; referenciaConfirmingOriginal: unknown; emisorConfirmingOriginal: unknown
}
type InterestInvoiceRaw = {
  facturaInteresId: string; referenciaDocumental: unknown; emisorBanco: unknown; fechaFactura: unknown; importeDecimal: unknown
}

type ConfirmedInterestPdfRow = {
  loteId: string; archivoOneDrive: string | null; oneDriveDriveId: string | null; oneDriveItemId: string | null
  carpetaOrigen: string | null; oneDriveRutaActual: string | null
}
export async function resolveStoredConfirmingFile(tx: ConfirmingQueryClient, confirmingId: string) {
  const rows = await tx.$queryRaw<ConfirmedInterestPdfRow[]>(Prisma.sql`
    SELECT fr.archivo_onedrive AS "archivoOneDrive",fr.onedrive_drive_id AS "oneDriveDriveId",fr.onedrive_item_id AS "oneDriveItemId",
      fr.carpeta_origen AS "carpetaOrigen",fr.onedrive_ruta_actual AS "oneDriveRutaActual"
    FROM facturas_recibidas fr WHERE fr.id=${confirmingId} LIMIT 1
  `)
  const row = rows[0], locator = archivoRecibidaControlado(row)
  if (!row || !locator || !hasConfirmingDraxtonPath(row)) return null
  return { nombre: text(row.archivoOneDrive?.split(/[\\/]/).pop()) ?? 'confirming.pdf', locator }
}
async function confirmedInterestPdfs(tx: ConfirmingQueryClient): Promise<Map<string, Readonly<{ rowId: string; href: string; nombre: string; locator: { driveId: string; itemId: string } }>>> {
  const rows = await tx.$queryRaw<ConfirmedInterestPdfRow[]>(Prisma.sql`
    SELECT l.id::text AS "loteId", fr.archivo_onedrive AS "archivoOneDrive",fr.onedrive_drive_id AS "oneDriveDriveId",fr.onedrive_item_id AS "oneDriveItemId",
      fr.carpeta_origen AS "carpetaOrigen",fr.onedrive_ruta_actual AS "oneDriveRutaActual"
    FROM lotes_soporte_interes_confirming_draxton l JOIN facturas_recibidas fr ON fr.id=l.factura_recibida_id
    WHERE l.estado='CONFIRMADO'::"EstadoSoporteInteresConfirmingDraxton" ORDER BY l.id ASC LIMIT 101
  `)
  if (rows.length > 100) fail(409, 'LOTES_INTERES_TRUNCADOS', 'La población de justificantes supera el límite seguro.')
  const files = new Map<string, Readonly<{ rowId: string; href: string; nombre: string; locator: { driveId: string; itemId: string } }>>()
  for (const row of rows) {
    const locator = archivoRecibidaControlado(row)
    if (!locator || !hasConfirmingDraxtonPath(row)) continue
    const rowId = conciliarProjectionRowId('COBROS', `CONFIRMING_INTEREST_FILE:${row.loteId}`)
    files.set(row.loteId, { rowId, href: `/api/admin/finanzas/conciliar/archivo/${rowId}`, nombre: text(row.archivoOneDrive?.split(/[\\/]/).pop()) ?? 'confirming.pdf', locator })
  }
  return files
}
/** Sólo lotes C10 vigentes, no un identificador de factura o un item elegido por el cliente. */
export async function resolveConfirmedInterestPdf(tx: ConfirmingQueryClient, rowId: string) {
  return [...(await confirmedInterestPdfs(tx)).values()].find(file => file.rowId === rowId) ?? null
}

/** Exact alias comparison for the human-supplied issuer.  It deliberately does
 * not use the depositary account, nor does it accept an amount-only match. */
export function normalizeInterestInvoiceIssuer(value: unknown): string | null {
  const parsed = text(value)
  if (!parsed) return null
  const normalized = parsed.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('es-ES').replace(/[.,;:()]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized || normalized.length > 160) return null
  if (/^BBVA(?:\s+S\s*A)?$/.test(normalized) || /BANCO BILBAO VIZCAYA ARGENTARIA/.test(normalized)) return 'BBVA'
  if (/^CAIXABANK(?:\s+S\s*A)?$/.test(normalized) || /CAIXA BANK/.test(normalized)) return 'CAIXABANK'
  if (/^BANCO SANTANDER(?:\s+S\s*A)?$/.test(normalized) || /^SANTANDER(?:\s+S\s*A)?$/.test(normalized)) return 'SANTANDER'
  return null
}

export function normalizeInterestInvoiceReference(value: unknown): string | null {
  const parsed = text(value)
  return parsed && parsed.length >= 3 && parsed.length <= 160 ? parsed : null
}

/** Pure confirmation rule.  `referenciaHumana` is an asserted common reference
 * preserved in the C10 audit, never inferred from either document number. */
export function isManualInterestInvoiceEvidence(input: Readonly<{
  importeInteresCentimos: unknown
  fechaConfirming: unknown
  referenciaHumana: unknown
  emisorHumano: unknown
  factura: InterestInvoiceRaw
}>): boolean {
  const amount = integer(input.importeInteresCentimos)
  const reference = normalizeInterestInvoiceReference(input.referenciaHumana)
  const humanIssuer = normalizeInterestInvoiceIssuer(input.emisorHumano)
  const invoiceDate = isoDay(input.factura.fechaFactura)
  const confirmingDate = isoDay(input.fechaConfirming)
  const total = decimalText(input.factura.importeDecimal)
  return amount !== null && amount > 0
    && reference !== null && humanIssuer !== null
    && confirmingDate !== null && invoiceDate !== null && invoiceDate >= confirmingDate
    && total !== null && centsFromExactDecimal(total) === amount
    && normalizeInterestInvoiceIssuer(input.factura.emisorBanco) === humanIssuer
}

function manualEvidenceBlockers(lot: InterestInvoiceLotRaw, amount: number | null, pdf: ConfirmingInterestInvoicePdf | null): string[] {
  const blockers: string[] = []
  if (!normalizeInterestInvoiceReference(lot.referenciaConfirmingOriginal)) blockers.push('REFERENCIA_CONFIRMING_AUSENTE')
  if (!normalizeInterestInvoiceIssuer(lot.emisorConfirmingOriginal)) blockers.push('EMISOR_BANCARIO_CONFIRMING_AUSENTE')
  if (isoDay(lot.fechaConfirming) === null) blockers.push('FECHA_CONFIRMING_AUSENTE')
  if (amount === null || amount <= 0) blockers.push('IMPORTE_INTERES_C10_INVALIDO')
  if (!pdf) blockers.push('PDF_CONFIRMING_NO_DISPONIBLE_EN_PROXY_ACTUAL')
  return blockers
}

/**
 * Lee sólo lotes C10 y facturas recibidas ya existentes. No extrae ni compara
 * los números propios de confirming y factura bancaria: son documentos distintos.
 * Una persona aporta una referencia común y declara el emisor antes de vincular.
 */
export async function readDocumentedConfirmingInterestInvoiceCandidates(
  db: ConfirmingQueryClient,
  options: ReadDocumentedConfirmingInterestInvoiceCandidatesOptions = {},
): Promise<Readonly<{ candidates: readonly DocumentedConfirmingInterestInvoiceCandidate[]; noEscrituras: true }>> {
  const lotIds = options.loteIds === undefined ? null : [...new Set(options.loteIds.map((value) => uuid(value, 'loteIds')))].sort()
  if (lotIds !== null && lotIds.length > MAX_MOVEMENT_IDS) fail(400, 'LOTES_INVALIDOS', `loteIds admite como máximo ${MAX_MOVEMENT_IDS} identificadores.`)
  return withReadTransaction(db, async (tx) => {
    const lotFilter = lotIds === null
      ? Prisma.empty
      : Prisma.sql`AND l.id IN (${Prisma.join(lotIds.map((value) => Prisma.sql`CAST(${value} AS uuid)`) )})`
    const lots = await tx.$queryRaw<InterestInvoiceLotRaw[]>(Prisma.sql`
      SELECT l.id::text AS "loteId", l.factura_recibida_id AS "confirmingId", l.importe_total_centimos AS "importeInteresCentimos",
        origen.fecha::date::text AS "fechaConfirming", l.factura_interes_id AS "facturaInteresId",
        origen.num_factura AS "referenciaConfirmingOriginal", origen.proveedor AS "emisorConfirmingOriginal"
      FROM lotes_soporte_interes_confirming_draxton l
      JOIN facturas_recibidas origen ON origen.id=l.factura_recibida_id
      WHERE l.estado='CONFIRMADO'::"EstadoSoporteInteresConfirmingDraxton" ${lotFilter}
      ORDER BY l.id ASC
      LIMIT 101
    `)
    if (lots.length > 100) fail(409, 'LOTES_INTERES_TRUNCADOS', 'La lectura de lotes C10 supera el límite seguro.')
    if (!lots.length) return { candidates: [], noEscrituras: true as const }
    const invoices = await tx.$queryRaw<InterestInvoiceRaw[]>(Prisma.sql`
      SELECT fr.id AS "facturaInteresId", fr.num_factura AS "referenciaDocumental", fr.proveedor AS "emisorBanco",
        fr.fecha::date::text AS "fechaFactura", fr.total::text AS "importeDecimal"
      FROM facturas_recibidas fr
      WHERE fr.naturaleza_documento='FACTURA_RECIBIDA'::"NaturalezaDocumentoFinanciero"
        AND fr.calidad='VALIDA'::"CalidadFacturaRecibida" AND fr.copia_de_id IS NULL
        AND fr.conflicto_identidad=false AND fr.duplicado_externo=false
        AND btrim(COALESCE(fr.num_factura,''))<>''
        AND NOT EXISTS (
          SELECT 1 FROM documentos_conciliables d
          JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo=true
          WHERE d.factura_recibida_id=fr.id
        )
      ORDER BY fr.id ASC
      LIMIT 5_001
    `)
    if (invoices.length > 5_000) fail(409, 'FACTURAS_INTERES_TRUNCADAS', 'La población de facturas de intereses supera el límite seguro.')
    const files = await confirmedInterestPdfs(tx)
    const candidates = lots.map((lot) => {
      const amount = integer(lot.importeInteresCentimos)
      const file = files.get(lot.loteId)
      const pdf: ConfirmingInterestInvoicePdf | null = file ? { rowId: file.rowId, href: file.href } : null
      const blockers = manualEvidenceBlockers(lot, amount, pdf)
      const matching = invoices.filter((invoice) => {
        const total = decimalText(invoice.importeDecimal)
        const invoiceDate = isoDay(invoice.fechaFactura), confirmingDate = isoDay(lot.fechaConfirming)
        return invoice.facturaInteresId !== lot.confirmingId && total !== null && amount !== null
          && centsFromExactDecimal(total) === amount && invoiceDate !== null && confirmingDate !== null && invoiceDate >= confirmingDate
      })
      if (!lot.facturaInteresId && !matching.length) blockers.push('SIN_FACTURA_INTERES_POR_IMPORTE_Y_FECHA')
      if (matching.length > 20) blockers.push('FACTURAS_INTERES_DEMASIADO_AMPLIAS')
      const linked = text(lot.facturaInteresId)
      const estado: DocumentedConfirmingInterestInvoiceCandidate['estado'] = linked
        ? 'YA_VINCULADA'
        : blockers.length ? 'AMBAR_EVIDENCIA_INSUFICIENTE' : 'LISTA_PARA_VINCULO_MANUAL'
      return {
        loteId: lot.loteId, confirmingId: lot.confirmingId, importeInteresCentimos: amount ?? 0,
        referenciaDocumental: normalizeInterestInvoiceReference(lot.referenciaConfirmingOriginal), emisorBancoDocumento: normalizeInterestInvoiceIssuer(lot.emisorConfirmingOriginal),
        fechaConfirming: isoDay(lot.fechaConfirming), estado, facturaInteresId: linked,
        coincidencias: matching.slice(0, 20).map((invoice) => ({
          facturaInteresId: invoice.facturaInteresId, referenciaDocumental: text(invoice.referenciaDocumental), emisorBanco: normalizeInterestInvoiceIssuer(invoice.emisorBanco),
          fechaFactura: isoDay(invoice.fechaFactura), importeCentimos: decimalText(invoice.importeDecimal) === null ? null : centsFromExactDecimal(decimalText(invoice.importeDecimal)),
        })),
        bloqueos: blockers, pdfConfirming: pdf, requiereConfirmacionHumana: true as const, noEscrituras: true as const,
      } as const
    })
    return { candidates, noEscrituras: true as const }
  })
}

type InterestInvoiceLinkRaw = {
  loteId: string; estado: string; confirmingId: string; importeInteresCentimos: unknown; fechaConfirming: unknown; referenciaConfirmingOriginal: unknown
  facturaInteresId: string | null; referenciaFacturaInteres: unknown; emisorFacturaInteres: unknown; fechaFacturaInteres: unknown; importeFacturaInteresDecimal: unknown
  facturaInteresCalidad: string | null; facturaInteresCopiaDeId: string | null; facturaInteresConflicto: boolean | null; facturaInteresDuplicado: boolean | null; facturaInteresNaturaleza: string | null; facturaInteresTieneB4Activo: boolean | null
}

async function lockAndValidateInterestInvoiceLink(tx: Tx, input: { loteId: string; facturaInteresId: string; referenciaDocumental: string; emisorBanco: string; requireLinked: boolean }): Promise<InterestInvoiceLinkRaw> {
  const rows = await tx.$queryRaw<InterestInvoiceLinkRaw[]>(Prisma.sql`
    SELECT l.id::text AS "loteId", l.estado::text AS estado, l.factura_recibida_id AS "confirmingId", l.importe_total_centimos AS "importeInteresCentimos",
      origen.fecha::date::text AS "fechaConfirming", origen.num_factura AS "referenciaConfirmingOriginal",
      l.factura_interes_id AS "facturaInteresId", interes.num_factura AS "referenciaFacturaInteres", interes.proveedor AS "emisorFacturaInteres",
      interes.fecha::date::text AS "fechaFacturaInteres", interes.total::text AS "importeFacturaInteresDecimal", interes.calidad::text AS "facturaInteresCalidad",
      interes.copia_de_id AS "facturaInteresCopiaDeId", interes.conflicto_identidad AS "facturaInteresConflicto", interes.duplicado_externo AS "facturaInteresDuplicado",
      interes.naturaleza_documento::text AS "facturaInteresNaturaleza",
      EXISTS (
        SELECT 1 FROM documentos_conciliables d
        JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo=true
        WHERE d.factura_recibida_id=interes.id
      ) AS "facturaInteresTieneB4Activo"
    FROM lotes_soporte_interes_confirming_draxton l
    JOIN facturas_recibidas origen ON origen.id=l.factura_recibida_id
    JOIN facturas_recibidas interes ON interes.id=${input.facturaInteresId}
    WHERE l.id=CAST(${input.loteId} AS uuid)
    LIMIT 2 FOR UPDATE OF l, interes
  `)
  const row = rows[0]
  if (rows.length !== 1) fail(404, 'FACTURA_INTERES_O_SOPORTE_NO_ENCONTRADO', 'No se encontró el soporte C10 o la factura bancaria solicitada.')
  if (row.estado !== 'CONFIRMADO') fail(409, 'SOPORTE_INTERES_NO_VIGENTE', 'El soporte C10 ya no está confirmado.')
  if ((input.requireLinked && row.facturaInteresId !== input.facturaInteresId) || (!input.requireLinked && row.facturaInteresId !== null)) {
    fail(409, 'VINCULO_FACTURA_INTERES_CAMBIADO', 'La relación de factura de interés ya cambió; vuelve a leerla.')
  }
  if (!input.requireLinked) {
    if (!(await confirmedInterestPdfs(tx)).has(input.loteId)) fail(409, 'PDF_CONFIRMING_NO_DISPONIBLE_EN_PROXY', 'Falta el PDF controlado del confirming; no se puede confirmar el vínculo manual.')
    const invoice: InterestInvoiceRaw = {
      facturaInteresId: input.facturaInteresId, referenciaDocumental: row.referenciaFacturaInteres, emisorBanco: row.emisorFacturaInteres,
      fechaFactura: row.fechaFacturaInteres, importeDecimal: row.importeFacturaInteresDecimal,
    }
    const valid = isManualInterestInvoiceEvidence({
      importeInteresCentimos: row.importeInteresCentimos, fechaConfirming: row.fechaConfirming,
      referenciaHumana: input.referenciaDocumental, emisorHumano: input.emisorBanco, factura: invoice,
    })
    if (input.facturaInteresId === row.confirmingId || normalizeInterestInvoiceReference(input.referenciaDocumental) !== normalizeInterestInvoiceReference(row.referenciaConfirmingOriginal) || row.facturaInteresCalidad !== 'VALIDA' || row.facturaInteresCopiaDeId !== null || row.facturaInteresConflicto !== false || row.facturaInteresDuplicado !== false || row.facturaInteresNaturaleza !== 'FACTURA_RECIBIDA' || row.facturaInteresTieneB4Activo !== false || !valid) {
      fail(409, 'FACTURA_INTERES_EVIDENCIA_INSUFICIENTE', 'La factura bancaria requiere importe, fecha, emisor y referencia humana explícitos.')
    }
  }
  return row
}

export async function applyDocumentedConfirmingInterestInvoiceSupport(
  db: ConfirmingQueryClient,
  actorId: number,
  raw: unknown,
): Promise<Readonly<{ idempotente: boolean; resultado: ConfirmingInterestInvoiceSupportResult }>> {
  const input = parseApplyDocumentedConfirmingInterestInvoiceSupport(raw)
  const payloadHash = sha256({ schema: 'CONFIRMING_INTEREST_INVOICE_LINK_V2', actorId, input })
  return withWriteTransaction(db, async (tx) => {
    await assertFinanceRuntimeReady(tx as unknown as Prisma.TransactionClient)
    await assertLiveFinanceWriter(tx, actorId)
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`confirming-interest-invoice:${input.loteId}`}, 0))::text AS locked`)
    const replay = await idempotencyReplay<ConfirmingInterestInvoiceSupportResult>(tx, actorId, input.idempotencyKey, payloadHash)
    if (replay) return { idempotente: true, resultado: replay }
    await lockAndValidateInterestInvoiceLink(tx, { loteId: input.loteId, facturaInteresId: input.facturaInteresId, referenciaDocumental: input.referenciaDocumental, emisorBanco: input.emisorBanco, requireLinked: false })
    const updated = await tx.$queryRaw<Array<{ loteId: string }>>(Prisma.sql`
      UPDATE lotes_soporte_interes_confirming_draxton
      SET factura_interes_id=${input.facturaInteresId},factura_interes_referencia=${input.referenciaDocumental},factura_interes_emisor=${normalizeInterestInvoiceIssuer(input.emisorBanco)},updated_at=CURRENT_TIMESTAMP
      WHERE id=CAST(${input.loteId} AS uuid) AND factura_interes_id IS NULL
      RETURNING id::text AS "loteId"
    `)
    if (updated.length !== 1) fail(409, 'VINCULO_FACTURA_INTERES_CAMBIADO', 'La relación de factura de interés ya cambió; vuelve a leerla.')
    const result: ConfirmingInterestInvoiceSupportResult = { loteId: input.loteId, facturaInteresId: input.facturaInteresId, estado: 'VINCULADA' }
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO auditorias_soporte_interes_confirming_draxton
        (id,lote_id,actor_id,accion,idempotency_key,payload_hash,snapshot)
      VALUES
        (CAST(${randomUUID()} AS uuid),CAST(${input.loteId} AS uuid),${actorId},'VINCULACION_FACTURA_INTERES'::"AccionAuditoriaSoporteInteresConfirmingDraxton",${input.idempotencyKey},${payloadHash},CAST(${JSON.stringify({ ...result, referenciaHumana: input.referenciaDocumental, emisorHumano: normalizeInterestInvoiceIssuer(input.emisorBanco) })} AS jsonb))
    `)
    return { idempotente: false, resultado: result }
  })
}

export async function undoDocumentedConfirmingInterestInvoiceSupport(
  db: ConfirmingQueryClient,
  actorId: number,
  raw: unknown,
): Promise<Readonly<{ idempotente: boolean; resultado: ConfirmingInterestInvoiceSupportResult }>> {
  const input = parseUndoDocumentedConfirmingInterestInvoiceSupport(raw)
  const payloadHash = sha256({ schema: 'CONFIRMING_INTEREST_INVOICE_UNLINK_V2', actorId, input })
  return withWriteTransaction(db, async (tx) => {
    await assertFinanceRuntimeReady(tx as unknown as Prisma.TransactionClient)
    await assertLiveFinanceWriter(tx, actorId)
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`confirming-interest-invoice:${input.loteId}`}, 0))::text AS locked`)
    const replay = await idempotencyReplay<ConfirmingInterestInvoiceSupportResult>(tx, actorId, input.idempotencyKey, payloadHash)
    if (replay) return { idempotente: true, resultado: replay }
    await lockAndValidateInterestInvoiceLink(tx, { loteId: input.loteId, facturaInteresId: input.facturaInteresId, referenciaDocumental: '', emisorBanco: '', requireLinked: true })
    const updated = await tx.$queryRaw<Array<{ loteId: string }>>(Prisma.sql`
      UPDATE lotes_soporte_interes_confirming_draxton
      SET factura_interes_id=NULL,factura_interes_referencia=NULL,factura_interes_emisor=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE id=CAST(${input.loteId} AS uuid) AND factura_interes_id=${input.facturaInteresId}
      RETURNING id::text AS "loteId"
    `)
    if (updated.length !== 1) fail(409, 'VINCULO_FACTURA_INTERES_CAMBIADO', 'La relación de factura de interés ya cambió; vuelve a leerla.')
    const result: ConfirmingInterestInvoiceSupportResult = { loteId: input.loteId, facturaInteresId: null, estado: 'DESVINCULADA' }
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO auditorias_soporte_interes_confirming_draxton
        (id,lote_id,actor_id,accion,idempotency_key,payload_hash,snapshot)
      VALUES
        (CAST(${randomUUID()} AS uuid),CAST(${input.loteId} AS uuid),${actorId},'DESVINCULACION_FACTURA_INTERES'::"AccionAuditoriaSoporteInteresConfirmingDraxton",${input.idempotencyKey},${payloadHash},CAST(${JSON.stringify({ ...result, motivo: input.motivo })} AS jsonb))
    `)
    return { idempotente: false, resultado: result }
  })
}
