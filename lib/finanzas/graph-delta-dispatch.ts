/*
 * Consumo privado de eventos Graph Delta ya confirmados.
 *
 * Este módulo no llama Graph, no abre una transacción P2, no hace OCR y no toca
 * B4. Lee sólo la cola durable y devuelve los mismos SyncSourceItem que B1. El
 * repositorio P2 asigna/acuse los recibos dentro de sus transacciones fenced.
 */
import { Prisma, type PrismaClient } from '@prisma/client'
import type { SyncDeltaDispatch, SyncSourceItem } from './sync-jobs/types'
import {
  oneDriveItemFromDeltaMetadata,
  type OneDriveDeltaDispatchMetadata,
} from './sync-jobs/providers/onedrive/provider'

const CHECKPOINT_SCHEMA = 'ONEDRIVE_DELTA_DISPATCH_V1' as const
const HEX64 = /^[0-9a-f]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type GraphDeltaDispatchScope = Readonly<{
  sourceKey: string
  driveId: string
  invoiceRootPath: string
}>

export type GraphDeltaDispatchCheckpoint = Readonly<{
  schema: typeof CHECKPOINT_SCHEMA
  afterCommittedAt: string
  afterEventKey: string
}>

export type GraphDeltaDispatchPage = Readonly<{
  items: readonly SyncSourceItem[]
  dispatches: readonly SyncDeltaDispatch[]
  /** The durable dispatch assignment is the continuation; checkpoint stays empty. */
  checkpoint: Record<string, never>
  complete: boolean
}>

export interface GraphDeltaDispatchReader {
  readPage(input: Readonly<{
    jobId: string
    scope: GraphDeltaDispatchScope
    checkpoint: unknown
    limit: number
  }>): Promise<GraphDeltaDispatchPage>
}

type DispatchRow = Readonly<{
  eventKey: string
  committedAt: string
  itemId: string
  itemName: string | null
  canonicalPath: string | null
  fileSize: number | bigint | null
  eTag: string | null
  cTag: string | null
  quickXorHash: string | null
  mimeType: string | null
  lastModifiedAt: string | null
}>

function fail(code: string): never { throw new Error(code) }
function text(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string') fail(code)
  const normalized = value.normalize('NFKC').trim()
  if (!normalized || normalized.length > maximum || /[\u0000-\u001F\u007F]/.test(normalized)) fail(code)
  return normalized
}
function nullableText(value: unknown, maximum: number, code: string): string | null {
  if (value === null || value === undefined) return null
  return text(value, maximum, code)
}
function uuid(value: unknown): string {
  const normalized = text(value, 64, 'DELTA_DISPATCH_JOB_INVALID')
  if (!UUID.test(normalized)) fail('DELTA_DISPATCH_JOB_INVALID')
  return normalized.toLowerCase()
}
function eventKey(value: unknown): string {
  const normalized = text(value, 64, 'DELTA_DISPATCH_EVENT_INVALID').toLowerCase()
  if (!HEX64.test(normalized)) fail('DELTA_DISPATCH_EVENT_INVALID')
  return normalized
}
function checkpoint(raw: unknown): GraphDeltaDispatchCheckpoint | null {
  if (raw === null || raw === undefined || (typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw as object).length === 0)) return null
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('DELTA_DISPATCH_CHECKPOINT_INVALID')
  const value = raw as Record<string, unknown>
  if (value.schema !== CHECKPOINT_SCHEMA) fail('DELTA_DISPATCH_CHECKPOINT_INVALID')
  const afterCommittedAt = text(value.afterCommittedAt, 128, 'DELTA_DISPATCH_CHECKPOINT_INVALID')
  if (Number.isNaN(Date.parse(afterCommittedAt))) fail('DELTA_DISPATCH_CHECKPOINT_INVALID')
  return { schema: CHECKPOINT_SCHEMA, afterCommittedAt, afterEventKey: eventKey(value.afterEventKey) }
}
function boundedLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 128) fail('DELTA_DISPATCH_LIMIT_INVALID')
  return value
}
function metadata(row: DispatchRow, scope: GraphDeltaDispatchScope): OneDriveDeltaDispatchMetadata {
  const byteLength = row.fileSize === null ? null : Number(row.fileSize)
  if (byteLength !== null && (!Number.isSafeInteger(byteLength) || byteLength < 0)) fail('DELTA_DISPATCH_ROW_INVALID')
  return {
    driveId: text(scope.driveId, 512, 'DELTA_DISPATCH_SCOPE_INVALID'),
    itemId: text(row.itemId, 512, 'DELTA_DISPATCH_ROW_INVALID'),
    itemName: text(row.itemName, 512, 'DELTA_DISPATCH_ROW_INVALID'),
    canonicalPath: text(row.canonicalPath, 2_600, 'DELTA_DISPATCH_ROW_INVALID'),
    byteLength,
    eTag: nullableText(row.eTag, 1_024, 'DELTA_DISPATCH_ROW_INVALID'),
    cTag: nullableText(row.cTag, 1_024, 'DELTA_DISPATCH_ROW_INVALID'),
    quickXorHash: nullableText(row.quickXorHash, 1_024, 'DELTA_DISPATCH_ROW_INVALID'),
    mimeType: nullableText(row.mimeType, 256, 'DELTA_DISPATCH_ROW_INVALID'),
    lastModifiedDateTime: nullableText(row.lastModifiedAt, 128, 'DELTA_DISPATCH_ROW_INVALID'),
  }
}

/**
 * Prisma reader of only unacknowledged Delta UPSERTs. An unacknowledged event
 * from a prior/cancelled job is intentionally offered again to the next job;
 * events already assigned to this same job are already represented by P2 items
 * and are therefore not duplicated after a worker restart.
 */
export class PrismaGraphDeltaDispatchReader implements GraphDeltaDispatchReader {
  constructor(private readonly prisma: Pick<PrismaClient, '$queryRaw'>) {}

  async readPage(input: Readonly<{
    jobId: string
    scope: GraphDeltaDispatchScope
    checkpoint: unknown
    limit: number
  }>): Promise<GraphDeltaDispatchPage> {
    const jobId = uuid(input.jobId)
    const sourceKey = text(input.scope.sourceKey, 256, 'DELTA_DISPATCH_SCOPE_INVALID')
    const driveId = text(input.scope.driveId, 512, 'DELTA_DISPATCH_SCOPE_INVALID')
    const pageLimit = boundedLimit(input.limit)
    // Continuation lives in finance_graph_delta_dispatches, assigned atomically
    // with P2 items/checkpoint. Do not order by a timestamp cursor: two separate
    // Delta transactions can share a timestamp while their hashes are unordered.
    checkpoint(input.checkpoint)
    const rows = await this.prisma.$queryRaw<DispatchRow[]>(Prisma.sql`
      SELECT e.event_key AS "eventKey",e.committed_at::text AS "committedAt",
        t.item_id AS "itemId",t.item_name AS "itemName",t.canonical_path AS "canonicalPath",
        t.file_size AS "fileSize",t.e_tag AS "eTag",t.c_tag AS "cTag",
        t.quick_xor_hash AS "quickXorHash",t.mime_type AS "mimeType",
        t.last_modified_at AS "lastModifiedAt"
      FROM finance_graph_delta_events e
      JOIN finance_graph_delta_topology t
        ON t.source_key=e.source_key AND t.drive_id=e.drive_id AND t.item_id=e.item_id
      LEFT JOIN finance_graph_delta_dispatches d
        ON d.source_key=e.source_key AND d.drive_id=e.drive_id AND d.event_key=e.event_key
      WHERE e.source_key=${sourceKey} AND e.drive_id=${driveId}
        AND e.kind='UPSERT'
        AND t.is_folder=FALSE AND t.is_deleted=FALSE AND t.in_registered_scope=TRUE
        AND (d.event_key IS NULL OR (d.acknowledged_at IS NULL AND d.job_id<>CAST(${jobId} AS uuid)))
      ORDER BY e.committed_at ASC,e.event_key ASC
      LIMIT ${pageLimit}
    `)
    const itemsByKey = new Map<string, SyncSourceItem>()
    const dispatches: SyncDeltaDispatch[] = []
    for (const row of rows) {
      const key = eventKey(row.eventKey)
      const item = oneDriveItemFromDeltaMetadata(metadata(row, input.scope), input.scope.invoiceRootPath)
      if (item && item.key.length > 512) fail('DELTA_DISPATCH_ITEM_KEY_INVALID')
      // There can be multiple durable changes for the same file in one page. P2
      // needs its newest metadata only once; every receipt still gets assigned so
      // no older unacknowledged event remains behind after the item is confirmed.
      if (item) itemsByKey.set(item.key, item)
      dispatches.push({ sourceKey, driveId, eventKey: key, itemKey: item?.key ?? null })
    }
    return { items: [...itemsByKey.values()], dispatches, checkpoint: {}, complete: rows.length < pageLimit }
  }
}
