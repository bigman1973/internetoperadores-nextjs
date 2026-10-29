/*
 * Batería C11/P2 confirming integrada.
 * Fixtures inyectados y mocks SQL solamente: sin DB, red, Graph, OCR, PDFs/XLS
 * reales, migraciones ni B4. Verifica la frontera prepare -> lifecycle -> apply.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { Prisma } from '@prisma/client'
import {
  FINANCE_CONFIRMING_READING_QUEUE_SCHEMA,
  parseFinanceConfirmingReadingQueueDto,
  unavailableFinanceConfirmingReadingQueue,
} from '../../../lib/finanzas/finance-confirming-reading-contract'
import {
  FinanceConfirmingReadingP2Error,
  prepareFinanceConfirmingReadingP2,
  persistPreparedFinanceConfirmingReadingP2Tx,
  type FinanceConfirmingReadingP2Prepared,
  type FinanceConfirmingReadingRegisteredSource,
} from '../../../lib/finanzas/finance-confirming-reading-p2'
import { prepareOneDriveConfirmingReading } from '../../../lib/finanzas/sync-jobs/providers/onedrive/confirming-reading'
import {
  FinanceConfirmingReadingPersistedError,
  MAX_FINANCE_CONFIRMING_READING_QUEUE,
  readPersistedFinanceConfirmingReadingQueue,
} from '../../../lib/finanzas/finance-confirming-reading-persisted'
import type { ConfirmingParseResult } from '../../../lib/finanzas/confirming-parser'

const LIFE = '44444444-4444-4444-8444-444444444444'
const SNAP = '55555555-5555-4555-8555-555555555555'
const LIQ = '66666666-6666-4666-8666-666666666666'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const REGISTERED: FinanceConfirmingReadingRegisteredSource = {
  facturaRecibidaId: 'fr-confirming-synthetic',
  archivoControladoId: 'archive-confirming-synthetic',
  oneDriveDriveId: 'drive-synthetic',
  oneDriveItemId: 'item-synthetic',
}

function hash(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex') }
function p2Source(overrides: Record<string, unknown> = {}) {
  return {
    archivoPrivadoId: 'private-synthetic', versionContenido: 'v1', hashBinario: HASH_A,
    tipoDetectado: 'BBVA_PDF' as const, hashProcesadoAnterior: null, parejaCaixaDeclaradaId: null,
    ...overrides,
  }
}
function parseBbva(sourceHash: string): ConfirmingParseResult {
  return {
    banco: 'BBVA', tipoDocumento: 'LIQUIDACION', sourceHash, fechaLiquidacion: '10/10/2026', cuentaAbono: 'ES91 2100 0418 4502 0005 1332',
    totalRemesa: 100, totalIntereses: 1, totalComisiones: 0.2, totalIvaComision: 0.04, totalDeducir: 1.24, netoBancario: 98.76,
    cuadre: { estado: 'CUADRA' }, lineas: [{ numFactura: 'DRAX26/1', importe: 100, intereses: 1, comision: 0.2, fechaPago: '15/10/2026' }],
  }
}
function parseCaixaPdf(sourceHash: string): ConfirmingParseResult {
  return {
    banco: 'CaixaBank', tipoDocumento: 'LIQUIDACION', sourceHash, fechaLiquidacion: '10/10/2026', cuentaAbono: 'ES91 2100 0418 4502 0005 1332',
    totalRemesa: 100, totalIntereses: 1, totalComisiones: 0.2, totalIvaComision: 0.04, totalDeducir: 1.24, netoBancario: 98.76,
    cuadre: { estado: 'CUADRA' }, lineas: [],
  }
}
function parseCaixaXls(sourceHash: string): ConfirmingParseResult {
  return {
    banco: 'CaixaBank', tipoDocumento: 'DETALLE_FACTURAS', sourceHash,
    totalRemesa: 100, cuadre: { estado: 'NO_VERIFICABLE' },
    lineas: [{ numFactura: 'DRAX26/1', importe: 100, fechaFactura: '01/10/2026', fechaVencimiento: '15/10/2026' }],
  }
}
function portFor(result: ConfirmingParseResult) {
  return {
    parseBBVA: async () => result,
    parseCaixaPdf: async () => result,
    parseCaixaXls: () => result,
  }
}
function sum(overrides: Record<string, unknown> = {}) {
  return {
    nominalCentimos: 10_000, facturasDocumentales: 1, interesesCentimos: 100,
    comisionCentimos: 20, ivaComisionCentimos: 4, netoBancarioCentimos: 9_876,
    cuentaDepositariaDeclarada: true, ...overrides,
  }
}
function rawSource(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111', resolutionKey: `SNAPSHOT:${SNAP}`, attemptKind: 'FUENTE',
    lifecycleId: LIFE, snapshotId: SNAP, versionDocumento: 1, sourceHash: HASH_A,
    sourceRole: 'LIQUIDACION_PDF', parser: 'C11_BBVA_PDF_PAGINA_2_COLUMNAS_FISICAS', banco: 'BBVA', parejaCaixaDeclaradaId: null,
    motivos: [], resumen: sum(), outcome: 'ELEGIBLE_C11', liquidacionId: null, movimientoId: null, capturedAt: '2026-10-29T12:00:00.000Z', ...overrides,
  }
}
function rawFinal(overrides: Record<string, unknown> = {}) {
  return {
    ...rawSource(), id: '22222222-2222-4222-8222-222222222222', attemptKind: 'RESULTADO_C11', sourceRole: 'EVIDENCIA_C11', parser: null,
    outcome: 'PROPUESTA_CONFIRMACION_HUMANA', liquidacionId: LIQ, movimientoId: 'movement-synthetic', capturedAt: '2026-10-29T12:01:00.000Z', ...overrides,
  }
}
function fakeQueueDb(rows: unknown[], tableExists = true) {
  let calls = 0
  return {
    get calls() { return calls },
    async $queryRaw<T>() { calls += 1; return (calls === 1 ? [{ exists: tableExists }] : rows) as T },
  }
}
function sqlText(query: Prisma.Sql): string { return query.strings.join('?') }

async function exactBbvaPrepared() {
  const bytes = new Uint8Array([1, 2, 3, 4])
  const result = parseBbva(hash(bytes))
  return prepareFinanceConfirmingReadingP2({ source: p2Source({ hashBinario: result.sourceHash }), contenidoControlado: bytes, nombreOriginal: 'DPC_confirming.pdf', parserPort: portFor(result) })
}

test('01 BBVA exacto prepara PERSISTIR_PROPUESTA, declara IBAN literal y nunca auto-confirma B4', async () => {
  const prepared = await exactBbvaPrepared()
  assert.equal(prepared.kind, 'PERSISTIR_PROPUESTA')
  assert.deepEqual(prepared.resumen?.motivos, [])
  assert.equal(prepared.resumen?.resumen.cuentaDepositariaDeclarada, true)
  assert.equal(prepared.confirmarB4Automaticamente, false)
  assert.equal(prepared.noEscriturasB4, true)
  assert.equal(prepared.parsePrivado?.cuentaAbonoLiteral?.startsWith('ES91'), true)
})

test('02 un céntimo BBVA no se absorbe y cae en revisión', async () => {
  const bytes = new Uint8Array([5, 6, 7])
  const result = { ...parseBbva(hash(bytes)), netoBancario: 98.77, cuadre: { estado: 'DESCUADRE' as const } }
  const prepared = await prepareFinanceConfirmingReadingP2({ source: p2Source({ hashBinario: result.sourceHash }), contenidoControlado: bytes, nombreOriginal: 'DPC_confirming.pdf', parserPort: portFor(result) })
  assert.equal(prepared.kind, 'PERSISTIR_REVISION')
  assert.equal(prepared.resumen?.motivos.includes('CUADRE_C11_NO_EXACTO'), true)
})

test('03 Caixa PDF sin pairing declarado queda en revisión explícita', async () => {
  const bytes = new Uint8Array([8, 9, 10])
  const result = parseCaixaPdf(hash(bytes))
  const prepared = await prepareFinanceConfirmingReadingP2({
    source: p2Source({ hashBinario: result.sourceHash, tipoDetectado: 'CAIXA_PDF', parejaCaixaDeclaradaId: null }),
    contenidoControlado: bytes, nombreOriginal: 'Caixa.pdf', parserPort: portFor(result),
  })
  assert.equal(prepared.kind, 'PERSISTIR_REVISION')
  assert.equal(prepared.resumen?.motivos.includes('PAREJA_CAIXA_PDF_XLS_NO_DECLARADA'), true)
})

test('04 Caixa PDF y XLS con la misma pareja declarada son elegibles individualmente para C11', async () => {
  const pdfBytes = new Uint8Array([11, 12, 13])
  const xlsBytes = new Uint8Array([14, 15, 16])
  const pdf = parseCaixaPdf(hash(pdfBytes))
  const xls = parseCaixaXls(hash(xlsBytes))
  const pdfPrepared = await prepareFinanceConfirmingReadingP2({
    source: p2Source({ hashBinario: pdf.sourceHash, tipoDetectado: 'CAIXA_PDF', parejaCaixaDeclaradaId: 'pair-controlled-1' }),
    contenidoControlado: pdfBytes, nombreOriginal: 'Caixa.pdf', parserPort: portFor(pdf),
  })
  const xlsPrepared = await prepareOneDriveConfirmingReading({
    source: p2Source({ archivoPrivadoId: 'private-xls', hashBinario: xls.sourceHash, tipoDetectado: 'CAIXA_XLS', parejaCaixaDeclaradaId: 'pair-controlled-1' }),
    bytes: xlsBytes, originalName: 'Caixa.xlsx', parserPort: portFor(xls),
  })
  assert.equal(pdfPrepared.kind, 'PERSISTIR_PROPUESTA')
  assert.equal(xlsPrepared.kind, 'PERSISTIR_PROPUESTA')
  assert.equal(xlsPrepared.resumen?.sourceRole, 'DETALLE_FACTURAS_XLS')
  assert.equal(pdfPrepared.resumen?.motivos.length, 0)
  assert.equal(xlsPrepared.resumen?.motivos.length, 0)
})

test('05 contenido idéntico no parsea ni escribe', async () => {
  const bytes = new Uint8Array([17, 18])
  const prepared = await prepareFinanceConfirmingReadingP2({
    source: p2Source({ hashBinario: hash(bytes), hashProcesadoAnterior: hash(bytes) }), contenidoControlado: bytes, nombreOriginal: 'same.pdf',
  })
  assert.equal(prepared.kind, 'SIN_CAMBIO')
  assert.equal(prepared.parsePrivado, null)
})

test('06 persistencia P2 exige snapshot archivado, fuente FI registrada y devuelve elegible', async () => {
  const prepared = await exactBbvaPrepared()
  const seen: string[] = []
  const tx = {
    async $queryRaw<T>(query: Prisma.Sql) {
      const text = sqlText(query); seen.push(text)
      if (text.includes('FROM document_version_snapshots')) return [{ id: SNAP }] as T
      if (text.includes('FROM facturas_recibidas')) return [{ id: REGISTERED.facturaRecibidaId }] as T
      if (text.includes('FROM confirming_reading_attempts')) return [] as T
      if (text.includes('INSERT INTO confirming_reading_attempts')) return [] as T
      throw new Error(`unexpected SQL: ${text}`)
    },
  }
  const persisted = await persistPreparedFinanceConfirmingReadingP2Tx(tx, { actorId: 7, snapshot: { lifecycleId: LIFE, snapshotId: SNAP, versionDocumento: 1 }, prepared, registeredSource: REGISTERED })
  assert.equal(persisted.outcome, 'ELEGIBLE_C11')
  assert.equal(persisted.persisted, true)
  assert.equal(seen.some((query) => query.includes('INSERT INTO confirming_reading_attempts')), true)
  assert.equal(seen.some((query) => query.includes('documentos_conciliables')), true)
  assert.equal(seen.some((query) => query.includes('onedrive_drive_id')), true)
})

test('07 persistencia P2 no consulta nada para SIN_CAMBIO y rechaza actor no vivo', async () => {
  const bytes = new Uint8Array([19, 20])
  const unchanged = await prepareFinanceConfirmingReadingP2({ source: p2Source({ hashBinario: hash(bytes), hashProcesadoAnterior: hash(bytes) }), contenidoControlado: bytes, nombreOriginal: 'same.pdf' })
  let calls = 0
  const tx = { async $queryRaw<T>() { calls += 1; return [] as T } }
  const noChange = await persistPreparedFinanceConfirmingReadingP2Tx(tx, { actorId: 7, snapshot: { lifecycleId: LIFE, snapshotId: SNAP, versionDocumento: 1 }, prepared: unchanged, registeredSource: REGISTERED })
  assert.equal(noChange.outcome, 'SIN_CAMBIOS')
  assert.equal(calls, 0)
  await assert.rejects(() => persistPreparedFinanceConfirmingReadingP2Tx(tx, { actorId: 0, snapshot: { lifecycleId: LIFE, snapshotId: SNAP, versionDocumento: 1 }, prepared: unchanged, registeredSource: REGISTERED }), (error: unknown) => error instanceof FinanceConfirmingReadingP2Error && error.code === 'CONFIRMING_READING_P2_ACTOR_REQUIRED')
})

test('08 cola publica una propuesta humana C11 exacta, sin hash/snapshot/IBAN ni escritura B4', async () => {
  const dto = await readPersistedFinanceConfirmingReadingQueue(fakeQueueDb([rawFinal(), rawSource()]))
  const entry = dto.entries[0]!
  assert.equal(entry.kind, 'PROPUESTA_CONFIRMACION_HUMANA')
  assert.equal(entry.liquidacionId, LIQ)
  assert.equal(entry.movimientoId, 'movement-synthetic')
  assert.equal(entry.propuesta?.requiereConfirmacionHumana, true)
  assert.equal(entry.confirmarB4Automaticamente, false)
  const serialized = JSON.stringify(dto)
  assert.equal(serialized.includes(HASH_A), false)
  assert.equal(serialized.includes(LIFE), false)
  assert.equal(serialized.includes(SNAP), false)
  assert.equal(serialized.includes('ES91'), false)
})

test('09 cola conserva sólo dudosos en Revisar: Caixa sin pareja y descuadre de céntimo', async () => {
  const noPair = rawSource({ banco: 'CAIXABANK', parser: 'C11_CAIXA_PDF', parejaCaixaDeclaradaId: null, sourceHash: HASH_B, resolutionKey: `SNAPSHOT:${SNAP}`, outcome: 'REVISAR', motivos: ['PAREJA_CAIXA_PDF_XLS_NO_DECLARADA'] })
  const centsOff = rawSource({ id: '33333333-3333-4333-8333-333333333333', sourceHash: 'c'.repeat(64), resolutionKey: 'SNAPSHOT:independent-synthetic-source', resumen: sum({ netoBancarioCentimos: 9_877 }), outcome: 'REVISAR', motivos: [] })
  const dto = await readPersistedFinanceConfirmingReadingQueue(fakeQueueDb([noPair, centsOff]))
  assert.equal(dto.entries.length, 2)
  assert.equal(dto.entries.every((entry) => entry.kind === 'REVISAR_LECTURA'), true)
  assert.equal(dto.entries.some((entry) => entry.motivos.includes('PAREJA_CAIXA_PDF_XLS_NO_DECLARADA')), true)
  assert.equal(dto.entries.some((entry) => entry.motivos.includes('CUADRE_C11_NO_EXACTO')), true)
})

test('10 resultado C11 posterior sustituye su revisión previa sin borrar la auditoría de fuente', async () => {
  const sourceReview = rawSource({ outcome: 'REVISAR', motivos: ['PAREJA_CAIXA_PDF_XLS_INCOMPLETA'], banco: 'CAIXABANK', parser: 'C11_CAIXA_PDF', parejaCaixaDeclaradaId: 'pair-controlled-1', resolutionKey: 'CAIXA:pair-controlled-1' })
  const final = rawFinal({ resolutionKey: 'CAIXA:pair-controlled-1', banco: 'CAIXABANK', parejaCaixaDeclaradaId: 'pair-controlled-1' })
  const dto = await readPersistedFinanceConfirmingReadingQueue(fakeQueueDb([final, sourceReview]))
  assert.equal(dto.entries.length, 1)
  assert.equal(dto.entries[0]?.kind, 'PROPUESTA_CONFIRMACION_HUMANA')
})

test('11 DTO, ausencia de tabla y truncamiento fallan cerradamente', async () => {
  assert.equal(unavailableFinanceConfirmingReadingQueue().state, 'UNAVAILABLE')
  assert.equal((await readPersistedFinanceConfirmingReadingQueue(fakeQueueDb([], false))).state, 'UNAVAILABLE')
  assert.equal(parseFinanceConfirmingReadingQueueDto({ schema: FINANCE_CONFIRMING_READING_QUEUE_SCHEMA, state: 'AVAILABLE', updatedAt: null, entries: [{ bad: true }], unavailableCode: null }), null)
  const rows = Array.from({ length: MAX_FINANCE_CONFIRMING_READING_QUEUE * 4 + 1 }, (_, index) => rawSource({ id: `${String(index + 100).padStart(8, '0')}-0000-4000-8000-000000000000` }))
  await assert.rejects(() => readPersistedFinanceConfirmingReadingQueue(fakeQueueDb(rows)), (error: unknown) => error instanceof FinanceConfirmingReadingPersistedError && error.code === 'LECTURA_CONFIRMING_PERSISTIDA_TRUNCADA')
})

console.log('OK C11/P2: BBVA y Caixa sintéticos, parser inyectado, lifecycle/SQL simulados; sin DB/red/Graph/OCR/B4.')
