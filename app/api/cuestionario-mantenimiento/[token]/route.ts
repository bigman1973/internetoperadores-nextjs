import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET: Obtener datos del cuestionario (público, sin auth)
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    // Buscar el lead por token en el campo JSON datos
    const leads = await prisma.leadSolucion.findMany({
      where: { tipo: 'MANTENIMIENTO_IT' },
    });

    const lead = leads.find((l: any) => {
      const datos = l.datos as any;
      return datos?.cuestionarioTecnico?.token === token;
    });

    if (!lead) {
      return NextResponse.json({ error: 'Cuestionario no encontrado o enlace inválido' }, { status: 404 });
    }

    const datos = lead.datos as any;
    const cuestionario = datos.cuestionarioTecnico;

    // Si ya fue completado, indicarlo
    if (cuestionario.estado === 'COMPLETADO') {
      return NextResponse.json({
        empresa: lead.empresa,
        estado: 'COMPLETADO',
        completadoAt: cuestionario.completadoAt,
        message: 'Este cuestionario ya fue completado. Gracias por su colaboración.',
      });
    }

    return NextResponse.json({
      empresa: lead.empresa,
      contacto: lead.nombre,
      estado: cuestionario.estado,
    });
  } catch (error: any) {
    console.error('[CUESTIONARIO-PUBLIC-GET] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// POST: Guardar respuestas del cuestionario (público, sin auth)
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await request.json();

    // Buscar el lead por token
    const leads = await prisma.leadSolucion.findMany({
      where: { tipo: 'MANTENIMIENTO_IT' },
    });

    const lead = leads.find((l: any) => {
      const datos = l.datos as any;
      return datos?.cuestionarioTecnico?.token === token;
    });

    if (!lead) {
      return NextResponse.json({ error: 'Cuestionario no encontrado o enlace inválido' }, { status: 404 });
    }

    const datos = lead.datos as any;

    // Verificar que no esté ya completado
    if (datos.cuestionarioTecnico.estado === 'COMPLETADO') {
      return NextResponse.json({ error: 'Este cuestionario ya fue completado' }, { status: 400 });
    }

    // Guardar respuestas
    const datosActualizados = {
      ...datos,
      cuestionarioTecnico: {
        ...datos.cuestionarioTecnico,
        estado: 'COMPLETADO',
        completadoAt: new Date().toISOString(),
        respuestas: body.respuestas,
      },
    };

    await prisma.leadSolucion.update({
      where: { id: lead.id },
      data: {
        datos: datosActualizados,
        estado: 'CUESTIONARIO_COMPLETADO',
        fechaCuestionarioCompletado: new Date(),
        // Actualizar prioridad a ALTA si estaba en MEDIA
        ...(lead.prioridad === 'MEDIA' ? { prioridad: 'ALTA' } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Cuestionario completado correctamente. Nos pondremos en contacto con usted en breve.',
    });
  } catch (error: any) {
    console.error('[CUESTIONARIO-PUBLIC-POST] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
