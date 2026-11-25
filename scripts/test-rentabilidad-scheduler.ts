import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { rentabilidadAutomationStatus } from '../lib/rentabilidad/status';
import { historicalDraxtonRows } from '../app/admin/rentabilidad/view-model';
import { calculateReport } from '../lib/rentabilidad/report';

const env = { RENTABILIDAD_SCHEDULER: 'MANUS_SCHEDULE', RENTABILIDAD_SCHEDULE_ID: 'TEST-TASK', RENTABILIDAD_STAGING_CRON_SECRET: 'SYNTHETIC-ONLY-TOKEN', RENTABILIDAD_ENABLED: '1', FINANCE_STAGING_SANDBOX: '1', VERCEL_ENV: 'preview' };
test('registro de scheduler requiere todas las guardas y no acredita entrega futura', () => {
  const status = rentabilidadAutomationStatus([], env);
  assert.equal(status.scheduler.registered, true);
  assert.equal(status.scheduler.cron, '0 0 4 * * *');
  assert.equal(status.scheduler.timezone, 'Europe/Madrid');
  assert.equal(status.scheduler.lastExecutionAt, null);
  assert.equal(status.scheduler.latestInvocationIsNotFutureDeliveryProof, true);
  for (const key of Object.keys(env)) {
    assert.equal(rentabilidadAutomationStatus([], { ...env, [key]: key === 'VERCEL_ENV' ? 'production' : undefined }).scheduler.registered, false, key);
  }
});
test('última ejecución conserva resultado parcial e ignora otros procesos', () => {
  const runs = [{ process: 'DAILY_END', createdAt: '2026-11-23T03:00:00Z', payload: { estado: 'COMPLETADO' } }, { process: 'DAILY_END', createdAt: '2026-11-24T03:00:00Z', payload: { estado: 'PARCIAL' } }, { process: 'RECALCULATE', createdAt: '2026-11-24T04:00:00Z', payload: { estado: 'COMPLETADO' } }];
  const before = JSON.stringify(runs), status = rentabilidadAutomationStatus(runs, env);
  assert.equal(status.scheduler.lastResult, 'PARCIAL');
  assert.equal(status.scheduler.lastExecutionAt, '2026-11-24T03:00:00Z');
  assert.equal(JSON.stringify(runs), before);
  assert.equal(JSON.stringify(status).includes(env.RENTABILIDAD_STAGING_CRON_SECRET), false);
});
test('ISP configurado no se convierte en fuente verificada', () => {
  const status = rentabilidadAutomationStatus([], env);
  assert.equal(status.isp.contracts, false); assert.equal(status.isp.lines, false);
});
const reference = { key: 'SYNTHETIC-HISTORY', kind: 'draxton_contract_reference', title: 'Servicio sintético', referenceOnly: true, operationalImportAllowed: false, referenceContractedCost: '10.00', referenceBilledCost: '12.00', referenceDifference: '2.00', period: null, contractedSourceLocator: { file: 'synthetic.xlsx', sheet: 'Historia', cell: 'A1' }, billedSourceLocator: { file: 'synthetic.xlsx', sheet: 'Historia', cell: 'B1' } };
test('pares históricos se presentan solo con naturaleza de referencia y localizadores', () => {
  const before = JSON.stringify(reference), rows = historicalDraxtonRows([reference, { ...reference, referenceOnly: false }, { ...reference, operationalImportAllowed: true }, { ...reference, kind: 'recurrent_product' }]);
  assert.equal(rows.length, 1); assert.equal(rows[0].referenceContractedCost, 10); assert.equal(rows[0].referenceBilledCost, 12);
  assert.equal(rows[0].nature, 'REFERENCIA HISTÓRICA · NO REAL'); assert.equal(rows[0].actualCost, undefined);
  assert.equal(rows[0].contractedLocator, 'synthetic.xlsx → Historia!A1'); assert.equal(JSON.stringify(reference), before);
});
test('añadir referencia histórica no cambia resultado, contratos ni resumen recurrente', () => {
  const input = { contracts: [], lines: [], costs: [], rules: [], references: [], decisions: [] };
  const original = calculateReport(input, '2026-10');
  const changed = calculateReport({ ...input, references: [reference] }, '2026-10');
  for (const key of ['summary', 'products', 'monthly', 'contracts', 'comparison', 'referenceSummary']) assert.deepEqual(changed[key], original[key]);
  assert.equal(changed.references.length, 1);
});

const client = readFileSync(new URL('./run-rentabilidad-staging-daily.cjs', import.meta.url), 'utf8');
async function invoke(extra: Record<string, string | undefined> = {}, response: any = {}, state = 'PARCIAL') {
  const logs: string[] = [], calls: any[] = [];
  const process = { env: { RENTABILIDAD_SCHEDULER_TARGET: 'staging', RENTABILIDAD_STAGING_CRON_SECRET: 'SYNTHETIC-ONLY-TOKEN', ...extra }, exitCode: 0 };
  const data = { month: '2026-10', currentMonth: '2026-11', projection: { version: 1 }, currentProjection: { version: 1 }, isp: { estado: state, rows: 0 }, alerts: 3, ...response.data };
  const context = { process, URL, Buffer, Date, AbortSignal, console: { log: (s: string) => logs.push(s), error: (s: string) => logs.push(s) }, fetch: async (url: any, options: any) => { calls.push({ url: String(url), options }); return { status: response.status ?? 200, headers: new Headers({ 'content-type': response.contentType ?? 'application/json' }), text: async () => response.text ?? JSON.stringify(data) }; } };
  vm.runInNewContext(client, context);
  await new Promise(resolve => setImmediate(resolve));
  return { logs, calls, code: process.exitCode };
}
test('invocador usa solo HTTPS staging, GET Bearer y no sigue redirecciones', async () => {
  const result = await invoke(); assert.equal(result.code, 2); assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].url, 'https://staging.internetoperadores.com/api/cron/rentabilidad-daily');
  assert.equal(result.calls[0].options.method, 'GET'); assert.equal(result.calls[0].options.redirect, 'manual');
  assert.equal(JSON.stringify(result.logs).includes('SYNTHETIC-ONLY-TOKEN'), false);
  assert.equal(JSON.parse(result.logs[0]).ispState, 'PARCIAL');
});
test('sin target o sin secreto no se hace ninguna petición', async () => {
  for (const extra of [{ RENTABILIDAD_SCHEDULER_TARGET: 'production' }, { RENTABILIDAD_STAGING_CRON_SECRET: undefined }]) {
    const result = await invoke(extra); assert.equal(result.code, 1); assert.equal(result.calls.length, 0);
  }
});
test('302 no se sigue ni se publica el cuerpo de upstream', async () => {
  const result = await invoke({}, { status: 302, text: 'SENSITIVE-UPSTREAM-CONTENT' });
  assert.equal(result.code, 1); assert.deepEqual(result.logs, ['STAGING_DAILY_HTTP_302']);
});
test('rechaza HTML, respuesta demasiado grande y proyección incompleta', async () => {
  for (const response of [{ contentType: 'text/html' }, { text: 'x'.repeat(65537) }, { data: { currentProjection: null } }]) assert.equal((await invoke({}, response)).code, 1);
});
test('completado y provisional preservan metadatos, no datos de factura', async () => {
  for (const state of ['COMPLETADO', 'PROVISIONAL']) {
    const result = await invoke({}, { data: { sensitive: 'NOT-TO-LOG' } }, state);
    assert.equal(result.code, 0); assert.equal(result.logs[0].includes('NOT-TO-LOG'), false);
  }
});

test('API y SSR conservan el estado vivo, sin el decorador estático antiguo', async () => {
  const { decorateReport } = await import('../app/api/admin/rentabilidad/_shared');
  const syncStatus = rentabilidadAutomationStatus([], env);
  assert.deepEqual(decorateReport({ runs: [], syncStatus }).syncStatus, syncStatus);
  const page = readFileSync(new URL('../app/admin/rentabilidad/page.tsx', import.meta.url), 'utf8');
  assert.ok(page.includes('syncStatus: report.syncStatus ?? rentabilidadAutomationStatus(report.runs ?? [])'));
  assert.equal(page.includes('scheduled: false'), false);
});
