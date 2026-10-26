import { createHash } from 'node:crypto'
import { derivedUuidV4 } from '@/lib/finanzas/easy-auto-core'
import type { ConciliarCommand, ConciliarProjectionPayload } from './conciliar-contract'

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
