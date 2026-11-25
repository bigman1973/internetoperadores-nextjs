import { getServerSession } from 'next-auth'
import { bloqueoActuacion, m365Habilitado } from '@/lib/area1-m365'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { authOptions } from '@/lib/auth'
import { verificarPermisoServer } from '@/lib/permisos'
import { cargarContextoBorrador, generarBorrador, limpiarPeticion } from '@/lib/area1-m365-borrador'

export const dynamic = 'force-dynamic'

/**
 * Área 1 · Borrador de correo con IA. GET de solo lectura: no escribe en la BD ni envía nada.
 * Devuelve { asunto, cuerpo, avisos } para que el usuario lo revise en el compositor.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!m365Habilitado()) return NextResponse.json({ error: 'Microsoft 365 en la ficha no está disponible.' }, { status: 404 })
  const session = await getServerSession(authOptions)
  if (!session || session.user.userType !== 'admin' || !session.user.id) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  const actuacion = bloqueoActuacion(session)
  if (actuacion) return NextResponse.json({ error: actuacion }, { status: 403 })
  const permission = await verificarPermisoServer(Number(session.user.id), 'admin.crm.contactos', session.user.role)
  if (!permission.escritura) return NextResponse.json({ error: 'No tienes permiso para escribir a este contacto.' }, { status: 403 })

  const url = new URL(request.url)
  const peticion = limpiarPeticion(url.searchParams.get('objetivo'), url.searchParams.get('tono'))
  if (!peticion) return NextResponse.json({ error: 'Explica en una frase qué quieres conseguir con el correo.' }, { status: 400 })
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'El asistente IA no está configurado en este entorno.' }, { status: 503 })

  const { id } = await context.params
  const ctx = await cargarContextoBorrador(id, session.user.name || session.user.email || 'Internet Operadores')
  if (!ctx) return NextResponse.json({ error: 'Contacto no encontrado.' }, { status: 404 })

  try {
    const cliente = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined, timeout: 40_000, maxRetries: 0 })
    const borrador = await generarBorrador(ctx, peticion, cliente as never)
    if (!borrador) return NextResponse.json({ error: 'El asistente no devolvió un borrador válido. Inténtalo de nuevo.' }, { status: 502 })
    return NextResponse.json({
      ...borrador,
      enviado: false,
      contextoUsado: {
        negocios: ctx.negocios.length,
        actividades: ctx.actividades.length,
        contratos: ctx.contratos.length,
        facturacion2026: Boolean(ctx.facturacion2026),
        subidaPrecios: Boolean(ctx.subidaPrecios),
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Área 1 · borrador IA:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'No se pudo generar el borrador. Inténtalo de nuevo.' }, { status: 502 })
  }
}
