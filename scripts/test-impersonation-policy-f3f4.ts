import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  canonicalActingPath,
  impersonationRouteDecision,
  rawRequestPathBeforeNormalization,
  targetHasLiveRoutePermission,
  type LiveTargetPermissionSnapshot,
  type TargetPermissionRequirement,
} from '../lib/impersonation-policy'

const B4: TargetPermissionRequirement = {
  areas: ['admin.finanzas.conciliacion'],
  required: 'lectura',
  allowLegacyFinanceRole: true,
}

function target(overrides: Partial<LiveTargetPermissionSnapshot> = {}): LiveTargetPermissionSnapshot {
  return {
    activo: true,
    rol: 'VISOR',
    roles: [],
    permisos: [],
    ...overrides,
  }
}

function livePermission(snapshot: LiveTargetPermissionSnapshot | null, requirement = B4, activeAreas = requirement.areas): boolean {
  return targetHasLiveRoutePermission({ target: snapshot, requirement, activeAreas })
}

test('F3: the acting matrix has no safe-method fallback and blocks legacy administrative reads', () => {
  for (const path of [
    '/api/admin/aapp',
    '/api/admin/usuarios',
    '/api/admin/permisos',
    '/api/admin/nominas/upload',
    '/api/admin/contratos',
    '/api/admin/crm/contactos',
    '/api/admin/configuracion/categorias',
    '/api/admin/finanzas/modo-facil/automaticas',
  ]) {
    assert.deepEqual(impersonationRouteDecision(path, 'GET'), { allowed: false }, path)
  }
  assert.equal(impersonationRouteDecision('/api/admin/finanzas/conciliacion-v2', 'GET').allowed, true)
  assert.equal(impersonationRouteDecision('/api/admin/finanzas/conciliacion-v2', 'POST').allowed, false)
})

test('F3: reviewed finance reads and manual writes carry exact target permission requirements', () => {
  const read = impersonationRouteDecision('/api/admin/finanzas/modo-facil', 'GET')
  assert.equal(read.allowed, true)
  if (!read.allowed) throw Error('expected reviewed read')
  assert.deepEqual(read.permission, { areas: ['admin.finanzas.conciliacion'], required: 'lectura', allowLegacyFinanceRole: true })

  const write = impersonationRouteDecision('/api/admin/finanzas/modo-facil', 'POST', new URLSearchParams(), 88, 'confirmar_factura')
  assert.equal(write.allowed, true)
  if (!write.allowed) throw Error('expected reviewed mutation')
  assert.deepEqual(write.permission, { areas: ['admin.finanzas.conciliacion'], required: 'escritura', allowLegacyFinanceRole: true })
  assert.equal(impersonationRouteDecision('/api/admin/finanzas/modo-facil', 'POST', new URLSearchParams(), 88, 'automatico').allowed, false)
  assert.equal(impersonationRouteDecision('/api/admin/finanzas/modo-facil', 'POST').allowed, false)

  const cobrosRead = impersonationRouteDecision('/api/admin/finanzas/modo-facil/cobros', 'GET')
  assert.equal(cobrosRead.allowed, true)
  const cobrosWrite = impersonationRouteDecision('/api/admin/finanzas/modo-facil/cobros', 'POST', new URLSearchParams(), 88, 'confirmar_bloque')
  assert.equal(cobrosWrite.allowed, true)
  if (cobrosWrite.allowed) assert.deepEqual(cobrosWrite.permission, { areas: ['admin.finanzas.conciliacion'], required: 'escritura', allowLegacyFinanceRole: true })
  assert.equal(impersonationRouteDecision('/api/admin/finanzas/modo-facil/cobros', 'POST', new URLSearchParams(), 88, 'automatico').allowed, false)
})

test('el control durante actuación deja pasar sólo salida y replay de inicio, no otras mutaciones', () => {
  assert.equal(impersonationRouteDecision('/api/admin/actuar-como', 'POST', new URLSearchParams(), undefined, 'salir').allowed, true)
  assert.equal(impersonationRouteDecision('/api/admin/actuar-como', 'POST', new URLSearchParams(), undefined, 'iniciar').allowed, true)
  assert.equal(impersonationRouteDecision('/api/admin/actuar-como', 'POST', new URLSearchParams(), undefined, 'cambiar-destino').allowed, false)
  assert.equal(impersonationRouteDecision('/api/admin/actuar-como', 'PUT', new URLSearchParams(), undefined, 'iniciar').allowed, false)

  const middleware = readFileSync(new URL('../middleware.js', import.meta.url), 'utf8')
  assert.match(middleware, /action === 'salir' \|\| action === 'iniciar'/)
  assert.doesNotMatch(middleware, /path === '\/api\/admin\/actuar-como'[\s\S]{0,180}request\.method === 'POST' && action\s*===\s*'[^']+'\s*\) return \{ headers \};/)
})

test('F3: only target live grants satisfy the matrix; a minimal or VISOR target is denied', () => {
  assert.equal(livePermission(target()), false, 'VISOR with no live grant')
  assert.equal(livePermission(target({ permisos: [{ area: 'admin.finanzas.conciliacion', lectura: true, escritura: false }] })), true)
  assert.equal(livePermission(target({ permisos: [{ area: 'admin.finanzas', lectura: true, escritura: false }] })), true, 'parent grant inherits')
  assert.equal(livePermission(target({ permisos: [{ area: 'admin.finanzas.otra', lectura: true, escritura: false }] })), false)
  assert.equal(livePermission(target({ activo: false, permisos: [{ area: 'admin.finanzas.conciliacion', lectura: true, escritura: true }] })), false)
  assert.equal(livePermission(target({ rol: 'SUPER_ADMIN', permisos: [{ area: 'admin.finanzas.conciliacion', lectura: true, escritura: true }] })), false)
})

test('F3: effective target roles retain only their existing target-side behavior, never actor authority', () => {
  assert.equal(livePermission(target({ rol: 'GERENTE' })), true, 'active non-superadmin target GERENTE remains supported')
  assert.equal(livePermission(target({ rol: 'CONTABILIDAD' })), true, 'target-side legacy finance role with no granular rows')
  assert.equal(livePermission(target({ rol: 'CONTABILIDAD', permisos: [{ area: 'admin.crm', lectura: true, escritura: false }] })), false, 'a granular target cannot fall back to legacy role')
  assert.equal(livePermission(target({ rol: 'VISOR', roles: ['CONTABILIDAD'] })), true, 'target secondary role only')
})

test('F3: reviewed safe employee routes are target-only and identity selector aliases remain denied', () => {
  for (const path of ['/empleado', '/empleado/imputaciones', '/api/empleado/alertas', '/api/empleado/imputaciones']) {
    const decision = impersonationRouteDecision(path, 'GET')
    assert.equal(decision.allowed, true, path)
    if (decision.allowed) assert.equal(decision.targetOnly, true, path)
  }
  assert.equal(impersonationRouteDecision('/empleado/nominas', 'GET').allowed, false, 'unreviewed employee payroll page')
  assert.equal(impersonationRouteDecision('/api/empleado/nominas', 'GET').allowed, false, 'unreviewed employee payroll API')
  assert.equal(impersonationRouteDecision('/api/empleado/nominas', 'GET', new URLSearchParams('as=other@example.test')).allowed, false)
  assert.equal(impersonationRouteDecision('/api/empleado/imputaciones', 'POST').allowed, false)
})

test('F4: raw URL path is captured before URL normalization and ambiguity is denied', () => {
  const validUrl = 'https://staging.example.test/api/admin/finanzas/modo-facil?x=1'
  assert.equal(rawRequestPathBeforeNormalization(validUrl), '/api/admin/finanzas/modo-facil')
  assert.equal(canonicalActingPath(rawRequestPathBeforeNormalization(validUrl), '/api/admin/finanzas/modo-facil'), '/api/admin/finanzas/modo-facil')

  for (const [url, normalized] of [
    ['https://staging.example.test/api/%2e%2e/admin/finanzas/modo-facil', '/admin/finanzas/modo-facil'],
    ['https://staging.example.test/api/%252e%252e/admin/finanzas/modo-facil', '/api/%252e%252e/admin/finanzas/modo-facil'],
    ['https://staging.example.test/api/admin%2ffinanzas/modo-facil', '/api/admin/finanzas/modo-facil'],
    ['https://staging.example.test/api/admin%5cfinanzas/modo-facil', '/api/admin\\finanzas/modo-facil'],
    ['https://staging.example.test/api/admin%252ffinanzas/modo-facil', '/api/admin%252ffinanzas/modo-facil'],
    ['https://staging.example.test/api//admin/finanzas/modo-facil', '/api/admin/finanzas/modo-facil'],
    ['https://staging.example.test/api/admin/finanzas/modo-facil/', '/api/admin/finanzas/modo-facil/'],
    ['https://staging.example.test/API/admin/finanzas/modo-facil', '/API/admin/finanzas/modo-facil'],
  ] as const) {
    assert.equal(canonicalActingPath(rawRequestPathBeforeNormalization(url), normalized), null, url)
  }
  assert.equal(canonicalActingPath('/api/admin/finanzas/modo-facil', '/api/admin/finanzas/modo-facil/'), null, 'normalization mismatch')
})
