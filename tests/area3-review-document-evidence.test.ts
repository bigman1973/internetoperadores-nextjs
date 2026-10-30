import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import { readArea3ReviewDocumentEvidenceTx } from '../lib/finanzas/area3-review-document-evidence'

const DRIVE = 'drive-sintetico'
const ITEM = 'item-sintetico'
const INVOICE = 'factura-sintetica'
const LIFECYCLE = '11111111-1111-4111-8111-111111111111'
const SNAPSHOT = '22222222-2222-4222-8222-222222222222'
const HASH = 'a'.repeat(64)

type Fixture = Readonly<{
  lifecycleRows?: readonly unknown[]
  snapshotRows?: readonly unknown[]
  legacyRows?: readonly unknown[]
}>

function sqlText(statement: unknown): string {
  return statement && typeof statement === 'object' && Array.isArray((statement as { strings?: unknown }).strings)
    ? ((statement as { strings: readonly string[] }).strings).join('?')
    : String(statement)
}

function transaction(fixture: Fixture = {}) {
  const statements: string[] = []
  return {
    statements,
    tx: {
      async $queryRaw<T>(statement: unknown): Promise<T> {
        const sql = sqlText(statement)
        statements.push(sql)
        assert.notEqual(classifyPrisma5RawSqlStatement([statement]), 'rejected', 'el lector no debe emitir DML ni SQL no permitido')
        if (sql.includes('FROM facturas_recibidas fr')) return [{ driveId: DRIVE, itemId: ITEM }] as T
        if (sql.includes('LEFT JOIN document_version_snapshots s')) return (fixture.lifecycleRows ?? []) as T
        if (sql.includes('JOIN document_version_snapshots s')) return (fixture.snapshotRows ?? []) as T
        if (sql.includes('FROM area3_received_document_hashes h')) return (fixture.legacyRows ?? []) as T
        if (sql.includes('FROM document_version_tombstones t') || sql.includes('FROM document_version_incidents i')) return [] as T
        throw new Error('AREA3_REVIEW_EVIDENCE_SQL_UNRECOGNIZED')
      },
    },
  }
}

function source() {
  return {
    source: { invoiceId: INVOICE, driveId: DRIVE, itemId: ITEM, archivo: null },
    projectionSource: { kind: 'PAGO_FACTURA_RECIBIDA' as const, facturaRecibidaId: INVOICE },
  }
}

test('una huella legacy append-only exacta permite sólo la revisión humana de un lifecycle histórico', async () => {
  const mock = transaction({ legacyRows: [{ contentSha256: HASH }] })
  const result = await readArea3ReviewDocumentEvidenceTx(mock.tx as any, { ...source(), lock: false })
  assert.deepEqual(result, { eligible: true, hash: HASH, kind: 'LEGACY_CONTROLLED_FINGERPRINT' })
  const legacy = mock.statements.find(sql => sql.includes('FROM area3_received_document_hashes h'))
  assert.ok(legacy)
  for (const predicate of ['h.factura_recibida_id=?', 'h.source_item_id=?', 'h.source_drive_id IS NOT DISTINCT FROM f.onedrive_drive_id', 'h.source_updated_at=f.updated_at', 'f.onedrive_item_id=?', "h.source_kind=?", "h.source_observation=?"]) {
    assert.ok(legacy!.includes(predicate), predicate)
  }
})

test('una huella legacy perdida, desajustada, duplicada o inválida no sustituye la prueba documental', async () => {
  for (const legacyRows of [[], [{ contentSha256: 'x'.repeat(64) }], [{ contentSha256: HASH }, { contentSha256: HASH }]]) {
    const mock = transaction({ legacyRows })
    const result = await readArea3ReviewDocumentEvidenceTx(mock.tx as any, { ...source(), lock: true })
    assert.deepEqual(result, { eligible: false, hash: null, kind: null })
  }
})

test('un lifecycle conocido sin snapshot vigente rechaza la huella legacy y no consulta su tabla', async () => {
  const mock = transaction({
    lifecycleRows: [{ lifecycleId: LIFECYCLE, state: 'ACTIVE', currentVersion: 0, snapshotId: null }],
    legacyRows: [{ contentSha256: HASH }],
  })
  const result = await readArea3ReviewDocumentEvidenceTx(mock.tx as any, { ...source(), lock: true })
  assert.deepEqual(result, { eligible: false, hash: null, kind: null })
  assert.equal(mock.statements.some(sql => sql.includes('FROM area3_received_document_hashes h')), false)
})

test('un lifecycle vigente conserva el snapshot actual y no puede degradarse a metadata legacy', async () => {
  const mock = transaction({
    lifecycleRows: [{ lifecycleId: LIFECYCLE, state: 'ACTIVE', currentVersion: 1, snapshotId: SNAPSHOT }],
    snapshotRows: [{ contentSha256: HASH }],
    legacyRows: [{ contentSha256: 'b'.repeat(64) }],
  })
  // En confirmación el mismo lifecycle además exige el versionEstado sellado
  // por la proyección. Esta lectura de preflight prueba aquí la selección de
  // evidencia: un lifecycle conocido nunca cae a la tabla legacy.
  const result = await readArea3ReviewDocumentEvidenceTx(mock.tx as any, { ...source(), lock: false })
  assert.deepEqual(result, { eligible: true, hash: HASH, kind: 'LIFECYCLE_CAPTURED' })
  assert.equal(mock.statements.some(sql => sql.includes('FROM area3_received_document_hashes h')), false)
})

console.log('OK: evidencia legacy sólo para lifecycle histórico, exacta, controlada y append-only; sin snapshots sintéticos ni DML.')
