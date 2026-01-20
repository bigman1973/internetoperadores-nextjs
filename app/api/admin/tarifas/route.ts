import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// POST /api/admin/tarifas - Crear nueva tarifa
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Solo SUPER_ADMIN, GERENTE y EDITOR pueden crear
    if (!['SUPER_ADMIN', 'GERENTE', 'EDITOR'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const data = await request.json();

    // Validar campos requeridos
    if (!data.tipoCliente || !data.categoria || !data.nombre || !data.precioSinIva || !data.precioConIva) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      );
    }

    // Crear tarifa
    const tarifa = await prisma.tarifa.create({
      data: {
        tipoCliente: data.tipoCliente,
        categoria: data.categoria,
        nombre: data.nombre,
        descripcionCorta: data.descripcionCorta || null,
        descripcionLarga: data.descripcionLarga || null,
        velocidad: data.velocidad || null,
        precioSinIva: data.precioSinIva,
        precioConIva: data.precioConIva,
        costeOperador: data.costeOperador || null,
        permanencia: data.permanencia || null,
        penalizacion: data.penalizacion || null,
        garantia: data.garantia || null,
        observaciones: data.observaciones || null,
        destacada: data.destacada || false,
        activa: data.activa !== undefined ? data.activa : true,
        createdById: session.user.id,
        updatedById: session.user.id,
      },
    });

    // Registrar en historial
    await prisma.historialCambio.create({
      data: {
        tarifaId: tarifa.id,
        usuarioId: session.user.id,
        accion: 'CREAR',
        cambios: {
          tarifa: tarifa.nombre,
          tipo: tarifa.tipoCliente,
        },
      },
    });

    return NextResponse.json(tarifa, { status: 201 });

  } catch (error) {
    console.error('Error creando tarifa:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// GET /api/admin/tarifas - Listar tarifas con filtros
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tipoCliente = searchParams.get('tipoCliente');
    const categoria = searchParams.get('categoria');
    const activa = searchParams.get('activa');
    const busqueda = searchParams.get('busqueda');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Construir filtros
    const where: any = {};
    
    if (tipoCliente && tipoCliente !== 'TODOS') {
      where.tipoCliente = tipoCliente;
    }
    
    if (categoria && categoria !== 'TODAS') {
      where.categoria = categoria;
    }
    
    if (activa !== null && activa !== 'TODAS') {
      where.activa = activa === 'true';
    }
    
    if (busqueda) {
      where.OR = [
        { nombre: { contains: busqueda } },
        { descripcionCorta: { contains: busqueda } },
        { categoria: { contains: busqueda } },
      ];
    }

    // Contar total
    const total = await prisma.tarifa.count({ where });

    // Obtener tarifas
    const tarifas = await prisma.tarifa.findMany({
      where,
      include: {
        createdBy: {
          select: { nombre: true, email: true },
        },
        updatedBy: {
          select: { nombre: true, email: true },
        },
      },
      orderBy: [
        { destacada: 'desc' },
        { orden: 'asc' },
        { createdAt: 'desc' },
      ],
      skip: (page - 1) * limit,
      take: limit,
    });

    return NextResponse.json({
      tarifas,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error('Error obteniendo tarifas:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
