import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { canAccessAdminPanel } from '../lib/admin-panel-access'
import { readAdminPermissionsSsr, readAdminPermissionsSsrWithFallback } from '../lib/admin-permissions-ssr'
import {
  countReadableAdminPermissionSeeds,
  decideAdminPermissionSeedLoad,
  serializeAdminPermissionSsrSeed,
} from '../lib/admin-permissions-ssr-contract'

const seed = serializeAdminPermissionSsrSeed([
  {
    area: { codigo: 'admin.finanzas.conciliacion' },
    lectura: true,
    escritura: false,
  },
])

assert.deepEqual(seed, [{
  codigo: 'admin.finanzas.conciliacion',
  lectura: true,
  escritura: false,
}])
assert.equal(JSON.stringify(seed).includes('areaId'), false, 'La semilla no expone identificadores internos.')

assert.equal(decideAdminPermissionSeedLoad({
  actorId: 41,
  effectiveUserId: 41,
  initialPermissionsLoaded: true,
  skipPermissionLoad: false,
  isPrivilegedRealRole: false,
  isViewingAs: false,
  initialSeedInvalidated: false,
}), 'seed', 'Sólo el actor inicial no simulado puede reutilizar la semilla de esta respuesta.')

assert.equal(decideAdminPermissionSeedLoad({
  actorId: 41,
  effectiveUserId: 72,
  initialPermissionsLoaded: true,
  skipPermissionLoad: false,
  isPrivilegedRealRole: false,
  isViewingAs: true,
  initialSeedInvalidated: true,
}), 'fetch', 'Previsualizar otro usuario descarta la semilla y vuelve a leer.')

assert.equal(decideAdminPermissionSeedLoad({
  actorId: 41,
  effectiveUserId: 41,
  initialPermissionsLoaded: true,
  skipPermissionLoad: false,
  isPrivilegedRealRole: true,
  isViewingAs: false,
  initialSeedInvalidated: true,
}), 'fetch', 'Al salir de la previsualización no se restaura una ACL antigua.')

assert.equal(decideAdminPermissionSeedLoad({
  actorId: 41,
  effectiveUserId: 41,
  initialPermissionsLoaded: false,
  skipPermissionLoad: true,
  isPrivilegedRealRole: false,
  isViewingAs: false,
  initialSeedInvalidated: false,
}), 'skip', 'easyOnly puede omitir sólo la carga inicial inútil.')

assert.equal(decideAdminPermissionSeedLoad({
  actorId: 41,
  effectiveUserId: 41,
  initialPermissionsLoaded: false,
  skipPermissionLoad: false,
  isPrivilegedRealRole: true,
  isViewingAs: false,
  initialSeedInvalidated: false,
}), 'privileged', 'SUPER_ADMIN y GERENTE reales conservan su ruta visual inmediata.')

const deniedSeed = serializeAdminPermissionSsrSeed([
  { area: { codigo: 'admin.finanzas.conciliacion' }, lectura: false, escritura: true },
])
assert.equal(countReadableAdminPermissionSeeds(deniedSeed), 0, 'Escritura sin lectura no satisface la entrada al panel.')
async function run() {
  assert.equal(await canAccessAdminPanel(
    { id: 55, userType: 'admin', role: 'VISOR', roles: [] },
    async () => countReadableAdminPermissionSeeds(deniedSeed),
  ), false, 'Una ACL granular sin lectura conserva el rechazo del servidor.')

  const calls: unknown[] = []
  const readerSeed = await readAdminPermissionsSsr({
    permisoUsuario: {
      findMany: async (query: unknown) => {
        calls.push(query)
        return [{ area: { codigo: 'admin.finanzas.conciliacion' }, lectura: true, escritura: false }]
      },
    },
  } as any, 41)
  assert.deepEqual(readerSeed, seed, 'La lectura SSR devuelve sólo el contrato serializable de la respuesta actual.')
  assert.deepEqual(calls, [{
    where: { usuarioId: 41, area: { activo: true } },
    select: { lectura: true, escritura: true, area: { select: { codigo: true } } },
  }])
  assert.equal(await readAdminPermissionsSsr({ permisoUsuario: { findMany: async () => [] } } as any, 0), null)
  assert.equal(await readAdminPermissionsSsrWithFallback({
    permisoUsuario: { findMany: async () => { throw new Error('read failure') } },
  } as any, 41), null, 'El layout puede conservar su count() histórico si la foto falla.')

  const root = resolve(import.meta.dirname, '..')
  const ssrReader = readFileSync(resolve(root, 'lib/admin-permissions-ssr.ts'), 'utf8')
  const layout = readFileSync(resolve(root, 'app/admin/layout.tsx'), 'utf8')
  const conciliarPage = readFileSync(resolve(root, 'app/admin/finanzas/conciliar/page.tsx'), 'utf8')
  assert.match(ssrReader, /area:\s*\{ activo: true \}/)
  assert.match(ssrReader, /codigo:\s*true/)
  assert.doesNotMatch(ssrReader, /\b(?:cache|unstable_cache|revalidate|Map|TTL)\b/)
  assert.match(layout, /readAdminPermissionsSsrWithFallback/)
  assert.match(layout, /skipPermissionLoad=\{easyOnly\}/)
  assert.match(layout, /requireAuth\('admin'\)/)
  assert.match(conciliarPage, /requireB4FinanceAccess\('lectura'/)

  console.log('adminPermissionsSsr synthetic SSR seed, preview invalidation and negative ACL tests: ok')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
