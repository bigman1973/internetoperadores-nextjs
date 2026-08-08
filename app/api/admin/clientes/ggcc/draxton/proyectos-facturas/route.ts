import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';

// GET: Obtener facturas vinculadas a un proyecto singular + facturas disponibles para vincular
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const proyectoId = searchParams.get('proyectoId');
    const busqueda = searchParams.get('busqueda');

    if (!proyectoId) {
      return NextResponse.json({ error: 'proyectoId es obligatorio' }, { status: 400 });
    }

    // Facturas ya vinculadas al proyecto
    const vinculadas = await prisma.facturaEmitida.findMany({
      where: { proyectoSingularId: proyectoId },
      select: {
        id: true,
        numFactura: true,
        cliente: true,
        fecha: true,
        base: true,
        total: true,
        estado: true,
        importeCobrado: true,
        formaCobro: true,
        concepto: true,
      },
      orderBy: { fecha: 'asc' },
    });

    // Si hay búsqueda, devolver facturas disponibles (sin proyecto singular NI contrato recurrente)
    let disponibles: any[] = [];
    if (busqueda) {
      // Obtener numFactura de facturas ya vinculadas a contratos recurrentes
      const facturasEnContratos = await prisma.facturaContratoDraxton.findMany({
        select: { factura: { select: { numeroDocumento: true } } },
      });
      const numsEnContratos = new Set(
        facturasEnContratos.map(fc => fc.factura.numeroDocumento)
      );

      // Buscar facturas sin proyecto singular
      let candidatas = await prisma.facturaEmitida.findMany({
        where: {
          proyectoSingularId: null,
          OR: [
            { numFactura: { contains: busqueda, mode: 'insensitive' } },
            { cliente: { contains: busqueda, mode: 'insensitive' } },
            { concepto: { contains: busqueda, mode: 'insensitive' } },
          ],
          cliente: { contains: 'DRAXTON', mode: 'insensitive' },
        },
        select: {
          id: true,
          numFactura: true,
          cliente: true,
          fecha: true,
          base: true,
          total: true,
          estado: true,
          importeCobrado: true,
          concepto: true,
        },
        orderBy: { fecha: 'desc' },
        take: 50,
      });

      // Excluir las que ya están en contratos recurrentes
      disponibles = candidatas.filter(f => !numsEnContratos.has(f.numFactura)).slice(0, 20);

      // Si no hay resultados con Draxton, buscar en todas las facturas sin proyecto
      if (disponibles.length === 0) {
        candidatas = await prisma.facturaEmitida.findMany({
          where: {
            proyectoSingularId: null,
            OR: [
              { numFactura: { contains: busqueda, mode: 'insensitive' } },
              { cliente: { contains: busqueda, mode: 'insensitive' } },
            ],
          },
          select: {
            id: true,
            numFactura: true,
            cliente: true,
            fecha: true,
            base: true,
            total: true,
            estado: true,
            importeCobrado: true,
            concepto: true,
          },
          orderBy: { fecha: 'desc' },
          take: 50,
        });
        disponibles = candidatas.filter(f => !numsEnContratos.has(f.numFactura)).slice(0, 20);
      }
    }

    // KPIs del proyecto
    const totalFacturado = vinculadas.reduce((s, f) => s + f.total, 0);
    const totalCobrado = vinculadas.reduce((s, f) => s + f.importeCobrado, 0);
    const facturasCobradas = vinculadas.filter(f => f.estado === 'COBRADA').length;

    return NextResponse.json({
      vinculadas,
      disponibles,
      kpis: {
        totalFacturado,
        totalCobrado,
        pendienteCobro: totalFacturado - totalCobrado,
        numFacturas: vinculadas.length,
        facturasCobradas,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Vincular una factura a un proyecto singular
export async function POST(req: NextRequest) {
  try {
    const { proyectoId, facturaId } = await req.json();

    if (!proyectoId || !facturaId) {
      return NextResponse.json({ error: 'proyectoId y facturaId son obligatorios' }, { status: 400 });
    }

    // Verificar que la factura no está ya vinculada a otro proyecto
    const factura = await prisma.facturaEmitida.findUnique({
      where: { id: facturaId },
      select: { id: true, proyectoSingularId: true, numFactura: true },
    });

    if (!factura) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    }

    if (factura.proyectoSingularId && factura.proyectoSingularId !== proyectoId) {
      return NextResponse.json({ error: `La factura ${factura.numFactura} ya está vinculada a otro proyecto` }, { status: 400 });
    }

    // Vincular
    await prisma.facturaEmitida.update({
      where: { id: facturaId },
      data: { proyectoSingularId: proyectoId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Desvincular una factura de un proyecto singular
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const facturaId = searchParams.get('facturaId');

    if (!facturaId) {
      return NextResponse.json({ error: 'facturaId es obligatorio' }, { status: 400 });
    }

    await prisma.facturaEmitida.update({
      where: { id: facturaId },
      data: { proyectoSingularId: null },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
