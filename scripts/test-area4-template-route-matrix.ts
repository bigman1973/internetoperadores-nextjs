import assert from 'node:assert/strict'
import test from 'node:test'
import { AREA4_CAPABILITIES, evaluateArea4Capability, isArea4OwnerOnlyArea } from '../lib/area4/policy'
import { AREA4_TEMPLATES } from '../lib/area4/templates'
import { AREA4_SECTION_REGISTRY } from '../lib/area4/section-registry'

const owner = { id: 3, activo: true, rol: 'SUPER_ADMIN' }
const gerente = { id: 8, activo: true, rol: 'GERENTE' }
const plantillaPrincipal = { id: 40, activo: true, rol: 'VISOR' }
const allSurfaces = AREA4_SECTION_REGISTRY.flatMap(section => section.surfaces.map(surface => ({ ...surface, areaCode: section.areaCode })))

test('cada página y API registrada admite al propietario canónico y niega las áreas exclusivas al gerente', () => {
  assert.ok(allSurfaces.length > 300)
  for (const surface of allSurfaces) {
    assert.equal(evaluateArea4Capability({ principal: owner, grants: [], codigoArea: surface.areaCode, capability: 'lectura', ownerId: 3 }), true, surface.path)
    const expectedGerente = !isArea4OwnerOnlyArea(surface.areaCode)
    assert.equal(evaluateArea4Capability({ principal: gerente, grants: [], codigoArea: surface.areaCode, capability: 'lectura', ownerId: 3 }), expectedGerente, `${surface.kind} ${surface.path}`)
  }
})

test('cada plantilla carga o deniega de acuerdo con sus grants en todas las superficies registradas', () => {
  for (const template of AREA4_TEMPLATES) {
    const grants = template.permisos.map(grant => ({ ...grant, codigo: grant.areaCodigo }))
    let allowedSurfaceCount = 0
    for (const surface of allSurfaces) {
      const expected = grants.some(grant => surface.areaCode === grant.codigo || surface.areaCode.startsWith(`${grant.codigo}.`))
        && grants.some(grant => (surface.areaCode === grant.codigo || surface.areaCode.startsWith(`${grant.codigo}.`)) && grant.lectura)
      const actual = evaluateArea4Capability({ principal: plantillaPrincipal, grants, codigoArea: surface.areaCode, capability: 'lectura', ownerId: 3 })
      assert.equal(actual, expected, `${template.id}: ${surface.kind} ${surface.path}`)
      if (actual) allowedSurfaceCount += 1
    }
    assert.ok(allowedSurfaceCount > 0, `${template.id} no alcanza ninguna superficie registrada`)
  }
})

test('las ocho subáreas técnicas son las únicas superficies Draxton concedidas por la plantilla técnica', () => {
  const template = AREA4_TEMPLATES.find(item => item.id === 'area4-tecnico-draxton-8')
  assert.ok(template)
  const grants = template.permisos.map(grant => ({ ...grant, codigo: grant.areaCodigo }))
  const technical = allSurfaces.filter(surface => surface.areaCode.startsWith('admin.clientes.ggcc.draxton.'))
  assert.ok(technical.length >= 8)
  for (const surface of technical) {
    const allowed = evaluateArea4Capability({ principal: plantillaPrincipal, grants, codigoArea: surface.areaCode, capability: 'lectura', ownerId: 3 })
    assert.equal(allowed, template.permisos.some(grant => surface.areaCode === grant.areaCodigo || surface.areaCode.startsWith(`${grant.areaCodigo}.`)), surface.path)
  }
})

test('Confirmar y Exportar no se heredan de Editar en la plantilla técnica', () => {
  const template = AREA4_TEMPLATES.find(item => item.id === 'area4-tecnico-draxton-8')
  assert.ok(template)
  const grants = template.permisos.map(grant => ({ ...grant, codigo: grant.areaCodigo }))
  for (const capability of AREA4_CAPABILITIES) {
    const permitted = evaluateArea4Capability({
      principal: plantillaPrincipal,
      grants,
      codigoArea: 'admin.clientes.ggcc.draxton.informes',
      capability,
      ownerId: 3,
    })
    assert.equal(permitted, capability === 'lectura' || capability === 'escritura')
  }
})
