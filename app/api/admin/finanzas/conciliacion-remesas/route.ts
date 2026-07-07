import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * API de Conciliación de Remesas
 * 
 * ENFOQUE: Conciliación por SERIE DE REFERENCIA bancaria
 * 
 * Cada remesa ISP genera una serie de cobros en el banco con un prefijo de referencia común.
 * Ejemplo: Remesa abril → serie "6y" → 13 cobros parciales del 01/04 al 04/05
 * 
 * El banco cobra las remesas en múltiples movimientos que pueden cruzar la frontera del mes.
 * Agrupar por mes natural genera falsas diferencias. Agrupar por serie de referencia cuadra perfectamente.
 * 
 * Patrón de referencia Santander: "Emision Remesa Sepa Sdd Referencia: 0049 2482 753 XXXXXXX"
 * Los últimos 7 caracteres son el código único. Los primeros 2 del código identifican la serie.
 * 
 * Cuentas:
 * - Santander (principal): "Emision Remesa Sepa Sdd"
 * - Caixa Guissona (Pallars hasta marzo 2026): "ABONAMENT REMESA REBUTS"
 */

// IDs de cuentas bancarias
const CUENTA_SANTANDER = '50910c7d-76f3-493e-8aed-962f22fc1413';
const CUENTA_CAIXA_GUISSONA = '7664fe6c-9dd0-4099-9275-bbe8b4fde301';

// Extraer serie (prefijo 2 chars) de la referencia bancaria
function extraerSerie(concepto: string): string | null {
  // Formato: "...Referencia: 0049 2482 753 0000XXXX"
  // Queremos los 2 primeros chars después de "0000"
  const match = concepto.match(/Referencia:\s*0049\s+\d+\s+753\s+0000(.{2})/i);
  return match ? match[1] : null;
}

interface SerieRemesa {
  serie: string;
  movimientos: { id: string; importe: number; fecha: Date; concepto: string }[];
  total: number;
  primeraFecha: Date;
  ultimaFecha: Date;
  maxImporte: number;
}

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

    // 3. Obtener TODOS los movimientos de remesa del banco del año
    const movimientosRemesaBanco = await prisma.movimientoBancario.findMany({
      where: {
        OR: [
          { concepto: { contains: 'Emision Remesa Sepa', mode: 'insensitive' }, cuentaId: CUENTA_SANTANDER },
          { concepto: { contains: 'REMESA REBUTS', mode: 'insensitive' }, cuentaId: CUENTA_CAIXA_GUISSONA },
        ],
        importe: { gt: 0 },
        fechaOperacion: {
          gte: new Date(year, 0, 1),
          lte: new Date(year, 11, 31, 23, 59, 59),
        },
      },
      orderBy: { fechaOperacion: 'asc' },
    });

    // 4. Agrupar movimientos Santander por SERIE DE REFERENCIA
    const seriesMap: Record<string, SerieRemesa> = {};
    const movsCaixaGuissona: { id: string; importe: number; fecha: Date; concepto: string }[] = [];

    for (const mov of movimientosRemesaBanco) {
      if (mov.cuentaId === CUENTA_CAIXA_GUISSONA) {
        movsCaixaGuissona.push({
          id: mov.id,
          importe: mov.importe,
          fecha: mov.fechaOperacion,
          concepto: mov.concepto || '',
        });
        continue;
      }

      const serie = extraerSerie(mov.concepto || '');
      if (!serie) continue;

      if (!seriesMap[serie]) {
        seriesMap[serie] = {
          serie,
          movimientos: [],
          total: 0,
          primeraFecha: mov.fechaOperacion,
          ultimaFecha: mov.fechaOperacion,
          maxImporte: 0,
        };
      }

      seriesMap[serie].movimientos.push({
        id: mov.id,
        importe: mov.importe,
        fecha: mov.fechaOperacion,
        concepto: mov.concepto || '',
      });
      seriesMap[serie].total += mov.importe;
      if (mov.fechaOperacion < seriesMap[serie].primeraFecha) {
        seriesMap[serie].primeraFecha = mov.fechaOperacion;
      }
      if (mov.fechaOperacion > seriesMap[serie].ultimaFecha) {
        seriesMap[serie].ultimaFecha = mov.fechaOperacion;
      }
      if (mov.importe > seriesMap[serie].maxImporte) {
        seriesMap[serie].maxImporte = mov.importe;
      }
    }

    const series = Object.values(seriesMap).sort(
      (a, b) => a.primeraFecha.getTime() - b.primeraFecha.getTime()
    );

    // 5. Asignar cada serie a la remesa ISP más probable
    // Criterio: la serie cuyo primer cobro esté más cerca de la fecha de la remesa
    // y cuyo importe máximo sea >= 40% del total remesado
    type RemesaConSeries = {
      remesa: typeof remesas[0];
      seriesAsignadas: SerieRemesa[];
      totalCobradoSeries: number;
      totalCaixaGuissona: number;
      movsCaixaAsignados: typeof movsCaixaGuissona;
    };

    const remesasConSeries: RemesaConSeries[] = remesas.map(r => ({
      remesa: r,
      seriesAsignadas: [],
      totalCobradoSeries: 0,
      totalCaixaGuissona: 0,
      movsCaixaAsignados: [],
    }));

    // Asignar series a remesas (de mayor a menor por importe máximo para priorizar las grandes)
    const seriesOrdenadas = [...series].sort((a, b) => b.maxImporte - a.maxImporte);
    const seriesAsignadas = new Set<string>();

    for (const serie of seriesOrdenadas) {
      let mejorRemesa: RemesaConSeries | null = null;
      let mejorScore = -Infinity;

      for (const rc of remesasConSeries) {
        const remesa = rc.remesa;
        const importeRemesa = Number(remesa.totalImporte);
        const fechaRemesa = new Date(remesa.fecha);
        
        // No asignar series de Santander a remesas que van por Caixa Guissona
        const esPallars = remesa.nombre.toUpperCase().includes('PALLARS');
        const usaCaixa = esPallars && fechaRemesa < new Date(2026, 3, 1);
        if (usaCaixa) continue;

        // Diferencia en días entre primer cobro de la serie y fecha de remesa
        const diffDias = (serie.primeraFecha.getTime() - fechaRemesa.getTime()) / (1000 * 60 * 60 * 24);
        
        // La serie debe empezar después de la remesa (o máximo 3 días antes) y dentro de 7 días
        if (diffDias < -3 || diffDias > 7) continue;

        // El importe máximo de la serie debe ser >= 40% del remesado (para remesas grandes)
        // o la suma total de la serie debe ser >= 30% (para series con muchos cobros pequeños)
        const ratioMax = serie.maxImporte / importeRemesa;
        const ratioTotal = serie.total / importeRemesa;
        
        if (ratioMax < 0.40 && ratioTotal < 0.30) continue;

        // Score: proximidad en fecha + similitud de importe
        const scoreProximidad = 10 - Math.abs(diffDias);
        const scoreSimilitud = ratioMax * 10;
        const score = scoreProximidad + scoreSimilitud;

        if (score > mejorScore) {
          mejorScore = score;
          mejorRemesa = rc;
        }
      }

      if (mejorRemesa) {
        mejorRemesa.seriesAsignadas.push(serie);
        mejorRemesa.totalCobradoSeries += serie.total;
        seriesAsignadas.add(serie.serie);
      }
    }

    // 6. Asignar movimientos de Caixa Guissona a remesas PALLARS
    const remesasPallars = remesasConSeries.filter(rc => 
      rc.remesa.nombre.toUpperCase().includes('PALLARS')
    );

    for (const mov of movsCaixaGuissona) {
      // Buscar la remesa Pallars cuya fecha sea más cercana (y anterior) al movimiento
      let mejorRemesa: RemesaConSeries | null = null;
      let mejorDiff = Infinity;

      for (const rc of remesasPallars) {
        const fechaRemesa = new Date(rc.remesa.fecha);
        const diffDias = (mov.fecha.getTime() - fechaRemesa.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDias >= -3 && diffDias < 35 && diffDias < mejorDiff) {
          mejorDiff = diffDias;
          mejorRemesa = rc;
        }
      }

      if (mejorRemesa) {
        mejorRemesa.movsCaixaAsignados.push(mov);
        mejorRemesa.totalCaixaGuissona += mov.importe;
      }
    }

    // 7. Calcular KPIs
    const totalRemesado = remesas.reduce((sum, r) => sum + Number(r.totalImporte), 0);
    const totalCobradoBanco = remesasConSeries.reduce(
      (sum, rc) => sum + rc.totalCobradoSeries + rc.totalCaixaGuissona, 0
    );
    const totalDevuelto = devoluciones.reduce((sum, d) => sum + Number(d.importe), 0);
    const devolucionesPendientes = devoluciones.filter(d => d.estado === 'PENDIENTE');
    const devolucionesCobradas = devoluciones.filter(d =>
      d.estado === 'COBRADO_TRANSFERENCIA' || d.estado === 'COBRADO_PARCIAL'
    );
    const totalRecuperado = devolucionesCobradas.reduce((sum, d) => sum + Number(d.importeCobrado || d.importe), 0);

    // 8. Formatear remesas con datos de series asignadas
    const remesasFormateadas = remesasConSeries.map(rc => {
      const r = rc.remesa;
      const importeRemesa = Number(r.totalImporte);
      const totalCobrado = rc.totalCobradoSeries + rc.totalCaixaGuissona;
      const diferencia = totalCobrado > 0 ? Math.round((totalCobrado - importeRemesa) * 100) / 100 : null;
      const tieneDatosBanco = totalCobrado > 0;

      let estadoConciliacion = 'PENDIENTE';
      if (tieneDatosBanco) {
        const diffPorcentaje = Math.abs((totalCobrado - importeRemesa) / importeRemesa);
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
        totalImporte: importeRemesa,
        numeroRegistros: r.numeroRegistros,
        remesado: r.remesado,
        contabilizado: r.contabilizado,
        estadoConciliacion,
        importeBanco: tieneDatosBanco ? totalCobrado : null,
        diferencia,
        seriesAsignadas: rc.seriesAsignadas.map(s => s.serie).join(', '),
        numMovimientosBanco: rc.seriesAsignadas.reduce((sum, s) => sum + s.movimientos.length, 0) + rc.movsCaixaAsignados.length,
        cobroSantander: rc.totalCobradoSeries,
        cobroCaixaGuissona: rc.totalCaixaGuissona,
        primerCobro: rc.seriesAsignadas.length > 0 ? rc.seriesAsignadas[0].primeraFecha : null,
        ultimoCobro: rc.seriesAsignadas.length > 0 ? rc.seriesAsignadas[rc.seriesAsignadas.length - 1].ultimaFecha : null,
        numDevoluciones: r.devoluciones.length,
        totalDevoluciones: r.devoluciones.reduce((sum, d) => sum + Number(d.importe), 0),
      };
    });

    // 9. Resumen mensual (agrupando remesas por mes de emisión)
    const resumenPorMes: Record<string, {
      totalRemesado: number;
      totalCobrado: number;
      santander: number;
      caixaGuissona: number;
      numMovimientos: number;
      numRemesas: number;
    }> = {};

    for (const rc of remesasConSeries) {
      const mesKey = `${new Date(rc.remesa.fecha).getFullYear()}-${String(new Date(rc.remesa.fecha).getMonth() + 1).padStart(2, '0')}`;
      if (!resumenPorMes[mesKey]) {
        resumenPorMes[mesKey] = { totalRemesado: 0, totalCobrado: 0, santander: 0, caixaGuissona: 0, numMovimientos: 0, numRemesas: 0 };
      }
      resumenPorMes[mesKey].totalRemesado += Number(rc.remesa.totalImporte);
      resumenPorMes[mesKey].totalCobrado += rc.totalCobradoSeries + rc.totalCaixaGuissona;
      resumenPorMes[mesKey].santander += rc.totalCobradoSeries;
      resumenPorMes[mesKey].caixaGuissona += rc.totalCaixaGuissona;
      resumenPorMes[mesKey].numMovimientos += rc.seriesAsignadas.reduce((sum, s) => sum + s.movimientos.length, 0) + rc.movsCaixaAsignados.length;
      resumenPorMes[mesKey].numRemesas++;
    }

    const resumenMensual = Object.entries(resumenPorMes).map(([mesKey, data]) => {
      const devolucionesMes = devoluciones.filter(d => {
        const [anio, m] = mesKey.split('-');
        return d.anioDevolucion === parseInt(anio) && d.mesDevolucion === parseInt(m);
      });

      return {
        mes: mesKey,
        totalRemesado: Math.round(data.totalRemesado * 100) / 100,
        totalCobradoBanco: Math.round(data.totalCobrado * 100) / 100,
        santander: Math.round(data.santander * 100) / 100,
        caixaGuissona: Math.round(data.caixaGuissona * 100) / 100,
        diferencia: Math.round((data.totalCobrado - data.totalRemesado) * 100) / 100,
        numMovimientos: data.numMovimientos,
        numRemesas: data.numRemesas,
        totalDevuelto: devolucionesMes.reduce((sum, d) => sum + Number(d.importe), 0),
        numDevoluciones: devolucionesMes.length,
      };
    }).sort((a, b) => b.mes.localeCompare(a.mes));

    return NextResponse.json({
      kpis: {
        totalRemesado: Math.round(totalRemesado * 100) / 100,
        totalCobradoBanco: Math.round(totalCobradoBanco * 100) / 100,
        diferenciaNeta: Math.round((totalCobradoBanco - totalRemesado) * 100) / 100,
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
      seriesDetectadas: 0,
      devolucionesDetectadasBanco: 0,
      pagosPosterioresDetectados: 0,
      errores: [] as string[],
    };

    // ===== ACCIÓN 1: CONCILIAR REMESAS POR SERIE DE REFERENCIA =====
    if (accion === 'conciliar' || accion === 'todo') {
      // Obtener remesas sin conciliar
      const whereRemesas: any = { ejercicio: year, conciliacion: null };
      if (mes) {
        const desde = new Date(year, mes - 1, 1);
        const hasta = new Date(year, mes, 0, 23, 59, 59);
        whereRemesas.fecha = { gte: desde, lte: hasta };
      }

      const remesasSinConciliar = await prisma.remesa.findMany({
        where: whereRemesas,
        orderBy: { totalImporte: 'desc' },
      });

      // Obtener movimientos de remesa del banco (Santander)
      const movimientosRemesa = await prisma.movimientoBancario.findMany({
        where: {
          concepto: { contains: 'Emision Remesa Sepa', mode: 'insensitive' },
          cuentaId: CUENTA_SANTANDER,
          importe: { gt: 0 },
          conciliacionRemesa: null,
          fechaOperacion: {
            gte: new Date(year, 0, 1),
            lte: new Date(year, 11, 31, 23, 59, 59),
          },
        },
        orderBy: { fechaOperacion: 'asc' },
      });

      // Agrupar por serie de referencia
      const seriesMap: Record<string, { movimientos: typeof movimientosRemesa; total: number; primeraFecha: Date; maxImporte: number }> = {};
      for (const mov of movimientosRemesa) {
        const serie = extraerSerie(mov.concepto || '');
        if (!serie) continue;
        if (!seriesMap[serie]) {
          seriesMap[serie] = { movimientos: [], total: 0, primeraFecha: mov.fechaOperacion, maxImporte: 0 };
        }
        seriesMap[serie].movimientos.push(mov);
        seriesMap[serie].total += mov.importe;
        if (mov.fechaOperacion < seriesMap[serie].primeraFecha) {
          seriesMap[serie].primeraFecha = mov.fechaOperacion;
        }
        if (mov.importe > seriesMap[serie].maxImporte) {
          seriesMap[serie].maxImporte = mov.importe;
        }
      }

      resultados.seriesDetectadas = Object.keys(seriesMap).length;

      // Asignar cada serie a la remesa más probable
      const seriesOrdenadas = Object.values(seriesMap).sort((a, b) => b.maxImporte - a.maxImporte);
      const seriesUsadas = new Set<string>();

      for (const remesa of remesasSinConciliar) {
        const importeRemesa = Number(remesa.totalImporte);
        const fechaRemesa = new Date(remesa.fecha);
        
        // No buscar en Santander para Pallars pre-abril 2026
        const esPallars = remesa.nombre.toUpperCase().includes('PALLARS');
        if (esPallars && fechaRemesa < new Date(2026, 3, 1)) continue;

        // Buscar la mejor serie para esta remesa
        let mejorSerie: typeof seriesOrdenadas[0] | null = null;
        let mejorScore = -Infinity;

        for (const serie of seriesOrdenadas) {
          const serieKey = extraerSerie(serie.movimientos[0].concepto || '');
          if (!serieKey || seriesUsadas.has(serieKey)) continue;

          const diffDias = (serie.primeraFecha.getTime() - fechaRemesa.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDias < -3 || diffDias > 7) continue;

          const ratioMax = serie.maxImporte / importeRemesa;
          const ratioTotal = serie.total / importeRemesa;
          if (ratioMax < 0.40 && ratioTotal < 0.30) continue;

          const scoreProximidad = 10 - Math.abs(diffDias);
          const scoreSimilitud = ratioMax * 10;
          const score = scoreProximidad + scoreSimilitud;

          if (score > mejorScore) {
            mejorScore = score;
            mejorSerie = serie;
          }
        }

        if (mejorSerie) {
          const serieKey = extraerSerie(mejorSerie.movimientos[0].concepto || '');
          if (serieKey) seriesUsadas.add(serieKey);

          // Buscar si hay series "hermanas" (ej: 6y + 6z para abril)
          // que empiecen en el mismo periodo y no estén asignadas
          let totalCobrado = mejorSerie.total;
          const movPrincipal = mejorSerie.movimientos.reduce(
            (best, curr) => curr.importe > best.importe ? curr : best
          );

          // Crear conciliación con el movimiento más grande de la serie
          const diferencia = Math.round((totalCobrado - importeRemesa) * 100) / 100;
          const estado = Math.abs(diferencia) < (importeRemesa * 0.02) ? 'CONCILIADA' : 'DIFERENCIA';

          await prisma.conciliacionRemesa.create({
            data: {
              remesaId: remesa.id,
              movimientoBancarioId: movPrincipal.id,
              importeRemesa: importeRemesa,
              importeMovimiento: totalCobrado,
              diferencia: diferencia,
              estado: estado as any,
              fechaConciliacion: new Date(),
            },
          });

          // Marcar todos los movimientos de la serie como conciliados
          for (const mov of mejorSerie.movimientos) {
            await prisma.movimientoBancario.update({
              where: { id: mov.id },
              data: { conciliado: true },
            });
          }

          if (estado === 'CONCILIADA') {
            resultados.remesasConciliadas++;
          } else {
            resultados.remesasConDiferencia++;
          }
        }
      }

      // Conciliar remesas Pallars con Caixa Guissona (pre-abril 2026)
      const remesasPallarsSinConciliar = remesasSinConciliar.filter(r =>
        r.nombre.toUpperCase().includes('PALLARS') && new Date(r.fecha) < new Date(2026, 3, 1)
      );

      if (remesasPallarsSinConciliar.length > 0) {
        const movsCaixa = await prisma.movimientoBancario.findMany({
          where: {
            concepto: { contains: 'REMESA REBUTS', mode: 'insensitive' },
            cuentaId: CUENTA_CAIXA_GUISSONA,
            importe: { gt: 0 },
            conciliacionRemesa: null,
            fechaOperacion: {
              gte: new Date(year, 0, 1),
              lte: new Date(year, 3, 30, 23, 59, 59),
            },
          },
          orderBy: { fechaOperacion: 'asc' },
        });

        for (const remesa of remesasPallarsSinConciliar) {
          const fechaRemesa = new Date(remesa.fecha);
          const importeRemesa = Number(remesa.totalImporte);

          // Sumar movimientos de Caixa en ventana ±35 días
          const movsEnVentana = movsCaixa.filter(mov => {
            const diffDias = (mov.fechaOperacion.getTime() - fechaRemesa.getTime()) / (1000 * 60 * 60 * 24);
            return diffDias >= -3 && diffDias < 35;
          });

          if (movsEnVentana.length > 0) {
            const totalCobrado = movsEnVentana.reduce((sum, m) => sum + m.importe, 0);
            const movPrincipal = movsEnVentana.reduce((best, curr) => curr.importe > best.importe ? curr : best);
            const diferencia = Math.round((totalCobrado - importeRemesa) * 100) / 100;
            const estado = Math.abs(diferencia) < (importeRemesa * 0.02) ? 'CONCILIADA' : 'DIFERENCIA';

            await prisma.conciliacionRemesa.create({
              data: {
                remesaId: remesa.id,
                movimientoBancarioId: movPrincipal.id,
                importeRemesa: importeRemesa,
                importeMovimiento: totalCobrado,
                diferencia: diferencia,
                estado: estado as any,
                fechaConciliacion: new Date(),
              },
            });

            for (const mov of movsEnVentana) {
              await prisma.movimientoBancario.update({
                where: { id: mov.id },
                data: { conciliado: true },
              });
              // Eliminar de la lista para no reasignar
              const idx = movsCaixa.indexOf(mov);
              if (idx > -1) movsCaixa.splice(idx, 1);
            }

            if (estado === 'CONCILIADA') {
              resultados.remesasConciliadas++;
            } else {
              resultados.remesasConDiferencia++;
            }
          }
        }
      }
    }

    // ===== ACCIÓN 2: DETECTAR DEVOLUCIONES EN BANCO =====
    if (accion === 'detectar_devoluciones' || accion === 'todo') {
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
        const mesDevolucion = fechaDevolucion.getMonth();
        const anioDevolucion = fechaDevolucion.getFullYear();

        // Buscar factura en el mes actual y anterior
        const fechaDesde = new Date(anioDevolucion, mesDevolucion - 1, 1);
        const fechaHasta = new Date(anioDevolucion, mesDevolucion + 1, 0, 23, 59, 59);

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
            nombreCliente = facturasAprox.map(f => f.nombreCompleto).filter(Boolean).slice(0, 5).join(' / ');
            numeroFactura = 'MÚLTIPLES';
          }
        }

        // Vincular a remesa por serie de factura
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
          const remesaLleida = await prisma.remesa.findFirst({
            where: remesaWhere,
            orderBy: { totalImporte: 'desc' },
          });
          remesaId = remesaLleida?.id || null;
        }

        await prisma.devolucionRemesa.create({
          data: {
            facturaId: facturaMatch?.id || null,
            remesaId,
            movimientoBancarioId: mov.id,
            numeroFactura,
            nombreCliente,
            importe: importeDevolucion,
            motivo: 'Detectada automáticamente desde banco',
            fechaDevolucion: mov.fechaOperacion,
            estado: 'PENDIENTE',
            mesDevolucion: mesDevolucion + 1,
            anioDevolucion,
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
        include: { factura: true },
      });

      for (const dev of devolucionesPendientes) {
        if (!dev.factura) continue;
        const importeDevolucion = Number(dev.importe);
        const nombreCliente = dev.factura.nombreCompleto;
        if (!nombreCliente) continue;

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
