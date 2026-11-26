'use strict';
// NO network/real SQL/env files: real route + service + domain + live permissions,
// all persistence boundaries are synthetic, transaction rejection discards draft.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const { Prisma } = require('@prisma/client');
const ROOT = path.resolve(__dirname, '..');
const realFiles = new Set([
  'app/api/admin/finanzas/cortes-cobertura/route.ts', 'lib/api-admin-area-read.ts',
  'lib/finanzas/bank-cutoffs-db.ts', 'lib/finanzas/bank-cutoffs-no-movements.ts',
  'lib/finanzas/bank-cutoffs-core.ts', 'lib/finanzas/conciliar-cuadre-dia.ts',
  'lib/finanzas/bank-order-by-balance.ts', 'lib/finanzas/finance-runtime-safety.ts',
  'lib/finanzas/staging-safety.ts', 'lib/finanzas/finance-environment.ts',
  'lib/finanzas/reconciliation-auth.ts', 'lib/finanzas/conciliar-cuadre.ts',
  'lib/finanzas/conciliar-unificado.ts', 'lib/permisos.ts',
  'lib/area4/section-registry.ts', 'lib/area4/policy.ts', 'lib/impuestos/auth-permisos.ts',
  'lib/area4/surface-access-contract.ts',
]);
const envBase = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'staging', FINANCE_STAGING_SANDBOX: '1',
  DATABASE_URL: 'postgresql://io_staging_finanzas:synthetic@staging.invalid/io_staging_finanzas', AREA4_OWNER_USER_ID: '9' };
const copy = value => structuredClone(value);
const plain = value => JSON.parse(JSON.stringify(value));
const fixtures = () => ({ accounts: [{ id: 'fixture', activa: true, banco: 'Banco prueba', alias: 'Cuenta ficticia', iban: 'TEST0001',
  fechaCorteExtracto: new Date('2026-11-20T00:00:00Z'), saldoActual: 0, fechaSaldo: new Date('2026-11-20T00:00:00Z') }],
  movements: [{ id: 'm0', cuentaId: 'fixture', fechaOperacion: new Date('2026-11-20T00:00:00Z'), fechaValor: new Date('2026-11-20T00:00:00Z'),
    importe: 0, saldo: 0, duplicadoDeId: null, createdAt: new Date('2026-11-20T10:00:00Z') }],
  imports: [{ id: 'i0', cuentaId: 'fixture', movImportados: 1, movDuplicados: 0, createdAt: new Date('2026-11-20T10:00:00Z') }], manuals: [] });

function harness(options = {}) {
  let state = fixtures();
  let active = options.active !== false;
  const role = options.role || 'CONTABILIDAD';
  let grants = options.grants || [{ codigo: 'admin.finanzas', lectura: true, escritura: true, confirmar: false, exportar: false }];
  const env = { ...envBase, ...options.env };
  const trace = []; let writes = 0; let identityCount = 0;
  let signedContext = options.signedContext || { status: 'absent' };
  const source = s => s.accounts.map(a => ({ accountId: a.id, activa: a.activa,
    importedCutoffDate: a.fechaCorteExtracto?.toISOString().slice(0, 10) ?? null,
    balanceText: a.saldoActual === null ? null : String(a.saldoActual), balanceDate: a.fechaSaldo?.toISOString() ?? null,
    movementCount: String(s.movements.filter(m => m.cuentaId === a.id).length),
    movementHash: crypto.createHash('sha256').update(JSON.stringify(s.movements.filter(m => m.cuentaId === a.id))).digest('hex'),
    importCount: String(s.imports.filter(i => i.cuentaId === a.id).length),
    importHash: crypto.createHash('sha256').update(JSON.stringify(s.imports.filter(i => i.cuentaId === a.id))).digest('hex'),
  }));
  const project = (row, select) => row ? Object.fromEntries(Object.keys(select || row).filter(k => select ? select[k] : true).map(k => [k, row[k]])) : null;
  function client(label, get) {
    return {
      async $queryRaw(query) {
        const text = Array.isArray(query) ? query.join('?') : query.strings.join('?');
        trace.push(`${label}:query:${text.trim().slice(0, 65)}`);
        if (text.includes('current_database()')) { identityCount++; return [{ db: options.identityBad ? 'wrong' : 'io_staging_finanzas', usuario: 'io_staging_finanzas' }]; }
        if (text.includes('FROM usuarios_admin')) return active ? [{ id: 9, rol: role, activo: true }] : [];
        if (text.includes('INSERT INTO cortes_cobertura_manual_b3')) {
          assert(!text.includes('comprobacion_sin_movimientos'), 'Legacy INSERT never references staging-only column');
          const [id,cuentaId,fechaCorte,saldoCentimos,motivo,nota,actorId,idempotencyKey,payloadHash,sourceVersion,version] = query.values;
          const row={id,cuentaId,fechaCorte,saldoCentimos,motivo,nota,actorId,idempotencyKey,payloadHash,sourceVersion,version,
            confirmedAt:new Date('2026-11-26T10:00:00Z'),comprobacionSinMovimientos:false};
          writes++;get().manuals.push(row);return copy([row]);
        }
        if (text.includes('AS "movementHash"')) return copy(source(get()).filter(s => query.values.includes(s.accountId)));
        if (text.includes('AS day')) return copy(get().movements.filter(m => m.cuentaId === query.values[0] && m.duplicadoDeId === null)
          .map(m => ({ day: m.fechaOperacion.toISOString().slice(0, 10), amount: String(m.importe), balance: m.saldo === null ? null : String(m.saldo) })));
        if (text.includes('DISTINCT ON (cuenta_id)')) {
          const latest = new Map(); for (const m of [...get().manuals].sort((a,b) => b.version-a.version)) if (!latest.has(m.cuentaId)) latest.set(m.cuentaId, m);
          if (text.includes('AS "cuentaId"')) return copy([...latest.values()]);
          return [...latest.values()].map(m => ({ accountId: m.cuentaId, cutoffDate: m.fechaCorte.toISOString().slice(0,10), balanceCents: m.saldoCentimos.toString(),
            confirmedAt: m.confirmedAt, actorId: m.actorId, version: m.version, id: m.id, sourceVersion: m.sourceVersion, comprobacionSinMovimientos: m.comprobacionSinMovimientos }));
        }
        throw new Error(`SQL_NOT_AUTHORIZED:${text}`);
      },
      async $executeRaw(query) {
        const text = query.strings.join('?'); trace.push(`${label}:lock:${text.trim()}`);
        assert(/^(LOCK TABLE|SELECT pg_advisory_xact_lock)/.test(text.trim()), 'Only source/permission/advisory locks'); return 0;
      },
      usuarioAdmin: { async findUnique({ where, select }) {
        if (where.id !== 9) return null;
        return project({ id: 9, activo: active, rol: role, roles: [], permisosArea4Vivos: options.adopted !== false }, select);
      } },
      permisoArea: { async findUnique() { return { activo: options.areaActive !== false }; } },
      permisoUsuario: {
        async count() { return grants.length; },
        async findMany({ where }) { return grants.filter(g => where.area.codigo.in.includes(g.codigo)).map(g => ({ ...g, area: { codigo: g.codigo } })); },
      },
      cuentaBancaria: {
        async findMany({ select, where } = {}) { return copy(get().accounts.filter(a => !where?.id?.in || where.id.in.includes(a.id)).map(a => project(a, select))); },
        async findUnique({ where, select }) { return copy(project(get().accounts.find(a => a.id === where.id), select)); },
      },
      importacionExtracto: { async findMany() { return copy(get().imports); } },
      movimientoBancario: { async findMany({ where, select }) {
        return copy(get().movements.filter(m => where.cuentaId.in.includes(m.cuentaId) && (where.duplicadoDeId === null ? m.duplicadoDeId === null : m.duplicadoDeId !== null)).map(m => project(m, select)));
      } },
      corteCoberturaManualB3: {
        async findUnique({ where }) { const pair = where.actorId_idempotencyKey; return copy(get().manuals.find(m => m.actorId === pair.actorId && m.idempotencyKey === pair.idempotencyKey) || null); },
        async findFirst({ where }) { return copy([...get().manuals].filter(m => m.cuentaId === where.cuentaId).sort((a,b) => b.version-a.version)[0] || null); },
        async findMany() { const latest = new Map(); for (const m of [...get().manuals].sort((a,b) => b.version-a.version)) if (!latest.has(m.cuentaId)) latest.set(m.cuentaId,m); return copy([...latest.values()]); },
        async create({ data }) {
          writes++; trace.push(`${label}:audit-insert`);
          const row = { ...copy(data), id: crypto.randomUUID(), confirmedAt: new Date('2026-11-26T10:00:00Z') };
          get().manuals.push(row);
          if (options.auditFail) throw new Error('SYNTHETIC_AUDIT_FAILURE');
          if (options.concurrentCode) { const e = new Error('Synthetic CAS'); e.code = options.concurrentCode; throw e; }
          return copy(row);
        },
      },
    };
  }
  const db = client('main', () => state);
  db.$transaction = async (work, opts) => {
    assert.equal(opts.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
    const draft = copy(state), tx = client('tx', () => draft);
    trace.push('tx:start'); const out = await work(tx); trace.push('tx:commit'); state = draft; return out;
  };
  const NextResponse = { json(body, options = {}) { return new Response(JSON.stringify(body), { status: options.status || 200, headers: options.headers }); } };
  const boundaries = {
    '@prisma/client': { Prisma }, 'node:crypto': crypto, 'next/server': { NextResponse },
    '@/lib/prisma': { __esModule: true, default: db, prisma: db }, '@/lib/auth': { authOptions: {} },
    'next-auth': { async getServerSession() { return options.noAuth ? null : { user: { id: '9', userType: options.nonAdmin ? 'cliente' : 'admin', role: options.sessionRole || role },
      ...(options.acting ? { impersonation: { actorId: '9', targetId: '8' } } : {}) }; } },
    '@/lib/impersonation-context': { async trustedImpersonationContextResolutionFromRequest() { return signedContext; } },
  };
  const sandbox = vm.createContext({ console, process: { env }, URL, Headers, TextDecoder, Buffer, Date, structuredClone });
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    assert(realFiles.has(file), `IMPORT_NOT_AUTHORIZED:${file}`);
    const code = ts.transpileModule(fs.readFileSync(path.join(ROOT,file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const module = { exports: {} }; cache.set(file,module);
    const localRequire = name => {
      if (Object.hasOwn(boundaries,name)) return boundaries[name];
      const target = name.startsWith('@/') ? name.slice(2) : name.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file),name)) : null;
      if (!target) throw new Error(`IMPORT_NOT_AUTHORIZED:${name}`); return load(`${target}.ts`);
    };
    vm.runInContext(`(function(require,module,exports){${code}\n})`,sandbox,{ filename:file })(localRequire,module,module.exports);
    return module.exports;
  }
  const service = load('lib/finanzas/bank-cutoffs-db.ts');
  const guards = load('lib/finanzas/bank-cutoffs-no-movements.ts');
  const route = load('app/api/admin/finanzas/cortes-cobertura/route.ts');
  const reader = load('lib/finanzas/conciliar-cuadre.ts');
  const steps = load('lib/finanzas/conciliar-unificado.ts');
  async function payload() {
    const data = await service.readCutoffAccounts(), a = data.accounts[0];
    return { action: 'comprobar_sin_movimientos', cuentaId: a.id, fechaCorte: '2026-11-25', nota: 'Comprobación humana ficticia offline.',
      confirmacion: true, idempotencyKey: 'fixture-key-0001', sourceVersion: a.noMovementsSourceVersion, expectedVersion: a.latestManual?.version ?? 0 };
  }
  function request(body, extra = {}) {
    return { headers: new Headers({ origin: 'https://staging.invalid', 'content-type': 'application/json', ...extra.headers }),
      nextUrl: new URL(`https://staging.invalid/api/admin/finanzas/cortes-cobertura${extra.query || ''}`),
      body: extra.empty ? null : new ReadableStream({ start(c) { c.enqueue(Buffer.from(extra.raw ?? JSON.stringify(body))); c.close(); } }) };
  }
  async function post(body, extra) { const res = await route.POST(request(body,extra)); assert.equal(res.headers.get('cache-control'),'private, no-store'); return { status: res.status, body: await res.json() }; }
  async function get(extra) { const res = await route.GET(request({},extra)); return { status:res.status, body:await res.json() }; }
  return { service, guards, route, reader, steps, payload, post, get, env, trace, db,
    get state() { return copy(state); }, get writes() { return writes; }, get identityCount() { return identityCount; },
    mutate(work) { work(state); }, setActive(v) { active=v; }, setGrants(v) { grants=v; }, setContext(v) { signedContext=v; } };
}
let passed = 0;
async function check(name, work) { await work(); passed++; console.log(`OK ${name}`); }
async function reject(name, options, change, status, code, req) {
  await check(name, async () => {
    const h = harness(options); const body = await h.payload(); if (change) change(body,h);
    const before = h.state, out = await h.post(body,req);
    assert.equal(out.status,status, `${name}:${JSON.stringify(out.body)}`);
    if (code) assert.equal(out.body.codigo,code); assert.deepEqual(h.state,before); assert.equal(h.writes,0);
  });
}
(async () => {
  await check('saldo 0 + auditoría append-only + replay idempotente + fuente económica intacta', async () => {
    const h=harness(), body=await h.payload(), before=h.state;
    const out=await h.post(body); assert.equal(out.status,201,JSON.stringify(out)); assert.equal(out.body.cutoff.saldoCentimos,'0');
    assert.equal(out.body.cutoff.comprobacionSinMovimientos,true); assert.equal(h.state.manuals.length,1);
    for (const key of ['accounts','movements','imports']) assert.deepEqual(h.state[key],before[key]);
    assert.equal(h.state.manuals[0].motivo,'EXTRACTO_REVISADO_MANUALMENTE');
    const replay=await h.post(body); assert.equal(replay.status,201); assert.equal(replay.body.idempotent,true); assert.equal(h.writes,1);
    const firstQuery=h.trace.findIndex(s=>s.startsWith('tx:query:')); const lock=h.trace.findIndex(s=>s.startsWith('tx:lock:LOCK TABLE cuentas'));
    assert(lock<firstQuery); assert(h.trace.some(s=>s.includes('permiso_usuarios IN SHARE MODE')));
    const get=await h.get(); assert.equal(get.body.access.canWriteNoMovements,true);
    const read=await h.reader.readCuentasCuadre(); assert.equal(read[0].fechaCorteExtracto,'2026-11-20');
    assert.equal(read[0].fechaComprobadaSinMovimientos,'2026-11-25'); assert.equal(read[0].fechaCoberturaLectura,'2026-11-25'); assert.equal(read[0].cuadra,true);
  });
  await check('manual legacy mantiene contrato y no exige columna staging en INSERT',async()=>{
    const h=harness(),data=await h.service.readCutoffAccounts();
    const body={cuentaId:'fixture',fechaCorte:'2026-11-21',saldoCentimos:'0',motivo:'EXTRACTO_REVISADO_MANUALMENTE',nota:'Extracto ficticio revisado manualmente',confirmacion:true,idempotencyKey:'legacy-key-0001',sourceVersion:data.accounts[0].sourceVersion};
    const out=await h.post(body);assert.equal(out.status,201,JSON.stringify(out));assert.equal(out.body.cutoff.saldoCentimos,'0');assert.equal(h.state.manuals[0].comprobacionSinMovimientos,false);
    assert.equal((await h.post(body)).body.idempotent,true);assert.equal(h.writes,1);
  });
  for (const role of ['CONTABILIDAD','GERENTE','SUPER_ADMIN']) await check(`rol ${role} sin autoridad cliente`,async()=>{ const h=harness({role}); assert.equal((await h.post(await h.payload())).status,201); });
  await reject('sin autenticación',{noAuth:true},null,401);
  await reject('no admin',{nonAdmin:true},null,401);
  await reject('actor desactivado y rol JWT no abre permiso',{active:false,sessionRole:'SUPER_ADMIN'},null,403);
  await reject('permiso lectura solamente',{grants:[{codigo:'admin.finanzas',lectura:true,escritura:false}]},null,403);
  await reject('ACL B3 revocada no hereda padre',{grants:[{codigo:'admin.finanzas',lectura:true,escritura:true},{codigo:'admin.finanzas.importar',lectura:true,escritura:false}]},null,403);
  await reject('ACL registry denegada no basta B3',{grants:[{codigo:'admin.finanzas.importar',lectura:true,escritura:true}]},null,403,'PERMISO_REVOCADO');
  await reject('permiso revocado entre GET y POST',{},(_,h)=>h.setGrants([{codigo:'admin.finanzas',lectura:true,escritura:false}]),403);
  for (const key of ['acting']) await reject('Actuar como',{[key]:true},null,403,'ACTUACION_NO_PERMITIDA');
  await reject('header acting',{},null,403,'ACTUACION_NO_PERMITIDA',{headers:{'x-io-acting-session':'synthetic'}});
  await reject('Ver como',{},null,403,'ACTUACION_NO_PERMITIDA',{query:'?verComo=8'});
  await reject('contexto firmado válido',{signedContext:{status:'valid',context:{}}},null,403,'ACTUACION_NO_PERMITIDA');
  await reject('contexto firmado inválido',{signedContext:{status:'invalid'}},null,403,'ACTUACION_NO_PERMITIDA');
  for (const [name,env] of [['production',{VERCEL_ENV:'production'}],['otra ref',{VERCEL_GIT_COMMIT_REF:'main'}],['sandbox off',{FINANCE_STAGING_SANDBOX:'0'}],['readonly deployment',{FINANCE_DEPLOYMENT_READ_ONLY:'1'}],['readonly production',{IO_PRODUCTION_READ_ONLY:'1'}],['dsn no staging',{DATABASE_URL:'postgresql://other:synthetic@staging.invalid/other'}]]) {
    await check(name,async()=>{ const h=harness({env}); const body={action:'comprobar_sin_movimientos',cuentaId:'fixture',fechaCorte:'2026-11-25',nota:'Nota ficticia humana',confirmacion:true,idempotencyKey:'key-0001',sourceVersion:'0'.repeat(64),expectedVersion:0}; const out=await h.post(body); assert.equal(out.status,404); assert.equal(h.writes,0); assert.equal(h.identityCount,0); });
  }
  await check('identidad SQL errónea falla cerrada',async()=>{const h=harness({identityBad:true}); await assert.rejects(h.service.confirmManualCutoff(9,{action:'comprobar_sin_movimientos',cuentaId:'fixture',fechaCorte:'2026-11-25',nota:'Nota ficticia humana',confirmacion:true,idempotencyKey:'key-0001',sourceVersion:'0'.repeat(64),expectedVersion:0}),/STAGING_ISOLATION_REQUIRED/);assert.equal(h.writes,0);});
  for(const date of ['2026-02-30','2099-01-01','2026-13-01']) await reject(`fecha inválida ${date}`,{},b=>b.fechaCorte=date,400,'VALIDATION_ERROR');
  for(const date of ['2026-11-20','2026-11-19']) await reject(`fecha no posterior ${date}`,{},b=>b.fechaCorte=date,409,'FECHA_NO_POSTERIOR');
  await reject('sin confirmación humana',{},b=>b.confirmacion=false,400,'CONFIRMACION_REQUERIDA');
  await reject('importe cliente prohibido',{},b=>b.saldoCentimos='0',400,'VALIDATION_ERROR');
  await reject('nota obligatoria',{},b=>b.nota='',400,'VALIDATION_ERROR');
  await reject('cuenta inactiva',{},(_,h)=>h.mutate(s=>s.accounts[0].activa=false),409,'CUENTA_INACTIVA');
  await reject('cuenta inexistente',{},b=>b.cuentaId='missing',404,'CUENTA_NO_ENCONTRADA');
  for(const [name,mutate] of [
    ['nuevo apunte',s=>s.movements.push({...s.movements[0],id:'m1',fechaOperacion:new Date('2026-11-21')})],
    ['importe editado',s=>s.movements[0].importe=1],['saldo editado',s=>s.accounts[0].saldoActual=1],
    ['importación simultánea',s=>s.imports.push({...s.imports[0],id:'i1'})],
  ]) await reject(`CAS ${name}`,{},(_,h)=>h.mutate(mutate),409,'SOURCE_VERSION_CONFLICT');
  await reject('CAS versión manual',{},b=>b.expectedVersion=1,409,'SOURCE_VERSION_CONFLICT');
  const chainReject=async(name,mutate,code)=>check(name,async()=>{const h=harness();h.mutate(mutate);const b=await h.payload();const before=h.state;const out=await h.post(b);assert.equal(out.status,409,JSON.stringify(out));assert.equal(out.body.codigo,code);assert.deepEqual(h.state,before);assert.equal(h.writes,0);});
  await chainReject('sin movimientos base',s=>s.movements=[], 'SIN_MOVIMIENTOS_BASE');
  await chainReject('sin corte base',s=>s.accounts[0].fechaCorteExtracto=null, 'SIN_CORTE_BASE');
  await chainReject('NO_CUADRA saldo sin cadena',s=>s.movements[0].saldo=null, 'CUENTA_NO_CUADRA');
  await chainReject('hueco interdiario',s=>s.movements.push({...s.movements[0],id:'m1',fechaOperacion:new Date('2026-11-19'),importe:1,saldo:5}), 'CUENTA_NO_CUADRA');
  await chainReject('movimiento real en intervalo',s=>s.movements.push({...s.movements[0],id:'m1',fechaOperacion:new Date('2026-11-21')}), 'MOVIMIENTOS_EN_INTERVALO');
  await chainReject('movimiento posterior a X',s=>s.movements.push({...s.movements[0],id:'m1',fechaOperacion:new Date('2026-11-26')}), 'MOVIMIENTOS_POSTERIORES');
  await chainReject('saldo actual distinto cadena',s=>s.accounts[0].saldoActual=1, 'SALDO_ACTUAL_NO_CUADRA');
  await chainReject('saldo no exacto no redondea',s=>s.accounts[0].saldoActual=0.001, 'SALDO_ACTUAL_NO_CUADRA');
  await check('fallo inserción auditada revierte TX entera',async()=>{const h=harness({auditFail:true});const before=h.state;const out=await h.post(await h.payload());assert.equal(out.status,500);assert.deepEqual(h.state,before);assert.equal(h.writes,1);assert(!h.trace.includes('tx:commit'));});
  for(const code of ['P2002','P2034','40001']) await check(`concurrencia ${code} revierte`,async()=>{const h=harness({concurrentCode:code});const before=h.state;const out=await h.post(await h.payload());assert.equal(out.status,409);assert.deepEqual(h.state,before);});
  await check('clave reutilizada con payload distinto denegada',async()=>{const h=harness(),b=await h.payload();assert.equal((await h.post(b)).status,201);b.nota+=' distinto';assert.equal((await h.post(b)).body.codigo,'IDEMPOTENCY_KEY_REUSED');assert.equal(h.writes,1);});
  await check('extensión humana consecutiva conserva comprobaciones anteriores',async()=>{const h=harness(),b=await h.payload();await h.post(b);const old=h.state.manuals[0];const next=await h.payload();next.fechaCorte='2026-11-26';next.idempotencyKey='fixture-key-0002';const out=await h.post(next);assert.equal(out.status,201);assert.equal(out.body.cutoff.version,2);assert.deepEqual(h.state.manuals[0],old);assert.equal((await h.reader.readCuentasCuadre())[0].fechaComprobadaSinMovimientos,'2026-11-26');});
  await check('readonly mantiene evidencia pero oculta acción y rechaza POST',async()=>{const h=harness(),b=await h.payload();await h.post(b);h.env.FINANCE_DEPLOYMENT_READ_ONLY='1';const read=await h.reader.readCuentasCuadre();assert.equal(read[0].fechaComprobadaSinMovimientos,'2026-11-25');assert.equal((await h.get()).body.access.canWriteNoMovements,false);assert.equal((await h.post(b)).status,404);assert.equal(h.writes,1);});
  for(const [name,mutate] of [['importe cambiado',s=>s.movements[0].importe=1],['importación nueva',s=>s.imports.push({...s.imports[0],id:'i-new'})]]) await check(`evidencia obsoleta: ${name}`,async()=>{const h=harness(),b=await h.payload();await h.post(b);h.mutate(mutate);const data=await h.service.readCutoffAccounts();assert.equal(data.accounts[0].fechaComprobadaSinMovimientos,null);assert.equal(data.accounts[0].comprobacionSinMovimientosObsoleta,true);assert.equal((await h.reader.readCuentasCuadre())[0].fechaCoberturaLectura,'2026-11-20');assert.equal(h.writes,1);});
  await check('nuevo movimiento invalida evidencia RO sin reescribir auditoría ni corte importado',async()=>{const h=harness(),b=await h.payload();await h.post(b);const audit=h.state.manuals;h.mutate(s=>s.movements.push({...s.movements[0],id:'m1',fechaOperacion:new Date('2026-11-26')}));const data=await h.service.readCutoffAccounts();assert.equal(data.accounts[0].fechaComprobadaSinMovimientos,null);assert.equal(data.accounts[0].comprobacionSinMovimientosObsoleta,true);assert.equal(data.accounts[0].effectiveCutoffDate,'2026-11-20');const rows=await h.reader.readCuentasCuadre();assert.equal(rows[0].fechaCoberturaLectura,'2026-11-20');assert.equal(rows[0].fechaComprobadaSinMovimientos,null);assert.deepEqual(h.state.manuals,audit);assert.equal((await h.post(b)).body.idempotent,true);assert.equal(h.writes,1);});
  await check('cinco pasos: sólo cobertura paso1, NO etiqueta verde en paso2 ni guarda',async()=>{const h=harness(),b=await h.payload();await h.post(b);const rows=await h.reader.readCuentasCuadre();const original=rows[0];const input={resumen:{movimientos:1,entranCentimos:0,salenCentimos:0,conciliados:0,sinTercero:1},cuentas:[{...original,cuadra:false,estado:'HUECO'}],sinDocumentoCobros:1,sinDocumentoPagos:0,rojas:1,reglas:1,hoy:'2026-11-25'};const out=h.steps.buildPasos(input);assert.equal(out.length,5);assert.equal(out[0].estado,'ok');assert.equal(out[1].estado,'bad');assert.equal(h.steps.bloqueoPorCuadre('fixture',new Map([['fixture',false]])),'CUENTA_NO_CUADRA');assert.equal(h.reader.calcularBloqueos(new Map([['m0','fixture']]),new Map([['fixture',input.cuentas[0]]])).length,1);const stale=h.steps.buildPasos({...input,cuentas:[{...input.cuentas[0],comprobacionSinMovimientosObsoleta:true}]});assert.equal(stale[0].estado,'bad');assert.deepEqual(plain(stale.slice(1)),plain(out.slice(1)));assert.equal(h.steps.corteMinimo([...rows,{...original,id:'sin-corte',fechaCorteExtracto:null,fechaCoberturaLectura:null}]),null);});
  for(const [name,extra,status] of [['origen cruzado',{headers:{origin:'https://other.invalid'}},403],['tipo no JSON',{headers:{'content-type':'text/plain'}},415],['JSON roto',{raw:'{'},400],['array',{raw:'[]'},400],['body excedido',{raw:'x'.repeat(8193)},413],['content length excedido',{headers:{'content-length':'8193'}},413],['sin body',{empty:true},400]]) await reject(name,{},null,status,null,extra);
  for (const options of [{acting:true},{signedContext:{status:'invalid'}},{grants:[{codigo:'admin.finanzas',lectura:true,escritura:false}]}]) await check('GET denegado oculta nueva acción',async()=>{const h=harness(options);assert.equal((await h.get()).body.access.canWriteNoMovements,false);});
  await check('migration única, enum intacto, down sin destrucción de registros',async()=>{
    const schema=fs.readFileSync(path.join(ROOT,'prisma/schema.prisma'),'utf8'); assert.match(schema,/comprobacionSinMovimientos Boolean\s+@default\(false\)/);assert.match(schema,/enum MotivoCorteCoberturaB3\s*\{\s*EXTRACTO_REVISADO_MANUALMENTE\s*\}/);
    const up=fs.readFileSync(path.join(ROOT,'prisma/migrations/20261205_area3_cobertura_sin_movimientos/migration.sql'),'utf8');assert.match(up,/ADD COLUMN/);assert(!/CREATE TYPE|ALTER TYPE|UPDATE\s|DELETE\s/i.test(up));
    const down=fs.readFileSync(path.join(ROOT,'prisma/migrations/20261205_area3_cobertura_sin_movimientos/down.sql'),'utf8').replace(/--[^\n]*/g,'');assert(!/DELETE|UPDATE|CASCADE|DROP TABLE/i.test(down));assert.match(down,/RAISE EXCEPTION/);
    const ui=fs.readFileSync(path.join(ROOT,'components/finanzas/conciliar-unificado/ComprobacionSinMovimientos.tsx'),'utf8');assert.match(ui,/canWriteNoMovements === true/);assert(!/usePermisoArea|role ===/.test(ui));assert(!/saldoCentimos:/.test(ui));assert.match(ui,/Confirmar comprobación/);assert.match(ui,/type="checkbox"/);
  });
  console.log(`PASS ${passed} offline checks; real service/route/domain/permissions; no network or SQL executed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
