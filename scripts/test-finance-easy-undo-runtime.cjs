'use strict';
/**
 * Offline integration harness: real handler, runtime fence, B4 authorization,
 * permisos/Area4 policy, undo service, B4 undo and pure cancellation core.
 * Only session resolution and Prisma persistence are in-memory boundaries.
 * No dotenv, PrismaClient, secrets, HTTP request, socket or provider is loaded.
 * PostgreSQL locks/triggers/isolation and real session cookies are NOT proved here.
 * Run: node scripts/test-finance-easy-undo-runtime.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const ts = require(path.join(repo, 'node_modules/typescript'));
const { Prisma } = require(path.join(repo, 'node_modules/@prisma/client'));
const { NextResponse } = require(path.join(repo, 'node_modules/next/server'));
const ACTOR = 41;
const production = () => ({ VERCEL_ENV: 'production', FINANCE_MODEL_PRODUCTION_ENABLED: '1', FINANCE_EASY_PRODUCTION_ENABLED: '1', FINANCE_AUTOMATIC_LINKS_DISABLED: '1', DATABASE_URL: 'postgresql://postgres@yamanote.proxy.rlwy.net:34880/railway' });
const staging = () => ({ VERCEL_ENV: 'preview', FINANCE_STAGING_SANDBOX: '1', DATABASE_URL: 'postgresql://io_staging_finanzas@127.0.0.1:5432/io_staging_finanzas' });
const clone = value => structuredClone(value);
const json = value => JSON.parse(JSON.stringify(value));
const equal = (actual, expected, message) => assert.deepEqual(json(actual), json(expected), message);
const forbidden = name => () => { throw new Error(`UNAUTHORIZED_BOUNDARY:${name}`); };
const realFiles = new Set([
  'app/api/admin/finanzas/modo-facil/deshacer/route.ts',
  'lib/finanzas/prototype-staging.ts', 'lib/finanzas/reconciliation-auth.ts',
  'lib/finanzas/easy-reconciliation-undo.ts', 'lib/finanzas/reconciliation-db.ts',
  'lib/finanzas/reconciliation-core.ts', 'lib/finanzas/centros-coste-core.ts',
  'lib/permisos.ts', 'lib/area4/policy.ts', 'lib/area4/section-registry.ts',
  'lib/area4/surface-access-contract.ts', 'lib/impuestos/auth-permisos.ts',
]);
function harness(options = {}) {
  const env = { ...(options.environment || production()) }; // Never inherit host env.
  const operationId = randomUUID(), movementId = randomUUID(), documentId = randomUUID();
  const lineId = randomUUID(), key = randomUUID();
  const withLine = options.withLine !== false;
  const prior = { estado: 'SIN_DOCUMENTO', motivoNoRequiere: null, version: 1 };
  let state = {
    movement: { id: movementId, importe: withLine ? 12.34 : -0.01, conciliado: false, pendienteFactura: false, facturaEmitidaId: null },
    document: { id: documentId, activo: true, importeObjetivoCentimos: 1234 },
    current: { movimientoId: movementId, estado: withLine ? 'JUSTIFICADO' : 'NO_REQUIERE', motivoNoRequiere: withLine ? null : 'COMISION_BANCARIA', version: 2 },
    operations: [{ id: operationId, movimientoId: movementId, estado: 'APLICADA', versionResultante: 2, revierteOperacionId: null, revertidaAt: null, solicitadaPorId: ACTOR, idempotencyKey: randomUUID(), payloadHash: 'synthetic-confirmation', snapshotEstadoPrevio: prior, snapshotResultado: { version: 2 } }],
    lines: withLine ? [{ id: lineId, movimientoId: movementId, documentoConciliableId: documentId, operacionCreacionId: operationId, importeCentimos: 1234, activo: true, operacionAnulacionId: null }] : [],
    events: [{ id: randomUUID(), operacionId: operationId, accion: 'APLICACION', actorId: ACTOR }],
    receipt: { actorId: options.foreignReceipt ? ACTOR + 1 : ACTOR, accion: withLine ? 'confirmar_factura' : 'no_requiere', operacionId: operationId },
  };
  const counters = { identityMain: 0, identityTx: 0, sessions: 0, admins: 0, transactions: 0, writes: 0, receiptLocks: 0 };
  const trace = [];
  const permissions = { lectura: options.read !== false, escritura: options.write !== false };
  let active = options.active !== false;
  const identityFor = source => {
    if (source === 'tx' && Object.hasOwn(options, 'txIdentity')) return options.txIdentity;
    if (Object.hasOwn(options, 'identity')) return options.identity;
    return env.FINANCE_STAGING_SANDBOX === '1'
      ? { database_name: 'io_staging_finanzas', database_user: 'io_staging_finanzas' }
      : { database_name: 'railway', database_user: 'postgres' };
  };
  function client(source, getState) {
    const write = () => { counters.writes++; trace.push(`${source}:write`); };
    return {
      async $queryRaw(first, ...values) {
        const sql = Array.isArray(first) ? Prisma.sql(first, ...values) : first;
        const statement = sql.sql.replace(/\s+/g, ' ').trim();
        const params = sql.values;
        if (statement.includes('current_database()')) {
          counters[source === 'tx' ? 'identityTx' : 'identityMain']++;
          trace.push(`${source}:identity`);
          return clone(identityFor(source)) === null ? [] : [clone(identityFor(source))];
        }
        const s = getState();
        if (statement.includes('JOIN recibos_modo_facil')) {
          counters.receiptLocks++;
          trace.push(`${source}:receipt`);
          if (options.revokeAtReceipt) active = false;
          const operation = s.operations.find(row => row.id === params[0]);
          if (!operation || !s.receipt || s.receipt.operacionId !== operation.id || s.receipt.actorId !== params[1] || !['confirmar_factura', 'no_requiere'].includes(s.receipt.accion)) return [];
          return [{ id: operation.id, movimiento_id: movementId, version_resultante: operation.versionResultante, receipt_actor_id: s.receipt.actorId }];
        }
        if (statement.includes('pg_advisory_xact_lock')) { trace.push(`${source}:advisory`); return [{ locked: '' }]; }
        if (statement.startsWith('SELECT id FROM movimientos_bancarios')) return params[0] === movementId ? [{ id: movementId }] : [];
        if (statement.startsWith('SELECT id FROM documentos_conciliables')) return params[0] === documentId ? [{ id: documentId }] : [];
        if (statement.includes('FROM vinculos_movimiento_documento')) return s.lines.filter(line => line.operacionCreacionId === params[0]).sort((a, b) => a.id.localeCompare(b.id)).map(line => ({ id: line.id, importe_centimos: line.importeCentimos }));
        throw new Error(`UNHANDLED_MEMORY_SQL:${statement}`);
      },
      usuarioAdmin: { async findUnique({ where }) {
        counters.admins++; trace.push(`${source}:acl`);
        return where.id === ACTOR ? { id: ACTOR, activo: active, rol: 'OPERADOR', roles: [], permisosArea4Vivos: true } : null;
      } },
      permisoArea: { async findUnique() { return { activo: true }; } },
      permisoUsuario: {
        async findMany() { return [{ ...permissions, confirmar: false, exportar: false, area: { codigo: 'admin.finanzas.conciliacion' } }]; },
        async count() { return 1; }, // No legacy-role fallback hides denied facets.
      },
      operacionJustificacionB4: {
        async findUnique({ where }) {
          const rows = getState().operations;
          if (where.id) return clone(rows.find(row => row.id === where.id) || null);
          const pair = where.solicitadaPorId_idempotencyKey;
          return clone(rows.find(row => row.solicitadaPorId === pair.solicitadaPorId && row.idempotencyKey === pair.idempotencyKey) || null);
        },
        async create({ data }) {
          if (options.conflict) { const error = new Error('Synthetic concurrency failure'); error.code = options.conflict; throw error; }
          write(); const row = { ...clone(data), id: randomUUID(), revertidaAt: null }; getState().operations.push(row); return clone(row);
        },
        async update({ where, data }) { write(); const row = getState().operations.find(row => row.id === where.id); assert(row); Object.assign(row, clone(data)); return clone(row); },
      },
      estadoJustificacionMovimientoB4: {
        async findUnique() { return clone(getState().current); },
        async update({ data }) { write(); Object.assign(getState().current, clone(data)); return clone(getState().current); },
      },
      vinculoMovimientoDocumento: {
        async findMany({ where }) { return clone(getState().lines.filter(row => row.operacionCreacionId === where.operacionCreacionId && (!('activo' in where) || row.activo === where.activo))); },
        async updateMany({ where, data }) { write(); const rows = getState().lines.filter(row => where.id.in.includes(row.id) && row.activo === where.activo); rows.forEach(row => Object.assign(row, clone(data))); return { count: rows.length }; },
      },
      eventoJustificacionB4: { async createMany({ data }) { write(); getState().events.push(...data.map(row => ({ ...clone(row), id: randomUUID() }))); return { count: data.length }; } },
    };
  }
  const database = client('main', () => state);
  database.$transaction = async (work, transactionOptions) => {
    counters.transactions++; trace.push('main:transaction');
    assert.equal(transactionOptions.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
    const draft = clone(state), tx = client('tx', () => draft);
    const result = await work(tx); state = draft; return result; // Rejection discards draft.
  };
  const sandbox = vm.createContext({ console, process: { env }, URL, Headers, TextDecoder, Buffer });
  const cache = new Map();
  class UnusedBoundaryError extends Error {}
  const boundaries = {
    '@prisma/client': { Prisma },
    'react': require(path.join(repo, 'node_modules/react')),
    'node:crypto': require('node:crypto'),
    'next/server': { NextResponse },
    'next-auth': { async getServerSession() { counters.sessions++; return options.noSession ? null : { user: { id: String(ACTOR), userType: options.nonAdmin ? 'client' : 'admin' } }; } },
    '@/lib/auth': { authOptions: {} },
    '@/lib/prisma': { __esModule: true, default: database },
    '@/lib/finanzas/archivo-financiero-assert': { ArchivoFinancieroAssertError: UnusedBoundaryError, assertArchivosFinancierosParaNuevoCargoJustificadoTx: forbidden('archivo') },
    '@/lib/finanzas/invoice-economic-filter': {},
    '@/lib/finanzas/finance-runtime-safety': { assertFinanceRuntimeReady: forbidden('legacy-runtime') },
    '@/lib/finanzas/centros-coste-db': { B8CentroCosteServiceError: UnusedBoundaryError, applyChoicesB8: forbidden('B8-write'), assertB8ChoiceReceiptReplayTx: forbidden('B8-replay') },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    assert(realFiles.has(file), `Source not authorized: ${file}`);
    const source = fs.readFileSync(path.join(repo, file), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const module = { exports: {} }; cache.set(file, module);
    const localRequire = name => {
      if (Object.hasOwn(boundaries, name)) return boundaries[name];
      const target = name.startsWith('@/') ? name.slice(2) : name.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), name)) : null;
      if (!target) throw new Error(`IMPORT_NOT_AUTHORIZED:${name}`);
      return load(`${target}.ts`);
    };
    vm.runInContext(`(function(require,module,exports){${output}\n})`, sandbox, { filename: file })(localRequire, module, module.exports);
    return module.exports;
  }
  const guard = load('lib/finanzas/prototype-staging.ts');
  const service = load('lib/finanzas/easy-reconciliation-undo.ts');
  const route = load('app/api/admin/finanzas/modo-facil/deshacer/route.ts');
  const payload = { action: 'deshacer', confirmacion: true, operacionId: operationId, idempotencyKey: key };
  const realm = value => vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(value))})`, sandbox);
  const economic = () => ({ movement: clone(state.movement), estado: state.current.estado, motivoNoRequiere: state.current.motivoNoRequiere, pendientes: state.current.estado === 'SIN_DOCUMENTO' ? 1 : 0, justificado: state.current.estado === 'JUSTIFICADO', activos: state.lines.filter(line => line.activo).map(line => ({ id: line.id, importeCentimos: line.importeCentimos })), document: clone(state.document), asignado: state.lines.filter(line => line.activo).reduce((sum, line) => sum + line.importeCentimos, 0) });
  async function post(body = payload, requestOptions = {}) {
    const headers = new Headers({ origin: 'https://undo.invalid', 'content-type': 'application/json', ...(requestOptions.headers || {}) });
    const bytes = requestOptions.raw === undefined ? Buffer.from(JSON.stringify(body)) : Buffer.from(requestOptions.raw);
    const request = { headers, nextUrl: new URL('https://undo.invalid/api/admin/finanzas/modo-facil/deshacer'), body: requestOptions.empty ? null : new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) };
    const response = await route.POST(request);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    return { status: response.status, body: await response.json() };
  }
  return { guard, service, route, payload, counters, trace, post, realm, env, economic, get state() { return clone(state); }, tx: client('tx', () => state), setActive(value) { active = value; }, setPermissions(value) { Object.assign(permissions, value); } };
}
const passed = [];
async function check(name, work) { await work(); passed.push(name); }
async function rejectedWithoutWrite(name, options, bodyOptions, status, code) {
  await check(name, async () => {
    const h = harness(options), before = h.state;
    const response = await h.post(bodyOptions?.body ? bodyOptions.body(h.payload) : h.payload, bodyOptions?.request);
    assert.equal(response.status, status, `${name}: status`);
    if (code) assert.equal(response.body.codigo, code, `${name}: code`);
    equal(h.state, before, `${name}: no persisted mutation`);
    assert.equal(h.counters.writes, 0, `${name}: no attempted writes`);
    if (status === 404 && code === 'FINANCE_EASY_RUNTIME_DISABLED' && !options.txIdentity) {
      assert.equal(h.counters.sessions, 0); assert.equal(h.counters.admins, 0); assert.equal(h.counters.transactions, 0);
    }
  });
}
async function run() {
  for (const [runtime, environment] of [['production', production()], ['staging', staging()]]) {
    for (const withLine of [true, false]) await check(`${runtime}:${withLine ? 'confirmar_factura-fixture' : 'no_requiere-fixture'}:undo+same-key-replay`, async () => {
      const h = harness({ environment, withLine });
      const expected = { ...h.economic(), estado: 'SIN_DOCUMENTO', motivoNoRequiere: null, pendientes: 1, justificado: false, activos: [], asignado: 0 };
      const confirmationEvents = h.state.events;
      equal(await h.guard.assertFinanceEasyRuntime(), { runtime, stagingOnly: runtime === 'staging' });
      const result = await h.post();
      equal(result, { status: 200, body: { ok: true, idempotente: false } });
      equal(h.economic(), expected, 'Business effect returns to synthetic pre-confirmation state');
      assert.equal(h.state.current.version, 3);
      assert.equal(h.state.operations.length, 2);
      assert.equal(h.state.events.length, confirmationEvents.length + 3);
      equal(h.state.events.slice(0, confirmationEvents.length), confirmationEvents, 'Existing audit events are unchanged');
      assert.equal(h.state.operations[0].estado, 'REVERTIDA');
      if (withLine) { assert.equal(h.state.lines[0].activo, false); assert.equal(h.state.lines[0].operacionAnulacionId, h.state.operations[1].id); }
      const undone = h.state, writes = h.counters.writes;
      equal(await h.post(), { status: 200, body: { ok: true, idempotente: true } });
      equal(h.state, undone, 'Same key does not write even audit/version a second time');
      assert.equal(h.counters.writes, writes);
      const changedKey = await h.post({ ...h.payload, idempotencyKey: randomUUID() });
      assert.equal(changedKey.status, 409); assert.equal(changedKey.body.codigo, 'OPERACION_NO_REVERSIBLE');
      equal(h.state, undone);
      assert(h.counters.identityTx >= 3, 'Each owned transaction uses its own identity client');
      assert(h.trace.indexOf('main:identity') < h.trace.indexOf('main:acl'));
      assert(h.trace.indexOf('tx:identity') < h.trace.indexOf('tx:receipt'));
      assert(h.trace.lastIndexOf('main:acl') > h.trace.indexOf('tx:receipt'), 'Live ACL is re-read after locking receipt');
    });
  }
  for (const flag of ['FINANCE_EASY_PRODUCTION_ENABLED', 'FINANCE_MODEL_PRODUCTION_ENABLED', 'FINANCE_AUTOMATIC_LINKS_DISABLED']) {
    await rejectedWithoutWrite(`closed-flag:${flag}`, { environment: { ...production(), [flag]: '0' } }, null, 404, 'FINANCE_EASY_RUNTIME_DISABLED');
  }
  await rejectedWithoutWrite('production-readonly', { environment: { ...production(), IO_PRODUCTION_READ_ONLY: '1' } }, null, 404, 'FINANCE_EASY_RUNTIME_DISABLED');
  await rejectedWithoutWrite('staging-mislabelled-production', { environment: { ...staging(), VERCEL_ENV: 'production' } }, null, 404, 'FINANCE_EASY_RUNTIME_DISABLED');
  await rejectedWithoutWrite('wrong-configured-host', { environment: { ...production(), DATABASE_URL: 'postgresql://postgres@wrong.invalid:34880/railway' } }, null, 404, 'FINANCE_EASY_RUNTIME_DISABLED');
  for (const identity of [{ database_name: 'wrong', database_user: 'postgres' }, { database_name: 'railway', database_user: 'wrong' }, null]) await rejectedWithoutWrite(`live-identity:${JSON.stringify(identity)}`, { identity }, null, 404, 'FINANCE_EASY_RUNTIME_DISABLED');
  await rejectedWithoutWrite('wrong-owned-transaction-identity', { txIdentity: { database_name: 'wrong', database_user: 'postgres' } }, null, 404, 'FINANCE_EASY_RUNTIME_DISABLED');
  await rejectedWithoutWrite('no-session', { noSession: true }, null, 401);
  await rejectedWithoutWrite('non-admin-session', { nonAdmin: true }, null, 401);
  await rejectedWithoutWrite('revoked-admin', { active: false }, null, 401);
  await rejectedWithoutWrite('write-denied', { write: false }, null, 403);
  await rejectedWithoutWrite('read-denied-write-granted', { read: false }, null, 403, 'ACCESS_REVOKED');
  await rejectedWithoutWrite('revocation-immediately-before-B4', { revokeAtReceipt: true }, null, 401, 'ACCESS_REVOKED');
  await rejectedWithoutWrite('foreign-receipt-not-disclosed', { foreignReceipt: true }, null, 404, 'OPERACION_MODO_FACIL_NO_ENCONTRADA');
  await rejectedWithoutWrite('missing-receipt-not-adopted', {}, { body: payload => ({ ...payload, operacionId: randomUUID() }) }, 404, 'OPERACION_MODO_FACIL_NO_ENCONTRADA');
  await rejectedWithoutWrite('csrf-origin', {}, { request: { headers: { origin: 'https://foreign.invalid' } } }, 403);
  await rejectedWithoutWrite('csrf-origin-missing', {}, { request: { headers: { origin: '' } } }, 403);
  for (const extra of [{ version: 2 }, { movimientoId: randomUUID() }, { lineas: [] }, { actorId: ACTOR + 1 }]) await rejectedWithoutWrite(`closed-body:${Object.keys(extra)[0]}`, {}, { body: payload => ({ ...payload, ...extra }) }, 400, 'VALIDATION_ERROR');
  await rejectedWithoutWrite('explicit-confirmation-required', {}, { body: payload => ({ ...payload, confirmacion: false }) }, 422, 'CONFIRMACION_REQUERIDA');
  await rejectedWithoutWrite('invalid-idempotency-uuid', {}, { body: payload => ({ ...payload, idempotencyKey: 'invalid' }) }, 400, 'VALIDATION_ERROR');
  for (const [name, request, status] of [
    ['wrong-content-type', { headers: { 'content-type': 'text/plain' } }, 415],
    ['oversized-declared', { headers: { 'content-length': '16385' } }, 413],
    ['oversized-stream', { raw: ' '.repeat(16385) }, 413],
    ['malformed-json', { raw: '{' }, 400], ['array-json', { raw: '[]' }, 400], ['empty-body', { empty: true }, 400],
  ]) await rejectedWithoutWrite(name, {}, { request }, status);
  for (const code of ['P2034', 'P2002']) await check(`retry:${code}:same-key`, async () => {
    const options = { conflict: code }, h = harness(options), before = h.state;
    const failed = await h.post();
    assert.equal(failed.status, 409); assert.equal(failed.body.codigo, 'CONCURRENT_CONFLICT'); equal(h.state, before);
    options.conflict = null;
    equal(await h.post(), { status: 200, body: { ok: true, idempotente: false } });
    const undone = h.state;
    equal(await h.post(), { status: 200, body: { ok: true, idempotente: true } }); equal(h.state, undone);
  });
  for (const environment of [production(), staging()]) await check(`caller-owned-Tx:${environment.VERCEL_ENV}`, async () => {
    const h = harness({ environment });
    equal(await h.service.undoEasyTx(h.tx, ACTOR, h.realm(h.payload)), { ok: true, idempotente: false });
    assert.equal(h.counters.identityMain, 0, 'Tx variant must not query runtime identity on global client');
    assert.equal(h.counters.identityTx, 1); assert.equal(h.counters.transactions, 0);
  });
  await check('caller-owned-Tx:wrong-identity-before-work', async () => {
    const h = harness({ txIdentity: { database_name: 'railway', database_user: 'wrong' } });
    await assert.rejects(h.service.undoEasyTx(h.tx, ACTOR, h.realm(h.payload)), error => error instanceof h.guard.FinanceEasyRuntimeError);
    assert.equal(h.counters.identityMain, 0); assert.equal(h.counters.admins, 0); assert.equal(h.counters.receiptLocks, 0); assert.equal(h.counters.writes, 0);
  });
  await check('direct-service:closed-runtime-before-ACL-and-transaction', async () => {
    const h = harness({ environment: { ...production(), FINANCE_EASY_PRODUCTION_ENABLED: '0' } });
    await assert.rejects(h.service.undoEasy(ACTOR, h.realm(h.payload)), error => error instanceof h.guard.FinanceEasyRuntimeError);
    assert.equal(h.counters.admins, 0); assert.equal(h.counters.transactions, 0); assert.equal(h.counters.writes, 0);
    equal(h.service.easyUndoErrorResponse(new h.guard.FinanceEasyRuntimeError()).status, 404);
  });
  await check('non-POST-methods', async () => {
    const h = harness();
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) assert.equal((await h.route[method]()).status, 405);
    assert.equal(h.counters.identityMain, 0); assert.equal(h.counters.writes, 0);
  });
  console.log(JSON.stringify({ passed: true, cases: passed.length, checks: passed, realSources: [...realFiles], externalIO: 0, limits: ['In-memory Prisma adapters and injected session only; no cookies/auth backend', 'Confirmation is a synthetic pre-existing receipt here; real confirmation roundtrip belongs to rollback-only PostgreSQL test', 'No PostgreSQL locks/triggers/constraints/concurrency guarantee', 'React cache is the local package, not an RSC request runtime', 'No remote database, environment secrets or network accessed'] }, null, 2));
}
run().catch(error => { console.error('FINANCE_EASY_UNDO_RUNTIME_FAILED', error.stack || error); process.exitCode = 1; });
