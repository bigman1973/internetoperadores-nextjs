import {
  calendarDistanceDays,
  sha256Canonical,
  type EasyAutoMovement,
} from './easy-auto-core'

/**
 * This is a display/review classifier only. It never authorizes a B4 write:
 * `readStrictOwnTransfers` remains the independent historical reader for the
 * already-existing automatic confirmation route.
 */
export type ConciliarTransferReviewMovement = EasyAutoMovement & Readonly<{
  /** A current P1 whose type is not CUENTA_PROPIA. */
  thirdPartyConfirmed: boolean
  /** A current document relation is stronger than a bank-text transfer cue. */
  documentaryLinked: boolean
  /** Exact own-recipient evidence: CUENTA_PROPIA P1, company literal, or registered attested IBAN. */
  ownRecipientExplicit: boolean
}>

export type ConciliarOwnTransferReview = Readonly<{
  kind: 'SIN_PAREJA_VERIFICADA' | 'PAREJAS_VERIFICADAS_AMBIGUAS' | 'PAREJA_UNICA_PENDIENTE_PRUEBA_ESTRICTA'
  movimientoId: string
  movimientoParId?: string
  transferFingerprint?: string
}>

export type ConciliarOwnTransferReviewInput = Readonly<{
  movements: readonly ConciliarTransferReviewMovement[]
  attestedOwnAccountIds: ReadonlySet<string>
}>

function sourceValues(movement: EasyAutoMovement): readonly string[] {
  return [movement.concepto, movement.referencia, movement.infoAdicional, movement.tercero]
    .filter((value): value is string => typeof value === 'string')
}

function sourceText(movement: EasyAutoMovement): string {
  return sourceValues(movement)
    .join(' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('es-ES')
    .replace(/\s+/g, ' ')
    .trim()
}

const OWN_COMPANY_LEGAL_COMPACT = 'INTERNETOPERADORESSL'
// This is the other fixed literal emitted by the bank for the same company.
// It is an authoritative spelling, not a prefix/fuzzy alias.
const OWN_COMPANY_AUTHORITATIVE_COMPACT = 'INTERNETOPERADORES'

function compactLegalCompany(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('es-ES')
    .replace(/[^A-Z0-9]/g, '')
}

/**
 * A free-text name is not an identity. Origin metadata needs the complete legal
 * company literal, allowing punctuation differences such as
 * `Internet Operadores, S.L.` but no appended or substituted names.
 */
function isExactOwnCompanyLegalName(value: string): boolean {
  return compactLegalCompany(value) === OWN_COMPANY_LEGAL_COMPACT
}

/** The bank's authoritative abbreviated literal is accepted only in `tercero`. */
function isExactOwnCompanyCounterpartyName(value: string): boolean {
  const compact = compactLegalCompany(value)
  return compact === OWN_COMPANY_LEGAL_COMPACT || compact === OWN_COMPANY_AUTHORITATIVE_COMPACT
}

function registeredIbanPattern(iban: string): RegExp {
  // The stored key is already complete and normalized. Bank renderings may add
  // spaces, dots or hyphens, but no letters or digits can be inserted.
  return new RegExp(iban.split('').map(char => char.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')).join('[\\s.-]*'), 'u')
}

/**
 * A sender/origin field is direction-specific. It can identify an incoming
 * credit from another registered own account, but can never identify the
 * recipient of a debit. The text between its role label and the matching own
 * IBAN must be exactly the fixed legal company name (apart from punctuation and
 * an optional bank label), so a name merely contained in another party is not
 * accepted.
 */
function hasExactOwnOriginCreditEvidence(
  movement: EasyAutoMovement,
  registeredAttestedOwnIbanKeys: ReadonlySet<string>,
): boolean {
  if (movement.importeCentimos <= 0 || typeof movement.infoAdicional !== 'string' || !registeredAttestedOwnIbanKeys.size) return false
  const metadata = movement.infoAdicional
  const label = /(?:^|[^A-ZÁÉÍÓÚÜÑ])(?:ORDENANTE|REMITENTE)\s*[:=-]?\s*/giu
  for (const found of metadata.matchAll(label)) {
    const start = (found.index ?? -1) + found[0].length
    if (start < found[0].length) continue
    const afterLabel = metadata.slice(start)
    for (const rawIban of registeredAttestedOwnIbanKeys) {
      const iban = normalizedRegisteredOwnIban(rawIban)
      if (!iban) continue
      const ibanMatch = registeredIbanPattern(iban).exec(afterLabel)
      if (!ibanMatch || ibanMatch.index === undefined) continue
      const companyWithOptionalBankLabel = afterLabel.slice(0, ibanMatch.index)
        .replace(/\b(?:IBAN|CUENTA|CTA)\s*[:=-]?\s*$/iu, '')
      if (isExactOwnCompanyLegalName(companyWithOptionalBankLabel)) return true
    }
  }
  return false
}

/** Only a complete, registered IBAN key is accepted; names are never normalized as identities. */
export function normalizedRegisteredOwnIban(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.toLocaleUpperCase('es-ES').replace(/[^A-Z0-9]/g, '')
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalized) ? normalized : null
}

/**
 * The company literal is intentionally fixed, not a generic name comparison.
 * The IBAN branch accepts only a complete value that belongs to an already
 * active, explicitly attested account supplied by the DB reader.
 */
export function hasExactOwnRecipientEvidence(
  movement: EasyAutoMovement,
  registeredAttestedOwnIbanKeys: ReadonlySet<string>,
): boolean {
  const primary = { ...movement, infoAdicional: null }
  const recipientText = sourceText(primary)
  const namedRecipient = /\b(?:A\s+FAVOR\s+DE|BENEFICIARIO|DESTINATARIO|TRANSFERENCIA(?:\s+RECIBIDA)?\s+DE)\s*[:.-]?\s*INTERNET\s+OPERADORES\b/u.test(recipientText)
  const namedCounterparty = typeof movement.tercero === 'string' && isExactOwnCompanyCounterpartyName(movement.tercero)
  if (namedRecipient || namedCounterparty || hasExactOwnOriginCreditEvidence(movement, registeredAttestedOwnIbanKeys)) return true
  if (!registeredAttestedOwnIbanKeys.size) return false
  const values = [...sourceValues(primary)]
  if (typeof movement.infoAdicional === 'string' && /\b(?:BENEFICIARIO|DESTINATARIO|CUENTA\s+DESTINO)\b/u.test(movement.infoAdicional.toLocaleUpperCase('es-ES'))) values.push(movement.infoAdicional)
  return values.some(value => {
    const compact = value.toLocaleUpperCase('es-ES').replace(/[^A-Z0-9]/g, '')
    return [...registeredAttestedOwnIbanKeys].some(iban => compact.includes(iban))
  })
}

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/**
 * A documented P1 third party, linked document, or unambiguous payment text is
 * fail-closed. Exact own-recipient evidence prevents a generic word such as
 * "pago" from turning a known internal transfer into a supplier candidate; it
 * never overrides a real P1 third party or an existing document relation.
 */
function hasHardThirdPartyOrDocumentaryEvidence(movement: ConciliarTransferReviewMovement): boolean {
  return movement.thirdPartyConfirmed || movement.documentaryLinked
}

function isExplicitThirdPartyPayment(movement: ConciliarTransferReviewMovement): boolean {
  if (hasHardThirdPartyOrDocumentaryEvidence(movement)) return true
  if (movement.ownRecipientExplicit) return false
  return /\b(?:PAGO|PAGAR|FACTURA|FRA|RECIBO|NOMINA|REMESA|TARJETA|TPV|POS|COMISION|IMPUESTO|COBRO|CLIENTE|BIZUM|DOMICILIACION|DOMICILIACIÓN|SEPA)\b/u.test(sourceText(movement))
}

function isEligible(
  movement: ConciliarTransferReviewMovement,
  attestedOwnAccountIds: ReadonlySet<string>,
): boolean {
  return typeof movement.id === 'string' && movement.id.length > 0
    && typeof movement.cuentaId === 'string' && movement.cuentaId.length > 0
    && validDay(movement.fecha)
    && Number.isSafeInteger(movement.importeCentimos) && movement.importeCentimos !== 0
    && attestedOwnAccountIds.has(movement.cuentaId)
    && !isExplicitThirdPartyPayment(movement)
  // This manual display path deliberately does not require a bank wording: two
  // distinct, already-attested accounts with exact opposite cents and dates in
  // the bounded window are the stated visual-pair criterion. It still excludes
  // a P1 third party, a document link and documentary/payment wording. The
  // historical automatic reader retains its own narrower bank-cue requirement.
}

function possiblePair(left: EasyAutoMovement, right: EasyAutoMovement): boolean {
  return left.cuentaId !== right.cuentaId
    && left.importeCentimos + right.importeCentimos === 0
    && calendarDistanceDays(left.fecha, right.fecha) <= 3
}

function reviewPairFingerprint(left: EasyAutoMovement, right: EasyAutoMovement): string {
  const movements = [left, right].sort((a, b) => a.id.localeCompare(b.id))
  return sha256Canonical({
    schema: 'CONCILIAR_TRANSFER_REVIEW_V1',
    movements: movements.map(item => ({
      id: item.id, cuentaId: item.cuentaId, fecha: item.fecha,
      importeCentimos: item.importeCentimos, versionB4: item.versionB4,
    })),
  })
}

function isWellFormedPotentialLeg(movement: ConciliarTransferReviewMovement): boolean {
  return typeof movement.id === 'string' && movement.id.length > 0
    && typeof movement.cuentaId === 'string' && movement.cuentaId.length > 0
    && validDay(movement.fecha)
    && Number.isSafeInteger(movement.importeCentimos) && movement.importeCentimos !== 0
}

/**
 * Finds review-only own-transfer candidates. A unique reciprocal pair is a
 * visual green result for the manual Conciliar group, but remains unselectable.
 * No pair receives an amber review only when the movement has exact own-recipient
 * evidence; a similar counterparty name never suffices.
 */
export function classifyConciliarOwnTransferReviews(
  input: ConciliarOwnTransferReviewInput,
): ReadonlyMap<string, ConciliarOwnTransferReview> {
  const eligible = input.movements.filter(movement => isEligible(movement, input.attestedOwnAccountIds))
  if (new Set(input.movements.map(movement => movement.id)).size !== input.movements.length) return new Map()

  // A confirmed third party or linked document on an attested account must not
  // indirectly turn its signed-opposite movement into a transfer. Generic bank
  // words such as "pago" are not a P1/document proof: they cannot make a unique
  // pair green, but two or more exact opposite legs still make the current row an
  // amber ambiguity, never a document request. CUENTA_PROPIA P1 is supplied as
  // ownRecipientExplicit and is deliberately not blocked here.
  const blockedByThirdParty = new Set<string>()
  for (const candidate of eligible) {
    if (input.movements.some(other => other.id !== candidate.id
      && isWellFormedPotentialLeg(other)
      && input.attestedOwnAccountIds.has(other.cuentaId)
      && hasHardThirdPartyOrDocumentaryEvidence(other)
      && possiblePair(candidate, other))) {
      blockedByThirdParty.add(candidate.id)
    }
  }
  const transferEligible = eligible.filter(movement => !blockedByThirdParty.has(movement.id))

  // Potential counterparts deliberately include ambiguous generic-payment legs
  // that lack hard P1/document proof. They can only create an amber ambiguity;
  // the unique-green map below is built solely from fully eligible review legs.
  const counterparts = new Map<string, ConciliarTransferReviewMovement[]>()
  for (const left of transferEligible) {
    for (const right of input.movements) {
      if (left.id === right.id || !isWellFormedPotentialLeg(right)
        || !input.attestedOwnAccountIds.has(right.cuentaId)
        || hasHardThirdPartyOrDocumentaryEvidence(right)
        || !possiblePair(left, right)) continue
      counterparts.set(left.id, [...(counterparts.get(left.id) ?? []), right])
    }
  }

  // This visual reader deliberately owns its bilateral fingerprint rather than
  // calling the historical automatic selector, which additionally demands a
  // transfer text cue. The pair constraints above remain exact and one-to-one.
  const uniqueByMovement = new Map<string, { movementId: string; oppositeMovementId: string; fingerprint: string }>()
  for (const [left, right] of (() => {
    const pairs: Array<readonly [ConciliarTransferReviewMovement, ConciliarTransferReviewMovement]> = []
    for (let index = 0; index < transferEligible.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < transferEligible.length; otherIndex += 1) {
        const left = transferEligible[index], right = transferEligible[otherIndex]
        if (possiblePair(left, right) && (counterparts.get(left.id)?.length ?? 0) === 1 && (counterparts.get(right.id)?.length ?? 0) === 1) pairs.push([left, right])
      }
    }
    return pairs
  })()) {
    const fingerprint = reviewPairFingerprint(left, right)
    uniqueByMovement.set(left.id, { movementId: left.id, oppositeMovementId: right.id, fingerprint })
    uniqueByMovement.set(right.id, { movementId: right.id, oppositeMovementId: left.id, fingerprint })
  }

  const reviews = new Map<string, ConciliarOwnTransferReview>()
  for (const movement of transferEligible) {
    const candidates = counterparts.get(movement.id) ?? []
    if (candidates.length === 0) {
      if (movement.ownRecipientExplicit) {
        reviews.set(movement.id, { kind: 'SIN_PAREJA_VERIFICADA', movimientoId: movement.id })
      }
      continue
    }
    const unique = uniqueByMovement.get(movement.id)
    if (candidates.length > 1 || candidates.some(candidate => (counterparts.get(candidate.id)?.length ?? 0) > 1)) {
      reviews.set(movement.id, { kind: 'PAREJAS_VERIFICADAS_AMBIGUAS', movimientoId: movement.id })
      continue
    }
    // A sole generic-payment counterpart cannot establish a transfer. Preserve
    // only the existing exact-own-evidence amber route in that case.
    if (!unique) {
      if (movement.ownRecipientExplicit) reviews.set(movement.id, { kind: 'SIN_PAREJA_VERIFICADA', movimientoId: movement.id })
      continue
    }
    reviews.set(movement.id, {
      kind: 'PAREJA_UNICA_PENDIENTE_PRUEBA_ESTRICTA',
      movimientoId: movement.id,
      movimientoParId: unique.oppositeMovementId,
      transferFingerprint: unique.fingerprint,
    })
  }
  return reviews
}

export function conciliarOwnTransferReviewMotive(
  review: ConciliarOwnTransferReview,
): string {
  switch (review.kind) {
    case 'SIN_PAREJA_VERIFICADA':
      return 'Posible traspaso entre cuentas propias: falta la pareja opuesta comprobable. Revísalo antes de decidir.'
    case 'PAREJAS_VERIFICADAS_AMBIGUAS':
      return 'Posible traspaso entre cuentas propias: hay más de una pareja opuesta posible. No se elige ninguna automáticamente.'
    case 'PAREJA_UNICA_PENDIENTE_PRUEBA_ESTRICTA':
      return 'Importe y fecha coinciden con el movimiento de la otra cuenta. No necesita factura.'
  }
}
