import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { applyArea3ExplicitDocumentCurrencyEvidence } from '../lib/finanzas/area3-credit-currency-evidence'
import type { Area3ReceivedSource } from '../lib/finanzas/area3-credit-proposals-core'
import { AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN } from '../lib/finanzas/area3-document-fingerprints-core'

const source: Area3ReceivedSource = { invoiceId: '11111111-1111-4111-8111-111111111111', eligibleForProposal: true, provider: 'Proveedor de prueba', cif: 'B12345678', invoiceFiscalIdentity: 'CIF:B12345678|NUM:AB/1', documentReference: 'AB/1', documentDate: '2026-01-01', totalCents: -100, ocrText: 'Abono de prueba', oneDriveDriveId: null, oneDriveItemId: 'item-prueba', currencyCode: null }
const sha = createHash('sha256').update('bytes privados de prueba').digest('hex')
const entry = { invoiceId: source.invoiceId, sourceItemId: source.oneDriveItemId, sourceDriveId: null, sourceUpdatedAt: '2026-01-01T00:00:00.000Z', readOrigin: AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN, readAt: '2026-01-02T00:00:00.000Z', status: 'HASHED', sha256: sha, byteLength: 10 }
const manifest = { schema: 'AREA3_EXISTING_DOCUMENT_BYTES_V1', database: 'io_staging_finanzas', complete: true, entries: [entry] }
const proof = { invoiceId: source.invoiceId, contentSha256: sha, byteLength: 10, currencyCode: 'EUR', sourceItemId: source.oneDriveItemId, sourceDriveId: null, sourceUpdatedAt: entry.sourceUpdatedAt, method: 'EXPLICIT_PDF_TEXT_TOKEN_V1', explicitTokenCount: 1 }
const evidence = (entries: unknown[]) => ({ schema: 'AREA3_EXPLICIT_DOCUMENT_CURRENCY_V1', database: 'io_staging_finanzas', entries })
assert.equal(applyArea3ExplicitDocumentCurrencyEvidence([source], manifest, evidence([]))[0].currencyCode, null)
assert.equal(applyArea3ExplicitDocumentCurrencyEvidence([source], manifest, evidence([proof]))[0].currencyCode, 'EUR')
assert.equal(source.currencyCode, null, 'El documento de entrada no se modifica.')
for (const invalid of [{ ...proof, contentSha256: '0'.repeat(64) }, { ...proof, byteLength: 11 }, { ...proof, sourceItemId: 'otro-item' }, { ...proof, sourceUpdatedAt: '2026-02-01T00:00:00.000Z' }, { ...proof, explicitTokenCount: 0 }, { ...proof, method: 'DEFAULT_EUR' }, { ...proof, currencyCode: 'DESCONOCIDA' }]) {
  assert.throws(() => applyArea3ExplicitDocumentCurrencyEvidence([source], manifest, evidence([invalid])), /AREA3_EXPLICIT_CURRENCY_EVIDENCE_INVALID/)
}
assert.throws(() => applyArea3ExplicitDocumentCurrencyEvidence([{ ...source, currencyCode: 'USD' }], manifest, evidence([proof])), /AREA3_EXPLICIT_CURRENCY_EVIDENCE_INVALID/)
assert.throws(() => applyArea3ExplicitDocumentCurrencyEvidence([source], manifest, evidence([proof, proof])), /AREA3_EXPLICIT_CURRENCY_EVIDENCE_INVALID/)
console.log('PASS: moneda sólo por prueba explícita del mismo PDF; nulo sin evidencia, sin EUR supuesto ni mutación de fuente.')
