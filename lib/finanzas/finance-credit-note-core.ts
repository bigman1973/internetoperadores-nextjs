/**
 * Bloque 3c — rectificativas.
 *
 * Núcleo puro: no importa Prisma, no abre transacciones, no crea B4/banco y no
 * consulta campos ISP de pagada/cobrada. Sólo acepta documentos que ya llegan
 * del lector canónico y enlaces de versiones explícitos.
 */

export type CreditNoteDocumentKind = 'EMITIDA' | 'RECIBIDA'
export type CreditNotePartyRole = 'CLIENTE' | 'PROVEEDOR'
export type CreditNoteSettlementState = 'PENDIENTE' | 'PARCIAL' | 'CERRADA' | 'REVISION'

export interface CanonicalCreditNoteDocument {
  /** Identificador opaco de la fila canónica, nunca inferido por importe. */
  documentId: string
  /** Identidad canónica estable para deduplicar copias/versiones del documento. */
  canonicalIdentity: string
  /** Versión de contenido actualmente vigente, expuesta por el bloque de versiones. */
  currentVersionId: string
  kind: CreditNoteDocumentKind
  partyRole: CreditNotePartyRole
  /** Referencia literal de documento; no se recorta ni normaliza al comparar. */
  documentReference: string
  /** Referencia literal de la original escrita en una rectificativa. */
  referencedOriginalReference: string | null
  /** CIF/NIF/VAT ya canónico en el lector de origen; igualdad literal requerida. */
  counterpartyFiscalIdentity: string
  /** Cliente/proveedor ya canónico en el lector de origen; igualdad literal requerida. */
  counterpartyCanonicalIdentity: string
  /** Importe firmado en céntimos de la fuente canónica. */
  signedTotalCents: number | null
  /** Sin conversión implícita: la moneda debe coincidir exactamente. */
  currencyCode: string | null
  /** La fila debe ser la canónica actual y no una copia/histórico. */
  canonicalCurrent: boolean
}

/**
 * Relación persistida por el bloque de versiones. El core exige todas las
 * redundancias para detectar enlaces obsoletos o manipulados antes de restar.
 */
export interface CreditNoteVersionLink {
  linkId: string
  originalDocumentId: string
  creditNoteDocumentId: string
  originalVersionId: string
  creditNoteVersionId: string
  originalCanonicalIdentity: string
  creditNoteCanonicalIdentity: string
  originalDocumentReference: string
  referencedOriginalReference: string
  counterpartyFiscalIdentity: string
  counterpartyCanonicalIdentity: string
  current: boolean
  deleted: boolean
}

/** Prueba B4 ya leída por el adaptador; este módulo jamás la confirma ni crea. */
export interface CreditNoteB4PaymentEvidence {
  evidenceId: string
  originalDocumentId: string
  signedCents: number | null
  currencyCode: string | null
  active: boolean
  documentActive: boolean
  operationApplied: boolean
  operationReverted: boolean
  movementJustified: boolean
  /** El cierre físico actual de B4 cuadra exactamente, sin diferencias ocultas. */
  physicalClosureExact: boolean
}

export interface CreditNoteCalculationInput {
  originals: readonly CanonicalCreditNoteDocument[]
  creditNotes: readonly CanonicalCreditNoteDocument[]
  versionLinks: readonly CreditNoteVersionLink[]
  b4Payments: readonly CreditNoteB4PaymentEvidence[]
}

export interface CreditNoteSettlement {
  originalDocumentId: string
  kind: CreditNoteDocumentKind
  currencyCode: string | null
  originalCents: number | null
  /** Rectificación orientada con el signo de la original; ej. +2000 en una emitida. */
  validRectificationCents: number | null
  /** Pagos/cobros B4 vigentes, con el mismo signo de la original. */
  validB4PaymentCents: number | null
  /** original − rectificación válida − B4. Null implica revisión, nunca cero fingido. */
  pendingCents: number | null
  state: CreditNoteSettlementState
  reviewReasons: string[]
}

export interface CreditNoteUnlinkedReview {
  linkId: string
  originalDocumentId: string | null
  creditNoteDocumentId: string | null
  reason: string
}

export interface CreditNoteCalculationResult {
  settlements: CreditNoteSettlement[]
  unlinkedReviews: CreditNoteUnlinkedReview[]
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)
const CONTROL = /[\u0000-\u001F\u007F]/

function validOpaque(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 500 && !CONTROL.test(value)
}

function validExactField(value: unknown): value is string {
  return validOpaque(value) && value === value.trim()
}

function validCents(value: unknown, allowZero = false): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && (allowZero || value !== 0)
}

function bigToSafe(value: bigint): number | null {
  return value >= -MAX_SAFE && value <= MAX_SAFE ? Number(value) : null
}

function partyRoleFor(kind: CreditNoteDocumentKind): CreditNotePartyRole {
  return kind === 'EMITIDA' ? 'CLIENTE' : 'PROVEEDOR'
}

function sameDirection(left: number, right: number): boolean {
  return (left > 0 && right > 0) || (left < 0 && right < 0)
}

function sourceDocumentReasons(document: CanonicalCreditNoteDocument, isCreditNote: boolean): string[] {
  const reasons: string[] = []
  if (!validOpaque(document.documentId)) reasons.push('DOCUMENTO_ID_INVALIDO')
  if (!validExactField(document.canonicalIdentity)) reasons.push('IDENTIDAD_CANONICA_INVALIDA')
  if (!validExactField(document.currentVersionId)) reasons.push('VERSION_VIGENTE_INVALIDA')
  if (!validExactField(document.documentReference)) reasons.push('REFERENCIA_DOCUMENTAL_INVALIDA')
  if (!validExactField(document.counterpartyFiscalIdentity)) reasons.push('IDENTIDAD_FISCAL_INVALIDA')
  if (!validExactField(document.counterpartyCanonicalIdentity)) reasons.push('CONTRAPARTE_CANONICA_INVALIDA')
  if (!validExactField(document.currencyCode)) reasons.push('MONEDA_INVALIDA')
  if (!validCents(document.signedTotalCents)) reasons.push('IMPORTE_CENTIMOS_INVALIDO')
  if (document.partyRole !== partyRoleFor(document.kind)) reasons.push('ROL_CONTRAPARTE_INCORRECTO')
  if (document.canonicalCurrent !== true) reasons.push('DOCUMENTO_NO_CANONICO_O_VERSION_NO_VIGENTE')
  if (isCreditNote && !validExactField(document.referencedOriginalReference)) reasons.push('RECTIFICATIVA_SIN_REFERENCIA_ORIGINAL_EXACTA')
  if (!isCreditNote && document.referencedOriginalReference !== null) reasons.push('ORIGINAL_CON_REFERENCIA_RECTIFICATIVA_INESPERADA')
  return reasons
}

function appendReason(target: Map<string, Set<string>>, originalDocumentId: string, reason: string): void {
  const reasons = target.get(originalDocumentId) ?? new Set<string>()
  reasons.add(reason)
  target.set(originalDocumentId, reasons)
}

function exactIdentityKey(document: CanonicalCreditNoteDocument): string {
  return JSON.stringify([
    document.kind,
    document.documentReference,
    document.counterpartyFiscalIdentity,
    document.counterpartyCanonicalIdentity,
    document.currencyCode,
  ])
}

function linkHasExactDocumentIdentity(
  link: CreditNoteVersionLink,
  original: CanonicalCreditNoteDocument,
  credit: CanonicalCreditNoteDocument,
): boolean {
  return link.originalVersionId === original.currentVersionId
    && link.creditNoteVersionId === credit.currentVersionId
    && link.originalCanonicalIdentity === original.canonicalIdentity
    && link.creditNoteCanonicalIdentity === credit.canonicalIdentity
    && link.originalDocumentReference === original.documentReference
    && link.referencedOriginalReference === original.documentReference
    && credit.referencedOriginalReference === original.documentReference
    && link.counterpartyFiscalIdentity === original.counterpartyFiscalIdentity
    && link.counterpartyFiscalIdentity === credit.counterpartyFiscalIdentity
    && link.counterpartyCanonicalIdentity === original.counterpartyCanonicalIdentity
    && link.counterpartyCanonicalIdentity === credit.counterpartyCanonicalIdentity
    && original.kind === credit.kind
    && original.partyRole === credit.partyRole
    && original.currencyCode === credit.currencyCode
}

/**
 * Computes debt pending with signed cents only:
 *   original − rectificación válida − pago/cobro B4 vigente.
 *
 * A relation is never discovered by amount, name similarity or ISP payment state.
 * Any duplicate/version ambiguity, wrong sign, invalid currency, or excess turns
 * the affected original into REVISION and hides monetary output as null.
 */
export function calculateCreditNoteSettlements(input: CreditNoteCalculationInput): CreditNoteCalculationResult {
  const reasonsByOriginal = new Map<string, Set<string>>()
  const unlinkedReviews: CreditNoteUnlinkedReview[] = []
  const originalsById = new Map<string, CanonicalCreditNoteDocument>()
  const creditsById = new Map<string, CanonicalCreditNoteDocument>()
  const creditDocumentIdCounts = new Map<string, number>()
  const creditIdsByCanonicalIdentity = new Map<string, string[]>()

  for (const original of input.originals) {
    if (originalsById.has(original.documentId)) {
      appendReason(reasonsByOriginal, original.documentId, 'ORIGINAL_ID_DUPLICADO')
      continue
    }
    originalsById.set(original.documentId, original)
    for (const reason of sourceDocumentReasons(original, false)) appendReason(reasonsByOriginal, original.documentId, reason)
  }
  for (const credit of input.creditNotes) {
    creditDocumentIdCounts.set(credit.documentId, (creditDocumentIdCounts.get(credit.documentId) ?? 0) + 1)
    if (creditsById.has(credit.documentId)) continue
    creditsById.set(credit.documentId, credit)
    const identities = creditIdsByCanonicalIdentity.get(credit.canonicalIdentity) ?? []
    identities.push(credit.documentId)
    creditIdsByCanonicalIdentity.set(credit.canonicalIdentity, identities)
  }

  // Dos originales con la misma referencia/fiscal/contraparte/moneda son ambiguos
  // incluso si llegaron con IDs distintos: nunca se elige uno por importe.
  const originalsByDocumentaryIdentity = new Map<string, string[]>()
  for (const original of originalsById.values()) {
    const group = originalsByDocumentaryIdentity.get(exactIdentityKey(original)) ?? []
    group.push(original.documentId)
    originalsByDocumentaryIdentity.set(exactIdentityKey(original), group)
  }
  for (const ids of originalsByDocumentaryIdentity.values()) {
    if (ids.length > 1) for (const id of ids) appendReason(reasonsByOriginal, id, 'ORIGINAL_DOCUMENTAL_AMBIGUO')
  }

  const linkIds = new Map<string, CreditNoteVersionLink[]>()
  const linksByCreditDocument = new Map<string, CreditNoteVersionLink[]>()
  const linksByCreditCanonicalIdentity = new Map<string, CreditNoteVersionLink[]>()
  const linksByCreditVersion = new Map<string, CreditNoteVersionLink[]>()
  const validLinksByOriginal = new Map<string, CreditNoteVersionLink[]>()

  for (const link of input.versionLinks) {
    const original = originalsById.get(link.originalDocumentId)
    const credit = creditsById.get(link.creditNoteDocumentId)
    const linkGroup = linkIds.get(link.linkId) ?? []
    linkGroup.push(link)
    linkIds.set(link.linkId, linkGroup)

    if (!original) {
      unlinkedReviews.push({ linkId: validOpaque(link.linkId) ? link.linkId : 'ENLACE_INVALIDO', originalDocumentId: null, creditNoteDocumentId: validOpaque(link.creditNoteDocumentId) ? link.creditNoteDocumentId : null, reason: 'ORIGINAL_NO_CANONICA_O_AUSENTE' })
      continue
    }
    if (!validOpaque(link.linkId) || !validOpaque(link.originalDocumentId) || !validOpaque(link.creditNoteDocumentId)) {
      appendReason(reasonsByOriginal, original.documentId, 'ENLACE_RECTIFICATIVA_INVALIDO')
      continue
    }
    if (!credit) {
      appendReason(reasonsByOriginal, original.documentId, 'RECTIFICATIVA_NO_CANONICA_O_AUSENTE')
      continue
    }
    for (const reason of sourceDocumentReasons(credit, true)) appendReason(reasonsByOriginal, original.documentId, reason)
    if (link.current !== true || link.deleted === true) {
      appendReason(reasonsByOriginal, original.documentId, 'ENLACE_RECTIFICATIVA_NO_VIGENTE_O_BORRADO')
      continue
    }
    if (!linkHasExactDocumentIdentity(link, original, credit)) {
      appendReason(reasonsByOriginal, original.documentId, 'REFERENCIA_FISCAL_CONTRAPARTE_O_IDENTIDAD_NO_COINCIDE_EXACTAMENTE')
      continue
    }
    if (!validCents(original.signedTotalCents) || !validCents(credit.signedTotalCents) || sameDirection(original.signedTotalCents, credit.signedTotalCents)) {
      appendReason(reasonsByOriginal, original.documentId, 'RECTIFICATIVA_CON_SIGNO_INCORRECTO')
      continue
    }
    const byDocument = linksByCreditDocument.get(credit.documentId) ?? []
    byDocument.push(link)
    linksByCreditDocument.set(credit.documentId, byDocument)
    const byCanonical = linksByCreditCanonicalIdentity.get(credit.canonicalIdentity) ?? []
    byCanonical.push(link)
    linksByCreditCanonicalIdentity.set(credit.canonicalIdentity, byCanonical)
    const versionKey = `${credit.documentId}\u0000${credit.currentVersionId}`
    const byVersion = linksByCreditVersion.get(versionKey) ?? []
    byVersion.push(link)
    linksByCreditVersion.set(versionKey, byVersion)
    const valid = validLinksByOriginal.get(original.documentId) ?? []
    valid.push(link)
    validLinksByOriginal.set(original.documentId, valid)
  }

  for (const links of linkIds.values()) {
    if (links.length > 1) for (const link of links) if (originalsById.has(link.originalDocumentId)) appendReason(reasonsByOriginal, link.originalDocumentId, 'ENLACE_RECTIFICATIVA_DUPLICADO')
  }
  for (const groups of [linksByCreditDocument, linksByCreditCanonicalIdentity, linksByCreditVersion]) {
    for (const links of groups.values()) {
      if (links.length > 1) {
        for (const link of links) appendReason(reasonsByOriginal, link.originalDocumentId, 'RECTIFICATIVA_REPETIDA_O_MULTIENLAZADA')
      }
    }
  }
  // The first row must never win when the same source document ID appears twice
  // with potentially divergent metadata or cents. Mark every affected original
  // for review instead of silently using the first row retained in `creditsById`.
  for (const [creditDocumentId, count] of creditDocumentIdCounts) {
    if (count < 2) continue
    for (const link of linksByCreditDocument.get(creditDocumentId) ?? []) {
      appendReason(reasonsByOriginal, link.originalDocumentId, 'RECTIFICATIVA_DOCUMENTO_DUPLICADO')
    }
  }
  // A second current row for the same canonical rectificativa is an identity
  // ambiguity even before it has its own link. Never choose one by total/date
  // or let the first linked copy reduce the original silently.
  for (const [canonicalIdentity, ids] of creditIdsByCanonicalIdentity) {
    if (ids.length < 2) continue
    for (const link of linksByCreditCanonicalIdentity.get(canonicalIdentity) ?? []) {
      appendReason(reasonsByOriginal, link.originalDocumentId, 'RECTIFICATIVA_IDENTIDAD_CANONICA_AMBIGUA')
    }
  }

  const paymentsByOriginal = new Map<string, CreditNoteB4PaymentEvidence[]>()
  const evidenceIds = new Map<string, CreditNoteB4PaymentEvidence[]>()
  for (const payment of input.b4Payments) {
    const original = originalsById.get(payment.originalDocumentId)
    const group = evidenceIds.get(payment.evidenceId) ?? []
    group.push(payment)
    evidenceIds.set(payment.evidenceId, group)
    if (!original) {
      unlinkedReviews.push({ linkId: validOpaque(payment.evidenceId) ? payment.evidenceId : 'B4_INVALIDO', originalDocumentId: null, creditNoteDocumentId: null, reason: 'PAGO_B4_SIN_ORIGINAL_CANONICA' })
      continue
    }
    const currentProof = validOpaque(payment.evidenceId)
      && validCents(payment.signedCents)
      && validExactField(payment.currencyCode)
      && payment.currencyCode === original.currencyCode
      && payment.active && payment.documentActive && payment.operationApplied && !payment.operationReverted
      && payment.movementJustified && payment.physicalClosureExact
    if (!currentProof) {
      appendReason(reasonsByOriginal, original.documentId, 'EVIDENCIA_B4_NO_VIGENTE_O_INEXACTA')
      continue
    }
    if (!sameDirection(original.signedTotalCents!, payment.signedCents!)) {
      appendReason(reasonsByOriginal, original.documentId, 'PAGO_B4_CON_SIGNO_INCORRECTO')
      continue
    }
    const valid = paymentsByOriginal.get(original.documentId) ?? []
    valid.push(payment)
    paymentsByOriginal.set(original.documentId, valid)
  }
  for (const evidences of evidenceIds.values()) {
    if (evidences.length > 1) for (const evidence of evidences) if (originalsById.has(evidence.originalDocumentId)) appendReason(reasonsByOriginal, evidence.originalDocumentId, 'EVIDENCIA_B4_REPETIDA')
  }

  const settlements: CreditNoteSettlement[] = []
  for (const original of originalsById.values()) {
    const reasons = reasonsByOriginal.get(original.documentId) ?? new Set<string>()
    let rectification = BigInt(0)
    for (const link of validLinksByOriginal.get(original.documentId) ?? []) {
      const credit = creditsById.get(link.creditNoteDocumentId)!
      // The validated credit has opposite sign. Negation creates a reduction
      // with the original's sign without using abs() or a currency conversion.
      rectification -= BigInt(credit.signedTotalCents!)
    }
    let paid = BigInt(0)
    for (const payment of paymentsByOriginal.get(original.documentId) ?? []) paid += BigInt(payment.signedCents!)

    const originalCents = validCents(original.signedTotalCents) ? BigInt(original.signedTotalCents) : null
    const rectificationNumber = bigToSafe(rectification)
    const paidNumber = bigToSafe(paid)
    if (originalCents === null || rectificationNumber === null || paidNumber === null) reasons.add('SUMA_CENTIMOS_NO_SEGURA')

    let pending: bigint | null = null
    if (originalCents !== null && reasons.size === 0) {
      const afterRectification = originalCents - rectification
      if (afterRectification !== BigInt(0) && (afterRectification > BigInt(0)) !== (originalCents > BigInt(0))) {
        reasons.add('RECTIFICACION_SUPERA_ORIGINAL')
      } else {
        pending = afterRectification - paid
        if (pending !== BigInt(0) && (pending > BigInt(0)) !== (originalCents > BigInt(0))) reasons.add('PAGO_B4_SUPERA_PENDIENTE')
      }
    }
    const pendingNumber = pending === null ? null : bigToSafe(pending)
    if (pending !== null && pendingNumber === null) reasons.add('PENDIENTE_CENTIMOS_NO_SEGURO')

    const reviewReasons = [...reasons].sort()
    if (reviewReasons.length > 0) {
      settlements.push({
        originalDocumentId: original.documentId, kind: original.kind, currencyCode: original.currencyCode,
        originalCents: original.signedTotalCents, validRectificationCents: null, validB4PaymentCents: null,
        pendingCents: null, state: 'REVISION', reviewReasons,
      })
      continue
    }
    const state: CreditNoteSettlementState = pendingNumber === 0
      ? 'CERRADA'
      : rectification !== BigInt(0) || paid !== BigInt(0) ? 'PARCIAL' : 'PENDIENTE'
    settlements.push({
      originalDocumentId: original.documentId, kind: original.kind, currencyCode: original.currencyCode,
      originalCents: original.signedTotalCents, validRectificationCents: rectificationNumber,
      validB4PaymentCents: paidNumber, pendingCents: pendingNumber, state, reviewReasons: [],
    })
  }

  return { settlements, unlinkedReviews }
}
