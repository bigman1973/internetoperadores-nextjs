import {
  conciliarAliasesContainDocumentaryAlias,
  conciliarAliasesMatch,
} from './conciliar-core'
import { normalizarReferenciaFactura, referenciasFacturaCitadas } from './conciliar-issued-reference-core'
import { assignConciliarProviderPayments } from './conciliar-proveedor-asignacion'

/**
 * Evidencia histórica aislada para G3.
 *
 * No representa una fila de Conciliar, no asigna capacidad y no puede cambiar
 * colores, sumas, reservas ni acciones. Sólo certifica que una selección privada
 * ya aprobada conserva su prueba B4 y que el clasificador real sigue dejando el
 * alias documental en revisión, no en MATCH/verde.
 */
export const G3_HISTORICAL_PROVIDER_EVIDENCE_SCHEMA = 'G3_HISTORICAL_PROVIDER_EVIDENCE_V1' as const

export type G3HistoricalProviderSource = Readonly<{
  movementKey: string
  invoiceKey: string
  bankDate: string
  bankCents: number
  bankText: string
  bankReference: string | null
  supplier: string
  invoiceReference: string
  invoiceDate: string
  invoiceCents: number
  linkCents: number
  linkActive: boolean
  documentActive: boolean
  documentKind: string
  operationState: string
  operationReverted: boolean
  movementState: string
  movementVersion: number
  controlledFile: boolean
  absentFromCurrentProjection: boolean
}>

export type G3HistoricalProviderEvidence = Readonly<{
  schema: typeof G3_HISTORICAL_PROVIDER_EVIDENCE_SCHEMA
  source: 'READ_ONLY_B4'
  /** The real reference parser found the selected received-invoice reference. */
  referenceExact: true
  /** Bank, B4 DOCUMENTO and received-invoice totals close with their real signs. */
  amountExact: true
  /** The invoice was not issued after the bank movement. */
  invoiceDateCoherent: true
  /** Current B4 evidence is active, APLICADA, unreverted and JUSTIFICADO v2+. */
  activeB4Evidence: true
  controlledFile: true
  /** This source remains outside the current Conciliar projection. */
  absentFromCurrentProjection: true
  /** Documentary containment is deliberately review-only, never a supplier MATCH. */
  providerMode: 'DOCUMENTARY_REVIEW_ONLY'
  /** Result returned by the original provider/reference assignment core. */
  classifierKind: 'REVIEW'
  classifierReason: 'PROVEEDOR_SOLO_DOCUMENTAL'
}>

function opaqueKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 300
}
function day(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 4_000
}
function cents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 2_147_483_647
}

/** Structural validation used by the pure G3 evaluator; it never trusts a UI flag. */
export function isG3HistoricalProviderEvidence(value: unknown): value is G3HistoricalProviderEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const evidence = value as Record<string, unknown>
  return evidence.schema === G3_HISTORICAL_PROVIDER_EVIDENCE_SCHEMA
    && evidence.source === 'READ_ONLY_B4'
    && evidence.referenceExact === true
    && evidence.amountExact === true
    && evidence.invoiceDateCoherent === true
    && evidence.activeB4Evidence === true
    && evidence.controlledFile === true
    && evidence.absentFromCurrentProjection === true
    && evidence.providerMode === 'DOCUMENTARY_REVIEW_ONLY'
    && evidence.classifierKind === 'REVIEW'
    && evidence.classifierReason === 'PROVEEDOR_SOLO_DOCUMENTAL'
}

/**
 * Replays the original provider/reference classification against one selected
 * historical B4 source. The selector supplies opaque IDs only; every semantic
 * value below comes from the read row. In particular, a contained supplier name
 * is passed to the existing documentary-alias helper and can only certify REVIEW.
 */
export function classifyG3HistoricalProviderEvidence(source: G3HistoricalProviderSource): G3HistoricalProviderEvidence | null {
  if (!opaqueKey(source.movementKey) || !opaqueKey(source.invoiceKey)
    || !day(source.bankDate) || !day(source.invoiceDate)
    || !text(source.bankText) || !text(source.supplier) || !text(source.invoiceReference)
    || !cents(source.bankCents) || !cents(source.invoiceCents) || !cents(source.linkCents)
    || !Number.isSafeInteger(source.movementVersion) || source.movementVersion < 2) return null

  const normalizedInvoiceReference = normalizarReferenciaFactura(source.invoiceReference)
  const citedReferences = referenciasFacturaCitadas(source.bankText)
  const referenceExact = normalizedInvoiceReference !== null && citedReferences.includes(normalizedInvoiceReference)
  const amountExact = source.bankCents < 0
    && source.invoiceCents > 0
    && source.bankCents === source.linkCents
    && source.invoiceCents === -source.bankCents
  const invoiceDateCoherent = source.invoiceDate <= source.bankDate
  const activeB4Evidence = source.linkActive === true
    && source.documentActive === true
    && source.documentKind === 'FACTURA_RECIBIDA'
    && source.operationState === 'APLICADA'
    && source.operationReverted === false
    && source.movementState === 'JUSTIFICADO'
  if (!referenceExact || !amountExact || !invoiceDateCoherent || !activeB4Evidence
    || source.controlledFile !== true || source.absentFromCurrentProjection !== true) return null

  const exactProvider = conciliarAliasesMatch([source.bankText], [source.supplier])
  const documentaryProvider = !exactProvider && conciliarAliasesContainDocumentaryAlias([source.bankText], [source.supplier])
  if (!documentaryProvider) return null

  // Use the actual text, isolated bank reference, invoice number, date and total.
  // The shared assignment core is the authority for provider/reference behaviour;
  // this wrapper rejects an exact result instead of relabelling it as review.
  const decision = assignConciliarProviderPayments([{
    movementId: source.movementKey,
    fecha: source.bankDate,
    importeBancoCentimos: source.bankCents,
    conceptoBanco: source.bankText,
    referenciaBanco: source.bankReference,
    candidates: [{
      invoiceId: source.invoiceKey,
      referencia: source.invoiceReference,
      fecha: source.invoiceDate,
      vencimiento: null,
      importeDisponibleCentimos: -source.invoiceCents,
      providerMatch: 'DOCUMENTARY',
    }],
  }]).get(source.movementKey)
  if (decision?.kind !== 'REVIEW' || decision.reason !== 'PROVEEDOR_SOLO_DOCUMENTAL' || decision.invoiceId !== source.invoiceKey) return null

  return {
    schema: G3_HISTORICAL_PROVIDER_EVIDENCE_SCHEMA,
    source: 'READ_ONLY_B4',
    referenceExact: true,
    amountExact: true,
    invoiceDateCoherent: true,
    activeB4Evidence: true,
    controlledFile: true,
    absentFromCurrentProjection: true,
    providerMode: 'DOCUMENTARY_REVIEW_ONLY',
    classifierKind: 'REVIEW',
    classifierReason: 'PROVEEDOR_SOLO_DOCUMENTAL',
  }
}
