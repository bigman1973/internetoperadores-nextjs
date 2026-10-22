import test from 'node:test';
import {
  parseProposalResponse,
  prepareDraftFromProposal,
  type SnapshotB4Actual,
} from '../components/finanzas/reconciliation-v2/b6-proposal-view';

/*
 * Fixtures without a runner dependency: compiling this file preserves the test
 * cases for the integrating repository's runner. They never invoke B4/HTTP/DB.
 */
function expect(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const movementId = 'bank-movement-opaque-1';
const documentId = '11111111-1111-4111-8111-111111111111';
const snapshot: SnapshotB4Actual = {
  movimientoId: movementId,
  estadoB4: 'SIN_DOCUMENTO',
  versionMovimiento: 7,
  importeMovimientoCentimos: -12_500,
};

function readyPayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    movimientoId: movementId,
    fingerprintB4: 'a'.repeat(64),
    b4: { estado: 'SIN_DOCUMENTO', version: 7 },
    documentos: [{
      id: documentId,
      tipo: 'FACTURA_RECIBIDA',
      referencia: 'FR-2026-44',
      tercero: 'Proveedor exacto SL',
      fecha: '2026-10-21',
      objetivoCentimos: -20_000,
      asignadoCentimos: -7_500,
      stale: false,
    }],
    advertencias: [],
    resultado: {
      motor: 'B6_PROPONE_ONLY',
      noEscrituras: true,
      requiereConfirmacionHumana: true,
      movimientoId: movementId,
      cuentaId: 'cuenta-b4-1',
      fecha: '2026-10-22',
      tercero: 'Proveedor exacto SL',
      importeMovimientoCentimos: -12_500,
      estado: 'LISTA_PARA_CONFIRMACION_B4',
      clase: 'FACTURA_EXACTA',
      confianza: 'LITERAL_REFERENCE',
      razones: ['IMPORTE_FIRMADO_EXACTO', 'CAPACIDAD_B4_FIRMADA_VERIFICADA'],
      lineas: [{ tipo: 'DOCUMENTO', documentoConciliableId: documentId, importeCentimos: -12_500 }],
      totalLineasCentimos: -12_500,
      diferenciaPendienteCentimos: null,
      facturasAMarcarCobradas: [],
    },
    ...overrides,
  };
}

export function testRefundCapacityAcceptedWhenPreviouslyConsumed(): void {
  const parsed = parseProposalResponse(readyPayload(), snapshot);
  expect(parsed.ok, 'Una devolución firmada dentro de [-objetivo, 0] debe poder prepararse.');
  if (!parsed.ok) return;
  const draft = prepareDraftFromProposal(parsed.value, snapshot);
  expect(draft.ok, 'La devolución con capacidad firmada suficiente debe preparar un borrador.');
  if (draft.ok) {
    expect(draft.value.lineas[0]?.importeCentimos === -12_500, 'El borrador conserva el signo de la devolución.');
    expect(draft.value.lineas[0]?.tipo === 'DOCUMENTO', 'El borrador conserva una línea documental, no una diferencia inventada.');
  }
}

export function testMalformedLineKindIsRejected(): void {
  const raw = readyPayload();
  (raw as { resultado: { lineas: unknown[] } }).resultado.lineas = [{ tipo: 'OTRA_COSA', importeCentimos: -12_500 }];
  const parsed = parseProposalResponse(raw, snapshot);
  expect(!parsed.ok, 'Un tipo de línea no perteneciente a B4 debe rechazarse.');
}

export function testNoWriteDeclarationAndNoForgedZeroAreRequired(): void {
  const raw = readyPayload();
  (raw as { resultado: { noEscrituras: boolean; importeMovimientoCentimos: number } }).resultado.noEscrituras = false;
  let parsed = parseProposalResponse(raw, snapshot);
  expect(!parsed.ok, 'La UI no acepta una propuesta que no declare noEscrituras=true.');

  const zeroSnapshot: SnapshotB4Actual = { ...snapshot, importeMovimientoCentimos: 0 };
  parsed = parseProposalResponse(readyPayload(), zeroSnapshot);
  expect(!parsed.ok, 'Un importe cero no puede ser una sustitución de un importe desconocido ni tener propuesta B6.');
}

export function testStaleVersionIsRejectedBeforePreparation(): void {
  const raw = readyPayload({ b4: { estado: 'SIN_DOCUMENTO', version: 8 } });
  const parsed = parseProposalResponse(raw, snapshot);
  expect(!parsed.ok, 'Una respuesta de una versión B4 distinta no se muestra ni se prepara.');
}

export function testCapacityOverflowIsRejected(): void {
  const raw = readyPayload();
  (raw as { documentos: Array<{ asignadoCentimos: number }> }).documentos[0].asignadoCentimos = -19_000;
  const parsed = parseProposalResponse(raw, snapshot);
  expect(!parsed.ok, 'No se prepara una devolución que atraviesa el objetivo firmado B4.');
}

export function testManualProposalHasNoPreparedLines(): void {
  const raw = readyPayload({
    documentos: [],
    resultado: {
      motor: 'B6_PROPONE_ONLY',
      noEscrituras: true,
      requiereConfirmacionHumana: true,
      movimientoId: movementId,
      cuentaId: 'cuenta-b4-1',
      fecha: '2026-10-22',
      tercero: 'Proveedor exacto SL',
      importeMovimientoCentimos: -12_500,
      estado: 'NECESITA_EVIDENCIA_MANUAL',
      clase: 'GRUPO_NO_CIERRA',
      confianza: 'NINGUNA',
      razones: ['SUMA_DE_GRUPO_NO_CIERRA_EXACTAMENTE'],
      lineas: [],
      totalLineasCentimos: null,
      diferenciaPendienteCentimos: -50,
      facturasAMarcarCobradas: [],
    },
  });
  const parsed = parseProposalResponse(raw, snapshot);
  expect(parsed.ok, 'Una propuesta manual válida se puede mostrar sin preparar líneas.');
  if (parsed.ok) {
    const draft = prepareDraftFromProposal(parsed.value, snapshot);
    expect(!draft.ok, 'Una propuesta manual nunca crea un borrador ni una línea de ajuste.');
  }
}

test('testRefundCapacityAcceptedWhenPreviouslyConsumed',testRefundCapacityAcceptedWhenPreviouslyConsumed);
test('testMalformedLineKindIsRejected',testMalformedLineKindIsRejected);
test('testNoWriteDeclarationAndNoForgedZeroAreRequired',testNoWriteDeclarationAndNoForgedZeroAreRequired);
test('testStaleVersionIsRejectedBeforePreparation',testStaleVersionIsRejectedBeforePreparation);
test('testCapacityOverflowIsRejected',testCapacityOverflowIsRejected);
test('testManualProposalHasNoPreparedLines',testManualProposalHasNoPreparedLines);
