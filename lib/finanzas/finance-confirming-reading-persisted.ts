import { Prisma } from '@prisma/client'
import type { FinanceConfirmingReadingReason } from './finance-confirming-reading-core'
import {
  FINANCE_CONFIRMING_READING_QUEUE_SCHEMA,
  unavailableFinanceConfirmingReadingQueue,
  type FinanceConfirmingReadingAmounts,
  type FinanceConfirmingReadingBank,
  type FinanceConfirmingReadingPairState,
  type FinanceConfirmingReadingParserCode,
  type FinanceConfirmingReadingQueueProposal,
  type FinanceConfirmingReadingQueueDto,
  type FinanceConfirmingReadingQueueEntry,
  type FinanceConfirmingReadingSourceRole,
} from './finance-confirming-reading-contract'

/**
 * Lectura privada de Conciliar > Revisar lectura. Sólo ve proyecciones C11 ya
 * persistidas; no abre bytes, Graph, OCR ni parser y jamás confirma B4.
 */
export const MAX_FINANCE_CONFIRMING_READING_QUEUE = 200
const MAX_ATTEMPT_SCAN = MAX_FINANCE_CONFIRMING_READING_QUEUE * 4

export type FinanceConfirmingReadingQueryClient = Readonly<{
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>
  $executeRaw?: (query: Prisma.Sql) => Promise<unknown>
  $transaction?: <T>(fn: (tx: FinanceConfirmingReadingQueryClient) => Promise<T>, options?: unknown) => Promise<T>
}>

export class FinanceConfirmingReadingPersistedError extends Error {
  constructor(public readonly code: 'LECTURA_CONFIRMING_PERSISTIDA_CORRUPTA' | 'LECTURA_CONFIRMING_PERSISTIDA_TRUNCADA') {
    super(code)
    this.name = 'FinanceConfirmingReadingPersistedError'
  }
}

type RawAttempt = Readonly<{
  id: unknown
  resolutionKey: unknown
  attemptKind: unknown
  lifecycleId: unknown
  snapshotId: unknown
  versionDocumento: unknown
  sourceHash: unknown
  sourceRole: unknown
  parser: unknown
  banco: unknown
  parejaCaixaDeclaradaId: unknown
  motivos: unknown
  resumen: unknown
  outcome: unknown
  liquidacionId: unknown
  movimientoId: unknown
  capturedAt: unknown
}>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HASH = /^[a-f0-9]{64}$/
const PAIR = /^[A-Za-z0-9_.:-]{1,160}$/
const KEY = /^(?:CAIXA|SNAPSHOT):[A-Za-z0-9_.:-]{1,160}$/

function isReason(value: unknown): value is FinanceConfirmingReadingReason {
  return value === 'ARCHIVO_PRIVADO_NO_CONTROLADO'
    || value === 'ARCHIVO_PRIVADO_DUPLICADO'
    || value === 'PAREJA_CAIXA_PDF_XLS_INCOMPLETA'
    || value === 'PAREJA_CAIXA_PDF_XLS_NO_DECLARADA'
    || value === 'EVIDENCIA_C11_INCOMPLETA'
    || value === 'CUADRE_C11_NO_EXACTO'
    || value === 'MOVIMIENTO_AMBIGUO'
    || value === 'CUENTA_DEPOSITARIA_NO_COINCIDE'
    || value === 'NETO_BANCARIO_NO_COINCIDE'
    || value === 'MOVIMIENTO_NO_DISPONIBLE'
    || value === 'LECTURA_NO_APTA_PARA_PROPUESTA'
}
function safeCents(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(parsed) && Math.abs(parsed) <= 2_147_483_647 ? parsed : null
}
function object(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null }
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  return normalized && normalized.length <= max && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : null
}
function parser(value: unknown): FinanceConfirmingReadingParserCode | undefined {
  if (value === 'C11_BBVA_PDF_PAGINA_2_COLUMNAS_FISICAS' || value === 'C11_CAIXA_PDF' || value === 'C11_CAIXA_XLS' || value === null) return value as FinanceConfirmingReadingParserCode
  return undefined
}
type AttemptSourceRole = FinanceConfirmingReadingSourceRole | 'EVIDENCIA_C11'
function role(value: unknown): AttemptSourceRole | null {
  return value === 'LIQUIDACION_PDF' || value === 'DETALLE_FACTURAS_XLS' || value === 'NO_CLASIFICADO' || value === 'EVIDENCIA_C11' ? value : null
}
function bank(value: unknown): FinanceConfirmingReadingBank | undefined {
  if (value === 'BBVA' || value === 'CAIXABANK' || value === null) return value as FinanceConfirmingReadingBank
  return undefined
}
function asIso(value: unknown): string | null {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null
}
function readAmounts(value: unknown): FinanceConfirmingReadingAmounts | null {
  const row = object(value)
  if (!row || typeof row.cuentaDepositariaDeclarada !== 'boolean') return null
  const expected = ['nominalCentimos', 'facturasDocumentales', 'interesesCentimos', 'comisionCentimos', 'ivaComisionCentimos', 'netoBancarioCentimos']
  if (!expected.every((key) => Object.prototype.hasOwnProperty.call(row, key))) return null
  const cents = (key: string) => row[key] === null ? null : safeCents(row[key])
  const nominalCentimos = cents('nominalCentimos')
  const interesesCentimos = cents('interesesCentimos')
  const comisionCentimos = cents('comisionCentimos')
  const ivaComisionCentimos = cents('ivaComisionCentimos')
  const netoBancarioCentimos = cents('netoBancarioCentimos')
  const count = row.facturasDocumentales
  if ((row.nominalCentimos !== null && nominalCentimos === null)
    || (row.interesesCentimos !== null && interesesCentimos === null)
    || (row.comisionCentimos !== null && comisionCentimos === null)
    || (row.ivaComisionCentimos !== null && ivaComisionCentimos === null)
    || (row.netoBancarioCentimos !== null && netoBancarioCentimos === null)
    || (count !== null && (!Number.isSafeInteger(count) || (count as number) < 0))) return null
  return { nominalCentimos, facturasDocumentales: count as number | null, interesesCentimos, comisionCentimos, ivaComisionCentimos, netoBancarioCentimos, cuentaDepositariaDeclarada: row.cuentaDepositariaDeclarada }
}

type Attempt = Readonly<{
  id: string
  resolutionKey: string
  attemptKind: 'FUENTE' | 'RESULTADO_C11'
  lifecycleId: string
  snapshotId: string
  versionDocumento: number
  sourceHash: string
  sourceRole: AttemptSourceRole
  parser: FinanceConfirmingReadingParserCode
  banco: FinanceConfirmingReadingBank | null
  parejaCaixaDeclaradaId: string | null
  motivos: readonly FinanceConfirmingReadingReason[]
  resumen: FinanceConfirmingReadingAmounts
  outcome: 'REVISAR' | 'ELEGIBLE_C11' | 'PROPUESTA_CONFIRMACION_HUMANA'
  liquidacionId: string | null
  movimientoId: string | null
  capturedAt: string
}>

function parseAttempt(row: RawAttempt): Attempt | null {
  const id = text(row.id, 64), resolutionKey = text(row.resolutionKey, 180), lifecycleId = text(row.lifecycleId, 64), snapshotId = text(row.snapshotId, 64), sourceHash = text(row.sourceHash, 64)
  const versionDocumento = safeCents(row.versionDocumento)
  const sourceRole = role(row.sourceRole), parserCode = parser(row.parser), banco = bank(row.banco)
  const pair = row.parejaCaixaDeclaradaId === null ? null : typeof row.parejaCaixaDeclaradaId === 'string' ? text(row.parejaCaixaDeclaradaId, 160) : undefined
  const capturedAt = asIso(row.capturedAt)
  const motivos = Array.isArray(row.motivos) && row.motivos.every(isReason) ? [...new Set(row.motivos)].sort() : null
  const resumen = readAmounts(row.resumen)
  const attemptKind = row.attemptKind === 'FUENTE' || row.attemptKind === 'RESULTADO_C11' ? row.attemptKind : null
  const outcome = row.outcome === 'REVISAR' || row.outcome === 'ELEGIBLE_C11' || row.outcome === 'PROPUESTA_CONFIRMACION_HUMANA' ? row.outcome : null
  const liquidacionId = row.liquidacionId === null ? null : text(row.liquidacionId, 64)
  const movimientoId = row.movimientoId === null ? null : text(row.movimientoId, 220)
  if (!id || !resolutionKey || !lifecycleId || !snapshotId || !sourceHash || versionDocumento === null || versionDocumento < 1 || !sourceRole || parserCode === undefined || banco === undefined || pair === undefined || !motivos || !resumen || !capturedAt || !attemptKind || !outcome || liquidacionId === undefined || movimientoId === undefined
    || !UUID.test(id) || !UUID.test(lifecycleId) || !UUID.test(snapshotId) || !HASH.test(sourceHash) || !KEY.test(resolutionKey) || (pair !== null && !PAIR.test(pair))) return null
  if (attemptKind === 'FUENTE' && (liquidacionId !== null || movimientoId !== null || (outcome !== 'REVISAR' && outcome !== 'ELEGIBLE_C11'))) return null
  if (attemptKind === 'RESULTADO_C11' && ((outcome === 'PROPUESTA_CONFIRMACION_HUMANA' && (!liquidacionId || !movimientoId)) || (outcome === 'REVISAR' && (liquidacionId || movimientoId)))) return null
  return { id, resolutionKey, attemptKind, lifecycleId, snapshotId, versionDocumento, sourceHash, sourceRole, parser: parserCode, banco, parejaCaixaDeclaradaId: pair, motivos, resumen, outcome, liquidacionId, movimientoId, capturedAt }
}

function pairState(attempt: Attempt, sources: readonly Attempt[]): FinanceConfirmingReadingPairState {
  if (attempt.banco === null) return 'NO_CLASIFICADO'
  if (attempt.banco !== 'CAIXABANK') return 'NO_REQUIERE_PAREJA'
  if (!attempt.parejaCaixaDeclaradaId) return 'PAREJA_NO_DECLARADA'
  const pair = sources.filter((candidate) => candidate.banco === 'CAIXABANK' && candidate.parejaCaixaDeclaradaId === attempt.parejaCaixaDeclaradaId && candidate.outcome === 'ELEGIBLE_C11')
  return pair.filter((candidate) => candidate.sourceRole === 'LIQUIDACION_PDF').length === 1 && pair.filter((candidate) => candidate.sourceRole === 'DETALLE_FACTURAS_XLS').length === 1
    ? 'PAREJA_DECLARADA_COMPLETA'
    : 'PAREJA_INCOMPLETA'
}
function centsClose(resumen: FinanceConfirmingReadingAmounts): boolean {
  const values = [resumen.nominalCentimos, resumen.interesesCentimos, resumen.comisionCentimos, resumen.ivaComisionCentimos, resumen.netoBancarioCentimos]
  return values.every((value): value is number => value !== null)
    && resumen.nominalCentimos! === resumen.interesesCentimos! + resumen.comisionCentimos! + resumen.ivaComisionCentimos! + resumen.netoBancarioCentimos!
}
function baseReasons(attempt: Attempt, sources: readonly Attempt[]): FinanceConfirmingReadingReason[] {
  const reasons = new Set<FinanceConfirmingReadingReason>(attempt.motivos)
  const pareja = pairState(attempt, sources)
  if (pareja === 'PAREJA_NO_DECLARADA') reasons.add('PAREJA_CAIXA_PDF_XLS_NO_DECLARADA')
  if (pareja === 'PAREJA_INCOMPLETA') reasons.add('PAREJA_CAIXA_PDF_XLS_INCOMPLETA')
  if (!centsClose(attempt.resumen)) reasons.add('CUADRE_C11_NO_EXACTO')
  return [...reasons].sort()
}
function reviewEntry(attempt: Attempt, sources: readonly Attempt[]): FinanceConfirmingReadingQueueEntry {
  const reasons = baseReasons(attempt, sources)
  if (!reasons.length) reasons.push('LECTURA_NO_APTA_PARA_PROPUESTA')
  return {
    id: attempt.id,
    kind: 'REVISAR_LECTURA',
    liquidacionId: null,
    movimientoId: null,
    archivoPrivadoId: attempt.id,
    fuenteVersion: `v${attempt.versionDocumento}`,
    bancoOrigen: attempt.banco,
    pareja: pairState(attempt, sources),
    motivo: reasons[0]!,
    motivos: reasons,
    resumen: attempt.resumen,
    propuesta: null,
    confirmarB4Automaticamente: false,
    noEscrituras: true,
  }
}
function proposalEntry(attempt: Attempt, sources: readonly Attempt[]): FinanceConfirmingReadingQueueEntry {
  const propuesta: FinanceConfirmingReadingQueueProposal = {
    kind: 'PROPUESTA_CONFIRMACION_HUMANA',
    liquidacionId: attempt.liquidacionId!,
    movimientoId: attempt.movimientoId!,
    estadoVisual: 'PROPUESTA_PENDIENTE_REVISION_HUMANA',
    propuestaAutomatica: true,
    confirmarB4Automaticamente: false,
    requiereConfirmacionHumana: true,
    noEscrituras: true,
  }
  return {
    id: attempt.id,
    kind: 'PROPUESTA_CONFIRMACION_HUMANA',
    liquidacionId: attempt.liquidacionId,
    movimientoId: attempt.movimientoId,
    archivoPrivadoId: attempt.id,
    fuenteVersion: `v${attempt.versionDocumento}`,
    bancoOrigen: attempt.banco,
    pareja: pairState(attempt, sources),
    motivo: null,
    motivos: [],
    resumen: attempt.resumen,
    propuesta,
    confirmarB4Automaticamente: false,
    noEscrituras: true,
  }
}

async function readTx<T>(db: FinanceConfirmingReadingQueryClient, fn: (tx: FinanceConfirmingReadingQueryClient) => Promise<T>): Promise<T> {
  if (!db.$transaction) return fn(db)
  return db.$transaction(async (tx) => {
    if (tx.$executeRaw) await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`)
    return fn(tx)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20_000 })
}

/** Returns explicit UNAVAILABLE before the additive P2 table is approved/applied. */
export async function readPersistedFinanceConfirmingReadingQueue(db: FinanceConfirmingReadingQueryClient): Promise<FinanceConfirmingReadingQueueDto> {
  return readTx(db, async (tx) => {
    const table = await tx.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`SELECT to_regclass('public.confirming_reading_attempts') IS NOT NULL AS exists LIMIT 1`)
    if (table.length !== 1 || table[0]?.exists !== true) return unavailableFinanceConfirmingReadingQueue()
    const rows = await tx.$queryRaw<RawAttempt[]>(Prisma.sql`
      SELECT a.id::text AS id,a.resolution_key AS "resolutionKey",a.attempt_kind AS "attemptKind",a.lifecycle_id::text AS "lifecycleId",
        a.snapshot_id::text AS "snapshotId",s.version_number AS "versionDocumento",a.source_hash AS "sourceHash",a.source_role AS "sourceRole",
        a.parser_code AS parser,a.banco_origen AS banco,a.pareja_caixa_declarada_id AS "parejaCaixaDeclaradaId",a.motivos,a.resumen,
        a.outcome,a.liquidacion_id::text AS "liquidacionId",a.movimiento_id AS "movimientoId",a.created_at AS "capturedAt"
      FROM confirming_reading_attempts a
      JOIN document_version_snapshots s ON s.id=a.snapshot_id AND s.lifecycle_id=a.lifecycle_id
      ORDER BY a.created_at DESC,a.id DESC
      LIMIT ${MAX_ATTEMPT_SCAN + 1}
    `)
    if (rows.length > MAX_ATTEMPT_SCAN) throw new FinanceConfirmingReadingPersistedError('LECTURA_CONFIRMING_PERSISTIDA_TRUNCADA')
    const parsed = rows.map(parseAttempt)
    if (parsed.some((attempt) => attempt === null)) throw new FinanceConfirmingReadingPersistedError('LECTURA_CONFIRMING_PERSISTIDA_CORRUPTA')
    const all = parsed as Attempt[]
    const sources = all.filter((attempt) => attempt.attemptKind === 'FUENTE')
    // Sólo el último resultado C11 de cada declaración se publica. Una revisión
    // Caixa previa queda sustituida cuando llega la pareja PDF/XLS y C11 crea su
    // propuesta, sin borrar la auditoría histórica.
    const finalByResolution = new Map<string, Attempt>()
    for (const attempt of all.filter((candidate) => candidate.attemptKind === 'RESULTADO_C11')) {
      if (!finalByResolution.has(attempt.resolutionKey)) finalByResolution.set(attempt.resolutionKey, attempt)
    }
    const entries: FinanceConfirmingReadingQueueEntry[] = []
    for (const final of finalByResolution.values()) {
      entries.push(final.outcome === 'PROPUESTA_CONFIRMACION_HUMANA' ? proposalEntry(final, sources) : reviewEntry(final, sources))
    }
    for (const source of sources) {
      if (source.outcome === 'REVISAR' && !finalByResolution.has(source.resolutionKey)) entries.push(reviewEntry(source, sources))
    }
    if (entries.length > MAX_FINANCE_CONFIRMING_READING_QUEUE) throw new FinanceConfirmingReadingPersistedError('LECTURA_CONFIRMING_PERSISTIDA_TRUNCADA')
    const ordered = entries.sort((left, right) => right.id.localeCompare(left.id))
    return {
      schema: FINANCE_CONFIRMING_READING_QUEUE_SCHEMA,
      state: 'AVAILABLE',
      updatedAt: all[0]?.capturedAt ?? null,
      entries: ordered,
      unavailableCode: null,
    }
  })
}
