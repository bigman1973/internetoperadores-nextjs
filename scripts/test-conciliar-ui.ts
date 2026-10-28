const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = process.cwd();
const page = readFileSync(resolve(root, 'app/admin/finanzas/conciliar/page.tsx'), 'utf8');
const workspace = readFileSync(resolve(root, 'components/finanzas/conciliar/ConciliarWorkspace.tsx'), 'utf8');
const helpers = readFileSync(resolve(root, 'components/finanzas/conciliar/conciliar-ui-helpers.ts'), 'utf8');
const contract = readFileSync(resolve(root, 'components/finanzas/conciliar/conciliar-contract.ts'), 'utf8');
const xlsx = readFileSync(resolve(root, 'components/finanzas/conciliar/conciliar-xlsx.ts'), 'utf8');
const documentPreview = readFileSync(resolve(root, 'components/finanzas/conciliar/ConciliarDocumentPreview.tsx'), 'utf8');
const remesaDialog = readFileSync(resolve(root, 'components/finanzas/conciliar/ConciliarRemesaConfirmationDialog.tsx'), 'utf8');
const recentHistory = readFileSync(resolve(root, 'components/finanzas/conciliar/ConciliarRecentHistory.tsx'), 'utf8');
const fileHrefGuard = readFileSync(resolve(root, 'lib/finanzas/conciliar-file-href.ts'), 'utf8');

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
  'return safeConciliarDocumentHref(value)',
  'decisionHash',
  'opaqueId',
]);
required(fileHrefGuard, 'lectores privados compartidos', ['conciliar\\/archivo\\/', 'movimientos\\/', 'ADJUNTO_B5:', 'entries.length !== 1', "entries[0][0] !== 'archivoId'", 'url.hash', "url.origin !== 'https://conciliar.local'"]);

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
  "await import('./conciliar-xlsx')",
  'createConciliarXlsx',
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
  'closeDetail(); remesaPreviewController.current?.abort(); setRemesaConfirmation(null);',
  'detailController.current?.abort()',
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
  'shouldRenderConciliarGroups(displayGroups, globalOrder)',
  'setGlobalOrder(true)',
  'data-testid="conciliar-global-order"',
  'SortHeader field="FECHA"',
  'SortHeader field="CONCEPTO"',
  'SortHeader field="IMPORTE"',
]);

required(helpers, 'helpers de presentación', [
  'Mismo cliente e importe',
  'El banco cita el nº de factura',
  'groupConciliarRows',
  'shouldRenderConciliarGroups',
]);

required(documentPreview, 'detalle diferido', ['role="dialog"', 'target="_blank"', 'drawer.row.importeCentimos', 'drawer.row.motivo', 'Abrir PDF']);
required(remesaDialog, 'remesa diferida', ['Segunda confirmación humana de la remesa', 'Confirmar sólo estas', 'confirmation.preview.filas.slice', 'onClick={onConfirm}', 'onClick={onCancel}']);
required(recentHistory, 'actividad diferida', ['onUndo(receipt)', '>Deshacer</button>']);
if (/fetch\([^)]*https?:\/\//.test(workspace)) throw new Error('La UI no debe llamar a una URL externa.');
if (/window\.open\(/.test(workspace)) throw new Error('La UI no debe abrir documentos sin control de URL.');
if (/import\s+(?!type\s*\{)[^;]+from\s+['"]@\/lib\/finanzas\/conciliar-contract['"]/.test(contract)) throw new Error('El contrato de navegador sólo puede importar tipos del contrato servidor.');
if (/node:crypto|createHash/.test(contract)) throw new Error('El contrato de navegador no puede incluir crypto de Node.');
if (!/for \(let pageOffset = 0; pageOffset < data\.total; pageOffset \+= EXPORT_PAGE_SIZE\)/.test(workspace)) throw new Error('La exportación debe paginar todas las filas filtradas.');
if (!/new Map\(\)/.test(workspace) || !/reviewSelectionForCurrentRows\(selected, rows\)/.test(workspace)) throw new Error('La selección debe conservar su hash y revisar sólo las filas visibles actuales.');
if (/setSelected\(new Set\(\)\)/.test(workspace)) throw new Error('Un refresco no debe borrar selecciones ocultas automáticamente.');
if (!/tab: 'EMITIDAS', from, to, accountId, query, cutoffDate, historic: true, estado, grupo, orden, direccion, limit: PAGE_SIZE, offset: historicOffset/.test(workspace)) throw new Error('La consulta histórica debe heredar filtros comunes, no emitidasGrupo.');
if (/onConfirm=.*EmitidasGroupFilters|onAsk=.*EmitidasGroupFilters/.test(workspace)) throw new Error('Las tarjetas de Emitidas sólo pueden filtrar; no pueden mutar.');
if (!/showGroupedRows \? displayGroups\.map\([\s\S]*?\) : <div data-testid="conciliar-global-order">\{rows\.map\(renderRow\)\}<\/div>/.test(workspace)) throw new Error('Cualquier cabecera ordenable debe renderizar la lista plana, también Importe.');
if (!/group\.rows\.length > 1 \? <section data-conciliar-group=\{group\.label\}/.test(workspace)) throw new Error('Un grupo de una sola fila no debe añadir una cabecera redundante.');
if (!/initialOrden=\{initialOrden\} initialDireccion=\{initialDireccion\} initialGlobalOrder=\{initialGlobalOrder\}/.test(page)) throw new Error('La proyección SSR debe conservar la intención de orden de la URL.');
required(xlsx, 'exportador XLSX', ['CONCILIAR_XLSX_HEADERS', "'Fecha', 'Estado', 'Grupo / tipo', 'Tercero / proveedor', 'Concepto', 'Cuenta', 'Documento', 'Importe', 'Nota'", "sheet['!autofilter']", 'freezeFirstRowXlsx', 'state="frozen"', 'escapeSpreadsheet', 'row.importeCentimos / 100']);

console.log('OK: UI Conciliar validada estáticamente (sin red, BD, build ni tsc).');
