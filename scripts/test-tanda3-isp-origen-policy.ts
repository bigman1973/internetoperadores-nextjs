import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ISP_ORIGEN_CATALOG, ISP_SOURCE_WRITERS, sourceWriterFields, persistedClienteOrigin, resolverIdentidadIsp, isIspMirror, IspOrigenNoEditableError } from '../lib/isp-origen-policy'
let checks = 0
function ok(value: unknown, message: string) { assert(value, message); checks++ }
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
let mapped = 0
for (const [model, catalog] of Object.entries(ISP_ORIGEN_CATALOG)) {
  const body = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))?.[1]
  ok(body, `modelo ${model} existe`)
  ok(body!.includes(`@@map("${catalog.table}")`), `tabla exacta ${model}`)
  for (const [field, column] of Object.entries({ ...catalog.ispFields, ...catalog.panelFields, ...catalog.mixedFields })) {
    const line = body!.split('\n').find(line => new RegExp(`^\\s+${field}\\s`).test(line))
    ok(line, `campo exacto ${model}.${field}`)
    const actual = line!.match(/@map\("([^"\n]+)"\)/)?.[1] ?? field
    assert.equal(actual, column, `${model}.${field}`); checks++; mapped++
  }
}
for (const writer of ISP_SOURCE_WRITERS) for (const [model, catalog] of Object.entries(ISP_ORIGEN_CATALOG)) {
  for (const create of [false, true]) {
    const allowed = sourceWriterFields(writer, model, create)
    if (!allowed) continue
    for (const field of Object.keys(catalog.panelFields)) {
      if (writer === 'finance-p2' && model === 'FacturaEmitida' && create && ['estado', 'importeCobrado', 'fechaCobro', 'facturaISPId'].includes(field)) continue
      if (writer === 'isp-facturas' && model === 'FacturaEmitida' && create && ['estado', 'importeCobrado', 'fechaCobro'].includes(field)) continue
      if (writer === 'isp-clients' && model === 'ClienteWeb' && create && field === 'passwordHash') continue
      ok(!allowed.includes(field), `scope ${writer} excluye panel ${model}.${field}`)
    }
    if (!create) for (const id of catalog.insertOnly) ok(!allowed.includes(id), `insert-only ${model}.${id}`)
  }
}
assert.deepEqual(sourceWriterFields('isp-facturas', 'FacturaEmitida', false), ['cliente', 'cif', 'numFactura', 'serie', 'fecha', 'base', 'tipoIva', 'importeIva', 'total', 'concepto']); checks++
ok(!sourceWriterFields('isp-facturas', 'FacturaEmitida', true)!.includes('facturaISPId'), 'legacy never writes source FK')
for (const create of [false, true]) for (const field of ['ispClienteRowId', 'asignacionCliente', 'candidatosCliente']) ok(sourceWriterFields('crm-xlsx', 'IspContratoArea1', create)!.includes(field), 'source assignment validated by real guard')
ok(!sourceWriterFields('crm-xlsx', 'IspContratoArea1', true)!.includes('contratoServicioId'), 'local contract FK excluded')
const manual = { id: 7, ispGestionId: 'manual-5f61da65-bc6c-451b-9044-54ac4b72e0b2', clienteIdIsp: null }
assert.equal(persistedClienteOrigin(manual), 'manual'); checks++
assert.equal(persistedClienteOrigin({ ...manual, clienteIdIsp: 'isp' }), 'unknown'); checks++
assert.equal(persistedClienteOrigin({ ...manual, ispGestionId: 'manual-browserflag' }), 'unknown'); checks++
assert.equal(persistedClienteOrigin({ ...manual, id: undefined }), 'unknown'); checks++
assert.equal(persistedClienteOrigin(manual, true), 'source'); checks++
assert.equal(persistedClienteOrigin({ id: 1, ispGestionId: '1234' }), 'source'); checks++
ok(isIspMirror({ facturaISPId: 1 }), 'FK demuestra espejo')
ok(isIspMirror({ origenSistema: 'ISPGestion' }), 'etiqueta sospechosa protege, no autoriza')
ok(!isIspMirror({ origenSistema: 'Manual' }), 'FI manual sigue manual')
const crm = { nombre: 'Local', nif: 'B123' }
const accounts = [{ id: 'a1', nombre: 'Origen', cif: 'B456', codigo: '000001' }, { id: 'a2', nombre: 'Origen', cif: 'B456', codigo: '000002' }]
const before = JSON.stringify({ crm, accounts })
const result = resolverIdentidadIsp(crm, accounts)
assert.equal(result.linked, true); assert.equal(result.nombre, 'Origen'); assert.equal(result.nif, 'B456'); checks += 3
ok(result.conflictos.includes('NOMBRE_CRM_DISCREPANTE'), 'discrepancia visible')
assert.equal(JSON.stringify({ crm, accounts }), before); checks++
const multi = resolverIdentidadIsp(crm, [...accounts, { id: 'a3', nombre: 'Otro', cif: 'B789' }])
assert.equal(multi.nombre, null); assert.equal(multi.nif, null); assert.equal(multi.multiplesIdentidades, true); checks += 3
const documentConflict = resolverIdentidadIsp(crm, [{ id: 'a', nombre: 'Origen', cif: 'B1', nif: 'B2', docNormalizado: 'B1' }])
assert.equal(documentConflict.nif, null); checks++
ok(documentConflict.conflictos.includes('DOCUMENTOS_ISP_CONTRADICTORIOS'), 'no oculta CIF/NIF contradictorio')
assert.equal(resolverIdentidadIsp(crm, []).nombre, 'Local'); checks++
const error = new IspOrigenNoEditableError()
assert.equal(error.code, 'ISP_ORIGEN_NO_EDITABLE'); assert.equal(error.status, 409); checks += 2
console.log(JSON.stringify({ passed: true, checks, exactMappings: mapped, offline: true, writes: 0 }))
