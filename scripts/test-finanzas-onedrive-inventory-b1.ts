import assert from 'node:assert/strict';
import {
  INVOICE_FOLDERS,
  inventoryStatus,
  invoiceFile,
  invoiceLocation,
  normalizeInvoiceFolder,
  unavailableFolder,
} from '../lib/finanzas/onedrive-inventory';
import { CARPETAS, FACTURAS_BASE_PATH } from '../lib/finanzas/microsoft-graph';

function main(): void {
  // The API must enumerate the seven known folders plus the 2026 root exactly once.
  assert.deepEqual(Object.keys(INVOICE_FOLDERS), [
    'pendiente', 'materiales', 'confirming_draxton',
    'trimestre1', 'trimestre2', 'trimestre3', 'trimestre4', 'raiz',
  ]);
  assert.equal(INVOICE_FOLDERS.raiz.estadoCarpeta, 'SIN_CLASIFICAR');

  // Alias normalization only changes the first metadata segment. It never invents a move.
  assert.equal(normalizeInvoiceFolder('T1/Proveedor/enero.pdf'), `${CARPETAS.TRIMESTRE_1}/Proveedor/enero.pdf`);
  assert.equal(normalizeInvoiceFolder('T2'), CARPETAS.TRIMESTRE_2);
  assert.equal(normalizeInvoiceFolder('T3/archivo.pdf'), `${CARPETAS.TRIMESTRE_3}/archivo.pdf`);
  assert.equal(normalizeInvoiceFolder('T4/archivo.pdf'), `${CARPETAS.TRIMESTRE_4}/archivo.pdf`);
  assert.equal(normalizeInvoiceFolder('Pendiente/archivo.pdf'), `${CARPETAS.PENDIENTE_CONTABILIZAR}/archivo.pdf`);
  assert.equal(normalizeInvoiceFolder('Materiales/archivo.pdf'), `${CARPETAS.COMPRA_MATERIALES}/archivo.pdf`);
  assert.equal(normalizeInvoiceFolder('Confirming/archivo.pdf'), `${CARPETAS.CONFIRMING_DRAXTON}/archivo.pdf`);
  assert.equal(normalizeInvoiceFolder('Etiqueta propia/archivo.pdf'), 'Etiqueta propia/archivo.pdf');
  assert.equal(normalizeInvoiceFolder(null), null);

  // Only explicit invoice extensions can contribute to admitted/new/imported figures.
  assert.equal(invoiceFile({ name: 'FACTURA.PDF' }), true);
  assert.equal(invoiceFile({ name: 'imagen.JpEg' }), true);
  assert.equal(invoiceFile({ name: 'notas.txt' }), false);
  assert.equal(invoiceFile({ name: 'sin-extension' }), false);
  assert.equal(invoiceFile({ name: 'carpeta.pdf', folder: {} }), false);
  const items = [
    { id: 'already', name: 'ya-importada.pdf' },
    { id: 'fresh', name: 'nueva.PNG' },
    { id: 'notes', name: 'notas.txt' },
    { id: 'folder', name: 'archivo.pdf', folder: {} },
  ];
  assert.deepEqual(inventoryStatus(items, new Set(['already'])), {
    total: 4,
    admitidos: 2,
    yaImportados: 1,
    nuevos: 1,
    estado: 'CON_NOVEDADES',
  });
  assert.deepEqual(inventoryStatus([], new Set()), {
    total: 0,
    admitidos: 0,
    yaImportados: 0,
    nuevos: 0,
    estado: 'VACIA',
  });
  assert.deepEqual(unavailableFolder(), {
    total: null,
    admitidos: null,
    yaImportados: null,
    nuevos: null,
    estado: 'ERROR',
    error: 'No se pudo completar la lectura de esta carpeta. Reintenta y comprueba sus permisos y ubicación.',
  });

  // A root file and a known-folder file retain their actual Graph metadata.
  const root = invoiceLocation({ id: 'root-id', name: 'root.pdf' }, 'raiz', 'synthetic-drive');
  assert.deepEqual(root, {
    carpetaOrigen: 'Raíz 2026',
    oneDriveDriveId: 'synthetic-drive',
    oneDriveRutaActual: `${FACTURAS_BASE_PATH}/root.pdf`,
    archivoOneDrive: `${FACTURAS_BASE_PATH}/root.pdf`,
    estadoCarpeta: 'SIN_CLASIFICAR',
    etiquetaMateriales: false,
  });
  const knownPath = `${FACTURAS_BASE_PATH}/${CARPETAS.COMPRA_MATERIALES}/Proveedor`;
  const material = invoiceLocation({
    id: 'material-id', name: 'material.pdf', relativeFolderPath: knownPath,
    fullPath: `${knownPath}/material.pdf`,
  }, 'materiales', 'synthetic-drive');
  assert.deepEqual(material, {
    carpetaOrigen: `${CARPETAS.COMPRA_MATERIALES}/Proveedor`,
    oneDriveDriveId: 'synthetic-drive',
    oneDriveRutaActual: `${knownPath}/material.pdf`,
    archivoOneDrive: `${knownPath}/material.pdf`,
    estadoCarpeta: 'SIN_CLASIFICAR',
    etiquetaMateriales: true,
  });
  assert.throws(
    () => invoiceLocation({ id: 'outside', name: 'outside.pdf', relativeFolderPath: 'Otra biblioteca' }, 'pendiente', 'synthetic-drive'),
    /fuera de la raíz autorizada/,
  );

  console.log('B1 OneDrive inventory synthetic tests: aliases, 8-folder inventory, admissibility, metadata and root-boundary guard: OK');
}

main();
