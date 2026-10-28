const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = process.cwd();
const page = readFileSync(resolve(root, 'app/admin/finanzas/conciliar/page.tsx'), 'utf8');
const workspace = readFileSync(resolve(root, 'components/finanzas/conciliar/ConciliarWorkspace.tsx'), 'utf8');
const contract = readFileSync(resolve(root, 'components/finanzas/conciliar/conciliar-contract.ts'), 'utf8');
const documentPreview = readFileSync(resolve(root, 'components/finanzas/conciliar/ConciliarDocumentPreview.tsx'), 'utf8');
const remesaDialog = readFileSync(resolve(root, 'components/finanzas/conciliar/ConciliarRemesaConfirmationDialog.tsx'), 'utf8');
const recentHistory = readFileSync(resolve(root, 'components/finanzas/conciliar/ConciliarRecentHistory.tsx'), 'utf8');

function required(source, name, fragments) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) throw new Error(`${name}: falta el comportamiento esperado: ${fragment}`);
  }
}

required(page, 'página', [
  "assertConciliarRuntime()",
  "requireB4FinanceAccess('lectura'",
  "requireAuth('admin')",
  'readConciliarProjection(input)',
  'initialData={initialData}',
  'initialCutoff={initialCutoff}',
  'notFound()',
  'initialTab={initialTab} initialQuery={initialQuery}',
  'rel="preload" href="/fonts/RobotoLatin-VF.woff2"',
  'as="font" type="font/woff2" crossOrigin="anonymous"',
]);

required(readFileSync(resolve(root, 'app/globals.css'), 'utf8'), 'Roboto local inicial', [
  "font-family: 'IO Roboto'",
  "src: url('/fonts/RobotoLatin-VF.woff2')",
  'font-weight: 100 900',
  'font-display: swap',
  "--font-conciliar: 'IO Roboto'",
]);

required(contract, 'contrato de cliente', [
  "export const CONCILIAR_TABS = ['COBROS', 'EMITIDAS', 'PAGOS', 'RECIBIDAS']",
  "export const CONCILIAR_COLORS = ['VERDE', 'AMBAR', 'ROJO']",
  'parseConciliarReadResponse',
  'parseConciliarRemesaPreviewResponse',
  'preview.remesaDetalle',
  'totalFacturas > 2_000',
  'La composición de remesa no cierra exactamente el importe bancario.',
  'parseConciliarActionResponse',
  'parseConciliarUndoResponse',
  'safeDocumentHref',
  'safeFinanceHref',
  'escapeSpreadsheet',
  "export const CONCILIAR_EMITIDAS_GROUPS = ['CON_PROPUESTA', 'PARA_REVISAR', 'SIN_PROPUESTA']",
  'emitidasGroups: parseEmitidasGroups(raw.emitidasGroups)',
  "value.startsWith('/')",
  "value.startsWith('//')",
  'conciliar\\/archivo\\/',
  'decisionHash',
  'opaqueId',
]);

required(workspace, 'espacio de trabajo', [
  "const API = '/api/admin/finanzas/conciliar'",
  "action: 'confirmar'",
  "action: 'deshacer'",
  "action: 'pedir'",
  'AbortController',
  'readController.current?.abort()',
  'response.status === 409',
  'Reintenta exactamente la misma acción',
  'Todos los verdes visibles',
  'Confirmar seleccionados',
  'Exportar a Excel',
  "await import('xlsx')",
  'MAX_EXPORT_ROWS',
  'escapeSpreadsheet(',
  'safeDocumentHref(',
  'safeFinanceHref(',
  'aria-live="polite"',
  'role="tablist"',
  'role="tabpanel"',
  'aria-label="Estado de facturas emitidas"',
  'Con propuesta',
  'Para revisar',
  'Sin propuesta',
  'aria-pressed={active}',
  'emitidasGrupo',
  "params.set('emitidasGrupo', input.emitidasGrupo)",
  'setEmitidasGrupo((current) => current === next ? \'\' : next)',
  'setOffset(0); setSelected(new Set()); setOpenDocument(null);',
  'una propuesta no confirma el cobro ni marca la factura como cobrada',
  'fontFamily: \'var(--font-conciliar), Arial, Helvetica, sans-serif\'',
  '#FF5300',
  '#2D2A26',
  "useActuation()",
  "'x-io-acting-session': activeActuation.sessionId",
  "const REMESA_PREVIEW_API = '/api/admin/finanzas/conciliar/remesa-preview'",
  '`${REMESA_PREVIEW_API}?rowId=${encodeURIComponent(row.id)}`',
  'RemesaConfirmationDialog',
  'remesaPreviewController.current?.abort()',
  'no se puede mezclar con otros movimientos',
]);

required(documentPreview, 'detalle diferido', ['sandbox=""', 'referrerPolicy="same-origin"', 'document.movement.diferenciaCentimos']);
required(remesaDialog, 'remesa diferida', ['Segunda confirmación humana de la remesa', 'Confirmar sólo estas', 'confirmation.preview.filas.slice', 'onClick={onConfirm}', 'onClick={onCancel}']);
required(recentHistory, 'actividad diferida', ['onUndo(receipt)', '>Deshacer</button>']);
if (/fetch\([^)]*https?:\/\//.test(workspace)) throw new Error('La UI no debe llamar a una URL externa.');
if (/window\.open\(/.test(workspace)) throw new Error('La UI no debe abrir documentos sin control de URL.');
if (/import\s+(?!type\s*\{)[^;]+from\s+['"]@\/lib\/finanzas\/conciliar-contract['"]/.test(contract)) throw new Error('El contrato de navegador sólo puede importar tipos del contrato servidor.');
if (/node:crypto|createHash/.test(contract)) throw new Error('El contrato de navegador no puede incluir crypto de Node.');
if (!/for \(let pageOffset = 0; pageOffset < data\.total; pageOffset \+= EXPORT_PAGE_SIZE\)/.test(workspace)) throw new Error('La exportación debe paginar todas las filas filtradas.');
if (!/setSelected\(new Set\(\)\)/.test(workspace)) throw new Error('Un cambio de proyección debe eliminar selecciones ocultas.');
if (!/tab: 'EMITIDAS', from, to, accountId, query, cutoffDate, historic: true, limit: PAGE_SIZE, offset: historicOffset/.test(workspace)) throw new Error('La consulta histórica no debe heredar emitidasGrupo.');
if (/onConfirm=.*EmitidasGroupFilters|onAsk=.*EmitidasGroupFilters/.test(workspace)) throw new Error('Las tarjetas de Emitidas sólo pueden filtrar; no pueden mutar.');

console.log('OK: UI Conciliar validada estáticamente (sin red, BD, build ni tsc).');
