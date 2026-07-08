import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const conciliacionId = searchParams.get('conciliacionId');
  const remesaId = searchParams.get('remesaId');

  if (!conciliacionId && !remesaId) {
    return NextResponse.json({ error: 'conciliacionId o remesaId requerido' }, { status: 400 });
  }

  try {
    // Obtener la remesa (directamente o a través de conciliación)
    let remesa: any = null;
    let subRemesas: any[] = [];

    if (conciliacionId) {
      const conciliacion = await prisma.conciliacionRemesa.findUnique({
        where: { id: conciliacionId },
        include: {
          remesa: true,
          subRemesas: {
            orderBy: { fechaVencimiento: 'asc' },
          },
        },
      });

      if (!conciliacion) {
        return NextResponse.json({ error: 'Conciliación no encontrada' }, { status: 404 });
      }

      remesa = conciliacion.remesa;
      subRemesas = conciliacion.subRemesas;
    } else if (remesaId) {
      remesa = await prisma.remesa.findUnique({
        where: { id: parseInt(remesaId) },
        include: {
          conciliacion: {
            include: { subRemesas: { orderBy: { fechaVencimiento: 'asc' } } },
          },
        },
      });

      if (!remesa) {
        return NextResponse.json({ error: 'Remesa no encontrada' }, { status: 404 });
      }

      subRemesas = remesa.conciliacion?.subRemesas || [];
    }

    // Determinar la serie de factura según el nombre de la remesa
    const nombreRemesa = remesa.nombre.toUpperCase();
    let serie = '';
    if (nombreRemesa.includes('LLEIDA')) serie = 'CLL';
    else if (nombreRemesa.includes('PALLARS')) serie = 'CPL';
    else if (nombreRemesa.includes('MOVIL') || nombreRemesa.includes('MÓVIL')) serie = 'CMV';
    else if (nombreRemesa.includes('COMUNIDAD')) serie = 'CCM';

    // Obtener las facturas de esa serie y mes
    const fechaRemesa = new Date(remesa.fecha);
    const mesInicio = new Date(fechaRemesa.getFullYear(), fechaRemesa.getMonth(), 1);
    const mesFin = new Date(fechaRemesa.getFullYear(), fechaRemesa.getMonth() + 1, 0, 23, 59, 59);

    let facturas: any[] = [];
    if (serie) {
      facturas = await prisma.factura.findMany({
        where: {
          serieFactura: serie,
          fecha: { gte: mesInicio, lte: mesFin },
          documento: 'Factura Ventas',
        },
        select: {
          id: true,
          serieFactura: true,
          numeroFactura: true,
          nombreCompleto: true,
          nifCif: true,
          total: true,
          situacion: true,
          fecha: true,
          codigoCliente: true,
        },
        orderBy: [{ situacion: 'asc' }, { nombreCompleto: 'asc' }],
      });
    }

    // Obtener devoluciones de esta remesa
    const devoluciones = await prisma.devolucionRemesa.findMany({
      where: { remesaId: remesa.id },
      select: {
        id: true,
        numeroFactura: true,
        importe: true,
        estado: true,
        nombreCliente: true,
        motivo: true,
        motivoBanco: true,
        fechaDevolucion: true,
        importeCobrado: true,
        fechaCobro: true,
      },
    });

    // Formatear facturas - detectar cuáles tienen devolución
    const facturasFormateadas = facturas.map((f: any) => {
      // Buscar si esta factura tiene devolución
      const numFacturaCompleto = `${f.serieFactura}${f.numeroFactura ? '/' + f.numeroFactura : ''}`;
      const tieneDevolucion = devoluciones.find(
        (d: any) => d.numeroFactura === numFacturaCompleto
          || d.numeroFactura === `${f.serieFactura}${f.numeroFactura}`
      );
      return {
        id: f.id,
        numeroFactura: `${f.serieFactura}/${f.numeroFactura}`,
        cliente: f.nombreCompleto,
        nifCif: f.nifCif,
        importe: Number(f.total),
        situacion: f.situacion,
        tieneDevolucion: !!tieneDevolucion,
        estadoDevolucion: tieneDevolucion?.estado || null,
      };
    });

    // Formatear sub-remesas
    const subRemesasFormateadas = subRemesas.map((sr: any) => ({
      id: sr.id,
      referencia: sr.referenciaRemesa,
      fechaVencimiento: sr.fechaVencimiento,
      numRecibos: sr.numRecibos,
      importe: Number(sr.importe),
      cobrado: sr.cobrado,
    }));

    // Resumen
    const totalFacturas = facturasFormateadas.length;
    const facturasCobradas = facturasFormateadas.filter((f: any) => f.situacion === 'COBRADA').length;
    const facturasPendientes = facturasFormateadas.filter((f: any) => f.situacion !== 'COBRADA').length;
    const facturasConDevolucion = facturasFormateadas.filter((f: any) => f.tieneDevolucion).length;
    const totalSubRemesas = subRemesasFormateadas.length;
    const subRemesasCobradas = subRemesasFormateadas.filter((sr: any) => sr.cobrado).length;
    const importeSubRemesasCobradas = subRemesasFormateadas
      .filter((sr: any) => sr.cobrado)
      .reduce((sum: number, sr: any) => sum + sr.importe, 0);
    const importeSubRemesasPendientes = subRemesasFormateadas
      .filter((sr: any) => !sr.cobrado)
      .reduce((sum: number, sr: any) => sum + sr.importe, 0);

    return NextResponse.json({
      remesa: {
        nombre: remesa.nombre,
        fecha: remesa.fecha,
        totalImporte: Number(remesa.totalImporte),
        numeroRegistros: remesa.numeroRegistros,
        serie,
      },
      resumen: {
        totalFacturas,
        facturasCobradas,
        facturasPendientes,
        facturasConDevolucion,
        totalSubRemesas,
        subRemesasCobradas,
        importeSubRemesasCobradas: Math.round(importeSubRemesasCobradas * 100) / 100,
        importeSubRemesasPendientes: Math.round(importeSubRemesasPendientes * 100) / 100,
      },
      facturas: facturasFormateadas,
      subRemesas: subRemesasFormateadas,
      devoluciones: devoluciones.map((d: any) => ({
        numFactura: d.numeroFactura,
        importe: Number(d.importe),
        estado: d.estado,
        cliente: d.nombreCliente,
        motivo: d.motivo || d.motivoBanco || '',
        fechaDevolucion: d.fechaDevolucion,
        importeCobrado: d.importeCobrado ? Number(d.importeCobrado) : null,
        fechaCobro: d.fechaCobro,
      })),
    });
  } catch (error: any) {
    console.error('Error detalle remesa:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
