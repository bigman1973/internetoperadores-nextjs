import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

// POST: Enviar email al lead con propuesta + cuestionario (con previsualización y BCC)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { asunto, cuerpoHtml, mensaje, pdfUrl } = body;

    const lead = await prisma.leadMigracionWeb.findUnique({
      where: { id },
      include: { cuestionario: true },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    // Si se envía cuerpoHtml (nuevo flujo con previsualización), usarlo directamente
    // Si no, usar el flujo antiguo con mensaje
    let emailHtml: string;

    if (cuerpoHtml) {
      emailHtml = cuerpoHtml;
    } else {
      // Flujo legacy: construir HTML automáticamente
      const baseUrl = process.env.NEXTAUTH_URL || 'https://www.internetoperadores.com';
      const cuestionarioUrl = lead.cuestionario
        ? `${baseUrl}/cuestionario/${lead.cuestionario.token}`
        : '';

      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #EA580C; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Internet Operadores</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <p>Estimado/a <strong>${lead.contacto}</strong>,</p>
            <p>${mensaje || 'Adjunto encontrará el informe de auditoría web personalizado para su empresa. Para avanzar con el proyecto, le agradeceríamos que completara el siguiente cuestionario técnico:'}</p>
            ${cuestionarioUrl ? `
            <div style="text-align: center; margin: 30px 0;">
              <a href="${cuestionarioUrl}" style="background-color: #EA580C; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                Completar Cuestionario Técnico
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">Este enlace es privado y exclusivo para su empresa.</p>
            ` : ''}
            ${pdfUrl ? `<p style="margin-top: 20px;"><strong>📄 Informe adjunto:</strong> <a href="${pdfUrl}" style="color: #EA580C;">Descargar Informe de Auditoría</a></p>` : ''}
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;" />
            <p style="color: #999; font-size: 12px;">Internet Operadores - Soluciones de conectividad y tecnología<br/>comercial@internetoperadores.com</p>
          </div>
        </div>
      `;
    }

    const emailSubject = asunto || `Informe de Auditoría Web - ${lead.nombreEmpresa}`;

    // Enviar email con BCC a comercial y david.perez
    const result = await sendEmail({
      to: lead.email,
      subject: emailSubject,
      html: emailHtml,
      bcc: ['comercial@internetoperadores.com', 'david.perez@internetoperadores.com'],
    });

    if (result.success) {
      // Registrar envío en notas del lead
      const notaActual = lead.notas || '';
      const notaEmail = `[${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}] Email enviado: "${emailSubject}" por ${session.user?.email || 'admin'}`;
      const nuevasNotas = notaEmail + (notaActual ? '\n' + notaActual : '');

      // Determinar nuevo estado según el estado actual
      let nuevoEstado = lead.estado;
      if (lead.estado === 'NUEVO' || lead.estado === 'EN_REVISION') {
        nuevoEstado = 'AUDITORIA_ENVIADA';
      } else if (lead.estado === 'CUESTIONARIO_COMPLETADO') {
        nuevoEstado = 'PROPUESTA_ENVIADA';
      }

      await prisma.leadMigracionWeb.update({
        where: { id },
        data: {
          estado: nuevoEstado,
          notas: nuevasNotas,
          informePdfUrl: pdfUrl || lead.informePdfUrl,
        },
      });

      // Si tiene cuestionario, actualizar fecha de envío
      if (lead.cuestionario) {
        await prisma.cuestionarioPrivado.update({
          where: { id: lead.cuestionario.id },
          data: { fechaEnvio: new Date() },
        });
      }

      const baseUrl = process.env.NEXTAUTH_URL || 'https://www.internetoperadores.com';
      const cuestionarioUrl = lead.cuestionario
        ? `${baseUrl}/cuestionario/${lead.cuestionario.token}`
        : '';

      return NextResponse.json({ success: true, message: 'Email enviado correctamente', cuestionarioUrl });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Error al enviar el email',
        emailSent: false,
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[ENVIAR-EMAIL-MIGRACION] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
