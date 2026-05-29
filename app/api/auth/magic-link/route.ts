export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()

    // Verificar que el email corresponde a un cliente activo
    const cliente = await prisma.clienteWeb.findFirst({
      where: { email: emailLower, activo: true }
    })

    if (!cliente) {
      // No revelar si el email existe o no (seguridad)
      return NextResponse.json({ 
        success: true, 
        message: 'Si el email está registrado, recibirás un enlace de acceso.' 
      })
    }

    // Generar token único
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutos

    // Invalidar tokens anteriores del mismo email
    await prisma.magicLink.updateMany({
      where: { email: emailLower, used: false },
      data: { used: true }
    })

    // Crear nuevo magic link
    await prisma.magicLink.create({
      data: {
        email: emailLower,
        token,
        expiresAt,
      }
    })

    // Construir URL del magic link
    const baseUrl = process.env.NEXTAUTH_URL || 'https://www.internetoperadores.com'
    const magicUrl = `${baseUrl}/api/auth/magic-link/verify?token=${token}`

    // Enviar email
    await sendEmail({
      to: emailLower,
      subject: 'Tu enlace de acceso - Internet Operadores',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <span style="font-size: 24px; font-weight: bold;">
              <span style="color: #000;">internet</span><span style="color: #f97316;">operadores</span>
            </span>
          </div>
          
          <h2 style="color: #1f2937; margin-bottom: 16px;">Accede a tu Área de Cliente</h2>
          
          <p style="color: #4b5563; line-height: 1.6;">
            Hola <strong>${cliente.nombre}</strong>,
          </p>
          
          <p style="color: #4b5563; line-height: 1.6;">
            Has solicitado acceder a tu panel de cliente. Haz clic en el siguiente botón para iniciar sesión:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${magicUrl}" 
               style="background-color: #f97316; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
              Acceder a mi panel
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            Este enlace expira en <strong>15 minutos</strong>. Si no has solicitado este acceso, puedes ignorar este email.
          </p>
          
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            Si el botón no funciona, copia y pega esta URL en tu navegador:<br>
            <a href="${magicUrl}" style="color: #f97316; word-break: break-all;">${magicUrl}</a>
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            Internet Operadores &copy; 2026 - Todos los derechos reservados
          </p>
        </div>
      `
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Si el email está registrado, recibirás un enlace de acceso.' 
    })

  } catch (error: any) {
    console.error('Error enviando magic link:', error)
    return NextResponse.json(
      { error: 'Error al procesar la solicitud' },
      { status: 500 }
    )
  }
}
