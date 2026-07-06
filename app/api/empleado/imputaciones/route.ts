import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * GET /api/empleado/imputaciones
 * Obtener las imputaciones de horas del empleado autenticado
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const empleado = await prisma.empleado.findFirst({
      where: { email: session.user.email.toLowerCase() },
    });

    if (!empleado) {
      return NextResponse.json({ error: 'No se encontró tu perfil de empleado.' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const mes = parseInt(searchParams.get('mes') || String(new Date().getMonth() + 1));
    const anio = parseInt(searchParams.get('anio') || String(new Date().getFullYear()));

    // Obtener imputaciones del mes
    const startDate = new Date(anio, mes - 1, 1);
    const endDate = new Date(anio, mes, 0);

    const imputaciones = await prisma.imputacionHoras.findMany({
      where: {
        empleadoId: empleado.id,
        fecha: { gte: startDate, lte: endDate },
      },
      include: {
        proyecto: { select: { id: true, nombre: true, codigo: true } },
      },
      orderBy: { fecha: 'desc' },
    });

    // Obtener proyectos asignados al empleado
    const asignaciones = await prisma.asignacionProyecto.findMany({
      where: { empleadoId: empleado.id, activa: true },
      include: { proyecto: { select: { id: true, nombre: true, codigo: true } } },
    });

    // Resumen del mes
    const totalHoras = imputaciones.reduce((sum, imp) => sum + imp.horas, 0);
    const horasPorProyecto = imputaciones.reduce((acc, imp) => {
      const key = imp.proyecto.nombre;
      acc[key] = (acc[key] || 0) + imp.horas;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      empleado: { id: empleado.id, nombreCompleto: empleado.nombreCompleto },
      imputaciones,
      proyectosAsignados: asignaciones.map(a => a.proyecto),
      resumen: { totalHoras, horasPorProyecto, mes, anio },
    });
  } catch (error: any) {
    console.error('Error en GET /api/empleado/imputaciones:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/empleado/imputaciones
 * Crear una nueva imputación de horas
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const empleado = await prisma.empleado.findFirst({
      where: { email: session.user.email.toLowerCase() },
    });

    if (!empleado) {
      return NextResponse.json({ error: 'No se encontró tu perfil de empleado.' }, { status: 404 });
    }

    const body = await req.json();
    const { proyectoId, fecha, horas, descripcion } = body;

    if (!proyectoId || !fecha || !horas) {
      return NextResponse.json({ error: 'Proyecto, fecha y horas son obligatorios' }, { status: 400 });
    }

    if (horas <= 0 || horas > 24) {
      return NextResponse.json({ error: 'Las horas deben estar entre 0 y 24' }, { status: 400 });
    }

    const imputacion = await prisma.imputacionHoras.create({
      data: {
        empleadoId: empleado.id,
        proyectoId,
        fecha: new Date(fecha),
        horas: parseFloat(horas),
        descripcion: descripcion || null,
      },
      include: {
        proyecto: { select: { id: true, nombre: true, codigo: true } },
      },
    });

    return NextResponse.json({ imputacion }, { status: 201 });
  } catch (error: any) {
    console.error('Error en POST /api/empleado/imputaciones:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
