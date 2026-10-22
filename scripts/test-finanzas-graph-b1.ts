import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const originalEnv = {
  tenant: process.env.MICROSOFT_GRAPH_TENANT_ID,
  client: process.env.MICROSOFT_GRAPH_CLIENT_ID,
  secret: process.env.MICROSOFT_GRAPH_CLIENT_SECRET,
  site: process.env.SHAREPOINT_SITE_ID,
  drive: process.env.SHAREPOINT_DRIVE_ID,
  driveAlias: process.env.DRIVE_ID,
  staging: process.env.FINANCE_STAGING_SANDBOX,
};

process.env.MICROSOFT_GRAPH_TENANT_ID = 'synthetic-tenant';
process.env.MICROSOFT_GRAPH_CLIENT_ID = 'synthetic-client';
process.env.MICROSOFT_GRAPH_CLIENT_SECRET = 'synthetic-secret';
process.env.SHAREPOINT_SITE_ID = 'site-2026';
process.env.SHAREPOINT_DRIVE_ID = 'drive-2026';
delete process.env.DRIVE_ID;
process.env.FINANCE_STAGING_SANDBOX = '1';

type MockResponse = { status?: number; body?: unknown; headers?: Record<string, string> };
type Route = MockResponse | (() => MockResponse | Promise<MockResponse>);

function response({ status = 200, body = {}, headers = {} }: MockResponse = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function graphUrl(path: string, query = ''): string {
  return `https://graph.microsoft.com/v1.0${path}${query}`;
}

function freshModule() {
  return import(`../lib/finanzas/microsoft-graph.ts?synthetic=${Date.now()}-${Math.random()}`);
}

function installRoutes(routes: Map<string, Route>, calls: string[] = [], options: RequestInit[] = []): void {
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    options.push(init || {});

    if (url.startsWith('https://login.microsoftonline.com/')) {
      assert.equal(init?.redirect, 'error', 'token fetch must reject redirects');
      return response({ body: { access_token: 'synthetic-token', expires_in: 3600 } });
    }

    const route = routes.get(url);
    assert.ok(route, `unexpected synthetic request: ${url}`);
    const routeResponse = typeof route === 'function' ? await route() : route;
    return response(routeResponse);
  }) as typeof fetch;
}

async function expectReject(operation: () => Promise<unknown>, matcher: RegExp): Promise<void> {
  await assert.rejects(operation, matcher);
}

function folder(name: string, id = `folder-${name}`) {
  return { id, name, folder: { childCount: 0 } };
}

function file(name: string, id = `file-${name}`) {
  return { id, name, size: 10, lastModifiedDateTime: '2026-01-02T03:04:05.000Z', file: { mimeType: 'application/pdf' } };
}

async function testPaginationAndPathMetadata(): Promise<void> {
  const driveId = 'drive-2026';
  const rootPath = '2026';
  const rootFirst = graphUrl(`/drives/${driveId}/root:/2026:/children`, '?$top=200');
  const rootNext = `${rootFirst}&$skiptoken=root-page-2`;
  const nestedPath = graphUrl(`/drives/${driveId}/root:/2026/Nested:/children`, '?$top=200');
  const nestedNext = `${nestedPath}&$skiptoken=nested-page-2`;

  const rootFilesPage1 = Array.from({ length: 199 }, (_, index) => file(`root-${index + 1}.pdf`, `root-${index + 1}`));
  const rootFilesPage2 = Array.from({ length: 31 }, (_, index) => file(`root-${index + 200}.pdf`, `root-${index + 200}`));
  const nestedFilesPage1 = Array.from({ length: 200 }, (_, index) => file(`nested-${index + 1}.pdf`, `nested-${index + 1}`));
  const nestedFilesPage2 = Array.from({ length: 7 }, (_, index) => file(`nested-${index + 201}.pdf`, `nested-${index + 201}`));

  const calls: string[] = [];
  installRoutes(new Map([
    [rootFirst, { body: { value: [...rootFilesPage1, folder('Nested')], '@odata.nextLink': rootNext } }],
    [rootNext, { body: { value: rootFilesPage2 } }],
    [nestedPath, { body: { value: nestedFilesPage1, '@odata.nextLink': nestedNext } }],
    [nestedNext, { body: { value: nestedFilesPage2 } }],
  ]), calls);

  const graph = await freshModule();
  const contents = await graph.listFolderContents(driveId, rootPath);
  assert.equal(contents.length, 437, 'must exhaust all root and nested pages (>200 each)');
  assert.equal(new Set(contents.map(item => item.id)).size, 437, 'no item may be omitted or duplicated');
  assert.ok(contents.some(item => item.id === 'root-230'), 'root second page must be included');
  assert.ok(contents.some(item => item.id === 'nested-207'), 'nested second page must be included');

  const rootFile = contents.find(item => item.id === 'root-1')!;
  assert.equal(rootFile.relativeFolderPath, '2026');
  assert.equal(rootFile.folderPath, '2026');
  assert.equal(rootFile.fullPath, '2026/root-1.pdf');
  const nestedFile = contents.find(item => item.id === 'nested-1')!;
  assert.equal(nestedFile.relativeFolderPath, '2026/Nested');
  assert.equal(nestedFile.folderPath, '2026/Nested');
  assert.equal(nestedFile.fullPath, '2026/Nested/nested-1.pdf');

  const flatCalls: string[] = [];
  installRoutes(new Map([[rootFirst, { body: { value: [file('root-direct.pdf'), folder('Nested')] } }]]), flatCalls);
  const flatGraph = await freshModule();
  const flat = await flatGraph.listFolderContents(driveId, rootPath, false);
  assert.equal(flat.length, 2, 'recursive=false retains root files and folders for API callers');
  assert.equal(flat.filter(item => !item.folder).length, 1, 'recursive=false includes direct root files');
  assert.equal(flat.filter(item => item.folder).length, 1, 'recursive=false includes folders without expanding them');
  assert.equal(flatCalls.filter(call => call.includes('/Nested:/children')).length, 0, 'recursive=false must not list child folders');
  assert.ok(calls.every(call => !call.includes('synthetic-token')), 'synthetic token must never appear in requested URLs');
}

async function testFailClosedPaginationAndChildErrors(): Promise<void> {
  const driveId = 'drive-2026';
  const root = graphUrl(`/drives/${driveId}/root:/2026:/children`, '?$top=200');

  const cases: Array<{ name: string; nextLink: string; expected: RegExp }> = [
    { name: 'external malware', nextLink: 'https://attacker.invalid/steal', expected: /Enlace de paginación de Graph no permitido/ },
    { name: 'wrong Graph route', nextLink: graphUrl(`/drives/${driveId}/root:/other:/children`, '?$top=200'), expected: /fuera de la ruta esperada/ },
    { name: 'redirect-shaped unsupported host', nextLink: 'https://graph.microsoft.com.evil.invalid/v1.0/x', expected: /no permitido/ },
    { name: 'malformed URL', nextLink: 'not a url', expected: /inválido/ },
  ];

  for (const testCase of cases) {
    installRoutes(new Map([[root, { body: { value: [file('partial.pdf')], '@odata.nextLink': testCase.nextLink } }]]));
    const graph = await freshModule();
    await expectReject(() => graph.listFolderContents(driveId, '2026'), testCase.expected);
  }

  const repeated = `${root}&$skiptoken=again`;
  installRoutes(new Map([
    [root, { body: { value: [], '@odata.nextLink': repeated } }],
    [repeated, { body: { value: [], '@odata.nextLink': repeated } }],
  ]));
  let graph = await freshModule();
  await expectReject(() => graph.listFolderContents(driveId, '2026'), /Bucle de paginación/);

  const redirectOptions: RequestInit[] = [];
  installRoutes(new Map([
    [root, { status: 302, headers: { location: 'https://attacker.invalid/redirect-target' } }],
  ]), [], redirectOptions);
  graph = await freshModule();
  await expectReject(() => graph.listFolderContents(driveId, '2026'), /Graph API error \(302\)/);
  assert.equal(redirectOptions.at(-1)?.redirect, 'error', 'collection requests must reject redirects instead of following them');

  const child = graphUrl(`/drives/${driveId}/root:/2026/BadChild:/children`, '?$top=200');
  installRoutes(new Map([
    [root, { body: { value: [file('root-before-error.pdf'), folder('BadChild')] } }],
    [child, { status: 500, body: { error: { message: 'hidden upstream detail' } } }],
  ]));
  graph = await freshModule();
  await expectReject(() => graph.listFolderContents(driveId, '2026'), /Graph API error \(500\)/);
}

async function testStrictItemIdsAndScopedDuplicateDetection(): Promise<void> {
  const driveId = 'drive-2026';
  const root = graphUrl(`/drives/${driveId}/root:/2026:/children`, '?$top=200');
  const invalidIds: unknown[] = [undefined, null, 123, '', '   '];

  for (const id of invalidIds) {
    installRoutes(new Map([[root, { body: { value: [{ id, name: 'malformed.pdf', file: { mimeType: 'application/pdf' } }] } }]]));
    const graph = await freshModule();
    await expectReject(() => graph.listFolderContents(driveId, '2026'), /sin ID válido/);
  }

  const next = `${root}&$skiptoken=duplicate-page`;
  installRoutes(new Map([
    [root, { body: { value: [file('first.pdf', 'duplicate-id')], '@odata.nextLink': next } }],
    [next, { body: { value: [file('second.pdf', 'duplicate-id')] } }],
  ]));
  let graph = await freshModule();
  await expectReject(() => graph.listFolderContents(driveId, '2026'), /ID de elemento de Graph repetido/);

  const child = graphUrl(`/drives/${driveId}/root:/2026/Nested:/children`, '?$top=200');
  installRoutes(new Map([
    [root, { body: { value: [folder('Nested', 'duplicate-folder-id')] } }],
    [child, { body: { value: [file('nested.pdf', 'duplicate-folder-id')] } }],
  ]));
  graph = await freshModule();
  await expectReject(() => graph.listFolderContents(driveId, '2026'), /ID de elemento de Graph repetido/);

  // The duplicate set belongs to one list invocation, not to the imported module.
  installRoutes(new Map([[root, { body: { value: [file('fresh-call.pdf', 'duplicate-id')] } }]]));
  assert.equal((await graph.listFolderContents(driveId, '2026'))[0].id, 'duplicate-id');
}

async function testStrictInvoiceLibraryAssociation(): Promise<void> {
  const siteId = 'site-2026';
  const driveId = 'drive-2026';
  const site = graphUrl(`/sites/${siteId}`);
  const associatedDrive = graphUrl(`/sites/${siteId}/drives/${driveId}`);
  const root = graphUrl(`/drives/${driveId}/root:/2.%20Contabilidad%20y%20finanzas/2.%20Facturas%20recibidas/1.%20Facturas%20recibidas-%20Internet%20Operadores/2026`);

  installRoutes(new Map([
    [site, { body: { id: siteId, displayName: 'IO: Accounting & Finances' } }],
    [associatedDrive, { body: { id: driveId, name: 'Documentos', parentReference: { siteId } } }],
    [root, { body: { id: 'root-2026', name: '2026', folder: { childCount: 3 } } }],
  ]));
  const graph = await freshModule();
  assert.deepEqual(await graph.resolveInvoiceLibrary(), {
    siteId,
    siteName: 'IO: Accounting & Finances',
    driveId,
    driveName: 'Documentos',
    rootPath: '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026',
    rootFolderId: 'root-2026',
  });

  installRoutes(new Map([
    [site, { body: { id: siteId, displayName: 'IO: Accounting & Finances' } }],
    [associatedDrive, { body: { id: driveId, name: 'Documentos', parentReference: { siteId: 'wrong-site' } } }],
  ]));
  const mismatchGraph = await freshModule();
  await expectReject(() => mismatchGraph.resolveInvoiceLibrary(), /no pertenece al site/);

  delete process.env.SHAREPOINT_SITE_ID;
  installRoutes(new Map());
  const missingIdGraph = await freshModule();
  await expectReject(() => missingIdGraph.resolveInvoiceLibrary(), /SHAREPOINT_SITE_ID/);
  process.env.SHAREPOINT_SITE_ID = siteId;
}

async function testLegacyConfiguredIdsAndStagingMoveProtection(): Promise<void> {
  const siteId = 'site-2026';
  const driveId = 'drive-2026';
  const site = graphUrl(`/sites/${siteId}`);
  const calls: string[] = [];
  installRoutes(new Map([[site, { body: { id: siteId, displayName: 'Configured site' } }]]), calls);
  const graph = await freshModule();
  assert.deepEqual(await graph.findSharePointSite(), { siteId, siteName: 'Configured site' });
  assert.equal(await graph.getSiteDrive(siteId), driveId, 'legacy drive helper must honor configured ID');
  assert.equal(calls.some(call => call.includes('/drives')), false, 'configured legacy drive must not silently discover another drive');
  await expectReject(() => graph.moveFile(driveId, 'real-pdf', 'destination'), /deshabilitados/);
}

async function main(): Promise<void> {
  try {
    await testPaginationAndPathMetadata();
    await testFailClosedPaginationAndChildErrors();
    await testStrictItemIdsAndScopedDuplicateDetection();
    await testStrictInvoiceLibraryAssociation();
    await testLegacyConfiguredIdsAndStagingMoveProtection();
    console.log('B1 Graph synthetic tests: pagination, fail-closed links, strict association, metadata and staging guard: OK');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv.tenant === undefined) delete process.env.MICROSOFT_GRAPH_TENANT_ID; else process.env.MICROSOFT_GRAPH_TENANT_ID = originalEnv.tenant;
    if (originalEnv.client === undefined) delete process.env.MICROSOFT_GRAPH_CLIENT_ID; else process.env.MICROSOFT_GRAPH_CLIENT_ID = originalEnv.client;
    if (originalEnv.secret === undefined) delete process.env.MICROSOFT_GRAPH_CLIENT_SECRET; else process.env.MICROSOFT_GRAPH_CLIENT_SECRET = originalEnv.secret;
    if (originalEnv.site === undefined) delete process.env.SHAREPOINT_SITE_ID; else process.env.SHAREPOINT_SITE_ID = originalEnv.site;
    if (originalEnv.drive === undefined) delete process.env.SHAREPOINT_DRIVE_ID; else process.env.SHAREPOINT_DRIVE_ID = originalEnv.drive;
    if (originalEnv.driveAlias === undefined) delete process.env.DRIVE_ID; else process.env.DRIVE_ID = originalEnv.driveAlias;
    if (originalEnv.staging === undefined) delete process.env.FINANCE_STAGING_SANDBOX; else process.env.FINANCE_STAGING_SANDBOX = originalEnv.staging;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Synthetic B1 test failed');
  process.exitCode = 1;
});
