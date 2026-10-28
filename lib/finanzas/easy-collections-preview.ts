import { createHmac, timingSafeEqual } from 'node:crypto'
import { EASY_COLLECTIONS_MAX_ITEMS, type EasyCollectionSelection } from './easy-collections-core'

export const EASY_COLLECTIONS_PREVIEW_TTL_MS = 15 * 60 * 1_000
export const EASY_COLLECTIONS_PREVIEW_TOKEN_MAX = 24_000
export type EasyCollectionsRemittanceSeal = Readonly<{
  propuestaId: string
  movimientoId: string
  fingerprint: string
  compositionHash: string
  remesaId: number
}>

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET
  if (!value || value.length < 24) throw new Error('EASY_COLLECTIONS_PREVIEW_SECRET_UNAVAILABLE')
  return value
}
function sign(body: string): string {
  return createHmac('sha256', secret()).update(`easy-collections-preview:v1:${body}`).digest('base64url')
}
function selectionPayload(items: readonly EasyCollectionSelection[]) {
  return items.map(({ propuestaId, movimientoId, fingerprint }) => ({ propuestaId, movimientoId, fingerprint }))
}
function sealsPayload(seals: readonly EasyCollectionsRemittanceSeal[]) {
  return [...seals].sort((left, right) => left.movimientoId.localeCompare(right.movimientoId) || left.propuestaId.localeCompare(right.propuestaId)).map(seal => ({
    propuestaId: seal.propuestaId, movimientoId: seal.movimientoId, fingerprint: seal.fingerprint,
    compositionHash: seal.compositionHash, remesaId: seal.remesaId,
  }))
}
function validSeal(value: unknown): value is EasyCollectionsRemittanceSeal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.propuestaId === 'string' && typeof row.movimientoId === 'string' && typeof row.fingerprint === 'string'
    && /^[a-f0-9]{64}$/.test(row.fingerprint) && typeof row.compositionHash === 'string' && /^[a-f0-9]{64}$/.test(row.compositionHash)
    && Number.isSafeInteger(row.remesaId) && (row.remesaId as number) > 0
}

/** Existing generic token contract. Optional seals are server-computed source evidence only. */
export function signEasyCollectionsPreview(actorId: number, items: readonly EasyCollectionSelection[], now = Date.now(), remittanceSeals: readonly EasyCollectionsRemittanceSeal[] = []): string {
  if (!Number.isSafeInteger(actorId) || actorId <= 0 || !items.length || items.length > EASY_COLLECTIONS_MAX_ITEMS) throw new Error('EASY_COLLECTIONS_PREVIEW_INVALID')
  if (remittanceSeals.length > items.length || remittanceSeals.some(seal => !validSeal(seal) || !items.some(item => item.propuestaId === seal.propuestaId && item.movimientoId === seal.movimientoId && item.fingerprint === seal.fingerprint))) {
    throw new Error('EASY_COLLECTIONS_PREVIEW_REMESA_INVALID')
  }
  const body = Buffer.from(JSON.stringify({
    v: 1, actorId, issuedAt: now, expiresAt: now + EASY_COLLECTIONS_PREVIEW_TTL_MS,
    items: selectionPayload(items), ...(remittanceSeals.length ? { remittanceSeals: sealsPayload(remittanceSeals) } : {}),
  })).toString('base64url')
  const token = `${body}.${sign(body)}`
  if (token.length > EASY_COLLECTIONS_PREVIEW_TOKEN_MAX) throw new Error('EASY_COLLECTIONS_PREVIEW_TOO_LARGE')
  return token
}

function parseVerified(token: string, actorId: number, selected: readonly EasyCollectionSelection[], now = Date.now()): Record<string, unknown> | null {
  try {
    if (typeof token !== 'string' || token.length > EASY_COLLECTIONS_PREVIEW_TOKEN_MAX || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null
    const [body, signature] = token.split('.')
    const supplied = Buffer.from(signature, 'base64url'), expected = Buffer.from(sign(body), 'base64url')
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.v !== 1 || payload.actorId !== actorId
      || !Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt) || payload.issuedAt > now || payload.expiresAt < now
      || payload.expiresAt - payload.issuedAt !== EASY_COLLECTIONS_PREVIEW_TTL_MS || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > EASY_COLLECTIONS_MAX_ITEMS
      || !selected.length || selected.length > EASY_COLLECTIONS_MAX_ITEMS || selected.length > payload.items.length) return null
    const items = payload.items as unknown[]
    if (!selected.every(item => items.some(known => {
      if (!known || typeof known !== 'object' || Array.isArray(known)) return false
      const row = known as Record<string, unknown>
      return row.propuestaId === item.propuestaId && row.movimientoId === item.movimientoId && row.fingerprint === item.fingerprint
    }))) return null
    return payload as Record<string, unknown>
  } catch { return null }
}

export function verifyEasyCollectionsPreview(token: string, actorId: number, selected: readonly EasyCollectionSelection[], now = Date.now()): boolean {
  return parseVerified(token, actorId, selected, now) !== null
}
/** Returns only a token-authenticated remittance seal for the existing selection. */
export function verifiedEasyCollectionsRemittanceSeal(token: string, actorId: number, selection: EasyCollectionSelection, now = Date.now()): EasyCollectionsRemittanceSeal | null {
  const payload = parseVerified(token, actorId, [selection], now)
  if (!payload || !Array.isArray(payload.remittanceSeals)) return null
  const match = payload.remittanceSeals.find(value => validSeal(value)
    && value.propuestaId === selection.propuestaId && value.movimientoId === selection.movimientoId && value.fingerprint === selection.fingerprint)
  return match && validSeal(match) ? {
    propuestaId: match.propuestaId, movimientoId: match.movimientoId, fingerprint: match.fingerprint,
    compositionHash: match.compositionHash, remesaId: match.remesaId,
  } : null
}
