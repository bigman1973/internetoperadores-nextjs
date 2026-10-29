import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import {
  CONCILIAR_DOCUMENT_LIFECYCLE_UNTRACKED,
  classifyConciliarDocumentLifecycleGuardSql,
  conciliarDocumentLifecycleGuardIsReadOnly,
  conciliarDocumentLifecycleGuardSql,
  lockConciliarDocumentLifecycleForConfirmationTx,
  readConciliarDocumentLifecycleEligibilityTx,
} from '../lib/finanzas/conciliar-document-lifecycle-guard'

const LIFECYCLE_ID = '11111111-1111-4111-8111-111111111111'
const SNAPSHOT_ID = '22222222-2222-4222-8222-222222222222'
const B5_ID = '33333333-3333-4333-8333-333333333333'
const DRIVE = 'drive-sintetico'
const ITEM = 'item-sintetico'

type Fixture = Readonly<{
  sourceRows?: readonly unknown[]
  lifecycleRows?: readonly unknown[]
  tombstoneRows?: readonly unknown[]
  incidentRows?: readonly unknown[]
}>

function source(kind: 'PAGO_FACTURA_RECIBIDA' | 'COBRO_CONFIRMING' | 'PAGO_NOMINA' | 'PAGO_TICKET_B5') {
  if (kind === 'PAGO_FACTURA_RECIBIDA') return { kind, facturaRecibidaId: 'factura-sintetica' } as const
  if (kind === 'COBRO_CONFIRMING') return { kind, confirmingId: 'confirming-sintetico', confirmingSourceHash: 'a'.repeat(64) } as const
  if (kind === 'PAGO_NOMINA') return { kind, nominaId: 'nomina-sintetica' } as const
  return { kind, adjuntoB5Id: B5_ID, gastoId: 'gasto-sintetico', documentoConciliableId: SNAPSHOT_ID } as const
}

function activeLifecycle(overrides: Record<string, unknown> = {}) {
  return [{ lifecycleId: LIFECYCLE_ID, state: 'ACTIVE', currentVersion: 1, snapshotId: SNAPSHOT_ID, ...overrides }]
}

function mockTx(fixture: Fixture = {}) {
  const statements: string[] = []
  const sourceRows = fixture.sourceRows ?? [{ driveId: DRIVE, itemId: ITEM }]
  const lifecycleRows = fixture.lifecycleRows ?? activeLifecycle()
  return {
    statements,
    tx: {
      async $queryRaw<T>(statement: unknown): Promise<T> {
        const sql = statement && typeof statement === 'object' && Array.isArray((statement as { strings?: unknown }).strings)
          ? ((statement as { strings: readonly string[] }).strings).join('?')
          : String(statement)
        statements.push(sql)
        assert.notEqual(classifyConciliarDocumentLifecycleGuardSql(sql), 'REJECTED', 'la guardia sólo puede emitir SELECT y bloqueos SELECT')
        assert.equal(classifyPrisma5RawSqlStatement([statement]), classifyConciliarDocumentLifecycleGuardSql(sql) === 'LOCK' ? 'row_lock' : 'read_only', 'la consulta real debe ser compatible con la actuación de Lorena sin ampliar la lista SQL')
        if (sql.includes('FROM facturas_recibidas fr') || sql.includes('FROM nominas n') || sql.includes('FROM adjuntos_pendientes_b5 a')) return sourceRows as T
        if (sql.includes('FROM document_version_lifecycle l')) return lifecycleRows as T
        if (sql.includes('FROM document_version_tombstones t')) return (fixture.tombstoneRows ?? []) as T
        if (sql.includes('FROM document_version_incidents i')) return (fixture.incidentRows ?? []) as T
        throw new Error('SQL sintético no reconocido')
      },
    },
  }
}

async function read(fixture: Fixture = {}, kind: Parameters<typeof source>[0] = 'PAGO_FACTURA_RECIBIDA') {
  const mock = mockTx(fixture)
  const result = await readConciliarDocumentLifecycleEligibilityTx(mock.tx as any, source(kind))
  return { ...mock, result }
}

const priorDrive = process.env.SHAREPOINT_DRIVE_ID
const priorDriveAlias = process.env.DRIVE_ID
process.env.SHAREPOINT_DRIVE_ID = DRIVE
delete process.env.DRIVE_ID

// 1–26 validate server resolution, historic compatibility, unsafe states and
// the transaction-time optimistic version check. All identities are synthetic.
test('01 ausencia histórica de lifecycle no degrada una factura recibida', async () => {
  const { result } = await read({ lifecycleRows: [] })
  assert.deepEqual(result, { lifecycleConocido: false, elegible: true, versionEstado: CONCILIAR_DOCUMENT_LIFECYCLE_UNTRACKED, codigo: 'SIN_LIFECYCLE_HISTORICO', requiereRevisionHumana: false })
  const mock = mockTx({ lifecycleRows: [] })
  const locked = await lockConciliarDocumentLifecycleForConfirmationTx(mock.tx as any, { source: source('PAGO_FACTURA_RECIBIDA'), expectedVersionState: undefined })
  assert.equal(locked.elegible, true)
})
test('02 lifecycle activo de recibida es elegible', async () => {
  const { result } = await read()
  assert.equal(result.codigo, 'LIFECYCLE_VIGENTE'); assert.equal(result.elegible, true); assert.match(result.versionEstado, /^[a-f0-9]{64}$/)
})
test('03 estado TOMBSTONED bloquea recibida', async () => {
  const { result } = await read({ lifecycleRows: activeLifecycle({ state: 'TOMBSTONED' }) })
  assert.deepEqual([result.elegible, result.codigo, result.requiereRevisionHumana], [false, 'DOCUMENTO_TOMBSTONED', true])
})
test('04 tombstone append-only bloquea aunque el estado sea ACTIVE', async () => {
  const { result } = await read({ tombstoneRows: [{ id: SNAPSHOT_ID }] })
  assert.equal(result.codigo, 'DOCUMENTO_TOMBSTONED')
})
test('05 incidencia de cambio pendiente bloquea', async () => {
  const { result } = await read({ incidentRows: [{ code: 'AMBAR_DOCUMENTO_CAMBIADO' }] })
  assert.equal(result.codigo, 'INCIDENCIA_CAMBIO_DOCUMENTAL_PENDIENTE')
})
test('06 incidencia de recuperación pendiente bloquea', async () => {
  const { result } = await read({ incidentRows: [{ code: 'AMBAR_DOCUMENTO_RECUPERADO' }] })
  assert.equal(result.codigo, 'INCIDENCIA_RECUPERACION_DOCUMENTAL_PENDIENTE')
})
test('07 versión cero conocida nunca se considera snapshot vigente', async () => {
  const { result } = await read({ lifecycleRows: activeLifecycle({ currentVersion: 0, snapshotId: null }) })
  assert.equal(result.codigo, 'SNAPSHOT_DOCUMENTAL_NO_VIGENTE')
})
test('08 lifecycle conocido sin snapshot actual bloquea', async () => {
  const { result } = await read({ lifecycleRows: activeLifecycle({ snapshotId: null }) })
  assert.equal(result.codigo, 'SNAPSHOT_DOCUMENTAL_NO_VIGENTE')
})
test('09 identificador lifecycle malformado bloquea sin inferir otro', async () => {
  const { result } = await read({ lifecycleRows: activeLifecycle({ lifecycleId: 'no-id' }) })
  assert.equal(result.codigo, 'SNAPSHOT_DOCUMENTAL_NO_VIGENTE')
})
test('10 estado lifecycle desconocido bloquea', async () => {
  const { result } = await read({ lifecycleRows: activeLifecycle({ state: 'RECOVERED' }) })
  assert.equal(result.codigo, 'SNAPSHOT_DOCUMENTAL_NO_VIGENTE')
})
test('11 lifecycle duplicado bloquea la acción', async () => {
  const { result } = await read({ lifecycleRows: [...activeLifecycle(), ...activeLifecycle({ lifecycleId: '44444444-4444-4444-8444-444444444444' })] })
  assert.equal(result.codigo, 'SNAPSHOT_DOCUMENTAL_NO_VIGENTE')
})
test('12 fuente recibida ausente no inventa lifecycle y conserva compatibilidad histórica', async () => {
  const { result } = await read({ sourceRows: [] })
  assert.equal(result.versionEstado, CONCILIAR_DOCUMENT_LIFECYCLE_UNTRACKED)
})
test('13 confirming resuelve su factura recibida sólo desde servidor', async () => {
  const { result, statements } = await read({}, 'COBRO_CONFIRMING')
  assert.equal(result.codigo, 'LIFECYCLE_VIGENTE'); assert.ok(statements.some(sql => sql.includes('FROM facturas_recibidas fr')))
})
test('14 nómina usa la biblioteca controlada configurada para su identidad', async () => {
  const { result, statements } = await read({ sourceRows: [{ driveId: 'no-usar', itemId: ITEM }] }, 'PAGO_NOMINA')
  assert.equal(result.codigo, 'LIFECYCLE_VIGENTE'); assert.ok(statements.some(sql => sql.includes('FROM nominas n')))
})
test('15 nómina sin identidad documental válida no inventa lifecycle', async () => {
  const { result } = await read({ sourceRows: [{ driveId: null, itemId: 'x' }] }, 'PAGO_NOMINA')
  assert.equal(result.versionEstado, CONCILIAR_DOCUMENT_LIFECYCLE_UNTRACKED)
})
test('16 B5 resuelve drive e item sólo desde el adjunto persistido', async () => {
  const { result, statements } = await read({}, 'PAGO_TICKET_B5')
  assert.equal(result.codigo, 'LIFECYCLE_VIGENTE'); assert.ok(statements.some(sql => sql.includes('FROM adjuntos_pendientes_b5 a')))
})
test('17 B5 sin item controlado no inventa lifecycle', async () => {
  const { result } = await read({ sourceRows: [{ driveId: DRIVE, itemId: 'x' }] }, 'PAGO_TICKET_B5')
  assert.equal(result.versionEstado, CONCILIAR_DOCUMENT_LIFECYCLE_UNTRACKED)
})
test('18 bloqueo de confirmación acepta exactamente el versionEstado persistido', async () => {
  const first = await read()
  const mock = mockTx()
  const result = await lockConciliarDocumentLifecycleForConfirmationTx(mock.tx as any, { source: source('PAGO_FACTURA_RECIBIDA'), expectedVersionState: first.result.versionEstado })
  assert.equal(result.elegible, true)
})
test('19 bloqueo exige versionEstado de proyección', async () => {
  const mock = mockTx()
  const result = await lockConciliarDocumentLifecycleForConfirmationTx(mock.tx as any, { source: source('PAGO_FACTURA_RECIBIDA'), expectedVersionState: null })
  assert.equal(result.codigo, 'ESTADO_VERSION_DOCUMENTAL_AUSENTE')
})
test('20 bloqueo detecta snapshot cambiado', async () => {
  const mock = mockTx()
  const result = await lockConciliarDocumentLifecycleForConfirmationTx(mock.tx as any, { source: source('PAGO_FACTURA_RECIBIDA'), expectedVersionState: 'f'.repeat(64) })
  assert.equal(result.codigo, 'SNAPSHOT_DOCUMENTAL_CAMBIADO')
})
test('21 bloqueo vuelve a denegar tombstone aunque la proyección fuera verde', async () => {
  const first = await read()
  const mock = mockTx({ lifecycleRows: activeLifecycle({ state: 'TOMBSTONED' }) })
  const result = await lockConciliarDocumentLifecycleForConfirmationTx(mock.tx as any, { source: source('PAGO_FACTURA_RECIBIDA'), expectedVersionState: first.result.versionEstado })
  assert.equal(result.codigo, 'DOCUMENTO_TOMBSTONED')
})
test('22 bloqueo vuelve a denegar cambio pendiente aunque el snapshot coincida', async () => {
  const first = await read()
  const mock = mockTx({ incidentRows: [{ code: 'AMBAR_DOCUMENTO_CAMBIADO' }] })
  const result = await lockConciliarDocumentLifecycleForConfirmationTx(mock.tx as any, { source: source('PAGO_FACTURA_RECIBIDA'), expectedVersionState: first.result.versionEstado })
  assert.equal(result.codigo, 'INCIDENCIA_CAMBIO_DOCUMENTAL_PENDIENTE')
})
test('23 bloqueo vuelve a denegar recuperación pendiente aunque el snapshot coincida', async () => {
  const first = await read()
  const mock = mockTx({ incidentRows: [{ code: 'AMBAR_DOCUMENTO_RECUPERADO' }] })
  const result = await lockConciliarDocumentLifecycleForConfirmationTx(mock.tx as any, { source: source('PAGO_FACTURA_RECIBIDA'), expectedVersionState: first.result.versionEstado })
  assert.equal(result.codigo, 'INCIDENCIA_RECUPERACION_DOCUMENTAL_PENDIENTE')
})
test('24 bloqueo confirming compara lifecycle, no el sourceHash C11', async () => {
  const first = await read({}, 'COBRO_CONFIRMING')
  const mock = mockTx()
  const result = await lockConciliarDocumentLifecycleForConfirmationTx(mock.tx as any, { source: source('COBRO_CONFIRMING'), expectedVersionState: first.result.versionEstado })
  assert.equal(result.codigo, 'LIFECYCLE_VIGENTE')
})
test('25 bloqueo nómina funciona con identity configurada en servidor', async () => {
  const first = await read({}, 'PAGO_NOMINA')
  const mock = mockTx()
  const result = await lockConciliarDocumentLifecycleForConfirmationTx(mock.tx as any, { source: source('PAGO_NOMINA'), expectedVersionState: first.result.versionEstado })
  assert.equal(result.codigo, 'LIFECYCLE_VIGENTE')
})
test('26 bloqueo B5 funciona con adjunto persistido y no con input HTTP', async () => {
  const first = await read({}, 'PAGO_TICKET_B5')
  const mock = mockTx()
  const result = await lockConciliarDocumentLifecycleForConfirmationTx(mock.tx as any, { source: source('PAGO_TICKET_B5'), expectedVersionState: first.result.versionEstado })
  assert.equal(result.codigo, 'LIFECYCLE_VIGENTE')
})

// 27–30 are the requested SQL action-classifier battery. They operate only on
// synthetic statements and do not execute SQL against any database.
test('27 clasificador admite SELECT de lectura', () => {
  assert.equal(classifyConciliarDocumentLifecycleGuardSql('SELECT id FROM tabla LIMIT 1'), 'READ')
})
test('28 clasificador admite SELECT con bloqueo permitido', () => {
  assert.equal(classifyConciliarDocumentLifecycleGuardSql('SELECT id FROM tabla LIMIT 1 FOR KEY SHARE'), 'LOCK')
})
test('29 clasificador rechaza DML aunque llegue tras un comentario', () => {
  assert.equal(classifyConciliarDocumentLifecycleGuardSql('-- sintético\nUPDATE tabla SET estado=1'), 'REJECTED')
})
test('30 clasificador rechaza ROW_NUMBER y TRANSLATE', () => {
  assert.equal(classifyConciliarDocumentLifecycleGuardSql('SELECT ROW_NUMBER() OVER () FROM tabla'), 'REJECTED')
  assert.equal(classifyConciliarDocumentLifecycleGuardSql("SELECT TRANSLATE(valor,'a','b') FROM tabla"), 'REJECTED')
  assert.equal(conciliarDocumentLifecycleGuardIsReadOnly, true)
  for (const statement of Object.values(conciliarDocumentLifecycleGuardSql)) {
    assert.notEqual(classifyConciliarDocumentLifecycleGuardSql(statement), 'REJECTED')
    assert.equal(/\b(?:INSERT|DELETE|MERGE|CALL|ROW_NUMBER|TRANSLATE)\b/i.test(statement), false)
  }
})

if (priorDrive === undefined) delete process.env.SHAREPOINT_DRIVE_ID
else process.env.SHAREPOINT_DRIVE_ID = priorDrive
if (priorDriveAlias === undefined) delete process.env.DRIVE_ID
else process.env.DRIVE_ID = priorDriveAlias

console.log('OK: 30 casos sintéticos de guardia lifecycle; sin DB, Graph, HTTP, B4, B5, C11 ni datos reales.')
