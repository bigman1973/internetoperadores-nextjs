import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/finanzas/facturas/proveedores
 * Devuelve la lista de proveedores únicos con su conteo de facturas
 */
export async function GET(req: NextRequest) {
  try {
    const proveedores = await prisma.facturaRecibida.groupBy({
      by: ['proveedor'],
      _count: { id: true },
      _sum: { total: true },
      where: {
        proveedor: { not: '' },
      },
      orderBy: { _count: { id: 'desc' } },
    });

    return NextResponse.json({
      proveedores: proveedores.map(p => ({
        nombre: p.proveedor,
        facturas: p._count.id,
        total: p._sum.total || 0,
      })),
      total: proveedores.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
