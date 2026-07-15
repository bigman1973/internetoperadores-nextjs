import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/finanzas/conciliacion/manual
 * Devuelve facturas recibidas sin conciliar con filtros para la vista de conciliación manual.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '25');
    const buscar = searchParams.get('buscar') || '';
    const importeExacto = searchParams.get('importeExacto') || '';
    const desde = searchParams.get('desde') || '';
    const hasta = searchParams.get('hasta') || '';
    const sortBy = searchParams.get('sortBy') || 'fecha';
    const sortDir = searchParams.get('sortDir') || 'desc';
    const sinConciliar = searchParams.get('sinConciliar') === 'true';

    const offset = (page - 1) * limit;

    // Construir condiciones
    let conditions = `WHERE fr.total > 0 AND (fr.carpeta_origen NOT LIKE '%Confirming%' OR fr.carpeta_origen IS NULL)`;
    const params: any[] = [];
    let paramIdx = 1;

    if (sinConciliar) {
      conditions += ` AND fr.id NOT IN (SELECT factura_id FROM movimientos_bancarios WHERE factura_id IS NOT NULL)`;
    }

    if (buscar) {
      conditions += ` AND (fr.proveedor ILIKE $${paramIdx} OR fr.num_factura ILIKE $${paramIdx})`;
      params.push(`%${buscar}%`);
      paramIdx++;
    }

    if (importeExacto) {
      const importe = parseFloat(importeExacto);
      if (!isNaN(importe)) {
        conditions += ` AND ABS(fr.total - $${paramIdx}) < 0.02`;
        params.push(importe);
        paramIdx++;
      }
    }

    if (desde) {
      conditions += ` AND fr.fecha >= $${paramIdx}::date`;
      params.push(desde);
      paramIdx++;
    }

    if (hasta) {
      conditions += ` AND fr.fecha <= $${paramIdx}::date`;
      params.push(hasta);
      paramIdx++;
    }

    // Ordenación
    let orderBy = 'fr.fecha DESC';
    if (sortBy === 'fecha') orderBy = `fr.fecha ${sortDir.toUpperCase()}`;
    else if (sortBy === 'total') orderBy = `fr.total ${sortDir.toUpperCase()}`;
    else if (sortBy === 'fechaVencimiento') orderBy = `fr.fecha_vencimiento ${sortDir.toUpperCase()} NULLS LAST`;

    // Count
    const countResult: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as total FROM facturas_recibidas fr ${conditions}`,
      ...params
    );
    const total = countResult[0]?.total || 0;

    // Facturas
    const facturas: any[] = await prisma.$queryRawUnsafe(
      `SELECT fr.id, fr.num_factura, fr.proveedor, fr.total, fr.fecha, fr.fecha_vencimiento, fr.cif
       FROM facturas_recibidas fr
       ${conditions}
       ORDER BY ${orderBy}
       LIMIT ${limit} OFFSET ${offset}`,
      ...params
    );

    return NextResponse.json({
      facturas: facturas.map(f => ({
        id: f.id,
        numFactura: f.num_factura || '',
        proveedor: f.proveedor || '',
        total: Number(f.total),
        fecha: f.fecha?.toISOString() || '',
        fechaVencimiento: f.fecha_vencimiento?.toISOString() || null,
        cif: f.cif || '',
        conciliada: false,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('Error conciliación manual:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
