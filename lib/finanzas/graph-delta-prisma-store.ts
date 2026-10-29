/*
 * Almacén privado y transaccional de Graph Delta.
 *
 * Una página usa una transacción corta propia; no secuestra una transacción a
 * través de Graph ni OCR. Antes de cada escritura se bloquea/revalida el lease
 * P2, la cancelación y el permiso efectivo vivo del actor. Los cursores cifrados,
 * IDs/nombres/rutas de Graph y topología no se devuelven, registran ni proyectan.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import {
  GRAPH_DELTA_CURSOR_SCHEMA,
  type GraphDeltaCursor,
  type GraphDeltaEvent,
  type GraphDeltaPageCommit,
  type GraphDeltaPageCommitResult,
  type GraphDeltaVersionStore,
  type InventoryReason,
} from './graph-delta-adapter'
import {
  planDocumentDeletion,
  type DocumentDeletionPlan,
  type DocumentLifecycleSnapshot,
} from './finance-document-deletion-core'
import {
  applyDocumentDeletionPlan,
  type DocumentDeletionStoragePort,
} from './finance-document-deletion-adapter'
import {
  acquireConciliarDocumentTombstoneRefreshGateTx,
  refreshConciliarProjectionForDocumentTombstoneTx,
} from './conciliar-document-tombstone-refresh'
const CURSOR_CIPHER_PREFIX = 'GDC1:'
const HEX64 = /^[0-9a-f]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_SOURCE_KEY = 256
const MAX_DRIVE_ID = 512

export class GraphDeltaPrismaStoreError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'GraphDeltaPrismaStoreError'
  }
}

function fail(code: string): never { throw new GraphDeltaPrismaStoreError(code) }
function text(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string') fail(code)
  const normalized = value.normalize('NFKC').trim()
  if (!normalized || normalized.length > maximum || /[\u0000-\u001F\u007F]/.test(normalized)) fail(code)
  return normalized
}
function uuid(value: unknown, code: string): string {
  const normalized = text(value, 64, code)
  if (!UUID.test(normalized)) fail(code)
  return normalized.toLowerCase()
}
function actor(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail('DELTA_ACTOR_FORBIDDEN')
  return Number(value)
}
function hash(value: unknown, code: string): string {
  const normalized = text(value, 64, code).toLowerCase()
  if (!HEX64.test(normalized)) fail(code)
  return normalized
}

/** Encrypts opaque Graph continuation links before durable storage. */
export interface GraphDeltaCursorCipher {
  seal(value: string): string
  open(value: string): string
}

export class AesGcmGraphDeltaCursorCipher implements GraphDeltaCursorCipher {
  private readonly key: Buffer

  constructor(key: Uint8Array) {
    if (!(key instanceof Uint8Array) || key.byteLength !== 32) fail('DELTA_CURSOR_CIPHER_KEY_INVALID')
    this.key = Buffer.from(key)
  }

  seal(value: string): string {
    const plain = text(value, 16_384, 'DELTA_CURSOR_VALUE_INVALID')
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return `${CURSOR_CIPHER_PREFIX}${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`
  }

  open(value: string): string {
    if (typeof value !== 'string' || !value.startsWith(CURSOR_CIPHER_PREFIX)) fail('DELTA_CURSOR_CIPHER_INVALID')
    const parts = value.slice(CURSOR_CIPHER_PREFIX.length).split('.')
    if (parts.length !== 3 || parts.some(part => !part || part.length > 22_000)) fail('DELTA_CURSOR_CIPHER_INVALID')
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(parts[0], 'base64url'))
      decipher.setAuthTag(Buffer.from(parts[1], 'base64url'))
      return text(Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8'), 16_384, 'DELTA_CURSOR_CIPHER_INVALID')
    } catch {
      return fail('DELTA_CURSOR_CIPHER_INVALID')
    }
  }
}

/** Reads an exactly-32-byte base64url/base64 key; missing production config fails closed. */
export function graphDeltaCursorCipherFromEnvironment(value: string | undefined): GraphDeltaCursorCipher {
  const raw = value?.trim()
  if (!raw) fail('DELTA_CURSOR_CIPHER_REQUIRED')
  let key: Buffer
  try { key = Buffer.from(raw, 'base64url') } catch { return fail('DELTA_CURSOR_CIPHER_KEY_INVALID') }
  if (key.byteLength !== 32) fail('DELTA_CURSOR_CIPHER_KEY_INVALID')
  return new AesGcmGraphDeltaCursorCipher(key)
}

export type GraphDeltaPrismaTx = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>
type TransactionalPrisma = Pick<PrismaClient, '$transaction' | '$queryRaw'>

export type GraphDeltaP2Fence = Readonly<{
  jobId: string
  leaseToken: string
  actorId: number | null
}>

export type PrismaGraphDeltaVersionStoreOptions = Readonly<{
  prisma: TransactionalPrisma
  fence: GraphDeltaP2Fence
  cursorCipher: GraphDeltaCursorCipher
  /** The assembly binds the existing P2 live-permission policy here. */
  assertEffectiveFinanceWriteAccess: (tx: Prisma.TransactionClient, actorId: number) => Promise<boolean>
}>

type CursorRow = Readonly<{
  deltaLink: string | null
  pendingKind: string | null
  pendingContinuationLink: string | null
  inventorySessionId: string | null
}>
type TopologyRow = Readonly<{
  itemId: string
  isFolder: boolean
  isDeleted: boolean
  inRegisteredScope: boolean
  needsLocationReview: boolean
  canonicalPath: string | null
}>
type TopologyDescendantRow = Readonly<{ itemId: string }>
type LifecycleRow = Readonly<{
  lifecycleId: string
  lifecycleState: string
  currentSnapshotVersion: number | bigint
  tombstoneRecorded: boolean
  b4Reconciled: boolean
}>

function scopeKey(scope: Pick<GraphDeltaPageCommit['scope'], 'sourceKey' | 'driveId'>): Readonly<{ sourceKey: string; driveId: string }> {
  return {
    sourceKey: text(scope.sourceKey, MAX_SOURCE_KEY, 'DELTA_SCOPE_INVALID'),
    driveId: text(scope.driveId, MAX_DRIVE_ID, 'DELTA_SCOPE_INVALID'),
  }
}
function sourceItemKey(driveId: string, itemId: string): string {
  const id = text(itemId, 512, 'DELTA_ITEM_INVALID')
  const result = `${driveId}:${id}`
  if (result.length > 4096) fail('DELTA_ITEM_INVALID')
  return result
}
function cursorFromRow(row: CursorRow, cipher: GraphDeltaCursorCipher): GraphDeltaCursor {
  const pendingKind = row.pendingKind
  if (pendingKind !== null && pendingKind !== 'DELTA' && pendingKind !== 'INVENTORY') fail('DELTA_CURSOR_ROW_INVALID')
  if (pendingKind === null && (row.pendingContinuationLink !== null || row.inventorySessionId !== null)) fail('DELTA_CURSOR_ROW_INVALID')
  if (pendingKind === 'DELTA' && (!row.pendingContinuationLink || row.inventorySessionId !== null)) fail('DELTA_CURSOR_ROW_INVALID')
  if (pendingKind === 'INVENTORY' && !row.inventorySessionId) fail('DELTA_CURSOR_ROW_INVALID')
  return {
    schema: GRAPH_DELTA_CURSOR_SCHEMA,
    deltaLink: row.deltaLink === null ? null : cipher.open(row.deltaLink),
    pending: pendingKind === null ? null : {
      kind: pendingKind === 'DELTA' ? 'DELTA' : 'INVENTORY',
      continuationLink: row.pendingContinuationLink === null ? null : cipher.open(row.pendingContinuationLink),
      ...(pendingKind === 'INVENTORY' ? { inventorySessionId: uuid(row.inventorySessionId, 'DELTA_CURSOR_ROW_INVALID') } : {}),
    },
  }
}
function cursorValues(cursor: GraphDeltaCursor, cipher: GraphDeltaCursorCipher): Readonly<{
  deltaLink: string | null
  pendingKind: 'DELTA' | 'INVENTORY' | null
  pendingContinuationLink: string | null
  inventorySessionId: string | null
}> {
  if (cursor.schema !== GRAPH_DELTA_CURSOR_SCHEMA) fail('DELTA_CURSOR_INVALID')
  const pending = cursor.pending
  if (pending && pending.kind !== 'DELTA' && pending.kind !== 'INVENTORY') fail('DELTA_CURSOR_INVALID')
  if (pending?.kind === 'DELTA' && !pending.continuationLink) fail('DELTA_CURSOR_INVALID')
  if (pending?.kind === 'INVENTORY' && !pending.inventorySessionId) fail('DELTA_CURSOR_INVALID')
  return {
    deltaLink: cursor.deltaLink === null ? null : cipher.seal(cursor.deltaLink),
    pendingKind: pending?.kind ?? null,
    pendingContinuationLink: pending?.continuationLink === null || pending?.continuationLink === undefined ? null : cipher.seal(pending.continuationLink),
    inventorySessionId: pending?.kind === 'INVENTORY' ? uuid(pending.inventorySessionId, 'DELTA_CURSOR_INVALID') : null,
  }
}
function currentScope(event: GraphDeltaEvent): 'INSIDE' | 'OUTSIDE' | 'UNRESOLVED' {
  return event.routeHint.kind === 'REGISTERED' ? 'INSIDE'
    : event.routeHint.kind === 'OUTSIDE_REGISTERED_PATHS' ? 'OUTSIDE' : 'UNRESOLVED'
}
function asVersion(value: number | bigint): number | null {
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 1 ? number : null
}

/**
 * Graph Delta page store. Every durable change occurs in one short SERIALIZABLE
 * Prisma transaction. Calling `assertReady` before network I/O avoids querying
 * Graph when the claimed P2 actor has already lost its authority.
 */
export class PrismaGraphDeltaVersionStore implements GraphDeltaVersionStore {
  private readonly prisma: TransactionalPrisma
  private readonly fence: Readonly<{ jobId: string; leaseToken: string; actorId: number }>
  private readonly cipher: GraphDeltaCursorCipher
  private readonly assertEffectiveFinanceWriteAccess: PrismaGraphDeltaVersionStoreOptions['assertEffectiveFinanceWriteAccess']

  constructor(options: PrismaGraphDeltaVersionStoreOptions) {
    const jobId = uuid(options.fence?.jobId, 'DELTA_JOB_FENCE_INVALID')
    const leaseToken = text(options.fence?.leaseToken, 512, 'DELTA_JOB_FENCE_INVALID')
    this.fence = { jobId, leaseToken, actorId: actor(options.fence?.actorId) }
    if (!options.prisma || typeof options.prisma.$transaction !== 'function') fail('DELTA_PRISMA_REQUIRED')
    if (!options.cursorCipher || typeof options.cursorCipher.open !== 'function' || typeof options.cursorCipher.seal !== 'function') fail('DELTA_CURSOR_CIPHER_REQUIRED')
    if (typeof options.assertEffectiveFinanceWriteAccess !== 'function') fail('DELTA_PERMISSION_PORT_REQUIRED')
    this.prisma = options.prisma
    this.cipher = options.cursorCipher
    this.assertEffectiveFinanceWriteAccess = options.assertEffectiveFinanceWriteAccess
  }

  private async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 45_000,
    })
  }

  /** Locks P2 job state and performs the live authorization check in this TX. */
  private async assertFenceAndAccess(tx: Prisma.TransactionClient): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id::text AS id
      FROM finance_sync_jobs_p2
      WHERE id=CAST(${this.fence.jobId} AS uuid)
        AND source='ONEDRIVE'::"FinanceSyncSourceP2"
        AND status='RUNNING'::"FinanceSyncJobStatusP2"
        AND lease_token=${this.fence.leaseToken}
        AND lease_until>clock_timestamp()
        AND cancel_requested_at IS NULL
      LIMIT 1
      FOR UPDATE
    `)
    if (rows.length !== 1) fail('DELTA_JOB_FENCE_LOST')
    if (!await this.assertEffectiveFinanceWriteAccess(tx, this.fence.actorId)) fail('DELTA_ACTOR_FORBIDDEN')
  }

  /** Private preflight; wrapper calls it before opening any authenticated Graph request. */
  async assertReady(): Promise<void> {
    await this.transaction(async (tx) => { await this.assertFenceAndAccess(tx) })
  }

  async loadCursor(scopeInput: Pick<GraphDeltaPageCommit['scope'], 'driveId' | 'sourceKey'>): Promise<GraphDeltaCursor | null> {
    const scope = scopeKey(scopeInput)
    return this.transaction(async (tx) => {
      // `run` calls loadCursor immediately before choosing the first URL. Checking
      // here means permission/cancel loss after wrapper preflight cannot trigger a
      // bearer-backed Graph request merely to read an old cursor.
      await this.assertFenceAndAccess(tx)
      const rows = await tx.$queryRaw<CursorRow[]>(Prisma.sql`
        SELECT delta_link AS "deltaLink",pending_kind AS "pendingKind",
          pending_continuation_link AS "pendingContinuationLink",inventory_session_id::text AS "inventorySessionId"
        FROM finance_graph_delta_cursors
        WHERE source_key=${scope.sourceKey} AND drive_id=${scope.driveId}
        LIMIT 2 FOR UPDATE
      `)
      if (rows.length > 1) fail('DELTA_CURSOR_ROW_AMBIGUOUS')
      return rows[0] ? cursorFromRow(rows[0], this.cipher) : null
    })
  }

  async beginFullInventory(input: Readonly<{ scope: Pick<GraphDeltaPageCommit['scope'], 'driveId' | 'sourceKey'>; reason: InventoryReason }>): Promise<Readonly<{ inventorySessionId: string }>> {
    const scope = scopeKey(input.scope)
    if (input.reason !== 'INITIAL' && input.reason !== 'EXPIRED_OR_CONFLICT') fail('DELTA_INVENTORY_REASON_INVALID')
    return this.transaction(async (tx) => {
      await this.assertFenceAndAccess(tx)
      const existing = await tx.$queryRaw<Array<{ inventorySessionId: string | null }>>(Prisma.sql`
        SELECT inventory_session_id::text AS "inventorySessionId"
        FROM finance_graph_delta_cursors
        WHERE source_key=${scope.sourceKey} AND drive_id=${scope.driveId}
        LIMIT 1 FOR UPDATE
      `)
      const active = existing[0]?.inventorySessionId
      if (active) return { inventorySessionId: uuid(active, 'DELTA_INVENTORY_SESSION_INVALID') }
      const inventorySessionId = randomUUID()
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO finance_graph_delta_inventory_sessions (id,source_key,drive_id,reason,started_at)
        VALUES (CAST(${inventorySessionId} AS uuid),${scope.sourceKey},${scope.driveId},${input.reason},CURRENT_TIMESTAMP)
      `)
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO finance_graph_delta_cursors
          (source_key,drive_id,delta_link,pending_kind,pending_continuation_link,inventory_session_id,updated_at)
        VALUES (${scope.sourceKey},${scope.driveId},NULL,'INVENTORY',NULL,CAST(${inventorySessionId} AS uuid),CURRENT_TIMESTAMP)
        ON CONFLICT (source_key,drive_id) DO UPDATE SET
          delta_link=NULL,pending_kind='INVENTORY',pending_continuation_link=NULL,
          inventory_session_id=CAST(${inventorySessionId} AS uuid),updated_at=CURRENT_TIMESTAMP
      `)
      return { inventorySessionId }
    })
  }

  private async currentTopology(tx: Prisma.TransactionClient, scope: Readonly<{ sourceKey: string; driveId: string }>, itemId: string): Promise<TopologyRow | null> {
    const rows = await tx.$queryRaw<TopologyRow[]>(Prisma.sql`
      SELECT item_id AS "itemId",is_folder AS "isFolder",is_deleted AS "isDeleted",
        in_registered_scope AS "inRegisteredScope",needs_location_review AS "needsLocationReview",
        canonical_path AS "canonicalPath"
      FROM finance_graph_delta_topology
      WHERE source_key=${scope.sourceKey} AND drive_id=${scope.driveId} AND item_id=${itemId}
      LIMIT 2 FOR UPDATE
    `)
    if (rows.length > 1) fail('DELTA_TOPOLOGY_AMBIGUOUS')
    return rows[0] ?? null
  }

  private async persistUpsertTopology(tx: Prisma.TransactionClient, scope: Readonly<{ sourceKey: string; driveId: string }>, event: GraphDeltaEvent): Promise<void> {
    const routeState = currentScope(event)
    const observedPath = event.routeHint.observedPath
    const previous = await this.currentTopology(tx, scope, event.itemId)
    // `parentReference.path` may be absent in Delta. A known live parent lets us
    // resolve membership through private topology; an unknown parent remains
    // unresolved and must not authorize importing a new lifecycle.
    const parent = routeState === 'UNRESOLVED' && event.parentItemId
      ? await this.currentTopology(tx, scope, event.parentItemId)
      : null
    const resolvedThroughParent = routeState === 'UNRESOLVED' && parent !== null && !parent.isDeleted
    const effectiveRouteState = routeState === 'UNRESOLVED' && resolvedThroughParent
      ? (parent!.inRegisteredScope ? 'INSIDE' : 'OUTSIDE')
      : routeState
    const effectivePath = observedPath ?? (
      resolvedThroughParent && parent?.canonicalPath && event.name
        ? `${parent.canonicalPath}/${event.name}`
        : null
    )
    const inside = effectiveRouteState === 'INSIDE'
    const outside = effectiveRouteState === 'OUTSIDE'
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO finance_graph_delta_topology
        (source_key,drive_id,item_id,parent_item_id,item_name,is_folder,is_deleted,canonical_path,in_registered_scope,needs_location_review,file_size,e_tag,c_tag,quick_xor_hash,mime_type,last_modified_at,updated_at)
      VALUES
        (${scope.sourceKey},${scope.driveId},${event.itemId},${event.parentItemId},${event.name},${event.isFolder},FALSE,${effectivePath},${inside},${outside},${event.size},${event.eTag},${event.cTag},${event.quickXorHash},${event.mimeType},${event.lastModifiedDateTime},CURRENT_TIMESTAMP)
      ON CONFLICT (source_key,drive_id,item_id) DO UPDATE SET
        parent_item_id=EXCLUDED.parent_item_id,item_name=EXCLUDED.item_name,is_folder=EXCLUDED.is_folder,is_deleted=FALSE,
        canonical_path=CASE WHEN ${effectiveRouteState}='UNRESOLVED' THEN finance_graph_delta_topology.canonical_path ELSE EXCLUDED.canonical_path END,
        in_registered_scope=CASE WHEN ${effectiveRouteState}='UNRESOLVED' THEN finance_graph_delta_topology.in_registered_scope ELSE EXCLUDED.in_registered_scope END,
        needs_location_review=CASE
          WHEN ${effectiveRouteState}='OUTSIDE' AND finance_graph_delta_topology.in_registered_scope THEN TRUE
          WHEN ${effectiveRouteState}='INSIDE' THEN FALSE
          ELSE finance_graph_delta_topology.needs_location_review
        END,
        file_size=EXCLUDED.file_size,e_tag=EXCLUDED.e_tag,c_tag=EXCLUDED.c_tag,
        quick_xor_hash=EXCLUDED.quick_xor_hash,mime_type=EXCLUDED.mime_type,last_modified_at=EXCLUDED.last_modified_at,
        updated_at=CURRENT_TIMESTAMP
    `)
    // A folder move carries scope to its descendants even when Graph later omits
    // their parentReference.path. A deletion deliberately does not cascade: absence
    // or a removed parent is not evidence that every child was deleted.
    if (event.isFolder && effectiveRouteState !== 'UNRESOLVED') {
      const oldPrefix = previous?.canonicalPath ?? null
      await tx.$executeRaw(Prisma.sql`
        WITH RECURSIVE subtree AS (
          SELECT item_id FROM finance_graph_delta_topology
          WHERE source_key=${scope.sourceKey} AND drive_id=${scope.driveId} AND item_id=${event.itemId}
          UNION
          SELECT child.item_id
          FROM finance_graph_delta_topology child
          JOIN subtree parent ON child.parent_item_id=parent.item_id
          WHERE child.source_key=${scope.sourceKey} AND child.drive_id=${scope.driveId}
        )
        UPDATE finance_graph_delta_topology node
        SET in_registered_scope=${inside},
            needs_location_review=CASE WHEN ${inside} THEN FALSE ELSE TRUE END,
            canonical_path=CASE
              WHEN ${oldPrefix} IS NOT NULL AND ${effectivePath} IS NOT NULL
                AND node.item_id<>${event.itemId}
                AND node.canonical_path LIKE (${oldPrefix} || '/%')
              THEN ${effectivePath} || substring(node.canonical_path FROM char_length(${oldPrefix}) + 1)
              ELSE node.canonical_path
            END,
            updated_at=CURRENT_TIMESTAMP
        WHERE node.source_key=${scope.sourceKey} AND node.drive_id=${scope.driveId}
          AND node.item_id IN (SELECT item_id FROM subtree)
      `)
    }
  }

  /**
   * Delta puede describir sólo el movimiento de una carpeta. Los descendientes
   * heredan su ruta en topología y reciben un evento UPSERT derivado, sin crear
   * evidencia de borrado ni volver a consultar Graph.
   */
  private async persistFolderDescendantEvents(
    tx: Prisma.TransactionClient,
    scope: Readonly<{ sourceKey: string; driveId: string }>,
    pageKey: string,
    event: GraphDeltaEvent,
  ): Promise<void> {
    if (!event.isFolder) return
    const descendants = await tx.$queryRaw<TopologyDescendantRow[]>(Prisma.sql`
      WITH RECURSIVE subtree AS (
        SELECT item_id,is_folder,is_deleted,in_registered_scope
        FROM finance_graph_delta_topology
        WHERE source_key=${scope.sourceKey} AND drive_id=${scope.driveId} AND item_id=${event.itemId}
        UNION
        SELECT child.item_id,child.is_folder,child.is_deleted,child.in_registered_scope
        FROM finance_graph_delta_topology child
        JOIN subtree parent ON child.parent_item_id=parent.item_id
        WHERE child.source_key=${scope.sourceKey} AND child.drive_id=${scope.driveId}
      )
      SELECT item_id AS "itemId" FROM subtree
      WHERE is_folder=FALSE AND is_deleted=FALSE AND in_registered_scope=TRUE
    `)
    for (const descendant of descendants) {
      const eventKey = createHash('sha256').update(`GRAPH_DELTA_FOLDER_DESCENDANT_V1:${event.eventKey}:${descendant.itemId}`).digest('hex')
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO finance_graph_delta_events (source_key,drive_id,event_key,page_key,item_id,kind,sequence,committed_at)
        VALUES (${scope.sourceKey},${scope.driveId},${eventKey},${pageKey},${descendant.itemId},'UPSERT',${event.sequence},CURRENT_TIMESTAMP)
        ON CONFLICT (source_key,drive_id,event_key) DO NOTHING
      `)
    }
  }

  private async markTopologyDeleted(tx: Prisma.TransactionClient, scope: Readonly<{ sourceKey: string; driveId: string }>, event: GraphDeltaEvent): Promise<TopologyRow | null> {
    const existing = await this.currentTopology(tx, scope, event.itemId)
    if (!existing) return null
    await tx.$executeRaw(Prisma.sql`
      UPDATE finance_graph_delta_topology
      SET is_deleted=TRUE,updated_at=CURRENT_TIMESTAMP
      WHERE source_key=${scope.sourceKey} AND drive_id=${scope.driveId} AND item_id=${event.itemId}
        AND is_deleted=FALSE
    `)
    return existing
  }

  private async lockDeletionLifecycle(tx: Prisma.TransactionClient, sourceItem: string): Promise<DocumentLifecycleSnapshot | null> {
    const rows = await tx.$queryRaw<LifecycleRow[]>(Prisma.sql`
      SELECT l.id::text AS "lifecycleId",l.state::text AS "lifecycleState",l.current_version AS "currentSnapshotVersion",
        EXISTS(SELECT 1 FROM document_version_tombstones t WHERE t.lifecycle_id=l.id) AS "tombstoneRecorded",
        EXISTS(
          SELECT 1
          FROM facturas_recibidas f
          JOIN documentos_conciliables d ON d.factura_recibida_id=f.id AND d.activo
          JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo
            AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo"
          JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id
            AND o.estado='APLICADA'::"EstadoOperacionB4"
          WHERE f.onedrive_drive_id || ':' || f.onedrive_item_id=${sourceItem}
        ) AS "b4Reconciled"
      FROM document_version_lifecycle l
      WHERE l.source='ONEDRIVE' AND l.source_item_key=${sourceItem}
      LIMIT 2 FOR UPDATE OF l
    `)
    if (rows.length > 1) fail('DELTA_LIFECYCLE_AMBIGUOUS')
    const row = rows[0]
    const version = row ? asVersion(row.currentSnapshotVersion) : null
    if (!row || version === null) return null
    if (row.lifecycleState !== 'ACTIVE' && row.lifecycleState !== 'TOMBSTONED') fail('DELTA_LIFECYCLE_STATE_INVALID')
    return {
      source: 'ONEDRIVE', sourceItemKey: sourceItem,
      lifecycleState: row.lifecycleState === 'TOMBSTONED' ? 'TOMBSTONE' : 'ACTIVO',
      currentSnapshotVersion: version,
      b4Reconciled: row.b4Reconciled === true,
      tombstoneRecorded: row.tombstoneRecorded === true,
    }
  }

  private deletionStorage(tx: Prisma.TransactionClient): DocumentDeletionStoragePort<Prisma.TransactionClient> {
    return {
      // We are already in the page transaction. Starting a nested/global TX here
      // would break the page-before-cursor atomicity requirement.
      transaction: async <T>(work: (current: Prisma.TransactionClient) => Promise<T>) => work(tx),
      requireEffectiveFinanceWriteAccess: async (current, actorId) => {
        await this.assertFenceAndAccess(current)
        return actorId === this.fence.actorId
      },
      lockLifecycle: async (current, key) => this.lockDeletionLifecycle(current, key.sourceItemKey),
      insertTombstoneIfAbsent: async (current, tombstone) => {
        const lifecycle = await current.$queryRaw<Array<{ lifecycleId: string }>>(Prisma.sql`
          SELECT id::text AS "lifecycleId" FROM document_version_lifecycle
          WHERE source=${tombstone.key.source} AND source_item_key=${tombstone.key.sourceItemKey}
          LIMIT 2 FOR UPDATE
        `)
        if (lifecycle.length !== 1) fail('DELTA_LIFECYCLE_STALE')
        const evidenceKind = tombstone.evidence === 'DELTA_TOMBSTONE' ? 'GRAPH_DELTA_TOMBSTONE' : 'COMPLETE_INVENTORY_ABSENCE'
        const evidenceHash = hash(tombstone.idempotencyKey, 'DELTA_TOMBSTONE_KEY_INVALID')
        const inserted = await current.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO document_version_tombstones
            (id,lifecycle_id,evidence_kind,evidence_hash,idempotency_key,reported_by_id,created_at)
          VALUES
            (gen_random_uuid(),CAST(${lifecycle[0].lifecycleId} AS uuid),${evidenceKind},${evidenceHash},${tombstone.idempotencyKey},${this.fence.actorId},CURRENT_TIMESTAMP)
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING id::text AS id
        `)
        return inserted.length ? 'CREATED' : 'EXISTS'
      },
      markLifecycleTombstoned: async (current, input) => {
        const changed = await current.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          UPDATE document_version_lifecycle
          SET state='TOMBSTONED'::"DocumentVersionLifecycleState",updated_at=CURRENT_TIMESTAMP
          WHERE source=${input.key.source} AND source_item_key=${input.key.sourceItemKey}
            AND state='ACTIVE'::"DocumentVersionLifecycleState" AND current_version=${input.expectedSnapshotVersion}
          RETURNING id::text AS id
        `)
        if (changed.length) return 'MARKED'
        const currentState = await current.$queryRaw<Array<{ state: string }>>(Prisma.sql`
          SELECT state::text AS state FROM document_version_lifecycle
          WHERE source=${input.key.source} AND source_item_key=${input.key.sourceItemKey}
          LIMIT 2 FOR UPDATE
        `)
        if (currentState.length !== 1) return 'STALE'
        return currentState[0].state === 'TOMBSTONED' ? 'ALREADY_TOMBSTONED' : 'STALE'
      },
      insertIncidentIfAbsent: async (current, input) => {
        const lifecycle = await current.$queryRaw<Array<{ lifecycleId: string }>>(Prisma.sql`
          SELECT id::text AS "lifecycleId" FROM document_version_lifecycle
          WHERE source=${input.key.source} AND source_item_key=${input.key.sourceItemKey}
          LIMIT 2 FOR UPDATE
        `)
        if (lifecycle.length !== 1) fail('DELTA_LIFECYCLE_STALE')
        await current.$executeRaw(Prisma.sql`
          INSERT INTO document_version_deletion_incidents
            (id,lifecycle_id,tombstone_idempotency_key,code,color,message,preserved_snapshot_version,reported_by_id,created_at)
          VALUES
            (gen_random_uuid(),CAST(${lifecycle[0].lifecycleId} AS uuid),${input.tombstoneIdempotencyKey},${input.incident.code},'AMBAR',${input.incident.message},${input.incident.preservedSnapshotVersion},${this.fence.actorId},CURRENT_TIMESTAMP)
          ON CONFLICT (lifecycle_id,tombstone_idempotency_key) DO NOTHING
        `)
      },
      appendAudit: async (current, audit) => {
        const lifecycle = await current.$queryRaw<Array<{ lifecycleId: string }>>(Prisma.sql`
          SELECT id::text AS "lifecycleId" FROM document_version_lifecycle
          WHERE source=${audit.lifecycleKey.source} AND source_item_key=${audit.lifecycleKey.sourceItemKey}
          LIMIT 2 FOR UPDATE
        `)
        if (lifecycle.length !== 1) fail('DELTA_LIFECYCLE_STALE')
        await current.$executeRaw(Prisma.sql`
          INSERT INTO document_version_deletion_audit
            (id,lifecycle_id,tombstone_idempotency_key,action,actor_id,created_at)
          VALUES
            (gen_random_uuid(),CAST(${lifecycle[0].lifecycleId} AS uuid),${audit.tombstoneIdempotencyKey},${audit.action},${this.fence.actorId},CURRENT_TIMESTAMP)
          ON CONFLICT (lifecycle_id,tombstone_idempotency_key,action) DO NOTHING
        `)
      },
    }
  }

  private async applyPositiveDeltaTombstone(tx: Prisma.TransactionClient, scope: Readonly<{ sourceKey: string; driveId: string }>, event: GraphDeltaEvent, topology: TopologyRow | null): Promise<GraphDeltaPageCommitResult> {
    // A missing/unresolved/out-of-scope topology never becomes a deletion. Graph
    // 404/403/network/inventory absence never reach this path at all.
    if (!topology || topology.isDeleted || !topology.inRegisteredScope) return {}
    const key = sourceItemKey(scope.driveId, event.itemId)
    // Conserva el orden de locks de Conciliar: proyección antes que lifecycle.
    const refreshGate = await acquireConciliarDocumentTombstoneRefreshGateTx(tx)
    const snapshot = await this.lockDeletionLifecycle(tx, key)
    if (!snapshot) return {}
    const plan: DocumentDeletionPlan = planDocumentDeletion(snapshot, {
      kind: 'DELTA_TOMBSTONE', source: 'ONEDRIVE', sourceItemKey: key,
      deltaPageComplete: true, tombstoneId: event.eventKey,
    })
    const applied = await applyDocumentDeletionPlan(this.deletionStorage(tx), { actorId: this.fence.actorId, plan })
    if (applied.outcome !== 'APPLIED' || plan.kind !== 'TOMBSTONE') return {}
    return refreshConciliarProjectionForDocumentTombstoneTx(tx, refreshGate, plan.key)
  }

  async commitPage(input: GraphDeltaPageCommit): Promise<GraphDeltaPageCommitResult> {
    const scope = scopeKey(input.scope)
    const pageKey = hash(input.pageKey, 'DELTA_PAGE_KEY_INVALID')
    if (input.mode !== 'DELTA' && input.mode !== 'INVENTORY') fail('DELTA_PAGE_MODE_INVALID')
    if (input.mode === 'INVENTORY' && !input.inventorySessionId) fail('DELTA_INVENTORY_SESSION_INVALID')
    if (input.mode === 'DELTA' && input.inventorySessionId !== null) fail('DELTA_INVENTORY_SESSION_INVALID')
    const cursor = cursorValues(input.cursorAfter, this.cipher)
    if (input.inventoryCompleted && input.mode !== 'INVENTORY') fail('DELTA_INVENTORY_COMPLETION_INVALID')

    return this.transaction(async (tx) => {
      await this.assertFenceAndAccess(tx)
      const receipt = await tx.$queryRaw<Array<{ pageKey: string }>>(Prisma.sql`
        INSERT INTO finance_graph_delta_pages (source_key,drive_id,page_key,mode,inventory_session_id,committed_at)
        VALUES (${scope.sourceKey},${scope.driveId},${pageKey},${input.mode},${input.inventorySessionId ? Prisma.sql`CAST(${uuid(input.inventorySessionId, 'DELTA_INVENTORY_SESSION_INVALID')} AS uuid)` : Prisma.sql`NULL`},CURRENT_TIMESTAMP)
        ON CONFLICT (source_key,drive_id,page_key) DO NOTHING
        RETURNING page_key AS "pageKey"
      `)
      // Receipt and cursor are committed atomically. If it exists, its former
      // transaction already completed every event and cursor advance.
      if (!receipt.length) return {}

      let projectionInvalidated = false
      const newest = new Map<string, GraphDeltaEvent>()
      for (const event of input.events) {
        hash(event.eventKey, 'DELTA_EVENT_KEY_INVALID')
        text(event.itemId, 512, 'DELTA_ITEM_INVALID')
        if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) fail('DELTA_EVENT_SEQUENCE_INVALID')
        const prior = newest.get(event.itemId)
        if (!prior || prior.sequence <= event.sequence) newest.set(event.itemId, event)
      }
      const ordered = [...newest.values()].sort((left, right) => left.sequence - right.sequence)
      for (const event of ordered) {
        const inserted = await tx.$queryRaw<Array<{ eventKey: string }>>(Prisma.sql`
          INSERT INTO finance_graph_delta_events (source_key,drive_id,event_key,page_key,item_id,kind,sequence,committed_at)
          VALUES (${scope.sourceKey},${scope.driveId},${event.eventKey},${pageKey},${event.itemId},${event.kind},${event.sequence},CURRENT_TIMESTAMP)
          ON CONFLICT (source_key,drive_id,event_key) DO NOTHING
          RETURNING event_key AS "eventKey"
        `)
        if (!inserted.length) continue
        if (event.kind === 'UPSERT') {
          await this.persistUpsertTopology(tx, scope, event)
          if (input.mode === 'DELTA') await this.persistFolderDescendantEvents(tx, scope, pageKey, event)
          // Delta metadata intentionally does not invoke OCR or manufacture a
          // snapshot/version. The existing P2 inventory+prepare flow observes the
          // persisted quickXorHash/cTag on the next native pass and uses its real
          // bounded download/OCR/archive path if content actually changed.
        } else if (event.kind === 'TOMBSTONE') {
          // A 409/410 rebuild is presence-only for this release. It must never
          // transform a partial recovery inventory into a deletion, even if an
          // unexpected `deleted` shape appears in that reconstruction response.
          if (input.mode === 'DELTA') {
            const topology = await this.markTopologyDeleted(tx, scope, event)
            const result = await this.applyPositiveDeltaTombstone(tx, scope, event, topology)
            projectionInvalidated ||= result.projectionInvalidated === true
          }
        } else fail('DELTA_EVENT_KIND_INVALID')
      }

      if (input.inventoryCompleted && input.inventorySessionId) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE finance_graph_delta_inventory_sessions
          SET completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP)
          WHERE id=CAST(${uuid(input.inventorySessionId, 'DELTA_INVENTORY_SESSION_INVALID')} AS uuid)
            AND source_key=${scope.sourceKey} AND drive_id=${scope.driveId}
        `)
        // There is deliberately no absence comparison or implicit tombstone here.
      }
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO finance_graph_delta_cursors
          (source_key,drive_id,delta_link,pending_kind,pending_continuation_link,inventory_session_id,updated_at)
        VALUES (${scope.sourceKey},${scope.driveId},${cursor.deltaLink},${cursor.pendingKind},${cursor.pendingContinuationLink},${cursor.inventorySessionId ? Prisma.sql`CAST(${cursor.inventorySessionId} AS uuid)` : Prisma.sql`NULL`},CURRENT_TIMESTAMP)
        ON CONFLICT (source_key,drive_id) DO UPDATE SET
          delta_link=EXCLUDED.delta_link,pending_kind=EXCLUDED.pending_kind,
          pending_continuation_link=EXCLUDED.pending_continuation_link,
          inventory_session_id=EXCLUDED.inventory_session_id,updated_at=CURRENT_TIMESTAMP
      `)
      return { projectionInvalidated }
    })
  }
}

export function createPrismaGraphDeltaVersionStore(options: PrismaGraphDeltaVersionStoreOptions): PrismaGraphDeltaVersionStore {
  return new PrismaGraphDeltaVersionStore(options)
}
