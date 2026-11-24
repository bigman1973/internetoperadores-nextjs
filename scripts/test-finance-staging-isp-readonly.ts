import assert from 'node:assert/strict'
import test from 'node:test'
import { createProviderFactory } from '../lib/finanzas/sync-jobs/runtime'
import { EmptyStagingProvider } from '../lib/finanzas/sync-jobs/staging-provider'
import { readOnlyStagingIspProvider } from '../lib/finanzas/sync-jobs/staging-isp-readonly'
import type { SyncProvider } from '../lib/finanzas/sync-jobs/types'

const calls: string[] = []
const real: SyncProvider = {
  async inventory(checkpoint) { calls.push('inventory'); return { items: [], checkpoint, complete: true } },
  async prepare() { calls.push('prepare'); return { ok: true } },
  async apply() { calls.push('apply'); return 'CREADA' as any },
}
const base = { FINANCE_STAGING_SANDBOX: '1' }

test('staging sin la bandera sigue usando el proveedor vacío, aunque haya fábrica ISP', () => {
  const f = createProviderFactory({ env: base, stagingIsolationVerified: true, stagingIspFactory: () => real })
  assert.ok(f('ISP') instanceof EmptyStagingProvider)
})

test('staging con la bandera usa el MISMO proveedor ISP que producción en solo lectura', async () => {
  calls.length = 0
  const f = createProviderFactory({ env: { ...base, FINANCE_STAGING_ISP_READONLY: '1' }, stagingIsolationVerified: true, stagingIspFactory: () => real })
  const p = f('ISP')
  assert.ok(!(p instanceof EmptyStagingProvider))
  await p.inventory(null); await p.prepare({ key: 'k' } as any)
  assert.deepEqual(calls, ['inventory', 'prepare'])
  assert.equal(await p.apply({} as any, { key: 'k' } as any, {}, 1), 'SIN_CAMBIOS')
  assert.ok(!calls.includes('apply'), 'apply del proveedor real nunca se ejecuta en staging')
})

test('OneDrive en staging sigue vacío aunque la bandera ISP esté activa', () => {
  const f = createProviderFactory({ env: { ...base, FINANCE_STAGING_ISP_READONLY: '1' }, stagingIsolationVerified: true, stagingIspFactory: () => real })
  assert.ok(f('ONEDRIVE') instanceof EmptyStagingProvider)
})

test('sin aislamiento verificado no se construye ningún proveedor', () => {
  assert.throws(() => createProviderFactory({ env: { ...base, FINANCE_STAGING_ISP_READONLY: '1' }, stagingIspFactory: () => real }), /STAGING_ISOLATION_REQUIRED/)
})

test('un error de ISP en el inventario se propaga tal cual (mismo código que producción)', async () => {
  const failing: SyncProvider = { ...real, async inventory() { const e: any = new Error('x'); e.code = 'ISP_API_LICENCIA_NO_CONTRATADA'; throw e } }
  await assert.rejects(() => readOnlyStagingIspProvider(failing).inventory(null), (e: any) => e.code === 'ISP_API_LICENCIA_NO_CONTRATADA')
})

test('en producción la bandera de staging no tiene efecto', () => {
  const f = createProviderFactory({ env: { VERCEL_ENV: 'production', FINANCE_BACKGROUND_SYNC_ENABLED: '1', FINANCE_ISP_SYNC_ENABLED: '1', FINANCE_STAGING_ISP_READONLY: '1' }, productionFactory: () => real, stagingIspFactory: () => { throw new Error('no debe usarse') } })
  assert.equal(f('ISP'), real)
})
