import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { authorizeCrmEmpresas, canAccessCrmRelated } from '@/lib/crm-empresas-auth'
import { bloqueoActuacion, m365Habilitado } from '@/lib/area1-m365'
import { getOutlookConnectionStatus, getOutlookUserAccessToken } from '@/lib/outlook-user-connection'
import { direccionesRecibidos, leerCorreosRecibidos } from '@/lib/area1-m365-graph'
import { eventosDeRecibidos } from '@/lib/area1-ficha-cliente'
export const dynamic = 'force-dynamic'
const DIAS = 180
const SIN_CACHE = { 'Cache-Control': 'no-store' }
/**
 * Área 1 · Ficha de cliente: correos RECIBIDOS de las personas de la ficha en el Outlook de quien la mira.
 * Solo lectura con su permiso delegado (GET /me/messages). No guarda el contenido, no marca como leído
 * y no envía nada. Cada usuario ve únicamente su propio buzón; no disponible durante «Actuar como».
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!m365Habilitado()) return NextResponse.json({ error: 'No disponible.' }, { status: 404 })
  const auth = await authorizeCrmEmpresas()
  if (auth.status !== 200 || !auth.user) return NextResponse.json({ error: auth.status === 401 ? 'No autorizado.' : 'No tienes permiso para ver esta ficha.' }, { status: auth.status })
  const session = await getServerSession(authOptions)
  const actuacion = bloqueoActuacion(session)
  if (actuacion) return NextResponse.json({ error: actuacion }, { status: 403 })
  const userId = Number(auth.user.id)
  const email = String(session?.user?.email || '').trim().toLowerCase()
  const conexion = await getOutlookConnectionStatus(userId)
  if (!conexion.enabled) return NextResponse.json({ error: 'La conexión con Outlook no está activa en este entorno.', estado: 'desactivado' }, { status: 409, headers: SIN_CACHE })
  if (!conexion.connected || !conexion.mail) return NextResponse.json({ error: conexion.connected ? 'Tu conexión de Outlook aún no incluye el permiso de correo.' : 'Conecta tu Outlook para ver aquí los correos del cliente.', estado: 'sin_conexion' }, { status: 409, headers: SIN_CACHE })
  const { id } = await context.params
  // Igual que la ficha: las personas solo cuentan si quien mira puede leer contactos.
  const verContactos = await canAccessCrmRelated(auth.user, 'admin.crm.contactos')
  const empresa = await prisma.crmEmpresa.findUnique({
    where: { id },
    select: { email: true, contactos: { where: { activo: true }, take: verContactos ? 50 : 0, orderBy: [{ principal: 'desc' }, { createdAt: 'asc' }], select: { contactoId: true, contacto: { select: { nombre: true, email: true } } } } },
  })
  if (!empresa) return NextResponse.json({ error: 'Empresa no encontrada.' }, { status: 404 })
  const personas = empresa.contactos.map((c) => ({ id: c.contactoId, nombre: c.contacto.nombre || c.contacto.email || 'Contacto sin nombre', email: c.contacto.email }))
  const direcciones = direccionesRecibidos([...personas.map((p) => p.email), empresa.email])
  if (!direcciones.length) return NextResponse.json({ eventos: [], direcciones: 0, dias: DIAS }, { headers: SIN_CACHE })
  let token
  try { token = await getOutlookUserAccessToken(userId, email, 'correo') } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Vuelve a conectar Outlook.', estado: 'sin_conexion' }, { status: 401, headers: SIN_CACHE })
  }
  const desde = new Date(Date.now() - DIAS * 86_400_000)
  const r = await leerCorreosRecibidos(token.accessToken, direcciones, { desde, top: 25 })
  if (!r.ok) return NextResponse.json({ error: 'Microsoft 365 no ha devuelto los correos ahora. Inténtalo más tarde.', codigoGraph: r.status }, { status: 502, headers: SIN_CACHE })
  return NextResponse.json({ eventos: eventosDeRecibidos(r.correos, personas, new Date()), direcciones: direcciones.length, dias: DIAS }, { headers: SIN_CACHE })
}
