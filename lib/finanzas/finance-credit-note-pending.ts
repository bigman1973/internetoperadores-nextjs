/**
 * Vista pura para la futura integración en B5/recibidas por el padre.
 *
 * B5 mantiene la lectura canónica y B4 existentes. Este adaptador sólo acepta
 * la misma identidad y los mismos céntimos ya proyectados por B5; cualquier
 * divergencia mantiene el documento en revisión, sin alterar B4 ni una gestión
 * manual de Lorena/Víctor.
 */
import type { CreditNoteSettlement, CreditNoteSettlementState } from './finance-credit-note-core'

export interface PendingInvoiceProjection {
  id: string
  tipo: 'FACTURA_EMITIDA' | 'FACTURA_RECIBIDA'
  importeObjetivoCentimos: number | null
  importeAsignadoActivoCentimos: number | null
  importePendienteCentimos: number | null
}

export interface CreditNotePendingInvoiceProjection extends PendingInvoiceProjection {
  creditNoteState: CreditNoteSettlementState
  rectificationCents: number | null
  importePendienteTrasRectificativasCentimos: number | null
  creditNoteReviewReasons: string[]
}

/**
 * Converts neither signs nor absolute values. `validB4PaymentCents` is compared
 * with B5's active signed assignment before a new pending amount is exposed.
 */
export function applyCreditNotesToPendingInvoiceProjection(
  invoices: readonly PendingInvoiceProjection[],
  settlements: readonly CreditNoteSettlement[],
): CreditNotePendingInvoiceProjection[] {
  const byOriginal = new Map<string, CreditNoteSettlement[]>()
  for (const settlement of settlements) {
    const expectedKind = settlement.kind === 'EMITIDA' ? 'FACTURA_EMITIDA' : 'FACTURA_RECIBIDA'
    const group = byOriginal.get(`${expectedKind}\u0000${settlement.originalDocumentId}`) ?? []
    group.push(settlement)
    byOriginal.set(`${expectedKind}\u0000${settlement.originalDocumentId}`, group)
  }

  return invoices.map((invoice) => {
    const matches = byOriginal.get(`${invoice.tipo}\u0000${invoice.id}`) ?? []
    if (matches.length === 0) return {
      ...invoice,
      creditNoteState: 'PENDIENTE', rectificationCents: 0,
      importePendienteTrasRectificativasCentimos: invoice.importePendienteCentimos,
      creditNoteReviewReasons: [],
    }
    if (matches.length !== 1) return {
      ...invoice,
      creditNoteState: 'REVISION', rectificationCents: null, importePendienteTrasRectificativasCentimos: null,
      creditNoteReviewReasons: ['RECTIFICATIVA_RESULTADO_DUPLICADO'],
    }
    const settlement = matches[0]
    const equivalentB4 = settlement.validB4PaymentCents === invoice.importeAsignadoActivoCentimos
    if (settlement.state === 'REVISION' || settlement.originalCents !== invoice.importeObjetivoCentimos || !equivalentB4) {
      return {
        ...invoice,
        creditNoteState: 'REVISION', rectificationCents: null, importePendienteTrasRectificativasCentimos: null,
        creditNoteReviewReasons: [...(settlement.state === 'REVISION'
          ? settlement.reviewReasons
          : ['B5_Y_RECTIFICATIVA_NO_COINCIDEN_EXACTAMENTE'])].sort(),
      }
    }
    return {
      ...invoice,
      creditNoteState: settlement.state,
      rectificationCents: settlement.validRectificationCents,
      importePendienteTrasRectificativasCentimos: settlement.pendingCents,
      creditNoteReviewReasons: [],
    }
  })
}
