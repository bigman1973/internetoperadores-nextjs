import assert from 'node:assert/strict';
import {
  buildConfirmInvoicePayload, buildCreateRulePayload, buildDisableRulePayload, buildNoRequirePayload, buildUndoPayload,
  canConfirmSuggestion, formatCentsText, monthLabel, parseEasyReadResponse, sortQueueByMagnitude, suggestionEvidenceLabel,
} from '../components/finanzas/easy/easy-contract';
import { MAX_B5_DOCUMENT_BYTES, normaliseReviewedTicketAmount } from '../components/finanzas/easy/PhotoCaptureForm';

const response = {
  stagingOnly: true, automaticas: false, criterio: 'sólo movimientos SIN_DOCUMENTO', periodo: { desde: '2026-01-01', hasta: '2026-10-08' }, total: 2, limit: 25, offset: 0,
  totales: { cargos: 1, cobros: 1, cargosCentimos: '-25000', cobrosCentimos: '4500' },
  meses: [{ mes: '2026-01', pendientes: 2, justificados: 0, noRequiere: 0, importeJustificadoCentimos: '0', importePendienteCentimos: '-20500', coberturaVerificada: false, semaforo: 'VERDE', mensaje: 'Pendiente de verificar' }],
  reglas: [{ id: '8dbeb09b-2a84-4b9f-b47f-35da7db0b74e', version: 3, contraparte: 'Proveedor', accion: 'PROPONER_FACTURA', activa: true, modo: 'SOLO_PROPONER', usosConfirmados: 3 }],
  movimientos: [
    { id: 'm-small', version: 2, fecha: '2026-01-03', concepto: 'Cobro pequeño', importeCentimos: 4500, contraparte: 'Cliente', cuenta: { id: 'a1', banco: 'Banco', alias: null }, tarjeta: '6440', responsableTarjeta: null, versionGestion: 7, estado: 'SIN_DOCUMENTO', reglaAplicadaId: null, sugerencias: [{ id: 'mf1_cobro', tipo: 'FACTURA_EMITIDA', sourceId: 'fi-opaque', documentoConciliableId: null, referencia: 'F-01', tercero: 'Cliente', fecha: '2026-01-01', vencimiento: null, importeCentimos: 4500, archivoDisponible: false, exacta: true, motivos: [] }] },
    { id: 'm-large', version: 4, fecha: '2026-01-02', concepto: 'Cargo grande', importeCentimos: -25000, contraparte: 'Proveedor', cuenta: { id: 'a1', banco: 'Banco', alias: null }, tarjeta: '9029', responsableTarjeta: null, versionGestion: 9, estado: 'SIN_DOCUMENTO', reglaAplicadaId: 'r1', sugerencias: [{ id: 'mf1_cargo', tipo: 'FACTURA_RECIBIDA', sourceId: 'fr-opaque', documentoConciliableId: null, referencia: 'F-02', tercero: 'Proveedor', fecha: '2026-01-01', vencimiento: '2026-01-10', importeCentimos: -25000, archivoDisponible: true, exacta: true, motivos: ['Importe exacto'] }] },
  ],
};

const parsed = parseEasyReadResponse(response);
assert.equal(parsed.stagingOnly, true, 'La UI sólo admite DTO staging explícito.');
assert.equal(parsed.automaticas, false, 'La UI rechaza automatismos.');
assert.equal(parsed.meses[0].coberturaVerificada, false, 'El semáforo sin cobertura se conserva como no verificado.');
assert.deepEqual(sortQueueByMagnitude(parsed.movimientos).map((movement) => movement.id), ['m-large', 'm-small'], 'La cola se ordena por magnitud absoluta.');
assert.equal(parsed.reglas[0].version, 3, 'La UI requiere versión antes de desactivar una regla.');
assert.throws(() => parseEasyReadResponse({ ...response, stagingOnly: false }), /stagingOnly/);
assert.throws(() => parseEasyReadResponse({ ...response, automaticas: true }), /automaticas/);
assert.throws(() => parseEasyReadResponse({ ...response, reglas: [{ ...response.reglas[0], modo: 'AUTOCONFIRMAR' }] }), /proposal-only/);
assert.throws(() => parseEasyReadResponse({ ...response, reglas: [{ ...response.reglas[0], version: undefined }] }), /version/);

const charge = parsed.movimientos[1]; const receipt = parsed.movimientos[0];
assert.equal(canConfirmSuggestion(charge, charge.sugerencias[0]), true, 'Un cargo exacto con archivo se puede confirmar aunque B4 aún vaya a crear wrapper.');
assert.equal(canConfirmSuggestion(receipt, receipt.sugerencias[0]), true, 'Un cobro exacto puede confirmar aunque la factura emitida no exponga archivo ni wrapper.');
assert.equal(suggestionEvidenceLabel(receipt.sugerencias[0]), 'Coincidencia exacta', 'No se llama ambigua a una coincidencia exacta por carecer de archivo emitido.');
assert.equal(canConfirmSuggestion(charge, { exacta: true, archivoDisponible: false }), false, 'Un cargo sin archivo no se confirma.');
assert.equal(suggestionEvidenceLabel({ exacta: false, archivoDisponible: false }), 'Sin archivo descargable');

assert.equal(formatCentsText('-25000'), '−250,00 €');
assert.equal(formatCentsText('4500'), '45,00 €');
assert.equal(formatCentsText('+1'), '+0,01 €');
assert.equal(monthLabel('2026-01'), 'Enero de 2026');

const key = 'e5b50360-4f7b-4941-8a64-61aaf7d2d3c8';
const undoPayload = buildUndoPayload('80c5cf3d-733b-488b-9a93-3e0ab108e3bf', key);
assert.deepEqual(buildConfirmInvoicePayload(charge, charge.sugerencias[0], key), { action: 'confirmar_factura', movimientoId: 'm-large', version: 4, sugerenciaId: 'mf1_cargo', idempotencyKey: key, confirmacion: true }, 'Confirmar factura usa exactamente el contrato cerrado.');
assert.deepEqual(buildNoRequirePayload(charge, 'COMISION_BANCARIA', key), { action: 'no_requiere', movimientoId: 'm-large', version: 4, motivoNoRequiere: 'COMISION_BANCARIA', idempotencyKey: key, confirmacion: true });
assert.equal(Object.keys(undoPayload).length, 4, 'Deshacer tiene exactamente cuatro claves cerradas.');
assert.deepEqual(undoPayload, { action: 'deshacer', confirmacion: true, operacionId: '80c5cf3d-733b-488b-9a93-3e0ab108e3bf', idempotencyKey: key }, 'Deshacer usa exactamente cuatro claves cerradas y no inventa movimiento, versión ni líneas.');
assert.deepEqual(buildCreateRulePayload('80c5cf3d-733b-488b-9a93-3e0ab108e3bf'), { action: 'crear', operacionId: '80c5cf3d-733b-488b-9a93-3e0ab108e3bf', modo: 'SOLO_PROPONER', confirmacion: true }, 'Crear regla omite idempotencyKey no admitida.');
assert.deepEqual(buildDisableRulePayload(parsed.reglas[0]), { action: 'desactivar', reglaId: parsed.reglas[0].id, version: 3, confirmacion: true }, 'Desactivar regla aporta versión de concurrencia.');

assert.equal(normaliseReviewedTicketAmount(' 001,20 '), '1.20');
assert.equal(normaliseReviewedTicketAmount('0,00'), null);
assert.equal(normaliseReviewedTicketAmount('1.234,56'), null);
assert.equal(MAX_B5_DOCUMENT_BYTES, 3 * 1024 * 1024, 'La validación de UI mantiene el límite B5 de 3 MB.');
console.log('test-finance-easy-ui: OK');
