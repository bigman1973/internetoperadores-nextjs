import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { ConfirmingLineaParsed, ConfirmingParseResult, ConfirmingTipoDocumento } from './confirming-parser'
import {
  FinanceConfirmingReadingAdapterError,
  normalizeDeclaredConfirmingIban,
  parseFinanceConfirmingReadingControlledContent,
  type FinanceConfirmingReadingParserPort,
} from './finance-confirming-reading-adapter'
import {
  planFinanceConfirmingReadingParser,
  type FinanceConfirmingReadingContentEvent,
  type FinanceConfirmingReadingParsePlan,
} from './finance-confirming-reading-event'
import type { FinanceConfirmingReadingReason } from './finance-confirming-reading-core'
import type {
  FinanceConfirmingReadingAmounts,
  FinanceConfirmingReadingBank,
  FinanceConfirmingReadingParserCode,
  FinanceConfirmingReadingSourceRole,
} from './finance-confirming-reading-contract'

/**
 * Puente P2 para confirming ya descargado por el integrador autorizado.
 *
 * Los bytes y el parse privado viven sólo en el payload efímero del worker hasta
 * que el hook haya archivado su snapshot lifecycle. La tabla de intentos guarda
 * una proyección privada, sin OCR crudo, y nunca escribe B4, banco o cobros.
 */
export const FINANCE_CONFIRMING_READING_P2_SCHEMA = 'FINANCE_CONFIRMING_READING_P2_V2' as const
export const MAX_FINANCE_CONFIRMING_READING_BYTES = 20 * 1024 * 1024

export type FinanceConfirmingReadingP2Source = Readonly<{
  archivoPrivadoId: string
  versionContenido: string
  hashBinario: string
  tipoDetectado: FinanceConfirmingReadingContentEvent['tipoDetectado']
  hashProcesadoAnterior: string | null
  /** Sólo llega desde una vinculación documental explícita, nunca de heurísticas. */
  parejaCaixaDeclaradaId: string | null
}>

export type FinanceConfirmingReadingPrivateLine = Readonly<{
  numFactura: string
  importe: number
  importeNeto: number | null
  intereses: number | null
  comision: number | null
  fechaFactura: string | null
  fechaPago: string | null
  fechaVencimiento: string | null
}>

/** Proyección privada mínima del parser; no contiene rawText, cliente ni rutas. */
export type FinanceConfirmingReadingPrivateParse = Readonly<{
  banco: 'BBVA' | 'CaixaBank'
  tipoDocumento: ConfirmingTipoDocumento | null
  sourceHash: string
  fechaLiquidacion: string | null
  cuentaAbonoLiteral: string | null
  totalRemesa: number
  netoBancario: number | null
  totalIntereses: number | null
  totalComisiones: number | null
  totalIvaComision: number | null
  totalDeducir: number | null
  cuadre: 'CUADRA' | 'DESCUADRE' | 'NO_VERIFICABLE' | 'NO_APLICA' | null
  lineas: readonly FinanceConfirmingReadingPrivateLine[]
}>

export type FinanceConfirmingReadingPreparedSummary = Readonly<{
  banco: FinanceConfirmingReadingBank | null
  sourceRole: FinanceConfirmingReadingSourceRole
  parser: FinanceConfirmingReadingParserCode
  motivos: readonly FinanceConfirmingReadingReason[]
  resumen: FinanceConfirmingReadingAmounts
}>

export type FinanceConfirmingReadingP2Prepared = Readonly<{
  schema: typeof FINANCE_CONFIRMING_READING_P2_SCHEMA
  /** Una lectura documental exacta aún necesita las guardas C11 dentro de apply. */
  kind: 'SIN_CAMBIO' | 'PERSISTIR_REVISION' | 'PERSISTIR_PROPUESTA'
  plan: FinanceConfirmingReadingParsePlan
  source: FinanceConfirmingReadingP2Source
  resumen: FinanceConfirmingReadingPreparedSummary | null
  /** Sólo para la bridge de mismo worker/TX; nunca se serializa al source_data. */
  parsePrivado: FinanceConfirmingReadingPrivateParse | null
  propuestaAutomatica: true
  confirmarB4Automaticamente: false
  noEscriturasB4: true
}>

export type FinanceConfirmingReadingPersistedSnapshot = Readonly<{
  lifecycleId: string
  snapshotId: string
  versionDocumento: number
}>

/**
 * Vínculo servidor-controlado con una FacturaRecibida existente. No se crea una
 * FI al leer: el integrador debe registrar el soporte financiero antes del hook
 * y esta identidad se vuelve a comprueba dentro de la misma transacción fenced.
 */
export type FinanceConfirmingReadingRegisteredSource = Readonly<{
  /** Registro servidor-controlado; no procede del inventario ni de la UI. */
  registroSoporteId: string
  facturaRecibidaId: string
  archivoControladoId: string
  oneDriveDriveId: string
  oneDriveItemId: string
  /** Debe coincidir con el parser de la fuente registrada; no se infiere por nombre. */
  tipoDetectado: FinanceConfirmingReadingContentEvent['tipoDetectado']
  /** Caixa sólo puede llegar aquí con la declaración explícita persistida. */
  parejaCaixaDeclaradaId: string | null
}>

export type FinanceConfirmingReadingP2Tx = Readonly<{
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>
}>

export type FinanceConfirmingReadingPersistOutcome = 'SIN_CAMBIOS' | 'REVISAR' | 'ELEGIBLE_C11'
export type FinanceConfirmingReadingFinalOutcome = 'REVISAR' | 'PROPUESTA_CONFIRMACION_HUMANA'

export class FinanceConfirmingReadingP2Error extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'FinanceConfirmingReadingP2Error'
  }
}

const HASH = /^[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAIR = /^[A-Za-z0-9_.:-]{1,160}$/
const ID = /^[A-Za-z0-9_.:-]{1,220}$/

function fail(code: string): never { throw new FinanceConfirmingReadingP2Error(code) }
function uniqueSorted<T extends string>(values: readonly T[]): T[] { return [...new Set(values)].sort() }
function opaque(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  return normalized && normalized.length <= max && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : null
}
function safeAmount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  const scaled = value * 100
  const rounded = Math.round(scaled)
  return Number.isSafeInteger(rounded) && Math.abs(scaled - rounded) < 0.000_001 && rounded <= 2_147_483_647 ? value : null
}
function safeCents(value: unknown): number | null {
  const amount = safeAmount(value)
  return amount === null ? null : Math.round(amount * 100)
}
function nullableAmount(value: unknown): number | null { return value === undefined || value === null ? null : safeAmount(value) }
function nullableText(value: unknown, max: number): string | null {
  return value === undefined || value === null ? null : opaque(value, max)
}
function validLine(line: ConfirmingLineaParsed): FinanceConfirmingReadingPrivateLine | null {
  const numFactura = opaque(line.numFactura, 160)
  const importe = safeAmount(line.importe)
  if (!numFactura || importe === null) return null
  return {
    numFactura,
    importe,
    importeNeto: nullableAmount(line.importeNeto),
    intereses: nullableAmount(line.intereses),
    comision: nullableAmount(line.comision),
    fechaFactura: nullableText(line.fechaFactura, 32),
    fechaPago: nullableText(line.fechaPago, 32),
    fechaVencimiento: nullableText(line.fechaVencimiento, 32),
  }
}
function privateParseFromResult(parse: ConfirmingParseResult): FinanceConfirmingReadingPrivateParse | null {
  if (!HASH.test(parse.sourceHash ?? '')) return null
  const totalRemesa = safeAmount(parse.totalRemesa)
  if (totalRemesa === null || !Array.isArray(parse.lineas) || parse.lineas.length > 10_000) return null
  const lineas = parse.lineas.map(validLine)
  if (lineas.some((line) => line === null)) return null
  const tipoDocumento = parse.tipoDocumento === undefined ? null : parse.tipoDocumento
  const cuadre = parse.cuadre?.estado ?? null
  return {
    banco: parse.banco,
    tipoDocumento,
    sourceHash: parse.sourceHash!,
    fechaLiquidacion: nullableText(parse.fechaLiquidacion, 32),
    cuentaAbonoLiteral: nullableText(parse.cuentaAbono, 128),
    totalRemesa,
    netoBancario: nullableAmount(parse.netoBancario),
    totalIntereses: nullableAmount(parse.totalIntereses),
    totalComisiones: nullableAmount(parse.totalComisiones),
    totalIvaComision: nullableAmount(parse.totalIvaComision),
    totalDeducir: nullableAmount(parse.totalDeducir),
    cuadre: cuadre === 'CUADRA' || cuadre === 'DESCUADRE' || cuadre === 'NO_VERIFICABLE' || cuadre === 'NO_APLICA' ? cuadre : null,
    lineas: lineas as FinanceConfirmingReadingPrivateLine[],
  }
}
function summaryFromParse(parse: FinanceConfirmingReadingPrivateParse): FinanceConfirmingReadingAmounts {
  return {
    nominalCentimos: safeCents(parse.totalRemesa),
    facturasDocumentales: parse.lineas.length,
    interesesCentimos: safeCents(parse.totalIntereses),
    comisionCentimos: safeCents(parse.totalComisiones),
    ivaComisionCentimos: safeCents(parse.totalIvaComision),
    netoBancarioCentimos: safeCents(parse.netoBancario),
    // Es una afirmación documental sobre el IBAN literal. La cuenta interna se
    // resuelve después por igualdad exacta y nunca se infiere del banco.
    cuentaDepositariaDeclarada: normalizeDeclaredConfirmingIban(parse.cuentaAbonoLiteral) !== null,
  }
}
function roleForPlan(plan: FinanceConfirmingReadingParsePlan): FinanceConfirmingReadingSourceRole {
  if (plan.parser === 'C11_CAIXA_XLS') return 'DETALLE_FACTURAS_XLS'
  if (plan.parser === null) return 'NO_CLASIFICADO'
  return 'LIQUIDACION_PDF'
}
function bancoForParse(parse: FinanceConfirmingReadingPrivateParse): FinanceConfirmingReadingBank | null {
  return parse.banco === 'BBVA' ? 'BBVA' : parse.banco === 'CaixaBank' ? 'CAIXABANK' : null
}
function parserReasons(parse: FinanceConfirmingReadingPrivateParse, source: FinanceConfirmingReadingP2Source, plan: FinanceConfirmingReadingParsePlan): FinanceConfirmingReadingReason[] {
  const amounts = summaryFromParse(parse)
  const reasons: FinanceConfirmingReadingReason[] = []
  const isPdf = roleForPlan(plan) === 'LIQUIDACION_PDF'
  const isCaixa = parse.banco === 'CaixaBank'
  // La clasificación humana registrada elige el parser y no puede cambiarse
  // implícitamente desde su salida. Un adapter cruzado queda en ámbar.
  const parserMatchesRegisteredKind = (source.tipoDetectado === 'BBVA_PDF' && parse.banco === 'BBVA')
    || ((source.tipoDetectado === 'CAIXA_PDF' || source.tipoDetectado === 'CAIXA_XLS') && parse.banco === 'CaixaBank')
  if (!parserMatchesRegisteredKind) reasons.push('LECTURA_NO_APTA_PARA_PROPUESTA')
  if (parse.sourceHash !== source.hashBinario) reasons.push('ARCHIVO_PRIVADO_NO_CONTROLADO')
  if (isPdf) {
    const totals = [amounts.nominalCentimos, amounts.interesesCentimos, amounts.comisionCentimos, amounts.ivaComisionCentimos, amounts.netoBancarioCentimos]
    if (parse.tipoDocumento !== 'LIQUIDACION' || parse.cuadre !== 'CUADRA' || totals.some((amount) => amount === null)) reasons.push('CUADRE_C11_NO_EXACTO')
    // BBVA contiene el detalle en el propio PDF. Caixa lo aporta exclusivamente
    // por XLS declarado y por ello el PDF no se marca incompleto por sí solo.
    if (!isCaixa && parse.lineas.length < 1) reasons.push('EVIDENCIA_C11_INCOMPLETA')
  } else if (roleForPlan(plan) === 'DETALLE_FACTURAS_XLS') {
    if (!isCaixa || parse.tipoDocumento !== 'DETALLE_FACTURAS' || parse.lineas.length < 1) reasons.push('EVIDENCIA_C11_INCOMPLETA')
  } else {
    reasons.push('LECTURA_NO_APTA_PARA_PROPUESTA')
  }
  if ((source.tipoDetectado === 'CAIXA_PDF' || source.tipoDetectado === 'CAIXA_XLS') && !source.parejaCaixaDeclaradaId) {
    reasons.push('PAREJA_CAIXA_PDF_XLS_NO_DECLARADA')
  }
  return uniqueSorted(reasons)
}
function emptySummary(): FinanceConfirmingReadingAmounts {
  return { nominalCentimos: null, facturasDocumentales: null, interesesCentimos: null, comisionCentimos: null, ivaComisionCentimos: null, netoBancarioCentimos: null, cuentaDepositariaDeclarada: false }
}
function reviewSummary(plan: FinanceConfirmingReadingParsePlan, reason: FinanceConfirmingReadingReason): FinanceConfirmingReadingPreparedSummary {
  return { banco: null, sourceRole: roleForPlan(plan), parser: plan.parser, motivos: [reason], resumen: emptySummary() }
}
function prepared(input: Omit<FinanceConfirmingReadingP2Prepared, 'schema' | 'propuestaAutomatica' | 'confirmarB4Automaticamente' | 'noEscriturasB4'>): FinanceConfirmingReadingP2Prepared {
  return { schema: FINANCE_CONFIRMING_READING_P2_SCHEMA, ...input, propuestaAutomatica: true, confirmarB4Automaticamente: false, noEscriturasB4: true }
}

/**
 * Reemplaza el token efímero usado durante `prepare` por el handle UUID que el
 * lifecycle acaba de archivar. Sólo el provider puede llamarlo después de volver
 * a leer la declaración soporte y registrar esta versión en el mismo apply P2.
 */
export function bindPreparedFinanceConfirmingReadingP2ToArchivedSource(input: Readonly<{
  prepared: FinanceConfirmingReadingP2Prepared
  snapshot: FinanceConfirmingReadingPersistedSnapshot
  registeredSource: FinanceConfirmingReadingRegisteredSource
}>): FinanceConfirmingReadingP2Prepared {
  const { prepared: preparedInput, snapshot, registeredSource } = input
  if (preparedInput.schema !== FINANCE_CONFIRMING_READING_P2_SCHEMA || !HASH.test(preparedInput.source.hashBinario)) fail('CONFIRMING_READING_P2_SOURCE_INVALID')
  if (!UUID.test(snapshot.lifecycleId) || !UUID.test(snapshot.snapshotId) || !Number.isSafeInteger(snapshot.versionDocumento) || snapshot.versionDocumento < 1) fail('CONFIRMING_READING_P2_SNAPSHOT_INVALID')
  if (!UUID.test(registeredSource.registroSoporteId) || !UUID.test(registeredSource.archivoControladoId) || !ID.test(registeredSource.facturaRecibidaId) || !opaque(registeredSource.oneDriveDriveId, 300) || !opaque(registeredSource.oneDriveItemId, 300)) fail('CONFIRMING_READING_P2_REGISTERED_SOURCE_INVALID')
  if (registeredSource.tipoDetectado !== preparedInput.source.tipoDetectado || registeredSource.parejaCaixaDeclaradaId !== preparedInput.source.parejaCaixaDeclaradaId) fail('CONFIRMING_READING_P2_REGISTERED_SOURCE_MISMATCH')
  return {
    ...preparedInput,
    source: {
      ...preparedInput.source,
      archivoPrivadoId: registeredSource.archivoControladoId,
      // Snapshot is server-derived and only used to make a repeated archived
      // version idempotent; neither value reaches the UI or P2 source_data.
      versionContenido: snapshot.snapshotId,
    },
  }
}

/**
 * Sólo recibe bytes efímeros del worker. Un resultado exacto no confirma B4: se
 * marca elegible para que la bridge lo reconstruya con C11 y guardas de fuente.
 */
export async function prepareFinanceConfirmingReadingP2(input: Readonly<{
  source: FinanceConfirmingReadingP2Source
  contenidoControlado: Uint8Array
  nombreOriginal: string
  /** Puerto de fixture; producción omite este campo y usa los parsers reales. */
  parserPort?: FinanceConfirmingReadingParserPort
}>): Promise<FinanceConfirmingReadingP2Prepared> {
  const source = input.source
  if (!opaque(source.archivoPrivadoId, 220) || !opaque(source.versionContenido, 1_024) || !HASH.test(source.hashBinario)) fail('CONFIRMING_READING_P2_SOURCE_INVALID')
  if (source.hashProcesadoAnterior !== null && !HASH.test(source.hashProcesadoAnterior)) fail('CONFIRMING_READING_P2_SOURCE_INVALID')
  if (source.parejaCaixaDeclaradaId !== null && !PAIR.test(source.parejaCaixaDeclaradaId)) fail('CONFIRMING_READING_P2_PAIR_INVALID')
  if (!(input.contenidoControlado instanceof Uint8Array) || input.contenidoControlado.byteLength < 1 || input.contenidoControlado.byteLength > MAX_FINANCE_CONFIRMING_READING_BYTES) fail('CONFIRMING_READING_P2_CONTENT_INVALID')
  const plan = planFinanceConfirmingReadingParser({
    kind: source.hashProcesadoAnterior === null ? 'ARCHIVO_NUEVO' : 'CONTENIDO_CAMBIADO',
    archivoPrivadoId: source.archivoPrivadoId,
    versionContenido: source.versionContenido,
    hashBinario: source.hashBinario,
    tipoDetectado: source.tipoDetectado,
    hashProcesadoAnterior: source.hashProcesadoAnterior,
  })
  if (plan.kind === 'SIN_CAMBIO') return prepared({ kind: 'SIN_CAMBIO', plan, source, resumen: null, parsePrivado: null })
  if (plan.kind === 'REVISAR_LECTURA') return prepared({ kind: 'PERSISTIR_REVISION', plan, source, resumen: reviewSummary(plan, 'LECTURA_NO_APTA_PARA_PROPUESTA'), parsePrivado: null })
  try {
    const parsed = await parseFinanceConfirmingReadingControlledContent({
      plan,
      contenidoControlado: Buffer.from(input.contenidoControlado),
      nombreOriginal: input.nombreOriginal,
      parserPort: input.parserPort,
    })
    const parsePrivado = parsed ? privateParseFromResult(parsed.parse) : null
    if (!parsePrivado) return prepared({ kind: 'PERSISTIR_REVISION', plan, source, resumen: reviewSummary(plan, 'LECTURA_NO_APTA_PARA_PROPUESTA'), parsePrivado: null })
    const resumen: FinanceConfirmingReadingPreparedSummary = {
      banco: bancoForParse(parsePrivado),
      sourceRole: roleForPlan(plan),
      parser: plan.parser,
      motivos: parserReasons(parsePrivado, source, plan),
      resumen: summaryFromParse(parsePrivado),
    }
    return prepared({
      kind: resumen.motivos.length === 0 ? 'PERSISTIR_PROPUESTA' : 'PERSISTIR_REVISION',
      plan,
      source,
      resumen,
      parsePrivado,
    })
  } catch (error) {
    const reason: FinanceConfirmingReadingReason = error instanceof FinanceConfirmingReadingAdapterError && error.code === 'FUENTE_CAMBIADA'
      ? 'ARCHIVO_PRIVADO_NO_CONTROLADO'
      : 'LECTURA_NO_APTA_PARA_PROPUESTA'
    return prepared({ kind: 'PERSISTIR_REVISION', plan, source, resumen: reviewSummary(plan, reason), parsePrivado: null })
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(',')}}`
  }
  fail('CONFIRMING_READING_P2_CANONICAL_INVALID')
}
function sha256(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex') }
function resolutionKey(snapshot: FinanceConfirmingReadingPersistedSnapshot, source: FinanceConfirmingReadingP2Source): string {
  return source.parejaCaixaDeclaradaId ? `CAIXA:${source.parejaCaixaDeclaradaId}` : `SNAPSHOT:${snapshot.snapshotId}`
}
function sourceOutcome(preparedInput: FinanceConfirmingReadingP2Prepared): FinanceConfirmingReadingPersistOutcome {
  if (preparedInput.kind === 'SIN_CAMBIO') return 'SIN_CAMBIOS'
  return preparedInput.kind === 'PERSISTIR_PROPUESTA' ? 'ELEGIBLE_C11' : 'REVISAR'
}
async function assertControlledSnapshot(tx: FinanceConfirmingReadingP2Tx, snapshot: FinanceConfirmingReadingPersistedSnapshot, sourceHash: string): Promise<void> {
  if (!UUID.test(snapshot.lifecycleId) || !UUID.test(snapshot.snapshotId) || !Number.isInteger(snapshot.versionDocumento) || snapshot.versionDocumento < 1) fail('CONFIRMING_READING_P2_SNAPSHOT_INVALID')
  const snapshotRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT s.id::text AS id
    FROM document_version_snapshots s
    WHERE s.id=CAST(${snapshot.snapshotId} AS uuid)
      AND s.lifecycle_id=CAST(${snapshot.lifecycleId} AS uuid)
      AND s.version_number=${snapshot.versionDocumento}
      AND s.content_sha256=${sourceHash}
      AND s.artifact_state='CAPTURED'::"DocumentVersionArtifactState"
    LIMIT 2 FOR KEY SHARE
  `)
  if (snapshotRows.length !== 1) fail('CONFIRMING_READING_P2_SNAPSHOT_NOT_CONTROLLED')
}

async function assertRegisteredSource(
  tx: FinanceConfirmingReadingP2Tx,
  source: FinanceConfirmingReadingRegisteredSource,
  snapshot: FinanceConfirmingReadingPersistedSnapshot,
  preparedInput: FinanceConfirmingReadingP2Prepared,
): Promise<void> {
  if (!UUID.test(source.registroSoporteId) || !ID.test(source.facturaRecibidaId) || !UUID.test(source.archivoControladoId) || !opaque(source.oneDriveDriveId, 300) || !opaque(source.oneDriveItemId, 300)) fail('CONFIRMING_READING_P2_REGISTERED_SOURCE_INVALID')
  if (source.tipoDetectado !== preparedInput.source.tipoDetectado || source.parejaCaixaDeclaradaId !== preparedInput.source.parejaCaixaDeclaradaId) fail('CONFIRMING_READING_P2_REGISTERED_SOURCE_MISMATCH')
  if ((source.tipoDetectado === 'CAIXA_PDF' || source.tipoDetectado === 'CAIXA_XLS') && (!source.parejaCaixaDeclaradaId || !PAIR.test(source.parejaCaixaDeclaradaId))) fail('CONFIRMING_READING_P2_REGISTERED_SOURCE_MISMATCH')
  if (source.tipoDetectado !== 'CAIXA_PDF' && source.tipoDetectado !== 'CAIXA_XLS' && source.parejaCaixaDeclaradaId !== null) fail('CONFIRMING_READING_P2_REGISTERED_SOURCE_MISMATCH')
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT fr.id
    FROM confirming_reading_support_sources r
    JOIN facturas_recibidas fr ON fr.id=r.factura_recibida_id
    JOIN confirming_reading_support_versions sv
      ON sv.source_id=r.id
     AND sv.lifecycle_id=CAST(${snapshot.lifecycleId} AS uuid)
     AND sv.snapshot_id=CAST(${snapshot.snapshotId} AS uuid)
     AND sv.version_documento=${snapshot.versionDocumento}
     AND sv.archivo_controlado_id=CAST(${source.archivoControladoId} AS uuid)
     AND sv.source_hash=${preparedInput.source.hashBinario}
    WHERE r.id=CAST(${source.registroSoporteId} AS uuid)
      AND r.factura_recibida_id=${source.facturaRecibidaId}
      AND r.onedrive_drive_id=${source.oneDriveDriveId}
      AND r.onedrive_item_id=${source.oneDriveItemId}
      AND r.tipo_detectado=${source.tipoDetectado}
      AND r.pareja_caixa_declarada_id IS NOT DISTINCT FROM ${source.parejaCaixaDeclaradaId}
      AND NOT EXISTS (
        SELECT 1 FROM confirming_reading_support_source_revocations rv
        WHERE rv.source_id=r.id
      )
      AND fr.naturaleza_documento='SOPORTE_CONFIRMING_CLIENTE'::"NaturalezaDocumentoFinanciero"
      AND fr.tipo_soporte_financiero='CONFIRMING_CESION_DRAXTON'::"TipoSoporteFinanciero"
      AND NOT EXISTS (
        SELECT 1
        FROM documentos_conciliables d
        JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo
        WHERE d.factura_recibida_id=fr.id
      )
    LIMIT 2 FOR KEY SHARE
  `)
  if (rows.length !== 1 || rows[0]?.id !== source.facturaRecibidaId) fail('CONFIRMING_READING_P2_REGISTERED_SOURCE_REQUIRED')
}

/** Inserta únicamente el intento de fuente en la misma TX que archivó el snapshot. */
export async function persistPreparedFinanceConfirmingReadingP2Tx(
  tx: FinanceConfirmingReadingP2Tx,
  input: Readonly<{
    actorId: number
    snapshot: FinanceConfirmingReadingPersistedSnapshot
    prepared: FinanceConfirmingReadingP2Prepared
    registeredSource: FinanceConfirmingReadingRegisteredSource
  }>,
): Promise<Readonly<{ persisted: boolean; idempotencyKey: string | null; outcome: FinanceConfirmingReadingPersistOutcome }>> {
  if (!Number.isSafeInteger(input.actorId) || input.actorId < 1) fail('CONFIRMING_READING_P2_ACTOR_REQUIRED')
  if (input.prepared.confirmarB4Automaticamente || !input.prepared.noEscriturasB4) fail('CONFIRMING_READING_P2_B4_FORBIDDEN')
  const outcome = sourceOutcome(input.prepared)
  if (outcome === 'SIN_CAMBIOS') return { persisted: false, idempotencyKey: null, outcome }
  const summary = input.prepared.resumen
  if (!summary || !ID.test(input.prepared.source.archivoPrivadoId) || !HASH.test(input.prepared.source.hashBinario)) fail('CONFIRMING_READING_P2_SOURCE_INVALID')
  await assertControlledSnapshot(tx, input.snapshot, input.prepared.source.hashBinario)
  await assertRegisteredSource(tx, input.registeredSource, input.snapshot, input.prepared)
  const key = sha256({
    schema: FINANCE_CONFIRMING_READING_P2_SCHEMA,
    kind: 'FUENTE',
    snapshot: input.snapshot,
    source: input.prepared.source,
    registeredSource: input.registeredSource,
    summary,
    parsePrivado: input.prepared.parsePrivado,
    outcome,
  })
  const existing = await tx.$queryRaw<Array<{ idempotencyKey: string }>>(Prisma.sql`
    SELECT idempotency_key AS "idempotencyKey"
    FROM confirming_reading_attempts
    WHERE idempotency_key=${key}
    LIMIT 2 FOR KEY SHARE
  `)
  if (existing.length > 1) fail('CONFIRMING_READING_P2_REPLAY_AMBIGUOUS')
  if (existing.length === 1) return { persisted: false, idempotencyKey: key, outcome }
  await tx.$queryRaw(Prisma.sql`
    INSERT INTO confirming_reading_attempts
      (id,attempt_kind,resolution_key,lifecycle_id,snapshot_id,factura_recibida_id,archivo_controlado_id,onedrive_drive_id,onedrive_item_id,source_hash,source_role,parser_code,banco_origen,pareja_caixa_declarada_id,
       motivos,resumen,parsed_private,outcome,liquidacion_id,actor_id,idempotency_key)
    VALUES
      (gen_random_uuid(),'FUENTE',${resolutionKey(input.snapshot, input.prepared.source)},CAST(${input.snapshot.lifecycleId} AS uuid),CAST(${input.snapshot.snapshotId} AS uuid),${input.registeredSource.facturaRecibidaId},${input.registeredSource.archivoControladoId},${input.registeredSource.oneDriveDriveId},${input.registeredSource.oneDriveItemId},
       ${input.prepared.source.hashBinario},${summary.sourceRole},${summary.parser},${summary.banco},${input.prepared.source.parejaCaixaDeclaradaId},
       CAST(${JSON.stringify(summary.motivos)} AS jsonb),CAST(${JSON.stringify(summary.resumen)} AS jsonb),CAST(${JSON.stringify(input.prepared.parsePrivado ?? {})} AS jsonb),
       ${outcome},NULL,${input.actorId},${key})
  `)
  return { persisted: true, idempotencyKey: key, outcome }
}

/**
 * Cierra append-only una resolución C11. Sólo la bridge, después de persistir la
 * evidencia documental, puede emitir PROPUESTA_CONFIRMACION_HUMANA. No ejecuta
 * ni prepara B4 y la cola recibe únicamente IDs opacos de C11.
 */
export async function appendFinanceConfirmingReadingC11ResultTx(
  tx: FinanceConfirmingReadingP2Tx,
  input: Readonly<{
    actorId: number
    snapshot: FinanceConfirmingReadingPersistedSnapshot
    prepared: FinanceConfirmingReadingP2Prepared
    registeredSource: FinanceConfirmingReadingRegisteredSource
    outcome: FinanceConfirmingReadingFinalOutcome
    liquidacionId: string | null
    movimientoId: string | null
    motivo: FinanceConfirmingReadingReason | null
  }>,
): Promise<Readonly<{ appended: boolean; idempotencyKey: string }>> {
  if (!Number.isSafeInteger(input.actorId) || input.actorId < 1) fail('CONFIRMING_READING_P2_ACTOR_REQUIRED')
  if (input.prepared.kind !== 'PERSISTIR_PROPUESTA' || !input.prepared.resumen) fail('CONFIRMING_READING_P2_FINAL_NOT_ELIGIBLE')
  if ((input.outcome === 'PROPUESTA_CONFIRMACION_HUMANA') !== (input.liquidacionId !== null && input.movimientoId !== null)) fail('CONFIRMING_READING_P2_FINAL_LIQUIDACION_INVALID')
  if (input.liquidacionId !== null && !UUID.test(input.liquidacionId)) fail('CONFIRMING_READING_P2_FINAL_LIQUIDACION_INVALID')
  if (input.movimientoId !== null && !ID.test(input.movimientoId)) fail('CONFIRMING_READING_P2_FINAL_MOVIMIENTO_INVALID')
  if (input.outcome === 'REVISAR' && input.motivo === null) fail('CONFIRMING_READING_P2_FINAL_REASON_REQUIRED')
  if (input.outcome === 'PROPUESTA_CONFIRMACION_HUMANA' && input.motivo !== null) fail('CONFIRMING_READING_P2_FINAL_REASON_INVALID')
  await assertControlledSnapshot(tx, input.snapshot, input.prepared.source.hashBinario)
  await assertRegisteredSource(tx, input.registeredSource, input.snapshot, input.prepared)
  const key = sha256({
    schema: FINANCE_CONFIRMING_READING_P2_SCHEMA,
    kind: 'RESULTADO_C11',
    snapshot: input.snapshot,
    resolutionKey: resolutionKey(input.snapshot, input.prepared.source),
    sourceHash: input.prepared.source.hashBinario,
    registeredSource: input.registeredSource,
    outcome: input.outcome,
    liquidacionId: input.liquidacionId,
    movimientoId: input.movimientoId,
    motivo: input.motivo,
  })
  const existing = await tx.$queryRaw<Array<{ idempotencyKey: string }>>(Prisma.sql`
    SELECT idempotency_key AS "idempotencyKey" FROM confirming_reading_attempts
    WHERE idempotency_key=${key} LIMIT 2 FOR KEY SHARE
  `)
  if (existing.length > 1) fail('CONFIRMING_READING_P2_REPLAY_AMBIGUOUS')
  if (existing.length === 1) return { appended: false, idempotencyKey: key }
  const summary = input.prepared.resumen
  await tx.$queryRaw(Prisma.sql`
    INSERT INTO confirming_reading_attempts
      (id,attempt_kind,resolution_key,lifecycle_id,snapshot_id,factura_recibida_id,archivo_controlado_id,onedrive_drive_id,onedrive_item_id,source_hash,source_role,parser_code,banco_origen,pareja_caixa_declarada_id,
       motivos,resumen,parsed_private,outcome,liquidacion_id,movimiento_id,actor_id,idempotency_key)
    VALUES
      (gen_random_uuid(),'RESULTADO_C11',${resolutionKey(input.snapshot, input.prepared.source)},CAST(${input.snapshot.lifecycleId} AS uuid),CAST(${input.snapshot.snapshotId} AS uuid),${input.registeredSource.facturaRecibidaId},${input.registeredSource.archivoControladoId},${input.registeredSource.oneDriveDriveId},${input.registeredSource.oneDriveItemId},
       ${input.prepared.source.hashBinario},'EVIDENCIA_C11',NULL,${summary.banco},${input.prepared.source.parejaCaixaDeclaradaId},
       CAST(${JSON.stringify(input.motivo ? [input.motivo] : [])} AS jsonb),CAST(${JSON.stringify(summary.resumen)} AS jsonb),'{}'::jsonb,
       ${input.outcome},${input.liquidacionId ? Prisma.sql`CAST(${input.liquidacionId} AS uuid)` : Prisma.sql`NULL`},${input.movimientoId},${input.actorId},${key})
  `)
  return { appended: true, idempotencyKey: key }
}
