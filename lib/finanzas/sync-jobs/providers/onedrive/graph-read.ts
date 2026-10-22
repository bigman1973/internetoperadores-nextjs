import { SyncProviderError } from './types'

/** Only this narrow interface is exposed to the provider; it intentionally has no move/delete API. */
export type GraphFile = {
  id: string
  name: string
  size?: number
  eTag?: string
  lastModifiedDateTime?: string
  file?: { mimeType?: string }
  folder?: unknown
  relativeFolderPath: string
  folderPath: string
  fullPath: string
}

export type InvoiceLibrary = {
  driveId: string
  siteId: string
  rootPath: string
}

export interface OneDriveReadPort {
  resolveInvoiceLibrary(): Promise<InvoiceLibrary>
  /** Must either return every Graph page/descendant or reject; never partial. */
  listFolderContents(driveId: string, folderPath: string, recursive: boolean): Promise<GraphFile[]>
  /** Bounded by the caller's declared limit; no pre-authorized URL is persisted. */
  downloadFile(driveId: string, itemId: string, maxBytes: number): Promise<Uint8Array>
}

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const GRAPH_ORIGIN = 'https://graph.microsoft.com'
const MAX_GRAPH_PAGES = 10_000
const MAX_GRAPH_JSON_BYTES = 8 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 20_000

export type GraphCredentials = {
  tenantId: string
  clientId: string
  clientSecret: string
  siteId: string
  driveId: string
}

export type GraphReadOptions = {
  credentials: GraphCredentials
  invoiceRootPath?: string
  fetch?: typeof fetch
  requestTimeoutMs?: number
}

type TokenCache = { token: string; expiresAt: number }
type GraphPage = { value?: unknown; '@odata.nextLink'?: unknown }

function safeError(code: string): never { throw new SyncProviderError(code) }

function required(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim()) safeError(code)
  return value.trim()
}

function normalizeFolderPath(value: string): string {
  const path = value.split('/').filter(Boolean).join('/')
  if (!path) safeError('GRAPH_FOLDER_PATH_INVALID')
  return path
}

function component(value: string): string { return encodeURIComponent(value) }
function encodedPath(value: string): string { return normalizeFolderPath(value).split('/').map(component).join('/') }

function graphUrl(path: string): URL {
  if (!path.startsWith('/')) safeError('GRAPH_ROUTE_INVALID')
  return new URL(`${GRAPH_BASE}${path}`)
}

function assertGraphUrl(url: URL, expectedPathname?: string): void {
  if (
    url.protocol !== 'https:' || url.origin !== GRAPH_ORIGIN || url.hostname !== 'graph.microsoft.com' ||
    url.port !== '' || url.username || url.password || url.hash || !url.pathname.startsWith('/v1.0/') ||
    (expectedPathname !== undefined && url.pathname !== expectedPathname)
  ) safeError('GRAPH_NEXT_LINK_REJECTED')
}

function continuation(value: unknown, expectedPathname: string): URL {
  if (typeof value !== 'string' || !value) safeError('GRAPH_NEXT_LINK_INVALID')
  let url: URL
  try { url = new URL(value) } catch { return safeError('GRAPH_NEXT_LINK_INVALID') }
  assertGraphUrl(url, expectedPathname)
  return url
}

function itemFolderPath(parentPath: string, childName: unknown): string {
  if (typeof childName !== 'string' || !childName.trim() || childName.includes('/') || childName.includes('\\')) safeError('GRAPH_FOLDER_NAME_INVALID')
  return `${normalizeFolderPath(parentPath)}/${childName}`
}

function attachedItem(item: unknown, folderPath: string): GraphFile {
  const raw = item as Record<string, unknown> | null
  const id = raw && typeof raw.id === 'string' ? raw.id.trim() : ''
  const name = raw && typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!id) safeError('GRAPH_ITEM_ID_INVALID')
  if (!name || name.includes('/') || name.includes('\\')) safeError('GRAPH_ITEM_NAME_INVALID')
  const folder = normalizeFolderPath(folderPath)
  const size = typeof raw?.size === 'number' && Number.isSafeInteger(raw.size) && raw.size >= 0 ? raw.size : undefined
  const eTag = typeof raw?.eTag === 'string' && raw.eTag.length <= 1024 ? raw.eTag : undefined
  const lastModifiedDateTime = typeof raw?.lastModifiedDateTime === 'string' && raw.lastModifiedDateTime.length <= 128 ? raw.lastModifiedDateTime : undefined
  const fileRaw = raw?.file as Record<string, unknown> | undefined
  const mimeType = typeof fileRaw?.mimeType === 'string' && fileRaw.mimeType.length <= 256 ? fileRaw.mimeType : undefined
  return {
    id, name, size, eTag, lastModifiedDateTime,
    file: mimeType ? { mimeType } : undefined,
    folder: raw?.folder,
    relativeFolderPath: folder,
    folderPath: folder,
    fullPath: `${folder}/${name}`,
  }
}

async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  const announced = response.headers.get('content-length')
  if (announced && /^\d+$/.test(announced) && Number(announced) > maxBytes) safeError('GRAPH_RESPONSE_TOO_LARGE')
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) safeError('GRAPH_RESPONSE_TOO_LARGE')
    return bytes
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) safeError('GRAPH_RESPONSE_INVALID')
      length += value.byteLength
      if (length > maxBytes) {
        try { await reader.cancel() } catch { /* best effort */ }
        safeError('GRAPH_RESPONSE_TOO_LARGE')
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof SyncProviderError) throw error
    safeError('GRAPH_RESPONSE_READ_FAILED')
  }
  const out = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength }
  return out
}

/**
 * Production Graph reader. It is read-only by construction: it only issues GET
 * requests after one token POST, and its public type omits every Graph mutation.
 */
export class GraphOneDriveReadPort implements OneDriveReadPort {
  private readonly credentials: GraphCredentials
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly invoiceRootPath: string
  private tokenCache: TokenCache | null = null

  constructor(options: GraphReadOptions) {
    this.credentials = {
      tenantId: required(options.credentials.tenantId, 'GRAPH_TENANT_MISSING'),
      clientId: required(options.credentials.clientId, 'GRAPH_CLIENT_MISSING'),
      clientSecret: required(options.credentials.clientSecret, 'GRAPH_SECRET_MISSING'),
      siteId: required(options.credentials.siteId, 'GRAPH_SITE_MISSING'),
      driveId: required(options.credentials.driveId, 'GRAPH_DRIVE_MISSING'),
    }
    this.fetchImpl = options.fetch ?? fetch
    this.invoiceRootPath = normalizeFolderPath(options.invoiceRootPath || '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026')
    this.timeoutMs = Number.isSafeInteger(options.requestTimeoutMs) && options.requestTimeoutMs! >= 1_000 && options.requestTimeoutMs! <= 60_000
      ? options.requestTimeoutMs! : DEFAULT_TIMEOUT_MS
  }

  private async timedFetch(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(input, { ...init, signal: AbortSignal.timeout(this.timeoutMs), redirect: init.redirect ?? 'error' })
    } catch { safeError('GRAPH_NETWORK_FAILED') }
  }

  private async accessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) return this.tokenCache.token
    const url = `https://login.microsoftonline.com/${component(this.credentials.tenantId)}/oauth2/v2.0/token`
    const body = new URLSearchParams({
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    })
    const response = await this.timedFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    if (!response.ok) safeError('GRAPH_TOKEN_REJECTED')
    let data: Record<string, unknown>
    try { data = JSON.parse(new TextDecoder().decode(await readBounded(response, 128 * 1024))) } catch { return safeError('GRAPH_TOKEN_INVALID') }
    const token = typeof data.access_token === 'string' ? data.access_token : ''
    if (!token) safeError('GRAPH_TOKEN_INVALID')
    const expires = typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) ? data.expires_in : 300
    this.tokenCache = { token, expiresAt: Date.now() + Math.max(60, expires - 60) * 1_000 }
    return token
  }

  private async getJson(url: URL, expectedPathname?: string): Promise<Record<string, unknown>> {
    assertGraphUrl(url, expectedPathname)
    const response = await this.timedFetch(url, { headers: { Authorization: `Bearer ${await this.accessToken()}` } })
    if (!response.ok) safeError('GRAPH_READ_REJECTED')
    let parsed: unknown
    try { parsed = JSON.parse(new TextDecoder().decode(await readBounded(response, MAX_GRAPH_JSON_BYTES))) } catch { return safeError('GRAPH_JSON_INVALID') }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) safeError('GRAPH_JSON_INVALID')
    return parsed as Record<string, unknown>
  }

  private async collection(path: string): Promise<Record<string, unknown>[]> {
    let next: URL | null = graphUrl(path)
    const expectedPathname = next.pathname
    const visited = new Set<string>()
    const values: Record<string, unknown>[] = []
    for (let page = 0; next; page += 1) {
      if (page >= MAX_GRAPH_PAGES) safeError('GRAPH_PAGE_LIMIT')
      assertGraphUrl(next, expectedPathname)
      const visit = next.toString()
      if (visited.has(visit)) safeError('GRAPH_PAGE_LOOP')
      visited.add(visit)
      const data = await this.getJson(next, expectedPathname) as GraphPage
      if (!Array.isArray(data.value)) safeError('GRAPH_COLLECTION_INVALID')
      for (const item of data.value) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) safeError('GRAPH_COLLECTION_INVALID')
        values.push(item as Record<string, unknown>)
      }
      const rawNext = data['@odata.nextLink']
      next = rawNext === null || rawNext === undefined ? null : continuation(rawNext, expectedPathname)
    }
    return values
  }

  async resolveInvoiceLibrary(): Promise<InvoiceLibrary> {
    const site = await this.getJson(graphUrl(`/sites/${component(this.credentials.siteId)}`))
    if (site.id !== this.credentials.siteId) safeError('GRAPH_SITE_INVALID')
    const drive = await this.getJson(graphUrl(`/sites/${component(this.credentials.siteId)}/drives/${component(this.credentials.driveId)}`))
    if (drive.id !== this.credentials.driveId || (drive.parentReference as Record<string, unknown> | undefined)?.siteId && (drive.parentReference as Record<string, unknown>).siteId !== this.credentials.siteId) safeError('GRAPH_DRIVE_INVALID')
    const root = await this.getJson(graphUrl(`/drives/${component(this.credentials.driveId)}/root:/${encodedPath(this.invoiceRootPath)}`))
    if (!root.id || !root.folder) safeError('GRAPH_INVOICE_ROOT_INVALID')
    return { driveId: this.credentials.driveId, siteId: this.credentials.siteId, rootPath: this.invoiceRootPath }
  }

  async listFolderContents(driveId: string, folderPath: string, recursive: boolean): Promise<GraphFile[]> {
    if (driveId !== this.credentials.driveId) safeError('GRAPH_DRIVE_INVALID')
    const root = normalizeFolderPath(folderPath)
    const seen = new Set<string>()
    const visit = async (current: string): Promise<GraphFile[]> => {
      const path = `/drives/${component(driveId)}/root:/${encodedPath(current)}:/children?$top=200`
      const rawItems = await this.collection(path)
      const items = rawItems.map(raw => {
        const item = attachedItem(raw, current)
        if (seen.has(item.id)) safeError('GRAPH_DUPLICATE_ITEM')
        seen.add(item.id)
        return item
      })
      if (!recursive) return items
      const files: GraphFile[] = []
      for (const item of items) {
        if (item.folder) files.push(...await visit(itemFolderPath(current, item.name)))
        else files.push(item)
      }
      return files
    }
    return visit(root)
  }

  async downloadFile(driveId: string, itemId: string, maxBytes: number): Promise<Uint8Array> {
    if (driveId !== this.credentials.driveId || !itemId || !Number.isSafeInteger(maxBytes) || maxBytes < 1) safeError('GRAPH_DOWNLOAD_INPUT_INVALID')
    const url = graphUrl(`/drives/${component(driveId)}/items/${component(itemId)}/content`)
    const initial = await this.timedFetch(url, { headers: { Authorization: `Bearer ${await this.accessToken()}` }, redirect: 'manual' })
    let response = initial
    if (initial.status >= 300 && initial.status < 400) {
      const target = initial.headers.get('location')
      let redirected: URL
      try { redirected = new URL(target || '', url) } catch { return safeError('GRAPH_DOWNLOAD_REDIRECT_INVALID') }
      if (redirected.protocol !== 'https:' || redirected.username || redirected.password) safeError('GRAPH_DOWNLOAD_REDIRECT_INVALID')
      // No bearer token is ever forwarded to the pre-authorized download origin.
      response = await this.timedFetch(redirected, { method: 'GET' })
    }
    if (!response.ok) safeError('GRAPH_DOWNLOAD_REJECTED')
    return readBounded(response, maxBytes)
  }
}
