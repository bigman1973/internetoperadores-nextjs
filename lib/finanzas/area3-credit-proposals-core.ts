/*
 * Área 3c — propuestas manuales y finitas de abonos recibidos.
 *
 * Este núcleo no conoce Prisma, HTTP, Graph, OCR activo ni B4. Sólo decide si un
 * texto OCR ya almacenado acredita de forma literal y única una relación
 * documental. El importe nunca se usa para descubrir la factura original.
 */
import { createHash } from 'node:crypto'
import { claveCanonicaFactura, normalizarCif } from './invoice-quality'

export const AREA3_PANEL_RECEIVED_SOURCE = 'PANEL_RECEIVED' as const
export const AREA3_ONEDRIVE_SOURCE = 'ONEDRIVE' as const

const CONTROL = /[\u0000-\u001F\u007F]/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ONEDRIVE_KEY = /^[A-Za-z0-9!_.~-]{4,220}:[A-Za-z0-9!_.~-]{4,220}$/
const CREDIT_MARKER = /\b(?:rectificativa|abono)\b/i

export type Area3ReceivedSource = Readonly<{
  invoiceId: string
  /** Calidad/copia/conflicto ya resuelto por el lector SQL; false exige revisión. */
  eligibleForProposal: boolean
  provider: string | null
  cif: string | null
  documentReference: string | null
  documentDate: string | null
  totalCents: number | null
  ocrText: string | null
  oneDriveDriveId: string | null
  oneDriveItemId: string | null
  /** Identidad fiscal ya calculada por el mismo contrato SQL que consume B5. */
  invoiceFiscalIdentity?: string | null
  /** Sólo procede de un snapshot vigente explícito; null significa no acreditada. */
  currencyCode: string | null
}>

export type Area3ReceivedIdentity = Readonly<{
  source: typeof AREA3_ONEDRIVE_SOURCE | typeof AREA3_PANEL_RECEIVED_SOURCE
  sourceItemKey: string
}>

export type Area3CreditProposalReview =
  | 'NO_ES_RECTIFICATIVA_O_ABONO'
  | 'REFERENCIA_ORIGINAL_AUSENTE'
  | 'REFERENCIA_ORIGINAL_AMBIGUA'
  | 'ORIGINAL_NO_ELEGIBLE'
  | 'CIF_FISCAL_AUSENTE_O_INVALIDO'
  | 'PROVEEDOR_NO_COINCIDE_EXACTAMENTE'
  | 'SIGNO_RECTIFICATIVA_INVALIDO'
  | 'IDENTIDAD_DOCUMENTAL_IGUAL'
  | 'DOCUMENTO_EN_REVISION'
  | 'METADATOS_DOCUMENTALES_INCOMPLETOS'

export type Area3CreditProposalDecision =
  | Readonly<{
    kind: 'PROPOSE'
    credit: Area3ReceivedSource
    original: Area3ReceivedSource
    exactReference: string
    creditIdentity: Area3ReceivedIdentity
    originalIdentity: Area3ReceivedIdentity
    proposedReductionCents: number
  }>
  | Readonly<{
    kind: 'REVIEW'
    credit: Area3ReceivedSource
    reason: Area3CreditProposalReview
  }>
  | Readonly<{
    kind: 'IGNORE'
    credit: Area3ReceivedSource
    reason: 'NO_ES_RECTIFICATIVA_O_ABONO'
  }>

export type Area3CreditSeedMetadata = Readonly<{
  documentNumber: string
  documentDate: string | null
  totalCents: number
  invoiceFiscalIdentity: string
  partyRole: 'PROVEEDOR'
  documentClass: 'FACTURA_RECIBIDA' | 'FACTURA_RECTIFICATIVA'
  referencedOriginalReference: string | null
  currencyCode: string | null
}>

function opaque(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const result = value.trim()
  return result.length > 0 && result.length <= max && !CONTROL.test(result) ? result : null
}

function exactProvider(value: unknown): string | null {
  return typeof value === 'string' && value === value.trim() && opaque(value, 300) ? value : null
}

function exactReference(value: unknown): string | null {
  // The source literal is intentionally not case-folded, punctuation-normalized
  // or whitespace-compressed. A source reference must remain documentary proof.
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && value === value.trim() && !CONTROL.test(value)
    ? value
    : null
}

function safeCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= -2_147_483_648 && value <= 2_147_483_647
}

function explicitCurrency(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value)
}

/**
 * A seed must use exactly the same fiscal key that B5 will compare with its
 * received-invoice row. The optional DB projection is never a replacement for
 * `claveCanonicaFactura`: it is a compatibility witness for that SQL contract.
 */
function b5CompatibleFiscalIdentity(document: Area3ReceivedSource): string | null {
  const canonical = claveCanonicaFactura(document.cif, document.documentReference)
  if (!canonical) return null
  if (document.invoiceFiscalIdentity === undefined || document.invoiceFiscalIdentity === null) return canonical
  return document.invoiceFiscalIdentity === canonical ? canonical : null
}

function isBoundary(value: string | undefined): boolean {
  return value === undefined || !/[\p{L}\p{N}]/u.test(value)
}

/**
 * Finds literal occurrences only. `260/12730` is not considered present inside
 * `X260/12730Y`; this avoids accepting a serial substring as documentary proof.
 */
export function literalReferenceOccurrences(text: string, reference: string): number {
  let from = 0
  let occurrences = 0
  while (from <= text.length) {
    const index = text.indexOf(reference, from)
    if (index < 0) break
    const before = index === 0 ? undefined : text[index - 1]
    const afterIndex = index + reference.length
    const after = afterIndex >= text.length ? undefined : text[afterIndex]
    if (isBoundary(before) && isBoundary(after)) {
      occurrences += 1
      if (occurrences > 1) return occurrences
    }
    from = index + Math.max(reference.length, 1)
  }
  return occurrences
}

export function containsUniqueLiteralReference(text: string, reference: string): boolean {
  return literalReferenceOccurrences(text, reference) === 1
}

function validInvoiceSource(document: Area3ReceivedSource): boolean {
  return Boolean(
    document.eligibleForProposal === true
    && opaque(document.invoiceId, 64)
    && exactProvider(document.provider)
    && exactReference(document.documentReference)
    && normalizarCif(document.cif)
    && safeCents(document.totalCents)
    && document.totalCents !== 0
    && b5CompatibleFiscalIdentity(document)
    // A null means the canonical received-invoice source did not state a
    // currency. It can be proposed for human review, but B5 will never apply a
    // monetary reduction without an explicit equal snapshot currency.
    && (document.currencyCode === null || explicitCurrency(document.currencyCode))
  )
}

function panelIdentity(document: Area3ReceivedSource): Area3ReceivedIdentity | null {
  return UUID.test(document.invoiceId)
    ? { source: AREA3_PANEL_RECEIVED_SOURCE, sourceItemKey: document.invoiceId.toLowerCase() }
    : null
}

/**
 * A raw OneDrive key is reused only if both recorded components are safe. Missing
 * drive IDs never receive a guessed value: the stable received-invoice UUID is
 * instead used in the explicit PANEL_RECEIVED namespace.
 */
export function receivedIdentityForArea3(document: Area3ReceivedSource): Area3ReceivedIdentity | null {
  const drive = opaque(document.oneDriveDriveId, 220)
  const item = opaque(document.oneDriveItemId, 220)
  const key = drive && item ? `${drive}:${item}` : null
  if (key && ONEDRIVE_KEY.test(key)) return { source: AREA3_ONEDRIVE_SOURCE, sourceItemKey: key }
  return panelIdentity(document)
}

function candidateMarker(document: Area3ReceivedSource): boolean {
  return document.totalCents !== null && document.totalCents < 0
    || Boolean(document.ocrText && CREDIT_MARKER.test(document.ocrText))
}

function literalOriginals(credit: Area3ReceivedSource, documents: readonly Area3ReceivedSource[]): { unique: Area3ReceivedSource[]; duplicateMention: boolean } {
  const text = typeof credit.ocrText === 'string' ? credit.ocrText : ''
  if (!text) return { unique: [], duplicateMention: false }
  let duplicateMention = false
  const unique = documents.filter((candidate) => {
    const reference = exactReference(candidate.documentReference)
    const occurrences = reference === null ? 0 : literalReferenceOccurrences(text, reference)
    if (occurrences > 1) duplicateMention = true
    return candidate.invoiceId !== credit.invoiceId
      && candidate.totalCents !== null && candidate.totalCents > 0
      && reference !== null
      && occurrences === 1
  })
  return { unique, duplicateMention }
}

function identicalIdentity(left: Area3ReceivedIdentity | null, right: Area3ReceivedIdentity | null): boolean {
  return left !== null && right !== null && left.source === right.source && left.sourceItemKey === right.sourceItemKey
}

/**
 * Returns proposals only where a candidate has exactly one literal, positive
 * original and the same exact provider plus normalized fiscal identity. It never
 * compares magnitudes to select an original; a partial abono is fully allowed.
 */
export function decideArea3ReceivedCreditProposal(
  credit: Area3ReceivedSource,
  documents: readonly Area3ReceivedSource[],
): Area3CreditProposalDecision {
  if (!candidateMarker(credit)) return { kind: 'IGNORE', credit, reason: 'NO_ES_RECTIFICATIVA_O_ABONO' }
  if (credit.eligibleForProposal !== true) return { kind: 'REVIEW', credit, reason: 'DOCUMENTO_EN_REVISION' }
  if (!validInvoiceSource(credit)) return { kind: 'REVIEW', credit, reason: 'METADATOS_DOCUMENTALES_INCOMPLETOS' }
  if (!safeCents(credit.totalCents) || credit.totalCents >= 0) return { kind: 'REVIEW', credit, reason: 'SIGNO_RECTIFICATIVA_INVALIDO' }

  const literal = literalOriginals(credit, documents)
  const originals = literal.unique
  if (literal.duplicateMention) return { kind: 'REVIEW', credit, reason: 'REFERENCIA_ORIGINAL_AMBIGUA' }
  if (originals.length === 0) return { kind: 'REVIEW', credit, reason: 'REFERENCIA_ORIGINAL_AUSENTE' }
  if (originals.length !== 1) return { kind: 'REVIEW', credit, reason: 'REFERENCIA_ORIGINAL_AMBIGUA' }
  const original = originals[0]!
  if (original.eligibleForProposal !== true || !validInvoiceSource(original) || !safeCents(original.totalCents) || original.totalCents <= 0) {
    return { kind: 'REVIEW', credit, reason: 'ORIGINAL_NO_ELEGIBLE' }
  }

  const creditCif = normalizarCif(credit.cif)
  const originalCif = normalizarCif(original.cif)
  if (!creditCif || !originalCif || creditCif !== originalCif) return { kind: 'REVIEW', credit, reason: 'CIF_FISCAL_AUSENTE_O_INVALIDO' }
  if (exactProvider(credit.provider) !== exactProvider(original.provider)) return { kind: 'REVIEW', credit, reason: 'PROVEEDOR_NO_COINCIDE_EXACTAMENTE' }
  // Do not turn an unknown currency into EUR. Both missing values remain a
  // documentary proposal only; one known or two different known values cannot
  // form an economic pair.
  if (credit.currencyCode !== original.currencyCode) return { kind: 'REVIEW', credit, reason: 'METADATOS_DOCUMENTALES_INCOMPLETOS' }

  const creditIdentity = receivedIdentityForArea3(credit)
  const originalIdentity = receivedIdentityForArea3(original)
  if (!creditIdentity || !originalIdentity) return { kind: 'REVIEW', credit, reason: 'METADATOS_DOCUMENTALES_INCOMPLETOS' }
  if (identicalIdentity(creditIdentity, originalIdentity)) return { kind: 'REVIEW', credit, reason: 'IDENTIDAD_DOCUMENTAL_IGUAL' }

  const reference = exactReference(original.documentReference)
  if (!reference) return { kind: 'REVIEW', credit, reason: 'ORIGINAL_NO_ELEGIBLE' }
  return {
    kind: 'PROPOSE', credit, original, exactReference: reference, creditIdentity, originalIdentity,
    proposedReductionCents: credit.totalCents,
  }
}

/** Classifies all detected candidates, retaining reviews rather than selecting a fallback. */
export function decideArea3ReceivedCreditProposals(documents: readonly Area3ReceivedSource[]): Area3CreditProposalDecision[] {
  return documents.filter(candidateMarker).map((credit) => decideArea3ReceivedCreditProposal(credit, documents))
}

/** Metadata comes exclusively from the received row and a literal reference already proven above. */
export function area3MetadataOnlySeed(
  document: Area3ReceivedSource,
  role: 'ORIGINAL' | 'CREDIT',
  referencedOriginalReference: string | null,
): Area3CreditSeedMetadata | null {
  const number = exactReference(document.documentReference)
  const fiscal = normalizarCif(document.cif)
  const cents = document.totalCents
  if (!number || !fiscal || !safeCents(cents) || cents === 0) return null
  const invoiceFiscalIdentity = b5CompatibleFiscalIdentity(document)
  if (!invoiceFiscalIdentity) return null
  return {
    documentNumber: number,
    documentDate: typeof document.documentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(document.documentDate) ? document.documentDate : null,
    totalCents: cents,
    invoiceFiscalIdentity,
    partyRole: 'PROVEEDOR',
    documentClass: role === 'CREDIT' ? 'FACTURA_RECTIFICATIVA' : 'FACTURA_RECIBIDA',
    referencedOriginalReference: role === 'CREDIT' ? exactReference(referencedOriginalReference) : null,
    currencyCode: explicitCurrency(document.currencyCode) ? document.currencyCode : null,
  }
}

/** Stable hashes are identifiers only; they never stand in for a content hash or bytes. */
export function area3StableHash(value: unknown): string {
  const canonical = (current: unknown): string => {
    if (current === null || typeof current === 'string' || typeof current === 'boolean' || typeof current === 'number') return JSON.stringify(current)
    if (Array.isArray(current)) return `[${current.map(canonical).join(',')}]`
    if (current && typeof current === 'object') {
      const record = current as Record<string, unknown>
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
    }
    throw new Error('AREA3_CANONICAL_VALUE_INVALID')
  }
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex')
}

/** Matches `document_version_credit_links.exact_reference_hash`: raw UTF-8 literal only. */
export function area3ExactReferenceHash(reference: string): string {
  const checked = exactReference(reference)
  if (!checked) throw new Error('AREA3_REFERENCE_HASH_INPUT_INVALID')
  return createHash('sha256').update(checked, 'utf8').digest('hex')
}
