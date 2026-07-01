import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/finanzas/conciliacion/sugerencias?movimientoId=xxx
 * Devuelve facturas candidatas para conciliar con un movimiento bancario
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const movimientoId = searchParams.get('movimientoId');

    if (!movimientoId) {
      return NextResponse.json({ error: 'movimientoId requerido' }, { status: 400 });
    }

    const movimiento = await prisma.movimientoBancario.findUnique({
      where: { id: movimientoId },
    });

    if (!movimiento) {
      return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 });
    }

    const importeAbs = Math.abs(movimiento.importe);
    const esGasto = movimiento.importe < 0;

    if (esGasto) {
      // Buscar facturas recibidas candidatas
      const candidatas = await prisma.facturaRecibida.findMany({
        where: {
          total: { gt: 0 },
          movimientos: { none: {} },
        },
        select: {
          id: true,
          proveedor: true,
          numFactura: true,
          fecha: true,
          total: true,
          base: true,
        },
        orderBy: { fecha: 'desc' },
        take: 200,
      });

      // Calcular score de matching para cada factura
      const sugerencias = candidatas.map(factura => {
        let score = 0;
        const reasons: string[] = [];

        // Match por importe exacto (±0.05)
        const diffImporte = Math.abs(factura.total - importeAbs);
        if (diffImporte <= 0.05) {
          score += 50;
          reasons.push('Importe exacto');
        } else if (diffImporte <= 1) {
          score += 30;
          reasons.push(`Importe ≈ (diff: ${diffImporte.toFixed(2)}€)`);
        } else if (diffImporte / importeAbs < 0.05) {
          score += 15;
          reasons.push(`Importe similar (${((1 - diffImporte / importeAbs) * 100).toFixed(0)}%)`);
        }

        // Match por proveedor en concepto
        if (factura.proveedor) {
          const provNorm = factura.proveedor.toLowerCase().replace(/[^a-z0-9]/g, '');
          const conceptoNorm = movimiento.concepto.toLowerCase().replace(/[^a-z0-9]/g, '');
          // Buscar partes del nombre del proveedor en el concepto
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
            (new Date(movimiento.fechaOperacion).getTime() - new Date(factura.fecha).getTime()) / (1000 * 60 * 60 * 24)
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
          const conceptoNorm = movimiento.concepto.replace(/[^a-z0-9]/gi, '').toLowerCase();
          if (numNorm.length > 4 && conceptoNorm.includes(numNorm)) {
            score += 40;
            reasons.push('Nº factura en concepto');
          }
        }

        return {
          ...factura,
          score,
          reasons,
        };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

      return NextResponse.json({
        movimiento: {
          id: movimiento.id,
          concepto: movimiento.concepto,
          importe: movimiento.importe,
          fecha: movimiento.fechaOperacion,
        },
        tipo: 'factura_recibida',
        sugerencias,
      });
    } else {
      // Buscar facturas emitidas candidatas para ingresos
      const candidatas = await prisma.facturaEmitida.findMany({
        where: {
          estado: { in: ['EMITIDA', 'ENVIADA'] },
          total: { gt: 0 },
        },
        select: {
          id: true,
          numFactura: true,
          cliente: true,
          fecha: true,
          total: true,
          estado: true,
        },
        orderBy: { fecha: 'desc' },
        take: 100,
      });

      const sugerencias = candidatas.map(factura => {
        let score = 0;
        const reasons: string[] = [];

        const diffImporte = Math.abs(factura.total - movimiento.importe);
        if (diffImporte <= 0.05) {
          score += 50;
          reasons.push('Importe exacto');
        } else if (diffImporte <= 1) {
          score += 30;
          reasons.push(`Importe ≈ (diff: ${diffImporte.toFixed(2)}€)`);
        }

        if (factura.cliente) {
          const clienteNorm = factura.cliente.toLowerCase().replace(/[^a-z0-9]/g, '');
          const conceptoNorm = movimiento.concepto.toLowerCase().replace(/[^a-z0-9]/g, '');
          const palabrasCliente = factura.cliente.toLowerCase().split(/\s+/).filter(p => p.length > 3);
          const matchedWords = palabrasCliente.filter(p => conceptoNorm.includes(p.replace(/[^a-z0-9]/g, '')));
          if (matchedWords.length > 0) {
            score += 30;
            reasons.push(`Cliente: ${matchedWords.join(', ')}`);
          }
        }

        return {
          ...factura,
          score,
          reasons,
        };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

      return NextResponse.json({
        movimiento: {
          id: movimiento.id,
          concepto: movimiento.concepto,
          importe: movimiento.importe,
          fecha: movimiento.fechaOperacion,
        },
        tipo: 'factura_emitida',
        sugerencias,
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
