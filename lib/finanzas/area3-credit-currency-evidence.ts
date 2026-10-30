import type { Area3ReceivedSource } from './area3-credit-proposals-core'
import { parseArea3ExistingDocumentBytesManifest } from './area3-document-fingerprints-core'

/**
 * Optional private metadata hand-off from a finite authorised byte reader.
 * This is not OCR ingestion, a watcher or a currency default. The reader must
 * have extracted one explicit currency from the exact PDF bytes whose SHA-256
 * is in the verified manifest; source revalidation belongs to the caller's tx.
 * No file, URL, byte, invoice row or human decision is written here.
 */
export function applyArea3ExplicitDocumentCurrencyEvidence(
  documents: readonly Area3ReceivedSource[],
  byteManifestInput: unknown,
  evidenceInput: unknown,
): Area3ReceivedSource[] {
  const fail = (): never => { throw new Error('AREA3_EXPLICIT_CURRENCY_EVIDENCE_INVALID') }
  const manifest = parseArea3ExistingDocumentBytesManifest(byteManifestInput)
  if (!evidenceInput || typeof evidenceInput !== 'object' || Array.isArray(evidenceInput)) return fail()
  const root = evidenceInput as Record<string, unknown>
  if (root.schema !== 'AREA3_EXPLICIT_DOCUMENT_CURRENCY_V1' || root.database !== manifest.database || !Array.isArray(root.entries) || root.entries.length > 1000) return fail()
  const byManifest = new Map(manifest.entries.map(entry => [entry.invoiceId, entry]))
  const byDocument = new Map(documents.map(document => [document.invoiceId, document]))
  const currencies = new Map<string, string>()
  for (const raw of root.entries) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail()
    const item = raw as Record<string, unknown>
    if (typeof item.invoiceId !== 'string' || currencies.has(item.invoiceId)) return fail()
    const stored = byManifest.get(item.invoiceId)
    const source = byDocument.get(item.invoiceId)
    if (!stored || stored.status !== 'HASHED' || !source) return fail()
    if (item.method !== 'EXPLICIT_PDF_TEXT_TOKEN_V1' || typeof item.explicitTokenCount !== 'number' || !Number.isSafeInteger(item.explicitTokenCount) || item.explicitTokenCount < 1) return fail()
    if (item.contentSha256 !== stored.sha256 || item.byteLength !== stored.byteLength || item.sourceItemId !== stored.sourceItemId || item.sourceDriveId !== stored.sourceDriveId || item.sourceUpdatedAt !== stored.sourceUpdatedAt) return fail()
    if (source.oneDriveItemId !== stored.sourceItemId || source.oneDriveDriveId !== stored.sourceDriveId) return fail()
    if (typeof item.currencyCode !== 'string' || !['EUR','USD','GBP','CHF','JPY'].includes(item.currencyCode)) return fail()
    if (source.currencyCode !== null && source.currencyCode !== item.currencyCode) return fail()
    currencies.set(item.invoiceId, item.currencyCode)
  }
  return documents.map(document => currencies.has(document.invoiceId) ? { ...document, currencyCode: currencies.get(document.invoiceId)! } : document)
}
