import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * API de Conciliación de Remesas
 * 
 * ENFOQUE: Conciliación mensual agregada
 * - Una remesa ISP se cobra en MÚLTIPLES movimientos bancarios (cobros parciales)
 * - El banco descuenta devoluciones, por lo que cobra menos que el total remesado
 * - Hay 2 cuentas: Santander (principal) y Caixa Guissona (Pallars, hasta marzo 2026)
 * - Los movimientos se identifican por:
 *   - Santander: "Emision Remesa Sepa Sdd"
 *   - Caixa Guissona: "ABONAMENT REMESA REBUTS"
 * 
 * GET - Dashboard: KPIs, resumen mensual, remesas con cobro agregado, devoluciones
 * POST - Ejecutar conciliación automática
 */

// IDs de cuentas bancarias
const CUENTA_SANTANDER = '50910c7d-76f3-493e-8aed-962f22fc1413';
const CUENTA_CAIXA_GUISSONA = '7664fe6c-9dd0-4099-9275-bbe8b4fde301';

// GET - Dashboard de conciliación de remesas
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
    const mes = searchParams.get('mes') ? parseInt(searchParams.get('mes')!) : null;

    // 1. Remesas del periodo
    const whereRemesas: any = { ejercicio: year };
    if (mes) {
      const desde = new Date(year, mes - 1, 1);
      const hasta = new Date(year, mes, 0, 23, 59, 59);
      whereRemesas.fecha = { gte: desde, lte: hasta };
    }

    const remesas = await prisma.remesa.findMany({
      where: whereRemesas,
      include: {
        conciliacion: true,
        devoluciones: true,
      },
      orderBy: { fecha: 'desc' },
    });

    // 2. Devoluciones del periodo
    const whereDevoluciones: any = { anioDevolucion: year };
    if (mes) {
      whereDevoluciones.mesDevolucion = mes;
    }

    const devoluciones = await prisma.devolucionRemesa.findMany({
      where: whereDevoluciones,
      include: {
        remesa: { select: { nombre: true, fecha: true } },
        factura: { select: { nombreCompleto: true, total: true, situacion: true } },
      },
      orderBy: { fechaDevolucion: 'desc' },
    });

    // 3. Obtener TODOS los movimientos de remesa del banco (Santander + Caixa Guissona) del periodo
    const fechaInicio = new Date(year, mes ? mes - 1 : 0, 1);
    const fechaFin = new Date(year, mes ? mes : 12, 0, 23, 59, 59);

    const movimientosRemesaBanco = await prisma.movimientoBancario.findMany({
      where: {
        OR: [
          { concepto: { contains: 'Emision Remesa Sepa', mode: 'insensitive' }, cuentaId: CUENTA_SANTANDER },
          { concepto: { contains: 'REMESA REBUTS', mode: 'insensitive' }, cuentaId: CUENTA_CAIXA_GUISSONA },
        ],
        importe: { gt: 0 },
        fechaOperacion: { gte: fechaInicio, lte: fechaFin },
      },
      orderBy: { fechaOperacion: 'asc' },
    });

    // 4. Agrupar movimientos banco por mes
    const cobroBancoPorMes: Record<string, { santander: number; caixaGuissona: number; total: number; numMovimientos: number }> = {};
    for (const mov of movimientosRemesaBanco) {
      const mesKey = `${mov.fechaOperacion.getFullYear()}-${String(mov.fechaOperacion.getMonth() + 1).padStart(2, '0')}`;
      if (!cobroBancoPorMes[mesKey]) {
        cobroBancoPorMes[mesKey] = { santander: 0, caixaGuissona: 0, total: 0, numMovimientos: 0 };
      }
      if (mov.cuentaId === CUENTA_SANTANDER) {
        cobroBancoPorMes[mesKey].santander += mov.importe;
      } else if (mov.cuentaId === CUENTA_CAIXA_GUISSONA) {
        cobroBancoPorMes[mesKey].caixaGuissona += mov.importe;
      }
      cobroBancoPorMes[mesKey].total += mov.importe;
      cobroBancoPorMes[mesKey].numMovimientos++;
    }

    // 5. KPIs
    const totalRemesado = remesas.reduce((sum, r) => sum + Number(r.totalImporte), 0);
    const totalCobradoBanco = Object.values(cobroBancoPorMes).reduce((sum, m) => sum + m.total, 0);
    const totalDevuelto = devoluciones.reduce((sum, d) => sum + Number(d.importe), 0);
    const devolucionesPendientes = devoluciones.filter(d => d.estado === 'PENDIENTE');
    const devolucionesCobradas = devoluciones.filter(d => 
      d.estado === 'COBRADO_TRANSFERENCIA' || d.estado === 'COBRADO_PARCIAL'
    );
    const totalRecuperado = devolucionesCobradas.reduce((sum, d) => sum + Number(d.importeCobrado || d.importe), 0);

    // 6. Formatear remesas con cobro banco agregado del mes
    const remesasFormateadas = remesas.map(r => {
      const mesRemesa = `${new Date(r.fecha).getFullYear()}-${String(new Date(r.fecha).getMonth() + 1).padStart(2, '0')}`;
      const cobroMes = cobroBancoPorMes[mesRemesa];
      
      // Calcular la proporción de esta remesa sobre el total del mes
      // para asignar proporcionalmente el cobro del banco
      const remesasDelMismoMes = remesas.filter(rem => {
        const mesRem = `${new Date(rem.fecha).getFullYear()}-${String(new Date(rem.fecha).getMonth() + 1).padStart(2, '0')}`;
        return mesRem === mesRemesa;
      });
      const totalRemesadoMes = remesasDelMismoMes.reduce((sum, rem) => sum + Number(rem.totalImporte), 0);
      const proporcion = totalRemesadoMes > 0 ? Number(r.totalImporte) / totalRemesadoMes : 0;
      const cobroProporcional = cobroMes ? cobroMes.total * proporcion : null;
      const diferenciaProporcional = cobroProporcional !== null ? cobroProporcional - Number(r.totalImporte) : null;

      // Estado basado en si hay datos del banco para ese mes
      let estadoConciliacion = 'PENDIENTE';
      if (cobroMes && cobroMes.total > 0) {
        const diffPorcentaje = Math.abs((cobroMes.total - totalRemesadoMes) / totalRemesadoMes);
        if (diffPorcentaje < 0.02) {
          estadoConciliacion = 'CONCILIADA';
        } else {
          estadoConciliacion = 'DIFERENCIA';
        }
      }

      return {
        id: r.id,
        ispGestionId: r.ispGestionId,
        nombre: r.nombre,
        fecha: r.fecha,
        totalImporte: Number(r.totalImporte),
        numeroRegistros: r.numeroRegistros,
        remesado: r.remesado,
        contabilizado: r.contabilizado,
        // Conciliación mensual agregada
        estadoConciliacion,
        importeBanco: cobroProporcional,
        diferencia: diferenciaProporcional,
        // Info del mes completo
        totalRemesadoMes,
        totalCobradoMes: cobroMes?.total || 0,
        diferenciaMes: cobroMes ? cobroMes.total - totalRemesadoMes : null,
        numMovimientosBanco: cobroMes?.numMovimientos || 0,
        cobroSantander: cobroMes?.santander || 0,
        cobroCaixaGuissona: cobroMes?.caixaGuissona || 0,
        // Devoluciones asociadas
        numDevoluciones: r.devoluciones.length,
        totalDevoluciones: r.devoluciones.reduce((sum, d) => sum + Number(d.importe), 0),
      };
    });

    // 7. Resumen mensual
    const resumenMensual = Object.entries(cobroBancoPorMes).map(([mesKey, cobro]) => {
      const remesasMes = remesas.filter(r => {
        const mesRem = `${new Date(r.fecha).getFullYear()}-${String(new Date(r.fecha).getMonth() + 1).padStart(2, '0')}`;
        return mesRem === mesKey;
      });
      const totalRemesadoMes = remesasMes.reduce((sum, r) => sum + Number(r.totalImporte), 0);
      const devolucionesMes = devoluciones.filter(d => {
        const [anio, m] = mesKey.split('-');
        return d.anioDevolucion === parseInt(anio) && d.mesDevolucion === parseInt(m);
      });
      const totalDevueltoMes = devolucionesMes.reduce((sum, d) => sum + Number(d.importe), 0);

      return {
        mes: mesKey,
        totalRemesado: totalRemesadoMes,
        totalCobradoBanco: cobro.total,
        santander: cobro.santander,
        caixaGuissona: cobro.caixaGuissona,
        diferencia: cobro.total - totalRemesadoMes,
        numMovimientos: cobro.numMovimientos,
        totalDevuelto: totalDevueltoMes,
        numDevoluciones: devolucionesMes.length,
      };
    }).sort((a, b) => b.mes.localeCompare(a.mes));

    return NextResponse.json({
      kpis: {
        totalRemesado,
        totalCobradoBanco,
        diferenciaNeta: totalCobradoBanco - totalRemesado,
        totalDevuelto,
        totalRecuperado,
        pendienteRecuperar: totalDevuelto - totalRecuperado,
        numRemesas: remesas.length,
        numDevoluciones: devoluciones.length,
        numDevolucionesPendientes: devolucionesPendientes.length,
      },
      resumenMensual,
      remesas: remesasFormateadas,
      devoluciones: devoluciones.map(d => ({
        id: d.id,
        numeroFactura: d.numeroFactura,
        referenciaRemesa: d.referenciaRemesa,
        nombreCliente: d.nombreCliente,
        importe: Number(d.importe),
        motivo: d.motivo,
        fechaDevolucion: d.fechaDevolucion,
        estado: d.estado,
        importeCobrado: d.importeCobrado ? Number(d.importeCobrado) : null,
        fechaCobro: d.fechaCobro,
        remesaNombre: d.remesa?.nombre,
        facturaSituacion: d.factura?.situacion,
        archivoOrigen: d.archivoOrigen,
      })),
    });
  } catch (error: any) {
    console.error('Error en conciliación remesas GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Ejecutar proceso de conciliación automática
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accion = 'conciliar', year = new Date().getFullYear(), mes } = body;

    const resultados = {
      remesasConciliadas: 0,
      remesasConDiferencia: 0,
      devolucionesDetectadasBanco: 0,
      pagosPosterioresDetectados: 0,
      errores: [] as string[],
    };

    // ===== ACCIÓN 1: CONCILIAR REMESAS (asignar movimiento principal) =====
    if (accion === 'conciliar' || accion === 'todo') {
      const whereRemesas: any = { ejercicio: year };
      if (mes) {
        const desde = new Date(year, mes - 1, 1);
        const hasta = new Date(year, mes, 0, 23, 59, 59);
        whereRemesas.fecha = { gte: desde, lte: hasta };
      }

      // Remesas sin conciliar
      const remesasSinConciliar = await prisma.remesa.findMany({
        where: {
          ...whereRemesas,
          conciliacion: null,
        },
      });

      // Movimientos bancarios de remesa (Santander + Caixa Guissona) sin conciliar
      const movimientosRemesa = await prisma.movimientoBancario.findMany({
        where: {
          OR: [
            { concepto: { contains: 'Emision Remesa Sepa', mode: 'insensitive' }, cuentaId: CUENTA_SANTANDER },
            { concepto: { contains: 'REMESA REBUTS', mode: 'insensitive' }, cuentaId: CUENTA_CAIXA_GUISSONA },
          ],
          importe: { gt: 0 },
          conciliacionRemesa: null,
          fechaOperacion: {
            gte: new Date(year, mes ? mes - 1 : 0, 1),
            lte: new Date(year, mes ? mes : 12, 0, 23, 59, 59),
          },
        },
        orderBy: [{ importe: 'desc' }],
      });

      // Estrategia: para cada remesa, buscar el movimiento banco MÁS GRANDE
      // en una ventana de ±10 días. Ese es el "cobro principal" de la remesa.
      // Los demás movimientos del mes son cobros parciales/recobros que se suman.
      const remesasOrdenadas = [...remesasSinConciliar].sort(
        (a, b) => Number(b.totalImporte) - Number(a.totalImporte)
      );

      for (const remesa of remesasOrdenadas) {
        const importeRemesa = Number(remesa.totalImporte);
        const fechaRemesa = new Date(remesa.fecha);
        const esPallars = remesa.nombre.toUpperCase().includes('PALLARS');
        const esComunidad = remesa.nombre.toUpperCase().includes('COMUNIDAD');
        const esMoviles = remesa.nombre.toUpperCase().includes('MÓVIL') || remesa.nombre.toUpperCase().includes('MOVIL');

        // Determinar en qué cuenta buscar
        // Pallars antes de abril 2026 → Caixa Guissona
        // Todo lo demás → Santander
        const usaCaixaGuissona = esPallars && fechaRemesa < new Date(2026, 3, 1); // antes de abril 2026

        // Buscar candidatos en ventana ±10 días
        const candidatos = movimientosRemesa.filter(mov => {
          const diffDias = Math.abs(
            (mov.fechaOperacion.getTime() - fechaRemesa.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diffDias > 10) return false;

          // Filtrar por cuenta si es Pallars pre-abril
          if (usaCaixaGuissona && mov.cuentaId !== CUENTA_CAIXA_GUISSONA) return false;
          if (!usaCaixaGuissona && mov.cuentaId === CUENTA_CAIXA_GUISSONA) return false;

          // El cobro principal debe ser >= 50% del importe remesa
          const ratio = mov.importe / importeRemesa;
          return ratio >= 0.50 && ratio <= 1.05;
        });

        if (candidatos.length >= 1) {
          // Tomar el de importe más cercano a la remesa
          const mejorMatch = candidatos.reduce((best, curr) => {
            const diffBest = Math.abs(best.importe - importeRemesa);
            const diffCurr = Math.abs(curr.importe - importeRemesa);
            return diffCurr < diffBest ? curr : best;
          });

          // Calcular la suma de TODOS los movimientos del mismo mes y cuenta
          const mesRemesa = fechaRemesa.getMonth();
          const anioRemesa = fechaRemesa.getFullYear();
          const movimientosMismoMes = movimientosRemesa.filter(mov => {
            const mesMov = mov.fechaOperacion.getMonth();
            const anioMov = mov.fechaOperacion.getFullYear();
            if (mesMov !== mesRemesa || anioMov !== anioRemesa) return false;
            if (usaCaixaGuissona) return mov.cuentaId === CUENTA_CAIXA_GUISSONA;
            return mov.cuentaId === CUENTA_SANTANDER;
          });
          const sumaMes = movimientosMismoMes.reduce((sum, m) => sum + m.importe, 0);

          const diferencia = mejorMatch.importe - importeRemesa;
          const estado = Math.abs(diferencia) < (importeRemesa * 0.01) ? 'CONCILIADA' : 'DIFERENCIA';

          await prisma.conciliacionRemesa.create({
            data: {
              remesaId: remesa.id,
              movimientoBancarioId: mejorMatch.id,
              importeRemesa: importeRemesa,
              importeMovimiento: mejorMatch.importe,
              diferencia: diferencia,
              estado: estado as any,
              fechaConciliacion: new Date(),
            },
          });

          await prisma.movimientoBancario.update({
            where: { id: mejorMatch.id },
            data: { conciliado: true },
          });

          const idx = movimientosRemesa.indexOf(mejorMatch);
          if (idx > -1) movimientosRemesa.splice(idx, 1);

          if (estado === 'CONCILIADA') {
            resultados.remesasConciliadas++;
          } else {
            resultados.remesasConDiferencia++;
          }
        }
      }
    }

    // ===== ACCIÓN 2: DETECTAR DEVOLUCIONES EN BANCO =====
    if (accion === 'detectar_devoluciones' || accion === 'todo') {
      // Buscar movimientos de "Devolucion De Recibo" que no estén ya registrados
      const movsDevoluciones = await prisma.movimientoBancario.findMany({
        where: {
          concepto: { contains: 'Devolucion De Recibo', mode: 'insensitive' },
          importe: { lt: 0 },
          devolucionesRemesa: { none: {} },
          fechaOperacion: {
            gte: new Date(year, mes ? mes - 1 : 0, 1),
            lte: new Date(year, mes ? mes : 12, 0, 23, 59, 59),
          },
        },
      });

      for (const mov of movsDevoluciones) {
        const importeDevolucion = Math.abs(mov.importe);
        const fechaDevolucion = new Date(mov.fechaOperacion);
        
        const mesDevolucion = fechaDevolucion.getMonth(); // 0-indexed
        const anioDevolucion = fechaDevolucion.getFullYear();
        
        // Buscar en el mes actual y el anterior
        const fechaDesde = new Date(anioDevolucion, mesDevolucion - 1, 1);
        const fechaHasta = new Date(anioDevolucion, mesDevolucion + 1, 0, 23, 59, 59);
        
        // Buscar factura con importe exacto (cualquier estado)
        const facturasMatch = await prisma.factura.findMany({
          where: {
            total: { gte: importeDevolucion - 0.02 as any, lte: importeDevolucion + 0.02 as any },
            fecha: { gte: fechaDesde, lte: fechaHasta },
          },
          orderBy: { fecha: 'desc' },
        });

        const facturaMatch = facturasMatch.length > 0 ? facturasMatch[0] : null;
        
        let nombreCliente = 'DESCONOCIDO';
        let numeroFactura = 'DESCONOCIDA';
        if (facturaMatch) {
          nombreCliente = facturaMatch.nombreCompleto || 'DESCONOCIDO';
          numeroFactura = facturaMatch.numeroDocumento || 'DESCONOCIDA';
        } else {
          // Buscar con tolerancia ±1€
          const facturasAprox = await prisma.factura.findMany({
            where: {
              total: { gte: (importeDevolucion - 1) as any, lte: (importeDevolucion + 1) as any },
              fecha: { gte: fechaDesde, lte: fechaHasta },
            },
            orderBy: { fecha: 'desc' },
            take: 5,
          });
          if (facturasAprox.length === 1) {
            nombreCliente = facturasAprox[0].nombreCompleto || 'DESCONOCIDO';
            numeroFactura = facturasAprox[0].numeroDocumento || 'DESCONOCIDA';
          } else if (facturasAprox.length > 1) {
            // Mostrar los candidatos
            nombreCliente = facturasAprox.map(f => f.nombreCompleto).filter(Boolean).slice(0, 3).join(' / ');
            numeroFactura = 'MÚLTIPLES';
          }
        }

        // Vincular a la remesa correspondiente del mes
        let remesaId: number | null = null;
        const remesaWhere: any = {
          fecha: { gte: new Date(anioDevolucion, mesDevolucion, 1), lte: new Date(anioDevolucion, mesDevolucion + 1, 0) },
        };

        if (facturaMatch?.numeroDocumento?.startsWith('CPL')) {
          const remesaPallars = await prisma.remesa.findFirst({
            where: { ...remesaWhere, nombre: { contains: 'PALLARS', mode: 'insensitive' } },
          });
          remesaId = remesaPallars?.id || null;
        } else if (facturaMatch?.numeroDocumento?.startsWith('CCM')) {
          const remesaComunidad = await prisma.remesa.findFirst({
            where: { ...remesaWhere, nombre: { contains: 'COMUNIDAD', mode: 'insensitive' } },
          });
          remesaId = remesaComunidad?.id || null;
        } else if (facturaMatch?.numeroDocumento?.startsWith('CMV')) {
          const remesaMoviles = await prisma.remesa.findFirst({
            where: { ...remesaWhere, nombre: { contains: 'MÓVIL', mode: 'insensitive' } },
          });
          remesaId = remesaMoviles?.id || null;
        } else {
          // Por defecto, la remesa más grande del mes (LLEIDA)
          const remesaLleida = await prisma.remesa.findFirst({
            where: remesaWhere,
            orderBy: { totalImporte: 'desc' },
          });
          remesaId = remesaLleida?.id || null;
        }

        await prisma.devolucionRemesa.create({
          data: {
            facturaId: facturaMatch?.id || null,
            remesaId: remesaId,
            movimientoBancarioId: mov.id,
            numeroFactura: numeroFactura,
            nombreCliente: nombreCliente,
            importe: importeDevolucion,
            motivo: 'Detectada automáticamente desde banco',
            fechaDevolucion: mov.fechaOperacion,
            estado: 'PENDIENTE',
            mesDevolucion: mesDevolucion + 1,
            anioDevolucion: anioDevolucion,
            archivoOrigen: 'banco_automatico',
          },
        });

        resultados.devolucionesDetectadasBanco++;
      }
    }

    // ===== ACCIÓN 3: DETECTAR PAGOS POSTERIORES =====
    if (accion === 'detectar_pagos' || accion === 'todo') {
      const devolucionesPendientes = await prisma.devolucionRemesa.findMany({
        where: {
          estado: 'PENDIENTE',
          anioDevolucion: year,
        },
        include: {
          factura: true,
        },
      });

      for (const dev of devolucionesPendientes) {
        if (!dev.factura) continue;

        const importeDevolucion = Number(dev.importe);
        const nombreCliente = dev.factura.nombreCompleto;
        if (!nombreCliente) continue;

        // Buscar transferencias recibidas después de la devolución con importe similar
        const pagoPosterior = await prisma.movimientoBancario.findFirst({
          where: {
            importe: { gte: importeDevolucion - 0.02, lte: importeDevolucion + 0.02 },
            fechaOperacion: { gt: dev.fechaDevolucion },
            concepto: { contains: nombreCliente.split(' ')[0], mode: 'insensitive' },
            devolucionesCobro: { none: {} },
          },
          orderBy: { fechaOperacion: 'asc' },
        });

        if (pagoPosterior) {
          await prisma.devolucionRemesa.update({
            where: { id: dev.id },
            data: {
              estado: 'COBRADO_TRANSFERENCIA',
              movimientoCobroId: pagoPosterior.id,
              fechaCobro: pagoPosterior.fechaOperacion,
              importeCobrado: pagoPosterior.importe,
            },
          });
          resultados.pagosPosterioresDetectados++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      resultados,
    });
  } catch (error: any) {
    console.error('Error en conciliación remesas POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
