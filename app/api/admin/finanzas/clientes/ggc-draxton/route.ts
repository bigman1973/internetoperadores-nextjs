import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Nombres de clientes Draxton (grupo)
const DRAXTON_CLIENTES = ['Draxton', 'Fuchosa', 'Altec', 'Infun'];

/**
 * GET: Obtiene facturas emitidas a Draxton, documentos confirming, movimientos de cobro y KPIs
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || '2026');

    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year + 1}-01-01`);

    // 1. Facturas emitidas a Draxton (buscar por nombre de cliente)
    const facturasEmitidas = await prisma.facturaEmitida.findMany({
      where: {
        OR: DRAXTON_CLIENTES.map(nombre => ({
          cliente: { contains: nombre, mode: 'insensitive' as const },
        })),
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

    // 2. Documentos de confirming (facturas recibidas de la carpeta Confirming Draxton)
    const documentosConfirming = await prisma.facturaRecibida.findMany({
      where: {
        carpetaOrigen: { contains: 'Confirming', mode: 'insensitive' },
      },
      orderBy: { fecha: 'desc' },
      select: {
        id: true,
        proveedor: true,
        numFactura: true,
        fecha: true,
        total: true,
        base: true,
        archivoUrl: true,
        archivoOneDrive: true,
        carpetaOrigen: true,
        estado: true,
      },
    });

    // 3. Movimientos bancarios de cobro Draxton/Confirming (ingresos)
    const movimientosCobro = await prisma.movimientoBancario.findMany({
      where: {
        fechaOperacion: { gte: startDate, lt: endDate },
        importe: { gt: 0 },
        OR: [
          { concepto: { contains: 'Draxton', mode: 'insensitive' } },
          { concepto: { contains: 'CONFIRMING', mode: 'insensitive' } },
          { concepto: { contains: 'CESION DE CREDITO', mode: 'insensitive' } },
          { tercero: { contains: 'Draxton', mode: 'insensitive' } },
          { tercero: { contains: 'Caixabank', mode: 'insensitive' } },
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

    // Filtrar movimientos: solo los que realmente son de Draxton/Confirming
    // (Caixabank puede tener muchos movimientos que no son de Draxton)
    const movimientosRelevantes = movimientosCobro.filter(m => {
      if (m.facturaEmitidaId) return true;
      const concepto = (m.concepto || '').toLowerCase();
      const tercero = (m.tercero || '').toLowerCase();
      return concepto.includes('draxton') || 
             concepto.includes('confirming') || 
             concepto.includes('cesion de credito') ||
             tercero.includes('draxton');
    });

    // 4. KPIs
    const totalFacturado = facturasEmitidas.reduce((sum, f) => sum + f.total, 0);
    const totalCobrado = facturasEmitidas.reduce((sum, f) => sum + (f.importeCobrado || 0), 0);
    const pendienteCobro = totalFacturado - totalCobrado;
    const facturasConCobro = facturasEmitidas.filter(f => f.estado === 'COBRADA').length;
    const facturasPendientes = facturasEmitidas.filter(f => f.estado !== 'COBRADA').length;

    // Movimientos sin factura vinculada
    const movimientosSinVincular = movimientosRelevantes.filter(m => !m.facturaEmitidaId).length;
    const totalIngresado = movimientosRelevantes.reduce((sum, m) => sum + Number(m.importe), 0);

    return NextResponse.json({
      facturasEmitidas,
      documentosConfirming,
      movimientosCobro: movimientosRelevantes,
      kpis: {
        totalFacturado,
        totalCobrado,
        pendienteCobro,
        totalFacturas: facturasEmitidas.length,
        facturasConCobro,
        facturasPendientes,
        totalMovimientos: movimientosRelevantes.length,
        movimientosSinVincular,
        totalIngresado,
        totalDocumentosConfirming: documentosConfirming.length,
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
