import { createHmac, timingSafeEqual } from 'node:crypto'
import { EASY_COLLECTIONS_MAX_ITEMS, type EasyCollectionSelection } from './easy-collections-core'

export const EASY_COLLECTIONS_PREVIEW_TTL_MS = 15 * 60 * 1_000
export const EASY_COLLECTIONS_PREVIEW_TOKEN_MAX = 24_000

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET
  if (!value || value.length < 24) throw new Error('EASY_COLLECTIONS_PREVIEW_SECRET_UNAVAILABLE')
  return value
}
function sign(body: string): string {
  return createHmac('sha256', secret()).update(`easy-collections-preview:v1:${body}`).digest('base64url')
}

export function signEasyCollectionsPreview(actorId: number, items: readonly EasyCollectionSelection[], now = Date.now()): string {
  if (!Number.isSafeInteger(actorId) || actorId <= 0 || !items.length || items.length > EASY_COLLECTIONS_MAX_ITEMS) throw new Error('EASY_COLLECTIONS_PREVIEW_INVALID')
  const body = Buffer.from(JSON.stringify({
    v: 1, actorId, issuedAt: now, expiresAt: now + EASY_COLLECTIONS_PREVIEW_TTL_MS,
    items: items.map(({ propuestaId, movimientoId, fingerprint }) => ({ propuestaId, movimientoId, fingerprint })),
  })).toString('base64url')
  const token = `${body}.${sign(body)}`
  if (token.length > EASY_COLLECTIONS_PREVIEW_TOKEN_MAX) throw new Error('EASY_COLLECTIONS_PREVIEW_TOO_LARGE')
  return token
}

export function verifyEasyCollectionsPreview(token: string, actorId: number, selected: readonly EasyCollectionSelection[], now = Date.now()): boolean {
  try {
    if (typeof token !== 'string' || token.length > EASY_COLLECTIONS_PREVIEW_TOKEN_MAX || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return false
    const [body, signature] = token.split('.')
    const supplied = Buffer.from(signature, 'base64url'), expected = Buffer.from(sign(body), 'base64url')
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload || payload.v !== 1 || payload.actorId !== actorId || !Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt) || payload.issuedAt > now || payload.expiresAt < now || payload.expiresAt - payload.issuedAt !== EASY_COLLECTIONS_PREVIEW_TTL_MS || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > EASY_COLLECTIONS_MAX_ITEMS) return false
    if (!selected.length || selected.length > EASY_COLLECTIONS_MAX_ITEMS || selected.length > payload.items.length) return false
    return selected.every(item => payload.items.some((known: unknown) => {
      if (!known || typeof known !== 'object' || Array.isArray(known)) return false
      const row = known as Record<string, unknown>
      return row.propuestaId === item.propuestaId && row.movimientoId === item.movimientoId && row.fingerprint === item.fingerprint
    }))
  } catch { return false }
}
