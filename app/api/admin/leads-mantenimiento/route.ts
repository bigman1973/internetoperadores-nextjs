import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tipoNegocio = searchParams.get('tipoNegocio');
  const estado = searchParams.get('estado');
  const prioridad = searchParams.get('prioridad');
  const buscar = searchParams.get('buscar');
  const conOferta = searchParams.get('conOferta'); // 'si' | 'no' | null

  try {
    // Filtro base: solo leads de MANTENIMIENTO_IT
    const where: any = { tipo: 'MANTENIMIENTO_IT' };

    if (estado) where.estado = estado;
    if (prioridad) where.prioridad = prioridad;
    if (buscar) {
      where.OR = [
        { nombre: { contains: buscar, mode: 'insensitive' } },
        { empresa: { contains: buscar, mode: 'insensitive' } },
        { email: { contains: buscar, mode: 'insensitive' } },
      ];
    }

    const leads = await prisma.leadSolucion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Filtrar por tipoNegocio y conOferta en memoria (campo JSON)
    let filteredLeads = leads;

    if (tipoNegocio) {
      filteredLeads = filteredLeads.filter((lead: any) => {
        const datos = lead.datos as any;
        return datos?.tipoNegocio === tipoNegocio;
      });
    }

    if (conOferta === 'si') {
      filteredLeads = filteredLeads.filter((lead: any) => {
        const datos = lead.datos as any;
        return !!datos?.ofertaGenerada;
      });
    } else if (conOferta === 'no') {
      filteredLeads = filteredLeads.filter((lead: any) => {
        const datos = lead.datos as any;
        return !datos?.ofertaGenerada;
      });
    }

    // Estadísticas específicas de mantenimiento
    const allMantenimiento = leads;
    const stats = {
      total: allMantenimiento.length,
      nuevos: allMantenimiento.filter((l: any) => l.estado === 'NUEVO').length,
      enProceso: allMantenimiento.filter((l: any) => l.estado === 'EN_PROCESO').length,
      presupuestoEnviado: allMantenimiento.filter((l: any) => l.estado === 'PRESUPUESTO_ENVIADO').length,
      ganados: allMantenimiento.filter((l: any) => l.estado === 'GANADO' || l.estado === 'CERRADO_GANADO').length,
      perdidos: allMantenimiento.filter((l: any) => l.estado === 'PERDIDO' || l.estado === 'CERRADO_PERDIDO').length,
      conOferta: allMantenimiento.filter((l: any) => !!(l.datos as any)?.ofertaGenerada).length,
      sinOferta: allMantenimiento.filter((l: any) => !(l.datos as any)?.ofertaGenerada).length,
      // Por tipo de negocio
      porTipo: {
        FARMACIA: allMantenimiento.filter((l: any) => (l.datos as any)?.tipoNegocio === 'FARMACIA').length,
        HORECA: allMantenimiento.filter((l: any) => (l.datos as any)?.tipoNegocio === 'HORECA').length,
        PYME: allMantenimiento.filter((l: any) => (l.datos as any)?.tipoNegocio === 'PYME').length,
        MEDIANA_GRANDE: allMantenimiento.filter((l: any) => (l.datos as any)?.tipoNegocio === 'MEDIANA_GRANDE').length,
      },
    };

    return NextResponse.json({ leads: filteredLeads, stats });
  } catch (error: any) {
    console.error('Error al obtener leads mantenimiento:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
