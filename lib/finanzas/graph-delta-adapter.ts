import { createHash } from 'node:crypto'

/**
 * Adaptador incremental de Microsoft Graph para el inventario documental.
 *
 * Alcance deliberadamente estrecho:
 * - consulta exclusivamente /drives/{driveId}/root/delta;
 * - no recibe ni devuelve tokens, URLs o credenciales al navegador;
 * - no importa Prisma, no hace OCR, no modifica B4 y no mueve archivos;
 * - delega la persistencia transaccional al almacén aditivo de versiones.
 *
 * Microsoft Graph devuelve deltaLink de la raíz del drive, no de una carpeta.
 * Las rutas registradas se usan únicamente para clasificar los eventos dentro de
 * ese inventario raíz. El almacén conserva la relación itemId/parentId para
 * resolver movimientos, incluso si parentReference.path viene omitido por Delta.
 */

const GRAPH_ORIGIN = 'https://graph.microsoft.com'
const GRAPH_VERSION_PATH = '/v1.0'
const MAX_ITEM_NAME_LENGTH = 512
const MAX_ITEM_ID_LENGTH = 512
const MAX_PATH_LENGTH = 4_000
const MAX_TAG_LENGTH = 1_024
const MAX_GRAPH_JSON_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_RETRIES = 2
const MAX_RETRY_AFTER_MS = 60_000

export const GRAPH_DELTA_CURSOR_SCHEMA = 'GRAPH_DRIVE_ROOT_DELTA_CURSOR_V1' as const

export class GraphDeltaAdapterError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'GraphDeltaAdapterError'
    this.code = code
  }
}

export type RegisteredDeltaPath = Readonly<{
  /** Estable e interno; no procede del navegador. */
  routeId: string
  /** Ruta relativa a la raíz del drive, sin slash inicial. */
  path: string
}>

export type GraphDriveRootDeltaScope = Readonly<{
  /** Identificador ya configurado y verificado en servidor. */
  driveId: string
  /** Identidad estable del origen para el almacén de versiones. */
  sourceKey: string
  /** Sólo se procesan documentos bajo estas rutas registradas. */
  registeredPaths: readonly RegisteredDeltaPath[]
}>

export type DeltaPendingCursor = Readonly<{
  kind: 'DELTA' | 'INVENTORY'
  /** URL Graph privada, guardada únicamente por el almacén de servidor. */
  continuationLink: string | null
  /** Sólo INVENTORY. Permite reanudar sin considerar ausencias como borrados. */
  inventorySessionId?: string
}>

/**
 * El deltaLink previo sigue siendo el último punto estable mientras exista
 * paginación pendiente. Nunca se promociona un cursor antes de persistir la
 * página que lo produjo.
 */
export type GraphDeltaCursor = Readonly<{
  schema: typeof GRAPH_DELTA_CURSOR_SCHEMA
  deltaLink: string | null
  pending: DeltaPendingCursor | null
}>

export type DeltaRouteHint = Readonly<{
  /** La ruta se pudo observar en esta respuesta; el almacén la revalida por ID. */
  kind: 'REGISTERED' | 'OUTSIDE_REGISTERED_PATHS' | 'UNRESOLVED'
  routeIds: readonly string[]
  observedPath: string | null
}>

export type GraphDeltaEvent = Readonly<{
  /** Hash opaco, idempotente y no apto para UI/logs con datos de proveedor. */
  eventKey: string
  /** Orden de aparición de la página; una repetición posterior gana. */
  sequence: number
  itemId: string
  name: string | null
  parentItemId: string | null
  isFolder: boolean
  kind: 'UPSERT' | 'TOMBSTONE'
  eTag: string | null
  cTag: string | null
  quickXorHash: string | null
  mimeType: string | null
  lastModifiedDateTime: string | null
  size: number | null
  routeHint: DeltaRouteHint
}>

export type GraphDeltaPage = Readonly<{
  value?: unknown
  '@odata.nextLink'?: unknown
  '@odata.deltaLink'?: unknown
}>

export type GraphDeltaHttpResponse = Readonly<{
  status: number
  body?: unknown
  retryAfterMs?: number | null
}>

/** Transporte sólo para código de servidor. El adaptador jamás adjunta tokens. */
export interface GraphDeltaTransport {
  get(url: URL): Promise<GraphDeltaHttpResponse>
}

export type InventoryReason = 'INITIAL' | 'EXPIRED_OR_CONFLICT'

export type GraphDeltaPageCommit = Readonly<{
  scope: Pick<GraphDriveRootDeltaScope, 'driveId' | 'sourceKey' | 'registeredPaths'>
  mode: 'DELTA' | 'INVENTORY'
  inventorySessionId: string | null
  /** Hash de la URL, no URL/token en auditoría funcional. */
  pageKey: string
  events: readonly GraphDeltaEvent[]
  cursorAfter: GraphDeltaCursor
  /** Sólo en la última página del inventario íntegro. */
  inventoryCompleted: boolean
}>

/** Señal informativa emitida sólo por una página ya confirmada. */
export type GraphDeltaPageCommitResult = Readonly<{
  projectionInvalidated?: boolean
}>

/**
 * Contrato para el bloque de versiones. Su implementación es la única que usa
 * Prisma y una migración aditiva. `commitPage` DEBE ser una transacción única:
 *
 * 1. deduplicar `pageKey` y `eventKey`; aplicar eventos por itemId en sequence;
 * 2. mantener parentId/nombre y recalcular rutas de descendientes ante movimientos;
 * 3. filtrar por `registeredPaths`, conservando fuentes ya rastreadas que salgan
 *    de ruta para abrir revisión de movimiento, pero sin importar fuentes nuevas
 *    ajenas;
 * 4. para cada TOMBSTONE rastreado, ejecutar el hook de borrado versionado:
 *    conserva versiones y confirmación financiera B4 y abre incidencia/revisión;
 *    nunca borra la fila documental ni deshace B4;
 * 5. si `inventoryCompleted`, comparar inventario completo sin hacer DELETE ni
 *    tratar ausencias como tombstones; registrar sólo candidatos a revisión;
 * 6. únicamente entonces escribir `cursorAfter`.
 *
 * Si cualquiera de estos pasos falla, la transacción hace rollback y el cursor
 * anterior queda vigente. Así una repetición después de caída es idempotente.
 */
export interface GraphDeltaVersionStore {
  /**
   * Optional short fence/cancellation preflight. The Prisma store supplies it so
   * every authenticated GET (including a retry/nextLink) rechecks the P2 claim.
   * Memory stores from prior callers remain source-compatible.
   */
  assertReady?(): Promise<void>
  loadCursor(scope: Pick<GraphDriveRootDeltaScope, 'driveId' | 'sourceKey'>): Promise<GraphDeltaCursor | null>
  /**
   * Inicia, de forma idempotente, una generación de inventario completo. No
   * elimina documentos ni marcas de borrado. Debe dejar cursor.pending=INVENTORY
   * con continuationLink null antes de devolver el identificador de sesión.
   */
  beginFullInventory(input: Readonly<{
    scope: Pick<GraphDriveRootDeltaScope, 'driveId' | 'sourceKey'>
    reason: InventoryReason
  }>): Promise<Readonly<{ inventorySessionId: string }>>
  /** Implementa la transacción y hook de tombstone descritos arriba. */
  commitPage(input: GraphDeltaPageCommit): Promise<void | GraphDeltaPageCommitResult>
}

export type GraphDeltaAdapterOptions = Readonly<{
  transport: GraphDeltaTransport
  store: GraphDeltaVersionStore
  /** Inyectable para pruebas; producción debe esperar realmente. */
  sleep?: (milliseconds: number) => Promise<void>
  maxRetries?: number
}>

export type GraphDeltaRunResult = Readonly<{
  pages: number
  events: number
  retries: number
  fullInventory: boolean
  resynced: boolean
  /** Sólo true si el store ya confirmó un reseñado dirigido por tombstone. */
  projectionInvalidated: boolean
}>

type ParsedPage = Readonly<{
  events: readonly GraphDeltaEvent[]
  nextLink: URL | null
  deltaLink: URL | null
}>

type RequestResult = Readonly<{
  page: GraphDeltaPage
  retries: number
}>

function projectionWasInvalidated(result: void | GraphDeltaPageCommitResult): boolean {
  return typeof result === 'object' && result !== null && result.projectionInvalidated === true
}

function fail(code: string): never { throw new GraphDeltaAdapterError(code) }

function boundedText(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string') fail(code)
  const normalized = value.normalize('NFKC').trim()
  if (!normalized || normalized.length > maximum || /[\u0000-\u001F\u007F]/.test(normalized)) fail(code)
  return normalized
}

function nullableBoundedText(value: unknown, maximum: number, code: string): string | null {
  if (value === undefined || value === null) return null
  return boundedText(value, maximum, code)
}

function opaqueHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeRoutePath(value: string): string {
  const raw = boundedText(value, MAX_PATH_LENGTH, 'GRAPH_DELTA_ROUTE_INVALID')
  const pieces = raw.replace(/^\/+|\/+$/g, '').split('/')
  if (!pieces.length || pieces.some((piece) => !piece || piece === '.' || piece === '..' || /[\\\u0000-\u001F\u007F]/.test(piece))) {
    fail('GRAPH_DELTA_ROUTE_INVALID')
  }
  return pieces.join('/')
}

function normalizedScope(scope: GraphDriveRootDeltaScope): GraphDriveRootDeltaScope {
  const driveId = boundedText(scope.driveId, 512, 'GRAPH_DELTA_DRIVE_INVALID')
  if (!/^[A-Za-z0-9!_.~-]+$/.test(driveId)) fail('GRAPH_DELTA_DRIVE_INVALID')
  const sourceKey = boundedText(scope.sourceKey, 256, 'GRAPH_DELTA_SOURCE_INVALID')
  if (!Array.isArray(scope.registeredPaths) || scope.registeredPaths.length === 0 || scope.registeredPaths.length > 100) {
    fail('GRAPH_DELTA_ROUTES_INVALID')
  }
  const seen = new Set<string>()
  const registeredPaths = scope.registeredPaths.map((entry) => {
    const routeId = boundedText(entry?.routeId, 128, 'GRAPH_DELTA_ROUTES_INVALID')
    const path = normalizeRoutePath(entry?.path)
    if (seen.has(routeId)) fail('GRAPH_DELTA_ROUTES_INVALID')
    seen.add(routeId)
    return { routeId, path }
  })
  return { driveId, sourceKey, registeredPaths }
}

/**
 * Construye exclusivamente el endpoint oficial de la raíz del drive. No existe
 * una variante por carpeta en este módulo: filtrar una subcarpeta no autoriza a
 * inventar deltaLink de esa subcarpeta.
 */
export function createDriveRootDeltaUrl(driveId: string): URL {
  const id = boundedText(driveId, 512, 'GRAPH_DELTA_DRIVE_INVALID')
  if (!/^[A-Za-z0-9!_.~-]+$/.test(id)) fail('GRAPH_DELTA_DRIVE_INVALID')
  const url = new URL(`${GRAPH_ORIGIN}${GRAPH_VERSION_PATH}/drives/${encodeURIComponent(id)}/root/delta`)
  url.searchParams.set('$select', 'id,name,parentReference,deleted,file,folder,size,eTag,cTag,lastModifiedDateTime')
  return url
}

/**
 * Valida continuaciones antes de que un transporte autenticado pueda adjuntar
 * Authorization. La consulta puede contener el token opaco que Graph emitió,
 * pero la ruta siempre debe ser exactamente el delta de esa raíz de drive.
 */
export function assertAllowedDriveRootDeltaUrl(value: URL, driveId: string): void {
  const expected = `${GRAPH_VERSION_PATH}/drives/${encodeURIComponent(driveId)}/root/delta`
  if (
    value.protocol !== 'https:' ||
    value.origin !== GRAPH_ORIGIN ||
    value.hostname !== 'graph.microsoft.com' ||
    value.port !== '' ||
    value.username ||
    value.password ||
    value.hash ||
    value.pathname !== expected
  ) fail('GRAPH_DELTA_URL_REJECTED')
}

function continuation(raw: unknown, driveId: string): URL {
  if (typeof raw !== 'string' || !raw) fail('GRAPH_DELTA_CONTINUATION_INVALID')
  let url: URL
  try { url = new URL(raw) } catch { return fail('GRAPH_DELTA_CONTINUATION_INVALID') }
  assertAllowedDriveRootDeltaUrl(url, driveId)
  return url
}

function pathFromParentReference(value: unknown, driveId: string, name: string | null): string | null {
  if (!name || !value || typeof value !== 'object' || Array.isArray(value)) return null
  const parent = value as Record<string, unknown>
  const rawPath = typeof parent.path === 'string' ? parent.path : null
  if (!rawPath || rawPath.length > MAX_PATH_LENGTH) return null
  const escapedDrive = encodeURIComponent(driveId)
  const prefixes = ['/drive/root:', `/drives/${escapedDrive}/root:`]
  const prefix = prefixes.find((entry) => rawPath === entry || rawPath.startsWith(`${entry}/`))
  if (!prefix) return null
  const tail = rawPath.slice(prefix.length).replace(/^\/+|\/+$/g, '')
  let decodedTail: string
  try { decodedTail = tail ? decodeURIComponent(tail) : '' } catch { return null }
  const raw = decodedTail ? `${decodedTail}/${name}` : name
  try { return normalizeRoutePath(raw) } catch { return null }
}

function routeHintFor(observedPath: string | null, registeredPaths: readonly RegisteredDeltaPath[]): DeltaRouteHint {
  if (!observedPath) return { kind: 'UNRESOLVED', routeIds: [], observedPath: null }
  const routeIds = registeredPaths
    .filter((route) => observedPath === route.path || observedPath.startsWith(`${route.path}/`))
    .map((route) => route.routeId)
  return routeIds.length
    ? { kind: 'REGISTERED', routeIds, observedPath }
    : { kind: 'OUTSIDE_REGISTERED_PATHS', routeIds: [], observedPath }
}

function tombstone(value: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(value, 'deleted') && value.deleted !== null && value.deleted !== undefined
}

function eventFromRaw(raw: unknown, sequence: number, pageKey: string, scope: GraphDriveRootDeltaScope): GraphDeltaEvent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('GRAPH_DELTA_ITEM_INVALID')
  const value = raw as Record<string, unknown>
  const itemId = boundedText(value.id, MAX_ITEM_ID_LENGTH, 'GRAPH_DELTA_ITEM_ID_INVALID')
  const kind = tombstone(value) ? 'TOMBSTONE' as const : 'UPSERT' as const
  const name = kind === 'TOMBSTONE' ? nullableBoundedText(value.name, MAX_ITEM_NAME_LENGTH, 'GRAPH_DELTA_ITEM_NAME_INVALID') : boundedText(value.name, MAX_ITEM_NAME_LENGTH, 'GRAPH_DELTA_ITEM_NAME_INVALID')
  if (name && (name.includes('/') || name.includes('\\'))) fail('GRAPH_DELTA_ITEM_NAME_INVALID')
  const parent = value.parentReference && typeof value.parentReference === 'object' && !Array.isArray(value.parentReference)
    ? value.parentReference as Record<string, unknown>
    : null
  const parentItemId = parent ? nullableBoundedText(parent.id, MAX_ITEM_ID_LENGTH, 'GRAPH_DELTA_PARENT_INVALID') : null
  const observedPath = kind === 'TOMBSTONE' ? null : pathFromParentReference(parent, scope.driveId, name)
  const size = value.size === undefined || value.size === null
    ? null
    : Number.isSafeInteger(value.size) && Number(value.size) >= 0 ? Number(value.size) : fail('GRAPH_DELTA_SIZE_INVALID')
  const isFolder = Boolean(value.folder) && !tombstone(value)
  const eTag = nullableBoundedText(value.eTag, MAX_TAG_LENGTH, 'GRAPH_DELTA_ETAG_INVALID')
  const cTag = nullableBoundedText(value.cTag, MAX_TAG_LENGTH, 'GRAPH_DELTA_CTAG_INVALID')
  const file = value.file && typeof value.file === 'object' && !Array.isArray(value.file)
    ? value.file as Record<string, unknown>
    : null
  const hashes = file?.hashes && typeof file.hashes === 'object' && !Array.isArray(file.hashes)
    ? file.hashes as Record<string, unknown>
    : null
  const quickXorHash = nullableBoundedText(hashes?.quickXorHash, MAX_TAG_LENGTH, 'GRAPH_DELTA_HASH_INVALID')
  const mimeType = nullableBoundedText(file?.mimeType, 256, 'GRAPH_DELTA_MIME_INVALID')
  const lastModifiedDateTime = nullableBoundedText(value.lastModifiedDateTime, 128, 'GRAPH_DELTA_MODIFIED_INVALID')
  return {
    // Deliberadamente estable entre relecturas de la misma versión: el almacén
    // puede rechazar una repetición aunque llegue desde otro cursor/página.
    // `pageKey` sigue siendo el recibo idempotente de la página completa.
    eventKey: opaqueHash(`${scope.sourceKey}:${itemId}:${kind}:${name ?? ''}:${parentItemId ?? ''}:${eTag ?? ''}:${cTag ?? ''}:${quickXorHash ?? ''}:${mimeType ?? ''}:${lastModifiedDateTime ?? ''}:${size ?? ''}`),
    sequence,
    itemId,
    name,
    parentItemId,
    isFolder,
    kind,
    eTag,
    cTag,
    quickXorHash,
    mimeType,
    lastModifiedDateTime,
    size,
    routeHint: routeHintFor(observedPath, scope.registeredPaths),
  }
}

function pageFromResponse(body: unknown, pageKey: string, scope: GraphDriveRootDeltaScope): ParsedPage {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('GRAPH_DELTA_RESPONSE_INVALID')
  const page = body as GraphDeltaPage
  if (!Array.isArray(page.value)) fail('GRAPH_DELTA_RESPONSE_INVALID')
  const events = page.value.map((item, index) => eventFromRaw(item, index, pageKey, scope))
  const nextLink = page['@odata.nextLink'] === undefined || page['@odata.nextLink'] === null
    ? null
    : continuation(page['@odata.nextLink'], scope.driveId)
  const deltaLink = page['@odata.deltaLink'] === undefined || page['@odata.deltaLink'] === null
    ? null
    : continuation(page['@odata.deltaLink'], scope.driveId)
  if (nextLink && deltaLink) fail('GRAPH_DELTA_RESPONSE_INVALID')
  if (!nextLink && !deltaLink) fail('GRAPH_DELTA_RESPONSE_INVALID')
  return { events, nextLink, deltaLink }
}

function validCursor(cursor: GraphDeltaCursor, driveId: string): GraphDeltaCursor {
  if (!cursor || cursor.schema !== GRAPH_DELTA_CURSOR_SCHEMA || (cursor.deltaLink !== null && typeof cursor.deltaLink !== 'string')) {
    fail('GRAPH_DELTA_CURSOR_INVALID')
  }
  if (cursor.deltaLink) assertAllowedDriveRootDeltaUrl(new URL(cursor.deltaLink), driveId)
  if (cursor.pending !== null) {
    if (!cursor.pending || (cursor.pending.kind !== 'DELTA' && cursor.pending.kind !== 'INVENTORY')) fail('GRAPH_DELTA_CURSOR_INVALID')
    if (cursor.pending.continuationLink !== null && typeof cursor.pending.continuationLink !== 'string') fail('GRAPH_DELTA_CURSOR_INVALID')
    if (cursor.pending.continuationLink) assertAllowedDriveRootDeltaUrl(new URL(cursor.pending.continuationLink), driveId)
    if (cursor.pending.kind === 'INVENTORY' && (!cursor.pending.inventorySessionId || typeof cursor.pending.inventorySessionId !== 'string')) {
      fail('GRAPH_DELTA_CURSOR_INVALID')
    }
  }
  return cursor
}

function parseRetryAfter(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const seconds = Number(value)
  if (!Number.isSafeInteger(seconds) || seconds < 0) return null
  return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS)
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = response.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_GRAPH_JSON_BYTES) fail('GRAPH_DELTA_RESPONSE_TOO_LARGE')
  if (!response.body) fail('GRAPH_DELTA_RESPONSE_INVALID')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > MAX_GRAPH_JSON_BYTES) {
        await reader.cancel()
        fail('GRAPH_DELTA_RESPONSE_TOO_LARGE')
      }
      chunks.push(part.value)
    }
  } finally {
    reader.releaseLock()
  }
  try { return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks, length))) } catch { return fail('GRAPH_DELTA_RESPONSE_INVALID') }
}

/**
 * Transporte autenticado de servidor. La obtención del token es una dependencia
 * inyectada: el token nunca entra en tipos, props o respuestas de cliente.
 */
export class ServerGraphDeltaTransport implements GraphDeltaTransport {
  private readonly accessToken: () => Promise<string>
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly driveId: string

  constructor(options: Readonly<{
    /** Allowlist de una única raíz Delta configurada en servidor. */
    driveId: string
    accessToken: () => Promise<string>
    fetch?: typeof fetch
    timeoutMs?: number
  }>) {
    if (typeof options.accessToken !== 'function') fail('GRAPH_DELTA_TOKEN_PORT_INVALID')
    this.driveId = boundedText(options.driveId, 512, 'GRAPH_DELTA_DRIVE_INVALID')
    if (!/^[A-Za-z0-9!_.~-]+$/.test(this.driveId)) fail('GRAPH_DELTA_DRIVE_INVALID')
    this.accessToken = options.accessToken
    this.fetchImpl = options.fetch ?? fetch
    this.timeoutMs = Number.isSafeInteger(options.timeoutMs) && options.timeoutMs! >= 1_000 && options.timeoutMs! <= 60_000
      ? options.timeoutMs!
      : 20_000
  }

  async get(url: URL): Promise<GraphDeltaHttpResponse> {
    // Defensa en profundidad: incluso si el transporte se invoca fuera del
    // adaptador, sólo entrega bearer al endpoint Delta exacto de su drive.
    assertAllowedDriveRootDeltaUrl(url, this.driveId)
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${await this.accessToken()}` },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch {
      fail('GRAPH_DELTA_NETWORK_FAILED')
    }
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'))
    if (!response.ok) return { status: response.status, retryAfterMs }
    return { status: response.status, retryAfterMs, body: await boundedJson(response) }
  }
}

export class GraphDriveRootDeltaAdapter {
  private readonly transport: GraphDeltaTransport
  private readonly store: GraphDeltaVersionStore
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly maxRetries: number

  constructor(options: GraphDeltaAdapterOptions) {
    this.transport = options.transport
    this.store = options.store
    this.sleep = options.sleep ?? (async (milliseconds) => { await new Promise<void>((resolve) => setTimeout(resolve, milliseconds)) })
    this.maxRetries = Number.isSafeInteger(options.maxRetries) && options.maxRetries! >= 0 && options.maxRetries! <= 5
      ? options.maxRetries!
      : DEFAULT_MAX_RETRIES
  }

  private async requestPage(
    url: URL,
    driveId: string,
    assertReady?: () => Promise<void>,
  ): Promise<RequestResult> {
    assertAllowedDriveRootDeltaUrl(url, driveId)
    let retries = 0
    for (;;) {
      // A response can have committed a page/cursor while cancellation is
      // requested immediately afterwards. Recheck at the exact bearer-backed
      // boundary, including after each bounded retry delay; never follow a
      // nextLink or retry under a stale P2 lease.
      await assertReady?.()
      const response = await this.transport.get(url)
      if (response.status === 200) return { page: response.body as GraphDeltaPage, retries }
      const retryable = response.status === 409 || response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504
      if (retryable && retries < this.maxRetries) {
        const fallback = Math.min(1_000 * (2 ** retries), MAX_RETRY_AFTER_MS)
        const delay = typeof response.retryAfterMs === 'number' && response.retryAfterMs >= 0
          ? Math.min(response.retryAfterMs, MAX_RETRY_AFTER_MS)
          : fallback
        retries += 1
        await this.sleep(delay)
        continue
      }
      if (response.status === 409 || response.status === 410) fail('GRAPH_DELTA_RESTART_REQUIRED')
      fail('GRAPH_DELTA_REQUEST_FAILED')
    }
  }

  private async beginInventory(scope: GraphDriveRootDeltaScope, reason: InventoryReason): Promise<GraphDeltaCursor> {
    const session = await this.store.beginFullInventory({ scope: { driveId: scope.driveId, sourceKey: scope.sourceKey }, reason })
    const inventorySessionId = boundedText(session?.inventorySessionId, 256, 'GRAPH_DELTA_INVENTORY_SESSION_INVALID')
    return { schema: GRAPH_DELTA_CURSOR_SCHEMA, deltaLink: null, pending: { kind: 'INVENTORY', continuationLink: null, inventorySessionId } }
  }

  /**
   * Ejecuta hasta que Graph entregue un deltaLink. Toda E/S durable está detrás
   * del puerto de versiones y cada URL continúa siendo únicamente server-side.
   */
  async run(rawScope: GraphDriveRootDeltaScope): Promise<GraphDeltaRunResult> {
    const scope = normalizedScope(rawScope)
    let cursor = await this.store.loadCursor({ driveId: scope.driveId, sourceKey: scope.sourceKey })
    let fullInventory = false
    let resynced = false
    if (cursor) cursor = validCursor(cursor, scope.driveId)
    if (!cursor) {
      cursor = await this.beginInventory(scope, 'INITIAL')
      fullInventory = true
    }

    let restarts = 0
    let pages = 0
    let events = 0
    let retries = 0
    let projectionInvalidated = false

    for (;;) {
      const pending = cursor.pending
      const mode: 'DELTA' | 'INVENTORY' = pending?.kind === 'INVENTORY' || !cursor.deltaLink ? 'INVENTORY' : 'DELTA'
      const url = pending?.continuationLink
        ? continuation(pending.continuationLink, scope.driveId)
        : mode === 'DELTA' && cursor.deltaLink
          ? continuation(cursor.deltaLink, scope.driveId)
          : createDriveRootDeltaUrl(scope.driveId)
      let response: RequestResult
      try {
        response = await this.requestPage(url, scope.driveId, this.store.assertReady?.bind(this.store))
      } catch (error) {
        if (!(error instanceof GraphDeltaAdapterError) || error.code !== 'GRAPH_DELTA_RESTART_REQUIRED' || restarts >= 1) throw error
        // 410 is the documented expired-token response. 409 is retried above and,
        // once exhausted, is also fail-closed into an inventory rebuild. Neither
        // path deletes any local document or treats an unread item as deleted.
        cursor = await this.beginInventory(scope, 'EXPIRED_OR_CONFLICT')
        fullInventory = true
        resynced = true
        restarts += 1
        continue
      }

      retries += response.retries
      const pageKey = opaqueHash(url.toString())
      const parsed = pageFromResponse(response.page, pageKey, scope)
      const inventorySessionId = mode === 'INVENTORY' ? pending?.inventorySessionId ?? null : null
      if (mode === 'INVENTORY' && !inventorySessionId) fail('GRAPH_DELTA_INVENTORY_SESSION_INVALID')
      const lastPage = parsed.nextLink === null
      const nextCursor: GraphDeltaCursor = lastPage
        ? {
          schema: GRAPH_DELTA_CURSOR_SCHEMA,
          deltaLink: parsed.deltaLink!.toString(),
          pending: null,
        }
        : {
          schema: GRAPH_DELTA_CURSOR_SCHEMA,
          // Keep the last completed deltaLink until the new delta batch ends.
          deltaLink: mode === 'DELTA' ? cursor.deltaLink : null,
          pending: {
            kind: mode,
            continuationLink: parsed.nextLink!.toString(),
            ...(mode === 'INVENTORY' ? { inventorySessionId: inventorySessionId! } : {}),
          },
        }

      // commitPage is the ordering boundary: events and tombstone consequences
      // are durable/idempotent before the continuation or deltaLink is promoted.
      const committed = await this.store.commitPage({
        scope: { driveId: scope.driveId, sourceKey: scope.sourceKey, registeredPaths: scope.registeredPaths },
        mode,
        inventorySessionId,
        pageKey,
        events: parsed.events,
        cursorAfter: nextCursor,
        inventoryCompleted: mode === 'INVENTORY' && lastPage,
      })
      projectionInvalidated ||= projectionWasInvalidated(committed)
      pages += 1
      events += parsed.events.length
      cursor = nextCursor
      if (lastPage) return { pages, events, retries, fullInventory, resynced, projectionInvalidated }
    }
  }
}
