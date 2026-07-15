import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET: Obtiene las líneas de un confirming específico
 * Query params: confirmingId (required)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const confirmingId = searchParams.get('confirmingId');

    if (!confirmingId) {
      return NextResponse.json({ error: 'confirmingId es requerido' }, { status: 400 });
    }

    const lineas = await prisma.confirmingLinea.findMany({
      where: { confirmingId },
      orderBy: { createdAt: 'asc' },
      include: {
        facturaEmitida: {
          select: { id: true, numFactura: true, cliente: true, total: true, fecha: true },
        },
      },
    });

    // También obtener el totalConfirming del documento
    const confirming = await prisma.facturaRecibida.findUnique({
      where: { id: confirmingId },
      select: { id: true, total: true, totalConfirming: true, proveedor: true },
    });

    return NextResponse.json({ lineas, confirming });
  } catch (error: any) {
    console.error('Error en GET confirming-lineas:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST: Añadir una línea a un confirming o actualizar total confirming
 * Body: { confirmingId, numFactura, importe, facturaEmitidaId?, notas? }
 *   OR: { confirmingId, totalConfirming } para actualizar el total
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { confirmingId, totalConfirming, numFactura, importe, facturaEmitidaId, notas } = body;

    if (!confirmingId) {
      return NextResponse.json({ error: 'confirmingId es requerido' }, { status: 400 });
    }

    // Si viene totalConfirming, actualizar el total del documento
    if (totalConfirming !== undefined) {
      await prisma.facturaRecibida.update({
        where: { id: confirmingId },
        data: { totalConfirming: parseFloat(totalConfirming) || 0 },
      });
      return NextResponse.json({ ok: true, action: 'totalUpdated' });
    }

    // Si no, crear una nueva línea
    if (!numFactura) {
      return NextResponse.json({ error: 'numFactura es requerido' }, { status: 400 });
    }

    // Intentar vincular automáticamente con factura emitida si no se proporciona
    let linkedFacturaId = facturaEmitidaId || null;
    if (!linkedFacturaId && numFactura) {
      const match = await prisma.facturaEmitida.findFirst({
        where: { numFactura: { equals: numFactura, mode: 'insensitive' } },
        select: { id: true },
      });
      if (match) linkedFacturaId = match.id;
    }

    const linea = await prisma.confirmingLinea.create({
      data: {
        confirmingId,
        numFactura,
        importe: parseFloat(importe) || 0,
        facturaEmitidaId: linkedFacturaId,
        notas: notas || null,
      },
      include: {
        facturaEmitida: {
          select: { id: true, numFactura: true, cliente: true, total: true, fecha: true },
        },
      },
    });

    return NextResponse.json({ ok: true, linea });
  } catch (error: any) {
    console.error('Error en POST confirming-lineas:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT: Actualizar una línea existente
 * Body: { id, numFactura?, importe?, facturaEmitidaId?, notas? }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, numFactura, importe, facturaEmitidaId, notas } = body;

    if (!id) {
      return NextResponse.json({ error: 'id es requerido' }, { status: 400 });
    }

    const data: any = { updatedAt: new Date() };
    if (numFactura !== undefined) data.numFactura = numFactura;
    if (importe !== undefined) data.importe = parseFloat(importe) || 0;
    if (facturaEmitidaId !== undefined) data.facturaEmitidaId = facturaEmitidaId || null;
    if (notas !== undefined) data.notas = notas || null;

    const linea = await prisma.confirmingLinea.update({
      where: { id },
      data,
      include: {
        facturaEmitida: {
          select: { id: true, numFactura: true, cliente: true, total: true, fecha: true },
        },
      },
    });

    return NextResponse.json({ ok: true, linea });
  } catch (error: any) {
    console.error('Error en PUT confirming-lineas:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE: Eliminar una línea
 * Body: { id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'id es requerido' }, { status: 400 });
    }

    await prisma.confirmingLinea.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error en DELETE confirming-lineas:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
