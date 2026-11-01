import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import { readArea3ReviewDocumentStateSnapshotTx } from '../lib/finanzas/area3-review-document-evidence'
import { readConciliarDocumentSourceEligibilityTx } from '../lib/finanzas/conciliar-document-source-guard'

const DRIVE = 'drive-sintetico'
const ITEM = 'item-sintetico'
const INVOICE = 'factura-sintetica'
const UPDATED_AT = '2026-10-29 12:00:00+00'
const ARCHIVO = '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026/factura.pdf'

type Fixture = Readonly<{
  sourceTables?: boolean
  sourceRows?: readonly unknown[]
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
        if (sql.includes("to_regclass('public.facturas_recibidas')")) {
          const available = fixture.sourceTables ?? true
          return [{ facturasRecibidas: available, nominas: available, nominaDocumentos: available, adjuntosB5: available }] as T
        }
        if (sql.includes('FROM facturas_recibidas fr')) return (fixture.sourceRows ?? []) as T
        throw new Error('AREA3_REVIEW_SNAPSHOT_SQL_UNRECOGNIZED')
      },
    },
  }
}

function source(projectionSource: Record<string, unknown> = {}) {
  return {
    invoice: {
      invoiceId: INVOICE,
      proveedor: 'Proveedor sintético, S.L.',
      referencia: 'FAC-2026-42',
      fecha: '2026-10-29',
      importeObjetivoCentimos: -10_000,
      estado: 'VALIDADA',
      calidad: 'VALIDA',
      copiaDeId: null,
      naturaleza: 'FACTURA_RECIBIDA',
      conflictoIdentidad: false,
      duplicadoExterno: false,
      versionCalidad: 1,
      versionNaturaleza: 1,
      driveId: DRIVE,
      itemId: ITEM,
      archivo: ARCHIVO,
      updatedAt: UPDATED_AT,
    },
    projectionSource: { kind: 'PAGO_FACTURA_RECIBIDA' as const, facturaRecibidaId: INVOICE, movimientoId: 'movimiento-sintetico', versionB4: 1, ...projectionSource },
  }
}

async function withControlledDrive<T>(work: () => Promise<T>): Promise<T> {
  const previousSharepoint = process.env.SHAREPOINT_DRIVE_ID
  const previousDrive = process.env.DRIVE_ID
  process.env.SHAREPOINT_DRIVE_ID = DRIVE
  delete process.env.DRIVE_ID
  try {
    return await work()
  } finally {
    if (previousSharepoint === undefined) delete process.env.SHAREPOINT_DRIVE_ID
    else process.env.SHAREPOINT_DRIVE_ID = previousSharepoint
    if (previousDrive === undefined) delete process.env.DRIVE_ID
    else process.env.DRIVE_ID = previousDrive
  }
}

const controlledSourceRow = {
  sourceId: INVOICE,
  driveId: DRIVE,
  itemId: ITEM,
  archivo: ARCHIVO,
  updatedAt: UPDATED_AT,
}

async function sealedProjectionSource() {
  const guard = transaction({ sourceRows: [controlledSourceRow] })
  const projectionSource = source().projectionSource
  const eligibility = await readConciliarDocumentSourceEligibilityTx(guard.tx as any, projectionSource as any)
  assert.equal(eligibility.elegible, true, 'la fuente controlada actual debe ser legible por la guarda')
  return { ...projectionSource, documentLifecycleVersionState: eligibility.versionEstado }
}

test('el estado documental productivo controlado crea un snapshot semántico, no una huella de bytes', async () => {
  await withControlledDrive(async () => {
    const projectionSource = await sealedProjectionSource()
    const previewMock = transaction({ sourceRows: [controlledSourceRow] })
    const preview = await readArea3ReviewDocumentStateSnapshotTx(previewMock.tx as any, { invoice: source().invoice, projectionSource, lock: false })
    assert.equal(preview.eligible, true)
    assert.equal(preview.kind, 'PRODUCTIVE_CANONICAL_STATE')
    assert.match(preview.snapshotHash ?? '', /^[a-f0-9]{64}$/)

    const confirmMock = transaction({ sourceRows: [controlledSourceRow] })
    const locked = await readArea3ReviewDocumentStateSnapshotTx(confirmMock.tx as any, { invoice: source().invoice, projectionSource, lock: true })
    assert.deepEqual(locked, preview, 'la misma foto productiva sellada conserva el mismo ACK')
    assert.ok(confirmMock.statements.some(sql => /FOR KEY SHARE OF fr/.test(sql)), 'la confirmación vuelve a bloquear la fuente real')

    for (const statement of [...previewMock.statements, ...confirmMock.statements]) {
      for (const forbidden of ['document_version_', 'area3_received_document_hashes', 'content_sha256', 'file_sha256', 'payload_hash', 'private_storage_handle']) {
        assert.equal(statement.includes(forbidden), false, `el snapshot no depende de ${forbidden}`)
      }
    }
  })
})

test('cualquier cambio de estado, identidad o fuente invalida el snapshot sin fallback elegible', async () => {
  await withControlledDrive(async () => {
    const projectionSource = await sealedProjectionSource()
    for (const invoice of [
      { ...source().invoice, estado: 'RECHAZADA' },
      { ...source().invoice, conflictoIdentidad: true },
      { ...source().invoice, duplicadoExterno: true },
      { ...source().invoice, proveedor: null },
      { ...source().invoice, referencia: null },
      { ...source().invoice, itemId: 'x' },
      { ...source().invoice, updatedAt: null },
    ]) {
      const mock = transaction({ sourceRows: [controlledSourceRow] })
      const result = await readArea3ReviewDocumentStateSnapshotTx(mock.tx as any, { invoice, projectionSource, lock: false })
      assert.deepEqual(result, { eligible: false, snapshotHash: null, kind: null }, JSON.stringify(invoice))
    }

    const changedSource = transaction({ sourceRows: [{ ...controlledSourceRow, updatedAt: '2026-10-29 12:01:00+00' }] })
    const changed = await readArea3ReviewDocumentStateSnapshotTx(changedSource.tx as any, { invoice: source().invoice, projectionSource, lock: true })
    assert.deepEqual(changed, { eligible: false, snapshotHash: null, kind: null }, 'una fuente modificada no conserva el estado sellado')
  })
})

test('ausencia de esquema o fila productiva permanece ámbar y no consulta un historial', async () => {
  await withControlledDrive(async () => {
    const projectionSource = { ...source().projectionSource, documentLifecycleVersionState: 'a'.repeat(64) }
    for (const fixture of [{ sourceTables: false }, { sourceRows: [] }] as const) {
      const mock = transaction(fixture)
      const result = await readArea3ReviewDocumentStateSnapshotTx(mock.tx as any, { invoice: source().invoice, projectionSource, lock: true })
      assert.deepEqual(result, { eligible: false, snapshotHash: null, kind: null })
      if (fixture.sourceTables === false) assert.equal(mock.statements.length, 1, 'sin tabla actual no se intenta una ruta histórica')
      assert.equal(mock.statements.some(sql => /document_version_|area3_received_document_hashes/.test(sql)), false)
    }
  })
})

test('el lector de snapshot no importa lifecycle, recovery ni APIs de archivo y no afirma bytes remotos', () => {
  const root = resolve(__dirname, '..')
  const evidence = readFileSync(resolve(root, 'lib/finanzas/area3-review-document-evidence.ts'), 'utf8')
  assert.match(evidence, /readConciliarDocumentSourceEligibilityTx/)
  assert.match(evidence, /lockConciliarDocumentSourceForConfirmationTx/)
  assert.match(evidence, /PRODUCTIVE_CANONICAL_STATE/)
  assert.match(evidence, /not a content hash/)
  const forbidden = new RegExp([
    ['conciliar-document-', 'lifecycle-guard'].join(''),
    ['conciliar-', 'recovery'].join(''),
    ['document_', 'version_'].join(''),
    ['area3_received_', 'document_hashes'].join(''),
    ['document', 'ContentHash'].join(''),
    ['LEGACY_', 'CONTROLLED_FINGERPRINT'].join(''),
    ['content', 'Sha'].join(''), ['file', 'Sha'].join(''), ['payload', 'Hash'].join(''),
    'fetch\\(', 'https?:',
  ].join('|'), 'i')
  assert.doesNotMatch(evidence, forbidden)
})

console.log('OK: snapshot productivo server-owned, fuente bloqueada y fallos cerrados; sin bytes remotos, lifecycle, recovery, DML ni llamadas externas.')
