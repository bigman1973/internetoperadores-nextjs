import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generarValoracionConIA, DatosLead, RespuestaCuestionario } from '@/lib/propuesta/generar-valoracion';
import { generarPDFHtml } from '@/lib/propuesta/generar-pdf-html';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Dar tiempo suficiente para la IA

// POST: Generar propuesta para un lead
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leadId } = body;

    if (!leadId) {
      return NextResponse.json({ error: 'leadId es requerido' }, { status: 400 });
    }

    // Obtener el lead con su cuestionario y respuestas
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

    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    if (!lead.cuestionario) {
      return NextResponse.json({ error: 'Este lead no tiene cuestionario vinculado' }, { status: 400 });
    }

    if (lead.cuestionario.estado !== 'COMPLETADO') {
      return NextResponse.json({ error: 'El cuestionario aún no ha sido completado' }, { status: 400 });
    }

    // Preparar datos para la IA
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

    // Generar HTML del PDF
    const htmlContent = generarPDFHtml(valoracion, datosLead);

    // Cachear el HTML generado para servir instantáneamente en descargas posteriores
    const notaActual = lead.notas || '';
    const nuevaNota = `[${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}] Propuesta generada: ${valoracion.totalHoras}h / ${valoracion.totalPrecio.toLocaleString('es-ES')}€`;
    await prisma.leadMigracionWeb.update({
      where: { id: leadId },
      data: {
        informePdfUrl: htmlContent, // HTML cacheado para descarga instantánea
        notas: nuevaNota + (notaActual ? '\n' + notaActual : ''),
      },
    });

    return NextResponse.json({
      success: true,
      valoracion,
      html: htmlContent,
      resumen: {
        totalHoras: valoracion.totalHoras,
        totalPrecio: valoracion.totalPrecio,
        bloques: valoracion.bloques.length,
        partidas: valoracion.bloques.reduce((sum, b) => sum + b.partidas.length, 0),
      },
    });
  } catch (error: any) {
    console.error('Error al generar propuesta:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno al generar la propuesta' },
      { status: 500 }
    );
  }
}
