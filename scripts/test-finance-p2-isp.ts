import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ISP_FACTURACION_LIMIT,
  createIspIssuedInvoiceProvider,
  createIspIssuedInvoiceProviderForStage,
  normalizeIspInvoice,
  parseExactCents,
  snapshotInvoiceSource,
} from '../lib/finanzas/sync-jobs/providers/isp/isp-issued-invoice-provider'
import type { SyncSourceItem } from '../lib/finanzas/sync-jobs/types'

const valid = (overrides: Record<string, unknown> = {}): SyncSourceItem => ({
  key: 'isp-factura:17',
  tipo: 'ISP_FACTURA',
  data: {
    id: '17',
    serie_factura: 'CLL',
    numero_documento: 'CLL26/17',
    fecha: '2026-10-22',
    id_cliente: '9',
    codigo_cliente: 'C-9',
    nombrecompleto: 'Cliente de prueba',
    nif_cif: 'B12345678',
    documento: 'Servicio octubre',
    base: '100.00',
    total_impuesto: '21.00',
    total: '121.00',
    // Deliberately hostile/out-of-scope fields: no normalised item can retain them.
    situacion: 'COBRADA',
    total_pendiente: '0.00',
    iban: 'ES00-DO-NOT-KEEP',
    remesa_ref: 'R-DO-NOT-KEEP',
    movimiento_bancario: 'B-DO-NOT-KEEP',
    ...overrides,
  },
})

const codeOf = (fn: () => unknown): string => {
  try { fn() } catch (error) { return (error as { code: string }).code }
  throw new Error('Se esperaba un error')
}

test('exact cents retain the external signed value and reject residues/Int overflow', () => {
  assert.equal(parseExactCents('-12.34', 'x'), -1234)
  assert.equal(parseExactCents('0.01', 'x'), 1)
  assert.equal(codeOf(() => parseExactCents('1.001', 'x')), 'CENTIMOS_NO_EXACTOS')
  assert.equal(codeOf(() => parseExactCents('21474836.48', 'x')), 'CENTIMOS_FUERA_DE_RANGO')
  assert.equal(codeOf(() => normalizeIspInvoice(valid({ total: '121.01' }))), 'TOTAL_NO_CIERRA')
})

test('normalization accepts no bank/payment field and no fallback date or IVA', () => {
  const normalized = normalizeIspInvoice(valid())
  assert.equal(normalized.totalCents, 12100)
  assert.equal(normalized.tipoIva, 21)
  assert.deepEqual(Object.keys(normalized.source).sort(), [
    'base', 'codigo_cliente', 'documento', 'fecha', 'id', 'id_cliente',
    'nif_cif', 'nombrecompleto', 'numero_documento', 'serie_factura', 'total', 'total_impuesto',
  ])
  assert.equal('iban' in normalized.source, false)
  assert.equal(codeOf(() => normalizeIspInvoice(valid({ fecha: undefined }))), 'FECHA_INVALIDA')
  assert.equal(codeOf(() => normalizeIspInvoice(valid({ fecha: '2026-02-30' }))), 'FECHA_INVALIDA')
  assert.equal(codeOf(() => normalizeIspInvoice(valid({ base: undefined }))), 'CENTIMOS_NO_EXACTOS')
})

test('projection ignores payment and bank fields even when API adds them', () => {
  const projection = snapshotInvoiceSource(valid().data)
  assert.equal('situacion' in projection, false)
  assert.equal('total_pendiente' in projection, false)
  assert.equal('iban' in projection, false)
  assert.equal('remesa_ref' in projection, false)
  assert.equal('movimiento_bancario' in projection, false)
})

test('inventory uses exactly existing GET facturacion mostrar=5000 and fails closed at its unproven pagination boundary', async () => {
  const calls: unknown[] = []
  const provider = createIspIssuedInvoiceProvider({
    request: async (endpoint, method, data, params) => {
      calls.push({ endpoint, method, data, params })
      return [valid().data]
    },
  })
  const result = await provider.inventory({ prior: 'checkpoint' })
  assert.equal(result.complete, true)
  assert.equal(result.items.length, 1)
  assert.deepEqual(calls, [{ endpoint: 'facturacion', method: 'GET', data: null, params: { mostrar: ISP_FACTURACION_LIMIT } }])

  const truncated = createIspIssuedInvoiceProvider({
    request: async () => Array.from({ length: ISP_FACTURACION_LIMIT }, (_, index) => ({ ...valid().data as object, id: String(index + 1) })),
  })
  const stopped = await truncated.inventory({ prior: 'do-not-advance' })
  assert.equal(stopped.complete, false)
  assert.deepEqual(stopped.items, [])
  assert.deepEqual(stopped.checkpoint, {
    version: 'ISP_FACTURA_P2_V1', mode: 'TRUNCATED_FAIL_CLOSED', previous: { prior: 'do-not-advance' },
  })
})

test('stage stub performs no real request and invalid financial source returns terminal ERROR', async () => {
  const provider = createIspIssuedInvoiceProviderForStage([valid({ total: '121.001' }).data])
  const inventory = await provider.inventory(null)
  const prepared = await provider.prepare(inventory.items[0]) as { kind: string; reason?: string }
  assert.equal(prepared.kind, 'ERROR')
  assert.equal(prepared.reason, 'CENTIMOS_NO_EXACTOS')
  // apply has no need to touch a DB for terminal malformed-source error.
  assert.equal(await provider.apply({} as never, inventory.items[0], prepared, null), 'ERROR')
})
