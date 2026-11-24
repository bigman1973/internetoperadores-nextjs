import { createHash } from 'node:crypto'
import { z } from 'zod'

/** New analytic DTOs only. Monetary values are integer cents encoded as JSON text. */
export type RentabilidadKind = 'contract' | 'product' | 'tariffRule' | 'costRule' | 'externalCost' | 'cost' | 'reference' | 'exception' | 'decision'
export type PeriodMonths = 1 | 3 | 6 | 12
export type DataState = 'REAL' | 'ESTIMADO' | 'PENDIENTE' | 'REFERENCIA'
export type JsonRecord = Record<string, any>
export type ImportPayload = { source?: string; contracts?: JsonRecord[]; lines?: JsonRecord[]; costs?: JsonRecord[]; references?: JsonRecord[]; products?: JsonRecord[]; rules?: JsonRecord[] }
export type ImportReport = { leidas: number; insertadas: number; actualizadas: number; sinCambios: number; rechazadas: number; errores: { collection: string; row: number; code: string }[]; sourceHash: string; byCollection: Record<string, Omit<ImportReport, 'sourceHash' | 'byCollection'>> }
export type RentabilidadInputs = { contracts: JsonRecord[]; lines: JsonRecord[]; costs: JsonRecord[]; rules: JsonRecord[]; products: JsonRecord[]; runs: JsonRecord[]; decisions: JsonRecord[]; references: JsonRecord[] }
export type VersionCandidate = { kind: RentabilidadKind; key: string; payload: JsonRecord; sourceHash: string; contratoServicioId?: number; contratoDraxtonId?: string; contratoProveedorDraxtonId?: string; personalContratoDraxtonId?: string; clienteWebId?: number }
export type BilledLine = { key: string; codigoContratoIsp: string; fechaFuente: string; mesServicio: string; concepto: string; importeBaseCentimos: string; sourceHash: string; payload: JsonRecord; facturaISPId?: number }

export class RentabilidadError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(code); this.name = 'RentabilidadError' }
}
export const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/)
export const keySchema = z.string().trim().min(1).max(240)
export const actorSchema = z.number().int().positive().max(2_147_483_647)
const collection = z.array(z.record(z.unknown())).max(100_000)
export const initialSchema = z.object({ source: z.string().min(1).max(80).optional(), contracts: collection.optional(), lines: collection.optional(), costs: collection.optional(), references: collection.optional(), products: collection.optional(), rules: collection.optional() }).strict()

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (typeof value === 'bigint') return JSON.stringify(value.toString())
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as JsonRecord)[key])}`).join(',')}}`
  }
  throw new RentabilidadError('INVALID_JSON')
}
export function sourceHash(value: unknown): string { return createHash('sha256').update(canonicalJson(value)).digest('hex') }
export function safePayload(value: unknown, maxBytes = 128_000): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new RentabilidadError('INVALID_PAYLOAD')
  const forbidden = /^(?:.*(?:password|credential|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|secret).*)$|^(token|iban|cuentaCargo)$/i
  function inspect(item: unknown, depth: number) {
    if (depth > 15) throw new RentabilidadError('PAYLOAD_TOO_DEEP')
    if (Array.isArray(item)) { for (const child of item) inspect(child, depth + 1); return }
    if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        if (forbidden.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new RentabilidadError('PROTECTED_FIELD')
        inspect(child, depth + 1)
      }
    }
  }
  inspect(value, 0)
  const text = canonicalJson(value)
  if (Buffer.byteLength(text) > maxBytes) throw new RentabilidadError('PAYLOAD_TOO_LARGE')
  return JSON.parse(text)
}
export function exactCents(value: unknown, alreadyCents = false): string {
  const text = String(value ?? '').trim()
  if (alreadyCents) {
    if (!/^-?\d+$/.test(text)) throw new RentabilidadError('INVALID_CENTS')
    return BigInt(text).toString()
  }
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new RentabilidadError('INVALID_MONEY')
  const negative = text.startsWith('-'); const [whole, decimal = ''] = text.replace(/^-/, '').split('.')
  return ((BigInt(whole) * BigInt(100) + BigInt(decimal.padEnd(2, '0'))) * (negative ? -BigInt(1) : BigInt(1))).toString()
}
/** Source precision is retained separately; presentation cents round half away from zero. */
export function canonicalDecimal(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!/^-?\d+(?:\.\d{1,40})?$/.test(text)) throw new RentabilidadError('INVALID_MONEY')
  const negative = text.startsWith('-'); const [whole, fractional = ''] = text.replace(/^-/, '').split('.')
  const integer = BigInt(whole).toString(); const fraction = fractional.replace(/0+$/, '')
  const unsigned = `${integer}${fraction ? `.${fraction}` : ''}`
  return negative && unsigned !== '0' ? `-${unsigned}` : unsigned
}
export function moneyToCents(value: unknown): string {
  const decimal = canonicalDecimal(value); const negative = decimal.startsWith('-')
  const [whole, fraction = ''] = decimal.replace(/^-/, '').split('.')
  const rounded = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0').slice(0, 2)) + (Number(fraction[2] ?? 0) >= 5 ? BigInt(1) : BigInt(0))
  return (rounded * (negative ? -BigInt(1) : BigInt(1))).toString()
}
export function isoDate(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(text)) throw new RentabilidadError('INVALID_DATE')
  const date = new Date(`${text}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new RentabilidadError('INVALID_DATE')
  return text
}
export function contractCode(row: JsonRecord): string {
  const value = row.codigoContratoIsp ?? row.codigoContrato ?? row.contractCode ?? row.numeroContrato
  // Keep leading zeroes. Never claim an Excel code is the ISP integer id.
  return keySchema.parse(typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value)
}
export function normalizedName(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase() }

export const INITIAL_PRODUCTS = [
  ['RED_PROPIA', 'Red propia'], ['TELEFONICA', 'Telefónica'], ['DRAXTON_TELECO', 'Draxton telecomunicaciones'],
  ['AIRE', 'Aire Networks'], ['COMISIONES_AIRE', 'Comisiones Aire'], ['XFERA', 'Cablemóvil/Xfera'], ['COMISIONES_XFERA', 'Comisiones Xfera'],
  ['HOTSPOT', 'Hotspot (Xfera)'], ['WILDIX', 'Wildix'], ['GOOGLE_WORKSPACE', 'Google Workspace'], ['CLOUD_101', 'Cloud 101'],
  ['ACENS', 'Acens (Microsoft 365, Panda)'], ['STARLINK', 'Starlink'], ['ADAMO', 'Adamo'], ['DACAST', 'Dacast'],
  ['DOMINIOS', 'Dominios (Nominalia)'], ['ZOOM', 'Zoom (West Telco)'], ['SHEETGO', 'Sheetgo'], ['IO_SIN_COSTE', 'Servicios IO sin coste de proveedor'],
  ['SERVICIOS_IT', 'Servicios IT (personal)'], ['OTROS', 'Otros'],
].map(([key, nombre]) => ({ key, nombre, active: true }))
export const INITIAL_TARIFF_RULES = [
  ['CANARIO', 'CONTAINS', 'CANARIO', 'Aire Networks', 'AIRE'], ['TTB', 'CONTAINS', 'TTB', 'Cablemóvil/Xfera', 'XFERA'],
  ['LIFE', 'CONTAINS', 'LIFE', 'Cablemóvil/Xfera', 'XFERA'], ['CM', 'PREFIX', 'CM-', 'Cablemóvil/Xfera', 'XFERA'],
  ['ADAMO', 'CONTAINS', 'ADAMO', 'Adamo', 'ADAMO'], ['T', 'PREFIX', 'T-', 'Telefónica', 'TELEFONICA'],
  ['VOLIBRI', 'CONTAINS', 'VOLIBRI', 'Red propia', 'RED_PROPIA'], ['PERDIU', 'CONTAINS', 'PERDIU', 'Red propia', 'RED_PROPIA'],
].map(([key, matchType, pattern, proveedor, productoId], index) => ({ key: `initial:${key}`, type: 'tariffRule', matchType, pattern, proveedor, productoId, priority: index + 1, active: true, onlyWhenProviderMissing: true, source: 'ENCARGO_20261124' }))
