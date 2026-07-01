import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/admin/finanzas/tickets/[id]/conciliar
 * Buscar movimientos bancarios candidatos para conciliar con un ticket/gasto
 * 
 * POST /api/admin/finanzas/tickets/[id]/conciliar
 * Conciliar un ticket con un movimiento bancario específico
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const gasto = await prisma.gasto.findUnique({
      where: { id },
    });
    if (!gasto) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
    }

    const importeAbs = Math.abs(gasto.importe);
    const fechaGasto = new Date(gasto.fecha);
    const fechaDesde = new Date(fechaGasto);
    fechaDesde.setDate(fechaDesde.getDate() - 5);
    const fechaHasta = new Date(fechaGasto);
    fechaHasta.setDate(fechaHasta.getDate() + 5);

    // Buscar movimientos bancarios negativos (gastos) con importe similar y fecha cercana
    const candidatos = await prisma.movimientoBancario.findMany({
      where: {
        conciliado: false,
        importe: { lt: 0 },
        fechaOperacion: { gte: fechaDesde, lte: fechaHasta },
      },
      select: {
        id: true,
        fechaOperacion: true,
        importe: true,
        concepto: true,
        referencia: true,
        cuenta: { select: { banco: true, numeroCuenta: true } },
      },
      orderBy: { fechaOperacion: 'desc' },
      take: 50,
    });

    // Calcular score de coincidencia
    const sugerencias = candidatos.map(mov => {
      const importeMov = Math.abs(mov.importe);
      let score = 0;

      // Match por importe (exacto = 50 puntos, cercano = proporcional)
      const diffImporte = Math.abs(importeMov - importeAbs);
      if (diffImporte < 0.02) score += 50;
      else if (diffImporte < 1) score += 30;
      else if (diffImporte < 5) score += 10;

      // Match por fecha (mismo día = 30 puntos, ±1 día = 20, etc.)
      const diffDias = Math.abs(
        (new Date(mov.fechaOperacion).getTime() - fechaGasto.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDias < 1) score += 30;
      else if (diffDias < 2) score += 20;
      else if (diffDias < 3) score += 10;

      // Match por comercio en concepto
      if (gasto.comercio && mov.concepto.toLowerCase().includes(gasto.comercio.toLowerCase())) {
        score += 20;
      }

      return { ...mov, score };
    })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

    return NextResponse.json({ sugerencias });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { movimientoId } = body;

    if (!movimientoId) {
      return NextResponse.json({ error: 'movimientoId requerido' }, { status: 400 });
    }

    // Conciliar: asociar movimiento al gasto
    await prisma.movimientoBancario.update({
      where: { id: movimientoId },
      data: { gastoId: id, conciliado: true },
    });

    await prisma.gasto.update({
      where: { id },
      data: { conciliado: true },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
