import { findSharePointSite, getAccessToken, getSiteDrive } from './microsoft-graph'
import { descargarGraphPrivadoAcotado } from './descarga-privada-graph'
import { DOCUMENTOS_PANEL_ROOT, MAX_FILE_BYTES, fail, hashBytes, validateFile, type FileInput, type Location } from './documentos-panel-core'
import { DOCUMENTOS_PRODUCTION_ROOT, assertDocumentosApprovedProductionPins, type DocumentosProductionPins } from './documentos-panel-runtime'
import { createDocumentosProductionTransport } from './documentos-production-selected'

export type StorageGuard = (write: boolean, confirm: boolean) => Promise<number>
export type StorageTransport = { request: (path: string, init?: RequestInit) => Promise<Response>; siteDrive?: () => Promise<{ siteId: string; driveId: string }>; download: (driveId: string, itemId: string) => Promise<Buffer>; authorizeItem?: (driveId: string, itemId: string, parents: readonly string[]) => Promise<void> }
const id = (value: string) => { if (!/^[A-Za-z0-9!_.~,-]{1,220}$/.test(value)) fail(502, 'GRAPH_ID_INVALIDO', 'ID Graph no permitido.'); return encodeURIComponent(value) }
const name = (value: string) => { if (!value || value.length > 220 || /[\/\\\u0000-\u001f\u007f]/.test(value) || value.includes('..') || /%[0-9a-f]{2}/i.test(value)) fail(502, 'GRAPH_NOMBRE_INVALIDO', 'Nombre Graph inválido.'); return encodeURIComponent(value) }
export function assertDocumentosPanelProviderEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== 'production' || env.FINANCE_STAGING_SANDBOX !== '1' || env.VERCEL_ENV === 'production' || env.IO_PRODUCTION_READ_ONLY === '1' || env.FINANCE_DEPLOYMENT_READ_ONLY === '1') fail(503, 'PROVIDER_STAGE_ONLY', 'Graph sólo está disponible mediante acción explícita en el despliegue Stage aislado; nunca durante desarrollo.')
  if (!env.SHAREPOINT_SITE_ID || !(env.SHAREPOINT_DRIVE_ID || env.DRIVE_ID) || (env.SHAREPOINT_DRIVE_ID && env.DRIVE_ID && env.SHAREPOINT_DRIVE_ID !== env.DRIVE_ID)) fail(503, 'GRAPH_PIN_REQUIRED', 'Site y drive fijados obligatorios y coherentes.')
}
/** Transport is inert on import. No discovery, URLs from the client, shared links or webUrl receipts. */
export function createDocumentosPanelStorage(guard: StorageGuard, fakeTransport?: StorageTransport, production?: DocumentosProductionPins) {
  if (production) assertDocumentosApprovedProductionPins(production)
  if (production) production = Object.freeze({ ...production })
  // Each call owns an immutable policy context. A concurrent read cannot
  // downgrade the write/C guard while upload/archive awaits its provider.
  return {
    upload: (file: FileInput, storageName: string) => storageForOperation(guard, fakeTransport, { write: true, confirm: false }, production).upload(file, storageName),
    original: (saved: Location, file: { hash: string; mime: FileInput['mime']; extension: FileInput['extension'] }) => storageForOperation(guard, fakeTransport, { write: false, confirm: false }, production).original(saved, file),
    archive: (saved: Location, targetName: string, file: { hash: string; mime: FileInput['mime']; extension: FileInput['extension'] }) => storageForOperation(guard, fakeTransport, { write: true, confirm: true }, production).archive(saved, targetName, file),
  }
}
function storageForOperation(guard: StorageGuard, fakeTransport: StorageTransport | undefined, mode: Readonly<{ write: boolean; confirm: boolean }>, production?: DocumentosProductionPins) {
  const rootPath = production ? DOCUMENTOS_PRODUCTION_ROOT : DOCUMENTOS_PANEL_ROOT
  const before = async () => { await guard(mode.write, mode.confirm); if (!production && !fakeTransport) assertDocumentosPanelProviderEnvironment() }
  const live: StorageTransport = {
    async siteDrive() { await before(); const site = await findSharePointSite(); await before(); return { siteId: site.siteId, driveId: await getSiteDrive(site.siteId) } },
    async request(path, init = {}) {
      await before()
      if (!path.startsWith('/drives/') && !path.startsWith('/sites/')) fail(502, 'GRAPH_PATH_INVALIDO', 'Ruta Graph no autorizada.')
      const url = new URL(`https://graph.microsoft.com/v1.0${path}`)
      if (url.origin !== 'https://graph.microsoft.com' || url.hash || url.username || url.password) fail(502, 'GRAPH_PATH_INVALIDO', 'Ruta Graph no autorizada.')
      const token = await getAccessToken(); await before()
      return fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) })
    },
    async download(driveId, itemId) { await before(); return descargarGraphPrivadoAcotado(driveId, itemId, MAX_FILE_BYTES) },
  }
  const transport: StorageTransport = fakeTransport ?? (production ? createDocumentosProductionTransport(production, before) : live)
  const request = async (path: string, init?: RequestInit) => { await before(); return transport.request(path, init) }
  const json = async (response: Response) => { if (!response.ok) fail(response.status === 409 || response.status === 412 ? 409 : 502, 'GRAPH_FAILURE', `Graph no confirmó la operación (${response.status}).`); return response.json() }
  const read = async (path: string, nullable = false) => { const r = await request(path); if (nullable && r.status === 404) return null; return json(r) }
  const resolve = async () => {
    await before()
    if (production) {
      id(production.driveId); id(production.folderItemId)
      if (production.folderItemId.toLowerCase() === 'root') fail(502, 'GRAPH_NAMESPACE', 'La raíz de unidad no es un destino documental.')
      const panel = await read(`/drives/${id(production.driveId)}/items/${id(production.folderItemId)}?$select=id,name,folder,parentReference`)
      if (panel.id !== production.folderItemId || panel.name !== DOCUMENTOS_PRODUCTION_ROOT || !panel.folder || panel.file || panel.parentReference?.driveId !== production.driveId) fail(502, 'GRAPH_NAMESPACE', 'Carpeta Production fijada no verificable.')
      return production.driveId
    }
    if (!transport.siteDrive) fail(502, 'GRAPH_PIN_REQUIRED', 'Falta resolver Stage.')
    const { siteId, driveId } = await transport.siteDrive(); id(siteId); id(driveId)
    const association = await read(`/sites/${id(siteId)}/drives/${id(driveId)}?$select=id,parentReference`)
    if (association.id !== driveId || (association.parentReference?.siteId && association.parentReference.siteId !== siteId)) fail(502, 'GRAPH_DRIVE_MISMATCH', 'Drive ajeno al site fijado.')
    return driveId
  }
  const folder = async (driveId: string, parentId: string | null, folderName: string, create: boolean) => {
    const path = parentId ? `/drives/${id(driveId)}/items/${id(parentId)}:/${name(folderName)}` : `/drives/${id(driveId)}/root:/${name(folderName)}`
    let item = await read(path, true)
    if (!item && create) {
      const response = await request(parentId ? `/drives/${id(driveId)}/items/${id(parentId)}/children` : `/drives/${id(driveId)}/root/children`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: folderName, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) })
      item = response.status === 409 ? await read(path) : await json(response)
    }
    if (!item?.folder || item.name !== folderName || !item.id || (parentId && item.parentReference?.id !== parentId) || (production ? item.parentReference?.driveId !== driveId : (item.parentReference?.driveId && item.parentReference.driveId !== driveId))) fail(502, 'GRAPH_NAMESPACE', 'Carpeta documental no verificable.')
    id(item.id); return item.id as string
  }
  const parents = async (driveId: string, create: boolean) => {
    if (production) {
      const pins = production
      // No name resolution, listing, discovery, fallback or auto-provision in Production.
      const pinnedFolder = async (itemId: string, expectedName: string) => {
        const item = await read(`/drives/${id(driveId)}/items/${id(itemId)}?$select=id,name,folder,parentReference`)
        if (item.id !== itemId || item.name !== expectedName || !item.folder || item.file || item.parentReference?.id !== pins.folderItemId || item.parentReference?.driveId !== driveId) fail(502, 'GRAPH_NAMESPACE', 'Subcarpeta Production fijada no verificable.')
        return itemId
      }
      return { pending: await pinnedFolder(pins.pendingFolderItemId, 'Pendientes'), archived: await pinnedFolder(pins.archivedFolderItemId, 'Archivadas') }
    }
    const stageRoot = await folder(driveId, null, 'STAGING_FINANZAS_NO_CONTABILIZAR', create)
    const panel = await folder(driveId, stageRoot, 'DocumentosPanel', create)
    const pending = await folder(driveId, panel, 'Pendientes', create)
    const archived = await folder(driveId, panel, 'Archivadas', create)
    return { pending, archived }
  }
  const itemRead = (drive: string, item: string) => read(`/drives/${id(drive)}/items/${id(item)}?$select=id,name,parentReference,eTag,size,file`)
  const verifyItem = (item: any, driveId: string, parentId: string, expectedName: string) => {
    if (!item?.file || item.name !== expectedName || item.parentReference?.id !== parentId || (production ? item.parentReference?.driveId !== driveId : (item.parentReference?.driveId && item.parentReference.driveId !== driveId)) || !item.id || !Number.isSafeInteger(item.size) || item.size < 1 || item.size > MAX_FILE_BYTES) fail(409, 'GRAPH_ITEM_MISMATCH', 'Graph no verifica archivo/nombre/padre/tamaño.')
    id(item.id)
  }
  const verifiedBytes = async (driveId: string, itemId: string, expected: { hash: string; mime: FileInput['mime']; extension: FileInput['extension'] }, expectedName: string) => {
    await before(); const bytes = await transport.download(driveId, itemId)
    if (!bytes.length || bytes.length > MAX_FILE_BYTES || hashBytes(bytes) !== expected.hash) fail(409, 'GRAPH_HASH_MISMATCH', 'Original Graph no coincide con SHA256.')
    validateFile(bytes, `original.${expected.extension}`, expected.mime, 'FACTURA_RECIBIDA', '00000000-0000-4000-8000-000000000001')
    name(expectedName); return bytes
  }
  const location = (driveId: string, itemId: string, parentId: string, nombre: string, hash: string, where: 'Pendientes' | 'Archivadas'): Location => ({ driveId, itemId, parentId, nombre, hash, ruta: `${rootPath}/${where}/${nombre}` })
  return {
    async upload(file: FileInput, storageName: string): Promise<Location> {
      await before()
      const driveId = await resolve(); const { pending } = await parents(driveId, true)
      if (storageName !== `${file.hash}.${file.extension}`) fail(409, 'STORAGE_NAME_INVALIDO', 'El original pendiente debe usar hash opaco.')
      const path = `/drives/${id(driveId)}/items/${id(pending)}:/${name(storageName)}`
      let item = await read(path, true)
      if (!item) {
        const put = await request(`${path}:/content?%40microsoft.graph.conflictBehavior=fail`, { method: 'PUT', headers: { 'content-type': file.mime, 'content-length': String(file.bytes.length), 'if-none-match': '*' }, body: new Uint8Array(file.bytes).buffer })
        if (put.status !== 409 && put.status !== 412) item = await json(put)
        else item = await read(path)
      }
      // Existing same hash filename is reused ONLY after exact bytes+parent check.
      const checked = await itemRead(driveId, item.id); verifyItem(checked, driveId, pending, storageName)
      await verifiedBytes(driveId, checked.id, file, storageName)
      return location(driveId, checked.id, pending, storageName, file.hash, 'Pendientes')
    },
    async original(saved: Location, file: { hash: string; mime: FileInput['mime']; extension: FileInput['extension'] }): Promise<Buffer> {
      await before()
      const driveId = await resolve(); if (production && (saved.itemId.toLowerCase() === 'root' || saved.itemId === production.folderItemId || !saved.ruta.startsWith(`${rootPath}/`))) fail(409, 'GRAPH_NAMESPACE', 'Pointer fuera de la carpeta documental Production.'); if (saved.driveId !== driveId || saved.hash !== file.hash) fail(409, 'GRAPH_POINTER_MISMATCH', 'Pointer ajeno al drive/hash fijado.')
      const { pending, archived } = await parents(driveId, false)
      if (production) await transport.authorizeItem?.(driveId, saved.itemId, [pending, archived])
      const item = await itemRead(driveId, saved.itemId)
      // Interrupted archive: permit only this same server-owned item ID under the
      // exclusive archive folder; downloaded bytes must still match original SHA256.
      const parent = item.parentReference?.id
      if (![pending, archived].includes(parent)) fail(409, 'GRAPH_NAMESPACE', 'Original fuera del namespace del panel.')
      if (parent === pending) verifyItem(item, driveId, pending, `${file.hash}.${file.extension}`)
      else { name(item.name); verifyItem(item, driveId, archived, item.name) }
      return verifiedBytes(driveId, saved.itemId, file, item.name)
    },
    async archive(saved: Location, targetName: string, file: { hash: string; mime: FileInput['mime']; extension: FileInput['extension'] }): Promise<Location> {
      await before(); name(targetName)
      const driveId = await resolve(); if (production && (saved.itemId.toLowerCase() === 'root' || saved.itemId === production.folderItemId || !saved.ruta.startsWith(`${rootPath}/`))) fail(409, 'GRAPH_NAMESPACE', 'Pointer fuera de la carpeta documental Production.'); if (saved.driveId !== driveId || saved.hash !== file.hash) fail(409, 'GRAPH_POINTER_MISMATCH', 'Pointer no autorizado.')
      const { pending, archived } = await parents(driveId, true)
      if (production) await transport.authorizeItem?.(driveId, saved.itemId, [pending, archived])
      const item = await itemRead(driveId, saved.itemId)
      if (item.parentReference?.id === archived) {
        verifyItem(item, driveId, archived, targetName); await verifiedBytes(driveId, item.id, file, targetName)
        return location(driveId, item.id, archived, targetName, file.hash, 'Archivadas')
      }
      verifyItem(item, driveId, pending, `${file.hash}.${file.extension}`)
      await verifiedBytes(driveId, item.id, file, item.name)
      const destination = await read(`/drives/${id(driveId)}/items/${id(archived)}:/${name(targetName)}`, true)
      if (destination) fail(409, 'DESTINO_EXISTENTE', 'El nombre de destino ya existe; no se sobrescribe ni borra.')
      if (typeof item.eTag !== 'string' || !item.eTag) fail(502, 'GRAPH_ETAG_REQUIRED', 'Falta versión Graph para mover sin carreras.')
      await json(await request(`/drives/${id(driveId)}/items/${id(item.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'if-match': item.eTag }, body: JSON.stringify({ name: targetName, parentReference: { id: archived }, '@microsoft.graph.conflictBehavior': 'fail' }) }))
      const verified = await itemRead(driveId, item.id); verifyItem(verified, driveId, archived, targetName)
      await verifiedBytes(driveId, verified.id, file, targetName)
      return location(driveId, verified.id, archived, targetName, file.hash, 'Archivadas')
    },
  }
}
