import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { G3HistoricalProviderSelector } from './g3-historical-reader'

export const G3_HISTORICAL_PROVIDER_SELECTOR_SCHEMA = 'CONCILIAR_G3_HISTORICAL_PROVIDER_SELECTOR_V1' as const

type SelectorFile = Readonly<{
  schema: unknown
  movementId: unknown
  invoiceId: unknown
}>

/** Reads one private opaque selector; no identifiers are returned to runner output. */
export function readPrivateG3HistoricalProviderSelector(fileName: string, repositoryRoot: string): G3HistoricalProviderSelector {
  const file = resolve(fileName)
  if (file.startsWith(`${resolve(repositoryRoot)}/`)) throw new Error('G3_HISTORICAL_SELECTOR_IN_REPOSITORY')
  let stat: ReturnType<typeof lstatSync>
  try { stat = lstatSync(file) } catch { throw new Error('G3_HISTORICAL_SELECTOR_UNAVAILABLE') }
  const permission = stat.mode & 0o777
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || ![0o400, 0o600].includes(permission) || stat.size < 1 || stat.size > 8 * 1024) {
    throw new Error('G3_HISTORICAL_SELECTOR_UNSAFE')
  }
  let parsed: SelectorFile
  try { parsed = JSON.parse(readFileSync(file, 'utf8')) as SelectorFile } catch { throw new Error('G3_HISTORICAL_SELECTOR_INVALID') }
  if (parsed?.schema !== G3_HISTORICAL_PROVIDER_SELECTOR_SCHEMA
    || typeof parsed.movementId !== 'string' || parsed.movementId.length < 1 || parsed.movementId.length > 300
    || typeof parsed.invoiceId !== 'string' || parsed.invoiceId.length < 1 || parsed.invoiceId.length > 300) {
    throw new Error('G3_HISTORICAL_SELECTOR_INVALID')
  }
  return { movementId: parsed.movementId, invoiceId: parsed.invoiceId }
}
