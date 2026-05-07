export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';

// GET /api/tarifas-web?seccion=empresa|particular
// Returns tarifas marked for web publication in the given section
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seccion = searchParams.get('seccion') || 'empresa';

    const where: any = {
      activa: true,
    };

    if (seccion === 'particular') {
      where.publicarWebParticular = true;
    } else {
      where.publicarWebEmpresa = true;
    }

    const tarifas = await prisma.tarifa.findMany({
      where,
      select: {
        id: true,
        tipoCliente: true,
        categoria: true,
        nombre: true,
        descripcionCorta: true,
        descripcionLarga: true,
        velocidad: true,
        velocidadBajada: true,
        velocidadSubida: true,
        fibraBajada: true,
        fibraSubida: true,
        datosIncluidos: true,
        minutosIncluidos: true,
        smsIncluidos: true,
        precioSinIva: true,
        precioConIva: true,
        permanencia: true,
        duracionPermanenciaMeses: true,
        garantia: true,
        destacada: true,
        esMovil: true,
        esFijo: true,
        esInternet: true,
        esTv: true,
        esCompuesta: true,
      },
      orderBy: [
        { destacada: 'desc' },
        { categoria: 'asc' },
        { orden: 'asc' },
        { nombre: 'asc' },
      ],
    });

    // Convert Decimal fields
    const tarifasConverted = tarifas.map(t => ({
      ...t,
      precioSinIva: Number(t.precioSinIva),
      precioConIva: Number(t.precioConIva),
    }));

    // Group by category
    const categorias: Record<string, typeof tarifasConverted> = {};
    for (const t of tarifasConverted) {
      const cat = t.categoria || 'OTROS';
      if (!categorias[cat]) categorias[cat] = [];
      categorias[cat].push(t);
    }

    return NextResponse.json({
      tarifas: tarifasConverted,
      categorias,
      total: tarifasConverted.length,
      ultimaActualizacion: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error obteniendo tarifas web:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
