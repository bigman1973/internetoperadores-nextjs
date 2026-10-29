import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { creditLinkLedgerAction, creditLinkStateForAction, effectiveCreditLinkState, parseCreditLinkDecision } from '../lib/finanzas/finance-credit-note-human-core'

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
