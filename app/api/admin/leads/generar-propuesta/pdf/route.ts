import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generarValoracionConIA, DatosLead, RespuestaCuestionario } from '@/lib/propuesta/generar-valoracion';
import { generarPDFHtml } from '@/lib/propuesta/generar-pdf-html';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET: Obtener el HTML de la propuesta para renderizar como PDF
// Cachea el resultado en informePdfUrl para servir instantáneamente en llamadas posteriores
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get('leadId');
    const regenerar = searchParams.get('regenerar') === '1';

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

    if (!lead.cuestionario || lead.cuestionario.estado !== 'COMPLETADO') {
      return NextResponse.json({ error: 'Cuestionario no completado' }, { status: 400 });
    }

    // Si ya hay HTML cacheado y no se pide regenerar, servirlo directamente
    if (!regenerar && lead.informePdfUrl && lead.informePdfUrl.startsWith('<!')) {
      return new NextResponse(lead.informePdfUrl, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
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

    // Cachear el HTML generado en informePdfUrl para servir instantáneamente la próxima vez
    await prisma.leadMigracionWeb.update({
      where: { id: leadId },
      data: {
        informePdfUrl: htmlContent,
      },
    });

    // Devolver como HTML para que el navegador pueda imprimir a PDF
    return new NextResponse(htmlContent, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error: any) {
    console.error('Error al generar PDF:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
