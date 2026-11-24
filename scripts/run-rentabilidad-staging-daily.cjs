#!/usr/bin/env node
'use strict';

// This is a scheduler client, not a database writer or an ISP credential store.
// Run with RENTABILIDAD_STAGING_CRON_SECRET supplied by the scheduler environment.
const HOST = 'https://staging.internetoperadores.com';
const ROUTE = '/api/cron/rentabilidad-daily';

async function main() {
  if (process.env.RENTABILIDAD_SCHEDULER_TARGET !== 'staging') {
    throw new Error('STAGING_TARGET_REQUIRED');
  }
  const secret = process.env.RENTABILIDAD_STAGING_CRON_SECRET;
  if (!secret || secret.length < 16 || /[\r\n]/.test(secret)) {
    throw new Error('CRON_ENV_REQUIRED');
  }
  const endpoint = new URL(ROUTE, HOST);
  if (endpoint.origin !== HOST || endpoint.pathname !== ROUTE) {
    throw new Error('STAGING_ENDPOINT_REQUIRED');
  }
  const started = Date.now();
  const response = await fetch(endpoint, {
    method: 'GET',
    redirect: 'manual',
    headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(330_000),
  });
  if (response.status !== 200) {
    // Do not echo upstream bodies, URLs or headers, which might contain secrets.
    throw new Error(`STAGING_DAILY_HTTP_${response.status}`);
  }
  if (!(response.headers.get('content-type') || '').includes('application/json')) {
    throw new Error('STAGING_DAILY_NOT_JSON');
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > 64 * 1024) throw new Error('STAGING_DAILY_RESPONSE_TOO_LARGE');
  const result = JSON.parse(text);
  if (!result.currentMonth || !result.currentProjection || !result.projection) {
    throw new Error('STAGING_DAILY_RESULT_INCOMPLETE');
  }
  const known = value => ['COMPLETADO', 'PROVISIONAL', 'REVISION', 'PARCIAL', 'BLOQUEADO', 'ERROR'].includes(value) ? value : 'DESCONOCIDO';
  console.log(JSON.stringify({
    target: 'staging',
    completedAt: new Date().toISOString(),
    seconds: (Date.now() - started) / 1000,
    month: result.month,
    currentMonth: result.currentMonth,
    ispState: known(result.isp?.estado),
    rows: Number.isSafeInteger(result.isp?.rows) ? result.isp.rows : null,
    alerts: Number.isSafeInteger(result.alerts) ? result.alerts : null,
    previousVersion: result.projection.version,
    currentVersion: result.currentProjection.version,
    closeVersion: result.close?.version ?? null,
    scheduler: 'MANUS_SCHEDULE',
    notifications: 'PANEL_ONLY',
  }));
  // A successful HTTP invocation is not a claim that a blocked ISP feed succeeded.
  if (!['COMPLETADO', 'PROVISIONAL'].includes(result.isp?.estado)) process.exitCode = 2;
}

main().catch(error => {
  const reason = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
    ? error.message : 'STAGING_DAILY_REQUEST_FAILED';
  console.error(reason);
  process.exitCode = 1;
});
