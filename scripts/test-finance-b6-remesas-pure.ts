import assert from 'node:assert/strict'
import {
  B6RemesaServiceError,
  facturasSourceHash,
  remesaSourceFingerprint,
  parseAsociarDevolucionInput,
  parseAsociarFacturasInput,
  requestHash,
  simulateAssociationValidation,
  simulateRefundValidation,
} from '../lib/finanzas/b6-remesas-pure'

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'
const UUID_C = '33333333-3333-4333-8333-333333333333'

function throwsCode(code: string, fn: () => unknown) {
  assert.throws(fn, (error: unknown) => error instanceof B6RemesaServiceError && error.code === code)
}

// Input ordering changes in a selector must not change the canonical request.
const sourceRows = [
  { id: 7, ispGestionId: 7007, fecha: '2026-10-21', totalCentimos: 10_000 },
  { id: 9, ispGestionId: 7009, fecha: '2026-10-21', totalCentimos: -2_500 },
]
const sourceHash = facturasSourceHash(sourceRows)
const remesaHash=remesaSourceFingerprint({id:42,ispGestionId:4200,fecha:'2026-10-21',totalCentimos:7500})
const unordered = parseAsociarFacturasInput({
  action: 'asociar_facturas', remesaId: 42, facturaIdsISP: [9, 7], confirmacion: true,
  idempotencyKey: UUID_A, expectedRemesaHashSHA256:remesaHash, expectedRemesaTotalCentimos: 7_500, expectedFacturasHashSHA256: sourceHash,
})
const ordered = parseAsociarFacturasInput({
  action: 'asociar_facturas', remesaId: 42, facturaIdsISP: [7, 9], confirmacion: true,
  idempotencyKey: UUID_A, expectedRemesaHashSHA256:remesaHash, expectedRemesaTotalCentimos: 7_500, expectedFacturasHashSHA256: sourceHash,
})
assert.deepEqual(unordered.facturaIdsISP, [7, 9])
assert.equal(requestHash(unordered), requestHash(ordered))
throwsCode('VALIDATION_ERROR', () => parseAsociarFacturasInput({
  action: 'asociar_facturas', remesaId: 42, facturaIdsISP: [7, 7], confirmacion: true,
  idempotencyKey: UUID_A, expectedRemesaHashSHA256:remesaHash, expectedRemesaTotalCentimos: 7_500, expectedFacturasHashSHA256: sourceHash,
}))

// Signed closure is exact; no abs() is permitted. Membership is audit-only and
// does not participate in the expected immutable-source hash.
const close = simulateAssociationValidation(unordered, {
  remesa: { id: 42, ispGestionId: 4200, fecha: '2026-10-21', totalCentimos: 7_500 },
  facturas: [
    { ...sourceRows[0], remesaIdAntes: null, facturaEmitidaActual: { id: UUID_B, totalCentimos: 10_000 } },
    { ...sourceRows[1], remesaIdAntes: 42, facturaEmitidaActual: null },
  ],
})
assert.equal(close.sumaFacturasCentimos, 7_500)
assert.equal(close.facturasHashSHA256, sourceHash)
throwsCode('FUENTE_FACTURAS_CAMBIADA', () => simulateAssociationValidation(unordered, {
  remesa: { id: 42, ispGestionId: 4200, fecha: '2026-10-21', totalCentimos: 7_500 },
  facturas: [
    { ...sourceRows[0], totalCentimos: 10_001, remesaIdAntes: null, facturaEmitidaActual: null },
    { ...sourceRows[1], remesaIdAntes: null, facturaEmitidaActual: null },
  ],
}))
const closureMismatch = parseAsociarFacturasInput({
  action: 'asociar_facturas', remesaId: 42, facturaIdsISP: [7, 9], confirmacion: true,
  idempotencyKey: UUID_A, expectedRemesaHashSHA256:remesaHash, expectedRemesaTotalCentimos: 7_500,
  expectedFacturasHashSHA256: facturasSourceHash([{ ...sourceRows[0], totalCentimos: 9_999 }, sourceRows[1]]),
})
throwsCode('SUMA_FACTURAS_NO_CIERRA_REMESA', () => simulateAssociationValidation(closureMismatch, {
  remesa: { id: 42, ispGestionId: 4200, fecha: '2026-10-21', totalCentimos: 7_500 },
  facturas: [
    { ...sourceRows[0], totalCentimos: 9_999, remesaIdAntes: null, facturaEmitidaActual: null },
    { ...sourceRows[1], remesaIdAntes: null, facturaEmitidaActual: null },
  ],
}))

const refund = parseAsociarDevolucionInput({
  action: 'asociar_devolucion', remesaId: 42, facturaISPId: 7, vinculoId: UUID_B,
  movimientoId: 'movimiento-banco-opaco', confirmacion: true, idempotencyKey: UUID_C,
})
const validRefund = {
  remesaId: 42, facturaISPId: 7, facturaRemesaId: 42, facturaObjetivoCentimos: 10_000,
  bancoCentimos: -2_500,
  cierreB4Centimos: -2_500,
  numeroLineasDocumentoB4: 1,
  vinculo: {
    id: UUID_B, movimientoId: 'movimiento-banco-opaco', activo: true, tipoLinea: 'DOCUMENTO' as const,
    importeCentimos: -2_500, documentoActivo: true, documentoTipo: 'REMESA', documentoRemesaId: 42,
    operacionEstado: 'APLICADA', operacionRevertida: false, movimientoEstado: 'JUSTIFICADO',
  },
  yaDevueltoVigenteCentimos: 2_500, vinculoYaUsado: false,
}
assert.deepEqual(simulateRefundValidation(refund, validRefund), { importeCentimos: -2_500, capacidadRestanteCentimos: 5_000 })
throwsCode('DEVOLUCION_EXCEDE_FACTURA', () => simulateRefundValidation(refund, { ...validRefund, yaDevueltoVigenteCentimos: 8_000 }))
throwsCode('IMPORTE_BANCO_VINCULO_INVALIDO', () => simulateRefundValidation(refund, { ...validRefund, bancoCentimos: -2_499 }))
throwsCode('EVIDENCIA_B4_DEVOLUCION_INVALIDA', () => simulateRefundValidation(refund, {
  ...validRefund, vinculo: { ...validRefund.vinculo, activo: false },
}))

console.log('b6-remesas-pure.test.ts: OK')

assert.equal(simulateRefundValidation(refund,{...validRefund,bancoCentimos:-2_600,cierreB4Centimos:-2_600}).importeCentimos,-2_500)
throwsCode('IMPORTE_BANCO_VINCULO_INVALIDO',()=>simulateRefundValidation(refund,{...validRefund,numeroLineasDocumentoB4:2}))

throwsCode('FUENTE_REMESA_CAMBIADA',()=>simulateAssociationValidation(unordered,{remesa:{id:42,ispGestionId:4200,fecha:'2026-10-22',totalCentimos:7500},facturas:[]}))
