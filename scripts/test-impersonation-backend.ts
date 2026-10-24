import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import type { JWT } from 'next-auth/jwt'
import {
  impersonationRequestAllowed,
  isSensitiveImpersonationPath,
  evaluateLiveImpersonation,
} from '../lib/impersonation-policy'
import { rawSqlLooksMutating, impersonationPrismaMutation } from '../lib/prisma'
import { trustedRequestOrigin } from '../lib/impersonation-context'
import {
  assertImpersonationCsrf,
  exactEffectiveStartReplay,
  exitCommandPayloadHash,
  ImpersonationError,
  issueImpersonationCsrfToken,
  recoveryExitDecision,
  recoveryExitKeyHash,
  sourceSessionHash,
} from '../lib/impersonation'

const actor = { id: 1, activo: true, rol: 'SUPER_ADMIN', roles: [] }
const target = { id: 2, activo: true, rol: 'CONTABILIDAD', roles: [] }
const future = new Date(Date.now() + 60_000)

test('la matriz positiva permite sólo las lecturas revisadas y deniega superficies no revisadas', () => {
  assert.equal(impersonationRequestAllowed('/admin/clientes', 'GET'), false)
  assert.equal(impersonationRequestAllowed('/api/admin/clientes', 'GET'), false)
  assert.equal(impersonationRequestAllowed('/api/admin/finanzas/conciliacion-v2', 'GET'), true)
  // La lectura propia de permisos es una excepción estrecha de control.
  assert.equal(impersonationRequestAllowed('/api/admin/permisos', 'GET', new URLSearchParams('action=usuario&usuarioId=2'), 2), true)
  assert.equal(impersonationRequestAllowed('/api/admin/permisos', 'GET', new URLSearchParams('action=usuario&usuarioId=3'), 2), false)
})

test('sensibles, selectors legacy y mutaciones no revisadas quedan cerrados', () => {
  for (const path of [
    '/admin/usuarios', '/api/admin/usuarios', '/api/admin/permisos',
    '/api/admin/comunicados', '/api/admin/integraciones/outlook',
    '/api/admin/finanzas/sync-jobs', '/api/cron/finance-sync-worker',
  ]) assert.equal(isSensitiveImpersonationPath(path), true, path)
  assert.equal(impersonationRequestAllowed('/empleado', 'GET', new URLSearchParams('as=other@example.test')), false)
  assert.equal(impersonationRequestAllowed('/api/admin/finanzas/modo-facil', 'POST', new URLSearchParams(), 2, 'confirmar_factura'), true)
  assert.equal(impersonationRequestAllowed('/api/admin/finanzas/modo-facil', 'POST', new URLSearchParams(), 2, 'automatico'), false)
  assert.equal(impersonationRequestAllowed('/api/admin/clientes', 'PATCH'), false)
})

test('el chequeo puro de sesión no concede por rol embebido ni por objetivo superadmin', () => {
  assert.deepEqual(evaluateLiveImpersonation({
    sessionFound: true, closed: false, expiresAt: future, now: new Date(), actor, target,
    sourceSessionMatches: true, runtimeEnabled: true,
  }), { ok: true })
  assert.deepEqual(evaluateLiveImpersonation({
    sessionFound: true, closed: false, expiresAt: future, now: new Date(), actor,
    target: { ...target, roles: ['SUPER_ADMIN'] }, sourceSessionMatches: true, runtimeEnabled: true,
  }), { ok: false, code: 'TARGET_SUPER_ADMIN' })
})

test('sólo SQL de escritura se marca mutación; SELECT y locks no piden auditoría de write', () => {
  for (const sql of [
    'SELECT 1', ' /* comment */ SELECT id FROM table FOR UPDATE',
    'WITH x AS (SELECT 1) SELECT * FROM x', 'SELECT pg_advisory_xact_lock(1)',
  ]) assert.equal(rawSqlLooksMutating(sql), false, sql)
  for (const sql of [
    'INSERT INTO table VALUES (1)', 'UPDATE table SET x=1', 'DELETE FROM table',
    'WITH x AS (SELECT 1) INSERT INTO table SELECT * FROM x',
  ]) assert.equal(rawSqlLooksMutating(sql), true, sql)
  assert.equal(impersonationPrismaMutation('executeRaw', ['SELECT 1']), false)
  assert.equal(impersonationPrismaMutation('queryRaw', { strings: ['WITH x AS (SELECT 1) UPDATE t SET x=', ''] }), true)
  assert.equal(impersonationPrismaMutation('update', {}), true)
})

test('la IP sólo se toma del proxy Vercel con opt-in explícito', () => {
  const previous = { proxy: process.env.IMPERSONATION_TRUSTED_PROXY, vercel: process.env.VERCEL }
  try {
    process.env.IMPERSONATION_TRUSTED_PROXY = 'none'
    process.env.VERCEL = '1'
    assert.deepEqual(trustedRequestOrigin(new Headers({ 'x-vercel-id': 'iad1::x', 'x-vercel-forwarded-for': '198.51.100.9' })), { ip: null, source: 'untrusted_proxy' })
    process.env.IMPERSONATION_TRUSTED_PROXY = 'vercel'
    assert.deepEqual(trustedRequestOrigin(new Headers({ 'x-vercel-id': 'iad1::x', 'x-vercel-forwarded-for': '198.51.100.9' })), { ip: '198.51.100.9', source: 'vercel' })
    assert.deepEqual(trustedRequestOrigin(new Headers({ 'x-vercel-id': 'iad1::x', 'x-vercel-forwarded-for': 'not-an-ip' })), { ip: null, source: 'vercel_invalid' })
  } finally {
    if (previous.proxy === undefined) delete process.env.IMPERSONATION_TRUSTED_PROXY
    else process.env.IMPERSONATION_TRUSTED_PROXY = previous.proxy
    if (previous.vercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = previous.vercel
  }
})

function assertImpersonationCode(run: () => void, code: string): void {
  assert.throws(run, (error: unknown) => error instanceof ImpersonationError && error.code === code)
}

test('CSRF es double-submit HMAC, ligado a la sesión fuente y rota al cambiar a identidad efectiva', () => {
  const previous = process.env.NEXTAUTH_SECRET
  const now = Math.floor(Date.now() / 1000)
  process.env.NEXTAUTH_SECRET = 'c'.repeat(48)
  try {
    const source: JWT = {
      id: '101', sub: '101', jti: 'source-session-jti', email: 'actor@example.test', name: 'Actor', userType: 'admin', sourceExpiresAt: now + 3600,
    }
    const csrf = issueImpersonationCsrfToken(source, now)
    assert.match(csrf, /^v1\.[A-Za-z0-9_-]{32,128}\.\d{1,12}\.[A-Za-z0-9_-]{32,128}$/)
    assert.doesNotThrow(() => assertImpersonationCsrf(source, csrf, csrf, now + 1))
    assertImpersonationCode(() => assertImpersonationCsrf(source, csrf, `${csrf}x`, now + 1), 'CSRF_MISMATCH')
    assertImpersonationCode(() => assertImpersonationCsrf(source, csrf, csrf, now + 601), 'CSRF_EXPIRED')

    const effective: JWT = {
      id: '202', sub: '202', email: 'target@example.test', name: 'Target', userType: 'admin', original: source,
      impersonation: {
        v: 'v1', sessionId: '00000000-0000-4000-8000-000000000001', actorId: '101', actorName: 'Actor',
        targetId: '202', targetName: 'Target', expiresAt: new Date((now + 1800) * 1000).toISOString(), sourceSessionHash: sourceSessionHash(source),
      },
    }
    assertImpersonationCode(() => assertImpersonationCsrf(effective, csrf, csrf, now + 1), 'CSRF_SESSION_MISMATCH')
    const effectiveCsrf = issueImpersonationCsrfToken(effective, now)
    assert.doesNotThrow(() => assertImpersonationCsrf(effective, effectiveCsrf, effectiveCsrf, now + 1))
  } finally {
    if (previous === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = previous
  }
})

test('la identidad fuente estable conserva hash y CSRF cuando NextAuth rota jti', () => {
  const previous = process.env.NEXTAUTH_SECRET
  const now = Math.floor(Date.now() / 1000)
  process.env.NEXTAUTH_SECRET = 's'.repeat(48)
  try {
    const source: JWT = {
      id: '101', sub: '101', jti: 'jti-antes-de-encode', ioActuationSourceId: '11111111-1111-4111-8111-111111111111',
      email: 'actor@example.test', name: 'Actor', userType: 'admin', sourceExpiresAt: now + 3600,
    }
    const afterEncode: JWT = { ...source, jti: 'jti-rotado-por-nextauth' }
    const differentSource: JWT = { ...afterEncode, ioActuationSourceId: '22222222-2222-4222-8222-222222222222' }
    const csrf = issueImpersonationCsrfToken(source, now)

    assert.equal(sourceSessionHash(afterEncode), sourceSessionHash(source))
    assert.notEqual(sourceSessionHash(differentSource), sourceSessionHash(source))
    assert.doesNotThrow(() => assertImpersonationCsrf(afterEncode, csrf, csrf, now + 1))
  } finally {
    if (previous === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = previous
  }
})

test('la recuperación de EXPIRED o REVOKED es única y nunca restaura SIGN_OUT o LOGIN', () => {
  const firstKey = recoveryExitKeyHash('primera-clave-segura-0001')
  const otherKey = recoveryExitKeyHash('otra-clave-segura-0000002')

  assert.equal(recoveryExitDecision('EXPIRED', null, firstKey), 'CREATE')
  assert.equal(recoveryExitDecision('EXPIRED', firstKey, firstKey), 'REPLAY')
  assert.equal(recoveryExitDecision('EXPIRED', firstKey, otherKey), 'CONFLICT')
  assert.equal(recoveryExitDecision('REVOKED', null, firstKey), 'CREATE', 'TARGET_REVOKED termina como REVOKED')
  assert.equal(recoveryExitDecision('REVOKED', firstKey, firstKey), 'REPLAY')
  assert.equal(recoveryExitDecision('SIGN_OUT', null, firstKey), 'REAUTH_REQUIRED')
  assert.equal(recoveryExitDecision('LOGIN', null, firstKey), 'REAUTH_REQUIRED')
  assert.equal(recoveryExitDecision('EXITED', null, firstKey), 'NOT_RECOVERABLE')
})

test('el replay de inicio exige exactamente la clave y el destino embebidos en el ledger', () => {
  assert.equal(exactEffectiveStartReplay(202, 202, 202, 'inicio-idempotente-0001', 'inicio-idempotente-0001'), true)
  assert.equal(exactEffectiveStartReplay(202, 203, 202, 'inicio-idempotente-0001', 'inicio-idempotente-0001'), false, 'destino distinto')
  assert.equal(exactEffectiveStartReplay(202, 202, 202, 'inicio-idempotente-0001', 'inicio-otra-clave-00002'), false, 'clave distinta')
})

test('el DDL incluye recibo durable de EXIT, FK RESTRICT y guarda append-only sin roles globales', () => {
  const sql = readFileSync(new URL('../prisma/migrations/20261024_impersonation_ledger/migration.sql', import.meta.url), 'utf8')
  for (const fragment of [
    'CREATE TABLE impersonation_control_command_receipts',
    'CONSTRAINT impersonation_control_receipts_actor_key_uq UNIQUE (actor_id,idempotency_key)',
    'CONSTRAINT impersonation_sessions_actor_fk FOREIGN KEY (actor_id) REFERENCES usuarios_admin(id) ON DELETE RESTRICT',
    'CONSTRAINT impersonation_sessions_target_fk FOREIGN KEY (target_id) REFERENCES usuarios_admin(id) ON DELETE RESTRICT',
    'CONSTRAINT impersonation_session_ends_ended_by_fk FOREIGN KEY (ended_by_id) REFERENCES usuarios_admin(id) ON DELETE RESTRICT',
    'CONSTRAINT impersonation_event_actor_fk FOREIGN KEY (actor_id) REFERENCES usuarios_admin(id) ON DELETE RESTRICT',
    'CONSTRAINT impersonation_event_target_fk FOREIGN KEY (target_id) REFERENCES usuarios_admin(id) ON DELETE RESTRICT',
    'CONSTRAINT impersonation_control_receipts_session_fk FOREIGN KEY (session_id) REFERENCES impersonation_sessions(id) ON DELETE RESTRICT',
    'CREATE TRIGGER impersonation_control_receipts_append_only_tr',
    "RAISE EXCEPTION 'IMPERSONATION_EXIT_RECEIPT_INVALID'",
  ]) assert.ok(sql.includes(fragment), fragment)
  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER)\s+(?:ROLE|USER|DATABASE|CLUSTER)\b|\b(?:GRANT|REVOKE)\b/i)
  assert.equal(exitCommandPayloadHash(), 'c365b737507105e4e2fbd8400ea5aa21940c7440dccb5bce4b9d9e6c86c21b07')
})
