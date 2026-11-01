import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const workspace = read('components/finanzas/conciliar/ConciliarWorkspace.tsx');
const page = read('app/admin/finanzas/conciliar/page.tsx');
const documentPreview = read('components/finanzas/conciliar/ConciliarDocumentPreview.tsx');
const remesaDialog = read('components/finanzas/conciliar/ConciliarRemesaConfirmationDialog.tsx');
const recentHistory = read('components/finanzas/conciliar/ConciliarRecentHistory.tsx');
const globalSearch = read('components/finanzas/conciliar/conciliar-global-search.ts');

test('la primera página conserva datos y tabla SSR con una única lectura de proyección', () => {
  assert.match(page, /requireB4FinanceAccess\('lectura', await requireAuth\('admin'\)\)/);
  assert.match(page, /const initialData = await readConciliarProjection\(input\)/);
  assert(page.indexOf('const initialData = await readConciliarProjection(input)') < page.indexOf('return <>'));
  assert.match(page, /initialData=\{initialData\}/);
  assert.doesNotMatch(page, /Promise\.all\(/, 'el render inicial no espera una cola documental ajena a la foto');
  assert.doesNotMatch(page, /confirmingReadingQueue|readFinanceConfirmingReadingQueue/, 'la cola lifecycle congelada no forma parte del SSR de Conciliar');
  assert.match(workspace, /const initialParsed = useMemo\(\(\) => initialData === undefined \? null : parseConciliarReadResponse\(initialData\)/);
  assert.match(workspace, /useConciliarGlobalSearch\(\{ initialTab, initialQuery, initialOffset: 0, initialData: initialParsed, read: readGlobal \}\)/);
  assert.match(globalSearch, /initial\.current\.initialData != null/);
  assert.match(globalSearch, /const \[acceptedData, setAcceptedData\] = useState<ConciliarReadResponse \| null>\(initial\.current\.initialData \?\? null\)/);
  assert.match(globalSearch, /phase: hasInitialData \? 'idle' : 'loading'/);
  assert.match(globalSearch, /const visibleData = state\.phase === 'idle' && dataGeneration === state\.generation \? acceptedData : null/);
  assert.match(workspace, /role="tabpanel"/);
  assert.match(workspace, /<SummaryTab /);
  assert.match(workspace, /<ConciliarRowView /);
  assert.doesNotMatch(workspace, /dynamic\(\(\) => import\('\.\/ConciliarRowView'\)/);
  assert.doesNotMatch(workspace, /dynamic\(\(\) => import\('\.\/SummaryTab'\)/);
});

test('los paneles no visibles se parten por interacción sin desactivar SSR de la vista visible', () => {
  assert.match(workspace, /const loadConciliarDocumentPreview = \(\) => import\('\.\/ConciliarDocumentPreview'\)/);
  assert.match(workspace, /const ConciliarDocumentPreview = dynamic\(loadConciliarDocumentPreview\)/);
  assert.doesNotMatch(workspace, /import ConciliarDocumentPreview from/);
  for (const name of ['ConciliarRecentHistory', 'ConciliarRemesaConfirmationDialog']) {
    assert.match(workspace, new RegExp(`const ${name} = dynamic\\(\\(\\) => import\\('./${name}'\\)\\);`));
  }
  assert.match(workspace, /openDocument && <ConciliarDocumentPreview /);
  assert.match(workspace, /receipts\.length > 0 && <ConciliarRecentHistory /);
  assert.match(workspace, /remesaConfirmation && <ConciliarRemesaConfirmationDialog /);
  assert.match(workspace, /showInterestInvoices && <ConfirmingInterestInvoices \/>/);
  assert.doesNotMatch(workspace, /Conciliar(?:DocumentPreview|RecentHistory|RemesaConfirmationDialog).*ssr:\s*false/);
  assert.doesNotMatch(documentPreview, /<(?:iframe|object|embed)\b/);
  assert.match(documentPreview, /href=\{detail\.pdfHref\} target="_blank" rel="noopener noreferrer"/);
  assert.match(remesaDialog, /aria-modal="true"/);
  assert.match(remesaDialog, /function firstFocusable/);
  assert.match(recentHistory, /Actividad reciente/);
});

test('no se adelantan XLS, PDF ni gráficos a la ruta de conciliación', () => {
  const conciliarSources = [workspace, documentPreview, remesaDialog, recentHistory];
  for (const source of conciliarSources) {
    assert.doesNotMatch(source, /from ['"](?:xlsx|@react-pdf\/renderer|pdfjs-dist|recharts)['"]/);
  }
  assert.match(workspace, /const XLSX = await import\('xlsx'\)/);
  assert.doesNotMatch(workspace, /import\s+XLSX\s+from ['"]xlsx['"]/);
});

test('pedir y la auditoría de acciones mantienen el flujo existente', () => {
  assert.match(workspace, /const askForDocument = useCallback/);
  assert.match(workspace, /action: 'pedir'/);
  assert.match(workspace, /onAsk=\{\(\) => askForDocument\(row\)\}/);
  assert.match(workspace, /const post = useCallback/);
  assert.match(workspace, /'x-io-acting-session': activeActuation\.sessionId/);
});
