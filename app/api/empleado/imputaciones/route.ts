import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { resolveEmpleado } from '@/lib/empleado-impersonation';
import { normalizeCommercialInput } from '@/lib/imputaciones-comercial';

/**
 * GET /api/empleado/imputaciones
 * Obtener las imputaciones de la semana o mes del empleado
 * ?vista=semanal|mensual&fecha=2026-08-14
 */
export async function GET(req: NextRequest) {
  try {
    const { empleado, isImpersonating, error, status } = await resolveEmpleado(req);
    if (!empleado) {
      return NextResponse.json({ error }, { status });
    }

    const { searchParams } = new URL(req.url);
    const vista = searchParams.get('vista') || 'semanal';
    const fechaRef = searchParams.get('fecha') ? new Date(searchParams.get('fecha')!) : new Date();

    let startDate: Date, endDate: Date;

    if (vista === 'semanal') {
      // Lunes de la semana
      const day = fechaRef.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      startDate = new Date(fechaRef);
      startDate.setDate(fechaRef.getDate() + diff);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else {
      const mes = parseInt(searchParams.get('mes') || String(fechaRef.getMonth() + 1));
      const anio = parseInt(searchParams.get('anio') || String(fechaRef.getFullYear()));
      startDate = new Date(anio, mes - 1, 1);
      endDate = new Date(anio, mes, 0, 23, 59, 59);
    }

    const imputaciones = await prisma.imputacionHoras.findMany({
      where: {
        empleadoId: empleado.id,
        fecha: { gte: startDate, lte: endDate },
      },
      include: {
        proyecto: { select: { id: true, nombre: true, codigo: true } },
      },
      orderBy: { fecha: 'asc' },
    });

    // Categorías activas
    const categorias = await prisma.categoriaTimesheet.findMany({
      where: { activa: true },
      orderBy: { orden: 'asc' },
    });

    // Resumen
    const totalHoras = imputaciones.reduce((sum, imp) => sum + imp.horas, 0);
    const horasPorCategoria = imputaciones.reduce((acc, imp) => {
      acc[imp.categoria] = (acc[imp.categoria] || 0) + imp.horas;
      return acc;
    }, {} as Record<string, number>);

    // Proyectos asignados al empleado (para el selector) con horas pendientes
    const asignaciones = await prisma.asignacionProyecto.findMany({
      where: { empleadoId: empleado.id, activa: true },
      include: { proyecto: { select: { id: true, nombre: true, codigo: true, tipo: true } } },
    });

    // Calcular horas ya imputadas por proyecto para este empleado
    const imputacionesPorProyecto = await prisma.imputacionHoras.groupBy({
      by: ['proyectoId'],
      where: { empleadoId: empleado.id, proyectoId: { not: null } },
      _sum: { horas: true },
    });
    const horasImputadasMap: Record<string, number> = {};
    imputacionesPorProyecto.forEach(g => {
      if (g.proyectoId) horasImputadasMap[g.proyectoId] = g._sum.horas || 0;
    });

    const proyectosConPendientes = asignaciones.map(a => ({
      ...a.proyecto,
      horasEstimadas: a.horasEstimadas || 0,
      horasImputadas: horasImputadasMap[a.proyectoId] || 0,
      horasPendientes: Math.max(0, (a.horasEstimadas || 0) - (horasImputadasMap[a.proyectoId] || 0)),
      rol: a.rol,
    }));

    return NextResponse.json({
      empleado: { id: empleado.id, nombreCompleto: empleado.nombreCompleto, email: empleado.email },
      imputaciones,
      categorias,
      proyectosAsignados: proyectosConPendientes,
      resumen: { totalHoras, horasPorCategoria, startDate, endDate },
      isImpersonating,
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
    const { empleado, error, status } = await resolveEmpleado(req);
    if (!empleado) {
      return NextResponse.json({ error }, { status });
    }

    const body = await req.json();
    const { fecha, horas, categoria, subcategoria, subcategoria2, subcategoria3, clienteNombre, clienteId, proyectoId, descripcion } = body;

    if (!fecha || !horas || !categoria) {
      return NextResponse.json({ error: 'Fecha, horas y categoría son obligatorios' }, { status: 400 });
    }

    if (horas <= 0 || horas > 24) {
      return NextResponse.json({ error: 'Las horas deben estar entre 0 y 24' }, { status: 400 });
    }

    const commercialData = normalizeCommercialInput(body, categoria);
    // Construir ruta completa
    const partes = [subcategoria, subcategoria2, subcategoria3].filter(Boolean);
    const rutaCompleta = partes.length > 0 ? partes.join(' > ') : null;

    // Calcular coste imputado si el empleado tiene costeHora
    const costeImputado = empleado.costeHoraActual ? empleado.costeHoraActual * parseFloat(horas) : null;

    const imputacion = await prisma.imputacionHoras.create({
      data: {
        empleadoId: empleado.id,
        fecha: new Date(fecha),
        horas: parseFloat(horas),
        categoria,
        subcategoria: subcategoria || null,
        subcategoria2: subcategoria2 || null,
        subcategoria3: subcategoria3 || null,
        rutaCompleta,
        clienteNombre: clienteNombre || null,
        clienteId: clienteId ? parseInt(clienteId) : null,
        proyectoId: proyectoId || null,
        descripcion: descripcion?.trim()?.slice(0, 2000) || null,
        costeImputado,
        ...commercialData,
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

/**
 * DELETE /api/empleado/imputaciones?id=xxx
 * Eliminar una imputación
 */
export async function DELETE(req: NextRequest) {
  try {
    const { empleado, error, status } = await resolveEmpleado(req);
    if (!empleado) {
      return NextResponse.json({ error }, { status });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    // Verificar que la imputación pertenece al empleado
    const imp = await prisma.imputacionHoras.findFirst({
      where: { id, empleadoId: empleado.id },
    });
    if (!imp) {
      return NextResponse.json({ error: 'Imputación no encontrada' }, { status: 404 });
    }

    await prisma.imputacionHoras.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error en DELETE /api/empleado/imputaciones:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
