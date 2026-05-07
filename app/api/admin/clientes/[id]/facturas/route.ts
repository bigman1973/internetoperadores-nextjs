import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id);
    
    // Obtener el cliente para saber su ispGestionId (id_cliente en facturas)
    const cliente = await prisma.clienteWeb.findUnique({
      where: { id: clienteId },
      select: { ispGestionId: true, clienteIdIsp: true, codigo: true, nombre: true }
    });
    
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }
    
    // El campo idCliente (Int) en facturas coincide con ispGestionId (String) del cliente
    // Ejemplo: factura.idCliente = 681 <-> cliente.ispGestionId = "681"
    const ispId = cliente.ispGestionId;
    
    if (!ispId) {
      return NextResponse.json({
        facturas: [],
        stats: { total: 0, cobradas: 0, pendientes: 0, totalFacturado: 0, totalPendiente: 0, facturacionMensual: 0, facturacionAnual: 0 },
        porMes: [],
        porSerie: []
      });
    }
    
    const idClienteInt = parseInt(ispId);
    
    if (isNaN(idClienteInt)) {
      return NextResponse.json({
        facturas: [],
        stats: { total: 0, cobradas: 0, pendientes: 0, totalFacturado: 0, totalPendiente: 0, facturacionMensual: 0, facturacionAnual: 0 },
        porMes: [],
        porSerie: []
      });
    }
    
    // Buscar facturas donde idCliente (Int) coincide con ispGestionId convertido a Int
    const facturas = await prisma.factura.findMany({
      where: { idCliente: idClienteInt },
      orderBy: { fecha: 'desc' }
    });
    
    // Estadísticas
    const cobradas = facturas.filter(f => f.situacion === 'COBRADA');
    const pendientes = facturas.filter(f => f.situacion !== 'COBRADA');
    const totalFacturado = facturas.reduce((sum, f) => sum + Number(f.total), 0);
    const totalPendiente = pendientes.reduce((sum, f) => sum + Number(f.totalPendiente), 0);
    
    // Facturación por mes
    const porMesMap = new Map<string, { base: number; iva: number; total: number; count: number }>();
    facturas.forEach(f => {
      const mes = f.fecha.toISOString().slice(0, 7);
      const existing = porMesMap.get(mes) || { base: 0, iva: 0, total: 0, count: 0 };
      existing.base += Number(f.base);
      existing.iva += Number(f.totalImpuesto);
      existing.total += Number(f.total);
      existing.count += 1;
      porMesMap.set(mes, existing);
    });
    const porMes = Array.from(porMesMap.entries())
      .map(([mes, data]) => ({ mes, ...data }))
      .sort((a, b) => a.mes.localeCompare(b.mes));
    
    // Facturación por serie
    const porSerieMap = new Map<string, { total: number; count: number }>();
    facturas.forEach(f => {
      const existing = porSerieMap.get(f.serieFactura) || { total: 0, count: 0 };
      existing.total += Number(f.total);
      existing.count += 1;
      porSerieMap.set(f.serieFactura, existing);
    });
    const porSerie = Array.from(porSerieMap.entries())
      .map(([serie, data]) => ({ serie, ...data }))
      .sort((a, b) => b.total - a.total);
    
    // Media mensual
    const mesesConFacturas = porMes.length || 1;
    const facturacionMensual = totalFacturado / mesesConFacturas;
    
    return NextResponse.json({
      facturas: facturas.map(f => ({
        ...f,
        base: Number(f.base),
        totalImpuesto: Number(f.totalImpuesto),
        total: Number(f.total),
        totalPendiente: Number(f.totalPendiente),
        fecha: f.fecha.toISOString().split('T')[0]
      })),
      stats: {
        total: facturas.length,
        cobradas: cobradas.length,
        pendientes: pendientes.length,
        totalFacturado: Math.round(totalFacturado * 100) / 100,
        totalPendiente: Math.round(totalPendiente * 100) / 100,
        facturacionMensual: Math.round(facturacionMensual * 100) / 100,
        facturacionAnual: Math.round(totalFacturado * 100) / 100
      },
      porMes,
      porSerie
    });
  } catch (error: any) {
    console.error('Error obteniendo facturas del cliente:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
