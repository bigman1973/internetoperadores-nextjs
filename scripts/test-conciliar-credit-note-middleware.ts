import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync('middleware.js', 'utf8')
const start = source.indexOf('function financeAreas(pathname) {')
const end = source.indexOf('\nexport async function middleware(', start)
assert.ok(start >= 0 && end > start, 'Debe probarse el mapa real del middleware')
const code = source.slice(start, end) + '\nfinanceAreas'
function areas(path: string, sandbox?: string): string[] {
  const result = runInNewContext(code, { process: { env: { FINANCE_STAGING_SANDBOX: sandbox } } })(path)
  return Array.from(result)
}
const route = '/api/admin/finanzas/rectificativas'
assert.deepEqual(areas(route, '1'), ['admin.finanzas.conciliacion'])
for (const sandbox of [undefined, '0', 'true']) assert.deepEqual(areas(route, sandbox), [])
for (const suffix of ['/otra', '/confirmar', '-no-revisado', '/']) assert.deepEqual(areas(route + suffix, '1'), [])
assert.deepEqual(areas('/api/admin/finanzas/conciliar', '1'), ['admin.finanzas.conciliacion'])
assert.deepEqual(areas('/api/admin/finanzas/usuarios-no-registrado', '1'), [])
console.log('PASS: mapa real, ruta exacta y staging; no se amplían permisos ni prefijos')
