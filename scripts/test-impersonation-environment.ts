import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  impersonationActorListed,
  impersonationAllowedActorIds,
  impersonationEnabled,
  impersonationEnvironment,
} from '../lib/impersonation-policy'

// Synthetic credentials only: these URLs are never connected to.
const STAGING_URL = 'postgresql://io_staging_finanzas:x@db.invalid:5432/io_staging_finanzas'
const PRODUCTION_URL = 'postgresql://postgres:x@yamanote.proxy.rlwy.net:34880/railway'
const staging = { FINANCE_STAGING_SANDBOX: '1', VERCEL_ENV: 'preview', DATABASE_URL: STAGING_URL }
const production = { VERCEL_ENV: 'production', DATABASE_URL: PRODUCTION_URL }

test('el entorno sólo se reconoce con la identidad exacta de staging o de producción', () => {
  assert.equal(impersonationEnvironment(staging), 'staging')
  assert.equal(impersonationEnvironment(production), 'production')
  // Sandbox flag wins: a staging deployment never degrades to production.
  assert.equal(impersonationEnvironment({ ...staging, DATABASE_URL: PRODUCTION_URL }), null)
  assert.equal(impersonationEnvironment({ ...staging, VERCEL_ENV: 'production' }), null)
  assert.equal(impersonationEnvironment({ ...production, VERCEL_ENV: 'preview' }), null)
  assert.equal(impersonationEnvironment({ ...production, VERCEL_ENV: undefined }), null)
  assert.equal(impersonationEnvironment({ ...production, DATABASE_URL: 'postgresql://postgres:x@yamanote.proxy.rlwy.net:34881/railway' }), null)
  assert.equal(impersonationEnvironment({ ...production, DATABASE_URL: 'postgresql://postgres:x@otro.host:34880/railway' }), null)
  assert.equal(impersonationEnvironment({ ...production, DATABASE_URL: 'postgresql://lector:x@yamanote.proxy.rlwy.net:34880/railway' }), null)
  assert.equal(impersonationEnvironment({ ...production, DATABASE_URL: 'mysql://postgres:x@yamanote.proxy.rlwy.net:34880/railway' }), null)
  assert.equal(impersonationEnvironment({ ...production, DATABASE_URL: 'no es una url' }), null)
  assert.equal(impersonationEnvironment({}), null)
})

test('la lista de actores mal escrita nunca amplía el acceso', () => {
  assert.equal(impersonationAllowedActorIds({}), null)
  assert.equal(impersonationAllowedActorIds({ IMPERSONATION_ALLOWED_ACTOR_IDS: '  ' }), null)
  assert.deepEqual(impersonationAllowedActorIds({ IMPERSONATION_ALLOWED_ACTOR_IDS: '7' }), [7])
  assert.deepEqual(impersonationAllowedActorIds({ IMPERSONATION_ALLOWED_ACTOR_IDS: ' 7 , 9,7' }), [7, 9])
  for (const bad of ['7,', 'x', '0', '-7', '7;9', '1.5', '07', '1e3', '7,,9', '12345678901', Array(11).fill('1').join(',')]) {
    assert.deepEqual(impersonationAllowedActorIds({ IMPERSONATION_ALLOWED_ACTOR_IDS: bad }), [], bad)
  }
})

test('producción exige interruptor explícito y lista no vacía; staging conserva su comportamiento', () => {
  assert.equal(impersonationEnabled(staging), true)
  assert.equal(impersonationEnabled(production), false, 'sin interruptor')
  assert.equal(impersonationEnabled({ ...production, IMPERSONATION_PRODUCTION_ENABLED: '1' }), false, 'sin lista')
  assert.equal(impersonationEnabled({ ...production, IMPERSONATION_PRODUCTION_ENABLED: '1', IMPERSONATION_ALLOWED_ACTOR_IDS: 'x' }), false, 'lista inválida')
  assert.equal(impersonationEnabled({ ...production, IMPERSONATION_PRODUCTION_ENABLED: 'true', IMPERSONATION_ALLOWED_ACTOR_IDS: '7' }), false, 'valor distinto de 1')
  assert.equal(impersonationEnabled({ ...production, IMPERSONATION_PRODUCTION_ENABLED: '1', IMPERSONATION_ALLOWED_ACTOR_IDS: '7' }), true)
  assert.equal(impersonationEnabled({ VERCEL_ENV: 'preview', DATABASE_URL: PRODUCTION_URL, IMPERSONATION_PRODUCTION_ENABLED: '1', IMPERSONATION_ALLOWED_ACTOR_IDS: '7' }), false)
})

test('sólo los actores listados pueden actuar en producción', () => {
  const enabled = { ...production, IMPERSONATION_PRODUCTION_ENABLED: '1', IMPERSONATION_ALLOWED_ACTOR_IDS: '7' }
  assert.equal(impersonationActorListed(7, enabled), true)
  assert.equal(impersonationActorListed(8, enabled), false, 'otro superadmin')
  assert.equal(impersonationActorListed(7, production), false, 'producción sin lista')
  assert.equal(impersonationActorListed(0, enabled), false)
  assert.equal(impersonationActorListed(Number.NaN, enabled), false)
  // Staging without a list keeps every live SUPER_ADMIN; with a list it applies it.
  assert.equal(impersonationActorListed(8, staging), true)
  assert.equal(impersonationActorListed(8, { ...staging, IMPERSONATION_ALLOWED_ACTOR_IDS: '7' }), false)
  assert.equal(impersonationActorListed(7, { ...staging, IMPERSONATION_ALLOWED_ACTOR_IDS: '7' }), true)
  assert.equal(impersonationActorListed(7, {}), false)
})

test('la migración de producción es la de staging con identidad railway/postgres y preflight', () => {
  const stagingSql = readFileSync(new URL('../prisma/migrations/20261024_impersonation_ledger/migration.sql', import.meta.url), 'utf8')
  const productionSql = readFileSync(new URL('../prisma/production-releases/20261024_impersonation/20261024prodscope_impersonation_ledger.sql', import.meta.url), 'utf8')
  assert.doesNotMatch(productionSql, /io_staging_finanzas|IMPERSONATION_STAGING_ONLY|impersonation_staging_/)
  assert.match(productionSql, /current_setting\('io\.impersonation_production_ddl', true\) = '1'/)
  assert.equal((productionSql.match(/current_database\(\) <> 'railway' OR current_user <> 'postgres'/g) || []).length, 2)
  const normalise = (sql: string) => sql
    .replace(/^[\s\S]*?CREATE TABLE impersonation_sessions/, 'CREATE TABLE impersonation_sessions')
    .replaceAll('impersonation_production_append_only_guard', 'GUARD')
    .replaceAll('impersonation_staging_append_only_guard', 'GUARD')
    .replaceAll("current_database() <> 'railway' OR current_user <> 'postgres'", 'IDENTITY')
    .replaceAll("current_database() <> 'io_staging_finanzas' OR current_user <> 'io_staging_finanzas'", 'IDENTITY')
    .replaceAll('IMPERSONATION_PRODUCTION_ONLY', 'ONLY')
    .replaceAll('IMPERSONATION_STAGING_ONLY', 'ONLY')
  assert.equal(normalise(productionSql), normalise(stagingSql), 'tablas, restricciones, índices y triggers idénticos')
})

test('la cookie de sesión no usa SameSite=Strict (rompería el retorno del login de Microsoft)', () => {
  const auth = readFileSync(new URL('../lib/auth.ts', import.meta.url), 'utf8')
  assert.match(auth, /sessionToken:[\s\S]{0,200}sameSite: 'lax'/)
  const route = readFileSync(new URL('../app/api/admin/actuar-como/route.ts', import.meta.url), 'utf8')
  const sessionCookieCode = route.slice(route.indexOf('function clearSessionCookie'), route.indexOf('function jsonWithCsrf'))
  assert.doesNotMatch(sessionCookieCode, /sameSite: 'strict'/)
  // The CSRF control cookie stays Strict and __Host- scoped.
  const csrfCode = route.slice(route.indexOf('function jsonWithCsrf'), route.indexOf('function assertBrowserPostSecurity'))
  assert.match(csrfCode, /sameSite: 'strict'/)
})
