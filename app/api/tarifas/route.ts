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
    
    // Usar publicarWebParticular/publicarWebEmpresa en lugar de tipoCliente
    // para que muestre las mismas tarifas que la web pública
    if (tipoCliente === 'PARTICULAR') {
      where.publicarWebParticular = true;
    } else if (tipoCliente === 'EMPRESA') {
      where.publicarWebEmpresa = true;
    }
    
    if (categoria && categoria !== 'TODAS') {
      where.categoria = categoria;
    }
    
    if (destacadas === 'true') {
      where.destacada = true;
    }
    
    if (busqueda) {
      where.OR = [
        { nombre: { contains: busqueda, mode: 'insensitive' } },
        { nombreComercial: { contains: busqueda, mode: 'insensitive' } },
        { descripcionCorta: { contains: busqueda, mode: 'insensitive' } },
        { categoria: { contains: busqueda, mode: 'insensitive' } },
        { velocidad: { contains: busqueda, mode: 'insensitive' } },
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
        nombreComercial: true,
        descripcionCorta: true,
        descripcionLarga: true,
        velocidad: true,
        precioSinIva: true,
        precioConIva: true,
        cuotaAlta: true,
        permanencia: true,
        garantia: true,
        destacada: true,
        subcategoria: true,
        // NO incluir: costeOperador, observaciones (internos)
      },
      orderBy: [
        { destacada: 'desc' },
        { orden: 'asc' },
        { precioConIva: 'asc' },
      ],
    });

    // Obtener categorías disponibles para el filtro
    const categorias = [...new Set(tarifas.map(t => t.categoria))].sort();

    return NextResponse.json({ tarifas, categorias });

  } catch (error) {
    console.error('Error obteniendo tarifas:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
