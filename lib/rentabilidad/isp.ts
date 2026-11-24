import { RentabilidadError, safePayload, sourceHash, type ImportPayload } from './types'
import { normalizeImportRow, parseCsv } from './importers'

export type IspAvailability = { estado: 'BLOQUEADO' | 'DISPONIBLE'; reason: string; contracts: boolean; lines: boolean }
export type IspTransport = (endpoint: 'contratos_todos', method: 'GET', params: Readonly<{ mostrar: number; pagina: number }>) => Promise<unknown>
/** Advanced API unavailable in this instance, verified by coordinator 24/11/2026. No automatic retry. */
export const ISP_ADVANCED_API_BLOCKER = 'ISP_ADVANCED_API_NOT_CONTRACTED'
function configuredExport(env:Record<string,string|undefined> = process.env): URL | null {
  try {
    const url = new URL(env.RENTABILIDAD_EXPORT_URL ?? '')
    const allowedHost = env.RENTABILIDAD_EXPORT_ALLOWED_HOST
    if (url.protocol !== 'https:' || url.username || url.password || !allowedHost || url.hostname !== allowedHost) return null
    return url
  } catch { return null }
}
export function ispAvailability(env:Record<string,string|undefined> = process.env): IspAvailability {
  return { estado: configuredExport(env) && env.RENTABILIDAD_EXPORT_ENABLED === '1' ? 'DISPONIBLE' : 'BLOQUEADO', reason: configuredExport(env) && env.RENTABILIDAD_EXPORT_ENABLED === '1' ? 'EXPLICIT_REMOTE_EXPORT_CONFIGURED' : ISP_ADVANCED_API_BLOCKER, contracts: false, lines: Boolean(configuredExport(env) && env.RENTABILIDAD_EXPORT_ENABLED === '1') }
}
/** Env-only legacy GET transport, inert unless explicitly re-accredited after license changes. */
export function createIspReadTransport(env:Record<string,string|undefined> = process.env, http: typeof fetch = fetch): IspTransport {
  return async (endpoint, method, params) => {
    if (env.RENTABILIDAD_ISP_ADVANCED_REACCREDITED !== '1') throw new RentabilidadError(ISP_ADVANCED_API_BLOCKER, 503)
    if (endpoint !== 'contratos_todos' || method !== 'GET' || !Number.isSafeInteger(params.pagina) || params.pagina < 1 || params.mostrar !== 500) throw new RentabilidadError('ISP_REQUEST_NOT_ALLOWED')
    if (!env.ISPGESTION_API_URL || !env.ISPGESTION_API_USER || !env.ISPGESTION_API_HASH) throw new RentabilidadError('ISP_CREDENTIALS_MISSING', 503)
    const base = new URL(env.ISPGESTION_API_URL.endsWith('/') ? env.ISPGESTION_API_URL : `${env.ISPGESTION_API_URL}/`)
    if (base.protocol !== 'https:' || base.username || base.password) throw new RentabilidadError('ISP_URL_INVALID')
    const authorization = `Basic ${Buffer.from(`${env.ISPGESTION_API_USER}:${env.ISPGESTION_API_HASH}`).toString('base64')}`
    let response: Response
    if (env.RENTABILIDAD_ISP_PROXY_URL) {
      const proxy = new URL(env.RENTABILIDAD_ISP_PROXY_URL)
      if (proxy.protocol !== 'https:' || proxy.username || proxy.password || !env.RENTABILIDAD_ISP_PROXY_TOKEN) throw new RentabilidadError('ISP_PROXY_NOT_CONFIGURED', 503)
      response = await http(proxy, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RENTABILIDAD_ISP_PROXY_TOKEN}` }, body: JSON.stringify({ endpoint, method: 'GET', params }), signal: AbortSignal.timeout(30_000), redirect: 'error' })
    } else {
      const target = new URL(endpoint, base)
      target.searchParams.set('mostrar', String(params.mostrar)); target.searchParams.set('pagina', String(params.pagina))
      response = await http(target, { method: 'GET', headers: { Authorization: authorization }, signal: AbortSignal.timeout(30_000), redirect: 'error' })
    }
    if (response.status === 403) throw new RentabilidadError(ISP_ADVANCED_API_BLOCKER, 503)
    if (!response.ok) throw new RentabilidadError('ISP_READ_FAILED', 503)
    return response.json()
  }
}
export async function readIspContracts(transport: IspTransport): Promise<ImportPayload> {
  const contracts: Record<string, any>[] = []; const ids = new Set<string>()
  for (let pagina = 1; pagina <= 200; pagina++) {
    const raw = await transport('contratos_todos', 'GET', { mostrar: 500, pagina })
    if (!Array.isArray(raw)) throw new RentabilidadError('ISP_CONTRACT_RESPONSE_INVALID', 503)
    for (const item of raw) {
      if (!item || !Number.isSafeInteger(Number(item.id)) || Number(item.id) < 1 || !item.clienteid) throw new RentabilidadError('ISP_CONTRACT_ID_INVALID')
      const code = String(item.id)
      if (ids.has(code)) throw new RentabilidadError('ISP_DUPLICATE_CONTRACT')
      ids.add(code)
      const row = safePayload({ codigoContratoIsp: code, ispGestionContratoId: Number(item.id), clienteIdIsp: String(item.clienteid), titulo: String(item.titulo ?? ''), tarifa: String(item.tarifa ?? ''), source: 'ISP_READ' })
      if (item.precio != null) row.precioPeriodo = item.precio
      if (item.fechainicio) row.fechaAlta = String(item.fechainicio).slice(0, 10)
      if (item.fecha_baja) row.fechaBaja = String(item.fecha_baja).slice(0, 10)
      // Periodicity/provider omitted when upstream does not supply accredited fields.
      row.estado = row.fechaBaja ? 'BAJA' : 'ACTIVO'
      contracts.push(row)
    }
    if (raw.length < 500) return { source: 'ISP_READ', contracts }
  }
  throw new RentabilidadError('ISP_PAGINATION_INCOMPLETE', 503)
}
/** Scheduled-export capability only; no guessed listado299 endpoint, browser robot or credential fallback. */
export async function readConfiguredLineExport(env:Record<string,string|undefined> = process.env, http: typeof fetch = fetch): Promise<{ payload: ImportPayload; sourceHash: string }> {
  const url = configuredExport(env)
  if (!url || env.RENTABILIDAD_EXPORT_ENABLED !== '1') throw new RentabilidadError('LISTADO299_EXPORT_NOT_CONFIGURED', 503)
  if (!env.RENTABILIDAD_EXPORT_TOKEN) throw new RentabilidadError('LISTADO299_EXPORT_AUTH_REQUIRED', 503)
  const response = await http(url, { method: 'GET', headers: { Authorization: `Bearer ${env.RENTABILIDAD_EXPORT_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new RentabilidadError('LISTADO299_EXPORT_READ_FAILED', 503)
  const size = Number(response.headers.get('content-length') ?? 0)
  if (size > 40 * 1024 * 1024) throw new RentabilidadError('IMPORT_FILE_TOO_LARGE')
  const reader = response.body?.getReader(); if (!reader) throw new RentabilidadError('EMPTY_EXPORT')
  const chunks: Uint8Array[] = []; let bytes = 0
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 40 * 1024 * 1024) { await reader.cancel(); throw new RentabilidadError('IMPORT_FILE_TOO_LARGE') }; chunks.push(part.value) }
  } finally { reader.releaseLock() }
  const text = Buffer.concat(chunks).toString('utf8')
  const rows = parseCsv(text)
  if (rows.length < 2) throw new RentabilidadError('EMPTY_EXPORT')
  const keys = rows[0].map(value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''))
  if (new Set(keys).size !== keys.length) throw new RentabilidadError('DUPLICATED_HEADER')
  const lines = rows.slice(1).map(row => normalizeImportRow('lines', Object.fromEntries(keys.map((key, index) => [key, row[index]]))))
  return { payload: { source: 'LISTADO299_REMOTE_EXPORT', lines }, sourceHash: sourceHash({ text }) }
}
