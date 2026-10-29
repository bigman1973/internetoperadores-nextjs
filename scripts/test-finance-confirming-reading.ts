/* Confirming reading: pruebas puras sintéticas, sin DB, red, Graph, OCR ni PII. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFinanceConfirmingReading } from '../lib/finanzas/finance-confirming-reading-core'
import { planFinanceConfirmingReadingParser, runFinanceConfirmingReadingParserProposal } from '../lib/finanzas/finance-confirming-reading-event'
import { resolveFinanceConfirmingReadingAccess } from '../lib/finanzas/finance-confirming-reading-access'
import { FinanceConfirmingReadingAdapterError, parseFinanceConfirmingReadingControlledContent } from '../lib/finanzas/finance-confirming-reading-adapter'
import { loadArchivedConfirmingLiquidation, type ArchivedConfirmingInventoryRecord, type ArchivedLiquidationManifest } from '../lib/finanzas/confirming-liquidation-loader'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const ACCOUNT = 'synthetic-account'
const INVOICE = 'synthetic-invoice'
const WRAPPER = '11111111-1111-4111-8111-111111111111'

function bbvaEvidence() {
  const inventory: ArchivedConfirmingInventoryRecord[] = [{
    key: 'synthetic-bbva.pdf', nombre: 'synthetic-bbva.pdf', extension: 'pdf', sha256: HASH_A, status: 'PARSED',
    parsed: { banco: 'BBVA', tipoDocumento: 'LIQUIDACION', sourceHash: HASH_A, fechaLiquidacion: '10/10/2026', totalRemesa: 100, totalIntereses: 1, totalComisiones: 0.2, totalIvaComision: 0.04, totalDeducir: 1.24, netoBancario: 98.76, cuadre: { estado: 'CUADRA' }, lineas: [{ numFactura: 'SYN/001', importe: 100, intereses: 1, comision: 0.2, fechaPago: '11/10/2026' }] },
  }]
  const manifest: ArchivedLiquidationManifest = {
    liquidacionKey: 'synthetic-liquidation', confirmingId: 'synthetic-confirming', banco: 'BBVA', cuentaDepositariaId: ACCOUNT,
    documentoPrincipal: { inventarioKey: 'synthetic-bbva.pdf', facturaRecibidaId: 'synthetic-confirming', archivoControladoId: 'synthetic-controlled', oneDriveDriveId: null, oneDriveItemId: null }, detalleFacturasXls: null,
    bindings: [{ facturaEmitidaId: INVOICE, numeroFactura: 'SYN/001', confirmingLineaId: 'synthetic-line', fechaEmisionRegistrada: '2026-10-01' }],
  }
  return loadArchivedConfirmingLiquidation({ inventory, manifest }).evidence
}

function inputFor(evidence = bbvaEvidence()) {
  return {
    evidence,
    fuentesControladas: evidence.documentos.map((document) => ({ archivoPrivadoId: `private-${document.id}`, evidenciaDocumentoId: document.id, rol: document.rol as 'LIQUIDACION_PDF', hashBinario: document.hashBinario, versionContenido: 'synthetic-v1' })),
    candidatos: {
      facturasEmitidas: [{ id: INVOICE, numFactura: 'SYN/001', fecha: '2026-10-01', totalCentimos: 10_000 }],
      documentosB4: [{ id: WRAPPER, facturaEmitidaId: INVOICE, activo: true, objetivoCentimos: 10_000, asignadoCentimos: 0 }],
      movimientos: [{ id: 'synthetic-credit', fecha: '2026-10-11', cuentaId: ACCOUNT, importeCentimos: 9_876, estadoB4: 'SIN_DOCUMENTO' as const }],
    },
  }
}

test('lectura exacta C11 publica sólo una propuesta humana, sin B4 automático', () => {
  const result = buildFinanceConfirmingReading(inputFor())
  assert.equal(result.propuestas.length, 1)
  assert.equal(result.revisarLectura.length, 0)
  assert.equal(result.confirmacionesB4Automaticas, false)
  assert.equal(result.propuestas[0]?.confirmarB4Automaticamente, false)
  assert.equal(result.propuestas[0]?.estadoVisual, 'PROPUESTA_PENDIENTE_REVISION_HUMANA')
})

test('descuadre de un céntimo entra en Revisar lectura, nunca propuesta parcial verde', () => {
  const input = inputFor()
  const result = buildFinanceConfirmingReading({ ...input, candidatos: { ...input.candidatos, movimientos: [{ ...input.candidatos.movimientos[0]!, importeCentimos: 9_877 }] } })
  assert.equal(result.propuestas.length, 0)
  assert.equal(result.revisarLectura.length, 1)
  assert.equal(result.revisarLectura[0]?.motivo, 'NETO_BANCARIO_NO_COINCIDE')
})

test('evento repetido conserva dedupe key y no vuelve a procesar contenido idéntico', async () => {
  const event = { kind: 'ARCHIVO_NUEVO' as const, archivoPrivadoId: 'private-synthetic', versionContenido: 'v1', hashBinario: HASH_A, tipoDetectado: 'BBVA_PDF' as const, hashProcesadoAnterior: null }
  const first = planFinanceConfirmingReadingParser(event)
  const repeated = planFinanceConfirmingReadingParser({ ...event, hashProcesadoAnterior: HASH_A })
  assert.equal(first.kind, 'EJECUTAR_PARSER_PARA_PROPUESTA')
  assert.equal(repeated.kind, 'SIN_CAMBIO')
  assert.equal(first.dedupeKey, repeated.dedupeKey)
  let parserCalls = 0
  const run = await runFinanceConfirmingReadingParserProposal({ plan: first, parseControlledContent: async () => { parserCalls++; return { synthetic: true } } })
  assert.deepEqual(run.parsed, { synthetic: true })
  assert.equal(run.confirmarB4Automaticamente, false)
  assert.equal(parserCalls, 1)
})

test('Caixa aislado exige pareja explícita y queda fuera de propuesta final', () => {
  const plan = planFinanceConfirmingReadingParser({ kind: 'CONTENIDO_CAMBIADO', archivoPrivadoId: 'private-caixa-pdf', versionContenido: 'v2', hashBinario: HASH_B, tipoDetectado: 'CAIXA_PDF', hashProcesadoAnterior: null })
  assert.equal(plan.kind, 'EJECUTAR_PARSER_PARA_PROPUESTA')
  assert.equal(plan.requiereParejaCaixaExplicita, true)
  assert.equal(plan.confirmarB4Automaticamente, false)
})

test('adaptador rechaza un plan no ejecutable antes de abrir contenido', async () => {
  const plan = planFinanceConfirmingReadingParser({ kind: 'ARCHIVO_NUEVO', archivoPrivadoId: 'private-unknown', versionContenido: 'v1', hashBinario: HASH_A, tipoDetectado: 'OTRO', hashProcesadoAnterior: null })
  await assert.rejects(
    () => parseFinanceConfirmingReadingControlledContent({ plan, contenidoControlado: Buffer.from('synthetic'), nombreOriginal: 'synthetic.bin' }),
    (error: unknown) => error instanceof FinanceConfirmingReadingAdapterError && error.code === 'PLAN_NO_EJECUTABLE',
  )
})

test('adaptador bloquea contenido cambiado antes de ejecutar el parser', async () => {
  const plan = planFinanceConfirmingReadingParser({ kind: 'ARCHIVO_NUEVO', archivoPrivadoId: 'private-bbva', versionContenido: 'v1', hashBinario: HASH_A, tipoDetectado: 'BBVA_PDF', hashProcesadoAnterior: null })
  await assert.rejects(
    () => parseFinanceConfirmingReadingControlledContent({ plan, contenidoControlado: Buffer.from('contenido-sintetico-distinto'), nombreOriginal: 'synthetic.pdf' }),
    (error: unknown) => error instanceof FinanceConfirmingReadingAdapterError && error.code === 'FUENTE_CAMBIADA',
  )
})

test('archivo no controlado o duplicado pasa a bandeja con motivo y archivo privado', () => {
  const input = inputFor()
  const source = input.fuentesControladas[0]!
  const result = buildFinanceConfirmingReading({ ...input, fuentesControladas: [{ ...source, hashBinario: HASH_B }, { ...source }] })
  assert.equal(result.propuestas.length, 0)
  assert.equal(result.revisarLectura.some(item => item.motivo === 'ARCHIVO_PRIVADO_NO_CONTROLADO'), true)
  assert.equal(result.revisarLectura.some(item => item.motivo === 'ARCHIVO_PRIVADO_DUPLICADO'), true)
  assert.equal(result.revisarLectura.every(item => item.confirmarB4Automaticamente === false), true)
})

test('Revisar lectura queda dentro de Conciliar y Para pedir no concede acceso financiero', () => {
  const denied = resolveFinanceConfirmingReadingAccess({ puedeConciliar: false, puedeParaPedir: true })
  const allowed = resolveFinanceConfirmingReadingAccess({ puedeConciliar: true, puedeParaPedir: true })
  assert.equal(denied.puedeVer, false)
  assert.equal(allowed.seccion, 'CONCILIAR_REVISAR_LECTURA')
  assert.equal(allowed.puedeConfirmarB4, false)
  assert.equal(allowed.amplíaPermisosFinanzas, false)
})

console.log('OK: confirming reader only proposes, preserves C11 gates, queues incomplete/uncertain sources and never auto-confirms B4.')
