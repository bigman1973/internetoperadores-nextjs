import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateBankInvoicing, exactSourceCents } from '../lib/finanzas/bank-invoicing-core'
import { parseB7GetQuery, invoiceMatchesB7Query, sortInvoicesB7 } from '../lib/finanzas/bank-invoicing-contract'
import { readBankInvoicing } from '../lib/finanzas/bank-invoicing-db'
import { associationSourceHash, facturasSourceHash, remesaSourceFingerprint } from '../lib/finanzas/b6-source-fingerprint'

const invoice = (id: string, total = '100.00', facturaISPId: number | null = null) => ({
  id, sourceTotalText: total, b2Economic: true, numFactura: `F-${id}`, cliente: `Cliente ${id}`,
  fechaISO: '2026-10-22', fechaVencimientoISO: null, facturaISPId,
})
const direct = (invoiceId: string, movementId: string, cents: number, documentCount = 1, physical = cents, sum = cents) => ({
  lineId: `d-${movementId}-${invoiceId}`, invoiceId, movementId, signedCents: cents, active: true, documentActive: true,
  documentKind: 'FACTURA_EMITIDA' as const, wrapperTargetCents: 10_000, operationApplied: true, operationReverted: false,
  movementJustified: true, physicalBankCents: physical, sumAllActiveCents: sum, activeDocumentLineCount: documentCount, allActiveLinesApplied: true,
})
const remittanceLine = (id: string, cents: number, physical: number, sum = physical) => ({
  lineId: id, movementId: `m-${id}`, signedCents: cents, active: true, documentActive: true,
  documentKind: 'REMESA' as const, wrapperTargetCents: 20_000, operationApplied: true, operationReverted: false,
  movementJustified: true, physicalBankCents: physical, sumAllActiveCents: sum, activeDocumentLineCount: 1, allActiveLinesApplied: true,
})
const fullRemittance = (overrides: Partial<Parameters<typeof calculateBankInvoicing>[0]['explicitRemittances'][number]> = {}) => ({
  remittanceId: 'r1', sourceTotalText: '200.00', wrapperTargetCents: 20_000, wrapperActive: true, wrapperCount: 1,
  humanConfirmedAssociation: true, humanAssociationStale: false,
  members: [
    { facturaISPId: 1, invoiceId: 'a', facturaISPSourceTotalText: '100.00', facturaEmitidaSourceTotalText: '100.00' },
    { facturaISPId: 2, invoiceId: 'b', facturaISPSourceTotalText: '100.00', facturaEmitidaSourceTotalText: '100.00' },
  ],
  bankDocumentLines: [remittanceLine('gross', 20_000, 20_000)], refunds: [], ...overrides,
})

test('strict exact source cents neither rounds Float text nor turns unknown into zero', () => {
  assert.equal(exactSourceCents('100.00'), 10_000)
  assert.equal(exactSourceCents('-0,05'), -5)
  assert.equal(exactSourceCents('100.001'), null)
  assert.equal(exactSourceCents(null), null)
  assert.equal(exactSourceCents('0'), 0)
})

test('remittance identifying full collection is allocated only by exact B6 membership and exact source closure', () => {
  const rows = calculateBankInvoicing({ invoices: [invoice('a', '100.00', 1), invoice('b', '100.00', 2)], explicitRemittances: [fullRemittance()] }).invoices
  assert.deepEqual(rows.map((r) => [r.paymentState, r.paidDocumentaryCents, r.remainingCents, r.cashCents]), [
    ['COBRADA_CALCULADA', 10_000, 0, null], ['COBRADA_CALCULADA', 10_000, 0, null],
  ])
})

test('remittance with a missing FI mirror remains review; no guessed or ignored member can be allocated', () => {
  const remittance = fullRemittance({ members: [
    { facturaISPId: 1, invoiceId: 'a', facturaISPSourceTotalText: '100.00', facturaEmitidaSourceTotalText: '100.00' },
    { facturaISPId: 2, invoiceId: null, facturaISPSourceTotalText: '100.00', facturaEmitidaSourceTotalText: null },
  ] })
  const [row] = calculateBankInvoicing({ invoices: [invoice('a', '100.00', 1)], explicitRemittances: [remittance] }).invoices
  assert.equal(row.paymentState, 'PENDIENTE_COBRO_REVISION')
  assert.equal(row.paidDocumentaryCents, null)
  assert.ok(row.reasons.includes('REMESA_FUENTE_O_MAPA_FI_INEXACTO'))
})

test('mixed direct FI and remittance financing is review and never double counts', () => {
  const remittance = fullRemittance({ members: [{ facturaISPId: 1, invoiceId: 'a', facturaISPSourceTotalText: '100.00', facturaEmitidaSourceTotalText: '100.00' }], sourceTotalText: '100.00', wrapperTargetCents: 10_000,
    bankDocumentLines: [{ ...remittanceLine('r', 10_000, 10_000), wrapperTargetCents: 10_000 }] })
  const [row] = calculateBankInvoicing({ invoices: [invoice('a', '100.00', 1)], directDocumentLines: [direct('a', 'direct', 10_000)], explicitRemittances: [remittance] }).invoices
  assert.equal(row.paymentState, 'PENDIENTE_COBRO_REVISION')
  assert.equal(row.paidDocumentaryCents, null)
  assert.ok(row.reasons.includes('SOLAPAMIENTO_FI_DIRECTA_Y_REMESA'))
})

test('single direct document with fees leaves documentary paid at 100, cash 95, and debt zero', () => {
  const [row] = calculateBankInvoicing({
    invoices: [invoice('a')], directDocumentLines: [direct('a', 'fee', 10_000, 1, 9_500, 9_500)],
    differenceLines: [{ movementId: 'fee', signedCents: -500, active: true, operationApplied: true, operationReverted: false, movementJustified: true, physicalBankCents: 9_500, sumAllActiveCents: 9_500, allActiveLinesApplied: true }],
  }).invoices
  assert.deepEqual([row.paidDocumentaryCents, row.remainingCents, row.cashCents, row.attributableCashDifferenceCents], [10_000, 0, 9_500, -500])
})

test('signed credit-note direct evidence preserves negative economics without abs()', () => {
  const [row] = calculateBankInvoicing({ invoices: [invoice('credit', '-100.00')], directDocumentLines: [{ ...direct('credit', 'credit', -10_000), wrapperTargetCents: -10_000 }] }).invoices
  assert.deepEqual([row.targetCents, row.paidDocumentaryCents, row.remainingCents, row.paymentState], [-10_000, -10_000, 0, 'COBRADA_CALCULADA'])
})

test('signed B6 refund is attributed only when every negative remittance line has current exact human proof', () => {
  const refund = {
    linkId: 'return', facturaISPId: 1, signedCents: -2_500, confirmed: true, confirmedByHuman: true,
    active: true, documentActive: true, documentKind: 'REMESA' as const, operationApplied: true, operationReverted: false,
    movementJustified: true, physicalBankCents: -2_500, sumAllActiveCents: -2_500, activeDocumentLineCount: 1, allActiveLinesApplied: true,
  }
  const remittance = fullRemittance({
    bankDocumentLines: [remittanceLine('gross', 20_000, 20_000), { ...remittanceLine('return', -2_500, -2_500), wrapperTargetCents: 20_000 }],
    refunds: [refund],
  })
  const rows = calculateBankInvoicing({ invoices: [invoice('a', '100.00', 1), invoice('b', '100.00', 2)], explicitRemittances: [remittance] }).invoices
  assert.deepEqual(rows.map((r) => [r.invoiceId, r.paidDocumentaryCents, r.remainingCents]), [['a', 7_500, 2_500], ['b', 10_000, 0]])
})

test('group refund, stale physical close, and zero source are never falsely treated as cash/debt zero', () => {
  const unresolved = fullRemittance({
    bankDocumentLines: [remittanceLine('gross', 20_000, 20_000), { ...remittanceLine('return', -500, -500), wrapperTargetCents: 20_000, activeDocumentLineCount: 2 }],
    refunds: [{ linkId: 'return', facturaISPId: 1, signedCents: -500, confirmed: true, confirmedByHuman: true, active: true, documentActive: true, documentKind: 'REMESA', operationApplied: true, operationReverted: false, movementJustified: true, physicalBankCents: -500, sumAllActiveCents: -500, activeDocumentLineCount: 2, allActiveLinesApplied: true }],
  })
  const result = calculateBankInvoicing({
    invoices: [invoice('a', '100.00', 1), invoice('b', '100.00', 2), invoice('zero', '0')],
    directDocumentLines: [{ ...direct('a', 'stale', 10_000), physicalBankCents: 9_999, sumAllActiveCents: 9_999 }],
    explicitRemittances: [unresolved],
  })
  const zero = result.invoices.find((r) => r.invoiceId === 'zero')!
  assert.deepEqual([zero.targetCents, zero.paidDocumentaryCents, zero.remainingCents, zero.cashCents, zero.paymentState], [0, 0, 0, null, 'PENDIENTE_COBRO_REVISION'])
  assert.ok(zero.reasons.includes('TOTAL_CERO_SIN_COBRO_EXIGIBLE'))
  assert.equal(result.invoices.find((r) => r.invoiceId === 'a')!.paidDocumentaryCents, null)
})

test('allActiveLinesApplied false blocks direct proof and yields unknown rather than a false paid/zero claim', () => {
  const [row] = calculateBankInvoicing({
    invoices: [invoice('a')],
    directDocumentLines: [{ ...direct('a', 'closure-invalid', 10_000), allActiveLinesApplied: false }],
  }).invoices
  assert.deepEqual([row.paymentState, row.paidDocumentaryCents, row.remainingCents, row.cashCents], ['PENDIENTE_COBRO_REVISION', null, null, null])
  assert.ok(row.reasons.includes('EVIDENCIA_B4_DIRECTA_NO_VIGENTE'))
})

test('a stale human remittance association blocks all member allocation without inventing partial paid values', () => {
  const rows = calculateBankInvoicing({
    invoices: [invoice('a', '100.00', 1), invoice('b', '100.00', 2)],
    explicitRemittances: [fullRemittance({ humanConfirmedAssociation: false, humanAssociationStale: true })],
  }).invoices
  assert.deepEqual(rows.map((row) => [row.paidDocumentaryCents, row.remainingCents, row.paymentState]), [
    [null, null, 'PENDIENTE_COBRO_REVISION'], [null, null, 'PENDIENTE_COBRO_REVISION'],
  ])
  assert.ok(rows.every((row) => row.reasons.includes('REMESA_ASOCIACION_HUMANA_FUENTE_OBSOLETA')))
})

test('a partial remittance without the exact whole-remittance or B6 refund proof never prorates invoices', () => {
  const rows = calculateBankInvoicing({
    invoices: [invoice('a', '100.00', 1), invoice('b', '100.00', 2)],
    explicitRemittances: [fullRemittance({ bankDocumentLines: [remittanceLine('partial', 15_000, 15_000)] })],
  }).invoices
  assert.deepEqual(rows.map((row) => [row.paidDocumentaryCents, row.remainingCents, row.paymentState]), [
    [null, null, 'PENDIENTE_COBRO_REVISION'], [null, null, 'PENDIENTE_COBRO_REVISION'],
  ])
  assert.ok(rows.every((row) => row.reasons.includes('REMESA_DEVOLUCION_SIN_ATRIBUCION_B6_EXACTA')))
})

test('DTO accepts pagination through offset 100000 and summary filters are independent from later page selection', () => {
  const query = parseB7GetQuery(new URLSearchParams('mes=2026-10&estado=PENDIENTE_COBRO&limit=100&offset=100000'))
  assert.equal(query.offset, 100_000)
  assert.throws(() => parseB7GetQuery(new URLSearchParams('offset=100001')), /offset/)
  const results = calculateBankInvoicing({ invoices: [invoice('z'), { ...invoice('a'), fechaISO: '2026-09-01' }] }).invoices
  assert.deepEqual(sortInvoicesB7(results.filter((row) => invoiceMatchesB7Query(row, { q: null, mes: '2026-10', estado: 'PENDIENTE_COBRO' }))).map((x) => x.invoiceId), ['z'])
})

function currentAudit(remittanceDate = '2026-10-01') {
  const remesa = { id: 9, ispGestionId: 70, fecha: remittanceDate, totalCentimos: 20_000 }
  const facturas = [
    { id: 1, ispGestionId: 701, fecha: '2026-10-02', totalCentimos: 10_000 },
    { id: 2, ispGestionId: 702, fecha: '2026-10-03', totalCentimos: 10_000 },
  ]
  const remesaHash = remesaSourceFingerprint(remesa)
  const facturasHash = facturasSourceHash(facturas)
  const sourceHash = associationSourceHash(remesa, facturas)
  return {
    remittanceId: 9,
    sourceHash,
    snapshotSolicitud: { expectedRemesaHashSHA256: remesaHash, expectedFacturasHashSHA256: facturasHash },
    snapshotResultado: {
      facturaIdsISP: [1, 2], facturasSourceHashSHA256: facturasHash,
      sourceSnapshot: { sourceHash, remesaBefore: remesa, facturas },
    },
  }
}

function readerDb(
  remittanceDate = '2026-10-01',
  audits: unknown[] = [currentAudit(remittanceDate)],
  facturaOneDate = '2026-10-02',
  directRows: unknown[] = [],
) {
  const sql: string[] = []
  const db = {
    async $queryRawUnsafe<T>(statement: string): Promise<T> {
      sql.push(statement)
      if (statement.includes('FROM facturas_emitidas fe')) return [
        { id: 'a', sourceTotalText: '100.00', b2Economic: true, numFactura: 'FA', cliente: 'A', fechaISO: facturaOneDate, fechaVencimientoISO: '2026-11-02', facturaISPId: 1 },
        { id: 'b', sourceTotalText: '100.00', b2Economic: true, numFactura: 'FB', cliente: 'B', fechaISO: '2026-10-03', fechaVencimientoISO: null, facturaISPId: 2 },
      ] as T
      if (statement.includes("d.tipo = 'FACTURA_EMITIDA'")) return directRows as T
      if (statement.includes('FROM remesas r')) return [
        { remittanceId: 9, remittanceIspGestionId: 70, remittanceFechaISO: remittanceDate, sourceTotalText: '200.00', wrapperTargetCents: 20_000, wrapperActive: true, wrapperCount: 1, facturaISPId: 1, facturaISPGestionId: 701, facturaISPFechaISO: facturaOneDate, invoiceId: 'a', facturaISPSourceTotalText: '100.00', facturaEmitidaSourceTotalText: '100.00' },
        { remittanceId: 9, remittanceIspGestionId: 70, remittanceFechaISO: remittanceDate, sourceTotalText: '200.00', wrapperTargetCents: 20_000, wrapperActive: true, wrapperCount: 1, facturaISPId: 2, facturaISPGestionId: 702, facturaISPFechaISO: '2026-10-03', invoiceId: 'b', facturaISPSourceTotalText: '100.00', facturaEmitidaSourceTotalText: '100.00' },
      ] as T
      if (statement.includes('FROM auditoria_remesa_b6')) return audits as T
      if (statement.includes("d.tipo = 'REMESA'")) return [
        { remittanceId: 9, lineId: 'remesa-line', movementId: 'm-remesa', signedCents: 20_000, active: true, documentActive: true, documentKind: 'REMESA', wrapperTargetCents: 20_000, operationApplied: true, operationReverted: false, movementJustified: true, physicalBankCents: 20_000, sumAllActiveCents: 20_000, activeDocumentLineCount: 1, allActiveLinesApplied: true },
      ] as T
      if (statement.includes('FROM cuentas_bancarias')) return [{ activeAccountCount: 0, accountsWithKnownCutoff: 0, minimumCutoff: null }] as T
      return [] as T
    },
  }
  return { db, sql }
}

test('reader SQL aliases v.activo and its B4 closure fails when any active operation is not applied', async () => {
  const fixture = readerDb()
  const response = await readBankInvoicing(fixture.db, { enabled: true, assertIsolatedStaging: async () => {} })
  assert.deepEqual(response.items.map((row) => row.paymentState), ['COBRADA_CALCULADA', 'COBRADA_CALCULADA'])
  const proofs = fixture.sql.filter((statement) => statement.includes('all_active_lines_applied'))
  assert.equal(proofs.length, 4)
  for (const statement of proofs) {
    assert.match(statement, /v\.activo AS "active"/)
    assert.match(statement, /LEFT JOIN operaciones_justificacion_b4 ox ON ox\.id = x\.operacion_creacion_id/)
    assert.match(statement, /BOOL_AND\(COALESCE\(ox\.estado = 'APLICADA'/)
  }
})

test('reader maps an invalid all-active B4 closure to false and does not accept that direct line', async () => {
  const invalidDirect = [{
    lineId: 'direct-invalid', movementId: 'm-direct', invoiceId: 'a', signedCents: 10_000,
    active: true, documentActive: true, documentKind: 'FACTURA_EMITIDA', wrapperTargetCents: 10_000,
    operationApplied: true, operationReverted: false, movementJustified: true,
    physicalBankCents: 10_000, sumAllActiveCents: 10_000, activeDocumentLineCount: 1,
    allActiveLinesApplied: false,
  }]
  const fixture = readerDb('2026-10-01', [], '2026-10-02', invalidDirect)
  const response = await readBankInvoicing(fixture.db, { enabled: true, assertIsolatedStaging: async () => {} })
  const row = response.items.find((item) => item.invoiceId === 'a')!
  assert.deepEqual([row.paidDocumentaryCents, row.remainingCents, row.paymentState], [null, null, 'PENDIENTE_COBRO_REVISION'])
  assert.ok(row.reasons.includes('EVIDENCIA_B4_DIRECTA_NO_VIGENTE'))
})

test('reader requires a current B6 root snapshot: same IDs with a changed remesa date or no evidence is stale', async () => {
  const stale = readerDb('2026-10-09', [currentAudit('2026-10-01')])
  const staleResponse = await readBankInvoicing(stale.db, { enabled: true, assertIsolatedStaging: async () => {} })
  assert.ok(staleResponse.items.every((row) => row.paymentState === 'PENDIENTE_COBRO_REVISION'))
  assert.ok(staleResponse.items.every((row) => row.paidDocumentaryCents === null && row.remainingCents === null))
  assert.ok(staleResponse.items.every((row) => row.reasons.includes('REMESA_ASOCIACION_HUMANA_FUENTE_OBSOLETA')))

  const absent = readerDb('2026-10-01', [])
  const absentResponse = await readBankInvoicing(absent.db, { enabled: true, assertIsolatedStaging: async () => {} })
  assert.ok(absentResponse.items.every((row) => row.paymentState === 'PENDIENTE_COBRO_REVISION'))
  const auditSql = absent.sql.find((statement) => statement.includes('FROM auditoria_remesa_b6')) ?? ''
  assert.match(auditSql, /snapshot_solicitud AS "snapshotSolicitud"/)
  assert.match(auditSql, /a\.source_hash AS "sourceHash"/)
})

test('reader invalidates B6 same-ID evidence when a member source date changes or root snapshot is incomplete', async () => {
  const dated = readerDb('2026-10-01', [currentAudit('2026-10-01')], '2026-10-12')
  const datedResponse = await readBankInvoicing(dated.db, { enabled: true, assertIsolatedStaging: async () => {} })
  assert.ok(datedResponse.items.every((row) => row.reasons.includes('REMESA_ASOCIACION_HUMANA_FUENTE_OBSOLETA')))

  const complete = currentAudit()
  const noRoot = {
    ...complete,
    snapshotResultado: {
      facturaIdsISP: [1, 2], facturasSourceHashSHA256: complete.snapshotResultado.facturasSourceHashSHA256,
      sourceSnapshot: { sourceHash: complete.sourceHash, facturas: complete.snapshotResultado.sourceSnapshot.facturas },
    },
  }
  const rootless = readerDb('2026-10-01', [noRoot])
  const rootlessResponse = await readBankInvoicing(rootless.db, { enabled: true, assertIsolatedStaging: async () => {} })
  assert.ok(rootlessResponse.items.every((row) => row.reasons.includes('REMESA_ASOCIACION_HUMANA_FUENTE_OBSOLETA')))
})

test('ignora historia directa anulada y mantiene una confirmación posterior activa', () => {
  const old = { ...direct('a','old',10_000), active:false, operationApplied:false, operationReverted:true, movementJustified:false }
  const [row] = calculateBankInvoicing({invoices:[invoice('a')],directDocumentLines:[old,direct('a','current',10_000)]}).invoices
  assert.equal(row.paymentState,'COBRADA_CALCULADA')
  assert.equal(row.paidDocumentaryCents,10_000)
  assert.deepEqual(row.reasons,[])
})

test('devolución de remesa anulada no invalida el abono original ni reescribe su auditoría', () => {
  const remittance=fullRemittance({bankDocumentLines:[remittanceLine('gross',20_000,20_000),{...remittanceLine('return-history',-2_500,-2_500),active:false,operationApplied:false,operationReverted:true,movementJustified:false}]})
  const rows=calculateBankInvoicing({invoices:[invoice('a','100.00',1),invoice('b','100.00',2)],explicitRemittances:[remittance]}).invoices
  assert.ok(rows.every(row=>row.paymentState==='COBRADA_CALCULADA'&&row.paidDocumentaryCents===10_000&&row.remainingCents===0))
})

test('remesa cuyo único abono fue deshecho no acredita cobro ni falsa revisión por historia', () => {
  const remittance=fullRemittance({bankDocumentLines:[{...remittanceLine('history',20_000,20_000),active:false,operationApplied:false,operationReverted:true,movementJustified:false}]})
  const rows=calculateBankInvoicing({invoices:[invoice('a','100.00',1),invoice('b','100.00',2)],explicitRemittances:[remittance]}).invoices
  assert.ok(rows.every(row=>row.paymentState==='PENDIENTE_COBRO'&&row.paidDocumentaryCents===0&&row.remainingCents===10_000))
})
