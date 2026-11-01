/* G3 histórico: fixtures puras; sin Prisma, BD, red, build ni tsc. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyG3HistoricalProviderEvidence,
  type G3HistoricalProviderSource,
} from '../lib/finanzas/conciliar-g3-historical-evidence'
import {
  G3_HISTORICAL_PROVIDER_READ_SQL,
  readG3HistoricalProviderEvidence,
  type G3HistoricalReadonlyReader,
} from './areas/conciliar/g3-historical-reader'

const CONCEPTO_REAL = 'TRASPAS A BUTPO 2000, S.L. FACTURA F260009'
const FACTURA_REAL = 'F260009'
const PROVEEDOR_REAL = 'BUTPO 2000, S.L.'

function source(overrides: Partial<G3HistoricalProviderSource> = {}): G3HistoricalProviderSource {
  return {
    movementKey: 'opaque-historic-movement', invoiceKey: 'opaque-historic-invoice',
    bankDate: '2026-09-04', bankCents: -102_000, bankText: CONCEPTO_REAL, bankReference: null,
    supplier: PROVEEDOR_REAL, invoiceReference: FACTURA_REAL, invoiceDate: '2026-09-01', invoiceCents: 102_000,
    linkCents: -102_000, linkActive: true, documentActive: true, documentKind: 'FACTURA_RECIBIDA',
    operationState: 'APLICADA', operationReverted: false, movementState: 'JUSTIFICADO', movementVersion: 2,
    controlledFile: true, absentFromCurrentProjection: true,
    ...overrides,
  }
}

function sqlRow(overrides: Record<string, unknown> = {}) {
  return {
    movementKey: 'opaque-historic-movement', invoiceKey: 'opaque-historic-invoice', bankDate: '2026-09-04',
    bankCents: -102_000, bankText: CONCEPTO_REAL, bankReference: null, supplier: PROVEEDOR_REAL,
    invoiceReference: FACTURA_REAL, invoiceDate: '2026-09-01', invoiceTotalText: '1020.00', linkCents: -102_000,
    linkActive: true, documentActive: true, documentKind: 'FACTURA_RECIBIDA', operationState: 'APLICADA',
    operationReverted: false, movementState: 'JUSTIFICADO', movementVersion: 2,
    oneDriveDriveId: 'drive-test-260009', oneDriveItemId: 'item-test-260009', archivoOneDrive: null,
    absentFromCurrentProjection: true,
    ...overrides,
  }
}

test('G3 histórico clasifica concepto y factura reales con el núcleo original y conserva el proveedor documental en REVIEW_ONLY', () => {
  const evidence = classifyG3HistoricalProviderEvidence(source())
  assert.deepEqual(evidence, {
    schema: 'G3_HISTORICAL_PROVIDER_EVIDENCE_V1', source: 'READ_ONLY_B4',
    referenceExact: true, amountExact: true, invoiceDateCoherent: true, activeB4Evidence: true,
    controlledFile: true, absentFromCurrentProjection: true,
    providerMode: 'DOCUMENTARY_REVIEW_ONLY', classifierKind: 'REVIEW', classifierReason: 'PROVEEDOR_SOLO_DOCUMENTAL',
  })
})

test('G3 histórico falla cerrado si se altera número, proveedor o importe reales', () => {
  assert.equal(classifyG3HistoricalProviderEvidence(source({ invoiceReference: 'F260019' })), null)
  assert.equal(classifyG3HistoricalProviderEvidence(source({ supplier: 'OTRO PROVEEDOR, S.L.' })), null)
  assert.equal(classifyG3HistoricalProviderEvidence(source({ invoiceCents: 102_001 })), null)
})

test('G3 histórico exige prueba B4 controlada, activa y ausente de proyección actual', () => {
  assert.equal(classifyG3HistoricalProviderEvidence(source({ controlledFile: false })), null)
  assert.equal(classifyG3HistoricalProviderEvidence(source({ linkActive: false })), null)
  assert.equal(classifyG3HistoricalProviderEvidence(source({ documentActive: false })), null)
  assert.equal(classifyG3HistoricalProviderEvidence(source({ operationState: 'PENDIENTE_APROBACION' })), null)
  assert.equal(classifyG3HistoricalProviderEvidence(source({ operationReverted: true })), null)
  assert.equal(classifyG3HistoricalProviderEvidence(source({ absentFromCurrentProjection: false })), null)
})

test('lector G3 ejecuta un único SELECT LIMITado con selector opaco y no tolera duplicados', async () => {
  let calls = 0
  const reader: G3HistoricalReadonlyReader = {
    query: async <T extends Record<string, unknown>>(sql: string, values?: readonly unknown[]) => {
      calls += 1
      assert.equal(sql, G3_HISTORICAL_PROVIDER_READ_SQL)
      assert.deepEqual(values, ['opaque-historic-movement', 'opaque-historic-invoice'])
      return [sqlRow()] as unknown as T[]
    },
  }
  assert.match(G3_HISTORICAL_PROVIDER_READ_SQL.trim(), /^SELECT\b/i)
  assert.match(G3_HISTORICAL_PROVIDER_READ_SQL, /LIMIT 2\s*$/)
  assert.doesNotMatch(G3_HISTORICAL_PROVIDER_READ_SQL, /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|FOR\s+UPDATE)\b/i)
  const evidence = await readG3HistoricalProviderEvidence(reader, { movementId: 'opaque-historic-movement', invoiceId: 'opaque-historic-invoice' })
  assert.equal(evidence?.providerMode, 'DOCUMENTARY_REVIEW_ONLY')
  assert.equal(calls, 1)

  const duplicate: G3HistoricalReadonlyReader = { query: async <T extends Record<string, unknown>>() => [sqlRow(), sqlRow()] as unknown as T[] }
  assert.equal(await readG3HistoricalProviderEvidence(duplicate, { movementId: 'opaque-historic-movement', invoiceId: 'opaque-historic-invoice' }), null)
  assert.equal(await readG3HistoricalProviderEvidence(reader, undefined), null)
  assert.equal(calls, 1)
})

test('lector G3 rechaza total fraccionario: no redondea una factura a céntimos', async () => {
  const reader: G3HistoricalReadonlyReader = { query: async <T extends Record<string, unknown>>() => [sqlRow({ invoiceTotalText: '1020.001' })] as unknown as T[] }
  assert.equal(await readG3HistoricalProviderEvidence(reader, { movementId: 'opaque-historic-movement', invoiceId: 'opaque-historic-invoice' }), null)
})

console.log('OK: evidencia histórica G3 aislada, clasificador original REVIEW_ONLY y lector SELECT limitado verificados sin BD ni red.')
