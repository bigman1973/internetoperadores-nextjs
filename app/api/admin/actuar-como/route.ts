import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import type { JWT } from 'next-auth/jwt'
import {
  assertImpersonationCsrf,
  exitImpersonation,
  IMPERSONATION_CSRF_COOKIE_NAME,
  IMPERSONATION_CSRF_HEADER_NAME,
  ImpersonationError,
  isActiveImpersonationToken,
  issueImpersonationCsrfToken,
  issueEffectiveSessionCookieToken,
  issueRestoredSessionCookieToken,
  listImpersonationTargets,
  nextAuthSessionCookieName,
  privateJsonHeaders,
  readImpersonationLog,
  replayEffectiveImpersonationStart,
  replayRestoredImpersonationExit,
  requireLiveSuperAdmin,
  resolveLiveImpersonation,
  resolveRestorableImpersonation,
  sourceSessionMaxAge,
  startImpersonation,
} from '@/lib/impersonation'
import { strictSameOrigin, validIdempotencyKey } from '@/lib/impersonation-policy'
import { trustedRequestOrigin } from '@/lib/impersonation-context'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_JSON_BYTES = 2 * 1024

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: privateJsonHeaders() })
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof ImpersonationError) return json({ error: error.message, codigo: error.code }, error.status)
  return json({ error: 'No se pudo completar la operación de actuación.', codigo: 'IMPERSONATION_INTERNAL_ERROR' }, 500)
}

function rejectBearer(req: NextRequest): NextResponse | null {
  // getToken otherwise accepts Authorization as a fallback. This control plane
  // deliberately accepts only the browser's HttpOnly session cookie.
  return req.headers.has('authorization') ? json({ error: 'Sólo se admite sesión web firmada.', codigo: 'AUTH_HEADER_DENIED' }, 401) : null
}

async function browserToken(req: NextRequest): Promise<JWT | null> {
  return getToken({ req, secret: process.env.NEXTAUTH_SECRET, cookieName: nextAuthSessionCookieName() })
}

async function boundedJson(req: NextRequest): Promise<Record<string, unknown>> {
  const type = req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (type !== 'application/json') throw new ImpersonationError(415, 'CONTENT_TYPE_REQUIRED', 'Se requiere application/json.')
  const length = req.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) throw new ImpersonationError(413, 'BODY_TOO_LARGE', 'El cuerpo es demasiado grande.')
  if (!req.body) throw new ImpersonationError(400, 'BODY_REQUIRED', 'El cuerpo es obligatorio.')
  const reader = req.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new ImpersonationError(413, 'BODY_TOO_LARGE', 'El cuerpo es demasiado grande.')
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new ImpersonationError(400, 'BODY_INVALID', 'El cuerpo debe ser un objeto JSON.')
    }
    return value as Record<string, unknown>
  } catch (error) {
    if (error instanceof ImpersonationError) throw error
    throw new ImpersonationError(400, 'BODY_INVALID', 'El cuerpo JSON no es válido.')
  }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const received = Object.keys(value)
  if (received.length !== keys.length || received.some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) {
    throw new ImpersonationError(400, 'BODY_CONTRACT_INVALID', 'El cuerpo contiene claves fuera del contrato.')
  }
}

function startKeys(value: Record<string, unknown>): void {
  const allowed = ['action', 'targetId', 'motivo', 'idempotencyKey']
  const received = Object.keys(value)
  if (received.some(key => !allowed.includes(key)) || !Object.hasOwn(value, 'action') || !Object.hasOwn(value, 'targetId') || !Object.hasOwn(value, 'idempotencyKey')) {
    throw new ImpersonationError(400, 'BODY_CONTRACT_INVALID', 'El cuerpo contiene claves fuera del contrato.')
  }
}

function pageNumber(value: string | null, fallback: number, maximum: number): number {
  if (value === null) return fallback
  if (!/^\d{1,5}$/.test(value)) throw new ImpersonationError(400, 'PAGINATION_INVALID', 'La paginación no es válida.')
  return Math.min(Number(value), maximum)
}

function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(nextAuthSessionCookieName(), '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
  // Remove any stale NextAuth chunks from a previous incompatible deployment.
  for (let index = 0; index < 8; index += 1) response.cookies.set(`${nextAuthSessionCookieName()}.${index}`, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
}

function setSessionCookie(response: NextResponse, value: string, maxAge: number): void {
  response.cookies.set(nextAuthSessionCookieName(), value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  })
  // The issuer rejects >3.6 KiB, still proactively erase legacy chunks.
  for (let index = 0; index < 8; index += 1) response.cookies.set(`${nextAuthSessionCookieName()}.${index}`, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
}

function jsonWithCsrf(body: Record<string, unknown>, token: JWT, status = 200): NextResponse {
  const csrfToken = issueImpersonationCsrfToken(token)
  const response = json({ ...body, csrfToken }, status)
  response.cookies.set(IMPERSONATION_CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: Math.min(sourceSessionMaxAge(token), 10 * 60),
  })
  return response
}

function assertBrowserPostSecurity(req: NextRequest, token: JWT): void {
  if (!strictSameOrigin(req.headers.get('origin'), process.env.NEXTAUTH_URL)) {
    throw new ImpersonationError(403, 'ORIGIN_INVALID', 'El origen de la solicitud no es válido.')
  }
  const fetchSite = req.headers.get('sec-fetch-site')
  if (fetchSite !== null && fetchSite.toLowerCase() !== 'same-origin') {
    throw new ImpersonationError(403, 'FETCH_SITE_INVALID', 'La solicitud no procede de este origen.')
  }
  assertImpersonationCsrf(
    token,
    req.cookies.get(IMPERSONATION_CSRF_COOKIE_NAME)?.value,
    req.headers.get(IMPERSONATION_CSRF_HEADER_NAME),
  )
}

/** State is visible to the effective target, but target list is only for a live real super-admin. */
export async function GET(req: NextRequest) {
  const denied = rejectBearer(req)
  if (denied) return denied
  try {
    const token = await browserToken(req)
    if (!token) return json({ enabled: true, active: null, canStart: false })
    if (isActiveImpersonationToken(token)) {
      try {
        const live = await resolveLiveImpersonation(token)
        return jsonWithCsrf({ enabled: true, active: live.active, canStart: false }, token)
      } catch (error) {
        // The effective session is denied after its absolute ledger expiry, but
        // its encrypted source proof remains usable for the explicit POST
        // salir invoked by the foreground expiry handler. This response is
        // metadata only; it never makes the target identity usable.
        if (error instanceof ImpersonationError) {
          try {
            // Revalidates immutable end, source hash and live source actor.
            // This emits only metadata/CSRF, never a target identity grant.
            const recovery = await resolveRestorableImpersonation(token)
            return jsonWithCsrf({
              enabled: true,
              active: recovery.active,
              canStart: false,
              ...(recovery.endReason === 'EXPIRED' ? { expired: true } : { revoked: true }),
              restorable: true,
            }, token)
          } catch (recoveryError) {
            if (recoveryError instanceof ImpersonationError && recoveryError.code === 'SOURCE_REAUTH_REQUIRED') {
              const response = errorResponse(recoveryError)
              clearSessionCookie(response)
              return response
            }
            // Invalid source/ledger states remain closed and never disclose a
            // recovery CSRF token.
          }
        }
        // Never silently return a super-admin identity for an invalid effective
        // session. Keep the encrypted source proof only so POST salir can recover
        // it; this cookie has no access to any route while ledger checks fail.
        return errorResponse(error)
      }
    }
    const actor = await requireLiveSuperAdmin(token)
    const limit = pageNumber(req.nextUrl.searchParams.get('limit'), 50, 100)
    const offset = pageNumber(req.nextUrl.searchParams.get('offset'), 0, 10_000)
    const targets = await listImpersonationTargets(limit, offset)
    return jsonWithCsrf({ enabled: true, active: null, canStart: actor.role === 'SUPER_ADMIN', targets }, token)
  } catch (error) { return errorResponse(error) }
}

/** Start or exit; GET never mutates. */
export async function POST(req: NextRequest) {
  const denied = rejectBearer(req)
  if (denied) return denied
  try {
    const token = await browserToken(req)
    if (!token) throw new ImpersonationError(401, 'AUTH_REQUIRED', 'Se requiere una sesión web firmada.')
    assertBrowserPostSecurity(req, token)
    const body = await boundedJson(req)
    const origin = trustedRequestOrigin(req.headers)
    const action = body.action
    if (action === 'iniciar') {
      startKeys(body)
      if (!Number.isSafeInteger(body.targetId) || (body.targetId as number) <= 0) throw new ImpersonationError(400, 'TARGET_INVALID', 'El destino no es válido.')
      if (typeof body.motivo !== 'string' && body.motivo !== null && body.motivo !== undefined) throw new ImpersonationError(400, 'REASON_INVALID', 'El motivo no es válido.')
      const idempotencyKey = body.idempotencyKey
      if (!validIdempotencyKey(idempotencyKey)) throw new ImpersonationError(400, 'IDEMPOTENCY_INVALID', 'La clave de idempotencia no es válida.')
      const result = isActiveImpersonationToken(token)
        ? await replayEffectiveImpersonationStart(token, body.targetId as number, idempotencyKey, origin.ip)
        : await (async () => {
          await requireLiveSuperAdmin(token)
          return startImpersonation({
            sourceToken: token,
            targetId: body.targetId as number,
            reason: body.motivo,
            idempotencyKey,
            ip: origin.ip,
          })
        })()
      const cookie = await issueEffectiveSessionCookieToken(result.token)
      const response = jsonWithCsrf({ ok: true, redirectTo: '/admin/finanzas/modo-facil', active: result.active }, result.token)
      // The ledger, not browser cookie expiry, enforces the 60 minute acting
      // limit. Retain the encrypted original proof until its real session ends
      // so an expired foreground can still submit its safe exit recovery.
      setSessionCookie(response, cookie, sourceSessionMaxAge(result.token))
      return response
    }
    if (action === 'salir') {
      exactKeys(body, ['action', 'idempotencyKey'])
      if (!validIdempotencyKey(body.idempotencyKey)) throw new ImpersonationError(400, 'IDEMPOTENCY_INVALID', 'La clave de idempotencia no es válida.')
      if (!isActiveImpersonationToken(token)) {
        // A restored cookie proves nothing by itself. Only this exact durable
        // receipt can acknowledge a lost exit response; no session is minted.
        await replayRestoredImpersonationExit(token, body.idempotencyKey)
        return jsonWithCsrf({ ok: true, redirectTo: '/admin', active: null, replayed: true }, token)
      }
      // Exit is intentionally available to an effective user with minimal profile
      // and is idempotent at ledger level. Its payload cannot name an actor.
      const result = await exitImpersonation(token, body.idempotencyKey, origin.ip)
      const cookie = await issueRestoredSessionCookieToken(result.token)
      const response = jsonWithCsrf({ ok: true, redirectTo: '/admin', active: null, ...(result.replayed ? { replayed: true } : {}) }, result.token)
      setSessionCookie(response, cookie, sourceSessionMaxAge(result.token))
      return response
    }
    throw new ImpersonationError(400, 'ACTION_INVALID', 'La acción no es válida.')
  } catch (error) {
    const response = errorResponse(error)
    // SIGN_OUT/LOGIN are deliberately never restorable. Remove a stale acting
    // proof so the browser must establish a new real session.
    if (error instanceof ImpersonationError && error.code === 'SOURCE_REAUTH_REQUIRED') clearSessionCookie(response)
    return response
  }
}

export async function PUT() { return json({ error: 'Método no permitido' }, 405) }
export async function PATCH() { return json({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return json({ error: 'Método no permitido' }, 405) }
