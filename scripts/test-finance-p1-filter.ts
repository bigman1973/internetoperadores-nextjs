import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma } from '@prisma/client';
import {
  facturaEconomicaSQL,
  facturaEconomicaWhere,
  facturaNoConfirmingDraxtonWhere,
} from '../lib/finanzas/invoice-economic-filter';

type HistoryRow = { anterior: Record<string, unknown>; actual: Record<string, unknown> };
type Fixture = {
  id: string;
  proveedor: string;
  calidad: 'VALIDA' | 'REVISAR_LECTURA' | 'COPIA';
  copiaDeId: string | null;
  naturalezaDocumento: 'FACTURA_RECIBIDA' | 'SOPORTE_CONFIRMING_CLIENTE';
  carpetaOrigen: string | null;
  archivoOneDrive: string | null;
  oneDriveRutaActual: string | null;
  historialUbicaciones: HistoryRow[];
};

const confirming = '3. Confirming Draxton 2026';
const fixtures: Array<Fixture & { economic: boolean; noConfirming: boolean }> = [
  {
    id: 'nullable-canonical', proveedor: 'Proveedor válido', calidad: 'VALIDA', copiaDeId: null,
    naturalezaDocumento: 'FACTURA_RECIBIDA', carpetaOrigen: null, archivoOneDrive: null,
    oneDriveRutaActual: null, historialUbicaciones: [], economic: true, noConfirming: true,
  },
  {
    id: 'confirming-actual', proveedor: 'Proveedor válido', calidad: 'VALIDA', copiaDeId: null,
    naturalezaDocumento: 'FACTURA_RECIBIDA', carpetaOrigen: null,
    archivoOneDrive: `/Documentos/${confirming}/comunicacion.pdf`, oneDriveRutaActual: null,
    historialUbicaciones: [], economic: false, noConfirming: false,
  },
  {
    id: 'confirming-historico', proveedor: 'Proveedor válido', calidad: 'VALIDA', copiaDeId: null,
    naturalezaDocumento: 'FACTURA_RECIBIDA', carpetaOrigen: null, archivoOneDrive: null,
    oneDriveRutaActual: '/Archivadas/factura.pdf',
    historialUbicaciones: [{ anterior: {}, actual: { oneDriveRutaActual: `/Anterior/${confirming}/carta.pdf` } }],
    economic: false, noConfirming: false,
  },
  {
    id: 'copia-ocr', proveedor: 'Proveedor válido', calidad: 'COPIA', copiaDeId: 'canonical-id',
    naturalezaDocumento: 'FACTURA_RECIBIDA', carpetaOrigen: null, archivoOneDrive: null,
    oneDriveRutaActual: null, historialUbicaciones: [], economic: false, noConfirming: true,
  },
  {
    id: 'error-ocr', proveedor: 'ERROR_OCR', calidad: 'VALIDA', copiaDeId: null,
    naturalezaDocumento: 'FACTURA_RECIBIDA', carpetaOrigen: null, archivoOneDrive: null,
    oneDriveRutaActual: null, historialUbicaciones: [], economic: false, noConfirming: true,
  },
  {
    id: 'revisar-lectura', proveedor: 'Proveedor válido', calidad: 'REVISAR_LECTURA', copiaDeId: null,
    naturalezaDocumento: 'FACTURA_RECIBIDA', carpetaOrigen: null, archivoOneDrive: null,
    oneDriveRutaActual: null, historialUbicaciones: [], economic: false, noConfirming: true,
  },
];

const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const readPath = (value: Record<string, unknown>, path: string[]) => path.reduce<unknown>((current, key) => (
  current !== null && typeof current === 'object' && !Array.isArray(current) ? (current as Record<string, unknown>)[key] : undefined
), value);

/** Narrow in-memory interpreter for exactly the Prisma predicates exported here. */
function matchesWhere(row: Fixture, where: Prisma.FacturaRecibidaWhereInput): boolean {
  const input = where as Record<string, unknown>;
  if (asArray(input.AND as Prisma.FacturaRecibidaWhereInput | Prisma.FacturaRecibidaWhereInput[] | undefined).some(item => !matchesWhere(row, item))) return false;
  const ors = asArray(input.OR as Prisma.FacturaRecibidaWhereInput | Prisma.FacturaRecibidaWhereInput[] | undefined);
  if (ors.length && !ors.some(item => matchesWhere(row, item))) return false;
  if (asArray(input.NOT as Prisma.FacturaRecibidaWhereInput | Prisma.FacturaRecibidaWhereInput[] | undefined).some(item => matchesWhere(row, item))) return false;

  for (const field of ['calidad', 'copiaDeId', 'naturalezaDocumento'] as const) {
    if (field in input && row[field] !== input[field]) return false;
  }
  for (const field of ['carpetaOrigen', 'archivoOneDrive', 'oneDriveRutaActual', 'proveedor'] as const) {
    if (!(field in input)) continue;
    const filter = input[field];
    if (filter === null) { if (row[field] !== null) return false; continue; }
    if (typeof filter !== 'object' || filter === null || Array.isArray(filter)) throw new Error(`Filtro inesperado: ${field}`);
    const value = row[field];
    const object = filter as Record<string, unknown>;
    if (typeof object.contains === 'string' && (value === null || !value.toLocaleLowerCase('es-ES').includes(object.contains.toLocaleLowerCase('es-ES')))) return false;
    if (typeof object.equals === 'string' && value.toLocaleLowerCase('es-ES') !== object.equals.toLocaleLowerCase('es-ES')) return false;
  }
  if ('historialUbicaciones' in input) {
    const relation = input.historialUbicaciones as { some?: Prisma.HistorialUbicacionFacturaRecibidaWhereInput };
    if (relation.some && !row.historialUbicaciones.some(history => matchesHistory(history, relation.some!))) return false;
  }
  return true;
}
function matchesHistory(row: HistoryRow, where: Prisma.HistorialUbicacionFacturaRecibidaWhereInput): boolean {
  const input = where as Record<string, unknown>;
  const ors = asArray(input.OR as Prisma.HistorialUbicacionFacturaRecibidaWhereInput | Prisma.HistorialUbicacionFacturaRecibidaWhereInput[] | undefined);
  if (ors.length && !ors.some(item => matchesHistory(row, item))) return false;
  for (const field of ['anterior', 'actual'] as const) {
    if (!(field in input)) continue;
    const filter = input[field] as { path: string[]; string_contains: string };
    const value = readPath(row[field], filter.path);
    if (typeof value !== 'string' || !value.includes(filter.string_contains)) return false;
  }
  return true;
}

/** Independent two-valued model of facturaEconomicaSQL, including SQL COALESCE. */
function matchesEconomicSqlContract(row: Fixture): boolean {
  const currentContainsConfirming = [row.carpetaOrigen, row.archivoOneDrive, row.oneDriveRutaActual]
    .some(value => (value ?? '').toLocaleLowerCase('es-ES').includes(confirming.toLocaleLowerCase('es-ES')));
  const historicalContainsConfirming = row.historialUbicaciones.some(history =>
    JSON.stringify(history.anterior).toLocaleLowerCase('es-ES').includes(confirming.toLocaleLowerCase('es-ES'))
    || JSON.stringify(history.actual).toLocaleLowerCase('es-ES').includes(confirming.toLocaleLowerCase('es-ES')),
  );
  return row.calidad === 'VALIDA'
    && row.copiaDeId === null
    && row.naturalezaDocumento === 'FACTURA_RECIBIDA'
    && !['ERROR_OCR', 'DESCONOCIDO'].includes(row.proveedor.trim().toLocaleUpperCase('es-ES'))
    && !currentContainsConfirming
    && !historicalContainsConfirming;
}

test('Prisma where conserva filas con las tres fuentes actuales nullable y excluye confirming actual/histórico', () => {
  for (const fixture of fixtures) {
    assert.equal(matchesWhere(fixture, facturaNoConfirmingDraxtonWhere), fixture.noConfirming, fixture.id);
  }
});

test('Prisma where y contrato SQL económico coinciden para nullable, confirming histórico, copias y OCR', () => {
  for (const fixture of fixtures) {
    assert.equal(matchesWhere(fixture, facturaEconomicaWhere), fixture.economic, `Prisma: ${fixture.id}`);
    assert.equal(matchesEconomicSqlContract(fixture), fixture.economic, `SQL: ${fixture.id}`);
  }
});

test('SQL económico conserva COALESCE para las tres fuentes nullable', () => {
  const sql = (facturaEconomicaSQL('fr') as unknown as { strings: readonly string[] }).strings.join('?');
  assert.match(sql, /COALESCE\("fr"\."carpeta_origen", ''\) ILIKE/);
  assert.match(sql, /COALESCE\("fr"\."archivo_onedrive", ''\) ILIKE/);
  assert.match(sql, /COALESCE\("fr"\."onedrive_ruta_actual", ''\) ILIKE/);
  assert.match(sql, /historial_ubicaciones_facturas_recibidas/);
});
