import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { encode } from 'next-auth/jwt'
import type { JWT } from 'next-auth/jwt'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import {
  IMPERSONATION_CONTEXT_VERSION,
  IMPERSONATION_MAX_SECONDS,
  IMPERSONATION_UUID,
  canStartImpersonation,
  evaluateLiveImpersonation,
  normalizedReason,
  type AdminIdentity,
  type ImpersonationBodyAction,
} from '@/lib/impersonation-policy'

const STAGING_DATABASE = 'io_staging_finanzas'
const STAGING_USER = 'io_staging_finanzas'
const TABLE_MISSING = '42P01'

export type EffectiveAdminIdentity = Readonly<{
  id: number
  email: string
  name: string
  role: string
  roles: string[]
  userType: 'admin'
}>

export type ImpersonationClaims = Readonly<{
  v: typeof IMPERSONATION_CONTEXT_VERSION
  sessionId: string
  actorId: string
  actorName: string
  targetId: string
  targetName: string
  expiresAt: string
  sourceSessionHash: string
}>

export type ActiveImpersonation = Readonly<{
  sessionId: string
  actorName: string
  targetName: string
  targetId: string
  expiresAt: string
}>

export type LiveImpersonation = Readonly<{
  active: ActiveImpersonation
  actor: EffectiveAdminIdentity
  target: EffectiveAdminIdentity
  reason: string | null
}>

export class ImpersonationError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}

export function privateJsonHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    Vary: 'Cookie',
    'X-Content-Type-Options': 'nosniff',
  }
}

/** Mirrors NextAuth v4 defaults; acting is enabled only over the HTTPS staging URL. */
export function nextAuthSessionCookieName(): string {
  return process.env.NEXTAUTH_URL?.startsWith('https://') || process.env.VERCEL === '1'
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'
}

/** Host-only HttpOnly cookie echoed by GET state in a request header. */
export const IMPERSONATION_CSRF_COOKIE_NAME = '__Host-io-actuation-csrf'
export const IMPERSONATION_CSRF_HEADER_NAME = 'x-io-actuation-csrf'
const CSRF_TOKEN_VERSION = 'v1'
const CSRF_MAX_SECONDS = 10 * 60

function fail(status: number, code: string, message: string): never {
  throw new ImpersonationError(status, code, message)
}

function csrfSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (typeof secret !== 'string' || secret.length < 32) {
    fail(503, 'IMPERSONATION_CSRF_SECRET_INVALID', 'No se pudo proteger la solicitud de actuación.')
  }
  return secret
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function text(value: unknown, maximum = 300): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) fail(401, 'IMPERSONATION_INVALID', 'La sesión de actuación no es válida.')
  return value
}

function positiveId(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail(401, 'IMPERSONATION_INVALID', 'La sesión de actuación no es válida.')
  return parsed
}

function asRoles(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((role): role is string => typeof role === 'string') : []
}

function isMissingTable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === TABLE_MISSING
}

function databaseConfiguredForStaging(): boolean {
  try {
    const url = new URL(process.env.DATABASE_URL || '')
    return process.env.FINANCE_STAGING_SANDBOX === '1'
      && process.env.VERCEL_ENV !== 'production'
      && url.pathname === `/${STAGING_DATABASE}`
      && decodeURIComponent(url.username) === STAGING_USER
  } catch {
    return false
  }
}

/** No production fallback: configured and live database identity must both match staging. */
export async function assertImpersonationStaging(): Promise<void> {
  if (!databaseConfiguredForStaging()) fail(404, 'IMPERSONATION_STAGING_ONLY', 'Actuar como sólo está habilitado en staging aislado.')
  try {
    const rows = await prisma.$queryRaw<Array<{ database_name: string; database_user: string }>>(Prisma.sql`
      SELECT current_database() AS database_name, current_user AS database_user LIMIT 1
    `)
    if (rows.length !== 1 || rows[0].database_name !== STAGING_DATABASE || rows[0].database_user !== STAGING_USER) {
      fail(404, 'IMPERSONATION_STAGING_ONLY', 'Actuar como sólo está habilitado en staging aislado.')
    }
  } catch (error) {
    if (error instanceof ImpersonationError) throw error
    fail(503, 'IMPERSONATION_IDENTITY_UNAVAILABLE', 'No se pudo verificar el entorno de actuación.')
  }
}

function stableSourceId(value: unknown): string | null {
  return typeof value === 'string' && IMPERSONATION_UUID.test(value) ? value : null
}

/** A HMAC-like fingerprint; no source cookie or OAuth credential enters the database. */
export function sourceSessionHash(token: Readonly<{ ioActuationSourceId?: unknown; jti?: unknown; sub?: unknown; id?: unknown }>): string {
  const secret = process.env.NEXTAUTH_SECRET
  // NextAuth rotates `jti` at every JWE encoding. Real logins carry this
  // encrypted stable id; the `jti` fallback is only for pre-rollout tokens.
  const sourceId = stableSourceId(token.ioActuationSourceId)
    ?? (typeof token.jti === 'string' ? token.jti : '')
  const subject = typeof token.sub === 'string' ? token.sub : String(token.id ?? '')
  if (!secret || !sourceId || !subject) fail(401, 'SOURCE_SESSION_INVALID', 'La sesión de origen no se puede verificar.')
  return createHash('sha256').update(`${secret}\u0000${subject}\u0000${sourceId}`).digest('hex')
}

/** Original identity is retained solely in the same encrypted NextAuth JWE. */
function sourceClaims(token: JWT, enrollStableSourceId = false): JWT {
  const actorId = text(token.id, 30)
  if (token.userType !== 'admin') fail(401, 'SOURCE_SESSION_INVALID', 'La sesión de origen no es administrativa.')
  const email = typeof token.email === 'string' ? token.email : null
  const name = typeof token.name === 'string' ? token.name : null
  if (!email || !name) fail(401, 'SOURCE_SESSION_INVALID', 'La sesión de origen no se puede restaurar.')
  const jti = typeof token.jti === 'string' ? token.jti : null
  if (!jti) fail(401, 'SOURCE_SESSION_INVALID', 'La sesión de origen no se puede verificar.')
  const sourceExpiresAt = typeof token.sourceExpiresAt === 'number'
    ? token.sourceExpiresAt
    : (typeof token.exp === 'number' ? token.exp : null)
  if (!sourceExpiresAt || sourceExpiresAt <= Date.now() / 1000) {
    fail(401, 'SOURCE_SESSION_EXPIRED', 'La sesión de origen ha caducado.')
  }
  const csrfEpoch = typeof token.ioActuationCsrfEpoch === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(token.ioActuationCsrfEpoch)
    ? token.ioActuationCsrfEpoch
    : undefined
  // A legacy real-session JWE is enrolled only when it first enters an acting
  // envelope. Its signed pre-rollout jti is retained as the stable source id,
  // so the ledger hash remains compatible after the encoder rotates outer jti.
  const actuationSourceId = stableSourceId(token.ioActuationSourceId)
    ?? (enrollStableSourceId ? jti : undefined)
  return {
    id: actorId,
    sub: typeof token.sub === 'string' ? token.sub : actorId,
    jti,
    email,
    name,
    role: typeof token.role === 'string' ? token.role : undefined,
    roles: asRoles(token.roles),
    userType: 'admin',
    sourceExpiresAt,
    ...(csrfEpoch ? { ioActuationCsrfEpoch: csrfEpoch } : {}),
    ...(actuationSourceId ? { ioActuationSourceId: actuationSourceId } : {}),
  }
}

function originalClaims(token: JWT): JWT {
  const original = token.original
  if (original && typeof original === 'object' && !Array.isArray(original)) return sourceClaims(original as JWT)
  return sourceClaims(token)
}

function effectiveSourceSessionHash(token: JWT): string {
  return sourceSessionHash(originalClaims(token))
}

/**
 * This opaque value changes whenever the browser moves between its source and
 * effective JWE. It binds the CSRF proof to the real signed session and, when
 * acting, to exactly one immutable acting-session ledger id.
 */
function csrfSessionBinding(token: JWT): string {
  const sourceHash = effectiveSourceSessionHash(token)
  const source = originalClaims(token)
  const active = readImpersonationClaims(token)
  const effective = active ? `effective:${active.sessionId}` : `source:${source.ioActuationCsrfEpoch ?? 'initial'}`
  return createHmac('sha256', csrfSecret())
    .update(`io-actuation-csrf-binding:${CSRF_TOKEN_VERSION}:${sourceHash}:${effective}`)
    .digest('base64url')
}

function csrfMac(binding: string, nonce: string, expiresAt: number): string {
  return createHmac('sha256', csrfSecret())
    .update(`io-actuation-csrf:${CSRF_TOKEN_VERSION}:${binding}:${nonce}:${expiresAt}`)
    .digest('base64url')
}

/**
 * The opaque value is copied to a host-only HttpOnly cookie by the route and
 * separately returned by GET for JavaScript to echo in the request header.
 */
export function issueImpersonationCsrfToken(token: JWT, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const source = originalClaims(token)
  const sourceExpiry = Number(source.sourceExpiresAt)
  if (!Number.isSafeInteger(sourceExpiry) || sourceExpiry <= nowSeconds) {
    fail(401, 'SOURCE_SESSION_EXPIRED', 'La sesión original ha caducado.')
  }
  const expiresAt = Math.min(sourceExpiry, nowSeconds + CSRF_MAX_SECONDS)
  const nonce = randomBytes(32).toString('base64url')
  const binding = csrfSessionBinding(token)
  return `${CSRF_TOKEN_VERSION}.${nonce}.${expiresAt}.${csrfMac(binding, nonce, expiresAt)}`
}

/**
 * The token remains valid until expiry. A lost start/exit response can repeat
 * its immutable idempotency key; after a successful transition GET binds a new
 * token to the newly installed effective or restored session.
 */
export function assertImpersonationCsrf(
  token: JWT,
  cookieValue: string | null | undefined,
  submittedValue: string | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): void {
  if (!cookieValue || !submittedValue) {
    fail(403, 'CSRF_REQUIRED', 'Se requiere la confirmación antifalsificación de la solicitud.')
  }
  if (cookieValue.length > 512 || submittedValue.length > 512 || !safeEqual(cookieValue, submittedValue)) {
    fail(403, 'CSRF_MISMATCH', 'La confirmación antifalsificación no coincide.')
  }
  const [version, nonce, expiresText, mac, extra] = submittedValue.split('.')
  if (version !== CSRF_TOKEN_VERSION || !nonce || !/^[A-Za-z0-9_-]{32,128}$/.test(nonce)
    || !/^\d{1,12}$/.test(expiresText ?? '') || !mac || !/^[A-Za-z0-9_-]{32,128}$/.test(mac) || extra !== undefined) {
    fail(403, 'CSRF_INVALID', 'La confirmación antifalsificación no es válida.')
  }
  const expiresAt = Number(expiresText)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds) {
    fail(403, 'CSRF_EXPIRED', 'La confirmación antifalsificación ha caducado.')
  }
  if (!safeEqual(mac, csrfMac(csrfSessionBinding(token), nonce, expiresAt))) {
    fail(403, 'CSRF_SESSION_MISMATCH', 'La confirmación antifalsificación no pertenece a esta sesión.')
  }
}

export function readImpersonationClaims(token: JWT | null | undefined): ImpersonationClaims | null {
  const raw = token?.impersonation
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  if (value.v !== IMPERSONATION_CONTEXT_VERSION) return null
  const sessionId = typeof value.sessionId === 'string' ? value.sessionId : ''
  const actorId = typeof value.actorId === 'string' ? value.actorId : ''
  const targetId = typeof value.targetId === 'string' ? value.targetId : ''
  const actorName = typeof value.actorName === 'string' ? value.actorName : ''
  const targetName = typeof value.targetName === 'string' ? value.targetName : ''
  const expiresAt = typeof value.expiresAt === 'string' ? value.expiresAt : ''
  const sourceHash = typeof value.sourceSessionHash === 'string' ? value.sourceSessionHash : ''
  if (!IMPERSONATION_UUID.test(sessionId) || !/^\d{1,10}$/.test(actorId) || !/^\d{1,10}$/.test(targetId)
    || !actorName || actorName.length > 300 || !targetName || targetName.length > 300
    || !/^\d{4}-\d{2}-\d{2}T/.test(expiresAt) || !/^[0-9a-f]{64}$/.test(sourceHash)) return null
  return { v: IMPERSONATION_CONTEXT_VERSION, sessionId, actorId, actorName, targetId, targetName, expiresAt, sourceSessionHash: sourceHash }
}

export function activeFromClaims(claims: ImpersonationClaims): ActiveImpersonation {
  return { sessionId: claims.sessionId, actorName: claims.actorName, targetName: claims.targetName, targetId: claims.targetId, expiresAt: claims.expiresAt }
}

function identityFromRow(row: any): EffectiveAdminIdentity | null {
  if (!row || !Number.isSafeInteger(Number(row.id)) || Number(row.id) <= 0 || typeof row.email !== 'string' || typeof row.nombre !== 'string') return null
  return { id: Number(row.id), email: row.email, name: row.nombre, role: typeof row.rol === 'string' ? row.rol : '', roles: asRoles(row.roles), userType: 'admin' }
}

function adminFromIdentity(identity: EffectiveAdminIdentity | null, active: boolean): AdminIdentity | null {
  return identity ? { id: identity.id, activo: active, rol: identity.role, roles: identity.roles } : null
}

async function readAdmin(idValue: number) {
  const row = await prisma.usuarioAdmin.findUnique({
    where: { id: idValue },
    select: { id: true, email: true, nombre: true, rol: true, roles: true, activo: true },
  })
  return { effective: identityFromRow(row), active: row?.activo === true }
}

export type AuditInput = Readonly<{
  sessionId: string | null
  actorId: number | null
  targetId: number | null
  kind: string
  outcome: 'ATTEMPT' | 'SUCCESS' | 'DENIED' | 'FAILED'
  method?: string | null
  path?: string | null
  ip?: string | null
  reason?: string | null
  model?: string | null
  operation?: string | null
  detail?: Record<string, unknown> | null
}>

function boundedIp(value: string | null | undefined): string | null {
  if (!value) return null
  const ip = value.trim().slice(0, 64)
  return /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null
}
function boundedPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.length > 300) return null
  return value.split('?')[0]
}
function boundedKind(value: string): string { return /^[A-Z0-9_]{3,80}$/.test(value) ? value : 'INVALID_EVENT' }

/** Does not retain request body, query string, cookies, passwords or OAuth tokens. */
export async function appendImpersonationAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO impersonation_event_log
        (id,session_id,actor_id,target_id,kind,outcome,method,path,ip,reason,model,operation,detail,created_at)
      VALUES
        (gen_random_uuid(),${input.sessionId ? input.sessionId : null}::uuid,${input.actorId ?? null},${input.targetId ?? null},
         ${boundedKind(input.kind)},${input.outcome},${input.method ? input.method.slice(0, 12).toUpperCase() : null},
         ${boundedPath(input.path)},${boundedIp(input.ip)},${normalizedReason(input.reason)},${input.model ? input.model.slice(0, 120) : null},
         ${input.operation ? input.operation.slice(0, 80) : null},${JSON.stringify(input.detail ?? {})}::jsonb,CURRENT_TIMESTAMP)
    `)
  } catch (error) {
    if (isMissingTable(error)) fail(503, 'IMPERSONATION_MIGRATION_PENDING', 'La auditoría de actuación aún no está preparada.')
    throw error
  }
}

type TerminalReason = 'EXITED' | 'EXPIRED' | 'REVOKED' | 'SIGN_OUT' | 'LOGIN'
const EXIT_COMMAND = 'EXIT'
const EXIT_REDIRECT_TO = '/admin'

export function recoveryExitKeyHash(idempotencyKey: string): string {
  return createHash('sha256').update(`io-actuation-recovery-exit:${idempotencyKey}`, 'utf8').digest('hex')
}

export type RecoveryExitDecision = 'CREATE' | 'REPLAY' | 'CONFLICT' | 'REAUTH_REQUIRED' | 'NOT_RECOVERABLE'

/** Pure classification of a closed ledger row; database checks remain mandatory. */
export function recoveryExitDecision(
  endReason: string | null | undefined,
  existingKeyHash: string | null | undefined,
  submittedKeyHash: string,
): RecoveryExitDecision {
  if (endReason === 'SIGN_OUT' || endReason === 'LOGIN') return 'REAUTH_REQUIRED'
  if (endReason !== 'EXPIRED' && endReason !== 'REVOKED') return 'NOT_RECOVERABLE'
  if (!existingKeyHash) return 'CREATE'
  return safeEqual(existingKeyHash, submittedKeyHash) ? 'REPLAY' : 'CONFLICT'
}

function isRecoverableTerminalReason(value: unknown): value is 'EXPIRED' | 'REVOKED' {
  return value === 'EXPIRED' || value === 'REVOKED'
}

function terminalEventKind(reason: TerminalReason): 'EXIT' | 'EXPIRED' | 'REVOKED' | 'SIGN_OUT' | 'LOGIN' {
  return reason === 'EXITED' ? 'EXIT' : reason
}

/** Inserts an immutable end and its matching receipt in the caller's transaction. */
async function appendImpersonationEndTx(
  tx: Prisma.TransactionClient,
  sessionId: string,
  reason: TerminalReason,
  endedById: number | null,
): Promise<boolean> {
  const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO impersonation_session_ends(id,session_id,end_reason,ended_by_id,ended_at)
    SELECT gen_random_uuid(),s.id,${reason},${endedById},CURRENT_TIMESTAMP
      FROM impersonation_sessions s
     WHERE s.id=${sessionId}::uuid
       AND NOT EXISTS (SELECT 1 FROM impersonation_session_ends e WHERE e.session_id=s.id)
    RETURNING id::text
  `)
  if (inserted.length === 0) return false
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO impersonation_event_log(id,session_id,actor_id,target_id,kind,outcome,detail,created_at)
    SELECT gen_random_uuid(),s.id,s.actor_id,s.target_id,${terminalEventKind(reason)},'SUCCESS','{}'::jsonb,CURRENT_TIMESTAMP
      FROM impersonation_sessions s WHERE s.id=${sessionId}::uuid
  `)
  return true
}

/** The exit payload has no client-controlled fields beyond its separate key. */
export function exitCommandPayloadHash(): string {
  return createHash('sha256').update('{"action":"salir"}', 'utf8').digest('hex')
}

/** Kept only inside the encrypted restored JWE; it rotates CSRF on explicit exit. */
function rotateRestoredSourceCsrfEpoch(source: JWT): JWT {
  return { ...source, ioActuationCsrfEpoch: randomBytes(24).toString('base64url') }
}

type ExitReceipt = Readonly<{ sessionId: string; payloadHash: string; redirectTo: string }>
type RecoveryExitReceipt = Readonly<{ sessionId: string; keyHash: string; endReason: string }>

async function readExitReceiptTx(
  tx: Prisma.TransactionClient,
  actorId: number,
  idempotencyKey: string,
): Promise<ExitReceipt | null> {
  const rows = await tx.$queryRaw<Array<{ session_id: string; payload_hash: string; redirect_to: string }>>(Prisma.sql`
    SELECT session_id::text,payload_hash,redirect_to
      FROM impersonation_control_command_receipts
     WHERE command=${EXIT_COMMAND} AND actor_id=${actorId} AND idempotency_key=${idempotencyKey}
     LIMIT 1 FOR UPDATE
  `)
  const row = rows[0]
  return row ? { sessionId: String(row.session_id), payloadHash: String(row.payload_hash), redirectTo: String(row.redirect_to) } : null
}

async function appendExitReceiptTx(
  tx: Prisma.TransactionClient,
  sessionId: string,
  actorId: number,
  idempotencyKey: string,
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO impersonation_control_command_receipts
      (id,command,session_id,actor_id,idempotency_key,payload_hash,redirect_to,created_at)
    VALUES
      (gen_random_uuid(),${EXIT_COMMAND},${sessionId}::uuid,${actorId},${idempotencyKey},${exitCommandPayloadHash()},${EXIT_REDIRECT_TO},CURRENT_TIMESTAMP)
  `)
}

async function readRecoveryExitReceiptForActorKeyTx(
  tx: Prisma.TransactionClient,
  actorId: number,
  idempotencyKeyHash: string,
): Promise<RecoveryExitReceipt | null> {
  const rows = await tx.$queryRaw<Array<{ session_id: string; key_hash: string; end_reason: string }>>(Prisma.sql`
    SELECT e.session_id::text,e.detail->>'keyHash' AS key_hash,e.detail->>'endReason' AS end_reason
      FROM impersonation_event_log e
     WHERE e.actor_id=${actorId}
       AND e.kind='EXIT'
       AND e.outcome='SUCCESS'
       AND e.detail @> '{"command":"EXIT","recovery":true}'::jsonb
       AND e.detail->>'keyHash'=${idempotencyKeyHash}
     LIMIT 2 FOR UPDATE
  `)
  if (rows.length > 1) fail(409, 'IDEMPOTENCY_CONFLICT', 'La clave de idempotencia tiene recibos de recuperación ambiguos.')
  const row = rows[0]
  return row ? { sessionId: String(row.session_id), keyHash: String(row.key_hash), endReason: String(row.end_reason) } : null
}

async function readRecoveryExitReceiptForSessionTx(
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<RecoveryExitReceipt | null> {
  const rows = await tx.$queryRaw<Array<{ session_id: string; key_hash: string; end_reason: string }>>(Prisma.sql`
    SELECT e.session_id::text,e.detail->>'keyHash' AS key_hash,e.detail->>'endReason' AS end_reason
      FROM impersonation_event_log e
     WHERE e.session_id=${sessionId}::uuid
       AND e.kind='EXIT'
       AND e.outcome='SUCCESS'
       AND e.detail @> '{"command":"EXIT","recovery":true}'::jsonb
     LIMIT 2 FOR UPDATE
  `)
  if (rows.length > 1) fail(409, 'IDEMPOTENCY_CONFLICT', 'La sesión tiene recibos de recuperación ambiguos.')
  const row = rows[0]
  return row ? { sessionId: String(row.session_id), keyHash: String(row.key_hash), endReason: String(row.end_reason) } : null
}

async function appendRecoveryExitReceiptTx(
  tx: Prisma.TransactionClient,
  input: Readonly<{ sessionId: string; actorId: number; targetId: number; endReason: 'EXPIRED' | 'REVOKED'; keyHash: string; ip?: string | null }>,
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO impersonation_event_log(id,session_id,actor_id,target_id,kind,outcome,method,path,ip,detail,created_at)
    VALUES(gen_random_uuid(),${input.sessionId}::uuid,${input.actorId},${input.targetId},'EXIT','SUCCESS',
           'POST','/api/admin/actuar-como',${boundedIp(input.ip)},
           jsonb_build_object('command',${EXIT_COMMAND},'recovery',true,'endReason',${input.endReason},'keyHash',${input.keyHash}),
           CURRENT_TIMESTAMP)
  `)
}

async function assertLiveRestorationActorTx(tx: Prisma.TransactionClient, source: JWT, actorId: number): Promise<void> {
  if (positiveId(source.id) !== actorId) fail(401, 'SOURCE_SESSION_INVALID', 'La sesión original no pertenece a la actuación.')
  const rows = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT id FROM usuarios_admin
     WHERE id=${actorId} AND activo=true AND rol='SUPER_ADMIN'
     LIMIT 1 FOR SHARE
  `)
  if (rows.length !== 1) fail(401, 'SOURCE_SESSION_REVOKED', 'La sesión original ya no está autorizada.')
}

/**
 * Closing is a durable, append-only receipt. Callers that need to acknowledge
 * an explicit exit must let errors escape; otherwise the browser could receive
 * an "ok" response while the effective session remains active in the ledger.
 */
export async function appendImpersonationEnd(
  sessionId: string,
  reason: TerminalReason,
  endedById: number | null = null,
): Promise<boolean> {
  if (!IMPERSONATION_UUID.test(sessionId)) return false
  try {
    return await prisma.$transaction(
      tx => appendImpersonationEndTx(tx, sessionId, reason, endedById),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 },
    )
  } catch (error) {
    if (isMissingTable(error)) fail(503, 'IMPERSONATION_MIGRATION_PENDING', 'La auditoría de actuación aún no está preparada.')
    throw error
  }
}

/** Only denial paths may lose a terminal audit receipt. They never re-enable a token. */
async function appendBestEffortImpersonationEnd(
  sessionId: string,
  reason: Exclude<TerminalReason, 'EXITED'>,
  endedById: number | null = null,
): Promise<void> {
  try { await appendImpersonationEnd(sessionId, reason, endedById) } catch { /* denial remains fail-closed */ }
}

/** Verifies ledger, original-session fingerprint and both current identities every request. */
export async function resolveLiveImpersonation(token: JWT, now = new Date()): Promise<LiveImpersonation> {
  await assertImpersonationStaging()
  const claims = readImpersonationClaims(token)
  if (!claims) fail(401, 'IMPERSONATION_INVALID', 'La sesión de actuación no es válida.')
  const claimedExpiry = new Date(claims.expiresAt)
  if (!Number.isFinite(claimedExpiry.getTime()) || claimedExpiry.getTime() <= now.getTime()) {
    await appendBestEffortImpersonationEnd(claims.sessionId, 'EXPIRED')
    fail(401, 'IMPERSONATION_EXPIRED', 'La sesión de actuación ha caducado.')
  }
  try {
    const [ledgerRows, actorRow, targetRow] = await Promise.all([
      prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT s.id::text,s.actor_id,s.target_id,s.expires_at,s.source_session_hash,s.reason,e.id::text AS end_id
          FROM impersonation_sessions s
          LEFT JOIN impersonation_session_ends e ON e.session_id=s.id
         WHERE s.id=${claims.sessionId}::uuid LIMIT 1
      `),
      readAdmin(positiveId(claims.actorId)), readAdmin(positiveId(claims.targetId)),
    ])
    const ledger = ledgerRows[0]
    const ledgerExpiry = ledger?.expires_at instanceof Date ? ledger.expires_at : new Date(0)
    const sourceMatches = !!ledger
      && ledger.actor_id === positiveId(claims.actorId)
      && ledger.target_id === positiveId(claims.targetId)
      && ledger.source_session_hash === claims.sourceSessionHash
      && effectiveSourceSessionHash(token) === claims.sourceSessionHash
    const decision = evaluateLiveImpersonation({
      sessionFound: !!ledger, closed: !!ledger?.end_id, expiresAt: ledgerExpiry, now,
      actor: adminFromIdentity(actorRow.effective, actorRow.active), target: adminFromIdentity(targetRow.effective, targetRow.active),
      sourceSessionMatches: sourceMatches, runtimeEnabled: true,
    })
    if (decision.ok === false) {
      if (decision.code === 'SESSION_EXPIRED') await appendBestEffortImpersonationEnd(claims.sessionId, 'EXPIRED')
      if (decision.code === 'ACTOR_REVOKED' || decision.code === 'TARGET_REVOKED' || decision.code === 'TARGET_SUPER_ADMIN') await appendBestEffortImpersonationEnd(claims.sessionId, 'REVOKED')
      fail(401, `IMPERSONATION_${decision.code}`, 'La sesión de actuación ya no está autorizada.')
    }
    const actor = actorRow.effective!
    const target = targetRow.effective!
    return {
      actor, target, reason: typeof ledger.reason === 'string' ? ledger.reason : null,
      active: { sessionId: claims.sessionId, actorName: actor.name, targetName: target.name, targetId: String(target.id), expiresAt: ledgerExpiry.toISOString() },
    }
  } catch (error) {
    if (error instanceof ImpersonationError) throw error
    if (isMissingTable(error)) fail(503, 'IMPERSONATION_MIGRATION_PENDING', 'La sesión de actuación no se puede verificar.')
    fail(503, 'IMPERSONATION_VERIFY_FAILED', 'No se pudo verificar la sesión de actuación.')
  }
}

/**
 * A closed effective JWE has no route authority. This narrow read verifies that
 * its encrypted source proof may perform exactly one explicit restoration after
 * an expiry/revocation; it never returns an effective identity.
 */
export async function resolveRestorableImpersonation(token: JWT): Promise<{ active: ActiveImpersonation; endReason: 'EXPIRED' | 'REVOKED' }> {
  await assertImpersonationStaging()
  const claims = readImpersonationClaims(token)
  if (!claims) fail(401, 'IMPERSONATION_NOT_ACTIVE', 'No hay una actuación recuperable.')
  const actorId = positiveId(claims.actorId)
  const targetId = positiveId(claims.targetId)
  const source = originalClaims(token)
  const sourceHash = sourceSessionHash(source)
  if (sourceHash !== claims.sourceSessionHash || positiveId(source.id) !== actorId) {
    fail(401, 'SOURCE_SESSION_INVALID', 'La sesión original no se puede restaurar.')
  }
  try {
    const [rows, actor] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string; actor_id: number; target_id: number; source_session_hash: string; expires_at: Date; end_reason: string | null }>>(Prisma.sql`
        SELECT s.id::text,s.actor_id,s.target_id,s.source_session_hash,s.expires_at,e.end_reason
          FROM impersonation_sessions s
          JOIN impersonation_session_ends e ON e.session_id=s.id
         WHERE s.id=${claims.sessionId}::uuid
         LIMIT 1
      `),
      readAdmin(actorId),
    ])
    const row = rows[0]
    if (!row || row.actor_id !== actorId || row.target_id !== targetId || row.source_session_hash !== claims.sourceSessionHash) {
      fail(401, 'IMPERSONATION_NOT_RESTORABLE', 'La sesión de actuación no se puede restaurar.')
    }
    if (row.end_reason === 'SIGN_OUT' || row.end_reason === 'LOGIN') {
      fail(401, 'SOURCE_REAUTH_REQUIRED', 'La sesión fue reemplazada; inicia sesión de nuevo.')
    }
    if (!isRecoverableTerminalReason(row.end_reason)) fail(401, 'IMPERSONATION_NOT_RESTORABLE', 'La sesión de actuación no se puede restaurar.')
    if (!actor.effective || !actor.active || actor.effective.role !== 'SUPER_ADMIN') {
      fail(401, 'SOURCE_SESSION_REVOKED', 'La sesión original ya no está autorizada.')
    }
    return {
      active: activeFromClaims(claims),
      endReason: row.end_reason,
    }
  } catch (error) {
    if (error instanceof ImpersonationError) throw error
    if (isMissingTable(error)) fail(503, 'IMPERSONATION_MIGRATION_PENDING', 'La recuperación de actuación aún no está preparada.')
    fail(503, 'IMPERSONATION_RESTORE_VERIFY_FAILED', 'No se pudo verificar la recuperación de actuación.')
  }
}

/** Build session identity from freshly read target row; JWT roles are never authority. */
export async function buildEffectiveImpersonationToken(sourceToken: JWT, live: LiveImpersonation): Promise<JWT> {
  const claims = readImpersonationClaims(sourceToken)
  if (!claims) fail(401, 'IMPERSONATION_INVALID', 'La sesión de actuación no es válida.')
  return {
    id: String(live.target.id), sub: String(live.target.id), email: live.target.email, name: live.target.name,
    role: live.target.role, roles: live.target.roles, userType: 'admin',
    impersonation: { ...claims, actorName: live.actor.name, targetName: live.target.name, expiresAt: live.active.expiresAt },
    original: originalClaims(sourceToken),
  }
}

export async function issueEffectiveSessionCookieToken(token: JWT): Promise<string> {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) fail(503, 'IMPERSONATION_SECRET_MISSING', 'No se pudo proteger la sesión de actuación.')
  // Keep the encrypted original proof until the real source session expires.
  // Only the immutable ledger/claims bound acting to 60 minutes; a cookie that
  // vanished at minute 60 would make a safe explicit restoration impossible.
  const encoded = await encodeNextAuthSession({ token, secret, maxAge: sourceSessionMaxAge(token) })
  // SessionStore starts chunking around 4 KiB. A durable original proof should
  // always fit one cookie; otherwise reject rather than create mixed chunks.
  if (encoded.length > 3600) fail(503, 'IMPERSONATION_COOKIE_TOO_LARGE', 'La sesión de actuación no cabe de forma segura en una cookie.')
  return encoded
}

/**
 * Auth.js normally refreshes a JWT session expiry whenever /api/auth/session
 * runs. Acting claims are bounded by the immutable ledger expiry, while the
 * JWE itself remains valid only up to the original real-session expiry so it
 * can carry the encrypted restoration proof after acting has expired.
 */
export async function encodeNextAuthSession(input: { token?: JWT; secret: string | Buffer; maxAge?: number }): Promise<string> {
  const claims = readImpersonationClaims(input.token)
  if (!claims) return encode(input)
  const remaining = sourceSessionMaxAge(input.token!)
  if (!Number.isSafeInteger(remaining) || remaining <= 0) throw new Error('IMPERSONATION_EXPIRED')
  return encode({ ...input, maxAge: Math.min(input.maxAge ?? 30 * 24 * 60 * 60, remaining) })
}

/** Restore without lengthening the source session beyond its original JWE expiry. */
export async function issueRestoredSessionCookieToken(token: JWT): Promise<string> {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) fail(503, 'IMPERSONATION_SECRET_MISSING', 'No se pudo restaurar la sesión.')
  return encodeNextAuthSession({ token, secret, maxAge: sourceSessionMaxAge(token) })
}

/** Never extend either an effective JWE or restored JWE beyond its real source session. */
export function sourceSessionMaxAge(token: JWT): number {
  const source = originalClaims(token)
  const remaining = Math.floor(Number(source.sourceExpiresAt) - Date.now() / 1000)
  if (!Number.isSafeInteger(remaining) || remaining <= 0) fail(401, 'SOURCE_SESSION_EXPIRED', 'La sesión original ha caducado.')
  return Math.min(remaining, 30 * 24 * 60 * 60)
}

function startDeniedCode(error: unknown): string | null {
  if (!(error instanceof ImpersonationError)) return null
  return ['ACTOR_INVALID', 'ACTOR_NOT_SUPER_ADMIN', 'TARGET_INVALID', 'TARGET_SELF', 'TARGET_SUPER_ADMIN', 'NESTED_IMPERSONATION', 'IDEMPOTENCY_CONFLICT'].includes(error.code) ? error.code : null
}

/** Atomic durable start ledger plus success event. The pre-grant attempt is a separate immutable audit. */
export async function startImpersonation(input: Readonly<{ sourceToken: JWT; targetId: number; reason?: unknown; idempotencyKey: string; ip?: string | null }>): Promise<{ token: JWT; active: ActiveImpersonation; replayed: boolean }> {
  await assertImpersonationStaging()
  const actorId = positiveId(input.sourceToken.id)
  const reason = normalizedReason(input.reason)
  if (input.reason !== undefined && input.reason !== null && input.reason !== '' && !reason) fail(400, 'REASON_INVALID', 'El motivo debe tener entre 1 y 500 caracteres.')
  if (readImpersonationClaims(input.sourceToken)) {
    // This pre-grant denial must also accept an arbitrary client target id;
    // successful transition events below retain both FK-backed identities.
    await appendImpersonationAudit({ sessionId: null, actorId: null, targetId: null, kind: 'START', outcome: 'DENIED', method: 'POST', path: '/api/admin/actuar-como', ip: input.ip, reason, detail: { code: 'NESTED_IMPERSONATION' } })
    fail(409, 'NESTED_IMPERSONATION', 'No se puede iniciar una actuación desde otra actuación.')
  }
  // Enroll legacy JWE tokens once as they first enter an acting envelope. New
  // real logins already carry this claim from auth.ts.
  const originalSource = sourceClaims(input.sourceToken, true)
  const sourceHash = sourceSessionHash(originalSource)
  // Neither identity has been admitted under transaction yet. Leaving these
  // nullable avoids a forged/nonexistent id turning a security denial into an
  // FK error; the atomic START/SUCCESS event below contains both real ids.
  await appendImpersonationAudit({ sessionId: null, actorId: null, targetId: null, kind: 'START', outcome: 'ATTEMPT', method: 'POST', path: '/api/admin/actuar-como', ip: input.ip, reason })
  const now = new Date()
  const expiresAt = new Date(now.getTime() + IMPERSONATION_MAX_SECONDS * 1000)
  try {
    const result = await prisma.$transaction(async tx => {
      // Serialize every start from the real source session before inspecting a
      // replay or another active ledger. The migration trigger repeats this
      // lock as a database backstop for non-application writers.
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${`impersonation:${sourceHash}`}, 0))::text AS locked
      `)
      const replayRows = await tx.$queryRaw<Array<any>>(Prisma.sql`
        SELECT s.id::text,s.actor_id,s.target_id,s.expires_at,s.source_session_hash,e.id::text AS end_id
          FROM impersonation_sessions s LEFT JOIN impersonation_session_ends e ON e.session_id=s.id
         WHERE s.source_session_hash=${sourceHash} AND s.idempotency_key=${input.idempotencyKey}
         LIMIT 1 FOR UPDATE OF s
      `)
      const replay = replayRows[0]
      if (replay && replay.target_id !== input.targetId) {
        fail(409, 'IDEMPOTENCY_CONFLICT', 'La clave de idempotencia ya pertenece a otra actuación.')
      }
      const [actor, target] = await Promise.all([
        tx.usuarioAdmin.findUnique({ where: { id: actorId }, select: { id: true, email: true, nombre: true, rol: true, roles: true, activo: true } }),
        tx.usuarioAdmin.findUnique({ where: { id: input.targetId }, select: { id: true, email: true, nombre: true, rol: true, roles: true, activo: true } }),
      ])
      const decision = canStartImpersonation(
        { id: actorId, activo: actor?.activo === true, rol: actor?.rol ?? '', roles: actor?.roles ?? [] },
        { id: input.targetId, activo: target?.activo === true, rol: target?.rol ?? '', roles: target?.roles ?? [] }, false,
      )
      if (decision.ok === false) fail(403, decision.code, 'No está autorizado para iniciar la actuación.')
      if (replay) {
        const replayExpiryMs = new Date(replay.expires_at).getTime()
        if (replay.end_id || !Number.isFinite(replayExpiryMs) || replayExpiryMs <= now.getTime()) {
          fail(409, 'IDEMPOTENCY_CONFLICT', 'La clave de idempotencia ya pertenece a otra actuación.')
        }
        return { sessionId: String(replay.id), actor: identityFromRow(actor)!, target: identityFromRow(target)!, expiresAt: new Date(replay.expires_at), replayed: true }
      }
      const activeRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT s.id::text
          FROM impersonation_sessions s
         WHERE s.source_session_hash=${sourceHash}
           AND s.expires_at>CURRENT_TIMESTAMP
           AND NOT EXISTS (SELECT 1 FROM impersonation_session_ends e WHERE e.session_id=s.id)
         LIMIT 1 FOR UPDATE OF s
      `)
      if (activeRows.length) fail(409, 'IMPERSONATION_ALREADY_ACTIVE', 'La sesión de origen ya tiene una actuación activa.')
      const sessionId = randomUUID()
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO impersonation_sessions(id,actor_id,target_id,source_session_hash,idempotency_key,reason,started_at,expires_at)
        VALUES(${sessionId}::uuid,${actorId},${input.targetId},${sourceHash},${input.idempotencyKey},${reason},CURRENT_TIMESTAMP,${expiresAt})
      `)
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO impersonation_event_log(id,session_id,actor_id,target_id,kind,outcome,method,path,ip,reason,detail,created_at)
        VALUES(gen_random_uuid(),${sessionId}::uuid,${actorId},${input.targetId},'START','SUCCESS','POST','/api/admin/actuar-como',${boundedIp(input.ip)},${reason},'{}'::jsonb,CURRENT_TIMESTAMP)
      `)
      return { sessionId, actor: identityFromRow(actor)!, target: identityFromRow(target)!, expiresAt, replayed: false }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 })
    if (result.replayed) await appendImpersonationAudit({ sessionId: result.sessionId, actorId, targetId: input.targetId, kind: 'START_REPLAY', outcome: 'SUCCESS', method: 'POST', path: '/api/admin/actuar-como', ip: input.ip, reason })
    const claims: ImpersonationClaims = {
      v: IMPERSONATION_CONTEXT_VERSION, sessionId: result.sessionId, actorId: String(result.actor.id), actorName: result.actor.name,
      targetId: String(result.target.id), targetName: result.target.name, expiresAt: result.expiresAt.toISOString(), sourceSessionHash: sourceHash,
    }
    const token: JWT = {
      id: String(result.target.id), sub: String(result.target.id), email: result.target.email, name: result.target.name,
      role: result.target.role, roles: result.target.roles, userType: 'admin', impersonation: claims, original: originalSource,
    }
    return { token, active: activeFromClaims(claims), replayed: result.replayed }
  } catch (error) {
    const code = startDeniedCode(error)
    if (code) await appendImpersonationAudit({ sessionId: null, actorId: null, targetId: null, kind: 'START', outcome: 'DENIED', method: 'POST', path: '/api/admin/actuar-como', ip: input.ip, reason, detail: { code } }).catch(() => undefined)
    if (error instanceof ImpersonationError) throw error
    if (isMissingTable(error)) fail(503, 'IMPERSONATION_MIGRATION_PENDING', 'La auditoría de actuación aún no está preparada.')
    fail(503, 'IMPERSONATION_START_FAILED', 'No se pudo iniciar la actuación.')
  }
}

/** Pure guard for the lost-start-response replay; all values are ledger-bound. */
export function exactEffectiveStartReplay(
  claimsTargetId: number,
  submittedTargetId: number,
  ledgerTargetId: number,
  ledgerIdempotencyKey: string,
  submittedIdempotencyKey: string,
): boolean {
  return claimsTargetId === submittedTargetId
    && ledgerTargetId === submittedTargetId
    && ledgerIdempotencyKey === submittedIdempotencyKey
}

/**
 * Handles the narrow lost-response case where the browser did install the
 * effective cookie but the original start response was not consumed. It cannot
 * start, extend, or switch an acting session: both the ledger idempotency key
 * and target must be exactly those embedded in the encrypted claims.
 */
export async function replayEffectiveImpersonationStart(
  token: JWT,
  targetId: number,
  idempotencyKey: string,
  ip?: string | null,
): Promise<{ token: JWT; active: ActiveImpersonation; replayed: true }> {
  await assertImpersonationStaging()
  const claims = readImpersonationClaims(token)
  if (!claims) fail(401, 'IMPERSONATION_NOT_ACTIVE', 'No hay una actuación activa.')
  const claimsTargetId = positiveId(claims.targetId)
  if (claimsTargetId !== targetId) {
    fail(409, 'IDEMPOTENCY_CONFLICT', 'La clave de idempotencia no pertenece al destino solicitado.')
  }
  if (effectiveSourceSessionHash(token) !== claims.sourceSessionHash) {
    fail(401, 'IMPERSONATION_INVALID', 'La sesión de actuación no es válida.')
  }
  const live = await resolveLiveImpersonation(token)
  try {
    const replayed = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string; target_id: number; idempotency_key: string }>>(Prisma.sql`
        SELECT s.id::text,s.target_id,s.idempotency_key
          FROM impersonation_sessions s
         WHERE s.id=${claims.sessionId}::uuid
           AND s.source_session_hash=${claims.sourceSessionHash}
         LIMIT 1 FOR SHARE OF s
      `)
      const row = rows[0]
      if (!row || !exactEffectiveStartReplay(claimsTargetId, targetId, Number(row.target_id), String(row.idempotency_key), idempotencyKey)) {
        fail(409, 'IDEMPOTENCY_CONFLICT', 'La clave de idempotencia no pertenece a esta actuación.')
      }
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO impersonation_event_log(id,session_id,actor_id,target_id,kind,outcome,method,path,ip,detail,created_at)
        VALUES(gen_random_uuid(),${claims.sessionId}::uuid,${live.actor.id},${live.target.id},'START_REPLAY','SUCCESS',
               'POST','/api/admin/actuar-como',${boundedIp(ip)},'{}'::jsonb,CURRENT_TIMESTAMP)
      `)
      return true as const
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 })
    if (!replayed) fail(503, 'IMPERSONATION_START_FAILED', 'No se pudo recuperar la actuación.')
    return { token: await buildEffectiveImpersonationToken(token, live), active: live.active, replayed: true }
  } catch (error) {
    if (error instanceof ImpersonationError) throw error
    if (isMissingTable(error)) fail(503, 'IMPERSONATION_MIGRATION_PENDING', 'La auditoría de actuación aún no está preparada.')
    fail(503, 'IMPERSONATION_START_FAILED', 'No se pudo recuperar la actuación.')
  }
}

/**
 * Explicit exit is allowed even after expiry/revocation, but source restoration
 * remains live-verified. Its immutable end, success event, and command receipt
 * commit together so a lost response has a precise recovery record.
 */
export async function exitImpersonation(
  token: JWT,
  idempotencyKey: string,
  ip?: string | null,
): Promise<{ token: JWT; replayed: boolean }> {
  await assertImpersonationStaging()
  const claims = readImpersonationClaims(token)
  if (!claims) fail(401, 'IMPERSONATION_NOT_ACTIVE', 'No hay una actuación activa.')
  const actorId = positiveId(claims.actorId)
  const targetId = positiveId(claims.targetId)
  let sourceHash: string
  try { sourceHash = effectiveSourceSessionHash(token) } catch { fail(401, 'SOURCE_SESSION_INVALID', 'La sesión original no se puede restaurar.') }
  // Pre-rollout envelopes lack ioActuationSourceId. Preserve their signed
  // original jti in the restored JWE so the next encoder rotation cannot break
  // source hash/CSRF or the lost-response receipt lookup.
  const source = sourceClaims(originalClaims(token), true)
  const keyHash = recoveryExitKeyHash(idempotencyKey)
  await appendImpersonationAudit({ sessionId: claims.sessionId, actorId, targetId, kind: 'EXIT', outcome: 'ATTEMPT', method: 'POST', path: '/api/admin/actuar-como', ip })
  try {
    const replayed = await prisma.$transaction(async tx => {
      // Receipt absence cannot be row-locked. Serialize the actor/key pair
      // before its first read so concurrent same-key clicks observe either the
      // exact completed receipt or perform the single terminal transition.
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${`impersonation-exit:${actorId}:${idempotencyKey}`}, 0))::text AS locked
      `)
      const receipt = await readExitReceiptTx(tx, actorId, idempotencyKey)
      if (receipt) {
        if (receipt.payloadHash !== exitCommandPayloadHash() || receipt.sessionId !== claims.sessionId || receipt.redirectTo !== EXIT_REDIRECT_TO) {
          fail(409, 'IDEMPOTENCY_CONFLICT', 'La clave de idempotencia ya pertenece a otra salida.')
        }
        await assertLiveRestorationActorTx(tx, source, actorId)
        return true
      }
      const recoveryForKey = await readRecoveryExitReceiptForActorKeyTx(tx, actorId, keyHash)
      if (recoveryForKey) {
        if (recoveryForKey.sessionId !== claims.sessionId || !isRecoverableTerminalReason(recoveryForKey.endReason)) {
          fail(409, 'IDEMPOTENCY_CONFLICT', 'La clave de idempotencia ya pertenece a otra salida.')
        }
        await assertLiveRestorationActorTx(tx, source, actorId)
        return true
      }
      const ledger = await tx.$queryRaw<Array<any>>(Prisma.sql`
        SELECT s.id::text,s.actor_id,s.target_id,s.source_session_hash,e.id::text AS end_id,e.end_reason
          FROM impersonation_sessions s LEFT JOIN impersonation_session_ends e ON e.session_id=s.id
         WHERE s.id=${claims.sessionId}::uuid LIMIT 1 FOR UPDATE OF s
      `)
      const row = ledger[0]
      if (!row || row.actor_id !== actorId || row.target_id !== targetId || row.source_session_hash !== claims.sourceSessionHash || sourceHash !== claims.sourceSessionHash) {
        fail(401, 'IMPERSONATION_INVALID', 'La sesión de actuación no es válida.')
      }
      // Login/sign-out replace or clear the browser session by design. They are
      // never a restoration path, even if the actor was revoked afterwards.
      if (row.end_id && (row.end_reason === 'SIGN_OUT' || row.end_reason === 'LOGIN')) {
        fail(401, 'SOURCE_REAUTH_REQUIRED', 'La sesión fue reemplazada; inicia sesión de nuevo.')
      }
      await assertLiveRestorationActorTx(tx, source, actorId)
      if (row.end_id) {
        const existingRecovery = await readRecoveryExitReceiptForSessionTx(tx, claims.sessionId)
        const decision = recoveryExitDecision(row.end_reason, existingRecovery?.keyHash, keyHash)
        if (decision === 'REPLAY') return true
        if (decision === 'CONFLICT') fail(409, 'IDEMPOTENCY_CONFLICT', 'La sesión ya fue restaurada con otra clave de idempotencia.')
        if (decision === 'REAUTH_REQUIRED') fail(401, 'SOURCE_REAUTH_REQUIRED', 'La sesión fue reemplazada; inicia sesión de nuevo.')
        if (decision !== 'CREATE' || !isRecoverableTerminalReason(row.end_reason)) {
          fail(409, 'EXIT_RECEIPT_REQUIRED', 'La salida no tiene un recibo recuperable.')
        }
        await appendRecoveryExitReceiptTx(tx, {
          sessionId: claims.sessionId, actorId, targetId, endReason: row.end_reason, keyHash, ip,
        })
        return false
      }
      // The terminal end and its immutable SUCCESS event commit together. If
      // either fails, this function throws and the control route cannot report
      // an exit that did not durably revoke the effective ledger session.
      const ended = await appendImpersonationEndTx(tx, claims.sessionId, 'EXITED', actorId)
      if (!ended) fail(409, 'EXIT_RECEIPT_REQUIRED', 'La salida no tiene un recibo recuperable.')
      await appendExitReceiptTx(tx, claims.sessionId, actorId, idempotencyKey)
      return false
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 20_000 })
    return { token: rotateRestoredSourceCsrfEpoch(source), replayed }
  } catch (error) {
    if (error instanceof ImpersonationError) {
      await appendImpersonationAudit({ sessionId: claims.sessionId, actorId, targetId, kind: 'EXIT', outcome: 'FAILED', method: 'POST', path: '/api/admin/actuar-como', ip, detail: { code: error.code } }).catch(() => undefined)
      throw error
    }
    if (isMissingTable(error)) fail(503, 'IMPERSONATION_MIGRATION_PENDING', 'La auditoría de actuación aún no está preparada.')
    fail(503, 'IMPERSONATION_EXIT_FAILED', 'No se pudo restaurar la sesión original.')
  }
}

/**
 * The browser may already have installed the restored JWE when an exit response
 * is lost. This path changes no cookie or ledger state; it only proves that the
 * exact `(source session, actor, idempotency key, canonical payload)` completed.
 */
export async function replayRestoredImpersonationExit(token: JWT, idempotencyKey: string): Promise<{ replayed: true }> {
  await assertImpersonationStaging()
  if (readImpersonationClaims(token)) fail(409, 'IMPERSONATION_STILL_ACTIVE', 'La salida debe verificarse con la sesión restaurada.')
  const source = originalClaims(token)
  const actorId = positiveId(source.id)
  const sourceHash = sourceSessionHash(source)
  const keyHash = recoveryExitKeyHash(idempotencyKey)
  const actor = await readAdmin(actorId)
  if (!actor.effective || !actor.active || actor.effective.role !== 'SUPER_ADMIN') {
    fail(401, 'SOURCE_SESSION_REVOKED', 'La sesión original ya no está autorizada.')
  }
  try {
    const rows = await prisma.$queryRaw<Array<{ found: number }>>(Prisma.sql`
      SELECT 1 AS found
        FROM impersonation_control_command_receipts r
        JOIN impersonation_sessions s ON s.id=r.session_id
        JOIN impersonation_session_ends e ON e.session_id=s.id
       WHERE r.command=${EXIT_COMMAND}
         AND r.actor_id=${actorId}
         AND r.idempotency_key=${idempotencyKey}
         AND r.payload_hash=${exitCommandPayloadHash()}
         AND r.redirect_to=${EXIT_REDIRECT_TO}
         AND s.actor_id=${actorId}
         AND s.source_session_hash=${sourceHash}
         AND e.end_reason='EXITED'
      UNION ALL
      SELECT 1 AS found
        FROM impersonation_event_log r
        JOIN impersonation_sessions s ON s.id=r.session_id
        JOIN impersonation_session_ends e ON e.session_id=s.id
       WHERE r.kind='EXIT'
         AND r.outcome='SUCCESS'
         AND r.actor_id=${actorId}
         AND r.detail @> '{"command":"EXIT","recovery":true}'::jsonb
         AND r.detail->>'keyHash'=${keyHash}
         AND r.detail->>'endReason'=e.end_reason
         AND s.actor_id=${actorId}
         AND s.source_session_hash=${sourceHash}
         AND e.end_reason IN ('EXPIRED','REVOKED')
       LIMIT 1
    `)
    if (rows.length !== 1) {
      fail(409, 'EXIT_RECEIPT_NOT_FOUND', 'No existe una salida recuperable para esa clave de idempotencia.')
    }
    return { replayed: true }
  } catch (error) {
    if (error instanceof ImpersonationError) throw error
    if (isMissingTable(error)) fail(503, 'IMPERSONATION_MIGRATION_PENDING', 'La recuperación de salida aún no está preparada.')
    fail(503, 'IMPERSONATION_EXIT_REPLAY_FAILED', 'No se pudo verificar la recuperación de salida.')
  }
}

export async function terminateImpersonationToken(token: JWT | null | undefined, reason: 'SIGN_OUT' | 'LOGIN'): Promise<void> {
  const claims = readImpersonationClaims(token)
  if (!claims) return
  // Sign-out/login replace or clear the browser cookie even if the ledger is
  // temporarily unavailable. Unlike explicit exit, this never reports a
  // successful restoration and the old effective token remains denied.
  await appendBestEffortImpersonationEnd(claims.sessionId, reason, positiveId(claims.actorId))
}

/** Live control-plane authorization; the role embedded in JWT is never enough. */
export async function requireLiveSuperAdmin(token: JWT | null | undefined): Promise<EffectiveAdminIdentity> {
  if (!token || token.userType !== 'admin' || readImpersonationClaims(token)) {
    fail(403, 'SUPER_ADMIN_REQUIRED', 'Sólo un SUPER_ADMIN vigente puede usar este control.')
  }
  const current = await readAdmin(positiveId(token.id))
  if (!current.effective || !current.active || current.effective.role !== 'SUPER_ADMIN') {
    fail(403, 'SUPER_ADMIN_REQUIRED', 'Sólo un SUPER_ADMIN vigente puede usar este control.')
  }
  return current.effective
}

export async function listImpersonationTargets(limit = 50, offset = 0): Promise<Array<{ id: number; nombre: string; rol: string }>> {
  await assertImpersonationStaging()
  const take = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50
  const skip = Number.isSafeInteger(offset) ? Math.min(Math.max(offset, 0), 10_000) : 0
  return prisma.usuarioAdmin.findMany({
    where: { activo: true, rol: { not: 'SUPER_ADMIN' }, NOT: { roles: { has: 'SUPER_ADMIN' } } },
    orderBy: [{ nombre: 'asc' }, { id: 'asc' }], take, skip, select: { id: true, nombre: true, rol: true },
  })
}

export async function readImpersonationLog(limit = 25, offset = 0): Promise<{ events: Array<Record<string, unknown>>; total: number }> {
  await assertImpersonationStaging()
  const take = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 25
  const skip = Number.isSafeInteger(offset) ? Math.min(Math.max(offset, 0), 10_000) : 0
  try {
    const [rows, totalRows] = await Promise.all([
      prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT e.id::text,e.created_at AS at,e.kind,e.outcome,e.method,e.path,e.ip,e.reason,
               COALESCE(a.nombre,'') AS actor_name,COALESCE(t.nombre,'') AS target_name
          FROM impersonation_event_log e
          LEFT JOIN usuarios_admin a ON a.id=e.actor_id LEFT JOIN usuarios_admin t ON t.id=e.target_id
         ORDER BY e.created_at DESC,e.id DESC LIMIT ${take} OFFSET ${skip}
      `),
      prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`SELECT COUNT(*) AS total FROM impersonation_event_log`),
    ])
    return {
      events: rows.map(row => ({
        id: String(row.id), at: new Date(row.at).toISOString(), kind: String(row.kind), outcome: String(row.outcome),
        actorName: String(row.actor_name), targetName: String(row.target_name), ip: row.ip ? String(row.ip) : null,
        ...(row.reason ? { reason: String(row.reason) } : {}), ...(row.method ? { method: String(row.method) } : {}), ...(row.path ? { path: String(row.path) } : {}),
      })), total: Number(totalRows[0]?.total ?? 0),
    }
  } catch (error) {
    if (isMissingTable(error)) fail(503, 'IMPERSONATION_MIGRATION_PENDING', 'El registro de actuación aún no está preparado.')
    throw error
  }
}

export function impersonationActionFromJson(raw: unknown): ImpersonationBodyAction {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const action = (raw as Record<string, unknown>).action
  return typeof action === 'string' && action.length <= 80 ? action : null
}

export function isActiveImpersonationToken(token: JWT | null | undefined): boolean { return readImpersonationClaims(token) !== null }
