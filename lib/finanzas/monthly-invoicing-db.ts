import { Prisma } from '@prisma/client'
import { calculateMonthlyInvoicing, type LegacyIspInvoice, type LegacyRemittance, type MonthlyInvoicingQuery } from './monthly-invoicing-core'

/** Lector SQL de restauración: no hidrata Decimal de Prisma y no lee campos de cobro ISP. */
export interface MonthlyInvoicingReadDb { $queryRaw<T>(query: Prisma.Sql): Promise<T> }
type InvoiceRow = { id: number; fechaISO: string | null; totalText: string | null; serieFactura: string | null; idCliente: number | null }
type RemittanceRow = { id: number; fechaISO: string | null; totalText: string | null }
const MAX_ROWS = 20_000
const LIMIT_WITH_SENTINEL = MAX_ROWS + 1

function assertBounded<T>(rows: T[], source: string): T[] {
  if (rows.length > MAX_ROWS) throw new Error(`${source} supera el límite seguro de ${MAX_ROWS} filas; acota el período antes de publicar el resumen.`)
  return rows
}
/** Si no hay mes se usa límite centinela fail-closed, nunca una lectura de toda la BD sin cota. */
export async function readMonthlyInvoicing(db: MonthlyInvoicingReadDb, query: MonthlyInvoicingQuery) {
  const monthStart = query.mes ? new Date(`${query.mes}-01T00:00:00.000Z`) : null
  const nextMonth = query.mes ? new Date(Date.UTC(monthStart!.getUTCFullYear(), monthStart!.getUTCMonth() + 1, 1)) : null
  const limit = query.mes ? LIMIT_WITH_SENTINEL : LIMIT_WITH_SENTINEL
  const invoiceSql = query.mes
    ? Prisma.sql`SELECT f.id, f.fecha::date::text AS "fechaISO", f.total::text AS "totalText", f.serie_factura AS "serieFactura", f.id_cliente AS "idCliente" FROM facturas f WHERE f.fecha >= ${monthStart} AND f.fecha < ${nextMonth} ORDER BY f.fecha DESC, f.id DESC LIMIT ${limit}`
    : Prisma.sql`SELECT f.id, f.fecha::date::text AS "fechaISO", f.total::text AS "totalText", f.serie_factura AS "serieFactura", f.id_cliente AS "idCliente" FROM facturas f ORDER BY f.fecha DESC, f.id DESC LIMIT ${limit}`
  const remittanceSql = query.mes
    ? Prisma.sql`SELECT r.id, r.fecha::date::text AS "fechaISO", r.total_importe::text AS "totalText" FROM remesas r WHERE r.fecha >= ${monthStart} AND r.fecha < ${nextMonth} ORDER BY r.fecha DESC, r.id DESC LIMIT ${limit}`
    : Prisma.sql`SELECT r.id, r.fecha::date::text AS "fechaISO", r.total_importe::text AS "totalText" FROM remesas r ORDER BY r.fecha DESC, r.id DESC LIMIT ${limit}`
  const [invoices, remittances] = await Promise.all([db.$queryRaw<InvoiceRow[]>(invoiceSql), db.$queryRaw<RemittanceRow[]>(remittanceSql)])
  return calculateMonthlyInvoicing(assertBounded(invoices, 'Facturas ISP') as LegacyIspInvoice[], assertBounded(remittances, 'Remesas ISP') as LegacyRemittance[], query)
}
