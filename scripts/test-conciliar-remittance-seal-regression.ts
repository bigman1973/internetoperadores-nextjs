/* C4 remittance seal regression: pure synthetic fixtures; no DB, Prisma, network, or writes. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { remittanceSealForProposal } from '../lib/finanzas/remittance-payment-receipts-db'
import { documentaryRemittanceSourceMatchesCanonicalFI, persistedImportedRemittanceCompositionMatchesCurrentFI } from '../lib/finanzas/remittance-documentary-source-core'

const COUNT = 167
const REMITTANCE_ID = 71
const PROPOSAL_ID = '99999999-9999-4999-8999-999999999999'
const FINGERPRINT = 'a'.repeat(64)

function fi(index: number): string {
  const value = index.toString(16)
  return `${value.padStart(8, '0')}-0000-4000-8000-${value.padStart(12, '0')}`
}

function composition() {
  return Array.from({ length: COUNT }, (_, offset) => ({
    facturaEmitidaId: fi(offset + 1),
    numFactura: `SYN-${offset + 1}`,
    cliente: `Cliente sintético ${offset + 1}`,
    importeCentimos: 100,
    vencimiento: '2026-06-01',
  }))
}

function proposal(rawComposition: unknown = composition()) {
  return {
    propuestaId: PROPOSAL_ID,
    movimientoId: 'synthetic-remittance-movement',
    fingerprint: FINGERPRINT,
    metodo: 'REMESA_VENCIMIENTO',
    importeMovimientoCentimos: COUNT * 100,
    lineas: [{ tipo: 'DOCUMENTO', tipoDocumento: 'REMESA', sourceId: String(REMITTANCE_ID), importeCentimos: COUNT * 100 }],
    composicion: rawComposition,
  }
}

function seal(raw = proposal()) {
  return remittanceSealForProposal(raw)
}

function documentaryInvoice(index: number) {
  return {
    facturaEmitidaId: fi(index),
    numeroFactura: `SYN-${index}`,
    cliente: `Cliente sintético ${index}`,
    importeCentimos: 100,
    fechaFactura: '2026-06-01',
  }
}

function documentarySource() {
  const canonicalInvoices = Array.from({ length: COUNT }, (_, offset) => documentaryInvoice(offset + 1))
  return {
    receipts: canonicalInvoices.map(({ numeroFactura, cliente, importeCentimos, fechaFactura }) => ({ numeroFactura, cliente, importeCentimos, fechaFactura })),
    canonicalInvoices,
    composition: canonicalInvoices.map(invoice => ({ facturaEmitidaId: invoice.facturaEmitidaId, importeCentimos: invoice.importeCentimos })),
    importeBancoCentimos: COUNT * 100,
  }
}

function persistedImporterSource() {
  const canonicalInvoices = Array.from({ length: COUNT }, (_, offset) => documentaryInvoice(offset + 1))
  return {
    composition: canonicalInvoices.map(invoice => ({
      facturaEmitidaId: invoice.facturaEmitidaId, numeroFactura: invoice.numeroFactura, cliente: invoice.cliente,
      importeCentimos: invoice.importeCentimos, fechaFactura: invoice.fechaFactura,
    })),
    canonicalInvoices,
    importeBancoCentimos: COUNT * 100,
  }
}

test('C4: una composición importada de 167 filas sólo supera el sello si coincide con las FI vigentes', () => {
  const row = proposal()
  const remesaSeal = seal(row)
  assert.ok(remesaSeal, 'la forma persistida de la propuesta sintética debe ser sellable')
  assert.equal(remesaSeal.remesaId, REMITTANCE_ID)
  assert.equal(persistedImportedRemittanceCompositionMatchesCurrentFI(persistedImporterSource()), true)
})

test('C4: el sello no permite composición repetida, sin FI o con suma distinta', () => {
  const sumMismatch = composition()
  sumMismatch[0] = { ...sumMismatch[0]!, importeCentimos: 99 }
  const duplicate = composition()
  duplicate[COUNT - 1] = { ...duplicate[COUNT - 1]!, facturaEmitidaId: fi(1) }
  const noFi = composition()
  noFi[0] = { ...noFi[0]!, facturaEmitidaId: '' }

  for (const raw of [sumMismatch, duplicate]) {
    const row = proposal(raw)
    const remesaSeal = seal(row)
    assert.ok(remesaSeal, 'la prueba separa el sello de forma de la validación de composición')
    assert.equal(persistedImportedRemittanceCompositionMatchesCurrentFI({
      ...persistedImporterSource(),
      composition: raw.map(item => ({ ...item, numeroFactura: item.numFactura, fechaFactura: item.vencimiento })),
    }), false)
  }
  const noFiProposal = proposal(noFi)
  assert.equal(seal(noFiProposal), null, 'sin FI explícita no existe sello que pueda promover la propuesta')
  assert.equal(persistedImportedRemittanceCompositionMatchesCurrentFI({
    ...persistedImporterSource(),
    composition: noFi.map(item => ({ ...item, numeroFactura: item.numFactura, fechaFactura: item.vencimiento })),
  }), false)
})

test('C4: la compatibilidad importada exige FI actuales completas y únicas', () => {
  const source = persistedImporterSource()
  assert.equal(persistedImportedRemittanceCompositionMatchesCurrentFI({ ...source, canonicalInvoices: source.canonicalInvoices.slice(0, -1) }), false)
  assert.equal(persistedImportedRemittanceCompositionMatchesCurrentFI({ ...source, canonicalInvoices: [...source.canonicalInvoices, source.canonicalInvoices[0]!] }), false)
})

test('C4: la compatibilidad importada rechaza número, nominal, cliente o fecha que ya no coincidan', () => {
  const source = persistedImporterSource()
  for (const composition of [
    [{ ...source.composition[0]!, numeroFactura: 'SYN-OTRA' }, ...source.composition.slice(1)],
    [{ ...source.composition[0]!, importeCentimos: 101 }, ...source.composition.slice(1)],
    [{ ...source.composition[0]!, cliente: 'Cliente distinto' }, ...source.composition.slice(1)],
    [{ ...source.composition[0]!, fechaFactura: '2026-06-02' }, ...source.composition.slice(1)],
  ]) {
    assert.equal(persistedImportedRemittanceCompositionMatchesCurrentFI({ ...source, composition }), false)
  }
})

test('C4: una lista documental independiente sólo acredita las 167 FI si es completa y de identidad única', () => {
  const source = documentarySource()
  assert.equal(documentaryRemittanceSourceMatchesCanonicalFI(source), true)
})

test('C4: una lista documental vacía, parcial o que reutiliza una FI nunca puede sustituir la fuente completa', () => {
  const source = documentarySource()
  assert.equal(documentaryRemittanceSourceMatchesCanonicalFI({ ...source, receipts: [] }), false)
  assert.equal(documentaryRemittanceSourceMatchesCanonicalFI({ ...source, receipts: source.receipts.slice(0, -1) }), false)
  const reused = [...source.receipts]
  reused[COUNT - 1] = { ...reused[0]! }
  assert.equal(documentaryRemittanceSourceMatchesCanonicalFI({ ...source, receipts: reused }), false)
})

test('C4: no se inventa una identidad FI cuando el número, nominal o cliente documental no coincide exactamente', () => {
  const source = documentarySource()
  for (const receipts of [
    [{ ...source.receipts[0]!, numeroFactura: 'SYN-OTRA' }, ...source.receipts.slice(1)],
    [{ ...source.receipts[0]!, importeCentimos: 101 }, ...source.receipts.slice(1)],
    [{ ...source.receipts[0]!, cliente: 'Cliente distinto' }, ...source.receipts.slice(1)],
  ]) {
    assert.equal(documentaryRemittanceSourceMatchesCanonicalFI({ ...source, receipts }), false)
  }
})

console.log('C4: sello de remesa e importador persistido revalidado con fixtures sintéticas.')
