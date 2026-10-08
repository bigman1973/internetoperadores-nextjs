import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { checkAdminAreaRead } from '@/lib/api-admin-area-read';
import { costCTE, parseCostFilters, SIN_CATEGORIA, totalColumns } from '@/lib/finanzas/cost-analytics';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const denied = await checkAdminAreaRead('admin.finanzas.analitica_costes', ['CONTABILIDAD']);
    if (denied) return denied;
    let filters;
    try { filters = parseCostFilters(req.nextUrl.searchParams); }
    catch { return NextResponse.json({ error: 'Revisa el período, los filtros y la paginación' }, { status: 400 }); }
    // Todas las sumas proceden de una factura origen, nunca de sus pagos o vínculos a ventas.
    // Snapshot coherente incluso si otra sesión clasifica una factura durante la lectura.
    const result = await prisma.$transaction(async tx => {
      const root = costCTE({ ...filters, proveedorKey: '' });
      const path = costCTE(filters);
      const [kpis] = await tx.$queryRaw<any[]>(Prisma.sql`${root} SELECT ${totalColumns} FROM filtrados`);
      const categorias = await tx.categoriaImputacion.findMany({ select: { nombre: true }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }], take: 1000 });
      const usadas = await tx.facturaRecibida.findMany({ select: { imputacion: true }, distinct: ['imputacion'], take: 1000 });
      const textoBusqueda = '%' + filters.buscar.replace(/[\\%_]/g, '\\$&') + '%';
      const comentarioCoincidente = filters.buscar ? Prisma.sql`(SELECT SUBSTRING(c.texto FROM GREATEST(1, STRPOS(LOWER(c.texto), LOWER(${filters.buscar})) - 60) FOR 240) FROM comentarios_facturas_recibidas c
        WHERE c.factura_id = f.id AND c.texto ILIKE ${textoBusqueda} ORDER BY c.created_at DESC, c.id DESC LIMIT 1)` : Prisma.sql`NULL`;
      let nodos: any[] = [], facturas: any[] = [], total = 0;
      if (filters.nivel === 'facturas') {
        const [count] = await tx.$queryRaw<{ total: number }[]>(Prisma.sql`${path} SELECT COUNT(*)::int AS total FROM filtrados`);
        total = count.total;
        facturas = await tx.$queryRaw<any[]>(Prisma.sql`${path}
          SELECT f.id, f.proveedor, f.cif, f.num_factura AS "numFactura", f.fecha, f.base::float8 AS base,
            f.concepto, NULLIF(f.categoria_key, ${SIN_CATEGORIA}) AS imputacion,
            f.asignado::float8 AS asignado, f.sin_asignar::float8 AS "sinAsignar", f.incidencia,
            (SELECT COUNT(*)::int FROM comentarios_facturas_recibidas c WHERE c.factura_id = f.id) AS "numComentarios",
            COALESCE(${comentarioCoincidente}, (SELECT LEFT(c.texto, 240) FROM comentarios_facturas_recibidas c WHERE c.factura_id = f.id
              ORDER BY c.created_at DESC, c.id DESC LIMIT 1)) AS "ultimoComentario"
          FROM filtrados f ORDER BY f.fecha DESC, f.id DESC
          LIMIT ${filters.limit} OFFSET ${(filters.page - 1) * filters.limit}`);
      } else if (filters.nivel === 'proveedores') {
        nodos = await tx.$queryRaw<any[]>(Prisma.sql`${path}
          SELECT proveedor_key AS key, MIN(proveedor) AS label, ${totalColumns}
          FROM filtrados GROUP BY proveedor_key ORDER BY SUM(base) DESC, proveedor_key ASC`);
        total = nodos.length;
      } else {
        nodos = await tx.$queryRaw<any[]>(Prisma.sql`${path}
          SELECT categoria_key AS key, CASE WHEN categoria_key = ${SIN_CATEGORIA} THEN 'Sin clasificar' ELSE categoria_key END AS label,
            ${totalColumns}
          FROM filtrados GROUP BY categoria_key ORDER BY (categoria_key = ${SIN_CATEGORIA}) DESC, SUM(base) DESC, categoria_key ASC`);
        total = nodos.length;
      }
      return { kpis, nodos, facturas, total, categorias: Array.from(new Set([SIN_CATEGORIA, ...categorias.map(c => c.nombre), ...usadas.map(c => c.imputacion?.trim()).filter((c): c is string => Boolean(c))])) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
    return NextResponse.json({ ...result, page: filters.page, totalPages: filters.nivel === 'facturas' ? Math.max(1, Math.ceil(result.total / filters.limit)) : 1,
      periodo: { desde: filters.desde || null, hasta: filters.hasta || null }, baseTemporal: 'fecha_factura' }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[costes] No se pudo consultar la analítica', error instanceof Error ? error.name : 'Error');
    return NextResponse.json({ error: 'No se pudo cargar la analítica de costes. Puedes reintentar sin modificar datos.' }, { status: 500 });
  }
}
