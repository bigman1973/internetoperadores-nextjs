'use strict';
// Ejecuta los handlers reales transpilados. Sin sesión/Prisma/HTTP reales.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const message = 'Integracion HubSpot retirada';
const files = {
  pipeline: 'app/api/admin/leads-mantenimiento/hubspot-pipeline/route.ts',
  lists: 'app/api/admin/hubspot-create-list/route.ts',
};
let passed = 0;
let fetchCalls = 0;

function load(file, session, permissions, env) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert(!source.includes('api.hubapi.com'), 'No debe quedar código del proveedor');
  assert(!source.includes('HUBSPOT_API_KEY'), 'La retirada no depende de la clave');
  const module = { exports: {} };
  const calls = { session: 0, permissions: [] };
  const deps = {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), {
      status: init?.status || 200,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    }) } },
    'next-auth': { getServerSession: async () => { calls.session++; return session; } },
    '@/lib/auth': { authOptions: {} },
    '@/lib/permisos': { verificarPermisoServer: async (...args) => { calls.permissions.push(args); return permissions; } },
  };
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: name => { assert(name in deps, 'Import no autorizado: ' + name); return deps[name]; },
    process: { env }, URL, Request, Response, console,
    fetch: () => { fetchCalls++; throw new Error('RED_PROHIBIDA'); },
  }, { filename: file });
  return { handlers: module.exports, calls };
}

const admin = { user: { id: '3', userType: 'admin', role: 'SUPER_ADMIN' } };
async function check(kind, method, session, permissions, env, status, expectedPermissionCalls) {
  const loaded = load(files[kind], session, permissions, env);
  let bodyReads = 0;
  const request = { json: () => { bodyReads++; throw new Error('No leer cuerpo de integración retirada'); } };
  const response = await loaded.handlers[method](request);
  assert.equal(response.status, status, `${kind}/${method}`);
  assert.equal(loaded.calls.session, 1, 'Sesión comprobada antes de responder');
  assert.equal(loaded.calls.permissions.length, expectedPermissionCalls);
  assert.equal(bodyReads, 0, 'No analizar ni ejecutar una operación retirada');
  const body = await response.json();
  if (status === 410) {
    assert.equal(body.success, false);
    assert.equal(body.code, 'HUBSPOT_RETIRED');
    assert.equal(body.error, message);
    assert.equal(body.message, message);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  } else {
    assert.equal(body.error, 'No autorizado');
    assert.equal(body.code, undefined, 'No saltar autenticación con mensaje de integración');
  }
  if (expectedPermissionCalls) {
    assert.deepEqual(loaded.calls.permissions[0], [3, 'admin.crm.listas', 'SUPER_ADMIN']);
  }
  assert.equal(fetchCalls, 0, 'Cero llamadas al proveedor');
  passed++;
}

(async () => {
  for (const VERCEL_ENV of ['production', 'preview', '']) {
    for (const HUBSPOT_API_KEY of ['', 'CLAVE_FICTICIA_NO_USADA']) {
      for (const kind of Object.keys(files)) {
        for (const method of ['GET', 'POST']) {
          await check(kind, method, admin, { lectura: true, escritura: true }, { VERCEL_ENV, HUBSPOT_API_KEY }, 410, kind === 'lists' ? 1 : 0);
          await check(kind, method, null, { lectura: true, escritura: true }, { VERCEL_ENV, HUBSPOT_API_KEY }, kind === 'lists' ? 403 : 401, 0);
        }
      }
    }
  }
  for (const method of ['GET', 'POST']) {
    await check('lists', method, { user: { id: '3', userType: 'cliente', role: 'SUPER_ADMIN' } }, { lectura: true, escritura: true }, {}, 403, 0);
    await check('lists', method, { user: { userType: 'admin', role: 'SUPER_ADMIN' } }, { lectura: true, escritura: true }, {}, 403, 0);
    await check('lists', method, admin, { lectura: false, escritura: false }, {}, 403, 1);
  }
  await check('lists', 'GET', admin, { lectura: true, escritura: false }, {}, 410, 1);
  await check('lists', 'POST', admin, { lectura: true, escritura: false }, {}, 403, 1);
  await check('lists', 'GET', admin, { lectura: false, escritura: true }, {}, 403, 1);
  await check('lists', 'POST', admin, { lectura: false, escritura: true }, {}, 410, 1);
  for (const kind of Object.keys(files)) for (const method of ['GET', 'POST']) {
    await check(kind, method, admin, { lectura: true, escritura: true }, {}, 410, kind === 'lists' ? 1 : 0);
  }
  const registry = fs.readFileSync(path.join(root, 'lib/area4/section-registry.ts'), 'utf8');
  assert(registry.includes('/api/admin/hubspot-create-list'));
  assert(registry.includes('/api/admin/leads-mantenimiento/hubspot-pipeline'));
  console.log(JSON.stringify({ passed, total: passed, fetchCalls, realHttp: 0, realSql: 0, realSessions: 0, sources: 'handlers reales; sesión/ACL sintéticas; registry sin modificar' }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
