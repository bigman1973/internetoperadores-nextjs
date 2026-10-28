/* Prueba estática pura: no importa app, Prisma, red ni navegador. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const page = readFileSync(resolve('app/admin/finanzas/para-pedir/page.tsx'), 'utf8');
const workspace = readFileSync(resolve('components/finanzas/easy/newParaPedirWorkspace.tsx'), 'utf8');
const route = readFileSync(resolve('app/api/admin/finanzas/modo-facil/para-pedir/route.ts'), 'utf8');

assert.match(page, /assertFinanceEasyRuntime\(\)/);
assert.match(page, /requireB4FinanceAccess\('lectura', await requireAuth\('admin'\)\)/);
assert.match(page, /readParaPedirProjection\(parseParaPedirInput\(\{ limit: '50', offset: '0' \}\)\)/);
assert.match(page, /initialData=\{\{ \.\.\.initialData, stagingOnly: context\.stagingOnly \}\}/);
assert.match(workspace, /const \[data, setData\] = useState<ParaPedirRead>\(initialData\)/);
assert.match(workspace, /if \(skipInitialRead\.current\) \{ skipInitialRead\.current = false; return; \}/);
assert.match(workspace, /await Promise\.all\(\[import\('xlsx'\), import\('\.\/para-pedir-xlsx'\)\]\)/);
assert.match(route, /requireB4FinanceAccess\('lectura'/);
assert.match(route, /readParaPedirProjection\(parseParaPedirInput\(queryRecord\(request\)\)\)/);
assert.doesNotMatch(route, /readEasyReconciliation|rebuildConciliarProjection|fetch\(/, 'GET no recarga Modo Fácil ni reconstruye');
assert.match(route, /export async function POST\(\) \{ return privateJson\(/);
assert.doesNotMatch(route, /requireB4FinanceAccess\('escritura'/, 'Para pedir no abre un POST propio de escritura');
assert.match(workspace, /const CONCILIAR_API = '\/api\/admin\/finanzas\/conciliar'/);
assert.match(workspace, /action: 'pedir', id: capability\.rowId, decisionHash: capability\.decisionHash, idempotencyKey: makeIdempotencyKey\(\)/);
assert.match(workspace, /'x-io-acting-session': activeActuation\.sessionId/);
assert.match(workspace, /Ya tengo el papel → revisar en Conciliar/);
assert.doesNotMatch(workspace, /\/admin\/finanzas\/pendientes/, 'la bandeja no enlaza a un módulo de carga sin verificar su autorización actual');
assert.doesNotMatch(workspace, /useEffect\(\(\) => \{ void load\(\); \}, \[load\]\)/, 'la primera pintura no lanza la antigua carga bloqueante');

console.log(JSON.stringify({ test: 'para-pedir-ssr-static', databaseQueries: 0, networkCalls: 0, verified: ['b4-live-acl-before-ssr', 'initial-projection-visible', 'no-client-initial-fetch', 'deferred-xlsx'] }));
