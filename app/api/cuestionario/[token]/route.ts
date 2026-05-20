import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generarValoracionConIA, DatosLead, RespuestaCuestionario } from '@/lib/propuesta/generar-valoracion';
import { generarPDFHtml } from '@/lib/propuesta/generar-pdf-html';

export const dynamic = 'force-dynamic';

// Función que genera la propuesta en background
async function generarPropuestaEnBackground(leadId: string, cuestionarioId: string) {
  try {
    const lead = await prisma.leadMigracionWeb.findUnique({
      where: { id: leadId },
      include: {
        cuestionario: {
          include: {
            respuestas: { orderBy: { numeroPregunta: 'asc' } },
          },
        },
      },
    });

    if (!lead || !lead.cuestionario) return;

    const datosLead: DatosLead = {
      empresa: lead.nombreEmpresa,
      contactoNombre: lead.contacto || lead.cuestionario.contactoNombre || '',
      contactoEmail: lead.email || lead.cuestionario.contactoEmail || '',
      telefono: lead.telefono || '',
      sector: lead.sector || lead.cuestionario.sector || '',
      urlWebActual: lead.urlWebActual,
      frustracionActual: lead.frustracionActual,
      objetivos: lead.objetivos,
      respuestasSector: lead.respuestasSector,
      softwareActual: lead.softwareActual,
      necesitaIntegracion: lead.necesitaIntegracion || false,
      tieneApi: lead.tieneApi,
      datosIntegracion: lead.datosIntegracion,
      presupuesto: lead.presupuesto,
      fechaLimite: lead.fechaLimite,
    };

    const respuestas: RespuestaCuestionario[] = lead.cuestionario.respuestas.map((r) => ({
      bloque: r.bloque,
      numeroPregunta: r.numeroPregunta,
      pregunta: r.pregunta,
      respuesta: r.respuesta,
    }));

    // Generar valoración con IA
    const valoracion = await generarValoracionConIA(datosLead, respuestas);

    // Actualizar el lead con la info de la propuesta generada
    await prisma.leadMigracionWeb.update({
      where: { id: leadId },
      data: {
        informePdfUrl: `propuesta-generada:${new Date().toISOString()}`,
        notas: `Propuesta generada automáticamente. Total: ${valoracion.totalHoras}h / ${valoracion.totalPrecio.toLocaleString('es-ES')}€`,
      },
    });

    console.log(`Propuesta generada para lead ${leadId}: ${valoracion.totalHoras}h / ${valoracion.totalPrecio}€`);
  } catch (error) {
    console.error('Error en generarPropuestaEnBackground:', error);
  }
}

// GET: Obtener cuestionario por token (público, sin auth)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const cuestionario = await prisma.cuestionarioPrivado.findUnique({
      where: { token },
      include: {
        respuestas: { orderBy: { numeroPregunta: 'asc' } },
      },
    });

    if (!cuestionario) {
      return NextResponse.json({ error: 'Cuestionario no encontrado' }, { status: 404 });
    }

    // No devolver datos sensibles
    return NextResponse.json({
      id: cuestionario.id,
      nombreEmpresa: cuestionario.nombreEmpresa,
      sector: cuestionario.sector,
      titulo: cuestionario.titulo,
      descripcion: cuestionario.descripcion,
      preguntas: cuestionario.preguntas,
      estado: cuestionario.estado,
      respuestas: cuestionario.respuestas.map(r => ({
        bloque: r.bloque,
        numeroPregunta: r.numeroPregunta,
        pregunta: r.pregunta,
        respuesta: r.respuesta,
      })),
    });
  } catch (error: any) {
    console.error('Error al obtener cuestionario:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// POST: Enviar respuestas del cuestionario (público, sin auth)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const cuestionario = await prisma.cuestionarioPrivado.findUnique({
      where: { token },
    });

    if (!cuestionario) {
      return NextResponse.json({ error: 'Cuestionario no encontrado' }, { status: 404 });
    }

    if (cuestionario.estado === 'COMPLETADO') {
      return NextResponse.json({ error: 'Este cuestionario ya fue completado' }, { status: 400 });
    }

    const body = await request.json();
    const { respuestas } = body;

    if (!respuestas || !Array.isArray(respuestas)) {
      return NextResponse.json({ error: 'Formato de respuestas inválido' }, { status: 400 });
    }

    // Eliminar respuestas anteriores (por si guardó parcial antes)
    await prisma.respuestaCuestionario.deleteMany({
      where: { cuestionarioId: cuestionario.id },
    });

    // Insertar nuevas respuestas
    const respuestasData = respuestas.map((r: any, index: number) => ({
      cuestionarioId: cuestionario.id,
      bloque: r.bloque || '',
      numeroPregunta: index + 1,
      pregunta: r.pregunta,
      respuesta: r.respuesta || '',
    }));

    await prisma.respuestaCuestionario.createMany({
      data: respuestasData,
    });

    // Marcar como completado
    await prisma.cuestionarioPrivado.update({
      where: { id: cuestionario.id },
      data: {
        estado: 'COMPLETADO',
        fechaCompletado: new Date(),
      },
    });

    // Actualizar el lead vinculado si existe
    const lead = await prisma.leadMigracionWeb.findFirst({
      where: { cuestionarioId: cuestionario.id },
    });

    if (lead) {
      await prisma.leadMigracionWeb.update({
        where: { id: lead.id },
        data: { estado: 'CUESTIONARIO_COMPLETADO' },
      });

      // Generar propuesta automáticamente en background (no bloquea la respuesta al cliente)
      generarPropuestaEnBackground(lead.id, cuestionario.id).catch((err) => {
        console.error('Error generando propuesta en background:', err);
      });
    }

    return NextResponse.json({ success: true, message: 'Cuestionario completado correctamente' });
  } catch (error: any) {
    console.error('Error al guardar respuestas:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
