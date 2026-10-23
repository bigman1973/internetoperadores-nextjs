import { createHash } from 'node:crypto'

/**
 * This module intentionally has no Prisma/PG/Next dependency.  The production
 * backfill never supplies manual proof, so its only normal output is PROPUESTA
 * or YA_B4.  `planSyntheticManualEvidence` exists for fixture-level proof of
 * the narrow future/manual contract; it is not called by the backfill.
 */
export type HistoricalClassification = 'PROPUESTA' | 'YA_B4' | 'JUSTIFICADO'
export type B4State = 'JUSTIFICADO' | 'NO_REQUIERE' | string | null

export type HistoricalDocumentDto = Readonly<{
  tipo: string
  sourceId: string
  documentoConciliableId: string | null
  referencia: string
  importeObjetivoCentimos: number | null
  archivoDisponible: boolean
  version?: number
  stale?: boolean
}>

export type HistoricalPlanInput = Readonly<{
  movimientoId: string
  b4State: B4State
  importeBancoCentimos: number | null
  documentos: readonly HistoricalDocumentDto[]
  motivos: readonly string[]
}>

export type HistoricalPlan = Readonly<{
  clasificacion: HistoricalClassification
  procedencia: 'DESCONOCIDO' | 'MANUAL'
  motivos: readonly string[]
  documentos: readonly HistoricalDocumentDto[]
  importeBancoCentimos: number | null
}>

const distinctSorted = (values: readonly string[]) => [...new Set(values.filter(Boolean))].sort()

/** Decimal text only: neither Number() nor float rounding is allowed here. */
export function decimalTextToCentimos(value: string | null): number | null {
  if (value === null) return null
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const sign = match[1] === '-' ? -1 : 1
  const whole = BigInt(match[2])
  const fraction = (match[3] ?? '').padEnd(2, '0')
  const cents = whole * BigInt(100) + BigInt(fraction || '0')
  const signed = sign === -1 ? -cents : cents
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) return null
  return Number(signed)
}

/** Canonical JSON is used for stable SHA-256 source hashes, never for display. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

/**
 * The production historical policy.  A pre-existing B4 state is reported, not
 * changed.  Every unproven legacy row is proposal-only even if amount and a
 * current P1/B4 wrapper happen to agree.
 */
export function planHistoricalProposal(input: HistoricalPlanInput): HistoricalPlan {
  if (input.b4State === 'JUSTIFICADO' || input.b4State === 'NO_REQUIERE') {
    return {
      clasificacion: 'YA_B4',
      procedencia: 'DESCONOCIDO',
      motivos: distinctSorted([`YA_B4_${input.b4State}`, ...input.motivos]),
      documentos: input.documentos,
      importeBancoCentimos: input.importeBancoCentimos,
    }
  }
  return {
    clasificacion: 'PROPUESTA',
    procedencia: 'DESCONOCIDO',
    motivos: distinctSorted(['PROCEDENCIA_DESCONOCIDA', ...input.motivos]),
    documentos: input.documentos,
    importeBancoCentimos: input.importeBancoCentimos,
  }
}

/** Only fixture/manual-review code may call this; the database script does not. */
export function planSyntheticManualEvidence(input: HistoricalPlanInput & Readonly<{ manualProof: true }>): HistoricalPlan {
  const document = input.documentos.length === 1 ? input.documentos[0] : null
  const exact = document !== null
    && input.importeBancoCentimos !== null
    && input.importeBancoCentimos !== 0
    && document.documentoConciliableId !== null
    && document.archivoDisponible
    && document.importeObjetivoCentimos === input.importeBancoCentimos
    && !document.stale
  if (!exact || input.b4State === 'JUSTIFICADO' || input.b4State === 'NO_REQUIERE') {
    return planHistoricalProposal(input)
  }
  return {
    clasificacion: 'JUSTIFICADO',
    procedencia: 'MANUAL',
    motivos: [],
    documentos: input.documentos,
    importeBancoCentimos: input.importeBancoCentimos,
  }
}
