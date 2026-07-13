import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const proveedor = searchParams.get('proveedor');
    const estadoAnalitica = searchParams.get('estadoAnalitica'); // 'imputada' | 'pendiente' | 'parcial'
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');
    const buscar = searchParams.get('buscar');

    const where: any = {};

    // Filtro por proveedor
    if (proveedor) {
      where.proveedor = { contains: proveedor, mode: 'insensitive' };
    }

    // Filtro por búsqueda general
    if (buscar) {
      where.OR = [
        { proveedor: { contains: buscar, mode: 'insensitive' } },
        { concepto: { contains: buscar, mode: 'insensitive' } },
        { numFactura: { contains: buscar, mode: 'insensitive' } },
        { clienteImputado: { contains: buscar, mode: 'insensitive' } },
      ];
    }

    // Filtro por período
    if (desde) where.fecha = { ...where.fecha, gte: new Date(desde) };
    if (hasta) where.fecha = { ...where.fecha, lte: new Date(hasta + 'T23:59:59') };

    // Filtro por estado de analítica
    if (estadoAnalitica === 'imputada') {
      where.imputadoAVentas = true;
    } else if (estadoAnalitica === 'pendiente') {
      where.imputadoAVentas = false;
      where.imputacion = null;
    } else if (estadoAnalitica === 'clasificada') {
      // Tiene imputación/categoría pero no está imputada a ventas (líneas)
      where.imputadoAVentas = false;
      where.imputacion = { not: null };
    }

    // Solo facturas con estado no rechazado
    where.estado = { not: 'RECHAZADA' };

    const [facturas, total] = await Promise.all([
      prisma.facturaRecibida.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          proveedor: true,
          cif: true,
          numFactura: true,
          fecha: true,
          base: true,
          total: true,
          concepto: true,
          imputacion: true,
          clienteImputado: true,
          imputadoAVentas: true,
          fechaImputacion: true,
          lineasDetalle: true,
          estado: true,
        },
      }),
      prisma.facturaRecibida.count({ where }),
    ]);

    // Obtener imputaciones de coste por cliente para las facturas imputadas
    const facturasImputadas = facturas.filter(f => f.imputadoAVentas);
    const imputaciones = facturasImputadas.length > 0
      ? await prisma.imputacionCosteCliente.findMany({
          where: { facturaId: { in: facturasImputadas.map(f => f.id) } },
          select: {
            facturaId: true,
            clienteNombre: true,
            importe: true,
            numLineas: true,
          },
        })
      : [];

    // Agrupar imputaciones por factura
    const imputacionesPorFactura: Record<string, { clienteNombre: string; importe: number; numLineas: number }[]> = {};
    for (const imp of imputaciones) {
      if (!imputacionesPorFactura[imp.facturaId]) {
        imputacionesPorFactura[imp.facturaId] = [];
      }
      imputacionesPorFactura[imp.facturaId].push(imp);
    }

    // Enriquecer facturas con info de analítica
    const facturasEnriquecidas = facturas.map(f => {
      let numLineas = 0;
      let lineasConCliente = 0;
      if (f.lineasDetalle) {
        try {
          const lineas = JSON.parse(f.lineasDetalle);
          numLineas = lineas.length;
          lineasConCliente = lineas.filter((l: any) => l.cliente || l.clienteNombreBd).length;
        } catch {}
      }

      return {
        ...f,
        lineasDetalle: undefined, // No enviar el JSON crudo
        numLineas,
        lineasConCliente,
        imputacionesCliente: imputacionesPorFactura[f.id] || [],
      };
    });

    // KPIs
    const totalFacturas = await prisma.facturaRecibida.count({ where: { estado: { not: 'RECHAZADA' } } });
    const imputadasCount = await prisma.facturaRecibida.count({ where: { estado: { not: 'RECHAZADA' }, imputadoAVentas: true } });
    const clasificadasCount = await prisma.facturaRecibida.count({ where: { estado: { not: 'RECHAZADA' }, imputadoAVentas: false, imputacion: { not: null } } });
    const pendientesCount = await prisma.facturaRecibida.count({ where: { estado: { not: 'RECHAZADA' }, imputadoAVentas: false, imputacion: null } });

    // Importe total imputado a clientes
    const importeImputado = await prisma.imputacionCosteCliente.aggregate({
      _sum: { importe: true },
    });

    return NextResponse.json({
      facturas: facturasEnriquecidas,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      kpis: {
        totalFacturas,
        imputadas: imputadasCount,
        clasificadas: clasificadasCount,
        pendientes: pendientesCount,
        porcentajeImputado: totalFacturas > 0 ? Math.round((imputadasCount / totalFacturas) * 100) : 0,
        importeImputado: importeImputado._sum.importe || 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
