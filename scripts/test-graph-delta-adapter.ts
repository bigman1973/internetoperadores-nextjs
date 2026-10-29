import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertAllowedDriveRootDeltaUrl,
  createDriveRootDeltaUrl,
  GRAPH_DELTA_CURSOR_SCHEMA,
  GraphDeltaAdapterError,
  GraphDriveRootDeltaAdapter,
  ServerGraphDeltaTransport,
  type GraphDeltaCursor,
  type GraphDeltaHttpResponse,
  type GraphDeltaPageCommit,
  type GraphDeltaTransport,
  type GraphDeltaVersionStore,
} from '../lib/finanzas/graph-delta-adapter'

const DRIVE = 'drive-safe'
const SOURCE = 'received-invoices'
const scope = {
  driveId: DRIVE,
  sourceKey: SOURCE,
  registeredPaths: [{ routeId: 'received-2026', path: 'registered/root' }],
} as const

function rootUrl(): string { return createDriveRootDeltaUrl(DRIVE).toString() }
function continuation(token: string): string {
  const url = createDriveRootDeltaUrl(DRIVE)
  url.search = `?token=${encodeURIComponent(token)}`
  return url.toString()
}

type CommitRecord = GraphDeltaPageCommit

class MemoryVersionStore implements GraphDeltaVersionStore {
  cursor: GraphDeltaCursor | null
  readonly began: string[] = []
  readonly commits: CommitRecord[] = []
  readonly durableEventKeys = new Set<string>()
  readonly tombstoneHooks: string[] = []

  constructor(cursor: GraphDeltaCursor | null = null) { this.cursor = cursor }

  async loadCursor() { return this.cursor }

  async beginFullInventory(input: { reason: 'INITIAL' | 'EXPIRED_OR_CONFLICT' }) {
    this.began.push(input.reason)
    // A real version-store writes this pending cursor transactionally before
    // returning. The mock mimics only its observable state.
    this.cursor = {
      schema: GRAPH_DELTA_CURSOR_SCHEMA,
      deltaLink: null,
      pending: { kind: 'INVENTORY', continuationLink: null, inventorySessionId: `inventory-${this.began.length}` },
    }
    return { inventorySessionId: `inventory-${this.began.length}` }
  }

  async commitPage(input: GraphDeltaPageCommit) {
    // Models the required one-transaction ordering: idempotent events/hook first,
    // then cursor. A replayed page cannot duplicate the deletion hook.
    for (const event of input.events) {
      if (this.durableEventKeys.has(event.eventKey)) continue
      this.durableEventKeys.add(event.eventKey)
      if (event.kind === 'TOMBSTONE') this.tombstoneHooks.push(event.itemId)
    }
    this.commits.push(input)
    this.cursor = input.cursorAfter
  }
}

class FailingOnceVersionStore extends MemoryVersionStore {
  private failNextCommit = true

  override async commitPage(input: GraphDeltaPageCommit) {
    if (this.failNextCommit) {
      this.failNextCommit = false
      throw new Error('simulated durable failure')
    }
    return super.commitPage(input)
  }
}

class ScriptedTransport implements GraphDeltaTransport {
  readonly calls: string[] = []
  private readonly scripted: Map<string, GraphDeltaHttpResponse[]>

  constructor(entries: Array<readonly [string, readonly GraphDeltaHttpResponse[]]>) {
    this.scripted = new Map(entries.map(([url, responses]) => [url, [...responses]]))
  }

  async get(url: URL): Promise<GraphDeltaHttpResponse> {
    const key = url.toString()
    this.calls.push(key)
    const responses = this.scripted.get(key)
    if (!responses?.length) throw new Error(`unexpected mock URL: ${key}`)
    return responses.shift()!
  }
}

test('inventario raíz pagina, conserva movimientos por parentId, deduplica eventos y sólo promociona cursor al persistir', async () => {
  const first = rootUrl()
  const second = continuation('page-two')
  const settled = continuation('settled-root')
  const transport = new ScriptedTransport([
    [first, [{ status: 200, body: {
      value: [
        { id: 'folder-a', name: 'registered', folder: {}, parentReference: { id: 'root', path: `/drives/${DRIVE}/root:` } },
        { id: 'item-a', name: 'alpha.pdf', file: {}, eTag: 'tag-a', parentReference: { id: 'folder-a', path: `/drives/${DRIVE}/root:/registered/root` } },
      ],
      '@odata.nextLink': second,
    } }]],
    [second, [{ status: 200, body: {
      value: [
        // Graph puede repetir el mismo item: la última aparición conserva su padre.
        { id: 'item-a', name: 'alpha.pdf', file: {}, eTag: 'tag-b', parentReference: { id: 'folder-b', path: `/drives/${DRIVE}/root:/registered/root/moved` } },
        { id: 'gone-a', deleted: {}, parentReference: { id: 'folder-b' } },
      ],
      '@odata.deltaLink': settled,
    } }]],
  ])
  const store = new MemoryVersionStore()
  const result = await new GraphDriveRootDeltaAdapter({ transport, store }).run(scope)

  assert.deepEqual(result, { pages: 2, events: 4, retries: 0, fullInventory: true, resynced: false })
  assert.deepEqual(transport.calls, [first, second])
  assert.equal(store.commits.length, 2)
  assert.equal(store.commits[0].cursorAfter.pending?.continuationLink, second)
  assert.equal(store.commits[0].cursorAfter.deltaLink, null)
  assert.equal(store.commits[1].cursorAfter.pending, null)
  assert.equal(store.cursor?.deltaLink, settled)
  const repeated = store.commits.flatMap((commit) => commit.events).filter((event) => event.itemId === 'item-a')
  assert.equal(repeated.length, 2)
  assert.equal(repeated[1].parentItemId, 'folder-b')
  assert.deepEqual(repeated[1].routeHint, { kind: 'REGISTERED', routeIds: ['received-2026'], observedPath: 'registered/root/moved/alpha.pdf' })
  assert.deepEqual(store.tombstoneHooks, ['gone-a'])
  assert.equal(store.durableEventKeys.size, 4)
})

test('reintenta 409 sin convertirlo en borrado ni avanzar el cursor antes de una página válida', async () => {
  const previous = continuation('previous-root')
  const settled = continuation('after-retry')
  const transport = new ScriptedTransport([
    [previous, [
      { status: 409, retryAfterMs: 7 },
      { status: 200, body: { value: [], '@odata.deltaLink': settled } },
    ]],
  ])
  const store = new MemoryVersionStore({ schema: GRAPH_DELTA_CURSOR_SCHEMA, deltaLink: previous, pending: null })
  const waits: number[] = []
  const result = await new GraphDriveRootDeltaAdapter({ transport, store, sleep: async (milliseconds) => { waits.push(milliseconds) } }).run(scope)

  assert.deepEqual(result, { pages: 1, events: 0, retries: 1, fullInventory: false, resynced: false })
  assert.deepEqual(waits, [7])
  assert.equal(store.commits.length, 1)
  assert.deepEqual(store.tombstoneHooks, [])
  assert.equal(store.cursor?.deltaLink, settled)
})

test('410 vencido inicia inventario completo seguro sin borrado masivo y reanuda con deltaLink nuevo', async () => {
  const expired = continuation('expired-root')
  const fresh = rootUrl()
  const settled = continuation('new-root')
  const transport = new ScriptedTransport([
    [expired, [{ status: 410 }]],
    [fresh, [{ status: 200, body: {
      value: [{ id: 'current-a', name: 'fresh.pdf', file: {}, parentReference: { id: 'root', path: `/drives/${DRIVE}/root:/registered/root` } }],
      '@odata.deltaLink': settled,
    } }]],
  ])
  const store = new MemoryVersionStore({ schema: GRAPH_DELTA_CURSOR_SCHEMA, deltaLink: expired, pending: null })
  const result = await new GraphDriveRootDeltaAdapter({ transport, store }).run(scope)

  assert.deepEqual(result, { pages: 1, events: 1, retries: 0, fullInventory: true, resynced: true })
  assert.deepEqual(store.began, ['EXPIRED_OR_CONFLICT'])
  assert.equal(store.commits[0].mode, 'INVENTORY')
  assert.equal(store.commits[0].inventoryCompleted, true)
  assert.deepEqual(store.tombstoneHooks, [])
  assert.equal(store.cursor?.deltaLink, settled)
})

test('409 agotado reinicia una sola vez con inventario y las URLs de Graph quedan en allowlist de raíz', async () => {
  const conflicted = continuation('conflicted-root')
  const fresh = rootUrl()
  const settled = continuation('after-conflict')
  const transport = new ScriptedTransport([
    [conflicted, [{ status: 409 }]],
    [fresh, [{ status: 200, body: { value: [], '@odata.deltaLink': settled } }]],
  ])
  const store = new MemoryVersionStore({ schema: GRAPH_DELTA_CURSOR_SCHEMA, deltaLink: conflicted, pending: null })
  const result = await new GraphDriveRootDeltaAdapter({ transport, store, maxRetries: 0 }).run(scope)

  assert.equal(result.resynced, true)
  assert.deepEqual(store.began, ['EXPIRED_OR_CONFLICT'])
  assert.doesNotThrow(() => assertAllowedDriveRootDeltaUrl(createDriveRootDeltaUrl(DRIVE), DRIVE))
  assert.throws(() => assertAllowedDriveRootDeltaUrl(new URL(`https://graph.microsoft.com/v1.0/drives/${DRIVE}/items/folder/delta`), DRIVE), GraphDeltaAdapterError)
  assert.throws(() => assertAllowedDriveRootDeltaUrl(new URL(`https://example.invalid/v1.0/drives/${DRIVE}/root/delta`), DRIVE), GraphDeltaAdapterError)
})

test('un fallo al persistir no adelanta cursor y el reinicio reenvía la misma página de forma idempotente', async () => {
  const prior = continuation('stable-before-failure')
  const settled = continuation('stable-after-retry')
  const page = {
    value: [{ id: 'item-retry', name: 'retry.pdf', file: {}, parentReference: { id: 'root', path: `/drives/${DRIVE}/root:/registered/root` } }],
    '@odata.deltaLink': settled,
  }
  const store = new FailingOnceVersionStore({ schema: GRAPH_DELTA_CURSOR_SCHEMA, deltaLink: prior, pending: null })

  await assert.rejects(
    () => new GraphDriveRootDeltaAdapter({ transport: new ScriptedTransport([[prior, [{ status: 200, body: page }]]]), store }).run(scope),
    /simulated durable failure/,
  )
  assert.equal(store.cursor?.deltaLink, prior, 'el adaptador no posee un cursor avanzado si la transacción no confirma')
  assert.equal(store.commits.length, 0)

  const result = await new GraphDriveRootDeltaAdapter({
    transport: new ScriptedTransport([[prior, [{ status: 200, body: page }]]]),
    store,
  }).run(scope)
  assert.equal(result.pages, 1)
  assert.equal(store.cursor?.deltaLink, settled)
  assert.equal(store.durableEventKeys.size, 1)
})

test('el transporte server-only manda bearer sólo a Graph fijo y no expone token al resultado del adaptador', async () => {
  let request: { url: string; authorization: string | null } | null = null
  const transport = new ServerGraphDeltaTransport({
    driveId: DRIVE,
    accessToken: async () => 'test-token',
    fetch: async (input, init) => {
      request = { url: String(input), authorization: new Headers(init?.headers).get('authorization') }
      return new Response(JSON.stringify({ value: [], '@odata.deltaLink': continuation('transport-only') }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  const response = await transport.get(createDriveRootDeltaUrl(DRIVE))
  assert.equal(response.status, 200)
  assert.equal(request?.url.startsWith('https://graph.microsoft.com/v1.0/drives/'), true)
  assert.equal(request?.authorization, 'Bearer test-token')
  await assert.rejects(
    () => transport.get(new URL('https://example.invalid/v1.0/drives/drive-safe/root/delta')),
    (error: unknown) => error instanceof GraphDeltaAdapterError && error.code === 'GRAPH_DELTA_URL_REJECTED',
  )
})

console.log('OK Graph Delta: mocks de paginación, duplicados, movimientos, tombstones, reintentos, expiración, restart y allowlist server-only; sin Graph/OCR/BD.')
