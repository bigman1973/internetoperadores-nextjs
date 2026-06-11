import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { randomBytes } from 'crypto'

const BREVO_API_KEY = process.env.BREVO_API_KEY
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.internetoperadores.com'

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

function getEmailHtmlGenerico(nombre: string, token: string): string {
  const urlBase = `${BASE_URL}/respuesta-migracion?token=${token}`
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  
  <!-- Header -->
  <div style="background-color:#1a1a2e;padding:30px 40px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">internet<span style="color:#f97316;">operadores</span></h1>
  </div>
  
  <!-- Body -->
  <div style="padding:40px;">
    <p style="font-size:16px;color:#333;margin-bottom:20px;">Hola <strong>${nombre}</strong>,</p>
    
    <p style="font-size:15px;color:#444;line-height:1.6;margin-bottom:15px;">
      Te escribimos para informarte de un cambio importante en tu servicio de fibra óptica.
    </p>
    
    <div style="background-color:#fff3e0;border-left:4px solid #f97316;padding:15px 20px;margin:20px 0;border-radius:0 4px 4px 0;">
      <p style="font-size:14px;color:#333;margin:0;line-height:1.5;">
        <strong>El operador mayorista que nos proporciona la fibra en tu zona dejará de operar este mes.</strong>
        Tu servicio actual seguirá funcionando hasta que completemos la migración.
      </p>
    </div>
    
    <p style="font-size:15px;color:#444;line-height:1.6;margin-bottom:15px;">
      Estamos trabajando para ofrecerte la mejor alternativa disponible. <strong>Un asesor de Internet Operadores se pondrá en contacto contigo en los próximos días</strong> para presentarte las opciones y resolver cualquier duda.
    </p>
    
    <p style="font-size:15px;color:#444;line-height:1.6;margin-bottom:25px;">
      No tienes que hacer nada por ahora. Si prefieres, puedes indicarnos tu preferencia:
    </p>
    
    <!-- Botones -->
    <div style="text-align:center;margin:30px 0;">
      <a href="${urlBase}&opcion=llamar" style="display:inline-block;background-color:#f97316;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:6px;font-size:14px;font-weight:bold;margin:5px;">
        📞 Quiero que me llamen
      </a>
    </div>
    <div style="text-align:center;margin:10px 0;">
      <a href="${urlBase}&opcion=baja" style="display:inline-block;background-color:#ffffff;color:#666;padding:12px 24px;text-decoration:none;border-radius:6px;font-size:13px;border:1px solid #ddd;margin:5px;">
        No necesito el servicio, dar de baja
      </a>
    </div>
    
    <p style="font-size:13px;color:#888;line-height:1.5;margin-top:30px;text-align:center;">
      En cualquier caso, un asesor se pondrá en contacto contigo para confirmar los próximos pasos.
    </p>
  </div>
  
  <!-- Footer -->
  <div style="background-color:#f8f8f8;padding:20px 40px;border-top:1px solid #eee;">
    <p style="font-size:12px;color:#888;margin:0;text-align:center;">
      Internet Operadores · Tel: 973 621 541 · comercial@internetoperadores.com
    </p>
  </div>
</div>
</body>
</html>`
}

function getEmailHtmlConTarifa(nombre: string, tarifa: string, precioSinIva: number, precioConIva: number, token: string): string {
  const urlBase = `${BASE_URL}/respuesta-migracion?token=${token}`
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  
  <!-- Header -->
  <div style="background-color:#1a1a2e;padding:30px 40px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">internet<span style="color:#f97316;">operadores</span></h1>
  </div>
  
  <!-- Body -->
  <div style="padding:40px;">
    <p style="font-size:16px;color:#333;margin-bottom:20px;">Hola <strong>${nombre}</strong>,</p>
    
    <p style="font-size:15px;color:#444;line-height:1.6;margin-bottom:15px;">
      Te escribimos para informarte de un cambio importante en tu servicio de fibra óptica.
    </p>
    
    <div style="background-color:#fff3e0;border-left:4px solid #f97316;padding:15px 20px;margin:20px 0;border-radius:0 4px 4px 0;">
      <p style="font-size:14px;color:#333;margin:0;line-height:1.5;">
        <strong>El operador mayorista que nos proporciona la fibra en tu zona dejará de operar este mes.</strong>
        Tu servicio actual seguirá funcionando hasta que completemos la migración.
      </p>
    </div>
    
    <p style="font-size:15px;color:#444;line-height:1.6;margin-bottom:20px;">
      Hemos buscado la mejor alternativa disponible para ti y te recomendamos:
    </p>
    
    <!-- Tarifa recomendada -->
    <div style="background-color:#f0fdf4;border:2px solid #22c55e;padding:20px;margin:20px 0;border-radius:8px;text-align:center;">
      <p style="font-size:12px;color:#666;margin:0 0 5px 0;text-transform:uppercase;letter-spacing:1px;">Nuestra recomendación</p>
      <p style="font-size:20px;color:#1a1a2e;margin:0 0 8px 0;font-weight:bold;">${tarifa}</p>
      <p style="font-size:24px;color:#f97316;margin:0;font-weight:bold;">${precioConIva.toFixed(2)}€/mes <span style="font-size:13px;color:#888;font-weight:normal;">(IVA incluido)</span></p>
      <p style="font-size:12px;color:#888;margin:5px 0 0 0;">${precioSinIva.toFixed(2)}€/mes sin IVA</p>
    </div>
    
    <p style="font-size:15px;color:#444;line-height:1.6;margin-bottom:25px;">
      Selecciona la opción que prefieras:
    </p>
    
    <!-- Botones -->
    <div style="text-align:center;margin:30px 0;">
      <a href="${urlBase}&opcion=aceptar" style="display:inline-block;background-color:#22c55e;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:6px;font-size:14px;font-weight:bold;margin:5px;">
        ✅ Acepto esta tarifa
      </a>
    </div>
    <div style="text-align:center;margin:10px 0;">
      <a href="${urlBase}&opcion=llamar" style="display:inline-block;background-color:#f97316;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-size:14px;font-weight:bold;margin:5px;">
        📞 Quiero que me llamen para ver otras opciones
      </a>
    </div>
    <div style="text-align:center;margin:10px 0;">
      <a href="${urlBase}&opcion=baja" style="display:inline-block;background-color:#ffffff;color:#666;padding:12px 24px;text-decoration:none;border-radius:6px;font-size:13px;border:1px solid #ddd;margin:5px;">
        No necesito el servicio, dar de baja
      </a>
    </div>
    
    <p style="font-size:13px;color:#888;line-height:1.5;margin-top:30px;text-align:center;">
      En cualquier caso, un asesor de Internet Operadores se pondrá en contacto contigo para confirmar y ejecutar la opción que elijas.
    </p>
  </div>
  
  <!-- Footer -->
  <div style="background-color:#f8f8f8;padding:20px 40px;border-top:1px solid #eee;">
    <p style="font-size:12px;color:#888;margin:0;text-align:center;">
      Internet Operadores · Tel: 973 621 541 · comercial@internetoperadores.com
    </p>
  </div>
</div>
</body>
</html>`
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { clienteId, email } = body

  if (!clienteId || !email) {
    return NextResponse.json({ error: 'clienteId y email son requeridos' }, { status: 400 })
  }

  // Buscar el cliente
  const cliente = await prisma.clienteMigracionAdamo.findUnique({
    where: { id: clienteId },
  })

  if (!cliente) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  // Generar token único
  const token = generateToken()

  // Determinar tipo de email
  const tieneTarifa = cliente.alternativaOfrecida && cliente.alternativaOfrecida !== '' && cliente.alternativaOfrecida !== '__otro'
  
  let htmlContent: string
  let subject: string

  if (tieneTarifa && cliente.precioAlternativa) {
    const precioSinIva = Number(cliente.precioAlternativa)
    const precioConIva = precioSinIva * 1.21
    htmlContent = getEmailHtmlConTarifa(
      cliente.nombre,
      cliente.alternativaOfrecida!,
      precioSinIva,
      precioConIva,
      token
    )
    subject = 'Cambio en tu servicio de fibra — Tu nueva tarifa recomendada'
  } else {
    htmlContent = getEmailHtmlGenerico(cliente.nombre, token)
    subject = 'Información importante sobre tu servicio de fibra'
  }

  // Enviar email via Brevo
  try {
    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY || '',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Internet Operadores', email: 'comercial@internetoperadores.com' },
        to: [{ email, name: cliente.nombre }],
        subject,
        htmlContent,
      }),
    })

    if (!brevoRes.ok) {
      const errData = await brevoRes.json()
      console.error('Error Brevo:', errData)
      return NextResponse.json({ error: 'Error al enviar email', details: errData }, { status: 500 })
    }

    // Actualizar cliente con token y marcar email enviado
    await prisma.clienteMigracionAdamo.update({
      where: { id: clienteId },
      data: {
        token,
        emailEnviado: true,
        fechaEmailEnviado: new Date(),
        estado: cliente.estado === 'PENDIENTE' ? 'CONTACTADO' : cliente.estado,
        fechaContacto: cliente.fechaContacto || new Date(),
      },
    })

    return NextResponse.json({ success: true, message: 'Email enviado correctamente' })
  } catch (error) {
    console.error('Error enviando email:', error)
    return NextResponse.json({ error: 'Error interno al enviar email' }, { status: 500 })
  }
}
