import { createHash } from 'node:crypto'
import { derivedUuidV4 } from '@/lib/finanzas/easy-auto-core'
import { normalizarReferenciaFactura, referenciasFacturaCitadas, type ConciliarCommand, type ConciliarProjectionPayload } from './conciliar-contract'

/** Núcleo exclusivamente servidor: el contrato UI queda libre de node:crypto. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>
    return `{${Object.keys(row).filter(key => row[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(row[key])}`).join(',')}}`
  }
  const rendered = JSON.stringify(value)
  if (rendered === undefined) throw new Error('CONCILIAR_CANONICAL_UNSUPPORTED')
  return rendered
}

export function conciliarHash(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex')
}

/**
 * A projection identifier is deliberately opaque to clients and safe as an URL path
 * segment. It is stable for the immutable source identity, but never exposes a bank,
 * invoice, remittance or document ID such as `cobro:<movimiento>`.
 */
export function conciliarProjectionRowId(tab: 'COBROS' | 'EMITIDAS' | 'PAGOS' | 'RECIBIDAS', sourceIdentity: string): string {
  if (!sourceIdentity || sourceIdentity.length > 300) throw new Error('CONCILIAR_SOURCE_ID_INVALID')
  return derivedUuidV4('CONCILIAR_PROJECTION_ROW_V1', `${tab}:${sourceIdentity}`)
}

/** The order requested by the desk is a semantic order, not alphabetical SQL order. */
export function conciliarColorRank(color: unknown): number {
  if (color === 'VERDE') return 0
  if (color === 'AMBAR') return 1
  if (color === 'ROJO') return 2
  return 3
}

/**
 * Exact human-readable identity comparison: accents/case/space presentation may
 * differ, but tokens are neither removed nor reordered. This is an alias check, not
 * fuzzy matching and must never be used as an amount-only fallback.
 */
export function conciliarExactCounterparty(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFKC')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim()
    .toLocaleUpperCase('es-ES')
  return normalized && normalized.length <= 300 ? normalized : null
}

export function conciliarAliasesMatch(left: readonly unknown[], right: readonly unknown[]): boolean {
  const leftAliases = new Set(left.map(conciliarExactCounterparty).filter((value): value is string => value !== null))
  if (!leftAliases.size) return false
  return right.map(conciliarExactCounterparty).some((value): value is string => value !== null && leftAliases.has(value))
}

/**
 * A bank export can persist its literal recipient together with the transfer
 * concept in one field (for example, `PROVEEDOR, S.L. PAGO FACTURA ...`). This
 * is a review-only lookup aid: it accepts an already stored full supplier alias
 * only at non-alphanumeric boundaries. It never changes the alias, never
 * creates a supplier, and callers must not use it to make a match exact.
 */
export function conciliarAliasesContainDocumentaryAlias(texts: readonly unknown[], aliases: readonly unknown[]): boolean {
  const haystacks = texts.map(conciliarExactCounterparty).filter((value): value is string => value !== null)
  const needles = aliases.map(conciliarExactCounterparty).filter((value): value is string => value !== null && value.length >= 4)
  return needles.some(alias => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const exactAlias = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u')
    return haystacks.some(text => exactAlias.test(text))
  })
}

export function conciliarDecisionHash(payload: ConciliarProjectionPayload): string {
  return conciliarHash({ schema: 'CONCILIAR_V1', source: payload.source, sourceFingerprint: payload.sourceFingerprint, row: payload.row })
}

export function conciliarRequestHash(actorId: number, command: ConciliarCommand): string {
  if (!Number.isSafeInteger(actorId) || actorId < 1) throw new Error('CONCILIAR_ACTOR_INVALID')
  return conciliarHash({ schema: 'CONCILIAR_V1', actorId, command })
}

export function safeInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'bigint' && value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value)
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

export function isoDay(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  return null
}

/**
 * A received-invoice candidate is supplied only from an existing invoice.  The
 * caller must derive matchesCounterparty from the current bank aliases (including
 * a confirmed recipient), never from a new or inferred supplier record.
 */
export type ReceivedInvoicePaymentCandidate<T = unknown> = Readonly<{
  id: string
  referencia: string | null
  fecha: string | null
  vencimiento: string | null
  importeDocumentoCentimos: number
  matchesCounterparty: boolean
  source: T
}>

export type ReceivedInvoicePaymentMatch<T = unknown> =
  | Readonly<{ kind: 'NONE' }>
  | Readonly<{ kind: 'EXACT'; candidate: ReceivedInvoicePaymentCandidate<T> }>
  | Readonly<{
    kind: 'REVIEW'
    candidate: ReceivedInvoicePaymentCandidate<T>
    reason: 'IMPORTE_DISTINTO' | 'REFERENCIA_DISCREPANTE' | 'FECHA_POSTERIOR' | 'CANDIDATAS_AMBIGUAS'
  }>

function calendarDay(value: string | null): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? Math.trunc(parsed.getTime() / 86_400_000) : null
}

/** Valid ISO calendar date for the read-side historical cutoff; no rebuild state. */
export function conciliarCutoffDay(value: unknown): string | null {
  return typeof value === 'string' && calendarDay(value) !== null ? value : null
}

/** Invalid/missing dates stay in the active list so a read-side cutoff never hides them. */
export function isConciliarHistoricIssued(fechaEmision: unknown, cutoffDate: unknown): boolean {
  const fecha = conciliarCutoffDay(fechaEmision), cutoff = conciliarCutoffDay(cutoffDate)
  return fecha !== null && cutoff !== null && fecha < cutoff
}

function referenceNumberDistance(left: string | null, right: string | null): bigint | null {
  const leftDigits = left?.replace(/\D/g, '') ?? ''
  const rightDigits = right?.replace(/\D/g, '') ?? ''
  if (!leftDigits || !rightDigits) return null
  try {
    const difference = BigInt(leftDigits) - BigInt(rightDigits)
    return difference < BigInt(0) ? -difference : difference
  } catch {
    return null
  }
}

function compareNullableBigint(left: bigint | null, right: bigint | null): number {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  return left < right ? -1 : left > right ? 1 : 0
}

function distanceToBankDay(value: string | null, bankDay: number): number | null {
  const candidateDay = calendarDay(value)
  return candidateDay === null ? null : Math.abs(candidateDay - bankDay)
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  return left - right
}

/** Prefer syntactically explicit invoice references over bare issuer-like
 * fragments. A supplier such as `BUTPO 2000, S.L.` is not a second invoice
 * reference when the bank also says `PAGO FACTURA 260007`. */
function documentaryCitedReferences(text: string): readonly string[] {
  const raw = referenciasFacturaCitadas(text)
  const normalized = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES')
  const explicit = new Set<string>()
  const syntax = /(?:^|[^A-Z0-9])(?:FACTURA|FACT\.?|FRA\.?|F)\s*(?:N(?:U)?M(?:ERO)?\s*)?[-#:/. ]*([A-Z]{0,6}\s*\d{2,}(?:\s*[/-]\s*\d{1,10})?)(?=$|[^A-Z0-9])/g
  for (const match of normalized.matchAll(syntax)) {
    const reference = normalizarReferenciaFactura(match[1])
    if (reference && reference.length >= 4) explicit.add(reference)
  }
  if (explicit.size) return raw.filter(reference => explicit.has(reference))
  const values = new Set(raw)
  return raw.filter(reference => {
    const wrapper = /^(?:FACTURA|FACT|FRA|F)(\d+)$/.exec(reference)
    return !wrapper || !values.has(wrapper[1])
  })
}

/**
 * Keeps an amount match from selecting a different invoice when the bank cites a
 * number. All returned candidates have a confirmed/known counterparty alias and
 * a valid emission date. A later emission date remains visible only as an amber
 * contradiction, so a sync/billing date anomaly is reviewable but cannot close a
 * payment. Vencimiento is a ranking clue only; it never makes a payment exact.
 */
export function classifyReceivedInvoicePaymentCandidates<T>(input: Readonly<{
 importeBancoCentimos: number
 fechaBanco: string
 conceptoBanco: string
  /** Opt-in read-side review: a later issue date remains amber, never exact. */
  includeFutureDateReview?: boolean
 candidates: readonly ReceivedInvoicePaymentCandidate<T>[]
}>): ReceivedInvoicePaymentMatch<T> {
  if (!Number.isSafeInteger(input.importeBancoCentimos)) return { kind: 'NONE' }
  const bankDay = calendarDay(input.fechaBanco)
  if (bankDay === null) return { kind: 'NONE' }
  const cited = documentaryCitedReferences(input.conceptoBanco)
  const eligible = input.candidates.filter(candidate => {
    const issuedDay = calendarDay(candidate.fecha)
    return candidate.matchesCounterparty && issuedDay !== null && (input.includeFutureDateReview === true || issuedDay <= bankDay) && Number.isSafeInteger(candidate.importeDocumentoCentimos)
  })
  if (!eligible.length) return { kind: 'NONE' }

  const ordered = [...eligible].sort((left, right) => {
    const leftReference = normalizarReferenciaFactura(left.referencia)
    const rightReference = normalizarReferenciaFactura(right.referencia)
    const leftAll = cited.length > 0 && leftReference !== null && cited.every(reference => reference === leftReference)
    const rightAll = cited.length > 0 && rightReference !== null && cited.every(reference => reference === rightReference)
    if (leftAll !== rightAll) return leftAll ? -1 : 1
    const leftAny = cited.length > 0 && leftReference !== null && cited.some(reference => reference === leftReference)
    const rightAny = cited.length > 0 && rightReference !== null && cited.some(reference => reference === rightReference)
    if (leftAny !== rightAny) return leftAny ? -1 : 1
    const leftNumberDistance = cited.length ? cited.reduce<bigint | null>((best, reference) => {
      const distance = referenceNumberDistance(leftReference, reference)
      return best === null || (distance !== null && distance < best) ? distance : best
    }, null) : null
    const rightNumberDistance = cited.length ? cited.reduce<bigint | null>((best, reference) => {
      const distance = referenceNumberDistance(rightReference, reference)
      return best === null || (distance !== null && distance < best) ? distance : best
    }, null) : null
    const numberOrder = compareNullableBigint(leftNumberDistance, rightNumberDistance)
    if (numberOrder) return numberOrder
    const dueOrder = compareNullableNumber(distanceToBankDay(left.vencimiento, bankDay), distanceToBankDay(right.vencimiento, bankDay))
    if (dueOrder) return dueOrder
    const issueOrder = compareNullableNumber(distanceToBankDay(left.fecha, bankDay), distanceToBankDay(right.fecha, bankDay))
    if (issueOrder) return issueOrder
    return left.id.localeCompare(right.id)
  })

  if (cited.length) {
    const exactReference = ordered.filter(candidate => {
      const reference = normalizarReferenciaFactura(candidate.referencia)
      return reference !== null && cited.every(value => value === reference)
    })
    if (exactReference.length === 1) {
      const candidate = exactReference[0]
      if (candidate.importeDocumentoCentimos !== input.importeBancoCentimos) return { kind: 'REVIEW', candidate, reason: 'IMPORTE_DISTINTO' }
      if (calendarDay(candidate.fecha)! > bankDay) return { kind: 'REVIEW', candidate, reason: 'FECHA_POSTERIOR' }
      return { kind: 'EXACT', candidate }
    }
    return {
      kind: 'REVIEW', candidate: ordered[0],
      reason: exactReference.length ? 'IMPORTE_DISTINTO' : 'REFERENCIA_DISCREPANTE',
    }
  }
  // An amount alone is never documentary identity. Keep the best same-provider
  // candidate visible for human review, even when its amount happens to match.
  return { kind: 'REVIEW', candidate: ordered[0], reason: 'REFERENCIA_DISCREPANTE' }
}
