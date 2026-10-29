/**
 * Planificador puro G1 para reservar documentos de cobro.
 *
 * No abre Prisma, no lee entorno, no emite logs y no modifica propuestas,
 * reservas, B4 ni B7. Recibe únicamente una foto ya leída y devuelve una
 * decisión declarativa para que la capa propietaria de DB la presente o la
 * persista bajo sus propios bloqueos.
 *
 * Una propuesta de EMITIDAS es sólo un espejo: nunca participa en reservas de
 * banco. Las propuestas ámbar tampoco consumen capacidad documental. Ante un
 * empate exacto o cualquier forma incompleta no se desempata por UUID, fecha
 * de inserción ni orden de entrada: todas las alternativas quedan en revisión.
 */

export const COLLECTION_RESERVATION_MAX_DOCUMENTS = 2_000
export const COLLECTION_RESERVATION_MAX_CENTS = 2_147_483_647

export type CollectionReservationProjection = 'BANK_MOVEMENT' | 'ISSUED_MIRROR'
export type CollectionReservationProposalState = 'ACTIVE' | 'HISTORICAL' | 'CONFIRMED'
export type CollectionReservationQuote = 'EXACT' | 'AMBER'
export type CollectionReservationStatus = 'ACTIVE' | 'HISTORICAL' | 'CONFIRMED'

/** Static categories only. Callers must never log the opaque keys in a plan. */
export type CollectionReservationIssueCode =
  | 'G1_PROPOSAL_SHAPE_INVALID'
  | 'G1_EXACT_QUOTE_INVALID'
  | 'G1_AMBER_QUOTE_INVALID'
  | 'G1_PROPOSAL_REUSED_ACROSS_BANK_MOVEMENTS'
  | 'G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS'
  | 'EXACT_EVIDENCE_INCOMPLETE'
  | 'EXACT_TIE_FAIL_CLOSED'
  | 'DOCUMENT_ALREADY_RESERVED'
  | 'PARTIAL_EXISTING_RESERVATION'
  | 'AMBER_REVIEW_ONLY'
  | 'AMBER_CANNOT_CONSUME_EXACT'
  | 'RESERVATION_SHAPE_INVALID'

export type CollectionReservationEvidence = Readonly<{
  /** Complete primary-document proof, not a label or an amount-only inference. */
  documentEvidenceComplete: boolean
  /** Complete supplier/client proof, or the equivalent established remittance proof. */
  counterpartyEvidenceComplete: boolean
  /**
   * Every FI in the complete composition has a current, bijective documentary
   * identity proof (fiscal number, client, date and nominal) from an
   * independent/persisted documentary source. This is deliberately not derived
   * from a key, amount, composition length, proposal method or input order.
   *
   * It is optional for compatibility with read-only callers. Missing or false
   * means ordinary exact evidence: valid by itself, but never allowed to
   * displace a conflicting canonical documentary claim.
   */
  canonicalDocumentIdentityComplete?: boolean
}>

export type CollectionReservationCompositionLine = Readonly<{
  /** Opaque FacturaEmitida/document key. `0`, null-like values and blanks are invalid. */
  documentKey: string | null
  importeCentimos: number | null
}>

export type CollectionReservationProposal = Readonly<{
  /** Opaque source proposal key; not a ranking criterion. */
  proposalKey: string | null
  /** Opaque bank-movement key; not a ranking criterion. */
  movementKey: string | null
  projection: CollectionReservationProjection
  state: CollectionReservationProposalState
  quote: CollectionReservationQuote
  quotedAmountCents: number | null
  bankAmountCents: number | null
  composition: readonly CollectionReservationCompositionLine[] | null
  evidence: CollectionReservationEvidence
}>

/**
 * A caller may supply current reservations read under its own transaction.
 * CONFIRMED reservations remain capacity locks; HISTORICAL reservations are
 * reported as preserved history and deliberately do not become a new lock.
 */
export type CollectionDocumentReservation = Readonly<{
  documentKey: string | null
  proposalKey: string | null
  movementKey: string | null
  status: CollectionReservationStatus
}>

export type CollectionReservationPlanInput = Readonly<{
  proposals: readonly CollectionReservationProposal[]
  reservations?: readonly CollectionDocumentReservation[]
}>

export type CollectionReservationSelection = Readonly<{
  proposalKey: string
  movementKey: string
  quote: 'EXACT'
  documentKeys: readonly string[]
  compositionTotalCents: number
  /** KEEP means every current active reservation already names this same proposal/movement. */
  disposition: 'NEW' | 'KEEP'
}>

export type CollectionReservationReview = Readonly<{
  proposalKey: string
  movementKey: string
  quote: CollectionReservationQuote
  /** A review never owns a document reservation. */
  codes: readonly CollectionReservationIssueCode[]
}>

export type CollectionReservationPreservedProposal = Readonly<{
  proposalKey: string
  movementKey: string
  state: 'HISTORICAL' | 'CONFIRMED'
}>

export type CollectionReservationPlan = Readonly<{
  /** Active, bank-side exact proposals that may be selectable. */
  selected: readonly CollectionReservationSelection[]
  /** Invalid, ambiguous and amber alternatives. None is selected. */
  review: readonly CollectionReservationReview[]
  /** Historical/confirmed proposals are observed but never changed or re-ranked. */
  preservedProposals: readonly CollectionReservationPreservedProposal[]
  /** EMITIDAS mirrors are deliberately excluded from bank allocation. */
  ignoredIssuedMirrors: number
  /** Existing historical/confirmed reservations are copied as observations only. */
  preservedReservationCount: number
  /** Static aggregate categories for a regression adapter; no identifiers or money. */
  issueCodes: readonly CollectionReservationIssueCode[]
}>

type ParsedProposal = Readonly<{
  input: CollectionReservationProposal
  proposalKey: string
  movementKey: string
  composition: readonly Readonly<{ documentKey: string; importeCentimos: number }>[]
  compositionTotalCents: number
  codes: readonly CollectionReservationIssueCode[]
}>

type ActiveReservation = Readonly<{
  documentKey: string
  proposalKey: string
  movementKey: string
}>

function opaqueKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 300) return null
  const normalized = trimmed.toLocaleLowerCase('en-US')
  if (normalized === '0' || normalized === 'null' || normalized === 'undefined') return null
  return trimmed
}

function safePositiveCents(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0
    && value <= COLLECTION_RESERVATION_MAX_CENTS
}

function sumPositiveCents(values: readonly number[]): number | null {
  let total = 0
  for (const value of values) {
    if (!safePositiveCents(value) || total > COLLECTION_RESERVATION_MAX_CENTS - value) return null
    total += value
  }
  return total > 0 ? total : null
}

function staticCodes(codes: readonly CollectionReservationIssueCode[]): readonly CollectionReservationIssueCode[] {
  return [...new Set(codes)].sort()
}

/** Only presentation order uses opaque keys. No selection uses this comparison. */
function outputOrder(left: Readonly<{ movementKey: string; proposalKey: string }>, right: Readonly<{ movementKey: string; proposalKey: string }>): number {
  return left.movementKey.localeCompare(right.movementKey) || left.proposalKey.localeCompare(right.proposalKey)
}

function parseProposal(input: CollectionReservationProposal): ParsedProposal | null {
  const proposalKey = opaqueKey(input?.proposalKey)
  const movementKey = opaqueKey(input?.movementKey)
  if (!proposalKey || !movementKey) return null

  const codes: CollectionReservationIssueCode[] = []
  const rawComposition = input.composition
  const composition = Array.isArray(rawComposition) && rawComposition.length > 0 && rawComposition.length <= COLLECTION_RESERVATION_MAX_DOCUMENTS
    ? rawComposition.flatMap(line => {
      const documentKey = opaqueKey(line?.documentKey)
      return documentKey && safePositiveCents(line?.importeCentimos)
        ? [{ documentKey, importeCentimos: line.importeCentimos }]
        : []
    })
    : []
  const uniqueDocuments = new Set(composition.map(line => line.documentKey))
  if (!Array.isArray(rawComposition)
    || rawComposition.length < 1
    || rawComposition.length > COLLECTION_RESERVATION_MAX_DOCUMENTS
    || composition.length !== rawComposition.length
    || uniqueDocuments.size !== composition.length) {
    codes.push('G1_PROPOSAL_SHAPE_INVALID')
  }

  const compositionTotalCents = sumPositiveCents(composition.map(line => line.importeCentimos))
  if (compositionTotalCents === null) codes.push('G1_PROPOSAL_SHAPE_INVALID')

  if (input.quote === 'EXACT') {
    if (!safePositiveCents(input.quotedAmountCents)
      || !safePositiveCents(input.bankAmountCents)
      || compositionTotalCents === null
      || input.quotedAmountCents !== input.bankAmountCents
      || compositionTotalCents !== input.bankAmountCents) {
      codes.push('G1_EXACT_QUOTE_INVALID')
    }
    if (input.evidence?.documentEvidenceComplete !== true || input.evidence?.counterpartyEvidenceComplete !== true) {
      codes.push('EXACT_EVIDENCE_INCOMPLETE')
    }
  } else if (input.quote === 'AMBER') {
    // Amber remains review-only, but its own displayed quote must still equal
    // its complete composition; otherwise it is malformed rather than a hint.
    if (!safePositiveCents(input.quotedAmountCents)
      || compositionTotalCents === null
      || input.quotedAmountCents !== compositionTotalCents) {
      codes.push('G1_AMBER_QUOTE_INVALID')
    }
  } else {
    codes.push('G1_PROPOSAL_SHAPE_INVALID')
  }

  return {
    input,
    proposalKey,
    movementKey,
    composition,
    compositionTotalCents: compositionTotalCents ?? 0,
    codes: staticCodes(codes),
  }
}

function parsedActiveReservation(input: CollectionDocumentReservation): ActiveReservation | null {
  if (input.status !== 'ACTIVE' && input.status !== 'CONFIRMED') return null
  const documentKey = opaqueKey(input.documentKey)
  const proposalKey = opaqueKey(input.proposalKey)
  const movementKey = opaqueKey(input.movementKey)
  return documentKey && proposalKey && movementKey ? { documentKey, proposalKey, movementKey } : null
}

/** A canonical source may prevail only over ordinary exact evidence. The caller
 * has already validated both forms; this planner neither recognizes methods nor
 * manufactures documentary proof. */
function documentaryPriority(candidate: ParsedProposal): number {
  return candidate.input.evidence.canonicalDocumentIdentityComplete === true ? 1 : 0
}

/**
 * Resolves an immutable one-run allocation. There is intentionally no winner
 * when two exact claims have equal documentary priority: a human must decide.
 */
export function planCollectionDocumentReservations(input: CollectionReservationPlanInput): CollectionReservationPlan {
  const proposals = Array.isArray(input?.proposals) ? input.proposals : []
  const reservations = Array.isArray(input?.reservations) ? input.reservations : []
  const issueCodes: CollectionReservationIssueCode[] = []
  const reviews = new Map<string, CollectionReservationReview>()
  const preservedProposals: CollectionReservationPreservedProposal[] = []
  const candidates: ParsedProposal[] = []
  let ignoredIssuedMirrors = 0

  const addReview = (proposal: ParsedProposal, extra: readonly CollectionReservationIssueCode[]): void => {
    const key = `${proposal.movementKey}\u0000${proposal.proposalKey}`
    const prior = reviews.get(key)
    reviews.set(key, {
      proposalKey: proposal.proposalKey,
      movementKey: proposal.movementKey,
      quote: proposal.input.quote,
      codes: staticCodes([...(prior?.codes ?? []), ...proposal.codes, ...extra]),
    })
  }

  for (const raw of proposals) {
    const parsed = parseProposal(raw)
    if (!parsed) {
      issueCodes.push('G1_PROPOSAL_SHAPE_INVALID')
      continue
    }
    if (raw.projection === 'ISSUED_MIRROR') {
      ignoredIssuedMirrors += 1
      continue
    }
    if (raw.projection !== 'BANK_MOVEMENT') {
      addReview(parsed, ['G1_PROPOSAL_SHAPE_INVALID'])
      continue
    }
    if (raw.state === 'HISTORICAL' || raw.state === 'CONFIRMED') {
      preservedProposals.push({ proposalKey: parsed.proposalKey, movementKey: parsed.movementKey, state: raw.state })
      continue
    }
    if (raw.state !== 'ACTIVE') {
      addReview(parsed, ['G1_PROPOSAL_SHAPE_INVALID'])
      continue
    }
    candidates.push(parsed)
  }

  const proposalMovements = new Map<string, Set<string>>()
  for (const candidate of candidates) {
    const movements = proposalMovements.get(candidate.proposalKey) ?? new Set<string>()
    movements.add(candidate.movementKey)
    proposalMovements.set(candidate.proposalKey, movements)
  }
  const reusedProposalKeys = new Set([...proposalMovements]
    .filter(([, movementKeys]) => movementKeys.size > 1)
    .map(([proposalKey]) => proposalKey))

  const activeReservations = new Map<string, ActiveReservation[]>()
  let invalidActiveReservation = false
  let preservedReservationCount = 0
  for (const reservation of reservations) {
    if (reservation.status === 'HISTORICAL' || reservation.status === 'CONFIRMED') preservedReservationCount += 1
    const parsed = parsedActiveReservation(reservation)
    if (!parsed) {
      if (reservation.status === 'ACTIVE' || reservation.status === 'CONFIRMED') invalidActiveReservation = true
      continue
    }
    activeReservations.set(parsed.documentKey, [...(activeReservations.get(parsed.documentKey) ?? []), parsed])
  }
  if (invalidActiveReservation) issueCodes.push('RESERVATION_SHAPE_INVALID')

  // A malformed reservation has no trustworthy document key. Do not approve any
  // automatic exact row while the caller's reservation photo is incomplete.
  if (invalidActiveReservation) {
    for (const candidate of candidates) addReview(candidate, ['RESERVATION_SHAPE_INVALID'])
  }

  const exact = candidates.filter(candidate => candidate.input.quote === 'EXACT' && candidate.codes.length === 0 && !reusedProposalKeys.has(candidate.proposalKey))
  const amber = candidates.filter(candidate => candidate.input.quote === 'AMBER')
  for (const candidate of candidates) {
    if (candidate.input.quote === 'EXACT' && reusedProposalKeys.has(candidate.proposalKey)) addReview(candidate, ['G1_PROPOSAL_REUSED_ACROSS_BANK_MOVEMENTS'])
    else if (candidate.input.quote === 'EXACT' && candidate.codes.length) addReview(candidate, [])
  }

  // A review never owns a document, so an amber claim cannot displace a valid
  // exact one. It still has to be marked: publishing that amber composition as
  // another bank assignment would make the G1 projection reuse the document.
  const documentaryClaims = new Map<string, ParsedProposal[]>()
  for (const candidate of candidates) {
    if (candidate.codes.includes('G1_PROPOSAL_SHAPE_INVALID')) continue
    for (const line of candidate.composition) documentaryClaims.set(line.documentKey, [...(documentaryClaims.get(line.documentKey) ?? []), candidate])
  }
  const documentReusedByMovement = new Set<ParsedProposal>()
  for (const claims of documentaryClaims.values()) {
    if (new Set(claims.map(candidate => candidate.movementKey)).size > 1) {
      for (const candidate of claims) documentReusedByMovement.add(candidate)
    }
  }
  for (const candidate of documentReusedByMovement) {
    if (candidate.input.quote === 'AMBER' || candidate.codes.length > 0) addReview(candidate, ['G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS'])
  }

  // No arbitrary winner among multiple complete exact proposals for a movement.
  const exactByMovement = new Map<string, ParsedProposal[]>()
  for (const candidate of exact) exactByMovement.set(candidate.movementKey, [...(exactByMovement.get(candidate.movementKey) ?? []), candidate])
  const movementTies = new Set<string>()
  for (const [movementKey, sameMovement] of exactByMovement) {
    if (sameMovement.length > 1) {
      movementTies.add(movementKey)
      for (const candidate of sameMovement) addReview(candidate, ['EXACT_TIE_FAIL_CLOSED'])
    }
  }

  const nonTiedExact = exact.filter(candidate => !movementTies.has(candidate.movementKey))
  const exactClaims = new Map<string, ParsedProposal[]>()
  for (const candidate of nonTiedExact) {
    for (const line of candidate.composition) exactClaims.set(line.documentKey, [...(exactClaims.get(line.documentKey) ?? []), candidate])
  }
  const conflictingExact = new Set<ParsedProposal>()
  for (const claims of exactClaims.values()) {
    const movements = new Set(claims.map(candidate => candidate.movementKey))
    if (movements.size < 2) continue

    // A strictly stronger, complete documentary proof may retain the FI. A
    // shared highest priority is still an ambiguity; no opaque key, amount,
    // document count or source order breaks that tie. This also leaves every
    // lower-priority claim review-only, so no selected output can reuse FI.
    const highestPriority = Math.max(...claims.map(documentaryPriority))
    const highest = claims.filter(candidate => documentaryPriority(candidate) === highestPriority)
    if (highest.length !== 1) {
      for (const candidate of claims) conflictingExact.add(candidate)
      continue
    }
    for (const candidate of claims) {
      if (candidate !== highest[0]) conflictingExact.add(candidate)
    }
  }
  for (const candidate of conflictingExact) addReview(candidate, ['G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS'])

  const selected: CollectionReservationSelection[] = []
  for (const candidate of nonTiedExact) {
    if (invalidActiveReservation || conflictingExact.has(candidate)) continue
    const reservationSets = candidate.composition.map(line => activeReservations.get(line.documentKey) ?? [])
    const reservationCount = reservationSets.reduce((total, entries) => total + entries.length, 0)
    const allOwnedByCandidate = reservationSets.length > 0
      && reservationSets.every(entries => entries.length === 1 && entries[0].proposalKey === candidate.proposalKey && entries[0].movementKey === candidate.movementKey)
    const noReservations = reservationCount === 0
    if (!noReservations && !allOwnedByCandidate) {
      addReview(candidate, reservationCount < candidate.composition.length ? ['PARTIAL_EXISTING_RESERVATION'] : ['DOCUMENT_ALREADY_RESERVED'])
      continue
    }
    selected.push({
      proposalKey: candidate.proposalKey,
      movementKey: candidate.movementKey,
      quote: 'EXACT',
      documentKeys: candidate.composition.map(line => line.documentKey),
      compositionTotalCents: candidate.compositionTotalCents,
      disposition: allOwnedByCandidate ? 'KEEP' : 'NEW',
    })
  }

  const selectedDocuments = new Set(selected.flatMap(selection => selection.documentKeys))
  for (const candidate of amber) {
    const overlapsExact = candidate.composition.some(line => selectedDocuments.has(line.documentKey))
    addReview(candidate, overlapsExact ? ['AMBER_REVIEW_ONLY', 'AMBER_CANNOT_CONSUME_EXACT'] : ['AMBER_REVIEW_ONLY'])
  }

  const review = [...reviews.values()].sort(outputOrder).map(item => ({ ...item, codes: staticCodes(item.codes) }))
  for (const item of review) issueCodes.push(...item.codes)
  for (const candidate of candidates) if (reusedProposalKeys.has(candidate.proposalKey)) issueCodes.push('G1_PROPOSAL_REUSED_ACROSS_BANK_MOVEMENTS')
  if (conflictingExact.size) issueCodes.push('G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS')

  return {
    selected: selected.sort(outputOrder),
    review,
    preservedProposals: preservedProposals.sort(outputOrder),
    ignoredIssuedMirrors,
    preservedReservationCount,
    issueCodes: staticCodes(issueCodes),
  }
}
