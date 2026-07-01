import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/finanzas/facturas/[id]/movimientos-candidatos
 * Busca movimientos bancarios que podrían corresponder a esta factura
 * (por importe, proveedor en concepto, fecha cercana)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const factura = await prisma.facturaRecibida.findUnique({
      where: { id },
      select: { id: true, proveedor: true, total: true, fecha: true, numFactura: true },
    });

    if (!factura) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    }

    // Buscar movimientos no conciliados (gastos = importe negativo)
    const movimientos = await prisma.movimientoBancario.findMany({
      where: {
        conciliado: false,
        importe: { lt: 0 }, // Solo gastos
      },
      select: {
        id: true,
        fechaOperacion: true,
        concepto: true,
        importe: true,
        cuenta: { select: { banco: true } },
      },
      orderBy: { fechaOperacion: 'desc' },
      take: 500,
    });

    // Calcular score de coincidencia para cada movimiento
    const candidatos = movimientos.map(mov => {
      let score = 0;
      const reasons: string[] = [];
      const importeAbs = Math.abs(mov.importe);

      // Match por importe exacto (±0.05)
      const diffImporte = Math.abs(factura.total - importeAbs);
      if (diffImporte <= 0.05) {
        score += 50;
        reasons.push('Importe exacto');
      } else if (diffImporte <= 1) {
        score += 30;
        reasons.push(`Importe ≈ (diff: ${diffImporte.toFixed(2)}€)`);
      } else if (diffImporte / Math.max(factura.total, 1) < 0.05) {
        score += 15;
        reasons.push('Importe similar');
      }

      // Match por proveedor en concepto del movimiento
      if (factura.proveedor) {
        const conceptoNorm = mov.concepto.toLowerCase().replace(/[^a-z0-9]/g, '');
        const palabrasProveedor = factura.proveedor.toLowerCase().split(/\s+/).filter(p => p.length > 3);
        const matchedWords = palabrasProveedor.filter(p => conceptoNorm.includes(p.replace(/[^a-z0-9]/g, '')));
        if (matchedWords.length > 0) {
          score += 30 * (matchedWords.length / Math.max(palabrasProveedor.length, 1));
          reasons.push(`Proveedor: ${matchedWords.join(', ')}`);
        }
      }

      // Match por fecha cercana
      if (factura.fecha) {
        const diffDias = Math.abs(
          (new Date(mov.fechaOperacion).getTime() - new Date(factura.fecha).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDias <= 5) {
          score += 15;
          reasons.push('Fecha muy cercana');
        } else if (diffDias <= 30) {
          score += 10;
          reasons.push('Fecha cercana');
        } else if (diffDias <= 60) {
          score += 5;
          reasons.push('Fecha en rango');
        }
      }

      // Match por nº factura en concepto
      if (factura.numFactura) {
        const numNorm = factura.numFactura.replace(/[^a-z0-9]/gi, '').toLowerCase();
        const conceptoNorm = mov.concepto.replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (numNorm.length > 4 && conceptoNorm.includes(numNorm)) {
          score += 40;
          reasons.push('Nº factura en concepto');
        }
      }

      return {
        id: mov.id,
        fechaOperacion: mov.fechaOperacion,
        concepto: mov.concepto,
        importe: mov.importe,
        banco: mov.cuenta?.banco || '',
        score,
        reasons,
      };
    })
    .filter(m => m.score > 0) // Solo los que tienen alguna coincidencia
    .sort((a, b) => b.score - a.score)
    .slice(0, 20); // Top 20

    return NextResponse.json({
      factura: {
        id: factura.id,
        proveedor: factura.proveedor,
        total: factura.total,
        fecha: factura.fecha,
      },
      candidatos,
      totalSinConciliar: movimientos.length,
    });
  } catch (error: any) {
    console.error('Error buscando movimientos candidatos:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
