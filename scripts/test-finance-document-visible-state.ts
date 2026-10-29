import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  financeDocumentVisibleStateFromRow,
  financeDocumentVisibleStatesByInvoice,
  type FinanceDocumentVisibleStateRow,
} from '../lib/finanzas/finance-document-visible-state-core'
import {
  FINANCE_DOCUMENT_VISIBLE_STATE_MAX_INVOICES,
  financeDocumentVisibleStateSql,
  readFinanceDocumentVisibleStates,
} from '../lib/finanzas/finance-document-visible-state-db'

function row(overrides: Partial<FinanceDocumentVisibleStateRow> = {}): FinanceDocumentVisibleStateRow {
  return {
    invoiceId: 'factura-sintetica-a',
    historicalDocumentDate: '2026-10-01',
    lifecycleId: 'lifecycle-sintetico-a',
    lifecycleState: 'ACTIVE',
    currentVersion: 2,
    snapshotVersion: 2,
    snapshotDocumentDate: '2026-10-02',
    hasTombstone: false,
    hasOpenChangeIncident: false,
    originalCreditProposed: false,
    originalCreditConfirmed: false,
    creditOfOriginalProposed: false,
    creditOfOriginalConfirmed: false,
    hasOpenHashDuplicate: false,
    ...overrides,
  }
}

function sqlText(statement: unknown): string {
  const value = statement as { strings?: readonly string[]; sql?: string; text?: string }
  return Array.isArray(value.strings) ? value.strings.join(' ? ') : value.sql ?? value.text ?? ''
}

// 1–25: núcleo puro, sin BD, Graph, OCR, B4 ni datos reales.
test('01 fallback histórico sin seguimiento documental', () => {
  const state = financeDocumentVisibleStateFromRow(null)
  assert.equal(state.documentDate.source, 'NO_DISPONIBLE')
  assert.equal(state.folder.state, 'SIN_SEGUIMIENTO_DOCUMENTAL')
  assert.equal(state.version.state, 'SIN_SEGUIMIENTO_DOCUMENTAL')
})

test('02 fallback histórico conserva fecha de factura', () => {
  const state = financeDocumentVisibleStateFromRow(row({ lifecycleId: null, snapshotVersion: null, snapshotDocumentDate: null, historicalDocumentDate: '2026-09-10' }))
  assert.deepEqual(state.documentDate, { value: '2026-09-10', source: 'HISTORICO_FACTURA', label: 'Fecha histórica de factura' })
})

test('03 fecha del snapshot tiene prioridad documental', () => {
  const state = financeDocumentVisibleStateFromRow(row({ snapshotDocumentDate: '2026-10-03', historicalDocumentDate: '2026-09-10' }))
  assert.equal(state.documentDate.value, '2026-10-03')
  assert.equal(state.documentDate.source, 'SNAPSHOT_ACTUAL')
})

test('04 snapshot sin fecha no inventa fecha y usa histórico', () => {
  const state = financeDocumentVisibleStateFromRow(row({ snapshotDocumentDate: null, historicalDocumentDate: '2026-09-10' }))
  assert.equal(state.documentDate.source, 'HISTORICO_FACTURA')
})

test('05 fecha inválida no se publica como fecha documental', () => {
  const state = financeDocumentVisibleStateFromRow(row({ snapshotDocumentDate: 'no-fecha', historicalDocumentDate: null }))
  assert.equal(state.documentDate.source, 'NO_DISPONIBLE')
})

test('06 fecha Date persistida se normaliza a día civil', () => {
  const state = financeDocumentVisibleStateFromRow(row({ snapshotDocumentDate: new Date('2026-10-04T22:00:00.000Z') }))
  assert.equal(state.documentDate.value, '2026-10-04')
})

test('07 última lectura queda explícitamente no registrada', () => {
  const state = financeDocumentVisibleStateFromRow(row())
  assert.deepEqual(state.lastRead, { value: null, source: 'NO_PERSISTIDA', label: 'Última lectura no registrada' })
})

test('08 lifecycle activo muestra carpeta activa', () => {
  assert.equal(financeDocumentVisibleStateFromRow(row()).folder.state, 'ACTIVO')
})

test('09 tombstone de lifecycle muestra borrado de la carpeta', () => {
  assert.equal(financeDocumentVisibleStateFromRow(row({ lifecycleState: 'TOMBSTONED' })).folder.state, 'BORRADO_DE_LA_CARPETA')
})

test('10 evidencia tombstone muestra borrado aunque estado no esté actualizado', () => {
  assert.equal(financeDocumentVisibleStateFromRow(row({ hasTombstone: true })).folder.state, 'BORRADO_DE_LA_CARPETA')
})

test('11 snapshot actual muestra versión vigente', () => {
  const state = financeDocumentVisibleStateFromRow(row({ snapshotVersion: 4 }))
  assert.deepEqual(state.version, { state: 'VERSION_ACTUAL', number: 4, label: 'Versión actual 4' })
})

test('12 lifecycle sin snapshot conserva datos históricos', () => {
  const state = financeDocumentVisibleStateFromRow(row({ snapshotVersion: null }))
  assert.equal(state.version.state, 'SIN_SNAPSHOT_CONSERVADOR')
  assert.match(state.version.label, /conservan datos históricos/)
})

test('13 versión cero no se trata como snapshot actual', () => {
  assert.equal(financeDocumentVisibleStateFromRow(row({ snapshotVersion: 0 })).version.state, 'SIN_SNAPSHOT_CONSERVADOR')
})

test('14 versión bigint segura se muestra', () => {
  assert.equal(financeDocumentVisibleStateFromRow(row({ snapshotVersion: BigInt(7) })).version.number, 7)
})

test('15 incidencia ámbar muestra documento cambiado', () => {
  const state = financeDocumentVisibleStateFromRow(row({ hasOpenChangeIncident: true }))
  assert.deepEqual(state.incident, { state: 'DOCUMENTO_CAMBIADO', label: 'El documento ha cambiado' })
})

test('16 sin incidencia no declara cambio', () => {
  assert.equal(financeDocumentVisibleStateFromRow(row()).incident.state, 'SIN_INCIDENCIA_DOCUMENTAL')
})

test('17 propuesta de rectificativa sobre original es visible', () => {
  assert.deepEqual(financeDocumentVisibleStateFromRow(row({ originalCreditProposed: true })).relations, ['ORIGINAL_CON_RECTIFICATIVA_PROPUESTA'])
})

test('18 rectificativa confirmada conserva su relación documental', () => {
  assert.deepEqual(financeDocumentVisibleStateFromRow(row({ creditOfOriginalConfirmed: true })).relations, ['RECTIFICATIVA_DE_ORIGINAL_CONFIRMADA'])
})

test('19 todas las relaciones se ordenan de forma estable', () => {
  const state = financeDocumentVisibleStateFromRow(row({
    originalCreditProposed: true,
    originalCreditConfirmed: true,
    creditOfOriginalProposed: true,
    creditOfOriginalConfirmed: true,
  }))
  assert.deepEqual(state.relations, [
    'ORIGINAL_CON_RECTIFICATIVA_PROPUESTA',
    'ORIGINAL_CON_RECTIFICATIVA_CONFIRMADA',
    'RECTIFICATIVA_DE_ORIGINAL_PROPUESTA',
    'RECTIFICATIVA_DE_ORIGINAL_CONFIRMADA',
  ])
  assert.ok(Object.isFrozen(state.relations))
})

test('20 duplicado por huella pendiente es visible sin huella', () => {
  const state = financeDocumentVisibleStateFromRow(row({ hasOpenHashDuplicate: true }))
  assert.deepEqual(state.duplicate, { state: 'DUPLICADO_POR_HUELLA_PENDIENTE', label: 'Posible duplicado por contenido; revisar' })
  assert.doesNotMatch(JSON.stringify(state), /[a-f0-9]{64}/i)
})

test('21 ausencia de duplicado no genera aviso', () => {
  assert.equal(financeDocumentVisibleStateFromRow(row()).duplicate.state, 'SIN_DUPLICADO_DETECTADO')
})

test('22 falsos estrictos no se convierten en incidencias', () => {
  const state = financeDocumentVisibleStateFromRow(row({ hasTombstone: 'false', hasOpenChangeIncident: 1, hasOpenHashDuplicate: 'true' }))
  assert.equal(state.folder.state, 'ACTIVO')
  assert.equal(state.incident.state, 'SIN_INCIDENCIA_DOCUMENTAL')
  assert.equal(state.duplicate.state, 'SIN_DUPLICADO_DETECTADO')
})

test('23 mapa sólo acepta facturas solicitadas', () => {
  const states = financeDocumentVisibleStatesByInvoice(['factura-sintetica-a'], [row(), row({ invoiceId: 'factura-sintetica-ajena' })])
  assert.deepEqual([...states.keys()], ['factura-sintetica-a'])
})

test('24 mapa conserva primera fila ante una duplicación anómala', () => {
  const states = financeDocumentVisibleStatesByInvoice(['factura-sintetica-a'], [row({ snapshotVersion: 2 }), row({ snapshotVersion: 9 })])
  assert.equal(states.get('factura-sintetica-a')?.version.number, 2)
})

test('25 mapa completa factura sin fila con fallback conservador', () => {
  const states = financeDocumentVisibleStatesByInvoice(['factura-sintetica-a', 'factura-sintetica-b'], [row()])
  assert.equal(states.get('factura-sintetica-b')?.folder.state, 'SIN_SEGUIMIENTO_DOCUMENTAL')
})

// 26–30: adaptador SQL mockeado. No hay conexiones ni consultas reales.
test('26 lector realiza una única consulta SELECT para la página actual', async () => {
  const calls: unknown[] = []
  const database = {
    $queryRaw: async <T>(statement: unknown): Promise<T> => {
      calls.push(statement)
      return [row(), row({ invoiceId: 'factura-sintetica-b' })] as T
    },
  }
  const states = await readFinanceDocumentVisibleStates(database as never, ['factura-sintetica-a', 'factura-sintetica-b'])
  assert.equal(calls.length, 1)
  assert.match(sqlText(calls[0]), /^\s*SELECT\b/i)
  assert.equal(states.size, 2)
})

test('27 lector vacío no consulta la base', async () => {
  let calls = 0
  const database = { $queryRaw: async <T>(): Promise<T> => { calls += 1; return [] as T } }
  const states = await readFinanceDocumentVisibleStates(database as never, [])
  assert.equal(calls, 0)
  assert.equal(states.size, 0)
})

test('28 SQL usa el convenio lifecycle real driveId:itemId', () => {
  const statement = sqlText(financeDocumentVisibleStateSql.queryForTests(['factura-sintetica-a']))
  assert.equal(financeDocumentVisibleStateSql.source, 'ONEDRIVE')
  assert.equal(financeDocumentVisibleStateSql.sourceKeyConvention, '<driveId>:<itemId>')
  assert.match(statement, /l\.source_item_key = \(f\.onedrive_drive_id \|\| ':' \|\| f\.onedrive_item_id\)/)
  assert.doesNotMatch(statement, /'onedrive:' \|\| f\.onedrive_drive_id/i)
})

test('29 SQL lee lifecycle, snapshots, incidencias, tombstones, rectificativas y duplicados sin datos sensibles', () => {
  const statement = sqlText(financeDocumentVisibleStateSql.queryForTests(['factura-sintetica-a']))
  for (const table of ['document_version_lifecycle', 'document_version_snapshots', 'document_version_incidents', 'document_version_tombstones', 'document_version_credit_links', 'document_version_hash_duplicates']) {
    assert.match(statement, new RegExp(table))
  }
  for (const sensitive of ['content_sha256', 'quick_xor_hash', 'private_storage_handle', 'original_file_name', 'exact_reference', 'evidence_hash']) {
    assert.doesNotMatch(statement, new RegExp(sensitive))
  }
  assert.doesNotMatch(statement, /\b(?:INSERT|UPDATE|DELETE|MERGE|CALL)\b/i)
  const route = readFileSync('app/api/admin/finanzas/facturas/route.ts', 'utf8')
  const page = readFileSync('app/admin/finanzas/facturas/page.tsx', 'utf8')
  assert.match(route, /requireB4FinanceAccess\('lectura', access\.session\)/)
  assert.match(route, /readFinanceDocumentVisibleStates\(prisma, facturas\.map\(factura => factura\.id\)\)/)
  assert.match(route, /documentVisibleState: documentStates\.get\(factura\.id\)/)
  assert.match(page, /documentVisibleState/)
  assert.match(page, /document\.lastRead\.label/)
  assert.match(page, /DOCUMENTO_CAMBIADO/)
  assert.match(page, /DUPLICADO_POR_HUELLA_PENDIENTE/)
  const core = readFileSync('lib/finanzas/finance-document-visible-state-core.ts', 'utf8')
  assert.match(core, /Última lectura no registrada/)
  assert.match(core, /El documento ha cambiado/)
  assert.match(core, /Posible duplicado por contenido; revisar/)
})

test('30 límite de página se rechaza antes de consultar', async () => {
  let calls = 0
  const database = { $queryRaw: async <T>(): Promise<T> => { calls += 1; return [] as T } }
  const ids = Array.from({ length: FINANCE_DOCUMENT_VISIBLE_STATE_MAX_INVOICES + 1 }, (_, index) => `factura-sintetica-${index}`)
  await assert.rejects(() => readFinanceDocumentVisibleStates(database as never, ids), /PAGE_TOO_LARGE/)
  assert.equal(calls, 0)
})
