import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyConciliarRuntime, conciliarClientSurfaceEnabled } from './conciliar-runtime'
import { easyOnlyRequestAllowed } from './easy-access-core'

const staging = {
  stagingSandbox: '1',
  vercelEnvironment: 'preview',
  databaseUrl: 'postgresql://io_staging_finanzas@example.invalid:5432/io_staging_finanzas',
}

const production = {
  stagingSandbox: '0',
  vercelEnvironment: 'production',
  easyProductionEnabled: '1',
  modelProductionEnabled: '1',
  automaticLinksDisabled: '1',
  conciliarProductionEnabled: '1',
  publicConciliarProductionEnabled: '1',
  databaseUrl: 'postgresql://postgres@yamanote.proxy.rlwy.net:34880/railway',
}

function withEnv<T>(values: Record<string, string | undefined>, run: () => T): T {
  const prior = new Map(Object.keys(values).map(key => [key, process.env[key]]))
  try {
    for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key] = value
    return run()
  } finally {
    for (const [key, value] of prior) value === undefined ? delete process.env[key] : process.env[key] = value
  }
}

test('Conciliar conserva staging aislado con los flags de producción apagados', () => {
  assert.equal(classifyConciliarRuntime(staging), 'staging')
  assert.equal(classifyConciliarRuntime({ ...staging, conciliarProductionEnabled: '1' }), 'staging')
  assert.equal(classifyConciliarRuntime({ ...staging, easyProductionEnabled: '1' }), null)
  assert.equal(conciliarClientSurfaceEnabled({ runtime: 'staging' }), true)
})

test('producción exige todos los opt-ins, incluida la bandera pública de presentación', () => {
  assert.equal(classifyConciliarRuntime(production), 'production')
  for (const input of [
    { ...production, conciliarProductionEnabled: undefined },
    { ...production, conciliarProductionEnabled: '0' },
    { ...production, publicConciliarProductionEnabled: undefined },
    { ...production, publicConciliarProductionEnabled: '0' },
    { ...production, easyProductionEnabled: '0' },
    { ...production, modelProductionEnabled: '0' },
    { ...production, automaticLinksDisabled: '0' },
    { ...production, productionReadOnly: '1' },
    { ...production, databaseUrl: 'postgresql://postgres@example.invalid:34880/not-railway' },
  ]) assert.equal(classifyConciliarRuntime(input), null)
  assert.equal(conciliarClientSurfaceEnabled({ runtime: 'production', publicConciliarProductionEnabled: '0' }), false)
  assert.equal(conciliarClientSurfaceEnabled({ runtime: 'production', publicConciliarProductionEnabled: '1' }), true)
})

test('el perfil efectivo MODO_FACIL_ONLY conserva el POST manual de Conciliar y no recibe prefijos nuevos', () => {
  withEnv({
    FINANCE_STAGING_SANDBOX: '0', VERCEL_ENV: 'production',
    FINANCE_EASY_PRODUCTION_ENABLED: '1', FINANCE_MODEL_PRODUCTION_ENABLED: '1',
    FINANCE_AUTOMATIC_LINKS_DISABLED: '1', FINANCE_CONCILIAR_PRODUCTION_ENABLED: '1',
    NEXT_PUBLIC_FINANCE_CONCILIAR_PRODUCTION_ENABLED: '1', IO_PRODUCTION_READ_ONLY: '0',
  }, () => {
    assert.equal(easyOnlyRequestAllowed('/admin/finanzas/conciliar', 'GET'), true)
    assert.equal(easyOnlyRequestAllowed('/api/admin/finanzas/conciliar', 'POST'), true)
    assert.equal(easyOnlyRequestAllowed('/api/admin/finanzas/conciliar', 'PATCH'), false)
    assert.equal(easyOnlyRequestAllowed('/api/admin/finanzas/conciliar/confirming-inventario', 'GET'), false)
    assert.equal(easyOnlyRequestAllowed('/api/admin/finanzas/conciliar/rebuild', 'POST'), false)
  })
})
