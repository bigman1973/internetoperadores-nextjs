import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

const BREVO_API_KEY = process.env.BREVO_API_KEY

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token, opcion } = body

    if (!token || !opcion) {
      return NextResponse.json({ error: 'Token y opción son requeridos' }, { status: 400 })
    }

    const validOptions = ['aceptar', 'llamar', 'baja']
    if (!validOptions.includes(opcion)) {
      return NextResponse.json({ error: 'Opción no válida' }, { status: 400 })
    }

    // Buscar cliente por token
    const cliente = await prisma.clienteMigracionAdamo.findUnique({
      where: { token },
    })

    if (!cliente) {
      return NextResponse.json({ error: 'Este enlace no es válido o ha expirado.' }, { status: 404 })
    }

    // Si ya respondió, informar
    if (cliente.respuestaCliente) {
      return NextResponse.json({ 
        error: 'Ya has respondido anteriormente. Un asesor se pondrá en contacto contigo.',
        nombre: cliente.nombre 
      }, { status: 409 })
    }

    // Mapear opción a estado
    let nuevoEstado = cliente.estado
    const respuestaMap: Record<string, string> = {
      'aceptar': 'ACEPTAR',
      'llamar': 'LLAMAR',
      'baja': 'BAJA',
    }

    if (opcion === 'aceptar') {
      nuevoEstado = 'EN_NEGOCIACION' // Aceptó pero falta confirmar
    } else if (opcion === 'llamar') {
      nuevoEstado = 'EN_NEGOCIACION'
    } else if (opcion === 'baja') {
      nuevoEstado = 'BAJA'
    }

    // Actualizar cliente
    await prisma.clienteMigracionAdamo.update({
      where: { token },
      data: {
        respuestaCliente: respuestaMap[opcion],
        fechaRespuesta: new Date(),
        estado: nuevoEstado as any,
      },
    })

    // Notificar al equipo por email
    const opcionTexto: Record<string, string> = {
      'aceptar': `✅ Ha ACEPTADO la tarifa recomendada: ${cliente.alternativaOfrecida || 'N/A'}`,
      'llamar': '📞 Quiere que le LLAMEN para ver otras opciones',
      'baja': '❌ Quiere DAR DE BAJA el servicio',
    }

    try {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': BREVO_API_KEY || '',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Internet Operadores', email: 'noreply@internetoperadores.com' },
          to: [
            { email: 'comercial@internetoperadores.com', name: 'Comercial IO' },
            { email: 'victor@internetoperadores.com', name: 'Victor' },
          ],
          subject: `🔔 Respuesta migración ADAMO: ${cliente.nombre} — ${opcion.toUpperCase()}`,
          htmlContent: `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;padding:20px;">
  <h2 style="color:#1a1a2e;">Respuesta de cliente — Migración ADAMO</h2>
  
  <div style="background:#f8f8f8;padding:20px;border-radius:8px;margin:20px 0;">
    <p><strong>Cliente:</strong> ${cliente.nombre}</p>
    <p><strong>Dirección:</strong> ${cliente.direccion || 'N/A'}</p>
    <p><strong>Municipio:</strong> ${cliente.municipio || 'N/A'}</p>
    <p><strong>Tarifa actual:</strong> ${cliente.tarifa || 'N/A'}</p>
    <p><strong>Precio actual:</strong> ${cliente.precioCliente ? Number(cliente.precioCliente).toFixed(2) + '€' : 'N/A'}</p>
  </div>
  
  <div style="background:#fff3e0;border-left:4px solid #f97316;padding:15px 20px;margin:20px 0;">
    <p style="font-size:16px;margin:0;"><strong>Respuesta:</strong></p>
    <p style="font-size:18px;margin:10px 0 0 0;">${opcionTexto[opcion]}</p>
  </div>
  
  ${cliente.alternativaOfrecida ? `<p><strong>Tarifa ofrecida:</strong> ${cliente.alternativaOfrecida} — ${cliente.precioAlternativa ? Number(cliente.precioAlternativa).toFixed(2) + '€/mes' : 'N/A'}</p>` : ''}
  
  <p style="color:#888;font-size:13px;margin-top:30px;">
    Acción requerida: Contactar al cliente para ejecutar su elección.
  </p>
</body>
</html>`,
        }),
      })
    } catch (emailError) {
      console.error('Error enviando notificación al equipo:', emailError)
      // No falla la respuesta al cliente si el email interno falla
    }

    return NextResponse.json({ 
      success: true, 
      nombre: cliente.nombre,
      opcion: respuestaMap[opcion] 
    })
  } catch (error) {
    console.error('Error procesando respuesta:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
