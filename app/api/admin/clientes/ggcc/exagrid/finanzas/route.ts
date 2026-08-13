import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: obtener facturas Exagrid (V-Valley + Arrow) con proyectos asociados
export async function GET() {
  try {
    // Facturas emitidas a V-Valley y Arrow
    const facturas = await prisma.facturaEmitida.findMany({
      where: {
        OR: [
          { cliente: { contains: 'valley', mode: 'insensitive' } },
          { cliente: { contains: 'arrow', mode: 'insensitive' } },
        ]
      },
      include: {
        exagridProyecto: true,
      },
      orderBy: { fecha: 'desc' },
    });

    // KPIs
    const totalFacturado = facturas.reduce((sum, f) => sum + Number(f.base), 0);
    const totalCobrado = facturas.reduce((sum, f) => sum + Number(f.importeCobrado || 0), 0);
    const totalCoste = facturas.reduce((sum, f) => {
      const p = f.exagridProyecto;
      return sum + (p ? (Number(p.costeProveedor || 0) + Number(p.otrosCostes || 0)) : 0);
    }, 0);
    const totalPendienteCobro = totalFacturado - totalCobrado;
    const margenTotal = totalFacturado > 0 ? ((totalFacturado - totalCoste) / totalFacturado * 100) : 0;

    // Pagos a proveedores
    const totalPagado = facturas.reduce((sum, f) => {
      const p = f.exagridProyecto;
      return sum + (p ? Number(p.importePagado || 0) : 0);
    }, 0);
    const totalPendientePago = totalCoste - totalPagado;

    return NextResponse.json({
      facturas: facturas.map(f => ({
        id: f.id,
        numFactura: f.numFactura,
        cliente: f.cliente,
        fecha: f.fecha,
        base: Number(f.base),
        total: Number(f.total),
        importeCobrado: Number(f.importeCobrado || 0),
        estado: f.estado,
        concepto: f.concepto,
        idExterno: f.idExterno,
        serie: f.serie,
        proyecto: f.exagridProyecto ? {
          id: f.exagridProyecto.id,
          nombreProyecto: f.exagridProyecto.nombreProyecto,
          proveedor: f.exagridProyecto.proveedor,
          archivoFactura: f.exagridProyecto.archivoFactura,
          descripcion: f.exagridProyecto.descripcion,
          costeProveedor: Number(f.exagridProyecto.costeProveedor || 0),
          otrosCostes: Number(f.exagridProyecto.otrosCostes || 0),
          notasCostes: f.exagridProyecto.notasCostes,
          estadoCobro: f.exagridProyecto.estadoCobro,
          importeCobrado: Number(f.exagridProyecto.importeCobrado || 0),
          fechaCobro: f.exagridProyecto.fechaCobro,
          estadoPago: f.exagridProyecto.estadoPago,
          importePagado: Number(f.exagridProyecto.importePagado || 0),
          fechaPago: f.exagridProyecto.fechaPago,
          notas: f.exagridProyecto.notas,
        } : null,
      })),
      kpis: {
        totalFacturado,
        totalCobrado,
        totalPendienteCobro,
        totalCoste,
        margenTotal: Math.round(margenTotal * 10) / 10,
        margenAbsoluto: totalFacturado - totalCoste,
        totalPagado,
        totalPendientePago,
        numFacturas: facturas.length,
        numConProyecto: facturas.filter(f => f.exagridProyecto).length,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching Exagrid finanzas:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// POST: crear/actualizar proyecto asociado a una factura
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'crearProyecto': {
        const { facturaId, nombreProyecto, descripcion, costeProveedor, otrosCostes, notasCostes, proveedor } = body;
        const proyecto = await prisma.exagridProyecto.create({
          data: {
            facturaId,
            nombreProyecto,
            proveedor: proveedor || 'Consultoria Exagrid',
            descripcion: descripcion || null,
            costeProveedor: costeProveedor ? parseFloat(costeProveedor) : null,
            otrosCostes: otrosCostes ? parseFloat(otrosCostes) : 0,
            notasCostes: notasCostes || null,
          },
        });
        return NextResponse.json({ success: true, proyecto });
      }

      case 'actualizarProyecto': {
        const { id, nombreProyecto, descripcion, costeProveedor, otrosCostes, notasCostes, estadoCobro, importeCobrado, fechaCobro, estadoPago, importePagado, fechaPago, notas, proveedor } = body;
        const proyecto = await prisma.exagridProyecto.update({
          where: { id },
          data: {
            ...(nombreProyecto !== undefined && { nombreProyecto }),
            ...(proveedor !== undefined && { proveedor }),
            ...(descripcion !== undefined && { descripcion }),
            ...(costeProveedor !== undefined && { costeProveedor: costeProveedor ? parseFloat(costeProveedor) : null }),
            ...(otrosCostes !== undefined && { otrosCostes: otrosCostes ? parseFloat(otrosCostes) : 0 }),
            ...(notasCostes !== undefined && { notasCostes }),
            ...(estadoCobro !== undefined && { estadoCobro }),
            ...(importeCobrado !== undefined && { importeCobrado: parseFloat(importeCobrado) }),
            ...(fechaCobro !== undefined && { fechaCobro: fechaCobro ? new Date(fechaCobro) : null }),
            ...(estadoPago !== undefined && { estadoPago }),
            ...(importePagado !== undefined && { importePagado: parseFloat(importePagado) }),
            ...(fechaPago !== undefined && { fechaPago: fechaPago ? new Date(fechaPago) : null }),
            ...(notas !== undefined && { notas }),
          },
        });
        return NextResponse.json({ success: true, proyecto });
      }

      case 'eliminarProyecto': {
        const { id } = body;
        await prisma.exagridProyecto.delete({ where: { id } });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Accion no valida' }, { status: 400 });
    }
  } catch (error: unknown) {
    console.error('Error en Exagrid finanzas POST:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const proyectoId = formData.get('proyectoId') as string;

    if (!file || !proyectoId) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }

    // Convertir a base64 data URL para almacenar (archivos pequeños)
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    await prisma.exagridProyecto.update({
      where: { id: proyectoId },
      data: { archivoFactura: dataUrl },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error subiendo factura Exagrid:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
