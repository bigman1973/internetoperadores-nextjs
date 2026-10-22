import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const workspacePath = resolve(root, 'components/finanzas/InvoiceQualityWorkspace.tsx');
const pagePath = resolve(root, 'app/admin/finanzas/facturas/page.tsx');
const workspace = readFileSync(workspacePath, 'utf8');
const page = readFileSync(pagePath, 'utf8');

function requireFragment(source: string, fragment: string, name: string) {
  if (!source.includes(fragment)) throw new Error(`${name}: falta «${fragment}».`);
}

function forbidFragment(source: string, fragment: string, name: string) {
  if (source.includes(fragment)) throw new Error(`${name}: no debe contener «${fragment}».`);
}

const requiredWorkspace = [
  "type Tab = 'copias' | 'revisar';",
  "label: 'Copias'",
  "label: 'Revisar lectura'",
  '/api/admin/finanzas/facturas/calidad?',
  "tipo: tab === 'copias' ? 'copias' : 'cuarentena'",
  'canWriteB2 = granularCanWrite && inventory.canWriteB2 === true',
  'SIN IMPORTE',
  'Copia excluida de los totales.',
  'facturasRevisionHistorica',
  'Canónica:',
  'PDF protegido pendiente de exponer por la cola B2.',
  'useRef<HTMLDialogElement>(null)',
  'dialog.showModal()',
  'dialog.close()',
  '<dialog',
  'onCancel={event => {',
  'openerRef.current?.focus()',
  'if (submitting) return;',
  'if (dirty)',
  'onChange={event => onChange(event.target.value)}',
  'versionCalidad: integerOrNull(item.versionCalidad)',
  "item.origenCalidad === 'HISTORICA' ? item.versionCalidad : item.version",
  'const requestFingerprint = JSON.stringify({ id: item.id, version, correction });',
  'requestRef.current?.fingerprint !== requestFingerprint',
  'solicitudId: requestRef.current.solicitudId',
  'method: \'PATCH\'',
  '/api/admin/finanzas/facturas/calidad/${encodeURIComponent(item.id)}',
  'body: JSON.stringify(body)',
  'fecha: form.fecha',
  'Los importes vacíos no se convierten en cero.',
  'no se modifica el original.',
  'controllers.current.forEach(controller => controller.abort())',
];
for (const fragment of requiredWorkspace) requireFragment(workspace, fragment, 'InvoiceQualityWorkspace');

const forbiddenWorkspace = [
  "type Tab = 'activas' | 'copias' | 'revisar';",
  "label: 'Facturas activas'",
  'function ActiveRows',
  '/api/admin/finanzas/facturas?${',
  "calidad: 'VALIDA'",
  "method: 'POST'",
  'documentoId: item.id',
  'graph.microsoft.com',
  'total || 0',
  'total ?? 0',
  '/calidad/${encodeURIComponent(item.id)}/pdf',
];
for (const fragment of forbiddenWorkspace) forbidFragment(workspace, fragment, 'InvoiceQualityWorkspace');

requireFragment(page, "import InvoiceQualityWorkspace from '@/components/finanzas/InvoiceQualityWorkspace';", 'FacturasPage');
requireFragment(page, '<InvoiceQualityWorkspace />', 'FacturasPage');
requireFragment(page, "const SIN_DATO = 'No disponible';", 'FacturasPage B1');
requireFragment(page, 'InvoiceLocationHistory facturaId={f.id}', 'FacturasPage B1');
requireFragment(page, 'soloUbicaciones: true', 'FacturasPage B1');

console.log('OK: UI B2 valida PATCH versionado, UUID estable por reintento, diálogo accesible y listado B1 único.');
