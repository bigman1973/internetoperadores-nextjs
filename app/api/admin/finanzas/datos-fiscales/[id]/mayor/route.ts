import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/finanzas/datos-fiscales/[id]/mayor
 * Devuelve un "mayor contable" de la entidad fiscal:
 * - Timeline cronológico combinado de movimientos bancarios + facturas recibidas/emitidas
 * - Saldo acumulado (como un extracto bancario pero del proveedor/cliente)
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const anio = parseInt(searchParams.get('anio') || new Date().getFullYear().toString());

    const entidad = await prisma.entidadFiscal.findUnique({
      where: { id },
    });

    if (!entidad) {
      return NextResponse.json({ error: 'Entidad no encontrada' }, { status: 404 });
    }

    const fechaInicio = new Date(anio, 0, 1);
    const fechaFin = new Date(anio, 11, 31, 23, 59, 59);

    // 1. Obtener movimientos bancarios de esta entidad en el año
    const movimientos = await prisma.movimientoBancario.findMany({
      where: {
        entidadFiscalId: id,
        fechaOperacion: { gte: fechaInicio, lte: fechaFin },
      },
      orderBy: { fechaOperacion: 'asc' },
      select: {
        id: true,
        fechaOperacion: true,
        concepto: true,
        importe: true,
        conciliado: true,
        tipoDocumento: true,
        facturaId: true,
        factura: { select: { id: true, numFactura: true, total: true } },
        cuenta: { select: { banco: true, alias: true } },
      },
    });

    // 2. Obtener facturas recibidas de esta entidad (por CIF) en el año
    let facturasRecibidas: any[] = [];
    if (entidad.nifCif) {
      facturasRecibidas = await prisma.$queryRawUnsafe(`
        SELECT id, num_factura, proveedor, total, fecha, fecha_vencimiento, cif
        FROM facturas_recibidas
        WHERE cif = $1 AND fecha >= $2 AND fecha <= $3
        ORDER BY fecha ASC
      `, entidad.nifCif, fechaInicio, fechaFin);
    }

    // 3. Obtener facturas emitidas de esta entidad (por CIF o nombre) en el año
    let facturasEmitidas: any[] = [];
    if (entidad.tipo === 'CLIENTE') {
      const orConditions: any[] = [];
      if (entidad.nifCif) orConditions.push({ cif: entidad.nifCif });
      if (entidad.razonSocial) orConditions.push({ cliente: { equals: entidad.razonSocial, mode: 'insensitive' } });
      if (entidad.nombreComercial) orConditions.push({ cliente: { equals: entidad.nombreComercial, mode: 'insensitive' } });

      if (orConditions.length > 0) {
        facturasEmitidas = await prisma.facturaEmitida.findMany({
          where: {
            OR: orConditions,
            fecha: { gte: fechaInicio, lte: fechaFin },
          },
          orderBy: { fecha: 'asc' },
          select: {
            id: true,
            numFactura: true,
            fecha: true,
            total: true,
            estado: true,
            formaCobro: true,
          },
        });
      }
    }

    // 4. Construir timeline unificado
    type LineaMayor = {
      tipo: 'movimiento' | 'factura_recibida' | 'factura_emitida';
      id: string;
      fecha: string;
      concepto: string;
      debe: number; // Lo que nos deben / cargos
      haber: number; // Lo que pagamos / abonos
      saldo: number;
      conciliado: boolean;
      vinculadoA: string | null;
      banco: string | null;
    };

    const lineas: LineaMayor[] = [];

    // Facturas recibidas = DEBE (nos cobran, deuda con proveedor)
    for (const fr of facturasRecibidas) {
      lineas.push({
        tipo: 'factura_recibida',
        id: fr.id,
        fecha: fr.fecha?.toISOString() || '',
        concepto: `Factura ${fr.num_factura || ''} - ${fr.proveedor || ''}`,
        debe: Number(fr.total) || 0,
        haber: 0,
        saldo: 0,
        conciliado: false,
        vinculadoA: null,
        banco: null,
      });
    }

    // Facturas emitidas = DEBE (nos deben, crédito con cliente)
    for (const fe of facturasEmitidas) {
      lineas.push({
        tipo: 'factura_emitida',
        id: fe.id,
        fecha: fe.fecha?.toISOString() || '',
        concepto: `Factura emitida ${fe.numFactura || ''} (${fe.formaCobro || ''})`,
        debe: Number(fe.total) || 0,
        haber: 0,
        saldo: 0,
        conciliado: fe.estado === 'COBRADA',
        vinculadoA: null,
        banco: null,
      });
    }

    // Movimientos bancarios = HABER si es pago (importe < 0), DEBE si es cobro (importe > 0)
    for (const mov of movimientos) {
      const esPago = mov.importe < 0;
      lineas.push({
        tipo: 'movimiento',
        id: mov.id,
        fecha: mov.fechaOperacion.toISOString(),
        concepto: mov.concepto,
        debe: esPago ? 0 : Number(mov.importe),
        haber: esPago ? Math.abs(Number(mov.importe)) : 0,
        saldo: 0,
        conciliado: mov.conciliado,
        vinculadoA: mov.factura?.numFactura || null,
        banco: mov.cuenta?.alias || mov.cuenta?.banco || null,
      });
    }

    // Ordenar cronológicamente
    lineas.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    // Calcular saldo acumulado
    let saldoAcumulado = 0;
    for (const linea of lineas) {
      saldoAcumulado += linea.debe - linea.haber;
      linea.saldo = saldoAcumulado;
    }

    // Resumen
    const totalDebe = lineas.reduce((sum, l) => sum + l.debe, 0);
    const totalHaber = lineas.reduce((sum, l) => sum + l.haber, 0);

    return NextResponse.json({
      entidad: {
        id: entidad.id,
        razonSocial: entidad.razonSocial,
        nifCif: entidad.nifCif,
        tipo: entidad.tipo,
        cuentaContableA3: entidad.cuentaContableA3,
      },
      anio,
      lineas,
      resumen: {
        totalDebe,
        totalHaber,
        saldoFinal: saldoAcumulado,
        numLineas: lineas.length,
        numMovimientos: movimientos.length,
        numFacturasRecibidas: facturasRecibidas.length,
        numFacturasEmitidas: facturasEmitidas.length,
      },
    });
  } catch (error: any) {
    console.error('Error mayor contable:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
