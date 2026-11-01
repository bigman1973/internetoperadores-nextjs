/* Batch lifecycle guard: pruebas puras, sin DB, Graph, HTTP, B4, B5 ni C11. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import { applyConciliarDocumentLifecycleGuardToRebuildRowsTx, type RebuildRow } from '../lib/finanzas/conciliar-db'
import {
  CONCILIAR_DOCUMENT_LIFECYCLE_BATCH_PAGE_SIZE,
  CONCILIAR_DOCUMENT_LIFECYCLE_UNTRACKED,
  conciliarDocumentLifecycleBatchSourceKey,
  conciliarDocumentLifecycleGuardBatchSql,
  preloadConciliarDocumentLifecycleEligibilityTx,
} from '../lib/finanzas/conciliar-document-lifecycle-guard'

const LIFECYCLE_A = '11111111-1111-4111-8111-111111111111'
const LIFECYCLE_B = '22222222-2222-4222-8222-222222222222'
const LIFECYCLE_C = '33333333-3333-4333-8333-333333333333'
const LIFECYCLE_D = '44444444-4444-4444-8444-444444444444'
const SNAPSHOT = '55555555-5555-4555-8555-555555555555'
const B5 = '66666666-6666-4666-8666-666666666666'

function sqlText(statement: unknown): string {
  return statement && typeof statement === 'object' && Array.isArray((statement as { strings?: unknown }).strings)
    ? ((statement as { strings: readonly string[] }).strings).join('?')
    : String(statement)
}

function batchRows(): readonly Record<string, unknown>[] {
  return [
    { sourceKind: 'RECIBIDA', sourceId: 'recibida-tombstone', lifecycleId: LIFECYCLE_A, state: 'ACTIVE', currentVersion: 1, snapshotId: SNAPSHOT, tombstoneRecorded: true, changePending: false, recoveryPending: false },
    { sourceKind: 'RECIBIDA', sourceId: 'recibida-change', lifecycleId: LIFECYCLE_C, state: 'ACTIVE', currentVersion: 2, snapshotId: SNAPSHOT, tombstoneRecorded: false, changePending: true, recoveryPending: false },
    { sourceKind: 'CONFIRMING', sourceId: 'confirming-recovery', lifecycleId: LIFECYCLE_B, state: 'ACTIVE', currentVersion: 1, snapshotId: SNAPSHOT, tombstoneRecorded: false, changePending: false, recoveryPending: true },
    { sourceKind: 'NOMINA', sourceId: 'nomina-historica', lifecycleId: null, state: null, currentVersion: null, snapshotId: null, tombstoneRecorded: false, changePending: false, recoveryPending: false },
    { sourceKind: 'B5', sourceId: B5, lifecycleId: LIFECYCLE_D, state: 'ACTIVE', currentVersion: 1, snapshotId: null, tombstoneRecorded: false, changePending: false, recoveryPending: false },
  ]
}

function batchTx(rows = batchRows()) {
  const statements: string[] = []
  return {
    statements,
    tx: {
      async $queryRaw<T>(statement: unknown): Promise<T> {
        const sql = sqlText(statement)
        statements.push(sql)
        assert.match(sql, /^\s*WITH requested AS \(/, 'el preload batch debe ser una única SELECT set-based')
        assert.equal(classifyPrisma5RawSqlStatement([statement]), 'read_only', 'el SQL real Prisma debe permanecer en la whitelist de lectura')
        return rows as T
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

test('batch deduplica fuentes servidor, resuelve cuatro clases en una SELECT y no usa C11 como key', async () => {
  const sources = [
    { kind: 'PAGO_FACTURA_RECIBIDA' as const, facturaRecibidaId: 'recibida-tombstone' },
    { kind: 'PAGO_FACTURA_RECIBIDA' as const, facturaRecibidaId: 'recibida-tombstone' },
    { kind: 'PAGO_FACTURA_RECIBIDA' as const, facturaRecibidaId: 'recibida-change' },
    { kind: 'COBRO_CONFIRMING' as const, confirmingId: 'confirming-recovery', confirmingSourceHash: 'a'.repeat(64) },
    { kind: 'COBRO_CONFIRMING' as const, confirmingId: 'confirming-recovery', confirmingSourceHash: 'b'.repeat(64) },
    { kind: 'PAGO_NOMINA' as const, nominaId: 'nomina-historica' },
    { kind: 'PAGO_TICKET_B5' as const, adjuntoB5Id: B5, gastoId: 'gasto-sintetico', documentoConciliableId: SNAPSHOT },
  ]
  const { tx, statements } = batchTx()
  const eligibility = await preloadConciliarDocumentLifecycleEligibilityTx(tx as any, sources)
  assert.equal(statements.length, 1, 'siete filas candidatas/dos duplicados no deben disparar lectura por fila')
  assert.equal(eligibility.size, 5)
  assert.equal(eligibility.get(conciliarDocumentLifecycleBatchSourceKey(sources[0])!)?.codigo, 'DOCUMENTO_TOMBSTONED')
  assert.equal(eligibility.get(conciliarDocumentLifecycleBatchSourceKey(sources[2])!)?.codigo, 'INCIDENCIA_CAMBIO_DOCUMENTAL_PENDIENTE')
  assert.equal(eligibility.get(conciliarDocumentLifecycleBatchSourceKey(sources[3])!)?.codigo, 'INCIDENCIA_RECUPERACION_DOCUMENTAL_PENDIENTE')
  assert.equal(eligibility.get(conciliarDocumentLifecycleBatchSourceKey(sources[5])!)?.versionEstado, CONCILIAR_DOCUMENT_LIFECYCLE_UNTRACKED)
  assert.equal(statements[0]?.includes('confirmingSourceHash'), false, 'C11 sourceHash no puede entrar en la resolución lifecycle')
  assert.match(statements[0]!, /(?:FROM|JOIN) facturas_recibidas fr/)
  assert.match(statements[0]!, /(?:FROM|JOIN) nominas n/)
  assert.match(statements[0]!, /(?:FROM|JOIN) adjuntos_pendientes_b5 a/)
  assert.match(statements[0]!, /document_version_snapshots/)
  assert.match(statements[0]!, /document_version_tombstones/)
  assert.match(statements[0]!, /document_version_incidents/)
})

test('batch pagina a tamaño fijo sin N+1 y conserva el fallback histórico', async () => {
  const sources = Array.from({ length: CONCILIAR_DOCUMENT_LIFECYCLE_BATCH_PAGE_SIZE + 1 }, (_, index) => ({
    kind: 'PAGO_FACTURA_RECIBIDA' as const,
    facturaRecibidaId: `recibida-pagina-${String(index).padStart(4, '0')}`,
  }))
  const { tx, statements } = batchTx([])
  const eligibility = await preloadConciliarDocumentLifecycleEligibilityTx(tx as any, sources)
  assert.equal(statements.length, 2, '501 fuentes deben ser dos páginas, no 501 consultas')
  assert.equal(eligibility.size, sources.length)
  assert.equal(eligibility.get(conciliarDocumentLifecycleBatchSourceKey(sources.at(-1)!)!)?.versionEstado, CONCILIAR_DOCUMENT_LIFECYCLE_UNTRACKED)
})

test('sellado final convierte tombstone, recuperación y snapshot inválido en ámbar y conserva el histórico', async () => {
  const rows = [
    row('recibida', { kind: 'PAGO_FACTURA_RECIBIDA', facturaRecibidaId: 'recibida-tombstone', movimientoId: 'movimiento-sintetico', versionB4: 1 }),
    row('cambio', { kind: 'PAGO_FACTURA_RECIBIDA', facturaRecibidaId: 'recibida-change', movimientoId: 'movimiento-sintetico', versionB4: 1 }),
    row('confirming', { kind: 'COBRO_CONFIRMING', confirmingId: 'confirming-recovery', confirmingSourceHash: 'c'.repeat(64), movimientoId: 'movimiento-sintetico', versionB4: 1 }),
    row('nomina', { kind: 'PAGO_NOMINA', nominaId: 'nomina-historica', movimientoId: 'movimiento-sintetico', versionB4: 1 }),
    row('b5', { kind: 'PAGO_TICKET_B5', adjuntoB5Id: B5, gastoId: 'gasto-sintetico', documentoConciliableId: SNAPSHOT, movimientoId: 'movimiento-sintetico', versionB4: 1 }),
  ]
  const { tx, statements } = batchTx()
  const sealed = await applyConciliarDocumentLifecycleGuardToRebuildRowsTx(tx as any, rows)
  assert.equal(statements.length, 1, 'el sellado final usa el preload batch exacto una sola vez')
  for (const index of [0, 1, 2, 4]) {
    assert.equal(sealed[index]?.row.color, 'AMBAR')
    assert.equal(sealed[index]?.row.seleccionable, false)
    assert.match(sealed[index]?.source.documentLifecycleVersionState ?? '', /^[a-f0-9]{64}$/)
    assert.notEqual(sealed[index]?.sourceFingerprint, rows[index]?.sourceFingerprint, 'el fingerprint se recalcula tras sellar versión lifecycle')
  }
  assert.equal(sealed[3]?.row.color, 'VERDE', 'la ausencia histórica no degrada una coincidencia previa')
  assert.equal(sealed[3]?.row.seleccionable, true)
  assert.equal(sealed[3]?.source.documentLifecycleVersionState, CONCILIAR_DOCUMENT_LIFECYCLE_UNTRACKED)
  assert.equal(sealed[2]?.source.confirmingSourceHash, 'c'.repeat(64), 'C11 se conserva separado del versionEstado lifecycle')
})

test('la consulta batch no proyecta bytes, hashes de contenido, URLs ni localizadores hacia la proyección', () => {
  const query = conciliarDocumentLifecycleGuardBatchSql.queryForTests([
    { kind: 'PAGO_FACTURA_RECIBIDA', facturaRecibidaId: 'recibida-privada' },
  ])
  const statement = sqlText(query)
  assert.equal(classifyPrisma5RawSqlStatement([query]), 'read_only')
  for (const forbidden of ['content_sha256', 'private_storage_handle', 'original_file_name', 'authenticated_web_url', 'archivo_url', 'sourceHash']) {
    assert.equal(statement.includes(forbidden), false, `no se lee ni publica ${forbidden}`)
  }
  assert.match(statement, /EXISTS \(SELECT 1 FROM document_version_tombstones/)
  assert.match(statement, /EXISTS \(\s*SELECT 1 FROM document_version_incidents/)
})

console.log('OK: lifecycle batch guard; SELECT paginada, sin N+1, sin DB/Graph/DML y sin filtrar locators o artefactos privados.')
