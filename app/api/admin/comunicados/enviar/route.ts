import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

const BREVO_API_KEY = process.env.BREVO_API_KEY || ''

// Listas de Brevo
const LISTA_EMPRESAS = 23
const LISTA_PARTICULARES = 24

function generarHtmlComunicado(asunto: string, contenido: string, tipo: string): string {
  // Color del header según tipo
  const coloresTipo: Record<string, { bg: string; accent: string; icon: string }> = {
    MANTENIMIENTO: { bg: '#f59e0b', accent: '#fef3c7', icon: '🔧' },
    INCIDENCIA: { bg: '#ef4444', accent: '#fef2f2', icon: '⚠️' },
    NOVEDAD: { bg: '#3b82f6', accent: '#eff6ff', icon: '🆕' },
    COMERCIAL: { bg: '#10b981', accent: '#ecfdf5', icon: '📢' },
  }

  const color = coloresTipo[tipo] || coloresTipo.MANTENIMIENTO

  // Convertir saltos de línea en párrafos HTML
  const contenidoHtml = contenido
    .split('\n\n')
    .map(p => `<p style="font-size:15px;color:#444;line-height:1.6;margin-bottom:15px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  
  <!-- Header -->
  <div style="background-color:#1a1a2e;padding:30px 40px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">internet<span style="color:#f97316;">operadores</span></h1>
  </div>
  
  <!-- Tipo badge -->
  <div style="background-color:${color.accent};padding:12px 40px;border-bottom:2px solid ${color.bg};">
    <p style="margin:0;font-size:13px;color:${color.bg};font-weight:bold;text-transform:uppercase;letter-spacing:1px;">
      ${color.icon} ${tipo === 'MANTENIMIENTO' ? 'Aviso de Mantenimiento' : tipo === 'INCIDENCIA' ? 'Aviso de Incidencia' : tipo === 'NOVEDAD' ? 'Novedad' : 'Información Comercial'}
    </p>
  </div>

  <!-- Body -->
  <div style="padding:40px;">
    ${contenidoHtml}
  </div>
  
  <!-- Footer -->
  <div style="background-color:#f8f8f8;padding:20px 40px;border-top:1px solid #eee;">
    <p style="font-size:12px;color:#888;margin:0;text-align:center;">
      Internet Operadores · Tel: 973 621 541 · comercial@internetoperadores.com
    </p>
    <p style="font-size:11px;color:#aaa;margin:8px 0 0 0;text-align:center;">
      Recibes este email porque eres cliente de Internet Operadores.
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
  const { comunicadoId } = body

  if (!comunicadoId) {
    return NextResponse.json({ error: 'comunicadoId requerido' }, { status: 400 })
  }

  // Buscar el comunicado
  const comunicado = await prisma.comunicado.findUnique({
    where: { id: comunicadoId },
  })

  if (!comunicado) {
    return NextResponse.json({ error: 'Comunicado no encontrado' }, { status: 404 })
  }

  if (comunicado.estado === 'ENVIADO') {
    return NextResponse.json({ error: 'Este comunicado ya fue enviado' }, { status: 400 })
  }

  if (!BREVO_API_KEY) {
    return NextResponse.json({ error: 'BREVO_API_KEY no configurada' }, { status: 500 })
  }

  // Determinar listas de destino
  let listIds: number[] = []
  switch (comunicado.destinatarios) {
    case 'TODOS':
      listIds = [LISTA_EMPRESAS, LISTA_PARTICULARES]
      break
    case 'EMPRESAS':
      listIds = [LISTA_EMPRESAS]
      break
    case 'PARTICULARES':
      listIds = [LISTA_PARTICULARES]
      break
  }

  // Generar HTML del email
  const htmlContent = generarHtmlComunicado(comunicado.asunto, comunicado.contenido, comunicado.tipo)

  // Obtener el total de contactos en las listas para el registro
  let totalContactos = 0
  for (const listId of listIds) {
    try {
      const listRes = await fetch(`https://api.brevo.com/v3/contacts/lists/${listId}`, {
        headers: { 'api-key': BREVO_API_KEY, 'accept': 'application/json' },
      })
      if (listRes.ok) {
        const listData = await listRes.json()
        totalContactos += listData.totalSubscribers || 0
      }
    } catch (e) {
      console.error(`Error obteniendo lista ${listId}:`, e)
    }
  }

  // Enviar campaña por Brevo (email transaccional a lista)
  // Usamos la API de campañas de Brevo para envío masivo
  try {
    // Crear campaña
    const createCampaignRes = await fetch('https://api.brevo.com/v3/emailCampaigns', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'accept': 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: `[IO] ${comunicado.tipo} - ${comunicado.asunto} (${new Date().toISOString().slice(0, 10)})`,
        subject: comunicado.asunto,
        sender: { name: 'Internet Operadores', email: 'comercial@internetoperadores.com' },
        htmlContent,
        recipients: { listIds },
        // Enviar inmediatamente
        scheduledAt: new Date(Date.now() + 60000).toISOString(), // 1 min desde ahora
      }),
    })

    if (!createCampaignRes.ok) {
      const errData = await createCampaignRes.json()
      console.error('Error creando campaña Brevo:', errData)
      return NextResponse.json({ error: 'Error al crear campaña en Brevo', details: errData }, { status: 500 })
    }

    const campaignData = await createCampaignRes.json()
    const campaignId = campaignData.id

    // Enviar la campaña ahora
    const sendRes = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaignId}/sendNow`, {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'accept': 'application/json',
        'content-type': 'application/json',
      },
    })

    if (!sendRes.ok && sendRes.status !== 204) {
      const sendErr = await sendRes.json().catch(() => ({}))
      console.error('Error enviando campaña:', sendErr)
      // Intentamos igualmente marcar como enviado ya que la campaña está programada
    }

    // Actualizar comunicado como enviado
    await prisma.comunicado.update({
      where: { id: comunicadoId },
      data: {
        estado: 'ENVIADO',
        fechaEnvio: new Date(),
        totalEnviados: totalContactos,
      },
    })

    return NextResponse.json({
      success: true,
      message: `Comunicado enviado a ${totalContactos} contactos`,
      campaignId,
      totalEnviados: totalContactos,
    })
  } catch (error) {
    console.error('Error en envío:', error)
    return NextResponse.json({ error: 'Error interno al enviar' }, { status: 500 })
  }
}
