/*
 * Verificación temporal de la pieza e: fake provider, mocks SQL y bytes sintéticos.
 * No abre DB/red/Graph/OCR, no cambia fixtures del repositorio y no crea B4/cobros.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { FakeOcrPort, FakeOneDriveDomainPort, FakeOneDriveReadPort } from '../lib/finanzas/sync-jobs/providers/onedrive/fake-provider'
import { FACTURAS_BASE_PATH, OneDriveSyncProvider, type RegisteredConfirmingSupport } from '../lib/finanzas/sync-jobs/providers/onedrive/provider'
import type { GraphFile } from '../lib/finanzas/sync-jobs/providers/onedrive/graph-read'
import type { OneDriveDocumentLifecyclePort, OneDriveLifecycleApplyInput, OneDriveLifecycleApplyResult } from '../lib/finanzas/sync-jobs/providers/onedrive/document-lifecycle'
import { loadArchivedConfirmingLiquidation } from '../lib/finanzas/confirming-liquidation-loader'
import { extractBBVACesionNominalLines, type ConfirmingParseResult } from '../lib/finanzas/confirming-parser'
import type { FinanceConfirmingReadingParserPort } from '../lib/finanzas/finance-confirming-reading-adapter'

const ROOT = FACTURAS_BASE_PATH
const FOLDER = `${ROOT}/3. Confirming Draxton 2026`
const DRIVE = 'drive-e2e'
const ACTOR = 94
const LIFECYCLE = '11111111-1111-4111-8111-111111111111'
const SNAPSHOT = '22222222-2222-4222-8222-222222222222'
const REGISTRY_A = '33333333-3333-4333-8333-333333333333'
const REGISTRY_B = '44444444-4444-4444-8444-444444444444'
const REGISTRY_C = '55555555-5555-4555-8555-555555555555'

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00])
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const SQL = (query: Prisma.Sql) => query.strings.join('?')

function file(id: string, name: string, bytes: Uint8Array): GraphFile {
  return {
    id, name, size: bytes.byteLength, eTag: `etag-${id}`, cTag: `ctag-${id}`, sourceVersion: `v-${id}`,
    lastModifiedDateTime: '2026-10-29T12:00:00.000Z', file: { mimeType: name.endsWith('.xls') ? 'application/vnd.ms-excel' : 'application/pdf' },
    relativeFolderPath: FOLDER, folderPath: FOLDER, fullPath: `${FOLDER}/${name}`,
  }
}

function support(registroSoporteId: string, itemId: string, tipoDetectado: RegisteredConfirmingSupport['tipoDetectado'], parejaCaixaDeclaradaId: string | null): RegisteredConfirmingSupport {
  return { registroSoporteId, facturaRecibidaId: `support-${itemId}`, oneDriveDriveId: DRIVE, oneDriveItemId: itemId, tipoDetectado, parejaCaixaDeclaradaId, hashProcesadoAnterior: null }
}

class LifecycleMock implements OneDriveDocumentLifecyclePort<object> {
  readonly applies: OneDriveLifecycleApplyInput[] = []
  async readCurrent() { return null }
  async verifyCurrent() { return 'CURRENT' as const }
  async apply(_tx: object, input: OneDriveLifecycleApplyInput): Promise<OneDriveLifecycleApplyResult> {
    this.applies.push(input)
    return { outcome: 'CREATED', plan: null, lifecycleId: LIFECYCLE, snapshotId: SNAPSHOT, versionNumber: 1, metadataUnavailable: false, duplicate: null }
  }
}

/* SQL mock only recognizes structural query fragments; it never stores data. */
class BridgeAmberTx {
  readonly queries: string[] = []
  constructor(private readonly sourceId: string) {}
  async $queryRaw<T>(query: Prisma.Sql): Promise<T> {
    const sql = SQL(query)
    this.queries.push(sql)
    if (sql.includes('FROM document_version_snapshots s')) return [{ id: SNAPSHOT }] as T
    if (sql.includes('FROM confirming_reading_support_sources r')) return [{ id: this.sourceId }] as T
    if (sql.includes('FROM confirming_reading_attempts a') && sql.includes('source_role')) return [] as T
    if (sql.includes('FROM confirming_reading_attempts')) return [] as T
    if (sql.includes('INSERT INTO confirming_reading_attempts')) return [] as T
    throw new Error('UNEXPECTED_E2E_SQL')
  }
}

function parseBbva(bytes: Uint8Array): ConfirmingParseResult {
  return {
    banco: 'BBVA', tipoDocumento: 'LIQUIDACION', sourceHash: hash(bytes), fechaLiquidacion: '29/10/2026', cuentaAbono: 'ES91 2100 0418 4502 0005 1332',
    totalRemesa: 100, totalIntereses: 1, totalComisiones: 0.2, totalIvaComision: 0.04, totalDeducir: 1.24, netoBancario: 98.76,
    cuadre: { estado: 'CUADRA' },
    // Parser test coverage establishes the physical page-2 column read; this is its controlled output.
    lineas: [{ numFactura: 'DRAX26/201', importe: 100, intereses: 1, comision: 0.2, fechaPago: '29/10/2026' }],
  }
}
function parseCaixaPdf(bytes: Uint8Array): ConfirmingParseResult {
  return {
    banco: 'CaixaBank', tipoDocumento: 'LIQUIDACION', sourceHash: hash(bytes), fechaLiquidacion: '29/10/2026', cuentaAbono: 'ES91 2100 0418 4502 0005 1332',
    totalRemesa: 100, totalIntereses: 1, totalComisiones: 0.2, totalIvaComision: 0.04, totalDeducir: 1.24, netoBancario: 98.76,
    cuadre: { estado: 'CUADRA' }, lineas: [],
  }
}
function parseCaixaXls(bytes: Uint8Array): ConfirmingParseResult {
  return {
    banco: 'CaixaBank', tipoDocumento: 'DETALLE_FACTURAS', sourceHash: hash(bytes), totalRemesa: 100,
    cuadre: { estado: 'NO_VERIFICABLE' }, lineas: [{ numFactura: 'DRAX26/201', importe: 100, fechaFactura: '20/10/2026', fechaVencimiento: '29/10/2026' }],
  }
}
function parserFor(result: ConfirmingParseResult, throws = false): FinanceConfirmingReadingParserPort {
  const parseAsync = async () => { if (throws) throw new Error('synthetic parser fault'); return result }
  const parseSync = () => { if (throws) throw new Error('synthetic parser fault'); return result }
  return { parseBBVA: parseAsync, parseCaixaPdf: parseAsync, parseCaixaXls: parseSync }
}

async function providerFor(input: { itemId: string; name: string; bytes: Uint8Array; declared: RegisteredConfirmingSupport | null; parser: ReturnType<typeof parserFor> }) {
  const read = new FakeOneDriveReadPort({ driveId: DRIVE, siteId: 'site-e2e', rootPath: ROOT }, { [FOLDER]: { files: [file(input.itemId, input.name, input.bytes)] } }, { [input.itemId]: input.bytes })
  const domain = new FakeOneDriveDomainPort()
  if (input.declared) domain.confirmingSupports.set(`${DRIVE}:${input.itemId}`, input.declared)
  const lifecycle = new LifecycleMock()
  const provider = new OneDriveSyncProvider({
    read, domain, ocr: new FakeOcrPort({}, { ok: false, motivo: 'not-used' }), documentLifecycle: lifecycle,
    assertLiveFinanceWriteAccess: async (_tx, actorId) => actorId === ACTOR,
    confirmingParserPort: input.parser,
  })
  const page = await provider.inventory({ schema: 1, folderIndex: 2 })
  assert.equal(page.items.length, 1)
  return { read, domain, lifecycle, provider, item: page.items[0]! }
}

async function main() {
  // The BBVA page-2 physical column fixture deliberately puts a numeric value in
  // the displaced adjacent column. Only the amount under the documented header
  // is eligible for the parser result used below.
  const page2Lines = extractBBVACesionNominalLines([[
    { text: 'CESIÓN DE CRÉDITOS', x: 40, y: 700, width: 160 },
    { text: 'NÚM. FACTURA', x: 30, y: 120, width: 80 },
    { text: 'IMPORTE/(EUR)', x: 320, y: 120, width: 65 },
    { text: 'DRAX26/201', x: 34, y: 90, width: 45 },
    { text: '100,00', x: 371, y: 90, width: 43 },
    { text: '9,99', x: 500, y: 90, width: 24 },
  ]])
  assert.deepEqual(page2Lines.map((line) => [line.numFactura, line.importe, line.intereses, line.comision]), [['DRAX26/201', 100, undefined, undefined]])

  // Unregistered loose file stays catalog-only: it cannot be downloaded or parsed.
  const loose = await providerFor({ itemId: 'loose', name: 'bbva.pdf', bytes: pdf, declared: null, parser: parserFor(parseBbva(pdf)) })
  const loosePrepared = await loose.provider.prepare(loose.item)
  assert.equal(await loose.provider.apply({}, loose.item, loosePrepared, ACTOR), 'SIN_CAMBIOS')
  assert.equal(loose.read.downloads, 0)
  assert.equal(loose.lifecycle.applies.length, 0)

  // A real registered declaration then revoked is indistinguishable from absent
  // to the worker and is fail-closed before download.
  const revoked = await providerFor({ itemId: 'revoked', name: 'bbva.pdf', bytes: pdf, declared: support('77777777-7777-4777-8777-777777777777', 'revoked', 'BBVA_PDF', null), parser: parserFor(parseBbva(pdf)) })
  revoked.domain.revokedConfirmingSupportKeys.add(`${DRIVE}:revoked`)
  const revokedPrepared = await revoked.provider.prepare(revoked.item)
  assert.equal(await revoked.provider.apply({}, revoked.item, revokedPrepared, ACTOR), 'SIN_CAMBIOS')
  assert.equal(revoked.read.downloads, 0)

  // Registered BBVA follows prepare -> archive snapshot -> append-only support version -> amber C11 outcome.
  const bbva = await providerFor({ itemId: 'bbva', name: 'DPC_confirming_pagina_2.pdf', bytes: pdf, declared: support(REGISTRY_A, 'bbva', 'BBVA_PDF', null), parser: parserFor(parseBbva(pdf)) })
  const bbvaPrepared = await bbva.provider.prepare(bbva.item)
  const bbvaTx = new BridgeAmberTx('support-bbva')
  assert.equal(await bbva.provider.apply(bbvaTx as unknown as object, bbva.item, bbvaPrepared, ACTOR), 'REVISAR')
  assert.equal(bbva.read.downloads, 1)
  assert.equal(bbva.lifecycle.applies.length, 1)
  assert.equal(bbva.domain.confirmingSupportVersions.length, 1)
  const archived = bbva.domain.confirmingSupportVersions[0]!
  assert.equal(archived.version.lifecycleId, LIFECYCLE)
  assert.equal(archived.version.snapshotId, SNAPSHOT)
  assert.equal(archived.version.sourceHash, hash(pdf))
  assert.match(archived.version.archivoControladoId, /^[0-9a-f-]{36}$/i)
  assert(bbvaTx.queries.some((sql) => sql.includes('confirming_reading_support_versions')))
  assert(bbvaTx.queries.some((sql) => sql.includes('INSERT INTO confirming_reading_attempts')))

  // Caixa pair is explicitly declared. The loader receives both archived documents and preserves explicit VAT in exact cents.
  const pair = 'caixa-pair-e2e'
  const caixaPdf = await providerFor({ itemId: 'caixa-pdf', name: 'caixa.pdf', bytes: pdf, declared: support(REGISTRY_B, 'caixa-pdf', 'CAIXA_PDF', pair), parser: parserFor(parseCaixaPdf(pdf)) })
  const caixaXls = await providerFor({ itemId: 'caixa-xls', name: 'caixa.xls', bytes: xls, declared: support(REGISTRY_C, 'caixa-xls', 'CAIXA_XLS', pair), parser: parserFor(parseCaixaXls(xls)) })
  const caixaPdfPrepared = await caixaPdf.provider.prepare(caixaPdf.item)
  const caixaXlsPrepared = await caixaXls.provider.prepare(caixaXls.item)
  // Each independently delivered half archives only its own controlled version
  // and stays amber until the exact PDF/XLS pair is reread from append-only data.
  assert.equal(await caixaPdf.provider.apply(new BridgeAmberTx('support-caixa-pdf') as unknown as object, caixaPdf.item, caixaPdfPrepared, ACTOR), 'REVISAR')
  assert.equal(await caixaXls.provider.apply(new BridgeAmberTx('support-caixa-xls') as unknown as object, caixaXls.item, caixaXlsPrepared, ACTOR), 'REVISAR')
  assert.equal(caixaPdf.read.downloads, 1)
  assert.equal(caixaXls.read.downloads, 1)
  assert.equal(caixaPdf.domain.confirmingSupportVersions.length, 1)
  assert.equal(caixaXls.domain.confirmingSupportVersions.length, 1)
  assert.equal(caixaPdf.domain.confirmingSupportVersions[0]?.source.parejaCaixaDeclaradaId, pair)
  assert.equal(caixaXls.domain.confirmingSupportVersions[0]?.source.parejaCaixaDeclaradaId, pair)
  const evidence = loadArchivedConfirmingLiquidation({
    inventory: [
      { key: 'pdf', nombre: 'caixa.pdf', extension: 'pdf', sha256: hash(pdf), status: 'PARSED', parsed: { ...parseCaixaPdf(pdf), tipoDocumento: 'LIQUIDACION' as const, sourceHash: hash(pdf) } },
      { key: 'xls', nombre: 'caixa.xls', extension: 'xls', sha256: hash(xls), status: 'PARSED', parsed: { ...parseCaixaXls(xls), tipoDocumento: 'DETALLE_FACTURAS' as const, sourceHash: hash(xls) } },
    ],
    manifest: {
      liquidacionKey: 'caixa-e2e', confirmingId: 'support-caixa-pdf', banco: 'CAIXABANK', cuentaDepositariaId: 'account-e2e',
      documentoPrincipal: { inventarioKey: 'pdf', facturaRecibidaId: 'support-caixa-pdf', archivoControladoId: 'archive-pdf', oneDriveDriveId: DRIVE, oneDriveItemId: 'caixa-pdf' },
      detalleFacturasXls: { inventarioKey: 'xls', facturaRecibidaId: 'support-caixa-xls', archivoControladoId: 'archive-xls', oneDriveDriveId: DRIVE, oneDriveItemId: 'caixa-xls' },
      bindings: [{ facturaEmitidaId: 'invoice-e2e', numeroFactura: 'DRAX26/201', confirmingLineaId: null, fechaEmisionRegistrada: '2026-10-20' }],
    },
  }).evidence
  assert.equal(evidence.interesesCentimos, 100)
  assert.equal(evidence.comisionCentimos, 20)
  assert.equal(evidence.ivaComisionCentimos, 4)
  assert.equal(evidence.deduccionTotalCentimos, 124)
  assert.equal(evidence.netoBancarioCentimos, 9876)
  assert.equal(evidence.nominalCentimos! - evidence.deduccionTotalCentimos, evidence.netoBancarioCentimos)

  // Parser fault on a controlled source persists only source-review (amber), never B4/cash action.
  const faulty = await providerFor({ itemId: 'faulty', name: 'bbva.pdf', bytes: pdf, declared: support('66666666-6666-4666-8666-666666666666', 'faulty', 'BBVA_PDF', null), parser: parserFor(parseBbva(pdf), true) })
  const faultyPrepared = await faulty.provider.prepare(faulty.item)
  const faultyTx = new BridgeAmberTx('support-faulty')
  assert.equal(await faulty.provider.apply(faultyTx as unknown as object, faulty.item, faultyPrepared, ACTOR), 'REVISAR')
  assert.equal(faulty.domain.confirmingSupportVersions.length, 1)
  assert(faultyTx.queries.some((sql) => sql.includes('INSERT INTO confirming_reading_attempts')))

  console.log('OK E2E fake: BBVA physical-page fixture path, Caixa explicit PDF+XLS, loose/revoked fail-closed, archived versions, exact explicit VAT, parser error amber; no B4/cash action.')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
