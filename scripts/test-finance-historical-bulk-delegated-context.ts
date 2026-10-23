import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import {
  HISTORICAL_BULK_DELEGATED_APPROVAL_TEXT,
  historicalBulkConfirmationRequestHash,
  historicalBulkDelegatedApprovalAuditMetadata,
  parseHistoricalBulkCommand,
  parseHistoricalBulkDelegatedApprovalContext,
  runHistoricalBulk,
} from '../lib/finanzas/historical-bulk-db'
import { B4ServiceError } from '../lib/finanzas/reconciliation-db'
import { digest } from '../lib/finanzas/historical-bulk-core'

const confirmation = () => ({
  action: 'confirmar_exactas',
  confirmacion: true,
  idempotencyKey: randomUUID(),
  previewToken: 'server-contract-preview-token',
  items: [{ historicoId: randomUUID(), movimientoId: 'movimiento-servidor-1', fingerprint: 'a'.repeat(64) }],
})

const delegation = (referenciaAutorizacion = 'task-20261023-185702-user-timestamp') => ({
  ejecutor: 'Manus' as const,
  instruccionDe: 'Víctor Giró' as const,
  fechaInstruccion: '2026-10-23' as const,
  modo: 'EJECUCION_DELEGADA_EXPLICITA' as const,
  referenciaAutorizacion,
})

const validationError = (error: unknown) => error instanceof B4ServiceError && error.code === 'VALIDATION_ERROR'

test('contexto delegado server-only: sólo acepta la identidad y autorización exactas', () => {
  const parsed = parseHistoricalBulkDelegatedApprovalContext(delegation())
  assert.deepEqual(parsed, delegation())

  for (const invalid of [
    { ...delegation(), ejecutor: 'Víctor Giró' },
    { ...delegation(), instruccionDe: 'Otro actor' },
    { ...delegation(), fechaInstruccion: '2026-10-24' },
    { ...delegation(), modo: 'MANUAL' },
    { ...delegation(), referenciaAutorizacion: 'demasiado-corta' },
    { ...delegation(), referenciaAutorizacion: ` ${delegation().referenciaAutorizacion}` },
    { ...delegation(), referenciaAutorizacion: 'a'.repeat(321) },
    { ...delegation(), referenciaAutorizacion: 'referencia\nno-permitida' },
    { ...delegation(), actorId: 999 },
  ]) {
    assert.throws(() => parseHistoricalBulkDelegatedApprovalContext(invalid), validationError)
  }
  assert.equal(parseHistoricalBulkDelegatedApprovalContext(undefined), null)
})

test('el body público no admite contexto delegado ni altera el actor autenticado', () => {
  const body = { ...confirmation(), delegatedApproval: delegation() }
  assert.throws(() => parseHistoricalBulkCommand(body), validationError)
})

test('metadata de APROBACION identifica a Manus como ejecutor y no suplanta a Víctor', () => {
 const parsed = parseHistoricalBulkDelegatedApprovalContext(delegation())
 assert(parsed)
 const metadata = historicalBulkDelegatedApprovalAuditMetadata(parsed)
 assert.deepEqual(metadata, {
    ejecutor: 'Manus',
    instruccionDe: 'Víctor Giró',
    fechaInstruccion: '2026-10-23',
    modo: 'EJECUCION_DELEGADA_EXPLICITA',
    referenciaAutorizacion: 'task-20261023-185702-user-timestamp',
    textoDelegacion: HISTORICAL_BULK_DELEGATED_APPROVAL_TEXT,
    delegatedApprovalHash: digest(parsed),
  })
 assert.match(metadata.delegatedApprovalHash, /^[a-f0-9]{64}$/)
 assert.deepEqual(historicalBulkDelegatedApprovalAuditMetadata(null), {})
})

test('la idempotencia de confirmación incorpora todo el contexto delegado', () => {
 const actorId = 123
 const command = confirmation()
 const a = delegation('task-20261023-185702-user-timestamp')
 const b = delegation('task-20261023-185703-user-timestamp')
 assert.equal(historicalBulkConfirmationRequestHash(actorId, command, a), historicalBulkConfirmationRequestHash(actorId, command, { ...a }))
 assert.notEqual(historicalBulkConfirmationRequestHash(actorId, command, a), historicalBulkConfirmationRequestHash(actorId, command, b))
 assert.notEqual(historicalBulkConfirmationRequestHash(actorId, command, a), historicalBulkConfirmationRequestHash(actorId + 1, command, a))
 assert.notEqual(historicalBulkConfirmationRequestHash(actorId, command, a), historicalBulkConfirmationRequestHash(actorId, command))
})

test('runHistoricalBulk sólo permite el contexto delegado en confirmar_exactas antes de abrir una transacción', async () => {
 const undo = { action: 'deshacer_bloque', confirmacion: true, idempotencyKey: randomUUID(), bloqueId: randomUUID() }
 await assert.rejects(() => runHistoricalBulk(1, undo, delegation()), validationError)
 await assert.rejects(() => runHistoricalBulk(1, confirmation(), { ...delegation(), ejecutor: 'Suplantado' }), validationError)
})
