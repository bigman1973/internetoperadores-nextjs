import { CARPETAS, FACTURAS_BASE_PATH } from './microsoft-graph';

export const INVOICE_FOLDERS = {
  pendiente: { nombre: CARPETAS.PENDIENTE_CONTABILIZAR, estadoCarpeta: 'PENDIENTE_CONTABILIZAR' },
  materiales: { nombre: CARPETAS.COMPRA_MATERIALES, estadoCarpeta: 'SIN_CLASIFICAR' },
  confirming_draxton: { nombre: CARPETAS.CONFIRMING_DRAXTON, estadoCarpeta: 'CONFIRMING' },
  trimestre1: { nombre: CARPETAS.TRIMESTRE_1, estadoCarpeta: 'CONTABILIZADA_GESTORIA' },
  trimestre2: { nombre: CARPETAS.TRIMESTRE_2, estadoCarpeta: 'CONTABILIZADA_GESTORIA' },
  trimestre3: { nombre: CARPETAS.TRIMESTRE_3, estadoCarpeta: 'CONTABILIZADA_GESTORIA' },
  trimestre4: { nombre: CARPETAS.TRIMESTRE_4, estadoCarpeta: 'CONTABILIZADA_GESTORIA' },
  raiz: { nombre: 'Raíz 2026', estadoCarpeta: 'SIN_CLASIFICAR' },
} as const;
export type InvoiceFolderKey = keyof typeof INVOICE_FOLDERS;
const aliases: Record<string, string> = {
  T1: CARPETAS.TRIMESTRE_1, T2: CARPETAS.TRIMESTRE_2,
  T3: CARPETAS.TRIMESTRE_3, T4: CARPETAS.TRIMESTRE_4,
  Pendiente: CARPETAS.PENDIENTE_CONTABILIZAR,
  Materiales: CARPETAS.COMPRA_MATERIALES, Confirming: CARPETAS.CONFIRMING_DRAXTON,
};
export function normalizeInvoiceFolder(folder: string | null): string | null {
  if (!folder) return folder;
  const [first, ...rest] = folder.split('/');
  return [aliases[first] || first, ...rest].join('/');
}
export function invoiceFile(item: { name?: string; file?: unknown; folder?: unknown }): boolean {
  return !item.folder && typeof item.name === 'string' && ['pdf','jpg','jpeg','png','heic','tiff'].includes(item.name.toLowerCase().split('.').pop() || '');
}
export function invoiceLocation(item: { id: string; name: string; fullPath?: string; relativeFolderPath?: string }, key: InvoiceFolderKey, driveId: string) {
  if (typeof item.id !== 'string' || !item.id.trim() || typeof driveId !== 'string' || !driveId.trim()) throw new Error('Identidad de documento inválida');
  if (typeof item.name !== 'string' || !item.name.trim() || item.name.includes('/') || item.name.includes('\\')) throw new Error('Nombre de documento inválido');
  const config = INVOICE_FOLDERS[key];
  const fallbackFolder = key === 'raiz' ? FACTURAS_BASE_PATH : `${FACTURAS_BASE_PATH}/${config.nombre}`;
  const folder = item.relativeFolderPath || fallbackFolder;
  const fullPath = item.fullPath || `${folder}/${item.name}`;
  if (fullPath !== `${folder}/${item.name}`) throw new Error('Ruta de documento incoherente');
  if (!folder.startsWith(FACTURAS_BASE_PATH + '/') && folder !== FACTURAS_BASE_PATH) throw new Error('Ubicación fuera de la raíz autorizada');
  const relative = folder === FACTURAS_BASE_PATH ? 'Raíz 2026' : folder.slice(FACTURAS_BASE_PATH.length + 1);
  return { carpetaOrigen: relative, oneDriveDriveId: driveId, oneDriveRutaActual: fullPath, archivoOneDrive: fullPath, estadoCarpeta: config.estadoCarpeta, etiquetaMateriales: key === 'materiales' };
}
export function inventoryStatus(items: Array<{ id: string; name: string; folder?: unknown }>, existingIds: Set<string>) {
  const admitted = items.filter(invoiceFile);
  const imported = admitted.filter(item => existingIds.has(item.id)).length;
  const nuevos = admitted.length - imported;
  return { total: items.length, admitidos: admitted.length, yaImportados: imported, nuevos, estado: items.length === 0 ? 'VACIA' : nuevos ? 'CON_NOVEDADES' : 'SIN_NOVEDADES' };
}
export const unavailableFolder = () => ({ total: null, admitidos: null, yaImportados: null, nuevos: null, estado: 'ERROR', error: 'No se pudo completar la lectura de esta carpeta. Reintenta y comprueba sus permisos y ubicación.' });
