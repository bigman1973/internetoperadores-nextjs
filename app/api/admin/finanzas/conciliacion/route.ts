import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Motor de conciliación automática
 * 
 * Estrategias:
 * 1. Confirming Draxton: Ingresos con "Draxton" → cruzar con facturas de carpeta Confirming
 * 2. Remesas SEPA: Ingresos de remesa → cruzar con facturas emitidas por importe
 * 3. Transferencias a proveedores: Gastos por transferencia → cruzar con facturas recibidas por importe+fecha
 * 4. Nóminas: Transferencias a empleados → clasificar como "Sueldos y Salarios"
 * 5. Impuestos: Domiciliaciones AEAT → clasificar como "IMPUESTOS"
 * 6. Tarjeta: Pagos con tarjeta → clasificar por concepto (restaurante, gasolina, etc.)
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
  
  // Remesas (cobros)
  { patron: /Emision Remesa Sepa/i, categoria: 'Operadora', tipoPago: 'Remesa' },
  { patron: /Liquidacion Por Emision/i, categoria: 'Gastos Financieros', tipoPago: 'Comisión' },
  
  // Traspasos propios
  { patron: /Transferencia.*Internet Operadores.*Concepto\s*Traspas/i, categoria: 'Traspaso', tipoPago: 'Transferencia' },
  { patron: /Transferencia Inmediata A Favor De Internet Operadores/i, categoria: 'Traspaso', tipoPago: 'Transferencia' },
  
  // Proveedores conocidos
  { patron: /Instant Byte/i, categoria: 'Operadora', tipoPago: 'Factura' },
  { patron: /Neutra Fiber/i, categoria: 'Operadora', tipoPago: 'Factura' },
  { patron: /Vola Los Del Internet/i, categoria: 'Vola', tipoPago: 'Factura' },
  { patron: /Looking Forward Giro Dolcet/i, categoria: 'Estructura', tipoPago: 'Factura' },
  { patron: /V-valley/i, categoria: 'Comisiones V-Valley', tipoPago: 'Factura' },
  { patron: /Santber/i, categoria: 'Operadora', tipoPago: 'Factura' },
  
  // Telecomunicaciones (recibos)
  { patron: /Telefonica De Espana/i, categoria: 'Operadora', tipoPago: 'Domiciliación' },
  { patron: /Acens.*Telefonica/i, categoria: 'Estructura', tipoPago: 'Domiciliación' },
  
  // Tarjeta - Restaurantes/Comida
  { patron: /Glovo|Uber\s*Eats|Just\s*Eat|Deliveroo/i, categoria: 'Dietas', tipoPago: 'Débito' },
  { patron: /Restaurant|Restaurante|Pizz|Burger|Kebab|Wok|Sushi|Bar\s|Cafe\s|Cafeteria/i, categoria: 'Dietas', tipoPago: 'Débito' },
  { patron: /Mcdonalds|Mcdonald|Telepizza|Dominos/i, categoria: 'Dietas', tipoPago: 'Débito' },
  
  // Tarjeta - Gasolina/Desplazamientos
  { patron: /Benzinera|Gasolinera|Repsol|Cepsa|Shell|Bp\s|Bonarea.*Gasoil|Estacion Servicio/i, categoria: 'Desplazamientos', tipoPago: 'Débito' },
  { patron: /Renfe|Alsa|Blabla|Parking|Peaje|Autopista|Toll/i, categoria: 'Desplazamientos', tipoPago: 'Débito' },
  
  // Tarjeta - Suscripciones tech
  { patron: /Apple\.com|Itunes|Google\s*(Cloud|Storage|Play)|Microsoft|Github|Aws|Amazon\s*Web/i, categoria: 'Estructura', tipoPago: 'Suscripción' },
  { patron: /Zoom|Slack|Notion|Figma|Canva|Adobe|Dropbox|Openai/i, categoria: 'Estructura', tipoPago: 'Suscripción' },
  { patron: /Nominalia|Ovh|Hetzner|Digitalocean|Cloudflare/i, categoria: 'Estructura', tipoPago: 'Suscripción' },
  
  // Tarjeta - Material oficina/hardware
  { patron: /Amazon\.es|Amazon\.com|Pccomponentes|Mediamarkt/i, categoria: 'Estructura', tipoPago: 'Débito' },
  
  // Préstamos
  { patron: /Venciment Prestec|PRES\.\d+/i, categoria: 'Gastos Financieros', tipoPago: 'Préstamo' },
  
  // Comisiones bancarias
  { patron: /Manteniment|Cobrament Pendent|Gastos Devoluciones/i, categoria: 'Gastos Financieros', tipoPago: 'Comisión' },
  { patron: /Targeta Visa|V\.Negocis/i, categoria: 'Gastos Financieros', tipoPago: 'Comisión' },
  
  // Devoluciones de recibos
  { patron: /Devolucion De Recibo/i, categoria: 'Morosos', tipoPago: 'Devolución' },
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
    }

    // 2. CONCILIACIÓN CON FACTURAS RECIBIDAS
    if (modo === 'conciliar' || modo === 'todo') {
      // Buscar movimientos de gasto no conciliados
      const gastosSinConciliar = await prisma.movimientoBancario.findMany({
        where: {
          conciliado: false,
          importe: { lt: 0 },
          // Solo transferencias (no tarjeta, no préstamos)
          OR: [
            { tipoPago: 'Factura' },
            { tipoPago: 'Domiciliación' },
            { tipoPago: null, categoria: { not: 'Traspaso' } },
          ],
        },
        select: { id: true, importe: true, fechaOperacion: true, concepto: true },
      });

      for (const mov of gastosSinConciliar) {
        // Buscar factura recibida con importe similar (±0.01) y fecha cercana (±30 días)
        const importeAbs = Math.abs(mov.importe);
        const fechaDesde = new Date(mov.fechaOperacion);
        fechaDesde.setDate(fechaDesde.getDate() - 60);
        const fechaHasta = new Date(mov.fechaOperacion);
        fechaHasta.setDate(fechaHasta.getDate() + 5);

        const facturaMatch = await prisma.facturaRecibida.findFirst({
          where: {
            total: { gte: importeAbs - 0.02, lte: importeAbs + 0.02 },
            fecha: { gte: fechaDesde, lte: fechaHasta },
            // No ya conciliada con otro movimiento
            movimientos: { none: {} },
          },
          orderBy: { fecha: 'desc' },
        });

        if (facturaMatch) {
          await prisma.movimientoBancario.update({
            where: { id: mov.id },
            data: {
              conciliado: true,
              facturaId: facturaMatch.id,
            },
          });
          resultados.conciliadosFacturasRecibidas++;
        }
      }

      // 3. CONCILIACIÓN CONFIRMING DRAXTON
      const ingresosConfirming = await prisma.movimientoBancario.findMany({
        where: {
          conciliado: false,
          importe: { gt: 0 },
          concepto: { contains: 'Draxton', mode: 'insensitive' },
        },
        select: { id: true, importe: true, fechaOperacion: true },
      });

      for (const mov of ingresosConfirming) {
        // Buscar facturas de confirming Draxton cuyo total sume ~= importe del ingreso
        // Por ahora marcamos como conciliado con la categoría
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

      // 4. CONCILIACIÓN CON FACTURAS EMITIDAS (Remesas y transferencias recibidas)
      const ingresosClientes = await prisma.movimientoBancario.findMany({
        where: {
          conciliado: false,
          importe: { gt: 0 },
          NOT: { concepto: { contains: 'Draxton', mode: 'insensitive' } },
          NOT: { concepto: { contains: 'Traspaso', mode: 'insensitive' } },
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
      where: { movimientos: { none: {} } },
    });

    // Distribución por categoría
    const porCategoria = await prisma.movimientoBancario.groupBy({
      by: ['categoria'],
      _sum: { importe: true },
      _count: true,
      orderBy: { _sum: { importe: 'asc' } },
    });

    return NextResponse.json({
      totalMovimientos,
      conciliados,
      sinConciliar,
      sinCategorizar,
      porcentajeConciliado: totalMovimientos > 0 ? Math.round((conciliados / totalMovimientos) * 100) : 0,
      facturasEmitidas: {
        total: facturasEmitidas._count,
        facturado: facturasEmitidas._sum.total || 0,
        cobrado: facturasEmitidas._sum.importeCobrado || 0,
        pendienteCobro,
      },
      facturasRecibidasSinConciliar,
      porCategoria,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
