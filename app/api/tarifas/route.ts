export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';

// GET /api/tarifas - Obtener tarifas públicas (solo activas)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tipoCliente = searchParams.get('tipoCliente');
    const categoria = searchParams.get('categoria');
    const busqueda = searchParams.get('busqueda');
    const destacadas = searchParams.get('destacadas');

    // Construir filtros
    const where: any = {
      activa: true, // Solo tarifas activas
    };
    
    if (tipoCliente) {
      where.tipoCliente = tipoCliente;
    }
    
    if (categoria && categoria !== 'TODAS') {
      where.categoria = categoria;
    }
    
    if (destacadas === 'true') {
      where.destacada = true;
    }
    
    if (busqueda) {
      where.OR = [
        { nombre: { contains: busqueda } },
        { descripcionCorta: { contains: busqueda } },
        { categoria: { contains: busqueda } },
        { velocidad: { contains: busqueda } },
      ];
    }

    // Obtener tarifas
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
        precioSinIva: true,
        precioConIva: true,
        permanencia: true,
        garantia: true,
        destacada: true,
        // NO incluir: costeOperador, observaciones (internos)
      },
      orderBy: [
        { destacada: 'desc' },
        { orden: 'asc' },
        { nombre: 'asc' },
      ],
    });

    return NextResponse.json({ tarifas });

  } catch (error) {
    console.error('Error obteniendo tarifas:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
