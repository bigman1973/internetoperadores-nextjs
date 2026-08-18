import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/imputaciones
 * Dashboard analítico de imputaciones
 * ?periodo=semana|mes|anio&fecha=2026-08-14&empleadoId=xxx&categoria=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'dashboard';

    if (action === 'categorias') {
      const categorias = await prisma.categoriaTimesheet.findMany({ orderBy: { orden: 'asc' } });
      return NextResponse.json({ categorias });
    }

    if (action === 'pendientes') {
      // Obtener todas las asignaciones activas con horas estimadas
      const asignaciones = await prisma.asignacionProyecto.findMany({
        where: { activa: true, horasEstimadas: { not: null, gt: 0 } },
        include: {
          empleado: { select: { id: true, nombreCompleto: true, departamento: true } },
          proyecto: { select: { id: true, nombre: true, tipo: true, estado: true } },
        },
      });
      // Obtener horas ya imputadas por empleado+proyecto
      const imputaciones = await prisma.imputacionHoras.groupBy({
        by: ['empleadoId', 'proyectoId'],
        where: { proyectoId: { not: null } },
        _sum: { horas: true },
      });
      const imputMap: Record<string, number> = {};
      imputaciones.forEach(g => {
        if (g.empleadoId && g.proyectoId) imputMap[`${g.empleadoId}_${g.proyectoId}`] = g._sum.horas || 0;
      });
      const pendientes = asignaciones.map(a => {
        const key = `${a.empleadoId}_${a.proyectoId}`;
        const horasImputadas = imputMap[key] || 0;
        const horasPendientes = Math.max(0, (a.horasEstimadas || 0) - horasImputadas);
        return {
          asignacionId: a.id,
          empleado: a.empleado,
          proyecto: a.proyecto,
          rol: a.rol,
          horasEstimadas: a.horasEstimadas,
          horasImputadas,
          horasPendientes,
        };
      }).filter(p => p.horasPendientes > 0);
      return NextResponse.json({ pendientes });
    }

    // Dashboard
    const periodo = searchParams.get('periodo') || 'mes';
    const fechaRef = searchParams.get('fecha') ? new Date(searchParams.get('fecha')!) : new Date();
    const empleadoId = searchParams.get('empleadoId');
    const categoria = searchParams.get('categoria');

    let startDate: Date, endDate: Date;
    if (periodo === 'semana') {
      const day = fechaRef.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      startDate = new Date(fechaRef);
      startDate.setDate(fechaRef.getDate() + diff);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
    } else if (periodo === 'anio') {
      startDate = new Date(fechaRef.getFullYear(), 0, 1);
      endDate = new Date(fechaRef.getFullYear(), 11, 31);
    } else {
      startDate = new Date(fechaRef.getFullYear(), fechaRef.getMonth(), 1);
      endDate = new Date(fechaRef.getFullYear(), fechaRef.getMonth() + 1, 0);
    }

    const where: any = {
      fecha: { gte: startDate, lte: endDate },
    };
    if (empleadoId) where.empleadoId = empleadoId;
    if (categoria) where.categoria = categoria;

    const imputaciones = await prisma.imputacionHoras.findMany({
      where,
      include: {
        empleado: { select: { id: true, nombreCompleto: true, departamento: true, costeHoraActual: true } },
        proyecto: { select: { id: true, nombre: true } },
      },
      orderBy: { fecha: 'desc' },
    });

    // Resúmenes
    const totalHoras = imputaciones.reduce((sum, imp) => sum + imp.horas, 0);
    const totalCoste = imputaciones.reduce((sum, imp) => {
      const coste = imp.costeImputado || (imp.empleado.costeHoraActual ? imp.empleado.costeHoraActual * imp.horas : 0);
      return sum + coste;
    }, 0);

    // Por empleado
    const porEmpleado: Record<string, { nombre: string; horas: number; coste: number }> = {};
    imputaciones.forEach(imp => {
      const key = imp.empleadoId;
      if (!porEmpleado[key]) porEmpleado[key] = { nombre: imp.empleado.nombreCompleto, horas: 0, coste: 0 };
      porEmpleado[key].horas += imp.horas;
      porEmpleado[key].coste += imp.costeImputado || (imp.empleado.costeHoraActual ? imp.empleado.costeHoraActual * imp.horas : 0);
    });

    // Por categoría
    const porCategoria: Record<string, { horas: number; coste: number }> = {};
    imputaciones.forEach(imp => {
      if (!porCategoria[imp.categoria]) porCategoria[imp.categoria] = { horas: 0, coste: 0 };
      porCategoria[imp.categoria].horas += imp.horas;
      porCategoria[imp.categoria].coste += imp.costeImputado || (imp.empleado.costeHoraActual ? imp.empleado.costeHoraActual * imp.horas : 0);
    });

    // Por cliente
    const porCliente: Record<string, { horas: number; coste: number }> = {};
    imputaciones.forEach(imp => {
      const cliente = imp.clienteNombre || 'Sin cliente (interno)';
      if (!porCliente[cliente]) porCliente[cliente] = { horas: 0, coste: 0 };
      porCliente[cliente].horas += imp.horas;
      porCliente[cliente].coste += imp.costeImputado || (imp.empleado.costeHoraActual ? imp.empleado.costeHoraActual * imp.horas : 0);
    });

    // Empleados activos (para filtro)
    const empleados = await prisma.empleado.findMany({
      where: { estado: 'ACTIVO' },
      select: { id: true, nombreCompleto: true, departamento: true },
      orderBy: { nombreCompleto: 'asc' },
    });

    return NextResponse.json({
      periodo: { startDate, endDate, tipo: periodo },
      kpis: { totalHoras, totalCoste, registros: imputaciones.length, empleadosActivos: Object.keys(porEmpleado).length },
      porEmpleado: Object.entries(porEmpleado).map(([id, data]) => ({ id, ...data })).sort((a, b) => b.horas - a.horas),
      porCategoria: Object.entries(porCategoria).map(([nombre, data]) => ({ nombre, ...data })).sort((a, b) => b.horas - a.horas),
      porCliente: Object.entries(porCliente).map(([nombre, data]) => ({ nombre, ...data })).sort((a, b) => b.horas - a.horas),
      imputaciones: imputaciones.slice(0, 100), // Limitar a 100 para rendimiento
      empleados,
    });
  } catch (error: any) {
    console.error('Error en GET /api/admin/imputaciones:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/imputaciones
 * Gestión de categorías
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'crear_categoria') {
      const { nombre, color, subcategorias, orden } = body;
      const cat = await prisma.categoriaTimesheet.create({
        data: { nombre, color: color || '#6366f1', subcategorias: subcategorias || [], orden: orden || 0 },
      });
      return NextResponse.json({ categoria: cat }, { status: 201 });
    }

    if (action === 'editar_categoria') {
      const { id, nombre, color, subcategorias, activa, orden } = body;
      const cat = await prisma.categoriaTimesheet.update({
        where: { id },
        data: { nombre, color, subcategorias, activa, orden },
      });
      return NextResponse.json({ categoria: cat });
    }

    if (action === 'eliminar_categoria') {
      await prisma.categoriaTimesheet.delete({ where: { id: body.id } });
      return NextResponse.json({ ok: true });
    }

    if (action === 'editar_imputacion') {
      const { id, empleadoId, fecha, horas, categoria, subcategoria, subcategoria2, subcategoria3, clienteNombre, clienteId, proyectoId, descripcion } = body;
      if (!id) return NextResponse.json({ error: 'ID de imputación requerido' }, { status: 400 });
      const partes = [subcategoria, subcategoria2, subcategoria3].filter(Boolean);
      const rutaCompleta = partes.length > 0 ? partes.join(' > ') : null;
      const empleado = await prisma.empleado.findUnique({ where: { id: empleadoId }, select: { costeHoraActual: true } });
      const costeImputado = empleado?.costeHoraActual ? empleado.costeHoraActual * parseFloat(horas) : null;

      const imputacion = await prisma.imputacionHoras.update({
        where: { id },
        data: {
          empleadoId,
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
          descripcion: descripcion || null,
          costeImputado,
        },
        include: {
          empleado: { select: { id: true, nombreCompleto: true } },
          proyecto: { select: { id: true, nombre: true } },
        },
      });
      return NextResponse.json({ imputacion });
    }

    if (action === 'eliminar_imputacion') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'ID de imputación requerido' }, { status: 400 });
      await prisma.imputacionHoras.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }

    if (action === 'imputar') {
      const { empleadoId, fecha, horas, categoria, subcategoria, subcategoria2, subcategoria3, clienteNombre, clienteId, proyectoId, descripcion } = body;
      if (!empleadoId || !fecha || !horas || !categoria) {
        return NextResponse.json({ error: 'Empleado, fecha, horas y categoría son obligatorios' }, { status: 400 });
      }
      // Construir ruta completa
      const partes = [subcategoria, subcategoria2, subcategoria3].filter(Boolean);
      const rutaCompleta = partes.length > 0 ? partes.join(' > ') : null;
      // Obtener coste/hora del empleado
      const empleado = await prisma.empleado.findUnique({ where: { id: empleadoId }, select: { costeHoraActual: true } });
      const costeImputado = empleado?.costeHoraActual ? empleado.costeHoraActual * parseFloat(horas) : null;

      const imputacion = await prisma.imputacionHoras.create({
        data: {
          empleadoId,
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
          descripcion: descripcion || null,
          costeImputado,
        },
        include: {
          empleado: { select: { id: true, nombreCompleto: true } },
          proyecto: { select: { id: true, nombre: true } },
        },
      });
      return NextResponse.json({ imputacion }, { status: 201 });
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (error: any) {
    console.error('Error en POST /api/admin/imputaciones:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
