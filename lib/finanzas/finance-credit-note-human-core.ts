/** Pure contract for the human, append-only decision ledger of a credit link. */
export type CreditLinkHumanAction = 'confirmar' | 'rechazar' | 'deshacer'
export type CreditLinkEffectiveState = 'PROPOSED' | 'CONFIRMED' | 'REJECTED'
export type CreditLinkLedgerAction = 'CONFIRM' | 'REJECT' | 'UNDO'
export type CreditLinkDecisionInput = Readonly<{ action: CreditLinkHumanAction; creditLinkId: string; idempotencyKey: string; reason?: string | null }>

/** A human click can open at most this many fresh SERIALIZABLE transactions. */
export const CREDIT_LINK_HUMAN_TRANSACTION_MAX_ATTEMPTS = 3

export type CreditLinkHumanTransactionAttempt<T> = () => Promise<T>
export type CreditLinkHumanRetryableTransactionConflict = (error: unknown) => boolean

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^[a-f0-9]{64}$/
const CONTROL = /[\u0000-\u001F\u007F]/

export function creditLinkStateForAction(action: CreditLinkHumanAction): CreditLinkEffectiveState {
  if (action === 'confirmar') return 'CONFIRMED'
  if (action === 'rechazar') return 'REJECTED'
  return 'PROPOSED'
}

/** Database enum is deliberately independent from Spanish UI action tokens. */
export function creditLinkLedgerAction(action: CreditLinkHumanAction): CreditLinkLedgerAction {
  if (action === 'confirmar') return 'CONFIRM'
  if (action === 'rechazar') return 'REJECT'
  return 'UNDO'
}

/**
 * Pure retry boundary for one already-validated human decision.  The caller
 * injects both the fresh transaction opener and the driver-specific conflict
 * classifier, so this module neither accesses a database nor broadens retry
 * policy to domain, permission, validation, or idempotency errors.
 */
export async function retryCreditLinkHumanTransaction<T>(
  transaction: CreditLinkHumanTransactionAttempt<T>,
  isRetryableTransactionConflict: CreditLinkHumanRetryableTransactionConflict,
): Promise<T> {
  for (let attempt = 1; attempt <= CREDIT_LINK_HUMAN_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await transaction()
    } catch (error) {
      if (attempt === CREDIT_LINK_HUMAN_TRANSACTION_MAX_ATTEMPTS || !isRetryableTransactionConflict(error)) throw error
    }
  }
  throw new Error('CREDIT_LINK_HUMAN_TRANSACTION_RETRY_UNREACHABLE')
}

export function parseCreditLinkDecision(value: unknown): { ok: true; value: CreditLinkDecisionInput } | { ok: false; message: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, message: 'La decisión de rectificativa debe ser un objeto.' }
  const raw = value as Record<string, unknown>
  const action = raw.action
  const creditLinkId = raw.creditLinkId
  const idempotencyKey = raw.idempotencyKey
  const rawReason = raw.reason
  if (action !== 'confirmar' && action !== 'rechazar' && action !== 'deshacer') return { ok: false, message: 'La acción de rectificativa no es válida.' }
  if (typeof creditLinkId !== 'string' || !UUID.test(creditLinkId)) return { ok: false, message: 'El enlace rectificativo no es válido.' }
  if (typeof idempotencyKey !== 'string' || !HASH.test(idempotencyKey)) return { ok: false, message: 'La clave de idempotencia no es válida.' }
  const reason = rawReason === undefined || rawReason === null ? null : typeof rawReason === 'string' ? rawReason.trim() : null
  if ((action === 'rechazar' || action === 'deshacer') && (!reason || reason.length < 3 || reason.length > 500 || CONTROL.test(reason))) return { ok: false, message: 'Rechazar o deshacer exige un motivo de 3 a 500 caracteres.' }
  if (action === 'confirmar' && rawReason !== undefined && rawReason !== null) return { ok: false, message: 'Confirmar no admite motivo adicional.' }
  return { ok: true, value: { action, creditLinkId, idempotencyKey, ...(reason ? { reason } : {}) } }
}

/** Last ledger state wins; legacy link state is used only until a human event exists. */
export function effectiveCreditLinkState(legacy: CreditLinkEffectiveState, ledger: CreditLinkEffectiveState | null): CreditLinkEffectiveState {
  return ledger ?? legacy
}
