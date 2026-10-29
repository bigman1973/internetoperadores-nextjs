/*
 * Pure validation for a persisted, full documentary remittance receipt list.
 *
 * The independent-list predicate below never treats proposal composition as a
 * source. The separate importer predicate is usable only behind an already
 * validated persisted remittance seal; neither path creates FI↔ISP aliases.
 */

export type DocumentaryRemittanceReceipt = Readonly<{
  numeroFactura: unknown
  cliente: unknown
  importeCentimos: unknown
  fechaFactura: unknown
}>

export type CanonicalDocumentaryInvoice = Readonly<{
  facturaEmitidaId: unknown
  numeroFactura: unknown
  cliente: unknown
  importeCentimos: unknown
  fechaFactura: unknown
}>

export type DocumentaryRemittanceCompositionEntry = Readonly<{
  facturaEmitidaId: unknown
  importeCentimos: unknown
}>

/** Persisted importer composition admitted by the exceptional sealed-remittance
 * path. Its four identity fields are all checked again against current FI. */
export type PersistedImportedRemittanceCompositionEntry = Readonly<{
  facturaEmitidaId: unknown
  numeroFactura: unknown
  cliente: unknown
  importeCentimos: unknown
  fechaFactura: unknown
}>

const MAX_ROWS = 2_000

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized.length > 0 && normalized.length <= max ? normalized : null
}

function exactDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

function cents(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : null
}

function invoiceId(value: unknown): string | null {
  const parsed = text(value, 160)
  return parsed ? parsed.toLowerCase() : null
}

/** Exact documentary identity: normalized case/whitespace only; no fuzzy aliases. */
function identity(value: Readonly<{
  numeroFactura: unknown
  cliente: unknown
  importeCentimos: unknown
  fechaFactura: unknown
}>): string | null {
  const number = text(value.numeroFactura, 240)
  const client = text(value.cliente, 300)
  const amount = cents(value.importeCentimos)
  const date = exactDate(value.fechaFactura)
  if (!number || !client || amount === null || !date) return null
  return `${number.toLocaleLowerCase('es-ES')}\u0000${client.toLocaleLowerCase('es-ES')}\u0000${amount}\u0000${date}`
}

/**
 * Returns true only when an independent documentary receipt list fully and
 * bijectively identifies the canonical FI population and the persisted
 * proposal composition repeats exactly those allocations.  This is the
 * acceptance predicate a real B7/OneDrive reader must meet before C4 can be
 * promoted; it cannot make a source list out of proposal data.
 */
export function documentaryRemittanceSourceMatchesCanonicalFI(input: Readonly<{
  receipts: readonly DocumentaryRemittanceReceipt[]
  canonicalInvoices: readonly CanonicalDocumentaryInvoice[]
  composition: readonly DocumentaryRemittanceCompositionEntry[]
  importeBancoCentimos: unknown
}>): boolean {
  const bankCents = cents(input.importeBancoCentimos)
  if (bankCents === null
    || !Array.isArray(input.receipts)
    || !Array.isArray(input.canonicalInvoices)
    || !Array.isArray(input.composition)
    || input.receipts.length < 1
    || input.receipts.length > MAX_ROWS
    || input.canonicalInvoices.length !== input.receipts.length
    || input.composition.length !== input.receipts.length) return false

  const invoicesByIdentity = new Map<string, CanonicalDocumentaryInvoice[]>()
  const canonicalIds = new Set<string>()
  for (const invoice of input.canonicalInvoices) {
    const id = invoiceId(invoice.facturaEmitidaId)
    const key = identity(invoice)
    if (!id || !key || canonicalIds.has(id)) return false
    canonicalIds.add(id)
    const existing = invoicesByIdentity.get(key) ?? []
    existing.push(invoice)
    invoicesByIdentity.set(key, existing)
  }

  const receiptInvoiceIds = new Set<string>()
  let receiptTotal = 0
  for (const receipt of input.receipts) {
    const key = identity(receipt)
    const amount = cents(receipt.importeCentimos)
    if (!key || amount === null || receiptTotal > Number.MAX_SAFE_INTEGER - amount) return false
    const matches = invoicesByIdentity.get(key)
    // A documentary receipt must name exactly one existing FI. A repeated
    // invoice identity is an ambiguity, not permission to choose one.
    if (!matches || matches.length !== 1) return false
    const id = invoiceId(matches[0]!.facturaEmitidaId)
    if (!id || receiptInvoiceIds.has(id)) return false
    receiptInvoiceIds.add(id)
    receiptTotal += amount
  }
  if (receiptTotal !== bankCents || receiptInvoiceIds.size !== canonicalIds.size) return false

  const compositionIds = new Set<string>()
  let compositionTotal = 0
  for (const entry of input.composition) {
    const id = invoiceId(entry.facturaEmitidaId)
    const amount = cents(entry.importeCentimos)
    if (!id || amount === null || !receiptInvoiceIds.has(id) || compositionIds.has(id)
      || compositionTotal > Number.MAX_SAFE_INTEGER - amount) return false
    const invoice = input.canonicalInvoices.find(candidate => invoiceId(candidate.facturaEmitidaId) === id)
    if (!invoice || amount !== cents(invoice.importeCentimos)) return false
    compositionIds.add(id)
    compositionTotal += amount
  }
  return compositionTotal === bankCents && compositionIds.size === receiptInvoiceIds.size
}

/**
 * Validates the authorized compatibility path for a pre-existing importer
 * composition. It does not derive a remittance from FI rows: the caller must
 * separately require the persisted remittance seal. Every saved item must name
 * one current FI and repeat its exact number, client, nominal and date; IDs are
 * unique and the positive allocations close exactly with the bank amount.
 */
export function persistedImportedRemittanceCompositionMatchesCurrentFI(input: Readonly<{
  composition: readonly PersistedImportedRemittanceCompositionEntry[]
  canonicalInvoices: readonly CanonicalDocumentaryInvoice[]
  importeBancoCentimos: unknown
}>): boolean {
  const bankCents = cents(input.importeBancoCentimos)
  if (bankCents === null
    || !Array.isArray(input.composition)
    || !Array.isArray(input.canonicalInvoices)
    || input.composition.length < 1
    || input.composition.length > MAX_ROWS
    || input.canonicalInvoices.length !== input.composition.length) return false

  const canonicalById = new Map<string, CanonicalDocumentaryInvoice>()
  for (const invoice of input.canonicalInvoices) {
    const id = invoiceId(invoice.facturaEmitidaId)
    if (!id || !identity(invoice) || canonicalById.has(id)) return false
    canonicalById.set(id, invoice)
  }

  const compositionIds = new Set<string>()
  let total = 0
  for (const entry of input.composition) {
    const id = invoiceId(entry.facturaEmitidaId)
    const amount = cents(entry.importeCentimos)
    const entryIdentity = identity(entry)
    const invoice = id ? canonicalById.get(id) : undefined
    if (!id || !amount || !entryIdentity || !invoice || compositionIds.has(id)
      || entryIdentity !== identity(invoice) || total > Number.MAX_SAFE_INTEGER - amount) return false
    compositionIds.add(id)
    total += amount
  }
  return total === bankCents && compositionIds.size === canonicalById.size
}
