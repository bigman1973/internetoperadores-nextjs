import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Obtener facturas pendientes de cobro (no remesa)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const buscar = searchParams.get('buscar') || '';
    const diasMin = parseInt(searchParams.get('diasMin') || '0');
    const formaCobro = searchParams.get('formaCobro') || ''; // transferencia, confirming, todas

    // Facturas pendientes de cobro (no remesa, no cobradas, no anuladas)
    const where: any = {
      estado: { in: ['EMITIDA', 'ENVIADA', 'COBRADA_PARCIAL', 'IMPAGADA'] },
      formaCobro: { not: 'Remesa' }, // Excluir remesas
    };

    if (formaCobro && formaCobro !== 'todas') {
      where.formaCobro = formaCobro;
    }

    if (buscar) {
      where.OR = [
        { cliente: { contains: buscar, mode: 'insensitive' } },
        { numFactura: { contains: buscar, mode: 'insensitive' } },
        { cif: { contains: buscar, mode: 'insensitive' } },
      ];
    }

    // Si se filtran por días mínimos de antigüedad
    if (diasMin > 0) {
      const fechaLimite = new Date();
      fechaLimite.setDate(fechaLimite.getDate() - diasMin);
      where.fecha = { lte: fechaLimite };
    }

    const [facturas, total] = await Promise.all([
      prisma.facturaEmitida.findMany({
        where,
        orderBy: { fecha: 'asc' }, // Más antiguas primero
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          cliente: true,
          cif: true,
          numFactura: true,
          fecha: true,
          fechaVencimiento: true,
          total: true,
          importeCobrado: true,
          estado: true,
          formaCobro: true,
          imputacion: true,
          concepto: true,
        },
      }),
      prisma.facturaEmitida.count({ where }),
    ]);

    // Resumen general
    const resumen = await prisma.facturaEmitida.aggregate({
      where,
      _sum: { total: true, importeCobrado: true },
      _count: true,
    });

    // Agrupar por cliente para el resumen
    const porCliente = await prisma.facturaEmitida.groupBy({
      by: ['cliente'],
      where,
      _sum: { total: true, importeCobrado: true },
      _count: true,
      orderBy: { _sum: { total: 'desc' } },
    });

    // Calcular días pendientes para cada factura
    const hoy = new Date();
    const facturasConDias = facturas.map(f => {
      const fechaRef = f.fechaVencimiento || f.fecha;
      const dias = Math.floor((hoy.getTime() - new Date(fechaRef).getTime()) / (1000 * 60 * 60 * 24));
      const pendiente = f.total - f.importeCobrado;
      return { ...f, diasPendiente: dias, importePendiente: pendiente };
    });

    // KPIs
    const totalPendiente = (resumen._sum.total || 0) - (resumen._sum.importeCobrado || 0);
    const numClientes = porCliente.length;
    const numFacturas = resumen._count;

    // Facturas vencidas (más de 30 días)
    const vencidas = facturasConDias.filter(f => f.diasPendiente > 30);
    const importeVencido = vencidas.reduce((sum, f) => sum + f.importePendiente, 0);

    // Facturas muy vencidas (más de 60 días)
    const muyVencidas = facturasConDias.filter(f => f.diasPendiente > 60);
    const importeMuyVencido = muyVencidas.reduce((sum, f) => sum + f.importePendiente, 0);

    return NextResponse.json({
      facturas: facturasConDias,
      total,
      resumen: {
        totalPendiente,
        numClientes,
        numFacturas,
        importeVencido,
        numVencidas: vencidas.length,
        importeMuyVencido,
        numMuyVencidas: muyVencidas.length,
      },
      porCliente: porCliente.map(c => ({
        cliente: c.cliente,
        numFacturas: c._count,
        totalFacturado: c._sum.total || 0,
        totalCobrado: c._sum.importeCobrado || 0,
        pendiente: (c._sum.total || 0) - (c._sum.importeCobrado || 0),
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
