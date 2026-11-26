import { financeEnvironment } from '../finanzas/finance-environment'
import { strictSameOrigin } from '../impersonation-policy'
import { area4RegisteredSurface } from './section-registry'

export type Area4CrmStagingImportContract = 'isp-multipart-v1' | 'hubspot-confirm-v1' | 'isp-vinculos-v1' | 'isp-vinculos-bloque-v1'

/** Only exact registered POSTs; query/path normalization is not authority. */
export function area4CrmStagingImportContract(path: string, method: string): Area4CrmStagingImportContract | null {
  if (method !== 'POST') return null
  const match = area4RegisteredSurface(path, 'api')
  if (!match || match.surface.path !== path) return null
  return match.surface.request?.stagingImport ?? null
}

/** Server configuration only. The branch preview itself cannot apply imports.
 * No new flag is enabled here, and neither readonly switch can be bypassed.
 */
export function area4CrmStagingImportEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.FINANCE_STAGING_SANDBOX !== '1' || env.VERCEL_ENV !== 'preview'
    || env.VERCEL_GIT_COMMIT_REF !== 'staging' || env.FINANCE_DEPLOYMENT_READ_ONLY === '1'
    || env.IO_PRODUCTION_READ_ONLY === '1') return false
  try {
    return financeEnvironment({ stagingSandbox: env.FINANCE_STAGING_SANDBOX,
      vercelEnvironment: env.VERCEL_ENV, databaseUrl: env.DATABASE_URL }) === 'staging'
  } catch { return false }
}

/** Same browser origin, not merely a sibling host in the same cookie site.
 * Reuses the existing HTTPS exact-origin comparator; no new token/cookie flow.
 */
export function area4CrmStagingImportOriginAllowed(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  return strictSameOrigin(request.headers.get('origin'), request.url)
    && (site === null || site === 'same-origin')
}

export type Area4IspStagingCommand = Readonly<{
  action?: null
  body?: Readonly<{ modo: 'simular' | 'aplicar' }>
  errorStatus?: 400 | 413 | 415
}>

/** Validate only the closed envelope, never XLSX data or a business operation.
 * A bounded clone leaves the original body for the owner's handler. Hash equality
 * with the actual file and the result receipt still belong to Área 1.
 */
export async function readArea4IspStagingCommand(request: Request, maximumBytes: number): Promise<Area4IspStagingCommand> {
  const type = request.headers.get('content-type') || ''
  if (type.split(';')[0].trim().toLowerCase() !== 'multipart/form-data') return { errorStatus: 415 }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) return { errorStatus: 400 }
  const declared = request.headers.get('content-length')
  if (declared && !/^\d+$/.test(declared)) return { errorStatus: 400 }
  if (declared && Number(declared) > maximumBytes) return { errorStatus: 413 }
  try {
    const reader = request.clone().body?.getReader()
    if (!reader) return { errorStatus: 400 }
    const chunks: Uint8Array[] = []
    let length = 0
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > maximumBytes) {
        // Never await cancellation of a tee while its original is untouched.
        void reader.cancel().catch(() => undefined)
        return { errorStatus: 413 }
      }
      chunks.push(part.value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const form = await new Response(bytes, { headers: { 'Content-Type': type } }).formData()
    const fields = new Set(['fichero', 'modo', 'consultarBrevo', 'confirmacion', 'hashEsperado'])
    for (const key of form.keys()) {
      if (!fields.has(key) || form.getAll(key).length !== 1) return { errorStatus: 400 }
    }
    const file = form.get('fichero')
    if (!file || typeof file === 'string' || !/\.xlsx$/i.test(file.name)) return { errorStatus: 400 }
    if (file.size > 4 * 1024 * 1024) return { errorStatus: 413 }
    const modo = form.get('modo') ?? 'simular'
    if (modo !== 'simular' && modo !== 'aplicar') return { errorStatus: 400 }
    const brevo = form.get('consultarBrevo')
    if (brevo !== null && brevo !== '0' && brevo !== '1') return { errorStatus: 400 }
    if (modo === 'simular') {
      if (form.has('confirmacion') || form.has('hashEsperado')) return { errorStatus: 400 }
    } else {
      if (form.get('confirmacion') !== 'APLICAR' || !/^[a-f0-9]{64}$/.test(String(form.get('hashEsperado') || ''))) return { errorStatus: 400 }
    }
    return { action: null, body: { modo } }
  } catch { return { errorStatus: 400 } }
}

/** A single literal confirmation, not JSON.parse's last duplicate key.
 * This wire contract belongs only to the registered HubSpot import. Other JSON
 * commands keep their existing decoder and semantics.
 */
export async function readArea4HubspotStagingCommand(request: Request, maximumBytes: number): Promise<Readonly<{
  action?: null
  body?: Readonly<{ confirmar: true }>
  errorStatus?: 400 | 415
}>> {
  const type = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (type !== 'application/json') return { errorStatus: 415 }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) return { errorStatus: 400 }
  const declared = request.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) return { errorStatus: 400 }
  try {
    const reader = request.clone().body?.getReader()
    if (!reader) return { errorStatus: 400 }
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let length = 0
    let text = ''
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > maximumBytes) {
        void reader.cancel().catch(() => undefined)
        return { errorStatus: 400 }
      }
      text += decoder.decode(part.value, { stream: true })
    }
    text += decoder.decode()
    // JSON whitespace only: no duplicate keys, extras, coercions or selectors.
    if (!/^[\x20\x09\x0a\x0d]*\{[\x20\x09\x0a\x0d]*"confirmar"[\x20\x09\x0a\x0d]*:[\x20\x09\x0a\x0d]*true[\x20\x09\x0a\x0d]*\}[\x20\x09\x0a\x0d]*$/.test(text)) return { errorStatus: 400 }
    return { action: null, body: { confirmar: true } }
  } catch { return { errorStatus: 400 } }
}

type VinculosCommand<T> = Readonly<{ action?: null; body?: T; errorStatus?: 400 | 415 }>
export type Area4IspVinculosBody = Readonly<{ accion: 'CONFIRMAR' | 'DESCARTAR'; ids: readonly string[] }>
export type Area4IspVinculosBloqueBody = Readonly<{ confirmacion: 'CONFIRMAR_BLOQUE'; hashEsperado: string }>

/** Wire-only validation for the two local commands. No file, business or hash
 * calculation belongs here. A tee cancellation must never await the handler.
 */
async function readVinculosJson(request: Request, maximumBytes: number): Promise<{ text?: string; errorStatus?: 400 | 415 }> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return { errorStatus: 415 }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0 || maximumBytes > 16384) return { errorStatus: 400 }
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) return { errorStatus: 400 }
  try {
    const reader = request.clone().body?.getReader()
    if (!reader) return { errorStatus: 400 }
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
    let text = '', bytes = 0
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > maximumBytes) {
        void reader.cancel().catch(() => undefined)
        return { errorStatus: 400 }
      }
      text += decoder.decode(part.value, { stream: true })
    }
    return { text: text + decoder.decode() }
  } catch { return { errorStatus: 400 } }
}

/** Exactly two literal keys in either order. The lexical envelope excludes
 * duplicate/escaped keys, extras, nested selectors and truthy coercions BEFORE
 * JSON.parse; parsed IDs are then checked against the native handler's bounds.
 */
export async function readArea4IspVinculosStagingCommand(request: Request, maximumBytes: number): Promise<VinculosCommand<Area4IspVinculosBody>> {
  const wire = await readVinculosJson(request, maximumBytes)
  if (wire.errorStatus) return { errorStatus: wire.errorStatus }
  const w = '[\\x20\\x09\\x0a\\x0d]*'
  const string = '"(?:[^"\\\\\\x00-\\x1f]|\\\\(?:["\\\\/bfnrt]|u[0-9a-fA-F]{4}))*"'
  const ids = `"ids"${w}:${w}\\[${w}${string}(?:${w},${w}${string})*${w}\\]`
  const action = `"accion"${w}:${w}"(?:CONFIRMAR|DESCARTAR)"`
  if (!new RegExp(`^${w}\\{${w}(?:${action}${w},${w}${ids}|${ids}${w},${w}${action})${w}\\}${w}$`).test(wire.text!)) return { errorStatus: 400 }
  try {
    const body = JSON.parse(wire.text!) as Area4IspVinculosBody
    if (body.ids.length < 1 || body.ids.length > 200 || body.ids.some(id => !id.length || id.length > 64 || /[\x00-\x1f]/.test(id))) return { errorStatus: 400 }
    return { action: null, body }
  } catch { return { errorStatus: 400 } }
}

export async function readArea4IspVinculosBloqueStagingCommand(request: Request, maximumBytes: number): Promise<VinculosCommand<Area4IspVinculosBloqueBody>> {
  const wire = await readVinculosJson(request, maximumBytes)
  if (wire.errorStatus) return { errorStatus: wire.errorStatus }
  const w = '[\\x20\\x09\\x0a\\x0d]*'
  const confirmation = `"confirmacion"${w}:${w}"CONFIRMAR_BLOQUE"`
  const hash = `"hashEsperado"${w}:${w}"[a-f0-9]{64}"`
  if (!new RegExp(`^${w}\\{${w}(?:${confirmation}${w},${w}${hash}|${hash}${w},${w}${confirmation})${w}\\}${w}$`).test(wire.text!)) return { errorStatus: 400 }
  return { action: null, body: JSON.parse(wire.text!) as Area4IspVinculosBloqueBody }
}
