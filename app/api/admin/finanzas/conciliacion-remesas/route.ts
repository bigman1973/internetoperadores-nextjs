import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * API de Conciliación de Remesas
 * 
 * GET - Dashboard de conciliación: KPIs, remesas con estado, devoluciones
 * POST - Ejecutar proceso de conciliación automática
 */

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

    // 3. KPIs
    const totalRemesado = remesas.reduce((sum, r) => sum + Number(r.totalImporte), 0);
    const remesasConciliadas = remesas.filter(r => r.conciliacion?.estado === 'CONCILIADA');
    const totalConciliado = remesasConciliadas.reduce((sum, r) => sum + Number(r.totalImporte), 0);
    const totalDevuelto = devoluciones.reduce((sum, d) => sum + Number(d.importe), 0);
    const devolucionesPendientes = devoluciones.filter(d => d.estado === 'PENDIENTE');
    const devolucionesCobradas = devoluciones.filter(d => 
      d.estado === 'COBRADO_TRANSFERENCIA' || d.estado === 'COBRADO_PARCIAL'
    );
    const totalRecuperado = devolucionesCobradas.reduce((sum, d) => sum + Number(d.importeCobrado || d.importe), 0);

    // 4. Movimientos de tipo "Emision Remesa" sin conciliar
    const movimientosRemesaSinConciliar = await prisma.movimientoBancario.count({
      where: {
        concepto: { contains: 'Emision Remesa Sepa', mode: 'insensitive' },
        conciliacionRemesa: null,
        fechaOperacion: {
          gte: new Date(year, mes ? mes - 1 : 0, 1),
          lte: new Date(year, mes ? mes : 12, 0, 23, 59, 59),
        },
      },
    });

    // 5. Formatear remesas para el frontend
    const remesasFormateadas = remesas.map(r => ({
      id: r.id,
      ispGestionId: r.ispGestionId,
      nombre: r.nombre,
      fecha: r.fecha,
      totalImporte: Number(r.totalImporte),
      numeroRegistros: r.numeroRegistros,
      remesado: r.remesado,
      contabilizado: r.contabilizado,
      // Estado de conciliación
      estadoConciliacion: r.conciliacion?.estado || 'PENDIENTE',
      importeMovimiento: r.conciliacion ? Number(r.conciliacion.importeMovimiento) : null,
      diferencia: r.conciliacion ? Number(r.conciliacion.diferencia) : null,
      fechaConciliacion: r.conciliacion?.fechaConciliacion,
      // Devoluciones asociadas
      numDevoluciones: r.devoluciones.length,
      totalDevoluciones: r.devoluciones.reduce((sum, d) => sum + Number(d.importe), 0),
    }));

    return NextResponse.json({
      kpis: {
        totalRemesado,
        totalConciliado,
        totalDevuelto,
        totalRecuperado,
        pendienteRecuperar: totalDevuelto - totalRecuperado,
        numRemesas: remesas.length,
        numRemesasConciliadas: remesasConciliadas.length,
        numDevoluciones: devoluciones.length,
        numDevolucionesPendientes: devolucionesPendientes.length,
        movimientosSinConciliar: movimientosRemesaSinConciliar,
      },
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
      devolucionesImportadas: 0,
      devolucionesDetectadasBanco: 0,
      pagosPosterioresDetectados: 0,
      errores: [] as string[],
    };

    // ===== ACCIÓN 1: CONCILIAR REMESAS CON MOVIMIENTOS BANCARIOS =====
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

      // Movimientos bancarios de tipo "Emision Remesa" sin conciliar
      const movimientosRemesa = await prisma.movimientoBancario.findMany({
        where: {
          concepto: { contains: 'Emision Remesa Sepa', mode: 'insensitive' },
          importe: { gt: 0 },
          conciliacionRemesa: null,
          fechaOperacion: {
            gte: new Date(year, mes ? mes - 1 : 0, 1),
            lte: new Date(year, mes ? mes : 12, 0, 23, 59, 59),
          },
        },
        orderBy: { fechaOperacion: 'asc' },
      });

      // Algoritmo de matching mejorado:
      // El banco cobra las remesas con descuento por devoluciones (hasta 20% menos)
      // Estrategia: para cada remesa, buscar el movimiento banco más cercano en importe
      // dentro de una ventana de ±5 días, donde banco <= remesa (siempre cobra menos por devoluciones)
      // Ordenar remesas de mayor a menor para asignar primero las grandes
      const remesasOrdenadas = [...remesasSinConciliar].sort(
        (a, b) => Number(b.totalImporte) - Number(a.totalImporte)
      );

      for (const remesa of remesasOrdenadas) {
        const importeRemesa = Number(remesa.totalImporte);
        
        // Buscar movimientos en ventana de fecha (±5 días) donde:
        // - El importe banco es <= importe remesa (banco siempre cobra menos por devoluciones)
        // - La diferencia no supera el 25% (tolerancia amplia por devoluciones)
        const fechaRemesa = new Date(remesa.fecha);
        const candidatos = movimientosRemesa.filter(mov => {
          const diffDias = Math.abs(
            (mov.fechaOperacion.getTime() - fechaRemesa.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diffDias > 5) return false;
          // El banco cobra <= remesa (por devoluciones) con tolerancia del 25%
          const ratio = mov.importe / importeRemesa;
          return ratio >= 0.75 && ratio <= 1.02; // entre 75% y 102% del importe remesa
        });

        // Si no hay candidatos en ±5 días, ampliar a ±10 días
        if (candidatos.length === 0) {
          const candidatosAmpliados = movimientosRemesa.filter(mov => {
            const diffDias = Math.abs(
              (mov.fechaOperacion.getTime() - fechaRemesa.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (diffDias > 10) return false;
            const ratio = mov.importe / importeRemesa;
            return ratio >= 0.70 && ratio <= 1.02;
          });
          if (candidatosAmpliados.length > 0) candidatos.push(...candidatosAmpliados);
        }

        if (candidatos.length >= 1) {
          // Tomar el candidato con importe más cercano a la remesa
          const mejorMatch = candidatos.reduce((best, curr) => {
            const diffBest = Math.abs(best.importe - importeRemesa);
            const diffCurr = Math.abs(curr.importe - importeRemesa);
            return diffCurr < diffBest ? curr : best;
          });

          const mov = mejorMatch;
          const diferencia = mov.importe - importeRemesa;
          const estado = Math.abs(diferencia) < 0.01 ? 'CONCILIADA' : 'DIFERENCIA';

          await prisma.conciliacionRemesa.create({
            data: {
              remesaId: remesa.id,
              movimientoBancarioId: mov.id,
              importeRemesa: importeRemesa,
              importeMovimiento: mov.importe,
              diferencia: diferencia,
              estado: estado as any,
              fechaConciliacion: new Date(),
            },
          });

          // Marcar movimiento como conciliado
          await prisma.movimientoBancario.update({
            where: { id: mov.id },
            data: { conciliado: true },
          });

          // Quitar candidato de la lista
          const idx = movimientosRemesa.indexOf(mov);
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
        // Intentar extraer info del concepto
        const importeDevolucion = Math.abs(mov.importe);
        
        // Buscar factura con total similar que esté PENDIENTE
        const facturaMatch = await prisma.factura.findFirst({
          where: {
            total: { gte: importeDevolucion - 0.02 as any, lte: importeDevolucion + 0.02 as any },
            situacion: 'PENDIENTE',
          },
        });

        await prisma.devolucionRemesa.create({
          data: {
            facturaId: facturaMatch?.id || null,
            movimientoBancarioId: mov.id,
            numeroFactura: facturaMatch?.numeroDocumento || 'DESCONOCIDA',
            nombreCliente: facturaMatch?.nombreCompleto || mov.concepto.substring(0, 100),
            importe: importeDevolucion,
            motivo: 'Detectada automáticamente desde banco',
            fechaDevolucion: mov.fechaOperacion,
            estado: 'PENDIENTE',
            mesDevolucion: mov.fechaOperacion.getMonth() + 1,
            anioDevolucion: mov.fechaOperacion.getFullYear(),
            archivoOrigen: 'banco_automatico',
          },
        });

        resultados.devolucionesDetectadasBanco++;
      }
    }

    // ===== ACCIÓN 3: DETECTAR PAGOS POSTERIORES =====
    if (accion === 'detectar_pagos' || accion === 'todo') {
      // Buscar devoluciones pendientes y ver si hay transferencias posteriores del mismo cliente
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
