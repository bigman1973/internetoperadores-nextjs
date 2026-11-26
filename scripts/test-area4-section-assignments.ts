import assert from 'node:assert/strict'
import test from 'node:test'
import { APPROVED_ROLES, approvedCodePermissions } from '../lib/area4/approved-roles'
import { area4RegistrySurfaceMatches, type Area4SurfaceMatch } from '../lib/area4/section-registry'
import {
  AREA4_SECTION_ASSIGNMENT_OPERATION, AREA4_SECTION_ASSIGNMENT_ORIGIN, SectionAssignmentError,
  applyArea4SectionAssignments, area4AssignmentSurface, area4SectionSurfaceAssigned,
  buildArea4RegistrySnapshot, buildSectionAssignmentProposal, emptyArea4SectionAssignmentState,
  loadArea4SectionAssignmentState, normalizeSectionAssignmentDrafts, previewArea4SectionAssignments,
  resolveArea4RoleTemplates, sectionAssignmentEnvironment, type SectionAssignmentDraft, type SectionRoleSelection,
} from '../lib/area4/section-assignments'
import {
  matchingAuditAssignment, parseUsersProposalCommand, readUsersCurrentState, readUsersProposalJson,
  personRegistryEntitlements, snapshotFromUsersState, usersProposalRevision, validateArea4NewSurfaceConsent,
} from '../lib/area4/users-proposals'
import { OWNER_ID, TEST_ENV, createProposalStub, fixturePersonAssignment, fixtureState } from './area4-users-proposals-fixture'

const origin = 'https://staging.internetoperadores.com'
const none = (): SectionRoleSelection => ({ superadmin: '', gerente: '', contabilidad: '', comercial: '', draxton: '', empleado: '' })
// This fictional surface is ONLY in this test. It is NOT a real handler or registry entry.
function future(path = '/api/admin/crm/fictional-review-only'): Area4SurfaceMatch {
  const original = area4RegistrySurfaceMatches().find(m => m.section.key === 'crm')!
  const surface = { path, kind: 'api' as const, actions: ['V', 'E', 'C', 'X'] as const }
  return { section: original.section, surface, id: `api:${path}`, descriptor: `fictional:${original.section.key}:${original.section.areaCode}:${path}:api:VECX`, baseline: false }
}
const match = future()
const matches = [match]
const drafts = (roles = { ...none(), contabilidad: 'VE' }): SectionAssignmentDraft[] => [{ sectionKey: match.section.key, roles }]
const fails = (code: string) => (e: unknown) => e instanceof SectionAssignmentError && e.code === code
function event(roles = { ...none(), contabilidad: 'VE' }, m = match, actorId = OWNER_ID) {
  const state = emptyArea4SectionAssignmentState([m])
  return { actorId, objetivoUsuarioId: null, operacion: AREA4_SECTION_ASSIGNMENT_OPERATION, origen: AREA4_SECTION_ASSIGNMENT_ORIGIN,
    areaCodigo: `section:${m.section.key}`, despues: { version: 1, sectionKey: m.section.key, surfaces: [area4AssignmentSurface(m)], roles,
      confirmed: true, ownerId: OWNER_ID, revision: '1'.repeat(64), catalogueRevision: state.catalogueRevision, baselineRevision: state.baselineRevision } }
}
async function assigned(roles = { ...none(), contabilidad: 'VE' }, m = match) {
  const ledger = [event(roles, m)]
  const stub = createProposalStub(fixtureState(), { initialAudits: ledger })
  return { stub, ledger, assignments: await loadArea4SectionAssignmentState(stub.db, OWNER_ID, [m]) }
}
async function personFixture(roles = { ...none(), contabilidad: 'VE' }, m = match) {
  const prepared = await assigned(roles, m)
  const state = fixtureState(); state.assignments = prepared.assignments; state.registryMatches = [m]
  const draft = { userId: 918, role: 'contabilidad' as const, extras: { crm: 'VEX' }, active: true }
  const audit = await fixturePersonAssignment(state, draft)
  const stub = createProposalStub(state, { initialAudits: [...prepared.ledger, audit] })
  return { state, stub, draft, audit, user: state.users.find(u => u.id === 918)!, assignments: prepared.assignments }
}

test('contrato cerrado: seis roles expresos, sin preselección, duplicados, extras ni E/C/X sin V', () => {
  const roles = none()
  assert.deepEqual(normalizeSectionAssignmentDrafts(drafts(roles)), drafts(roles))
  assert.equal(normalizeSectionAssignmentDrafts(drafts({ ...roles, comercial: 'XEV' }))[0].roles.comercial, 'VEX')
  for (const value of [[], [{ sectionKey: 'crm', roles: { contabilidad: 'VE' } }], [...drafts(), ...drafts()],
    drafts({ ...roles, empleado: 'E' }), drafts({ ...roles, empleado: 'C' }), drafts({ ...roles, empleado: 'X' }), drafts({ ...roles, gerente: 'VV' }),
    [{ ...drafts()[0], descriptor: 'client-forged' }], [{ sectionKey: 'crm', roles: { ...roles, invented: 'V' } }]]) assert.throws(() => normalizeSectionAssignmentDrafts(value), fails('INVALID_SECTION_DRAFT'))
  assert.throws(() => parseUsersProposalCommand({ action: 'assign-sections', drafts: drafts(), revision: '1'.repeat(64) }), fails('INVALID_SECTION_DRAFT'))
  assert.throws(() => parseUsersProposalCommand({ action: 'preview-sections', drafts: drafts(), current: {} }), fails('INVALID_SECTION_DRAFT'))
  assert.equal(parseUsersProposalCommand({ action: 'preview-sections', drafts: drafts() }).action, 'preview-sections')
  assert.equal(parseUsersProposalCommand({ action: 'preview', drafts: [] }).action, 'preview')
})
test('boundedJSON y same-origin aplican también a comandos de asignación', async () => {
  const body = JSON.stringify({ action: 'preview-sections', drafts: drafts() })
  const url = `${origin}/api/admin/usuarios/propuestas`
  const command = await readUsersProposalJson(new Request(url, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body }))
  assert.equal(command.action, 'preview-sections')
  for (const headers of [{ origin: 'https://other.example.invalid', 'content-type': 'application/json' }, { origin, 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }]) {
    await assert.rejects(readUsersProposalJson(new Request(url, { method: 'POST', headers, body })), (e: any) => e.code === 'ORIGIN_NOT_ALLOWED')
  }
  await assert.rejects(readUsersProposalJson(new Request(url, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: body + ' '.repeat(256 * 1024) })), (e: any) => e.code === 'REQUEST_TOO_LARGE')
})
test('flag propio independiente: nunca producción, DSN no aislado ni ambos read-only', () => {
  assert.equal(sectionAssignmentEnvironment(TEST_ENV).allowed, true)
  assert.equal(sectionAssignmentEnvironment({ ...TEST_ENV, AREA4_STAGING_USER_APPLY: '' }).allowed, true)
  for (const env of [{ ...TEST_ENV, AREA4_STAGING_SECTION_ASSIGN: '' }, { ...TEST_ENV, VERCEL_ENV: 'production' },
    { ...TEST_ENV, FINANCE_STAGING_SANDBOX: '' }, { ...TEST_ENV, IO_PRODUCTION_READ_ONLY: '1' }, { ...TEST_ENV, FINANCE_DEPLOYMENT_READ_ONLY: '1' },
    { ...TEST_ENV, DATABASE_URL: 'postgresql://production@database.example.invalid/production' }]) assert.equal(sectionAssignmentEnvironment(env).allowed, false)
})
test('baseline-only no añade ni una consulta auditada y GET/snapshot no escribe', async () => {
  const stub = createProposalStub(fixtureState())
  const state = await loadArea4SectionAssignmentState(stub.db, OWNER_ID, area4RegistrySurfaceMatches().filter(m => m.baseline))
  assert.equal(stub.stats.auditReads, 0); assert.equal(stub.stats.writes, 0); assert.equal(stub.stats.auditWrites, 0)
  assert.equal(state.assignments.length, 0)
  const historical = fixtureState()
  historical.registryMatches = area4RegistrySurfaceMatches().filter(m => m.baseline)
  historical.assignments = state
  const snapshot = snapshotFromUsersState(historical, OWNER_ID, TEST_ENV)
  assert.equal(snapshot.registry!.pending.length, 0)
})
test('catálogo real: CRM y cuatro superficies Documentos nuevas pendientes, seis lecturas auditadas y cero escrituras', async () => {
  const current = area4RegistrySurfaceMatches()
  const added = current.filter(m => !m.baseline)
  assert.equal(added.length, 13)
  assert.deepEqual(added.map(m => m.surface.path).sort(), [
    '/admin/crm/isp/vinculos-bloque',
    '/api/admin/crm/contactos/[id]/actividades/[actividadId]/m365', '/api/admin/crm/contactos/[id]/m365/borrador', '/api/admin/crm/empresas/[id]/correos-recibidos', '/api/admin/crm/empresas/[id]/resumen-ia',
    '/api/admin/crm/hubspot/historial', '/api/admin/crm/isp/importar', '/api/admin/crm/isp/vinculos', '/api/admin/crm/isp/vinculos/bloque',
    '/api/admin/finanzas/conciliar/confirming-documentos', '/api/admin/finanzas/documentos', '/api/admin/finanzas/documentos/[id]', '/api/admin/finanzas/documentos/comparacion',
  ])
  const stub = createProposalStub(fixtureState())
  const state = await loadArea4SectionAssignmentState(stub.db, OWNER_ID, current)
  const snapshot = buildArea4RegistrySnapshot(state, TEST_ENV, current)
  assert.equal(snapshot.pending.length, 6)
  assert.deepEqual(snapshot.pending.flatMap(p => p.surfaces.map(s => s.id)).sort(), added.map(m => m.id).sort())
  assert.equal(stub.stats.auditReads, 6, 'una lectura de asignaciones por apartado pendiente, no por superficie')
  assert.equal(stub.stats.writes, 0); assert.equal(stub.stats.auditWrites, 0)
  for (const m of added) for (const role of ['gerente', 'contabilidad', 'comercial', 'draxton', 'empleado'] as const) {
    assert.equal(area4SectionSurfaceAssigned(m, state, role), false)
  }
})
test('apartado pendiente no hereda padre, Gerente ni plantilla, nueva ruta usa código CRM existente', async () => {
  const stub = createProposalStub(fixtureState())
  const state = await loadArea4SectionAssignmentState(stub.db, OWNER_ID, matches)
  for (const role of ['gerente', 'contabilidad', 'comercial', 'draxton', 'empleado'] as const) assert.equal(area4SectionSurfaceAssigned(match, state, role), false)
  const snapshot = buildArea4RegistrySnapshot(state, TEST_ENV, matches)
  assert.equal(snapshot.pending.length, 1); assert.equal(snapshot.pending[0].surfaces[0].path, match.surface.path)
  assert.deepEqual(snapshot.assignments, [])
  assert.equal(stub.stats.auditReads, 1); assert.equal(stub.audits().length, 0)
})
test('preview RepeatableRead no escribe y sólo propietario canónico vivo', async () => {
  const stub = createProposalStub(fixtureState())
  const proposal = await previewArea4SectionAssignments(stub.db, OWNER_ID, drafts(), TEST_ENV, matches)
  assert.match(proposal.revision, /^[a-f0-9]{64}$/); assert.equal(proposal.rows[0].before, null)
  assert.equal(proposal.rows[0].roles.gerente, ''); assert.equal(stub.stats.isolation, 'RepeatableRead')
  assert.equal(stub.stats.writes, 0); assert.equal(stub.stats.auditWrites, 0)
  const inactive = fixtureState(); inactive.users[0].activo = false
  await assert.rejects(previewArea4SectionAssignments(createProposalStub(inactive).db, OWNER_ID, drafts(), TEST_ENV, matches), fails('OWNER_REQUIRED'))
  await assert.rejects(previewArea4SectionAssignments(stub.db, OWNER_ID, drafts(), { ...TEST_ENV, AREA4_OWNER_USER_ID: '999' }, matches), fails('OWNER_REQUIRED'))
})
test('apply Serializable audit-only durable: ninguna cuenta/perfil/grant se modifica', async () => {
  const initial = fixtureState(); const stub = createProposalStub(initial)
  const proposal = await previewArea4SectionAssignments(stub.db, OWNER_ID, drafts(), TEST_ENV, matches)
  const result = await applyArea4SectionAssignments(stub.db, { actorId: OWNER_ID, ownerId: OWNER_ID, origin, confirmed: true, revision: proposal.revision, drafts: drafts() }, TEST_ENV, matches)
  assert.equal(stub.stats.isolation, 'Serializable'); assert.equal(stub.stats.writes, 0); assert.equal(stub.stats.auditWrites, 1)
  assert.deepEqual(stub.state(), initial); assert.equal(stub.audits().length, 1)
  assert.equal(stub.audits()[0].operacion, 'SECCION_ROLES_ASIGNADOS'); assert.equal(stub.audits()[0].objetivoUsuarioId, null)
  assert.equal(result.pending.length, 0); assert.equal(result.assignments[0].valid, true)
  assert.equal(area4SectionSurfaceAssigned(match, result, 'contabilidad', 'escritura'), true)
  assert.equal(area4SectionSurfaceAssigned(match, result, 'gerente', 'lectura'), false)
  const reloaded = await loadArea4SectionAssignmentState(stub.db, OWNER_ID, matches)
  assert.deepEqual(reloaded, { catalogueRevision: result.catalogueRevision, baselineRevision: result.baselineRevision, revision: result.revision, assignments: result.assignments, available: result.available })
})
test('denegar los seis roles se persiste como revisado, no como sin revisar', async () => {
  const stub = createProposalStub(fixtureState()); const selection = drafts(none())
  const proposal = await previewArea4SectionAssignments(stub.db, OWNER_ID, selection, TEST_ENV, matches)
  const result = await applyArea4SectionAssignments(stub.db, { actorId: OWNER_ID, ownerId: OWNER_ID, origin, confirmed: true, revision: proposal.revision, drafts: selection }, TEST_ENV, matches)
  assert.equal(result.pending.length, 0); assert.equal(result.assignments[0].valid, true)
  assert.deepEqual(result.assignments[0].roles, none()); assert.equal(area4SectionSurfaceAssigned(match, result, 'contabilidad'), false)
})
test('CAS owner/fecha, catálogo, baseline, latest y borrador; stale no escribe', async () => {
  const stub = createProposalStub(fixtureState()); const proposal = await previewArea4SectionAssignments(stub.db, OWNER_ID, drafts(), TEST_ENV, matches)
  const input = { actorId: OWNER_ID, ownerId: OWNER_ID, origin, confirmed: true, revision: proposal.revision, drafts: drafts() }
  stub.state().users[0].updatedAt = '2026-11-25T00:00:00.000Z'
  await assert.rejects(applyArea4SectionAssignments(stub.db, input, TEST_ENV, matches), fails('STALE_REVISION'))
  const fresh = createProposalStub(fixtureState())
  await assert.rejects(applyArea4SectionAssignments(fresh.db, { ...input, drafts: drafts(none()) }, TEST_ENV, matches), fails('STALE_REVISION'))
  await assert.rejects(applyArea4SectionAssignments(fresh.db, input, TEST_ENV, [future('/api/admin/crm/fictional-changed')]), fails('STALE_REVISION'))
  const baseline = area4RegistrySurfaceMatches().find(m => m.baseline)!
  await assert.rejects(applyArea4SectionAssignments(fresh.db, input, TEST_ENV, [...matches, baseline]), fails('STALE_REVISION'))
  const latest = createProposalStub(fixtureState(), { initialAudits: [event()] })
  await assert.rejects(applyArea4SectionAssignments(latest.db, input, TEST_ENV, matches), fails('STALE_REVISION'))
  assert.equal(stub.audits().length, 0); assert.equal(fresh.audits().length, 0); assert.equal(fresh.stats.writes, 0)
})
test('actor incorrecto, owner revocado, confirmación ausente, origen ajeno y read-only no escriben', async () => {
  const stub = createProposalStub(fixtureState()); const proposal = await previewArea4SectionAssignments(stub.db, OWNER_ID, drafts(), TEST_ENV, matches)
  const input = { actorId: OWNER_ID, ownerId: OWNER_ID, origin, confirmed: true, revision: proposal.revision, drafts: drafts() }
  await assert.rejects(applyArea4SectionAssignments(stub.db, { ...input, actorId: 918 }, TEST_ENV, matches), fails('OWNER_REQUIRED'))
  await assert.rejects(applyArea4SectionAssignments(stub.db, { ...input, confirmed: false }, TEST_ENV, matches), fails('INVALID_SECTION_DRAFT'))
  await assert.rejects(applyArea4SectionAssignments(stub.db, { ...input, origin: 'https://other.vercel.app' }, TEST_ENV, matches), fails('STAGING_ORIGIN_REQUIRED'))
  for (const flag of ['IO_PRODUCTION_READ_ONLY', 'FINANCE_DEPLOYMENT_READ_ONLY'] as const) await assert.rejects(applyArea4SectionAssignments(stub.db, input, { ...TEST_ENV, [flag]: '1' }, matches), fails('SECTION_ASSIGN_NOT_AUTHORIZED'))
  stub.state().users[0].activo = false
  await assert.rejects(applyArea4SectionAssignments(stub.db, input, TEST_ENV, matches), fails('OWNER_REQUIRED'))
  assert.equal(stub.audits().length, 0); assert.equal(stub.stats.writes, 0)
})
test('lote atomicINSERT revierte si segunda auditoría falla y Serializable nunca reintenta', async () => {
  const crm2 = { ...future('/api/admin/crm/fictional-second'), section: { ...match.section, key: 'fictional-second' } }
  const catalog = [match, crm2]; const selection = [...drafts(), { sectionKey: crm2.section.key, roles: none() }]
  for (const options of [{ failAudit: 2 }, { serializationFailure: true }]) {
    const initial = fixtureState(); const stub = createProposalStub(initial, options)
    const proposal = await previewArea4SectionAssignments(stub.db, OWNER_ID, selection, TEST_ENV, catalog)
    await assert.rejects(applyArea4SectionAssignments(stub.db, { actorId: OWNER_ID, ownerId: OWNER_ID, origin, confirmed: true, revision: proposal.revision, drafts: selection }, TEST_ENV, catalog), fails(options.failAudit ? 'SECTION_ASSIGN_FAILED' : 'STALE_REVISION'))
    assert.deepEqual(stub.state(), initial); assert.equal(stub.audits().length, 0); assert.equal(stub.stats.transactions, 2); assert.equal(stub.stats.writes, 0)
  }
})
test('latest corrupto o wrongactor cierra: nunca resucita anterior válido', async () => {
  for (const latest of [{ ...event(), actorId: 999 }, { ...event(), despues: { sectionKey: 'crm', roles: {} } },
    { ...event(), despues: { ...event().despues, roles: { ...none(), gerente: 'E' } } }]) {
    const stub = createProposalStub(fixtureState(), { initialAudits: [event(), latest] })
    const state = await loadArea4SectionAssignmentState(stub.db, OWNER_ID, matches)
    assert.equal(state.assignments.length, 1); assert.equal(state.assignments[0].auditId, 'synthetic-audit-2')
    assert.equal(state.assignments[0].valid, false); assert.equal(area4SectionSurfaceAssigned(match, state, 'contabilidad'), false)
    assert.equal(buildArea4RegistrySnapshot(state, TEST_ENV, matches).pending.length, 1)
  }
})
test('ruta añadida dentro de CRM mismo código no hereda latest anterior por sectionKey', async () => {
  const { assignments } = await assigned()
  const additional = future('/api/admin/crm/fictional-unreviewed-after-assignment')
  assert.equal(area4SectionSurfaceAssigned(match, assignments, 'contabilidad'), true)
  assert.equal(area4SectionSurfaceAssigned(additional, assignments, 'contabilidad'), false)
  assert.equal(area4SectionSurfaceAssigned({ ...match, descriptor: `${match.descriptor}:Cchanged` }, assignments, 'contabilidad'), false)
  assert.equal(buildArea4RegistrySnapshot(assignments, TEST_ENV, [match, additional]).pending[0].surfaces[0].id, additional.id)
})
test('owner-only no delegable por asignación aun con plantilla y grant', async () => {
  const reserved = { ...match, section: { ...match.section, key: 'fictional-system', areaCode: 'admin.sistemas' } }
  const state = emptyArea4SectionAssignmentState([reserved])
  assert.throws(() => buildSectionAssignmentProposal(state, [{ sectionKey: reserved.section.key, roles: { ...none(), gerente: 'V' } }], {}, OWNER_ID, [reserved]), fails('OWNER_ONLY_SECTION'))
})
test('plantillas resueltas locales: semilla inmutable y sólo roles expresamente asignados', async () => {
  const before = structuredClone(APPROVED_ROLES)
  const { assignments } = await assigned()
  const resolved = resolveArea4RoleTemplates(assignments, matches)
  assert.equal(resolved.find(r => r.key === 'contabilidad')!.permissions.crm, 'VE')
  assert.equal(resolved.find(r => r.key === 'empleado')!.permissions.crm, '')
  assert.deepEqual(APPROVED_ROLES, before)
  const state = fixtureState(); state.assignments = assignments; state.registryMatches = matches
  const proposalRevision = usersProposalRevision(state, [], OWNER_ID)
  assert.notEqual(proposalRevision, usersProposalRevision(fixtureState(), [], OWNER_ID))
  assert.equal(snapshotFromUsersState(state, OWNER_ID, TEST_ENV).roles.find(r => r.key === 'contabilidad')!.permissions.crm, 'VE')
})
test('asignación no adopta persona; VISOR/name/JWT nunca identifican plantilla', async () => {
  const { stub, assignments } = await assigned()
  const user = fixtureState().users.find(u => u.id === 918)!
  assert.equal(await validateArea4NewSurfaceConsent(stub.db, user, match, 'lectura', OWNER_ID, assignments), false)
  assert.equal(user.permisosArea4Vivos, false)
  const adopting = { ...user, permisosArea4Vivos: true, grants: [{ areaId: 'fake', codigo: 'admin.crm', lectura: true, escritura: true, confirmar: false, exportar: false }] }
  assert.equal(await validateArea4NewSurfaceConsent(stub.db, adopting, match, 'lectura', OWNER_ID, assignments), false)
})
test('consentimiento personal completo + latest + grant exacto permite únicamente descriptor/cap adoptados', async () => {
  const f = await personFixture()
  assert.equal(f.audit.despues.registryEntitlements.length, 1)
  assert.equal(await validateArea4NewSurfaceConsent(f.stub.db, f.user, match, 'lectura', OWNER_ID, f.assignments), true)
  assert.equal(await validateArea4NewSurfaceConsent(f.stub.db, f.user, match, 'escritura', OWNER_ID, f.assignments), true)
  assert.equal(await validateArea4NewSurfaceConsent(f.stub.db, f.user, match, 'exportar', OWNER_ID, f.assignments), false)
  assert.equal(await validateArea4NewSurfaceConsent(f.stub.db, f.user, future('/api/admin/crm/fictional-after-person'), 'lectura', OWNER_ID, f.assignments), false)
  const broad = { ...f.user, grants: f.user.grants.filter(g => g.codigo !== 'admin.crm') }
  assert.equal(await validateArea4NewSurfaceConsent(f.stub.db, broad, match, 'lectura', OWNER_ID, f.assignments), false)
})
test('persona original conserva identidad/extra histórica cuando plantilla cambia; CAS sí cambia', async () => {
  const f = await personFixture()
  const event = { id: 'person-original', actorId: OWNER_ID, createdAt: new Date(), despues: f.audit.despues }
  const original = matchingAuditAssignment(f.user, event, f.state, OWNER_ID)!
  assert.equal(original.role, 'contabilidad'); assert.deepEqual(original.extras, { crm: 'VEX' })
  const changed = structuredClone(f.state); changed.resolvedRoles = structuredClone(APPROVED_ROLES)
  changed.resolvedRoles.find(r => r.key === 'contabilidad')!.permissions.crm = 'VECX'
  changed.areas.push({ id: 'futurearea', codigo: 'admin.future-new-after-person', padre: 'admin', activo: true })
  const historical = matchingAuditAssignment(f.user, event, changed, OWNER_ID)
  assert.ok(historical); assert.equal(historical.role, original.role); assert.deepEqual(historical.extras, original.extras)
  assert.notEqual(usersProposalRevision(f.state, [f.draft], OWNER_ID), usersProposalRevision(changed, [f.draft], OWNER_ID))
})
test('forged extras, partial grants, secondary roles, wrongactor, no confirm y perfil no prueban adopción', async () => {
  const f = await personFixture(); const base = { id: 'personal', actorId: OWNER_ID, createdAt: new Date(), despues: f.audit.despues }
  assert.ok(matchingAuditAssignment(f.user, base, f.state, OWNER_ID))
  for (const event of [{ ...base, actorId: 999 }, { ...base, despues: { ...base.despues, extras: { crm: 'VECX' } } },
    { ...base, despues: { ...base.despues, confirmed: false } }, { ...base, despues: { ...base.despues, ownerId: 999 } }]) assert.equal(matchingAuditAssignment(f.user, event, f.state, OWNER_ID), null)
  const partial = { ...f.user, grants: f.user.grants.slice(1) }
  assert.equal(matchingAuditAssignment(partial, { ...base, despues: { ...base.despues, grants: base.despues.grants.slice(1) } }, f.state, OWNER_ID), null)
  const illegal = { ...f.user, roles: ['CONTABILIDAD', 'RRHH'] }
  assert.equal(matchingAuditAssignment(illegal, { ...base, despues: { ...base.despues, roles: illegal.roles } }, f.state, OWNER_ID), null)
  assert.equal(matchingAuditAssignment({ ...f.user, perfilAsignado: 'legacy' }, base, f.state, OWNER_ID), null)
})
test('auditoría antigua 4d03 conserva baseline pero JAMÁS abre superficie nueva', async () => {
  const f = await personFixture(); const old = structuredClone(f.audit)
  const after: any = old.despues
  delete after.roleTemplateSnapshot; delete after.registryEntitlements; delete after.assignmentRevision; delete after.confirmed; delete after.ownerId
  const oldStub = createProposalStub(f.state, { initialAudits: [event(), old] })
  assert.ok(matchingAuditAssignment(f.user, { id: 'old', actorId: OWNER_ID, createdAt: new Date(), despues: after }, f.state, OWNER_ID))
  assert.equal(await validateArea4NewSurfaceConsent(oldStub.db, f.user, match, 'lectura', OWNER_ID, f.assignments), false)
  const baseline = area4RegistrySurfaceMatches().find(m => m.baseline)!
  const reads = oldStub.stats.readCalls
  assert.equal(await validateArea4NewSurfaceConsent(oldStub.db, f.user, baseline, 'lectura', OWNER_ID), true)
  assert.equal(oldStub.stats.readCalls, reads)
})
test('revocación latest intersecta entitlement previo, no resurrección tras evento inválido personal', async () => {
  const f = await personFixture()
  const revokedStub = createProposalStub(f.state, { initialAudits: [event(), f.audit, event(none())] })
  const revoked = await loadArea4SectionAssignmentState(revokedStub.db, OWNER_ID, matches)
  assert.equal(await validateArea4NewSurfaceConsent(revokedStub.db, f.user, match, 'lectura', OWNER_ID, revoked), false)
  const wrongActor = createProposalStub(f.state, { initialAudits: [event(), f.audit, { ...f.audit, actorId: 999 }] })
  assert.equal(await validateArea4NewSurfaceConsent(wrongActor.db, f.user, match, 'lectura', OWNER_ID, f.assignments), false)
})
test('P2021 auditoría ausente cierra nuevas superficies, otros fallos NO se suprimen', async () => {
  const missing = createProposalStub(fixtureState(), { auditReadError: 'P2021' })
  const state = await loadArea4SectionAssignmentState(missing.db, OWNER_ID, matches)
  assert.equal(state.available, false); assert.equal(area4SectionSurfaceAssigned(match, state, 'contabilidad'), false)
  await assert.rejects(previewArea4SectionAssignments(missing.db, OWNER_ID, drafts(), TEST_ENV, matches), fails('ASSIGNMENT_UNAVAILABLE'))
  const broken = createProposalStub(fixtureState(), { auditReadError: 'P1001' })
  await assert.rejects(loadArea4SectionAssignmentState(broken.db, OWNER_ID, matches), (e: any) => e.code === 'P1001')
  const f = await personFixture(); const noAudit = createProposalStub(f.state, { auditReadError: 'P2021' })
  assert.equal(await validateArea4NewSurfaceConsent(noAudit.db, f.user, match, 'lectura', OWNER_ID, f.assignments), false)
  await assert.rejects(validateArea4NewSurfaceConsent(createProposalStub(f.state, { auditReadError: 'P1001' }).db, f.user, match, 'lectura', OWNER_ID, f.assignments), (e: any) => e.code === 'P1001')
})
test('relectura persona preserva metadatos serializables sin añadir asignación automática', async () => {
  const f = await personFixture()
  const state = await readUsersCurrentState(f.stub.db, OWNER_ID, matches)
  const user = state.users.find(u => u.id === 918)!
  assert.equal(user.approvedAssignment!.role, 'contabilidad')
  assert.equal(user.approvedAssignment!.registryEntitlements!.length, 1)
  assert.equal(f.stub.stats.writes, 0); assert.equal(f.stub.stats.auditWrites, 0)
  assert.doesNotThrow(() => JSON.stringify(snapshotFromUsersState(state, OWNER_ID, TEST_ENV)))
  const desired = approvedCodePermissions(f.draft.role, f.draft.extras, state.areas.map(a => a.codigo), resolveArea4RoleTemplates(state.assignments, matches))
  assert.deepEqual(personRegistryEntitlements(state, f.draft, desired), f.audit.despues.registryEntitlements)
})

test('readArea4SurfaceAccessUser proyección viva mínima sin PII, JWT, nombres ni lecturas audit extra', async () => {
  const { readArea4SurfaceAccessUser } = await import('../lib/area4/users-proposals')
  const f = await personFixture()
  const before = f.stub.stats.auditReads
  const live = await readArea4SurfaceAccessUser(f.stub.db, f.user.id)
  assert.ok(live); assert.equal(live.grants.length, f.user.grants.length)
  assert.equal(live.permisosArea4Vivos, true); assert.equal(live.roles[0], 'CONTABILIDAD')
  assert.ok(!('nombre' in live)); assert.ok(!('email' in live)); assert.equal(f.stub.stats.auditReads, before)
  assert.equal(await validateArea4NewSurfaceConsent(f.stub.db, live, match, 'lectura', OWNER_ID, f.assignments), true)
  assert.equal(await readArea4SurfaceAccessUser(f.stub.db, -1), null)
  assert.equal(await readArea4SurfaceAccessUser(f.stub.db, 999999), null)
})

test('asignación/new grant concedido E sin V y evidencia de acción extra no prueban consentimiento', async () => {
  const f = await personFixture()
  const noView = { ...f.user, grants: f.user.grants.map(g => g.codigo === match.section.areaCode ? { ...g, lectura: false, escritura: true } : g) }
  assert.equal(await validateArea4NewSurfaceConsent(f.stub.db, noView, match, 'escritura', OWNER_ID, f.assignments), false)
  const forged = structuredClone(f.audit)
  forged.despues.registryEntitlements[0].actions = 'VECX'
  const stub = createProposalStub(f.state, { initialAudits: [event(), forged] })
  assert.equal(await validateArea4NewSurfaceConsent(stub.db, f.user, match, 'confirmar', OWNER_ID, f.assignments), false)
})

test('API propuesta reutilizada: preview {proposal}, assign {ok,snapshot}, owner/noacting y sin writes de cuentas', async () => {
  const { createRequire } = await import('node:module')
  const { resolve } = await import('node:path')
  const require = createRequire(resolve(process.cwd(), 'scripts/test-area4-section-assignments.ts'))
  const paths = {
    live: require.resolve('../lib/area4/live-admin'), prisma: require.resolve('../lib/prisma'),
    route: require.resolve('../app/api/admin/usuarios/propuestas/route'), sections: require.resolve('../lib/area4/section-assignments'),
  }
  const prior = Object.values(paths).map(path => ({ path, cache: require.cache[path] }))
  const oldOwner = process.env.AREA4_OWNER_USER_ID
  const originalSections = require(paths.sections)
  const initial = fixtureState(); const stub = createProposalStub(initial)
  const session: any = {}
  process.env.AREA4_OWNER_USER_ID = String(OWNER_ID)
  require.cache[paths.prisma] = { exports: { default: stub.db, __esModule: true } } as any
  require.cache[paths.live] = { exports: { async requireArea4Owner() { return { ok: true, principal: { id: OWNER_ID, activo: true, rol: 'SUPER_ADMIN' }, session } } } } as any
  // Fixture injection only: inventory remains real; service receives the test catalogue explicitly.
  require.cache[paths.sections] = { exports: { ...originalSections,
    previewArea4SectionAssignments: (db: any, owner: number, selection: SectionAssignmentDraft[]) => previewArea4SectionAssignments(db, owner, selection, TEST_ENV, matches),
    applyArea4SectionAssignments: (db: any, input: any) => applyArea4SectionAssignments(db, input, TEST_ENV, matches),
  } } as any
  delete require.cache[paths.route]
  const request = (body: unknown, headers: Record<string, string> = {}) => new Request(`${origin}/api/admin/usuarios/propuestas`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  })
  try {
    const route = require(paths.route)
    let response = await route.POST(request({ action: 'preview-sections', drafts: drafts() }))
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store')
    const preview = await response.json(); assert.match(preview.proposal.revision, /^[a-f0-9]{64}$/)
    assert.deepEqual(preview.proposal.drafts, drafts()); assert.equal(stub.stats.auditWrites, 0)
    const input = { action: 'assign-sections', drafts: drafts(), confirmed: true, revision: preview.proposal.revision }
    session.impersonation = { actorId: OWNER_ID }
    response = await route.POST(request(input)); assert.equal(response.status, 403); delete session.impersonation
    response = await route.POST(request(input, { 'x-io-impersonation-context': 'invalid' })); assert.equal(response.status, 403)
    response = await route.POST(request({ ...input, registryEntitlements: [] })); assert.equal(response.status, 400)
    response = await route.POST(request(input)); assert.equal(response.status, 200)
    const applied = await response.json(); assert.equal(applied.ok, true); assert.ok(applied.snapshot.registry)
    assert.ok(applied.snapshot.users); assert.equal(stub.stats.writes, 0); assert.equal(stub.audits().length, 1)
    assert.deepEqual(stub.state(), initial)
  } finally {
    if (oldOwner === undefined) delete process.env.AREA4_OWNER_USER_ID; else process.env.AREA4_OWNER_USER_ID = oldOwner
    for (const { path, cache } of prior) { if (cache) require.cache[path] = cache; else delete require.cache[path] }
  }
})
