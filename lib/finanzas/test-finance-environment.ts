import test from 'node:test';
import assert from 'node:assert/strict';
import { financeEnvironment } from './finance-environment';

const staging = {
  stagingSandbox: '1',
  databaseUrl: 'postgresql://io_staging_finanzas@example.invalid:1234/io_staging_finanzas',
};
const production = {
  vercelEnvironment: 'production',
  productionEnabled: '1',
  automaticLinksDisabled: '1',
  databaseUrl: 'postgresql://postgres@yamanote.proxy.rlwy.net:34880/railway',
};

test('staging conserva su aislamiento explícito', () => {
  assert.equal(financeEnvironment(staging), 'staging');
});

test('sandbox no puede caer a producción aunque tenga ambas habilitaciones', () => {
  assert.equal(financeEnvironment({ ...production, stagingSandbox: '1' }), null);
});

test('producción exige entorno, habilitación y auto-vínculos bloqueados', () => {
  assert.equal(financeEnvironment(production), 'production');
  assert.equal(financeEnvironment({ ...production, productionEnabled: undefined }), null);
  assert.equal(financeEnvironment({ ...production, productionEnabled: 'true' }), null);
  assert.equal(financeEnvironment({ ...production, automaticLinksDisabled: undefined }), null);
  assert.equal(financeEnvironment({ ...production, automaticLinksDisabled: '0' }), null);
  assert.equal(financeEnvironment({ ...production, vercelEnvironment: 'preview' }), null);
});

test('producción exige host, puerto, base y usuario exactos', () => {
  for (const databaseUrl of [
    'postgresql://postgres@example.invalid:34880/railway',
    'postgresql://postgres@yamanote.proxy.rlwy.net:1234/railway',
    'postgresql://postgres@yamanote.proxy.rlwy.net:34880/otra',
    'postgresql://otro@yamanote.proxy.rlwy.net:34880/railway',
    'https://postgres@yamanote.proxy.rlwy.net:34880/railway',
  ]) assert.equal(financeEnvironment({ ...production, databaseUrl }), null);
});

test('referencias inexistentes o mal formadas se bloquean sin conectar', () => {
  assert.equal(financeEnvironment({}), null);
  assert.equal(financeEnvironment({ ...staging, databaseUrl: 'no URL' }), null);
});
