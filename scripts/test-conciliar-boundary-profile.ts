#!/usr/bin/env npx tsx
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validateConciliarBoundaryProfile } from '../lib/finanzas/conciliar-boundary-profile'

const identity = { database_name: 'io_staging_finanzas', database_user: 'io_staging_finanzas' }
assert.equal(validateConciliarBoundaryProfile([{ ...identity, perfil: 'MODO_FACIL_ONLY' }]), true)
assert.equal(validateConciliarBoundaryProfile([{ ...identity, perfil: null }]), false)
assert.equal(validateConciliarBoundaryProfile([{ ...identity, perfil: 'COMPLETO' }]), false)
for (const rows of [[], [{ ...identity, database_name: 'railway', perfil: 'MODO_FACIL_ONLY' }], [{ ...identity, database_user: 'postgres', perfil: 'COMPLETO' }]]) {
  assert.throws(() => validateConciliarBoundaryProfile(rows), /STAGING_PROFILE_IDENTITY_REQUIRED/)
}
const middleware = fs.readFileSync('middleware.js', 'utf8')
assert.ok(middleware.includes("token?.impersonation === undefined || token?.impersonation === null"))
assert.ok(middleware.includes("request.headers.get(EXPECTED_IMPERSONATION_SESSION_HEADER) === null"))
assert.ok(middleware.includes("headers.delete(IMPERSONATION_HEADER)"))
assert.ok(middleware.includes("const compactProjectionProfile = process.env.FINANCE_STAGING_SANDBOX === '1'"))
assert.ok(middleware.includes(": await isEasyOnlyFinanceUser(userId)"))
const profile = fs.readFileSync('lib/finanzas/conciliar-boundary-profile.ts', 'utf8')
assert.ok(profile.includes('SELECT current_database() AS database_name,current_user AS database_user'))
assert.ok(profile.includes('ORDER BY version DESC LIMIT 1'))
assert.ok(profile.includes("}) !== 'staging'"))
assert.ok(!profile.includes('new Map(') && !profile.includes('cache('))
console.log('PASS: perfil vivo en una consulta; identidad y producción cerradas; claims/CSRF conservan flujo completo; sin caché de permisos ni BD en el test.')
