import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Obtener una entidad fiscal con sus movimientos y resumen
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const entidad = await prisma.entidadFiscal.findUnique({
      where: { id },
    });

    if (!entidad) {
      return NextResponse.json({ error: 'Entidad no encontrada' }, { status: 404 });
    }

    // Movimientos vinculados con paginación
    const [movimientos, totalMovimientos] = await Promise.all([
      prisma.movimientoBancario.findMany({
        where: { entidadFiscalId: id },
        orderBy: { fechaOperacion: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          fechaOperacion: true,
          concepto: true,
          importe: true,
          categoria: true,
          tipoPago: true,
          conciliado: true,
          tipoDocumento: true,
          documentoRecibido: true,
          facturaId: true,
          factura: { select: { id: true, numFactura: true, total: true, fecha: true } },
          cuenta: { select: { banco: true } },
        },
      }),
      prisma.movimientoBancario.count({ where: { entidadFiscalId: id } }),
    ]);

    // Resumen financiero
    const resumen = await prisma.movimientoBancario.aggregate({
      where: { entidadFiscalId: id },
      _sum: { importe: true },
      _count: true,
    });

    // Pagos (gastos negativos)
    const totalPagado = await prisma.movimientoBancario.aggregate({
      where: { entidadFiscalId: id, importe: { lt: 0 } },
      _sum: { importe: true },
      _count: true,
    });

    // Cobros (ingresos positivos)
    const totalCobrado = await prisma.movimientoBancario.aggregate({
      where: { entidadFiscalId: id, importe: { gt: 0 } },
      _sum: { importe: true },
      _count: true,
    });

    // Pendientes de documento (tipoDocumento = factura y documentoRecibido = false)
    const pendientesDocumento = await prisma.movimientoBancario.count({
      where: { entidadFiscalId: id, tipoDocumento: 'factura', documentoRecibido: false },
    });

    // Sin conciliar
    const sinConciliar = await prisma.movimientoBancario.count({
      where: { entidadFiscalId: id, conciliado: false },
    });

    // Con factura vinculada
    const conFactura = await prisma.movimientoBancario.count({
      where: { entidadFiscalId: id, facturaId: { not: null } },
    });

    // Si es CLIENTE, obtener también facturas emitidas vinculadas por nombre/CIF
    let facturasEmitidas: any[] = [];
    let totalFacturasEmitidas = 0;
    let resumenFacturas = { totalFacturado: 0, numFacturas: 0 };

    if (entidad.tipo === 'CLIENTE') {
      // Construir condiciones OR solo con campos que existen
      const orConditions: any[] = [];
      if (entidad.nifCif) {
        orConditions.push({ cif: entidad.nifCif });
      }
      if (entidad.razonSocial) {
        orConditions.push({ cliente: { equals: entidad.razonSocial, mode: 'insensitive' } });
      }
      if (entidad.nombreComercial) {
        orConditions.push({ cliente: { equals: entidad.nombreComercial, mode: 'insensitive' } });
      }

      // Solo buscar facturas si hay al menos una condición
      if (orConditions.length > 0) {
        const whereFacturas = { OR: orConditions };

        [facturasEmitidas, totalFacturasEmitidas] = await Promise.all([
          prisma.facturaEmitida.findMany({
            where: whereFacturas,
            orderBy: { fecha: 'desc' },
            skip: 0,
            take: 50,
            select: {
              id: true,
              numFactura: true,
              fecha: true,
              base: true,
              importeIva: true,
              total: true,
              formaCobro: true,
              estado: true,
            },
          }),
          prisma.facturaEmitida.count({ where: whereFacturas }),
        ]);

        const sumaFacturas = await prisma.facturaEmitida.aggregate({
          where: whereFacturas,
          _sum: { total: true },
          _count: true,
        });
        resumenFacturas = {
          totalFacturado: Number(sumaFacturas._sum.total || 0),
          numFacturas: sumaFacturas._count,
        };
      }
    }

    return NextResponse.json({
      entidad,
      movimientos,
      totalMovimientos,
      facturasEmitidas,
      totalFacturasEmitidas,
      resumenFacturas,
      resumen: {
        totalOperaciones: resumen._count,
        importeNeto: resumen._sum.importe || 0,
        totalPagado: Math.abs(totalPagado._sum.importe || 0),
        numPagos: totalPagado._count,
        totalCobrado: totalCobrado._sum.importe || 0,
        numCobros: totalCobrado._count,
        pendientesDocumento,
        sinConciliar,
        conFactura,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Actualizar entidad fiscal
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json();

    const data: any = {};
    const campos = [
      'razonSocial', 'nombreComercial', 'nifCif', 'direccionFiscal',
      'codigoPostal', 'poblacion', 'provincia', 'pais', 'emailFacturacion',
      'emailGeneral', 'telefono', 'personaContacto', 'cuentaContableA3',
      'categoriaInterna', 'subcategoria', 'formaPago', 'diaPago',
      'plazoVencimiento', 'iban', 'patronesBancarios', 'notas', 'activo', 'tipo',
    ];

    for (const campo of campos) {
      if (body[campo] !== undefined) {
        if (campo === 'diaPago' || campo === 'plazoVencimiento') {
          data[campo] = body[campo] ? parseInt(body[campo]) : null;
        } else {
          data[campo] = body[campo];
        }
      }
    }

    const entidad = await prisma.entidadFiscal.update({
      where: { id },
      data,
    });

    return NextResponse.json({ entidad });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Eliminar entidad fiscal
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    // Verificar si tiene movimientos vinculados
    const count = await prisma.movimientoBancario.count({
      where: { entidadFiscalId: id },
    });

    if (count > 0) {
      // No eliminar, solo desactivar
      await prisma.entidadFiscal.update({
        where: { id },
        data: { activo: false },
      });
      return NextResponse.json({ message: 'Entidad desactivada (tiene movimientos vinculados)', desactivada: true });
    }

    await prisma.entidadFiscal.delete({ where: { id } });
    return NextResponse.json({ message: 'Entidad eliminada' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
