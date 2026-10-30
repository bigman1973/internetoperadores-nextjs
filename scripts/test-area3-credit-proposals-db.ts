import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  applyArea3CreditProposalsTx,
  area3CentsFromDatabaseText,
  area3ProposalSummary,
  planArea3ReceivedCreditProposals,
  readArea3ReceivedCreditSourcesTx,
  type Area3CreditProposalDb,
} from '../lib/finanzas/area3-credit-proposals-db'
import type { Area3ReceivedSource } from '../lib/finanzas/area3-credit-proposals-core'

const IDS = { original: '11111111-1111-4111-8111-111111111111', credit: '22222222-2222-4222-8222-222222222222' }
function source(overrides: Partial<Area3ReceivedSource> = {}): Area3ReceivedSource {
  return {
    invoiceId: IDS.original, eligibleForProposal: true, provider: 'Proveedor Sintético, S.L.', cif: 'B-12345678',
    documentReference: 'ORIG/2026-001', documentDate: '2026-10-01', totalCents: 12_040,
    ocrText: 'Factura ordinaria', oneDriveDriveId: null, oneDriveItemId: null, currencyCode: 'EUR', ...overrides,
  }
}
const original = source()
const credit = source({
  invoiceId: IDS.credit, documentReference: 'RECT/2026-001', documentDate: '2026-10-02', totalCents: -12_040,
  ocrText: 'Factura rectificativa que cita ORIG/2026-001.',
})

class FakeArea3Db implements Area3CreditProposalDb {
  readonly statements: Array<{ text: string; values: readonly unknown[] }> = []
  private lifecycleByKey = new Map<string, { id: string; version: number }>()
  private snapshotByLifecycle = new Map<string, { documentNumber: unknown; documentDate: unknown; totalCents: unknown; invoiceFiscalIdentity: unknown; partyRole: unknown; documentClass: unknown; referencedOriginalReference: unknown; currencyCode: unknown }>()
  private proposalKeys = new Set<string>()
  existingState: 'PROPOSED' | 'CONFIRMED' | 'REJECTED' | null = null
  multipleExisting = false

  async query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values: readonly unknown[] = []): Promise<{ rows: T[]; rowCount?: number }> {
    this.statements.push({ text, values })
    if (/INSERT INTO document_version_lifecycle/.test(text)) return { rows: [] as unknown as T[] }
    if (/FROM document_version_lifecycle\s+WHERE source=\$1/.test(text)) {
      const key = `${values[0]}:${values[1]}`
      let lifecycle = this.lifecycleByKey.get(key)
      if (!lifecycle) {
        lifecycle = { id: values[1] === IDS.credit ? '22222222-2222-4222-8222-222222222222' : '11111111-1111-4111-8111-111111111111', version: 0 }
        this.lifecycleByKey.set(key, lifecycle)
      }
      return { rows: [{ lifecycleId: lifecycle.id, currentVersion: lifecycle.version, lifecycleState: 'ACTIVE' }] as unknown as T[] }
    }
    if (/INSERT INTO document_version_snapshots/.test(text)) {
      const lifecycleId = String(values[0])
      if (this.snapshotByLifecycle.has(lifecycleId)) return { rows: [] as unknown as T[] }
      this.snapshotByLifecycle.set(lifecycleId, {
        documentNumber: values[2], documentDate: values[3], totalCents: values[4], invoiceFiscalIdentity: values[5],
        partyRole: values[6], documentClass: values[7], referencedOriginalReference: values[8], currencyCode: values[9],
      })
      return { rows: [{ id: `snapshot-${lifecycleId}` }] as unknown as T[] }
    }
    if (/UPDATE document_version_lifecycle\s+SET current_version=1/.test(text)) {
      const lifecycle = [...this.lifecycleByKey.values()].find((item) => item.id === values[0])
      if (!lifecycle) throw new Error('FIXTURE_LIFECYCLE_MISSING')
      lifecycle.version = 1
      return { rows: [{ id: lifecycle.id }] as unknown as T[] }
    }
    if (/FROM document_version_lifecycle l\s+LEFT JOIN document_version_snapshots/.test(text)) {
      const lifecycleId = String(values[0])
      const snapshot = this.snapshotByLifecycle.get(lifecycleId)
      const lifecycle = [...this.lifecycleByKey.values()].find((item) => item.id === lifecycleId)
      if (!snapshot || !lifecycle) return { rows: [] as unknown as T[] }
      return { rows: [{ lifecycleId, lifecycleState: 'ACTIVE', currentVersion: lifecycle.version, ...snapshot }] as unknown as T[] }
    }
    if (/FROM document_version_credit_links cl/.test(text)) {
      if (this.multipleExisting) return { rows: [{ effectiveState: 'PROPOSED' }, { effectiveState: 'PROPOSED' }] as unknown as T[] }
      return { rows: (this.existingState ? [{ effectiveState: this.existingState }] : []) as unknown as T[] }
    }
    if (/INSERT INTO document_version_credit_links/.test(text)) {
      const key = String(values[4])
      if (this.proposalKeys.has(key)) return { rows: [] as unknown as T[] }
      this.proposalKeys.add(key)
      return { rows: [{ id: 'credit-link-synthetic' }] as unknown as T[] }
    }
    throw new Error(`FIXTURE_SQL_UNKNOWN:${text.slice(0, 80)}`)
  }
}

function plan() { return planArea3ReceivedCreditProposals([original, credit]) }

test('parsea sólo decimales exactos de PostgreSQL, sin float ni redondeo silencioso', () => {
  assert.equal(area3CentsFromDatabaseText('-120.40'), -12_040)
  assert.equal(area3CentsFromDatabaseText('120'), 12_000)
  assert.equal(area3CentsFromDatabaseText('1.2'), 120)
  assert.equal(area3CentsFromDatabaseText('120.400'), null)
  assert.equal(area3CentsFromDatabaseText('1e2'), null)
})

test('lector reutiliza sólo currency_code de snapshot B5-compatible y jamás extrae o inventa moneda desde OCR', async () => {
  const statements: string[] = []
  let page = 0
  const db: Area3CreditProposalDb = {
    async query<T extends Record<string, unknown> = Record<string, unknown>>(text: string): Promise<{ rows: T[] }> {
      statements.push(text)
      page += 1
      const rows = page === 1 ? [{
        invoiceId: IDS.original, eligibleForProposal: true, provider: original.provider, cif: original.cif,
        invoiceFiscalIdentity: 'CIF:B12345678|NUM:ORIG/2026-001', documentReference: original.documentReference,
        documentDate: original.documentDate, totalText: '120.40', ocrText: original.ocrText,
        // The historic OCR may say EUR, but it is not a current snapshot witness.
        ocrRaw: '{"moneda":"EUR"}', oneDriveDriveId: null, oneDriveItemId: null, currencyCode: null,
      }] : []
      return { rows: rows as unknown as T[] }
    },
  }
  const [document] = await readArea3ReceivedCreditSourcesTx(db, { pageSize: 1, maxDocuments: 1 })
  assert.equal(document?.currencyCode, null)
  const sql = statements.join('\n')
  assert.match(sql, /canonical_snapshot\."currencyCode"/)
  assert.match(sql, /s\.invoice_fiscal_identity=/)
  assert.match(sql, /s\.total_cents=b4_importe_bancario_centimos\(fr\.total\)/)
  assert.match(sql, /WHEN NULLIF\(btrim\(fr\.datos_ocr_raw\),''\) IS NOT NULL THEN fr\.datos_ocr_raw/)
  assert.doesNotMatch(sql, /concat_ws\(E'\\n',fr\.concepto,fr\.datos_ocr_raw,fr\.lineas_detalle\)/)
  assert.doesNotMatch(sql, /ocrRaw|JSON\.parse|parsed\.moneda|parsed\.currencyCode/)
})

test('apply inyectado sólo crea baseline metadata UNAVAILABLE y enlace PROPOSED; el replay es idempotente', async () => {
  const db = new FakeArea3Db()
  const first = await applyArea3CreditProposalsTx(db, plan())
  assert.deepEqual([first.metadataSeedsCreated, first.proposalsCreated, first.proposalsAlreadyPresent], [2, 1, 0])
  const second = await applyArea3CreditProposalsTx(db, plan())
  assert.deepEqual([second.metadataSeedsCreated, second.proposalsCreated, second.proposalsAlreadyPresent], [0, 0, 1])

  const text = db.statements.map((statement) => statement.text).join('\n')
  assert.match(text, /'UNAVAILABLE'::"DocumentVersionArtifactState"/)
  assert.match(text, /content_sha256,byte_length,original_format,artifact_state,private_storage_handle/)
  assert.match(text, /NULL,NULL,NULL,'UNAVAILABLE'/)
  assert.match(text, /'PROPOSED'::"DocumentVersionCreditLinkState"/)
  assert.doesNotMatch(text, /confirmed_by_id[^,]*,[^,]*confirmed_at[^,]*\)\s*VALUES[\s\S]*[^N]CONFIRMED/i)
  assert.doesNotMatch(text, /INSERT INTO document_version_artifacts|UPDATE facturas_recibidas|INSERT INTO documentos_conciliables|operaciones_justificacion_b4/i)
  assert.ok(db.statements.every(({ text }) => !/\b(?:DELETE|MERGE|CALL)\b/i.test(text)))
})

test('una propuesta con moneda documental ausente no se falsea como EUR: persiste null y sigue siendo sólo PROPOSED', async () => {
  const db = new FakeArea3Db()
  const nullCurrencyPlan = planArea3ReceivedCreditProposals([
    source({ currencyCode: null }),
    source({ invoiceId: IDS.credit, documentReference: 'RECT/2026-001', documentDate: '2026-10-02', totalCents: -12_040, currencyCode: null, ocrText: 'Rectificativa ORIG/2026-001' }),
  ])
  const result = await applyArea3CreditProposalsTx(db, nullCurrencyPlan)
  assert.deepEqual([result.metadataSeedsCreated, result.proposalsCreated], [2, 1])
  const seeds = db.statements.filter(({ text }) => /INSERT INTO document_version_snapshots/.test(text))
  assert.equal(seeds.length, 2)
  assert.ok(seeds.every(({ values }) => values[9] === null))
  assert.ok(db.statements.some(({ text }) => /'PROPOSED'::"DocumentVersionCreditLinkState"/.test(text)))
})

test('un enlace confirmado o rechazado existente no se reabre ni se sustituye', async () => {
  for (const state of ['CONFIRMED', 'REJECTED'] as const) {
    const db = new FakeArea3Db()
    db.existingState = state
    const result = await applyArea3CreditProposalsTx(db, plan())
    assert.equal(result.skippedByExistingHumanState[state], 1)
    assert.equal(result.proposalsCreated, 0)
    assert.equal(db.statements.filter(({ text }) => /INSERT INTO document_version_credit_links/.test(text)).length, 0)
  }
})

test('un crédito ya multienlazado se detiene con revisión/errores y nunca elige un original alternativo', async () => {
  const db = new FakeArea3Db()
  db.multipleExisting = true
  await assert.rejects(() => applyArea3CreditProposalsTx(db, plan()), /AREA3_CREDIT_ALREADY_MULTILINKED_REVIEW/)
  assert.equal(db.statements.filter(({ text }) => /INSERT INTO document_version_credit_links/.test(text)).length, 0)
})

test('el resumen no expone número, proveedor, CIF, importe, OCR, ID de factura ni enlace', () => {
  const summary = JSON.stringify(area3ProposalSummary(plan()))
  for (const privateValue of [original.documentReference!, original.provider!, original.cif!, String(original.totalCents), IDS.original, 'OCR']) assert.doesNotMatch(summary, new RegExp(privateValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(summary, /proposalsEligible/)
})

test('B5 admite el puente PANEL_RECEIVED exacto fr.id sin fabricar drive y conserva las comprobaciones de número/CIF/total/rol', () => {
  const reader = readFileSync('lib/finanzas/finance-credit-note-pending-db.ts', 'utf8')
  assert.match(reader, /PANEL_RECEIVED/)
  assert.match(reader, /source_item_key = .*\.id::text/)
  assert.match(reader, /\$\{lifecycleAlias\}\.source_item_key = \(\$\{invoiceAlias\}\.onedrive_drive_id \|\| ':' \|\| \$\{invoiceAlias\}\.onedrive_item_id\)/)
  assert.match(reader, /s\.document_number = fr\.num_factura/)
  assert.match(reader, /s\.total_cents = b4_importe_bancario_centimos\(fr\.total\)/)
  assert.match(reader, /s\.invoice_fiscal_identity =/)
  assert.match(reader, /s\.party_role = 'PROVEEDOR'/)
  assert.match(reader, /NULLIF\(btrim\(s\.currency_code\), ''\) IS NOT NULL/)
  assert.doesNotMatch(reader, /UPDATE facturas_recibidas|INSERT INTO facturas_recibidas|onedrive_drive_id\s*=\s*['"]/i)
})

console.log('OK: Area 3c DB tests use an injected synthetic transaction only; no connection, DML remoto, Graph, OCR, B4 or human confirmation.')
