/** Run: node scripts/test-certificaciones-selected-offline.cjs
 * No application imports: source is transpiled in memory and evaluated in a VM
 * with an explicit dependency allowlist, synthetic env and fetch-only mocks.
 * Never loads .env, real Graph/Prisma/auth, installs packages or writes artifacts.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const fflate = require('fflate');
const ROOT = path.resolve(__dirname, '..');
let deniedNetwork = 0;
const noNetwork = () => { deniedNetwork++; throw Error('LIVE_NETWORK_FORBIDDEN'); };
const evaluated = [];
function source(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }
function load(file, imports, env = {}, fetchMock = noNetwork) {
  const module = { exports: {} };
  const transpiled = ts.transpileModule(source(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.deepEqual(transpiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), []);
  vm.runInNewContext(transpiled.outputText, {
    module, exports: module.exports, Buffer, URL, URLSearchParams, Headers, Response,
    Uint8Array, ArrayBuffer, AbortSignal, Date, process: { env }, fetch: fetchMock,
    require(key) {
      if (!Object.hasOwn(imports, key)) throw Error(`UNEXPECTED_APPLICATION_IMPORT:${key}`);
      return imports[key];
    },
  }, { filename: file, timeout: 5000 });
  evaluated.push(file);
  return module.exports;
}
// Pure sources only; dependencies are supplied explicitly, never imported.
const financeEnv = load('lib/finanzas/finance-environment.ts', {});
const panelCore = load('lib/finanzas/documentos-panel-core.ts', {
  'node:crypto': crypto, './invoice-quality': {},
});
const runtime = load('lib/finanzas/documentos-panel-runtime.ts', {
  './finance-environment': financeEnv, './documentos-panel-core': panelCore,
});
const selected = load('lib/finanzas/documentos-production-selected.ts', {
  'server-only': {}, './documentos-panel-core': panelCore, './documentos-panel-runtime': runtime,
});
const core = load('lib/certificaciones/core.ts', {});
const writer = load('lib/certificaciones/documents-selected.ts', {
  'node:crypto': crypto,
  '@/lib/finanzas/documentos-panel-runtime': runtime,
  '@/lib/finanzas/documentos-production-selected': selected,
  './core': core,
});
const pins = runtime.DOCUMENTOS_APPROVED_PRODUCTION_PINS;
const tenant = '11111111-1111-4111-8111-111111111111';
const app = '22222222-2222-4222-8222-222222222222';
const credential = {
  FINANCE_DOCUMENTOS_GRAPH_TENANT_ID: tenant,
  FINANCE_DOCUMENTOS_GRAPH_CLIENT_ID: app,
  FINANCE_DOCUMENTOS_GRAPH_CLIENT_SECRET: 'OFFLINE_ONLY_NOT_A_REAL_SECRET',
};
const production = {
  ...credential,
  VERCEL_ENV: 'production',
  DATABASE_URL: 'postgresql://postgres:SYNTHETIC@yamanote.proxy.rlwy.net:34880/railway',
  FINANCE_MODEL_PRODUCTION_ENABLED: '1', FINANCE_AUTOMATIC_LINKS_DISABLED: '1',
  FINANCE_EASY_PRODUCTION_ENABLED: '1', FINANCE_DOCUMENTOS_PRODUCTION_ENABLED: '1',
  FINANCE_CERTIFICACIONES_DOCUMENTS_WRITE_ENABLED: '1',
  FINANCE_DOCUMENTOS_PRODUCTION_DRIVE_ID: pins.driveId,
  FINANCE_DOCUMENTOS_PRODUCTION_FOLDER_ITEM_ID: pins.folderItemId,
  FINANCE_DOCUMENTOS_PRODUCTION_PENDING_FOLDER_ITEM_ID: pins.pendingFolderItemId,
  FINANCE_DOCUMENTOS_PRODUCTION_ARCHIVED_FOLDER_ITEM_ID: pins.archivedFolderItemId,
};
const staging = {
  ...credential, VERCEL_ENV: 'preview', FINANCE_STAGING_SANDBOX: '1',
  DATABASE_URL: 'postgresql://io_staging_finanzas:SYNTHETIC@offline.invalid/io_staging_finanzas',
  FINANCE_CERTIFICACIONES_DOCUMENTS_WRITE_ENABLED: '1',
  FINANCE_CERTIFICACIONES_STAGING_DRIVE_ID: 'STAGE_DRIVE',
  FINANCE_CERTIFICACIONES_STAGING_FOLDER_ITEM_ID: 'STAGE_DOCUMENTOS_PANEL',
  FINANCE_CERTIFICACIONES_STAGING_PARENT_ITEM_ID: 'STAGE_FINANZAS_PARENT',
};
const bytes = Buffer.from('%PDF-1.7\nSYNTHETIC_CERTIFICATION_ORIGINAL');
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
function jwt(changes = {}) {
  return `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify({
    aud: '00000003-0000-0000-c000-000000000000', tid: tenant, appid: app,
    iss: `https://sts.windows.net/${tenant}/`, roles: ['Files.SelectedOperations.Selected'],
    exp: Math.floor(Date.now() / 1000) + 3600, ...changes,
  })).toString('base64url')}.c3ludGhldGlj`;
}
function fixture(env = { ...production }, changes = {}) {
  const stage = env.FINANCE_STAGING_SANDBOX === '1';
  const drive = stage ? staging.FINANCE_CERTIFICACIONES_STAGING_DRIVE_ID : pins.driveId;
  const root = stage ? staging.FINANCE_CERTIFICACIONES_STAGING_FOLDER_ITEM_ID : pins.folderItemId;
  const rootParent = stage ? staging.FINANCE_CERTIFICACIONES_STAGING_PARENT_ITEM_ID : 'DOCUMENTOS_LIBRARY_PARENT';
  const rootName = stage ? 'DocumentosPanel' : '10. Panel IO';
  const items = new Map(), stored = new Map(), calls = [];
  const folder = (id, name, parent) => ({ id, name, folder: {}, parentReference: { id: parent, driveId: drive } });
  const file = (id, name, parent, content = bytes) => ({ id, name, file: {}, size: content.length, eTag: 'OFFLINE_ETAG', parentReference: { id: parent, driveId: drive } });
  items.set(root, folder(root, rootName, rootParent));
  items.set('CERTIFICATIONS_FOLDER', folder('CERTIFICATIONS_FOLDER', 'Certificaciones', root));
  items.set('ISO_FOLDER', folder('ISO_FOLDER', 'ISO27001', 'CERTIFICATIONS_FOLDER'));
  items.set('TISAX_FOLDER', folder('TISAX_FOLDER', 'TISAX', 'CERTIFICATIONS_FOLDER'));
  // Historic and financial objects are present solely to prove non-mutation.
  items.set('HISTORIC_ROOT', folder('HISTORIC_ROOT', 'Certificaciones', 'DOCUMENTOS_LIBRARY_PARENT'));
  items.set('HISTORIC_ORIGINAL', file('HISTORIC_ORIGINAL', `${hash}.bin`, 'HISTORIC_ROOT'));
  items.set(pins.pendingFolderItemId, folder(pins.pendingFolderItemId, 'Pendientes', root));
  items.set(pins.archivedFolderItemId, folder(pins.archivedFolderItemId, 'Archivadas', root));
  for (let n = 1; n <= 9; n++) items.set(`FOLDER_${n}`, folder(`FOLDER_${n}`, `${n}. Existing`, 'DOCUMENTOS_LIBRARY_PARENT'));
  const protectedBefore = JSON.stringify([...items.values()].filter(i => ![root, 'CERTIFICATIONS_FOLDER', 'ISO_FOLDER', 'TISAX_FOLDER'].includes(i.id)));
  const within = value => value?.id === root || !!(value?.parentReference?.id && items.has(value.parentReference.id) && within(items.get(value.parentReference.id)));
  let uploads = 0;
  const fetchMock = async (value, init = {}) => {
    const url = new URL(String(value)); const method = init.method || 'GET';
    calls.push({ url: String(url), method });
    assert.equal(url.origin, 'https://graph.microsoft.com');
    assert.doesNotMatch(url.pathname, /\/root|\/sites\/|\/users\/|\/me\/|\/permissions|createLink/);
    assert.ok(['GET', 'PUT'].includes(method), 'No provision/move/rename/delete');
    const decoded = decodeURIComponent(url.pathname);
    const match = decoded.match(/^\/v1\.0\/drives\/([^/]+)\/items\/([^/:]+)(?::\/([^:]+))?(?:(:\/content)|\/(content|children))?$/);
    assert.ok(match, decoded);
    assert.equal(match[1], drive);
    const parent = match[2], child = match[3], resource = match[5];
    assert.notEqual(resource, 'children', 'No enumeration');
    assert.ok(!['HISTORIC_ROOT', 'HISTORIC_ORIGINAL', pins.pendingFolderItemId, pins.archivedFolderItemId].includes(parent));
    const current = items.get(parent);
    if (!within(current)) return Response.json({}, { status: 403 });
    if (changes.before) await changes.before({ items, stored, parent, child, method, calls });
    if (method === 'PUT') {
      assert.ok(['ISO_FOLDER', 'TISAX_FOLDER'].includes(parent));
      assert.match(child, /^[a-f0-9]{64}\.bin$/);
      const headers = new Headers(init.headers);
      assert.equal(headers.get('if-none-match'), '*');
      assert.equal(headers.get('content-type'), 'application/octet-stream');
      assert.equal(headers.get('content-length'), String(init.body.byteLength));
      assert.equal(url.searchParams.get('@microsoft.graph.conflictBehavior'), 'fail');
      const content = Buffer.from(init.body);
      assert.deepEqual(content, bytes);
      const created = file(`NEW_ITEM_${++uploads}`, child, parent, content);
      if (changes.putFailure) return Response.json({}, { status: changes.putFailure });
      items.set(created.id, created); stored.set(created.id, content);
      if (changes.concurrent) return Response.json({}, { status: changes.concurrent });
      return Response.json(changes.created ? { ...created, ...changes.created } : created, { status: 201 });
    }
    assert.equal(method, 'GET');
    if (resource === 'content') return new Response(Uint8Array.from(changes.download || stored.get(parent) || bytes).buffer);
    assert.ok(url.searchParams.has('$select'), 'Minimal metadata only');
    if (child) {
      const found = [...items.values()].find(i => i.parentReference.id === parent && i.name === child);
      return found ? Response.json(found) : Response.json({}, { status: 404 });
    }
    return Response.json(current);
  };
  const instance = writer.createCertificationDocumentWriter(env, {
    fetch: fetchMock, tokenProvider: async () => jwt(changes.claims), guard: changes.guard,
  });
  return {
    instance, fetchMock, calls, items, stored, drive, root, file,
    unchanged() {
      assert.equal(JSON.stringify([...items.values()].filter(i => ![root, 'CERTIFICATIONS_FOLDER', 'ISO_FOLDER', 'TISAX_FOLDER'].includes(i.id) && !i.id.startsWith('NEW_ITEM_'))), protectedBefore);
    },
  };
}
function docs(env = {}, graph = {}, fetchMock = noNetwork) {
  return load('lib/certificaciones/documents.ts', {
    'node:crypto': crypto, fflate, './core': core, './documents-selected': writer,
    '@/lib/finanzas/microsoft-graph': graph,
  }, env, fetchMock);
}

test('Carga estática VM y fábrica sin I/O; ningún import real de aplicación', () => {
  const before = deniedNetwork;
  const d = docs();
  assert.equal(typeof d.uploadCertificationDocument, 'function');
  assert.equal(typeof d.downloadCertificationDocument, 'function');
  const f = fixture();
  assert.deepEqual(Object.keys(f.instance), ['upload']);
  assert.equal(f.calls.length, 0);
  assert.equal(deniedNetwork, before);
  assert.ok(!evaluated.some(file => /prisma|microsoft-graph|auth\.ts/.test(file)));
});
test('IDs aprobados exactos; ausencia/configuración incompleta nunca activa fallback', () => {
  assert.equal(pins.driveId, 'b!dKwRKEVNVkqVTYRAofWUsDd986ugfPhAt5zF_95R9jAHPFiBlpgQQYMomvM3D6Mc');
  assert.equal(pins.folderItemId, '01OLVTNNTKKO7GOUF2HFEZBV354BP3HD6G');
  for (const key of ['FINANCE_CERTIFICACIONES_DOCUMENTS_WRITE_ENABLED', ...Object.keys(credential),
    ...Object.keys(production).filter(k => k.startsWith('FINANCE_DOCUMENTOS_PRODUCTION_'))]) {
    assert.throws(() => fixture({ ...production, [key]: undefined }));
  }
  assert.throws(() => writer.createCertificationDocumentWriter({
    SHAREPOINT_DRIVE_ID: 'HISTORIC_DRIVE', MICROSOFT_GRAPH_CLIENT_ID: app,
  }));
  for (const key of ['FINANCE_DOCUMENTOS_PRODUCTION_DRIVE_ID', 'FINANCE_DOCUMENTOS_PRODUCTION_FOLDER_ITEM_ID'])
    assert.throws(() => fixture({ ...production, [key]: 'FOLDER_1' }));
  assert.equal(deniedNetwork, 0);
});
test('Gates/document runtime, readonly y entorno ambiguo cierran antes de Graph', () => {
  for (const change of [
    { FINANCE_DOCUMENTOS_PRODUCTION_ENABLED: '0' }, { FINANCE_MODEL_PRODUCTION_ENABLED: '0' },
    { FINANCE_EASY_PRODUCTION_ENABLED: '0' }, { FINANCE_AUTOMATIC_LINKS_DISABLED: '0' },
    { FINANCE_STAGING_SANDBOX: '1' }, { IO_PRODUCTION_READ_ONLY: '1' },
    { FINANCE_DEPLOYMENT_READ_ONLY: '1' }, { VERCEL_ENV: 'preview' }, { DATABASE_URL: 'invalid' },
  ]) assert.throws(() => fixture({ ...production, ...change }));
  assert.equal(deniedNetwork, 0);
});
for (const standard of ['ISO27001', 'TISAX']) test(`Futuro escritor ${standard}: sólo item10/Certificaciones/norma, .bin verificado`, async () => {
  const f = fixture();
  const result = await f.instance.upload(standard, bytes);
  assert.deepEqual({ ...result }, { drive: pins.driveId, item: 'NEW_ITEM_1', hash });
  assert.deepEqual(f.stored.get(result.item), bytes);
  const puts = f.calls.filter(c => c.method === 'PUT');
  assert.equal(puts.length, 1);
  assert.match(decodeURIComponent(puts[0].url), new RegExp(`/items/${standard === 'ISO27001' ? 'ISO_FOLDER' : 'TISAX_FOLDER'}:/${hash}\\.bin:/content`));
  assert.match(decodeURIComponent(f.calls[0].url), new RegExp(`/items/${pins.folderItemId}\\?`));
  f.unchanged();
});
test('Stage mantiene DocumentosPanel propio aun declarando pins Production; no usa IDsprod', async () => {
  const f = fixture({ ...staging,
    FINANCE_DOCUMENTOS_PRODUCTION_DRIVE_ID: pins.driveId,
    FINANCE_DOCUMENTOS_PRODUCTION_FOLDER_ITEM_ID: pins.folderItemId,
  });
  const saved = await f.instance.upload('TISAX', bytes);
  assert.equal(saved.drive, staging.FINANCE_CERTIFICACIONES_STAGING_DRIVE_ID);
  for (const call of f.calls) {
    assert.ok(!decodeURIComponent(call.url).includes(pins.driveId));
    assert.ok(!decodeURIComponent(call.url).includes(pins.folderItemId));
  }
  f.unchanged();
});
test('Stage exige pins propios y rechaza drive/item Production sin alias compartido', () => {
  for (const key of ['FINANCE_CERTIFICACIONES_STAGING_DRIVE_ID', 'FINANCE_CERTIFICACIONES_STAGING_FOLDER_ITEM_ID', 'FINANCE_CERTIFICACIONES_STAGING_PARENT_ITEM_ID'])
    assert.throws(() => fixture({ ...staging, [key]: undefined, SHAREPOINT_DRIVE_ID: 'HISTORIC_DRIVE' }));
  for (const change of [
    { FINANCE_CERTIFICACIONES_STAGING_DRIVE_ID: pins.driveId },
    { FINANCE_CERTIFICACIONES_STAGING_FOLDER_ITEM_ID: pins.folderItemId },
    { FINANCE_CERTIFICACIONES_STAGING_PARENT_ITEM_ID: pins.archivedFolderItemId },
    { FINANCE_CERTIFICACIONES_STAGING_FOLDER_ITEM_ID: 'root' },
    { VERCEL_ENV: 'production' }, { FINANCE_DOCUMENTOS_PRODUCTION_ENABLED: '1' },
  ]) assert.throws(() => fixture({ ...staging, ...change }));
});
test('Destino ausente/404/403 no crea carpetas ni cae a raíz histórica', async () => {
  for (const missing of [pins.folderItemId, 'CERTIFICATIONS_FOLDER', 'ISO_FOLDER']) {
    const f = fixture(); f.items.delete(missing);
    await assert.rejects(() => f.instance.upload('ISO27001', bytes));
    assert.equal(f.calls.filter(c => c.method !== 'GET').length, 0);
  }
});
test('ID/nombre/drive/padre/remoteItem/facet ajenos cierran antes de escribir', async () => {
  for (const [which, change] of [
    [pins.folderItemId, { id: 'FOLDER_1' }], [pins.folderItemId, { name: 'Certificaciones' }],
    [pins.folderItemId, { parentReference: { id: 'LIBRARY', driveId: 'OTHER_DRIVE' } }],
    ['CERTIFICATIONS_FOLDER', { parentReference: { id: 'HISTORIC_ROOT', driveId: pins.driveId } }],
    ['ISO_FOLDER', { parentReference: { id: 'FOLDER_1', driveId: pins.driveId } }],
    ['ISO_FOLDER', { remoteItem: { id: 'OUTSIDE_ITEM' } }], ['ISO_FOLDER', { folder: undefined, file: {}, size: 4 }],
  ]) {
    const f = fixture(); Object.assign(f.items.get(which), change);
    await assert.rejects(() => f.instance.upload('ISO27001', bytes));
    assert.equal(f.calls.filter(c => c.method !== 'GET').length, 0);
  }
  const s = fixture({ ...staging });
  s.items.get(s.root).parentReference.id = 'WRONG_STAGE_PARENT';
  await assert.rejects(() => s.instance.upload('ISO27001', bytes));
  assert.equal(s.calls.filter(c => c.method !== 'GET').length, 0);
});
test('Credencial dedicada válida obligatoria; roles amplios/adicionales/delegated rechazados', async () => {
  for (const change of [
    { roles: ['Files.ReadWrite.All'] }, { roles: ['Sites.Selected'] },
    { roles: ['Lists.SelectedOperations.Selected'] }, { roles: ['ListItems.SelectedOperations.Selected'] },
    { roles: ['Files.SelectedOperations.Selected', 'Mail.Read'] }, { scp: 'Files.ReadWrite' },
    { tid: app }, { appid: tenant }, { aud: 'other-resource' }, { exp: 1 },
  ]) {
    const f = fixture({ ...production }, { claims: change });
    await assert.rejects(() => f.instance.upload('ISO27001', bytes));
    assert.equal(f.calls.length, 0);
  }
  for (const change of [
    { FINANCE_DOCUMENTOS_GRAPH_CLIENT_ID: 'bad-client' }, { FINANCE_DOCUMENTOS_GRAPH_TENANT_ID: 'tenant-alias' },
    { FINANCE_DOCUMENTOS_GRAPH_CLIENT_SECRET: '\ninvalid' },
  ]) assert.throws(() => fixture({ ...production, ...change }));
});
test('Duplicado de mismo hash reutiliza sólo item del destino tras comprobar bytes', async () => {
  const f = fixture();
  const one = await f.instance.upload('ISO27001', bytes);
  const two = await f.instance.upload('ISO27001', bytes);
  assert.deepEqual(two, one);
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 1);
  f.unchanged();
});
test('Histórico idéntico no es fallback: se conserva copia futura nueva y no cambia el histórico', async () => {
  const f = fixture();
  const original = JSON.stringify(f.items.get('HISTORIC_ORIGINAL'));
  const receipt = await f.instance.upload('ISO27001', bytes);
  assert.notEqual(receipt.item, 'HISTORIC_ORIGINAL');
  assert.equal(JSON.stringify(f.items.get('HISTORIC_ORIGINAL')), original);
  f.unchanged();
});
for (const conflict of [409, 412]) test(`Conflicto concurrente ${conflict}: sólo reutilización verificada, sin overwrite`, async () => {
  const f = fixture({ ...production }, { concurrent: conflict });
  const result = await f.instance.upload('ISO27001', bytes);
  assert.equal(result.item, 'NEW_ITEM_1');
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 1);
  f.unchanged();
});
test('Hash diferente en existente no sobrescribe ni cambia puntero', async () => {
  const f = fixture();
  f.items.set('EXISTING_ITEM', f.file('EXISTING_ITEM', `${hash}.bin`, 'ISO_FOLDER'));
  f.stored.set('EXISTING_ITEM', Buffer.from('X'.repeat(bytes.length)));
  await assert.rejects(() => f.instance.upload('ISO27001', bytes));
  assert.equal(f.calls.filter(c => c.method !== 'GET').length, 0);
  assert.deepEqual(f.stored.get('EXISTING_ITEM'), Buffer.from('X'.repeat(bytes.length)));
});
test('Subida fallida/metadata ajena/hash fallido no devuelve referencia ni borra archivo', async () => {
  for (const changes of [
    { putFailure: 403 }, { putFailure: 500 }, { created: { id: 'FOLDER_1' } },
    { created: { parentReference: { id: 'HISTORIC_ROOT', driveId: pins.driveId } } },
    { created: { size: bytes.length + 1 } }, { download: Buffer.from('altered') },
  ]) {
    const f = fixture({ ...production }, changes);
    await assert.rejects(() => f.instance.upload('ISO27001', bytes));
    assert.equal(f.calls.filter(c => c.method === 'PUT').length, 1);
    assert.ok(f.calls.every(c => ['GET', 'PUT'].includes(c.method)));
    f.unchanged();
  }
});
test('Cambio de ancestro antes de PUT y cambio de configuración en vuelo fail-closed', async () => {
  let roots = 0;
  const f = fixture({ ...production }, { before: ({ parent, items }) => {
    if (parent === pins.folderItemId && ++roots === 2)
      items.get('ISO_FOLDER').parentReference.id = 'HISTORIC_ROOT';
  } });
  await assert.rejects(() => f.instance.upload('ISO27001', bytes));
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 0);
  const env = { ...production }; let guards = 0;
  const g = fixture(env, { guard: async () => { if (++guards === 3) env.FINANCE_CERTIFICACIONES_DOCUMENTS_WRITE_ENABLED = '0'; } });
  await assert.rejects(() => g.instance.upload('ISO27001', bytes));
  assert.equal(g.calls.filter(c => c.method === 'PUT').length, 0);
});
test('Norma inválida/path traversal/tamaño prohibido no produce peticiones', async () => {
  const f = fixture();
  await assert.rejects(() => f.instance.upload('../HISTORIC_ROOT', bytes));
  await assert.rejects(() => f.instance.upload('ISO27001', Buffer.alloc(0)));
  await assert.rejects(() => f.instance.upload('ISO27001', Buffer.alloc(4 * 1024 * 1024 + 1)));
  assert.equal(f.calls.length, 0);
});
test('Wrapper futuro valida PDF/DOCX y usa docwrite, nunca token genérico ni discovery', async () => {
  const f = fixture(); let generic = 0;
  const documents = load('lib/certificaciones/documents.ts', {
    'node:crypto': crypto, fflate, './core': core,
    './documents-selected': { createCertificationDocumentWriter: () => f.instance },
    '@/lib/finanzas/microsoft-graph': { getAccessToken() { generic++; throw Error('GENERIC_WRITE_FORBIDDEN'); } },
  });
  await assert.rejects(() => documents.uploadCertificationDocument('ISO27001', Buffer.from('invalid'), 'file.pdf'));
  const result = await documents.uploadCertificationDocument('ISO27001', bytes, 'synthetic.pdf');
  assert.equal(result.mime, 'application/pdf'); assert.equal(result.drive, pins.driveId);
  assert.equal(generic, 0);
  const word = Buffer.from(fflate.zipSync({ '[Content_Types].xml': fflate.strToU8('<Types/>'), 'word/document.xml': fflate.strToU8('<w:document/>') }));
  assert.equal(documents.validateDocument(word, 'synthetic.docx').extension, 'docx');
  assert.throws(() => documents.validateDocument(Buffer.from('bad'), 'synthetic.docx'));
});
test('Lecturas históricas conservan driveId/itemId y hash sin exigir destino/pins ni usar docwrite', async () => {
  const calls = []; let tokens = 0;
  const documents = docs({}, { getAccessToken: async () => { tokens++; return 'OFFLINE_HISTORIC_READ_TOKEN'; } }, async (url, init = {}) => {
    calls.push(String(url));
    assert.equal(init.method, undefined);
    assert.equal(init.headers.Authorization, 'Bearer OFFLINE_HISTORIC_READ_TOKEN');
    return new Response(Uint8Array.from(bytes).buffer);
  });
  const originalPointer = Object.freeze({ drive: 'ORIGINAL_DRIVE', item: 'ORIGINAL_ITEM', hash });
  assert.deepEqual(await documents.downloadCertificationDocument(originalPointer.drive, originalPointer.item, hash), bytes);
  assert.equal(calls[0], 'https://graph.microsoft.com/v1.0/drives/ORIGINAL_DRIVE/items/ORIGINAL_ITEM/content');
  await assert.rejects(() => documents.downloadCertificationDocument('ORIGINAL_DRIVE', 'ORIGINAL_ITEM', '0'.repeat(64)));
  assert.equal(tokens, 2); assert.deepEqual(originalPointer, { drive: 'ORIGINAL_DRIVE', item: 'ORIGINAL_ITEM', hash });
});
test('Lectura conserva rechazo de ID inválido/bytes excedidos sin operaciones de escritura', async () => {
  let calls = 0;
  const documents = docs({}, { getAccessToken: async () => 'OFFLINE_READ' }, async () => {
    calls++; return new Response(new Uint8Array(4 * 1024 * 1024 + 1));
  });
  await assert.rejects(() => documents.downloadCertificationDocument('../outside', 'ORIGINAL_ITEM', hash));
  assert.equal(calls, 0);
  await assert.rejects(() => documents.downloadCertificationDocument('ORIGINAL_DRIVE', 'ORIGINAL_ITEM', hash));
  assert.equal(calls, 1);
});
test('Sin escritor raíz histórico, aprovisionamiento, mutaciones o imports app reales en el código nuevo', () => {
  const documents = source('lib/certificaciones/documents.ts');
  const adapter = source('lib/certificaciones/documents-selected.ts');
  assert.doesNotMatch(documents, /findSharePointSite|getSiteDrive|SHAREPOINT_DRIVE_ID|root:\/Certificaciones|method:\s*["'](?:PUT|POST|PATCH|DELETE)/);
  assert.doesNotMatch(adapter, /getAccessToken|findSharePointSite|getSiteDrive|createDocumentosProductionTransport|method:\s*["'](?:POST|PATCH|DELETE)/);
  assert.equal(deniedNetwork, 0);
});

test('Token endpoint simulado usa sólo tenant/client/secret docwrite y Selected, sin proveedor genérico', async () => {
  const f = fixture(); const authCalls = [];
  const instance = writer.createCertificationDocumentWriter({ ...production }, {
    fetch: async (value, init = {}) => {
      const url = new URL(String(value));
      if (url.hostname === 'login.microsoftonline.com') {
        authCalls.push(String(url));
        assert.equal(String(url), `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`);
        assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
        const body = new URLSearchParams(init.body);
        assert.equal(body.get('client_id'), app);
        assert.equal(body.get('client_secret'), credential.FINANCE_DOCUMENTOS_GRAPH_CLIENT_SECRET);
        assert.equal(body.get('grant_type'), 'client_credentials');
        assert.equal(body.get('scope'), 'https://graph.microsoft.com/.default');
        return Response.json({ token_type: 'Bearer', access_token: jwt() });
      }
      return f.fetchMock(value, init);
    },
  });
  assert.equal(authCalls.length, 0);
  const saved = await instance.upload('ISO27001', bytes);
  assert.equal(saved.drive, pins.driveId); assert.equal(authCalls.length, 1);
  f.unchanged();
});
test('Wrapper sin destino/config falla sin pedir token genérico ni consultar raíz histórica', async () => {
  let generic = 0;
  const documents = docs({}, { getAccessToken: () => { generic++; throw Error('GENERIC_WRITE_FORBIDDEN'); } });
  await assert.rejects(() => documents.uploadCertificationDocument('ISO27001', bytes, 'synthetic.pdf'));
  assert.equal(generic, 0); assert.equal(deniedNetwork, 0);
});
test('Token endpoint simulado fallido o roles amplios no llega a Graph ni cambia destino', async () => {
  for (const answer of [
    () => Response.json({}, { status: 403 }),
    () => Response.json({ token_type: 'Bearer', access_token: jwt({ roles: ['Files.ReadWrite.All'] }) }),
  ]) {
    let graphCalls = 0; let authCalls = 0;
    const instance = writer.createCertificationDocumentWriter({ ...production }, {
      fetch: async value => {
        const url = new URL(String(value));
        if (url.hostname === 'login.microsoftonline.com') { authCalls++; return answer(); }
        graphCalls++; throw Error('UNEXPECTED_GRAPH_AFTER_FAILED_AUTH');
      },
    });
    await assert.rejects(() => instance.upload('ISO27001', bytes));
    assert.equal(authCalls, 1); assert.equal(graphCalls, 0);
  }
  assert.equal(deniedNetwork, 0);
});
