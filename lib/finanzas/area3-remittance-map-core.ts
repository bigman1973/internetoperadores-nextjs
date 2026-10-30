import { createHash } from 'node:crypto'
import { parseReceiptComposition } from './remittance-payment-receipts-core'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/

export const AREA3_REMITTANCE_MAP_SCHEMA_VERSION = 'AREA3_REMITTANCE_MAP_V1' as const

export type Area3RemittanceMapProposal = Readonly<{
  propuestaId: string
  generacionId: string
  remesaId: number
  compositionHash: string
  facturaEmitidaIds: readonly string[]
}>

/**
 * Observational source tuple for one FI. These values neither create an alias nor
 * authorize B4/B6/B7: they prove that the already-persisted FI→ISP FK still has
 * the imported identity corroboration that made such a map admissible.
 */
export type Area3RemittanceMapEvidence = Readonly<{
  facturaEmitidaId: string
  facturaISPId: number | null
  facturaISPGestionId: number | null
  remesaId: number | null
  identityAuditPresent: boolean
  facturaEmitidaOrigenSistema: string | null
  facturaEmitidaRemoteId: string | null
  facturaEmitidaNumero: string | null
  facturaISPNumero: string | null
  facturaEmitidaSerie: string | null
  facturaISPSerie: string | null
  facturaEmitidaCliente: string | null
  facturaISPCliente: string | null
  facturaEmitidaCif: string | null
  facturaISPCif: string | null
}>

export type Area3RemittanceMapPreflight = Readonly<{
  complete: boolean
  missingReceiptCount: number
  proposalSetHash: string | null
  expectedReceiptCount: number
}>

type RawRemittanceProposal = Readonly<{
  propuestaId: unknown
  generacionId: unknown
  metodo: unknown
  lineas: unknown
  composicion: unknown
}>

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('AREA3_REMITTANCE_MAP_NON_FINITE')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  throw new Error('AREA3_REMITTANCE_MAP_UNSUPPORTED')
}

export function area3RemittanceMapHash(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex')
}

function invoiceId(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null
}

function safePositiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= 2_147_483_647 ? value as number : null
}

function json(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return null }
}

/**
 * Identity normalization is intentionally limited to Unicode NFKC, whitespace
 * folding and invariant case. It is used only to compare two already-linked
 * imported source fields; it never performs fuzzy matching, removes tokens, or
 * selects an FI/ISP pair by number, client, amount or remote ID.
 */
function normalizedIdentityText(value: unknown, maximum = 300): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es-ES')
  return normalized.length > 0 && normalized.length <= maximum ? normalized : null
}

function normalizedNullableIdentityText(value: unknown, maximum = 300): string | null {
  if (value === null) return ''
  return normalizedIdentityText(value, maximum)
}

function evidenceHasCurrentImportedIdentity(row: Area3RemittanceMapEvidence): boolean {
  const ispGestionId = safePositiveInteger(row.facturaISPGestionId)
  const remoteId = normalizedIdentityText(row.facturaEmitidaRemoteId, 80)
  const expectedRemoteId = ispGestionId === null ? null : String(ispGestionId)
  const emittedNumber = normalizedIdentityText(row.facturaEmitidaNumero, 240)
  const ispNumber = normalizedIdentityText(row.facturaISPNumero, 240)
  const emittedSerie = normalizedNullableIdentityText(row.facturaEmitidaSerie, 120)
  const ispSerie = normalizedNullableIdentityText(row.facturaISPSerie, 120)
  const emittedClient = normalizedIdentityText(row.facturaEmitidaCliente, 300)
  const ispClient = normalizedIdentityText(row.facturaISPCliente, 300)
  const emittedCif = normalizedNullableIdentityText(row.facturaEmitidaCif, 80)
  const ispCif = normalizedNullableIdentityText(row.facturaISPCif, 80)
  return row.identityAuditPresent === true
    && normalizedIdentityText(row.facturaEmitidaOrigenSistema, 80) === 'ispgestion'
    && ispGestionId !== null
    && remoteId === expectedRemoteId
    && emittedNumber !== null && emittedNumber === ispNumber
    && emittedSerie !== null && emittedSerie === ispSerie
    && emittedClient !== null && emittedClient === ispClient
    && emittedCif !== null && emittedCif === ispCif
}

/**
 * Parses only the persisted B4 REMESA line and its complete composition. It is
 * intentionally stricter than a UI label: malformed siblings are not omitted.
 */
export function area3RemittanceMapProposalFromRaw(row: RawRemittanceProposal): Area3RemittanceMapProposal | null {
  const propuestaId = invoiceId(row.propuestaId)
  const generacionId = invoiceId(row.generacionId)
  if (!propuestaId || !generacionId || !['REMESA_VENCIMIENTO', 'REMESA_UNION', 'REMESA_RESIDUO'].includes(String(row.metodo))) return null
  const lineas = json(row.lineas)
  if (!Array.isArray(lineas) || lineas.length !== 1) return null
  const line = lineas[0]
  if (!line || typeof line !== 'object' || Array.isArray(line)) return null
  const rawLine = line as Record<string, unknown>
  if (rawLine.tipo !== 'DOCUMENTO' || rawLine.tipoDocumento !== 'REMESA' || typeof rawLine.sourceId !== 'string' || !/^\d+$/.test(rawLine.sourceId)) return null
  const remesaId = safePositiveInteger(Number(rawLine.sourceId))
  if (!remesaId) return null
  try {
    const composition = parseReceiptComposition(json(row.composicion))
    return {
      propuestaId,
      generacionId,
      remesaId,
      compositionHash: composition.hash,
      facturaEmitidaIds: [...new Set(composition.entries.map(entry => entry.facturaEmitidaId))].sort(),
    }
  } catch {
    return null
  }
}

/**
 * Hashes the complete current generation subset for one remesa. A single proposal
 * never authorizes an incomplete sibling set; this is deliberately the same set B7
 * locks before it may create B6 membership.
 */
export function area3RemittanceProposalSetHash(proposals: readonly Area3RemittanceMapProposal[]): string | null {
  if (!Array.isArray(proposals) || proposals.length < 1 || proposals.length > 2_000) return null
  const first = proposals[0]
  const remesaId = safePositiveInteger(first?.remesaId)
  const generationId = invoiceId(first?.generacionId)
  if (!remesaId || !generationId) return null
  const seenProposals = new Set<string>()
  const normalized: Array<{ propuestaId: string; compositionHash: string; facturaEmitidaIds: string[] }> = []
  for (const proposal of proposals) {
    const propuestaId = invoiceId(proposal.propuestaId)
    const proposalGeneration = invoiceId(proposal.generacionId)
    const compositionHash = typeof proposal.compositionHash === 'string' && SHA256.test(proposal.compositionHash) ? proposal.compositionHash.toLowerCase() : null
    if (!propuestaId || !proposalGeneration || proposalGeneration !== generationId || proposal.remesaId !== remesaId || !compositionHash || seenProposals.has(propuestaId)) return null
    seenProposals.add(propuestaId)
    const ids: string[] = []
    for (const rawId of proposal.facturaEmitidaIds) {
      const id = invoiceId(rawId)
      if (!id) return null
      ids.push(id)
    }
    if (!ids.length) return null
    normalized.push({ propuestaId, compositionHash, facturaEmitidaIds: ids.sort() })
  }
  return area3RemittanceMapHash({
    schemaVersion: AREA3_REMITTANCE_MAP_SCHEMA_VERSION,
    remesaId,
    generacionId: generationId,
    proposals: normalized.sort((left, right) => left.propuestaId.localeCompare(right.propuestaId)),
  })
}

/**
 * Shared read-only G7 preflight. A green remittance requires the explicit FI→ISP
 * FK, the exact current remesa membership, the audited imported identity map, and
 * corroboration of remote ID, number and client. It deliberately never turns
 * equal amounts, names or references into a map.
 */
export function evaluateArea3RemittanceMapPreflight(
  proposals: readonly Area3RemittanceMapProposal[],
  evidence: readonly Area3RemittanceMapEvidence[],
): Area3RemittanceMapPreflight {
  const proposalSetHash = area3RemittanceProposalSetHash(proposals)
  if (!proposalSetHash) return { complete: false, missingReceiptCount: 0, proposalSetHash: null, expectedReceiptCount: 0 }
  const expected = new Set<string>()
  for (const proposal of proposals) for (const rawId of proposal.facturaEmitidaIds) {
    const id = invoiceId(rawId)
    if (!id) return { complete: false, missingReceiptCount: 0, proposalSetHash: null, expectedReceiptCount: 0 }
    expected.add(id)
  }
  const byInvoice = new Map<string, Area3RemittanceMapEvidence>()
  const duplicateEvidence = new Set<string>()
  for (const row of evidence) {
    const id = invoiceId(row.facturaEmitidaId)
    if (!id) continue
    if (byInvoice.has(id)) duplicateEvidence.add(id)
    else byInvoice.set(id, row)
  }
  let missing = 0
  for (const id of expected) {
    const row = byInvoice.get(id)
    const ispId = safePositiveInteger(row?.facturaISPId)
    if (!row || duplicateEvidence.has(id) || !ispId || row.remesaId !== proposals[0]!.remesaId || !evidenceHasCurrentImportedIdentity(row)) missing += 1
  }
  return { complete: missing === 0, missingReceiptCount: missing, proposalSetHash, expectedReceiptCount: expected.size }
}

/** Shared G7 grouping for projection, release readback and confirmation. Every
 * sibling in one current remesa generation receives the exact same preflight;
 * callers cannot promote a single proposal by omitting its siblings. */
export function evaluateArea3RemittanceMapPreflights(
  proposals: readonly Area3RemittanceMapProposal[],
  evidence: readonly Area3RemittanceMapEvidence[],
): ReadonlyMap<string, Area3RemittanceMapPreflight> {
  const byRemesa = new Map<string, Area3RemittanceMapProposal[]>()
  for (const proposal of proposals) {
    const key = `${proposal.generacionId}:${proposal.remesaId}`
    byRemesa.set(key, [...(byRemesa.get(key) ?? []), proposal])
  }
  const result = new Map<string, Area3RemittanceMapPreflight>()
  for (const members of byRemesa.values()) {
    const preflight = evaluateArea3RemittanceMapPreflight(members, evidence)
    for (const proposal of members) result.set(proposal.propuestaId, preflight)
  }
  return result
}

export function area3RemittanceMapAmberReason(preflight: Area3RemittanceMapPreflight | undefined): string {
  const missing = preflight?.missingReceiptCount
  if (Number.isSafeInteger(missing) && missing! > 0) return `Falta enlazar ${missing} recibos.`
  return 'No se puede comprobar el enlace FI–ISP de esta remesa.'
}
