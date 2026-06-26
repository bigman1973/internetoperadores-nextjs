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

    // 2. IVA Soportado (facturas recibidas)
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

    // 3. Movimientos por categoría
    const movimientos = await prisma.movimientoBancario.findMany({
      where: {
        fechaOperacion: { gte: desde, lte: hasta },
      },
    });

    const ingresos = movimientos.filter(m => m.importe > 0).reduce((sum, m) => sum + m.importe, 0);
    const gastos = movimientos.filter(m => m.importe < 0).reduce((sum, m) => sum + Math.abs(m.importe), 0);

    // Agrupar por categoría
    const porCategoria: Record<string, { ingresos: number; gastos: number; count: number }> = {};
    for (const mov of movimientos) {
      const cat = mov.categoria || 'Sin categorizar';
      if (!porCategoria[cat]) porCategoria[cat] = { ingresos: 0, gastos: 0, count: 0 };
      if (mov.importe > 0) porCategoria[cat].ingresos += mov.importe;
      else porCategoria[cat].gastos += Math.abs(mov.importe);
      porCategoria[cat].count++;
    }

    // 4. Movimientos por mes
    const porMes: Record<string, { ingresos: number; gastos: number }> = {};
    for (const mov of movimientos) {
      const mes = `${mov.fechaOperacion.getFullYear()}-${String(mov.fechaOperacion.getMonth() + 1).padStart(2, '0')}`;
      if (!porMes[mes]) porMes[mes] = { ingresos: 0, gastos: 0 };
      if (mov.importe > 0) porMes[mes].ingresos += mov.importe;
      else porMes[mes].gastos += Math.abs(mov.importe);
    }

    // 5. Estadísticas de conciliación
    const totalMovimientos = movimientos.length;
    const conciliados = movimientos.filter(m => m.conciliado).length;
    const sinCategorizar = movimientos.filter(m => !m.categoria).length;

    // 6. Facturas pendientes de revisión
    const facturasPendientes = await prisma.facturaRecibida.count({
      where: { estado: 'PENDIENTE_REVISION' },
    });

    // 7. Previsión de liquidación IVA trimestral
    // IVA a pagar = IVA Repercutido - IVA Soportado
    // (IVA repercutido vendrá de ISP Gestión, por ahora estimamos con ingresos)
    const ivaRepercutidoEstimado = ingresos * 0.21 / 1.21; // Estimación si los ingresos incluyen IVA

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
        ivaRepercutidoEstimado: Math.round(ivaRepercutidoEstimado * 100) / 100,
        ivaAPagar: Math.round((ivaRepercutidoEstimado - ivaSoportado) * 100) / 100,
        irpfRetenido: Math.round(irpfRetenido * 100) / 100,
        baseImponibleCompras: Math.round(baseImponibleCompras * 100) / 100,
        totalCompras: Math.round(totalCompras * 100) / 100,
      },
      flujo: {
        ingresos: Math.round(ingresos * 100) / 100,
        gastos: Math.round(gastos * 100) / 100,
        neto: Math.round((ingresos - gastos) * 100) / 100,
        porMes,
      },
      categorias: porCategoria,
      conciliacion: {
        totalMovimientos,
        conciliados,
        pendientes: totalMovimientos - conciliados,
        sinCategorizar,
        porcentajeConciliado: totalMovimientos > 0 ? Math.round((conciliados / totalMovimientos) * 100) : 0,
      },
      alertas: {
        facturasPendientes,
        movimientosSinCategorizar: sinCategorizar,
      },
    });
  } catch (error: any) {
    console.error('Error en dashboard financiero:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
