import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  pendingCreditNoteReadSql,
  readReceivedCreditNotesForPendingInvoices,
} from '../lib/finanzas/finance-credit-note-pending-db'

const referenceHash = (reference: string) => createHash('sha256').update(reference, 'utf8').digest('hex')
const sourceIdentity = (source: string, sourceItemKey: string) => `${source}:${sourceItemKey}`

const receivedPending = {
  id: 'fr-original', tipo: 'FACTURA_RECIBIDA' as const,
  importeObjetivoCentimos: -10_000, importeAsignadoActivoCentimos: -3_000, importePendienteCentimos: -7_000,
}

function documents(currencyCode: string | null = 'EUR') {
  return [
    {
      documentId: 'fr-original', source: 'ONEDRIVE', sourceItemKey: 'drive-sintetico:item-original', lifecycleState: 'ACTIVE', sourceMetadataExact: true,
      currentVersionId: 'version-original', documentReference: 'PROV-SINT-001', referencedOriginalReference: null,
      counterpartyFiscalIdentity: 'FISCAL-PROVEEDOR-SINTETICO', counterpartyCanonicalIdentity: 'proveedor-sintetico', signedTotalCents: 10_000,
      currencyCode, partyRole: 'PROVEEDOR', documentClass: 'FACTURA_RECIBIDA',
    },
    {
      documentId: 'fr-rectificativa', source: 'ONEDRIVE', sourceItemKey: 'drive-sintetico:item-rectificativa', lifecycleState: 'ACTIVE', sourceMetadataExact: true,
      currentVersionId: 'version-rectificativa', documentReference: 'RECT-PROV-SINT-001', referencedOriginalReference: 'PROV-SINT-001',
      counterpartyFiscalIdentity: 'FISCAL-PROVEEDOR-SINTETICO', counterpartyCanonicalIdentity: 'proveedor-sintetico', signedTotalCents: -2_000,
      currencyCode, partyRole: 'PROVEEDOR', documentClass: 'FACTURA_RECTIFICATIVA',
    },
  ]
}

function link(current: boolean) {
  return [{
    linkId: 'link-sintetico', originalDocumentId: 'fr-original', creditNoteDocumentId: 'fr-rectificativa',
    originalVersionId: 'version-original', creditNoteVersionId: 'version-rectificativa',
    originalCanonicalIdentity: sourceIdentity('ONEDRIVE', 'drive-sintetico:item-original'),
    creditNoteCanonicalIdentity: sourceIdentity('ONEDRIVE', 'drive-sintetico:item-rectificativa'),
    originalDocumentReference: 'PROV-SINT-001', referencedOriginalReference: 'PROV-SINT-001',
    exactReferenceHash: referenceHash('PROV-SINT-001'), counterpartyFiscalIdentity: 'FISCAL-PROVEEDOR-SINTETICO',
    counterpartyCanonicalIdentity: 'proveedor-sintetico', current, deleted: false,
  }]
}

function b4() {
  return [{
    evidenceId: 'vinculo-b4-real-sintetico', originalDocumentId: 'fr-original', signedCents: -3_000,
    active: true, documentActive: true, operationApplied: true, operationReverted: false, movementJustified: true,
    wrapperTargetCents: -10_000, physicalBankCents: -3_000, sumAllActiveCents: -3_000,
    activeDocumentLineCount: 1, allActiveLinesApplied: true,
  }]
}

function mockDb(input: { documentRows?: unknown[]; linkRows?: unknown[]; b4Rows?: unknown[] } = {}) {
  const statements: string[] = []
  return {
    statements,
    db: {
      async $queryRawUnsafe<T>(statement: string): Promise<T> {
        statements.push(statement)
        assert.match(statement, /^\s*SELECT\b/i, '3c/B5 sólo admite SQL SELECT')
        if (statement.includes('FROM facturas_recibidas fr\n  JOIN document_version_lifecycle l')) return (input.documentRows ?? documents()) as T
        if (statement.includes('FROM document_version_credit_links cl')) return (input.linkRows ?? link(true)) as T
        if (statement.includes('FROM vinculos_movimiento_documento v')) return (input.b4Rows ?? b4()) as T
        throw new Error('SQL mock de rectificativas recibidas no reconocido')
      },
    },
  }
}

test('B5 recibidas descuenta rectificativa CONFIRMED exacta como campo aditivo y conserva el pendiente B4', async () => {
  const fixture = mockDb()
  const [row] = await readReceivedCreditNotesForPendingInvoices(fixture.db, [receivedPending])
  assert.deepEqual(
    [row.importeObjetivoCentimos, row.importeAsignadoActivoCentimos, row.importePendienteCentimos, row.creditNoteState, row.rectificationCents, row.importePendienteTrasRectificativasCentimos],
    [-10_000, -3_000, -7_000, 'PARCIAL', -2_000, -5_000],
  )
  assert.equal(fixture.statements.length, 3)
  assert.ok(fixture.statements.every((statement) => /LIMIT 25001 OFFSET 0/.test(statement)))
  assert.ok(fixture.statements.every((statement) => !/\b(?:INSERT|UPDATE|DELETE|MERGE|CALL)\b/i.test(statement)))
})

test('B5 recibidas deja PROPOSED en revisión y nunca lo confirma ni reduce el pendiente B4', async () => {
  const fixture = mockDb({ linkRows: link(false) })
  const [row] = await readReceivedCreditNotesForPendingInvoices(fixture.db, [receivedPending])
  assert.deepEqual(
    [row.importePendienteCentimos, row.creditNoteState, row.rectificationCents, row.importePendienteTrasRectificativasCentimos],
    [-7_000, 'REVISION', null, null],
  )
  assert.ok(row.creditNoteReviewReasons.includes('ENLACE_RECTIFICATIVA_NO_VIGENTE_O_BORRADO'))
  assert.ok(fixture.statements.some((statement) => statement.includes("cl.state = 'CONFIRMED'")))
  assert.ok(fixture.statements.some((statement) => statement.includes('cl.confirmed_by_id IS NOT NULL')))
})

test('sin moneda OCR o sin tupla documental original B5 conserva importes y exige revisión', async () => {
  const missingCurrency = mockDb({ documentRows: documents(null) })
  const [currencyRow] = await readReceivedCreditNotesForPendingInvoices(missingCurrency.db, [receivedPending])
  assert.deepEqual(
    [currencyRow.importePendienteCentimos, currencyRow.creditNoteState, currencyRow.rectificationCents, currencyRow.importePendienteTrasRectificativasCentimos],
    [-7_000, 'REVISION', null, null],
  )
  assert.ok(currencyRow.creditNoteReviewReasons.includes('MONEDA_INVALIDA'))

  const noSource = mockDb({ documentRows: [] })
  const [sourceRow] = await readReceivedCreditNotesForPendingInvoices(noSource.db, [receivedPending])
  assert.deepEqual(
    [sourceRow.importePendienteCentimos, sourceRow.creditNoteState, sourceRow.rectificationCents, sourceRow.importePendienteTrasRectificativasCentimos],
    [-7_000, 'REVISION', null, null],
  )
  assert.deepEqual(sourceRow.creditNoteReviewReasons, ['ORIGINAL_RECTIFICATIVA_SIN_VERSION_CANONICA_ELEGIBLE'])
})

test('la lectura B5 usa sourceItemKey real drive:item, rol proveedor, identidad exacta y evidencia B4 viva', () => {
  assert.match(pendingCreditNoteReadSql.receivedDocuments, /l\.source_item_key = \(fr\.onedrive_drive_id \|\| ':' \|\| fr\.onedrive_item_id\)/)
  assert.match(pendingCreditNoteReadSql.receivedLinks, /original_l\.source_item_key = \(original_fr\.onedrive_drive_id \|\| ':' \|\| original_fr\.onedrive_item_id\)/)
  assert.match(pendingCreditNoteReadSql.receivedLinks, /credit_l\.source_item_key = \(credit_fr\.onedrive_drive_id \|\| ':' \|\| credit_fr\.onedrive_item_id\)/)
  assert.doesNotMatch(pendingCreditNoteReadSql.receivedDocuments, /onedrive:/i)
  assert.match(pendingCreditNoteReadSql.receivedDocuments, /s\.party_role = 'PROVEEDOR'/)
  assert.match(pendingCreditNoteReadSql.receivedDocuments, /s\.document_number = fr\.num_factura/)
  assert.match(pendingCreditNoteReadSql.receivedDocuments, /s\.total_cents = b4_importe_bancario_centimos\(fr\.total\)/)
  assert.match(pendingCreditNoteReadSql.receivedDocuments, /document_version_tombstones/)
  assert.match(pendingCreditNoteReadSql.receivedDocuments, /document_version_incidents/)
  assert.match(pendingCreditNoteReadSql.receivedB4Payments, /d\.tipo = 'FACTURA_RECIBIDA'/)
  assert.match(pendingCreditNoteReadSql.receivedB4Payments, /estado = 'APLICADA'/)
  assert.match(pendingCreditNoteReadSql.receivedB4Payments, /estado = 'JUSTIFICADO'/)
  for (const statement of Object.values(pendingCreditNoteReadSql)) {
    assert.doesNotMatch(statement, /\b(?:INSERT|UPDATE|DELETE|MERGE|CALL|ROW_NUMBER)\b/i)
    assert.doesNotMatch(statement, /ILIKE|similarity|levenshtein|\bABS\s*\(/i)
  }
})

test('pendientes B5 consume 3c en emitidas y recibidas como extensión, no como cobro o pago bancario', () => {
  const pendingDb = readFileSync('lib/finanzas/pending-db.ts', 'utf8')
  assert.match(pendingDb, /readIssuedCreditNotesForBankInvoicing/)
  assert.match(pendingDb, /readReceivedCreditNotesForPendingInvoices/)
  assert.match(pendingDb, /importePendienteTrasRectificativasCentimos/)
  assert.match(pendingDb, /importePendienteCentimos: invoice\.remainingCents/)
  assert.match(pendingDb, /rectificativas 3c son una propuesta\/revisión documental y no cambian el pendiente B4/)
  assert.doesNotMatch(pendingDb, /ROW_NUMBER\s*\(/)
})

console.log('OK: pending credit-note DB tests use synthetic rows only; no DB, Graph, OCR, HTTP or mutation.')
