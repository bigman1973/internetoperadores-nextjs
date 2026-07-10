import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// PATCH - Actualizar categoría/imputación de un movimiento
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { categoria, tipoPago, metodoPago, conciliado, facturaId, gastoId, crearRegla, pendienteFactura, pagoACuentaVola, facturaEmitidaId, notaConciliacion, tipoDocumento, documentoRecibido, entregaACuentaEmpleadoId, tipoEntrega } = body;

    const data: any = {};
    if (categoria !== undefined) data.categoria = categoria;
    if (tipoPago !== undefined) data.tipoPago = tipoPago;
    if (metodoPago !== undefined) data.metodoPago = metodoPago;
    if (conciliado !== undefined) data.conciliado = conciliado;
    if (facturaId !== undefined) data.facturaId = facturaId;
    if (gastoId !== undefined) data.gastoId = gastoId;
    if (pendienteFactura !== undefined) data.pendienteFactura = pendienteFactura;
    if (pagoACuentaVola !== undefined) {
      data.pagoACuentaVola = pagoACuentaVola;
      // Si se marca como pago a cuenta Vola, se concilia automáticamente
      if (pagoACuentaVola) {
        data.conciliado = true;
        data.categoria = 'Vola';
        data.tipoPago = 'Pago a cuenta';
      }
    }
    if (facturaEmitidaId !== undefined) {
      data.facturaEmitidaId = facturaEmitidaId;
      // Si se vincula con factura emitida, se concilia y se marca la factura como cobrada
      if (facturaEmitidaId) {
        data.conciliado = true;
      }
    }
    if (notaConciliacion !== undefined) data.notaConciliacion = notaConciliacion;
    if (tipoDocumento !== undefined) data.tipoDocumento = tipoDocumento;
    if (documentoRecibido !== undefined) data.documentoRecibido = documentoRecibido;
    if (tipoEntrega !== undefined && entregaACuentaEmpleadoId === undefined) data.tipoEntrega = tipoEntrega;
    if (entregaACuentaEmpleadoId !== undefined) {
      data.entregaACuentaEmpleadoId = entregaACuentaEmpleadoId;
      if (tipoEntrega !== undefined) data.tipoEntrega = tipoEntrega;
      // Si se marca como entrega a cuenta, se concilia automáticamente
      if (entregaACuentaEmpleadoId) {
        data.conciliado = true;
        if (tipoEntrega === 'coste_empresa') {
          data.categoria = 'Sueldos y Salarios';
          data.tipoPago = 'Coste empresa';
        } else {
          data.categoria = 'Entrega a cuenta';
          data.tipoPago = 'Anticipo';
        }
      }
    }

    const movimiento = await prisma.movimientoBancario.update({
      where: { id },
      data,
      include: { cuenta: true },
    });

    // Si se vincula con factura emitida, marcarla como cobrada
    if (facturaEmitidaId && facturaEmitidaId !== null) {
      await prisma.facturaEmitida.update({
        where: { id: facturaEmitidaId },
        data: {
          estado: 'COBRADA',
          importeCobrado: movimiento.importe,
          fechaCobro: movimiento.fechaOperacion,
        },
      });
    }

    // Si se pide crear regla de imputación automática
    if (crearRegla && categoria) {
      // Extraer patrón del concepto (primeras palabras significativas)
      const patron = extraerPatron(movimiento.concepto);
      if (patron) {
        await prisma.reglaImputacion.upsert({
          where: { id: `${patron}-${categoria}` },
          update: {
            confianza: { increment: 0.1 },
            vecesUsada: { increment: 1 },
          },
          create: {
            patron,
            banco: movimiento.cuenta.banco,
            imputacion: categoria,
            tipoPago: tipoPago || null,
            confianza: 0.7,
            vecesUsada: 1,
          },
        });
      }
    }

    return NextResponse.json({ movimiento });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function extraerPatron(concepto: string): string | null {
  // Eliminar números de referencia, fechas y caracteres especiales
  const limpio = concepto
    .replace(/\d{6,}/g, '') // Eliminar números largos (referencias)
    .replace(/\d{2}\/\d{2}\/\d{2,4}/g, '') // Eliminar fechas
    .replace(/\s+/g, ' ')
    .trim();

  // Tomar las primeras 3-4 palabras significativas
  const palabras = limpio.split(' ').filter(p => p.length > 2);
  if (palabras.length === 0) return null;

  return palabras.slice(0, 4).join(' ').toLowerCase();
}
