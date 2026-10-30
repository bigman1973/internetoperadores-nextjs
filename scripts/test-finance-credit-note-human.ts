import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { CREDIT_LINK_HUMAN_TRANSACTION_MAX_ATTEMPTS, creditLinkLedgerAction, creditLinkStateForAction, effectiveCreditLinkState, parseCreditLinkDecision, retryCreditLinkHumanTransaction } from '../lib/finanzas/finance-credit-note-human-core'

const id = '11111111-1111-4111-8111-111111111111'
const key = 'a'.repeat(64)
test('acciones humanas de rectificativa se validan y proyectan sin BD', () => {
  assert.deepEqual(parseCreditLinkDecision({ action: 'confirmar', creditLinkId: id, idempotencyKey: key }), { ok: true, value: { action: 'confirmar', creditLinkId: id, idempotencyKey: key } })
  assert.equal(creditLinkStateForAction('confirmar'), 'CONFIRMED')
  assert.equal(creditLinkStateForAction('rechazar'), 'REJECTED')
  assert.equal(creditLinkStateForAction('deshacer'), 'PROPOSED')
  assert.equal(creditLinkLedgerAction('confirmar'), 'CONFIRM')
  assert.equal(creditLinkLedgerAction('rechazar'), 'REJECT')
  assert.equal(creditLinkLedgerAction('deshacer'), 'UNDO')
  assert.equal(effectiveCreditLinkState('PROPOSED', 'CONFIRMED'), 'CONFIRMED')
  assert.equal(effectiveCreditLinkState('REJECTED', 'PROPOSED'), 'PROPOSED')
})
test('rechazar y deshacer exigen motivo; confirmar no admite texto extra', () => {
  for (const action of ['rechazar', 'deshacer'] as const) assert.equal(parseCreditLinkDecision({ action, creditLinkId: id, idempotencyKey: key, reason: 'x' }).ok, false)
  assert.equal(parseCreditLinkDecision({ action: 'confirmar', creditLinkId: id, idempotencyKey: key, reason: 'no' }).ok, false)
  assert.equal(parseCreditLinkDecision({ action: 'rechazar', creditLinkId: id, idempotencyKey: key, reason: 'Revisión humana' }).ok, true)
})
test('reintento humano abre callbacks frescos y recupera el replay del mismo clic', async () => {
  const serializationConflict = Object.assign(new Error('serialización fixture'), { code: '40001' })
  const openedSnapshots: number[] = []
  const result = await retryCreditLinkHumanTransaction(async () => {
    const snapshot = openedSnapshots.length + 1
    openedSnapshots.push(snapshot)
    if (snapshot === 1) throw serializationConflict
    return { snapshot, idempotent: true, decisionId: 'replay-fixture' }
  }, error => error === serializationConflict)
  assert.deepEqual(openedSnapshots, [1, 2], 'un rollback no reutiliza el snapshot/callback anterior')
  assert.deepEqual(result, { snapshot: 2, idempotent: true, decisionId: 'replay-fixture' })
})
test('reintento humano se limita exactamente a tres transacciones', async () => {
  let attempts = 0
  const finalConflict = Object.assign(new Error('deadlock fixture'), { code: '40P01' })
  await assert.rejects(
    retryCreditLinkHumanTransaction(async () => {
      attempts += 1
      throw finalConflict
    }, error => error === finalConflict),
    error => error === finalConflict,
  )
  assert.equal(attempts, CREDIT_LINK_HUMAN_TRANSACTION_MAX_ATTEMPTS)
})
test('403 de permiso y error genérico no se reintentan', async () => {
  for (const error of [
    Object.assign(new Error('permiso revocado fixture'), { status: 403, code: 'PERMISO_REVOCADO' }),
    new Error('fallo genérico fixture'),
  ]) {
    let attempts = 0
    await assert.rejects(
      retryCreditLinkHumanTransaction(async () => {
        attempts += 1
        throw error
      }, candidate => (candidate as { code?: string }).code === '40001' || (candidate as { code?: string }).code === '40P01'),
      thrown => thrown === error,
    )
    assert.equal(attempts, 1)
  }
})
test('migración y servicio son append-only y no tocan enlaces, facturas ni B4', () => {
  const migration = readFileSync('prisma/migrations/20261029_zz_credit_link_human_decisions/migration.sql', 'utf8')
  const service = readFileSync('lib/finanzas/finance-credit-note-human-db.ts', 'utf8')
  assert.match(migration, /CREATE TABLE "document_version_credit_link_decisions"/)
  assert.match(migration, /"decision_sequence" BIGINT GENERATED ALWAYS AS IDENTITY/)
  assert.match(migration, /"credit_link_id", "decision_sequence" DESC/)
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "document_version_credit_link_decisions"/)
  assert.doesNotMatch(migration, /ALTER TABLE "document_version_credit_links"[\s\S]*(?:UPDATE|ADD)/)
  assert.doesNotMatch(service, /UPDATE document_version_credit_links|DELETE FROM document_version_credit_links|INSERT INTO facturas|UPDATE facturas|operaciones_justificacion_b4/)
  assert.match(service, /ORDER BY d\.decision_sequence DESC/)
  assert.match(service, /credit-link-idempotency:\$\{actors\.actorRealId\}:\$\{input\.idempotencyKey\}/)
  assert.match(service, /document_version_credit_link_decisions[\s\S]*actor_real_id=.*idempotency_key/)
  assert.match(service, /retryCreditLinkHumanTransaction/)
  assert.match(service, /PrismaClientKnownRequestError/)
  assert.match(service, /error\.code === 'P2034'/)
  assert.match(service, /sqlState === '40001' \|\| sqlState === '40P01'/)
  assert.match(service, /requireB4ActorAccess\(actorId, 'escritura', tx\)/)
  assert.match(service, /originalDocumentNumber/); assert.match(service, /creditDocumentNumber/)
  assert.match(service, /actorRealId/); assert.match(service, /actorEffectiveId/); assert.match(service, /RECTIFICATIVAS_LISTADO_INCOMPLETO/)
})
test('lectores tienen fallback pre-migración y un estado efectivo humano sin autoconfirmación', () => {
  for (const file of ['lib/finanzas/finance-credit-note-pending-db.ts', 'lib/finanzas/finance-credit-note-db.ts']) {
    const text = readFileSync(file, 'utf8')
    assert.match(text, /information_schema\.tables/)
    assert.match(text, /effective_state::text/)
    assert.match(text, /ORDER BY d\.decision_sequence DESC/)
    assert.match(text, /NOT \$\{hasDecision\}/)
    assert.doesNotMatch(text, /UPDATE document_version_credit_links|INSERT INTO document_version_credit_links/)
  }
})
console.log('OK: rectificativas human tests are pure; no DB, HTTP, OCR, Graph or financial mutation.')
