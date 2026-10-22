import { Prisma } from '@prisma/client'
import { facturaEconomicaSQL, facturaEconomicaWhere } from '@/lib/finanzas/invoice-economic-filter'
import { calculateFiscalEstimate, type EmittedInvoiceForEstimate, type FiscalPeriod, type ReceivedInvoiceForEstimate } from './fiscal-estimate-core'

/** Sólo lectura documental: sin banco, cuentas, movimientos ni campos de cobro. */
export interface FiscalEstimateReadDb { $queryRaw<T>(query: Prisma.Sql): Promise<T> }
type ReceivedRow = { id: string; fechaISO: string | null; baseText: string | null; ivaText: string | null; irpfText: string | null; totalText: string | null; deducibleIva: boolean | null; estado: string | null }
type EmittedRow = { id: string; fechaISO: string | null; baseText: string | null; ivaText: string | null; irpfText: string | null; totalText: string | null; facturaISPId: number | null; estado: string | null }
export const FISCAL_READ_MAX_ROWS = 20_000
const SENTINEL_LIMIT = FISCAL_READ_MAX_ROWS + 1

/** Contrato Prisma para cualquier consumidor que no use SQL; C9 ya incorpora naturaleza e historial B1. */
export function fiscalReceivedWhere(period: FiscalPeriod): Prisma.FacturaRecibidaWhereInput {
  const from = new Date(`${period.desde}T00:00:00.000Z`); const toExclusive = new Date(`${period.hasta}T00:00:00.000Z`); toExclusive.setUTCDate(toExclusive.getUTCDate() + 1)
  return { AND: [facturaEconomicaWhere, { fecha: { gte: from, lt: toExclusive } }] }
}
function bounded<T>(rows: T[], label: string): T[] { if (rows.length > FISCAL_READ_MAX_ROWS) throw new Error(`${label} supera el límite seguro de ${FISCAL_READ_MAX_ROWS} filas del período; la estimación falla cerrada.`); return rows }

/**
 * total/base/importe_iva/importe_irpf se reciben exclusivamente con ::text:
 * Prisma no construye Decimal/number y el núcleo sólo acepta céntimos exactos.
 */
export async function readFiscalEstimate(db: FiscalEstimateReadDb, period: FiscalPeriod) {
  const from = new Date(`${period.desde}T00:00:00.000Z`); const toExclusive = new Date(`${period.hasta}T00:00:00.000Z`); toExclusive.setUTCDate(toExclusive.getUTCDate() + 1)
  const receivedSql = Prisma.sql`
    SELECT fr.id, fr.fecha::date::text AS "fechaISO", fr.base::text AS "baseText", fr.importe_iva::text AS "ivaText", fr.importe_irpf::text AS "irpfText", fr.total::text AS "totalText", fr.deducible_iva AS "deducibleIva", fr.estado::text AS estado
    FROM facturas_recibidas fr
    WHERE ${facturaEconomicaSQL('fr')} AND fr.fecha >= ${from} AND fr.fecha < ${toExclusive}
    ORDER BY fr.fecha ASC, fr.id ASC LIMIT ${SENTINEL_LIMIT}`
  const emittedSql = Prisma.sql`
    SELECT fe.id, fe.fecha::date::text AS "fechaISO", fe.base::text AS "baseText", fe.importe_iva::text AS "ivaText", fe.importe_irpf::text AS "irpfText", fe.total::text AS "totalText", fe.factura_isp_id AS "facturaISPId", fe.estado::text AS estado
    FROM facturas_emitidas fe
    WHERE fe.fecha >= ${from} AND fe.fecha < ${toExclusive}
    ORDER BY fe.fecha ASC, fe.id ASC LIMIT ${SENTINEL_LIMIT}`
  const [receivedRows, emittedRows] = await Promise.all([db.$queryRaw<ReceivedRow[]>(receivedSql), db.$queryRaw<EmittedRow[]>(emittedSql)])
  const received: ReceivedInvoiceForEstimate[] = bounded(receivedRows, 'Facturas recibidas').map(row => ({ id: row.id, fechaISO: row.fechaISO, baseText: row.baseText, ivaText: row.ivaText, irpfText: row.irpfText, totalText: row.totalText, b2Economic: true, deducibleIva: row.deducibleIva === true, rejected: row.estado === 'RECHAZADA', confirmingDraxtonCommunication: false }))
  // Población canónica B7: todas las FacturaEmitida del período. estado se conserva
  // sólo para transparencia; ni estado ni cobro/fechaCobro/autocobro deciden inclusión.
  const emitted: EmittedInvoiceForEstimate[] = bounded(emittedRows, 'Facturas emitidas').map(row => ({ id: row.id, fechaISO: row.fechaISO, baseText: row.baseText, ivaText: row.ivaText, irpfText: row.irpfText, totalText: row.totalText, facturaISPId: row.facturaISPId, estado: row.estado }))
  return calculateFiscalEstimate(period, received, emitted)
}
