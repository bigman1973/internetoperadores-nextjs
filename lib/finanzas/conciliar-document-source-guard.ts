/*
 * Guardia de FUENTE documental de Conciliar.
 *
 * Esta pieza no lee ni importa el subsistema de versiones congelado. Sólo comprueba
 * filas ya existentes de producción (facturas, nóminas y adjuntos B5), sella una
 * huella opaca de su estado actual y la vuelve a leer antes de confirmar. La
 * falta de tabla, fila, identidad controlada o prueba existente es ÁMBAR; nunca
 * equivale a una fuente histórica válida.
 */
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { archivoRecibidaControlado, bibliotecaFinancieraConfigurada } from './archivo-fuente-controlada'
import type { ConciliarProjectionSource } from './conciliar-contract'

export const CONCILIAR_DOCUMENT_SOURCE_GUARD_SCHEMA = 'CONCILIAR_DOCUMENT_SOURCE_GUARD_V1' as const
export const CONCILIAR_DOCUMENT_SOURCE_GUARD_BATCH_PAGE_SIZE = 500
export const CONCILIAR_DOCUMENT_SOURCE_GUARD_BATCH_MAX_SOURCES = 25_000

export type ConciliarDocumentSourceGuardTx = Pick<Prisma.TransactionClient, '$queryRaw'>
export type ConciliarDocumentSourceGuardCode =
  | 'FUENTE_DOCUMENTAL_VIGENTE'
  | 'FUENTE_DOCUMENTAL_NO_DISPONIBLE'
  | 'ESTADO_FUENTE_DOCUMENTAL_AUSENTE'
  | 'FUENTE_DOCUMENTAL_CAMBIADA'

export type ConciliarDocumentSourceEligibility = Readonly<{
  fuenteConocida: boolean
  elegible: boolean
  versionEstado: string
  codigo: ConciliarDocumentSourceGuardCode
  requiereRevisionHumana: boolean
}>

type ServerSource = Pick<ConciliarProjectionSource,
  'kind' | 'facturaRecibidaId' | 'confirmingId' | 'nominaId' | 'adjuntoB5Id' | 'gastoId' | 'documentoConciliableId'>
type SourceKind = 'RECIBIDA' | 'CONFIRMING' | 'NOMINA' | 'B5'
type BatchSource = Readonly<{ sourceKind: SourceKind; sourceId: string; gastoId?: string; documentoConciliableId?: string; invalid?: true }>
type SourceAvailabilityRow = Readonly<{
  facturasRecibidas: unknown
  nominas: unknown
  nominaDocumentos: unknown
  adjuntosB5: unknown
}>
type SourceAvailability = Readonly<{
  facturasRecibidas: boolean
  nominas: boolean
  nominaDocumentos: boolean
  adjuntosB5: boolean
}>
type InvoiceSourceRow = Readonly<{
  sourceId: unknown
  driveId: unknown
  itemId: unknown
  archivo: unknown
  updatedAt: unknown
}>
type PayrollSourceRow = Readonly<{
  sourceId: unknown
  employeeId: unknown
  payrollMonth: unknown
  payrollYear: unknown
  payrollNet: unknown
  payrollDocumentId: unknown
  itemId: unknown
  payrollDocumentName: unknown
  payrollDocumentCreatedAt: unknown
}>
type B5SourceRow = Readonly<{
  sourceId: unknown
  state: unknown
  documentType: unknown
  movementId: unknown
  gastoId: unknown
  documentoConciliableId: unknown
  driveId: unknown
  itemId: unknown
  fileSha256: unknown
  payloadHash: unknown
  storageName: unknown
  updatedAt: unknown
}>
type BatchSourceRow = InvoiceSourceRow & PayrollSourceRow & B5SourceRow & Readonly<{
  sourceKind: unknown
}>

const OPAQUE_ID = /^[A-Za-z0-9!_.~-]{4,220}$/
const SERVER_ID = /^[^\u0000-\u001F\u007F]{1,200}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T][0-9:.+-]+(?:\s*[A-Z]{1,5})?$/

/**
 * Declaración auditable de la superficie SQL. La comprobación de catálogo es
 * siempre anterior a cualquier referencia a una tabla opcional: no se captura
 * un abort de PostgreSQL y jamás se interpreta como fuente disponible.
 */
export const conciliarDocumentSourceGuardSql = {
  schemaAvailability: `
    SELECT
      to_regclass('public.facturas_recibidas') IS NOT NULL AS "facturasRecibidas",
      to_regclass('public.nominas') IS NOT NULL AS nominas,
      to_regclass('public.nomina_documentos') IS NOT NULL AS "nominaDocumentos",
      to_regclass('public.adjuntos_pendientes_b5') IS NOT NULL AS "adjuntosB5"
  `,
  receivedSource: `
    SELECT fr.id AS "sourceId",fr.onedrive_drive_id AS "driveId",fr.onedrive_item_id AS "itemId",
      fr.archivo_onedrive AS archivo,fr.updated_at::text AS "updatedAt"
    FROM facturas_recibidas fr
    WHERE fr.id=?
    LIMIT 2 FOR KEY SHARE OF fr
  `,
  payrollSource: `
    SELECT n.id AS "sourceId",n.empleado_id AS "employeeId",n.mes AS "payrollMonth",n.anio AS "payrollYear",
      n.neto_percibir::text AS "payrollNet",nd.id::text AS "payrollDocumentId",nd.drive_item_id AS "itemId",
      nd.nombre AS "payrollDocumentName",nd.created_at::text AS "payrollDocumentCreatedAt"
    FROM nominas n
    JOIN nomina_documentos nd ON nd.nomina_id=n.id AND nd.tipo='NOMINA'
    WHERE n.id=?
    LIMIT 2 FOR KEY SHARE OF n,nd
  `,
  b5Source: `
    SELECT a.id::text AS "sourceId",a.estado::text AS state,a.tipo_documento AS "documentType",a.movimiento_id AS "movementId",
      a.gasto_id AS "gastoId",a.documento_conciliable_id::text AS "documentoConciliableId",a.drive_id AS "driveId",
      a.onedrive_item_id AS "itemId",a.file_sha256 AS "fileSha256",a.payload_hash AS "payloadHash",
      a.storage_name AS "storageName",a.updated_at::text AS "updatedAt"
    FROM adjuntos_pendientes_b5 a
    WHERE a.id=CAST(? AS uuid)
    LIMIT 2 FOR KEY SHARE OF a
  `,
} as const

/** Classifies the narrow SELECT/SELECT-lock surface admitted to this helper. */
export function classifyConciliarDocumentSourceGuardSql(statement: string): 'READ' | 'LOCK' | 'REJECTED' {
  const normalized = statement.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').trim()
  if (!/^(?:SELECT|WITH)\b/i.test(normalized)) return 'REJECTED'
  const withoutLockClauses = normalized.replace(/\bFOR\s+(?:NO\s+KEY\s+UPDATE|KEY\s+SHARE|UPDATE|SHARE)(?:\s+OF\s+[A-Za-z0-9_,.\s]+)?/gi, ' ')
  if (/\b(?:INSERT|UPDATE|DELETE|MERGE|CALL|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/i.test(withoutLockClauses)) return 'REJECTED'
  if (/\b(?:ROW_NUMBER|TRANSLATE)\s*\(/i.test(normalized)) return 'REJECTED'
  return /\bFOR\s+(?:UPDATE|NO\s+KEY\s+UPDATE|SHARE|KEY\s+SHARE)\b/i.test(normalized) ? 'LOCK' : 'READ'
}

function serverId(value: unknown): string | null {
  return typeof value === 'string' && SERVER_ID.test(value) ? value : null
}
function opaqueId(value: unknown): string | null {
  return typeof value === 'string' && OPAQUE_ID.test(value) ? value : null
}
function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null
}
function sha256(value: unknown): string | null {
  return typeof value === 'string' && SHA256.test(value) ? value : null
}
function timestamp(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 80 && TIMESTAMP.test(value) ? value : null
}
function text(value: unknown, max = 1_000): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001F\u007F]/.test(value) ? value : null
}
function sourceKind(value: unknown): value is SourceKind {
  return value === 'RECIBIDA' || value === 'CONFIRMING' || value === 'NOMINA' || value === 'B5'
}
function sourceKey(source: BatchSource): string {
  if (source.invalid) return `INVALID\u0000${source.sourceKind}`
  return source.sourceKind === 'B5'
    ? `${source.sourceKind}\u0000${source.sourceId}\u0000${source.gastoId ?? ''}\u0000${source.documentoConciliableId ?? ''}`
    : `${source.sourceKind}\u0000${source.sourceId}`
}
function unavailable(): ConciliarDocumentSourceEligibility {
  return {
    fuenteConocida: false,
    elegible: false,
    versionEstado: failureVersionState('FUENTE_DOCUMENTAL_NO_DISPONIBLE'),
    codigo: 'FUENTE_DOCUMENTAL_NO_DISPONIBLE',
    requiereRevisionHumana: true,
  }
}
function failureVersionState(code: ConciliarDocumentSourceGuardCode): string {
  return createHash('sha256').update(JSON.stringify({ schema: CONCILIAR_DOCUMENT_SOURCE_GUARD_SCHEMA, code }), 'utf8').digest('hex')
}
function sourceVersionState(input: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify({ schema: CONCILIAR_DOCUMENT_SOURCE_GUARD_SCHEMA, ...input }), 'utf8').digest('hex')
}
function available(input: Record<string, unknown>): ConciliarDocumentSourceEligibility {
  return {
    fuenteConocida: true,
    elegible: true,
    versionEstado: sourceVersionState(input),
    codigo: 'FUENTE_DOCUMENTAL_VIGENTE',
    requiereRevisionHumana: false,
  }
}

/** Documentary kinds are always guarded, including malformed persisted pointers. */
export function supportsConciliarDocumentSourceGuard(source: ServerSource): boolean {
  return sourceKindFor(source) !== null
}

function sourceKindFor(source: ServerSource): SourceKind | null {
  if (source.kind === 'PAGO_FACTURA_RECIBIDA') return 'RECIBIDA'
  if (source.kind === 'COBRO_CONFIRMING') return 'CONFIRMING'
  if (source.kind === 'PAGO_NOMINA') return 'NOMINA'
  if (source.kind === 'PAGO_TICKET_B5') return 'B5'
  return null
}
function invalidBatchSource(sourceKind: SourceKind): BatchSource {
  // No raw malformed ID is carried into SQL. The sentinel is only a map key and
  // is excluded from every source query below.
  return { sourceKind, sourceId: `INVALID_${sourceKind}`, invalid: true }
}
function batchSourceFor(source: ServerSource): BatchSource | null {
  const kind = sourceKindFor(source)
  if (!kind) return null
  if (kind === 'RECIBIDA') {
    const sourceId = serverId(source.facturaRecibidaId)
    return sourceId ? { sourceKind: kind, sourceId } : invalidBatchSource(kind)
  }
  if (kind === 'CONFIRMING') {
    const sourceId = serverId(source.confirmingId)
    return sourceId ? { sourceKind: kind, sourceId } : invalidBatchSource(kind)
  }
  if (kind === 'NOMINA') {
    const sourceId = serverId(source.nominaId)
    return sourceId ? { sourceKind: kind, sourceId } : invalidBatchSource(kind)
  }
  if (kind === 'B5') {
    const sourceId = uuid(source.adjuntoB5Id)
    const gastoId = serverId(source.gastoId)
    const documentoConciliableId = uuid(source.documentoConciliableId)
    return sourceId && gastoId && documentoConciliableId
      ? { sourceKind: kind, sourceId, gastoId, documentoConciliableId }
      : invalidBatchSource(kind)
  }
  return invalidBatchSource(kind)
}

/** Stable map key for a server-owned projection source; never accepts a locator. */
export function conciliarDocumentSourceBatchSourceKey(source: ServerSource): string | null {
  const resolved = batchSourceFor(source)
  return resolved ? sourceKey(resolved) : null
}

/** Deduplicates only typed server identifiers; browser fields and C11 hashes never participate. */
export function dedupeConciliarDocumentSourceBatchSources(sources: readonly ServerSource[]): readonly BatchSource[] {
  const deduped = new Map<string, BatchSource>()
  for (const source of sources) {
    const resolved = batchSourceFor(source)
    if (resolved) deduped.set(sourceKey(resolved), resolved)
  }
  return [...deduped.values()].sort((left, right) => sourceKey(left).localeCompare(sourceKey(right)))
}

/** Public-safe wording. It intentionally does not disclose a table, locator, hash or schema state. */
export function conciliarDocumentSourceGuardMessage(code: ConciliarDocumentSourceGuardCode): string {
  switch (code) {
    case 'FUENTE_DOCUMENTAL_NO_DISPONIBLE': return 'No se puede comprobar la fuente documental actual; requiere revisión antes de confirmar.'
    case 'ESTADO_FUENTE_DOCUMENTAL_AUSENTE': return 'La proyección no conserva una huella documental verificable; actualiza la lista y revisa el documento.'
    case 'FUENTE_DOCUMENTAL_CAMBIADA': return 'La fuente documental cambió desde que se preparó la fila. Actualiza la lista y revisa el documento.'
    case 'FUENTE_DOCUMENTAL_VIGENTE': return 'La fuente documental vigente permite continuar.'
  }
}

async function sourceAvailabilityTx(tx: ConciliarDocumentSourceGuardTx): Promise<SourceAvailability> {
  const rows = await tx.$queryRaw<SourceAvailabilityRow[]>(Prisma.sql`
    SELECT
      to_regclass('public.facturas_recibidas') IS NOT NULL AS "facturasRecibidas",
      to_regclass('public.nominas') IS NOT NULL AS nominas,
      to_regclass('public.nomina_documentos') IS NOT NULL AS "nominaDocumentos",
      to_regclass('public.adjuntos_pendientes_b5') IS NOT NULL AS "adjuntosB5"
  `)
  const row = rows.length === 1 ? rows[0] : null
  return {
    facturasRecibidas: row?.facturasRecibidas === true,
    nominas: row?.nominas === true,
    nominaDocumentos: row?.nominaDocumentos === true,
    adjuntosB5: row?.adjuntosB5 === true,
  }
}
function sourceTableAvailable(source: BatchSource, availability: SourceAvailability): boolean {
  if (source.sourceKind === 'RECIBIDA' || source.sourceKind === 'CONFIRMING') return availability.facturasRecibidas
  if (source.sourceKind === 'NOMINA') return availability.nominas && availability.nominaDocumentos
  return availability.adjuntosB5
}

function invoiceEligibility(source: BatchSource, row: InvoiceSourceRow): ConciliarDocumentSourceEligibility {
  const sourceId = serverId(row.sourceId)
  const updatedAt = timestamp(row.updatedAt)
  if (!sourceId || sourceId !== source.sourceId || !updatedAt) return unavailable()
  const controlled = archivoRecibidaControlado({
    oneDriveDriveId: typeof row.driveId === 'string' ? row.driveId : null,
    oneDriveItemId: typeof row.itemId === 'string' ? row.itemId : null,
    archivoOneDrive: typeof row.archivo === 'string' ? row.archivo : null,
  })
  if (!controlled) return unavailable()
  return available({
    sourceKind: source.sourceKind,
    sourceId,
    driveId: controlled.driveId,
    itemId: controlled.itemId,
    archivo: text(row.archivo, 4_000),
    updatedAt,
  })
}
function payrollEligibility(source: BatchSource, row: PayrollSourceRow, configuredDrive: string | null): ConciliarDocumentSourceEligibility {
  const sourceId = serverId(row.sourceId)
  const employeeId = serverId(row.employeeId)
  const documentId = uuid(row.payrollDocumentId)
  const itemId = opaqueId(row.itemId)
  const name = text(row.payrollDocumentName)
  const createdAt = timestamp(row.payrollDocumentCreatedAt)
  const net = typeof row.payrollNet === 'string' && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(row.payrollNet) ? row.payrollNet : null
  const month = typeof row.payrollMonth === 'number' || typeof row.payrollMonth === 'bigint' ? Number(row.payrollMonth) : NaN
  const year = typeof row.payrollYear === 'number' || typeof row.payrollYear === 'bigint' ? Number(row.payrollYear) : NaN
  if (!sourceId || sourceId !== source.sourceId || !employeeId || !documentId || !itemId || !name || !createdAt || !net
    || !Number.isSafeInteger(month) || month < 1 || month > 12 || !Number.isSafeInteger(year) || year < 2000 || year > 9999
    || !configuredDrive) return unavailable()
  return available({
    sourceKind: source.sourceKind,
    sourceId,
    employeeId,
    month,
    year,
    net,
    driveId: configuredDrive,
    documentId,
    itemId,
    name,
    createdAt,
  })
}
function b5Eligibility(source: BatchSource, row: B5SourceRow, configuredDrive: string | null): ConciliarDocumentSourceEligibility {
  const sourceId = uuid(row.sourceId)
  const gastoId = serverId(row.gastoId)
  const documentoConciliableId = uuid(row.documentoConciliableId)
  const driveId = opaqueId(row.driveId)
  const itemId = opaqueId(row.itemId)
  const fileSha = sha256(row.fileSha256)
  const payloadHash = sha256(row.payloadHash)
  const storageName = text(row.storageName, 1_000)
  const updatedAt = timestamp(row.updatedAt)
  if (!sourceId || sourceId !== source.sourceId || !gastoId || gastoId !== source.gastoId
    || !documentoConciliableId || documentoConciliableId !== source.documentoConciliableId
    || row.state !== 'UPLOAD_COMPLETO' || row.documentType !== 'TICKET' || !configuredDrive || driveId !== configuredDrive
    || !itemId || !fileSha || !payloadHash || !storageName || !updatedAt) return unavailable()
  return available({
    sourceKind: source.sourceKind,
    sourceId,
    gastoId,
    documentoConciliableId,
    movementId: serverId(row.movementId),
    driveId,
    itemId,
    fileSha,
    payloadHash,
    storageName,
    updatedAt,
  })
}
function eligibilityFromSourceRow(source: BatchSource, row: InvoiceSourceRow | PayrollSourceRow | B5SourceRow, configuredDrive: string | null): ConciliarDocumentSourceEligibility {
  if (source.sourceKind === 'RECIBIDA' || source.sourceKind === 'CONFIRMING') return invoiceEligibility(source, row as InvoiceSourceRow)
  if (source.sourceKind === 'NOMINA') return payrollEligibility(source, row as PayrollSourceRow, configuredDrive)
  return b5Eligibility(source, row as B5SourceRow, configuredDrive)
}

async function inspectConciliarDocumentSourceTx(
  tx: ConciliarDocumentSourceGuardTx,
  source: ServerSource,
  lock: boolean,
): Promise<ConciliarDocumentSourceEligibility> {
  const resolved = batchSourceFor(source)
  if (!resolved) return unavailable()
  if (resolved.invalid) return unavailable()
  const availability = await sourceAvailabilityTx(tx)
  if (!sourceTableAvailable(resolved, availability)) return unavailable()
  const suffixInvoice = lock ? Prisma.sql` FOR KEY SHARE OF fr` : Prisma.empty
  const suffixPayroll = lock ? Prisma.sql` FOR KEY SHARE OF n,nd` : Prisma.empty
  const suffixB5 = lock ? Prisma.sql` FOR KEY SHARE OF a` : Prisma.empty
  let rows: readonly (InvoiceSourceRow | PayrollSourceRow | B5SourceRow)[]
  if (resolved.sourceKind === 'RECIBIDA' || resolved.sourceKind === 'CONFIRMING') {
    rows = await tx.$queryRaw<InvoiceSourceRow[]>(Prisma.sql`
      SELECT fr.id AS "sourceId",fr.onedrive_drive_id AS "driveId",fr.onedrive_item_id AS "itemId",
        fr.archivo_onedrive AS archivo,fr.updated_at::text AS "updatedAt"
      FROM facturas_recibidas fr
      WHERE fr.id=${resolved.sourceId}
      LIMIT 2${suffixInvoice}
    `)
  } else if (resolved.sourceKind === 'NOMINA') {
    rows = await tx.$queryRaw<PayrollSourceRow[]>(Prisma.sql`
      SELECT n.id AS "sourceId",n.empleado_id AS "employeeId",n.mes AS "payrollMonth",n.anio AS "payrollYear",
        n.neto_percibir::text AS "payrollNet",nd.id::text AS "payrollDocumentId",nd.drive_item_id AS "itemId",
        nd.nombre AS "payrollDocumentName",nd.created_at::text AS "payrollDocumentCreatedAt"
      FROM nominas n
      JOIN nomina_documentos nd ON nd.nomina_id=n.id AND nd.tipo='NOMINA'
      WHERE n.id=${resolved.sourceId}
      LIMIT 2${suffixPayroll}
    `)
  } else {
    rows = await tx.$queryRaw<B5SourceRow[]>(Prisma.sql`
      SELECT a.id::text AS "sourceId",a.estado::text AS state,a.tipo_documento AS "documentType",a.movimiento_id AS "movementId",
        a.gasto_id AS "gastoId",a.documento_conciliable_id::text AS "documentoConciliableId",a.drive_id AS "driveId",
        a.onedrive_item_id AS "itemId",a.file_sha256 AS "fileSha256",a.payload_hash AS "payloadHash",
        a.storage_name AS "storageName",a.updated_at::text AS "updatedAt"
      FROM adjuntos_pendientes_b5 a
      WHERE a.id=CAST(${resolved.sourceId} AS uuid)
      LIMIT 2${suffixB5}
    `)
  }
  if (rows.length !== 1) return unavailable()
  return eligibilityFromSourceRow(resolved, rows[0]!, bibliotecaFinancieraConfigurada())
}

function sourceBatchQuery(page: readonly BatchSource[], availability: SourceAvailability): Prisma.Sql | null {
  const branches: Prisma.Sql[] = []
  if (availability.facturasRecibidas) branches.push(Prisma.sql`
    SELECT r."sourceKind",r."sourceId" AS "requestedSourceId",fr.id AS "sourceId",fr.onedrive_drive_id AS "driveId",fr.onedrive_item_id AS "itemId",
      fr.archivo_onedrive AS archivo,fr.updated_at::text AS "updatedAt",
      NULL::text AS "employeeId",NULL::integer AS "payrollMonth",NULL::integer AS "payrollYear",NULL::text AS "payrollNet",
      NULL::text AS "payrollDocumentId",NULL::text AS "payrollDocumentName",NULL::text AS "payrollDocumentCreatedAt",
      NULL::text AS state,NULL::text AS "documentType",NULL::text AS "movementId",NULL::text AS "gastoId",
      NULL::text AS "documentoConciliableId",NULL::text AS "fileSha256",NULL::text AS "payloadHash",NULL::text AS "storageName"
    FROM requested r
    JOIN facturas_recibidas fr ON r."sourceKind" IN ('RECIBIDA','CONFIRMING') AND fr.id=r."sourceId"
  `)
  if (availability.nominas && availability.nominaDocumentos) branches.push(Prisma.sql`
    SELECT r."sourceKind",r."sourceId" AS "requestedSourceId",n.id AS "sourceId",NULL::text AS "driveId",nd.drive_item_id AS "itemId",
      NULL::text AS archivo,NULL::text AS "updatedAt",
      n.empleado_id AS "employeeId",n.mes AS "payrollMonth",n.anio AS "payrollYear",n.neto_percibir::text AS "payrollNet",
      nd.id::text AS "payrollDocumentId",nd.nombre AS "payrollDocumentName",nd.created_at::text AS "payrollDocumentCreatedAt",
      NULL::text AS state,NULL::text AS "documentType",NULL::text AS "movementId",NULL::text AS "gastoId",
      NULL::text AS "documentoConciliableId",NULL::text AS "fileSha256",NULL::text AS "payloadHash",NULL::text AS "storageName"
    FROM requested r
    JOIN nominas n ON r."sourceKind"='NOMINA' AND n.id=r."sourceId"
    JOIN nomina_documentos nd ON nd.nomina_id=n.id AND nd.tipo='NOMINA'
  `)
  if (availability.adjuntosB5) branches.push(Prisma.sql`
    SELECT r."sourceKind",r."sourceId" AS "requestedSourceId",a.id::text AS "sourceId",a.drive_id AS "driveId",a.onedrive_item_id AS "itemId",
      NULL::text AS archivo,a.updated_at::text AS "updatedAt",
      NULL::text AS "employeeId",NULL::integer AS "payrollMonth",NULL::integer AS "payrollYear",NULL::text AS "payrollNet",
      NULL::text AS "payrollDocumentId",NULL::text AS "payrollDocumentName",NULL::text AS "payrollDocumentCreatedAt",
      a.estado::text AS state,a.tipo_documento AS "documentType",a.movimiento_id AS "movementId",a.gasto_id AS "gastoId",
      a.documento_conciliable_id::text AS "documentoConciliableId",a.file_sha256 AS "fileSha256",a.payload_hash AS "payloadHash",a.storage_name AS "storageName"
    FROM requested r
    JOIN adjuntos_pendientes_b5 a ON r."sourceKind"='B5' AND a.id::text=r."sourceId"
  `)
  if (!branches.length) return null
  const values = page.map(source => Prisma.sql`(${source.sourceKind},${source.sourceId})`)
  return Prisma.sql`
    WITH requested AS (
      SELECT v."sourceKind",v."sourceId"
      FROM (VALUES ${Prisma.join(values)}) AS v("sourceKind","sourceId")
    ), source_rows AS (
      ${Prisma.join(branches, ' UNION ALL ')}
    )
    SELECT * FROM source_rows
    ORDER BY "sourceKind" ASC,"requestedSourceId" ASC
    LIMIT ${page.length + 1}
  `
}

export const conciliarDocumentSourceGuardBatchSql = {
  pageSize: CONCILIAR_DOCUMENT_SOURCE_GUARD_BATCH_PAGE_SIZE,
  maxSources: CONCILIAR_DOCUMENT_SOURCE_GUARD_BATCH_MAX_SOURCES,
  queryForTests: (sources: readonly ServerSource[]): Prisma.Sql | null => {
    const page = dedupeConciliarDocumentSourceBatchSources(sources)
    if (!page.length || page.length > CONCILIAR_DOCUMENT_SOURCE_GUARD_BATCH_PAGE_SIZE) throw new Error('CONCILIAR_DOCUMENT_SOURCE_GUARD_BATCH_TEST_PAGE_INVALID')
    const queryable = page.filter(source => !source.invalid)
    return queryable.length ? sourceBatchQuery(queryable, { facturasRecibidas: true, nominas: true, nominaDocumentos: true, adjuntosB5: true }) : null
  },
} as const

/**
 * Preloads every documentary source in bounded set-based pages. It has no cache
 * outside the caller transaction and marks missing/unverifiable source records
 * ÁMBAR rather than carrying a historic-green compatibility state.
 */
export async function preloadConciliarDocumentSourceEligibilityTx(
  tx: ConciliarDocumentSourceGuardTx,
  sources: readonly ServerSource[],
): Promise<ReadonlyMap<string, ConciliarDocumentSourceEligibility>> {
  const requested = dedupeConciliarDocumentSourceBatchSources(sources)
  if (requested.length > CONCILIAR_DOCUMENT_SOURCE_GUARD_BATCH_MAX_SOURCES) throw new Error('CONCILIAR_DOCUMENT_SOURCE_GUARD_BATCH_TOO_MANY_SOURCES')
  const result = new Map<string, ConciliarDocumentSourceEligibility>(requested.map(source => [sourceKey(source), unavailable()]))
  if (!requested.length) return result
  const availability = await sourceAvailabilityTx(tx)
  const configuredDrive = bibliotecaFinancieraConfigurada()
  for (let start = 0; start < requested.length; start += CONCILIAR_DOCUMENT_SOURCE_GUARD_BATCH_PAGE_SIZE) {
    const page = requested.slice(start, start + CONCILIAR_DOCUMENT_SOURCE_GUARD_BATCH_PAGE_SIZE)
    const queryable = page.filter(source => !source.invalid)
    if (!queryable.length) continue
    const query = sourceBatchQuery(queryable, availability)
    if (!query) continue
    const rows = await tx.$queryRaw<BatchSourceRow[]>(query)
    if (rows.length > queryable.length) throw new Error('CONCILIAR_DOCUMENT_SOURCE_GUARD_BATCH_SOURCE_AMBIGUOUS')
    const expected = new Map(queryable.map(source => [sourceKey(source), source]))
    const seen = new Set<string>()
    for (const row of rows) {
      const sourceId = serverId(row.sourceId)
      if (!sourceKind(row.sourceKind) || !sourceId) throw new Error('CONCILIAR_DOCUMENT_SOURCE_GUARD_BATCH_ROW_INVALID')
      const key = row.sourceKind === 'B5'
        ? sourceKey({ sourceKind: row.sourceKind, sourceId, gastoId: serverId(row.gastoId) ?? undefined, documentoConciliableId: uuid(row.documentoConciliableId) ?? undefined })
        : sourceKey({ sourceKind: row.sourceKind, sourceId })
      const source = expected.get(key)
      if (!source || seen.has(key)) throw new Error('CONCILIAR_DOCUMENT_SOURCE_GUARD_BATCH_SOURCE_AMBIGUOUS')
      seen.add(key)
      result.set(key, eligibilityFromSourceRow(source, row, configuredDrive))
    }
  }
  return result
}

/** Read-only source lookup used while sealing the projection. */
export async function readConciliarDocumentSourceEligibilityTx(
  tx: ConciliarDocumentSourceGuardTx,
  source: ServerSource,
): Promise<ConciliarDocumentSourceEligibility> {
  return inspectConciliarDocumentSourceTx(tx, source, false)
}

/**
 * Re-resolves and locks the same production source immediately before B4. A
 * missing source schema or row is blocked before any B4 DML; no state crosses
 * actions and no source is auto-repaired or auto-promoted.
 */
export async function lockConciliarDocumentSourceForConfirmationTx(
  tx: ConciliarDocumentSourceGuardTx,
  input: Readonly<{ source: ServerSource; expectedVersionState: string | null | undefined }>,
): Promise<ConciliarDocumentSourceEligibility> {
  const current = await inspectConciliarDocumentSourceTx(tx, input.source, true)
  if (!current.elegible) return current
  if (typeof input.expectedVersionState !== 'string' || input.expectedVersionState.length < 1) {
    return { ...current, elegible: false, codigo: 'ESTADO_FUENTE_DOCUMENTAL_AUSENTE', requiereRevisionHumana: true }
  }
  if (input.expectedVersionState !== current.versionEstado) {
    return { ...current, elegible: false, codigo: 'FUENTE_DOCUMENTAL_CAMBIADA', requiereRevisionHumana: true }
  }
  return current
}

/** The helper is intentionally read/lock-only: no B4/B5/C11 or source mutation API is exported. */
export const conciliarDocumentSourceGuardIsReadOnly = true as const
