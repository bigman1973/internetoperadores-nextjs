import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const page = readFileSync(resolve(root, 'app/admin/finanzas/conciliar/page.tsx'), 'utf8');
const workspace = readFileSync(resolve(root, 'components/finanzas/conciliar/ConciliarWorkspace.tsx'), 'utf8');

assert.match(page, /const input = parseConciliarGetInput\(\{[\s\S]*?limit: '20',[\s\S]*?offset: '0',[\s\S]*?\}\);/, 'la semilla SSR debe solicitar sólo 20 filas desde el servidor');
assert.doesNotMatch(page, /limit: '50'/, 'la semilla SSR no debe cargar 50 filas para ocultar parte de ellas');

assert.match(workspace, /const PAGE_SIZE = 20;/, 'toda lectura visible debe usar páginas server-side de 20 filas');
assert.match(workspace, /const requestInput = useMemo\([\s\S]*?limit: PAGE_SIZE, offset[\s\S]*?\);/, 'los GET de la cola deben transportar límite y offset exactos');
assert.match(workspace, /useConciliarGlobalSearch\(\{ initialTab, initialQuery, initialOffset: 0, initialData: initialParsed, read: readGlobal, cache: searchCache \}\)/, 'la hidratación debe entregar al buscador global la misma semilla SSR de 20 filas en offset cero');
assert.doesNotMatch(workspace, /initialRequestKey/, 'la semilla SSR no debe volver a depender de la clave local retirada');
assert.match(workspace, /const response = await fetch\(`\$\{API\}\?\$\{params\.toString\(\)\}`, \{ cache: 'no-store', signal \}\);/, 'la página siguiente debe delegar en el lector del endpoint privado no-store, no filtrarse en local');
assert.match(workspace, /search\.changeOffset\(data\.offset \+ data\.rows\.length\)/, 'Ver más debe comenzar exactamente después de las filas devueltas por el servidor');
assert.match(workspace, />Ver más</, 'la cola debe ofrecer Ver más cuando queden resultados');
assert.match(workspace, /data\.offset \+ data\.rows\.length >= data\.total/, 'Ver más debe detenerse en el total server-side');
assert.doesNotMatch(workspace, /rows\.slice\(0,\s*20\)/, 'no se pueden cargar filas extra para esconderlas localmente');
assert.match(workspace, /responseViewFor\(requestInput\)/, 'las acciones deben conservar la vista exacta que estaba renderizada');
assert.match(workspace, /su proyección de respuesta no se adopta para[\s\S]*?evitar cruzar una vista o una generación distinta/, 'la respuesta inmediata de una acción no puede sustituir una vista paginada distinta');
assert.match(workspace, /invalidateProjectionMemory\(true\);\s*void load\(true, true\);/, 'tras una acción la página debe invalidarse y releerse en el servidor en vez de adoptar una foto de otra generación');

console.log('OK: Conciliar siembra 20 filas SSR y Ver más solicita páginas server-side consistentes.');
