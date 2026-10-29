import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import {
  appendFinanceConfirmingReadingC11ResultTx,
  persistPreparedFinanceConfirmingReadingP2Tx,
  prepareFinanceConfirmingReadingP2,
  type FinanceConfirmingReadingFinalOutcome,
  type FinanceConfirmingReadingP2Prepared,
  type FinanceConfirmingReadingPersistedSnapshot,
  type FinanceConfirmingReadingRegisteredSource,
  type FinanceConfirmingReadingPrivateLine,
  type FinanceConfirmingReadingPrivateParse,
} from '@/lib/finanzas/finance-confirming-reading-p2'
import { normalizeDeclaredConfirmingIban, type FinanceConfirmingReadingParserPort } from '@/lib/finanzas/finance-confirming-reading-adapter'
import { buildConfirmingLiquidationCandidates, type StoredLiquidationDocumentoB4, type StoredLiquidationFacturaEmitida, type StoredLiquidationMovimiento } from '@/lib/finanzas/confirming-liquidation-candidate-core'
import { loadArchivedConfirmingLiquidation, type ArchivedConfirmingInventoryRecord, type ArchivedLiquidationManifest, type ExplicitLiquidationInvoiceBinding } from '@/lib/finanzas/confirming-liquidation-loader'
import { ConfirmingLiquidationPersistError, persistConfirmingLiquidationEvidenceTx } from '@/lib/finanzas/confirming-liquidation-persist'
import { ConfirmingLiquidationLoaderError } from '@/lib/finanzas/confirming-liquidation-loader'
import type { FinanceConfirmingReadingReason } from '@/lib/finanzas/finance-confirming-reading-core'

/**
 * Puente concreto del proveedor OneDrive al flujo C11. Se llama únicamente en
 * apply, dentro de la misma transacción fenced en la que lifecycle ha archivado
 * el snapshot. No descarga Graph, no usa OCR, no registra FacturaRecibida y no
 * modifica banco/B4/cobros. La única salida verde es una propuesta humana.
 */
export const ONEDRIVE_CONFIRMING_READING_BRIDGE_SCHEMA = 'ONEDRIVE_CONFIRMING_READING_BRIDGE_V1' as const

export type OneDriveConfirmingReadingTx = Readonly<{
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>
}>

export type OneDriveConfirmingRegisteredSource = FinanceConfirmingReadingRegisteredSource

export type OneDriveConfirmingReadingApplyResult = Readonly<{
  schema: typeof ONEDRIVE_CONFIRMING_READING_BRIDGE_SCHEMA
  outcome: 'SIN_CAMBIOS' | 'REVISAR' | 'PROPUESTA_CONFIRMACION_HUMANA'
  liquidacionId: string | null
  movimientoId: string | null
  confirmarB4Automaticamente: false
  noEscriturasB4: true
}>

export class OneDriveConfirmingReadingBridgeError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'OneDriveConfirmingReadingBridgeError'
  }
}

const ID = /^[A-Za-z0-9_.:-]{1,220}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HASH = /^[a-f0-9]{64}$/
const DAY = /^(\d{2})\/(\d{2})\/(\d{4})$/

function fail(code: string): never { throw new OneDriveConfirmingReadingBridgeError(code) }
function text(value: unknown, max = 220): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  return normalized && normalized.length <= max && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : null
}
function cents(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'bigint' ? Number(value) : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(number) && Math.abs(number) <= 2_147_483_647 ? number : null
}
function amount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  const scaled = value * 100
  return Number.isSafeInteger(Math.round(scaled)) && Math.abs(scaled - Math.round(scaled)) < 0.000_001 ? value : null
}
function isoFromDocumentDay(value: string | null): string | null {
  const match = value?.match(DAY)
  if (!match) return null
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  const parsed = new Date(`${iso}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null
}
function normalizeInvoice(value: string): string {
  return value.normalize('NFKC').toLocaleUpperCase('es-ES').replace(/[^A-Z0-9]/g, '')
}
function centsOf(value: number | null): number | null {
  if (value === null) return null
  const checked = amount(value)
  return checked === null ? null : Math.round(checked * 100)
}
function pairResolutionKey(prepared: FinanceConfirmingReadingP2Prepared, snapshot: FinanceConfirmingReadingPersistedSnapshot): string {
  return prepared.source.parejaCaixaDeclaradaId ? `CAIXA:${prepared.source.parejaCaixaDeclaradaId}` : `SNAPSHOT:${snapshot.snapshotId}`
}
function liquidationKey(prepared: FinanceConfirmingReadingP2Prepared, snapshot: FinanceConfirmingReadingPersistedSnapshot): string {
  // Una pareja declarada y un lifecycle son identidades servidor-controladas.
  // El hash evita reusar nombres de fichero o cualquier valor de UI como clave C11.
  const source = prepared.source.parejaCaixaDeclaradaId ?? snapshot.lifecycleId
  return `p2-${createHash('sha256').update(`C11:${source}`).digest('hex')}`
}
function c11IdempotencyUuid(snapshotId: string, sourceHash: string): string {
  const hex = createHash('sha256').update(`C11-P2:${snapshotId}:${sourceHash}`).digest('hex')
  // UUID v4 sintáctico y determinista: C11 exige este formato, mientras que la
  // clave semántica sigue incluyendo snapshot y hash documental exactos.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
function privateLine(value: unknown): FinanceConfirmingReadingPrivateLine | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const numFactura = text(row.numFactura, 160)
  const importe = amount(row.importe)
  const optionalAmount = (candidate: unknown): number | null | undefined => candidate === null ? null : amount(candidate) === null ? undefined : amount(candidate)
  const optionalText = (candidate: unknown): string | null | undefined => candidate === null ? null : text(candidate, 32) ?? undefined
  const importeNeto = optionalAmount(row.importeNeto), intereses = optionalAmount(row.intereses), comision = optionalAmount(row.comision)
  const fechaFactura = optionalText(row.fechaFactura), fechaPago = optionalText(row.fechaPago), fechaVencimiento = optionalText(row.fechaVencimiento)
  if (!numFactura || importe === null || importeNeto === undefined || intereses === undefined || comision === undefined || fechaFactura === undefined || fechaPago === undefined || fechaVencimiento === undefined) return null
  return { numFactura, importe, importeNeto, intereses, comision, fechaFactura, fechaPago, fechaVencimiento }
}
function privateParse(value: unknown): FinanceConfirmingReadingPrivateParse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const banco = row.banco === 'BBVA' || row.banco === 'CaixaBank' ? row.banco : null
  const tipoDocumento = row.tipoDocumento === 'LIQUIDACION' || row.tipoDocumento === 'DETALLE_FACTURAS' || row.tipoDocumento === 'AVISO_CESION' || row.tipoDocumento === 'NO_CLASIFICADO' || row.tipoDocumento === null
    ? row.tipoDocumento as FinanceConfirmingReadingPrivateParse['tipoDocumento'] : undefined
  const sourceHash = text(row.sourceHash, 64)
  const totalRemesa = amount(row.totalRemesa)
  const optionalAmount = (candidate: unknown): number | null | undefined => candidate === null ? null : amount(candidate) === null ? undefined : amount(candidate)
  const optionalText = (candidate: unknown, max = 128): string | null | undefined => candidate === null ? null : text(candidate, max) ?? undefined
  const fechaLiquidacion = optionalText(row.fechaLiquidacion, 32), cuentaAbonoLiteral = optionalText(row.cuentaAbonoLiteral)
  const netoBancario = optionalAmount(row.netoBancario), totalIntereses = optionalAmount(row.totalIntereses), totalComisiones = optionalAmount(row.totalComisiones), totalIvaComision = optionalAmount(row.totalIvaComision), totalDeducir = optionalAmount(row.totalDeducir)
  const cuadre = row.cuadre === 'CUADRA' || row.cuadre === 'DESCUADRE' || row.cuadre === 'NO_VERIFICABLE' || row.cuadre === 'NO_APLICA' || row.cuadre === null
    ? row.cuadre as FinanceConfirmingReadingPrivateParse['cuadre'] : undefined
  const lineas = Array.isArray(row.lineas) && row.lineas.length <= 10_000 ? row.lineas.map(privateLine) : null
  if (!banco || tipoDocumento === undefined || !sourceHash || !HASH.test(sourceHash) || totalRemesa === null || fechaLiquidacion === undefined || cuentaAbonoLiteral === undefined || netoBancario === undefined || totalIntereses === undefined || totalComisiones === undefined || totalIvaComision === undefined || totalDeducir === undefined || cuadre === undefined || !lineas || lineas.some((line) => line === null)) return null
  return { banco, tipoDocumento, sourceHash, fechaLiquidacion, cuentaAbonoLiteral, totalRemesa, netoBancario, totalIntereses, totalComisiones, totalIvaComision, totalDeducir, cuadre, lineas: lineas as FinanceConfirmingReadingPrivateLine[] }
}

type AttemptSource = Readonly<{
  sourceRole: 'LIQUIDACION_PDF' | 'DETALLE_FACTURAS_XLS'
  banco: 'BBVA' | 'CAIXABANK'
  sourceHash: string
  facturaRecibidaId: string
  archivoControladoId: string
  oneDriveDriveId: string
  oneDriveItemId: string
  parse: FinanceConfirmingReadingPrivateParse
}>

/** Uses the real parser in production; tests can inject canned parser results without OCR/PDF. */
export async function prepareOneDriveConfirmingReading(input: Readonly<{
  source: FinanceConfirmingReadingP2Prepared['source']
  bytes: Uint8Array
  originalName: string
  parserPort?: FinanceConfirmingReadingParserPort
}>): Promise<FinanceConfirmingReadingP2Prepared> {
  return prepareFinanceConfirmingReadingP2({
    source: input.source,
    contenidoControlado: input.bytes,
    nombreOriginal: input.originalName,
    parserPort: input.parserPort,
  })
}

async function readCurrentExactSources(tx: OneDriveConfirmingReadingTx, input: Readonly<{
  resolutionKey: string
  bank: 'BBVA' | 'CAIXABANK'
}>): Promise<readonly AttemptSource[] | null> {
  const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT a.source_role AS "sourceRole",a.banco_origen AS banco,a.source_hash AS "sourceHash",a.factura_recibida_id AS "facturaRecibidaId",
      a.archivo_controlado_id AS "archivoControladoId",a.onedrive_drive_id AS "oneDriveDriveId",a.onedrive_item_id AS "oneDriveItemId",a.parsed_private AS "parsedPrivate"
    FROM confirming_reading_attempts a
    JOIN document_version_lifecycle l ON l.id=a.lifecycle_id AND l.current_version>0
    JOIN document_version_snapshots s ON s.id=a.snapshot_id AND s.lifecycle_id=l.id AND s.version_number=l.current_version
    WHERE a.attempt_kind='FUENTE'
      AND a.outcome='ELEGIBLE_C11'
      AND a.resolution_key=${input.resolutionKey}
      AND a.banco_origen=${input.bank}
      AND s.artifact_state='CAPTURED'::"DocumentVersionArtifactState"
    ORDER BY a.created_at DESC,a.id DESC
    LIMIT 5 FOR KEY SHARE
  `)
  if (rows.length > 4) return null
  const sources = rows.flatMap((row): AttemptSource[] => {
    const sourceRole = row.sourceRole === 'LIQUIDACION_PDF' || row.sourceRole === 'DETALLE_FACTURAS_XLS' ? row.sourceRole : null
    const banco = row.banco === 'BBVA' || row.banco === 'CAIXABANK' ? row.banco : null
    const sourceHash = text(row.sourceHash, 64), facturaRecibidaId = text(row.facturaRecibidaId), archivoControladoId = text(row.archivoControladoId), oneDriveDriveId = text(row.oneDriveDriveId, 300), oneDriveItemId = text(row.oneDriveItemId, 300)
    const parse = privateParse(row.parsedPrivate)
    if (!sourceRole || !banco || !sourceHash || !HASH.test(sourceHash) || !facturaRecibidaId || !archivoControladoId || !oneDriveDriveId || !oneDriveItemId || !parse || parse.sourceHash !== sourceHash) return []
    return [{ sourceRole, banco, sourceHash, facturaRecibidaId, archivoControladoId, oneDriveDriveId, oneDriveItemId, parse }]
  })
  if (sources.length !== rows.length) return null
  const roleCount = (role: AttemptSource['sourceRole']) => sources.filter((source) => source.sourceRole === role).length
  if (input.bank === 'BBVA') return roleCount('LIQUIDACION_PDF') === 1 && sources.length === 1 ? sources : null
  return roleCount('LIQUIDACION_PDF') === 1 && roleCount('DETALLE_FACTURAS_XLS') === 1 && sources.length === 2 ? sources : null
}

async function exactAccount(tx: OneDriveConfirmingReadingTx, ibanLiteral: string | null): Promise<string | null> {
  const iban = normalizeDeclaredConfirmingIban(ibanLiteral)
  if (!iban) return null
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH current_ownership AS (
      SELECT DISTINCT ON (d.cuenta_id) d.cuenta_id,d.estado::text AS estado,d.confirmacion_declarada
      FROM declaraciones_titularidad_modo_facil d
      WHERE d.fecha_declaracion<=CURRENT_DATE
      ORDER BY d.cuenta_id ASC,d.version DESC
    )
    SELECT cb.id
    FROM cuentas_bancarias cb
    JOIN current_ownership ownership ON ownership.cuenta_id=cb.id
      AND ownership.estado='DECLARADA' AND ownership.confirmacion_declarada=true
    WHERE cb.activa=true
      AND regexp_replace(upper(cb.iban),'[^A-Z0-9]','','g')=${iban}
    ORDER BY cb.id ASC LIMIT 2 FOR KEY SHARE
  `)
  return rows.length === 1 && ID.test(rows[0]?.id ?? '') ? rows[0]!.id : null
}

type ExactInvoice = Readonly<{ id: string; numFactura: string; fecha: string; totalCentimos: number }>
async function exactInvoices(tx: OneDriveConfirmingReadingTx, lines: readonly FinanceConfirmingReadingPrivateLine[]): Promise<readonly ExactInvoice[] | null> {
  if (!lines.length || lines.length > 10_000 || lines.some((line) => !normalizeInvoice(line.numFactura) || centsOf(line.importe) === null)) return null
  const normalized = [...new Set(lines.map((line) => normalizeInvoice(line.numFactura)))].sort()
  const rows = await tx.$queryRaw<Array<{ id: string; numFactura: string; fecha: string; totalCentimos: unknown }>>(Prisma.sql`
    SELECT fe.id,fe.num_factura AS "numFactura",fe.fecha::date::text AS fecha,(fe.total::text::numeric*100)::bigint AS "totalCentimos"
    FROM facturas_emitidas fe
    WHERE regexp_replace(upper(fe.num_factura),'[^A-Z0-9]','','g') IN (${Prisma.join(normalized.map((value) => Prisma.sql`${value}`))})
      AND regexp_replace(upper(COALESCE(fe.imputacion,'')),'[^A-Z0-9]','','g')='DRAXTON'
    ORDER BY fe.id ASC
    LIMIT ${lines.length + 1} FOR KEY SHARE
  `)
  if (rows.length > lines.length) return null
  const candidates = rows.flatMap((row): ExactInvoice[] => {
    const id = text(row.id), numFactura = text(row.numFactura, 160), fecha = text(row.fecha, 32), totalCentimos = cents(row.totalCentimos)
    return id && numFactura && fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && totalCentimos !== null ? [{ id, numFactura, fecha, totalCentimos }] : []
  })
  if (candidates.length !== rows.length) return null
  const used = new Set<string>()
  const selected: ExactInvoice[] = []
  for (const line of lines) {
    const nominal = centsOf(line.importe)
    const matches = candidates.filter((candidate) => normalizeInvoice(candidate.numFactura) === normalizeInvoice(line.numFactura) && candidate.totalCentimos === nominal)
    if (matches.length !== 1 || used.has(matches[0]!.id)) return null
    used.add(matches[0]!.id)
    selected.push(matches[0]!)
  }
  return selected
}

function archiveRecord(key: string, source: AttemptSource): ArchivedConfirmingInventoryRecord {
  const parse = source.parse
  return {
    key,
    nombre: `archived-${source.sourceHash}.${source.sourceRole === 'DETALLE_FACTURAS_XLS' ? 'xlsx' : 'pdf'}`,
    extension: source.sourceRole === 'DETALLE_FACTURAS_XLS' ? 'xlsx' : 'pdf',
    sha256: source.sourceHash,
    status: 'PARSED',
    parsed: {
      banco: parse.banco,
      tipoDocumento: parse.tipoDocumento ?? 'NO_CLASIFICADO',
      sourceHash: parse.sourceHash,
      fechaLiquidacion: parse.fechaLiquidacion ?? undefined,
      totalRemesa: parse.totalRemesa,
      netoBancario: parse.netoBancario ?? undefined,
      totalIntereses: parse.totalIntereses ?? undefined,
      totalComisiones: parse.totalComisiones ?? undefined,
      totalIvaComision: parse.totalIvaComision ?? undefined,
      totalDeducir: parse.totalDeducir ?? undefined,
      cuadre: parse.cuadre === null ? undefined : { estado: parse.cuadre },
      lineas: parse.lineas.map((line) => ({
        numFactura: line.numFactura,
        importe: line.importe,
        intereses: line.intereses ?? undefined,
        comision: line.comision ?? undefined,
        fechaFactura: line.fechaFactura ?? undefined,
        fechaPago: line.fechaPago ?? undefined,
        fechaVencimiento: line.fechaVencimiento ?? undefined,
      })),
    },
  }
}

async function readB4AndMovements(tx: OneDriveConfirmingReadingTx, input: Readonly<{
  invoiceIds: readonly string[]
  accountId: string
  liquidationDay: string
}>): Promise<Readonly<{ invoices: readonly StoredLiquidationFacturaEmitida[]; wrappers: readonly StoredLiquidationDocumentoB4[]; movements: readonly StoredLiquidationMovimiento[] }> | null> {
  const end = new Date(`${input.liquidationDay}T00:00:00.000Z`)
  end.setUTCDate(end.getUTCDate() + 4)
  const endDay = end.toISOString().slice(0, 10)
  const [b4Rows, movementRows] = await Promise.all([
    tx.$queryRaw<Array<{ id: string; facturaEmitidaId: string; activo: unknown; objetivoCentimos: unknown; asignadoCentimos: unknown }>>(Prisma.sql`
      SELECT d.id::text AS id,d.factura_emitida_id AS "facturaEmitidaId",d.activo,d.importe_objetivo_centimos AS "objetivoCentimos",
        COALESCE(assigned.total,0)::bigint AS "asignadoCentimos"
      FROM documentos_conciliables d
      LEFT JOIN LATERAL (
        SELECT SUM(v.importe_centimos) FILTER (WHERE v.activo) AS total
        FROM vinculos_movimiento_documento v WHERE v.documento_conciliable_id=d.id
      ) assigned ON TRUE
      WHERE d.tipo='FACTURA_EMITIDA'::"TipoDocumentoConciliable"
        AND d.factura_emitida_id IN (${Prisma.join(input.invoiceIds.map((id) => Prisma.sql`${id}`))})
      ORDER BY d.id ASC LIMIT ${input.invoiceIds.length + 1} FOR KEY SHARE OF d
    `),
    tx.$queryRaw<Array<{ id: string; fecha: string; cuentaId: string | null; importeCentimos: unknown; estadoB4: unknown }>>(Prisma.sql`
      SELECT m.id,m.fecha_operacion::date::text AS fecha,m.cuenta_id AS "cuentaId",(m.importe::text::numeric*100)::bigint AS "importeCentimos",
        COALESCE(e.estado::text,'SIN_DOCUMENTO') AS "estadoB4"
      FROM movimientos_bancarios m
      LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
      WHERE m.cuenta_id=${input.accountId}
        AND m.fecha_operacion::date>=CAST(${input.liquidationDay} AS date)
        AND m.fecha_operacion::date<=CAST(${endDay} AS date)
      ORDER BY m.fecha_operacion::date ASC,m.id ASC LIMIT 101 FOR KEY SHARE OF m
    `),
  ])
  if (b4Rows.length > input.invoiceIds.length || movementRows.length > 100) return null
  const wrappers = b4Rows.flatMap((row): StoredLiquidationDocumentoB4[] => {
    const id = text(row.id), facturaEmitidaId = text(row.facturaEmitidaId), objetivoCentimos = row.objetivoCentimos === null ? null : cents(row.objetivoCentimos), asignadoCentimos = cents(row.asignadoCentimos)
    return id && facturaEmitidaId && asignadoCentimos !== null ? [{ id, facturaEmitidaId, activo: row.activo === true, objetivoCentimos, asignadoCentimos }] : []
  })
  const movements = movementRows.flatMap((row): StoredLiquidationMovimiento[] => {
    const id = text(row.id), fecha = text(row.fecha, 32), cuentaId = row.cuentaId === null ? null : text(row.cuentaId), importeCentimos = cents(row.importeCentimos)
    const estadoB4 = row.estadoB4 === 'SIN_DOCUMENTO' || row.estadoB4 === 'JUSTIFICADO' || row.estadoB4 === 'NO_REQUIERE' ? row.estadoB4 : 'DESCONOCIDO'
    return id && fecha && importeCentimos !== null ? [{ id, fecha, cuentaId, importeCentimos, estadoB4 }] : []
  })
  return { invoices: [], wrappers, movements }
}

function reasonFromCandidates(candidates: ReturnType<typeof buildConfirmingLiquidationCandidates>['candidates']): FinanceConfirmingReadingReason {
  if (!candidates.length) return 'MOVIMIENTO_NO_DISPONIBLE'
  if (candidates.some((candidate) => candidate.bloqueos.includes('LIQUIDACION_MOVIMIENTO_AMBIGUO'))) return 'MOVIMIENTO_AMBIGUO'
  if (candidates.some((candidate) => candidate.bloqueos.includes('LIQUIDACION_MOVIMIENTO_NETO_NO_COINCIDE'))) return 'NETO_BANCARIO_NO_COINCIDE'
  if (candidates.some((candidate) => candidate.bloqueos.includes('LIQUIDACION_CUENTA_DEPOSITARIA_NO_COINCIDE'))) return 'CUENTA_DEPOSITARIA_NO_COINCIDE'
  return 'MOVIMIENTO_NO_DISPONIBLE'
}

async function appendReview(tx: OneDriveConfirmingReadingTx, input: Readonly<{
  actorId: number
  snapshot: FinanceConfirmingReadingPersistedSnapshot
  prepared: FinanceConfirmingReadingP2Prepared
  registeredSource: OneDriveConfirmingRegisteredSource
  reason: FinanceConfirmingReadingReason
}>): Promise<OneDriveConfirmingReadingApplyResult> {
  await appendFinanceConfirmingReadingC11ResultTx(tx, {
    ...input,
    outcome: 'REVISAR',
    liquidacionId: null,
    movimientoId: null,
    motivo: input.reason,
  })
  return { schema: ONEDRIVE_CONFIRMING_READING_BRIDGE_SCHEMA, outcome: 'REVISAR', liquidacionId: null, movimientoId: null, confirmarB4Automaticamente: false, noEscriturasB4: true }
}

/**
 * Ejecuta la parte durable tras lifecycle. `assertLiveFinanceWriteAccess` es el
 * fence real del worker e identifica el actor de servidor dentro de la misma TX;
 * no acepta contexto de UI ni suplantación. Las ausencias documentales conocidas
 * cierran en Revisar lectura, no con una liquidación parcial.
 */
export async function applyOneDriveConfirmingReadingAfterLifecycleTx(input: Readonly<{
  tx: OneDriveConfirmingReadingTx
  actorId: number
  snapshot: FinanceConfirmingReadingPersistedSnapshot
  prepared: FinanceConfirmingReadingP2Prepared
  registeredSource: OneDriveConfirmingRegisteredSource
  assertLiveFinanceWriteAccess: (tx: OneDriveConfirmingReadingTx, actorId: number) => Promise<boolean>
}>): Promise<OneDriveConfirmingReadingApplyResult> {
  if (!Number.isSafeInteger(input.actorId) || input.actorId < 1 || !UUID.test(input.snapshot.lifecycleId) || !UUID.test(input.snapshot.snapshotId)) fail('ONEDRIVE_CONFIRMING_READING_INPUT_INVALID')
  if (input.prepared.confirmarB4Automaticamente || !input.prepared.noEscriturasB4) fail('ONEDRIVE_CONFIRMING_READING_B4_FORBIDDEN')
  if (!await input.assertLiveFinanceWriteAccess(input.tx, input.actorId)) fail('ONEDRIVE_CONFIRMING_READING_ACTOR_DENIED')

  const sourceWrite = await persistPreparedFinanceConfirmingReadingP2Tx(input.tx, {
    actorId: input.actorId,
    snapshot: input.snapshot,
    prepared: input.prepared,
    registeredSource: input.registeredSource,
  })
  if (sourceWrite.outcome === 'SIN_CAMBIOS') {
    return { schema: ONEDRIVE_CONFIRMING_READING_BRIDGE_SCHEMA, outcome: 'SIN_CAMBIOS', liquidacionId: null, movimientoId: null, confirmarB4Automaticamente: false, noEscriturasB4: true }
  }
  // Una fuente que el parser ya dejó en revisión se publica directamente desde
  // su intento FUENTE. No se inventa un RESULTADO_C11: éste sólo existe después
  // de una fuente elegible, una pareja exacta (cuando aplica) y C11 reconstruido.
  if (sourceWrite.outcome === 'REVISAR' || input.prepared.kind !== 'PERSISTIR_PROPUESTA' || !input.prepared.resumen?.banco) {
    return { schema: ONEDRIVE_CONFIRMING_READING_BRIDGE_SCHEMA, outcome: 'REVISAR', liquidacionId: null, movimientoId: null, confirmarB4Automaticamente: false, noEscriturasB4: true }
  }

  // Relee las fuentes desde la tabla append-only; así una Caixa sólo atraviesa
  // C11 cuando PDF+XLS de la misma declaración siguen archivados y actuales.
  const bank = input.prepared.resumen.banco
  const sources = await readCurrentExactSources(input.tx, { resolutionKey: pairResolutionKey(input.prepared, input.snapshot), bank })
  if (!sources) return appendReview(input.tx, { ...input, reason: bank === 'CAIXABANK' ? 'PAREJA_CAIXA_PDF_XLS_INCOMPLETA' : 'EVIDENCIA_C11_INCOMPLETA' })
  const pdf = sources.find((source) => source.sourceRole === 'LIQUIDACION_PDF')!
  const xls = sources.find((source) => source.sourceRole === 'DETALLE_FACTURAS_XLS') ?? null
  const accountId = await exactAccount(input.tx, pdf.parse.cuentaAbonoLiteral)
  if (!accountId) return appendReview(input.tx, { ...input, reason: 'CUENTA_DEPOSITARIA_NO_COINCIDE' })
  const liquidationDay = isoFromDocumentDay(pdf.parse.fechaLiquidacion)
  if (!liquidationDay) return appendReview(input.tx, { ...input, reason: 'EVIDENCIA_C11_INCOMPLETA' })
  const invoiceLines = bank === 'CAIXABANK' ? xls?.parse.lineas ?? [] : pdf.parse.lineas
  const invoices = await exactInvoices(input.tx, invoiceLines)
  if (!invoices || invoices.length !== invoiceLines.length) return appendReview(input.tx, { ...input, reason: 'EVIDENCIA_C11_INCOMPLETA' })

  const pdfKey = `source:${pdf.sourceHash}`
  const xlsKey = xls ? `source:${xls.sourceHash}` : null
  const bindings: ExplicitLiquidationInvoiceBinding[] = invoiceLines.map((line, index) => ({
    facturaEmitidaId: invoices[index]!.id,
    numeroFactura: line.numFactura,
    confirmingLineaId: null,
    fechaEmisionRegistrada: invoices[index]!.fecha,
  }))
  const manifest: ArchivedLiquidationManifest = {
    liquidacionKey: liquidationKey(input.prepared, input.snapshot),
    confirmingId: pdf.facturaRecibidaId,
    banco: bank,
    cuentaDepositariaId: accountId,
    documentoPrincipal: { inventarioKey: pdfKey, facturaRecibidaId: pdf.facturaRecibidaId, archivoControladoId: pdf.archivoControladoId, oneDriveDriveId: pdf.oneDriveDriveId, oneDriveItemId: pdf.oneDriveItemId },
    detalleFacturasXls: xls && xlsKey ? { inventarioKey: xlsKey, facturaRecibidaId: xls.facturaRecibidaId, archivoControladoId: xls.archivoControladoId, oneDriveDriveId: xls.oneDriveDriveId, oneDriveItemId: xls.oneDriveItemId } : null,
    bindings,
  }
  let evidence: ReturnType<typeof loadArchivedConfirmingLiquidation>['evidence']
  try {
    evidence = loadArchivedConfirmingLiquidation({
      inventory: [archiveRecord(pdfKey, pdf), ...(xls && xlsKey ? [archiveRecord(xlsKey, xls)] : [])],
      manifest,
    }).evidence
  } catch (error) {
    if (error instanceof ConfirmingLiquidationLoaderError) return appendReview(input.tx, { ...input, reason: 'EVIDENCIA_C11_INCOMPLETA' })
    throw error
  }
  if (!await input.assertLiveFinanceWriteAccess(input.tx, input.actorId)) fail('ONEDRIVE_CONFIRMING_READING_ACTOR_DENIED')
  let persisted: Awaited<ReturnType<typeof persistConfirmingLiquidationEvidenceTx>>
  try {
    persisted = await persistConfirmingLiquidationEvidenceTx(input.tx, {
      actorRealId: input.actorId,
      actorEfectivoId: input.actorId,
      idempotencyKey: c11IdempotencyUuid(input.snapshot.snapshotId, evidence.sourceHash),
      evidence,
    })
  } catch (error) {
    if (error instanceof ConfirmingLiquidationPersistError && error.status === 409) return appendReview(input.tx, { ...input, reason: 'EVIDENCIA_C11_INCOMPLETA' })
    throw error
  }

  const live = await readB4AndMovements(input.tx, { invoiceIds: invoices.map((invoice) => invoice.id), accountId, liquidationDay })
  if (!live) return appendReview(input.tx, { ...input, reason: 'MOVIMIENTO_NO_DISPONIBLE' })
  const candidates = buildConfirmingLiquidationCandidates({
    liquidaciones: [evidence],
    facturasEmitidas: invoices.map((invoice) => ({ id: invoice.id, numFactura: invoice.numFactura, fecha: invoice.fecha, totalCentimos: invoice.totalCentimos })),
    documentosB4: live.wrappers,
    movimientos: live.movements,
  }).candidates
  const ready = candidates.filter((candidate) => candidate.estado === 'LISTO_PARA_CONFIRMACION_B4')
  if (ready.length !== 1) return appendReview(input.tx, { ...input, reason: reasonFromCandidates(candidates) })
  await appendFinanceConfirmingReadingC11ResultTx(input.tx, {
    actorId: input.actorId,
    snapshot: input.snapshot,
    prepared: input.prepared,
    registeredSource: input.registeredSource,
    outcome: 'PROPUESTA_CONFIRMACION_HUMANA' as FinanceConfirmingReadingFinalOutcome,
    liquidacionId: persisted.liquidacionId,
    movimientoId: ready[0]!.movimientoId,
    motivo: null,
  })
  return {
    schema: ONEDRIVE_CONFIRMING_READING_BRIDGE_SCHEMA,
    outcome: 'PROPUESTA_CONFIRMACION_HUMANA',
    liquidacionId: persisted.liquidacionId,
    movimientoId: ready[0]!.movimientoId,
    confirmarB4Automaticamente: false,
    noEscriturasB4: true,
  }
}
