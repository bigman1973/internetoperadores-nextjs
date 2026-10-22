import { timingSafeEqual } from 'node:crypto'

export const PRIVATE_NO_STORE = { 'cache-control': 'private, no-store' }
export const MAX_JSON_BYTES = 16 * 1024

export class HttpGuardError extends Error {
  constructor(public readonly status: number, public readonly code: string, message?: string) { super(message ?? code) }
}

export function sameOrigin(request: { headers: Headers; nextUrl: URL }): boolean {
  return request.headers.get('origin') === request.nextUrl.origin
}

export async function readJsonLimited(request: Request, limit = MAX_JSON_BYTES): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') throw new HttpGuardError(415, 'JSON_REQUIRED')
  if (!request.body) throw new HttpGuardError(400, 'EMPTY_JSON')
  const reader = request.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''; let size = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > limit) { await reader.cancel(); throw new HttpGuardError(413, 'JSON_TOO_LARGE') }
      text += decoder.decode(next.value, { stream: true })
    }
    text += decoder.decode()
  } finally { reader.releaseLock() }
  try { return JSON.parse(text) } catch { throw new HttpGuardError(400, 'INVALID_JSON') }
}

/** Fail closed: empty/missing secret and unequal byte lengths are both unauthorized. */
export function validCronBearer(authorization: string | null, configuredSecret: string | undefined): boolean {
  if (!configuredSecret || configuredSecret.length === 0 || !authorization?.startsWith('Bearer ')) return false
  const candidate = Buffer.from(authorization.slice(7)); const expected = Buffer.from(configuredSecret)
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export function isoUtcDate(now = new Date()) { return now.toISOString().slice(0, 10) }
