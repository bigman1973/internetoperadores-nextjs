import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Motor de conciliación automática MEJORADO
 * 
 * Estrategias de conciliación (por orden de prioridad):
 * 1. Match EXACTO por importe + proveedor en concepto
 * 2. Match por nº factura en concepto/referencia
 * 3. Match por importe exacto + fecha cercana (±60 días)
 * 4. Match por domiciliaciones recurrentes (Telefónica, Aire, etc.)
 * 5. Confirming Draxton
 * 6. Facturas emitidas (remesas/transferencias recibidas)
 * 7. Traspasos entre cuentas propias
 * 
 * Clasificación automática por patrones de concepto
 */

// Reglas de clasificación automática por concepto
const REGLAS_CLASIFICACION = [
  // Nóminas
  { patron: /Concepto\s*(Nomina|Nómina)/i, categoria: 'Sueldos y Salarios', tipoPago: 'Nómina' },
  { patron: /Concepto\s*Adelanto\s*Nomina/i, categoria: 'Sueldos y Salarios', tipoPago: 'Nómina' },
  { patron: /Concepto\s*Liquidacion\s/i, categoria: 'Sueldos y Salarios', tipoPago: 'Nómina' },
  
  // Impuestos
  { patron: /Domiciliacion\s*Impuesto|Impuesto:\s*2\.\d{3}/i, categoria: 'IMPUESTOS', tipoPago: 'IVA' },
  { patron: /A\.?E\.?A\.?T/i, categoria: 'IMPUESTOS', tipoPago: 'IVA' },
  { patron: /Imp\.\s*Sociedades/i, categoria: 'IMPUESTOS', tipoPago: 'IS' },
  
  // Seguridad Social
  { patron: /TGSS|Cotizacion\s*\d{3}/i, categoria: 'Sueldos y Salarios', tipoPago: 'SS' },
  { patron: /R\.E\.Autonomos|R\.E\.AUTONOMOS/i, categoria: 'Sueldos y Salarios', tipoPago: 'SS' },
  
  // Confirming
  { patron: /Cesion De Creditos.*Draxton/i, categoria: 'Draxton', tipoPago: 'Confirming' },
  { patron: /Confirming.*Claveria/i, categoria: 'Estructura', tipoPago: 'Confirming' },
  { patron: /Santander Factoring.*Confirming/i, categoria: 'Estructura', tipoPago: 'Confirming' },
  { patron: /Liquidacion Anticipo/i, categoria: 'Estructura', tipoPago: 'Confirming' },
  { patron: /ANTICIPS CONFIRMING/i, categoria: 'Draxton', tipoPago: 'Confirming' },
  
  // Remesas (cobros)
  { patron: /Emision Remesa Sepa/i, categoria: 'Operadora', tipoPago: 'Remesa' },
  { patron: /Liquidacion Por Emision/i, categoria: 'Gastos Financieros', tipoPago: 'Comisión' },
  
  // Traspasos propios
  { patron: /Transferencia.*Internet Operadores.*Concepto\s*Traspas/i, categoria: 'Traspaso', tipoPago: 'Transferencia' },
  { patron: /Transferencia Inmediata A Favor De Internet Operadores/i, categoria: 'Traspaso', tipoPago: 'Transferencia' },
  { patron: /TRF IMMEDIATA.*INTERNET OPERADORES/i, categoria: 'Traspaso', tipoPago: 'Transferencia' },
  { patron: /TRASPAS A GIRO/i, categoria: 'Traspaso', tipoPago: 'Transferencia' },
  
  // Proveedores conocidos
  { patron: /Instant Byte/i, categoria: 'Operadora', tipoPago: 'Factura' },
  { patron: /Neutra Fiber/i, categoria: 'Operadora', tipoPago: 'Factura' },
  { patron: /Vola Los Del Internet/i, categoria: 'Vola', tipoPago: 'Factura' },
  { patron: /Looking Forward Giro Dolcet/i, categoria: 'Estructura', tipoPago: 'Factura' },
  { patron: /V-valley/i, categoria: 'Comisiones V-Valley', tipoPago: 'Factura' },
  { patron: /Santber/i, categoria: 'Operadora', tipoPago: 'Factura' },
  { patron: /Aire Networks/i, categoria: 'Operadora', tipoPago: 'Factura' },
  { patron: /Xfera|Masmovil/i, categoria: 'Operadora', tipoPago: 'Factura' },
  
  // Telecomunicaciones (recibos/domiciliaciones)
  { patron: /Telefonica De Espana|TELEFONICA DE ESPAÑA/i, categoria: 'Operadora', tipoPago: 'Domiciliación' },
  { patron: /Telefonica Moviles/i, categoria: 'Operadora', tipoPago: 'Domiciliación' },
  { patron: /Acens.*Telefonica/i, categoria: 'Estructura', tipoPago: 'Domiciliación' },
  
  // Tarjeta - Restaurantes/Comida
  { patron: /Glovo|Uber\s*Eats|Just\s*Eat|Deliveroo/i, categoria: 'Dietas', tipoPago: 'Débito' },
  { patron: /Restaurant|Restaurante|Pizz|Burger|Kebab|Wok|Sushi|Bar\s|Cafe\s|Cafeteria/i, categoria: 'Dietas', tipoPago: 'Débito' },
  { patron: /Mcdonalds|Mcdonald|Telepizza|Dominos/i, categoria: 'Dietas', tipoPago: 'Débito' },
  
  // Tarjeta - Gasolina/Desplazamientos
  { patron: /Benzinera|Gasolinera|Repsol|Cepsa|Shell|Bp\s|Bonarea.*Gasoil|Estacion Servicio/i, categoria: 'Desplazamientos', tipoPago: 'Débito' },
  { patron: /Renfe|Alsa|Blabla|Parking|Peaje|Autopista|Toll/i, categoria: 'Desplazamientos', tipoPago: 'Débito' },
  { patron: /Saltoki/i, categoria: 'Operadora', tipoPago: 'Débito' },
  
  // Tarjeta - Suscripciones tech
  { patron: /Apple\.com|Itunes|Google\s*(Cloud|Storage|Play)|Microsoft|Github|Aws|Amazon\s*Web/i, categoria: 'Estructura', tipoPago: 'Suscripción' },
  { patron: /Zoom|Slack|Notion|Figma|Canva|Adobe|Dropbox|Openai|Manus\s*Ai/i, categoria: 'Estructura', tipoPago: 'Suscripción' },
  { patron: /Nominalia|Ovh|Hetzner|Digitalocean|Cloudflare/i, categoria: 'Estructura', tipoPago: 'Suscripción' },
  
  // Tarjeta - Material oficina/hardware
  { patron: /Amazon\.es|Amazon\.com|Pccomponentes|Mediamarkt/i, categoria: 'Estructura', tipoPago: 'Débito' },
  { patron: /Www\.amazon/i, categoria: 'Estructura', tipoPago: 'Débito' },
  
  // Préstamos
  { patron: /Venciment Prestec|PRES\.\d+/i, categoria: 'Gastos Financieros', tipoPago: 'Préstamo' },
  { patron: /AMORTITZACI.*PR(É|E)STEC/i, categoria: 'Gastos Financieros', tipoPago: 'Préstamo' },
  
  // Comisiones bancarias
  { patron: /Manteniment|Cobrament Pendent|Gastos Devoluciones/i, categoria: 'Gastos Financieros', tipoPago: 'Comisión' },
  { patron: /Targeta Visa|V\.Negocis/i, categoria: 'Gastos Financieros', tipoPago: 'Comisión' },
  { patron: /COMISSIONS|Comision\s*\d/i, categoria: 'Gastos Financieros', tipoPago: 'Comisión' },
  
  // Devoluciones de recibos
  { patron: /Devolucion De Recibo/i, categoria: 'Morosos', tipoPago: 'Devolución' },
  
  // Seguros
  { patron: /Mutua Madrile/i, categoria: 'Estructura', tipoPago: 'Seguro' },
  { patron: /Quiron Prevencion/i, categoria: 'Sueldos y Salarios', tipoPago: 'PRL' },
];

// Mapeo de proveedores conocidos para match por concepto
const PROVEEDORES_CONCEPTO: { patron: RegExp; proveedor: string }[] = [
  { patron: /Instant Byte/i, proveedor: 'INSTANT BYTE' },
  { patron: /Neutra Fiber/i, proveedor: 'NEUTRA FIBER' },
  { patron: /Aire Networks/i, proveedor: 'AIRE NETWORKS' },
  { patron: /Telefonica De Espana|TELEFONICA DE ESPAÑA/i, proveedor: 'TELEFÓNICA DE ESPAÑA' },
  { patron: /Telefonica Moviles/i, proveedor: 'TELEFÓNICA MÓVILES' },
  { patron: /Xfera|Masmovil/i, proveedor: 'XFERA MOVILES' },
  { patron: /V-valley/i, proveedor: 'V-VALLEY' },
  { patron: /Vola Los Del Internet/i, proveedor: 'VOLA' },
  { patron: /Santber/i, proveedor: 'SANTBER' },
  { patron: /Looking Forward/i, proveedor: 'LOOKING FORWARD' },
  { patron: /Draxton/i, proveedor: 'DRAXTON' },
  { patron: /Acens/i, proveedor: 'ACENS' },
];

// POST - Ejecutar conciliación automática
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { modo = 'todo' } = body; // 'clasificar', 'conciliar', 'todo'

    const resultados = {
      clasificados: 0,
      conciliadosFacturasRecibidas: 0,
      conciliadosFacturasEmitidas: 0,
      conciliadosConfirming: 0,
      conciliadosTraspasos: 0,
      conciliadosGastos: 0,
      errores: [] as string[],
    };

    // 1. CLASIFICACIÓN AUTOMÁTICA
    if (modo === 'clasificar' || modo === 'todo') {
      const sinCategoria = await prisma.movimientoBancario.findMany({
        where: { categoria: null },
        select: { id: true, concepto: true, importe: true },
      });

      for (const mov of sinCategoria) {
        for (const regla of REGLAS_CLASIFICACION) {
          if (regla.patron.test(mov.concepto)) {
            await prisma.movimientoBancario.update({
              where: { id: mov.id },
              data: {
                categoria: regla.categoria,
                tipoPago: regla.tipoPago,
              },
            });
            resultados.clasificados++;
            break;
          }
        }
      }

      // También aplicar reglas personalizadas de la BD
      try {
        const reglasDB = await prisma.reglaImputacion.findMany({
          where: { activa: true },
          orderBy: { confianza: 'desc' },
        });

        const aun_sin_categoria = await prisma.movimientoBancario.findMany({
          where: { categoria: null },
          select: { id: true, concepto: true },
        });

        for (const mov of aun_sin_categoria) {
          for (const regla of reglasDB) {
            if (mov.concepto.toLowerCase().includes(regla.patron.toLowerCase())) {
              await prisma.movimientoBancario.update({
                where: { id: mov.id },
                data: {
                  categoria: regla.imputacion,
                  tipoPago: regla.tipoPago,
                },
              });
              await prisma.reglaImputacion.update({
                where: { id: regla.id },
                data: { vecesUsada: { increment: 1 } },
              });
              resultados.clasificados++;
              break;
            }
          }
        }
      } catch (e) {
        // reglaImputacion puede no existir aún
      }
    }

    // 2. CONCILIACIÓN CON FACTURAS RECIBIDAS (MEJORADA)
    if (modo === 'conciliar' || modo === 'todo') {
      const gastosSinConciliar = await prisma.movimientoBancario.findMany({
        where: {
          conciliado: false,
          importe: { lt: 0 },
          categoria: { notIn: ['Traspaso', 'Sueldos y Salarios', 'IMPUESTOS', 'Gastos Financieros', 'Dietas', 'Desplazamientos'] },
        },
        select: { id: true, importe: true, fechaOperacion: true, concepto: true, referencia: true },
      });

      for (const mov of gastosSinConciliar) {
        const importeAbs = Math.abs(mov.importe);
        let matched = false;

        // ESTRATEGIA 1: Match por proveedor en concepto + importe exacto
        for (const prov of PROVEEDORES_CONCEPTO) {
          if (prov.patron.test(mov.concepto)) {
            const fechaDesde = new Date(mov.fechaOperacion);
            fechaDesde.setDate(fechaDesde.getDate() - 90);
            const fechaHasta = new Date(mov.fechaOperacion);
            fechaHasta.setDate(fechaHasta.getDate() + 10);

            const facturaMatch = await prisma.facturaRecibida.findFirst({
              where: {
                proveedor: { contains: prov.proveedor, mode: 'insensitive' },
                total: { gte: importeAbs - 0.05, lte: importeAbs + 0.05 },
                fecha: { gte: fechaDesde, lte: fechaHasta },
                movimientos: { none: {} },
              },
              orderBy: { fecha: 'desc' },
            });

            if (facturaMatch) {
              await prisma.movimientoBancario.update({
                where: { id: mov.id },
                data: { conciliado: true, facturaId: facturaMatch.id },
              });
              resultados.conciliadosFacturasRecibidas++;
              matched = true;
            }
            break;
          }
        }
        if (matched) continue;

        // ESTRATEGIA 2: Match por nº factura en concepto/referencia
        const numFacturaMatch = mov.concepto.match(/(?:Fra|Factura|FRS|Ref)[:\s.]*([A-Z0-9\-\/]+)/i)
          || (mov.referencia && mov.referencia.match(/([A-Z0-9\-\/]{5,})/i));
        
        if (numFacturaMatch) {
          const numFactura = numFacturaMatch[1];
          const facturaMatch = await prisma.facturaRecibida.findFirst({
            where: {
              numFactura: { contains: numFactura, mode: 'insensitive' },
              movimientos: { none: {} },
            },
          });

          if (facturaMatch) {
            await prisma.movimientoBancario.update({
              where: { id: mov.id },
              data: { conciliado: true, facturaId: facturaMatch.id },
            });
            resultados.conciliadosFacturasRecibidas++;
            continue;
          }
        }

        // ESTRATEGIA 3: Match por importe exacto + fecha cercana (solo si importe > 50€)
        if (importeAbs > 50) {
          const fechaDesde = new Date(mov.fechaOperacion);
          fechaDesde.setDate(fechaDesde.getDate() - 60);
          const fechaHasta = new Date(mov.fechaOperacion);
          fechaHasta.setDate(fechaHasta.getDate() + 5);

          const facturaMatch = await prisma.facturaRecibida.findFirst({
            where: {
              total: { gte: importeAbs - 0.02, lte: importeAbs + 0.02 },
              fecha: { gte: fechaDesde, lte: fechaHasta },
              movimientos: { none: {} },
            },
            orderBy: { fecha: 'desc' },
          });

          if (facturaMatch) {
            await prisma.movimientoBancario.update({
              where: { id: mov.id },
              data: { conciliado: true, facturaId: facturaMatch.id },
            });
            resultados.conciliadosFacturasRecibidas++;
            continue;
          }
        }
      }

      // 3. CONCILIACIÓN CONFIRMING DRAXTON
      const ingresosConfirming = await prisma.movimientoBancario.findMany({
        where: {
          conciliado: false,
          importe: { gt: 0 },
          OR: [
            { concepto: { contains: 'Draxton', mode: 'insensitive' } },
            { concepto: { contains: 'ANTICIPS CONFIRMING', mode: 'insensitive' } },
          ],
        },
        select: { id: true, importe: true, fechaOperacion: true },
      });

      for (const mov of ingresosConfirming) {
        await prisma.movimientoBancario.update({
          where: { id: mov.id },
          data: {
            conciliado: true,
            categoria: 'Draxton',
            tipoPago: 'Confirming',
          },
        });
        resultados.conciliadosConfirming++;
      }

      // 4. TRASPASOS ENTRE CUENTAS PROPIAS
      const traspasos = await prisma.movimientoBancario.findMany({
        where: {
          conciliado: false,
          categoria: 'Traspaso',
        },
        select: { id: true },
      });

      for (const mov of traspasos) {
        await prisma.movimientoBancario.update({
          where: { id: mov.id },
          data: { conciliado: true },
        });
        resultados.conciliadosTraspasos++;
      }

      // 5. CONCILIACIÓN CON TICKETS/GASTOS
      const gastosCategorizados = ['Dietas', 'Desplazamientos'];
      const movGastos = await prisma.movimientoBancario.findMany({
        where: {
          conciliado: false,
          importe: { lt: 0 },
          gastoId: null,
          categoria: { in: gastosCategorizados },
        },
        select: { id: true, importe: true, fechaOperacion: true, concepto: true },
      });


      for (const mov of movGastos) {
        const importeAbs = Math.abs(mov.importe);
        const fechaDesde = new Date(mov.fechaOperacion);
        fechaDesde.setDate(fechaDesde.getDate() - 3);
        const fechaHasta = new Date(mov.fechaOperacion);
        fechaHasta.setDate(fechaHasta.getDate() + 3);

        const gastoMatch = await prisma.gasto.findFirst({
          where: {
            importe: { gte: importeAbs - 0.05, lte: importeAbs + 0.05 },
            fecha: { gte: fechaDesde, lte: fechaHasta },
            conciliado: false,
          },
          orderBy: { fecha: 'desc' },
        });

        if (gastoMatch) {
          await prisma.movimientoBancario.update({
            where: { id: mov.id },
            data: { conciliado: true, gastoId: gastoMatch.id },
          });
          await prisma.gasto.update({
            where: { id: gastoMatch.id },
            data: { conciliado: true },
          });
          resultados.conciliadosGastos++;
        }
      }

      // 6. CONCILIACIÓN CON FACTURAS EMITIDAS (Remesas y transferencias recibidas)
      const ingresosClientes = await prisma.movimientoBancario.findMany({
        where: {
          conciliado: false,
          importe: { gt: 0 },
          categoria: { notIn: ['Draxton', 'Traspaso'] },
        },
        select: { id: true, importe: true, fechaOperacion: true, concepto: true },
      });

      for (const mov of ingresosClientes) {
        // Buscar factura emitida con total similar y estado EMITIDA o ENVIADA
        const facturaMatch = await prisma.facturaEmitida.findFirst({
          where: {
            total: { gte: mov.importe - 0.02, lte: mov.importe + 0.02 },
            estado: { in: ['EMITIDA', 'ENVIADA'] },
          },
        });

        if (facturaMatch) {
          await prisma.facturaEmitida.update({
            where: { id: facturaMatch.id },
            data: {
              estado: 'COBRADA',
              importeCobrado: mov.importe,
              fechaCobro: mov.fechaOperacion,
            },
          });
          await prisma.movimientoBancario.update({
            where: { id: mov.id },
            data: { conciliado: true },
          });
          resultados.conciliadosFacturasEmitidas++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      resultados,
    });
  } catch (error: any) {
    console.error('Error en conciliación:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET - Estado de conciliación
export async function GET() {
  try {
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
      where: { movimientos: { none: {} }, total: { gt: 0 } },
    });

    // Conteos especiales para KPIs
    const pendienteFacturaCount = await prisma.movimientoBancario.count({ where: { pendienteFactura: true } });
    const pagosVolaCount = await prisma.movimientoBancario.count({ where: { pagoACuentaVola: true } });
    const entregasACuentaCount = await prisma.movimientoBancario.count({ where: { entregaACuentaEmpleadoId: { not: null } } });
    const sinDocumentoCount = await prisma.movimientoBancario.count({ where: { tipoDocumento: 'factura', documentoRecibido: false } });

    // Importes de pagos Vola y entregas a cuenta
    const pagosVolaImporte = await prisma.movimientoBancario.aggregate({ where: { pagoACuentaVola: true }, _sum: { importe: true } });
    const entregasACuentaImporte = await prisma.movimientoBancario.aggregate({ where: { entregaACuentaEmpleadoId: { not: null } }, _sum: { importe: true } });

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

    return NextResponse.json({
      totalMovimientos,
      conciliados,
      sinConciliar,
      sinCategorizar,
      porcentajeConciliado: totalMovimientos > 0 ? Math.round((conciliados / totalMovimientos) * 100) : 0,
      pendienteFacturaCount,
      pagosVolaCount,
      pagosVolaImporte: Math.abs(pagosVolaImporte._sum.importe || 0),
      entregasACuentaCount,
      entregasACuentaImporte: Math.abs(entregasACuentaImporte._sum.importe || 0),
      sinDocumentoCount,
      facturasEmitidas: {
        total: facturasEmitidas._count,
        facturado: facturasEmitidas._sum.total || 0,
        cobrado: facturasEmitidas._sum.importeCobrado || 0,
        pendienteCobro,
      },
      facturasRecibidasSinConciliar,
      porCategoria,
      porBanco,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
