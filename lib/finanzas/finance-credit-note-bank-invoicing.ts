/**
 * Adaptador puro para la futura integración del padre en B7 (emitidas).
 * No muta la proyección B7: devuelve una vista adicional con el pendiente tras
 * rectificativas válidas y reutiliza los importes B4 ya calculados por B7.
 */
import type { CreditNoteSettlement, CreditNoteSettlementState } from './finance-credit-note-core'

export interface IssuedBankInvoiceProjection {
  invoiceId: string
  targetCents: number | null
  paidDocumentaryCents: number | null
  remainingCents: number | null
  paymentState: string
}

export interface CreditNoteIssuedBankProjection extends IssuedBankInvoiceProjection {
  creditNoteState: CreditNoteSettlementState
  rectificationCents: number | null
  remainingAfterCreditNotesCents: number | null
  creditNoteReviewReasons: string[]
}

/**
 * Applies only an exact settlement for the same canonical FI ID. If B7's original
 * target or documentary B4 sum no longer agrees with the credit-note calculation,
 * the result is revision instead of choosing either side or double-crediting.
 */
export function applyCreditNotesToIssuedBankProjection(
  invoices: readonly IssuedBankInvoiceProjection[],
  settlements: readonly CreditNoteSettlement[],
): CreditNoteIssuedBankProjection[] {
  const byOriginal = new Map<string, CreditNoteSettlement[]>()
  for (const settlement of settlements) {
    if (settlement.kind !== 'EMITIDA') continue
    const group = byOriginal.get(settlement.originalDocumentId) ?? []
    group.push(settlement)
    byOriginal.set(settlement.originalDocumentId, group)
  }

  return invoices.map((invoice) => {
    const matches = byOriginal.get(invoice.invoiceId) ?? []
    if (matches.length === 0) return {
      ...invoice,
      creditNoteState: 'PENDIENTE', rectificationCents: 0,
      remainingAfterCreditNotesCents: invoice.remainingCents, creditNoteReviewReasons: [],
    }
    if (matches.length !== 1) return {
      ...invoice,
      creditNoteState: 'REVISION', rectificationCents: null, remainingAfterCreditNotesCents: null,
      creditNoteReviewReasons: ['RECTIFICATIVA_RESULTADO_DUPLICADO'],
    }
    const settlement = matches[0]
    if (settlement.state === 'REVISION'
      || settlement.originalCents !== invoice.targetCents
      || settlement.validB4PaymentCents !== invoice.paidDocumentaryCents) {
      const mismatch = settlement.state === 'REVISION' ? settlement.reviewReasons : ['B7_Y_RECTIFICATIVA_NO_COINCIDEN_EXACTAMENTE']
      return {
        ...invoice,
        creditNoteState: 'REVISION', rectificationCents: null, remainingAfterCreditNotesCents: null,
        creditNoteReviewReasons: [...mismatch].sort(),
      }
    }
    return {
      ...invoice,
      creditNoteState: settlement.state,
      rectificationCents: settlement.validRectificationCents,
      remainingAfterCreditNotesCents: settlement.pendingCents,
      creditNoteReviewReasons: [],
    }
  })
}
