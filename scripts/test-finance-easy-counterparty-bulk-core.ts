import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  EASY_COUNTERPARTY_BULK_MAX_ITEMS,
  EasyCounterpartyBulkValidationError,
  easyCounterpartyBulkRequestHash,
  logicalEasyBulkRecords,
  matchEasyBulkText,
  parseEasyCounterpartyBulkCommand,
  parseEasyCounterpartyBulkPreviewInput,
  signEasyCounterpartyBulkPreview,
  verifyEasyCounterpartyBulkPreview,
} from '../lib/finanzas/easy-counterparty-bulk-core'

process.env.NEXTAUTH_SECRET ??= 'test-secret-only-for-easy-counterparty-bulk-contract-0123456789'
const UUID = '11111111-1111-4111-8111-111111111111'
const FINGERPRINT = 'a'.repeat(64)
const SUGGESTION = `p1_${'b'.repeat(64)}`
function code(work: () => unknown) {
  try { work() } catch (error) { return error instanceof EasyCounterpartyBulkValidationError ? error.code : String(error) }
  return null
}

assert.deepEqual(parseEasyCounterpartyBulkPreviewInput({ desde: '2026-01-01', hasta: '2026-10-08', limit: '25', offset: '0', sentido: 'TODOS' }), {
  desde: '2026-01-01', hasta: '2026-10-08', limit: 25, offset: 0, sentido: 'TODOS',
})
assert.equal(code(() => parseEasyCounterpartyBulkPreviewInput({ desde: '2026-10-09', hasta: '2026-10-08', limit: '25', offset: '0', sentido: 'TODOS' })), 'VALIDATION_ERROR')
assert.equal(code(() => parseEasyCounterpartyBulkPreviewInput({ desde: '2026-01-01', hasta: '2026-10-08', limit: '26', offset: '0', sentido: 'TODOS' })), 'VALIDATION_ERROR')

const records = logicalEasyBulkRecords([
  { sourceIdentity: 'EF:proveedor-a', identityProof: 'EF:proveedor-a', tipoTercero: 'PROVEEDOR', origen: 'ENTIDAD_FISCAL', nombre: 'Árbol Servicios S.L.', nifCif: 'B-12345674', aliases: ['Árbol Servicios'] },
  // Same fiscal proof/source through another current record makes one logical identity.
  { sourceIdentity: 'CW:cliente-a', identityProof: 'CW:cliente-a', tipoTercero: 'CLIENTE', origen: 'CLIENTE_CONTRATO_ACTUAL', nombre: 'Cliente Uno', nifCif: 'A 12345678', aliases: ['Cliente Uno Comercial'] },
  { sourceIdentity: 'CW:cliente-a-alt', identityProof: 'CW:cliente-a', tipoTercero: 'CLIENTE', origen: 'CLIENTE_CONTRATO_ACTUAL', nombre: 'Cliente Uno Antiguo', nifCif: null, aliases: [] },
  { sourceIdentity: 'EF:proveedor-b', identityProof: 'EF:proveedor-b', tipoTercero: 'PROVEEDOR', origen: 'ENTIDAD_FISCAL', nombre: 'Nombre Repetido', nifCif: 'B87654321', aliases: [] },
  { sourceIdentity: 'EF:proveedor-c', identityProof: 'EF:proveedor-c', tipoTercero: 'PROVEEDOR', origen: 'ENTIDAD_FISCAL', nombre: 'Nombre Repetido', nifCif: 'B76543210', aliases: [] },
])
assert.equal(records.length, 4, 'Sólo una prueba CIF o ID interno acreditado unifica fuentes.')
const exactName = matchEasyBulkText('  arbol   servicios s.l. ', records)
assert.equal(exactName.kind, 'UNICO')
if (exactName.kind === 'UNICO') assert.equal(exactName.record.sourceIdentity, 'EF:proveedor-a')
const exactCif = matchEasyBulkText('B 123.45674', records)
assert.equal(exactCif.kind, 'UNICO', 'CIF normalizado es coincidencia exacta, no aproximada.')
assert.equal(matchEasyBulkText('Árbol', records).kind, 'SIN_COINCIDENCIA', 'No hay prefijos ni palabras sueltas.')
assert.equal(matchEasyBulkText('Nombre Repetido', records).kind, 'AMBIGUO', 'Nunca se toma el primero ante dos fichas.')
assert.equal(matchEasyBulkText('Cliente Uno Antiguo', records).kind, 'UNICO', 'Un ID interno acreditado puede conservar una única identidad lógica.')

const selected = [{ movimientoId: 'mov-1', version: 7, sugerenciaId: SUGGESTION, fingerprint: FINGERPRINT }]
const token = signEasyCounterpartyBulkPreview(9, [{ ...selected[0], fecha: '2026-10-01', importeCentimos: -2500, tipoTercero: 'PROVEEDOR', etiqueta: 'Proveedor existente' }], 1_000)
assert.equal(verifyEasyCounterpartyBulkPreview(token, 9, selected, 1_001), true)
assert.equal(verifyEasyCounterpartyBulkPreview(token, 9, [{ ...selected[0], version: 8 }], 1_001), false, 'Una versión cambiada obliga a volver a leer la lista.')
assert.equal(verifyEasyCounterpartyBulkPreview(token, 10, selected, 1_001), false, 'El token está ligado al actor.')
assert.equal(verifyEasyCounterpartyBulkPreview(token, 9, selected, 601_001), false, 'El token caduca.')

const command = parseEasyCounterpartyBulkCommand({ action: 'aceptar_seleccionados', confirmacion: true, idempotencyKey: UUID, previewToken: token, items: selected })
assert.equal(command.action, 'aceptar_seleccionados')
assert.equal(easyCounterpartyBulkRequestHash(9, command), easyCounterpartyBulkRequestHash(9, command), 'Mismo actor y mismo payload conservan la misma huella idempotente.')
assert.notEqual(easyCounterpartyBulkRequestHash(9, command), easyCounterpartyBulkRequestHash(9, { ...command, items: [{ ...selected[0], version: 8 }] }), 'La repetición con una versión cambiada no adopta el recibo anterior.')
assert.equal(code(() => parseEasyCounterpartyBulkCommand({ action: 'aceptar_seleccionados', confirmacion: true, idempotencyKey: UUID, previewToken: token, items: [{ ...selected[0], nombre: 'texto libre' }] })), 'VALIDATION_ERROR')
assert.equal(code(() => parseEasyCounterpartyBulkCommand({ action: 'aceptar_seleccionados', confirmacion: true, idempotencyKey: UUID, previewToken: token, items: Array.from({ length: EASY_COUNTERPARTY_BULK_MAX_ITEMS + 1 }, (_, i) => ({ ...selected[0], movimientoId: `mov-${i}` })) })), 'VALIDATION_ERROR')
assert.equal(code(() => parseEasyCounterpartyBulkCommand({ action: 'deshacer_lote', confirmacion: false, idempotencyKey: randomUUID(), loteId: '22222222-2222-4222-8222-222222222222' })), 'CONFIRMACION_REQUERIDA')

console.log('test-finance-easy-counterparty-bulk-core: coincidencia única, ambigüedad, versión, firma y contrato cerrado verificados.')
