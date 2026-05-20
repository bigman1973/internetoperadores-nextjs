import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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
    const { asunto, mensaje, pdfUrl } = body;

    const lead = await prisma.leadMigracionWeb.findUnique({
      where: { id },
      include: { cuestionario: true },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    if (!lead.cuestionario) {
      return NextResponse.json({ error: 'Primero debe generar el cuestionario' }, { status: 400 });
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'https://www.internetoperadores.com';
    const cuestionarioUrl = `${baseUrl}/cuestionario/${lead.cuestionario.token}`;

    // Enviar email usando Resend (o el servicio configurado)
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #EA580C; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Internet Operadores</h1>
        </div>
        <div style="padding: 30px; background-color: #f9f9f9;">
          <p>Estimado/a <strong>${lead.contacto}</strong>,</p>
          <p>${mensaje || 'Adjunto encontrará el informe de auditoría web personalizado para su empresa. Para avanzar con el proyecto, le agradeceríamos que completara el siguiente cuestionario técnico:'}</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${cuestionarioUrl}" style="background-color: #EA580C; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Completar Cuestionario Técnico
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">Este enlace es privado y exclusivo para su empresa. Puede completar el cuestionario en varias sesiones si lo necesita.</p>
          ${pdfUrl ? `<p style="margin-top: 20px;"><strong>📄 Informe adjunto:</strong> <a href="${pdfUrl}" style="color: #EA580C;">Descargar Informe de Auditoría</a></p>` : ''}
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px;">Internet Operadores - Soluciones de conectividad y tecnología<br/>info@internetoperadores.com</p>
        </div>
      </div>
    `;

    // Intentar enviar con Resend si está configurado
    const resendApiKey = process.env.RESEND_API_KEY;
    
    if (resendApiKey) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Internet Operadores <noreply@internetoperadores.com>',
          to: [lead.email],
          subject: asunto || `Informe de Auditoría Web - ${lead.nombreEmpresa}`,
          html: emailHtml,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error Resend:', errorData);
        // Devolver el link igualmente aunque falle el email
        return NextResponse.json({ 
          success: false, 
          emailError: 'No se pudo enviar el email. Puede copiar el link manualmente.',
          cuestionarioUrl,
          lead 
        });
      }

      // Actualizar estado del lead
      await prisma.leadMigracionWeb.update({
        where: { id },
        data: { 
          estado: 'CUESTIONARIO_ENVIADO',
          informePdfUrl: pdfUrl || lead.informePdfUrl,
        },
      });

      // Actualizar fecha de envío del cuestionario
      await prisma.cuestionarioPrivado.update({
        where: { id: lead.cuestionario.id },
        data: { fechaEnvio: new Date() },
      });

      return NextResponse.json({ success: true, cuestionarioUrl });
    } else {
      // Sin Resend configurado, devolver el link para copiar manualmente
      await prisma.leadMigracionWeb.update({
        where: { id },
        data: { 
          estado: 'CUESTIONARIO_ENVIADO',
          informePdfUrl: pdfUrl || lead.informePdfUrl,
        },
      });

      return NextResponse.json({ 
        success: true, 
        emailSent: false,
        message: 'Resend no configurado. Copie el link y envíelo manualmente.',
        cuestionarioUrl,
        emailHtml,
      });
    }
  } catch (error: any) {
    console.error('Error al enviar email:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
