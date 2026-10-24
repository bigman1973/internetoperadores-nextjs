import assert from 'node:assert/strict'
import {
  canOpenInvoiceCandidate,
  canChooseSource,
  confirmationPayloadJson,
  roundedWeightPercentageHundredths,
  sourceFromResponse,
} from '@/components/finanzas/customer-allocations/CustomerCostAllocationWorkspace'

const firstPayload = {
  action: 'confirm',
  fuenteId: '11111111-1111-4111-8111-111111111111',
  sourceVersion: 7,
  invoiceSnapshotHash: 'a'.repeat(64),
  periodoServicio: '2026-10',
  clasificacion: 'REPARTIBLE',
  selecciones: [{ clienteId: 10, contratoId: 100 }, { clienteId: 20, contratoId: 200 }],
  reversionDeRepartoId: null,
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
}

// The stored snapshot is what a retry sends: it is not rebuilt after any UI state changes.
const snapshot = confirmationPayloadJson(firstPayload)
assert.equal(snapshot, JSON.stringify(firstPayload))
assert.equal(snapshot, confirmationPayloadJson(JSON.parse(snapshot)))

// QA preview: sales of €100 and €50 allocate a €100 cost by 66.67% / 33.33% weights.
assert.equal(roundedWeightPercentageHundredths('10000', '15000'), '6667')
assert.equal(roundedWeightPercentageHundredths('5000', '15000'), '3333')
assert.equal(roundedWeightPercentageHundredths('0', '15000'), '0')
assert.equal(roundedWeightPercentageHundredths('100', '0'), null)

const source = { sourceId: firstPayload.fuenteId, facturaId: '33333333-3333-4333-8333-333333333333', proveedor: 'Proveedor de prueba', numFactura: 'TEST-1', fecha: '2026-10-01', base: 100, estado: 'REVISADO', version: 7, snapshotHash: 'a'.repeat(64), clasificacionActual: null, bloqueada: false, motivoBloqueo: null, situacion: 'APTA' }
assert.equal(canChooseSource(sourceFromResponse(source, 0)), true)
assert.equal(canChooseSource(sourceFromResponse({ ...source, sourceId: '11111111-1111-4111-111111111111' }, 0)), false)
assert.equal(canChooseSource(sourceFromResponse({ ...source, version: 0 }, 0)), false)
assert.equal(canChooseSource(sourceFromResponse({ ...source, bloqueada: true }, 0)), false)
const pending = sourceFromResponse({ ...source, sourceId: null, estado: 'SIN_FUENTE', version: 0, situacion: 'PENDIENTE_PREPARACION' }, 0)
assert.equal(canOpenInvoiceCandidate(pending), true, 'una factura válida pendiente se puede abrir para revisión humana')
assert.equal(canChooseSource(pending), false, 'una factura pendiente no puede repartir hasta prepararla')

console.log('customer-cost-allocation-workspace-ui: OK')
