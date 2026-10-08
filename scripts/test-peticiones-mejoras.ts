import assert from 'node:assert/strict'
import fs from 'node:fs'
import { canAccessAdminPanel } from '../lib/admin-panel-access'
import { filtrarPeticiones } from '../lib/peticiones-filtros'

async function main() {
  let reads = 0
  const count = async (id: number) => { reads++; return id === 12 ? 1 : 0 }
  const admin = { userType: 'admin', id: '12' }
  assert.equal(await canAccessAdminPanel({ ...admin, role: 'SUPER_ADMIN' }, count), true)
  assert.equal(await canAccessAdminPanel({ ...admin, role: 'GERENTE' }, count), true)
  assert.equal(await canAccessAdminPanel({ ...admin, role: 'VISOR', roles: ['VENTAS'] }, count), true)
  assert.equal(reads, 0)
  assert.equal(await canAccessAdminPanel({ ...admin, role: 'VISOR', roles: [] }, count), true)
  assert.equal(await canAccessAdminPanel({ ...admin, id: '13', role: 'VISOR' }, count), false)
  assert.equal(await canAccessAdminPanel({ ...admin, id: 'bad' }, count), false)
  assert.equal(await canAccessAdminPanel({ ...admin, id: '12abc' }, count), false)
  assert.equal(await canAccessAdminPanel({ ...admin, userType: 'cliente', role: 'SUPER_ADMIN' }, count), false)
  assert.equal(reads, 2)

  const items = [
    { id: 1, estado: 'pendiente', tipo: 'mejora' },
    { id: 2, estado: 'pendiente_validacion', tipo: 'error' },
    { id: 3, estado: 'resuelta', tipo: 'mejora' },
    { id: 4, estado: 'ajustes_solicitados', tipo: 'sugerencia' },
  ]
  assert.equal(filtrarPeticiones(items, '', '').length, 4)
  assert.deepEqual(filtrarPeticiones(items, '', 'mejora').map(p => p.id), [1, 3])
  assert.deepEqual(filtrarPeticiones(items, 'pendiente_validacion', 'error').map(p => p.id), [2])
  assert.equal(filtrarPeticiones(items, 'pendiente', 'error').length, 0)
  assert.equal(filtrarPeticiones([], '', '').length, 0)
  assert.deepEqual(items.map(p => p.id), [1, 2, 3, 4])
  const page = fs.readFileSync('app/peticiones/page.tsx', 'utf8')
  assert.match(page, /min-h-screen bg-gray-50 text-gray-900/)
  assert.match(page, /colorScheme: 'light'/)
  assert.match(page, /href="\/empleado"/)
  assert.match(page, /id="peticiones-estado"/)
  assert.match(page, /id="peticiones-tipo"/)
  console.log('Peticiones: acceso coherente sin ampliar permisos, filtros combinados y superficie clara protegidos.')
}
main().catch(error => { console.error(error); process.exit(1) })
