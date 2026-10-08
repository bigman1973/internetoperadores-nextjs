import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkAdminAreaRead } from '@/lib/api-admin-area-read';
import { saleIdentityCTE } from '@/lib/finanzas/sales-profitability';
import { contractValidity, parseRecordedLines, type SaleInvoiceContext } from '@/lib/finanzas/sale-invoice-context';

export const dynamic = 'force-dynamic';
const AREA = 'admin.finanzas.analitica_costes';
const PAGE_SIZE = 25;
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
function day(value: Date | string | null): string | null {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value ? value.slice(0, 10) : null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = Number(session?.user?.id);
    if (session?.user?.userType !== 'admin' || !Number.isInteger(userId) || userId <= 0) return json({ error: 'No autorizado' }, 401);
    const admin = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { activo: true } });
    if (!admin?.activo) return json({ error: 'No autorizado' }, 401);
    const denied = await checkAdminAreaRead(AREA, ['CONTABILIDAD'], session);
    if (denied) { denied.headers.set('Cache-Control', 'private, no-store'); return denied; }
    const params = req.nextUrl.searchParams;
    const facturaId = params.get('facturaId') || '';
    const rawPage = params.get('page') || '1';
    const filter = params.get('contratos') || 'periodo';
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(facturaId) || !/^[1-9]\d{0,4}$/.test(rawPage)
      || !['periodo', 'actuales', 'todos'].includes(filter)) return json({ error: 'Revisa la factura y los filtros.' }, 400);
    const page = Number(rawPage);
    const result = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<any[]>(Prisma.sql`${saleIdentityCTE(facturaId)}
        SELECT s.id, s.num_factura, s.cliente, s.fecha, s.cliente_web_id,
          fe.base, fe.importe_iva, fe.total, fe.lineas,
          cw.cliente_id_isp, cw.isp_gestion_id
        FROM target_sale s JOIN facturas_emitidas fe ON fe.id = s.id
        LEFT JOIN clientes_web cw ON cw.id = s.cliente_web_id LIMIT 1`);
      if (!rows.length) return null;
      const sale = rows[0];
      const date = day(sale.fecha)!;
      const monthStart = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
      const monthEnd = new Date(monthStart); monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
      const matchId = sale.cliente_id_isp || sale.isp_gestion_id;
      let total = 0;
      let contracts: any[] = [];
      if (sale.cliente_web_id !== null && matchId) {
        const condition = Prisma.sql`cliente_id = ${matchId}
          ${filter === 'actuales' ? Prisma.sql`AND activo = true` : Prisma.empty}
          ${filter === 'periodo' ? Prisma.sql`AND (fecha_inicio IS NULL OR fecha_inicio < ${monthEnd})
            AND (fecha_baja IS NULL OR fecha_baja >= ${monthStart})` : Prisma.empty}`;
        const [counts, selected] = await Promise.all([
          tx.$queryRaw<{total:number}[]>(Prisma.sql`SELECT COUNT(*)::int AS total FROM contratos_servicio WHERE ${condition} LIMIT 1`),
          tx.$queryRaw<any[]>(Prisma.sql`SELECT id, titulo, tarifa, precio::float8 AS precio,
            concepto_facturacion AS concepto, fecha_inicio, fecha_baja, activo
            FROM contratos_servicio WHERE ${condition}
            ORDER BY activo DESC, fecha_inicio DESC NULLS LAST, id DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`),
        ]);
        total = counts[0]?.total || 0; contracts = selected;
      }
      return {
        facturaId: sale.id, numFactura: sale.num_factura, cliente: sale.cliente,
        clienteWebId: sale.cliente_web_id, fecha: date, base: Number(sale.base), importeIva: Number(sale.importe_iva), total: Number(sale.total),
        ...parseRecordedLines(sale.lineas, Number(sale.base)),
        contratos: contracts.map(row => ({ id: row.id, titulo: row.titulo, tarifa: row.tarifa, precio: row.precio,
          concepto: row.concepto, fechaInicio: day(row.fecha_inicio), fechaBaja: day(row.fecha_baja), activo: row.activo,
          vigencia: contractValidity(day(row.fecha_inicio), day(row.fecha_baja), row.activo, date) })),
        totalContratos: total, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        filtroContratos: filter,
      } as SaleInvoiceContext;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10_000 });
    return result ? json(result) : json({ error: 'Factura no disponible para rentabilidad.' }, 404);
  } catch (error) {
    console.error('[servicios-venta] Lectura no disponible', error instanceof Error ? error.name : 'Error');
    return json({ error: 'No se pudo consultar el detalle. Puedes reintentar sin modificar datos.' }, 500);
  }
}
