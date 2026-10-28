/* C11 confirming: pruebas sintéticas puras. Sin Prisma, DB, red, PDFs ni PII. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildConfirmingLiquidationCandidates,
  type BuildConfirmingLiquidationCandidatesInput,
} from '../lib/finanzas/confirming-liquidation-candidate-core'
import { c11AuditActors, isRelevantC11LiquidationCandidate } from '../lib/finanzas/confirming-liquidation-runtime'
import { IMPERSONATION_CONTEXT_VERSION } from '../lib/impersonation-policy'
import {
  assessConfirmingLiquidationEvidence,
  hashConfirmingLiquidationEvidence,
  type ConfirmingLiquidationEvidence,
} from '../lib/finanzas/confirming-liquidation-core'
import {
  ConfirmingLiquidationLoaderError,
  loadArchivedConfirmingLiquidation,
  type ArchivedConfirmingInventoryRecord,
  type ArchivedLiquidationManifest,
} from '../lib/finanzas/confirming-liquidation-loader'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const CONFIRMING = 'confirming-synthetic-c11'
const ACCOUNT = 'account-synthetic-c11'
const INVOICE_A = 'invoice-synthetic-a'
const WRAPPER_A = '11111111-1111-4111-8111-111111111111'

function bbvaInventory(): ArchivedConfirmingInventoryRecord[] {
  return [{
    key: 'bbva-liquidacion.pdf', nombre: 'liquidacion-bbva-sintetica.pdf', extension: 'pdf', sha256: HASH_A, status: 'PARSED',
    parsed: {
      banco: 'BBVA', tipoDocumento: 'LIQUIDACION', sourceHash: HASH_A, fechaLiquidacion: '10/10/2026',
      totalRemesa: 100, totalIntereses: 1, totalComisiones: 0.2, totalIvaComision: 0.04, totalDeducir: 1.24,
      netoBancario: 98.76, cuadre: { estado: 'CUADRA' },
      // El caso real BBVA no declara fechaFactura: fechaPago no se reetiqueta
      // como emisión; el manifest aporta la FI registrada canónica.
      lineas: [{ numFactura: 'SYN/001', importe: 100, intereses: 1, comision: 0.2, fechaPago: '15/10/2026' }],
    },
  }]
}

function bbvaManifest(): ArchivedLiquidationManifest {
  return {
    liquidacionKey: 'bbva-c11-synthetic', confirmingId: CONFIRMING, banco: 'BBVA', cuentaDepositariaId: ACCOUNT,
    documentoPrincipal: { inventarioKey: 'bbva-liquidacion.pdf', facturaRecibidaId: CONFIRMING, archivoControladoId: 'controlled-bbva-synthetic', oneDriveDriveId: 'drive-synthetic', oneDriveItemId: 'item-synthetic' },
    detalleFacturasXls: null,
    bindings: [{ facturaEmitidaId: INVOICE_A, numeroFactura: 'SYN/001', confirmingLineaId: 'legacy-line-synthetic', fechaEmisionRegistrada: '2026-10-01' }],
  }
}

function caixaInventory(): ArchivedConfirmingInventoryRecord[] {
  return [
    {
      key: 'caixa-liquidacion.pdf', nombre: 'liquidacion-caixa-sintetica.pdf', extension: 'pdf', sha256: HASH_A, status: 'PARSED',
      parsed: { banco: 'CaixaBank', tipoDocumento: 'LIQUIDACION', sourceHash: HASH_A, fechaLiquidacion: '10/10/2026', totalRemesa: 100, totalIntereses: 1, totalComisiones: 0.2, totalIvaComision: 0.04, totalDeducir: 1.24, netoBancario: 98.76, cuadre: { estado: 'CUADRA' }, lineas: [] },
    },
    {
      key: 'caixa-detalle.xlsx', nombre: 'detalle-caixa-sintetico.xlsx', extension: 'xlsx', sha256: HASH_B, status: 'PARSED',
      parsed: { banco: 'CaixaBank', tipoDocumento: 'DETALLE_FACTURAS', sourceHash: HASH_B, totalRemesa: 0, lineas: [{ numFactura: 'SYN/001', importe: 100, fechaFactura: '05/10/2026', fechaVencimiento: '15/10/2026' }] },
    },
  ]
}

function caixaManifest(): ArchivedLiquidationManifest {
  return {
    liquidacionKey: 'caixa-c11-synthetic', confirmingId: CONFIRMING, banco: 'CAIXABANK', cuentaDepositariaId: ACCOUNT,
    documentoPrincipal: { inventarioKey: 'caixa-liquidacion.pdf', facturaRecibidaId: CONFIRMING, archivoControladoId: 'controlled-caixa-pdf', oneDriveDriveId: 'drive-synthetic', oneDriveItemId: 'item-pdf-synthetic' },
    detalleFacturasXls: { inventarioKey: 'caixa-detalle.xlsx', facturaRecibidaId: 'caixa-xls-fi-synthetic', archivoControladoId: 'controlled-caixa-xls', oneDriveDriveId: 'drive-synthetic', oneDriveItemId: 'item-xls-synthetic' },
    // La fecha literal XLS se conserva; no se fuerza a coincidir con la FI.
    bindings: [{ facturaEmitidaId: INVOICE_A, numeroFactura: 'SYN/001', confirmingLineaId: null, fechaEmisionRegistrada: '2026-10-01' }],
  }
}

function loadedBbva(): ConfirmingLiquidationEvidence {
  return loadArchivedConfirmingLiquidation({ inventory: bbvaInventory(), manifest: bbvaManifest() }).evidence
}

function candidateInput(evidence: ConfirmingLiquidationEvidence = loadedBbva()): BuildConfirmingLiquidationCandidatesInput {
  return {
    liquidaciones: [evidence],
    facturasEmitidas: [{ id: INVOICE_A, numFactura: 'SYN/001', fecha: '2026-10-01', totalCentimos: 10_000 }],
    documentosB4: [{ id: WRAPPER_A, facturaEmitidaId: INVOICE_A, activo: true, objetivoCentimos: 10_000, asignadoCentimos: 0 }],
    movimientos: [{ id: 'movement-synthetic-c11', fecha: '2026-10-11', cuentaId: ACCOUNT, importeCentimos: 9_876, estadoB4: 'SIN_DOCUMENTO' }],
  }
}

test('C11 loader BBVA usa la fecha FI registrada cuando el PDF no declara fechaFactura', () => {
  const result = loadArchivedConfirmingLiquidation({ inventory: bbvaInventory(), manifest: bbvaManifest() })
  assert.equal(result.assessment.cuadroExacto, true)
  assert.equal(result.evidence.lineas[0]?.fechaEmision, '2026-10-01')
  assert.equal(result.evidence.lineas[0]?.fechaEmisionProcedencia, 'FACTURA_EMITIDA_REGISTRADA')
  assert.equal(result.evidence.lineas[0]?.fechaLineaDocumental, null)
  assert.equal(result.evidence.lineas[0]?.fechaVencimiento, '2026-10-15')
  assert.match(result.evidence.sourceHash, /^[a-f0-9]{64}$/)
})

test('C11 loader Caixa conserva la fecha XLS literal sin reinterpretarla como fecha FI', () => {
  const result = loadArchivedConfirmingLiquidation({ inventory: caixaInventory(), manifest: caixaManifest() })
  const line = result.evidence.lineas[0]!
  assert.equal(result.evidence.documentos.length, 2)
  assert.equal(line.fechaEmision, '2026-10-01')
  assert.equal(line.fechaEmisionProcedencia, 'FACTURA_EMITIDA_REGISTRADA')
  assert.equal(line.fechaLineaDocumental, '2026-10-05')
  assert.equal(line.fechaVencimiento, '2026-10-15')
  assert.notEqual(line.fechaLineaDocumental, line.fechaEmision)
})

test('C11 exige una fecha FI registrada si BBVA no declara emisión documental', () => {
  const manifest = bbvaManifest()
  const missingFi = { ...manifest, bindings: [{ ...manifest.bindings[0]!, fechaEmisionRegistrada: undefined }] }
  assert.throws(() => loadArchivedConfirmingLiquidation({ inventory: bbvaInventory(), manifest: missingFi }), (error: unknown) => error instanceof ConfirmingLiquidationLoaderError && error.code === 'FECHA_EMISION_FACTURA_AUSENTE')
})

test('C11 candidato cobra nominal FI completo y preserva INTERESES, COMISION e IVA_COMISION separados', () => {
  const result = buildConfirmingLiquidationCandidates(candidateInput())
  assert.equal(result.candidates.length, 1)
  const candidate = result.candidates[0]!
  assert.equal(candidate.estado, 'LISTO_PARA_CONFIRMACION_B4')
  assert.equal(candidate.nominalCentimos, 10_000)
  assert.equal(candidate.totalLineasB4Centimos, 9_876)
  assert.deepEqual(candidate.lineasB4, [
    { tipo: 'DOCUMENTO', documentoConciliableId: WRAPPER_A, facturaEmitidaId: INVOICE_A, importeCentimos: 10_000 },
    { tipo: 'DIFERENCIA', motivoDiferencia: 'INTERESES', importeCentimos: -100 },
    { tipo: 'DIFERENCIA', motivoDiferencia: 'COMISION', importeCentimos: -20 },
    { tipo: 'DIFERENCIA', motivoDiferencia: 'IVA_COMISION', importeCentimos: -4 },
  ])
  assert.equal(candidate.lineasB4.filter((line) => line.tipo === 'DIFERENCIA').length, 3)
})

test('C11 no absorbe un céntimo faltante en IVA, interés, comisión ni redondeo', () => {
  const input = candidateInput()
  const candidate = buildConfirmingLiquidationCandidates({
    ...input,
    movimientos: [{ ...input.movimientos[0]!, importeCentimos: 9_877 }],
  }).candidates[0]!
  assert.equal(candidate.estado, 'REQUIERE_REVISION_DOCUMENTAL')
  assert.equal(candidate.bloqueos.includes('LIQUIDACION_MOVIMIENTO_NETO_NO_COINCIDE'), true)
  assert.equal(candidate.lineasB4.length, 0)
})

test('C11 exige capacidad B4 FI exacta y no permite splitting por factura', () => {
  const input = candidateInput()
  const candidate = buildConfirmingLiquidationCandidates({
    ...input,
    documentosB4: [{ ...input.documentosB4[0]!, asignadoCentimos: 1 }],
  }).candidates[0]!
  assert.equal(candidate.estado, 'REQUIERE_REVISION_DOCUMENTAL')
  assert.equal(candidate.bloqueos.includes('LIQUIDACION_CAPACIDAD_B4_NO_EXACTA'), true)
  assert.equal(candidate.lineasB4.length, 0)
})

test('C11 mantiene ámbar dos liquidaciones exactas para el mismo movimiento', () => {
  const first = loadedBbva()
  const cloneDraft = { ...first, id: 'bbva-c11-synthetic-2', sourceHash: '' }
  const second: ConfirmingLiquidationEvidence = { ...cloneDraft, sourceHash: hashConfirmingLiquidationEvidence(cloneDraft) }
  const input = candidateInput()
  const result = buildConfirmingLiquidationCandidates({ ...input, liquidaciones: [first, second] })
  assert.equal(result.candidates.length, 2)
  assert.equal(result.candidates.every((candidate) => candidate.estado === 'REQUIERE_REVISION_AMBIGUEDAD'), true)
  assert.equal(result.candidates.every((candidate) => candidate.bloqueos.includes('LIQUIDACION_MOVIMIENTO_AMBIGUO')), true)
})

test('C11 hash cubre procedencia FI y fecha literal documental; no admite mutación silenciosa', () => {
  const evidence = loadArchivedConfirmingLiquidation({ inventory: caixaInventory(), manifest: caixaManifest() }).evidence
  const changed = {
    ...evidence,
    lineas: evidence.lineas.map((line) => ({ ...line, fechaLineaDocumental: '2026-10-06' })),
  }
  assert.notEqual(hashConfirmingLiquidationEvidence({ ...evidence, sourceHash: undefined } as Omit<ConfirmingLiquidationEvidence, 'sourceHash'>), hashConfirmingLiquidationEvidence({ ...changed, sourceHash: undefined } as Omit<ConfirmingLiquidationEvidence, 'sourceHash'>))
  assert.equal(assessConfirmingLiquidationEvidence(changed).bloqueos.includes('LIQUIDACION_HASH_INVALIDO'), true)
})

test('C11 adapter no publica la matriz global: exige cuenta+neto o pista documental de un céntimo', () => {
  const candidate = buildConfirmingLiquidationCandidates(candidateInput()).candidates[0]!
  const unrelated = { id: 'unrelated', fecha: '2026-10-11', cuentaId: 'another-account', importeCentimos: 9_876, estadoB4: 'SIN_DOCUMENTO' as const }
  const offByOneWithoutSignal = { id: 'off-by-one', fecha: '2026-10-11', cuentaId: ACCOUNT, importeCentimos: 9_877, estadoB4: 'SIN_DOCUMENTO' as const }
  const offByOneWithSignal = { ...offByOneWithoutSignal, id: 'off-by-one-signaled' }
  assert.equal(isRelevantC11LiquidationCandidate(candidate, unrelated, { banco: 'Banco sintético', cuenta: 'Otra', concepto: 'Cobro ordinario', tercero: null }), false)
  assert.equal(isRelevantC11LiquidationCandidate(candidate, offByOneWithoutSignal, { banco: 'Banco sintético', cuenta: 'Cuenta C11', concepto: 'Cobro ordinario', tercero: null }), false)
  assert.equal(isRelevantC11LiquidationCandidate(candidate, offByOneWithSignal, { banco: 'Banco sintético', cuenta: 'Cuenta C11', concepto: 'ABONO CONFIRMING', tercero: null }), true)
})

test('C11 mantiene ámbar una liquidación con dos abonos pendientes exactos', () => {
  const input = candidateInput()
  const result = buildConfirmingLiquidationCandidates({ ...input, movimientos: [input.movimientos[0]!, { ...input.movimientos[0]!, id: 'second-synthetic-credit' }] })
  assert.equal(result.candidates.length, 2)
  assert(result.candidates.every(candidate => candidate.estado === 'REQUIERE_REVISION_AMBIGUEDAD'))
  assert(result.candidates.every(candidate => candidate.lineasB4.length === 0))
})

test('C11 una diferencia de más de un céntimo conserva la pista ámbar, sin absorberla', () => {
  const input = candidateInput()
  const movement = { ...input.movimientos[0]!, importeCentimos: 9_886 }
  const candidate = buildConfirmingLiquidationCandidates({ ...input, movimientos: [movement] }).candidates[0]!
  assert.equal(isRelevantC11LiquidationCandidate(candidate, movement, { banco: 'Banco sintético', cuenta: 'Cuenta C11', concepto: 'ABONO CONFIRMING', tercero: null }), true)
  assert.equal(candidate.estado, 'REQUIERE_REVISION_DOCUMENTAL')
  assert.equal(candidate.lineasB4.length, 0)
})

test('C11 auditoría separa actor real y efectivo y rechaza destinos/contextos incoherentes', () => {
  const resolution = { status: 'valid', context: { v: IMPERSONATION_CONTEXT_VERSION, sessionId: '22222222-2222-4222-8222-222222222222', actorId: 201, targetId: 202, reason: null, method: 'POST', path: '/api/admin/finanzas/conciliar', action: 'confirmar', ip: null, ipSource: 'untrusted_proxy' } } as const
  assert.deepEqual(c11AuditActors(202, resolution), { actorRealId: 201, actorEfectivoId: 202 })
  assert.deepEqual(c11AuditActors(202, { status: 'absent' }), { actorRealId: 202, actorEfectivoId: 202 })
  assert.throws(() => c11AuditActors(203, resolution), /identidad efectiva/)
  assert.throws(() => c11AuditActors(202, { status: 'invalid' }), /identidad efectiva/)
})
