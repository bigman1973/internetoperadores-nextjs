import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

// POST: Enviar email al lead con propuesta + cuestionario
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { asunto, cuerpoHtml } = body;

    if (!asunto || !cuerpoHtml) {
      return NextResponse.json({ error: 'Asunto y cuerpo son requeridos' }, { status: 400 });
    }

    const lead = await prisma.leadSolucion.findUnique({ where: { id } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    const datos = lead.datos as any;
    const baseUrl = process.env.NEXTAUTH_URL || 'https://www.internetoperadores.com';

    // Generar el PDF HTML como adjunto
    let pdfAttachment: any = null;
    if (datos?.ofertaGenerada) {
      // Obtener el HTML del PDF
      const pdfRes = await fetch(`${baseUrl}/api/admin/leads-mantenimiento/${id}/pdf`, {
        headers: {
          cookie: request.headers.get('cookie') || '',
        },
      });
      if (pdfRes.ok) {
        const pdfHtml = await pdfRes.text();
        pdfAttachment = {
          filename: `Propuesta_MantenimientoIT_${lead.empresa.replace(/[^a-zA-Z0-9]/g, '_')}.html`,
          content: Buffer.from(pdfHtml, 'utf-8'),
          contentType: 'text/html',
        };
      }
    }

    // Enviar email con copia oculta a comercial y david.perez
    const result = await sendEmail({
      to: lead.email,
      subject: asunto,
      html: cuerpoHtml,
      bcc: ['comercial@internetoperadores.com', 'david.perez@internetoperadores.com'],
      ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}),
    });

    if (result.success) {
      // Registrar envío en el lead
      const historialEmails = datos?.historialEmails || [];
      historialEmails.push({
        fecha: new Date().toISOString(),
        asunto,
        enviadoPor: session.user?.email || 'admin',
        tipo: 'PROPUESTA_CUESTIONARIO',
      });

      const datosActualizados = {
        ...datos,
        historialEmails,
        ultimoEmailEnviado: new Date().toISOString(),
      };

      await prisma.leadSolucion.update({
        where: { id },
        data: {
          datos: datosActualizados,
          estado: lead.estado === 'NUEVO' ? 'EN_PROCESO' : lead.estado,
        },
      });

      return NextResponse.json({ success: true, message: 'Email enviado correctamente' });
    } else {
      return NextResponse.json({ success: false, error: result.error || 'Error al enviar email' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[ENVIAR-EMAIL-MANTENIMIENTO] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
