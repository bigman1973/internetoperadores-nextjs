import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
    const trimestre = searchParams.get('trimestre'); // 1, 2, 3, 4 o null para todo el año

    // Calcular rango de fechas
    let desde: Date, hasta: Date;
    if (trimestre) {
      const t = parseInt(trimestre);
      desde = new Date(year, (t - 1) * 3, 1);
      hasta = new Date(year, t * 3, 0, 23, 59, 59);
    } else {
      desde = new Date(year, 0, 1);
      hasta = new Date(year, 11, 31, 23, 59, 59);
    }

    // 1. Saldos bancarios actuales
    const cuentas = await prisma.cuentaBancaria.findMany({
      where: { activa: true },
      orderBy: { banco: 'asc' },
    });

    // 2. Facturas recibidas (IVA Soportado)
    const facturasRecibidas = await prisma.facturaRecibida.findMany({
      where: {
        fecha: { gte: desde, lte: hasta },
        estado: { not: 'RECHAZADA' },
        deducibleIva: true,
      },
    });

    const ivaSoportado = facturasRecibidas.reduce((sum, f) => sum + f.importeIva, 0);
    const baseImponibleCompras = facturasRecibidas.reduce((sum, f) => sum + f.base, 0);
    const irpfRetenido = facturasRecibidas.reduce((sum, f) => sum + f.importeIrpf, 0);
    const totalCompras = facturasRecibidas.reduce((sum, f) => sum + f.total, 0);

    // 3. Facturas emitidas - usar tabla 'facturas' (ISPGestión, actualizada con sync)
    const facturasISP = await prisma.factura.findMany({
      where: {
        ejercicio: year,
        ...(trimestre ? {
          fecha: { gte: desde, lte: hasta },
        } : {}),
      },
    });

    const totalVentas = facturasISP.reduce((sum, f) => sum + Number(f.total), 0);
    const totalImpuestoVentas = facturasISP.reduce((sum, f) => sum + Number(f.totalImpuesto), 0);
    const baseImponibleVentas = facturasISP.reduce((sum, f) => sum + Number(f.base), 0);
    const ivaRepercutido = totalImpuestoVentas;
    const totalCobrado = facturasISP.filter(f => f.situacion === 'COBRADA').reduce((sum, f) => sum + Number(f.total), 0);
    const pendienteCobro = facturasISP.filter(f => f.situacion === 'PENDIENTE').reduce((sum, f) => sum + Number(f.totalPendiente), 0);

    // Facturas por estado (situacion)
    const facturasEmitidasPorEstado: Record<string, { count: number; total: number }> = {};
    for (const f of facturasISP) {
      const estado = f.situacion;
      if (!facturasEmitidasPorEstado[estado]) facturasEmitidasPorEstado[estado] = { count: 0, total: 0 };
      facturasEmitidasPorEstado[estado].count++;
      facturasEmitidasPorEstado[estado].total += Number(f.total);
    }

    // 4. Movimientos por categoría
    const movimientos = await prisma.movimientoBancario.findMany({
      where: {
        fechaOperacion: { gte: desde, lte: hasta },
      },
    });

    const ingresos = movimientos.filter(m => m.importe > 0).reduce((sum, m) => sum + m.importe, 0);
    const totalSalidas = movimientos.filter(m => m.importe < 0).reduce((sum, m) => sum + Math.abs(m.importe), 0);

    // Desglose de salidas por tipo
    const categoriasNominas = ['Sueldos y Salarios'];
    const categoriasMayoristas = ['Operadora', 'Vola', 'Comisiones V-Valley'];
    const categoriasImpuestos = ['IMPUESTOS'];
    const categoriasTransferencias = ['Traspaso'];
    const categoriasDevoluciones = ['Morosos'];
    const categoriasGastosOp = ['Estructura', 'Gastos Financieros', 'Oros Gastos', 'Otros Gastos', 'Proyectos Singulares', 'Dietas', 'Desplazamientos'];

    const movSalidas = movimientos.filter(m => m.importe < 0);
    const salidasMayoristas = movSalidas.filter(m => categoriasMayoristas.includes(m.categoria || '')).reduce((s, m) => s + Math.abs(m.importe), 0);
    const salidasNominas = movSalidas.filter(m => categoriasNominas.includes(m.categoria || '')).reduce((s, m) => s + Math.abs(m.importe), 0);
    const salidasImpuestos = movSalidas.filter(m => categoriasImpuestos.includes(m.categoria || '')).reduce((s, m) => s + Math.abs(m.importe), 0);
    const salidasTransferencias = movSalidas.filter(m => categoriasTransferencias.includes(m.categoria || '')).reduce((s, m) => s + Math.abs(m.importe), 0);
    const salidasDevoluciones = movSalidas.filter(m => categoriasDevoluciones.includes(m.categoria || '')).reduce((s, m) => s + Math.abs(m.importe), 0);
    const salidasGastosOp = movSalidas.filter(m => categoriasGastosOp.includes(m.categoria || '')).reduce((s, m) => s + Math.abs(m.importe), 0);
    const salidasOtros = totalSalidas - salidasMayoristas - salidasNominas - salidasImpuestos - salidasTransferencias - salidasDevoluciones - salidasGastosOp;

    // Agrupar por categoría (para tabla detallada)
    const porCategoria: Record<string, { ingresos: number; gastos: number; count: number }> = {};
    for (const mov of movimientos) {
      const cat = mov.categoria || 'Sin categorizar';
      if (!porCategoria[cat]) porCategoria[cat] = { ingresos: 0, gastos: 0, count: 0 };
      if (mov.importe > 0) porCategoria[cat].ingresos += mov.importe;
      else porCategoria[cat].gastos += Math.abs(mov.importe);
      porCategoria[cat].count++;
    }

    // 5. Movimientos por mes
    const porMes: Record<string, { ingresos: number; gastos: number }> = {};
    for (const mov of movimientos) {
      const mes = `${mov.fechaOperacion.getFullYear()}-${String(mov.fechaOperacion.getMonth() + 1).padStart(2, '0')}`;
      if (!porMes[mes]) porMes[mes] = { ingresos: 0, gastos: 0 };
      if (mov.importe > 0) porMes[mes].ingresos += mov.importe;
      else porMes[mes].gastos += Math.abs(mov.importe);
    }

    // 6. Estadísticas de conciliación
    const totalMovimientos = movimientos.length;
    const conciliados = movimientos.filter(m => m.conciliado).length;
    const sinCategorizar = movimientos.filter(m => !m.categoria).length;

    // 7. Alertas
    const facturasPendientes = await prisma.facturaRecibida.count({
      where: { estado: 'PENDIENTE_REVISION' },
    });

    const facturasImpagadas = facturasISP.filter(f => f.situacion === 'PENDIENTE').length;
    const facturasVencidas = 0; // La tabla facturas de ISPGestión no tiene fecha_vencimiento

    // 8. Top gastos por categoría (para el gráfico de tarjeta/restaurantes/etc.)
    const gastosPorTipo: Record<string, number> = {};
    for (const mov of movimientos.filter(m => m.importe < 0)) {
      const tipo = mov.tipoPago || 'Otros';
      gastosPorTipo[tipo] = (gastosPorTipo[tipo] || 0) + Math.abs(mov.importe);
    }

    // 9. IRPF Nóminas - calcular retenciones de IRPF de las nóminas del periodo
    let mesesNominas: number[] = [];
    if (trimestre) {
      const t = parseInt(trimestre);
      mesesNominas = [(t - 1) * 3 + 1, (t - 1) * 3 + 2, (t - 1) * 3 + 3];
    } else {
      mesesNominas = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    }

    const nominasPeriodo = await prisma.nomina.findMany({
      where: {
        anio: year,
        mes: { in: mesesNominas },
      },
    });

    const irpfNominas = nominasPeriodo.reduce((sum, n) => sum + (n.irpf || 0), 0);
    const ssEmpresaNominas = nominasPeriodo.reduce((sum, n) => sum + (n.ssEmpresa || 0), 0);
    const ssTrabajadorNominas = nominasPeriodo.reduce((sum, n) => sum + (n.ssTrabajador || 0), 0);
    const mesesConNominas = [...new Set(nominasPeriodo.map(n => n.mes))].length;

    return NextResponse.json({
      periodo: {
        year,
        trimestre: trimestre ? parseInt(trimestre) : null,
        desde: desde.toISOString(),
        hasta: hasta.toISOString(),
      },
      saldos: {
        cuentas: cuentas.map(c => ({
          id: c.id,
          banco: c.banco,
          alias: c.alias,
          saldo: c.saldoActual,
          fechaSaldo: c.fechaSaldo,
        })),
        total: cuentas.reduce((sum, c) => sum + (c.saldoActual || 0), 0),
      },
      fiscal: {
        ivaSoportado: Math.round(ivaSoportado * 100) / 100,
        ivaRepercutido: Math.round(ivaRepercutido * 100) / 100,
        ivaAPagar: Math.round((ivaRepercutido - ivaSoportado) * 100) / 100,
        irpfRetenido: Math.round(irpfRetenido * 100) / 100,
        irpfNominas: Math.round(irpfNominas * 100) / 100,
        irpfTotal: Math.round((irpfRetenido + irpfNominas) * 100) / 100,
        ssEmpresaNominas: Math.round(ssEmpresaNominas * 100) / 100,
        ssTrabajadorNominas: Math.round(ssTrabajadorNominas * 100) / 100,
        mesesConNominas,
        baseImponibleCompras: Math.round(baseImponibleCompras * 100) / 100,
        totalCompras: Math.round(totalCompras * 100) / 100,
        baseImponibleVentas: Math.round(baseImponibleVentas * 100) / 100,
        totalVentas: Math.round(totalVentas * 100) / 100,
      },
      ventas: {
        totalFacturado: Math.round(totalVentas * 100) / 100,
        totalCobrado: Math.round(totalCobrado * 100) / 100,
        pendienteCobro: Math.round(pendienteCobro * 100) / 100,
        numFacturas: facturasISP.length,
        porEstado: facturasEmitidasPorEstado,
      },
      flujo: {
        ingresos: Math.round(ingresos * 100) / 100,
        gastos: Math.round(totalSalidas * 100) / 100,
        salidas: Math.round(totalSalidas * 100) / 100,
        neto: Math.round((ingresos - totalSalidas) * 100) / 100,
        porMes,
        desgloseSalidas: {
          gastosOperativos: Math.round(salidasGastosOp * 100) / 100,
          mayoristas: Math.round(salidasMayoristas * 100) / 100,
          nominas: Math.round(salidasNominas * 100) / 100,
          impuestos: Math.round(salidasImpuestos * 100) / 100,
          devoluciones: Math.round(salidasDevoluciones * 100) / 100,
          transferenciasInternas: Math.round(salidasTransferencias * 100) / 100,
          otros: Math.round(salidasOtros * 100) / 100,
        },
      },
      categorias: porCategoria,
      gastosPorTipo,
      conciliacion: {
        totalMovimientos,
        conciliados,
        pendientes: totalMovimientos - conciliados,
        sinCategorizar,
        porcentajeConciliado: totalMovimientos > 0 ? Math.round((conciliados / totalMovimientos) * 100) : 0,
      },
      alertas: {
        facturasPendientes,
        facturasImpagadas,
        facturasVencidas,
        movimientosSinCategorizar: sinCategorizar,
      },
    });
  } catch (error: any) {
    console.error('Error en dashboard financiero:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
