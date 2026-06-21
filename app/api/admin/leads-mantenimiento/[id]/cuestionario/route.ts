import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// GET: Obtener el estado del cuestionario (token, si fue completado, respuestas)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const lead = await prisma.leadSolucion.findUnique({ where: { id } });

    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    const datos = lead.datos as any;
    const cuestionario = datos?.cuestionarioTecnico || null;

    return NextResponse.json({
      token: cuestionario?.token || null,
      estado: cuestionario?.estado || 'NO_ENVIADO', // NO_ENVIADO, ENVIADO, COMPLETADO
      respuestas: cuestionario?.respuestas || null,
      completadoAt: cuestionario?.completadoAt || null,
      enviadoAt: cuestionario?.enviadoAt || null,
    });
  } catch (error: any) {
    console.error('[CUESTIONARIO-GET] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// POST: Generar un token único para el cuestionario
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const lead = await prisma.leadSolucion.findUnique({ where: { id } });

    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    const datos = lead.datos as any;

    // Si ya tiene token, devolver el existente
    if (datos?.cuestionarioTecnico?.token) {
      return NextResponse.json({
        token: datos.cuestionarioTecnico.token,
        url: `/cuestionario-mantenimiento/${datos.cuestionarioTecnico.token}`,
        estado: datos.cuestionarioTecnico.estado,
      });
    }

    // Generar token único
    const token = `MIT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    // Guardar token en el lead
    const datosActualizados = {
      ...datos,
      cuestionarioTecnico: {
        token,
        estado: 'ENVIADO',
        enviadoAt: new Date().toISOString(),
        enviadoPor: session.user?.email || 'admin',
        respuestas: null,
        completadoAt: null,
      },
    };

    await prisma.leadSolucion.update({
      where: { id },
      data: { datos: datosActualizados },
    });

    return NextResponse.json({
      token,
      url: `/cuestionario-mantenimiento/${token}`,
      estado: 'ENVIADO',
    });
  } catch (error: any) {
    console.error('[CUESTIONARIO-POST] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
