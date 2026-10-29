/**
 * Batería global G1–G6 de Conciliar.
 *
 * Este módulo es deliberadamente puro: recibe una proyección ya leída y sólo
 * produce códigos estáticos. No abre Prisma, no lee process.env y no conoce
 * IDs, importes ni referencias productivas. El colector opcional al final es
 * una frontera genérica, explícitamente staging/read-only, para el runner.
 */

/** Must remain equal to the four persisted Conciliar tabs. */
export const GLOBAL_TABS = ['COBROS', 'EMITIDAS', 'PAGOS', 'RECIBIDAS'] as const
export const GLOBAL_COLORS = ['VERDE', 'AMBAR', 'ROJO'] as const

export type GlobalTab = typeof GLOBAL_TABS[number]
export type GlobalColor = typeof GLOBAL_COLORS[number]
export type GlobalRuleId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6'

/** Sólo categorías estáticas; nunca se interpolan claves, importes ni textos. */
export type GlobalStaticCode =
  | 'G1_EVIDENCE_MISSING'
  | 'G1_PROPOSAL_SHAPE_INVALID'
  | 'G1_EXACT_QUOTE_INVALID'
  | 'G1_AMBER_QUOTE_INVALID'
  | 'G1_PROPOSAL_REUSED_ACROSS_BANK_MOVEMENTS'
  | 'G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS'
  | 'G1_RESERVATION_PROOF_INVALID'
  | 'G1_REVIEW_PROOF_INVALID'
  | 'G1_RESERVATION_EVIDENCE_INVALID'
  | 'G2_EVIDENCE_MISSING'
  | 'G2_CONFIRMED_BANK_MOVEMENT_VISIBLE'
  | 'G2_ACTIVE_SETTLED_ISSUED_VISIBLE'
  | 'G2_SETTLEMENT_STATE_UNKNOWN'
  | 'G3_EVIDENCE_MISSING'
  | 'G3_INVALID_CITATION_USED'
  | 'G3_EXTERNAL_REFERENCE_BLOCKED_OWN_REFERENCE'
  | 'G3_REFERENCE_EVIDENCE_SHAPE_INVALID'
  | 'G4_EVIDENCE_MISSING'
  | 'G4_INCOMPLETE_PAGINATION'
  | 'G4_TAB_COLOR_MISSING'
  | 'G4_DUPLICATE_TAB_COLOR'
  | 'G4_NON_INTEGER_TOTAL'
  | 'G4_GROUP_LABEL_NOT_CANONICAL'
  | 'G4_TOTAL_DOES_NOT_EQUAL_GROUPS'
  | 'G5_EVIDENCE_MISSING'
  | 'G5_PROTECTED_CLASS_MISSING'
  | 'G5_OWN_TRANSFER_REQUESTS_INVOICE'
  | 'G5_BANK_FEE_REQUESTS_INVOICE'
  | 'G5_PAYROLL_REQUESTS_INVOICE'
  | 'G5_PAYROLL_REQUEST_INVALID'
  | 'G6_EVIDENCE_MISSING'
  | 'G6_GREEN_CONFIRMING_EVIDENCE_MISSING'
  | 'G6_LEGACY_OR_NONCURRENT_EVIDENCE'
  | 'G6_UNCOMMITTED_SOURCE'
  | 'G6_DOCUMENT_COMPOSITION_INVALID'
  | 'G6_CENTS_DO_NOT_CLOSE'
  | 'G6_LIQUIDATION_DATE_INCOHERENT'

export type GlobalRuleResult = Readonly<{
  id: GlobalRuleId
  passed: boolean
  codes: readonly GlobalStaticCode[]
}>

export type ProposalQuote = 'EXACT' | 'AMBER'
export type ProposalProjectionSource = 'BANK_MOVEMENT' | 'ISSUED_PROJECTION'
export type GlobalCollectionAssignment = 'RESERVED' | 'REVIEW'

/** A read-only proof from one persisted current Conciliar row, never a flag from UI. */
export type GlobalCollectionProjectionProof = Readonly<{
  proposalKey: string
  movementKey: string
  color: GlobalColor
  seleccionable: boolean
}>

/**
 * Opaque keys are local, one-run tokens supplied by the reader. They must never
 * be logged by this evaluator. `composition` mirrors the proposal JSON rather
 * than relying on a presentation string.
 */
export type GlobalProposalEvidence = Readonly<{
  proposalKey: string
  source: ProposalProjectionSource
  quote: ProposalQuote
  /** RESERVED owns G1 capacity; REVIEW preserves the real proposal without allocating FI. */
  assignment: GlobalCollectionAssignment
  /**
   * The source exists in the current proposal generation but has no persisted
   * Conciliar projection row. It is never capacity or a synthetic UI review:
   * G1 still fails closed because an amber projection proof is absent.
   */
  sourceOnly: boolean
  /** Must identify the same proposal and bank movement in the current projection. */
  projectionProof: GlobalCollectionProjectionProof | null
  quotedAmountCents: number
  composition: readonly Readonly<{ documentKey: string; amountCents: number }>[]
}>

/** Current B4/B7 documentary capacity observed by the adapter, never synthesized. */
export type GlobalCollectionDocumentReservation = Readonly<{
  documentKey: string
  proposalKey: string
  movementKey: string
  status: 'CONFIRMED'
}>

/**
 * Completeness evidence for the current raw collection-source population.
 *
 * A `NOT_OFFERED` source can be a legacy/orphan proposal or a current review,
 * but it is not a Conciliar reservation and therefore cannot consume G1
 * capacity. The adapter obtains this from a complete read of both the current
 * generation and the persisted projection after running the classifier.
 */
export type GlobalCollectionSourcePopulation = Readonly<{
  allCurrentSourcesRead: boolean
  allCurrentProjectionsRead: boolean
  classifierExecuted: boolean
  sources: readonly Readonly<{
    sourceId: string
    movementKey: string
    status: 'OFFERED' | 'NOT_OFFERED'
  }>[]
}>

export type GlobalReconciliationStatus =
  | 'PENDING'
  | 'B4_CONFIRMED'
  | 'COLLECTION_SETTLED'
  | 'NOT_APPLICABLE'
  | 'UNKNOWN'

export type GlobalEntityKind = 'BANK_MOVEMENT' | 'ISSUED_INVOICE' | 'OTHER'
export type GlobalProtectedKind = 'OWN_TRANSFER' | 'BANK_FEE' | 'PAYROLL' | 'NONE'
export type GlobalAction = 'NONE' | 'REQUEST_INVOICE' | 'REQUEST_PAYROLL' | 'OTHER'
export type GlobalRequestReason = 'NONE' | 'MISSING_INVOICE' | 'MISSING_PAYROLL' | 'DOCUMENT_INVALID' | 'BLANK_DOCUMENT' | 'OTHER'

/**
 * G3 is intentionally fed from the existing own-issued and supplier cores.
 * The runner classifies citations using `extractRefsOwnIssued` and its supplier
 * assignment result; this module verifies that only those classifications were
 * allowed to affect a proposal. It does not invent a series list or parse bank
 * text a second time.
 */
export type GlobalReferenceCitationOrigin = 'OWN_CANONICAL' | 'SUPPLIER_EXACT' | 'EXTERNAL_CUSTOMER' | 'UNVERIFIED'
export type GlobalReferenceEvidence = Readonly<{
  citations: readonly Readonly<{
    origin: GlobalReferenceCitationOrigin
    usedForDecision: boolean
  }>[]
  /** A client/Arrow-like external number was present beside a valid own ref. */
  externalReferencePresent: boolean
  /** Set only by the own-reference core when its canonical own reference fits. */
  ownReferenceCompatible: boolean
  /** Whether reference logic vetoed the otherwise compatible own proposal. */
  ownProposalBlockedByReference: boolean
}>

export type GlobalConfirmingEvidence = Readonly<{
  evidenceSchema: 'C11' | 'C9_LEGACY' | 'NONE'
  /** Current/latest C11 revision from the persisted source, never a cache. */
  liquidationVersion: number | null
  currentVersion: boolean
  persisted: boolean
  sourceCommitState: 'COMMITTED' | 'UNCOMMITTED' | 'UNKNOWN'
  bankDate: string | null
  liquidationDate: string | null
  /** All invoice nominal lines included in the C11 settlement composition. */
  invoiceLineCents: readonly number[]
  interestCents: number
  commissionCents: number
  vatCommissionCents: number
  netCents: number
}>

export type GlobalProjectionRow = Readonly<{
  /** Opaque local token; evaluator never emits it. */
  movementKey: string
  tab: GlobalTab
  visible: boolean
  entityKind: GlobalEntityKind
  reconciliationStatus: GlobalReconciliationStatus
  /** Required for EMITIDAS: only an active cobro/liquidación hides the invoice. */
  activeCollectionSettlement: boolean | null
  color: GlobalColor
  groupLabel: string | null
  action: GlobalAction
  requestReason: GlobalRequestReason
  amountCents: number
  bankDate: string | null
  protectedKind: GlobalProtectedKind
  /** Persisted current-row flag used to prove a G1 assignment is not synthetic. */
  seleccionable: boolean
  proposals: readonly GlobalProposalEvidence[]
  referenceEvidence: GlobalReferenceEvidence | null
  confirmingEvidence: GlobalConfirmingEvidence | null
}>

export type GlobalTabColorTotal = Readonly<{
  tab: GlobalTab
  color: GlobalColor
  amountCents: number
}>

export type GlobalGroupTotal = Readonly<{
  tab: GlobalTab
  color: GlobalColor
  /** Must already be a canonical label, as enforced by `canonicalGroupLabel`. */
  canonicalGroup: string
  amountCents: number
}>

/** Full aggregation metadata, independently of the current UI page. */
export type GlobalTotalsEvidence = Readonly<{
  allPagesRead: boolean
  totalVisibleRows: number
  rowsRead: number
  pageSize: number
  pagesRead: number
  tabColorTotals: readonly GlobalTabColorTotal[]
  groupTotals: readonly GlobalGroupTotal[]
}>

export type GlobalRegressionDataset = Readonly<{
  rows: readonly GlobalProjectionRow[]
  /** Complete current B4/B7 read; an empty array is valid but null is not evidence. */
  collectionReservations: readonly GlobalCollectionDocumentReservation[] | null
  /**
   * Complete classified current source read; source-only records remain
   * coverage, never offers. It is required by the release adapter. Optional
   * only to retain pre-existing pure fixtures which do not model raw sources.
   */
  collectionSourcePopulation?: GlobalCollectionSourcePopulation | null
  totals: GlobalTotalsEvidence | null
}>

export type GlobalRegressionResult = Readonly<{
  results: readonly GlobalRuleResult[]
  /** Aggregate observation counts only; no keys, amounts, dates or references. */
  coverageCounts: Readonly<Record<GlobalRuleId, number>>
}>

const MAX_SAFE_CENTS = 2_147_483_647
const safeCents = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= MAX_SAFE_CENTS
const positiveSafeCents = (value: unknown): value is number => safeCents(value) && value > 0
const staticCodes = (codes: readonly GlobalStaticCode[]): readonly GlobalStaticCode[] => [...new Set(codes)].sort()
const result = (id: GlobalRuleId, codes: readonly GlobalStaticCode[]): GlobalRuleResult => ({ id, passed: codes.length === 0, codes: staticCodes(codes) })
const hasTab = (value: unknown): value is GlobalTab => (GLOBAL_TABS as readonly string[]).includes(String(value))
const hasColor = (value: unknown): value is GlobalColor => (GLOBAL_COLORS as readonly string[]).includes(String(value))

/**
 * Canonical labels prevent a spelling/accent variation from creating a hidden
 * second total. The reader must either supply this exact output or a label that
 * normalizes to it. Unknown labels are rejected rather than guessed.
 */
export function canonicalGroupLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('es-ES')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!normalized || normalized.length > 80) return null
  if (['TRASPASOS_PROPIOS', 'GASTOS_BANCO', 'NOMINAS', 'CONFIRMING', 'REMESAS', 'CLIENTES', 'PROVEEDORES', 'TARJETA', 'IMPUESTOS', 'PRESTAMOS', 'DEVOLUCIONES', 'OTROS'].includes(normalized)) return normalized
  if (/^(?:TRASPASOS?|TRASPASOS?_PROPIOS|TRASPASOS?_ENTRE_CUENTAS_PROPIAS|TRANSFERENCIAS?_PROPIAS?)$/.test(normalized)) return 'TRASPASOS_PROPIOS'
  if (/^BANCO$/.test(normalized)) return 'GASTOS_BANCO'
  if (/^(?:GASTOS?_DEL?_BANCO|COMISION(?:ES)?_BANCARIAS?)$/.test(normalized)) return 'GASTOS_BANCO'
  if (/^NOMINAS?$/.test(normalized)) return 'NOMINAS'
  if (/^CONFIRMING$/.test(normalized)) return 'CONFIRMING'
  if (/^REMESAS?$/.test(normalized)) return 'REMESAS'
  if (/^(?:FACTURAS?_EMITIDAS?|CLIENTES?)$/.test(normalized)) return 'CLIENTES'
  if (/^(?:FACTURAS?_RECIBIDAS?|PROVEEDORES?)$/.test(normalized)) return 'PROVEEDORES'
  if (/^TARJETAS?$/.test(normalized)) return 'TARJETA'
  if (/^IMPUESTOS?$/.test(normalized)) return 'IMPUESTOS'
  if (/^(?:PRESTAMOS?|LEASING)$/.test(normalized)) return 'PRESTAMOS'
  if (/^DEVOLUCIONES?$/.test(normalized)) return 'DEVOLUCIONES'
  if (/^(?:SIN_GRUPO|OTROS?)$/.test(normalized)) return 'OTROS'
  return null
}

function sumCents(values: readonly number[]): number | null {
  let total = 0
  for (const value of values) {
    if (!safeCents(value)) return null
    total += value
    if (!safeCents(total)) return null
  }
  return total
}

function civilDay(value: string | null): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? Math.floor(date.getTime() / 86_400_000)
    : null
}

function evaluateG1(dataset: GlobalRegressionDataset): { result: GlobalRuleResult; coverage: number } {
  const codes: GlobalStaticCode[] = []
  const rows = dataset.rows
  const bankProposals = rows.flatMap(row => row.proposals
    .filter(proposal => proposal.source === 'BANK_MOVEMENT')
    .map(proposal => ({ row, proposal })))
  // G1 in the approved battery is literal: one issued invoice must not be
  // offered to two bank movements at once. Only a current VERDE+seleccionable
  // projection is an offer that can reserve FI capacity. AMBAR/ROJO reviews,
  // and raw source records with no projection at all, remain observable in the
  // population below but cannot be treated as offers by this predicate.
  const offered = bankProposals.filter(({ row, proposal }) => row.color === 'VERDE' && row.seleccionable === true)
  const population = dataset.collectionSourcePopulation
  const populationSupplied = population !== undefined
  const sourceById = new Map<string, Readonly<{ sourceId: string; movementKey: string; status: 'OFFERED' | 'NOT_OFFERED' }>>()
  if (populationSupplied && (population === null || population.allCurrentSourcesRead !== true
    || population.allCurrentProjectionsRead !== true || population.classifierExecuted !== true
    || !Array.isArray(population.sources))) {
    codes.push('G1_EVIDENCE_MISSING')
  } else if (populationSupplied && population !== null) {
    for (const source of population.sources) {
      if (typeof source.sourceId !== 'string' || !source.sourceId || typeof source.movementKey !== 'string' || !source.movementKey
        || !['OFFERED', 'NOT_OFFERED'].includes(source.status) || sourceById.has(source.sourceId)) {
        codes.push('G1_EVIDENCE_MISSING')
        continue
      }
      sourceById.set(source.sourceId, source)
    }
  }
  // A complete source read with no reservation cannot establish the intended
  // green path; reviews and source-only records never satisfy this evidence.
  if (!offered.length) codes.push('G1_EVIDENCE_MISSING')

  const proofMatchesRow = (row: GlobalProjectionRow, proposal: GlobalProposalEvidence): boolean => {
    const proof = proposal.projectionProof
    return proof !== null
      && proof.proposalKey === proposal.proposalKey
      && proof.movementKey === row.movementKey
      && proof.color === row.color
      && proof.seleccionable === row.seleccionable
  }

  const proposalMovements = new Map<string, Set<string>>()
  const reservedDocumentMovements = new Map<string, Set<string>>()
  const offeredKeys = new Set<string>()
  for (const { row, proposal } of offered) {
    const source = sourceById.get(proposal.proposalKey)
    const sourceMatchesOffer = !populationSupplied || (source?.movementKey === row.movementKey && source.status === 'OFFERED')
    if (proposal.sourceOnly !== false || proposal.assignment !== 'RESERVED' || proposal.quote !== 'EXACT'
      || !proofMatchesRow(row, proposal) || proposal.projectionProof?.color !== 'VERDE'
      || proposal.projectionProof.seleccionable !== true || !sourceMatchesOffer) {
      codes.push('G1_RESERVATION_PROOF_INVALID')
    }
    offeredKeys.add(`${proposal.proposalKey}\u0000${row.movementKey}`)
    const shapeValid = typeof proposal.proposalKey === 'string' && proposal.proposalKey.length > 0
      && safeCents(proposal.quotedAmountCents)
      && Array.isArray(proposal.composition) && proposal.composition.length > 0
      && typeof row.movementKey === 'string' && row.movementKey.length > 0
    const compositionTotal = sumCents(proposal.composition.map(item => item.amountCents))
    const compositionValid = proposal.composition.every(item => typeof item.documentKey === 'string' && item.documentKey.length > 0 && safeCents(item.amountCents) && item.amountCents !== 0)
    if (!shapeValid || !compositionValid || compositionTotal === null) {
      codes.push('G1_PROPOSAL_SHAPE_INVALID')
      continue
    }
    if (compositionTotal !== row.amountCents || proposal.quotedAmountCents !== row.amountCents) codes.push('G1_EXACT_QUOTE_INVALID')
    const movementSet = proposalMovements.get(proposal.proposalKey) ?? new Set<string>()
    movementSet.add(row.movementKey)
    proposalMovements.set(proposal.proposalKey, movementSet)
    for (const item of proposal.composition) {
      const documentSet = reservedDocumentMovements.get(item.documentKey) ?? new Set<string>()
      documentSet.add(row.movementKey)
      reservedDocumentMovements.set(item.documentKey, documentSet)
    }
  }
  if ([...proposalMovements.values()].some(movements => movements.size > 1)) codes.push('G1_PROPOSAL_REUSED_ACROSS_BANK_MOVEMENTS')
  if ([...reservedDocumentMovements.values()].some(movements => movements.size > 1)) codes.push('G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS')
  if (populationSupplied && population !== null && population.allCurrentSourcesRead === true && population.allCurrentProjectionsRead === true
    && population.classifierExecuted === true) {
    for (const source of sourceById.values()) {
      const key = `${source.sourceId}\u0000${source.movementKey}`
      if ((source.status === 'OFFERED') !== offeredKeys.has(key)) codes.push('G1_RESERVATION_PROOF_INVALID')
    }
  }
  // Historical pure fixtures predate the complete raw-source reader. Keep their
  // old review-proof assertions local to that test-only omission; the release
  // adapter always supplies `collectionSourcePopulation`, so real source-only
  // records are classified by persisted absence instead of being fake reviews.
  if (!populationSupplied) for (const { row, proposal } of bankProposals) {
    if (proposal.assignment === 'RESERVED') {
      if (proposal.quote !== 'EXACT' || !proofMatchesRow(row, proposal)
        || proposal.projectionProof?.color !== 'VERDE' || proposal.projectionProof.seleccionable !== true) {
        codes.push('G1_RESERVATION_PROOF_INVALID')
      }
    } else if (proposal.assignment === 'REVIEW') {
      if (!proofMatchesRow(row, proposal)
        || !['AMBAR', 'ROJO'].includes(String(proposal.projectionProof?.color))
        || proposal.projectionProof?.seleccionable !== false) {
        codes.push('G1_REVIEW_PROOF_INVALID')
      }
    } else {
      codes.push('G1_PROPOSAL_SHAPE_INVALID')
    }
  }

  // Current B4/B7 capacity is an observation, never a fabricated proposal. It
  // may keep a same-owner selection, but a malformed/duplicated owner record
  // cannot be silently ignored while approving a fresh green reservation.
  const currentReservations = dataset.collectionReservations
  if (currentReservations === null) {
    codes.push('G1_RESERVATION_EVIDENCE_INVALID')
  } else {
    const byDocument = new Map<string, Set<string>>()
    for (const reservation of currentReservations) {
      if (reservation.status !== 'CONFIRMED' || typeof reservation.documentKey !== 'string' || !reservation.documentKey
        || typeof reservation.proposalKey !== 'string' || !reservation.proposalKey
        || typeof reservation.movementKey !== 'string' || !reservation.movementKey) {
        codes.push('G1_RESERVATION_EVIDENCE_INVALID')
        continue
      }
      const owners = byDocument.get(reservation.documentKey) ?? new Set<string>()
      owners.add(`${reservation.proposalKey}\u0000${reservation.movementKey}`)
      byDocument.set(reservation.documentKey, owners)
    }
    if ([...byDocument.values()].some(owners => owners.size > 1)) codes.push('G1_RESERVATION_EVIDENCE_INVALID')
    for (const { row, proposal } of offered) for (const line of proposal.composition) {
      const owners = byDocument.get(line.documentKey)
      // Only a current offered reservation consumes FI capacity. A legacy raw
      // proposal without a projection is not allowed to claim around B4/B7,
      // but it also cannot turn an unrelated offered reservation into a review.
      if (owners && !owners.has(`${proposal.proposalKey}\u0000${row.movementKey}`)) codes.push('G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS')
    }
  }
  // EMITIDAS copies are intentionally excluded: the same proposal may be shown
  // there once per issued invoice without becoming a second bank assignment.
  return { result: result('G1', codes), coverage: population?.sources.length ?? offered.length }
}

function evaluateG2(rows: readonly GlobalProjectionRow[]): { result: GlobalRuleResult; coverage: number } {
  const codes: GlobalStaticCode[] = []
  const relevant = rows.filter(row => row.reconciliationStatus === 'B4_CONFIRMED'
    || (row.entityKind === 'ISSUED_INVOICE' && row.reconciliationStatus === 'COLLECTION_SETTLED'))
  if (!relevant.length) codes.push('G2_EVIDENCE_MISSING')
  for (const row of relevant) {
    if (row.reconciliationStatus === 'B4_CONFIRMED' && row.visible) codes.push('G2_CONFIRMED_BANK_MOVEMENT_VISIBLE')
    if (row.entityKind === 'ISSUED_INVOICE' && row.reconciliationStatus === 'COLLECTION_SETTLED') {
      if (row.activeCollectionSettlement === null) codes.push('G2_SETTLEMENT_STATE_UNKNOWN')
      if (row.activeCollectionSettlement === true && row.visible) codes.push('G2_ACTIVE_SETTLED_ISSUED_VISIBLE')
    }
  }
  return { result: result('G2', codes), coverage: relevant.length }
}

function evaluateG3(rows: readonly GlobalProjectionRow[]): { result: GlobalRuleResult; coverage: number } {
  const codes: GlobalStaticCode[] = []
  const evidence = rows.map(row => row.referenceEvidence).filter((item): item is GlobalReferenceEvidence => item !== null)
  const allCitations = evidence.flatMap(item => item.citations)
  const own = allCitations.filter(item => item.origin === 'OWN_CANONICAL')
  const supplier = allCitations.filter(item => item.origin === 'SUPPLIER_EXACT')
  const externalWithOwn = evidence.filter(item => item.externalReferencePresent && item.ownReferenceCompatible)
  if (!evidence.length || !own.length || !supplier.length || !externalWithOwn.length) codes.push('G3_EVIDENCE_MISSING')
  for (const item of evidence) {
    if (!Array.isArray(item.citations) || item.citations.some(citation => !['OWN_CANONICAL', 'SUPPLIER_EXACT', 'EXTERNAL_CUSTOMER', 'UNVERIFIED'].includes(citation.origin) || typeof citation.usedForDecision !== 'boolean')) {
      codes.push('G3_REFERENCE_EVIDENCE_SHAPE_INVALID')
      continue
    }
    if (item.citations.some(citation => citation.usedForDecision && citation.origin !== 'OWN_CANONICAL' && citation.origin !== 'SUPPLIER_EXACT')) codes.push('G3_INVALID_CITATION_USED')
    if (item.externalReferencePresent && item.ownReferenceCompatible && item.ownProposalBlockedByReference) codes.push('G3_EXTERNAL_REFERENCE_BLOCKED_OWN_REFERENCE')
  }
  return { result: result('G3', codes), coverage: evidence.length }
}

function evaluateG4(totals: GlobalTotalsEvidence | null): { result: GlobalRuleResult; coverage: number } {
  const codes: GlobalStaticCode[] = []
  if (!totals) return { result: result('G4', ['G4_EVIDENCE_MISSING']), coverage: 0 }
  const paginationIntegers = Number.isSafeInteger(totals.totalVisibleRows) && totals.totalVisibleRows >= 0
    && Number.isSafeInteger(totals.rowsRead) && totals.rowsRead >= 0
    && Number.isSafeInteger(totals.pageSize) && totals.pageSize > 0
    && Number.isSafeInteger(totals.pagesRead) && totals.pagesRead >= 0
  const expectedPages = paginationIntegers && totals.totalVisibleRows > 0 ? Math.ceil(totals.totalVisibleRows / totals.pageSize) : 0
  if (!paginationIntegers || totals.allPagesRead !== true || totals.rowsRead !== totals.totalVisibleRows || totals.pagesRead !== expectedPages) codes.push('G4_INCOMPLETE_PAGINATION')

  const totalsByKey = new Map<string, number>()
  for (const item of totals.tabColorTotals) {
    if (!hasTab(item.tab) || !hasColor(item.color) || !safeCents(item.amountCents)) {
      codes.push('G4_NON_INTEGER_TOTAL')
      continue
    }
    const key = `${item.tab}:${item.color}`
    if (totalsByKey.has(key)) codes.push('G4_DUPLICATE_TAB_COLOR')
    else totalsByKey.set(key, item.amountCents)
  }
  for (const tab of GLOBAL_TABS) for (const color of GLOBAL_COLORS) if (!totalsByKey.has(`${tab}:${color}`)) codes.push('G4_TAB_COLOR_MISSING')

  const groupByKey = new Map<string, number>()
  for (const item of totals.groupTotals) {
    if (!hasTab(item.tab) || !hasColor(item.color) || !safeCents(item.amountCents)) {
      codes.push('G4_NON_INTEGER_TOTAL')
      continue
    }
    if (canonicalGroupLabel(item.canonicalGroup) !== item.canonicalGroup) {
      codes.push('G4_GROUP_LABEL_NOT_CANONICAL')
      continue
    }
    const key = `${item.tab}:${item.color}`
    const prior = groupByKey.get(key) ?? 0
    const next = sumCents([prior, item.amountCents])
    if (next === null) codes.push('G4_NON_INTEGER_TOTAL')
    else groupByKey.set(key, next)
  }
  for (const [key, amount] of totalsByKey) if ((groupByKey.get(key) ?? 0) !== amount) codes.push('G4_TOTAL_DOES_NOT_EQUAL_GROUPS')
  const coverage = totalsByKey.size
  if (!coverage) codes.push('G4_EVIDENCE_MISSING')
  return { result: result('G4', codes), coverage }
}

function evaluateG5(rows: readonly GlobalProjectionRow[]): { result: GlobalRuleResult; coverage: number } {
  const codes: GlobalStaticCode[] = []
  const protectedRows = rows.filter(row => row.protectedKind !== 'NONE')
  const kinds = new Set(protectedRows.map(row => row.protectedKind))
  if (!protectedRows.length) codes.push('G5_EVIDENCE_MISSING')
  if (!kinds.has('OWN_TRANSFER') || !kinds.has('BANK_FEE') || !kinds.has('PAYROLL')) codes.push('G5_PROTECTED_CLASS_MISSING')
  for (const row of protectedRows) {
    const invoiceRequest = row.action === 'REQUEST_INVOICE' || row.requestReason === 'MISSING_INVOICE'
    if (row.protectedKind === 'OWN_TRANSFER' && invoiceRequest) codes.push('G5_OWN_TRANSFER_REQUESTS_INVOICE')
    if (row.protectedKind === 'BANK_FEE' && invoiceRequest) codes.push('G5_BANK_FEE_REQUESTS_INVOICE')
    if (row.protectedKind === 'PAYROLL') {
      if (invoiceRequest) codes.push('G5_PAYROLL_REQUESTS_INVOICE')
      if (row.action === 'REQUEST_PAYROLL' && row.requestReason !== 'MISSING_PAYROLL') codes.push('G5_PAYROLL_REQUEST_INVALID')
      if (row.requestReason === 'DOCUMENT_INVALID' || row.requestReason === 'BLANK_DOCUMENT') codes.push('G5_PAYROLL_REQUEST_INVALID')
    }
  }
  return { result: result('G5', codes), coverage: protectedRows.length }
}

function validConfirmingComposition(evidence: GlobalConfirmingEvidence): boolean {
  if (!evidence.invoiceLineCents.length || !evidence.invoiceLineCents.every(positiveSafeCents)
    || !safeCents(evidence.interestCents) || evidence.interestCents < 0
    || !safeCents(evidence.commissionCents) || evidence.commissionCents < 0
    || !safeCents(evidence.vatCommissionCents) || evidence.vatCommissionCents < 0
    || !positiveSafeCents(evidence.netCents)) return false
  const nominal = sumCents(evidence.invoiceLineCents)
  const deductions = sumCents([evidence.interestCents, evidence.commissionCents, evidence.vatCommissionCents])
  return nominal !== null && deductions !== null && nominal - deductions === evidence.netCents
}

/**
 * Same civil-date window as the persisted C11 candidate route: settlement on
 * the bank day or 1–4 prior civil days. It rejects a settlement after its
 * deposit but does not compare issuer bank against deposit bank.
 */
export function isC11LiquidationDateCoherent(liquidationDate: string | null, bankDate: string | null): boolean {
  const settlementDay = civilDay(liquidationDate)
  const bankDay = civilDay(bankDate)
  return settlementDay !== null && bankDay !== null && bankDay >= settlementDay && bankDay - settlementDay <= 4
}

function evaluateG6(rows: readonly GlobalProjectionRow[]): { result: GlobalRuleResult; coverage: number } {
  const codes: GlobalStaticCode[] = []
  const confirmingRows = rows.filter(row => row.confirmingEvidence !== null)
  const green = confirmingRows.filter(row => row.color === 'VERDE')
  if (!confirmingRows.length) codes.push('G6_EVIDENCE_MISSING')
  if (!green.length) codes.push('G6_GREEN_CONFIRMING_EVIDENCE_MISSING')
  for (const row of green) {
    const evidence = row.confirmingEvidence
    if (!evidence) {
      codes.push('G6_GREEN_CONFIRMING_EVIDENCE_MISSING')
      continue
    }
    if (evidence.evidenceSchema !== 'C11' || !Number.isSafeInteger(evidence.liquidationVersion) || evidence.liquidationVersion < 1 || evidence.currentVersion !== true || evidence.persisted !== true) codes.push('G6_LEGACY_OR_NONCURRENT_EVIDENCE')
    if (evidence.sourceCommitState !== 'COMMITTED') codes.push('G6_UNCOMMITTED_SOURCE')
    if (!validConfirmingComposition(evidence)) codes.push('G6_DOCUMENT_COMPOSITION_INVALID')
    else if (evidence.netCents !== row.amountCents) codes.push('G6_CENTS_DO_NOT_CLOSE')
    if (!isC11LiquidationDateCoherent(evidence.liquidationDate, evidence.bankDate ?? row.bankDate)) codes.push('G6_LIQUIDATION_DATE_INCOHERENT')
  }
  return { result: result('G6', codes), coverage: green.length }
}

/** Evaluates all global invariants without I/O or any production-data output. */
export function evaluateGlobalRegression(dataset: GlobalRegressionDataset): GlobalRegressionResult {
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : []
  const g1 = evaluateG1({ ...dataset, rows })
  const g2 = evaluateG2(rows)
  const g3 = evaluateG3(rows)
  const g4 = evaluateG4(dataset?.totals ?? null)
  const g5 = evaluateG5(rows)
  const g6 = evaluateG6(rows)
  return {
    results: [g1.result, g2.result, g3.result, g4.result, g5.result, g6.result],
    coverageCounts: { G1: g1.coverage, G2: g2.coverage, G3: g3.coverage, G4: g4.coverage, G5: g5.coverage, G6: g6.coverage },
  }
}

/**
 * Optional, bounded reader for a parent-owned staging runner. It has no DB
 * dependency and cannot select a production client itself. The caller must
 * supply a client already pinned to the isolated staging role and a transaction
 * implementation which has issued BEGIN READ ONLY (or its driver equivalent).
 */
export type StagingReadonlyAuthorization = Readonly<{
  environment: 'STAGING'
  readonlyTransaction: true
  productionReadDelegated: false
}>

export type BoundedReadonlyQuery = Readonly<{
  sql: string
  params?: readonly (string | number | boolean | null)[]
}>

export type StagingReadonlyQueryClient = Readonly<{
  environment: 'STAGING'
  role: 'io_staging_finanzas'
  withReadOnlyTransaction: <T>(callback: (tx: Pick<StagingReadonlyQueryClient, 'query'>) => Promise<T>) => Promise<T>
  query: <T = unknown>(sql: string, params?: readonly (string | number | boolean | null)[]) => Promise<readonly T[]>
}>

const MAX_COLLECTOR_QUERIES = 12
const MAX_COLLECTOR_SQL = 30_000
const WRITE_OR_LOCK_SQL = /\b(?:INSERT|UPDATE|DELETE|MERGE|UPSERT|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|VACUUM|ANALYZE|LOCK|FOR\s+(?:UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE))\b/i

function isBoundedReadonlyQuery(query: BoundedReadonlyQuery): boolean {
  if (!query || typeof query.sql !== 'string' || query.sql.length < 1 || query.sql.length > MAX_COLLECTOR_SQL) return false
  const sql = query.sql.trim()
  if (!/^(?:SELECT|WITH)\b/i.test(sql) || /;|--|\/\*/.test(sql) || WRITE_OR_LOCK_SQL.test(sql)) return false
  const limits = [...sql.matchAll(/\bLIMIT\s+(\d+)\b/ig)].map(match => Number(match[1]))
  return limits.length > 0 && limits.every(limit => Number.isSafeInteger(limit) && limit >= 1 && limit <= 50_000)
}

/**
 * Executes only caller-provided, bounded read queries in the supplied isolated
 * staging transaction. `map` receives anonymous result sets and may construct
 * `GlobalRegressionDataset`; it receives no DB client and therefore cannot run
 * an additional query.
 */
export async function collectStagingReadonlyGlobalDataset<T>(
  client: StagingReadonlyQueryClient,
  authorization: StagingReadonlyAuthorization,
  queries: readonly BoundedReadonlyQuery[],
  map: (resultSets: readonly (readonly unknown[])[]) => T,
): Promise<T> {
  if (!client || client.environment !== 'STAGING' || client.role !== 'io_staging_finanzas'
    || authorization?.environment !== 'STAGING' || authorization.readonlyTransaction !== true || authorization.productionReadDelegated !== false
    || !Array.isArray(queries) || queries.length < 1 || queries.length > MAX_COLLECTOR_QUERIES || queries.some(query => !isBoundedReadonlyQuery(query))) {
    throw new Error('GLOBAL_REGRESSION_STAGING_READONLY_REQUIRED')
  }
  return client.withReadOnlyTransaction(async tx => {
    const resultSets: (readonly unknown[])[] = []
    for (const query of queries) resultSets.push(await tx.query(query.sql, query.params))
    return map(resultSets)
  })
}
