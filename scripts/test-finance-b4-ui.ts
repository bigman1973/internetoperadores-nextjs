import assert from 'node:assert/strict';
import test from 'node:test';
import {
  centimosAImporteUi,
  documentoPuedeVincularse,
  dentroDeDisponibleFirmado,
  formatCentimos,
} from '../components/finanzas/reconciliation-v2/utils';
import type { DocumentoB4 } from '../components/finanzas/reconciliation-v2/types';
import { convertirImporteUiACentimos } from '../lib/finanzas/reconciliation-core';

const documento = (overrides: Partial<DocumentoB4> = {}): DocumentoB4 => ({
  id: 'doc-b4-ui',
  tipo: 'FACTURA_EMITIDA',
  importeObjetivoCentimos: 10_000,
  version: 1,
  stale: false,
  referencia: 'DOC-B4-UI',
  tercero: null,
  fecha: null,
  sourceId: 'source-b4-ui',
  asignadoCentimos: 10_000,
  disponibleCentimos: 0,
  ...overrides,
});

const cents = (entrada: unknown): number => {
  const resultado = convertirImporteUiACentimos(entrada);
  assert.equal(resultado.ok, true);
  if (!resultado.ok) throw new Error('La conversión UI debía ser válida');
  return resultado.value;
};

const rejectsCents = (entrada: unknown): void => {
  assert.equal(convertirImporteUiACentimos(entrada).ok, false);
};

test('formatos y valores UI conservan céntimos exactos, signo y ceros', () => {
  assert.equal(formatCentimos(10_000), '+100,00 €');
  assert.equal(formatCentimos(-10_000), '-100,00 €');
  assert.equal(formatCentimos(0), '0,00 €');
  assert.equal(formatCentimos(null), 'Importe no disponible');
  assert.equal(centimosAImporteUi(10_000), '100,00');
  assert.equal(centimosAImporteUi(-10_000), '-100,00');
  assert.equal(centimosAImporteUi(1), '0,01');
});

test('capacidad sin documento mantiene la orientación firmada y rechaza desconocido/cero', () => {
  assert.equal(dentroDeDisponibleFirmado(1_000, 10_000), true);
  assert.equal(dentroDeDisponibleFirmado(-1_000, 10_000), false);
  assert.equal(dentroDeDisponibleFirmado(-1_000, -10_000), true);
  assert.equal(dentroDeDisponibleFirmado(1_000, -10_000), false);
  assert.equal(dentroDeDisponibleFirmado(1_000, null), false);
  assert.equal(dentroDeDisponibleFirmado(1_000, 0), false);
});

test('objetivo positivo: reembolso resta asignado y sólo permanece dentro de [0, objetivo]', () => {
  const doc = documento({ importeObjetivoCentimos: 10_000, asignadoCentimos: 10_000 });
  assert.equal(dentroDeDisponibleFirmado(-1_000, 0, doc), true);
  assert.equal(dentroDeDisponibleFirmado(1, 0, doc), false);
  assert.equal(dentroDeDisponibleFirmado(-10_001, 0, doc), false);
});

test('objetivo negativo: devolución suma asignado y sólo permanece dentro de [objetivo, 0]', () => {
  const doc = documento({ importeObjetivoCentimos: -10_000, asignadoCentimos: -10_000 });
  assert.equal(dentroDeDisponibleFirmado(1_000, 0, doc), true);
  assert.equal(dentroDeDisponibleFirmado(-1, 0, doc), false);
  assert.equal(dentroDeDisponibleFirmado(10_001, 0, doc), false);
});

test('documento nuevo admite pago firmado hacia su objetivo, no el signo contrario', () => {
  const doc = documento({ importeObjetivoCentimos: 10_000, asignadoCentimos: 0, disponibleCentimos: 10_000 });
  assert.equal(dentroDeDisponibleFirmado(10_000, 10_000, doc), true);
  assert.equal(dentroDeDisponibleFirmado(-1, 10_000, doc), false);
});

test('documento vinculable exige objetivo firmado y asignado conocidos, pero permite disponible cero pagado', () => {
  assert.equal(documentoPuedeVincularse(documento({ disponibleCentimos: 0 })), true);
  assert.equal(documentoPuedeVincularse(documento({ importeObjetivoCentimos: null })), false);
  assert.equal(documentoPuedeVincularse(documento({ importeObjetivoCentimos: 0 })), false);
  assert.equal(documentoPuedeVincularse(documento({ asignadoCentimos: Number.NaN })), false);
  assert.equal(documentoPuedeVincularse(documento({ stale: true })), false);
  assert.equal(documentoPuedeVincularse(documento({ importeObjetivoCentimos: -10_000, asignadoCentimos: -10_000, disponibleCentimos: 0 })), true);
});

test('parser frontend exacto en céntimos rechaza residuos binarios y acepta 19,99', () => {
  rejectsCents(0.30000000000000004);
  assert.equal(cents('19,99'), 1_999);
  assert.equal(cents('19.99'), 1_999);
  assert.equal(cents('-19,99'), -1_999);
});
