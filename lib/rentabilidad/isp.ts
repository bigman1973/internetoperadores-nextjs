import { RentabilidadError, safePayload, sourceHash, canonicalDecimal, isoDate, monthSchema, type ImportPayload } from './types'
import { normalizeImportRow, parseCsv } from './importers'
import { assertRentabilidadConfiguration } from './store'

export type IspSourceAvailability = { estado: 'BLOQUEADO' | 'NO_VERIFICADO' | 'DISPONIBLE' | 'ERROR'; reason: string; configured: boolean }
export type IspAvailability = { estado: 'BLOQUEADO' | 'PARCIAL' | 'DISPONIBLE'; reason: string; contracts: boolean; lines: boolean; sources: { contracts: IspSourceAvailability; lines: IspSourceAvailability } }
export type IspTransport = (endpoint: 'contratos_todos', method: 'GET', params: Readonly<{ mostrar: number; pagina: number }>) => Promise<unknown>
/** Last accredited instance result; configuration alone cannot overturn this blocker. */
export const ISP_ADVANCED_API_BLOCKER = 'ISP_ADVANCED_API_NOT_CONTRACTED'
const MAX_BYTES = 40 * 1024 * 1024
function httpsUrl(value: string | undefined): URL | null {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' && !url.username && !url.password && !url.hash ? url : null } catch { return null }
}
function configuredExport(env: Record<string, string | undefined>): URL | null {
  const url = httpsUrl(env.RENTABILIDAD_EXPORT_URL)
  return url && env.RENTABILIDAD_EXPORT_ALLOWED_HOST && url.hostname === env.RENTABILIDAD_EXPORT_ALLOWED_HOST ? url : null
}
function contractConfiguration(env: Record<string, string | undefined>) {
  const base = httpsUrl(env.ISPGESTION_API_URL)
  if (env.RENTABILIDAD_ISP_ADVANCED_REACCREDITED !== '1') return ISP_ADVANCED_API_BLOCKER
  if (!base || base.search) return 'ISP_URL_INVALID'
  if (!env.ISPGESTION_API_USER || !env.ISPGESTION_API_HASH) return 'ISP_CREDENTIALS_MISSING'
  if (env.RENTABILIDAD_ISP_PROXY_URL && (!httpsUrl(env.RENTABILIDAD_ISP_PROXY_URL) || !env.RENTABILIDAD_ISP_PROXY_TOKEN)) return 'ISP_PROXY_NOT_CONFIGURED'
  return null
}
export function ispAvailability(env: Record<string, string | undefined> = process.env, observed: Partial<IspAvailability['sources']> = {}): IspAvailability {
  const contractReason = contractConfiguration(env)
  const exportReason = env.RENTABILIDAD_EXPORT_ENABLED !== '1' || !configuredExport(env) ? 'LISTADO299_EXPORT_NOT_CONFIGURED' : !env.RENTABILIDAD_EXPORT_TOKEN ? 'LISTADO299_EXPORT_AUTH_REQUIRED' : null
  const sources = {
    contracts: observed.contracts ?? { estado: contractReason ? 'BLOQUEADO' : 'NO_VERIFICADO', reason: contractReason ?? 'ISP_CONTRACT_READ_NOT_VERIFIED', configured: !contractReason },
    lines: observed.lines ?? { estado: exportReason ? 'BLOQUEADO' : 'NO_VERIFICADO', reason: exportReason ?? 'ISP_LINE_EXPORT_READ_NOT_VERIFIED', configured: !exportReason },
  } as IspAvailability['sources']
  const available = Object.values(sources).filter(source => source.estado === 'DISPONIBLE').length
  return { estado: available === 2 ? 'DISPONIBLE' : available || sources.contracts.configured || sources.lines.configured ? 'PARCIAL' : 'BLOQUEADO', reason: available === 2 ? 'ISP_READS_VERIFIED_FIELDS_MAY_BE_PARTIAL' : available ? 'ISP_SOURCE_COVERAGE_PARTIAL' : sources.lines.configured || sources.contracts.configured ? 'ISP_CONFIGURED_NOT_YET_VERIFIED' : contractReason ?? exportReason!, contracts: sources.contracts.configured, lines: sources.lines.configured, sources }
}
async function boundedText(response: Response): Promise<string> {
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) throw new RentabilidadError('IMPORT_FILE_TOO_LARGE')
  const reader = response.body?.getReader(); if (!reader) throw new RentabilidadError('EMPTY_EXPORT')
  const chunks: Uint8Array[] = []; let bytes = 0
  try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > MAX_BYTES) { await reader.cancel(); throw new RentabilidadError('IMPORT_FILE_TOO_LARGE') }; chunks.push(part.value) } } finally { reader.releaseLock() }
  return Buffer.concat(chunks).toString('utf8')
}
/** Env-only, exact endpoint allow-list, no legacy import/fallback and no automatic re-accreditation. */
export function createIspReadTransport(env: Record<string, string | undefined> = process.env, http: typeof fetch = fetch): IspTransport {
  return async (endpoint, method, params) => {
    const reason = contractConfiguration(env); if (reason) throw new RentabilidadError(reason, 503)
    assertRentabilidadConfiguration(env)
    if (endpoint !== 'contratos_todos' || method !== 'GET' || !params || Object.keys(params).some(key => !['mostrar', 'pagina'].includes(key)) || !Number.isSafeInteger(params.pagina) || params.pagina < 1 || params.pagina > 200 || !Number.isSafeInteger(params.mostrar) || params.mostrar < 1 || params.mostrar > 500) throw new RentabilidadError('ISP_REQUEST_NOT_ALLOWED')
    const base = new URL(env.ISPGESTION_API_URL!.endsWith('/') ? env.ISPGESTION_API_URL! : `${env.ISPGESTION_API_URL}/`)
    let response: Response
    try {
      if (env.RENTABILIDAD_ISP_PROXY_URL) {
        response = await http(httpsUrl(env.RENTABILIDAD_ISP_PROXY_URL)!, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RENTABILIDAD_ISP_PROXY_TOKEN}` }, body: JSON.stringify({ endpoint, method: 'GET', data: null, params }), signal: AbortSignal.timeout(30_000), redirect: 'error' })
      } else {
        const target = new URL(endpoint, base); target.searchParams.set('mostrar', String(params.mostrar)); target.searchParams.set('pagina', String(params.pagina))
        response = await http(target, { method: 'GET', headers: { Authorization: `Basic ${Buffer.from(`${env.ISPGESTION_API_USER}:${env.ISPGESTION_API_HASH}`).toString('base64')}` }, signal: AbortSignal.timeout(30_000), redirect: 'error' })
      }
    } catch { throw new RentabilidadError('ISP_READ_FAILED', 503) }
    // A 403 alone proves access denial, not a particular licence or cause.
    if (response.status === 403) throw new RentabilidadError('ISP_ACCESS_FORBIDDEN', 503)
    if (!response.ok) throw new RentabilidadError('ISP_READ_FAILED', 503)
    try { return JSON.parse(await boundedText(response)) } catch (error) { if (error instanceof RentabilidadError) throw error; throw new RentabilidadError('ISP_CONTRACT_RESPONSE_INVALID', 503) }
  }
}
/** Identity must come from an independently accredited mapping, never Number(id) == contract code. */
export async function readIspContracts(transport: IspTransport, contractCodesById: ReadonlyMap<string, string> = new Map()): Promise<ImportPayload> {
  const contracts: Record<string, any>[] = []; const ids = new Set<string>(); const codes = new Set<string>()
  for (let pagina = 1; pagina <= 200; pagina++) {
    const raw = await transport('contratos_todos', 'GET', { mostrar: 500, pagina })
    if (!Array.isArray(raw) || raw.length > 500) throw new RentabilidadError('ISP_CONTRACT_RESPONSE_INVALID', 503)
    for (const item of raw) {
      const id = String(item?.id ?? '')
      if (!item || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || !/^[1-9]\d*$/.test(String(item.clienteid ?? ''))) throw new RentabilidadError('ISP_CONTRACT_ID_INVALID')
      if (ids.has(id)) throw new RentabilidadError('ISP_DUPLICATE_CONTRACT')
      const code = contractCodesById.get(id)
      if (!code || code !== code.trim() || code.length > 240) throw new RentabilidadError('ISP_CONTRACT_CODE_UNVERIFIED', 503)
      if (codes.has(code)) throw new RentabilidadError('ISP_CONTRACT_IDENTITY_CONFLICT')
      ids.add(id); codes.add(code)
      const row = safePayload({ codigoContratoIsp: code, ispGestionContratoId: Number(id), clienteIdIsp: String(item.clienteid), source: 'ISP_READ', sourceLocator: { endpoint: 'contratos_todos', id } })
      // Do not overwrite analyst values with manufactured empty fields or active state.
      for (const field of ['titulo', 'tarifa']) if (typeof item[field] === 'string') row[field] = item[field]
      if (item.precio != null) {
        // Decimal JSON numbers may already have lost source precision in JSON.parse.
        if (typeof item.precio !== 'string' && !(typeof item.precio === 'number' && Number.isSafeInteger(item.precio))) throw new RentabilidadError('ISP_MONEY_PRECISION_UNVERIFIED')
        row.precioPeriodo = canonicalDecimal(item.precio); row.precioFuenteLexema = String(item.precio)
      }
      if (item.fechainicio) row.fechaAlta = isoDate(String(item.fechainicio).slice(0, 10))
      if (item.fecha_baja) { row.fechaBaja = isoDate(String(item.fecha_baja).slice(0, 10)); row.estado = 'BAJA' }
      // Absent/null end date does not prove reactivation. No provider/period/discount inference.
      contracts.push(row)
    }
    if (raw.length < 500) return { source: 'ISP_READ', contracts }
  }
  throw new RentabilidadError('ISP_PAGINATION_INCOMPLETE', 503)
}
/** Explicit export only; no guessed listado299 endpoint, browser robot or credential fallback. */
export async function readConfiguredLineExport(env: Record<string, string | undefined> = process.env, http: typeof fetch = fetch): Promise<{ payload: ImportPayload; sourceHash: string; missingFields: string[] }> {
  const url = configuredExport(env)
    if (!url || env.RENTABILIDAD_EXPORT_ENABLED !== '1') throw new RentabilidadError('LISTADO299_EXPORT_NOT_CONFIGURED', 503)
    if (!env.RENTABILIDAD_EXPORT_TOKEN) throw new RentabilidadError('LISTADO299_EXPORT_AUTH_REQUIRED', 503)
    assertRentabilidadConfiguration(env)
  let response: Response
  try { response = await http(url, { method: 'GET', headers: { Authorization: `Bearer ${env.RENTABILIDAD_EXPORT_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) }) } catch { throw new RentabilidadError('LISTADO299_EXPORT_READ_FAILED', 503) }
  if (!response.ok) throw new RentabilidadError('LISTADO299_EXPORT_READ_FAILED', 503)
  const text = await boundedText(response); const rows = parseCsv(text)
  if (rows.length < 2) throw new RentabilidadError('EMPTY_EXPORT')
  if (rows.length - 1 > 100_000) throw new RentabilidadError('ISP_EXPORT_ROW_LIMIT')
  const keys = rows[0].map(value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''))
  if (keys.some(key => !key) || new Set(keys).size !== keys.length) throw new RentabilidadError('DUPLICATED_HEADER')
  // Unlike the initial user export, remote IDs have no accredited equivalence to codes.
  const codeKeys = keys.filter(key => ['CODIGOCONTRATO', 'CODCONTRATO', 'CONTRATOCODIGO', 'NUMEROCONTRATO'].includes(key))
  if (keys.includes('CONTRATOID') || !codeKeys.length) throw new RentabilidadError('ISP_CONTRACT_CODE_UNVERIFIED')
  const missingFields = new Set<string>(); const identities = new Map<string, Record<string, any>>()
  const lines = rows.slice(1).map((values, index) => {
    if (values.length !== keys.length) throw new RentabilidadError('ISP_EXPORT_COLUMN_COUNT')
    const raw = Object.fromEntries(keys.map((key, position) => [key, values[position]]))
    const codes = codeKeys.map(key => raw[key].trim())
    if (codes.some(code => !code) || new Set(codes).size !== 1) throw new RentabilidadError('ISP_CONTRACT_IDENTITY_CONFLICT')
    const row = normalizeImportRow('lines', raw)
    const explicitMonth = raw.MESSERVICIO?.trim()
    if (explicitMonth) { row.mesServicio = monthSchema.parse(explicitMonth); row.periodoFuente = 'EXPLICIT_SERVICE_MONTH' }
    else { row.periodoFuente = 'INVOICE_DATE_FALLBACK'; missingFields.add('SERVICE_PERIOD_UNVERIFIED') }
    row.source = 'LISTADO299_REMOTE_EXPORT'; row.sourceLocator = { endpoint: 'CONFIGURED_REMOTE_EXPORT', row: index + 2 }
    const identity = sourceHash({ codigoContratoIsp: row.codigoContratoIsp, fechaFuente: row.fechaFuente, concepto: row.concepto, importeBaseExacto: row.importeBaseExacto })
    const old = identities.get(identity)
    if (old && (old.mesServicio !== row.mesServicio || old.serie && row.serie && old.serie !== row.serie || old.numeroFactura && row.numeroFactura && old.numeroFactura !== row.numeroFactura)) throw new RentabilidadError('LINE_IDENTITY_COLLISION')
    identities.set(identity, row); return row
  })
  // CSV lines are not an accredited contract/provider master.
  missingFields.add('CONTRACT_MASTER_NOT_IN_LINE_EXPORT'); missingFields.add('PROVIDER_NOT_IN_LINE_EXPORT')
  return { payload: { source: 'LISTADO299_REMOTE_EXPORT', lines }, sourceHash: sourceHash({ text }), missingFields: [...missingFields].sort() }
}
