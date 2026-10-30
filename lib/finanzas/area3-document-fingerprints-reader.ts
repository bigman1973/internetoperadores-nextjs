import {
  AREA3_EXISTING_DOCUMENT_BYTES_MANIFEST_SCHEMA,
  AREA3_MAX_DOCUMENT_BYTES,
  AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN,
  AREA3_STAGING_DATABASE,
  fingerprintArea3DocumentBytes,
  type Area3ExistingDocumentBytesManifest,
  type Area3ExistingDocumentBytesManifestEntry,
} from './area3-document-fingerprints-core'

/**
 * Separate opt-in reader for existing preview files. It receives only exact
 * invoice/item IDs already stored by the caller; it does not list folders,
 * invoke Graph, inspect a file URL, run delta/webhook/OCR, or write any DB row.
 * Read bytes are bounded and live only long enough to calculate SHA-256.
 */
export const AREA3_EXISTING_FILE_READ_CONCURRENCY = 2
export const AREA3_EXISTING_FILE_READ_TIMEOUT_MS = 30_000

export type Area3ExistingDocumentReadSource = Readonly<{
  invoiceId: string
  sourceItemId: string
  sourceDriveId: string | null
  sourceUpdatedAt: string
}>
export type Area3PreviewExistingFileFetch = (input: Readonly<{ invoiceId: string; signal: AbortSignal }>) => Promise<Response>

const CONTROL = /[\u0000-\u001f\u007f]/
function clean(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string') throw new Error(code)
  const normalized = value.normalize('NFKC').trim()
  if (!normalized || normalized.length > maximum || CONTROL.test(normalized)) throw new Error(code)
  return normalized
}
function iso(value: unknown, code: string): string {
  const source = clean(value, 64, code)
  const date = new Date(source)
  if (!Number.isFinite(date.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(source)) throw new Error(code)
  return date.toISOString()
}
function source(entry: Area3ExistingDocumentReadSource): Area3ExistingDocumentReadSource {
  return {
    invoiceId: clean(entry.invoiceId, 128, 'AREA3_READER_INVOICE_INVALID'),
    sourceItemId: clean(entry.sourceItemId, 220, 'AREA3_READER_ITEM_INVALID'),
    sourceDriveId: entry.sourceDriveId === null ? null : clean(entry.sourceDriveId, 220, 'AREA3_READER_DRIVE_INVALID'),
    sourceUpdatedAt: iso(entry.sourceUpdatedAt, 'AREA3_READER_SOURCE_VERSION_INVALID'),
  }
}

async function boundedBody(response: Response): Promise<Uint8Array> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  // A login/error document must not be remembered as an invoice fingerprint.
  if (contentType.startsWith('text/html') || contentType.startsWith('application/json')) {
    await response.body?.cancel()
    throw new Error('TIPO_DE_RESPUESTA_NO_DOCUMENTAL')
  }
  const declared = response.headers.get('content-length')
  const declaredLength = declared === null ? null : Number(declared)
  if (declaredLength !== null && (!Number.isSafeInteger(declaredLength) || declaredLength < 1 || declaredLength > AREA3_MAX_DOCUMENT_BYTES)) {
    await response.body?.cancel()
    throw new Error('ARCHIVO_FUERA_DE_LIMITE')
  }
  if (!response.body) throw new Error('CUERPO_PREVIEW_AUSENTE')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > AREA3_MAX_DOCUMENT_BYTES) {
        await reader.cancel()
        throw new Error('ARCHIVO_FUERA_DE_LIMITE')
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  if (length < 1) throw new Error('ARCHIVO_VACIO')
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return result
}

function unreadable(input: Area3ExistingDocumentReadSource, reason: string, readAt: string): Area3ExistingDocumentBytesManifestEntry {
  return { ...input, readOrigin: AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN, readAt, status: 'UNREADABLE', reason: clean(reason, 160, 'AREA3_READER_REASON_INVALID') }
}

/**
 * Reads an exact bounded source list with a fixed maximum of two concurrent
 * requests. Any failure produces an honest UNREADABLE entry; it never creates a
 * surrogate hash from a filename/item ID and it never retains response bytes.
 */
export async function readArea3ExistingDocumentBytes(input: Readonly<{
  sources: readonly Area3ExistingDocumentReadSource[]
  fetchExistingFile: Area3PreviewExistingFileFetch
  now?: () => Date
}>): Promise<Area3ExistingDocumentBytesManifest> {
  if (!Array.isArray(input.sources) || input.sources.length > 10_000 || typeof input.fetchExistingFile !== 'function') throw new Error('AREA3_READER_INPUT_INVALID')
  const sources = input.sources.map(source)
  if (new Set(sources.map(row => row.invoiceId)).size !== sources.length) throw new Error('AREA3_READER_INVOICE_DUPLICATE')
  const now = input.now ?? (() => new Date())
  const entries = new Array<Area3ExistingDocumentBytesManifestEntry>(sources.length)
  let cursor = 0
  const worker = async () => {
    for (;;) {
      const index = cursor++
      const current = sources[index]
      if (!current) return
      const controller = new AbortController()
      let timedOut = false
      const timeout = setTimeout(() => { timedOut = true; controller.abort() }, AREA3_EXISTING_FILE_READ_TIMEOUT_MS)
      const readAt = now().toISOString()
      try {
        const response = await input.fetchExistingFile({ invoiceId: current.invoiceId, signal: controller.signal })
        if (!response.ok) {
          await response.body?.cancel()
          throw new Error(`HTTP_${response.status}`)
        }
        const bytes = await boundedBody(response)
        const fingerprint = fingerprintArea3DocumentBytes(bytes)
        entries[index] = { ...current, readOrigin: AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN, readAt, status: 'HASHED', sha256: fingerprint.contentSha256, byteLength: fingerprint.byteLength }
      } catch (error) {
        const code = timedOut ? 'LECTURA_PREVIEW_TIMEOUT' : error instanceof Error && /^[A-Z0-9_]{2,120}$/.test(error.message) ? error.message : 'LECTURA_PREVIEW_FALLIDA'
        entries[index] = unreadable(current, code, readAt)
      } finally {
        clearTimeout(timeout)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(AREA3_EXISTING_FILE_READ_CONCURRENCY, sources.length) }, worker))
  return { schema: AREA3_EXISTING_DOCUMENT_BYTES_MANIFEST_SCHEMA, database: AREA3_STAGING_DATABASE, complete: true, entries }
}

/**
 * Constructs the only permitted network reader for the parent-controlled exact
 * preview origin. It uses direct invoice IDs and sends the supplied cookie only
 * to that exact origin; redirects are rejected, so it cannot follow a CDN or
 * external URL. The parent supplies an already authenticated cookie separately.
 */
export function createArea3PreviewExistingFileFetch(input: Readonly<{
  previewOrigin: string
  cookie: string
  fetchImpl?: typeof fetch
}>): Area3PreviewExistingFileFetch {
  const origin = new URL(input.previewOrigin)
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || !input.cookie.trim()) throw new Error('AREA3_PREVIEW_ORIGIN_OR_COOKIE_INVALID')
  const fetchImpl = input.fetchImpl ?? fetch
  return async ({ invoiceId, signal }) => {
    const id = clean(invoiceId, 128, 'AREA3_READER_INVOICE_INVALID')
    const target = new URL(`/api/admin/finanzas/facturas/${encodeURIComponent(id)}/pdf`, origin)
    if (target.origin !== origin.origin) throw new Error('AREA3_PREVIEW_ORIGIN_INVALID')
    return fetchImpl(target, {
      method: 'GET', redirect: 'error', cache: 'no-store',
      headers: { Cookie: input.cookie, Accept: 'application/octet-stream,application/pdf,*/*;q=0.1' }, signal,
    })
  }
}
