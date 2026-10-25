import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  EASY_COLLECTIONS_MAX_ITEMS,
  EASY_COLLECTIONS_MAX_BLOCK_ITEMS,
  EasyCollectionsValidationError,
  assertEasyCollectionBlockSelection,
  canonicalEasyCollectionsJson,
  easyCollectionFingerprint,
  easyCollectionSelection,
  easyCollectionsRequestHash,
  parseEasyCollectionLines,
  parseEasyCollectionsCommand,
  parseEasyCollectionsPreviewInput,
} from '../lib/finanzas/easy-collections-core'
import { signEasyCollectionsPreview, verifyEasyCollectionsPreview } from '../lib/finanzas/easy-collections-preview'

process.env.NEXTAUTH_SECRET ??= 'test-secret-only-for-easy-collections-contract-0123456789'
const UUID = '11111111-1111-4111-8111-111111111111'
const MOVIMIENTO = 'movimiento-prueba'
const FINGERPRINT = 'a'.repeat(64)
function code(work: () => unknown): string | null {
  try { work() } catch (error) { return error instanceof EasyCollectionsValidationError ? error.code : String(error) }
  return null
}

const fixed = {
  v: 1 as const, movimientoId: 'mov-α', movimientoParId: null,
  importeMovimientoCentimos: 12345, metodo: 'REF_FACTURA' as const, nivel: 'EXACTA' as const,
  estadoPropuesto: 'JUSTIFICADO' as const, motivoNoRequiere: null,
  lineas: [{ tipo: 'DOCUMENTO' as const, tipoDocumento: 'FACTURA_EMITIDA' as const, sourceId: '11111111-2222-3333-4444-555555555555', importeCentimos: 12345 }],
}
const pythonCanonical = '{"estadoPropuesto":"JUSTIFICADO","importeMovimientoCentimos":12345,"lineas":[{"importeCentimos":12345,"sourceId":"11111111-2222-3333-4444-555555555555","tipo":"DOCUMENTO","tipoDocumento":"FACTURA_EMITIDA"}],"metodo":"REF_FACTURA","motivoNoRequiere":null,"movimientoId":"mov-α","movimientoParId":null,"nivel":"EXACTA","v":1}'
const pythonFingerprint = '6a2897acd05c9bfd06cebb49acfd76926de8c95e4033769705bf22b53dc8dc5e'
assert.equal(canonicalEasyCollectionsJson(fixed), pythonCanonical, 'La canonicalización debe ser byte a byte compatible con Python.')
assert.equal(easyCollectionFingerprint(fixed), pythonFingerprint, 'La huella debe coincidir con hashlib.sha256/json.dumps del vector fijo.')

assert.deepEqual(parseEasyCollectionsPreviewInput({ nivel: null, metodo: null, q: null, limit: null, offset: null }), { nivel: 'EXACTA', limit: 25, offset: 0 })
assert.deepEqual(parseEasyCollectionsPreviewInput({ nivel: 'TODAS', metodo: 'REMESA_UNION', q: 'cliente', limit: '1', offset: '10000' }), { nivel: 'TODAS', metodo: 'REMESA_UNION', q: 'cliente', limit: 1, offset: 10000 })
assert.equal(code(() => parseEasyCollectionsPreviewInput({ nivel: 'OTRO', metodo: null, q: null, limit: null, offset: null })), 'VALIDATION_ERROR')
assert.equal(code(() => parseEasyCollectionsPreviewInput({ nivel: null, metodo: null, q: null, limit: '26', offset: '0' })), 'VALIDATION_ERROR')
assert.equal(code(() => parseEasyCollectionsPreviewInput({ nivel: null, metodo: null, q: null, limit: '25', offset: '10001', extra: 'no' })), 'VALIDATION_ERROR')

assert.deepEqual(parseEasyCollectionLines(fixed.lineas, 12345, 'JUSTIFICADO', null), fixed.lineas)
assert.deepEqual(parseEasyCollectionLines([], 100, 'NO_REQUIERE', 'TRASPASO_INTERNO_SIN_DOCUMENTO'), [])
assert.equal(code(() => parseEasyCollectionLines([{ tipo: 'DIFERENCIA', motivoDiferencia: 'COMISION', importeCentimos: 100 }], 100, 'JUSTIFICADO', null)), 'PROPUESTA_INTEGRA_INVALIDA')
assert.equal(code(() => parseEasyCollectionLines([{ tipo: 'DOCUMENTO', tipoDocumento: 'REMESA', sourceId: 'remesa-no-numerica', importeCentimos: 100 }], 100, 'JUSTIFICADO', null)), 'PROPUESTA_INTEGRA_INVALIDA')
assert.equal(code(() => parseEasyCollectionLines([{ tipo: 'DOCUMENTO', tipoDocumento: 'FACTURA_EMITIDA', sourceId: UUID, importeCentimos: 99 }], 100, 'JUSTIFICADO', null)), 'PROPUESTA_INTEGRA_INVALIDA')

const selection = [{ propuestaId: UUID, movimientoId: MOVIMIENTO, fingerprint: FINGERPRINT }]
const token = signEasyCollectionsPreview(9, selection, 1_000)
assert.equal(verifyEasyCollectionsPreview(token, 9, selection, 1_001), true)
assert.equal(verifyEasyCollectionsPreview(token, 10, selection, 1_001), false, 'El token pertenece al actor que abrió la lista.')
assert.equal(verifyEasyCollectionsPreview(token, 9, [{ ...selection[0], fingerprint: 'b'.repeat(64) }], 1_001), false, 'Una huella distinta exige nueva lista.')
assert.equal(verifyEasyCollectionsPreview(token, 9, selection, 901_001), false, 'El token caduca a los quince minutos.')

const command = parseEasyCollectionsCommand({ action: 'confirmar_bloque', confirmacion: true, idempotencyKey: UUID, previewToken: token, items: selection })
assert.equal(command.action, 'confirmar_bloque')
assert.equal(easyCollectionsRequestHash(9, command), easyCollectionsRequestHash(9, command))
assert.notEqual(easyCollectionsRequestHash(9, command), easyCollectionsRequestHash(10, command), 'El recibo idempotente queda ligado al actor.')
assert.equal(code(() => parseEasyCollectionsCommand({ action: 'confirmar_bloque', confirmacion: false, idempotencyKey: UUID, previewToken: token, items: selection })), 'CONFIRMACION_REQUERIDA')
assert.equal(code(() => parseEasyCollectionsCommand({ action: 'confirmar_bloque', confirmacion: true, idempotencyKey: UUID, previewToken: token, items: [{ ...selection[0], nota: 'texto libre' }] })), 'VALIDATION_ERROR')
assert.equal(code(() => parseEasyCollectionsCommand({ action: 'confirmar_bloque', confirmacion: true, idempotencyKey: UUID, previewToken: token, items: Array.from({ length: EASY_COLLECTIONS_MAX_ITEMS + 1 }, (_, index) => ({ ...selection[0], propuestaId: randomUUID(), movimientoId: `mov-${index}` })) })), 'VALIDATION_ERROR')
assert.equal(code(() => parseEasyCollectionsCommand({ action: 'confirmar_bloque', confirmacion: true, idempotencyKey: UUID, previewToken: token, items: Array.from({ length: EASY_COLLECTIONS_MAX_BLOCK_ITEMS + 1 }, (_, index) => ({ ...selection[0], propuestaId: randomUUID(), movimientoId: `bloque-${index}` })) })), 'VALIDATION_ERROR')
assert.equal(code(() => parseEasyCollectionsCommand({ action: 'deshacer_bloque', confirmacion: false, idempotencyKey: randomUUID(), bloqueId: randomUUID() })), 'CONFIRMACION_REQUERIDA')

assert.deepEqual(easyCollectionSelection({ importeMovimientoCentimos: 100, metodo: 'REF_FACTURA', nivel: 'EXACTA', estadoPropuesto: 'JUSTIFICADO', movimientoParId: null, parValido: false }), { seleccionable: true, motivoNoSeleccionable: null })
assert.equal(easyCollectionSelection({ importeMovimientoCentimos: -100, metodo: 'DEVOLUCION_RECIBO', nivel: 'EXACTA', estadoPropuesto: 'JUSTIFICADO', movimientoParId: null, parValido: false }).seleccionable, false, 'Un cargo justificado exige archivo y queda fuera.')
assert.equal(easyCollectionSelection({ importeMovimientoCentimos: 100, metodo: 'TRASPASO_PROPIO', nivel: 'EXACTA', estadoPropuesto: 'NO_REQUIERE', movimientoParId: MOVIMIENTO, parValido: true }).seleccionable, true)
assert.equal(easyCollectionSelection({ importeMovimientoCentimos: 100, metodo: 'TRASPASO_PROPIO', nivel: 'EXACTA', estadoPropuesto: 'NO_REQUIERE', movimientoParId: MOVIMIENTO, parValido: false }).seleccionable, false)
assert.doesNotThrow(() => assertEasyCollectionBlockSelection([{ importeMovimientoCentimos: 100, metodo: 'REF_FACTURA', nivel: 'REVISAR', estadoPropuesto: 'JUSTIFICADO', movimientoParId: null, parValido: false }]))
assert.equal(code(() => assertEasyCollectionBlockSelection([
  { importeMovimientoCentimos: 100, metodo: 'REF_FACTURA', nivel: 'REVISAR', estadoPropuesto: 'JUSTIFICADO', movimientoParId: null, parValido: false },
  { importeMovimientoCentimos: 100, metodo: 'REF_FACTURA', nivel: 'EXACTA', estadoPropuesto: 'JUSTIFICADO', movimientoParId: null, parValido: false },
])), 'SELECCION_CAMBIADA')

console.log('test-easy-collections-core: contrato cerrado, vector Python, token y reglas de selección verificados.')
