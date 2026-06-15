import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function generarHtmlComunicado(asunto: string, contenido: string, tipo: string): string {
  const coloresTipo: Record<string, { bg: string; accent: string; icon: string }> = {
    MANTENIMIENTO: { bg: '#f59e0b', accent: '#fef3c7', icon: '🔧' },
    INCIDENCIA: { bg: '#ef4444', accent: '#fef2f2', icon: '⚠️' },
    NOVEDAD: { bg: '#3b82f6', accent: '#eff6ff', icon: '🆕' },
    COMERCIAL: { bg: '#10b981', accent: '#ecfdf5', icon: '📢' },
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
      Internet Operadores · Tel: 900 730 034 · comercial@internetoperadores.com
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
  const { asunto, contenido, tipo } = body

  if (!asunto || !contenido) {
    return NextResponse.json({ error: 'Asunto y contenido requeridos' }, { status: 400 })
  }

  const html = generarHtmlComunicado(asunto, contenido, tipo || 'MANTENIMIENTO')

  return NextResponse.json({ html })
}
