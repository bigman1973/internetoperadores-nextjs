import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import { readArea3ReviewDocumentEvidenceTx } from '../lib/finanzas/area3-review-document-evidence'
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
        throw new Error('AREA3_REVIEW_EVIDENCE_SQL_UNRECOGNIZED')
      },
    },
  }
}

function source(projectionSource: Record<string, unknown> = {}) {
  return {
    source: { invoiceId: INVOICE, driveId: DRIVE, itemId: ITEM, archivo: ARCHIVO },
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

test('una fuente productiva disponible no se convierte en hash de bytes ni autoriza la revisión humana', async () => {
  await withControlledDrive(async () => {
    const eligibilityMock = transaction({ sourceRows: [controlledSourceRow] })
    const projectionSource = source().projectionSource
    const eligibility = await readConciliarDocumentSourceEligibilityTx(eligibilityMock.tx as any, projectionSource as any)
    assert.equal(eligibility.elegible, true, 'la fuente controlada actual puede ser legible por la guarda de fuente')
    assert.match(eligibility.versionEstado, /^[a-f0-9]{64}$/)

    const previewMock = transaction({ sourceRows: [controlledSourceRow] })
    const preview = await readArea3ReviewDocumentEvidenceTx(previewMock.tx as any, { ...source(), lock: false })
    assert.deepEqual(preview, { eligible: false, hash: null, kind: null }, 'metadata disponible no es una huella de contenido autenticada')

    const confirmMock = transaction({ sourceRows: [controlledSourceRow] })
    const locked = await readArea3ReviewDocumentEvidenceTx(confirmMock.tx as any, {
      ...source({ documentLifecycleVersionState: eligibility.versionEstado }),
      lock: true,
    })
    assert.deepEqual(locked, { eligible: false, hash: null, kind: null }, 'ni la misma fuente bloqueada concede REVIEW_CONFIRM sin observación autenticada')
    assert.ok(confirmMock.statements.some(sql => /FOR KEY SHARE OF fr/.test(sql)), 'la confirmación vuelve a bloquear la fuente real')

    for (const statement of [...eligibilityMock.statements, ...previewMock.statements, ...confirmMock.statements]) {
      for (const forbidden of ['document_version_', 'area3_received_document_hashes', 'content_sha256', 'file_sha256', 'payload_hash', 'private_storage_handle']) {
        assert.equal(statement.includes(forbidden), false, `la lectura de evidencia no depende de ${forbidden}`)
      }
    }
  })
})

test('ausencia de esquema o fila productiva permanece ámbar y no hace fallback histórico', async () => {
  await withControlledDrive(async () => {
    for (const fixture of [{ sourceTables: false }, { sourceRows: [] }] as const) {
      const mock = transaction(fixture)
      const result = await readArea3ReviewDocumentEvidenceTx(mock.tx as any, { ...source(), lock: true })
      assert.deepEqual(result, { eligible: false, hash: null, kind: null })
      if (fixture.sourceTables === false) assert.equal(mock.statements.length, 1, 'sin tabla actual no se intenta una ruta histórica')
      assert.equal(mock.statements.some(sql => /document_version_|area3_received_document_hashes/.test(sql)), false)
    }
  })
})

test('el lector de evidencia activo no importa lifecycle, recovery ni APIs de archivo', () => {
  const root = resolve(__dirname, '..')
  const evidence = readFileSync(resolve(root, 'lib/finanzas/area3-review-document-evidence.ts'), 'utf8')
  assert.match(evidence, /readConciliarDocumentSourceEligibilityTx/)
  assert.match(evidence, /lockConciliarDocumentSourceForConfirmationTx/)
  assert.match(evidence, /void input\.source/)
  assert.match(evidence, /return unavailable\(\)/)
  assert.doesNotMatch(evidence, /conciliar-document-lifecycle-guard|conciliar-recovery|document_version_|area3_received_document_hashes|contentSha|fileSha|payloadHash|fetch\(|https?:/i)
})

console.log('OK: fuente disponible no prueba bytes ni concede revisión; fallback ámbar llano, sin lifecycle, recovery, DML ni llamadas externas.')
