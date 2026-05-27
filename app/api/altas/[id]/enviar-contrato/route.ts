import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await params

  try {
    const alta = await prisma.altaServicio.findUnique({
      where: { id },
    })

    if (!alta) {
      return NextResponse.json({ error: 'Alta no encontrada' }, { status: 404 })
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'https://www.internetoperadores.com'
    const documentacionUrl = `${baseUrl}/alta-servicio/documentacion?token=${alta.token}`
    const contratoUrl = `${baseUrl}/api/altas/contrato?altaId=${alta.id}&format=html`

    const nombreCliente = alta.tipoCliente === 'EMPRESA'
      ? alta.razonSocial || 'Cliente'
      : `${alta.nombre || ''} ${alta.apellidos || ''}`.trim() || 'Cliente'

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #EA580C 0%, #C2410C 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px;">Internet Operadores</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0; font-size: 12px;">Servicios Convergentes de Telecomunicaciones</p>
        </div>
        
        <div style="padding: 30px;">
          <p style="font-size: 15px; color: #333;">Estimado/a <strong>${nombreCliente}</strong>,</p>
          
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Gracias por confiar en Internet Operadores. Adjunto encontrará el contrato de su servicio 
            <strong>${alta.tarifaNombre || 'contratado'}</strong> firmado por nuestra parte.
          </p>

          <div style="background: #FFF7ED; border: 1px solid #FDBA74; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="font-size: 13px; color: #9A3412; font-weight: 600; margin: 0 0 8px;">Pasos a seguir:</p>
            <ol style="font-size: 13px; color: #7C2D12; line-height: 1.8; margin: 0; padding-left: 20px;">
              <li>Revise el contrato adjunto</li>
              <li>Fírmelo y súbalo a través del enlace de documentación</li>
              <li>Complete la documentación requerida (DNI, titularidad bancaria, etc.)</li>
            </ol>
          </div>

          <div style="text-align: center; margin: 25px 0;">
            <a href="${contratoUrl}" style="background: #EA580C; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; margin-bottom: 10px;">
              Ver Contrato
            </a>
            <br>
            <a href="${documentacionUrl}" style="background: #1D4ED8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; margin-top: 8px;">
              Subir Documentación
            </a>
          </div>

          <p style="font-size: 12px; color: #888; line-height: 1.5;">
            Si tiene alguna duda, puede contactarnos en el <strong>900 730 034</strong> o por email a 
            <a href="mailto:info@internetoperadores.com" style="color: #EA580C;">info@internetoperadores.com</a>.
          </p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;" />
          
          <p style="font-size: 11px; color: #aaa; text-align: center;">
            Internet Operadores SL · CIF B25808619 · Paseo De La Habana 26 1-1, 28036 Madrid<br>
            Este email ha sido enviado a ${alta.email}
          </p>
        </div>
      </div>
    `

    const result = await sendEmail({
      to: alta.email,
      subject: `Tu contrato con Internet Operadores - ${alta.tarifaNombre || 'Servicio'}`,
      html: emailHtml,
    })

    if (result.success) {
      // Actualizar el alta para registrar que se envió el contrato
      await prisma.altaServicio.update({
        where: { id },
        data: { contratoPdfUrl: contratoUrl },
      })

      return NextResponse.json({
        success: true,
        message: 'Contrato enviado por email al cliente',
      })
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'No se pudo enviar el email',
        contratoUrl,
        documentacionUrl,
      })
    }
  } catch (error: any) {
    console.error('Error al enviar contrato:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
