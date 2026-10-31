import type { ConciliarCommand } from './conciliar-contract'
import { conciliarHash, conciliarRequestHash } from './conciliar-core'

export const CONCILIAR_RECEIPT_RECOVERY_V2 = 'CONCILIAR_RECEIPT_RECOVERY_V2' as const
export const CONCILIAR_RECOVERY_SELECTION_V2 = 'CONCILIAR_RECOVERY_SELECTION_V2' as const

export type ConciliarRecoveryAction = 'CONFIRMAR' | 'DESHACER'
/**
 * Area 3 deliberately does not publish NOT_COMMITTED. A proof of coordinated
 * rollback would require a separately reviewed lock-owning reconciler; until
 * then loss, rollback and any malformed record remain PENDING.
 */
export type ConciliarRecoveryResolution = 'PENDING' | 'COMMITTED'

export type ConciliarRecoveryIdentity = Readonly<{
  actorRealId: number
  actorEffectiveId: number
  actingSessionId: string | null
}>

export type ConciliarRecoveryLookup = Readonly<{
  idempotencyKey: string
  action: ConciliarRecoveryAction
  bodyHash: string
}>

export type ConciliarRecoveryIntent = Readonly<{
  idempotencyKey: string
  action: ConciliarRecoveryAction
  canonicalCommand: Record<string, unknown>
  commandHash: string
  bodyHash: string
  requestHash: string
  selectionCount: number
  selectionHash: string
  targetConfirmationOperationId: string | null
}>

export type ConciliarRecoveryRecord = Readonly<{
  idempotencyKey: string
  action: ConciliarRecoveryAction
  resolution: ConciliarRecoveryResolution
  commandHash: string
  bodyHash: string
  requestHash: string
  actorRealId: number
  actorEffectiveId: number
  actingSessionId: string | null
  selectionCount: number
  selectionHash: string
  receiptOperationId: string | null
  targetConfirmationOperationId: string | null
  legCount: number | null
}>

type RecoverableConfirm = Extract<ConciliarCommand, { action: 'confirmar'; idempotencyKey: string }>
type RecoverableUndo = Extract<ConciliarCommand, { action: 'deshacer' }>
type RecoverableManualPair = Extract<ConciliarCommand, { action: 'confirmar_traspasos_propios_manual' }>
export type RecoverableConciliarCommand = RecoverableConfirm | RecoverableUndo | RecoverableManualPair

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/

function recoveryFail(message: string): never { throw new Error(message) }

function commandRecord(command: RecoverableConciliarCommand): Record<string, unknown> {
  // Commands reach this point only after parseConciliarCommand(), which returns
  // plain closed objects. Copying through JSON preserves that normalized shape
  // without browser prototypes or transient route-only values.
  const serialized = JSON.stringify(command)
  const parsed = JSON.parse(serialized) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) recoveryFail('CONCILIAR_RECOVERY_CANONICAL_COMMAND_INVALID')
  return parsed as Record<string, unknown>
}

export function isRecoverableConciliarCommand(command: ConciliarCommand): command is RecoverableConciliarCommand {
  if (command.action === 'deshacer' || command.action === 'confirmar_traspasos_propios_manual') return true
  return command.action === 'confirmar' && ('items' in command || ('review' in command && command.review.kind === 'REVIEW_CONFIRM'))
}

function selectionForCommand(command: RecoverableConciliarCommand): Readonly<{
  action: ConciliarRecoveryAction
  count: number
  hash: string
  targetConfirmationOperationId: string | null
}> {
  if (command.action === 'deshacer') {
    return {
      action: 'DESHACER',
      count: 1,
      hash: conciliarHash({ schema: CONCILIAR_RECOVERY_SELECTION_V2, action: 'DESHACER', targetConfirmationOperationId: command.operationId }),
      targetConfirmationOperationId: command.operationId,
    }
  }
  if (command.action === 'confirmar' && 'review' in command) {
    return {
      action: 'CONFIRMAR',
      count: 1,
      hash: conciliarHash({ schema: CONCILIAR_RECOVERY_SELECTION_V2, action: 'CONFIRMAR', mode: 'REVIEW_CONFIRM', review: command.review }),
      targetConfirmationOperationId: null,
    }
  }
  const mode = command.action === 'confirmar_traspasos_propios_manual' ? 'MANUAL_PAIR' : 'ITEMS'
  return {
    action: 'CONFIRMAR',
    count: command.items.length,
    hash: conciliarHash({ schema: CONCILIAR_RECOVERY_SELECTION_V2, action: 'CONFIRMAR', mode, items: command.items }),
    targetConfirmationOperationId: null,
  }
}

/**
 * Binds the recovery intent to the normalized, closed action payload. The
 * request hash retains the existing effective-actor idempotency semantics;
 * bodyHash is independent of actor and is the exact lookup capability supplied
 * by the caller after a lost response.
 */
export function buildConciliarRecoveryIntent(actorEffectiveId: number, command: RecoverableConciliarCommand): ConciliarRecoveryIntent {
  const canonicalCommand = commandRecord(command)
  const selection = selectionForCommand(command)
  const bodyHash = conciliarHash({ schema: `${CONCILIAR_RECEIPT_RECOVERY_V2}:BODY`, command: canonicalCommand })
  return {
    idempotencyKey: command.idempotencyKey,
    action: selection.action,
    canonicalCommand,
    commandHash: conciliarHash({ schema: `${CONCILIAR_RECEIPT_RECOVERY_V2}:COMMAND`, command: canonicalCommand }),
    bodyHash,
    requestHash: conciliarRequestHash(actorEffectiveId, command),
    selectionCount: selection.count,
    selectionHash: selection.hash,
    targetConfirmationOperationId: selection.targetConfirmationOperationId,
  }
}

/** The recovery selector is deliberately exclusive and has no actor/session URL fields. */
export function parseConciliarRecoveryLookup(raw: Readonly<Record<string, string | null | undefined>>): ConciliarRecoveryLookup {
  const keys = Object.keys(raw)
  const required = ['recover', 'idempotencyKey', 'action', 'bodyHash']
  if (keys.length !== required.length || keys.some(key => !required.includes(key)) || required.some(key => raw[key] === undefined)) {
    recoveryFail('CONCILIAR_RECOVERY_QUERY_INVALID')
  }
  if (raw.recover !== CONCILIAR_RECEIPT_RECOVERY_V2) recoveryFail('CONCILIAR_RECOVERY_QUERY_INVALID')
  const idempotencyKey = raw.idempotencyKey
  const action = raw.action
  const bodyHash = raw.bodyHash
  if (typeof idempotencyKey !== 'string' || !UUID.test(idempotencyKey)
    || (action !== 'CONFIRMAR' && action !== 'DESHACER')
    || typeof bodyHash !== 'string' || !SHA256.test(bodyHash)) {
    recoveryFail('CONCILIAR_RECOVERY_QUERY_INVALID')
  }
  return { idempotencyKey: idempotencyKey.toLowerCase(), action, bodyHash: bodyHash.toLowerCase() }
}

export function recoveryRecordMatchesIdentity(record: ConciliarRecoveryRecord, identity: ConciliarRecoveryIdentity, lookup: ConciliarRecoveryLookup): boolean {
  return record.idempotencyKey === lookup.idempotencyKey
    && record.action === lookup.action
    && record.bodyHash === lookup.bodyHash
    && record.actorRealId === identity.actorRealId
    && record.actorEffectiveId === identity.actorEffectiveId
    && record.actingSessionId === identity.actingSessionId
}

function pendingRecoveryResponse(lookup: ConciliarRecoveryLookup, identity: ConciliarRecoveryIdentity) {
  return {
    schema: CONCILIAR_RECEIPT_RECOVERY_V2,
    idempotencyKey: lookup.idempotencyKey,
    action: lookup.action,
    resolution: 'PENDING' as const,
    correlation: { bodyHash: lookup.bodyHash, ...identity },
    selection: null,
    confirmation: null,
    undo: null,
  }
}

/**
 * A malformed or unmatched database row deliberately degrades to PENDING. This
 * function never infers NOT_COMMITTED from an absent receipt. Area 3 has no
 * automatic NOT_COMMITTED transition, so ambiguity remains PENDING.
 */
export function formatConciliarRecoveryResponse(
  lookup: ConciliarRecoveryLookup,
  identity: ConciliarRecoveryIdentity,
  record: ConciliarRecoveryRecord | null,
) {
  if (!record || !recoveryRecordMatchesIdentity(record, identity, lookup)) return pendingRecoveryResponse(lookup, identity)
  const shared = {
    schema: CONCILIAR_RECEIPT_RECOVERY_V2,
    idempotencyKey: record.idempotencyKey,
    action: record.action,
    correlation: {
      bodyHash: record.bodyHash,
      actorRealId: record.actorRealId,
      actorEffectiveId: record.actorEffectiveId,
      actingSessionId: record.actingSessionId,
    },
    selection: {
      schema: CONCILIAR_RECOVERY_SELECTION_V2,
      count: record.selectionCount,
      hash: record.selectionHash,
    },
  }
  if (record.resolution === 'PENDING') {
    // This is an exact own intent, already matched on key/body/real/effective
    // actor/session. The sealed selection helps the harness retain evidence
    // while still making no claim about the financial outcome.
    return { ...shared, resolution: 'PENDING' as const, confirmation: null, undo: null }
  }
  if (record.resolution !== 'COMMITTED' || !record.receiptOperationId || !Number.isSafeInteger(record.legCount) || record.legCount < 0) {
    return pendingRecoveryResponse(lookup, identity)
  }
  if (record.action === 'CONFIRMAR') {
    if (record.targetConfirmationOperationId !== null) return pendingRecoveryResponse(lookup, identity)
    return {
      ...shared,
      resolution: 'COMMITTED' as const,
      confirmation: { receiptOperationId: record.receiptOperationId, legCount: record.legCount },
      undo: null,
    }
  }
  if (!record.targetConfirmationOperationId) return pendingRecoveryResponse(lookup, identity)
  return {
    ...shared,
    resolution: 'COMMITTED' as const,
    confirmation: null,
    undo: {
      receiptOperationId: record.receiptOperationId,
      targetConfirmationOperationId: record.targetConfirmationOperationId,
    },
  }
}
