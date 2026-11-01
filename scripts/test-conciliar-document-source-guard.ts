/* Source guard: pruebas sintéticas, sin BD, Graph, HTTP, B4, B5, C11 ni datos reales. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import {
  classifyConciliarDocumentSourceGuardSql,
  conciliarDocumentSourceGuardBatchSql,
  conciliarDocumentSourceGuardIsReadOnly,
  conciliarDocumentSourceGuardSql,
  conciliarDocumentSourceBatchSourceKey,
  lockConciliarDocumentSourceForConfirmationTx,
  preloadConciliarDocumentSourceEligibilityTx,
  readConciliarDocumentSourceEligibilityTx,
} from '../lib/finanzas/conciliar-document-source-guard'

const DRIVE = 'drive-sintetico'
const ITEM = 'item-sintetico'
const B5 = '33333333-3333-4333-8333-333333333333'
const DOCUMENTO = '44444444-4444-4444-8444-444444444444'
const PAYROLL_DOCUMENT = '55555555-5555-4555-8555-555555555555'
const SHA = 'a'.repeat(64)
const UPDATED_AT = '2026-11-01 09:27:00.000'

type Availability = Readonly<{ facturasRecibidas: boolean; nominas: boolean; nominaDocumentos: boolean; adjuntosB5: boolean }>
type Fixture = Readonly<{
  availability?: Availability
  invoiceRows?: readonly Record<string, unknown>[]
  payrollRows?: readonly Record<string, unknown>[]
  b5Rows?: readonly Record<string, unknown>[]
  batchRows?: readonly Record<string, unknown>[]
}>

function sqlText(statement: unknown): string {
  return statement && typeof statement === 'object' && Array.isArray((statement as { strings?: unknown }).strings)
    ? ((statement as { strings: readonly string[] }).strings).join('?')
    : String(statement)
}

function invoiceRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceId: 'factura-sintetica', driveId: DRIVE, itemId: ITEM,
    archivo: '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026/factura.pdf',
    updatedAt: UPDATED_AT,
    ...overrides,
  }
}
function payrollRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceId: 'nomina-sintetica', employeeId: 'empleado-sintetico', payrollMonth: 10, payrollYear: 2026,
    payrollNet: '1234.56', payrollDocumentId: PAYROLL_DOCUMENT, itemId: ITEM,
    payrollDocumentName: 'nomina.pdf', payrollDocumentCreatedAt: UPDATED_AT,
    ...overrides,
  }
}
function b5Row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceId: B5, state: 'UPLOAD_COMPLETO', documentType: 'TICKET', movementId: 'movimiento-sintetico',
    gastoId: 'gasto-sintetico', documentoConciliableId: DOCUMENTO, driveId: DRIVE, itemId: ITEM,
    fileSha256: SHA, payloadHash: 'b'.repeat(64), storageName: '33333333-3333-4333-8333-333333333333.pdf', updatedAt: UPDATED_AT,
    ...overrides,
  }
}
function availability(overrides: Partial<Availability> = {}): Availability {
  return { facturasRecibidas: true, nominas: true, nominaDocumentos: true, adjuntosB5: true, ...overrides }
}
function source(kind: 'PAGO_FACTURA_RECIBIDA' | 'COBRO_CONFIRMING' | 'PAGO_NOMINA' | 'PAGO_TICKET_B5') {
  if (kind === 'PAGO_FACTURA_RECIBIDA') return { kind, facturaRecibidaId: 'factura-sintetica' } as const
  if (kind === 'COBRO_CONFIRMING') return { kind, confirmingId: 'factura-sintetica', confirmingSourceHash: 'c'.repeat(64) } as const
  if (kind === 'PAGO_NOMINA') return { kind, nominaId: 'nomina-sintetica' } as const
  return { kind, adjuntoB5Id: B5, gastoId: 'gasto-sintetico', documentoConciliableId: DOCUMENTO } as const
}

function mockTx(fixture: Fixture = {}) {
  const statements: string[] = []
  return {
    statements,
    tx: {
      async $queryRaw<T>(statement: unknown): Promise<T> {
        const sql = sqlText(statement)
        statements.push(sql)
        assert.notEqual(classifyConciliarDocumentSourceGuardSql(sql), 'REJECTED', 'la guardia sólo puede emitir SELECT y bloqueos SELECT')
        assert.equal(classifyPrisma5RawSqlStatement([statement]), classifyConciliarDocumentSourceGuardSql(sql) === 'LOCK' ? 'row_lock' : 'read_only', 'la consulta real debe permanecer en la whitelist Prisma')
        if (sql.includes('to_regclass(')) return [fixture.availability ?? availability()] as T
        if (/^\s*WITH requested AS \(/.test(sql)) return (fixture.batchRows ?? []) as T
        if (sql.includes('FROM facturas_recibidas fr')) return (fixture.invoiceRows ?? [invoiceRow()]) as T
        if (sql.includes('FROM nominas n')) return (fixture.payrollRows ?? [payrollRow()]) as T
        if (sql.includes('FROM adjuntos_pendientes_b5 a')) return (fixture.b5Rows ?? [b5Row()]) as T
        throw new Error('SQL sintético no reconocido')
      },
    },
  }
}

const priorDrive = process.env.SHAREPOINT_DRIVE_ID
const priorDriveAlias = process.env.DRIVE_ID
process.env.SHAREPOINT_DRIVE_ID = DRIVE
delete process.env.DRIVE_ID

async function withSyntheticDrive<T>(read: () => Promise<T>): Promise<T> {
  const savedDrive = process.env.SHAREPOINT_DRIVE_ID
  const savedAlias = process.env.DRIVE_ID
  process.env.SHAREPOINT_DRIVE_ID = DRIVE
  delete process.env.DRIVE_ID
  try { return await read() } finally {
    if (savedDrive === undefined) delete process.env.SHAREPOINT_DRIVE_ID
    else process.env.SHAREPOINT_DRIVE_ID = savedDrive
    if (savedAlias === undefined) delete process.env.DRIVE_ID
    else process.env.DRIVE_ID = savedAlias
  }
}

test('01 catálogo ausente falla ámbar antes de consultar una fuente', async () => {
  const mock = mockTx({ availability: availability({ facturasRecibidas: false }) })
  const result = await readConciliarDocumentSourceEligibilityTx(mock.tx as any, source('PAGO_FACTURA_RECIBIDA'))
  assert.deepEqual([result.elegible, result.codigo, result.requiereRevisionHumana], [false, 'FUENTE_DOCUMENTAL_NO_DISPONIBLE', true])
  assert.equal(mock.statements.length, 1)
  assert.match(mock.statements[0]!, /to_regclass\('public\.facturas_recibidas'\)/)
})

test('02 recibida controlada se sella desde la fila actual del servidor', async () => {
  const mock = mockTx()
  const result = await readConciliarDocumentSourceEligibilityTx(mock.tx as any, source('PAGO_FACTURA_RECIBIDA'))
  assert.deepEqual([result.elegible, result.codigo, result.fuenteConocida], [true, 'FUENTE_DOCUMENTAL_VIGENTE', true])
  assert.match(result.versionEstado, /^[a-f0-9]{64}$/)
  assert.equal(mock.statements.length, 2)
  assert.match(mock.statements[1]!, /FROM facturas_recibidas fr/)
})

test('03 fila o identidad documental ausente nunca equivale a histórico verde', async () => {
  const missing = mockTx({ invoiceRows: [] })
  const missingResult = await readConciliarDocumentSourceEligibilityTx(missing.tx as any, source('PAGO_FACTURA_RECIBIDA'))
  assert.equal(missingResult.codigo, 'FUENTE_DOCUMENTAL_NO_DISPONIBLE')
  const invalid = mockTx({ invoiceRows: [invoiceRow({ itemId: 'x' })] })
  const invalidResult = await readConciliarDocumentSourceEligibilityTx(invalid.tx as any, source('PAGO_FACTURA_RECIBIDA'))
  assert.equal(invalidResult.codigo, 'FUENTE_DOCUMENTAL_NO_DISPONIBLE')
  assert.equal(invalidResult.elegible, false)
})

test('04 lock revalida una huella exacta y toma lock de la misma fila', async () => {
  const read = mockTx()
  const first = await readConciliarDocumentSourceEligibilityTx(read.tx as any, source('PAGO_FACTURA_RECIBIDA'))
  const locked = mockTx()
  const result = await lockConciliarDocumentSourceForConfirmationTx(locked.tx as any, { source: source('PAGO_FACTURA_RECIBIDA'), expectedVersionState: first.versionEstado })
  assert.equal(result.codigo, 'FUENTE_DOCUMENTAL_VIGENTE')
  assert.match(locked.statements[1]!, /FOR KEY SHARE OF fr/)
})

test('05 lock detecta una fuente modificada y falta de estado sellado', async () => {
  const first = mockTx()
  const current = await readConciliarDocumentSourceEligibilityTx(first.tx as any, source('PAGO_FACTURA_RECIBIDA'))
  const changed = mockTx({ invoiceRows: [invoiceRow({ updatedAt: '2026-11-01 10:27:00.000' })] })
  const changedResult = await lockConciliarDocumentSourceForConfirmationTx(changed.tx as any, { source: source('PAGO_FACTURA_RECIBIDA'), expectedVersionState: current.versionEstado })
  assert.equal(changedResult.codigo, 'FUENTE_DOCUMENTAL_CAMBIADA')
  const absent = mockTx()
  const absentResult = await lockConciliarDocumentSourceForConfirmationTx(absent.tx as any, { source: source('PAGO_FACTURA_RECIBIDA'), expectedVersionState: null })
  assert.equal(absentResult.codigo, 'ESTADO_FUENTE_DOCUMENTAL_AUSENTE')
})

test('06 confirming reusa sólo la factura controlada del servidor, no C11', async () => {
  const mock = mockTx()
  const result = await readConciliarDocumentSourceEligibilityTx(mock.tx as any, source('COBRO_CONFIRMING'))
  assert.equal(result.codigo, 'FUENTE_DOCUMENTAL_VIGENTE')
  assert.match(mock.statements[1]!, /FROM facturas_recibidas fr/)
  assert.equal(mock.statements.some(sql => sql.includes('confirmingSourceHash')), false)
})

test('07 nómina exige fila y documento productivos bajo biblioteca configurada', async () => {
  const mock = mockTx()
  const result = await readConciliarDocumentSourceEligibilityTx(mock.tx as any, source('PAGO_NOMINA'))
  assert.equal(result.codigo, 'FUENTE_DOCUMENTAL_VIGENTE')
  assert.match(mock.statements[1]!, /FROM nominas n/)
  const missingTable = mockTx({ availability: availability({ nominaDocumentos: false }) })
  const unavailable = await readConciliarDocumentSourceEligibilityTx(missingTable.tx as any, source('PAGO_NOMINA'))
  assert.equal(unavailable.codigo, 'FUENTE_DOCUMENTAL_NO_DISPONIBLE')
  assert.equal(missingTable.statements.length, 1)
})

test('08 B5 exige identidad sellada, estado completo, biblioteca y hashes ya persistidos', async () => {
  await withSyntheticDrive(async () => {
    const mock = mockTx()
    const result = await readConciliarDocumentSourceEligibilityTx(mock.tx as any, source('PAGO_TICKET_B5'))
    assert.equal(result.codigo, 'FUENTE_DOCUMENTAL_VIGENTE')
    assert.match(mock.statements[1]!, /FROM adjuntos_pendientes_b5 a/)
    const incomplete = mockTx({ b5Rows: [b5Row({ state: 'RESERVADO' })] })
    const blocked = await readConciliarDocumentSourceEligibilityTx(incomplete.tx as any, source('PAGO_TICKET_B5'))
    assert.equal(blocked.codigo, 'FUENTE_DOCUMENTAL_NO_DISPONIBLE')
  })
})

test('09 preload comprueba catálogo primero y procesa cuatro fuentes en un SELECT paginado', async () => {
  await withSyntheticDrive(async () => {
    const sources = [source('PAGO_FACTURA_RECIBIDA'), source('COBRO_CONFIRMING'), source('PAGO_NOMINA'), source('PAGO_TICKET_B5')]
    const rows = [
      { sourceKind: 'RECIBIDA', ...invoiceRow() },
      { sourceKind: 'CONFIRMING', ...invoiceRow() },
      { sourceKind: 'NOMINA', ...payrollRow() },
      { sourceKind: 'B5', ...b5Row() },
    ]
    const mock = mockTx({ batchRows: rows })
    const result = await preloadConciliarDocumentSourceEligibilityTx(mock.tx as any, sources)
    assert.equal(mock.statements.length, 2)
    assert.match(mock.statements[0]!, /to_regclass/)
    assert.match(mock.statements[1]!, /^\s*WITH requested AS \(/)
    for (const item of sources) assert.equal(result.get(conciliarDocumentSourceBatchSourceKey(item)!)?.codigo, 'FUENTE_DOCUMENTAL_VIGENTE')
    assert.equal(mock.statements[1]!.includes('document_version'), false)
    assert.equal(mock.statements[1]!.includes('confirmingSourceHash'), false)
  })
})

test('10 preload deja ámbar una familia cuya tabla no existe sin impedir otras pruebas reales', async () => {
  const received = source('PAGO_FACTURA_RECIBIDA')
  const b5 = source('PAGO_TICKET_B5')
  const mock = mockTx({
    availability: availability({ adjuntosB5: false }),
    batchRows: [{ sourceKind: 'RECIBIDA', ...invoiceRow() }],
  })
  const result = await preloadConciliarDocumentSourceEligibilityTx(mock.tx as any, [received, b5])
  assert.equal(result.get(conciliarDocumentSourceBatchSourceKey(received)!)?.codigo, 'FUENTE_DOCUMENTAL_VIGENTE')
  assert.equal(result.get(conciliarDocumentSourceBatchSourceKey(b5)!)?.codigo, 'FUENTE_DOCUMENTAL_NO_DISPONIBLE')
  assert.equal(mock.statements.length, 2)
  assert.equal(mock.statements[1]!.includes('adjuntos_pendientes_b5'), false)
})

test('11 preload no omite una identidad malformada: la deja ámbar sin enviarla a SQL', async () => {
  const malformed = { kind: 'PAGO_FACTURA_RECIBIDA' as const, facturaRecibidaId: '\u0000' }
  const mock = mockTx()
  const result = await preloadConciliarDocumentSourceEligibilityTx(mock.tx as any, [malformed])
  assert.equal(result.get(conciliarDocumentSourceBatchSourceKey(malformed)!)?.codigo, 'FUENTE_DOCUMENTAL_NO_DISPONIBLE')
  assert.equal(mock.statements.length, 1)
  assert.match(mock.statements[0]!, /to_regclass/)
})

test('12 declaraciones SQL y módulo no contienen dependencia congelada ni DML', () => {
  assert.equal(conciliarDocumentSourceGuardIsReadOnly, true)
  for (const statement of Object.values(conciliarDocumentSourceGuardSql)) {
    assert.notEqual(classifyConciliarDocumentSourceGuardSql(statement), 'REJECTED')
    assert.equal(/\b(?:INSERT|UPDATE|DELETE|MERGE|CALL|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(statement), false)
  }
  const query = conciliarDocumentSourceGuardBatchSql.queryForTests([source('PAGO_FACTURA_RECIBIDA')])
  assert.ok(query)
  const text = sqlText(query)
  assert.equal(classifyConciliarDocumentSourceGuardSql(text), 'READ')
  assert.equal(/document_version|area3_received_document_hashes|conciliar-document-lifecycle-guard/.test(text), false)
  const module = readFileSync(new URL('../lib/finanzas/conciliar-document-source-guard.ts', import.meta.url), 'utf8')
  assert.equal(/from ['"].*(?:conciliar-document-lifecycle-guard|finance-document-lifecycle|finance-document-private-archive)/.test(module), false)
  assert.equal(/document_version_|area3_received_document_hashes/.test(module.replace(/\/\*[\s\S]*?\*\//g, '')), false)
})

test('13 clasificador rechaza DML y conserva sólo lectura o lock', () => {
  assert.equal(classifyConciliarDocumentSourceGuardSql('SELECT id FROM tabla LIMIT 1'), 'READ')
  assert.equal(classifyConciliarDocumentSourceGuardSql('SELECT id FROM tabla LIMIT 1 FOR KEY SHARE'), 'LOCK')
  assert.equal(classifyConciliarDocumentSourceGuardSql('-- sintético\nUPDATE tabla SET estado=1'), 'REJECTED')
  assert.equal(classifyConciliarDocumentSourceGuardSql('SELECT ROW_NUMBER() OVER () FROM tabla'), 'REJECTED')
})

if (priorDrive === undefined) delete process.env.SHAREPOINT_DRIVE_ID
else process.env.SHAREPOINT_DRIVE_ID = priorDrive
if (priorDriveAlias === undefined) delete process.env.DRIVE_ID
else process.env.DRIVE_ID = priorDriveAlias

console.log('OK: 13 casos sintéticos de guardia de fuente; sin BD, Graph, HTTP, B4, B5, C11 ni datos reales.')
