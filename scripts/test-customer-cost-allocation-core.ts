import assert from 'node:assert/strict'
import {
  allocationPayloadHash,
  apportionCostLargestRemainder,
  assertClassificationForCost,
  currentUtcPeriod,
  normalizedTwelfthCents,
  parseAllocationPreparationRequest,
  parseAllocationRequest,
  type ValidContractSale,
} from '@/lib/finanzas/customer-cost-allocation-core'

const b = BigInt

function sale(clienteId: number, contratoId: number, cents: bigint, units: 1 | 3 | 12 = 1): ValidContractSale {
  return {
    clienteId, clienteNombre: `Cliente ${clienteId}`, contratoId, contratoTitulo: `Contrato ${contratoId}`,
    ventaPeriodoCentimos: cents, unidadesPeriodoMeses: units,
    ventaNormalizadaDoceavosCentimo: normalizedTwelfthCents(cents, units), snapshot: {},
  }
}

// User acceptance example: 10 contracts × 100 plus 1 contract × 50 => weights 1000/1050 and 50/1050.
const tenContracts = Array.from({ length: 10 }, (_, index) => sale(1, index + 1, b(10000)))
const example = apportionCostLargestRemainder(b(1050), [...tenContracts, sale(2, 99, b(5000))])
assert.deepEqual(example.map(line => [line.clienteId, line.costeCentimos]), [[1, b(1000)], [2, b(50)]])
assert.equal(example.reduce((sum, line) => sum + line.costeCentimos, b(0)), b(1050))
assert.equal(Object.isFrozen(example), true)
assert.equal(Object.isFrozen(example[0]), true)
assert.equal(Object.isFrozen(example[0].contratoIds), true)

// A 1-cent residual is deterministic: tie breaks by clienteId ascendente.
const residual = apportionCostLargestRemainder(b(1), [sale(9, 9, b(100)), sale(2, 2, b(100))])
assert.deepEqual(residual.map(line => [line.clienteId, line.costeCentimos]), [[2, b(1)], [9, b(0)]])
assert.equal(residual.reduce((sum, line) => sum + line.costeCentimos, b(0)), b(1))

// Annual and quarterly verified units normalise exactly to the same monthly weight.
assert.equal(normalizedTwelfthCents(b(120000), 12), normalizedTwelfthCents(b(10000), 1))
assert.equal(normalizedTwelfthCents(b(30000), 3), normalizedTwelfthCents(b(10000), 1))

// Negative cost can only be explicitly mapped; the sign and exact closure persist.
assert.throws(() => assertClassificationForCost('REPARTIBLE', b(-1)), /abono/i)
assert.doesNotThrow(() => assertClassificationForCost('ABONO_EXPLICITO', b(-1)))
const credit = apportionCostLargestRemainder(b(-3), [sale(1, 1, b(100)), sale(2, 2, b(100))])
assert.equal(credit.reduce((sum, line) => sum + line.costeCentimos, b(0)), b(-3))

const sourceId = '11111111-1111-4111-8111-111111111111'
const request = parseAllocationRequest({
  action: 'preview', fuenteId: sourceId, sourceVersion: 1,
  invoiceSnapshotHash: 'a'.repeat(64), periodoServicio: '2026-10', clasificacion: 'REPARTIBLE',
  selecciones: [{ clienteId: 1, contratoId: 12 }],
})
assert.equal(request.reversionDeRepartoId, undefined)
assert.throws(() => parseAllocationRequest({ ...request, unexpected: true }), /claves fuera/i)
assert.throws(() => parseAllocationRequest({ ...request, clasificacion: 'PUNTUAL', selecciones: [{ clienteId: 1, contratoId: 12 }] }), /puntual/i)
assert.throws(() => parseAllocationRequest({ ...request, action: 'confirm' }), /idempotencyKey/i)
assert.doesNotThrow(() => parseAllocationRequest({ ...request, action: 'preview', clasificacion: 'PUNTUAL', selecciones: [] }))
assert.throws(() => parseAllocationPreparationRequest({ action: 'prepare', facturaId: sourceId, invoiceSnapshotHash: 'a'.repeat(64), confirmarPreparacion: false }), /confirma/i)
assert.deepEqual(parseAllocationPreparationRequest({ action: 'prepare', facturaId: sourceId, invoiceSnapshotHash: 'a'.repeat(64), confirmarPreparacion: true }), {
  action: 'prepare', facturaId: sourceId, invoiceSnapshotHash: 'a'.repeat(64), confirmarPreparacion: true,
})
assert.equal(currentUtcPeriod(new Date('2026-10-24T23:59:59.999Z')), '2026-10')

// A replay compares the semantic decision, not transport action/key metadata.
const confirmation = parseAllocationRequest({
  ...request, action: 'confirm', idempotencyKey: '22222222-2222-4222-8222-222222222222',
})
const sameDecisionOtherKey = parseAllocationRequest({
  ...confirmation, idempotencyKey: '33333333-3333-4333-8333-333333333333',
})
assert.equal(allocationPayloadHash(confirmation), allocationPayloadHash(sameDecisionOtherKey))
assert.notEqual(allocationPayloadHash(confirmation), allocationPayloadHash({ ...confirmation, sourceVersion: 2 }))
assert.throws(() => assertClassificationForCost('PUNTUAL', b(-1)), /abono/i)

console.log('customer-cost-allocation-core: OK')
