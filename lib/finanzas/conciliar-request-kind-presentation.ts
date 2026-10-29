/**
 * Adaptador puro de presentación para `conciliar-request-kind-core`.
 * No escribe ni confirma: transforma una decisión ya cerrada en el subconjunto
 * de campos que una proyección existente puede incorporar.
 */
import {
  classifyConciliarRequestKind,
  type ConciliarRequestKindDecision,
  type ConciliarRequestKindInput,
} from './conciliar-request-kind-core'

export type ConciliarRequestKindPresentation = Readonly<{
  color: ConciliarRequestKindDecision['color']
  grupo: ConciliarRequestKindDecision['group']
  motivo: string
  seleccionable: false
  isParaPedir: boolean
  suggestedDocumentReference: string | null
  requestAction: ConciliarRequestKindDecision['requestAction']
  automaticConfirmationForbidden: true
  requiresHumanConfirmation: true
}>

/**
 * Returns null only when the source is outside the payment domain. A returned
 * decision is never selectable: existing server-side confirmation guards stay
 * authoritative and must re-read every live source under the actor ACL.
 */
export function presentConciliarRequestKind(input: ConciliarRequestKindInput): ConciliarRequestKindPresentation | null {
  const current = classifyConciliarRequestKind(input)
  if (!current) return null
  return Object.freeze({
    color: current.color,
    grupo: current.group,
    motivo: current.motive,
    seleccionable: false as const,
    isParaPedir: current.isParaPedir,
    suggestedDocumentReference: current.suggestedDocumentReference,
    requestAction: current.requestAction,
    automaticConfirmationForbidden: true as const,
    requiresHumanConfirmation: true as const,
  })
}
