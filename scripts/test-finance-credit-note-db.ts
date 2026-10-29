import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  creditNoteReadSql,
  readIssuedCreditNotesForBankInvoicing,
} from '../lib/finanzas/finance-credit-note-db'
import type { InvoiceSettlement } from '../lib/finanzas/bank-invoicing-core'
import { readBankInvoicing } from '../lib/finanzas/bank-invoicing-db'

const referenceHash = (reference: string) => createHash('sha256').update(reference, 'utf8').digest('hex')
const sourceIdentity = (source: string, sourceItemKey: string) => `${source}:${sourceItemKey}`

function directB4() {
  return [{
    evidenceId: 'vinculo-b4-sintetico', originalDocumentId: 'fi-original', signedCents: 3_000, wrapperTargetCents: 10_000,
    active: true, documentActive: true, documentKind: 'FACTURA_EMITIDA', operationApplied: true, operationReverted: false,
    movementJustified: true, physicalBankCents: 3_000, sumAllActiveCents: 3_000, activeDocumentLineCount: 1,
    allActiveLinesApplied: true,
  }]
}

function b7Invoice(): InvoiceSettlement {
  return {
    invoiceId: 'fi-original', numFactura: 'SER-SINT-001', cliente: 'cliente-sintetico', fechaISO: '2026-10-01', fechaVencimientoISO: null,
    facturaISPId: null, targetCents: 10_000, paidDocumentaryCents: 3_000, remainingCents: 7_000,
    cashCents: null, attributableCashDifferenceCents: null, paymentSources: ['B4_DIRECTO'], paymentState: 'PENDIENTE_COBRO', reasons: [],
  }
}

function documents() {
  return [
    {
      documentId: 'fi-original', source: 'ONEDRIVE', sourceItemKey: 'drive-sintetico:item-original', lifecycleState: 'ACTIVE', sourceMetadataExact: true,
      currentVersionId: 'version-original', documentReference: 'SER-SINT-001', referencedOriginalReference: null,
      counterpartyFiscalIdentity: 'FISCAL-SINTETICO', counterpartyCanonicalIdentity: 'cliente-sintetico', signedTotalCents: 10_000,
      currencyCode: 'EUR', partyRole: 'CLIENTE', documentClass: 'FACTURA_EMITIDA',
    },
    {
      documentId: 'fi-rectificativa', source: 'ONEDRIVE', sourceItemKey: 'drive-sintetico:item-rectificativa', lifecycleState: 'ACTIVE', sourceMetadataExact: true,
      currentVersionId: 'version-rectificativa', documentReference: 'RECT-SINT-001', referencedOriginalReference: 'SER-SINT-001',
      counterpartyFiscalIdentity: 'FISCAL-SINTETICO', counterpartyCanonicalIdentity: 'cliente-sintetico', signedTotalCents: -2_000,
      currencyCode: 'EUR', partyRole: 'CLIENTE', documentClass: 'FACTURA_RECTIFICATIVA',
    },
  ]
}

function link(current: boolean) {
  return [{
    linkId: 'link-sintetico', originalDocumentId: 'fi-original', creditNoteDocumentId: 'fi-rectificativa',
    originalVersionId: 'version-original', creditNoteVersionId: 'version-rectificativa',
    originalCanonicalIdentity: sourceIdentity('ONEDRIVE', 'drive-sintetico:item-original'),
    creditNoteCanonicalIdentity: sourceIdentity('ONEDRIVE', 'drive-sintetico:item-rectificativa'),
    originalDocumentReference: 'SER-SINT-001', referencedOriginalReference: 'SER-SINT-001',
    exactReferenceHash: referenceHash('SER-SINT-001'), counterpartyFiscalIdentity: 'FISCAL-SINTETICO',
    counterpartyCanonicalIdentity: 'cliente-sintetico', current, deleted: false,
  }]
}

function mockDb(linkRows: unknown[]) {
  const statements: string[] = []
  return {
    statements,
    db: {
      async $queryRawUnsafe<T>(statement: string): Promise<T> {
        statements.push(statement)
        assert.match(statement, /^\s*SELECT\b/i, '3c sólo admite SQL SELECT')
        if (statement.includes("information_schema.tables")) return [{ tableName: null }] as T
        if (statement.includes('FROM document_version_lifecycle l\n  JOIN document_version_snapshots s')) return documents() as T
        if (statement.includes('FROM document_version_credit_links cl')) return linkRows as T
        if (statement.includes('AS "evidenceId"')) return directB4() as T
        throw new Error('SQL mock de rectificativas no reconocido')
      },
    },
  }
}

test('enlace CONFIRMED humano, vigente y exacto descuenta sólo en vista B7 sin modificar B4', async () => {
  const fixture = mockDb(link(true))
  const rows = await readIssuedCreditNotesForBankInvoicing(fixture.db, { invoices: [b7Invoice()], directB4Lines: directB4().map((row) => ({
    lineId: row.evidenceId, movementId: 'movimiento-sintetico', invoiceId: row.originalDocumentId, signedCents: row.signedCents,
    active: row.active, documentActive: row.documentActive, documentKind: 'FACTURA_EMITIDA', wrapperTargetCents: row.wrapperTargetCents,
    operationApplied: row.operationApplied, operationReverted: row.operationReverted, movementJustified: row.movementJustified,
    physicalBankCents: row.physicalBankCents, sumAllActiveCents: row.sumAllActiveCents,
    activeDocumentLineCount: row.activeDocumentLineCount, allActiveLinesApplied: row.allActiveLinesApplied,
  })) })
  assert.equal(rows.length, 1)
  assert.deepEqual(
    [rows[0].creditNoteState, rows[0].rectificationCents, rows[0].remainingAfterCreditNotesCents, rows[0].paidDocumentaryCents],
    ['PARCIAL', 2_000, 5_000, 3_000],
  )
  assert.equal(rows[0].remainingCents, 7_000, 'B7 no se reescribe')
  assert.equal(fixture.statements.length, 3)
  assert.ok(fixture.statements.every((statement) => statement.includes("information_schema.tables") || /LIMIT 25001 OFFSET 0/.test(statement)))
  assert.ok(fixture.statements.every((statement) => !/\b(?:INSERT|UPDATE|DELETE|MERGE|CALL)\b/i.test(statement)))
})

test('enlace PROPOSED conserva auditoría y obliga revisión: no crea CONFIRMED ni crédito automático', async () => {
  const fixture = mockDb(link(false))
  const [row] = await readIssuedCreditNotesForBankInvoicing(fixture.db, { invoices: [b7Invoice()], directB4Lines: [] })
  assert.deepEqual(
    [row.creditNoteState, row.rectificationCents, row.remainingAfterCreditNotesCents, row.paidDocumentaryCents],
    ['REVISION', null, null, 3_000],
  )
  assert.ok(row.creditNoteReviewReasons.includes('ENLACE_RECTIFICATIVA_NO_VIGENTE_O_BORRADO'))
  assert.ok(fixture.statements.some((statement) => statement.includes("cl.state = 'CONFIRMED'")))
  assert.ok(fixture.statements.some((statement) => statement.includes('cl.confirmed_by_id IS NOT NULL')))
  assert.doesNotMatch(creditNoteReadSql.issuedLinks, /\b(?:INSERT|UPDATE|DELETE|MERGE)\b/i)
})

test('la forma de lectura exige identidad literal, snapshots vigentes y no usa búsqueda aproximada', () => {
  assert.match(creditNoteReadSql.issuedDocuments, /s\.document_number = fe\.num_factura/)
  assert.match(creditNoteReadSql.issuedDocuments, /s\.total_cents = b4_importe_bancario_centimos\(fe\.total\)/)
  assert.match(creditNoteReadSql.issuedDocuments, /l\.source = 'ONEDRIVE'/)
  assert.match(creditNoteReadSql.issuedDocuments, /source_item_key ~ '\^\[A-Za-z0-9!_\.~-\]\{4,220\}:\[A-Za-z0-9!_\.~-\]\{4,220\}\$'/)
  assert.doesNotMatch(creditNoteReadSql.issuedDocuments, /onedrive:/i)
  assert.match(creditNoteReadSql.issuedDocuments, /document_version_tombstones/)
  assert.match(creditNoteReadSql.issuedDocuments, /document_version_incidents/)
  assert.match(creditNoteReadSql.issuedLinks, /exact_reference_hash/)
  assert.match(creditNoteReadSql.issuedLinks, /confirmed_by_id IS NOT NULL/)
  assert.doesNotMatch(creditNoteReadSql.issuedDocuments, /ILIKE|similarity|levenshtein|\bABS\s*\(/i)
  assert.doesNotMatch(creditNoteReadSql.issuedLinks, /ILIKE|similarity|levenshtein|\bABS\s*\(/i)
})

test('B7 cablea la vista 3c sobre la población completa sin reescribir saldo, pago ni resumen', async () => {
  const statements: string[] = []
  const db = {
    async $queryRawUnsafe<T>(statement: string): Promise<T> {
      statements.push(statement)
      assert.match(statement, /^\s*(?:SELECT|WITH)\b/i, 'el cableado B7/3c sólo lee')
      if (statement.includes("information_schema.tables")) return [{ tableName: null }] as T
      if (statement.includes('FROM document_version_lifecycle l\n  JOIN document_version_snapshots s')) return documents() as T
      if (statement.includes('FROM document_version_credit_links cl')) return link(true) as T
      if (statement.includes('FROM facturas_emitidas fe')) return [{
        id: 'fi-original', sourceTotalText: '100.00', b2Economic: true, numFactura: 'SER-SINT-001', cliente: 'cliente-sintetico',
        fechaISO: '2026-10-01', fechaVencimientoISO: null, facturaISPId: null,
      }] as T
      if (statement.includes("d.tipo = 'FACTURA_EMITIDA'")) return [{
        lineId: 'b4-real-sintetico', movementId: 'mov-real-sintetico', invoiceId: 'fi-original', signedCents: 3_000,
        active: true, documentActive: true, documentKind: 'FACTURA_EMITIDA', wrapperTargetCents: 10_000,
        operationApplied: true, operationReverted: false, movementJustified: true,
        physicalBankCents: 3_000, sumAllActiveCents: 3_000, activeDocumentLineCount: 1, allActiveLinesApplied: true,
      }] as T
      if (statement.includes('FROM cuentas_bancarias')) return [{ activeAccountCount: 0, accountsWithKnownCutoff: 0, minimumCutoff: null }] as T
      return [] as T
    },
  }
  const dto = await readBankInvoicing(db, { enabled: true, assertIsolatedStaging: async () => {} }, new URLSearchParams('limit=1'))
  const [row] = dto.items
  assert.deepEqual(
    [row.targetCents, row.paidDocumentaryCents, row.remainingCents, row.creditNoteState, row.rectificationCents, row.remainingAfterCreditNotesCents],
    [10_000, 3_000, 7_000, 'PARCIAL', 2_000, 5_000],
  )
  assert.deepEqual(
    [dto.summary.facturado.cents, dto.summary.cobroDocumentalConfirmado.cents, dto.summary.pendienteNoConfirmado.cents],
    [10_000, 3_000, 7_000],
  )
  assert.equal(statements.filter((statement) => statement.includes('FROM document_version_lifecycle')).length, 1)
  assert.ok(statements.every((statement) => !/\b(?:INSERT|UPDATE|DELETE|MERGE)\b/i.test(statement)))
})

test('ledger humano disponible proyecta su estado efectivo sin reescribir B7', async () => {
  const statements: string[] = []
  const db = {
    async $queryRawUnsafe<T>(statement: string): Promise<T> {
      statements.push(statement)
      assert.match(statement, /^\s*SELECT\b/i)
      if (statement.includes('information_schema.tables')) return [{ tableName: 'document_version_credit_link_decisions' }] as T
      if (statement.includes('FROM document_version_lifecycle l\n  JOIN document_version_snapshots s')) return documents() as T
      if (statement.includes('FROM document_version_credit_links cl')) return link(true) as T
      throw new Error('SQL mock de ledger efectivo no reconocido')
    },
  }
  const [row] = await readIssuedCreditNotesForBankInvoicing(db, { invoices: [b7Invoice()], directB4Lines: directB4().map((evidence) => ({
    lineId: evidence.evidenceId, movementId: 'movimiento-sintetico', invoiceId: evidence.originalDocumentId, signedCents: evidence.signedCents,
    active: true, documentActive: true, documentKind: 'FACTURA_EMITIDA', wrapperTargetCents: evidence.wrapperTargetCents,
    operationApplied: true, operationReverted: false, movementJustified: true, physicalBankCents: evidence.physicalBankCents,
    sumAllActiveCents: evidence.sumAllActiveCents, activeDocumentLineCount: evidence.activeDocumentLineCount, allActiveLinesApplied: true,
  })) })
  assert.equal(row.remainingCents, 7_000)
  assert.deepEqual([row.creditNoteState, row.rectificationCents, row.remainingAfterCreditNotesCents], ['PARCIAL', 2_000, 5_000])
  const effective = statements.find((statement) => statement.includes('FROM document_version_credit_links cl')) ?? ''
  assert.match(effective, /d\.effective_state::text/)
  assert.match(effective, /NOT EXISTS \(SELECT 1 FROM document_version_credit_link_decisions/)
  assert.doesNotMatch(effective, /\b(?:INSERT|UPDATE|DELETE|MERGE|CALL)\b/i)
})
