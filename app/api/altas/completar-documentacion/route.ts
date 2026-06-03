import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim()
const BASE_URL = process.env.NEXTAUTH_URL || 'https://www.internetoperadores.com'

const DOC_LABELS: Record<string, string> = {
  CONTRATO_FIRMADO: 'Contrato firmado',
  DNI_FRONTAL: 'DNI (cara frontal)',
  DNI_TRASERO: 'DNI (cara trasera)',
  CIF_EMPRESA: 'Tarjeta CIF de la empresa',
  ESCRITURAS: 'Escrituras',
  TITULARIDAD_BANCARIA: 'Certificado de titularidad bancaria',
  DNI_TITULAR_LINEA: 'DNI del titular actual de la línea',
  FACTURA_OPERADOR_ACTUAL: 'Factura del operador actual',
}

async function sendEmail({ to, toName, subject, htmlContent }: { to: string; toName: string; subject: string; htmlContent: string }) {
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Internet Operadores', email: 'comercial@internetoperadores.com' },
        to: [{ email: to, name: toName }],
        subject,
        htmlContent,
      }),
    })
  } catch (e: any) {
    console.error('[CompletarDoc] Error enviando email:', e.message)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
    }

    const alta = await prisma.altaServicio.findUnique({
      where: { token },
      include: { documentos: true },
    })

    if (!alta) {
      return NextResponse.json({ error: 'Alta no encontrada' }, { status: 404 })
    }

    if (alta.documentos.length === 0) {
      return NextResponse.json({ error: 'No hay documentos subidos' }, { status: 400 })
    }

    // Actualizar estado a DOCUMENTACION_COMPLETA
    await prisma.altaServicio.update({
      where: { id: alta.id },
      data: {
        estado: 'DOCUMENTACION_COMPLETA',
        completadoAt: new Date(),
      },
    })

    const clienteNombre = alta.tipoCliente === 'EMPRESA'
      ? (alta.razonSocial || '')
      : `${alta.nombre || ''} ${alta.apellidos || ''}`.trim()

    const docsListHtml = alta.documentos
      .map(d => `<p style="margin: 2px 0; color: #15803d;">✓ ${DOC_LABELS[d.tipo] || d.tipo} — ${d.nombreArchivo}</p>`)
      .join('')

    // 1. Email al interesado (confirmación)
    const htmlCliente = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <h1 style="color: #f97316; margin: 0; font-size: 20px;">Internet Operadores</h1>
          <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Documentación completada</p>
        </div>
        <div style="padding: 24px; background: white; border: 1px solid #e5e7eb;">
          <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 18px;">Hola ${clienteNombre},</h2>
          <p style="color: #4b5563; line-height: 1.6;">
            Hemos recibido toda tu documentación correctamente para el alta del servicio <strong>${alta.tarifaNombre}</strong>.
          </p>
          <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #bbf7d0;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #166534;">Documentos recibidos:</p>
            ${docsListHtml}
          </div>
          <p style="color: #4b5563; line-height: 1.6;">
            Nuestro equipo revisará la documentación y te contactaremos para confirmar la activación del servicio.
          </p>
          <div style="background: #f9fafb; padding: 12px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0; color: #374151; font-size: 14px;">
              <strong>Tiempo estimado de activación:</strong> 5-10 días hábiles
            </p>
          </div>
          <p style="color: #4b5563; line-height: 1.6;">
            Si necesitas ayuda, contacta con nosotros en el <strong>900 730 034</strong> o en <strong>comercial@internetoperadores.com</strong>.
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">Este es un email automático.</p>
        </div>
      </div>
    `
    sendEmail({
      to: alta.email,
      toName: clienteNombre,
      subject: `Documentación completa: ${alta.tarifaNombre} - Internet Operadores`,
      htmlContent: htmlCliente,
    })

    // 2. Email a comercial + administración
    const htmlInterno = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <h1 style="color: #f97316; margin: 0; font-size: 20px;">Documentación Completa</h1>
          <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Alta de servicio #${alta.id}</p>
        </div>
        <div style="padding: 24px; background: #f9fafb; border: 1px solid #e5e7eb;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Cliente:</td><td style="color: #1f2937;">${clienteNombre}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Tipo:</td><td style="color: #1f2937;">${alta.tipoCliente}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Email:</td><td style="color: #1f2937;">${alta.email}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Teléfono:</td><td style="color: #1f2937;">${alta.telefono || 'No proporcionado'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Servicio:</td><td style="color: #1f2937;">${alta.tarifaNombre}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Importe:</td><td style="color: #f97316; font-weight: bold;">${alta.importeCuota ? Number(alta.importeCuota).toFixed(2) : '0.00'}€/mes</td></tr>
          </table>
          <div style="margin-top: 16px; padding: 16px; background: white; border: 1px solid #e5e7eb; border-radius: 8px;">
            <p style="font-weight: bold; color: #374151; margin: 0 0 8px 0;">Documentos subidos (${alta.documentos.length}):</p>
            ${alta.documentos.map(d => `<p style="margin: 2px 0; color: #15803d;">✓ ${DOC_LABELS[d.tipo] || d.tipo} — <a href="${d.url}" style="color: #f97316;">${d.nombreArchivo}</a></p>`).join('')}
          </div>
          <p style="margin-top: 16px;">
            <a href="${BASE_URL}/admin/altas/${alta.id}" style="display: inline-block; background: #f97316; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">Ver alta en el panel</a>
          </p>
        </div>
      </div>
    `

    // Enviar a comercial
    sendEmail({
      to: 'comercial@internetoperadores.com',
      toName: 'Comercial Internet Operadores',
      subject: `[Doc. Completa] Alta #${alta.id} - ${clienteNombre} - ${alta.tarifaNombre}`,
      htmlContent: htmlInterno,
    })

    // Enviar a administración
    sendEmail({
      to: 'administracion@internetoperadores.com',
      toName: 'Administración Internet Operadores',
      subject: `[Doc. Completa] Alta #${alta.id} - ${clienteNombre} - ${alta.tarifaNombre}`,
      htmlContent: htmlInterno,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error completando documentación:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
