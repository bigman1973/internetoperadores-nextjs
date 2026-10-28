import assert from 'node:assert/strict';
const keys = ['FINANCE_STAGING_SANDBOX','FINANCE_CONCILIAR_PRODUCTION_ENABLED','FINANCE_CONCILIAR_INLINE_CSS_ENABLED'];
const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
try {
  for (const key of keys) delete process.env[key];
  process.env.FINANCE_STAGING_SANDBOX = '1';
  const { default: staging } = await import('../next.config.mjs?inline-staging');
  assert.equal(staging.experimental.inlineCss, true);
  assert.equal(staging.experimental.cpus, 1);
  assert.equal(staging.experimental.serverActions.bodySizeLimit, '50mb');
  delete process.env.FINANCE_STAGING_SANDBOX;
  const { default: disabled } = await import('../next.config.mjs?inline-disabled');
  assert.equal(disabled.experimental.inlineCss, false);
  process.env.FINANCE_CONCILIAR_INLINE_CSS_ENABLED = '1';
  const { default: alone } = await import('../next.config.mjs?inline-alone');
  assert.equal(alone.experimental.inlineCss, false);
  process.env.FINANCE_CONCILIAR_PRODUCTION_ENABLED = '1';
  const { default: approved } = await import('../next.config.mjs?inline-approved');
  assert.equal(approved.experimental.inlineCss, true);
  assert.equal(process.env.FINANCE_STAGING_SANDBOX, undefined);
  assert.deepEqual(approved.serverExternalPackages, staging.serverExternalPackages);
  assert.deepEqual(await approved.headers(), await staging.headers());
  assert.deepEqual(approved.images, staging.images);
  console.log('OK: staging conservado; producción requiere dos opt-ins independientes del sandbox; headers, APIs y paquetes intactos.');
} finally {
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}
