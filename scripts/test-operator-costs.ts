import assert from 'node:assert/strict';
import {
  cents,
  digest,
  externalSnapshot,
  groupInput,
  invoiceSnapshot,
  sourceInput,
  sourceKey,
  validateAssignments,
} from '../lib/finanzas/operator-costs';

const uuid = '11111111-1111-4111-8111-111111111111';
const groupId = 'grupo-red';
const facturaId = 'factura-original';
const hash = 'a'.repeat(64);

function source(overrides: Record<string, unknown> = {}) {
  return {
    action: 'guardar',
    id: uuid,
    origen: 'TERCERO',
    empresaPagadora: 'Internet Operadores',
    periodo: '2026-02',
    tercero: {
      proveedor: 'Operadora Ejemplo',
      numFactura: 'F-2026-02',
      fecha: '2026-02-28',
      base: 100.25,
      concepto: 'Capacidad',
      lineas: [
        { descripcion: 'Troncal', importe: 60.1 },
        { descripcion: 'Acceso', importe: 40.15 },
      ],
    },
    asignaciones: [{ indice: 0, grupoId: groupId }],
    estado: 'BORRADOR',
    ...overrides,
  };
}

function invalid(result: { success: boolean }) {
  assert.equal(result.success, false);
}

function rejected(fn: () => unknown, message: RegExp) {
  assert.throws(fn, message);
}

function main() {
  // Ámbito: GLOBAL never stores zone/connection; a ZONA always identifies both.
  assert.equal(groupInput.safeParse({ action: 'grupo', solicitudId: uuid, nombre: 'Red propia', ambito: 'GLOBAL_RED_PROPIA' }).success, true);
  invalid(groupInput.safeParse({ action: 'grupo', solicitudId: uuid, nombre: 'Global con zona', ambito: 'GLOBAL_RED_PROPIA', zona: 'Norte' }));
  invalid(groupInput.safeParse({ action: 'grupo', solicitudId: uuid, nombre: 'Zona sin conexión', ambito: 'ZONA', zona: 'Norte' }));
  assert.equal(groupInput.safeParse({ action: 'grupo', solicitudId: uuid, nombre: 'Zona Norte', ambito: 'ZONA', zona: 'Norte', conexion: 'FTTH' }).success, true);

  // Calendar dates and monetary precision are checked before a source can be persisted.
  assert.equal(sourceInput.safeParse(source()).success, true);
  invalid(sourceInput.safeParse(source({ tercero: { ...source().tercero as object, fecha: '2026-02-29' } })));
  assert.equal(sourceInput.safeParse(source({ tercero: { ...source().tercero as object, fecha: '2024-02-29' } })).success, true);
  invalid(sourceInput.safeParse(source({ tercero: { ...source().tercero as object, base: 100.251 } })));
  invalid(sourceInput.safeParse(source({ tercero: { ...source().tercero as object, lineas: [{ descripcion: 'Precisión inválida', importe: 1.001 }] } })));
  assert.equal(cents(1.005), 100, 'cent conversion is deterministic from the supplied JS number');

  // Identity intentionally omits periodo; it is an invoice identity, not a monthly key.
  const snap = externalSnapshot(source().tercero as any);
  assert.equal(sourceKey('TERCERO', undefined, ' Internet   Operadores ', snap), sourceKey('TERCERO', undefined, 'internet operadores', snap));
  assert.notEqual(sourceKey('TERCERO', undefined, 'Internet Operadores', snap), sourceKey('TERCERO', undefined, 'Otra empresa', snap));
  assert.equal(digest(['periodo no forma parte']), digest(['periodo no forma parte']));

  const detail = {
    proveedor: 'Operadora Ejemplo', numFactura: 'F-1', fecha: '2026-01-31', base: 100,
    concepto: 'Factura de red', detalleInvalido: false,
    lineas: [
      { index: 0, descripcion: 'Acceso A', importe: 60 },
      { index: 1, descripcion: 'Acceso B', importe: 40 },
    ],
  };
  const selected = validateAssignments(detail, [{ indice: 0, grupoId: groupId }], 'BORRADOR');
  assert.deepEqual(selected, [{ indice: 0, grupoId: groupId, descripcion: 'Acceso A', importe: 60 }], 'selection does not silently assign unselected lines');
  rejected(() => validateAssignments(detail, [{ indice: 2, grupoId: groupId }], 'BORRADOR'), /Artículo no válido/);
  invalid(sourceInput.safeParse(source({ asignaciones: [{ indice: 200, grupoId: groupId }] })));
  invalid(sourceInput.safeParse(source({ asignaciones: [{ indice: -1, grupoId: groupId }, { indice: 0, grupoId: groupId }] })));

  // -1 can represent the whole invoice only where no source detail exists.
  const whole = { ...detail, lineas: [] };
  assert.deepEqual(validateAssignments(whole, [{ indice: -1, grupoId: groupId }], 'BORRADOR'), [{ indice: -1, grupoId: groupId, descripcion: 'Factura de red', importe: 100 }]);
  rejected(() => validateAssignments(detail, [{ indice: -1, grupoId: groupId }], 'BORRADOR'), /Revisa los artículos/);

  // Malformed OCR/detail must fail closed, both for whole-invoice selection and reviewed state.
  const invalidOcr = invoiceSnapshot({ proveedor: 'OCR', numFactura: 'OCR-1', fecha: new Date('2026-01-01T00:00:00Z'), base: 100, concepto: null, lineasDetalle: '{broken json' });
  assert.equal(invalidOcr.detalleInvalido, true);
  rejected(() => validateAssignments(invalidOcr, [{ indice: -1, grupoId: groupId }], 'BORRADOR'), /Revisa los artículos/);
  rejected(() => validateAssignments(invalidOcr, [], 'REVISADO'), /Falta verificar/);
  const unreadableLine = invoiceSnapshot({ proveedor: 'OCR', numFactura: 'OCR-2', fecha: new Date('2026-01-01T00:00:00Z'), base: 10, concepto: null, lineasDetalle: '[{"descripcion":"sin importe","importe":"N/A"}]' });
  assert.equal(unreadableLine.detalleInvalido, true);
  rejected(() => validateAssignments(unreadableLine, [{ indice: 0, grupoId: groupId }], 'BORRADOR'), /Artículo no válido/);

  // A selection cannot exceed base, but partial selection remains partial (no auto-assignment).
  rejected(() => validateAssignments({ ...detail, base: 90 }, [{ indice: 0, grupoId: groupId }, { indice: 1, grupoId: 'grupo-dos' }], 'BORRADOR'), /supera la base/);
  assert.equal(validateAssignments(detail, [{ indice: 1, grupoId: groupId }], 'BORRADOR').length, 1);

  // Credit invoices retain negative sign constraints.
  const credit = { ...detail, base: -100, lineas: [{ index: 0, descripcion: 'Abono A', importe: -40 }, { index: 1, descripcion: 'Abono B', importe: -60 }] };
  assert.deepEqual(validateAssignments(credit, [{ indice: 0, grupoId: groupId }], 'BORRADOR'), [{ indice: 0, grupoId: groupId, descripcion: 'Abono A', importe: -40 }]);
  rejected(() => validateAssignments({ ...credit, lineas: [{ index: 0, descripcion: 'Incorrecto', importe: 10 }] }, [{ indice: 0, grupoId: groupId }], 'BORRADOR'), /supera la base/);

  // Reviewed sources require a real, balanced detail (within the documented two-cent tolerance).
  rejected(() => validateAssignments({ ...detail, lineas: [{ index: 0, descripcion: 'Descuadre', importe: 97 }] }, [{ indice: 0, grupoId: groupId }], 'REVISADO'), /detalle no cuadra/);
  assert.deepEqual(validateAssignments({ ...detail, lineas: [{ index: 0, descripcion: 'Tolerancia', importe: 100.02 }] }, [{ indice: 0, grupoId: groupId }], 'REVISADO').map(row => row.indice), [0]);
  invalid(sourceInput.safeParse(source({ estado: 'REVISADO', asignaciones: [] })));

  // A proper own invoice still needs its immutable snapshot reference.
  assert.equal(sourceInput.safeParse({
    action: 'guardar', id: uuid, origen: 'PROPIA', periodo: '2026-01', facturaId, facturaVersion: hash,
    asignaciones: [{ indice: 0, grupoId: groupId }], estado: 'BORRADOR',
  }).success, true);

  console.log('Costes operadora: ámbito, fechas, céntimos, identidad, OCR fail-closed, artículos, abonos, revisión y asignación explícita correctos sin DB.');
}

main();
