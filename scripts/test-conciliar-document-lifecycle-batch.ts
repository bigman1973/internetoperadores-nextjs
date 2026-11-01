/* Guardia documental de fuente: pruebas puras, sin DB, Graph, HTTP, B4, B5 ni C11. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import { applyConciliarDocumentSourceGuardToRebuildRowsTx, type RebuildRow } from '../lib/finanzas/conciliar-db'
import {
  CONCILIAR_DOCUMENT_SOURCE_GUARD_BATCH_PAGE_SIZE,
  conciliarDocumentSourceBatchSourceKey,
  conciliarDocumentSourceGuardBatchSql,
  preloadConciliarDocumentSourceEligibilityTx,
} from '../lib/finanzas/conciliar-document-source-guard'

const INVOICE = 'recibida-controlada'
const CONFIRMING = 'confirming-controlado'
const SNAPSHOT = '55555555-5555-4555-8555-555555555555'
const B5 = '66666666-6666-4666-8666-666666666666'
const UPDATED_AT = '2026-10-29 12:00:00+00'

function sqlText(statement: unknown): string {
  return statement && typeof statement === 'object' && Array.isArray((statement as { strings?: unknown }).strings)
    ? ((statement as { strings: readonly string[] }).strings).join('?')
    : String(statement)
}

function guardedTx(options: Readonly<{ sourceTables?: boolean; rows?: readonly Record<string, unknown>[] }> = {}) {
  const statements: string[] = []
  const sourceTables = options.sourceTables ?? true
  return {
    statements,
    tx: {
      async $queryRaw<T>(statement: unknown): Promise<T> {
        const sql = sqlText(statement)
        statements.push(sql)
        assert.equal(classifyPrisma5RawSqlStatement([statement]), 'read_only', 'la guarda sólo admite SELECT/locks de lectura Prisma')
        if (sql.includes("to_regclass('public.facturas_recibidas')")) {
          return [{ facturasRecibidas: sourceTables, nominas: sourceTables, nominaDocumentos: sourceTables, adjuntosB5: sourceTables }] as T
        }
        assert.match(sql, /^\s*WITH requested AS \(/, 'las fuentes se resuelven por página set-based, no una consulta por fila')
        return (options.rows ?? [
          { sourceKind: 'RECIBIDA', requestedSourceId: INVOICE, sourceId: INVOICE, driveId: 'drive-controlado', itemId: 'item-controlado', archivo: '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026/factura.pdf', updatedAt: UPDATED_AT },
          { sourceKind: 'CONFIRMING', requestedSourceId: CONFIRMING, sourceId: CONFIRMING, driveId: 'drive-controlado', itemId: 'item-confirming', archivo: '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026/confirming.pdf', updatedAt: UPDATED_AT },
        ]) as T
      },
    },
  }
}

function row(id: string, source: RebuildRow['source'], color: 'VERDE' | 'AMBAR' | 'ROJO' = 'VERDE'): RebuildRow {
  return {
    tab: source.kind === 'COBRO_CONFIRMING' ? 'COBROS' : 'PAGOS',
    row: {
      id, movimientoId: 'movimiento-sintetico', fecha: '2026-10-29', concepto: 'Sintético', banco: null, cuenta: null,
      importeCentimos: -100, pendienteCentimos: -100, color, grupo: null, motivo: 'Coincidencia previa', documento: null,
      propuesta: null, seleccionable: color === 'VERDE', diferenciaCentimos: 0, detail: null,
    },
    source,
    sourceFingerprint: 'f'.repeat(64),
    cuentaId: null,
  }
}

test('batch deduplica identificadores productivos y sella estado opaco sin lifecycle ni bytes', async () => {
  const sources = [
    { kind: 'PAGO_FACTURA_RECIBIDA' as const, facturaRecibidaId: INVOICE },
    { kind: 'PAGO_FACTURA_RECIBIDA' as const, facturaRecibidaId: INVOICE },
    { kind: 'COBRO_CONFIRMING' as const, confirmingId: CONFIRMING, confirmingSourceHash: 'a'.repeat(64) },
    { kind: 'COBRO_CONFIRMING' as const, confirmingId: CONFIRMING, confirmingSourceHash: 'b'.repeat(64) },
    { kind: 'PAGO_TICKET_B5' as const, adjuntoB5Id: B5, gastoId: 'gasto-sintetico', documentoConciliableId: SNAPSHOT },
  ]
  const { tx, statements } = guardedTx({ rows: [
    { sourceKind: 'RECIBIDA', requestedSourceId: INVOICE, sourceId: INVOICE, driveId: 'drive-controlado', itemId: 'item-controlado', archivo: '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026/factura.pdf', updatedAt: UPDATED_AT },
    { sourceKind: 'CONFIRMING', requestedSourceId: CONFIRMING, sourceId: CONFIRMING, driveId: 'drive-controlado', itemId: 'item-confirming', archivo: '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026/confirming.pdf', updatedAt: UPDATED_AT },
  ] })
  const eligibility = await preloadConciliarDocumentSourceEligibilityTx(tx as any, sources)
  assert.equal(statements.length, 2, 'la comprobación de catálogo antecede a una única SELECT batch')
  assert.equal(eligibility.size, 3)
  for (const source of sources.slice(0, 4)) {
    const result = eligibility.get(conciliarDocumentSourceBatchSourceKey(source)!)
    assert.equal(result?.elegible, true)
    assert.match(result?.versionEstado ?? '', /^[a-f0-9]{64}$/)
  }
  assert.equal(eligibility.get(conciliarDocumentSourceBatchSourceKey(sources[4])!)?.elegible, false, 'una fuente B5 sin fila actual cae cerrada')
  const batch = statements[1]!
  assert.match(batch, /JOIN facturas_recibidas fr/)
  assert.equal(batch.includes('confirmingSourceHash'), false, 'C11 no selecciona ni sella la fuente')
  for (const forbidden of ['document_version_', 'area3_received_document_hashes', 'content_sha256', 'authenticated_web_url', 'private_storage_handle']) {
    assert.equal(batch.includes(forbidden), false, `la guarda activa no depende de ${forbidden}`)
  }
})

test('batch pagina a tamaño fijo y la ausencia de tabla cae ámbar sin consultar fuente opcional', async () => {
  const sources = Array.from({ length: CONCILIAR_DOCUMENT_SOURCE_GUARD_BATCH_PAGE_SIZE + 1 }, (_, index) => ({
    kind: 'PAGO_FACTURA_RECIBIDA' as const,
    facturaRecibidaId: `recibida-pagina-${String(index).padStart(4, '0')}`,
  }))
  const paged = guardedTx({ rows: [] })
  const eligibility = await preloadConciliarDocumentSourceEligibilityTx(paged.tx as any, sources)
  assert.equal(paged.statements.length, 3, 'catálogo + dos páginas, nunca N consultas por fila')
  assert.equal(eligibility.size, sources.length)
  assert.equal(eligibility.get(conciliarDocumentSourceBatchSourceKey(sources.at(-1)!)!)?.elegible, false)

  const missing = guardedTx({ sourceTables: false })
  const unavailable = await preloadConciliarDocumentSourceEligibilityTx(missing.tx as any, [sources[0]!])
  assert.equal(missing.statements.length, 1, 'sin esquema productivo no se referencia ni se inventa una tabla')
  assert.equal(unavailable.get(conciliarDocumentSourceBatchSourceKey(sources[0]!)!)?.codigo, 'FUENTE_DOCUMENTAL_NO_DISPONIBLE')
  assert.equal(unavailable.get(conciliarDocumentSourceBatchSourceKey(sources[0]!)!)?.elegible, false)
})

test('sellado de fuente preserva verde sólo con fuente vigente y marca ámbar llano ante ausencia', async () => {
  const active = row('recibida', { kind: 'PAGO_FACTURA_RECIBIDA', facturaRecibidaId: INVOICE, movimientoId: 'movimiento-sintetico', versionB4: 1 })
  const available = guardedTx({ rows: [{ sourceKind: 'RECIBIDA', requestedSourceId: INVOICE, sourceId: INVOICE, driveId: 'drive-controlado', itemId: 'item-controlado', archivo: '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026/factura.pdf', updatedAt: UPDATED_AT }] })
  const sealed = await applyConciliarDocumentSourceGuardToRebuildRowsTx(available.tx as any, [active])
  assert.equal(sealed[0]?.row.color, 'VERDE')
  assert.equal(sealed[0]?.row.seleccionable, true)
  assert.match(sealed[0]?.source.documentLifecycleVersionState ?? '', /^[a-f0-9]{64}$/)
  assert.notEqual(sealed[0]?.sourceFingerprint, active.sourceFingerprint, 'el estado de fuente cambia el sello de decisión')

  const missing = guardedTx({ sourceTables: false })
  const amber = await applyConciliarDocumentSourceGuardToRebuildRowsTx(missing.tx as any, [active])
  assert.equal(amber[0]?.row.color, 'AMBAR')
  assert.equal(amber[0]?.row.seleccionable, false)
  assert.equal(amber[0]?.row.motivo, 'No se puede comprobar la fuente documental actual; requiere revisión antes de confirmar.')
})

test('los módulos activos no importan lifecycle congelado ni dependencias de proyección añadida', () => {
  const root = resolve(__dirname, '..')
  for (const relative of [
    'lib/finanzas/conciliar-actions.ts',
    'lib/finanzas/conciliar-db.ts',
    'lib/finanzas/conciliar-projection-read.ts',
    'lib/finanzas/area3-review-document-evidence.ts',
    'app/api/admin/finanzas/conciliar/route.ts',
  ]) {
    const source = readFileSync(resolve(root, relative), 'utf8')
    assert.doesNotMatch(source, /conciliar-document-lifecycle-guard|conciliar-recovery|document_version_|area3_conciliar_projection_changes|area3_received_document_hashes/, relative)
  }
  const query = conciliarDocumentSourceGuardBatchSql.queryForTests([{ kind: 'PAGO_FACTURA_RECIBIDA', facturaRecibidaId: INVOICE }])
  const statement = sqlText(query)
  assert.equal(classifyPrisma5RawSqlStatement([query]), 'read_only')
  assert.match(statement, /WITH requested AS/)
})

console.log('OK: guarda documental productiva; catálogo y fuentes actuales de sólo lectura, fallback ámbar y sin lifecycle/bytes/hashes históricos.')
