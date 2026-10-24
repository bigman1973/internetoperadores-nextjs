import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertPrototypeStaging } from './prototype-staging'
import { facturaEconomicaSQL } from './invoice-economic-filter'
import { digest, invoiceSnapshot } from './operator-costs'
import {
  CustomerCostAllocationError,
  allocationPayloadHash,
  apportionCostLargestRemainder,
  assertClassificationForCost,
  currentUtcPeriod,
  eurosToCentsExact,
  normalizedTwelfthCents,
  periodBounds,
  verifiedUnits,
  type AllocationRequest,
  type ValidContractSale,
} from './customer-cost-allocation-core'

export type CustomerCostAllocationTx = Prisma.TransactionClient
type DbClient = CustomerCostAllocationTx | typeof prisma

type SourceRow = {
  fuenteId: string
  estado: string
  sourceVersion: number
  fuenteVersion: string
  fuenteSnapshot: unknown
  facturaId: string
  documentVersion: string
  proveedor: string
  numFactura: string | null
  fecha: Date
  base: number
  concepto: string | null
  lineasDetalle: string | null
  facturaEstado: string
  imputadoAVentas: boolean
  directAllocations: bigint | number
  directLinks: bigint | number
  sourceDirectAllocations: bigint | number
  sourceDirectLinks: bigint | number
  sourceImputed: boolean
}
type ContractRow = {
  contratoId: number
  contratoClienteId: string
  contratoTitulo: string
  contratoTarifa: string
  precio: unknown
  contratoActivo: boolean
  fechaInicio: Date | null
  fechaBaja: Date | null
  clienteMatches: bigint | number
  clienteId: number | null
  clienteNombre: string | null
  clienteActivo: boolean | null
  tarifaMatches: bigint | number
  tarifaPeriodo: number | null
  tarifaId: number | null
}
type AllocationRow = { id: string; payloadHash: string; clasificacion: string; estado: string; costeCentimos: bigint | number | string; version: number; snapshotSeleccion: unknown; periodoServicio: Date }
type StoredSaleRow = { clienteId: number; contratoId: number; ventaPeriodoCentimos: bigint | number | string; unidadesPeriodoMeses: number; ventaNormalizadaDoceavosCentimo: bigint | number | string; snapshotContrato: unknown; clienteNombre: string | null; contratoTitulo: string | null }

export type CandidateContract = {
  clienteId: number | null
  clienteNombre: string | null
  contratoId: number
  contratoTitulo: string
  tarifa: string
  precio: number | null
  unidadesPeriodoMeses: number | null
  seleccionable: boolean
  motivoExclusion: string | null
}
export type SourceListItem = {
  id: string
  proveedor: string
  numFactura: string | null
  fecha: string
  base: number
  estado: string
  version: number
  snapshotHash: string
  clasificacionActual: string | null
  bloqueada: boolean
  motivoBloqueo: string | null
}
type SourceListRaw = Omit<SourceListItem, 'fecha' | 'clasificacionActual' | 'bloqueada' | 'motivoBloqueo'> & {
  fecha: Date
  totalRows: bigint | number
  directAllocations: bigint | number
  directLinks: bigint | number
  imputed: boolean
  sourceDirectAllocations: bigint | number
  sourceDirectLinks: bigint | number
  sourceImputed: boolean
}

function asBigInt(value: bigint | number | string | null | undefined, label: string): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value)
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value)
  throw new CustomerCostAllocationError('DATA_INVALID', `${label} no es un entero exacto.`, 409)
}
function count(value: bigint | number | null | undefined): number { return typeof value === 'bigint' ? Number(value) : Number(value || 0) }
function stringifyJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)
}
function isoDate(value: Date): string { return value.toISOString().slice(0, 10) }
function isUndefinedTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  const meta = (error as { meta?: unknown } | null)?.meta
  const message = error instanceof Error ? error.message : ''
  return code === 'P2010' && /does not exist|42P01/i.test(`${message} ${JSON.stringify(meta ?? null)}`)
}
function sourceError(message: string, code = 'SOURCE_NOT_ELIGIBLE', status = 409): never { throw new CustomerCostAllocationError(code, message, status) }

/**
 * The route's session check is intentionally not trusted as the only write
 * fence. This check runs in the same transaction as the decision, re-reading
 * the active actor and the current area policy from the database.
 */
async function requireLiveAllocationWriter(tx: CustomerCostAllocationTx, actorId: number): Promise<void> {
  if (!Number.isSafeInteger(actorId) || actorId <= 0) {
    throw new CustomerCostAllocationError('ACTOR_FORBIDDEN', 'El actor de reparto no es válido.', 403)
  }
  const rows = await tx.$queryRaw<Array<{ active: boolean; role: string; roles: string[] | null; granularPermissions: bigint | number; areaWrite: boolean }>>(Prisma.sql`
    SELECT u.activo AS active, u.rol::text AS role, u.roles AS roles,
      (SELECT COUNT(*) FROM permiso_usuarios pu WHERE pu.usuario_id = u.id AND (pu.lectura = true OR pu.escritura = true)) AS "granularPermissions",
      EXISTS (
        SELECT 1
        FROM permiso_usuarios pu
        JOIN permiso_areas pa ON pa.id = pu.area_id AND pa.activo = true
        WHERE pu.usuario_id = u.id
          AND pu.escritura = true
          AND pa.codigo IN ('admin', 'admin.finanzas', 'admin.finanzas.analitica_costes')
      ) AS "areaWrite"
    FROM usuarios_admin u
    WHERE u.id = ${actorId}
    FOR SHARE
  `)
  const actor = rows[0]
  const legacyAccounting = actor && count(actor.granularPermissions) === 0 && (actor.role === 'CONTABILIDAD' || (actor.roles || []).includes('CONTABILIDAD'))
  if (!actor?.active || !(actor.role === 'SUPER_ADMIN' || actor.role === 'GERENTE' || actor.areaWrite || legacyAccounting)) {
    throw new CustomerCostAllocationError('ACTOR_FORBIDDEN', 'El actor ya no tiene permiso de escritura para reparto de costes.', 403)
  }
}

/** Transaction-local counterpart of the public staging guard for Tx callers. */
async function assertCustomerCostAllocationTxStage(tx: CustomerCostAllocationTx): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ databaseName: string; databaseUser: string; allocationTable: string | null }>>(Prisma.sql`
    SELECT current_database() AS "databaseName", current_user AS "databaseUser",
      to_regclass('repartos_coste_cliente')::text AS "allocationTable"
    LIMIT 1
  `)
  const current = rows[0]
  if (!current || current.databaseName !== 'io_staging_finanzas' || current.databaseUser !== 'io_staging_finanzas') {
    throw new CustomerCostAllocationError('STAGING_PROTOTYPE_ONLY', 'Este reparto sólo está disponible en staging aislado.', 404)
  }
  if (current.allocationTable !== 'repartos_coste_cliente') {
    throw new CustomerCostAllocationError('MIGRATION_PENDING', 'La migración de reparto aún no está aplicada en staging; no se guardó ninguna decisión.', 503)
  }
}

/** Locks the physical source triple for an idempotent replay without judging its current eligibility. */
async function lockReplaySource(tx: CustomerCostAllocationTx, sourceId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ sourceId: string }>>(Prisma.sql`
    SELECT f.id AS "sourceId"
    FROM fuentes_coste_operadora f
    JOIN documentos_coste_operadora d ON d.fuente_id = f.id AND d.rol = 'ORIGINAL'
    JOIN facturas_recibidas fr ON fr.id = d.factura_id
    WHERE f.id = ${sourceId}
    FOR UPDATE OF f, d, fr
  `)
  if (rows.length !== 1) sourceError('La fuente ya no conserva una factura original bloqueable.', 'SOURCE_NOT_FOUND')
}

/** Current source/invoice evidence. Call only after the route's staging guard. */
async function loadSource(client: DbClient, sourceId: string, lock = false): Promise<SourceRow> {
  const locked = lock ? Prisma.sql` FOR UPDATE OF f, d, fr` : Prisma.empty
  const rows = await client.$queryRaw<SourceRow[]>(Prisma.sql`
    SELECT f.id AS "fuenteId", f.estado, f.version AS "sourceVersion", f.fuente_version AS "fuenteVersion", f.snapshot AS "fuenteSnapshot",
      fr.id AS "facturaId", d.version AS "documentVersion", fr.proveedor, fr.num_factura AS "numFactura", fr.fecha,
      fr.base, fr.concepto, fr.lineas_detalle AS "lineasDetalle", fr.estado AS "facturaEstado", fr.imputado_a_ventas AS "imputadoAVentas",
      (SELECT COUNT(*) FROM imputaciones_coste_cliente ic WHERE ic.factura_id = fr.id AND ic.confirmado = true) AS "directAllocations",
      (SELECT COUNT(*) FROM vinculaciones_facturas vf WHERE vf.factura_recibida_id = fr.id) AS "directLinks",
      (SELECT COUNT(*) FROM documentos_coste_operadora sd JOIN imputaciones_coste_cliente ic ON ic.factura_id = sd.factura_id AND ic.confirmado = true WHERE sd.fuente_id = f.id) AS "sourceDirectAllocations",
      (SELECT COUNT(*) FROM documentos_coste_operadora sd JOIN vinculaciones_facturas vf ON vf.factura_recibida_id = sd.factura_id WHERE sd.fuente_id = f.id) AS "sourceDirectLinks",
      EXISTS (SELECT 1 FROM documentos_coste_operadora sd JOIN facturas_recibidas sf ON sf.id = sd.factura_id WHERE sd.fuente_id = f.id AND sf.imputado_a_ventas = true) AS "sourceImputed"
    FROM fuentes_coste_operadora f
    JOIN documentos_coste_operadora d ON d.fuente_id = f.id AND d.rol = 'ORIGINAL'
    JOIN facturas_recibidas fr ON fr.id = d.factura_id
    WHERE f.id = ${sourceId} AND ${facturaEconomicaSQL('fr')}
      AND fr.conflicto_identidad = false AND fr.duplicado_externo = false
    ${locked}
  `)
  if (rows.length !== 1) sourceError('La fuente no tiene una factura original B2/C9 canónica y válida.')
  return rows[0]
}

function validateSource(source: SourceRow, request: Pick<AllocationRequest, 'sourceVersion' | 'invoiceSnapshotHash'>) {
  if (source.estado !== 'REVISADO') sourceError('Sólo se puede decidir un coste de operadora revisado.')
  if (source.facturaEstado === 'RECHAZADA') sourceError('La factura original está rechazada.')
  if (source.imputadoAVentas || source.sourceImputed || count(source.directAllocations) > 0 || count(source.directLinks) > 0 || count(source.sourceDirectAllocations) > 0 || count(source.sourceDirectLinks) > 0) {
    sourceError('La factura original o refacturada de esta fuente ya tiene una imputación directa o vínculo de venta; no se puede duplicar como reparto compartido.', 'DIRECT_COST_CONFLICT')
  }
  const snapshot = invoiceSnapshot({ proveedor: source.proveedor, numFactura: source.numFactura, fecha: source.fecha, base: source.base, concepto: source.concepto, lineasDetalle: source.lineasDetalle })
  const currentHash = digest(snapshot)
  // fuenteSnapshot lives as JSONB, whose key serialization is not the original
  // insertion order. The immutable document snapshot hash is d.version; compare
  // that canonical invoice projection rather than re-stringifying JSONB.
  if (source.documentVersion !== currentHash) {
    sourceError('La fuente documental cambió; revisa el coste de operadora antes de repartir.', 'SOURCE_CHANGED')
  }
  if (source.sourceVersion !== request.sourceVersion || currentHash !== request.invoiceSnapshotHash) {
    sourceError('La fuente o factura cambió desde la previsualización. Recarga antes de confirmar.', 'SOURCE_VERSION_CONFLICT')
  }
  return { snapshot, currentHash, costeCentimos: eurosToCentsExact(source.base, 'La base de la factura') }
}

async function contractRows(client: DbClient, period: string, contractIds?: readonly number[], search = ''): Promise<ContractRow[]> {
  const bounds = periodBounds(period)
  const ids = contractIds && contractIds.length ? Prisma.sql`AND mapped."contratoId" IN (${Prisma.join(contractIds)})` : Prisma.empty
  const term = search.trim()
  const filter = term ? Prisma.sql`AND (
    COALESCE(cw.nombre, '') ILIKE ${`%${term.replace(/[\\%_]/g, '\\$&')}%`} ESCAPE '\\'
    OR mapped."contratoTitulo" ILIKE ${`%${term.replace(/[\\%_]/g, '\\$&')}%`} ESCAPE '\\'
    OR mapped."contratoTarifa" ILIKE ${`%${term.replace(/[\\%_]/g, '\\$&')}%`} ESCAPE '\\'
  )` : Prisma.empty
  return client.$queryRaw<ContractRow[]>(Prisma.sql`
    WITH mapped AS (
      SELECT cs.id AS "contratoId", cs.cliente_id AS "contratoClienteId", cs.titulo AS "contratoTitulo", cs.tarifa AS "contratoTarifa",
        cs.precio, cs.activo AS "contratoActivo", cs.fecha_inicio AS "fechaInicio", cs.fecha_baja AS "fechaBaja",
        (SELECT COUNT(*) FROM clientes_web cwx WHERE cwx.cliente_id_isp = cs.cliente_id OR cwx.isp_gestion_id = cs.cliente_id) AS "clienteMatches",
        (SELECT MIN(cwx.id) FROM clientes_web cwx WHERE cwx.cliente_id_isp = cs.cliente_id OR cwx.isp_gestion_id = cs.cliente_id) AS "clienteId",
        (SELECT MIN(cwx.nombre) FROM clientes_web cwx WHERE cwx.cliente_id_isp = cs.cliente_id OR cwx.isp_gestion_id = cs.cliente_id) AS "clienteNombre",
        (SELECT BOOL_AND(COALESCE(cwx.activo, false)) FROM clientes_web cwx WHERE cwx.cliente_id_isp = cs.cliente_id OR cwx.isp_gestion_id = cs.cliente_id) AS "clienteActivo",
        (SELECT COUNT(*) FROM tarifas tx WHERE tx.nombre = cs.tarifa) AS "tarifaMatches",
        (SELECT MIN(tx.tipo_periodicidad) FROM tarifas tx WHERE tx.nombre = cs.tarifa) AS "tarifaPeriodo",
        (SELECT MIN(tx.id) FROM tarifas tx WHERE tx.nombre = cs.tarifa) AS "tarifaId"
      FROM contratos_servicio cs
    )
    SELECT mapped.*
    FROM mapped
    LEFT JOIN clientes_web cw ON cw.id = mapped."clienteId"
    WHERE true ${ids} ${filter}
    ORDER BY COALESCE(mapped."clienteNombre", '') ASC, mapped."contratoId" ASC
    LIMIT 250
  `)
}

function contractCandidate(row: ContractRow, period: string, expectedClientId?: number): CandidateContract {
  const price = Number(row.precio)
  const matches = count(row.clienteMatches)
  const tariffs = count(row.tarifaMatches)
  const units = verifiedUnits(row.tarifaPeriodo)
  let reason: string | null = null
  if (period !== currentUtcPeriod()) reason = 'PRICE_HISTORY_GAP_PENDING_MANUAL_PROVISIONING'
  else if (matches !== 1 || !row.clienteId) reason = 'CLIENT_MAPPING_NOT_UNIQUE'
  else if (expectedClientId !== undefined && row.clienteId !== expectedClientId) reason = 'CLIENT_CONTRACT_MISMATCH'
  else if (row.clienteActivo !== true) reason = 'CLIENT_NOT_ACTIVE'
  else if (!row.contratoActivo) reason = 'CONTRACT_NOT_ACTIVE'
  else if (!row.fechaInicio || row.fechaInicio > periodBounds(period).start || (row.fechaBaja !== null && row.fechaBaja < periodBounds(period).endExclusive)) reason = 'CONTRACT_NOT_VIGENT_FOR_FULL_SERVICE_PERIOD'
  else if (!Number.isFinite(price) || price <= 0) reason = price === 0 ? 'ZERO_SALE_EXCLUDED' : 'NON_POSITIVE_SALE_EXCLUDED'
  else if (tariffs !== 1 || !units) reason = 'PERIODICITY_UNVERIFIED'
  return {
    clienteId: row.clienteId, clienteNombre: row.clienteNombre, contratoId: row.contratoId,
    contratoTitulo: row.contratoTitulo, tarifa: row.contratoTarifa,
    precio: Number.isFinite(price) ? price : null, unidadesPeriodoMeses: units,
    seleccionable: reason === null, motivoExclusion: reason,
  }
}
function validSale(row: ContractRow, candidate: CandidateContract): ValidContractSale {
  if (!candidate.seleccionable || !candidate.clienteId || !candidate.clienteNombre || !candidate.unidadesPeriodoMeses || candidate.precio === null) {
    throw new CustomerCostAllocationError('CONTRACT_NOT_ELIGIBLE', `El contrato ${row.contratoId} no es seleccionable: ${candidate.motivoExclusion || 'sin fuente verificable'}.`, 409)
  }
  const units = candidate.unidadesPeriodoMeses as 1 | 3 | 12
  const cents = eurosToCentsExact(candidate.precio, `Precio del contrato ${row.contratoId}`)
  return {
    clienteId: candidate.clienteId, clienteNombre: candidate.clienteNombre, contratoId: row.contratoId, contratoTitulo: row.contratoTitulo,
    ventaPeriodoCentimos: cents, unidadesPeriodoMeses: units, ventaNormalizadaDoceavosCentimo: normalizedTwelfthCents(cents, units),
    snapshot: {
      schema: 'CUSTOMER_CONTRACT_SNAPSHOT_V1', clienteId: candidate.clienteId, clienteNombre: candidate.clienteNombre,
      contratoId: row.contratoId, contratoClienteId: row.contratoClienteId, titulo: row.contratoTitulo, tarifa: row.contratoTarifa,
      precioPeriodoCentimos: cents.toString(), unidadesPeriodoMeses: units, ventaNormalizadaDoceavosCentimo: normalizedTwelfthCents(cents, units).toString(),
      fechaInicio: row.fechaInicio ? isoDate(row.fechaInicio) : null, fechaBaja: row.fechaBaja ? isoDate(row.fechaBaja) : null,
    },
  }
}

async function loadReversalSales(client: DbClient, request: AllocationRequest): Promise<ValidContractSale[]> {
  if (!request.reversionDeRepartoId) throw new CustomerCostAllocationError('NEGATIVE_MAPPING_REQUIRED', 'Indica el reparto positivo que se revierte.')
  const previous = await client.$queryRaw<AllocationRow[]>(Prisma.sql`
    SELECT id, payload_hash AS "payloadHash", clasificacion, estado, coste_centimos AS "costeCentimos", version,
      snapshot_seleccion AS "snapshotSeleccion", periodo_servicio AS "periodoServicio"
    FROM repartos_coste_cliente WHERE id = ${request.reversionDeRepartoId} AND estado = 'VIGENTE' FOR SHARE
  `)
  if (previous.length !== 1 || previous[0].clasificacion !== 'REPARTIBLE' || asBigInt(previous[0].costeCentimos, 'Coste original') <= BigInt(0)) {
    throw new CustomerCostAllocationError('NEGATIVE_MAPPING_REQUIRED', 'El reparto a revertir debe ser una decisión repartible positiva vigente.', 409)
  }
  const sales = await client.$queryRaw<StoredSaleRow[]>(Prisma.sql`
    SELECT rc.cliente_id AS "clienteId", rc.contrato_id AS "contratoId", rc.venta_periodo_centimos AS "ventaPeriodoCentimos",
      rc.unidades_periodo_meses AS "unidadesPeriodoMeses", rc.venta_normalizada_doceavos_centimo AS "ventaNormalizadaDoceavosCentimo",
      rc.snapshot_contrato AS "snapshotContrato", l.snapshot_cliente->>'nombre' AS "clienteNombre", rc.snapshot_contrato->>'titulo' AS "contratoTitulo"
    FROM repartos_coste_cliente_contratos rc
    LEFT JOIN repartos_coste_cliente_lineas l ON l.reparto_id = rc.reparto_id AND l.cliente_id = rc.cliente_id
    WHERE rc.reparto_id = ${request.reversionDeRepartoId}
    ORDER BY rc.cliente_id ASC, rc.contrato_id ASC
  `)
  const expected = sales.map(row => `${row.clienteId}:${row.contratoId}`).sort()
  const provided = request.selecciones.map(row => `${row.clienteId}:${row.contratoId}`).sort()
  if (expected.length !== provided.length || expected.some((item, index) => item !== provided[index])) {
    throw new CustomerCostAllocationError('NEGATIVE_MAPPING_MISMATCH', 'El abono debe mapear exactamente los contratos del reparto positivo indicado.', 409)
  }
  return sales.map(row => {
    const units = verifiedUnits(row.unidadesPeriodoMeses)
    const normalised = asBigInt(row.ventaNormalizadaDoceavosCentimo, 'Venta histórica normalizada')
    const sale = asBigInt(row.ventaPeriodoCentimos, 'Venta histórica')
    if (!units || sale <= BigInt(0) || normalised <= BigInt(0) || !row.clienteNombre || !row.contratoTitulo) {
      throw new CustomerCostAllocationError('NEGATIVE_MAPPING_INVALID', 'El snapshot del reparto positivo no es verificable.', 409)
    }
    return { clienteId: row.clienteId, clienteNombre: row.clienteNombre, contratoId: row.contratoId, contratoTitulo: row.contratoTitulo, ventaPeriodoCentimos: sale, unidadesPeriodoMeses: units, ventaNormalizadaDoceavosCentimo: normalised, snapshot: row.snapshotContrato as Record<string, unknown> }
  })
}

async function validatedSales(client: DbClient, request: AllocationRequest): Promise<ValidContractSale[]> {
  if (request.clasificacion === 'PUNTUAL') return []
  if (request.clasificacion === 'ABONO_EXPLICITO') return loadReversalSales(client, request)
  const ids = request.selecciones.map(item => item.contratoId)
  const rows = await contractRows(client, request.periodoServicio, ids)
  if (rows.length !== ids.length) throw new CustomerCostAllocationError('CONTRACT_NOT_FOUND', 'Uno o varios contratos seleccionados ya no existen.', 409)
  const byId = new Map(rows.map(row => [row.contratoId, row]))
  return request.selecciones.map(selection => {
    const row = byId.get(selection.contratoId)
    if (!row) throw new CustomerCostAllocationError('CONTRACT_NOT_FOUND', 'Contrato no encontrado.', 409)
    return validSale(row, contractCandidate(row, request.periodoServicio, selection.clienteId))
  })
}

function previewFrom(source: SourceRow, validated: ReturnType<typeof validateSource>, request: AllocationRequest, sales: readonly ValidContractSale[]) {
  assertClassificationForCost(request.clasificacion, validated.costeCentimos)
  const lines = request.clasificacion === 'PUNTUAL' ? [] : apportionCostLargestRemainder(validated.costeCentimos, sales)
  return {
    fuente: {
      id: source.fuenteId, proveedor: source.proveedor, numFactura: source.numFactura, fecha: isoDate(source.fecha),
      base: source.base, costeCentimos: validated.costeCentimos.toString(), sourceVersion: source.sourceVersion, invoiceSnapshotHash: validated.currentHash,
    },
    clasificacion: request.clasificacion, periodoServicio: request.periodoServicio,
    ventas: sales.map(sale => ({ clienteId: sale.clienteId, clienteNombre: sale.clienteNombre, contratoId: sale.contratoId, contratoTitulo: sale.contratoTitulo, ventaPeriodoCentimos: sale.ventaPeriodoCentimos.toString(), unidadesPeriodoMeses: sale.unidadesPeriodoMeses, ventaNormalizadaDoceavosCentimo: sale.ventaNormalizadaDoceavosCentimo.toString() })),
    lineas: lines.map(line => ({ ...line, ventaNormalizadaDoceavosCentimo: line.ventaNormalizadaDoceavosCentimo.toString(), costeCentimos: line.costeCentimos.toString(), restoNumerador: line.restoNumerador.toString() })),
    pendienteBolsa: request.clasificacion === 'PUNTUAL',
    aviso: request.clasificacion === 'PUNTUAL' ? 'Puntual: se guardará la decisión y la base seguirá fuera del coste compartido; no equivale a coste cero.' : null,
  }
}

export async function listEligibleSources(search = '', page = 1): Promise<{ fuentes: SourceListItem[]; page: number; totalPages: number; total: number }> {
  const term = search.trim().slice(0, 160)
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1
  const where = term ? Prisma.sql`AND (fr.proveedor ILIKE ${`%${term.replace(/[\\%_]/g, '\\$&')}%`} ESCAPE '\\' OR COALESCE(fr.num_factura, '') ILIKE ${`%${term.replace(/[\\%_]/g, '\\$&')}%`} ESCAPE '\\')` : Prisma.empty
  const rows = await prisma.$queryRaw<SourceListRaw[]>(Prisma.sql`
    SELECT f.id, fr.proveedor, fr.num_factura AS "numFactura", fr.fecha, fr.base, f.estado, f.version,
      d.version AS "snapshotHash",
      (SELECT COUNT(*) FROM imputaciones_coste_cliente ic WHERE ic.factura_id = fr.id AND ic.confirmado = true) AS "directAllocations",
      (SELECT COUNT(*) FROM vinculaciones_facturas vf WHERE vf.factura_recibida_id = fr.id) AS "directLinks", fr.imputado_a_ventas AS imputed,
      (SELECT COUNT(*) FROM documentos_coste_operadora sd JOIN imputaciones_coste_cliente ic ON ic.factura_id = sd.factura_id AND ic.confirmado = true WHERE sd.fuente_id = f.id) AS "sourceDirectAllocations",
      (SELECT COUNT(*) FROM documentos_coste_operadora sd JOIN vinculaciones_facturas vf ON vf.factura_recibida_id = sd.factura_id WHERE sd.fuente_id = f.id) AS "sourceDirectLinks",
      EXISTS (SELECT 1 FROM documentos_coste_operadora sd JOIN facturas_recibidas sf ON sf.id = sd.factura_id WHERE sd.fuente_id = f.id AND sf.imputado_a_ventas = true) AS "sourceImputed",
      COUNT(*) OVER() AS "totalRows"
    FROM fuentes_coste_operadora f
    JOIN documentos_coste_operadora d ON d.fuente_id = f.id AND d.rol = 'ORIGINAL'
    JOIN facturas_recibidas fr ON fr.id = d.factura_id
    WHERE f.estado = 'REVISADO' AND ${facturaEconomicaSQL('fr')}
      AND fr.conflicto_identidad = false AND fr.duplicado_externo = false ${where}
    ORDER BY fr.fecha DESC, f.id ASC
    OFFSET ${(safePage - 1) * 25} LIMIT 25
  `)
  const total = rows.length ? count(rows[0].totalRows) : 0
  return {
    fuentes: rows.map(row => {
      const blocked = row.imputed || row.sourceImputed || count(row.directAllocations) > 0 || count(row.directLinks) > 0 || count(row.sourceDirectAllocations) > 0 || count(row.sourceDirectLinks) > 0
      return { id: row.id, proveedor: row.proveedor, numFactura: row.numFactura, fecha: isoDate(row.fecha), base: Number(row.base), estado: row.estado, version: row.version, snapshotHash: row.snapshotHash,
        clasificacionActual: null, bloqueada: blocked, motivoBloqueo: blocked ? 'DIRECT_COST_CONFLICT' : null }
    }),
    page: safePage, total, totalPages: Math.max(1, Math.ceil(total / 25)),
  }
}

export async function listCandidateContracts(fuenteId: string, periodoServicio: string, search = ''): Promise<{ periodoServicio: string; periodoActual: string; contratos: CandidateContract[] }> {
  // A source is re-read so the UI never supplies independent customer/accounting context.
  const source = await loadSource(prisma, fuenteId)
  validateSource(source, { sourceVersion: source.sourceVersion, invoiceSnapshotHash: source.documentVersion })
  const rows = await contractRows(prisma, periodoServicio, undefined, search)
  return { periodoServicio, periodoActual: currentUtcPeriod(), contratos: rows.map(row => contractCandidate(row, periodoServicio)) }
}

export async function previewCustomerCostAllocation(request: AllocationRequest) {
  const source = await loadSource(prisma, request.fuenteId)
  const validated = validateSource(source, request)
  const sales = await validatedSales(prisma, request)
  return previewFrom(source, validated, request, sales)
}

async function currentReceipt(client: DbClient, allocationId: string) {
  const rows = await client.$queryRaw<Array<{ id: string; fuenteId: string; version: number; clasificacion: string; estado: string; costeCentimos: bigint | number | string; periodoServicio: Date; snapshotSeleccion: unknown }>>(Prisma.sql`
    SELECT id, fuente_coste_operadora_id AS "fuenteId", version, clasificacion, estado, coste_centimos AS "costeCentimos", periodo_servicio AS "periodoServicio", snapshot_seleccion AS "snapshotSeleccion"
    FROM repartos_coste_cliente WHERE id = ${allocationId}
  `)
  if (rows.length !== 1) throw new CustomerCostAllocationError('RECEIPT_NOT_FOUND', 'No se pudo leer el recibo de reparto.', 500)
  const row = rows[0]
  const lines = await client.$queryRaw<Array<{ clienteId: number; costeCentimos: bigint | number | string; ventaNormalizadaDoceavosCentimo: bigint | number | string; ordenResto: number; snapshotCliente: unknown }>>(Prisma.sql`
    SELECT cliente_id AS "clienteId", coste_centimos AS "costeCentimos", venta_normalizada_doceavos_centimo AS "ventaNormalizadaDoceavosCentimo", orden_resto AS "ordenResto", snapshot_cliente AS "snapshotCliente"
    FROM repartos_coste_cliente_lineas WHERE reparto_id = ${allocationId} ORDER BY cliente_id ASC
  `)
  return {
    reparto: { id: row.id, fuenteId: row.fuenteId, version: row.version, clasificacion: row.clasificacion, estado: row.estado, costeCentimos: asBigInt(row.costeCentimos, 'Coste').toString(), periodoServicio: isoDate(row.periodoServicio) },
    lineas: lines.map(line => ({ clienteId: line.clienteId, costeCentimos: asBigInt(line.costeCentimos, 'Línea').toString(), ventaNormalizadaDoceavosCentimo: asBigInt(line.ventaNormalizadaDoceavosCentimo, 'Venta').toString(), ordenResto: line.ordenResto, cliente: line.snapshotCliente })),
  }
}

export async function confirmCustomerCostAllocationTx(tx: CustomerCostAllocationTx, actorId: number, request: AllocationRequest) {
  if (request.action !== 'confirm' || !request.idempotencyKey) throw new CustomerCostAllocationError('CONFIRM_REQUIRED', 'La confirmación exige clave de idempotencia.')
  await assertPrototypeStaging()
  await assertCustomerCostAllocationTxStage(tx)
  await requireLiveAllocationWriter(tx, actorId)
  await tx.$queryRaw(Prisma.sql`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${request.fuenteId}))`)
  // Lock the physical source rows first so source edits and a replay for the
  // same source serialize. A replay is a historic receipt, not a request to
  // make the changed source valid again, therefore it is checked before fresh
  // source/version validation.
  await lockReplaySource(tx, request.fuenteId)
  const payloadHash = allocationPayloadHash(request)
  const replay = await tx.$queryRaw<Array<{ id: string; payloadHash: string }>>(Prisma.sql`
    SELECT id, payload_hash AS "payloadHash" FROM repartos_coste_cliente WHERE idempotency_key = ${request.idempotencyKey} FOR UPDATE
  `)
  if (replay.length) {
    if (replay[0].payloadHash !== payloadHash) throw new CustomerCostAllocationError('IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave de idempotencia ya se usó con una decisión distinta.', 409)
    return { idempotente: true, ...(await currentReceipt(tx, replay[0].id)) }
  }
  const source = await loadSource(tx, request.fuenteId, true)
  const validated = validateSource(source, request)
  const sales = await validatedSales(tx, request)
  const preview = previewFrom(source, validated, request, sales)
  const current = await tx.$queryRaw<AllocationRow[]>(Prisma.sql`
    SELECT id, payload_hash AS "payloadHash", clasificacion, estado, coste_centimos AS "costeCentimos", version, snapshot_seleccion AS "snapshotSeleccion", periodo_servicio AS "periodoServicio"
    FROM repartos_coste_cliente WHERE fuente_coste_operadora_id = ${request.fuenteId} AND estado = 'VIGENTE' FOR UPDATE
  `)
  const all = await tx.$queryRaw<Array<{ maxVersion: number | null }>>(Prisma.sql`
    SELECT MAX(version)::int AS "maxVersion" FROM repartos_coste_cliente WHERE fuente_coste_operadora_id = ${request.fuenteId}
  `)
  const allocationId = randomUUID()
  const version = Number(all[0]?.maxVersion || 0) + 1
  const sourceSnapshot = { schema: 'CUSTOMER_COST_SOURCE_SNAPSHOT_V1', fuenteId: source.fuenteId, fuenteVersion: source.sourceVersion, sourceSnapshotHash: source.fuenteVersion, invoiceSnapshotHash: validated.currentHash, facturaId: source.facturaId, proveedor: source.proveedor, numFactura: source.numFactura, fecha: isoDate(source.fecha), baseCentimos: validated.costeCentimos.toString(), snapshot: validated.snapshot }
  const selectionSnapshot = { schema: 'CUSTOMER_COST_SELECTION_V1', periodoServicio: request.periodoServicio, clasificacion: request.clasificacion, reversionDeRepartoId: request.reversionDeRepartoId || null, ventas: preview.ventas, lineas: preview.lineas, pendienteBolsa: preview.pendienteBolsa }
  if (current.length) await tx.$executeRaw(Prisma.sql`UPDATE repartos_coste_cliente SET estado = 'RENUNCIADO' WHERE id = ${current[0].id} AND estado = 'VIGENTE'`)
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO repartos_coste_cliente (id, fuente_coste_operadora_id, factura_recibida_id, version, estado, clasificacion, periodo_servicio, coste_centimos, source_version, source_snapshot_hash, snapshot_fuente, snapshot_seleccion, reversion_de_reparto_id, idempotency_key, payload_hash, creado_por)
    VALUES (${allocationId}, ${source.fuenteId}, ${source.facturaId}, ${version}, 'VIGENTE', ${request.clasificacion}, ${new Date(`${request.periodoServicio}-01T00:00:00.000Z`)}, ${validated.costeCentimos}, ${source.sourceVersion}, ${validated.currentHash}, ${stringifyJson(sourceSnapshot)}::jsonb, ${stringifyJson(selectionSnapshot)}::jsonb, ${request.reversionDeRepartoId || null}, ${request.idempotencyKey}, ${payloadHash}, ${actorId})
  `)
  if (sales.length) {
    for (const sale of sales) await tx.$executeRaw(Prisma.sql`
      INSERT INTO repartos_coste_cliente_contratos (id, reparto_id, cliente_id, contrato_id, venta_periodo_centimos, unidades_periodo_meses, venta_normalizada_doceavos_centimo, snapshot_contrato)
      VALUES (${randomUUID()}, ${allocationId}, ${sale.clienteId}, ${sale.contratoId}, ${sale.ventaPeriodoCentimos}, ${sale.unidadesPeriodoMeses}, ${sale.ventaNormalizadaDoceavosCentimo}, ${stringifyJson(sale.snapshot)}::jsonb)
    `)
  }
  for (const line of preview.lineas) await tx.$executeRaw(Prisma.sql`
    INSERT INTO repartos_coste_cliente_lineas (id, reparto_id, cliente_id, venta_normalizada_doceavos_centimo, resto_numerador, orden_resto, coste_centimos, snapshot_cliente)
    VALUES (${randomUUID()}, ${allocationId}, ${line.clienteId}, ${BigInt(line.ventaNormalizadaDoceavosCentimo)}, ${BigInt(line.restoNumerador)}, ${line.ordenResto}, ${BigInt(line.costeCentimos)}, ${stringifyJson({ id: line.clienteId, nombre: line.clienteNombre })}::jsonb)
  `)
  const action = request.clasificacion === 'PUNTUAL' ? 'REGISTRAR_PUNTUAL' : request.clasificacion === 'ABONO_EXPLICITO' ? 'REGISTRAR_ABONO' : current.length ? 'SUSTITUIR_DECISION' : 'CREAR_DECISION'
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO auditorias_reparto_coste_cliente (id, reparto_id, usuario_id, accion, idempotency_key, antes, despues)
    VALUES (${randomUUID()}, ${allocationId}, ${actorId}, ${action}, ${request.idempotencyKey}, ${current.length ? stringifyJson(current[0]) : null}::jsonb, ${stringifyJson({ source: sourceSnapshot, selection: selectionSnapshot, payloadHash })}::jsonb)
  `)
  return { idempotente: false, ...(await currentReceipt(tx, allocationId)) }
}

export async function confirmCustomerCostAllocation(actorId: number, request: AllocationRequest) {
  if (request.action !== 'confirm' || !request.idempotencyKey) throw new CustomerCostAllocationError('CONFIRM_REQUIRED', 'La confirmación exige clave de idempotencia.')
  try {
    await assertPrototypeStaging()
    return await prisma.$transaction(async tx => confirmCustomerCostAllocationTx(tx, actorId, request), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 })
  } catch (error) {
    if (error instanceof CustomerCostAllocationError) throw error
    if (isUndefinedTable(error)) throw new CustomerCostAllocationError('MIGRATION_PENDING', 'La migración de reparto aún no está aplicada en staging; no se guardó ninguna decisión.', 503)
    const prismaCode = (error as { code?: string } | null)?.code
    if (prismaCode === 'P2002' || prismaCode === 'P2034') throw new CustomerCostAllocationError('CONCURRENT_CONFLICT', 'Conflicto concurrente; recarga y vuelve a confirmar.', 409)
    throw error
  }
}

export async function allocationHistory(fuenteId: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; version: number; estado: string; clasificacion: string; periodoServicio: Date; costeCentimos: bigint | number | string; createdAt: Date; creadoPor: string }>>(Prisma.sql`
      SELECT r.id, r.version, r.estado, r.clasificacion, r.periodo_servicio AS "periodoServicio", r.coste_centimos AS "costeCentimos", r.created_at AS "createdAt", u.nombre AS "creadoPor"
      FROM repartos_coste_cliente r JOIN usuarios_admin u ON u.id = r.creado_por
      WHERE r.fuente_coste_operadora_id = ${fuenteId}
      ORDER BY r.version DESC
    `)
    const ids = rows.map(row => row.id)
    const contracts = ids.length ? await prisma.$queryRaw<Array<{ repartoId: string; clienteId: number; contratoId: number; clienteNombre: string | null; contratoTitulo: string | null }>>(Prisma.sql`
      SELECT rc.reparto_id AS "repartoId", rc.cliente_id AS "clienteId", rc.contrato_id AS "contratoId",
        rc.snapshot_contrato->>'clienteNombre' AS "clienteNombre", rc.snapshot_contrato->>'titulo' AS "contratoTitulo"
      FROM repartos_coste_cliente_contratos rc WHERE rc.reparto_id IN (${Prisma.join(ids)})
      ORDER BY rc.reparto_id ASC, rc.cliente_id ASC, rc.contrato_id ASC
    `) : []
    const contractsByAllocation = new Map<string, Array<{ clienteId: number; contratoId: number; clienteNombre: string | null; contratoTitulo: string | null }>>()
    for (const contract of contracts) contractsByAllocation.set(contract.repartoId, [...(contractsByAllocation.get(contract.repartoId) || []), contract])
    return rows.map(row => ({ ...row, periodoServicio: isoDate(row.periodoServicio), createdAt: row.createdAt.toISOString(), costeCentimos: asBigInt(row.costeCentimos, 'Coste').toString(), contratos: contractsByAllocation.get(row.id) || [] }))
  } catch (error) {
    if (isUndefinedTable(error)) return []
    throw error
  }
}
