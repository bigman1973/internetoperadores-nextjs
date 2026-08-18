import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get('tipo') || 'gastos'; // gastos | extras
  const anio = parseInt(searchParams.get('anio') || new Date().getFullYear().toString());
  const mes = searchParams.get('mes') ? parseInt(searchParams.get('mes')!) : null;
  const empleadoId = searchParams.get('empleadoId') || null;

  try {
    if (tipo === 'gastos') {
      const where: any = {};
      if (anio) {
        const start = new Date(anio, mes ? mes - 1 : 0, 1);
        const end = mes ? new Date(anio, mes, 1) : new Date(anio + 1, 0, 1);
        where.fecha = { gte: start, lt: end };
      }
      if (empleadoId) where.empleadoId = empleadoId;

      const gastos = await prisma.gastoEmpleado.findMany({
        where,
        include: { empleado: { select: { id: true, nombreCompleto: true, departamento: true } } },
        orderBy: { fecha: 'desc' }
      });

      // KPIs
      const totalImporte = gastos.reduce((s, g) => s + g.importe, 0);
      const pendientes = gastos.filter(g => g.estado === 'en_tramite').length;
      const aprobados = gastos.filter(g => g.estado === 'aprobado').length;
      const porTipo: Record<string, number> = {};
      gastos.forEach(g => { porTipo[g.tipo] = (porTipo[g.tipo] || 0) + g.importe; });
      const porEmpleado: Record<string, { nombre: string; total: number; count: number }> = {};
      gastos.forEach(g => {
        const name = g.empleado?.nombreCompleto || g.nombre;
        if (!porEmpleado[name]) porEmpleado[name] = { nombre: name, total: 0, count: 0 };
        porEmpleado[name].total += g.importe;
        porEmpleado[name].count++;
      });

      return NextResponse.json({
        gastos,
        kpis: {
          total: gastos.length,
          totalImporte: Math.round(totalImporte * 100) / 100,
          pendientes,
          aprobados,
          porTipo,
          porEmpleado: Object.values(porEmpleado).sort((a, b) => b.total - a.total),
        }
      });
    } else {
      // Horas extras
      const where: any = {};
      if (anio) {
        const start = new Date(anio, mes ? mes - 1 : 0, 1);
        const end = mes ? new Date(anio, mes, 1) : new Date(anio + 1, 0, 1);
        where.inicio = { gte: start, lt: end };
      }
      if (empleadoId) where.empleadoId = empleadoId;

      const extras = await prisma.horaExtraEmpleado.findMany({
        where,
        include: { empleado: { select: { id: true, nombreCompleto: true, departamento: true } } },
        orderBy: { inicio: 'desc' }
      });

      const totalMinutos = extras.reduce((s, h) => s + h.totalMinutos, 0);
      const pendientes = extras.filter(h => h.estado === 'en_tramite').length;
      const aprobados = extras.filter(h => ['aprobada', 'aprobado'].includes(h.estado)).length;
      const porEmpleado: Record<string, { nombre: string; totalMin: number; count: number }> = {};
      extras.forEach(h => {
        const name = h.empleado?.nombreCompleto || h.nombre;
        if (!porEmpleado[name]) porEmpleado[name] = { nombre: name, totalMin: 0, count: 0 };
        porEmpleado[name].totalMin += h.totalMinutos;
        porEmpleado[name].count++;
      });

      return NextResponse.json({
        extras,
        kpis: {
          total: extras.length,
          totalMinutos,
          totalHoras: `${Math.floor(totalMinutos / 60)}h ${totalMinutos % 60}m`,
          pendientes,
          aprobados,
          porEmpleado: Object.values(porEmpleado).sort((a, b) => b.totalMin - a.totalMin),
        }
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  try {
    if (action === 'aprobar_gasto') {
      await prisma.gastoEmpleado.update({
        where: { id: body.id },
        data: { estado: 'aprobado', gestionadoPor: session.user.name || session.user.email }
      });
      return NextResponse.json({ success: true });
    }
    if (action === 'denegar_gasto') {
      await prisma.gastoEmpleado.update({
        where: { id: body.id },
        data: { estado: 'denegado', gestionadoPor: session.user.name || session.user.email }
      });
      return NextResponse.json({ success: true });
    }
    if (action === 'aprobar_extra') {
      await prisma.horaExtraEmpleado.update({
        where: { id: body.id },
        data: { estado: 'aprobada', gestionadoPor: session.user.name || session.user.email }
      });
      return NextResponse.json({ success: true });
    }
    if (action === 'denegar_extra') {
      await prisma.horaExtraEmpleado.update({
        where: { id: body.id },
        data: { estado: 'denegada', gestionadoPor: session.user.name || session.user.email }
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Accion no reconocida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
