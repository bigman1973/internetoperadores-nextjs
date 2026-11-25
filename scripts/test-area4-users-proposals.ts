import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import {
  APPROVED_ROLES, ROLE_ENUM, USERS_SECTIONS, approvedCodePermissions, proposedRoleFor, protectedPersonReason,
} from '../lib/area4/approved-roles'
import { AREA4_DRAXTON_TECHNICAL_MENU, AREA4_SECTION_REGISTRY } from '../lib/area4/section-registry'
import { evaluateArea4Capability } from '../lib/area4/policy'
import {
  UsersProposalError, applyUsersProposal, buildUsersProposal, loadUsersSnapshot, normalizeUsersDrafts,
  parseUsersProposalCommand, permissionDifferences, readUsersProposalJson, snapshotFromUsersState,
  matchingAuditAssignment, usersApplyEnvironment, usersApplyOriginAllowed, usersProposalRevision,
  type UsersCurrentState,
} from '../lib/area4/users-proposals'
import type { UsersDraft } from '../lib/area4/users-contract'
import { OWNER_ID, TEST_ENV, createProposalStub, fixtureState, fixtureUser } from './area4-users-proposals-fixture'

const draft = (userId = 918): UsersDraft => ({ userId, role: 'empleado', extras: {}, active: true })
const fails = (code: string) => (error: unknown) => error instanceof UsersProposalError && error.code === code
const origin = 'https://staging.internetoperadores.com'
function applyInput(state: UsersCurrentState, drafts: UsersDraft[]) {
  return { actorId: OWNER_ID, ownerId: OWNER_ID, origin, confirmed: true,
    revision: usersProposalRevision(state, drafts, OWNER_ID), drafts }
}
// This simulates the reviewed future catalogue split, not a real migration or runtime bypass.
async function withSeparatedExpenses<T>(fn: () => Promise<T>): Promise<T> {
  const section = USERS_SECTIONS.find(s => s.key === 'gastos')!
  const prior = section.codes
  section.codes = ['empleado.mis_gastos']
  try { return await fn() } finally { section.codes = prior }
}

test('seis plantillas exactas, cuatro acciones y ocho hijos técnicos sin permiso padre amplio', () => {
  assert.equal(APPROVED_ROLES.length, 6)
  const manager = APPROVED_ROLES.find(r => r.key === 'gerente')!.permissions
  assert.equal(manager.presupuesto, 'VEX'); assert.equal(manager.personal, 'VX'); assert.equal(manager.nominas, 'VX')
  assert.equal(manager.gastos, 'VEC'); assert.equal(manager.finanzas, 'VX'); assert.equal(manager.historial, 'V')
  for (const key of ['rentabilidad', 'sistemas', 'usuarios-permisos', 'auditoria', 'actuar-como', 'configuracion']) assert.equal(manager[key], '')
  const map = approvedCodePermissions('draxton', {}, fixtureState().areas.map(a => a.codigo))
  const technical = AREA4_DRAXTON_TECHNICAL_MENU.map(item => AREA4_SECTION_REGISTRY.find(s => s.key === item.section)!.areaCode)
  assert.equal(technical.length, 8)
  for (const code of technical) assert.equal(map[code], 'VE')
  for (const code of ['admin', 'admin.clientes', 'admin.clientes.ggcc.draxton', 'admin.clientes.ggcc.draxton.contratos', 'admin.clientes.ggcc.draxton.finanzas', 'admin.clientes.ggcc.draxton.proyectos_singulares']) assert.equal(map[code], '')
  assert.equal(ROLE_ENUM.draxton, 'VISOR'); assert.equal(ROLE_ENUM.empleado, 'VISOR')
})
test('Dashboard V no hereda concesiones a códigos nuevos: ACL completa con denegaciones explícitas', () => {
  const state = fixtureState()
  const map = approvedCodePermissions('contabilidad', {}, state.areas.map(a => a.codigo))
  assert.deepEqual(Object.keys(map).sort(), state.areas.map(a => a.codigo).sort())
  assert.equal(map.admin, 'V'); assert.equal(map['admin.futuro_cerrado'], '')
  const grants = Object.entries(map).map(([codigo, letters]) => ({ codigo, lectura: letters.includes('V'), escritura: letters.includes('E'), confirmar: letters.includes('C'), exportar: letters.includes('X') }))
  assert.equal(evaluateArea4Capability({ principal: { id: 918, activo: true, rol: 'CONTABILIDAD', roles: ['CONTABILIDAD'] }, grants,
    codigoArea: 'admin.futuro_cerrado', capability: 'lectura', ownerId: OWNER_ID, permissionsAdopted: true }), false)
})
test('Lorena Clientes V incluye hijos, Personal VEC nunca obtiene salarios; bloquea incompatibilidad', () => {
  const state = fixtureState()
  const approved = proposedRoleFor({ id: 912, name: '  LÓRENA   GIMENO Martínez  ' }, state.users.map(u => ({ id: u.id, name: u.nombre })), OWNER_ID)!
  assert.equal(approved.role, 'contabilidad')
  const map = approvedCodePermissions(approved.role, approved.extras, state.areas.map(a => a.codigo))
  assert.equal(map['admin.clientes.ggcc.draxton.informes'], 'V')
  assert.equal(map['admin.empleados'], 'VEC')
  for (const code of ['admin.empleados.nominas', 'admin.gastos_nominas', 'admin.finanzas.nominas', 'admin.empleados.condiciones_salariales', 'admin.personal.empleados']) assert.equal(map[code], '')
  const proposal = buildUsersProposal(state, [{ userId: 912, ...approved, active: true }], OWNER_ID)
  assert.match(proposal.rows[0].blockedReason!, /Personal sin nóminas/)
})
test('coincidencias cerradas y unívocas, sin emails ni IDs demo; excluidos en cualquier estado', () => {
  const state = fixtureState()
  const people = state.users.map(u => ({ id: u.id, name: u.nombre }))
  assert.equal(proposedRoleFor({ id: 910, name: 'David Pérez' }, people, OWNER_ID)?.role, 'gerente')
  assert.equal(proposedRoleFor({ id: 910, name: 'David Pérez Otra Persona' }, people, OWNER_ID), null)
  assert.equal(proposedRoleFor({ id: 910, name: 'David Pérez' }, [...people, { id: 940, name: 'DAVID PEREZ' }], OWNER_ID), null)
  assert.equal(proposedRoleFor({ id: 918, name: 'Persona sin asignación' }, people, OWNER_ID), null)
  assert.ok(protectedPersonReason({ id: 916, name: 'IVÁN PÉREZ' }, OWNER_ID))
  assert.ok(protectedPersonReason({ id: 917, name: 'Tutorial Bot' }, OWNER_ID))
  assert.ok(protectedPersonReason({ id: OWNER_ID, name: 'No depende del nombre' }, OWNER_ID))
  const snapshot = snapshotFromUsersState(state, OWNER_ID, TEST_ENV)
  assert.equal(snapshot.proposal.drafts.length, 6)
  assert.ok(!snapshot.proposal.drafts.some(d => [OWNER_ID, 916, 917, 918].includes(d.userId)))
  assert.equal(snapshot.users.find(u => u.id === 918)!.role, 'empleado')
  assert.deepEqual(snapshot.users.find(u => u.id === 918)!.next, snapshot.users.find(u => u.id === 918)!.current)
  assert.equal(snapshot.users.find(u => u.id === 918)!.lastAccess, '2026-11-23T10:00:00.000Z')
})
test('JSON cerrado: sin current/next/differences del cliente, superacciones desconocidas, duplicados ni confirmación implícita', () => {
  assert.deepEqual(normalizeUsersDrafts([{ ...draft(), extras: { inicio: 'XV' } }])[0].extras, { inicio: 'VX' })
  for (const data of [
    [{ ...draft(), extras: { inicio: 'VV' } }], [{ ...draft(), extras: { inicio: 'DELETE' } }],
    [{ ...draft(), extras: { unknown: 'V' } }], [draft(), draft()], [{ ...draft(), userId: '918' }],
    [{ ...draft(), current: { admin: 'VECX' } }], [{ ...draft(), active: 'true' }], Array(1001).fill(draft()),
  ]) assert.throws(() => normalizeUsersDrafts(data), fails('INVALID_DRAFT'))
  assert.throws(() => parseUsersProposalCommand({ action: 'apply', drafts: [draft()], revision: 'a'.repeat(64) }), fails('INVALID_DRAFT'))
  assert.throws(() => parseUsersProposalCommand({ action: 'apply', confirmed: false, drafts: [draft()], revision: 'a'.repeat(64) }), fails('INVALID_DRAFT'))
  assert.throws(() => parseUsersProposalCommand({ action: 'preview', drafts: [draft()], differences: [] }), fails('INVALID_DRAFT'))
})
test('lectura segura: sin hashes/NIF, solo lectura y snapshot intención separado de catálogo pendiente', async () => {
  const stub = createProposalStub(fixtureState())
  const snapshot = await loadUsersSnapshot(stub.db, OWNER_ID)
  assert.equal(stub.stats.writes, 0); assert.equal(stub.audits().length, 0)
  assert.equal(stub.stats.isolation, 'RepeatableRead')
  assert.ok(!/passwordHash|password_hash|"nif"/.test(JSON.stringify(snapshot)))
  assert.equal(snapshot.users.find(u => u.id === 910)!.next.presupuesto, 'VEX')
  assert.equal(snapshot.users.find(u => u.id === 915)!.next.gastos, 'VE')
  assert.equal(snapshot.applyingAllowed, false)
})
test('revisión vincula roles secundarios, activo, perfil, adopción, todas las acciones, todas las cuentas/áreas y borradores', () => {
  const state = fixtureState(); const drafts = [draft()]
  const baseline = usersProposalRevision(state, drafts, OWNER_ID)
  const mutations: ((s: UsersCurrentState) => void)[] = [
    s => s.users[1].roles.push('RRHH-NEW'), s => s.users[1].activo = false, s => s.users[1].perfilAsignado = 'otro',
    s => s.users[1].permisosArea4Vivos = true, s => s.users[1].updatedAt = '2026-11-24T14:00:00.000Z',
    s => s.areas[0].activo = false, s => s.profiles[0].permisos = [{ lectura: true }],
    s => s.users[1].grants.push({ id: 'new', areaId: s.areas[0].id, codigo: s.areas[0].codigo, lectura: true, escritura: false, confirmar: true, exportar: true, createdAt: 'now', updatedAt: 'now' }),
  ]
  for (const mutate of mutations) { const changed = structuredClone(state); mutate(changed); assert.notEqual(usersProposalRevision(changed, drafts, OWNER_ID), baseline) }
  assert.notEqual(usersProposalRevision(state, [{ ...draft(), active: false }], OWNER_ID), baseline)
  assert.notEqual(usersProposalRevision(state, drafts, OWNER_ID + 1), baseline)
  const withGrant = structuredClone(state)
  withGrant.users[1].grants = [{ id: 'one', areaId: state.areas[0].id, codigo: state.areas[0].codigo, lectura: false, escritura: false, confirmar: false, exportar: false, createdAt: 'now', updatedAt: 'now' }]
  const before = usersProposalRevision(withGrant, drafts, OWNER_ID)
  for (const flag of ['lectura', 'escritura', 'confirmar', 'exportar'] as const) {
    const changed = structuredClone(withGrant); changed.users[1].grants[0] = { ...changed.users[1].grants[0], [flag]: true }
    assert.notEqual(usersProposalRevision(changed, drafts, OWNER_ID), before)
  }
})
test('diferencias por acción y por código sin ocultar pérdidas en grupos agregados', () => {
  assert.deepEqual(permissionDifferences({ 'admin.empleados': 'VECX' }, { 'admin.empleados': 'VEC' })[0].lost, 'X')
  const rows = buildUsersProposal(fixtureState(), [{ userId: 912, role: 'contabilidad', extras: { clientes: 'V', personal: 'VEC', imputaciones: 'VEC' }, active: true }], OWNER_ID).rows
  assert.ok(rows[0].differences.some(d => d.section === 'personal'))
  assert.ok(rows[0].differences.some(d => d.section.startsWith('admin.')))
})
test('staging aislado + flag explícito + HTTPS origen exacto; jamás localhost o producción', () => {
  assert.equal(usersApplyEnvironment(TEST_ENV).allowed, true)
  for (const env of [{ ...TEST_ENV, AREA4_STAGING_USER_APPLY: '' }, { ...TEST_ENV, VERCEL_ENV: 'production' }, { ...TEST_ENV, FINANCE_STAGING_SANDBOX: '0' }, { ...TEST_ENV, IO_PRODUCTION_READ_ONLY: '1' }, { ...TEST_ENV, DATABASE_URL: 'postgresql://other@database.example.invalid/io_staging_finanzas' }, { ...TEST_ENV, DATABASE_URL: 'postgresql://io_staging_finanzas@database.example.invalid/production' }]) assert.equal(usersApplyEnvironment(env).allowed, false)
  assert.equal(usersApplyOriginAllowed(origin, TEST_ENV), true)
  assert.equal(usersApplyOriginAllowed('https://area4-synthetic-preview.vercel.app', TEST_ENV), true)
  for (const origin of ['http://localhost:3000', 'https://internetoperadores.com', 'https://other.vercel.app', 'https://staging.internetoperadores.com.attacker.invalid']) assert.equal(usersApplyOriginAllowed(origin, TEST_ENV), false)
})
test('origen, content-type y tamaño real del cuerpo se verifican antes del contrato', async () => {
  const url = `${origin}/api/admin/usuarios/propuestas`
  await assert.rejects(readUsersProposalJson(new Request(url, { method: 'POST', body: '{}' })), fails('ORIGIN_NOT_ALLOWED'))
  await assert.rejects(readUsersProposalJson(new Request(url, { method: 'POST', headers: { origin, 'content-type': 'text/plain' }, body: '{}' })), fails('JSON_REQUIRED'))
  await assert.rejects(readUsersProposalJson(new Request(url, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: 'a'.repeat(256 * 1024 + 1) })), fails('REQUEST_TOO_LARGE'))
  await assert.rejects(readUsersProposalJson(new Request(url, { method: 'POST', headers: { origin, 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' }, body: '{}' })), fails('ORIGIN_NOT_ALLOWED'))
})
test('negativos CAS, confirmación, propietario vivo, excluidos y nuevos Superadmin no escriben', async () => {
  const state = fixtureState()
  const input = applyInput(state, [draft()])
  let stub = createProposalStub(state)
  await assert.rejects(applyUsersProposal(stub.db, { ...input, confirmed: false }, TEST_ENV), fails('INVALID_DRAFT'))
  await assert.rejects(applyUsersProposal(stub.db, { ...input, revision: 'b'.repeat(64) }, TEST_ENV), fails('STALE_REVISION'))
  assert.equal(stub.stats.writes, 0)
  for (const userId of [OWNER_ID, 916, 917]) {
    stub = createProposalStub(state)
    await assert.rejects(applyUsersProposal(stub.db, applyInput(state, [draft(userId)]), TEST_ENV), fails('BLOCKED_PROPOSAL'))
    assert.equal(stub.stats.writes, 0); assert.equal(stub.audits().length, 0)
  }
  stub = createProposalStub(state)
  await assert.rejects(applyUsersProposal(stub.db, applyInput(state, [{ ...draft(), role: 'superadmin' }]), TEST_ENV), fails('BLOCKED_PROPOSAL'))
  const revoked = structuredClone(state); revoked.users[0].activo = false
  stub = createProposalStub(revoked)
  await assert.rejects(applyUsersProposal(stub.db, input, TEST_ENV), fails('OWNER_REQUIRED'))
  assert.equal(stub.stats.writes, 0)
  await assert.rejects(applyUsersProposal(createProposalStub(state).db, input, { ...TEST_ENV, AREA4_OWNER_USER_ID: '999' }), fails('OWNER_REQUIRED'))
})
test('aplicación serializable reemplaza TODO, quita roles legacy/perfil, adopta y audita backup sin secretos', async () => {
  await withSeparatedExpenses(async () => {
    const state = fixtureState(); const target = state.users.find(u => u.id === 918)!
    target.roles = ['VISOR', 'GERENTE', 'RRHH']; target.perfilAsignado = 'Perfil anterior'
    const stub = createProposalStub(state); const input = applyInput(state, [draft()])
    await applyUsersProposal(stub.db, input, TEST_ENV)
    assert.equal(stub.stats.isolation, 'Serializable')
    const user = stub.state().users.find(u => u.id === 918)!
    assert.deepEqual(user.roles, ['VISOR']); assert.equal(user.perfilAsignado, null); assert.equal(user.permisosArea4Vivos, true)
    assert.equal(user.grants.length, state.areas.length)
    assert.equal(user.grants.find(g => g.codigo === 'admin.futuro_cerrado')!.lectura, false)
    assert.deepEqual(stub.state().users[0], state.users[0])
    assert.equal(stub.audits().length, 1); assert.equal(stub.audits()[0].operacion, 'PERFIL_APLICADO')
    assert.deepEqual(stub.audits()[0].antes.roles, ['VISOR', 'GERENTE', 'RRHH'])
    assert.ok(!/password|"email"|"nif"/.test(JSON.stringify(stub.audits())))
    await assert.rejects(applyUsersProposal(stub.db, input, TEST_ENV), fails('STALE_REVISION'))
    assert.equal(stub.audits().length, 1)
  })
})
test('fallo de segunda auditoría revierte lote completo; conflicto serializable no reintenta', async () => {
  await withSeparatedExpenses(async () => {
    const state = fixtureState(); const drafts = [draft(), draft(919)]
    let stub = createProposalStub(state, { failAudit: 2 })
    await assert.rejects(applyUsersProposal(stub.db, applyInput(state, drafts), TEST_ENV), fails('APPLY_FAILED'))
    assert.deepEqual(stub.state(), state); assert.equal(stub.audits().length, 0)
    stub = createProposalStub(state, { serializationFailure: true })
    await assert.rejects(applyUsersProposal(stub.db, applyInput(state, drafts), TEST_ENV), fails('STALE_REVISION'))
    assert.equal(stub.stats.transactions, 1); assert.equal(stub.audits().length, 0); assert.deepEqual(stub.state(), state)
  })
})
test('contrato API real: owner vivo, sin actuación, no-store y no eco de errores', async () => {
  const require = createRequire(resolve(process.cwd(), 'scripts/test-area4-users-proposals.ts'))
  const livePath = require.resolve('../lib/area4/live-admin')
  const prismaPath = require.resolve('../lib/prisma')
  const routePath = require.resolve('../app/api/admin/usuarios/propuestas/route')
  let principal = { id: OWNER_ID, activo: true, rol: 'SUPER_ADMIN' }
  let session: any = { user: { id: String(OWNER_ID), userType: 'admin' } }
  let denied = false
  const stub = createProposalStub(fixtureState())
  const old = [livePath, prismaPath, routePath].map(path => ({ path, cache: require.cache[path] }))
  const previousOwner = process.env.AREA4_OWNER_USER_ID
  process.env.AREA4_OWNER_USER_ID = String(OWNER_ID)
  require.cache[prismaPath] = { exports: { default: stub.db, prisma: stub.db, __esModule: true } } as any
  require.cache[livePath] = { exports: { async requireArea4Owner() {
    return denied ? { ok: false, response: new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 }) } : { ok: true, principal, session }
  } } } as any
  delete require.cache[routePath]
  try {
    const route = require(routePath)
    const request = () => new Request(`${origin}/api/admin/usuarios/propuestas`)
    denied = true
    let response = await route.GET(request()); assert.equal(response.status, 401); assert.equal(response.headers.get('cache-control'), 'private, no-store')
    denied = false; session.impersonation = { actorId: String(OWNER_ID) }
    response = await route.GET(request()); assert.equal(response.status, 403)
    delete session.impersonation
    response = await route.GET(new Request(`${origin}/api/admin/usuarios/propuestas`, { headers: { 'x-io-impersonation-context': 'invalid' } })); assert.equal(response.status, 403)
    principal = { ...principal, activo: false }
    response = await route.GET(request()); assert.equal(response.status, 403)
    principal = { id: OWNER_ID, activo: true, rol: 'SUPER_ADMIN' }
    response = await route.GET(request()); assert.equal(response.status, 200); assert.equal(stub.stats.writes, 0)
    response = await route.POST(new Request(`${origin}/api/admin/usuarios/propuestas`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preview', drafts: [draft()], next: { owner: true } }) })); assert.equal(response.status, 400)
    response = await route.POST(new Request(`${origin}/api/admin/usuarios/propuestas`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preview', drafts: [draft()] }) })); assert.equal(response.status, 200); assert.ok((await response.json()).proposal); assert.equal(stub.stats.writes, 0)
  } finally {
    if (previousOwner === undefined) delete process.env.AREA4_OWNER_USER_ID; else process.env.AREA4_OWNER_USER_ID = previousOwner
    for (const { path, cache } of old) { if (cache) require.cache[path] = cache; else delete require.cache[path] }
  }
  const source = readFileSync(routePath, 'utf8')
  assert.ok(source.includes('requireArea4Owner'))
  assert.ok(!source.includes('console.error'))
})

test('deployment financiero read-only bloquea apply antes de abrir transacción o escribir/auditar', async () => {
  const state = fixtureState(); const stub = createProposalStub(state)
  const env = { ...TEST_ENV, FINANCE_DEPLOYMENT_READ_ONLY: '1' }
  assert.equal(usersApplyEnvironment(env).allowed, false)
  await assert.rejects(applyUsersProposal(stub.db, applyInput(state, [draft()]), env), fails('APPLY_NOT_AUTHORIZED'))
  assert.equal(stub.stats.transactions, 0); assert.equal(stub.stats.writes, 0); assert.equal(stub.audits().length, 0)
})

test('postapply/recarga conserva rol y extras humanos de persona conocida y desconocida mediante auditoría coincidente', async () => {
  await withSeparatedExpenses(async () => {
    const state = fixtureState()
    const choices: UsersDraft[] = [
      { userId: 910, role: 'contabilidad', extras: { crm: 'VE' }, active: true },
      { userId: 918, role: 'gerente', extras: { inicio: 'VX' }, active: true },
    ]
    const previous = process.env.AREA5_REVISORES
    // Synthetic reviewers simulate the already-existing module guard; no real email is used.
    process.env.AREA5_REVISORES = 'account-918@example.invalid'
    try {
      const stub = createProposalStub(state)
      const applied = await applyUsersProposal(stub.db, applyInput(state, choices), TEST_ENV)
      const reload = await loadUsersSnapshot(stub.db, OWNER_ID)
      for (const snapshot of [applied, reload]) {
        assert.equal(snapshot.users.find(u => u.id === 910)!.role, 'contabilidad')
        assert.deepEqual(snapshot.users.find(u => u.id === 910)!.extras, { crm: 'VE' })
        assert.equal(snapshot.users.find(u => u.id === 918)!.role, 'gerente')
        assert.deepEqual(snapshot.users.find(u => u.id === 918)!.extras, { inicio: 'VX' })
        assert.ok(snapshot.proposal.rows.filter(r => [910, 918].includes(r.userId)).every(r => !r.changes))
      }
      const current = stub.state().users.find(u => u.id === 910)!
      const audited = stub.audits().find(event => event.objetivoUsuarioId === 910)
      const event = { id: 'synthetic-audit-1', actorId: OWNER_ID, createdAt: new Date('2026-11-24T13:00:00Z'), despues: audited.despues }
      assert.ok(matchingAuditAssignment(current, event, stub.state(), OWNER_ID))
      assert.equal(matchingAuditAssignment(current, { ...event, actorId: 999 }, stub.state(), OWNER_ID), null)
      assert.equal(matchingAuditAssignment({ ...current, roles: ['CONTABILIDAD', 'RRHH'] }, event, stub.state(), OWNER_ID), null)
      assert.equal(matchingAuditAssignment({ ...current, activo: false }, event, stub.state(), OWNER_ID), null)
      const grants = [...current.grants]; grants[0] = { ...grants[0], exportar: !grants[0].exportar }
      assert.equal(matchingAuditAssignment({ ...current, grants }, event, stub.state(), OWNER_ID), null)
      const phonyExtras = { ...event, despues: { ...event.despues, extras: { crm: 'VECX' } } }
      assert.equal(matchingAuditAssignment(current, phonyExtras, stub.state(), OWNER_ID), null)
      const partialUser = { ...current, grants: current.grants.slice(1) }
      const partialEvent = { ...event, despues: { ...event.despues, grants: event.despues.grants.slice(1) } }
      assert.equal(matchingAuditAssignment(partialUser, partialEvent, stub.state(), OWNER_ID), null)
      const illegalUser = { ...current, roles: ['CONTABILIDAD', 'RRHH'] }
      const illegalEvent = { ...event, despues: { ...event.despues, roles: ['CONTABILIDAD', 'RRHH'] } }
      assert.equal(matchingAuditAssignment(illegalUser, illegalEvent, stub.state(), OWNER_ID), null)
    } finally {
      if (previous === undefined) delete process.env.AREA5_REVISORES; else process.env.AREA5_REVISORES = previous
    }
  })
})

test('cuenta adoptada sin evidencia coincidente conserva estado actual y queda fuera de repropuestas por nombre', () => {
  const state = fixtureState()
  const user = state.users.find(u => u.id === 910)!
  user.permisosArea4Vivos = true; user.rol = 'CONTABILIDAD'; user.roles = ['CONTABILIDAD']
  const snapshot = snapshotFromUsersState(state, OWNER_ID, TEST_ENV)
  assert.equal(snapshot.users.find(u => u.id === 910)!.role, 'contabilidad')
  assert.deepEqual(snapshot.users.find(u => u.id === 910)!.next, snapshot.users.find(u => u.id === 910)!.current)
  assert.ok(!snapshot.proposal.drafts.some(d => d.userId === 910))
})
