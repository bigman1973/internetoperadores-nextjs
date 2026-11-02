import assert from 'node:assert/strict'
import test from 'node:test'
import {
  configuredArea4OwnerId,
  evaluateArea4Capability,
  grantAllowsArea4Capability,
  isArea4OwnerOnlyArea,
} from '../lib/area4/policy'
import { AREA4_TEMPLATES } from '../lib/area4/templates'
import { normalizeArea4Grants } from '../lib/area4/live-admin'

const owner = { id: 3, activo: true, rol: 'SUPER_ADMIN' }
const gerente = { id: 8, activo: true, rol: 'GERENTE' }
const tecnico = { id: 12, activo: true, rol: 'VISOR' }
const env = { AREA4_OWNER_USER_ID: '3' }

test('el propietario canónico es explícito y falla cerrado ante configuración ambigua', () => {
  assert.equal(configuredArea4OwnerId(env), 3)
  assert.equal(configuredArea4OwnerId({ IMPERSONATION_ALLOWED_ACTOR_IDS: '3,4' }), null)
  assert.equal(configuredArea4OwnerId({}), null)
})

test('solo el propietario Super Admin entra en ámbitos de control', () => {
  assert.equal(evaluateArea4Capability({ principal: owner, grants: [], codigoArea: 'admin.usuarios', capability: 'lectura', ownerId: 3 }), true)
  assert.equal(evaluateArea4Capability({ principal: { ...owner, id: 4 }, grants: [], codigoArea: 'admin.usuarios', capability: 'lectura', ownerId: 3 }), false)
  assert.equal(isArea4OwnerOnlyArea('admin.permisos.perfiles'), true)
  assert.equal(isArea4OwnerOnlyArea('admin.auditoria'), true)
})

test('Gerente conserva negocio pero no usuarios, permisos, auditoría ni actuar como', () => {
  for (const capability of ['lectura', 'escritura', 'confirmar', 'exportar'] as const) {
    assert.equal(evaluateArea4Capability({ principal: gerente, grants: [], codigoArea: 'admin.finanzas.facturas', capability, ownerId: 3 }), true)
    assert.equal(evaluateArea4Capability({ principal: gerente, grants: [], codigoArea: 'admin.usuarios', capability, ownerId: 3 }), false)
    assert.equal(evaluateArea4Capability({ principal: gerente, grants: [], codigoArea: 'admin.permisos', capability, ownerId: 3 }), false)
  }
})

test('un técnico solo recibe las cuatro capacidades que estén marcadas en su área', () => {
  const grants = [{ codigo: 'admin.clientes.ggcc.draxton.informes', lectura: true, escritura: true, confirmar: false, exportar: false }]
  assert.equal(grantAllowsArea4Capability(grants, 'admin.clientes.ggcc.draxton.informes', 'lectura'), true)
  assert.equal(grantAllowsArea4Capability(grants, 'admin.clientes.ggcc.draxton.informes', 'escritura'), true)
  assert.equal(grantAllowsArea4Capability(grants, 'admin.clientes.ggcc.draxton.informes', 'confirmar'), false)
  assert.equal(evaluateArea4Capability({ principal: tecnico, grants, codigoArea: 'admin.clientes.ggcc.draxton.informes', capability: 'exportar', ownerId: 3 }), false)
})

test('los grants de Prisma se normalizan con su código de área antes de aplicar la política viva', () => {
  const grants = normalizeArea4Grants([{
    area: { codigo: 'admin.clientes.ggcc.draxton.informes' },
    lectura: true, escritura: false, confirmar: false, exportar: true,
  }])
  assert.deepEqual(grants, [{
    codigo: 'admin.clientes.ggcc.draxton.informes',
    lectura: true, escritura: false, confirmar: false, exportar: true,
  }])
  assert.equal(evaluateArea4Capability({
    principal: tecnico, grants, codigoArea: 'admin.clientes.ggcc.draxton.informes', capability: 'exportar', ownerId: 3,
  }), true)
})

test('las plantillas aprobadas no conceden Usuarios ni permisos a Gerente', () => {
  const gerenteTemplate = AREA4_TEMPLATES.find(template => template.id === 'area4-gerente-operativo')
  assert.ok(gerenteTemplate)
  assert.equal(gerenteTemplate.permisos.some(grant => grant.areaCodigo.startsWith('admin.usuarios')), false)
  assert.equal(gerenteTemplate.permisos.some(grant => grant.areaCodigo.startsWith('admin.permisos')), false)
  const lorena = AREA4_TEMPLATES.find(template => template.id === 'area4-contabilidad-clientes-rrhh')
  assert.equal(lorena?.permisos.find(grant => grant.areaCodigo === 'admin.clientes')?.lectura, true)
  assert.equal(lorena?.permisos.find(grant => grant.areaCodigo === 'admin.clientes')?.escritura, false)
})
