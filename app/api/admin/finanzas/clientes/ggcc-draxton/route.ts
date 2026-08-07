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
        totalConfirming: true,
        archivoUrl: true,
        archivoOneDrive: true,
        carpetaOrigen: true,
        estado: true,
        confirmingProveedor: true,
        confirmingLineas: {
          select: {
            id: true,
            numFactura: true,
            importe: true,
            comision: true,
            intereses: true,
            tipoInteres: true,
            gastosFinancieros: true,
            fechaPago: true,
            notas: true,
            facturaEmitida: {
              select: { id: true, numFactura: true, cliente: true, total: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // 3. Movimientos bancarios de cobro Draxton/Confirming (ingresos)
    const movimientosCobro = await prisma.movimientoBancario.findMany({
      where: {
        fechaOperacion: { gte: startDate, lt: endDate },
        importe: { gt: 0 },
        categoria: { not: 'Descartado_Draxton' }, // Excluir descartados
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
        conciliado: true,
        facturaEmitidaId: true,
        notaConciliacion: true,
        cuenta: { select: { banco: true } },
        facturaEmitida: {
          select: { numFactura: true, cliente: true, total: true },
        },
      },
    });

    // Filtrar movimientos: solo los que realmente son de Draxton/Confirming
    // Excluir: Clavería Alcalá (no es confirming Draxton)
    const movimientosRelevantes = movimientosCobro.filter(m => {
      if (m.facturaEmitidaId) return true;
      const concepto = (m.concepto || '').toLowerCase();
      const tercero = (m.tercero || '').toLowerCase();
      // Excluir Clavería
      if (concepto.includes('claveria') || tercero.includes('claveria')) return false;
      return concepto.includes('draxton') || 
             concepto.includes('confirming') || 
             concepto.includes('cesion de credito') ||
             concepto.includes('anticipo confirming') ||
             concepto.includes('abono facturas a vto') ||
             concepto.includes('liquidacion anticipo') ||
             tercero.includes('draxton') ||
             tercero.includes('santander factoring');
    });
    
    // Enriquecer movimientos vinculados: buscar TODAS las facturas del confirming asociado
    const movimientosEnriquecidos = await Promise.all(movimientosRelevantes.map(async (m) => {
      if (!m.notaConciliacion?.includes('Auto-conciliado con')) {
        return { ...m, facturasConfirming: m.facturaEmitida ? [m.facturaEmitida] : [] };
      }
      // Extraer nombre del confirming de la nota
      const matchDoc = m.notaConciliacion.match(/Auto-conciliado con (.+?) \(/);
      if (!matchDoc) {
        return { ...m, facturasConfirming: m.facturaEmitida ? [m.facturaEmitida] : [] };
      }
      const docName = matchDoc[1];
      const doc = await prisma.facturaRecibida.findFirst({
        where: { numFactura: docName },
        select: {
          confirmingLineas: {
            where: { facturaEmitidaId: { not: null } },
            select: {
              facturaEmitida: { select: { numFactura: true, cliente: true, total: true } },
            },
          },
        },
      });
      const facturas = doc?.confirmingLineas
        .map(l => l.facturaEmitida)
        .filter(Boolean) || (m.facturaEmitida ? [m.facturaEmitida] : []);
      return { ...m, facturasConfirming: facturas };
    }));

    // 4. KPIs
    const totalFacturado = facturasEmitidas.reduce((sum, f) => sum + f.total, 0);
    const totalCobrado = facturasEmitidas.reduce((sum, f) => sum + (f.importeCobrado || 0), 0);
    const pendienteCobro = totalFacturado - totalCobrado;
    const facturasConCobro = facturasEmitidas.filter(f => f.estado === 'COBRADA').length;
    const facturasPendientes = facturasEmitidas.filter(f => f.estado !== 'COBRADA').length;

    // Movimientos sin factura vinculada
    const movimientosSinVincular = movimientosEnriquecidos.filter(m => !m.facturaEmitidaId).length;
    const totalIngresado = movimientosEnriquecidos.reduce((sum, m) => sum + Number(m.importe), 0);

    // 5. Gastos financieros (sumar de todas las líneas de confirming)
    const gastosAgg = await prisma.confirmingLinea.aggregate({
      _sum: { gastosFinancieros: true, comision: true, intereses: true },
    });
    const totalGastosFinancieros = gastosAgg._sum.gastosFinancieros || 0;
    const totalComisiones = gastosAgg._sum.comision || 0;
    const totalIntereses = gastosAgg._sum.intereses || 0;

    return NextResponse.json({
      facturasEmitidas,
      documentosConfirming,
      movimientosCobro: movimientosEnriquecidos,
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
        totalGastosFinancieros,
        totalComisiones,
        totalIntereses,
      },
    });
  } catch (error: any) {
    console.error('Error en GET /api/admin/finanzas/clientes/ggcc-draxton:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST: Vincular un movimiento bancario con una factura emitida
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { movimientoId, facturaEmitidaId, accion } = body;

    // Acción: descartar movimiento del listado de confirmings
    if (accion === 'descartar' && movimientoId) {
      await prisma.movimientoBancario.update({
        where: { id: movimientoId },
        data: {
          categoria: 'Descartado_Draxton',
          notaConciliacion: 'Descartado del módulo GGCC-Draxton (no es confirming)',
        },
      });
      return NextResponse.json({ ok: true, descartado: true });
    }

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
    console.error('Error en POST /api/admin/finanzas/clientes/ggcc-draxton:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
