import assert from 'node:assert/strict'
import {
  ConciliarBatchProviderError,
  buildConciliarBankFeeB4EventDetail,
  buildConciliarBankFeeEmptyB8Receipt,
  prepareConciliarBankFeeBatchRows,
  type ConciliarBankFeeBatchInput,
  type ConciliarBankFeeLockedSource,
} from '../lib/finanzas/conciliar-batch'
import { B8_RECEIPT_SCHEMA, B8_SOURCE_NOTE_RULE, metadataHashEleccionesCentro, relatedSourceHashP2 } from '../lib/finanzas/centros-coste-core'
import { counterpartyRequestHash } from '../lib/finanzas/easy-counterparty-core'

const ACTOR = 17
const OPERATION_ID = '11111111-1111-4111-8111-111111111111'

function key(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function item(index: number) {
  return {
    rowId: `fila-${index}`,
    movimientoId: `comision-${String(index).padStart(2, '0')}`,
    version: index % 2 === 0 ? 1 : 7,
    importeMovimientoCentimos: -100 - index,
    idempotencyKey: key(index + 1),
  }
}

function source(index: number, overrides: Partial<ConciliarBankFeeLockedSource> = {}): ConciliarBankFeeLockedSource {
  const selected = item(index)
  return {
    movementId: selected.movimientoId,
    importeCentimos: selected.importeMovimientoCentimos,
    concepto: 'COMISIÓN DE MANTENIMIENTO',
    referencia: null,
    infoAdicional: null,
    tercero: null,
    banco: 'Banco de prueba',
    estado: index % 2 === 0 ? null : 'SIN_DOCUMENTO',
    motivoNoRequiere: null,
    version: selected.version,
    entityId: `entidad-aapp-${index}`,
    entityName: 'Entidad registrada de prueba',
    entityNif: 'A00000000',
    activeP1Id: null,
    p1Version: 0,
    ...overrides,
  }
}

const input: ConciliarBankFeeBatchInput = {
  action: 'confirmar_comisiones_conciliar_lote',
  operationId: OPERATION_ID,
  items: Array.from({ length: 20 }, (_, index) => item(index)),
}

const sources = input.items.map((_, index) => source(index, index === 8
  ? { entityId: null, entityName: null, entityNif: null }
  : index === 9
    ? { activeP1Id: 'decision-vigente' }
    : {}))

const prepared = prepareConciliarBankFeeBatchRows(input, ACTOR, sources)
assert.equal(prepared.length, 20, 'Un clic de 20 comisiones debe preparar exactamente 20 patas.')
assert.deepEqual(prepared.map(row => row.rowId), input.items.map(row => row.rowId), 'El resultado conserva el orden cerrado de selección.')
assert.equal(new Set(prepared.map(row => row.operationB4Id)).size, 20, 'Cada movimiento conserva una operación B4 reversible distinta.')
assert.equal(new Set(prepared.map(row => row.idempotencyKey)).size, 20, 'Las claves B4 no se comparten entre patas.')

for (let index = 0; index < prepared.length; index += 1) {
  const row = prepared[index]!
  const selected = input.items[index]!
  assert.equal(row.movementId, selected.movimientoId)
  assert.equal(row.importeCentimos, selected.importeMovimientoCentimos)
  assert.equal(row.previousState.estado, 'SIN_DOCUMENTO')
  assert.equal(row.previousState.version, selected.version)
  assert.equal(row.resultState.estado, 'NO_REQUIERE')
  assert.equal(row.resultState.motivoNoRequiere, 'COMISION_BANCARIA')
  assert.equal(row.resultState.version, selected.version + 1)
  assert.deepEqual(row.b4Request, {
    action: 'confirmar',
    confirmacion: true,
    idempotencyKey: selected.idempotencyKey,
    version: selected.version,
    borrador: {
      movimientoId: selected.movimientoId,
      importeMovimientoCentimos: selected.importeMovimientoCentimos,
      estado: 'NO_REQUIERE',
      motivoNoRequiere: 'COMISION_BANCARIA',
      lineas: [],
    },
  })
  assert.deepEqual(row.b8.snapshotSolicitud, {
    schema: B8_RECEIPT_SCHEMA,
    sourceNoteRule: B8_SOURCE_NOTE_RULE,
    mapping: [],
  })
  assert.deepEqual(row.b8.snapshotResultado, {
    schema: B8_RECEIPT_SCHEMA,
    accion: 'CONFIRMACION_B4_ELECCIONES',
    sourceNoteRule: B8_SOURCE_NOTE_RULE,
    metadataHash: metadataHashEleccionesCentro([]),
    relatedSourceHashP2: relatedSourceHashP2([]),
    mapping: [],
  })
}

assert.equal(prepared[8]!.p1, null, 'Sin ficha AAPP vigente el resultado P1 debe ser null, sin inventar banco.')
assert.equal(prepared[9]!.p1, null, 'Una decisión P1 vigente no se sobrescribe ni se duplica.')
for (const index of [0, 1, 2, 19]) {
  const p1 = prepared[index]!.p1
  assert.ok(p1, 'Una ficha AAPP vigente sin P1 requiere recibo P1 por fila.')
  assert.equal(p1.receipt.actorId, ACTOR)
  assert.equal(p1.receipt.operationId, OPERATION_ID)
  assert.equal(p1.receipt.movementId, input.items[index]!.movimientoId)
  assert.equal(p1.receipt.version, 1)
  assert.equal(p1.requestHash, counterpartyRequestHash(ACTOR, {
    action: 'confirmar',
    movimientoId: input.items[index]!.movimientoId,
    version: 0,
    sugerenciaId: `p1_${p1.candidateHash}`,
    idempotencyKey: p1.idempotencyKey,
    confirmacion: true,
  }), 'El requestHash P1 queda ligado al actor efectivo, no a un placeholder.')
  assert.notEqual(p1.requestHash, counterpartyRequestHash(ACTOR + 1, {
    action: 'confirmar',
    movimientoId: input.items[index]!.movimientoId,
    version: 0,
    sugerenciaId: `p1_${p1.candidateHash}`,
    idempotencyKey: p1.idempotencyKey,
    confirmacion: true,
  }))
}

const emptyB8 = buildConciliarBankFeeEmptyB8Receipt()
assert.equal(emptyB8.metadataHash, metadataHashEleccionesCentro([]))
assert.equal(emptyB8.relatedSourceHashP2, relatedSourceHashP2([]))
assert.equal(emptyB8.snapshotResultado.schema, B8_RECEIPT_SCHEMA)
assert.deepEqual(buildConciliarBankFeeB4EventDetail(8), { version: 8, origen: 'MANUAL', nota: 'COMISION_BANCARIA' })

function expectProviderCode(expected: string, work: () => unknown) {
  assert.throws(work, (error: unknown) => error instanceof ConciliarBatchProviderError && error.code === expected)
}

const wrongAmount = sources.map(row => ({ ...row }))
wrongAmount[4] = { ...wrongAmount[4]!, importeCentimos: -999 }
expectProviderCode('IMPORTE_MOVIMIENTO_CAMBIADO', () => prepareConciliarBankFeeBatchRows(input, ACTOR, wrongAmount))

const wrongState = sources.map(row => ({ ...row }))
wrongState[5] = { ...wrongState[5]!, estado: 'NO_REQUIERE', motivoNoRequiere: 'COMISION_BANCARIA' }
expectProviderCode('DESHACER_REQUERIDO', () => prepareConciliarBankFeeBatchRows(input, ACTOR, wrongState))

const wrongKeyword = sources.map(row => ({ ...row }))
wrongKeyword[6] = { ...wrongKeyword[6]!, concepto: 'COMPRA TARJETA' }
expectProviderCode('COMISION_RECLASIFICADA', () => prepareConciliarBankFeeBatchRows(input, ACTOR, wrongKeyword))

const wrongP1Version = sources.map(row => ({ ...row }))
wrongP1Version[7] = { ...wrongP1Version[7]!, p1Version: null }
expectProviderCode('P1_VERSION_INVALIDA', () => prepareConciliarBankFeeBatchRows(input, ACTOR, wrongP1Version))

expectProviderCode('ACTOR_NO_AUTORIZADO', () => prepareConciliarBankFeeBatchRows(input, 0, sources))

const duplicateInput: ConciliarBankFeeBatchInput = { ...input, items: [...input.items.slice(0, 19), { ...input.items[18]!, rowId: 'fila-duplicada', idempotencyKey: key(99) }] }
expectProviderCode('FEE_BATCH_INVALIDO', () => prepareConciliarBankFeeBatchRows(duplicateInput, ACTOR, sources))

console.log('conciliar bank-fee batch synthetic test: ok')
