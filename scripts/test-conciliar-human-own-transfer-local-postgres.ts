/*
 * Ensayo LOCAL, opt-in y rollback-only de parejas propias humanas de Conciliar.
 *
 * No usa DATABASE_URL implícita, red, producción, Azure, Graph, correo, sync,
 * importaciones, rebuild, migraciones ni DDL. Sólo acepta el socket privado
 * autorizado, toma el lock ya existente y termina toda escritura en ROLLBACK.
 *
 * Ejecución:
 *   exec 9>/home/ubuntu/conciliar-arreglos-20261030/privado/sql.lock
 *   flock -n 9 ./node_modules/.bin/tsx scripts/test-conciliar-human-own-transfer-local-postgres.ts
 */
import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Prisma, PrismaClient } from '@prisma/client'

const CONFIG = '/home/ubuntu/conciliar-cierre-20261029/privado/local-admin-db.json'
const PRIVATE_SOCKET_PREFIX = '/home/ubuntu/conciliar-cierre-20261029/privado/'
const REQUIRED_DATABASE = 'io_staging_finanzas'
const REQUIRED_USER = 'io_staging_finanzas'
const ROLLBACK = 'CONCILIAR_HUMAN_OWN_TRANSFER_LOCAL_ROLLBACK_ONLY'
const MAX_MILLISECONDS = 180_000
const DAY = new Date(Date.UTC(2044, 8, 17, 12, 0, 0))
const TAG = `CONCILIAR-HUMAN-OWN-LOCAL-${randomUUID()}`

type DbConfig = Readonly<{ host: string; port: number; database: string; user: string; password: string; ssl: boolean }>
type Snapshot = Record<string, Readonly<{ count: string; digest: string }>>
type Tx = Prisma.TransactionClient & Record<string, any>

class IntentionalRollback extends Error { constructor() { super(ROLLBACK) } }

function sha(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex') }

function config(): DbConfig {
  const value = JSON.parse(readFileSync(process.env.CONCILIAR_HUMAN_OWN_TRANSFER_LOCAL_CONFIG_FILE ?? CONFIG, 'utf8')) as Partial<DbConfig>
  assert.equal(value.database, REQUIRED_DATABASE, 'La copia local no tiene la identidad de staging autorizada.')
  assert.ok([55440, 55444].includes(Number(value.port)), 'La copia local no usa el puerto privado autorizado.')
  assert.equal(value.ssl, false, 'El ensayo no admite TLS ni un destino remoto.')
  assert.ok(typeof value.host === 'string' && [PRIVATE_SOCKET_PREFIX, '/home/ubuntu/conciliar-arreglos-20261030/privado/'].some(prefix => value.host!.startsWith(prefix)), 'El ensayo sólo admite el socket privado local.')
  assert.equal(value.user, REQUIRED_USER, 'La copia local no usa el rol aislado autorizado.')
  assert.equal(typeof value.password, 'string', 'La configuración local no está completa.')
  return value as DbConfig
}

function socketUrl(value: DbConfig): string {
  const query = new URLSearchParams({ host: value.host, sslmode: 'disable' })
  return `postgresql://${encodeURIComponent(REQUIRED_USER)}:${encodeURIComponent(value.password)}@localhost:${value.port}/${value.database}?${query.toString()}`
}

function configureRuntime(databaseUrl: string): void {
  process.env.DATABASE_URL = databaseUrl
  process.env.FINANCE_STAGING_SANDBOX = '1'
  process.env.VERCEL_ENV = 'development'
  process.env.FINANCE_EASY_PRODUCTION_ENABLED = '0'
  process.env.FINANCE_MODEL_PRODUCTION_ENABLED = '0'
  process.env.FINANCE_AUTOMATIC_LINKS_DISABLED = '1'
  process.env.FINANCE_CONCILIAR_PRODUCTION_ENABLED = '0'
  process.env.NEXT_PUBLIC_FINANCE_CONCILIAR_PRODUCTION_ENABLED = '0'
  delete process.env.IO_PRODUCTION_READ_ONLY
}

async function snapshot(client: Pick<PrismaClient, '$queryRaw'>): Promise<Snapshot> {
  const proofTable = await ownershipTable(client)
  const rows = await client.$queryRaw<Array<{ name: string; count: string; digest: string }>>(Prisma.sql`
    SELECT name,count,digest FROM (
      SELECT 'cuentas'::text AS name,count(*)::text AS count,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) AS digest FROM cuentas_bancarias t
      UNION ALL SELECT 'movimientos',count(*)::text,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM movimientos_bancarios t
      UNION ALL SELECT 'titularidad',count(*)::text,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM ${Prisma.raw(proofTable)} t
      UNION ALL SELECT 'proyeccion',count(*)::text,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM conciliar_proyecciones t
      UNION ALL SELECT 'recibos_conciliar',count(*)::text,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM operaciones_conciliar t
      UNION ALL SELECT 'patas_conciliar',count(*)::text,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.operacion_conciliar_id::text || ':' || t.ordinal::text),'')) FROM patas_operacion_conciliar t
      UNION ALL SELECT 'estado_b4',count(*)::text,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.movimiento_id),'')) FROM estado_justificacion_movimientos t
      UNION ALL SELECT 'operaciones_b4',count(*)::text,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM operaciones_justificacion_b4 t
      UNION ALL SELECT 'eventos_b4',count(*)::text,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM eventos_justificacion_b4 t
      UNION ALL SELECT 'vinculos_b4',count(*)::text,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM vinculos_movimiento_documento t
      UNION ALL SELECT 'decisiones_p1',count(*)::text,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM decisiones_tercero_modo_facil t
      UNION ALL SELECT 'estado_proyeccion',count(*)::text,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.singleton::text),'')) FROM estado_proyeccion_conciliar t
    ) s
    ORDER BY name ASC
  `)
  assert.equal(rows.length, 12, 'No se pudo calcular el agregado local de rollback.')
  return Object.fromEntries(rows.map(row => [row.name, { count: row.count, digest: row.digest }]))
}

function sourceFor(movimientoId: string, movimientoParId: string, pairId: string) {
  return {
    kind: 'TRANSFERENCIA_PROPIA_MANUAL' as const,
    movimientoId,
    movimientoParId,
    pairId,
    proofSource: 'DECLARACION_MANUAL_AUDITADA_V1' as const,
    versionB4: 1,
  }
}

function rowFor(input: Readonly<{ id: string; movimientoId: string; cuentaId: string; importeCentimos: number; source: ReturnType<typeof sourceFor> }>) {
  return {
    id: input.id,
    movimientoId: input.movimientoId,
    fecha: '2044-09-17',
    concepto: 'TRASPASO INTERNO SINTETICO',
    banco: 'BANCO SINTETICO',
    cuenta: 'CUENTA SINTETICA',
    importeCentimos: input.importeCentimos,
    pendienteCentimos: input.importeCentimos,
    color: 'VERDE' as const,
    grupo: 'TRASPASOS_PROPIOS',
    motivo: 'Pareja propia comprobable.',
    documento: null,
    propuesta: null,
    seleccionable: false,
    diferenciaCentimos: 0,
    detail: 'Fixture rollback-only.',
    source: input.source,
    sourceFingerprint: sha(`source:${input.id}`),
    cuentaId: input.cuentaId,
  }
}

async function ownershipTable(client: Pick<PrismaClient, '$queryRaw'>): Promise<'declaraciones_titularidad_modo_facil' | 'atestaciones_cuenta_auto_modo_facil'> {
  const rows = await client.$queryRaw<Array<{ declaration: string | null; attestation: string | null }>>(Prisma.sql`
    SELECT to_regclass('public.declaraciones_titularidad_modo_facil')::text AS declaration,
      to_regclass('public.atestaciones_cuenta_auto_modo_facil')::text AS attestation LIMIT 1`)
  assert.equal(rows.length, 1, 'No se pudo comprobar la titularidad local.')
  if (rows[0].declaration) return 'declaraciones_titularidad_modo_facil'
  assert.equal(rows[0].attestation, 'atestaciones_cuenta_auto_modo_facil', 'Falta el registro de titularidad existente; no se migra.')
  return 'atestaciones_cuenta_auto_modo_facil'
}
async function assertSchema(client: Pick<PrismaClient, '$queryRaw'>): Promise<void> { await ownershipTable(client) }

async function insertFixturePair(tx: Tx, actorId: number, index: number, imports: any) {
  const leftAccountId = `fixture-human-own-account-out-${randomUUID()}`
  const rightAccountId = `fixture-human-own-account-in-${randomUUID()}`
  const leftMovementId = `fixture-human-own-leg-out-${randomUUID()}`
  const rightMovementId = `fixture-human-own-leg-in-${randomUUID()}`
  const amount = 71_000 + index
  const ibans = [`ES00${sha(`${TAG}:out:${index}`).slice(0, 28)}`, `ES00${sha(`${TAG}:in:${index}`).slice(0, 28)}`]

  await tx.cuentaBancaria.createMany({ data: [
    { id: leftAccountId, banco: 'BANCO SINTETICO', iban: ibans[0]!, alias: 'CUENTA SINTETICA A', activa: true },
    { id: rightAccountId, banco: 'BANCO SINTETICO', iban: ibans[1]!, alias: 'CUENTA SINTETICA B', activa: true },
  ] })
  await tx.movimientoBancario.createMany({ data: [
    { id: leftMovementId, cuentaId: leftAccountId, fechaOperacion: DAY, fechaValor: DAY, concepto: 'TRASPASO INTERNO SINTETICO', importe: -amount / 100, hashUnico: `${TAG}:out:${index}:${randomUUID()}` },
    { id: rightMovementId, cuentaId: rightAccountId, fechaOperacion: DAY, fechaValor: DAY, concepto: 'TRASPASO INTERNO SINTETICO', importe: amount / 100, hashUnico: `${TAG}:in:${index}:${randomUUID()}` },
  ] })
  const proofTable = await ownershipTable(tx)
  if (proofTable === 'declaraciones_titularidad_modo_facil') {
    for (const accountId of [leftAccountId, rightAccountId]) {
      await tx.$executeRaw(Prisma.sql`INSERT INTO declaraciones_titularidad_modo_facil(cuenta_id,version,estado,titular_declarado,fecha_declaracion,confirmacion_declarada,actor_id,referencia_evidencia,snapshot)
        VALUES(${accountId},1,'DECLARADA','Titular sintético verificado',CURRENT_DATE,true,${actorId},${`${TAG}:evidencia:${index}:${accountId}`},'{"schema":"EASY_ACCOUNT_OWNERSHIP_DECLARATION_V1"}'::jsonb)`)
    }
  } else {
    const policies = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id::text AS id FROM politicas_auto_modo_facil WHERE entorno='STAGING' AND estado='ACTIVA' ORDER BY created_at DESC LIMIT 1`)
    assert.equal(policies.length, 1, 'La copia no conserva la política de titularidad activa.')
    for (const accountId of [leftAccountId, rightAccountId]) {
      await tx.$executeRaw(Prisma.sql`INSERT INTO atestaciones_cuenta_auto_modo_facil(politica_id,cuenta_id,version,titular_declarado,confirmacion_titularidad_io,actor_id,referencia_evidencia,snapshot)
        VALUES(CAST(${policies[0].id} AS uuid),${accountId},1,'Titular sintético verificado',true,${actorId},${`${TAG}:${index}:${accountId}`},'{"schema":"EASY_AUTO_ACCOUNT_ATTESTATION_V1","origen":"REGLA"}'::jsonb)`)
    }
  }

  const movements = [
    { id: leftMovementId, cuentaId: leftAccountId, fecha: '2044-09-17', importeCentimos: -amount, versionB4: 1, concepto: 'TRASPASO INTERNO SINTETICO', referencia: null, infoAdicional: null, tercero: null, banco: 'BANCO SINTETICO', tieneTerceroConfirmado: false, tieneVinculoDocumental: false, tieneCuentaPropiaConfirmada: false },
    { id: rightMovementId, cuentaId: rightAccountId, fecha: '2044-09-17', importeCentimos: amount, versionB4: 1, concepto: 'TRASPASO INTERNO SINTETICO', referencia: null, infoAdicional: null, tercero: null, banco: 'BANCO SINTETICO', tieneTerceroConfirmado: false, tieneVinculoDocumental: false, tieneCuentaPropiaConfirmada: false },
  ]
  const reviews = imports.classifyConciliarHumanOwnTransferRows({
    movements,
    attestedOwnAccountIds: new Set([leftAccountId, rightAccountId]),
    registeredAttestedOwnIbanKeys: new Set<string>(),
  }).reviews
  const pairId = reviews.get(leftMovementId)?.transferFingerprint
  assert.match(pairId ?? '', /^[a-f0-9]{64}$/, 'El fixture no forma una pareja humana única.')
  assert.equal(reviews.get(rightMovementId)?.transferFingerprint, pairId, 'La pareja sintética debe ser recíproca.')

  const source = sourceFor(leftMovementId, rightMovementId, pairId!)
  const row = rowFor({ id: `fixture-human-own-row-${randomUUID()}`, movimientoId: leftMovementId, cuentaId: leftAccountId, importeCentimos: -amount, source })
  const decisionHash = imports.conciliarDecisionHash({
    row: {
      id: row.id, movimientoId: row.movimientoId, fecha: row.fecha, concepto: row.concepto, banco: row.banco, cuenta: row.cuenta,
      importeCentimos: row.importeCentimos, pendienteCentimos: row.pendienteCentimos, color: row.color, grupo: row.grupo, motivo: row.motivo,
      documento: row.documento, propuesta: row.propuesta, seleccionable: row.seleccionable, diferenciaCentimos: row.diferenciaCentimos,
      detail: row.detail,
    },
    source,
    sourceFingerprint: row.sourceFingerprint,
  })
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO conciliar_proyecciones(id,tab,movimiento_id,cuenta_id,fecha,importe_centimos,pendiente_centimos,color,grupo,motivo,concepto,banco,cuenta,documento,propuesta,seleccionable,diferencia_centimos,links_movimiento,detail,source,source_fingerprint,updated_at)
    VALUES(${row.id},'PAGOS',${leftMovementId},${leftAccountId},CAST('2044-09-17' AS date),${-amount},${-amount},'VERDE','TRASPASOS_PROPIOS',${row.motivo},${row.concepto},${row.banco},${row.cuenta},NULL,NULL,false,0,NULL,${row.detail},CAST(${JSON.stringify(source)} AS jsonb),${row.sourceFingerprint},CURRENT_TIMESTAMP)
  `)
  return { rowId: row.id, decisionHash, movementIds: [leftMovementId, rightMovementId] as const }
}

async function aggregateTarget(tx: Tx, movementIds: readonly string[]) {
  const rows = await tx.$queryRaw<Array<{ states: string; b4: string; events: string; projections: string; receipts: string; legs: string }>>(Prisma.sql`
    SELECT
      (SELECT count(*)::text FROM estado_justificacion_movimientos WHERE movimiento_id IN (${Prisma.join(movementIds)})) AS states,
      (SELECT count(*)::text FROM operaciones_justificacion_b4 WHERE movimiento_id IN (${Prisma.join(movementIds)})) AS b4,
      (SELECT count(*)::text FROM eventos_justificacion_b4 WHERE movimiento_id IN (${Prisma.join(movementIds)})) AS events,
      (SELECT count(*)::text FROM conciliar_proyecciones WHERE movimiento_id IN (${Prisma.join(movementIds)})) AS projections,
      (SELECT count(DISTINCT p.operacion_conciliar_id)::text FROM patas_operacion_conciliar p WHERE p.movimiento_id IN (${Prisma.join(movementIds)})) AS receipts,
      (SELECT count(*)::text FROM patas_operacion_conciliar p WHERE p.movimiento_id IN (${Prisma.join(movementIds)})) AS legs
    LIMIT 1
  `)
  assert.equal(rows.length, 1, 'No se pudo leer el agregado del fixture.')
  return rows[0]!
}

function uuid(): string { return randomUUID() }

async function run(): Promise<void> {
  assert.equal(process.env.CONCILIAR_HUMAN_OWN_TRANSFER_ROLLBACK_TEST, '1', 'CONCILIAR_HUMAN_OWN_TRANSFER_ROLLBACK_TEST=1 es obligatorio.')
  const started = Date.now()
  const saved = Object.fromEntries([
    'DATABASE_URL', 'FINANCE_STAGING_SANDBOX', 'VERCEL_ENV', 'FINANCE_EASY_PRODUCTION_ENABLED', 'FINANCE_MODEL_PRODUCTION_ENABLED',
    'FINANCE_AUTOMATIC_LINKS_DISABLED', 'FINANCE_CONCILIAR_PRODUCTION_ENABLED', 'NEXT_PUBLIC_FINANCE_CONCILIAR_PRODUCTION_ENABLED', 'IO_PRODUCTION_READ_ONLY',
  ].map(key => [key, process.env[key]])) as Record<string, string | undefined>
  let shared: PrismaClient | null = null
  let before: Snapshot | null = null
  let reachedRollback = false
  try {
    configureRuntime(socketUrl(config()))
    const nextGlobal = globalThis as typeof globalThis & { AsyncLocalStorage?: typeof AsyncLocalStorage }
    if (!nextGlobal.AsyncLocalStorage) nextGlobal.AsyncLocalStorage = AsyncLocalStorage
    const [prismaModule, actionsModule, runtimeModule, authModule, scopeModule, classifierModule, coreModule] = await Promise.all([
      import('../lib/prisma'),
      import('../lib/finanzas/conciliar-actions'),
      import('../lib/finanzas/conciliar-runtime'),
      import('../lib/finanzas/reconciliation-auth'),
      import('../lib/prisma'),
      import('../lib/finanzas/conciliar-human-own-transfer'),
      import('../lib/finanzas/conciliar-core'),
    ])
    shared = prismaModule.default as PrismaClient
    const identity = await shared.$queryRaw<Array<{ database: string; role: string; host: string | null }>>(Prisma.sql`
      SELECT current_database() AS database,current_user AS role,host(inet_server_addr()) AS host LIMIT 1
    `)
    assert.deepEqual(identity, [{ database: REQUIRED_DATABASE, role: REQUIRED_USER, host: null }], 'La conexión no es la copia local aislada.')
    await assertSchema(shared)
    before = await snapshot(shared)

    try {
      await shared.$transaction(async rawTx => {
        const tx = rawTx as Tx
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout='150000ms'")
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout='10000ms'")
        await runtimeModule.assertConciliarRuntime(tx)
        const actor = await tx.usuarioAdmin.findFirst({ where: { activo: true, rol: 'SUPER_ADMIN' }, select: { id: true }, orderBy: { id: 'asc' } })
        assert(actor, 'La copia local no tiene un SUPER_ADMIN activo para ejercer el preflight B4.')
        const access = await authModule.requireB4ActorAccess(actor.id, 'escritura', tx)
        assert.equal('response' in access, false, 'El actor local no supera el preflight B4 de escritura.')

        const actors = { actorRealId: actor.id, actorEffectiveId: actor.id }
        const imports = { ...classifierModule, ...coreModule }
        const one = await insertFixturePair(tx, actor.id, 1, imports)
        const batch = [] as Array<Awaited<ReturnType<typeof insertFixturePair>>>
        for (let index = 2; index <= 21; index += 1) batch.push(await insertFixturePair(tx, actor.id, index, imports))
        const allMovementIds = [...one.movementIds, ...batch.flatMap(pair => pair.movementIds)]
        assert.equal((await aggregateTarget(tx, allMovementIds)).projections, '21', 'La vista precalculada debe contener una fila primaria por pareja.')

        const confirmOne = await scopeModule.runWithConciliarSerializableAuthorization(tx, () => actionsModule.runConciliarTransactionCommand(tx, actor.id, {
          action: 'confirmar_traspasos_propios_manual', idempotencyKey: uuid(), items: [{ id: one.rowId, decisionHash: one.decisionHash }],
        }, actors), actor.id)
        assert('applied' in confirmOne && 'operationId' in confirmOne, 'Falta el recibo de confirmación de pareja.')
        assert.equal(confirmOne.applied, 1, 'La acción de una pareja debe aplicar exactamente una pareja.')
        const afterOneConfirm = await aggregateTarget(tx, one.movementIds)
        assert.equal(afterOneConfirm.b4, '2', 'Una pareja crea exactamente dos operaciones B4.')
        assert.equal(afterOneConfirm.states, '2', 'Las dos patas deben quedar en estado B4.')
        assert.equal(afterOneConfirm.projections, '0', 'La confirmación retira ambas patas de la vista precalculada.')

        const undoOne = await scopeModule.runWithConciliarSerializableAuthorization(tx, () => actionsModule.runConciliarTransactionCommand(tx, actor.id, {
          action: 'deshacer', operationId: confirmOne.operationId, idempotencyKey: uuid(),
        }, actors), actor.id)
        assert('undone' in undoOne, 'Falta el recibo de deshacer una pareja.')
        assert.equal(undoOne.undone, true, 'El undo de una pareja debe completar ambas patas.')
        const afterOneUndo = await aggregateTarget(tx, one.movementIds)
        assert.equal(afterOneUndo.b4, '4', 'El undo de una pareja crea exactamente dos reversiones B4.')
        assert.equal(afterOneUndo.events, '12', 'Confirmación y undo auditan ambas patas sin omisiones.')

        const confirmBatch = await scopeModule.runWithConciliarSerializableAuthorization(tx, () => actionsModule.runConciliarTransactionCommand(tx, actor.id, {
          action: 'confirmar_traspasos_propios_manual', idempotencyKey: uuid(),
          items: batch.map(pair => ({ id: pair.rowId, decisionHash: pair.decisionHash })),
        }, actors), actor.id)
        assert('applied' in confirmBatch && 'operationId' in confirmBatch, 'Falta el recibo del lote de parejas.')
        assert.equal(confirmBatch.applied, 20, 'El lote debe aplicar exactamente veinte parejas.')
        const batchMovementIds = batch.flatMap(pair => pair.movementIds)
        const afterBatchConfirm = await aggregateTarget(tx, batchMovementIds)
        assert.equal(afterBatchConfirm.b4, '40', 'El lote de veinte parejas crea cuarenta B4.')
        assert.equal(afterBatchConfirm.states, '40', 'El lote aplica ambas patas de cada pareja.')
        assert.equal(afterBatchConfirm.projections, '0', 'El lote retira las cuarenta patas tras el recibo completo.')

        const undoBatch = await scopeModule.runWithConciliarSerializableAuthorization(tx, () => actionsModule.runConciliarTransactionCommand(tx, actor.id, {
          action: 'deshacer', operationId: confirmBatch.operationId, idempotencyKey: uuid(),
        }, actors), actor.id)
        assert('undone' in undoBatch, 'Falta el recibo de deshacer el lote.')
        assert.equal(undoBatch.undone, true, 'El undo del lote debe revertir las veinte parejas como unidades completas.')
        const afterBatchUndo = await aggregateTarget(tx, batchMovementIds)
        assert.equal(afterBatchUndo.b4, '80', 'El undo del lote crea cuarenta reversiones B4.')
        assert.equal(afterBatchUndo.events, '240', 'El lote confirmado y revertido conserva todas las auditorías B4.')
        assert.equal(afterBatchUndo.projections, '0', 'Undo no reconstruye una vista; sólo la invalida según el contrato de Conciliar.')
        assert(Date.now() - started < MAX_MILLISECONDS, 'El ensayo superó el límite de tres minutos y se aborta sin commit.')
        reachedRollback = true
        throw new IntentionalRollback()
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 170_000 })
    } catch (error) {
      if (!(error instanceof IntentionalRollback)) throw error
    }
    assert(reachedRollback, 'El ensayo no alcanzó el rollback obligatorio.')
    const after = await snapshot(shared)
    assert.deepEqual(after, before, 'El agregado local cambió después del rollback.')
    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      rollback: true,
      pair: { confirmedLegs: 2, undoneLegs: 2 },
      batch: { pairs: 20, confirmedLegs: 40, undoneLegs: 40 },
      corePreflight: 'runtime-and-live-B4-access-before-transaction-command',
      writesPersisted: false,
      externalCalls: 0,
      elapsedMilliseconds: Date.now() - started,
    }))
  } finally {
    await shared?.$disconnect()
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

run().catch(error => {
  const reason = error instanceof Error ? error.message.replace(/[\r\n]+/g, ' ').slice(0, 300) : 'UNKNOWN'
  console.error(`CONCILIAR_HUMAN_OWN_TRANSFER_LOCAL_TEST_FAILED:${reason}`)
  process.exitCode = 1
})
