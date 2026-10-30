import { normalizarReferenciaFactura, referenciasFacturaCitadas } from './conciliar-contract'

/**
 * Reserva global de facturas recibidas para la proyección de Conciliar.
 *
 * Una factura no se presenta a dos cargos. Primero se resuelven las coincidencias
 * exactas con referencia bancaria explícita; después, las exactas sin referencia
 * (que se mantienen en revisión humana). Sólo al final se consideran diferencias
 * pequeñas y nunca se reutiliza una factura ya reservada por una coincidencia
 * exacta. El helper es puro: no consulta, no pagina ni confirma B4.
 */
export const CONCILIAR_PROVIDER_SMALL_DIFFERENCE_CENTS = 100

export type ConciliarProviderMatch = 'EXACT' | 'DOCUMENTARY'

export type ConciliarProviderInvoiceCandidate = Readonly<{
  invoiceId: string
  referencia: string | null
  fecha: string | null
  vencimiento: string | null
  /** Capacidad documental todavía pendiente, con el signo del cargo bancario. */
  importeDisponibleCentimos: number
  /** DOCUMENTARY sólo sirve para revisión; jamás produce una coincidencia exacta. */
  providerMatch: ConciliarProviderMatch
}>

export type ConciliarProviderPayment = Readonly<{
  movementId: string
  fecha: string
  importeBancoCentimos: number
  conceptoBanco: string
  /** El campo bancario de referencia conserva una identidad aislada, si existe. */
  referenciaBanco?: string | null
  candidates: readonly ConciliarProviderInvoiceCandidate[]
}>

export type ConciliarProviderAssignmentReason =
  | 'REFERENCIA_EXACTA'
  | 'SIN_REFERENCIA_DOCUMENTAL'
  | 'REFERENCIA_NUMERO_INCOMPLETO'
  | 'IMPORTE_PEQUENO_DISTINTO'
  | 'FECHA_DOCUMENTO_POSTERIOR'
  | 'PROVEEDOR_SOLO_DOCUMENTAL'
  | 'CANDIDATAS_EXACTAS_AMBIGUAS'
  | 'FACTURA_EXACTA_RESERVADA'
  | 'CANDIDATAS_REVISION_AMBIGUAS'
  | 'REFERENCIA_BANCARIA_SIN_FACTURA'
  | 'NINGUNA_FACTURA_DE_ESTE_IMPORTE'

export type ConciliarProviderPaymentAssignment = Readonly<{
  movementId: string
  kind: 'EXACT_REFERENCE' | 'EXACT_NO_REFERENCE' | 'REVIEW' | 'AMBAR' | 'RED'
  reason: ConciliarProviderAssignmentReason
  invoiceId?: string
}>

function calendarDay(value: string | null): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

function hasSafeCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

type ProviderCitedReferences = Readonly<{ strong: readonly string[]; secondary: readonly string[] }>

function citedReferences(conceptoBanco: string): ProviderCitedReferences {
  const strong = new Set<string>()
  const secondary = new Set<string>()
  const normalized = conceptoBanco.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES')
  // A one-letter series with a separator is a complete document number, not a
  // description followed by digits. A bare multi-letter token is intentionally
  // excluded: bank receipt/locator codes share that shape and are not invoice
  // evidence by themselves.
  const series = /(?:^|[^A-Z0-9])([A-Z]\s*[-/:.]\s*\d{4,}(?:\s*[/-]\s*\d{1,10})?)(?=$|[^A-Z0-9])/g
  for (const match of normalized.matchAll(series)) {
    const reference = normalizarReferenciaFactura(match[1])
    if (reference) {
      strong.add(reference)
    }
  }
  const labelled = /(?:^|[^A-Z0-9])(?:FACTURA|FACT\.?|FRA\.?|F)\s*(?:N(?:U)?M(?:ERO)?\s*)?[-#:/. ]*([A-Z]{0,6}\s*\d{2,}(?:\s*[/-]\s*\d{1,10})?)(?=$|[^A-Z0-9])/g
  for (const match of normalized.matchAll(labelled)) {
    const reference = normalizarReferenciaFactura(match[1])
    if (reference) {
      strong.add(reference)
    }
  }
  // A bare multi-letter series can be a received-invoice identifier, but it is
  // weaker than a labelled/A-style number in the same payment: such a series
  // may also be a foreign receipt locator.
  for (const reference of referenciasFacturaCitadas(conceptoBanco)) {
    const normalizedReference = normalizarReferenciaFactura(reference)
    if (normalizedReference) secondary.add(normalizedReference)
  }
  return { strong: [...strong].sort(), secondary: [...secondary].sort() }
}

/**
 * An isolated bank-reference field can be documentary even if it uses a
 * multi-letter series (for example CC...). Its whole value must be one complete
 * identifier; a `RECIBO CC...` phrase or an embedded alphanumeric locator is
 * not upgraded to invoice evidence.
 */
function completeBankReference(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES').trim()
  if (!/^(?:[A-Z]{1,12}\s*[-/:.]\s*\d{2,}|[A-Z]{2,12}\d{4,})(?:\s*[/-]\s*\d{1,10})?$/.test(normalized)) return null
  return normalizarReferenciaFactura(normalized)
}

/**
 * A complete invoice reference in the same bank field has priority over a bare
 * receipt locator. It must still name a current candidate: otherwise that
 * explicit reference is a hard red guard and cannot fall back to another
 * invoice. Without such a complete reference, every cited candidate reference
 * remains binding.
 */
function paymentDocumentaryReferences(payment: ConciliarProviderPayment): readonly string[] {
  const cited = citedReferences(payment.conceptoBanco)
  const bankReference = completeBankReference(payment.referenciaBanco)
  const strong = new Set(cited.strong)
  // A complete isolated bank-reference field is itself strong evidence and
  // therefore can deliberately contradict a reference in the visible concept.
  if (bankReference) strong.add(bankReference)
  if (strong.size) return [...strong].sort()
  // A bare multi-letter series may be a provider document number, but only if
  // the live candidate population independently contains that exact reference.
  // An unrelated accounting/receipt locator is therefore not allowed to turn a
  // same-amount match green, nor to veto it as if it were invoice evidence.
  const candidateReferences = new Set(payment.candidates
    .filter(isCandidateShape)
    .map(candidate => normalizarReferenciaFactura(candidate.referencia))
    .filter((value): value is string => value !== null))
  const compactSeries = new Set([...candidateReferences].flatMap(reference => {
    const match = reference.match(/^([A-Z]{2,12})\d{4,}$/)
    return match ? [`${match[1]}:${reference.length}`] : []
  }))
  return cited.secondary.filter(reference => {
    if (candidateReferences.has(reference)) return true
    const match = reference.match(/^([A-Z]{2,12})\d{4,}$/)
    return !!match && compactSeries.has(`${match[1]}:${reference.length}`)
  })
}

function sameDocumentReference(candidate: ConciliarProviderInvoiceCandidate, references: readonly string[]): boolean {
  if (!references.length) return true
  const candidateReference = normalizarReferenciaFactura(candidate.referencia)
  return candidateReference !== null && references.every(reference => reference === candidateReference)
}

function isCandidateShape(candidate: ConciliarProviderInvoiceCandidate): boolean {
  return typeof candidate.invoiceId === 'string' && candidate.invoiceId.length > 0
    && hasSafeCents(candidate.importeDisponibleCentimos)
    && calendarDay(candidate.fecha) !== null
    && (candidate.providerMatch === 'EXACT' || candidate.providerMatch === 'DOCUMENTARY')
}

function isPaymentShape(payment: ConciliarProviderPayment): boolean {
  return typeof payment.movementId === 'string' && payment.movementId.length > 0
    && typeof payment.conceptoBanco === 'string'
    && hasSafeCents(payment.importeBancoCentimos)
    && calendarDay(payment.fecha) !== null
}

function exactCandidates(payment: ConciliarProviderPayment, references: readonly string[], reservedInvoiceIds: ReadonlySet<string>): ConciliarProviderInvoiceCandidate[] {
  return payment.candidates
    .filter(isCandidateShape)
    .filter(candidate => candidate.providerMatch === 'EXACT'
      && !reservedInvoiceIds.has(candidate.invoiceId)
      && candidate.fecha! <= payment.fecha
      && candidate.importeDisponibleCentimos === payment.importeBancoCentimos
      && sameDocumentReference(candidate, references))
    .sort((left, right) => left.invoiceId.localeCompare(right.invoiceId))
}

type Edge = Readonly<{ movementId: string; invoiceId: string }>

/**
 * Peels only forced edges. A movement with a sole candidate is reserved when no
 * other equally forced movement requires the same invoice. This resolves chains
 * deterministically without using date, UUID or SQL order as an invented tie
 * breaker. Remaining cycles are deliberately left ambiguous.
 */
function reserveForcedEdges(edges: readonly Edge[]): Map<string, string> {
  const remaining = new Map<string, Set<string>>()
  for (const edge of edges) {
    if (!remaining.has(edge.movementId)) remaining.set(edge.movementId, new Set())
    remaining.get(edge.movementId)!.add(edge.invoiceId)
  }
  const result = new Map<string, string>()
  for (;;) {
    const movementsByInvoice = new Map<string, string[]>()
    for (const [movementId, invoices] of remaining) {
      for (const invoiceId of invoices) movementsByInvoice.set(invoiceId, [...(movementsByInvoice.get(invoiceId) ?? []), movementId])
    }
    const selected: Edge[] = []
    for (const movementId of [...remaining.keys()].sort()) {
      const invoices = remaining.get(movementId)!
      if (invoices.size !== 1) continue
      const invoiceId = [...invoices][0]
      const rivals = movementsByInvoice.get(invoiceId) ?? []
      // Two movements that have no alternative are a genuine ambiguity: do not
      // select either one merely because an identifier happens to sort first.
      if (rivals.filter(rival => (remaining.get(rival)?.size ?? 0) === 1).length > 1) continue
      selected.push({ movementId, invoiceId })
    }
    if (!selected.length) return result
    for (const { movementId, invoiceId } of selected) {
      if (!remaining.has(movementId)) continue
      result.set(movementId, invoiceId)
      remaining.delete(movementId)
      for (const invoices of remaining.values()) invoices.delete(invoiceId)
    }
    for (const [movementId, invoices] of remaining) if (!invoices.size) remaining.delete(movementId)
  }
}

function edgeSet(payments: readonly ConciliarProviderPayment[], candidatesByMovement: ReadonlyMap<string, readonly ConciliarProviderInvoiceCandidate[]>): Edge[] {
  return payments.flatMap(payment => (candidatesByMovement.get(payment.movementId) ?? []).map(candidate => ({ movementId: payment.movementId, invoiceId: candidate.invoiceId })))
}

function indexCandidates(payments: readonly ConciliarProviderPayment[]): Map<string, Map<string, ConciliarProviderInvoiceCandidate>> {
  const result = new Map<string, Map<string, ConciliarProviderInvoiceCandidate>>()
  for (const payment of payments) {
    const current = new Map<string, ConciliarProviderInvoiceCandidate>()
    const seen = new Set<string>()
    for (const candidate of payment.candidates.filter(isCandidateShape).sort((left, right) => left.invoiceId.localeCompare(right.invoiceId))) {
      // A duplicated source identifier is malformed input. Keep no arbitrary
      // replacement: the caller will obtain ambiguity/no candidate for it.
      if (seen.has(candidate.invoiceId)) {
        current.delete(candidate.invoiceId)
        continue
      }
      seen.add(candidate.invoiceId)
      current.set(candidate.invoiceId, candidate)
    }
    result.set(payment.movementId, current)
  }
  return result
}

function candidateFor(invoiceId: string, candidates: ReadonlyMap<string, ConciliarProviderInvoiceCandidate>): ConciliarProviderInvoiceCandidate | null {
  return candidates.get(invoiceId) ?? null
}

function reviewReason(payment: ConciliarProviderPayment, candidate: ConciliarProviderInvoiceCandidate): ConciliarProviderAssignmentReason {
  if (candidate.fecha! > payment.fecha) return 'FECHA_DOCUMENTO_POSTERIOR'
  if (candidate.importeDisponibleCentimos !== payment.importeBancoCentimos) return 'IMPORTE_PEQUENO_DISTINTO'
  return 'PROVEEDOR_SOLO_DOCUMENTAL'
}
/** Un número desnudo no acredita la serie del proveedor. Puede conservar una
 * candidata exacta para revisión humana, pero nunca reemplaza una referencia
 * alfanumérica completa ni iguala importes distintos. */
function incompleteNumericReview(payment: ConciliarProviderPayment, references: readonly string[], candidate: ConciliarProviderInvoiceCandidate): boolean {
  if (references.length !== 1 || !/^\d{4,12}$/.test(references[0] ?? '')) return false
  const candidateReference = typeof candidate.referencia === 'string'
    ? candidate.referencia.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\s./:-]/g, '') : null
  return !!candidateReference && /^[A-Z]\d{4,12}$/.test(candidateReference)
    && (candidate.providerMatch === 'EXACT' || candidate.providerMatch === 'DOCUMENTARY')
    && candidate.fecha! <= payment.fecha
    && candidate.importeDisponibleCentimos === payment.importeBancoCentimos
}

/**
 * Produces precisely one decision per payment. An invoice selected in any exact
 * phase is unavailable to all review edges. Explicit references never fall back
 * to an unrelated same-provider invoice; a missing reference target is red.
 */
export function assignConciliarProviderPayments(input: readonly ConciliarProviderPayment[]): ReadonlyMap<string, ConciliarProviderPaymentAssignment> {
  const payments = [...input]
    .filter(isPaymentShape)
    .sort((left, right) => left.movementId.localeCompare(right.movementId))
  const decisions = new Map<string, ConciliarProviderPaymentAssignment>()
  const candidateIndex = indexCandidates(payments)
  const referencesByMovement = new Map(payments.map(payment => [payment.movementId, paymentDocumentaryReferences(payment)]))
  const reserved = new Set<string>()

  // First phase: documentary identity and exact amount/date/provider.
  const referenced = payments.filter(payment => (referencesByMovement.get(payment.movementId) ?? []).length > 0)
  const referencedExact = new Map<string, readonly ConciliarProviderInvoiceCandidate[]>()
  for (const payment of referenced) referencedExact.set(payment.movementId, exactCandidates(payment, referencesByMovement.get(payment.movementId)!, reserved))
  const referencedAssigned = reserveForcedEdges(edgeSet(referenced, referencedExact))
  for (const [movementId, invoiceId] of referencedAssigned) {
    reserved.add(invoiceId)
    decisions.set(movementId, { movementId, kind: 'EXACT_REFERENCE', reason: 'REFERENCIA_EXACTA', invoiceId })
  }

  // Second phase: exact same-provider/same-amount pairs without a reference.
  // They are intentionally amber, but still reserve the invoice globally.
  const noReference = payments.filter(payment => (referencesByMovement.get(payment.movementId) ?? []).length === 0)
  const noReferenceExact = new Map<string, readonly ConciliarProviderInvoiceCandidate[]>()
  for (const payment of noReference) noReferenceExact.set(payment.movementId, exactCandidates(payment, [], reserved))
  const noReferenceAssigned = reserveForcedEdges(edgeSet(noReference, noReferenceExact))
  for (const [movementId, invoiceId] of noReferenceAssigned) {
    reserved.add(invoiceId)
    decisions.set(movementId, { movementId, kind: 'EXACT_NO_REFERENCE', reason: 'SIN_REFERENCIA_DOCUMENTAL', invoiceId })
  }

  // Do not turn an unresolved exact relation into a lesser review. It is either
  // an ambiguity or an invoice already reserved by a stronger exact relation.
  const reviewable: ConciliarProviderPayment[] = []
  for (const payment of payments) {
    if (decisions.has(payment.movementId)) continue
    const references = referencesByMovement.get(payment.movementId) ?? []
    const allExact = exactCandidates(payment, references, new Set())
    if (allExact.length) {
      const availableExact = exactCandidates(payment, references, reserved)
      decisions.set(payment.movementId, {
        movementId: payment.movementId,
        kind: 'AMBAR',
        reason: availableExact.length ? 'CANDIDATAS_EXACTAS_AMBIGUAS' : 'FACTURA_EXACTA_RESERVADA',
      })
      continue
    }
    reviewable.push(payment)
  }

  // Exact ambiguities also retain priority over approximate suggestions. An
  // approximate payment must not consume a document needed to resolve those.
  const protectedExact = new Set(reserved)
  for (const payment of payments) {
    for (const candidate of exactCandidates(payment, referencesByMovement.get(payment.movementId) ?? [], new Set())) protectedExact.add(candidate.invoiceId)
  }
  // Third phase: a unique, close, current source can remain visible as review.
  const reviewCandidates = new Map<string, readonly ConciliarProviderInvoiceCandidate[]>()
  for (const payment of reviewable) {
    const references = referencesByMovement.get(payment.movementId) ?? []
    const candidates = [...(candidateIndex.get(payment.movementId)?.values() ?? [])]
      .filter(candidate => !protectedExact.has(candidate.invoiceId))
      .filter(candidate => sameDocumentReference(candidate, references) || incompleteNumericReview(payment, references, candidate))
      .filter(candidate => Math.abs(candidate.importeDisponibleCentimos - payment.importeBancoCentimos) <= CONCILIAR_PROVIDER_SMALL_DIFFERENCE_CENTS)
      .sort((left, right) => left.invoiceId.localeCompare(right.invoiceId))
    reviewCandidates.set(payment.movementId, candidates)
  }
  const reviewAssigned = reserveForcedEdges(edgeSet(reviewable, reviewCandidates))
  const reviewReserved = new Set<string>()
  for (const [movementId, invoiceId] of reviewAssigned) {
    const payment = payments.find(item => item.movementId === movementId)!
    const candidate = candidateFor(invoiceId, candidateIndex.get(movementId)!)
    if (!candidate) continue
    reviewReserved.add(invoiceId)
    const references = referencesByMovement.get(movementId) ?? []
    const reason = !sameDocumentReference(candidate, references) && incompleteNumericReview(payment, references, candidate)
      ? 'REFERENCIA_NUMERO_INCOMPLETO' : reviewReason(payment, candidate)
    decisions.set(movementId, { movementId, kind: 'REVIEW', reason, invoiceId })
  }

  for (const payment of reviewable) {
    if (decisions.has(payment.movementId)) continue
    const references = referencesByMovement.get(payment.movementId) ?? []
    const candidates = reviewCandidates.get(payment.movementId) ?? []
    if (candidates.length) {
      decisions.set(payment.movementId, { movementId: payment.movementId, kind: 'AMBAR', reason: 'CANDIDATAS_REVISION_AMBIGUAS' })
      continue
    }
    // A cited invoice number is a hard guard. Never replace it with another
    // invoice merely because a provider or amount happens to look similar.
    decisions.set(payment.movementId, {
      movementId: payment.movementId,
      kind: 'RED',
      reason: references.length ? 'REFERENCIA_BANCARIA_SIN_FACTURA' : 'NINGUNA_FACTURA_DE_ESTE_IMPORTE',
    })
  }

  // Inputs with malformed identity are deliberately absent from matching. The
  // caller can retain its ordinary red payment row; valid inputs always decide.
  return decisions
}
