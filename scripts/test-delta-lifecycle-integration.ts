/*
 * Integración sintética de Delta + lifecycle. Sólo memoria/mocks: no Graph, OCR,
 * Prisma real, DML, migraciones ni red. Cubre la frontera de cursor y el hook P2.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GRAPH_DELTA_CURSOR_SCHEMA,
  GraphDriveRootDeltaAdapter,
  createDriveRootDeltaUrl,
  type GraphDeltaCursor,
  type GraphDeltaHttpResponse,
  type GraphDeltaTransport,
  type GraphDeltaVersionStore,
} from '../lib/finanzas/graph-delta-adapter'
import {
  decideOneDriveContentRead,
  type OneDriveContentReadDecision,
} from '../lib/finanzas/sync-jobs/providers/onedrive/document-lifecycle'
import { planDocumentDeletion, type DocumentLifecycleSnapshot } from '../lib/finanzas/finance-document-deletion-core'

const DRIVE = 'drive-mock'
const SOURCE = 'ONEDRIVE_RECEIVED_INVOICES'
const scope = { driveId: DRIVE, sourceKey: SOURCE, registeredPaths: [{ routeId: 'root', path: 'safe/root' }] } as const
const root = () => createDriveRootDeltaUrl(DRIVE).toString()
const continuation = (token: string) => {
  const url = createDriveRootDeltaUrl(DRIVE)
  url.search = `?opaque=${token}`
  return url.toString()
}

class ScriptedTransport implements GraphDeltaTransport {
  calls: string[] = []
  constructor(private readonly pages: Map<string, GraphDeltaHttpResponse[]>) {}
  async get(url: URL): Promise<GraphDeltaHttpResponse> {
    this.calls.push(url.toString())
    const sequence = this.pages.get(url.toString())
    if (!sequence?.length) throw new Error('UNEXPECTED_MOCK_DELTA_URL')
    return sequence.shift()!
  }
}

type MemoryEvent = { itemId: string; kind: 'UPSERT' | 'TOMBSTONE'; inScope: boolean }
class TransactionalMemoryStore implements GraphDeltaVersionStore {
  cursor: GraphDeltaCursor | null = null
  authorized = true
  cancelled = false
  failOnce = false
  commits = 0
  pages = new Set<string>()
  eventKeys = new Set<string>()
  topology = new Map<string, { inScope: boolean; deleted: boolean }>()
  tombstones = new Set<string>()
  b4Intact = true
  ocrCalls = 0
  inventoryTombstones = 0

  async loadCursor() {
    if (!this.authorized) throw Object.assign(new Error('denied'), { code: 'DELTA_ACTOR_FORBIDDEN' })
    if (this.cancelled) throw Object.assign(new Error('cancelled'), { code: 'DELTA_JOB_FENCE_LOST' })
    return this.cursor
  }
  async beginFullInventory(input: { reason: 'INITIAL' | 'EXPIRED_OR_CONFLICT' }) {
    if (!this.authorized) throw Object.assign(new Error('denied'), { code: 'DELTA_ACTOR_FORBIDDEN' })
    if (this.cancelled) throw Object.assign(new Error('cancelled'), { code: 'DELTA_JOB_FENCE_LOST' })
    const session = `session-${input.reason}`
    this.cursor = { schema: GRAPH_DELTA_CURSOR_SCHEMA, deltaLink: null, pending: { kind: 'INVENTORY', continuationLink: null, inventorySessionId: session } }
    return { inventorySessionId: session }
  }
  async commitPage(input: Parameters<GraphDeltaVersionStore['commitPage']>[0]) {
    if (!this.authorized) throw Object.assign(new Error('denied'), { code: 'DELTA_ACTOR_FORBIDDEN' })
    if (this.cancelled) throw Object.assign(new Error('cancelled'), { code: 'DELTA_JOB_FENCE_LOST' })
    if (this.failOnce) { this.failOnce = false; throw new Error('SIMULATED_PAGE_CRASH') }
    if (this.pages.has(input.pageKey)) return
    const stagedTopology = new Map(this.topology)
    const stagedEvents = new Set(this.eventKeys)
    const stagedTombstones = new Set(this.tombstones)
    for (const event of input.events) {
      if (stagedEvents.has(event.eventKey)) continue
      stagedEvents.add(event.eventKey)
      const known = stagedTopology.get(event.itemId)
      if (event.kind === 'UPSERT') {
        // Same item ID under another parent remains one source, hence a move.
        stagedTopology.set(event.itemId, { inScope: event.routeHint.kind === 'REGISTERED', deleted: false })
      } else if (known?.inScope && !known.deleted && input.mode === 'DELTA') {
        stagedTombstones.add(event.eventKey)
      } else if (input.mode === 'INVENTORY') {
        this.inventoryTombstones += 1
      }
    }
    // Atomic commit point: effects first, cursor last. A thrown page writes none.
    this.eventKeys = stagedEvents
    this.topology = stagedTopology
    this.tombstones = stagedTombstones
    this.pages.add(input.pageKey)
    this.cursor = input.cursorAfter
    this.commits++
  }
}

function response(value: unknown[], deltaLink: string): GraphDeltaHttpResponse {
  return { status: 200, body: { value, '@odata.deltaLink': deltaLink } }
}

test('caída de página deja cursor estable y el replay es idempotente antes de promocionarlo', async () => {
  const prior = continuation('prior')
  const next = continuation('next')
  const page = response([{ id: 'item-crash', name: 'a.pdf', file: {}, parentReference: { id: 'parent', path: `/drives/${DRIVE}/root:/safe/root` } }], next)
  const store = new TransactionalMemoryStore()
  store.cursor = { schema: GRAPH_DELTA_CURSOR_SCHEMA, deltaLink: prior, pending: null }
  store.failOnce = true
  await assert.rejects(() => new GraphDriveRootDeltaAdapter({ transport: new ScriptedTransport(new Map([[prior, [page]]])), store }).run(scope), /SIMULATED_PAGE_CRASH/)
  assert.equal(store.cursor.deltaLink, prior)
  assert.equal(store.eventKeys.size, 0)
  await new GraphDriveRootDeltaAdapter({ transport: new ScriptedTransport(new Map([[prior, [page]]])), store }).run(scope)
  assert.equal(store.cursor.deltaLink, next)
  assert.equal(store.eventKeys.size, 1)
})

test('permiso denegado y cancelación fallan antes de hacer un GET Delta', async () => {
  const denied = new TransactionalMemoryStore()
  denied.authorized = false
  const deniedTransport = new ScriptedTransport(new Map())
  await assert.rejects(() => new GraphDriveRootDeltaAdapter({ transport: deniedTransport, store: denied }).run(scope), /denied/)
  assert.equal(deniedTransport.calls.length, 0)
  const cancelled = new TransactionalMemoryStore()
  cancelled.cancelled = true
  const cancelledTransport = new ScriptedTransport(new Map())
  await assert.rejects(() => new GraphDriveRootDeltaAdapter({ transport: cancelledTransport, store: cancelled }).run(scope), /cancelled/)
  assert.equal(cancelledTransport.calls.length, 0)
})

test('tombstone Delta confirmado preserva B4 y un movimiento con mismo item no borra', async () => {
  const prior = continuation('delta-prior')
  const settled = continuation('delta-settled')
  const store = new TransactionalMemoryStore()
  store.cursor = { schema: GRAPH_DELTA_CURSOR_SCHEMA, deltaLink: prior, pending: null }
  store.topology.set('tracked-file', { inScope: true, deleted: false })
  await new GraphDriveRootDeltaAdapter({
    store,
    transport: new ScriptedTransport(new Map([
      [prior, [response([
        { id: 'tracked-file', deleted: {}, parentReference: { id: 'old-parent' } },
        { id: 'moved-file', name: 'moved.pdf', file: {}, parentReference: { id: 'new-parent', path: `/drives/${DRIVE}/root:/safe/root/moved` } },
      ], settled)]],
    ])),
  }).run(scope)
  assert.equal(store.tombstones.size, 1)
  assert.equal(store.b4Intact, true)
  assert.equal(store.topology.get('moved-file')?.deleted, false)
  assert.equal(store.ocrCalls, 0)
})

test('410 realiza inventario seguro y ningún tombstone de inventario se convierte en borrado', async () => {
  const expired = continuation('expired')
  const fresh = continuation('fresh')
  const store = new TransactionalMemoryStore()
  store.cursor = { schema: GRAPH_DELTA_CURSOR_SCHEMA, deltaLink: expired, pending: null }
  store.topology.set('old-file', { inScope: true, deleted: false })
  const transport = new ScriptedTransport(new Map([
    [expired, [{ status: 410 }]],
    [root(), [response([{ id: 'old-file', deleted: {}, parentReference: { id: 'old-parent' } }], fresh)]],
  ]))
  const result = await new GraphDriveRootDeltaAdapter({ transport, store }).run(scope)
  assert.equal(result.resynced, true)
  assert.equal(store.tombstones.size, 0)
  assert.equal(store.inventoryTombstones, 1, 'la señal se observó pero no produjo tombstone durable')
})

test('replay de metadata sin quickXorHash/cTag no llama OCR ni crea versión por eTag', () => {
  const decision: OneDriveContentReadDecision = decideOneDriveContentRead({
    sourceExists: true,
    current: {
      identity: { source: 'ONEDRIVE', sourceItemKey: 'drive-mock:item-meta' }, versionNumber: 1,
      fingerprint: { contentSha256: null, byteLength: 4, quickXorHash: null, cTag: null, eTag: 'old' },
      privateMetadata: null, privateLocatorHandle: null,
    },
    incoming: {
      identity: { source: 'ONEDRIVE', sourceItemKey: 'drive-mock:item-meta' },
      fingerprint: { contentSha256: null, byteLength: 4, quickXorHash: null, cTag: null, eTag: 'new' },
      privateMetadata: null,
    },
  })
  assert.equal(decision, 'NO_CONTENT')
})

test('núcleo de borrado rechaza explícitamente 404 y ausencia incompleta', () => {
  const snapshot: DocumentLifecycleSnapshot = {
    source: 'ONEDRIVE', sourceItemKey: 'drive-mock:item-safe', lifecycleState: 'ACTIVO',
    currentSnapshotVersion: 1, b4Reconciled: true, tombstoneRecorded: false,
  }
  assert.equal(planDocumentDeletion(snapshot, { kind: 'PROVIDER_FAILURE', source: snapshot.source, sourceItemKey: snapshot.sourceItemKey, code: 'HTTP_404' }).kind, 'NO_TOMBSTONE')
  assert.equal(planDocumentDeletion(snapshot, { kind: 'COMPLETE_INVENTORY_ABSENCE', source: snapshot.source, sourceItemKey: snapshot.sourceItemKey, inventoryComplete: false, scopeKey: 'incomplete' } as unknown as Parameters<typeof planDocumentDeletion>[1]).kind, 'NO_TOMBSTONE')
})

console.log('OK Delta/lifecycle: crash, permiso/cancelación, tombstone positivo, move, 410 eTag-only y ausencia incompleta con mocks; sin Graph/OCR/BD.')
