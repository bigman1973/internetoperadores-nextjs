import assert from 'node:assert/strict';

const previous = process.env.FINANCE_STAGING_SANDBOX;
try {
  process.env.FINANCE_STAGING_SANDBOX = '1';
  const { default: staging } = await import('../next.config.mjs?inline-staging');
  assert.equal(staging.experimental.inlineCss, true);
  assert.equal(staging.experimental.cpus, 1);
  assert.equal(staging.experimental.serverActions.bodySizeLimit, '50mb');
  delete process.env.FINANCE_STAGING_SANDBOX;
  const { default: production } = await import('../next.config.mjs?inline-production');
  assert.equal(production.experimental.inlineCss, false);
  assert.deepEqual(production.serverExternalPackages, staging.serverExternalPackages);
  assert.deepEqual(await production.headers(), await staging.headers());
  assert.deepEqual(production.images, staging.images);
  console.log('OK: CSS inline sólo en el build de staging; headers, APIs, paquetes y producción intactos.');
} finally {
  if (previous === undefined) delete process.env.FINANCE_STAGING_SANDBOX;
  else process.env.FINANCE_STAGING_SANDBOX = previous;
}
