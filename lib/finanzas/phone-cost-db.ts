import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { facturaEconomicaSQL } from '@/lib/finanzas/invoice-economic-filter'
import { assertPrototypeStaging } from '@/lib/finanzas/prototype-staging'
import {
  calculatePhoneCostAnalytics,
  phoneCostEvidenceSourceSnapshotSha256,
  type PhoneCostAnalyticsDto,
  type PhoneCostBankMovementInput,
  type PhoneCostCalculationInput,
  type PhoneCostConfirmedCostInput,
  type PhoneCostReceivedDocumentInput,
  type PhoneCostSingleServiceEvidenceInput,
} from './phone-cost-core'

/** This module performs SELECTs only. It owns no Prisma client and creates no data. */
export interface PhoneCostReadOptions {
  desde: string
  hasta: string
  proveedor: 'TELEFONICA'
}

export class PhoneCostInputError extends Error {
  constructor(message: string) { super(message) }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const MAX_READ_ROWS = 5_000
const PROVIDER_TRANSLATE_FROM = 'áéíóúüñ'
const PROVIDER_TRANSLATE_TO = 'aeiouun'
const TELEFONICA_PATTERN = '%telefonica%'

function asDay(value: string | null): string | null {
  if (!value || !ISO_DAY.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null
}

function nextUtcDay(value: string): Date {
  const result = new Date(`${value}T00:00:00.000Z`)
  result.setUTCDate(result.getUTCDate() + 1)
  return result
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function bounded<T>(rows: readonly T[], label: string): readonly T[] {
  if (rows.length >= MAX_READ_ROWS) throw new PhoneCostInputError(`La lectura de ${label} alcanzó el límite seguro; acota el período antes de continuar.`)
  return rows
}

export function parsePhoneCostReadOptions(search: URLSearchParams): PhoneCostReadOptions {
  const desde = search.get('desde') ?? '2026-01-01'
  const hasta = search.get('hasta') ?? '2026-10-08'
  const proveedor = search.get('proveedor') ?? 'TELEFONICA'
  const from = asDay(desde)
  const to = asDay(hasta)
  if (!from || !to || from > to) throw new PhoneCostInputError('El período debe usar fechas ISO válidas y desde no puede ser posterior a hasta.')
  if (proveedor !== 'TELEFONICA') throw new PhoneCostInputError('El proveedor permitido en este prototipo es TELEFONICA.')
  if ([...search.keys()].some(key => !['desde', 'hasta', 'proveedor'].includes(key))) throw new PhoneCostInputError('Filtro no permitido en este prototipo.')
  return { desde: from, hasta: to, proveedor }
}

type ReceivedRow = {
  id: string
  numFactura: string | null
  proveedor: string
  fecha: string | null
  baseText: string | null
  totalText: string | null
  archivoOneDrive: string | null
  oneDriveDriveId: string | null
  oneDriveItemId: string | null
  oneDriveRutaActual: string | null
  archivoUrl: string | null
  telefonoServicio: string | null
  datosOcrRaw: string | null
  lineasDetalleRaw: string | null
  economica: boolean | null
}
type ContractRow = { id: number; clienteContratoId: string | null; telefonosContrato: string | null; fechaInicio: string | null; fechaBaja: string | null; activo: boolean | null }
type ClientRow = { id: number; clienteContratoId: string | null; clienteFacturaIspId: string | null; nombre: string }
type IspInvoiceRow = { id: number; clienteFacturaIspId: string | null; fecha: string | null; baseText: string | null }
type IssuedMirrorRow = { facturaIspId: number | null; lineasRaw: string | null }
type ConfirmedCostRow = { id: string; facturaRecibidaId: string; clienteId: number; importeText: string | null; confirmado: boolean | null }
type BankMovementRow = { fecha: string | null; importeText: string | null; concepto: string | null; referencia: string | null; infoAdicional: string | null; tercero: string | null }
type EvidenceRow = {
  facturaId: string
  telefono: string | null
  baseCentimos: string | null
  baseFuenteText: string | null
  totalFuenteText: string | null
  pdfSha256: string | null
  numeroFactura: string | null
  fechaFactura: string | null
  servicioDesde: string | null
  servicioHasta: string | null
  versionExtractor: string | null
  evidencia: unknown
  snapshotAt: string | null
  pdfFacturaCount: number | null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function evidencePhones(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) return null
  return value as readonly string[]
}

/**
 * Input contract for the parent extractor/importer: source values remain text
 * (or integer-as-text) and `evidencia.schema` plus `telefonosServicio` must be
 * preserved exactly. This reader never parses PDF/OCR or invents a source hash.
 */
function currentSourceSnapshot(row: ReceivedRow) {
  return {
    facturaId: row.id,
    proveedor: asString(row.proveedor),
    numeroFactura: asString(row.numFactura),
    fechaFactura: asString(row.fecha),
    baseFuenteText: asString(row.baseText),
    totalFuenteText: asString(row.totalText),
    sourcePointer: {
      archivoOneDrive: asString(row.archivoOneDrive),
      oneDriveDriveId: asString(row.oneDriveDriveId),
      oneDriveItemId: asString(row.oneDriveItemId),
      oneDriveRutaActual: asString(row.oneDriveRutaActual),
      archivoUrl: asString(row.archivoUrl),
    },
  }
}

function evidenceInput(row: EvidenceRow, source: ReceivedRow | undefined): PhoneCostSingleServiceEvidenceInput {
  const metadata = record(row.evidencia)
  const stagedSnapshotHash = asString(metadata?.sourceSnapshotSha256)
  const sourceSnapshotMatches = source !== undefined
    && stagedSnapshotHash !== null
    && phoneCostEvidenceSourceSnapshotSha256(currentSourceSnapshot(source)) === stagedSnapshotHash
  return {
    telefono: asString(row.telefono) ?? '',
    baseCentimos: asString(row.baseCentimos) ?? '',
    baseFuenteText: asString(row.baseFuenteText) ?? '',
    totalFuenteText: asString(row.totalFuenteText) ?? '',
    pdfSha256: asString(row.pdfSha256) ?? '',
    servicioDesde: asString(row.servicioDesde) ?? '',
    servicioHasta: asString(row.servicioHasta) ?? '',
    numeroFactura: asString(row.numeroFactura) ?? '',
    fechaFactura: asString(row.fechaFactura) ?? '',
    schema: asString(metadata?.schema),
    versionExtractor: asString(row.versionExtractor),
    telefonosServicio: evidencePhones(metadata?.telefonosServicio),
    snapshotAt: asString(row.snapshotAt),
    // Computed across the full immutable staging table, not just the request.
    pdfCompartidoEntreFacturas: row.pdfFacturaCount !== 1,
    sourceSnapshotMatches,
  }
}

/**
 * Reads received invoices once. The economic fence is an exact B2/C9 predicate,
 * evaluated by PostgreSQL in the same SELECT; all monetary values use `::text`
 * rather than Prisma Float hydration.
 */
function receivedSql(start: Date, endExclusive: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT
      fr.id,
      fr.num_factura AS "numFactura",
      fr.proveedor,
      fr.fecha::date::text AS fecha,
      fr.base::text AS "baseText",
      fr.total::text AS "totalText",
      fr.archivo_onedrive AS "archivoOneDrive",
      fr.onedrive_drive_id AS "oneDriveDriveId",
      fr.onedrive_item_id AS "oneDriveItemId",
      fr.onedrive_ruta_actual AS "oneDriveRutaActual",
      fr.archivo_url AS "archivoUrl",
      fr.telefono_servicio AS "telefonoServicio",
      fr.datos_ocr_raw AS "datosOcrRaw",
      fr.lineas_detalle AS "lineasDetalleRaw",
      (${facturaEconomicaSQL('fr')}) AS economica
    FROM facturas_recibidas fr
    WHERE fr.fecha >= ${start} AND fr.fecha < ${endExclusive}
      AND translate(lower(COALESCE(fr.proveedor, '')), ${PROVIDER_TRANSLATE_FROM}, ${PROVIDER_TRANSLATE_TO}) LIKE ${TELEFONICA_PATTERN}
    ORDER BY fr.fecha ASC, fr.id ASC
    LIMIT ${MAX_READ_ROWS}
  `
}

/**
 * The newest immutable snapshot is selected per FR+PDF hash. If an FR has two
 * different valid PDF hashes, both intentionally reach the pure core and the
 * document becomes revision; this query never treats timestamp as a tie-break
 * between documents. Hash reuse is counted over the entire staging table so a
 * B2 duplicate outside the requested period cannot create a second allocation.
 */
function evidenceSql(): Prisma.Sql {
  return Prisma.sql`
    WITH ranked AS (
      SELECT e.*,
        row_number() OVER (
          PARTITION BY e.factura_id, e.pdf_sha256
          ORDER BY e.created_at DESC, e.id DESC
        ) AS snapshot_rank
      FROM public.evidencias_coste_telefono_stage e
    ), current_snapshot AS (
      SELECT * FROM ranked WHERE snapshot_rank = 1
    )
    SELECT
      e.factura_id AS "facturaId",
      e.telefono::text AS telefono,
      e.base_centimos::text AS "baseCentimos",
      e.base_fuente_text AS "baseFuenteText",
      e.total_fuente_text AS "totalFuenteText",
      e.pdf_sha256::text AS "pdfSha256",
      e.numero_factura AS "numeroFactura",
      e.fecha_factura::date::text AS "fechaFactura",
      e.servicio_desde::date::text AS "servicioDesde",
      e.servicio_hasta::date::text AS "servicioHasta",
      e.version_extractor AS "versionExtractor",
      e.evidencia,
      e.created_at::text AS "snapshotAt",
      count(*) OVER (PARTITION BY e.pdf_sha256)::int AS "pdfFacturaCount"
    FROM current_snapshot e
    ORDER BY e.factura_id ASC, e.pdf_sha256 ASC, e.created_at DESC, e.id DESC
    LIMIT ${MAX_READ_ROWS}
  `
}

/** No fallback to non-evidenced/production source reads when the additive DDL is absent. */
async function assertEvidenceTableInstalled(tx: Pick<Prisma.TransactionClient, '$queryRaw'>): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ installed: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.evidencias_coste_telefono_stage') IS NOT NULL AS installed
  `)
  if (rows.length !== 1 || rows[0].installed !== true) {
    throw new PhoneCostInputError('Falta la tabla staging de evidencia PDF de telefonía; la analítica no lee fuentes sin este DDL inmutable.')
  }
}

function contractsSql(): Prisma.Sql {
  return Prisma.sql`
    SELECT id, cliente_id AS "clienteContratoId", telefonos_contrato AS "telefonosContrato",
      fecha_inicio::date::text AS "fechaInicio", fecha_baja::date::text AS "fechaBaja", activo
    FROM contratos_servicio
    WHERE telefonos_contrato IS NOT NULL
    ORDER BY id ASC
    LIMIT ${MAX_READ_ROWS}
  `
}

function clientsSql(): Prisma.Sql {
  return Prisma.sql`
    SELECT id, cliente_id_isp AS "clienteContratoId", isp_gestion_id AS "clienteFacturaIspId", nombre
    FROM clientes_web
    WHERE cliente_id_isp IS NOT NULL OR isp_gestion_id IS NOT NULL
    ORDER BY id ASC
    LIMIT ${MAX_READ_ROWS}
  `
}

function ispInvoicesSql(start: Date, endExclusive: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT id, id_cliente::text AS "clienteFacturaIspId", fecha::date::text AS fecha, base::text AS "baseText"
    FROM facturas
    WHERE fecha >= ${start} AND fecha < ${endExclusive}
    ORDER BY fecha ASC, id ASC
    LIMIT ${MAX_READ_ROWS}
  `
}

function issuedMirrorsSql(start: Date, endExclusive: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT fe.factura_isp_id AS "facturaIspId", fe.lineas AS "lineasRaw"
    FROM facturas_emitidas fe
    JOIN facturas f ON f.id = fe.factura_isp_id
    WHERE fe.factura_isp_id IS NOT NULL AND f.fecha >= ${start} AND f.fecha < ${endExclusive}
    ORDER BY fe.id ASC
    LIMIT ${MAX_READ_ROWS}
  `
}

function confirmedCostSql(): Prisma.Sql {
  return Prisma.sql`
    SELECT id, factura_id AS "facturaRecibidaId", cliente_id AS "clienteId",
      importe::text AS "importeText", confirmado
    FROM imputaciones_coste_cliente
    WHERE confirmado = TRUE
    ORDER BY id ASC
    LIMIT ${MAX_READ_ROWS}
  `
}

/**
 * Censo bancario, no fuente de coste. Los textos se mantienen sólo durante el
 * reconocimiento contextual dentro del proceso; la salida sólo lleva agregados.
 */
function bankPhoneCensusSql(start: Date, endExclusive: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT fecha_operacion::date::text AS fecha, importe::text AS "importeText",
      concepto, referencia, info_adicional AS "infoAdicional", tercero
    FROM movimientos_bancarios
    WHERE fecha_operacion >= ${start} AND fecha_operacion < ${endExclusive}
      AND concat_ws(' ', concepto, referencia, info_adicional, tercero) ~* '(telefonica|telef[oó]nica|movistar)'
    ORDER BY fecha_operacion ASC, id ASC
    LIMIT ${MAX_READ_ROWS}
  `
}

/**
 * Reads only staging source tables. COPIA, bad OCR provider rows and confirming
 * documents can be visible for deduplication but cannot be economic (`economica`
 * false), so the pure core excludes them from every cost proposal.
 */
export async function readPhoneCostAnalytics(options: PhoneCostReadOptions): Promise<PhoneCostAnalyticsDto> {
  // The helper is safe when invoked without its HTTP route: no source SELECT
  // starts before the isolated-staging assertion succeeds.
  await assertPhoneCostPrototypeStaging()
  const start = new Date(`${options.desde}T00:00:00.000Z`)
  const endExclusive = nextUtcDay(options.hasta)
  const result = await prisma.$transaction(async tx => {
    // This reader has no write branch. The database itself rejects accidental
    // future mutation before the staging-evidence or source SELECTs begin.
    await tx.$executeRaw`SET TRANSACTION READ ONLY`
    await assertEvidenceTableInstalled(tx)
    const [received, evidenceRows, contracts, clients, ispInvoices, issuedMirrors, confirmedCosts, bankMovements] = await Promise.all([
      tx.$queryRaw<ReceivedRow[]>(receivedSql(start, endExclusive)),
      tx.$queryRaw<EvidenceRow[]>(evidenceSql()),
      tx.$queryRaw<ContractRow[]>(contractsSql()),
      tx.$queryRaw<ClientRow[]>(clientsSql()),
      tx.$queryRaw<IspInvoiceRow[]>(ispInvoicesSql(start, endExclusive)),
      tx.$queryRaw<IssuedMirrorRow[]>(issuedMirrorsSql(start, endExclusive)),
      tx.$queryRaw<ConfirmedCostRow[]>(confirmedCostSql()),
      tx.$queryRaw<BankMovementRow[]>(bankPhoneCensusSql(start, endExclusive)),
    ])

    const receivedRows = bounded(received, 'facturas recibidas')
    const receivedByFacturaId = new Map(receivedRows.map(row => [row.id, row]))
    const evidenceByFacturaId = new Map<string, PhoneCostSingleServiceEvidenceInput[]>()
    for (const row of bounded(evidenceRows, 'evidencias PDF de teléfono')) {
      const list = evidenceByFacturaId.get(row.facturaId) ?? []
      list.push(evidenceInput(row, receivedByFacturaId.get(row.facturaId)))
      evidenceByFacturaId.set(row.facturaId, list)
    }
    const visibleDocuments: PhoneCostReceivedDocumentInput[] = receivedRows.map(row => ({
      id: row.id,
      numFactura: row.numFactura,
      proveedor: row.proveedor,
      fecha: asString(row.fecha),
      baseText: asString(row.baseText),
      totalText: asString(row.totalText),
      economica: row.economica === true,
      telefonoServicio: row.telefonoServicio,
      datosOcrRaw: row.datosOcrRaw,
      lineasDetalleRaw: row.lineasDetalleRaw,
      evidenciasServicioUnico: evidenceByFacturaId.get(row.id) ?? [],
    }))

    /*
     * ImputacionCosteCliente is legacy. `confirmado=true` by itself does not
     * prove the exact service line, client bridge or historical validity, so it
     * cannot populate an audited assignment. Staged PDF evidence remains a
     * proposal and does not change this confirmation boundary.
     */
    const qualifyingConfirmed: PhoneCostConfirmedCostInput[] = bounded(confirmedCosts, 'imputaciones de coste confirmadas').map(row => ({
      id: row.id,
      facturaRecibidaId: row.facturaRecibidaId,
      clienteId: row.clienteId,
      importeText: row.importeText,
      confirmado: row.confirmado === true,
      // The legacy schema has no evidence fields for exact service line,
      // client bridge and historical validity. Do not treat the flag as proof.
      asignacionAcreditada: false,
    }))
    const movimientosBancoTelefono: PhoneCostBankMovementInput[] = bounded(bankMovements, 'movimientos bancarios telefónicos').map(row => ({
      fecha: asString(row.fecha),
      importeText: asString(row.importeText),
      texto: [row.concepto, row.referencia, row.infoAdicional, row.tercero]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(' | '),
    }))
    const input: PhoneCostCalculationInput = {
      periodo: { desde: options.desde, hasta: options.hasta },
      documentosRecibidos: visibleDocuments,
      contratos: bounded(contracts, 'contratos').map(row => ({
        id: row.id,
        clienteContratoId: row.clienteContratoId,
        telefonosContrato: row.telefonosContrato,
        fechaInicio: asString(row.fechaInicio),
        fechaBaja: asString(row.fechaBaja),
        activo: row.activo === true,
      })),
      clientes: bounded(clients, 'clientes').map(row => ({
        id: row.id,
        clienteContratoId: row.clienteContratoId,
        clienteFacturaIspId: row.clienteFacturaIspId,
        nombre: row.nombre,
      })),
      facturasIsp: bounded(ispInvoices, 'facturas ISP').map(row => ({
        id: row.id,
        clienteFacturaIspId: row.clienteFacturaIspId,
        fecha: asString(row.fecha),
        baseText: asString(row.baseText),
      })),
      // The core never adds this population to income, preventing FI↔ISP mirror
      // double counting. Its lines remain read-only evidence for later UI review.
      facturasEmitidasEspejo: bounded(issuedMirrors, 'espejos emitidos').map(row => ({ facturaIspId: row.facturaIspId, lineasRaw: row.lineasRaw })),
      movimientosBancoTelefono,
      costesConfirmados: qualifyingConfirmed,
    }
    return calculatePhoneCostAnalytics(input)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 })
  return result
}

/** Route-facing guard kept separate so tests can assert it runs before all SELECTs. */
export async function assertPhoneCostPrototypeStaging(): Promise<void> {
  await assertPrototypeStaging()
}
