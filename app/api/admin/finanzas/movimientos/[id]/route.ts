import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// PATCH - Actualizar categoría/imputación de un movimiento
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await req.json();
    const { categoria, tipoPago, metodoPago, conciliado, facturaId, gastoId, crearRegla } = body;

    const data: any = {};
    if (categoria !== undefined) data.categoria = categoria;
    if (tipoPago !== undefined) data.tipoPago = tipoPago;
    if (metodoPago !== undefined) data.metodoPago = metodoPago;
    if (conciliado !== undefined) data.conciliado = conciliado;
    if (facturaId !== undefined) data.facturaId = facturaId;
    if (gastoId !== undefined) data.gastoId = gastoId;

    const movimiento = await prisma.movimientoBancario.update({
      where: { id },
      data,
      include: { cuenta: true },
    });

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
