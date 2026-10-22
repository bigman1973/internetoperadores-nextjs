/* C9 pure tests: no Prisma, DATABASE_URL, Graph, filesystem fixtures or network. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CARPETA_CONFIRMING_DRAXTON_2026,
  comprobarReplaySoporteConfirming,
  esRutaConfirmingDraxton2026,
  evidenciaRutaConfirmingDraxton,
  hashSolicitudConfirmacionSoporte,
  parseSolicitudConfirmacionSoporteConfirmingDraxton,
  proponerClasificacionConfirmingDraxton,
  validarRevocacionSoporteConfirming,
} from '../lib/finanzas/confirming-draxton-core'

const DOCUMENTO = '11111111-1111-4111-8111-111111111111'
const MOVIMIENTO = 'movimiento-bancario-existente'
const CLAVE = '22222222-2222-4222-8222-222222222222'
const fuente = {
  facturaRecibidaId: DOCUMENTO,
  oneDriveItemId: 'drive-item-original',
  oneDriveDriveId: 'drive-id-original',
  carpetaOrigen: `${CARPETA_CONFIRMING_DRAXTON_2026}/1. Confirmings BBVA Draxton 2026`,
  archivoOneDrive: null,
  oneDriveRutaActual: null,
}
function value<T>(result: { ok: true; value: T } | { ok: false; codigo: string; mensaje: string }): T {
  assert.equal(result.ok, true, 'codigo' in result ? `${result.codigo}: ${result.mensaje}` : '')
  return (result as { ok: true; value: T }).value
}
function fails(result: { ok: true; value: unknown } | { ok: false; codigo: string; mensaje: string }, code: string) {
  assert.equal(result.ok, false)
  if ('codigo' in result) assert.equal(result.codigo, code)
}

test('1 sólo la carpeta exacta C9, no una palabra confirming, da evidencia', () => {
  assert.equal(esRutaConfirmingDraxton2026(`2026/${CARPETA_CONFIRMING_DRAXTON_2026}/BBVA`), true)
  assert.equal(esRutaConfirmingDraxton2026('2026/Confirming otro cliente'), false)
  assert.equal(esRutaConfirmingDraxton2026(null), false)
})
test('2 documento movido mantiene evidencia en snapshots B1', () => {
  const evidence = evidenciaRutaConfirmingDraxton(
    { ...fuente, carpetaOrigen: '4. Trimestre 1 2026', oneDriveRutaActual: 'ruta/4. Trimestre 1 2026/f.pdf' },
    [{ anterior: { carpetaOrigen: fuente.carpetaOrigen }, actual: { carpetaOrigen: '4. Trimestre 1 2026' } }],
  )
  assert.equal(evidence.actual, false)
  assert.equal(evidence.historica, true)
  assert.deepEqual(evidence.rutasHistoricas, [fuente.carpetaOrigen])
})
test('3 no hay reclasificación propuesta sin evidencia actual ni histórica', () => {
  fails(proponerClasificacionConfirmingDraxton({
    fuente: { ...fuente, carpetaOrigen: '2. Pendiente de contabilizar o revisar 2026' }, historial: [],
  }), 'SIN_EVIDENCIA_RUTA_CONFIRMING_DRAXTON')
})
test('4 propuesta no recibe ni emite importes y conserva hash fuente estable', () => {
  const a = value(proponerClasificacionConfirmingDraxton({ fuente, historial: [] }))
  const b = value(proponerClasificacionConfirmingDraxton({ fuente, historial: [] }))
  assert.equal(a.naturalezaDocumento, 'SOPORTE_CONFIRMING_CLIENTE')
  assert.equal(a.tipoSoporteFinanciero, 'CONFIRMING_CESION_DRAXTON')
  assert.equal(a.fuenteHash, b.fuenteHash)
  assert.equal(JSON.stringify(a).match(/importe|total|iva|base/i), null)
})
test('5 contrato de confirmación humana es cerrado y no admite importe/B4/factura emitida', () => {
  const valid = value(parseSolicitudConfirmacionSoporteConfirmingDraxton({
    facturaRecibidaId: DOCUMENTO, movimientoId: MOVIMIENTO, versionDocumento: 1, idempotencyKey: CLAVE, confirmar: true,
  }))
  assert.equal(valid.confirmar, true)
  fails(parseSolicitudConfirmacionSoporteConfirmingDraxton({
    facturaRecibidaId: DOCUMENTO, movimientoId: MOVIMIENTO, versionDocumento: 1, idempotencyKey: CLAVE, confirmar: false,
  }), 'CONFIRMACION_HUMANA_REQUERIDA')
  fails(parseSolicitudConfirmacionSoporteConfirmingDraxton({
    facturaRecibidaId: DOCUMENTO, movimientoId: MOVIMIENTO, versionDocumento: 1, idempotencyKey: CLAVE, confirmar: true, importeCentimos: 1,
  }), 'VALIDATION_ERROR')
})
test('6 idempotencia sólo reintenta la misma decisión humana', () => {
  const request = value(parseSolicitudConfirmacionSoporteConfirmingDraxton({
    facturaRecibidaId: DOCUMENTO, movimientoId: MOVIMIENTO, versionDocumento: 1, idempotencyKey: CLAVE, confirmar: true,
  }))
  const hash = hashSolicitudConfirmacionSoporte(request)
  assert.deepEqual(value(comprobarReplaySoporteConfirming({ payloadHash: hash, snapshot: { soporteId: 'inmutable' } }, hash)), { replay: true, snapshot: { soporteId: 'inmutable' } })
  fails(comprobarReplaySoporteConfirming({ payloadHash: hash, snapshot: {} }, `${hash}x`), 'IDEMPOTENCY_PAYLOAD_MISMATCH')
})
test('7 revocación exige motivo, versión y clave; no borra el soporte', () => {
  assert.equal(value(validarRevocacionSoporteConfirming({ soporteId: DOCUMENTO, version: 1, idempotencyKey: CLAVE, motivo: 'Documento fuente sustituido tras revisión humana.' })).motivo.startsWith('Documento'), true)
  fails(validarRevocacionSoporteConfirming({ soporteId: DOCUMENTO, version: 1, idempotencyKey: CLAVE, motivo: '' }), 'MOTIVO_REVOCACION_REQUERIDO')
})
