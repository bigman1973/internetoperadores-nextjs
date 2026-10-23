import assert from 'node:assert/strict';
import test from 'node:test';

import { parseHistoricoB4, prepararRevisionHeredada } from '../components/finanzas/reconciliation-v2/historical-links-contract';
import type { DocumentoB4, MovimientoB4 } from '../components/finanzas/reconciliation-v2/types';

const documento: DocumentoB4 = {
  id: 'documento-b4-1',
  tipo: 'FACTURA_RECIBIDA',
  importeObjetivoCentimos: -12_345,
  version: 7,
  stale: false,
  referencia: 'F-2026-001',
  tercero: null,
  fecha: '2026-10-01T00:00:00.000Z',
  sourceId: 'factura-1',
  asignadoCentimos: 0,
  disponibleCentimos: -12_345,
};

const movimientoBase: MovimientoB4 = {
  id: 'movimiento-1',
  fechaOperacion: '2026-10-23',
  importeCentimos: -12_000,
  concepto: 'Cargo histórico',
  estado: 'SIN_DOCUMENTO',
  motivoNoRequiere: null,
  version: 3,
  cuenta: { id: 'cuenta-1', banco: 'Banco', alias: 'Principal' },
  operacionAplicada: null,
  vinculos: [],
};

function evidencia(overrides: Record<string, unknown> = {}) {
  return {
    id: 'historico-1',
    origen: 'HISTORICO',
    clasificacion: 'PROPUESTA',
    procedencia: 'DESCONOCIDO',
    motivos: ['FK_CONCILIACION_HISTORICA'],
    documentos: [{
      tipo: 'FACTURA_RECIBIDA',
      sourceId: 'factura-1',
      documentoConciliableId: 'documento-b4-1',
      referencia: 'F-2026-001',
      importeObjetivoCentimos: -12_345,
      archivoDisponible: true,
      version: 7,
      stale: false,
    }],
    creadoAt: '2026-10-23T07:00:00.000Z',
    ...overrides,
  };
}

test('parseHistoricoB4 accepts absence as backward-compatible optional evidence', () => {
  const parsed = parseHistoricoB4(undefined);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value, undefined);
});

test('parseHistoricoB4 rejects invalid classifications and malformed source documents', () => {
  const invalidClass = parseHistoricoB4(evidencia({ clasificacion: 'AUTOMATICO' }));
  assert.equal(invalidClass.ok, false);
  const invalidDocument = parseHistoricoB4(evidencia({ documentos: [{ ...evidencia().documentos[0], archivoDisponible: 'si' }] }));
  assert.equal(invalidDocument.ok, false);
});

test('prepararRevisionHeredada creates one document line from source target, never bank amount', () => {
  const parsed = parseHistoricoB4(evidencia());
  assert.equal(parsed.ok, true);
  if (!parsed.ok || !parsed.value) throw new Error('Fixture inválida');
  const result = prepararRevisionHeredada({ ...movimientoBase, historico: parsed.value }, [documento]);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('La preparación de prueba no es válida.');
  assert.deepEqual(result.lineas, [{ tipo: 'DOCUMENTO', documentoConciliableId: 'documento-b4-1', importeCentimos: -12_345 }]);
  assert.notEqual(result.lineas[0].importeCentimos, movimientoBase.importeCentimos);
  assert.equal(result.versionDocumento, 7);
});

test('prepararRevisionHeredada blocks a charge without file, stale wrappers, and non-full capacity', () => {
  const noFile = parseHistoricoB4(evidencia({ documentos: [{ ...evidencia().documentos[0], archivoDisponible: false }] }));
  assert.equal(noFile.ok, true);
  if (!noFile.ok || !noFile.value) throw new Error('Fixture inválida');
  assert.equal(prepararRevisionHeredada({ ...movimientoBase, historico: noFile.value }, [documento]).ok, false);

  const parsed = parseHistoricoB4(evidencia());
  assert.equal(parsed.ok, true);
  if (!parsed.ok || !parsed.value) throw new Error('Fixture inválida');
  assert.equal(prepararRevisionHeredada({ ...movimientoBase, historico: parsed.value }, [{ ...documento, stale: true }]).ok, false);
  assert.equal(prepararRevisionHeredada({ ...movimientoBase, historico: parsed.value }, [{ ...documento, asignadoCentimos: -1, disponibleCentimos: -12_344 }]).ok, false);
});

test('prepararRevisionHeredada exposes evidence only when B4 is already justified', () => {
  const parsed = parseHistoricoB4(evidencia({ clasificacion: 'YA_B4' }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || !parsed.value) throw new Error('Fixture inválida');
  const result = prepararRevisionHeredada({ ...movimientoBase, estado: 'JUSTIFICADO', historico: parsed.value }, [documento]);
  assert.deepEqual(result, { ok: false, reason: 'El movimiento ya está JUSTIFICADO en B4; sólo se muestra su evidencia.' });
});

test('preparación heredada bloquea fecha posterior, fecha desconocida y versión cambiada', () => {
  const parsed = parseHistoricoB4(evidencia());
  if (!parsed.ok || !parsed.value) throw new Error('Fixture inválida');
  const movement = { ...movimientoBase, historico: parsed.value };
  assert.equal(prepararRevisionHeredada(movement, [{ ...documento, fecha: '2026-10-24T00:00:00.000Z' }]).ok, false);
  assert.equal(prepararRevisionHeredada(movement, [{ ...documento, fecha: null }]).ok, false);
  assert.equal(prepararRevisionHeredada(movement, [{ ...documento, version: 8 }]).ok, false);
});
