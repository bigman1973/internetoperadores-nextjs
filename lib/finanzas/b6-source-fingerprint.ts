/*
 * Subconjunto puro compatible con lib/finanzas/b6-remesas-pure.ts.
 * B7 lo mantiene local para no acoplar este artefacto al repositorio integrador.
 */
import { createHash } from 'node:crypto'

export const B6_AUDIT_SCHEMA_VERSION = 'B6_REMESAS_V1'
export const B6_FACTURAS_SOURCE_HASH_VERSION = 'B6_FACTURAS_SOURCE_V1'

type JsonRecord = Record<string, unknown>

export type B6RemesaFuente = Readonly<{
  id: number
  ispGestionId: number
  fecha: string
  totalCentimos: number
}>

export type B6FacturaFuente = Readonly<{
  id: number
  ispGestionId: number
  fecha: string
  totalCentimos: number
}>

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Canonical JSON matches B6: JSON primitives and recursively sorted object keys. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('B6_CANONICAL_NON_FINITE_NUMBER')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as JsonRecord
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  throw new Error('B6_CANONICAL_UNSUPPORTED_VALUE')
}

export function canonicalSha256(value: unknown): string {
  return sha256(canonicalJson(value))
}

export function remesaSourceFingerprint(remesa: B6RemesaFuente): string {
  return canonicalSha256({ version: B6_FACTURAS_SOURCE_HASH_VERSION, remesa })
}

export function facturaSourceFingerprint(factura: B6FacturaFuente): string {
  return canonicalSha256(factura)
}

/** Identical to B6 facturasSourceHash: sorted by ISP invoice id and duplicate-safe. */
export function facturasSourceHash(facturas: readonly B6FacturaFuente[]): string {
  const sorted = [...facturas].sort((left, right) => left.id - right.id)
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1].id === sorted[index].id) throw new Error('B6_SOURCE_DUPLICATE_FACTURA')
  }
  return canonicalSha256({ version: B6_FACTURAS_SOURCE_HASH_VERSION, facturas: sorted })
}

/** The immutable `auditoria_remesa_b6.source_hash` created by B6 associationSnapshot. */
export function associationSourceHash(remesa: B6RemesaFuente, facturas: readonly B6FacturaFuente[]): string {
  const sorted = [...facturas].sort((left, right) => left.id - right.id)
  return canonicalSha256({ version: B6_AUDIT_SCHEMA_VERSION, remesa, facturas: sorted })
}
