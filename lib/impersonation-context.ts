import { createHmac, timingSafeEqual } from 'node:crypto'
import { IMPERSONATION_CONTEXT_VERSION, IMPERSONATION_UUID, normalizedReason } from '@/lib/impersonation-policy'

export type TrustedRequestOrigin = Readonly<{
  ip: string | null
  /** Never inferred from a browser-provided x-forwarded-for header. */
  source: 'vercel' | 'vercel_missing' | 'vercel_invalid' | 'untrusted_proxy'
}>

export type TrustedImpersonationContext = Readonly<{
  v: typeof IMPERSONATION_CONTEXT_VERSION
  sessionId: string
  actorId: number
  targetId: number
  reason: string | null
  method: string
  path: string
  action: string | null
  ip: string | null
  ipSource: TrustedRequestOrigin['source']
}>

/**
 * `absent` is a normal non-acting request. `invalid` is deliberately distinct:
 * a forwarded acting header that fails MAC/schema validation must never be
 * silently treated as ordinary traffic by a downstream write guard.
 */
export type SignedImpersonationContextResolution =
  | Readonly<{ status: 'absent' }>
  | Readonly<{ status: 'invalid' }>
  | Readonly<{ status: 'valid'; context: TrustedImpersonationContext }>

function secret(): string | null {
  const value = process.env.NEXTAUTH_SECRET
  return typeof value === 'string' && value.length >= 32 ? value : null
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function decode(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
}

function signature(encoded: string, key: string): string {
  return createHmac('sha256', key).update(`io-impersonation-context:${encoded}`).digest('base64url')
}

function validIp(value: unknown): string | null {
  if (value === null) return null
  return typeof value === 'string' && value.length <= 64 && /^[0-9a-fA-F:.]+$/.test(value) ? value : null
}

/**
 * Vercel replaces this header at its edge, but it is used only after an
 * explicit deployment opt-in. Local, preview-proxy, and arbitrary browser
 * x-forwarded-for values are intentionally recorded as unavailable instead of
 * being treated as a client IP.
 */
export function trustedRequestOrigin(headers: Headers): TrustedRequestOrigin {
  const trustedVercel = process.env.IMPERSONATION_TRUSTED_PROXY === 'vercel'
    && process.env.VERCEL === '1'
    && !!headers.get('x-vercel-id')
  if (!trustedVercel) return { ip: null, source: 'untrusted_proxy' }
  const raw = headers.get('x-vercel-forwarded-for')
  if (!raw) return { ip: null, source: 'vercel_missing' }
  const ip = validIp(raw.trim())
  return ip ? { ip, source: 'vercel' } : { ip: null, source: 'vercel_invalid' }
}

function parsePayload(value: unknown): TrustedImpersonationContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  const actorId = Number(data.actorId)
  const targetId = Number(data.targetId)
  const action = data.action === null ? null : (typeof data.action === 'string' ? data.action : undefined)
  const ipSource = data.ipSource
  if (data.v !== IMPERSONATION_CONTEXT_VERSION || typeof data.sessionId !== 'string' || !IMPERSONATION_UUID.test(data.sessionId)
    || !Number.isSafeInteger(actorId) || actorId <= 0 || !Number.isSafeInteger(targetId) || targetId <= 0
    || typeof data.method !== 'string' || !/^[A-Z]{3,10}$/.test(data.method)
    || typeof data.path !== 'string' || !data.path.startsWith('/') || data.path.length > 300
    || !(action === null || (typeof action === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(action)))
    || !['vercel', 'vercel_missing', 'vercel_invalid', 'untrusted_proxy'].includes(String(ipSource))) return null
  const ip = validIp(data.ip)
  if ((ipSource === 'vercel') !== (ip !== null)) return null
  const reason = normalizedReason(data.reason)
  if (data.reason !== null && data.reason !== undefined && !reason) return null
  return {
    v: IMPERSONATION_CONTEXT_VERSION,
    sessionId: data.sessionId,
    actorId,
    targetId,
    reason,
    method: data.method,
    path: data.path,
    action,
    ip,
    ipSource: ipSource as TrustedRequestOrigin['source'],
  }
}

/** The browser can never produce this MAC; middleware overwrites same-name input. */
export function signTrustedImpersonationContext(context: TrustedImpersonationContext): string {
  const key = secret()
  if (!key) throw new Error('IMPERSONATION_CONTEXT_SECRET_MISSING')
  const payload = encode(context)
  return `${payload}.${signature(payload, key)}`
}

export function parseSignedImpersonationContext(value: string | null | undefined): TrustedImpersonationContext | null {
  const key = secret()
  if (!key || !value || value.length > 2048) return null
  const [payload, mac, extra] = value.split('.')
  if (!payload || !mac || extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(mac)) return null
  const expected = Buffer.from(signature(payload, key))
  const received = Buffer.from(mac)
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null
  try { return parsePayload(decode(payload)) } catch { return null }
}

/** Pure header resolver for server middleware and no-Next-header script tests. */
export function resolveSignedImpersonationContext(value: string | null | undefined): SignedImpersonationContextResolution {
  if (value === null || value === undefined) return { status: 'absent' }
  const context = parseSignedImpersonationContext(value)
  return context ? { status: 'valid', context } : { status: 'invalid' }
}

/** Read only inside an already authenticated route/server execution. */
export async function trustedImpersonationContextResolutionFromRequest(): Promise<SignedImpersonationContextResolution> {
  try {
    const { headers } = await import('next/headers')
    return resolveSignedImpersonationContext((await headers()).get('x-io-impersonation-context'))
  } catch {
    // Scripts, builds and background jobs have no request scope and therefore
    // cannot impersonate an interactive user. This is an absent request context,
    // not a failed signed acting header.
    return { status: 'absent' }
  }
}

/** Compatibility helper for callers that only need a verified context value. */
export async function trustedImpersonationContextFromRequest(): Promise<TrustedImpersonationContext | null> {
  const resolution = await trustedImpersonationContextResolutionFromRequest()
  return resolution.status === 'valid' ? resolution.context : null
}
