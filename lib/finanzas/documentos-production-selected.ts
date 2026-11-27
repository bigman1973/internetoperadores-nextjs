import 'server-only'
import { fail, MAX_FILE_BYTES } from './documentos-panel-core'
import { DOCUMENTOS_PRODUCTION_ROOT, assertDocumentosApprovedProductionPins, documentosPanelProductionPins, type DocumentosProductionPins } from './documentos-panel-runtime'

/** No I/O on import or factory construction. Never imports the shared Graph client. */
type Env = Record<string, string | undefined>
export type SelectedCredential = Readonly<{ tenantId: string; clientId: string; clientSecret: string }>
export type SelectedRoot = Readonly<{ driveId: string; folderItemId: string; relativeLabel: string }>
export type SelectedDependencies = Readonly<{ fetch?: typeof fetch; tokenProvider?: () => Promise<string>; guard: () => Promise<unknown> }>
export const SELECTED_LIMITS = { pages: 200, nodes: 6000, files: 5000, depth: 24, jsonBytes: 1024 * 1024 } as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ID = /^[A-Za-z0-9!_.~,-]{4,220}$/
const GRAPH = 'https://graph.microsoft.com/v1.0'
const SELECT = 'id,name,folder,file,parentReference,size,eTag,lastModifiedDateTime,createdDateTime,remoteItem'
const SELECTED_ROLE = 'Files.SelectedOperations.Selected'
const graphId = (value: string) => { if (!ID.test(value) || value.toLowerCase() === 'root') fail(503, 'DOCUMENTOS_SELECTED_PIN_INVALID', 'ID Selected exacto obligatorio; nunca raíz de unidad.'); return encodeURIComponent(value) }
function safeLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 600 && !/[\\\u0000-\u001f\u007f]/.test(value)
    && value.split('/').every(part => !!part && part !== '.' && !part.includes('..') && !/%[0-9a-f]{2}/i.test(part) && part.length <= 220)
}
export function selectedCredential(env: Env, prefix: 'FINANCE_DOCUMENTOS_GRAPH' | 'FINANCE_DOCUMENTOS_COMPARACION_GRAPH'): SelectedCredential {
  const tenantId = env[`${prefix}_TENANT_ID`], clientId = env[`${prefix}_CLIENT_ID`], clientSecret = env[`${prefix}_CLIENT_SECRET`]
  if (!tenantId || !clientId || !clientSecret || !UUID.test(tenantId) || !UUID.test(clientId) || clientSecret.length < 1 || clientSecret.length > 8192 || /[\u0000-\u001f\u007f]/.test(clientSecret)) {
    fail(503, 'DOCUMENTOS_SELECTED_AUTH_MISSING', 'Falta credencial documental dedicada válida; no se admite fallback genérico ni tenant alias.')
  }
  return Object.freeze({ tenantId: tenantId.toLowerCase(), clientId: clientId.toLowerCase(), clientSecret })
}
export function assertDocumentosProductionTransportConfigured(env: Env = process.env): void {
  if (!documentosPanelProductionPins(env)) fail(503, 'DOCUMENTOS_SELECTED_PIN_MISSING', 'Faltan pins exactos del destino documental.')
  selectedCredential(env, 'FINANCE_DOCUMENTOS_GRAPH')
}
/** Claims are inspected only on a token obtained from the fixed HTTPS tenant endpoint
 * (or the offline test provider). Graph performs signature/resource-grant enforcement.
 * Exact role allowlist rejects All AND higher-level Selected grants, delegated tokens,
 * foreign tenant/app/audience, expiry, and opaque tokens. Never logs token/secret. */
export function verifySelectedToken(token: string, credential: SelectedCredential, now = Date.now()): void {
  let claims: any
  try {
    if (typeof token !== 'string' || token.length > 32768 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw Error()
    claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
  } catch { fail(503, 'DOCUMENTOS_SELECTED_TOKEN_INVALID', 'Token documental no verificable.') }
  if (claims.scp !== undefined || !Array.isArray(claims.roles) || claims.roles.length !== 1 || claims.roles[0] !== SELECTED_ROLE) {
    fail(503, 'DOCUMENTOS_SELECTED_ROLES_REJECTED', 'Sólo se admite Files.SelectedOperations.Selected application; permisos amplios o adicionales rechazados.')
  }
  const app = claims.azp ?? claims.appid
  if (claims.tid !== credential.tenantId || app !== credential.clientId || (claims.azp && claims.appid && claims.azp !== claims.appid)
    || !['00000003-0000-0000-c000-000000000000', 'https://graph.microsoft.com', 'https://graph.microsoft.com/'].includes(claims.aud)
    || ![`https://sts.windows.net/${credential.tenantId}/`, `https://login.microsoftonline.com/${credential.tenantId}/v2.0`].includes(claims.iss)
    || !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= now + 30000
    || (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf * 1000 > now + 30000))) {
    fail(503, 'DOCUMENTOS_SELECTED_TOKEN_INVALID', 'Token no corresponde al tenant/aplicación/audiencia Graph vigente.')
  }
}
export async function boundedSelectedBytes(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = response.headers.get('content-length')
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes))) {
    await response.body?.cancel(); fail(413, 'ARCHIVO_FUERA_DE_LIMITE', 'Respuesta Selected supera el límite.')
  }
  if (!response.body) fail(502, 'DOCUMENTOS_SELECTED_BODY_MISSING', 'Respuesta Selected sin cuerpo.')
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > maxBytes) { await reader.cancel(); fail(413, 'ARCHIVO_FUERA_DE_LIMITE', 'Respuesta Selected supera el límite.'); } chunks.push(part.value) }
  } finally { reader.releaseLock() }
  if (!size) fail(502, 'DOCUMENTOS_SELECTED_BODY_MISSING', 'Respuesta Selected vacía.')
  return Buffer.concat(chunks, size)
}
export function parseSelectedSourceRoots(env: Env, knownLegacyRoot: string, destination: Pick<DocumentosProductionPins, 'driveId' | 'folderItemId'>): readonly SelectedRoot[] {
  let raw: unknown
  try { const json = env.FINANCE_DOCUMENTOS_COMPARACION_SELECTED_ROOTS; if (!json || Buffer.byteLength(json) > 16384) throw Error(); raw = JSON.parse(json) } catch { fail(503, 'DOCUMENTOS_SELECTED_SOURCE_PINS_MISSING', 'Faltan raíces de lectura Selected declaradas en servidor.') }
  if (!safeLabel(knownLegacyRoot) || !Array.isArray(raw) || !raw.length || raw.length > 12) fail(503, 'DOCUMENTOS_SELECTED_SOURCE_PINS_INVALID', 'Configuración Selected de fuentes no válida.')
  const roots: SelectedRoot[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).sort().join(',') !== 'driveId,folderItemId,relativeLabel'
      || typeof row.driveId !== 'string' || typeof row.folderItemId !== 'string' || !safeLabel(row.relativeLabel)
      || !(row.relativeLabel === knownLegacyRoot || row.relativeLabel.startsWith(`${knownLegacyRoot}/`))) fail(503, 'DOCUMENTOS_SELECTED_SOURCE_PINS_INVALID', 'La fuente debe ser ID exacto y etiqueta relativa dentro del namespace legacy conocido.')
    graphId(row.driveId); graphId(row.folderItemId)
    if ((row.driveId === destination.driveId && row.folderItemId === destination.folderItemId)
      || roots.some(r => r.relativeLabel === row.relativeLabel || (r.driveId === row.driveId && (r.folderItemId === row.folderItemId || r.relativeLabel.startsWith(`${row.relativeLabel}/`) || row.relativeLabel.startsWith(`${r.relativeLabel}/`))))) fail(503, 'DOCUMENTOS_SELECTED_SCOPES_OVERLAP', 'Raíces duplicadas o solapadas; no se amplía el alcance.')
    roots.push(Object.freeze({ driveId: row.driveId, folderItemId: row.folderItemId, relativeLabel: row.relativeLabel }))
  }
  return Object.freeze(roots)
}

/** Capability namespace: only pinned root GET, validated descendants and direct child
 * path lookups are possible. Unknown item IDs are rejected before ANY Graph request.
 * Source instances are GET-only; no site/root/drive discovery or permission management. */
export function createSelectedTransport(credential: SelectedCredential, roots: readonly SelectedRoot[], readOnly: boolean, deps: SelectedDependencies, forbiddenRoots: readonly Pick<DocumentosProductionPins, 'driveId' | 'folderItemId'>[] = [], destinationPins?: DocumentosProductionPins) {
  if (destinationPins) {
    assertDocumentosApprovedProductionPins(destinationPins)
    if (roots.length !== 1 || roots[0].driveId !== destinationPins.driveId || roots[0].folderItemId !== destinationPins.folderItemId || roots[0].relativeLabel !== DOCUMENTOS_PRODUCTION_ROOT) fail(503, 'DOCUMENTOS_SELECTED_PIN_MISMATCH', 'Destino Selected distinto de la carpeta 10 aprobada.')
    destinationPins = Object.freeze({ ...destinationPins })
  }
  const http = deps.fetch ?? fetch
  const nodes = new Map<string, any>()
  const rootMap = new Map<string, SelectedRoot>()
  const key = (drive: string, item: string) => `${drive}\u0000${item}`
  for (const root of roots) { graphId(root.driveId); graphId(root.folderItemId); if (!safeLabel(root.relativeLabel) || rootMap.has(key(root.driveId, root.folderItemId))) fail(503, 'DOCUMENTOS_SELECTED_PIN_INVALID', 'Raíz Selected inválida.'); rootMap.set(key(root.driveId, root.folderItemId), Object.freeze({ ...root })) }
  if (!roots.length) fail(503, 'DOCUMENTOS_SELECTED_PIN_MISSING', 'Raíz Selected obligatoria.')
  const prohibited = new Set(forbiddenRoots.map(r => key(r.driveId, r.folderItemId)))
  let tokenPromise: Promise<string> | undefined
  const token = async () => {
    if (!tokenPromise) tokenPromise = (async () => {
      await deps.guard()
      let result: string
      if (deps.tokenProvider) result = await deps.tokenProvider()
      else {
        // Revalidate direct factory input before interpolating a tenant in the URL.
        if (!UUID.test(credential.tenantId) || !UUID.test(credential.clientId) || !credential.clientSecret) fail(503, 'DOCUMENTOS_SELECTED_AUTH_MISSING', 'Credencial dedicada no válida.')
        const response = await http(`https://login.microsoftonline.com/${credential.tenantId}/oauth2/v2.0/token`, {
          method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: credential.clientId, client_secret: credential.clientSecret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }).toString(),
          redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000),
        })
        if (!response.ok) fail(503, 'DOCUMENTOS_SELECTED_AUTH_FAILED', 'No se obtuvo token documental dedicado.')
        let body: any; try { body = JSON.parse((await boundedSelectedBytes(response, 65536)).toString('utf8')) } catch { fail(503, 'DOCUMENTOS_SELECTED_AUTH_FAILED', 'Respuesta de autenticación documental no válida.') }
        if (body.token_type?.toLowerCase() !== 'bearer') fail(503, 'DOCUMENTOS_SELECTED_AUTH_FAILED', 'Token documental no bearer.')
        result = body.access_token
      }
      verifySelectedToken(result, credential); await deps.guard(); return result
    })()
    const value = await tokenPromise; verifySelectedToken(value, credential); return value
  }
  const observe = (item: any, drive: string, parent?: string, expectedId?: string, expectedName?: string) => {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || !safeLabel(item.name) || item.name.includes('/') || item.remoteItem) fail(502, 'DOCUMENTOS_SELECTED_METADATA_INVALID', 'Metadatos Selected no válidos.')
    graphId(item.id)
    if (expectedId && item.id !== expectedId || expectedName && item.name !== expectedName || item.parentReference?.driveId !== drive) fail(502, 'DOCUMENTOS_SELECTED_SCOPE_MISMATCH', 'ID, nombre o drive ajeno al alcance fijado.')
    const itemKey = key(drive, item.id), root = rootMap.get(itemKey)
    if (prohibited.has(itemKey) || prohibited.has(key(drive, item.parentReference?.id)) || (parent && root)) fail(502, 'DOCUMENTOS_SELECTED_SCOPES_OVERLAP', 'Raíces Selected solapadas o ajenas.')
    if (root) {
      if (!item.folder || item.file || item.name !== root.relativeLabel.split('/').pop()) fail(502, 'DOCUMENTOS_SELECTED_SCOPE_MISMATCH', 'Carpeta raíz Selected fijada no verificable.')
    } else if (!parent || item.parentReference?.id !== parent || !nodes.get(key(drive, parent))?.folder) fail(502, 'DOCUMENTOS_SELECTED_SCOPE_MISMATCH', 'Descendiente no pertenece al padre autorizado.')
    if (destinationPins && !root) {
      const expectedName = item.id === destinationPins.pendingFolderItemId ? 'Pendientes' : item.id === destinationPins.archivedFolderItemId ? 'Archivadas' : undefined
      if (expectedName ? (!item.folder || item.file || item.name !== expectedName || parent !== destinationPins.folderItemId)
        : (!item.file || item.folder || ![destinationPins.pendingFolderItemId, destinationPins.archivedFolderItemId].includes(parent!))) fail(502, 'DOCUMENTOS_SELECTED_SCOPE_MISMATCH', 'Sólo carpetas pin exactas y archivos directos bajo ellas.')
    }
    if (!!item.folder === !!item.file || item.file && (!Number.isSafeInteger(item.size) || item.size < 1)) fail(502, 'DOCUMENTOS_SELECTED_METADATA_INVALID', 'Facet/tamaño Selected no válido.')
    const previous = nodes.get(itemKey)
    if (previous && previous.parentReference?.id !== item.parentReference?.id && readOnly) fail(502, 'DOCUMENTOS_SELECTED_CHANGED', 'El inventario cambió de padre durante la lectura.')
    nodes.set(itemKey, item)
  }
  const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
    await deps.guard()
    if (!path.startsWith('/drives/') || /[\\\u0000-\u0020\u007f]/.test(path)) fail(502, 'DOCUMENTOS_SELECTED_PATH_REJECTED', 'Ruta fuera del transporte Selected.')
    const url = new URL(`${GRAPH}${path}`)
    if (url.origin !== 'https://graph.microsoft.com' || url.hash || url.username || url.password || url.port || !url.pathname.startsWith('/v1.0/drives/')) fail(502, 'DOCUMENTOS_SELECTED_PATH_REJECTED', 'Sólo Graph v1.0 fijado.')
    const match = url.pathname.match(/^\/v1\.0\/drives\/([^/]+)\/items\/([^/:]+)(?:(:\/([^/:]+)(:\/content)?)|\/(children|content))?$/)
    if (!match) fail(502, 'DOCUMENTOS_SELECTED_PATH_REJECTED', 'Operación Selected no autorizada.')
    let drive: string, itemId: string, child: string | undefined
    try { drive = decodeURIComponent(match[1]); itemId = decodeURIComponent(match[2]); child = match[4] ? decodeURIComponent(match[4]) : undefined } catch { fail(502, 'DOCUMENTOS_SELECTED_PATH_REJECTED', 'Ruta Selected mal codificada.') }
    graphId(drive); graphId(itemId)
    if (child && (!safeLabel(child) || child.includes('/'))) fail(502, 'DOCUMENTOS_SELECTED_PATH_REJECTED', 'Nombre fuera del namespace Selected.')
    const method = (init.method ?? 'GET').toUpperCase(), resource = match[6], content = !!match[5] || resource === 'content'
    const pinned = rootMap.has(key(drive, itemId)), known = nodes.get(key(drive, itemId))
    const fixedChildName = destinationPins && drive === destinationPins.driveId
      ? itemId === destinationPins.pendingFolderItemId ? 'Pendientes' : itemId === destinationPins.archivedFolderItemId ? 'Archivadas' : undefined : undefined
    const fixedChild = !!fixedChildName && !!nodes.get(key(drive, destinationPins!.folderItemId))?.folder
    if (destinationPins && ((pinned && (child || resource)) || (child && !fixedChildName) || (resource === 'children' && !fixedChildName))) fail(403, 'DOCUMENTOS_SELECTED_OUTSIDE_ROOT', 'Sin lista/discovery del root; lookup sólo de archivos en las dos carpetas pin.')
    if (!pinned && !known && !fixedChild || prohibited.has(key(drive, itemId)) || ((child || resource === 'children') && !known?.folder)
      || (resource === 'content' && !known?.file)) fail(403, 'DOCUMENTOS_SELECTED_OUTSIDE_ROOT', 'ID no autorizado por la raíz Selected exacta.')
    const entries = [...url.searchParams.entries()]
    if (new Set(entries.map(([k]) => k)).size !== entries.length || entries.some(([k,v]) => !['$select', '$top', '$skiptoken', '@microsoft.graph.conflictBehavior'].includes(k) || v.length > 8192)
      || (url.searchParams.has('$select') && url.searchParams.get('$select')!.split(',').some(s => !SELECT.split(',').includes(s)))
      || (url.searchParams.has('$top') && url.searchParams.get('$top') !== '200')
      || (url.searchParams.has('$skiptoken') && resource !== 'children')
      || (url.searchParams.has('@microsoft.graph.conflictBehavior') && (method !== 'PUT' || url.searchParams.get('@microsoft.graph.conflictBehavior') !== 'fail'))
      || (content && entries.some(([k]) => k !== '@microsoft.graph.conflictBehavior'))
      || (child && !content && entries.some(([k]) => k !== '$select'))) fail(502, 'DOCUMENTOS_SELECTED_PATH_REJECTED', 'Query Selected no autorizada.')
    // No unbounded metadata request can obtain downloadUrl/webUrl incidentally.
    if (method === 'GET' && !content && !child && !url.searchParams.get('$select')) fail(502, 'DOCUMENTOS_SELECTED_PATH_REJECTED', 'Lectura requiere selección explícita de metadatos mínimos.')
    const headers = new Headers(init.headers)
    if (method !== 'GET') {
      if (readOnly || pinned || !['PUT','PATCH'].includes(method)) fail(403, 'DOCUMENTOS_SELECTED_READ_ONLY', 'El transporte no concede esta mutación.')
      if (destinationPins && method === 'PUT' && itemId !== destinationPins.pendingFolderItemId) fail(403, 'DOCUMENTOS_SELECTED_MUTATION_REJECTED', 'Sólo se sube a Pendientes aprobado.')
      if (method === 'PUT' && (!child || !content || headers.get('if-none-match') !== '*' || url.searchParams.get('@microsoft.graph.conflictBehavior') !== 'fail'
        || Object.prototype.toString.call(init.body) !== '[object ArrayBuffer]' || !Number.isSafeInteger((init.body as ArrayBuffer).byteLength)
        || (init.body as ArrayBuffer).byteLength < 1 || (init.body as ArrayBuffer).byteLength > MAX_FILE_BYTES
        || headers.get('content-length') !== String((init.body as ArrayBuffer).byteLength))) fail(403, 'DOCUMENTOS_SELECTED_MUTATION_REJECTED', 'Sólo subida limitada create-if-absent.')
      if (method === 'PATCH') {
        let body: any; try { body = JSON.parse(init.body as string) } catch { fail(403, 'DOCUMENTOS_SELECTED_MUTATION_REJECTED', 'Movimiento Selected inválido.') }
        if (!known?.file || child || resource || !headers.get('if-match') || Object.keys(body).sort().join(',') !== '@microsoft.graph.conflictBehavior,name,parentReference'
          || !safeLabel(body.name) || body.name.includes('/') || body['@microsoft.graph.conflictBehavior'] !== 'fail'
          || !body.parentReference || Object.keys(body.parentReference).join(',') !== 'id' || !nodes.get(key(drive, body.parentReference.id))?.folder) fail(403, 'DOCUMENTOS_SELECTED_MUTATION_REJECTED', 'Movimiento fuera del mismo namespace fijado.')
        if (destinationPins && (known.parentReference?.id !== destinationPins.pendingFolderItemId || body.parentReference.id !== destinationPins.archivedFolderItemId)) fail(403, 'DOCUMENTOS_SELECTED_MUTATION_REJECTED', 'Sólo se archiva desde Pendientes hacia Archivadas aprobados.')
      }
    } else if (init.body != null) fail(403, 'DOCUMENTOS_SELECTED_PATH_REJECTED', 'Lectura sin body.')
    headers.set('Authorization', `Bearer ${await token()}`); await deps.guard()
    if (child && method === 'GET' && !content) url.searchParams.set('$select', SELECT)
    const response = await http(url, { ...init, method, headers, redirect: content ? 'manual' : 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) })
    await deps.guard()
    if (!response.ok || content && method === 'GET') return response
    let body: any; try { body = JSON.parse((await boundedSelectedBytes(response, SELECTED_LIMITS.jsonBytes)).toString('utf8')) } catch (error) { if ((error as any)?.code) throw error; fail(502, 'DOCUMENTOS_SELECTED_METADATA_INVALID', 'JSON Graph no válido.') }
    if (resource === 'children') {
      if (!Array.isArray(body.value) || body.value.length > 200) fail(502, 'DOCUMENTOS_SELECTED_METADATA_INVALID', 'Página Selected no válida.')
      for (const value of body.value) observe(value, drive, itemId)
    } else if (child) observe(body, drive, itemId, undefined, child)
    else if (pinned) observe(body, drive, undefined, itemId)
    else if (fixedChildName) {
      if (!body.folder || body.file) fail(502, 'DOCUMENTOS_SELECTED_SCOPE_MISMATCH', 'Pin hijo no es carpeta.')
      observe(body, drive, destinationPins!.folderItemId, itemId, fixedChildName)
    } else observe(body, drive, body.parentReference?.id, itemId)
    return Response.json(body, { status: response.status })
  }
  const json = async (path: string) => { const response = await request(path); if (!response.ok) fail(502, 'DOCUMENTOS_SELECTED_READ_FAILED', `Graph Selected no confirmó lectura (${response.status}).`); return response.json() }
  const verifyRoot = async (root: SelectedRoot) => { if (rootMap.get(key(root.driveId, root.folderItemId))?.relativeLabel !== root.relativeLabel) fail(403, 'DOCUMENTOS_SELECTED_OUTSIDE_ROOT', 'Raíz/etiqueta no fijada.'); await json(`/drives/${graphId(root.driveId)}/items/${graphId(root.folderItemId)}?$select=${SELECT}`) }
  const children = async (drive: string, parent: string, visit: (item: any) => void, budget: { pages: number; nodes: number }) => {
    const base = `/drives/${graphId(drive)}/items/${graphId(parent)}/children`
    let path: string | null = `${base}?$select=${SELECT}&$top=200`; const visited = new Set<string>()
    while (path) {
      if (++budget.pages > SELECTED_LIMITS.pages || visited.has(path)) fail(502, 'DOCUMENTOS_SELECTED_PAGE_CAP', 'Páginas Selected limitadas o repetidas; inventario incompleto.')
      visited.add(path); const body = await json(path)
      for (const item of body.value) { if (++budget.nodes > SELECTED_LIMITS.nodes) fail(502, 'DOCUMENTOS_SELECTED_NODE_CAP', 'Inventario Selected excede límite.'); visit(item) }
      path = null
      if (body['@odata.nextLink'] !== undefined) {
        let next: URL; try { next = new URL(body['@odata.nextLink']) } catch { fail(502, 'DOCUMENTOS_SELECTED_NEXTLINK_INVALID', 'Página Selected inválida.') }
        if (next.origin !== 'https://graph.microsoft.com' || next.pathname !== `/v1.0${base}` || next.username || next.password || next.hash || next.port
          || !next.searchParams.has('$skiptoken') || next.searchParams.get('$select') !== SELECT || next.searchParams.get('$top') !== '200') fail(502, 'DOCUMENTOS_SELECTED_NEXTLINK_INVALID', 'Página ajena al mismo padre/drive fijado.')
        path = `${base}${next.search}`
      }
    }
  }
  return {
    request,
    async listRoot(root: SelectedRoot) {
      await verifyRoot(root)
      const result: any[] = [], seen = new Set<string>([root.folderItemId]), budget = { pages: 0, nodes: 0 }
      const walk = async (parent: string, label: string, depth: number) => {
        if (depth > SELECTED_LIMITS.depth) fail(502, 'DOCUMENTOS_SELECTED_DEPTH_CAP', 'Profundidad Selected excedida.')
        const folders: any[] = []
        await children(root.driveId, parent, item => {
          if (seen.has(item.id)) fail(502, 'DOCUMENTOS_SELECTED_DUPLICATE_ID', 'ID repetido o ciclo en inventario Selected.')
          seen.add(item.id)
          const fullPath = `${label}/${item.name}`
          if (item.folder) folders.push({ item, fullPath })
          else { if (result.length >= SELECTED_LIMITS.files) fail(502, 'DOCUMENTOS_SELECTED_FILE_CAP', 'Inventario Selected supera límite de archivos.'); result.push({ ...item, fullPath }) }
        }, budget)
        for (const folder of folders) await walk(folder.item.id, folder.fullPath, depth + 1)
      }
      await walk(root.folderItemId, root.relativeLabel, 0); await deps.guard(); return result
    },
    async authorizeItem(drive: string, itemId: string, parents: readonly string[]) {
      graphId(itemId)
      if (nodes.get(key(drive, itemId))?.file) return
      let found = false; const budget = { pages: 0, nodes: 0 }
      for (const parent of parents) { if (!nodes.get(key(drive,parent))?.folder) fail(403, 'DOCUMENTOS_SELECTED_OUTSIDE_ROOT', 'Padre no autorizado.'); await children(drive, parent, item => { if (item.id === itemId && item.file) found = true }, budget) }
      if (!found) fail(403, 'DOCUMENTOS_SELECTED_OUTSIDE_ROOT', 'Original no está bajo los padres autorizados; no se consulta ID ajeno.')
    },
    async download(drive: string, itemId: string, maxBytes = MAX_FILE_BYTES) {
      if (!nodes.get(key(drive,itemId))?.file) fail(403, 'DOCUMENTOS_SELECTED_OUTSIDE_ROOT', 'Archivo no acreditado en raíz Selected.')
      // Recheck the whole known ancestry without ever reading a drive root.
      // A folder moved outside the pin must not preserve stale local authority.
      const ancestors: string[] = []; const seen = new Set<string>(); let current = itemId
      while (!rootMap.has(key(drive,current))) {
        if (seen.has(current) || ancestors.length > SELECTED_LIMITS.depth + 1) fail(502, 'DOCUMENTOS_SELECTED_SCOPE_MISMATCH', 'Cadena de padres Selected no válida.')
        seen.add(current)
        const parent = nodes.get(key(drive,current))?.parentReference?.id
        if (!parent || !nodes.get(key(drive,parent))?.folder) fail(403, 'DOCUMENTOS_SELECTED_OUTSIDE_ROOT', 'Ancestro fuera del alcance Selected.')
        ancestors.push(parent); current = parent
      }
      for (const ancestor of ancestors.reverse()) await json(`/drives/${graphId(drive)}/items/${graphId(ancestor)}?$select=${SELECT}`)
      await json(`/drives/${graphId(drive)}/items/${graphId(itemId)}?$select=${SELECT}`)
      const first = await request(`/drives/${graphId(drive)}/items/${graphId(itemId)}/content`)
      let response = first
      if (first.status === 302) {
        let redirected: URL; try { redirected = new URL(first.headers.get('location') ?? '') } catch { fail(502, 'DOCUMENTOS_SELECTED_REDIRECT_INVALID', 'Descarga Graph sin URL de proveedor válida.') }
        const suffixes = ['.sharepoint.com','.files.1drv.com','.1drv.com']
        if (redirected.protocol !== 'https:' || redirected.username || redirected.password || redirected.hash || redirected.port || !suffixes.some(s => redirected.hostname.endsWith(s))) fail(502, 'DOCUMENTOS_SELECTED_REDIRECT_INVALID', 'Descarga fuera del proveedor permitido.')
        await deps.guard()
        // Single HTTPS provider redirect, no bearer or caller headers forwarded.
        response = await http(redirected, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) }); await deps.guard()
      }
      if (!response.ok) fail(502, 'DOCUMENTOS_SELECTED_READ_FAILED', 'Graph no confirmó descarga Selected.')
      const bytes = await boundedSelectedBytes(response, Math.min(maxBytes, MAX_FILE_BYTES)); await deps.guard(); return bytes
    },
  }
}
export function createDocumentosProductionTransport(pins: DocumentosProductionPins, guard: () => Promise<unknown>, env: Env = process.env, dependencies: Omit<SelectedDependencies, 'guard'> = {}) {
  const configured = documentosPanelProductionPins(env)
  assertDocumentosApprovedProductionPins(pins)
  if (!configured || Object.keys(configured).some(key => configured[key as keyof DocumentosProductionPins] !== pins[key as keyof DocumentosProductionPins])) fail(503, 'DOCUMENTOS_SELECTED_PIN_MISMATCH', 'Pins Production no coinciden con configuración documental dedicada.')
  return createSelectedTransport(selectedCredential(env, 'FINANCE_DOCUMENTOS_GRAPH'), [{ ...pins, relativeLabel: DOCUMENTOS_PRODUCTION_ROOT }], false, { ...dependencies, guard }, [], pins)
}
