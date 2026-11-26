import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { authorizeCrmEmpresas, canAccessCrmRelated } from '@/lib/crm-empresas-auth'
import { bloqueoActuacion } from '@/lib/area1-m365'
import { m365LegacyPendingBody, m365LegacyLocalSandboxEnabled } from '@/lib/m365-legacy-policy'
import { EMPRESA_ACTIVIDAD_ACTION, isEmpresaLocalActivityCommand, parseEmpresaLocalActivity } from '@/lib/crm-empresa-actividad-core'

/** POST de actividad en la superficie de empresa existente. Nunca importa ni llama proveedores. */
export async function registrarActividadEmpresa(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || session.user.userType !== 'admin') return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  const acting = bloqueoActuacion(session)
  if (acting) return NextResponse.json({ error: acting }, { status: 403 })
  const auth = await authorizeCrmEmpresas(true)
  if (!auth.user) return NextResponse.json({ error: 'No tienes permiso de escritura en empresas CRM.' }, { status: auth.status })
  if (auth.user.id !== Number(session.user.id)) return NextResponse.json({ error: 'La sesión ha cambiado. Recarga la ficha.' }, { status: 401 })
  if (process.env.IO_PRODUCTION_READ_ONLY === '1' || process.env.FINANCE_DEPLOYMENT_READ_ONLY === '1') return NextResponse.json({ error: 'La aplicación está en modo de solo lectura.' }, { status: 403 })
  if (process.env.FINANCE_STAGING_SANDBOX === '1' && !m365LegacyLocalSandboxEnabled()) return NextResponse.json({ error: 'Actividad local no disponible en este sandbox.' }, { status: 503 })
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') return NextResponse.json({ error: 'Se requiere un cuerpo JSON.' }, { status: 415 })
  const declared = request.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 16 * 1024)) return NextResponse.json({ error: 'La actividad supera el tamaño permitido.' }, { status: 413 })
  let body: Record<string, unknown>
  try {
    const reader = request.body?.getReader()
    if (!reader) return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 })
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let bytes = 0, raw = ''
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > 16 * 1024) { void reader.cancel().catch(() => undefined); return NextResponse.json({ error: 'La actividad supera el tamaño permitido.' }, { status: 413 }) }
      raw += decoder.decode(part.value, { stream: true })
    }
    const value = JSON.parse(raw + decoder.decode())
    if (!value || typeof value !== 'object' || Array.isArray(value)) return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 })
    body = value
  } catch { return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 }) }
  if (body.action !== EMPRESA_ACTIVIDAD_ACTION || (body.accion !== undefined && body.accion !== body.action)) return NextResponse.json({ error: 'Acción local no válida.' }, { status: 400 })
  // Cierre duro de esta operación local, incluso si las puertas M365 se activan en otra ruta.
  if (body.type === 'CORREO' || ['syncOutlook', 'viaOutlook', 'prepareExternalChannel', 'onlineMeeting', 'inviteAttendees'].some(k => body[k] !== undefined && body[k] !== false)) return NextResponse.json(m365LegacyPendingBody(), { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  if (!isEmpresaLocalActivityCommand(body)) return NextResponse.json({ error: 'Tipo de actividad local no válido.' }, { status: 400 })
  let parsed: ReturnType<typeof parseEmpresaLocalActivity>
  try { parsed = parseEmpresaLocalActivity(body) } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Actividad no válida.' }, { status: 400 }) }
  if (parsed.contactIds.length && !await canAccessCrmRelated(auth.user, 'admin.crm.contactos', true)) return NextResponse.json({ error: 'Necesitas permiso de escritura en Contactos para asociar personas.' }, { status: 403 })
  const { id } = await context.params
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return NextResponse.json({ error: 'Empresa no válida.' }, { status: 400 })
  const author = auth.user
  const fingerprint = createHash('sha256').update(JSON.stringify({ empresaId: id, ...parsed, activityDate: body.activityDate === undefined ? null : parsed.activityDate })).digest('hex')
  const existingSelect = { id: true, empresaId: true, creadoPorId: true, metadatos: true } as const
  const matches = (a: { empresaId: string | null; creadoPorId: number | null; metadatos: unknown }) => a.empresaId === id && a.creadoPorId === author.id && a.metadatos !== null && typeof a.metadatos === 'object' && !Array.isArray(a.metadatos) && (a.metadatos as Record<string, unknown>).huellaActividadLocal === fingerprint
  try {
    const result = await prisma.$transaction(async tx => {
      const empresa = await tx.crmEmpresa.findFirst({ where: { id, activo: true }, select: { id: true } })
      if (!empresa) return { error: 'Empresa no encontrada.', status: 404 }
      // Comprueba la pertenencia activa, no basta con que el contacto exista.
      const links = parsed.contactIds.length ? await tx.crmEmpresaContacto.findMany({
        where: { empresaId: id, activo: true, contactoId: { in: parsed.contactIds }, contacto: { objectTypeId: '0-1' } }, select: { contactoId: true }, take: 50,
      }) : []
      if (links.length !== parsed.contactIds.length) return { error: 'Una de las personas no está vinculada activamente a esta empresa.', status: 400 }
      const existing = await tx.crmActividad.findUnique({ where: { clientRequestId: parsed.clientRequestId }, select: existingSelect })
      if (existing) return matches(existing) ? { success: true, activityId: existing.id, duplicate: true } : { error: 'Esta operación ya pertenece a otra actividad, empresa o usuario.', status: 409 }
      const contactId = parsed.contactIds[0] || null
      const activity = await tx.crmActividad.create({ data: {
        empresaId: id, contactoId: contactId, tipo: parsed.type, titulo: parsed.title, descripcion: parsed.description,
        fechaActividad: parsed.activityDate, direccion: parsed.direction, resultado: parsed.result,
        duracionSegundos: parsed.durationMinutes === null ? null : parsed.durationMinutes * 60, origen: 'LOCAL',
        clientRequestId: parsed.clientRequestId, creadoPorId: author.id, creadoPorNombre: author.name,
        metadatos: { ambito: 'EMPRESA', huellaActividadLocal: fingerprint, ...(parsed.location ? { ubicacion: parsed.location } : {}) },
        contactos: parsed.contactIds.length ? { create: parsed.contactIds.map(contactoId => ({ contactoId })) } : undefined,
        tareaSeguimiento: parsed.followUp ? { create: {
          empresaId: id, contactoId: contactId, titulo: parsed.followUp.title,
          descripcion: parsed.type === 'TAREA' ? parsed.description : `Seguimiento de la actividad “${parsed.title}”.`,
          venceAt: parsed.followUp.dueAt, estado: 'PENDIENTE', prioridad: parsed.followUp.priority,
          asignadoAId: author.id, asignadoANombre: author.name, creadoPorId: author.id, creadoPorNombre: author.name,
        } } : undefined,
      }, select: { id: true } })
      return { success: true, activityId: activity.id, duplicate: false }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      const existing = await prisma.crmActividad.findUnique({ where: { clientRequestId: parsed.clientRequestId }, select: existingSelect })
      if (existing && matches(existing)) return NextResponse.json({ success: true, activityId: existing.id, duplicate: true })
      return NextResponse.json({ error: 'La operación ya existe. Recarga antes de reintentar.' }, { status: 409 })
    }
    // No se registran contenidos, destinatarios o datos personales en logs de error.
    console.error('[CRM-EMPRESAS] No se pudo registrar actividad local.')
    return NextResponse.json({ error: 'No se pudo registrar la actividad local. Recarga la ficha.' }, { status: 500 })
  }
}
