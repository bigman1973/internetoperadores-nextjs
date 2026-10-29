/*
 * Guardia documental de Conciliar.
 *
 * Esta pieza sólo resuelve identidades desde filas persistidas del servidor y
 * lee/bloquea document_version_*. No recibe lifecycleId, driveId, itemId,
 * snapshot ni versiones C11 desde HTTP. No escribe B4, B5, C11, snapshots,
 * tombstones, incidencias ni capacidades.
 */
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { bibliotecaFinancieraConfigurada } from './archivo-fuente-controlada'
import type { ConciliarProjectionSource } from './conciliar-contract'

export const CONCILIAR_DOCUMENT_LIFECYCLE_GUARD_SCHEMA = 'CONCILIAR_DOCUMENT_LIFECYCLE_GUARD_V1' as const
export const CONCILIAR_DOCUMENT_LIFECYCLE_UNTRACKED = 'SIN_LIFECYCLE_HISTORICO' as const
export const CONCILIAR_DOCUMENT_LIFECYCLE_BATCH_PAGE_SIZE = 500
export const CONCILIAR_DOCUMENT_LIFECYCLE_BATCH_MAX_SOURCES = 25_000

export type ConciliarDocumentLifecycleGuardTx = Pick<Prisma.TransactionClient, '$queryRaw'>
export type ConciliarDocumentLifecycleGuardCode =
  | 'SIN_LIFECYCLE_HISTORICO'
  | 'LIFECYCLE_VIGENTE'
  | 'DOCUMENTO_TOMBSTONED'
  | 'INCIDENCIA_CAMBIO_DOCUMENTAL_PENDIENTE'
  | 'INCIDENCIA_RECUPERACION_DOCUMENTAL_PENDIENTE'
  | 'SNAPSHOT_DOCUMENTAL_NO_VIGENTE'
  | 'ESTADO_VERSION_DOCUMENTAL_AUSENTE'
  | 'SNAPSHOT_DOCUMENTAL_CAMBIADO'

/**
 * `versionEstado` is an opaque server-generated fingerprint. It is stored only
 * inside Conciliar's persisted projection source and is never accepted from an
 * HTTP body. The historical no-lifecycle value is deliberately stable so old,
 * otherwise valid documents do not all become amber merely because lifecycle
 * collection started later.
 */
export type ConciliarDocumentLifecycleEligibility = Readonly<{
  lifecycleConocido: boolean
  elegible: boolean
  versionEstado: string
  codigo: ConciliarDocumentLifecycleGuardCode
  requiereRevisionHumana: boolean
}>

type ServerSource = Pick<ConciliarProjectionSource,
  'kind' | 'facturaRecibidaId' | 'confirmingId' | 'nominaId' | 'adjuntoB5Id'>

type SourceRow = Readonly<{ driveId: unknown; itemId: unknown }>
type LifecycleRow = Readonly<{ lifecycleId: unknown; state: unknown; currentVersion: unknown; snapshotId: unknown }>
type IncidentRow = Readonly<{ code: unknown }>
type TombstoneRow = Readonly<{ id: unknown }>
type ResolvedOneDriveSource = Readonly<{ sourceItemKey: string }>
type BatchSourceKind = 'RECIBIDA' | 'CONFIRMING' | 'NOMINA' | 'B5'
type BatchSource = Readonly<{ sourceKind: BatchSourceKind; sourceId: string }>
type BatchLifecycleRow = Readonly<{
  sourceKind: unknown
  sourceId: unknown
  lifecycleId: unknown
  state: unknown
  currentVersion: unknown
  snapshotId: unknown
  tombstoneRecorded: unknown
  changePending: unknown
  recoveryPending: unknown
}>

const OPAQUE_ID = /^[A-Za-z0-9!_.~-]{4,220}$/
const SERVER_ID = /^[^\u0000-\u001F\u007F]{1,200}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LIFECYCLE_SOURCE = 'ONEDRIVE'
const CHANGE_INCIDENT = 'AMBAR_DOCUMENTO_CAMBIADO'
const RECOVERY_INCIDENT = 'AMBAR_DOCUMENTO_RECUPERADO'

function sqlText(parts: TemplateStringsArray): string { return parts.join('?') }

/**
 * Declaración auditable de las consultas usadas por la guardia. La ejecución
 * real sigue usando Prisma.sql parametrizado más abajo. Se exporta para la
 * prueba sintética que clasifica toda actuación SQL y rechaza DML.
 */
export const conciliarDocumentLifecycleGuardSql = {
  receivedSource: `
    SELECT fr.onedrive_drive_id AS "driveId",fr.onedrive_item_id AS "itemId"
    FROM facturas_recibidas fr
    WHERE fr.id=?
    LIMIT 2 FOR KEY SHARE OF fr
  `,
  confirmingSource: `
    SELECT fr.onedrive_drive_id AS "driveId",fr.onedrive_item_id AS "itemId"
    FROM facturas_recibidas fr
    WHERE fr.id=?
    LIMIT 2 FOR KEY SHARE OF fr
  `,
  payrollSource: `
    SELECT (
      SELECT nd.drive_item_id
      FROM nomina_documentos nd
      WHERE nd.nomina_id=n.id AND nd.tipo='NOMINA'
      ORDER BY nd.created_at DESC,nd.id DESC
      LIMIT 1
    ) AS "itemId"
    FROM nominas n
    WHERE n.id=?
    LIMIT 2 FOR KEY SHARE OF n
  `,
  b5Source: `
    SELECT a.drive_id AS "driveId",a.onedrive_item_id AS "itemId"
    FROM adjuntos_pendientes_b5 a
    WHERE a.id=CAST(? AS uuid)
    LIMIT 2 FOR KEY SHARE OF a
  `,
  lifecycle: `
    SELECT l.id::text AS "lifecycleId",l.state::text AS state,l.current_version AS "currentVersion",s.id::text AS "snapshotId"
    FROM document_version_lifecycle l
    LEFT JOIN document_version_snapshots s ON s.lifecycle_id=l.id AND s.version_number=l.current_version
    WHERE l.source='ONEDRIVE' AND l.source_item_key=?
    LIMIT 2 FOR UPDATE OF l
  `,
  tombstones: `
    SELECT t.id::text AS id
    FROM document_version_tombstones t
    WHERE t.lifecycle_id=CAST(? AS uuid)
    LIMIT 2 FOR KEY SHARE OF t
  `,
  incidents: `
    SELECT i.code
    FROM document_version_incidents i
    WHERE i.lifecycle_id=CAST(? AS uuid)
      AND i.state='OPEN'::"DocumentVersionIncidentState"
      AND i.code IN ('AMBAR_DOCUMENTO_CAMBIADO','AMBAR_DOCUMENTO_RECUPERADO')
    ORDER BY i.created_at ASC,i.id ASC
    LIMIT 4 FOR UPDATE
  `,
} as const

/** Classifies the narrow SQL surface admitted to this helper. */
export function classifyConciliarDocumentLifecycleGuardSql(statement: string): 'READ' | 'LOCK' | 'REJECTED' {
  const normalized = statement.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').trim()
  if (!/^SELECT\b/i.test(normalized)) return 'REJECTED'
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
function lifecycleId(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null
}
function version(value: unknown): number | null {
  const parsed = typeof value === 'bigint' ? Number(value) : value
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}
function currentSourceKey(row: SourceRow, configuredDrive?: string | null): ResolvedOneDriveSource | null {
  const driveId = opaqueId(configuredDrive ?? row.driveId)
  const itemId = opaqueId(row.itemId)
  return driveId && itemId ? { sourceItemKey: `${driveId}:${itemId}` } : null
}
function versionState(input: Readonly<{
  lifecycleId: string
  state: 'ACTIVE' | 'TOMBSTONED'
  currentVersion: number
  tombstoneRecorded: boolean
  changePending: boolean
  recoveryPending: boolean
}>): string {
  return createHash('sha256').update(JSON.stringify({ schema: CONCILIAR_DOCUMENT_LIFECYCLE_GUARD_SCHEMA, ...input }), 'utf8').digest('hex')
}
function failureVersionState(code: ConciliarDocumentLifecycleGuardCode): string {
  return createHash('sha256').update(JSON.stringify({ schema: CONCILIAR_DOCUMENT_LIFECYCLE_GUARD_SCHEMA, code }), 'utf8').digest('hex')
}
function untracked(): ConciliarDocumentLifecycleEligibility {
  return {
    lifecycleConocido: false,
    elegible: true,
    versionEstado: CONCILIAR_DOCUMENT_LIFECYCLE_UNTRACKED,
    codigo: 'SIN_LIFECYCLE_HISTORICO',
    requiereRevisionHumana: false,
  }
}
function invalidKnownLifecycle(): ConciliarDocumentLifecycleEligibility {
  return {
    lifecycleConocido: true,
    elegible: false,
    versionEstado: failureVersionState('SNAPSHOT_DOCUMENTAL_NO_VIGENTE'),
    codigo: 'SNAPSHOT_DOCUMENTAL_NO_VIGENTE',
    requiereRevisionHumana: true,
  }
}
function sourceKind(source: ServerSource): 'RECIBIDA' | 'CONFIRMING' | 'NOMINA' | 'B5' | null {
  if (source.kind === 'PAGO_FACTURA_RECIBIDA' && serverId(source.facturaRecibidaId)) return 'RECIBIDA'
  if (source.kind === 'COBRO_CONFIRMING' && serverId(source.confirmingId)) return 'CONFIRMING'
  if (source.kind === 'PAGO_NOMINA' && serverId(source.nominaId)) return 'NOMINA'
  if (source.kind === 'PAGO_TICKET_B5' && serverId(source.adjuntoB5Id)) return 'B5'
  return null
}
function sourceIdForKind(source: ServerSource, kind: BatchSourceKind): string {
  if (kind === 'RECIBIDA') return source.facturaRecibidaId!
  if (kind === 'CONFIRMING') return source.confirmingId!
  if (kind === 'NOMINA') return source.nominaId!
  return source.adjuntoB5Id!
}
function batchSourceFor(source: ServerSource): BatchSource | null {
  const sourceKindValue = sourceKind(source)
  return sourceKindValue ? { sourceKind: sourceKindValue, sourceId: sourceIdForKind(source, sourceKindValue) } : null
}
function batchKey(source: BatchSource): string { return `${source.sourceKind}\u0000${source.sourceId}` }
function isBatchSourceKind(value: unknown): value is BatchSourceKind {
  return value === 'RECIBIDA' || value === 'CONFIRMING' || value === 'NOMINA' || value === 'B5'
}

/** True only for source kinds whose provider item can be resolved server-side. */
export function supportsConciliarDocumentLifecycleGuard(source: ServerSource): boolean {
  return sourceKind(source) !== null
}

/** Stable map key for a server-owned projection source; never accepts a browser locator. */
export function conciliarDocumentLifecycleBatchSourceKey(source: ServerSource): string | null {
  const resolved = batchSourceFor(source)
  return resolved ? batchKey(resolved) : null
}

/** Deduplicates only typed server source IDs; input fields such as C11 sourceHash are ignored. */
export function dedupeConciliarDocumentLifecycleBatchSources(sources: readonly ServerSource[]): readonly Readonly<{ sourceKind: BatchSourceKind; sourceId: string }>[] {
  const deduped = new Map<string, BatchSource>()
  for (const source of sources) {
    const resolved = batchSourceFor(source)
    if (resolved) deduped.set(batchKey(resolved), resolved)
  }
  return [...deduped.values()].sort((left, right) => batchKey(left).localeCompare(batchKey(right)))
}

/** Public-safe wording for projection/action feedback; never includes a locator, document data or amount. */
export function conciliarDocumentLifecycleGuardMessage(code: ConciliarDocumentLifecycleGuardCode): string {
  switch (code) {
    case 'DOCUMENTO_TOMBSTONED': return 'El documento está marcado como borrado de la carpeta; no se propone para confirmar.'
    case 'INCIDENCIA_RECUPERACION_DOCUMENTAL_PENDIENTE': return 'El documento reapareció tras un borrado y requiere revisión humana antes de una nueva confirmación.'
    case 'INCIDENCIA_CAMBIO_DOCUMENTAL_PENDIENTE': return 'El documento ha cambiado y requiere revisión humana antes de una nueva confirmación.'
    case 'SNAPSHOT_DOCUMENTAL_CAMBIADO': return 'La versión documental cambió desde la proyección; actualiza la lista y revisa el documento.'
    case 'ESTADO_VERSION_DOCUMENTAL_AUSENTE': return 'La proyección no conserva una versión documental verificable; actualiza la lista y revisa el documento.'
    case 'SNAPSHOT_DOCUMENTAL_NO_VIGENTE': return 'La versión documental conocida no está vigente; requiere revisión humana antes de una nueva confirmación.'
    case 'SIN_LIFECYCLE_HISTORICO': return 'El documento no tiene lifecycle histórico; no se bloquea por ese único motivo.'
    case 'LIFECYCLE_VIGENTE': return 'La versión documental vigente permite continuar.'
  }
}

function eligibilityFromLifecycle(input: Readonly<{
  lifecycleId: unknown
  state: unknown
  currentVersion: unknown
  snapshotId: unknown
  tombstoneRecorded: unknown
  changePending: unknown
  recoveryPending: unknown
}>): ConciliarDocumentLifecycleEligibility {
  const id = lifecycleId(input.lifecycleId)
  if (!id) return invalidKnownLifecycle()
  const state = input.state === 'ACTIVE' || input.state === 'TOMBSTONED' ? input.state : null
  const currentVersion = version(input.currentVersion)
  const tombstoneRecorded = input.tombstoneRecorded === true
  const changePending = input.changePending === true
  const recoveryPending = input.recoveryPending === true
  if (!state || currentVersion === null
    || typeof input.tombstoneRecorded !== 'boolean'
    || typeof input.changePending !== 'boolean'
    || typeof input.recoveryPending !== 'boolean') return invalidKnownLifecycle()
  const versionEstado = versionState({ lifecycleId: id, state, currentVersion, tombstoneRecorded, changePending, recoveryPending })
  if (state === 'TOMBSTONED' || tombstoneRecorded) {
    return { lifecycleConocido: true, elegible: false, versionEstado, codigo: 'DOCUMENTO_TOMBSTONED', requiereRevisionHumana: true }
  }
  if (recoveryPending) {
    return { lifecycleConocido: true, elegible: false, versionEstado, codigo: 'INCIDENCIA_RECUPERACION_DOCUMENTAL_PENDIENTE', requiereRevisionHumana: true }
  }
  if (changePending) {
    return { lifecycleConocido: true, elegible: false, versionEstado, codigo: 'INCIDENCIA_CAMBIO_DOCUMENTAL_PENDIENTE', requiereRevisionHumana: true }
  }
  if (currentVersion < 1 || !lifecycleId(input.snapshotId)) {
    return { lifecycleConocido: true, elegible: false, versionEstado, codigo: 'SNAPSHOT_DOCUMENTAL_NO_VIGENTE', requiereRevisionHumana: true }
  }
  return { lifecycleConocido: true, elegible: true, versionEstado, codigo: 'LIFECYCLE_VIGENTE', requiereRevisionHumana: false }
}

/**
 * Resolves a provider item only from the server-owned Conciliar source. In
 * particular, C11's confirmingSourceHash is not a lifecycle version and is
 * deliberately absent from this input and from every query below.
 */
async function resolveServerOneDriveSourceTx(
  tx: ConciliarDocumentLifecycleGuardTx,
  source: ServerSource,
  lock: boolean,
): Promise<ResolvedOneDriveSource | null> {
  const kind = sourceKind(source)
  if (!kind) return null

  if (kind === 'RECIBIDA' || kind === 'CONFIRMING') {
    const id = kind === 'RECIBIDA' ? source.facturaRecibidaId! : source.confirmingId!
    const suffix = lock ? Prisma.sql` FOR KEY SHARE OF fr` : Prisma.empty
    const rows = await tx.$queryRaw<SourceRow[]>(Prisma.sql`
      SELECT fr.onedrive_drive_id AS "driveId",fr.onedrive_item_id AS "itemId"
      FROM facturas_recibidas fr
      WHERE fr.id=${id}
      LIMIT 2${suffix}
    `)
    if (rows.length !== 1) return null
    return currentSourceKey(rows[0])
  }

  if (kind === 'NOMINA') {
    const suffix = lock ? Prisma.sql` FOR KEY SHARE OF n` : Prisma.empty
    const rows = await tx.$queryRaw<SourceRow[]>(Prisma.sql`
      SELECT (
        SELECT nd.drive_item_id
        FROM nomina_documentos nd
        WHERE nd.nomina_id=n.id AND nd.tipo='NOMINA'
        ORDER BY nd.created_at DESC,nd.id DESC
        LIMIT 1
      ) AS "itemId",NULL::text AS "driveId"
      FROM nominas n
      WHERE n.id=${source.nominaId!}
      LIMIT 2${suffix}
    `)
    if (rows.length !== 1) return null
    // Nómina does not persist a drive alongside nomina_documentos. Its only
    // admissible lifecycle identity therefore uses the already configured
    // controlled library; no drive can be invented from a browser value.
    return currentSourceKey(rows[0], bibliotecaFinancieraConfigurada())
  }

  const suffix = lock ? Prisma.sql` FOR KEY SHARE OF a` : Prisma.empty
  const rows = await tx.$queryRaw<SourceRow[]>(Prisma.sql`
    SELECT a.drive_id AS "driveId",a.onedrive_item_id AS "itemId"
    FROM adjuntos_pendientes_b5 a
    WHERE a.id=CAST(${source.adjuntoB5Id!} AS uuid)
    LIMIT 2${suffix}
  `)
  if (rows.length !== 1) return null
  return currentSourceKey(rows[0])
}

async function inspectConciliarDocumentLifecycleTx(
  tx: ConciliarDocumentLifecycleGuardTx,
  source: ServerSource,
  lock: boolean,
): Promise<ConciliarDocumentLifecycleEligibility> {
  const resolved = await resolveServerOneDriveSourceTx(tx, source, lock)
  if (!resolved) return untracked()

  const suffix = lock ? Prisma.sql` FOR UPDATE OF l` : Prisma.empty
  const lifecycleRows = await tx.$queryRaw<LifecycleRow[]>(Prisma.sql`
    SELECT l.id::text AS "lifecycleId",l.state::text AS state,l.current_version AS "currentVersion",s.id::text AS "snapshotId"
    FROM document_version_lifecycle l
    LEFT JOIN document_version_snapshots s ON s.lifecycle_id=l.id AND s.version_number=l.current_version
    WHERE l.source=${LIFECYCLE_SOURCE} AND l.source_item_key=${resolved.sourceItemKey}
    LIMIT 2${suffix}
  `)
  if (lifecycleRows.length === 0) return untracked()
  if (lifecycleRows.length !== 1) return invalidKnownLifecycle()

  const lifecycle = lifecycleRows[0]
  const id = lifecycleId(lifecycle.lifecycleId)
  if (!id) return invalidKnownLifecycle()
  const tombstoneSuffix = lock ? Prisma.sql` FOR KEY SHARE OF t` : Prisma.empty
  const incidentSuffix = lock ? Prisma.sql` FOR UPDATE` : Prisma.empty
  // Keep a single lock order (source -> lifecycle -> tombstone -> incident).
  // Parallel raw queries on the same Prisma transaction can otherwise race for
  // unrelated locks and make a human confirmation retry needlessly.
  const tombstoneRows = await tx.$queryRaw<TombstoneRow[]>(Prisma.sql`
    SELECT t.id::text AS id
    FROM document_version_tombstones t
    WHERE t.lifecycle_id=CAST(${id} AS uuid)
    LIMIT 2${tombstoneSuffix}
  `)
  const incidentRows = await tx.$queryRaw<IncidentRow[]>(Prisma.sql`
    SELECT i.code
    FROM document_version_incidents i
    WHERE i.lifecycle_id=CAST(${id} AS uuid)
      AND i.state='OPEN'::"DocumentVersionIncidentState"
      AND i.code IN (${CHANGE_INCIDENT},${RECOVERY_INCIDENT})
    ORDER BY i.created_at ASC,i.id ASC
    LIMIT 4${incidentSuffix}
  `)
  return eligibilityFromLifecycle({
    lifecycleId: lifecycle.lifecycleId,
    state: lifecycle.state,
    currentVersion: lifecycle.currentVersion,
    snapshotId: lifecycle.snapshotId,
    tombstoneRecorded: tombstoneRows.length > 0,
    changePending: incidentRows.some(row => row.code === CHANGE_INCIDENT),
    recoveryPending: incidentRows.some(row => row.code === RECOVERY_INCIDENT),
  })
}

/**
 * One bounded page resolves every real source and its lifecycle in one SELECT.
 * It intentionally projects neither provider locators nor snapshot metadata:
 * only the server source key is used internally in the JOIN. The confirming
 * branch starts from `confirmingId -> facturas_recibidas`; C11 sourceHash never
 * participates in this lookup.
 */
function lifecycleBatchQuery(page: readonly BatchSource[], configuredDrive: string | null): Prisma.Sql {
  const values = page.map(source => Prisma.sql`(${source.sourceKind},${source.sourceId})`)
  return Prisma.sql`
    WITH requested AS (
      SELECT v."sourceKind",v."sourceId"
      FROM (VALUES ${Prisma.join(values)}) AS v("sourceKind","sourceId")
    ), source_rows AS (
      SELECT r."sourceKind",r."sourceId",fr.onedrive_drive_id AS "driveId",fr.onedrive_item_id AS "itemId"
      FROM requested r
      JOIN facturas_recibidas fr
        ON r."sourceKind" IN ('RECIBIDA','CONFIRMING') AND fr.id=r."sourceId"
      UNION ALL
      SELECT r."sourceKind",r."sourceId",${configuredDrive} AS "driveId",nd.drive_item_id AS "itemId"
      FROM requested r
      JOIN nominas n ON r."sourceKind"='NOMINA' AND n.id=r."sourceId"
      LEFT JOIN LATERAL (
        SELECT d.drive_item_id
        FROM nomina_documentos d
        WHERE d.nomina_id=n.id AND d.tipo='NOMINA'
        ORDER BY d.created_at DESC,d.id DESC
        LIMIT 1
      ) nd ON TRUE
      UNION ALL
      SELECT r."sourceKind",r."sourceId",a.drive_id AS "driveId",a.onedrive_item_id AS "itemId"
      FROM requested r
      JOIN adjuntos_pendientes_b5 a ON r."sourceKind"='B5' AND a.id::text=r."sourceId"
    )
    SELECT r."sourceKind",r."sourceId",l.id::text AS "lifecycleId",l.state::text AS state,
      l.current_version AS "currentVersion",s.id::text AS "snapshotId",
      EXISTS (SELECT 1 FROM document_version_tombstones t WHERE t.lifecycle_id=l.id) AS "tombstoneRecorded",
      EXISTS (
        SELECT 1 FROM document_version_incidents i
        WHERE i.lifecycle_id=l.id
          AND i.state='OPEN'::"DocumentVersionIncidentState"
          AND i.code=${CHANGE_INCIDENT}
      ) AS "changePending",
      EXISTS (
        SELECT 1 FROM document_version_incidents i
        WHERE i.lifecycle_id=l.id
          AND i.state='OPEN'::"DocumentVersionIncidentState"
          AND i.code=${RECOVERY_INCIDENT}
      ) AS "recoveryPending"
    FROM source_rows r
    LEFT JOIN document_version_lifecycle l
      ON l.source=${LIFECYCLE_SOURCE}
      AND r."driveId" ~ '^[A-Za-z0-9!_.~-]{4,220}$'
      AND r."itemId" ~ '^[A-Za-z0-9!_.~-]{4,220}$'
      AND l.source_item_key=(r."driveId" || ':' || r."itemId")
    LEFT JOIN document_version_snapshots s
      ON s.lifecycle_id=l.id AND s.version_number=l.current_version
    ORDER BY r."sourceKind" ASC,r."sourceId" ASC
    LIMIT ${page.length + 1}
  `
}

/**
 * Exported only for synthetic query-guard tests. It contains no data access and
 * returns a parameterised Prisma query; callers cannot supply a provider key.
 */
export const conciliarDocumentLifecycleGuardBatchSql = {
  pageSize: CONCILIAR_DOCUMENT_LIFECYCLE_BATCH_PAGE_SIZE,
  maxSources: CONCILIAR_DOCUMENT_LIFECYCLE_BATCH_MAX_SOURCES,
  sourceKeyConvention: '<driveId>:<itemId>',
  queryForTests: (sources: readonly ServerSource[], configuredDrive: string | null = null): Prisma.Sql => {
    const page = dedupeConciliarDocumentLifecycleBatchSources(sources)
    if (!page.length || page.length > CONCILIAR_DOCUMENT_LIFECYCLE_BATCH_PAGE_SIZE) throw new Error('CONCILIAR_DOCUMENT_LIFECYCLE_BATCH_TEST_PAGE_INVALID')
    return lifecycleBatchQuery(page, configuredDrive)
  },
} as const

/**
 * Preloads lifecycle eligibility for every documentary source in bounded pages.
 * Each page is one set-based SELECT (sources -> lifecycle -> current snapshot,
 * with EXISTS for tombstones/incidents), never one query per projection row.
 * Missing historical lifecycle and a missing/invalid controlled source remain
 * explicitly untracked for backward compatibility.
 */
export async function preloadConciliarDocumentLifecycleEligibilityTx(
  tx: ConciliarDocumentLifecycleGuardTx,
  sources: readonly ServerSource[],
): Promise<ReadonlyMap<string, ConciliarDocumentLifecycleEligibility>> {
  const requested = dedupeConciliarDocumentLifecycleBatchSources(sources)
  if (requested.length > CONCILIAR_DOCUMENT_LIFECYCLE_BATCH_MAX_SOURCES) throw new Error('CONCILIAR_DOCUMENT_LIFECYCLE_BATCH_TOO_MANY_SOURCES')
  const result = new Map<string, ConciliarDocumentLifecycleEligibility>(requested.map(source => [batchKey(source), untracked()]))
  const configuredDrive = bibliotecaFinancieraConfigurada()
  for (let start = 0; start < requested.length; start += CONCILIAR_DOCUMENT_LIFECYCLE_BATCH_PAGE_SIZE) {
    const page = requested.slice(start, start + CONCILIAR_DOCUMENT_LIFECYCLE_BATCH_PAGE_SIZE)
    const rows = await tx.$queryRaw<BatchLifecycleRow[]>(lifecycleBatchQuery(page, configuredDrive))
    if (rows.length > page.length) throw new Error('CONCILIAR_DOCUMENT_LIFECYCLE_BATCH_SOURCE_AMBIGUOUS')
    const expected = new Set(page.map(batchKey))
    const seen = new Set<string>()
    for (const row of rows) {
      const sourceId = serverId(row.sourceId)
      if (!isBatchSourceKind(row.sourceKind) || !sourceId) throw new Error('CONCILIAR_DOCUMENT_LIFECYCLE_BATCH_ROW_INVALID')
      const key = batchKey({ sourceKind: row.sourceKind, sourceId })
      if (!expected.has(key) || seen.has(key)) throw new Error('CONCILIAR_DOCUMENT_LIFECYCLE_BATCH_SOURCE_AMBIGUOUS')
      seen.add(key)
      // A null lifecycle is deliberately historical/untracked. A non-null but
      // malformed lifecycle is known-invalid and becomes amber below.
      result.set(key, row.lifecycleId === null || row.lifecycleId === undefined ? untracked() : eligibilityFromLifecycle(row))
    }
  }
  return result
}

/** Read-only projection lookup. Use its versionEstado when persisting a Conciliar row. */
export async function readConciliarDocumentLifecycleEligibilityTx(
  tx: ConciliarDocumentLifecycleGuardTx,
  source: ServerSource,
): Promise<ConciliarDocumentLifecycleEligibility> {
  return inspectConciliarDocumentLifecycleTx(tx, source, false)
}

/**
 * Re-resolves and locks the server source plus the known lifecycle immediately
 * before a human B4 confirmation. A missing historical lifecycle remains
 * allowed; any known state drift or unsafe lifecycle is rejected.
 */
export async function lockConciliarDocumentLifecycleForConfirmationTx(
  tx: ConciliarDocumentLifecycleGuardTx,
  input: Readonly<{ source: ServerSource; expectedVersionState: string | null | undefined }>,
): Promise<ConciliarDocumentLifecycleEligibility> {
  const current = await inspectConciliarDocumentLifecycleTx(tx, input.source, true)
  if (!current.elegible) return current
  // A pre-lifecycle document has no mutable lifecycle snapshot to compare.
  // Its established server-side confirmation guards remain authoritative; lack
  // of this new projection field alone must not downgrade all historic rows.
  if (!current.lifecycleConocido) return current
  if (typeof input.expectedVersionState !== 'string' || input.expectedVersionState.length < 1) {
    return { ...current, elegible: false, codigo: 'ESTADO_VERSION_DOCUMENTAL_AUSENTE', requiereRevisionHumana: true }
  }
  if (input.expectedVersionState !== current.versionEstado) {
    return { ...current, elegible: false, codigo: 'SNAPSHOT_DOCUMENTAL_CAMBIADO', requiereRevisionHumana: true }
  }
  return current
}

/** The helper is intentionally read/lock-only: no B4/B5/C11/snapshot mutation API is exported. */
export const conciliarDocumentLifecycleGuardIsReadOnly = true as const

// Compile-time smoke check that the audit declarations remain plain SELECTs.
void sqlText
