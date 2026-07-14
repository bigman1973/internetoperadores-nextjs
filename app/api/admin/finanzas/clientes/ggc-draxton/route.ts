import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// CIFs de las entidades Draxton
const DRAXTON_CIFS = ['B62926118', 'B66605593', 'B95358081', 'B63219620', 'IT01166730299'];

/**
 * GET: Obtiene facturas emitidas a Draxton, movimientos de cobro y KPIs
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || '2026');

    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year + 1}-01-01`);

    // 1. Facturas emitidas a Draxton
    const facturasEmitidas = await prisma.facturaEmitida.findMany({
      where: {
        OR: [
          { cif: { in: DRAXTON_CIFS } },
          { cliente: { contains: 'Draxton', mode: 'insensitive' } },
          { cliente: { contains: 'Fuchosa', mode: 'insensitive' } },
          { cliente: { contains: 'Altec', mode: 'insensitive' } },
          { cliente: { contains: 'Infun', mode: 'insensitive' } },
        ],
        fecha: { gte: startDate, lt: endDate },
      },
      orderBy: { fecha: 'desc' },
      select: {
        id: true,
        cliente: true,
        cif: true,
        numFactura: true,
        fecha: true,
        fechaVencimiento: true,
        base: true,
        total: true,
        estado: true,
        formaCobro: true,
        importeCobrado: true,
        fechaCobro: true,
        concepto: true,
      },
    });

    // 2. Movimientos bancarios de cobro Draxton/Confirming (ingresos)
    const movimientosCobro = await prisma.movimientoBancario.findMany({
      where: {
        fechaOperacion: { gte: startDate, lt: endDate },
        importe: { gt: 0 },
        OR: [
          { concepto: { contains: 'Draxton', mode: 'insensitive' } },
          { concepto: { contains: 'CONFIRMING', mode: 'insensitive' } },
          { tercero: { contains: 'Draxton', mode: 'insensitive' } },
          { facturaEmitidaId: { not: null } },
        ],
      },
      orderBy: { fechaOperacion: 'desc' },
      select: {
        id: true,
        fechaOperacion: true,
        concepto: true,
        tercero: true,
        importe: true,
        banco: true,
        conciliado: true,
        facturaEmitidaId: true,
        facturaEmitida: {
          select: { numFactura: true, cliente: true, total: true },
        },
      },
    });

    // 3. KPIs
    const totalFacturado = facturasEmitidas.reduce((sum, f) => sum + f.total, 0);
    const totalCobrado = facturasEmitidas.reduce((sum, f) => sum + (f.importeCobrado || 0), 0);
    const pendienteCobro = totalFacturado - totalCobrado;
    const facturasConCobro = facturasEmitidas.filter(f => f.estado === 'COBRADA').length;
    const facturasPendientes = facturasEmitidas.filter(f => f.estado !== 'COBRADA').length;

    // Movimientos sin factura vinculada
    const movimientosSinVincular = movimientosCobro.filter(m => !m.facturaEmitidaId).length;
    const totalIngresado = movimientosCobro.reduce((sum, m) => sum + Number(m.importe), 0);

    return NextResponse.json({
      facturasEmitidas,
      movimientosCobro,
      kpis: {
        totalFacturado,
        totalCobrado,
        pendienteCobro,
        totalFacturas: facturasEmitidas.length,
        facturasConCobro,
        facturasPendientes,
        totalMovimientos: movimientosCobro.length,
        movimientosSinVincular,
        totalIngresado,
      },
    });
  } catch (error: any) {
    console.error('Error en GET /api/admin/finanzas/clientes/ggc-draxton:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST: Vincular un movimiento bancario con una factura emitida
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { movimientoId, facturaEmitidaId } = body;

    if (!movimientoId || !facturaEmitidaId) {
      return NextResponse.json({ error: 'Faltan movimientoId o facturaEmitidaId' }, { status: 400 });
    }

    // Vincular movimiento con factura emitida
    await prisma.movimientoBancario.update({
      where: { id: movimientoId },
      data: {
        facturaEmitidaId,
        conciliado: true,
        tipoDocumento: 'factura',
      },
    });

    // Actualizar factura emitida como cobrada
    const movimiento = await prisma.movimientoBancario.findUnique({
      where: { id: movimientoId },
      select: { importe: true, fechaOperacion: true },
    });

    if (movimiento) {
      const factura = await prisma.facturaEmitida.findUnique({
        where: { id: facturaEmitidaId },
        select: { importeCobrado: true, total: true },
      });

      if (factura) {
        const nuevoImporteCobrado = (factura.importeCobrado || 0) + Number(movimiento.importe);
        const cobradaCompleta = nuevoImporteCobrado >= factura.total * 0.98; // 2% tolerancia

        await prisma.facturaEmitida.update({
          where: { id: facturaEmitidaId },
          data: {
            importeCobrado: nuevoImporteCobrado,
            fechaCobro: movimiento.fechaOperacion,
            estado: cobradaCompleta ? 'COBRADA' : undefined,
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error en POST /api/admin/finanzas/clientes/ggc-draxton:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
