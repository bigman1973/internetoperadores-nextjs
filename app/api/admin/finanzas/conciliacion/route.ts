import { prisma } from '@/lib/prisma';
import { facturaEconomicaWhere } from '@/lib/finanzas/invoice-economic-filter';
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth';
export const dynamic='force-dynamic';
/** Ninguna heurística heredada puede confirmar vínculos ni cobros. Sólo B4 admite confirmación humana. */
export async function POST(){
 const access=await requireB4FinanceAccess('escritura');
 if('response' in access)return access.response;
 return privateJson({error:'Conciliación automática desactivada. Revise las propuestas y confirme explícitamente en Conciliación bancaria.',codigo:'CONFIRMACION_HUMANA_B4_REQUERIDA'},409);
}

// GET - Estado de conciliación
export async function GET() {
  try {
    const access=await requireB4FinanceAccess('lectura');
    if('response' in access)return access.response;
    const totalMovimientos = await prisma.movimientoBancario.count();
    const conciliados = await prisma.movimientoBancario.count({ where: { conciliado: true } });
    const sinCategorizar = await prisma.movimientoBancario.count({ where: { categoria: null } });
    const sinConciliar = totalMovimientos - conciliados;

    // Facturas emitidas pendientes de cobro
    const facturasEmitidas = await prisma.facturaEmitida.aggregate({
      _sum: { total: true, importeCobrado: true },
      _count: true,
    });
    const pendienteCobro = (facturasEmitidas._sum.total || 0) - (facturasEmitidas._sum.importeCobrado || 0);

    // Facturas recibidas sin conciliar
    const facturasRecibidasSinConciliar = await prisma.facturaRecibida.count({
      where: { ...facturaEconomicaWhere, movimientos: { none: {} }, total: { gt: 0 } },
    });

    // Conteos especiales para KPIs
    const pendienteFacturaCount = await prisma.movimientoBancario.count({ where: { pendienteFactura: true } });
    const pendienteFacturaImporte = await prisma.movimientoBancario.aggregate({ where: { pendienteFactura: true }, _sum: { importe: true } });
    const pagosVolaCount = await prisma.movimientoBancario.count({ where: { pagoACuentaVola: true } });
    const entregasACuentaCount = await prisma.movimientoBancario.count({ where: { entregaACuentaEmpleadoId: { not: null } } });
    const sinDocumentoCount = await prisma.movimientoBancario.count({ where: { tipoDocumento: 'factura', documentoRecibido: false } });
    const sinDocumentoImporte = await prisma.movimientoBancario.aggregate({ where: { tipoDocumento: 'factura', documentoRecibido: false }, _sum: { importe: true } });

    // KPI: Facturas pendientes de validar (PENDIENTE_REVISION)
    // Solo cuenta facturas que tienen movimientos con tipo doc factura o ticket (documento físico)
    const facturasPendientesValidar = await prisma.facturaRecibida.aggregate({
      where: { 
        ...facturaEconomicaWhere,
        estado: 'PENDIENTE_REVISION',
        movimientos: { some: { tipoDocumento: { in: ['factura', 'ticket'] } } }
      },
      _sum: { base: true, importeIva: true, total: true },
      _count: true,
    });
    // También contar las que no tienen movimiento vinculado (facturas subidas manualmente)
    const facturasSinVincularPendientes = await prisma.facturaRecibida.aggregate({
      where: { 
        ...facturaEconomicaWhere,
        estado: 'PENDIENTE_REVISION',
        movimientos: { none: {} }
      },
      _sum: { base: true, importeIva: true, total: true },
      _count: true,
    });

    // Importes de pagos Vola y entregas a cuenta
    const pagosVolaImporte = await prisma.movimientoBancario.aggregate({ where: { pagoACuentaVola: true }, _sum: { importe: true } });
    const entregasACuentaImporte = await prisma.movimientoBancario.aggregate({ where: { entregaACuentaEmpleadoId: { not: null } }, _sum: { importe: true } });

    // KPIs de niveles de conciliación
    const conProveedorIdentificado = await prisma.movimientoBancario.count({ where: { entidadFiscalId: { not: null } } });
    const conFacturaVinculada = await prisma.movimientoBancario.count({ where: { facturaId: { not: null } } });
    const conFacturaEmitidaVinculada = await prisma.movimientoBancario.count({ where: { facturaEmitidaId: { not: null } } });
    const sinProveedorGastos = await prisma.movimientoBancario.count({ where: { entidadFiscalId: null, importe: { lt: 0 }, categoria: { notIn: ['Traspaso', 'Sueldos y Salarios', 'IMPUESTOS'] } } });

    // KPIs de nóminas
    const nominasConciliadas = await prisma.movimientoBancario.count({ where: { tipoDocumento: 'nomina', conciliado: true } });
    const nominasPendientes = await prisma.movimientoBancario.count({ where: { tipoDocumento: 'nomina', conciliado: false } });
    const nominasTotal = await prisma.movimientoBancario.count({ where: { tipoDocumento: 'nomina' } });
    const nominasImporte = await prisma.movimientoBancario.aggregate({ where: { tipoDocumento: 'nomina' }, _sum: { importe: true } });

    // KPIs de traspasos
    const traspasosTotal = await prisma.movimientoBancario.count({ where: { tipoDocumento: 'traspaso' } });
    const traspasosConContrapartida = await prisma.movimientoBancario.count({ where: { tipoDocumento: 'traspaso', traspasoRelacionadoId: { not: null } } });
    const traspasosPendientes = await prisma.movimientoBancario.count({ where: { tipoDocumento: 'traspaso', traspasoRelacionadoId: null } });
    const traspasosImporte = await prisma.movimientoBancario.aggregate({ where: { tipoDocumento: 'traspaso', importe: { lt: 0 } }, _sum: { importe: true } });

    // Distribución por categoría
    const porCategoria = await prisma.movimientoBancario.groupBy({
      by: ['categoria'],
      _sum: { importe: true },
      _count: true,
      orderBy: { _sum: { importe: 'asc' } },
    });

    // Distribución por banco
    const porBanco = await prisma.movimientoBancario.groupBy({
      by: ['cuentaId'],
      _count: true,
      where: { conciliado: false },
    });

    return privateJson({
      modelo: 'LEGACY_SOLO_HISTORICO',
      totalMovimientos,
      conciliados,
      sinConciliar,
      sinCategorizar,
      porcentajeConciliado: totalMovimientos > 0 ? Math.round((conciliados / totalMovimientos) * 100) : 0,
      // Niveles de conciliación
      conProveedorIdentificado,
      conFacturaVinculada,
      conFacturaEmitidaVinculada,
      sinProveedorGastos,
      pendienteFacturaCount,
      pendienteFacturaImporte: Math.abs(pendienteFacturaImporte._sum.importe || 0),
      sinDocumentoCount,
      sinDocumentoImporte: Math.abs(sinDocumentoImporte._sum.importe || 0),
      facturasPendientesValidar: {
        count: facturasPendientesValidar._count + facturasSinVincularPendientes._count,
        base: (facturasPendientesValidar._sum.base || 0) + (facturasSinVincularPendientes._sum.base || 0),
        iva: (facturasPendientesValidar._sum.importeIva || 0) + (facturasSinVincularPendientes._sum.importeIva || 0),
        total: (facturasPendientesValidar._sum.total || 0) + (facturasSinVincularPendientes._sum.total || 0),
      },
      pagosVolaCount,
      pagosVolaImporte: Math.abs(pagosVolaImporte._sum.importe || 0),
      entregasACuentaCount,
      entregasACuentaImporte: Math.abs(entregasACuentaImporte._sum.importe || 0),
      facturasEmitidas: {
        total: facturasEmitidas._count,
        facturado: facturasEmitidas._sum.total || 0,
        cobrado: facturasEmitidas._sum.importeCobrado || 0,
        pendienteCobro,
      },
      facturasRecibidasSinConciliar,
      nominasTotal,
      nominasConciliadas,
      nominasPendientes,
      nominasImporte: Math.abs(nominasImporte._sum.importe || 0),
      traspasosTotal,
      traspasosConContrapartida,
      traspasosPendientes,
      traspasosImporte: Math.abs(traspasosImporte._sum.importe || 0),
      porCategoria,
      porBanco,
    });
  } catch (error: any) {
    return privateJson({ error: 'No se pudo consultar la vista histórica.' }, 500);
  }
}
