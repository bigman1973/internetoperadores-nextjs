import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const BREVO_API_KEY = process.env.BREVO_API_KEY || ''

// Máximo de emails por lote (Brevo permite hasta 50 destinatarios por llamada transaccional)
const BATCH_SIZE = 50
// Pausa entre lotes (ms) para no saturar la API
const BATCH_DELAY = 1000

function generarHtmlComunicado(contenido: string, tipo: string): string {
  const coloresTipo: Record<string, { bg: string; accent: string; label: string; icon: string }> = {
    MANTENIMIENTO: { bg: '#f59e0b', accent: '#fef3c7', label: 'Aviso de Mantenimiento', icon: '🔧' },
    INCIDENCIA: { bg: '#ef4444', accent: '#fef2f2', label: 'Aviso de Incidencia', icon: '⚠️' },
    NOVEDAD: { bg: '#3b82f6', accent: '#eff6ff', label: 'Novedad', icon: '🆕' },
    COMERCIAL: { bg: '#10b981', accent: '#ecfdf5', label: 'Información Comercial', icon: '📢' },
  }

  const color = coloresTipo[tipo] || coloresTipo.MANTENIMIENTO

  const contenidoHtml = contenido
    .split('\n\n')
    .map(p => `<p style="font-size:15px;color:#444;line-height:1.6;margin-bottom:15px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <div style="background-color:#1a1a2e;padding:30px 40px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">internet<span style="color:#f97316;">operadores</span></h1>
  </div>
  <div style="background-color:${color.accent};padding:12px 40px;border-bottom:2px solid ${color.bg};">
    <p style="margin:0;font-size:13px;color:${color.bg};font-weight:bold;text-transform:uppercase;letter-spacing:1px;">
      ${color.icon} ${color.label}
    </p>
  </div>
  <div style="padding:40px;">
    ${contenidoHtml}
  </div>
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function enviarLoteBrevo(
  destinatarios: { email: string; name: string }[],
  asunto: string,
  htmlContent: string
): Promise<{ enviados: number; errores: number }> {
  let enviados = 0
  let errores = 0

  // Brevo transaccional permite enviar a múltiples destinatarios en BCC
  // Pero para personalización futura y mejor tracking, enviamos en lotes de 50 con BCC
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Internet Operadores', email: 'comercial@internetoperadores.com' },
        to: [{ email: 'comunicados@internetoperadores.com', name: 'Internet Operadores' }],
        bcc: destinatarios,
        subject: asunto,
        htmlContent,
      }),
    })

    if (res.ok) {
      enviados = destinatarios.length
    } else {
      const errData = await res.json().catch(() => ({}))
      console.error('Error Brevo lote:', errData)
      errores = destinatarios.length
    }
  } catch (error) {
    console.error('Error envío lote:', error)
    errores = destinatarios.length
  }

  return { enviados, errores }
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

  // Reconstruir filtros desde el comunicado (guardados en JSON)
  let filtros: any = {}
  try {
    filtros = comunicado.filtrosDestinatarios ? JSON.parse(comunicado.filtrosDestinatarios as string) : {}
  } catch {
    filtros = {}
  }

  // Construir query de clientes
  const where: Prisma.ClienteWebWhereInput = {}

  if (filtros.estado === 'activo') where.activo = true
  else if (filtros.estado === 'baja') where.activo = false

  if (filtros.tipo === 'empresa') where.personaFisica = false
  else if (filtros.tipo === 'particular') where.personaFisica = true

  if (filtros.municipio) where.municipio = { contains: filtros.municipio, mode: 'insensitive' }

  // Solo clientes con email válido
  where.email = { not: '', contains: '@' }

  // Filtro por contratos
  if (filtros.tieneFacturacion === 'con' || filtros.tarifa) {
    const contratoWhere: Prisma.ContratoServicioWhereInput = { activo: true }
    if (filtros.tarifa) {
      contratoWhere.tarifa = { contains: filtros.tarifa, mode: 'insensitive' }
    }
    const contratos = await prisma.contratoServicio.findMany({
      where: contratoWhere,
      select: { clienteId: true },
      distinct: ['clienteId'],
    })
    where.ispGestionId = { in: contratos.map(c => c.clienteId) }
  } else if (filtros.tieneFacturacion === 'sin') {
    const contratosActivos = await prisma.contratoServicio.findMany({
      where: { activo: true },
      select: { clienteId: true },
      distinct: ['clienteId'],
    })
    where.ispGestionId = { notIn: contratosActivos.map(c => c.clienteId) }
  }

  // Obtener todos los clientes que coinciden
  const clientes = await prisma.clienteWeb.findMany({
    where,
    select: { email: true, nombre: true },
  })

  if (clientes.length === 0) {
    return NextResponse.json({ error: 'No hay clientes que coincidan con los filtros' }, { status: 400 })
  }

  // Generar HTML
  const htmlContent = generarHtmlComunicado(comunicado.contenido, comunicado.tipo)

  // Enviar por lotes
  let totalEnviados = 0
  let totalErrores = 0

  for (let i = 0; i < clientes.length; i += BATCH_SIZE) {
    const lote = clientes.slice(i, i + BATCH_SIZE).map(c => ({
      email: c.email,
      name: c.nombre,
    }))

    const resultado = await enviarLoteBrevo(lote, comunicado.asunto, htmlContent)
    totalEnviados += resultado.enviados
    totalErrores += resultado.errores

    // Pausa entre lotes
    if (i + BATCH_SIZE < clientes.length) {
      await sleep(BATCH_DELAY)
    }
  }

  // Actualizar comunicado
  await prisma.comunicado.update({
    where: { id: comunicadoId },
    data: {
      estado: 'ENVIADO',
      fechaEnvio: new Date(),
      totalEnviados,
    },
  })

  return NextResponse.json({
    success: true,
    message: `Comunicado enviado a ${totalEnviados} clientes${totalErrores > 0 ? ` (${totalErrores} errores)` : ''}`,
    totalEnviados,
    totalErrores,
  })
}
