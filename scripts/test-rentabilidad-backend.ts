import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { canonicalDecimal, exactCents, moneyToCents, safePayload, sourceHash, INITIAL_PRODUCTS, INITIAL_TARIFF_RULES } from '../lib/rentabilidad/types'
import { parseCsv, importDate, importDecimal, previewImportFile } from '../lib/rentabilidad/importers'
import { assertRentabilidadConfiguration, normalizeInitialPayload, prepareLine, prepareVersion, prepareRule, planVersion, confirmedCostPayload, decisionEffect, compensationCandidates, isRepeatedDecision, boundedHistoryPage, contractReviewAlerts, canonicalReferences, type SavedVersion, type VersionMutation } from '../lib/rentabilidad/store'
import { createIspReadTransport, ispAvailability, readIspContracts, readConfiguredLineExport } from '../lib/rentabilidad/isp'

// Synthetic fixtures only for implementation tests; never analytic demonstration data.
test('reference alias migrations expose latest observation per source cell without deleting history', () => {
  const sourceLocator = { file: 'synthetic.xlsx', sheet: 'Control', cell: 'B2' }
  const old = { key: 'legacy', kind: 'recurrent_product', product: 'Synthetic', income: '10', sourceLocator, __referenceSeenAt: '2026-11-01' }
  const aliases = { ...old, key: 'normalized', productoId: 'Synthetic', __referenceSeenAt: '2026-11-02' }
  const correction = { ...aliases, key: 'corrected', income: '11', __referenceSeenAt: '2026-11-03' }
  const distinct = { ...old, key: 'different-cell', sourceLocator: { ...sourceLocator, cell: 'B3' } }
  const rows = [correction, old, distinct, aliases]
  const result = canonicalReferences(rows)
  assert.equal(result.length, 2)
  assert.equal(result.find(row => row.key === 'corrected')?.income, '11')
  assert.ok(result.every(row => !('__referenceSeenAt' in row)))
  assert.equal(rows.length, 4)
  assert.deepEqual(canonicalReferences([...rows].reverse()), result)
})
test('exact decimal precision is preserved and only presentation cents round', () => {
  assert.equal(canonicalDecimal('005.537200'), '5.5372')
  assert.equal(moneyToCents('5.5372'), '554')
  assert.equal(moneyToCents('-0.005'), '-1')
  assert.equal(moneyToCents('1.0049'), '100')
  assert.equal(exactCents('1234567890123.45'), '123456789012345')
  assert.throws(() => exactCents('5.5372'))
  assert.throws(() => canonicalDecimal('Infinity'))
  assert.throws(() => canonicalDecimal('1e3'))
  assert.equal(importDecimal('1.234,5678 €'), '1234.5678')
})
test('line identity uses exact four-decimal amount, not rounded cents', () => {
  const raw = { contractCode: '0007', concept: 'Servicio', date: '2026-10-01', baseAmount: '5.5372', month: '2026-10' }
  const first = prepareLine(raw)
  assert.equal(first.payload.importeBaseDecimal, '5.5372')
  assert.equal(first.codigoContratoIsp, '0007')
  assert.equal(first.key, prepareLine({ ...raw, baseAmount: '05.537200' }).key)
  assert.notEqual(first.key, prepareLine({ ...raw, baseAmount: '5.5373' }).key)
  assert.equal(first.importeBaseCentimos, prepareLine({ ...raw, baseAmount: '5.5373' }).importeBaseCentimos)
  assert.equal(prepareLine({ codigoContratoIsp: '7', concepto: 'Abono', fecha: '2026-10-01', importeBaseCentimos: '-1' }).payload.importeBaseDecimal, '-0.01')
  assert.doesNotThrow(() => prepareLine({ ...raw, concept: 'detalle '.repeat(80) }))
})
test('contracts retain exact price, discount and contractedMonthlyAmount with locator', () => {
  const raw = { contractCode: '7', price: '5.5372', discount: '-1.0000', contractedMonthlyAmount: '4.5372', periodicityMonths: 1, source: { file: 'fixture.xlsx', row: 2 }, provider: 'fixture' }
  const contract = prepareVersion('contract', raw, 'LORENA').payload
  assert.equal(contract.price, '5.5372')
  assert.equal(contract.precioPeriodo, '5.5372')
  assert.equal(contract.discount, '-1.0000')
  assert.equal(contract.contractedMonthlyAmount, '4.5372')
  assert.equal(contract.cuotaPeriodoCentimos, undefined)
  assert.equal(contract.source, 'LORENA')
  assert.deepEqual(contract.sourceLocator, raw.source)
  assert.equal(contract.proveedor, 'fixture')
  assert.throws(() => prepareVersion('contract', { contractCode: '1', periodicidadMeses: 2 }))
})
test('costs retain source state and missing state is reference, never real zero', () => {
  const cost = prepareVersion('cost', { key: 'fixture', provider: 'A', product: 'B', amount: '5.5372', status: 'ESTIMADO', month: '2026-10', source: { sheet: 'Fixture', row: 2 } }, 'COSTES_XLSX_INITIAL').payload
  assert.equal(cost.importeBaseCentimos, '554')
  assert.equal(cost.amount, '5.5372')
  assert.equal(cost.estado, 'ESTIMADO')
  assert.equal(prepareVersion('cost', { key: 'unknown' }).payload.estado, 'REFERENCIA')
  assert.throws(() => prepareVersion('externalCost', { key: 'bad', sociedadPagadora: 'IO' }))
})
test('CSV quoted fields, BOM, multiline and malformed quotes', () => {
  assert.deepEqual(parseCsv('\uFEFFA;B\r\n"one;two";"line\nnext"\r\n'), [['A', 'B'], ['one;two', 'line\nnext']])
  assert.deepEqual(parseCsv('A,B\n"quote ""x""",2'), [['A', 'B'], ['quote "x"', '2']])
  assert.throws(() => parseCsv('A,B\n"unclosed,2'))
  assert.throws(() => parseCsv('A,B\n"closed"bad,2'))
  assert.equal(importDate('01/10/2026'), '2026-10-01')
  assert.throws(() => importDate('31/02/2026'))
})
test('native CSV/XLSX previews work and report without side effects', async () => {
  const folder = join(tmpdir(), `rentabilidad-test-${process.pid}`); await mkdir(folder, { recursive: true })
  try {
    const csv = join(folder, 'lines.csv')
    await writeFile(csv, 'CODIGO CONTRATO,CONCEPTO,PRECIO,FECHA\n0007,Servicio,5.5372,01/10/2026\n0008,Error,invalid,01/10/2026\n')
    const result = await previewImportFile(csv, 'lines')
    assert.equal(result.validas, 1); assert.equal(result.rechazadas, 1)
    assert.equal(result.payload.lines![0].importeBaseExacto, '5.5372')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Nº CONTRATO', 'PROVEEDOR', 'IMPORTE (sin IVA)', 'PERIORICIDAD'], ['7', 'Fixture', '5.5372', 'Semestral']]), 'Contratos')
    const excel = join(folder, 'contracts.xlsx'); XLSX.writeFile(workbook, excel)
    const contract = await previewImportFile(excel, 'contracts')
    assert.equal(contract.validas, 1); assert.equal(contract.payload.contracts![0].periodicidadMeses, 6)
    assert.equal(prepareVersion('contract', contract.payload.contracts![0]).payload.cuotaPeriodoCentimos, undefined)
  } finally { await rm(folder, { recursive: true, force: true }) }
})
test('staging guard rejects every production or unverified configuration before DB load', () => {
  const isolated = { DATABASE_URL: 'postgresql://io_staging_finanzas@fixture.invalid/io_staging_finanzas', FINANCE_STAGING_SANDBOX: '1', VERCEL_ENV: 'preview' }
  assert.doesNotThrow(() => assertRentabilidadConfiguration(isolated))
  for (const input of [{}, { ...isolated, VERCEL_ENV: 'production' }, { ...isolated, FINANCE_STAGING_SANDBOX: '0' }, { ...isolated, DATABASE_URL: 'postgresql://postgres@fixture.invalid/railway' }, { ...isolated, IO_PRODUCTION_READ_ONLY: '1' }]) assert.throws(() => assertRentabilidadConfiguration(input))
})
test('payload sanitation, deterministic hashes and snapshot-only larger bound', () => {
  assert.equal(sourceHash({ b: 2, a: 1 }), sourceHash({ a: 1, b: 2 }))
  assert.throws(() => safePayload({ nested: { password: 'fixture' } }))
  assert.throws(() => safePayload({ unknown: undefined }))
  const big = { data: 'x'.repeat(150_000) }
  assert.throws(() => safePayload(big)); assert.doesNotThrow(() => safePayload(big, 8 * 1024 * 1024))
})
test('catalog and rule validation match confirmed briefing', () => {
  assert.equal(INITIAL_PRODUCTS.length, 21)
  assert.equal(INITIAL_TARIFF_RULES.length, 8)
  for (const rule of INITIAL_TARIFF_RULES) assert.doesNotThrow(() => prepareRule(rule))
  assert.throws(() => prepareRule({ type: 'tariffRule', key: 'bad', matchType: 'REGEX', pattern: '(a+)+', productoId: 'X', proveedor: 'Y' }))
  assert.throws(() => prepareRule({ type: 'costRule', key: 'bad', method: 'MAGIC', period: 'MES', proveedorCif: 'fixture' }))
})
test('analyst envelope maps confirmed multiple patterns and keeps external source as references', () => {
  const normalized = normalizeInitialPayload({ schemaVersion: 'io-normalized-initial-1.0', contracts: [], lines: [], costs: [], references: [], externalAnalyticalCosts: [{ provider: 'Fixture', amount: '1.00', month: '2026-10' }], rules: [{ kind: 'tariff_provider', patterns: ['contains:VOLIBRI', 'contains:PERDIU'], provider: 'IO', source: { file: 'briefing' } }], backendMapping: {}, runs: [] })
  assert.equal(normalized.rules!.length, 2)
  assert.equal(normalized.references!.length, 1)
  assert.equal(normalized.costs!.length, 0)
  for (const row of normalized.rules!) assert.doesNotThrow(() => prepareRule(row))
})
test('ISP advanced API blocker makes zero requests and unconfigured export stays blocked', async () => {
  let calls = 0; const http = async () => { calls++; return new Response('[]') }
  const transport = createIspReadTransport({}, http as any)
  await assert.rejects(() => transport('contratos_todos', 'GET', { mostrar: 500, pagina: 1 }), /ISP_ADVANCED_API_NOT_CONTRACTED/)
  assert.equal(calls, 0); assert.equal(ispAvailability({}).estado, 'BLOQUEADO')
  await assert.rejects(() => readConfiguredLineExport({}, http as any), /NOT_CONFIGURED/)
  assert.equal(calls, 0)
})
test('ISP read contract pagination uses only allowlisted upstream GET and detects duplicates', async () => {
  const calls: string[] = []
  const codes = new Map([['7', '0007']])
  const result = await readIspContracts(async (endpoint, method) => { calls.push(`${method}:${endpoint}`); return [{ id: '7', clienteid: '100', precio: '5.5372' }] }, codes)
  assert.deepEqual(calls, ['GET:contratos_todos']); assert.equal(result.contracts![0].precioPeriodo, '5.5372')
  assert.equal(result.contracts![0].codigoContratoIsp, '0007')
  await assert.rejects(() => readIspContracts(async () => [{ id: '7', clienteid: '100' }, { id: '7', clienteid: '100' }], codes), /DUPLICATE/)
  await assert.rejects(() => readIspContracts(async () => [{ id: '7', clienteid: '100' }]), /CODE_UNVERIFIED/)
})

// Exact planner used by applyVersions. No emulated spread-merge or database fixture diverging from imports.
function saved(candidate: VersionMutation, old?: SavedVersion): SavedVersion {
  const next = planVersion(candidate, old); assert.ok(next); return next
}
function initialContract(overrides: Record<string, any> = {}): SavedVersion {
  const envelope = normalizeInitialPayload({ schemaVersion: 'io-normalized-initial-1.0', contracts: [{
    contractCode: '0007', provider: 'Aire Networks', product: 'AIRE', price: '90.00', discount: '-6.00',
    periodMonths: 3, contractedMonthlyAmount: '28', active: true, startDate: '2026-01-01',
    endDate: null, estadoOriginal: 'Activo', source: { file: 'synthetic.xlsx', row: 2 }, ...overrides,
  }], lines: [], costs: [], rules: [] })
  return saved(prepareVersion('contract', envelope.contracts![0], 'LORENA'))
}
test('normalized initial English aliases are replaced by incoming Spanish ISP aliases before merge', () => {
  const old = initialContract()
  const incoming = prepareVersion('contract', { codigoContratoIsp: '0007', precioPeriodo: '120', periodicidadMeses: 6,
    descuento: '-12', fechaAlta: '2026-02-01', fechaBaja: '2026-09-30', estado: 'BAJA' }, 'ISP_READ')
  const current = saved(incoming, old)
  for (const key of ['price', 'precioPeriodo']) assert.equal(current.payload[key], '120')
  for (const key of ['periodicityMonths', 'periodMonths', 'periodicidadMeses']) assert.equal(current.payload[key], 6)
  assert.equal(current.payload.discount, '-12'); assert.equal(current.payload.descuento, '-12')
  assert.equal(current.payload.startDate, '2026-02-01'); assert.equal(current.payload.endDate, '2026-09-30')
  assert.equal(current.payload.active, false); assert.equal(current.payload.activo, false)
  assert.equal(current.payload.state, 'BAJA'); assert.equal(current.payload.status, 'BAJA')
  assert.equal(current.payload.contractedMonthlyAmount, undefined)
  assert.equal((Number(current.payload.price) + Number(current.payload.discount)) / current.payload.periodMonths, 18)
  assert.equal(current.payload.estadoOriginal, 'Activo')
  assert.equal(planVersion(incoming, current), null)
})
test('real ISP adapter termination and price replace English initial values and invalidate old net monthly', async () => {
  const payload = await readIspContracts(async () => [{ id: '7', clienteid: '100', precio: '120.5372', fecha_baja: '2026-09-30' }], new Map([['7', '7']]))
  const old = initialContract({ contractCode: '7' })
  const current = saved(prepareVersion('contract', payload.contracts![0], payload.source), old)
  assert.equal(current.payload.price, '120.5372'); assert.equal(current.payload.endDate, '2026-09-30')
  assert.equal(current.payload.active, false); assert.equal(current.payload.contractedMonthlyAmount, undefined)
  assert.equal(current.payload.cuotaPeriodoCentimos, undefined)
  assert.equal(current.payload.provider, 'Aire Networks')
})
test('each ISP economic change invalidates old net monthly even if incoming repeats a stale cache', () => {
  for (const patch of [{ precioPeriodo: '91' }, { descuento: '-7' }, { periodicidadMeses: 6 }]) {
    const old = initialContract({ netoMensual: '28', importeMensualContratado: '28', netMonthlyAmount: '28' })
    const incoming = prepareVersion('contract', { codigoContratoIsp: '0007', ...patch, contractedMonthlyAmount: '28' }, 'ISP_READ')
    const current = saved(incoming, old)
    for (const field of ['contractedMonthlyAmount', 'netoMensual', 'importeMensualContratado', 'netMonthlyAmount']) assert.equal(current.payload[field], undefined)
    assert.equal(planVersion(incoming, current), null)
  }
  const old = initialContract()
  const repeated = prepareVersion('contract', { codigoContratoIsp: '0007', precioPeriodo: '90.000', periodicidadMeses: 3 }, 'ISP_READ')
  const current = saved(repeated, old)
  assert.equal(current.payload.contractedMonthlyAmount, '28')
  assert.equal(planVersion(repeated, current), null)
})
test('Lorena supplier and product win over ISP on both languages, and a new supplier clears old product', () => {
  const old = initialContract()
  for (const patch of [{ provider: 'Telefónica', product: 'TELEFONICA' }, { proveedor: 'Telefónica', productoId: 'TELEFONICA' }]) {
    const current = saved(prepareVersion('contract', { codigoContratoIsp: '0007', ...patch, precioPeriodo: '100' }, 'ISP_READ'), old)
    assert.equal(current.payload.provider, 'Aire Networks'); assert.equal(current.payload.proveedor, 'Aire Networks')
    for (const field of ['product', 'productoId', 'producto']) assert.equal(current.payload[field], 'AIRE')
  }
  for (const patch of [{ provider: 'Adamo' }, { proveedor: 'Adamo' }]) {
    const incoming = prepareVersion('contract', { codigoContratoIsp: '0007', ...patch }, 'LORENA')
    const current = saved(incoming, old)
    assert.equal(current.payload.provider, 'Adamo'); assert.equal(current.payload.proveedor, 'Adamo')
    for (const field of ['product', 'productoId', 'producto']) assert.equal(current.payload[field], null)
    assert.equal(planVersion(incoming, current), null)
  }
  const explicit = saved(prepareVersion('contract', { codigoContratoIsp: '0007', proveedor: 'Adamo', productoId: 'ADAMO' }, 'LORENA'), old)
  assert.equal(explicit.payload.product, 'ADAMO')
})
test('English-only Lorena provenance also blocks ISP supplier/product changes', () => {
  const legacyPayload = { contractCode: '7', provider: 'Aire Networks', product: 'AIRE', source: 'ISP_READ', origenPorCampo: { provider: 'LORENA' } }
  const legacy: SavedVersion = { kind: 'contract', key: '7', version: 2, payload: legacyPayload, sourceHash: sourceHash(legacyPayload) }
  const current = saved(prepareVersion('contract', { codigoContratoIsp: '7', proveedor: 'Adamo', productoId: 'ADAMO' }, 'ISP_READ'), legacy)
  assert.equal(current.payload.provider, 'Aire Networks'); assert.equal(current.payload.product, 'AIRE')
  assert.equal(current.payload.proveedor, 'Aire Networks'); assert.equal(current.payload.productoId, 'AIRE')
  const incoming = prepareVersion('contract', { codigoContratoIsp: '7', proveedor: 'Adamo', productoId: 'ADAMO' }, 'ISP_READ')
  assert.equal(planVersion(incoming, current), null)
})
test('explicit null clears termination aliases without manufacturing start/end dates', () => {
  const old = initialContract({ endDate: '2026-09-30', active: false })
  const current = saved(prepareVersion('contract', { codigoContratoIsp: '0007', fechaBaja: null, estado: 'ACTIVO' }, 'ISP_READ'), old)
  for (const field of ['endDate', 'fechaBaja', 'fechaFin']) assert.equal(current.payload[field], null)
  assert.equal(current.payload.active, true)
  const missing = prepareVersion('contract', { codigoContratoIsp: '8', estadoOriginal: 'Activo' }, 'LORENA').payload
  assert.equal(missing.startDate, undefined); assert.equal(missing.endDate, undefined)
})
test('contradictory active source state and past termination date are retained and queued for review', () => {
  const current = initialContract({ active: true, endDate: '2026-09-30', estadoOriginal: 'Activo' })
  assert.equal(current.payload.active, true); assert.equal(current.payload.endDate, '2026-09-30')
  assert.equal(current.payload.estadoOriginal, 'Activo')
  assert.deepEqual(contractReviewAlerts(current.payload, '2026-10-01'), [{ key: 'estado:0007', type: 'ESTADO_CONTRADICTORIO', codigoContratoIsp: '0007' }])
  assert.equal(contractReviewAlerts(current.payload, '2026-09-01').length, 0)
  const original = prepareVersion('contract', { codigoContratoIsp: '8', estadoOriginal: 'Activo', estado: 'BAJA', fechaBaja: '2026-09-30' }, 'LORENA').payload
  assert.equal(original.estado, 'BAJA'); assert.equal(original.active, true)
  assert.equal(contractReviewAlerts(original, '2026-10-01').length, 1)
})
test('conflicting aliases fail closed; equivalent decimal aliases remain valid', () => {
  assert.throws(() => prepareVersion('contract', { contractCode: '7', price: '90', precioPeriodo: '120' }), /ALIAS_CONFLICT/)
  assert.throws(() => prepareVersion('contract', { contractCode: '7', provider: 'A', proveedor: 'B' }), /ALIAS_CONFLICT/)
  assert.throws(() => prepareVersion('contract', { contractCode: '7', periodMonths: 3, periodicidadMeses: 6 }), /ALIAS_CONFLICT/)
  assert.equal(prepareVersion('contract', { contractCode: '7', price: '90.000', precioPeriodo: 90 }).payload.price, '90')
})
test('cost confirmation refreshes every English/Spanish money alias, exact decimals and derived cents', () => {
  const target = saved(prepareVersion('cost', { key: 'synthetic-cost', baseAmount: '9.12', amount: '9.12', importeBaseCentimos: '912',
    amountCents: '912', baseAmountCents: '912', importeCentimos: '912', cents: '912', decimal: '9.12', baseAmountDecimal: '9.12', amountDecimal: '9.12', status: 'ESTIMADO' }))
  const request = { action: 'CONFIRMAR_COSTE', exceptionKey: 'synthetic-review', amount: '5.5372' }
  const confirmed = saved(prepareVersion('cost', confirmedCostPayload(target, request, 1)), target)
  for (const field of ['baseAmount', 'amount', 'importe', 'importeBase', 'importeBaseDecimal', 'importeBaseExacto', 'decimal', 'amountDecimal', 'baseAmountDecimal']) assert.equal(confirmed.payload[field], '5.5372')
  for (const field of ['importeBaseCentimos', 'amountCents', 'baseAmountCents', 'importeCentimos', 'cents']) assert.equal(confirmed.payload[field], '554')
  for (const field of ['status', 'state', 'estado']) assert.equal(confirmed.payload[field], 'REAL')
  assert.equal(planVersion(prepareVersion('cost', confirmedCostPayload(confirmed, request, 1)), confirmed), null)
})
test('confirmation without a supplied amount retains actual target money, never fabricates zero', () => {
  const target = saved(prepareVersion('externalCost', { key: 'synthetic-external', amount: '12.3456', sociedadPagadora: 'Vola', estado: 'PENDIENTE' }))
  const candidate = prepareVersion('externalCost', confirmedCostPayload(target, { action: 'CONFIRMAR_COSTE' }, 1))
  assert.equal(candidate.payload.baseAmount, '12.3456'); assert.equal(candidate.payload.importeBaseCentimos, '1235')
})
test('ASIGNAR_PROVEEDOR compensation restores the entire before version and preserves audit versions', () => {
  const before = initialContract()
  const assignment = prepareVersion('contract', { codigoContratoIsp: '0007', proveedor: 'Adamo', productoId: 'ADAMO', source: 'MANUAL_EXCEPTION' })
  const applied = saved(assignment, before); const effect = decisionEffect(assignment, before)!
  assert.equal(effect.expectedAppliedVersion, applied.version); assert.deepEqual(effect.before, before)
  const compensation = compensationCandidates({ action: 'ASIGNAR_PROVEEDOR', effects: [effect] }, [applied])
  const restored = saved(compensation[0], applied)
  assert.deepEqual(restored.payload, before.payload); assert.equal(restored.version, applied.version + 1)
  assert.equal(restored.sourceHash, before.sourceHash); assert.equal(applied.payload.provider, 'Adamo')
})
test('CONFIRMAR_COSTE compensation restores old aliases, amount and state exactly', () => {
  const before = saved(prepareVersion('cost', { key: 'synthetic-cost', baseAmount: '9.12', status: 'ESTIMADO' }))
  const confirmation = prepareVersion('cost', confirmedCostPayload(before, { action: 'CONFIRMAR_COSTE', amount: '12.3456' }, 1))
  const applied = saved(confirmation, before); const effect = decisionEffect(confirmation, before)!
  const restored = saved(compensationCandidates({ action: 'CONFIRMAR_COSTE', effects: [effect] }, [applied])[0], applied)
  assert.deepEqual(restored.payload, before.payload); assert.equal(restored.payload.baseAmount, '9.12')
  assert.equal(restored.payload.estado, 'ESTIMADO')
})
test('existing rule compensation restores original rule; new rule compensation appends inactive version', () => {
  const original = prepareRule({ type: 'costRule', key: 'synthetic-rule', method: 'INGRESO', period: 'MES', proveedorNombre: 'Fixture', active: true })
  const before = saved(original)
  const changed = prepareRule({ ...before.payload, method: 'EXCLUIR' }); const applied = saved(changed, before)
  const restored = saved(compensationCandidates({ action: 'DESCARTAR', effects: [decisionEffect(changed, before)] }, [applied])[0], applied)
  assert.deepEqual(restored.payload, before.payload)
  const created = saved(original); const effect = decisionEffect(original)!
  assert.equal(effect.before, null)
  const disabled = saved(compensationCandidates({ action: 'DESCARTAR', effects: [effect] }, [created])[0], created)
  assert.equal(disabled.payload.active, false); assert.equal(disabled.version, 2)
  assert.equal(created.payload.active, true)
})
test('reopening fails closed on subsequent economic/rule version, altered hash or missing target', () => {
  const before = initialContract()
  const assignment = prepareVersion('contract', { codigoContratoIsp: '0007', proveedor: 'Adamo', productoId: 'ADAMO', source: 'MANUAL_EXCEPTION' })
  const applied = saved(assignment, before); const effects = [decisionEffect(assignment, before)]
  const later = saved(prepareVersion('contract', { codigoContratoIsp: '0007', precioPeriodo: '120' }, 'ISP_READ'), applied)
  for (const current of [[later], [], [{ ...applied, sourceHash: 'altered' }], [{ ...applied, version: applied.version + 1 }], [{ ...applied, payload: { ...applied.payload, provider: 'tampered' } }]]) {
    assert.throws(() => compensationCandidates({ action: 'ASIGNAR_PROVEEDOR', effects }, current), /REOPEN_REVISION_CONFLICT/)
  }
  assert.throws(() => compensationCandidates({ action: 'CONFIRMAR_COSTE' }, []), /REOPEN_REVIEW_REQUIRED/)
  assert.throws(() => compensationCandidates({ action: 'DESCARTAR', rule: { key: 'legacy' } }, []), /REOPEN_REVIEW_REQUIRED/)
  assert.deepEqual(compensationCandidates({ action: 'DESCARTAR' }, []), [])
})
test('multi-target compensation validates all effects before returning any append candidate', () => {
  const before = initialContract(); const assignment = prepareVersion('contract', { codigoContratoIsp: '0007', proveedor: 'Adamo', productoId: 'ADAMO' })
  const applied = saved(assignment, before)
  const rule = prepareRule({ type: 'tariffRule', key: 'synthetic-rule', matchType: 'EXACT', pattern: 'SYNTHETIC', proveedor: 'Adamo', productoId: 'ADAMO', active: true })
  const appliedRule = saved(rule); const effects = [decisionEffect(assignment, before), decisionEffect(rule)]
  assert.equal(compensationCandidates({ action: 'ASIGNAR_PROVEEDOR', effects }, [applied, appliedRule]).length, 2)
  assert.throws(() => compensationCandidates({ action: 'ASIGNAR_PROVEEDOR', effects }, [applied, { ...appliedRule, version: 2 }]), /REOPEN_REVISION_CONFLICT/)
})
test('repeat resolve/reopen request is identified before effects can create unbounded versions', () => {
  for (const action of ['ASIGNAR_PROVEEDOR', 'CONFIRMAR_COSTE', 'DESCARTAR', 'REABRIR']) {
    const request = { action, exceptionKey: 'synthetic-review' }; const state = action === 'REABRIR' ? 'PENDIENTE' : 'RESUELTA'
    const exception = saved(prepareVersion('exception', { key: 'synthetic-review', estado: state }))
    const decision = saved(prepareVersion('decision', { key: 'decision:synthetic-review', requestHash: sourceHash(request) }))
    assert.equal(isRepeatedDecision(exception, decision, request), true)
    assert.equal(isRepeatedDecision(exception, decision, { ...request, note: 'different' }), false)
    assert.equal(isRepeatedDecision(exception, undefined, request), false)
  }
})
test('histories accept bounded 100-row pages and reject unbounded limits/invalid offsets', () => {
  assert.deepEqual(boundedHistoryPage(), { limit: 100, offset: 0 })
  assert.deepEqual(boundedHistoryPage(100, 100), { limit: 100, offset: 100 })
  for (const limit of [0, -1, 101, 1.5, Infinity]) assert.throws(() => boundedHistoryPage(limit), /INVALID_HISTORY_PAGE/)
  for (const offset of [-1, 1.5, Infinity, 1_000_001]) assert.throws(() => boundedHistoryPage(100, offset), /INVALID_HISTORY_PAGE/)
})
test('annual invoice-month anchor is explicit, never defaulted, and rejected outside annual rules', () => {
  const rule = { type: 'costRule', key: 'synthetic-annual', method: 'INGRESO', period: 'ANUAL', proveedorNombre: 'Fixture' }
  assert.equal(prepareRule(rule).payload.periodAnchor, undefined)
  assert.equal(prepareRule({ ...rule, periodAnchor: 'INVOICE_MONTH' }).payload.periodAnchor, 'INVOICE_MONTH')
  for (const periodAnchor of [null, '', 'JANUARY', 'invoice_month', true]) assert.throws(() => prepareRule({ ...rule, periodAnchor }), /INVALID_PERIOD_ANCHOR/)
  for (const period of ['MES', 'BIMESTRAL_VENCIDO']) assert.throws(() => prepareRule({ ...rule, period, periodAnchor: 'INVOICE_MONTH' }), /INVALID_PERIOD_ANCHOR/)
  assert.doesNotThrow(() => prepareRule({ ...rule, method: 'EXCLUIR', period: 'MES', productoId: 'OTROS' }))
})

const ispStage = { DATABASE_URL: 'postgresql://io_staging_finanzas@fixture.invalid/io_staging_finanzas', FINANCE_STAGING_SANDBOX: '1', VERCEL_ENV: 'preview' }
const accreditedIspEnv = { ...ispStage, RENTABILIDAD_ISP_ADVANCED_REACCREDITED: '1', ISPGESTION_API_URL: 'https://isp.fixture.invalid/api', ISPGESTION_API_USER: 'synthetic', ISPGESTION_API_HASH: 'synthetic' }
const lineExportEnv = { ...ispStage, RENTABILIDAD_EXPORT_ENABLED: '1', RENTABILIDAD_EXPORT_URL: 'https://export.fixture.invalid/lines', RENTABILIDAD_EXPORT_ALLOWED_HOST: 'export.fixture.invalid', RENTABILIDAD_EXPORT_TOKEN: 'synthetic' }
test('ISP configuration is not verified availability; token is required before export capability', () => {
  const configured = ispAvailability({ ...accreditedIspEnv, ...lineExportEnv })
  assert.equal(configured.estado, 'PARCIAL')
  assert.equal(configured.sources.contracts.estado, 'NO_VERIFICADO'); assert.equal(configured.sources.lines.estado, 'NO_VERIFICADO')
  assert.equal(ispAvailability({ ...lineExportEnv, RENTABILIDAD_EXPORT_TOKEN: '' }).lines, false)
  const observed = ispAvailability({ ...accreditedIspEnv, ...lineExportEnv }, { contracts: { estado: 'ERROR', reason: 'ISP_ACCESS_FORBIDDEN', configured: true }, lines: { estado: 'DISPONIBLE', reason: 'VERIFIED', configured: true } })
  assert.equal(observed.estado, 'PARCIAL'); assert.equal(observed.sources.contracts.reason, 'ISP_ACCESS_FORBIDDEN')
})
test('ISP GET direct transport denies production, unexpected endpoint, oversized pages and injected params before network', async () => {
  let calls = 0; const http = async () => { calls++; return new Response('[]') }
  await assert.rejects(() => createIspReadTransport({ ...accreditedIspEnv, VERCEL_ENV: 'production' }, http as any)('contratos_todos', 'GET', { mostrar: 5, pagina: 1 }), /STAGING_REQUIRED/)
  const transport = createIspReadTransport(accreditedIspEnv, http as any)
  for (const params of [{ mostrar: 501, pagina: 1 }, { mostrar: 5, pagina: 201 }, { mostrar: 5, pagina: 1, unknown: 'injected' }]) await assert.rejects(() => transport('contratos_todos', 'GET', params as any), /REQUEST_NOT_ALLOWED/)
  await assert.rejects(() => transport('listado299' as any, 'GET', { mostrar: 5, pagina: 1 }), /REQUEST_NOT_ALLOWED/)
  await assert.rejects(() => transport('contratos_todos', 'POST' as any, { mostrar: 5, pagina: 1 }), /REQUEST_NOT_ALLOWED/)
  assert.equal(calls, 0)
})
test('ISP middleware POST is solely an allow-listed GET envelope and network errors are sanitized', async () => {
  const transport = createIspReadTransport({ ...accreditedIspEnv, RENTABILIDAD_ISP_PROXY_URL: 'https://proxy.fixture.invalid/read', RENTABILIDAD_ISP_PROXY_TOKEN: 'synthetic' }, (async (_url, init) => {
    assert.equal(init?.method, 'POST'); assert.equal(init?.redirect, 'error')
    assert.deepEqual(JSON.parse(String(init?.body)), { endpoint: 'contratos_todos', method: 'GET', data: null, params: { mostrar: 5, pagina: 1 } })
    return new Response('[]')
  }) as typeof fetch)
  assert.deepEqual(await transport('contratos_todos', 'GET', { mostrar: 5, pagina: 1 }), [])
  await assert.rejects(() => createIspReadTransport(accreditedIspEnv, (async () => { throw Error('sensitive provider response must not escape') }) as any)('contratos_todos', 'GET', { mostrar: 5, pagina: 1 }), { message: 'ISP_READ_FAILED' })
  await assert.rejects(() => createIspReadTransport(accreditedIspEnv, (async () => new Response('{}', { status: 403 })) as any)('contratos_todos', 'GET', { mostrar: 5, pagina: 1 }), { message: 'ISP_ACCESS_FORBIDDEN' })
})
test('ISP absent fields never erase titles, manufacture active state or infer provider/period from tariff', async () => {
  const payload = await readIspContracts(async () => [{ id: '7', clienteid: '100', fecha_baja: null }], new Map([['7', '0007']]))
  const row = payload.contracts![0]
  for (const field of ['titulo', 'tarifa', 'estado', 'fechaBaja', 'periodicidadMeses', 'proveedor', 'precioPeriodo']) assert.equal(row[field], undefined)
  const old = initialContract({ active: false, endDate: '2026-09-30' })
  const incoming = prepareVersion('contract', row, 'ISP_READ'); const current = saved(incoming, old)
  assert.equal(current.payload.active, false); assert.equal(current.payload.endDate, '2026-09-30')
  assert.equal(current.payload.provider, 'Aire Networks'); assert.equal(planVersion(incoming, current), null)
  assert.deepEqual(row.sourceLocator, { endpoint: 'contratos_todos', id: '7' })
  await assert.rejects(() => readIspContracts(async () => [{ id: '7', clienteid: '100', precio: 'invalid' }], new Map([['7', '0007']])), /INVALID_MONEY/)
})
test('ISP pagination rejects overfull and repeated pages instead of importing an incomplete inventory', async () => {
  await assert.rejects(() => readIspContracts(async () => Array(501).fill({ id: '7', clienteid: '100' })), /RESPONSE_INVALID/)
  const page = Array.from({ length: 500 }, (_, index) => ({ id: String(index + 1), clienteid: '100' }))
  const codes = new Map(page.map(row => [row.id, `code-${row.id}`]))
  let calls = 0
  await assert.rejects(() => readIspContracts(async (_endpoint, method, params) => { assert.equal(method, 'GET'); assert.equal(params.pagina, ++calls); return page }, codes), /DUPLICATE/)
  assert.equal(calls, 2)
})
test('explicit line export preserves exact decimals, leading zeroes, credits and source locator; missing service period stays documented', async () => {
  const csv = 'CODIGO CONTRATO,CONCEPTO,PRECIO,FECHA\n0007,Abono,-5.5372,01/10/2026\n0008,Cero,0,01/10/2026\n'
  const read = () => readConfiguredLineExport(lineExportEnv, (async (_url, init) => { assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error'); return new Response(csv) }) as typeof fetch)
  const first = await read(), repeated = await read()
  assert.equal(first.sourceHash, repeated.sourceHash); assert.equal(first.payload.lines![0].importeBaseExacto, '-5.5372')
  assert.equal(first.payload.lines![0].codigoContratoIsp, '0007'); assert.equal(first.payload.lines![1].importeBaseExacto, '0')
  assert.deepEqual(first.payload.lines![0].sourceLocator, { endpoint: 'CONFIGURED_REMOTE_EXPORT', row: 2 })
  assert.ok(first.missingFields.includes('SERVICE_PERIOD_UNVERIFIED')); assert.equal(first.payload.lines![0].periodoFuente, 'INVOICE_DATE_FALLBACK')
  assert.equal(prepareLine(first.payload.lines![0]).key, prepareLine(repeated.payload.lines![0]).key)
  let calls = 0
  await assert.rejects(() => readConfiguredLineExport({ ...lineExportEnv, VERCEL_ENV: 'production' }, (async () => { calls++; return new Response(csv) }) as any), /STAGING_REQUIRED/)
  assert.equal(calls, 0)
})
test('explicit service month is preserved and conflicting identity/column count fails closed', async () => {
  const header = 'CODIGO CONTRATO,CONCEPTO,PRECIO,FECHA,MES SERVICIO\n'
  const read = (text: string) => readConfiguredLineExport(lineExportEnv, (async () => new Response(text)) as any)
  const result = await read(header + '0007,Servicio,5.5372,01/10/2026,2026-09\n')
  assert.equal(result.payload.lines![0].mesServicio, '2026-09'); assert.ok(!result.missingFields.includes('SERVICE_PERIOD_UNVERIFIED'))
  await assert.rejects(() => read(header + '0007,Servicio,5.5372,01/10/2026,2026-09\n0007,Servicio,5.5372,01/10/2026,2026-10\n'), /LINE_IDENTITY_COLLISION/)
  await assert.rejects(() => read(header + '0007,Servicio,5.5372,01/10/2026\n'), /COLUMN_COUNT/)
})

test('ISP fractional JSON numbers fail precision accreditation; safe integer and exact text remain valid', async () => {
  const codes = new Map([['7', '0007']])
  await assert.rejects(() => readIspContracts(async () => [{ id: '7', clienteid: '100', precio: 5.5372 }], codes), /MONEY_PRECISION_UNVERIFIED/)
  const integer = await readIspContracts(async () => [{ id: '7', clienteid: '100', precio: 0 }], codes)
  assert.equal(integer.contracts![0].precioPeriodo, '0')
})

test('remote export rejects internal CONTRATOID and conflicting code aliases before attribution', async () => {
  const read = (text: string) => readConfiguredLineExport(lineExportEnv, (async () => new Response(text)) as any)
  await assert.rejects(() => read('CONTRATOID,CONCEPTO,PRECIO,FECHA,MES SERVICIO\n7,Servicio,1,01/10/2026,2026-10\n'), /ISP_CONTRACT_CODE_UNVERIFIED/)
  await assert.rejects(() => read('CODIGO CONTRATO,CONTRATOID,CONCEPTO,PRECIO,FECHA\n0007,7,Servicio,1,01/10/2026\n'), /ISP_CONTRACT_CODE_UNVERIFIED/)
  await assert.rejects(() => read('CODIGO CONTRATO,NUMERO CONTRATO,CONCEPTO,PRECIO,FECHA\n0007,7,Servicio,1,01/10/2026\n'), /ISP_CONTRACT_IDENTITY_CONFLICT/)
  await assert.rejects(() => read('CODIGO CONTRATO,CONCEPTO,PRECIO,FECHA\n,Servicio,1,01/10/2026\n'), /ISP_CONTRACT_IDENTITY_CONFLICT/)
  const correct = await read('CODIGO CONTRATO,NUMERO CONTRATO,CONCEPTO,PRECIO,FECHA\n0007,0007,Servicio,1,01/10/2026\n')
  assert.equal(correct.payload.lines![0].codigoContratoIsp, '0007')
})
