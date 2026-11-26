import { createHash } from 'crypto'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { authorizeCrmEmpresas } from '@/lib/crm-empresas-auth'
import { bloqueoActuacion } from '@/lib/area1-m365'
import { fichaNuevaHabilitada, fichaNuevaDisponibleParaRol } from '@/lib/area1-puertas-produccion'
import { cargarFichaCliente, generarPuntosIa, MODELO_FICHA_IA } from '@/lib/area1-ficha-cliente'
export const dynamic = 'force-dynamic'
/**
 * Área 1 · Ficha de cliente: «Lo que hay que saber» (4 puntos con IA).
 * Caché diaria por empresa y día en area1_crm_ficha_ia (una llamada a la IA por cliente y día como máximo).
 * El contexto que se envía a la IA no lleva costes, márgenes, correos ni teléfonos. No envía nada a nadie.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!fichaNuevaHabilitada()) return NextResponse.json({ error: 'No disponible.' }, { status: 404 })
  const auth = await authorizeCrmEmpresas()
  if (auth.status !== 200 || !auth.user) return NextResponse.json({ error: auth.status === 401 ? 'No autorizado.' : 'No tienes permiso para ver esta ficha.' }, { status: auth.status })
  const session = await getServerSession(authOptions)
  const actuacion = bloqueoActuacion(session)
  if (actuacion) return NextResponse.json({ error: actuacion }, { status: 403 })
  if (process.env.VERCEL_ENV === 'production') {
    const principal = await prisma.usuarioAdmin.findUnique({ where: { id: auth.user.id }, select: { activo: true, rol: true, roles: true } })
    if (!principal?.activo || !fichaNuevaDisponibleParaRol(principal.rol, principal.roles)) return NextResponse.json({ error: 'No disponible.' }, { status: 404 })
  }
  const { id } = await context.params
  const hoy = new Date()
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(hoy)
  const diaDate = new Date(`${dia}T00:00:00Z`)
  const cache = await prisma.area1CrmFichaIa.findUnique({ where: { empresaId_dia: { empresaId: id, dia: diaDate } }, select: { puntos: true, createdAt: true } })
  if (cache) return NextResponse.json({ puntos: cache.puntos, cache: true, generado: cache.createdAt.toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
  // El contexto de IA se carga siempre con el nivel sin márgenes.
  const ficha = await cargarFichaCliente(id, 'COMERCIAL', hoy)
  if (!ficha) return NextResponse.json({ error: 'Empresa no encontrada.' }, { status: 404 })
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'El asistente IA no está configurado en este entorno.' }, { status: 503 })
  try {
    const cliente = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined, timeout: 40_000, maxRetries: 0 })
    const puntos = await generarPuntosIa(ficha.contextoIa, cliente as never)
    if (!puntos?.length) return NextResponse.json({ error: 'El asistente no devolvió un resumen válido.' }, { status: 502 })
    const huella = createHash('sha256').update(JSON.stringify(ficha.contextoIa)).digest('hex')
    const fila = await prisma.area1CrmFichaIa.upsert({
      where: { empresaId_dia: { empresaId: id, dia: diaDate } },
      create: { empresaId: id, dia: diaDate, huella, puntos, modelo: MODELO_FICHA_IA(), creadoPorId: auth.user.id },
      update: {},
      select: { puntos: true, createdAt: true },
    })
    return NextResponse.json({ puntos: fila.puntos, cache: false, generado: fila.createdAt.toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Área 1 · resumen IA de ficha:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'No se pudo generar el resumen. Inténtalo más tarde.' }, { status: 502 })
  }
}
