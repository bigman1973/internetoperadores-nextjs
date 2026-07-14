import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/finanzas/conciliacion/sugerencias?movimientoId=xxx&buscar=xxx
 * Devuelve TODAS las facturas pendientes de conciliación, ordenadas por score de coincidencia
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const movimientoId = searchParams.get('movimientoId');
    const buscar = searchParams.get('buscar') || '';

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
      // Buscar facturas recibidas pendientes de conciliación
      const whereClause: any = {
        total: { gt: 0 },
        movimientos: { none: {} },
      };

      // Filtro de búsqueda
      if (buscar) {
        whereClause.OR = [
          { proveedor: { contains: buscar, mode: 'insensitive' } },
          { numFactura: { contains: buscar, mode: 'insensitive' } },
          { cif: { contains: buscar, mode: 'insensitive' } },
          { concepto: { contains: buscar, mode: 'insensitive' } },
        ];
      }

      const candidatas = await prisma.facturaRecibida.findMany({
        where: whereClause,
        select: {
          id: true,
          proveedor: true,
          numFactura: true,
          fecha: true,
          total: true,
          base: true,
          archivoUrl: true,
          archivoOneDrive: true,
        },
        orderBy: { fecha: 'desc' },
        take: 500,
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
          reasons.push(`Importe similar`);
        }

        // Match por proveedor en concepto
        if (factura.proveedor) {
          const conceptoNorm = movimiento.concepto.toLowerCase().replace(/[^a-z0-9]/g, '');
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
      .sort((a, b) => b.score - a.score);

      // Devolver las top 10 con score > 0 como "sugeridas" y el resto como "todas"
      const sugeridas = sugerencias.filter(s => s.score > 0).slice(0, 10);
      const todas = sugerencias.slice(0, 50); // Limitar a 50 para no sobrecargar

      return NextResponse.json({
        movimiento: {
          id: movimiento.id,
          concepto: movimiento.concepto,
          importe: movimiento.importe,
          fecha: movimiento.fechaOperacion,
        },
        tipo: 'factura_recibida',
        sugerencias: sugeridas,
        todas,
        totalPendientes: candidatas.length,
      });
    } else {
      // Buscar facturas emitidas candidatas para ingresos
      const whereClause: any = {
        estado: { in: ['EMITIDA', 'ENVIADA'] },
        total: { gt: 0 },
      };

      if (buscar) {
        whereClause.OR = [
          { cliente: { contains: buscar, mode: 'insensitive' } },
          { numFactura: { contains: buscar, mode: 'insensitive' } },
        ];
      }

      const candidatas = await prisma.facturaEmitida.findMany({
        where: whereClause,
        select: {
          id: true,
          numFactura: true,
          cliente: true,
          fecha: true,
          total: true,
          estado: true,
        },
        orderBy: { fecha: 'desc' },
        take: 500,
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
      .sort((a, b) => b.score - a.score);

      const sugeridas = sugerencias.filter(s => s.score > 0).slice(0, 10);
      const todas = sugerencias.slice(0, 50);

      return NextResponse.json({
        movimiento: {
          id: movimiento.id,
          concepto: movimiento.concepto,
          importe: movimiento.importe,
          fecha: movimiento.fechaOperacion,
        },
        tipo: 'factura_emitida',
        sugerencias: sugeridas,
        todas,
        totalPendientes: candidatas.length,
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
