import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyFinanceEasyProfileRuntime, classifyFinanceEasyRuntime } from './prototype-staging'

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
  databaseUrl: 'postgresql://postgres@yamanote.proxy.rlwy.net:34880/railway',
}

test('la promoción exige los tres opt-ins y la identidad URL exacta', () => {
  assert.equal(classifyFinanceEasyRuntime(staging), 'staging')
  assert.equal(classifyFinanceEasyRuntime(production), 'production')
  for (const input of [
    { ...production, easyProductionEnabled: '0' },
    { ...production, modelProductionEnabled: '0' },
    { ...production, automaticLinksDisabled: '0' },
    { ...production, stagingSandbox: '1' },
    { ...production, vercelEnvironment: 'preview' },
    { ...production, productionReadOnly: '1' },
    { ...production, databaseUrl: 'postgresql://postgres@example.invalid:34880/railway' },
    { ...production, databaseUrl: 'postgresql://postgres@yamanote.proxy.rlwy.net:5432/railway' },
    { ...production, databaseUrl: 'postgresql://postgres@yamanote.proxy.rlwy.net:34880/not-railway' },
    { ...production, databaseUrl: 'postgresql://another@yamanote.proxy.rlwy.net:34880/railway' },
  ]) assert.equal(classifyFinanceEasyRuntime(input), null)
})

test('staging mal etiquetado o mezclado con opt-ins de producción falla cerrado', () => {
  assert.equal(classifyFinanceEasyRuntime({ ...staging, easyProductionEnabled: '1' }), null)
  assert.equal(classifyFinanceEasyRuntime({ ...staging, modelProductionEnabled: '1' }), null)
  assert.equal(classifyFinanceEasyRuntime({ ...staging, databaseUrl: production.databaseUrl }), null)
})

test('la guarda de perfil conserva la restricción si un rollback deshabilita sólo la UI', () => {
  const rollback = { ...production, easyProductionEnabled: '0' }
  assert.equal(classifyFinanceEasyRuntime(rollback), null, 'El rollback oculta las superficies promovidas.')
  assert.equal(classifyFinanceEasyProfileRuntime(rollback), 'production', 'El perfil vivo sigue siendo comprobable y puede bloquear roles heredados.')
  assert.equal(classifyFinanceEasyProfileRuntime({ ...rollback, modelProductionEnabled: '0' }), null)
  assert.equal(classifyFinanceEasyProfileRuntime({ ...rollback, automaticLinksDisabled: '0' }), null)
  assert.equal(classifyFinanceEasyProfileRuntime({ ...rollback, databaseUrl: 'postgresql://postgres@example.invalid:34880/railway' }), null)
})

test('la clasificación no acepta hostname, petición ni protocolo no PostgreSQL', () => {
  assert.equal(classifyFinanceEasyRuntime({ ...production, databaseUrl: 'https://postgres@yamanote.proxy.rlwy.net:34880/railway' }), null)
  assert.equal(classifyFinanceEasyRuntime({}), null)
})
