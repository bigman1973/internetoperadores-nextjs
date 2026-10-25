import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const usuarios = readFileSync('app/admin/usuarios/page.tsx', 'utf8');
assert.ok(usuarios.includes("await requireAdminAreaRead('admin.usuarios')"));
assert.ok(usuarios.indexOf("await requireAdminAreaRead('admin.usuarios')") < usuarios.indexOf('prisma.usuarioAdmin.findMany'));
assert.ok(!usuarios.includes('unstable_cache') && !usuarios.includes('use cache'));

const tarifas = readFileSync('app/tarifas/empresa/TarifasEmpresaClient.tsx', 'utf8');
assert.ok(tarifas.includes('b.visibles - a.visibles || a.primerIndice - b.primerIndice'));
assert.ok(tarifas.includes('resultado.elemento !== actuales[index]'));
assert.ok(tarifas.includes('Number(elemento.dataset.tarifaIndice)'));
assert.ok(tarifas.includes('useDeferredValue(busquedaEntrada)'));
const sorted = [{ id: 'C', visibles: 1, primerIndice: 11 }, { id: 'B', visibles: 3, primerIndice: 20 }, { id: 'A', visibles: 3, primerIndice: 2 }, { id: 'D', visibles: 0, primerIndice: Infinity }].sort((a, b) => b.visibles - a.visibles || a.primerIndice - b.primerIndice);
assert.deepEqual(sorted.map(item => item.id), ['A', 'B', 'C', 'D']);

const queues = readFileSync('components/finanzas/easy/EasyReviewQueues.tsx', 'utf8');
const queuePanel = readFileSync('components/finanzas/easy/EasyReviewQueuePanel.tsx', 'utf8');
assert.ok(!queues.includes('fetch(') && !queues.includes('useEffect'));
assert.ok(queuePanel.includes('hidden={!visible}'));
assert.ok(queuePanel.includes("data-easy-review-isolated={isolated ? 'true' : 'false'}"));
assert.ok(queuePanel.includes('@supports (content-visibility: auto)'));
assert.ok(queuePanel.includes('contain-intrinsic-size: auto 36rem'));
assert.ok(queues.includes("step === 'TODOS' || step === panel"));
const crm = readFileSync('app/admin/crm/contactos/page.tsx', 'utf8');
assert.ok(crm.indexOf('await requireAdminAreaRead') < crm.indexOf('<CrmContactsDirectoryContent'));
console.log('OK: autorización de lectura antes del SSR, orden de resultados preservado, colas sólo de presentación y CRM protegido. Fixtures sintéticos, sin conexión a BD.');
