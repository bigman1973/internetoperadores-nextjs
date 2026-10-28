/* Confirming documental: pruebas sintéticas puras. Sin Prisma, DB, red, PDFs ni PII. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildConciliarConfirmingCandidates,
  centsFromExactDecimal,
  hashConfirmingInterestEvidence,
  hashConfirmingInterestSource,
  normalizeConfirmingInvoiceNumber,
  type ConciliarConfirmingCoreInput,
} from '../lib/finanzas/conciliar-confirming-core'

const DOCUMENT = 'doc-confirming-fixture'
const MOVEMENT = 'movement-credit-fixture'
const INVOICE_A = 'invoice-a-fixture'
const INVOICE_B = 'invoice-b-fixture'
const INVOICE_C = 'invoice-c-fixture'
const WRAPPER_A = '11111111-1111-4111-8111-111111111111'
const WRAPPER_B = '22222222-2222-4222-8222-222222222222'
const WRAPPER_C = '33333333-3333-4333-8333-333333333333'

function fixture(overrides: Partial<ConciliarConfirmingCoreInput> = {}): ConciliarConfirmingCoreInput {
  return {
    documentos: [{
      id: DOCUMENT,
      fechaDocumento: '2026-10-10',
      proveedor: 'Draxton sociedad sintética',
      carpetaOrigen: '2026/3. Confirming Draxton 2026/BBVA',
      archivoOneDrive: null,
      oneDriveRutaActual: null,
      oneDriveItemId: 'onedrive-item-fixture',
      oneDriveDriveId: 'onedrive-drive-fixture',
    }],
    lineas: [
      { id: 'line-a', confirmingId: DOCUMENT, numFactura: 'DRAX26/101', importeDecimal: '100.00', interesesDecimal: '1.25', comisionDecimal: '0.25', gastosFinancierosDecimal: '1.50', facturaEmitidaId: INVOICE_A },
      { id: 'line-b', confirmingId: DOCUMENT, numFactura: 'DRAX26/102', importeDecimal: '200.00', interesesDecimal: '2.75', comisionDecimal: '0.00', gastosFinancierosDecimal: '2.75', facturaEmitidaId: INVOICE_B },
    ],
    facturasEmitidas: [
      { id: INVOICE_A, numFactura: 'DRAX26/101', cliente: 'Draxton sociedad A sintética', fecha: '2026-10-01', totalDecimal: '100.00' },
      { id: INVOICE_B, numFactura: 'DRAX26/102', cliente: 'Draxton sociedad B sintética', fecha: '2026-10-02', totalDecimal: '200.00' },
    ],
    documentosB4: [
      { id: WRAPPER_A, facturaEmitidaId: INVOICE_A, activo: true, objetivoCentimos: 10_000, asignadoCentimos: 0 },
      { id: WRAPPER_B, facturaEmitidaId: INVOICE_B, activo: true, objetivoCentimos: 20_000, asignadoCentimos: 0 },
    ],
    movimientos: [{
      id: MOVEMENT,
      fecha: '2026-10-11',
      importeCentimos: 29_575,
      estadoB4: 'SIN_DOCUMENTO',
      banco: 'Santander',
      cuenta: 'Santander operativo sintético',
      concepto: 'Abono confirming sintético',
      tercero: null,
    }],
    ...overrides,
  }
}

function onlyCandidate(input: ConciliarConfirmingCoreInput = fixture()) {
  const result = buildConciliarConfirmingCandidates(input)
  assert.equal(result.candidates.length, 1)
  return result.candidates[0]
}

test('1 importa decimales SQL exactos a céntimos sin redondear ni aceptar fracciones', () => {
  assert.equal(centsFromExactDecimal('1.2'), 120)
  assert.equal(centsFromExactDecimal('-0.01'), -1)
  assert.equal(centsFromExactDecimal('1.234'), null)
  assert.equal(centsFromExactDecimal('NaN'), null)
})

test('2 normaliza número documental sin sustituir identidad de factura', () => {
  assert.equal(normalizeConfirmingInvoiceNumber(' drax26 / 001 '), 'DRAX26/001')
  assert.equal(normalizeConfirmingInvoiceNumber(''), null)
})

test('3 candidatura exacta usa factura, interés y comisión explícitos; gastos históricos no se duplica', () => {
  const candidate = onlyCandidate()
  assert.equal(candidate.estado, 'LISTO_PARA_CONFIRMACION_B4')
  assert.equal(candidate.bancoDepositario, 'Santander', 'La cuenta de abono puede ser distinta del banco del documento')
  assert.equal(candidate.totalFacturasCentimos, 30_000)
  assert.equal(candidate.totalInteresesExplicitosCentimos, 400)
  assert.equal(candidate.totalComisionesExplicitasCentimos, 25)
  assert.equal(candidate.totalLineasB4Centimos, 29_575)
  assert.equal(candidate.importeMovimientoCentimos, 29_575)
  assert.equal(candidate.lineasB4.filter((line) => line.tipo === 'DIFERENCIA' && line.motivoDiferencia === 'INTERESES').length, 1)
  assert.equal(candidate.lineasB4.filter((line) => line.tipo === 'DIFERENCIA' && line.motivoDiferencia === 'COMISION').length, 1)
  assert.equal(candidate.gastosFinancierosHistoricosIgnorados, true)
  assert.equal(candidate.bloqueos.includes('CIERRE_CONFIRMING_NO_EXACTO'), false)
})

test('4 gastos históricos positivos sin interés explícito bloquean: no se calcula como diferencia', () => {
  const input = fixture({
    lineas: fixture().lineas.map((line, index) => index === 0 ? { ...line, interesesDecimal: null } : line),
  })
  const candidate = onlyCandidate(input)
  assert.equal(candidate.estado, 'BLOQUEADO_INTERES_NO_EXPLICITO')
  assert.equal(candidate.bloqueos.includes('INTERES_NO_EXPLICITO'), true)
  assert.equal(candidate.lineasB4.some((line) => line.tipo === 'DIFERENCIA' && line.motivoDiferencia === 'INTERESES' && line.importeCentimos === -125), false)
})

test('5 confirming sin gastos explícitos puede cerrar nominalmente; no exige interés inexistente', () => {
  const base = fixture()
  const input = fixture({
    lineas: base.lineas.map((line) => ({ ...line, interesesDecimal: '0.00', comisionDecimal: '0.00', gastosFinancierosDecimal: '0.00' })),
    movimientos: [{ ...base.movimientos[0], importeCentimos: 30_000 }],
  })
  const candidate = onlyCandidate(input)
  assert.equal(candidate.estado, 'LISTO_PARA_CONFIRMACION_B4')
  assert.equal(candidate.totalInteresesExplicitosCentimos, 0)
  assert.equal(candidate.soportesIntereses.length, 0)
})

test('6 la falta de interés explícito no se convierte en cero aunque exista una comisión exacta', () => {
  const base = fixture()
  const input = fixture({
    lineas: base.lineas.map((line) => ({ ...line, interesesDecimal: null, comisionDecimal: '1.00', gastosFinancierosDecimal: '1.00' })),
    movimientos: [{ ...base.movimientos[0], importeCentimos: 29_800 }],
  })
  const candidate = onlyCandidate(input)
  assert.equal(candidate.estado, 'BLOQUEADO_INTERES_NO_EXPLICITO')
  assert.equal(candidate.bloqueos.includes('INTERES_NO_EXPLICITO'), true)
  assert.equal(candidate.lineasB4.some((line) => line.tipo === 'DIFERENCIA' && line.motivoDiferencia === 'INTERESES'), false)
})

test('7 grupo Draxton es contexto: factura ajena o importe alterado no se reasigna a otra sociedad', () => {
  const base = fixture()
  const candidate = onlyCandidate(fixture({
    lineas: [{ ...base.lineas[0], numFactura: 'DRAX26/999' }, base.lineas[1]],
  }))
  assert.equal(candidate.estado, 'BLOQUEADO_IDENTIDAD_FACTURA')
  assert.equal(candidate.bloqueos.includes('LINEA_NUMERO_FACTURA_NO_COINCIDE'), true)
})

test('8 capacidad B4 ya consumida se bloquea, aunque documento y movimiento parezcan cuadrar', () => {
  const base = fixture()
  const candidate = onlyCandidate(fixture({
    documentosB4: base.documentosB4.map((wrapper) => wrapper.facturaEmitidaId === INVOICE_A ? { ...wrapper, asignadoCentimos: 1 } : wrapper),
  }))
  assert.equal(candidate.estado, 'BLOQUEADO_CAPACIDAD_B4')
  assert.equal(candidate.bloqueos.includes('FACTURA_B4_STALE_O_SIN_CAPACIDAD'), true)
})

test('9 dos documentos exactos para el mismo abono se devuelven ambiguos y no verdes', () => {
  const base = fixture()
  const secondDocument = { ...base.documentos[0], id: 'doc-confirming-fixture-2', oneDriveItemId: 'onedrive-item-fixture-2' }
  const secondLines = base.lineas.map((line) => ({ ...line, id: `${line.id}-two`, confirmingId: secondDocument.id }))
  const result = buildConciliarConfirmingCandidates(fixture({ documentos: [...base.documentos, secondDocument], lineas: [...base.lineas, ...secondLines] }))
  assert.equal(result.candidates.length, 2)
  assert.equal(result.candidates.every((candidate) => candidate.estado === 'REQUIERE_REVISION_AMBIGUEDAD'), true)
  assert.equal(result.candidates.every((candidate) => candidate.bloqueos.includes('MOVIMIENTO_AMBIGUO_ENTRE_DOCUMENTOS')), true)
})

test('10 falta de metadata OneDrive se expone como bloqueo documental, sin fabricarla', () => {
  const base = fixture()
  const candidate = onlyCandidate(fixture({ documentos: [{ ...base.documentos[0], oneDriveDriveId: null }] }))
  assert.equal(candidate.estado, 'BLOQUEADO_DOCUMENTO_INCOMPLETO')
  assert.equal(candidate.bloqueos.includes('DOCUMENTO_SIN_DRIVE_ONEDRIVE'), true)
})

test('11 el hash de soporte cambia con importe/documento/factura pero nunca toma gastos históricos', () => {
  const candidate = onlyCandidate()
  assert.equal(candidate.estado, 'LISTO_PARA_CONFIRMACION_B4')
  const support = candidate.soportesIntereses[0]
  const a = hashConfirmingInterestSource(support)
  const b = hashConfirmingInterestSource({ ...support, importeInteresCentimos: support.importeInteresCentimos + 1 })
  assert.notEqual(a, b)
  assert.match(a, /^[0-9a-f]{64}$/)
})

test('12 un abono puede liquidar un subconjunto único de un PDF de tres facturas; la tercera no consume B4', () => {
  const base = fixture()
  const input = fixture({
    lineas: [
      { id: 'subset-a', confirmingId: DOCUMENT, numFactura: 'DRAX26/101', importeDecimal: '100.00', interesesDecimal: '1.00', comisionDecimal: '0.00', gastosFinancierosDecimal: '1.00', facturaEmitidaId: INVOICE_A },
      { id: 'subset-b', confirmingId: DOCUMENT, numFactura: 'DRAX26/102', importeDecimal: '200.00', interesesDecimal: '2.00', comisionDecimal: '0.00', gastosFinancierosDecimal: '2.00', facturaEmitidaId: INVOICE_B },
      { id: 'subset-c', confirmingId: DOCUMENT, numFactura: 'DRAX26/103', importeDecimal: '400.00', interesesDecimal: '3.00', comisionDecimal: '0.00', gastosFinancierosDecimal: '3.00', facturaEmitidaId: INVOICE_C },
    ],
    facturasEmitidas: [
      ...base.facturasEmitidas,
      { id: INVOICE_C, numFactura: 'DRAX26/103', cliente: 'Draxton sociedad C sintética', fecha: '2026-10-03', totalDecimal: '400.00' },
    ],
    documentosB4: [
      ...base.documentosB4,
      { id: WRAPPER_C, facturaEmitidaId: INVOICE_C, activo: true, objetivoCentimos: 40_000, asignadoCentimos: 0 },
    ],
    movimientos: [{ ...base.movimientos[0], importeCentimos: 29_700 }],
  })
  const candidate = onlyCandidate(input)
  assert.equal(candidate.estado, 'LISTO_PARA_CONFIRMACION_B4')
  assert.deepEqual(candidate.facturas.map((line) => line.confirmingLineaId), ['subset-a', 'subset-b'])
  assert.equal(candidate.totalFacturasCentimos, 30_000)
  assert.equal(candidate.totalInteresesExplicitosCentimos, 300)
  assert.equal(candidate.lineasB4.filter((line) => line.tipo === 'DOCUMENTO').length, 2)
  assert.equal(candidate.soportesIntereses.length, 2)
  assert.equal(candidate.facturas.some((line) => line.confirmingLineaId === 'subset-c'), false)
})

test('13 el hash C10 cubre también la línea PDF no seleccionada, aunque soportes y B4 sólo usen el subconjunto', () => {
  const base = fixture()
  const input = fixture({
    lineas: [
      { id: 'hash-a', confirmingId: DOCUMENT, numFactura: 'DRAX26/101', importeDecimal: '100.00', interesesDecimal: '1.00', comisionDecimal: '0.00', gastosFinancierosDecimal: '1.00', facturaEmitidaId: INVOICE_A },
      { id: 'hash-b', confirmingId: DOCUMENT, numFactura: 'DRAX26/102', importeDecimal: '200.00', interesesDecimal: '2.00', comisionDecimal: '0.00', gastosFinancierosDecimal: '2.00', facturaEmitidaId: INVOICE_B },
      { id: 'hash-c', confirmingId: DOCUMENT, numFactura: 'DRAX26/103', importeDecimal: '400.00', interesesDecimal: '3.00', comisionDecimal: '0.00', gastosFinancierosDecimal: '3.00', facturaEmitidaId: INVOICE_C },
    ],
    facturasEmitidas: [...base.facturasEmitidas, { id: INVOICE_C, numFactura: 'DRAX26/103', cliente: 'Draxton sociedad C sintética', fecha: '2026-10-03', totalDecimal: '400.00' }],
    documentosB4: [...base.documentosB4, { id: WRAPPER_C, facturaEmitidaId: INVOICE_C, activo: true, objetivoCentimos: 40_000, asignadoCentimos: 0 }],
    movimientos: [{ ...base.movimientos[0], importeCentimos: 29_700 }],
  })
  const first = onlyCandidate(input)
  const changed = onlyCandidate({ ...input, lineas: input.lineas.map((line) => line.id === 'hash-c' ? { ...line, interesesDecimal: '4.00', gastosFinancierosDecimal: '4.00' } : line) })
  assert.equal(first.estado, 'LISTO_PARA_CONFIRMACION_B4')
  assert.equal(changed.estado, 'LISTO_PARA_CONFIRMACION_B4')
  assert.deepEqual(first.soportesIntereses.map((line) => line.confirmingLineaId), ['hash-a', 'hash-b'])
  assert.deepEqual(changed.soportesIntereses.map((line) => line.confirmingLineaId), ['hash-a', 'hash-b'])
  assert.notEqual(first.sourceHash, changed.sourceHash)
  assert.match(first.sourceHash ?? '', /^[0-9a-f]{64}$/)
  assert.notEqual(hashConfirmingInterestEvidence({ movimientoId: MOVEMENT, documento: input.documentos[0], lineas: [] }), first.sourceHash)
})

test('14 dos subconjuntos exactos distintos quedan ámbar; no se escoge uno por orden o coste', () => {
  const base = fixture()
  const input = fixture({
    lineas: [
      { id: 'ambiguous-a', confirmingId: DOCUMENT, numFactura: 'DRAX26/101', importeDecimal: '100.00', interesesDecimal: '0.00', comisionDecimal: '0.00', gastosFinancierosDecimal: '0.00', facturaEmitidaId: INVOICE_A },
      { id: 'ambiguous-b', confirmingId: DOCUMENT, numFactura: 'DRAX26/102', importeDecimal: '100.00', interesesDecimal: '0.00', comisionDecimal: '0.00', gastosFinancierosDecimal: '0.00', facturaEmitidaId: INVOICE_B },
      { id: 'ambiguous-c', confirmingId: DOCUMENT, numFactura: 'DRAX26/103', importeDecimal: '400.00', interesesDecimal: '0.00', comisionDecimal: '0.00', gastosFinancierosDecimal: '0.00', facturaEmitidaId: INVOICE_C },
    ],
    facturasEmitidas: [
      { ...base.facturasEmitidas[0], totalDecimal: '100.00' },
      { ...base.facturasEmitidas[1], totalDecimal: '100.00' },
      { id: INVOICE_C, numFactura: 'DRAX26/103', cliente: 'Draxton sociedad C sintética', fecha: '2026-10-03', totalDecimal: '400.00' },
    ],
    documentosB4: [
      ...base.documentosB4.map((wrapper) => wrapper.facturaEmitidaId === INVOICE_B ? { ...wrapper, objetivoCentimos: 10_000 } : wrapper),
      { id: WRAPPER_C, facturaEmitidaId: INVOICE_C, activo: true, objetivoCentimos: 40_000, asignadoCentimos: 0 },
    ],
    movimientos: [{ ...base.movimientos[0], importeCentimos: 10_000 }],
  })
  const candidate = onlyCandidate(input)
  assert.equal(candidate.estado, 'REQUIERE_REVISION_AMBIGUEDAD')
  assert.equal(candidate.bloqueos.includes('SELECCION_CONFIRMING_AMBIGUA'), true)
  assert.equal(candidate.lineasB4.length, 0)
  assert.equal(candidate.facturas.length, 0)
})
