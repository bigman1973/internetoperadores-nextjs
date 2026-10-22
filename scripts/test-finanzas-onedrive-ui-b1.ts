import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const page = readFileSync(resolve(process.cwd(), 'app/admin/finanzas/facturas/page.tsx'), 'utf8');
const required = [
  "import { useRole } from '@/components/admin/RoleContext';",
  "const SIN_DATO = 'No disponible';",
  "{ clave: 'confirming_draxton'",
  "{ clave: 'raiz'",
  'Releer ubicación',
  'soloUbicaciones: true',
  'Ruta resuelta de OneDrive',
  'Staging sandbox:',
  'Documentos',
  'Admitidos',
  'Importados',
  'Nuevos',
  "hasAreaAccess('admin.finanzas.facturas', 'escritura')",
  'InvoiceLocationHistory facturaId={f.id}',
  'syncStatus?.canWrite !== false',
  'syncStatus?.canWrite === true && syncStatus?.inventarioCompleto === true',
  'data.requiereConfirmarBiblioteca',
  'normalizarCarpeta(syncStatus.pendiente ?? syncStatus.pendientes)',
  'normalizarErrores(syncStatus.errores ?? syncStatus.errors)',
];

for (const fragment of required) {
  if (!page.includes(fragment)) throw new Error(`Falta el comportamiento B1 esperado: ${fragment}`);
}

const cards = (page.match(/clave: '(?:pendiente|materiales|trimestre[1-4]|confirming_draxton|raiz)'/g) || []).length;
if (cards !== 8) throw new Error(`Se esperaban 8 tarjetas OneDrive, se encontraron ${cards}`);

if (/syncStatus\.[\w?]+\?\.\w+\s*\|\|\s*0/.test(page)) {
  throw new Error('La UI de OneDrive no debe convertir valores no disponibles en 0');
}

console.log('OK: prueba sintética B1 de UI OneDrive superada (sin red, Graph, OCR ni base de datos).');
