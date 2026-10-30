/**
 * Canonical selector evidence for the private Conciliar release regression.
 *
 * This module deliberately has no database access and no output. Its caller must
 * supply bank-description fields and the exact persisted REMESA target of an
 * already-proven B4 DOCUMENTO link. `info_adicional` and bank counterparty data
 * are intentionally excluded: the former is not a bank description and the
 * latter has its own selector field.
 */

export type CanonicalRemittanceSelectorLink = Readonly<{
  lineActive: boolean
  lineKind: string | null
  documentActive: boolean
  documentType: string | null
  operationState: string | null
  operationReverted: boolean
  movementState: string | null
  /** Exact persisted `remesas.nombre`; no aliases or inferred labels. */
  remittanceName: string | null | undefined
}>

export type SelectorSearchEvidenceInput = Readonly<{
  /** Bank-provided description fields only, in their persisted order. */
  bankDescription: readonly (string | null | undefined)[]
  /** Exact B4 REMESA targets linked to this same movement. */
  linkedRemittances: readonly CanonicalRemittanceSelectorLink[]
}>

function text(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed ? trimmed : null
}

/**
 * A remittance name may be reused only when the persisted B4 relationship is
 * active, documentary, applied, unreverted and presently justified. This is
 * intentionally stricter than a foreign key or a historical/reverted line.
 */
export function isCanonicalRemittanceSelectorLink(link: CanonicalRemittanceSelectorLink): boolean {
  return link.lineActive === true
    && link.lineKind === 'DOCUMENTO'
    && link.documentActive === true
    && link.documentType === 'REMESA'
    && link.operationState === 'APLICADA'
    && link.operationReverted === false
    && link.movementState === 'JUSTIFICADO'
}

/**
 * Returns exact persisted remittance names from qualified B4 targets. It does
 * not derive aliases, categories, counterparties, or identities.
 */
export function canonicalLinkedRemittanceSearchText(links: readonly CanonicalRemittanceSelectorLink[]): string {
  const values = links
    .filter(isCanonicalRemittanceSelectorLink)
    .flatMap(link => text(link.remittanceName) ? [text(link.remittanceName)!] : [])
  return [...new Set(values)].join(' ')
}

/**
 * Builds the field consumed by selector.searchTerms/searchAnyTerms. The caller
 * must continue to expose bank `tercero` only through `counterpartyText`.
 */
export function selectorSearchableText(input: SelectorSearchEvidenceInput): string {
  const bank = input.bankDescription.flatMap(value => text(value) ? [text(value)!] : [])
  const linked = canonicalLinkedRemittanceSearchText(input.linkedRemittances)
  return [...bank, ...(linked ? [linked] : [])].join(' ')
}
