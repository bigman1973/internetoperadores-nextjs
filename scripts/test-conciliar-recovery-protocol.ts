/*
 * Protocolo de recuperación Conciliar V2 — pruebas puras, sin BD/red.
 * Ejecutar: ./node_modules/.bin/tsx scripts/test-conciliar-recovery-protocol.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Prisma } from '@prisma/client'
import ts from 'typescript'
import { parseConciliarCommand } from '../lib/finanzas/conciliar-contract'
import {
  CONCILIAR_RECOVERY_PREPARE_MAX_ATTEMPTS,
  isRetryableConciliarRecoveryPrepareConflict,
  retryConciliarRecoveryPreparation,
} from '../lib/finanzas/conciliar-recovery-retry-core'
import {
  CONCILIAR_RECEIPT_RECOVERY_V2,
  buildConciliarRecoveryIntent,
  formatConciliarRecoveryResponse,
  isRecoverableConciliarCommand,
  parseConciliarRecoveryLookup,
  type ConciliarRecoveryIdentity,
  type ConciliarRecoveryRecord,
} from '../lib/finanzas/conciliar-recovery-core'

const root = resolve(import.meta.dirname, '..')
const KEY = '11111111-1111-4111-8111-111111111111'
const RECEIPT = '22222222-2222-4222-8222-222222222222'
const TARGET = '33333333-3333-4333-8333-333333333333'
const SESSION = '44444444-4444-4444-8444-444444444444'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const identity: ConciliarRecoveryIdentity = { actorRealId: 11, actorEffectiveId: 22, actingSessionId: SESSION }

const standard = parseConciliarCommand({
  action: 'confirmar', idempotencyKey: KEY,
  items: [{ id: 'b', decisionHash: HASH_B }, { id: 'a', decisionHash: HASH_A }],
})
assert.equal(isRecoverableConciliarCommand(standard), true)
if (!isRecoverableConciliarCommand(standard)) throw new Error('fixture')
const intent = buildConciliarRecoveryIntent(identity.actorEffectiveId, standard)
assert.equal(intent.action, 'CONFIRMAR')
assert.equal(intent.selectionCount, 2)
assert.equal(intent.targetConfirmationOperationId, null)
assert.equal(intent.canonicalCommand.items instanceof Array, true)
assert.deepEqual((intent.canonicalCommand.items as Array<{ id: string }>).map(item => item.id), ['a', 'b'], 'el cuerpo canónico conserva el orden sellado por servidor')

const review = parseConciliarCommand({
  action: 'confirmar', idempotencyKey: KEY,
  review: {
    kind: 'REVIEW_CONFIRM', id: 'row-review', decisionHash: HASH_A,
    acknowledgement: { schema: 'AREA3_REVIEW_ACK_V2', version: '2026-11-01', motivo: 'SIN_REFERENCIA_DOCUMENTAL', sourceHash: HASH_B, advertenciaReconocida: true },
  },
})
assert.equal(isRecoverableConciliarCommand(review), true)
if (!isRecoverableConciliarCommand(review)) throw new Error('fixture')
assert.equal(buildConciliarRecoveryIntent(identity.actorEffectiveId, review).selectionCount, 1, 'REVIEW_CONFIRM tiene selección sellada de una fila')
assert.throws(() => parseConciliarCommand({
  action: 'confirmar', idempotencyKey: KEY,
  review: {
    kind: 'REVIEW_CONFIRM', id: 'row-review', decisionHash: HASH_A,
    acknowledgement: { schema: 'AREA3_REVIEW_ACK_V1', version: '2026-10-30', motivo: 'SIN_REFERENCIA_DOCUMENTAL', sourceHash: HASH_B, advertenciaReconocida: true },
  },
}), error => (error as { code?: unknown }).code === 'VALIDATION_ERROR', 'el ACK V1 obsoleto no autoriza una confirmación de revisión')

const manual = parseConciliarCommand({ action: 'confirmar_traspasos_propios_manual', idempotencyKey: KEY, items: [{ id: 'pair', decisionHash: HASH_A }] })
assert.equal(isRecoverableConciliarCommand(manual), true)
if (!isRecoverableConciliarCommand(manual)) throw new Error('fixture')
assert.equal(buildConciliarRecoveryIntent(identity.actorEffectiveId, manual).selectionCount, 1, 'la pareja manual queda diferenciada del lote estándar')

const undo = parseConciliarCommand({ action: 'deshacer', idempotencyKey: KEY, operationId: TARGET })
assert.equal(isRecoverableConciliarCommand(undo), true)
if (!isRecoverableConciliarCommand(undo)) throw new Error('fixture')
const undoIntent = buildConciliarRecoveryIntent(identity.actorEffectiveId, undo)
assert.equal(undoIntent.action, 'DESHACER')
assert.equal(undoIntent.targetConfirmationOperationId, TARGET)

const ask = parseConciliarCommand({ action: 'pedir', idempotencyKey: KEY, id: 'row', decisionHash: HASH_A })
assert.equal(isRecoverableConciliarCommand(ask), false, 'PEDIR queda explícitamente fuera del alcance del protocolo de recibos financieros')

const lookup = parseConciliarRecoveryLookup({ recover: CONCILIAR_RECEIPT_RECOVERY_V2, idempotencyKey: KEY, action: 'CONFIRMAR', bodyHash: intent.bodyHash })
assert.deepEqual(formatConciliarRecoveryResponse(lookup, identity, null), {
  schema: CONCILIAR_RECEIPT_RECOVERY_V2,
  idempotencyKey: KEY,
  action: 'CONFIRMAR',
  resolution: 'PENDING',
  correlation: { bodyHash: intent.bodyHash, ...identity },
  selection: null,
  confirmation: null,
  undo: null,
}, 'una ausencia nunca se declara NOT_COMMITTED')

const committedConfirm: ConciliarRecoveryRecord = {
  ...intent, ...identity, resolution: 'COMMITTED', receiptOperationId: RECEIPT, targetConfirmationOperationId: null, legCount: 2,
}
const pendingOwn = formatConciliarRecoveryResponse(lookup, identity, { ...committedConfirm, resolution: 'PENDING', receiptOperationId: null, legCount: null })
assert.equal(pendingOwn.resolution, 'PENDING')
assert.deepEqual(pendingOwn.selection, { schema: 'CONCILIAR_RECOVERY_SELECTION_V2', count: 2, hash: intent.selectionHash }, 'un intent propio PENDING conserva sólo la selección sellada, no un resultado financiero')
const confirmResponse = formatConciliarRecoveryResponse(lookup, identity, committedConfirm)
assert.equal(confirmResponse.resolution, 'COMMITTED')
assert.deepEqual(confirmResponse.confirmation, { receiptOperationId: RECEIPT, legCount: 2 })
assert.equal(confirmResponse.undo, null)

const undoLookup = parseConciliarRecoveryLookup({ recover: CONCILIAR_RECEIPT_RECOVERY_V2, idempotencyKey: KEY, action: 'DESHACER', bodyHash: undoIntent.bodyHash })
const committedUndo: ConciliarRecoveryRecord = {
  ...undoIntent, ...identity, resolution: 'COMMITTED', receiptOperationId: RECEIPT, targetConfirmationOperationId: TARGET, legCount: 2,
}
const undoResponse = formatConciliarRecoveryResponse(undoLookup, identity, committedUndo)
assert.equal(undoResponse.resolution, 'COMMITTED')
assert.equal(undoResponse.confirmation, null)
assert.deepEqual(undoResponse.undo, { receiptOperationId: RECEIPT, targetConfirmationOperationId: TARGET }, 'el recibo de deshacer y la confirmación objetivo no se mezclan')

const mismatchedActor = formatConciliarRecoveryResponse(lookup, { ...identity, actorRealId: 12 }, committedConfirm)
assert.equal(mismatchedActor.resolution, 'PENDING', 'otra identidad real no adopta un intent')
const mismatchedSession = formatConciliarRecoveryResponse(lookup, { ...identity, actingSessionId: null }, committedConfirm)
assert.equal(mismatchedSession.resolution, 'PENDING', 'una sesión de actuación distinta no adopta un intent')
const malformedCommitted = formatConciliarRecoveryResponse(lookup, identity, { ...committedConfirm, legCount: null })
assert.equal(malformedCommitted.resolution, 'PENDING', 'un COMMITTED incompleto falla cerrado')

assert.throws(() => parseConciliarRecoveryLookup({ recover: CONCILIAR_RECEIPT_RECOVERY_V2, idempotencyKey: KEY, action: 'CONFIRMAR', bodyHash: intent.bodyHash, actorId: '22' }), /QUERY_INVALID/, 'actor URL queda rechazado')
assert.throws(() => parseConciliarRecoveryLookup({ recover: CONCILIAR_RECEIPT_RECOVERY_V2, idempotencyKey: KEY, action: 'CONFIRMAR', bodyHash: intent.bodyHash, rowId: 'x' }), /QUERY_INVALID/, 'no se mezcla el lookup con detalle/paginación')

const prismaConflict = (code: string, meta?: Record<string, string>) => new Prisma.PrismaClientKnownRequestError('conflicto serializable fixture', { code, clientVersion: 'fixture', ...(meta ? { meta } : {}) })
const p2034 = prismaConflict('P2034')
const raw40001 = prismaConflict('P2010', { code: '40001' })
const raw40P01 = prismaConflict('P2010', { code: '40P01' })
assert.equal(isRetryableConciliarRecoveryPrepareConflict(p2034), true, 'P2034 Prisma indica un callback serializable abortado')
assert.equal(isRetryableConciliarRecoveryPrepareConflict(raw40001), true, 'P2010 Prisma conserva SQLSTATE 40001 de $executeRaw en meta.code')
assert.equal(isRetryableConciliarRecoveryPrepareConflict(raw40P01), true, 'P2010 Prisma conserva SQLSTATE 40P01 de $executeRaw en meta.code')
assert.equal(isRetryableConciliarRecoveryPrepareConflict(Object.assign(new Error('imitación'), { code: 'P2034' })), false, 'un objeto que imita P2034 no acredita un rollback Prisma')
assert.equal(isRetryableConciliarRecoveryPrepareConflict(prismaConflict('P2010', { code: '23505' })), false, 'un error SQL de negocio distinto no se reintenta')

async function assertPrepareRetryProtocol(): Promise<void> {
  for (const [label, conflict] of [['P2034', p2034], ['P2010-40001', raw40001], ['P2010-40P01', raw40P01]] as const) {
    let attempts = 0
    const delays: number[] = []
    const result = await retryConciliarRecoveryPreparation(async () => {
      attempts += 1
      if (attempts < 3) throw conflict
      return `${label}-prepared`
    }, async milliseconds => { delays.push(milliseconds) })
    assert.equal(result, `${label}-prepared`)
    assert.equal(attempts, 3, `${label} reabre una transacción nueva por cada intento`)
    assert.deepEqual(delays, [25, 50], `${label} sólo espera los dos delays acotados`)
  }

  let exhaustedAttempts = 0
  const exhaustedDelays: number[] = []
  await assert.rejects(
    retryConciliarRecoveryPreparation(async () => {
      exhaustedAttempts += 1
      throw raw40001
    }, async milliseconds => { exhaustedDelays.push(milliseconds) }),
    error => error === raw40001,
    'el agotamiento propaga el último conflicto Prisma sin ocultarlo',
  )
  assert.equal(exhaustedAttempts, CONCILIAR_RECOVERY_PREPARE_MAX_ATTEMPTS, 'el agotamiento no supera tres intentos')
  assert.deepEqual(exhaustedDelays, [25, 50], 'el presupuesto de espera es 75ms, muy inferior a 15s')

  for (const [label, error] of [
    ['403', Object.assign(new Error('forbidden'), { status: 403, code: 'ACCESS_REVOKED' })],
    ['validation', Object.assign(new Error('validation'), { status: 400, code: 'VALIDATION_ERROR' })],
    ['body', Object.assign(new Error('body mismatch'), { status: 409, code: 'RECOVERY_IDEMPOTENCY_MISMATCH' })],
    ['scope', Object.assign(new Error('identity scope'), { status: 403, code: 'CONTEXTO_ACTUACION_CONCILIAR_INVALIDO' })],
  ] as const) {
    let attempts = 0
    await assert.rejects(
      retryConciliarRecoveryPreparation(async () => {
        attempts += 1
        throw error
      }, async () => { throw new Error('un error no Prisma no puede programar retry') }),
      received => received === error,
      `${label} se propaga sin reintentar preparación`,
    )
    assert.equal(attempts, 1, `${label} no abre otra transacción`)
  }
}

const runtime = readFileSync(resolve(root, 'lib/finanzas/conciliar-recovery.ts'), 'utf8')
assert.match(runtime, /SET TRANSACTION READ ONLY/, 'la consulta debe declararse READ ONLY antes de leer')
assert.match(runtime, /resolution='PENDING'[\s\S]*RETURNING/, 'COMMITTED sólo puede publicar desde PENDING')
assert.match(runtime, /function recoveryLockKey[\s\S]*conciliar:\$\{actorEffectiveId\}/, 'prepare y ejecución conservan la barrera de idempotencia Conciliar')
assert.match(runtime, /WITH barrier AS MATERIALIZED[\s\S]*pg_advisory_xact_lock[\s\S]*recoveryLockKey/, 'la barrera advisory materializada se toma dentro de la lectura bloqueada')
assert.match(runtime, /barrier\.locked IS NOT NULL[\s\S]*FOR UPDATE OF i/, 'el intent sólo se bloquea después de la barrera advisory')
assert.match(runtime, /legacy_receipt AS MATERIALIZED[\s\S]*barrier\.locked IS NOT NULL[\s\S]*FOR UPDATE OF o/, 'el recibo legado sólo se bloquea después de la barrera advisory')
assert.match(runtime, /FROM barrier LEFT JOIN intent i ON true/, 'la raíz barrier conserva una fila centinela aun sin intent')
assert.match(runtime, /isNullRecoveryIntentSentinel[\s\S]*RECOVERY_INTENT_COLUMNS/, 'sólo las catorce columnas NULL forman una ausencia válida')
assert.doesNotMatch(runtime, /NOT_COMMITTED/, 'no hay estado ni escritor automático inseguro de NOT_COMMITTED')
assert.match(runtime, /replay\.resolution !== 'COMMITTED'[\s\S]*replay\.receiptOperationId !== receiptOperationId/, 'un replay sólo acepta el mismo recibo ya COMMITTED')
assert.match(runtime, /Number\(legs\[0\]\?\.total\) !== replay\.legCount/, 'un replay verifica que el recibo conserva todas sus patas')
assert.match(runtime, /return retryConciliarRecoveryPreparation\(\(\) => db\(\)\.\$transaction/, 'sólo prepare rodea su nueva transacción con el retry acotado')
assert.match(runtime, /const liveIdentity = await resolveConciliarRecoveryIdentity\(actorEffectiveId\)[\s\S]*await assertRecoveryWriteAccessTx\(tx, actorEffectiveId\)[\s\S]*readIntentForUpdateTx\(tx, actorEffectiveId, intent\.idempotencyKey, true\)/, 'cada prepare reintento revalida identidad, ACL y la barrera/lectura unificada antes de DML')

const actions = readFileSync(resolve(root, 'lib/finanzas/conciliar-actions.ts'), 'utf8')
const preparedAt = actions.indexOf('prepareConciliarRecoveryIntent(actorId, command, recoveryIdentity)')
const serializableAt = actions.indexOf('const txSerializable = async () => {')
const transactionSeamAt = actions.indexOf('export async function runConciliarTransactionCommand')
const commitAt = actions.indexOf('await commitConciliarRecoveryIntentTx(')
assert.ok(preparedAt >= 0 && serializableAt >= 0 && transactionSeamAt >= 0 && commitAt >= 0 && preparedAt < serializableAt && transactionSeamAt < commitAt && commitAt < serializableAt, 'PENDING se prepara antes del callback financiero y COMMITTED se publica dentro de su costura después del recibo')
assert.match(actions, /recoveryReceiptOperationId: receipt\.id/, 'las confirmaciones y deshacer exponen sólo internamente el recibo raíz tipado')
assert.match(actions, /const lockedRecoveryKey = await assertConciliarRecoveryIntentExecutableTx\(tx, recoveryContext\)[\s\S]*else result = await undo\(tx, actorId, command, lockedRecoveryKey\)/, 'undo recuperable reutiliza el bloqueo sólo tras la misma validación ejecutable')

const route = readFileSync(resolve(root, 'app/api/admin/finanzas/conciliar/route.ts'), 'utf8')
assert.match(route, /if \(query\.recover !== undefined\)[\s\S]*parseConciliarRecoveryLookup\(query\)[\s\S]*readConciliarRecoveryIntent\(access\.actor\.id, lookup\)/, 'GET recovery usa sólo el actor autenticado de la ruta existente')
assert.match(route, /return privateJson\(await readConciliarRecoveryIntent/, 'el lookup conserva private,no-store mediante privateJson')

for (const relative of [
  'lib/finanzas/conciliar-recovery-core.ts',
  'lib/finanzas/conciliar-recovery-retry-core.ts',
  'lib/finanzas/conciliar-recovery.ts',
  'lib/finanzas/conciliar-actions.ts',
  'app/api/admin/finanzas/conciliar/route.ts',
] as const) {
  const source = readFileSync(resolve(root, relative), 'utf8')
  const transpiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, reportDiagnostics: true })
  assert.equal(transpiled.diagnostics?.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error).length ?? 0, 0, `${relative} debe ser sintácticamente transpirable`)
}

const migration = readFileSync(resolve(root, 'prisma/migrations/20261031_area3_conciliar_receipt_recovery/migration.sql'), 'utf8')
assert.match(migration, /UNIQUE \("actor_effective_id","idempotency_key"\)/)
assert.match(migration, /acting_session_id.*REFERENCES "impersonation_sessions"/)
assert.match(migration, /OLD\.resolution <> 'PENDING' OR NEW\.resolution <> 'COMMITTED'/)
assert.match(migration, /BEFORE TRUNCATE/)

void assertPrepareRetryProtocol().then(() => {
  console.log(JSON.stringify({
    passed: true,
    databaseOperations: 0,
    networkOperations: 0,
    recoveryV2: true,
    confirmAndUndoTypedRoots: true,
    unknownAndMalformedFailPending: true,
    actorAndSessionIsolation: true,
    noNotCommittedState: true,
    readOnlyLookupStaticGuard: true,
    sharedIdempotencyLockStaticGuard: true,
    replayReceiptAndLegVerification: true,
    pendingBeforeFinancialAndCommitInsideTransaction: true,
    routeUsesAuthenticatedEffectiveActor: true,
    changedTypeScriptSyntaxTranspiles: true,
    prepareRetryPrismaOnlyBoundedToThreeAttempts: true,
    prepareRetryRevalidatesIdentityAclAndSharedBarrier: true,
    staleReviewAckV1RejectedAndV2FixtureAccepted: true,
  }))
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
