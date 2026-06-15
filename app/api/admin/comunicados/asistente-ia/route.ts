import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  })
}

const SYSTEM_PROMPT = `Eres un asistente de redacción para Internet Operadores, una empresa de telecomunicaciones (fibra, telefonía, hosting, cloud) en Lleida, España.

Tu trabajo es ayudar a redactar comunicados profesionales para enviar a los clientes de la empresa por email.

Reglas:
- Escribe siempre en español formal pero cercano (usted/ustedes NO, usa "le informamos", "estimado cliente")
- Sé conciso y claro, sin florituras innecesarias
- Incluye siempre datos concretos (fechas, horas, servicios afectados) cuando se proporcionen
- El tono debe ser profesional, tranquilizador y empático
- NO uses emojis ni markdown en el texto (será un email HTML)
- Usa doble salto de línea para separar párrafos
- Si es un mantenimiento, incluye: fecha, hora inicio/fin, servicios afectados, disculpas
- Si es una incidencia, incluye: qué pasa, desde cuándo, qué estamos haciendo, disculpas
- Firma siempre como "El equipo de Internet Operadores"
- El teléfono de contacto es 973 621 541 y el email comercial@internetoperadores.com
- NO incluyas asunto en el cuerpo, solo el contenido del mensaje
- Genera SOLO el contenido del email (sin HTML, sin asunto separado)

Si el usuario te pide mejorar un texto existente, mantén la estructura pero mejora la redacción, claridad y profesionalidad.`

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { accion, instrucciones, contenidoActual, tipo } = body

  // accion: 'generar' | 'mejorar'
  if (!accion || !instrucciones) {
    return NextResponse.json({ error: 'accion e instrucciones son requeridos' }, { status: 400 })
  }

  let userMessage = ''

  if (accion === 'generar') {
    userMessage = `Genera un comunicado de tipo ${tipo || 'MANTENIMIENTO'} con estas instrucciones:\n\n${instrucciones}\n\nGenera también una sugerencia de asunto para el email (en una línea separada al principio con el formato "ASUNTO: ...")`
  } else if (accion === 'mejorar') {
    userMessage = `Mejora la redacción de este comunicado de tipo ${tipo || 'MANTENIMIENTO'}:\n\n---\n${contenidoActual}\n---\n\nInstrucciones adicionales: ${instrucciones || 'Mejora la redacción manteniendo el contenido'}\n\nDevuelve solo el texto mejorado, sin el asunto.`
  } else {
    return NextResponse.json({ error: 'Acción no válida. Usa "generar" o "mejorar"' }, { status: 400 })
  }

  try {
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    })

    const respuesta = completion.choices[0]?.message?.content || ''

    // Si es generar, extraer asunto sugerido
    let asuntoSugerido = ''
    let contenidoGenerado = respuesta

    if (accion === 'generar') {
      const lines = respuesta.split('\n')
      const asuntoLine = lines.find(l => l.startsWith('ASUNTO:'))
      if (asuntoLine) {
        asuntoSugerido = asuntoLine.replace('ASUNTO:', '').trim()
        contenidoGenerado = lines
          .filter(l => !l.startsWith('ASUNTO:'))
          .join('\n')
          .trim()
      }
    }

    return NextResponse.json({
      asunto: asuntoSugerido,
      contenido: contenidoGenerado,
    })
  } catch (error: any) {
    console.error('Error OpenAI:', error)
    return NextResponse.json(
      { error: `Error al generar texto: ${error.message || 'Error desconocido'}` },
      { status: 500 }
    )
  }
}
