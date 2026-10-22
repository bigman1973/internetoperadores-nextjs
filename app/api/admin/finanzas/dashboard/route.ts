import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkAdminAreaRead } from '@/lib/api-admin-area-read';
import { facturaEconomicaWhere } from '@/lib/finanzas/invoice-economic-filter';
import {assertFinanceStagingIsolated} from '@/lib/finanzas/staging-safety';
import {readBankInvoicingPopulation} from '@/lib/finanzas/bank-invoicing-db';
import {summarizeBankInvoicing} from '@/lib/finanzas/bank-invoicing-core';
import {readContadoresPendientesB5} from '@/lib/finanzas/pending-db';
export const dynamic='force-dynamic';
const privateHeaders={'Cache-Control':'private, no-store'};

export async function GET(req: NextRequest) {
  try {
    const denied = await checkAdminAreaRead('admin.finanzas', ['CONTABILIDAD']);
    if (denied) {denied.headers.set('Cache-Control','private, no-store');return denied;}
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
    if(!Number.isInteger(year)||year<2000||year>2200)return NextResponse.json({error:'Año inválido.'},{status:400,headers:privateHeaders});
    const trimestre = searchParams.get('trimestre');
    if(trimestre&&!/^[1-4]$/.test(trimestre))return NextResponse.json({error:'Trimestre inválido.'},{status:400,headers:privateHeaders}); // 1, 2, 3, 4 o null para todo el año

    // Calcular rango de fechas
    let desde: Date, hasta: Date;
    if (trimestre) {
      const t = parseInt(trimestre);
      desde = new Date(Date.UTC(year, (t - 1) * 3, 1));
      hasta = new Date(Date.UTC(year, t * 3, 1)-1);
    } else {
      desde = new Date(Date.UTC(year, 0, 1));
      hasta = new Date(Date.UTC(year+1, 0, 1)-1);
    }

    const mesesNominas = trimestre
      ? Array.from({ length: 3 }, (_, i) => (parseInt(trimestre) - 1) * 3 + i + 1)
      : Array.from({ length: 12 }, (_, i) => i + 1);

    // Lecturas independientes; los cálculos y criterios contables permanecen idénticos.
    await assertFinanceStagingIsolated();
    const [cuentas, facturasRecibidas, facturasISP, movimientos, facturasPendientes, nominasPeriodo, bankPopulation] = await prisma.$transaction(async tx=>Promise.all([
      tx.cuentaBancaria.findMany({
        where: { activa: true }, orderBy: { banco: 'asc' },
        select: { id: true, banco: true, alias: true, saldoActual: true, fechaSaldo: true },
      }),
      tx.facturaRecibida.findMany({
        where: { ...facturaEconomicaWhere, fecha: { gte: desde, lte: hasta }, estado: { not: 'RECHAZADA' }, deducibleIva: true },
        select: { importeIva: true, base: true, importeIrpf: true, total: true },
      }),
      tx.facturaEmitida.findMany({
        where: { fecha: { gte: desde, lte: hasta } },
        select: { total: true, importeIva: true, base: true },
      }),
      tx.movimientoBancario.findMany({
        where: { fechaOperacion: { gte: desde, lte: hasta } },
        select: { importe: true, categoria: true, concepto: true, fechaOperacion: true, estadoJustificacionB4:{select:{estado:true}}, tipoPago: true, pagoACuentaVola: true },
      }),
      tx.facturaRecibida.count({ where: { ...facturaEconomicaWhere, estado: 'PENDIENTE_REVISION' } }),
      tx.nomina.findMany({
        where: { anio: year, mes: { in: mesesNominas } },
        select: { irpf: true, ssEmpresa: true, ssTrabajador: true, mes: true },
      }),
      readBankInvoicingPopulation(tx,{enabled:true,assertIsolatedStaging:async()=>{}}),
    ]),{isolationLevel:'RepeatableRead',maxWait:10000,timeout:60000});

    const ivaSoportado = facturasRecibidas.reduce((sum, f) => sum + f.importeIva, 0);
    const baseImponibleCompras = facturasRecibidas.reduce((sum, f) => sum + f.base, 0);
    const irpfRetenido = facturasRecibidas.reduce((sum, f) => sum + f.importeIrpf, 0);
    const totalCompras = facturasRecibidas.reduce((sum, f) => sum + f.total, 0);

    // Facturas emitidas - tabla 'facturas' (ISPGestión).
    const totalVentas = facturasISP.reduce((sum, f) => sum + Number(f.total), 0);
    const totalImpuestoVentas = facturasISP.reduce((sum, f) => sum + Number(f.importeIva), 0);
    const baseImponibleVentas = facturasISP.reduce((sum, f) => sum + Number(f.base), 0);
    const ivaRepercutido = totalImpuestoVentas;
    const bankInvoices=bankPopulation.invoices.filter(f=>f.fechaISO!==null&&f.fechaISO>=desde.toISOString().slice(0,10)&&f.fechaISO<=hasta.toISOString().slice(0,10));
    const bankSummary=summarizeBankInvoicing(bankInvoices,null);
    const totalCobrado=bankSummary.cobroDocumentalConfirmado.cents===null?null:bankSummary.cobroDocumentalConfirmado.cents/100;
    const pendienteCobro=bankSummary.pendienteNoConfirmado.cents===null?null:bankSummary.pendienteNoConfirmado.cents/100;
    const facturasEmitidasPorEstado: Record<string,{count:number;total:number|null}>={};
    for(const f of bankInvoices){const group=facturasEmitidasPorEstado[f.paymentState]??{count:0,total:0};group.count++;group.total=group.total===null||f.targetCents===null?null:group.total+f.targetCents/100;facturasEmitidasPorEstado[f.paymentState]=group;}

    // Movimientos por categoría.
    const ingresos = movimientos.filter(m => m.importe > 0).reduce((sum, m) => sum + m.importe, 0);
    const totalSalidas = movimientos.filter(m => m.importe < 0).reduce((sum, m) => sum + Math.abs(m.importe), 0);

    // Desglose de salidas por tipo
    const categoriasNominas = ['Sueldos y Salarios'];
    const categoriasImpuestos = ['IMPUESTOS','Impuestos'];
    const categoriasTransferencias = ['Traspaso'];
    const categoriasDevoluciones = ['Morosos'];
    const categoriasVola = ['Vola'];
    const categoriasGastosOp = ['Estructura', 'Gastos Financieros', 'Oros Gastos', 'Otros Gastos', 'Proyectos Singulares', 'Dietas', 'Desplazamientos', 'Operadora', 'Comisiones V-Valley'];

    const movSalidas = movimientos.filter(m => m.importe < 0);
    const movNominas = movSalidas.filter(m => categoriasNominas.includes(m.categoria || ''));
    const salidasNominas = movNominas.reduce((s, m) => s + Math.abs(m.importe), 0);
    // Sub-desglose nóminas: Cotizaciones SS vs Transferencias Nóminas
    const salidasCotizacionesSS = movNominas.filter(m => /tgss|cotizacion|autonomos|aplazam/i.test(m.concepto)).reduce((s, m) => s + Math.abs(m.importe), 0);
    const salidasTransfNominas = salidasNominas - salidasCotizacionesSS;
    const salidasImpuestos = movSalidas.filter(m => categoriasImpuestos.includes(m.categoria || '')).reduce((s, m) => s + Math.abs(m.importe), 0);
    const salidasTransferencias = movSalidas.filter(m => categoriasTransferencias.includes(m.categoria || '')).reduce((s, m) => s + Math.abs(m.importe), 0);
    const salidasDevoluciones = movSalidas.filter(m => categoriasDevoluciones.includes(m.categoria || '')).reduce((s, m) => s + Math.abs(m.importe), 0);
    const salidasVola = movSalidas.filter(m => categoriasVola.includes(m.categoria || '') || m.pagoACuentaVola).reduce((s, m) => s + Math.abs(m.importe), 0);
    const salidasGastosOp = movSalidas.filter(m => categoriasGastosOp.includes(m.categoria || '')).reduce((s, m) => s + Math.abs(m.importe), 0);
    const salidasOtros = totalSalidas - salidasVola - salidasNominas - salidasImpuestos - salidasTransferencias - salidasDevoluciones - salidasGastosOp;

    // Agrupar por categoría (para tabla detallada)
    // Separamos "Sueldos y Salarios" e "IMPUESTOS" en subcategorías virtuales
    const porCategoria: Record<string, { ingresos: number; gastos: number; count: number }> = {};
    for (const mov of movimientos) {
      let cat = mov.categoria || 'Sin categorizar';
      // Separar Sueldos y Salarios en subcategorías
      if (cat === 'Sueldos y Salarios' && mov.importe < 0) {
        if (/tgss|cotizacion|autonomos|aplazam/i.test(mov.concepto)) {
          cat = 'Cotizaciones SS';
        } else {
          cat = 'Transferencias Nóminas';
        }
      }
      // Separar IMPUESTOS en subcategorías
      if ((cat === 'IMPUESTOS'||cat==='Impuestos') && mov.importe < 0) {
        if (/ret.*ingreso a cuenta|ret.*cta/i.test(mov.concepto)) {
          cat = 'Retenciones';
        } else if (/sociedades.*pago.*cta|imp.*sociedades/i.test(mov.concepto)) {
          cat = 'Sociedades Pago a Cuenta';
        } else {
          cat = 'Aplazamientos AEAT';
        }
      }
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

    const counterB5=await readContadoresPendientesB5({desde,hasta,cobertura:'TODAS'});
    const amountJustified=counterB5.contadores.reduce((sum,c)=>sum+BigInt(c.importeJustificadoCentimos),BigInt(0));
    const amountEvaluable=counterB5.contadores.reduce((sum,c)=>sum+BigInt(c.importeEvaluableCentimos),BigInt(0));
    const percentageBps=amountEvaluable===BigInt(0)||counterB5.contadores.some(c=>c.movimientosImporteNoExacto>0)?null:Number((amountJustified*BigInt(10000))/amountEvaluable);
    // 6. Estadísticas de conciliación
    const totalMovimientos = movimientos.length;
    const conciliados = movimientos.filter(m => m.estadoJustificacionB4?.estado==='JUSTIFICADO').length;
    const pendientesB4=movimientos.filter(m=>!m.estadoJustificacionB4||m.estadoJustificacionB4.estado==='SIN_DOCUMENTO').length;
    const sinCategorizar = movimientos.filter(m => !m.categoria).length;

    // Alertas.
    const facturasImpagadas = bankInvoices.filter(f=>f.paymentState!=='COBRADA_CALCULADA').length;
    const facturasVencidas = bankInvoices.filter(f=>f.remainingCents!==null&&f.remainingCents!==0&&f.fechaVencimientoISO!==null&&f.fechaVencimientoISO<new Date().toISOString().slice(0,10)).length; // La tabla facturas de ISPGestión no tiene fecha_vencimiento

    // 8. Top gastos por categoría (para el gráfico de tarjeta/restaurantes/etc.)
    const gastosPorTipo: Record<string, number> = {};
    for (const mov of movimientos.filter(m => m.importe < 0)) {
      const tipo = mov.tipoPago || 'Otros';
      gastosPorTipo[tipo] = (gastosPorTipo[tipo] || 0) + Math.abs(mov.importe);
    }

    // IRPF Nóminas - calcular retenciones de las nóminas del periodo.
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
        totalFacturado: bankSummary.facturado.cents===null?null:bankSummary.facturado.cents/100,
        totalCobrado,
        pendienteCobro,
        numFacturas: bankInvoices.length,
        porEstado: facturasEmitidasPorEstado,
        source:bankPopulation.calculationBasis, bankCoverage:bankPopulation.bankCoverage, summaryExacta:bankSummary,
      },
      flujo: {
        ingresos: Math.round(ingresos * 100) / 100,
        gastos: Math.round(totalSalidas * 100) / 100,
        salidas: Math.round(totalSalidas * 100) / 100,
        neto: Math.round((ingresos - totalSalidas) * 100) / 100,
        porMes,
        desgloseSalidas: {
          gastosOperativos: Math.round(salidasGastosOp * 100) / 100,
          vola: Math.round(salidasVola * 100) / 100,
          nominas: Math.round(salidasNominas * 100) / 100,
          cotizacionesSS: Math.round(salidasCotizacionesSS * 100) / 100,
          transfNominas: Math.round(salidasTransfNominas * 100) / 100,
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
        pendientes: pendientesB4,
        sinCategorizar,
        porcentajeConciliado: percentageBps===null?null:percentageBps/100,
        importeJustificadoCentimos:amountJustified.toString(),importeEvaluableCentimos:amountEvaluable.toString(), criterioPorcentaje:"Importe con documento B4; excluye traspasos explícitos",
      },
      alertas: {
        facturasPendientes,
        facturasImpagadas,
        facturasVencidas,
        movimientosSinCategorizar: sinCategorizar,
      },
      cuentaCorrienteVola: {
        pagosACuenta: Math.round(salidasVola * 100) / 100,
        numMovimientos: movSalidas.filter(m => categoriasVola.includes(m.categoria || '') || m.pagoACuentaVola).length,
      },
    },{headers:privateHeaders});
  } catch (error: any) {
    console.error('Dashboard financiero no completado.');
    return NextResponse.json({ error: 'No se pudo cargar el dashboard financiero' }, { status: 500,headers:privateHeaders });
  }
}
