import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { estadoTrasFeedback, estadosCompatibles, normalizarEmail, normalizarEstado } from '@/lib/peticiones-flujo'
import { requireArea8Auth, area8Fail } from '@/lib/area8/auth'
import { includePeticion, petitionError, recordStateEvent, serializePeticion } from '@/lib/area8/peticiones'
import { Area8InputError, checkWriteOrigin, pageUrl, positiveId, readBody, screenshot, text, urgency } from '@/lib/area8/validation'

const ownWhere = (id: number, email: string) => ({ id, usuarioEmail: { equals: email, mode: 'insensitive' as const } })
const ownPetition = (id: number, email: string) => prisma.peticionInterna.findFirst({ where: ownWhere(id, email), include: includePeticion })
const readOnlyAs = (req: NextRequest) => req.nextUrl.searchParams.has('as')

// Los selectores del navegador solo habilitan una consulta autorizada, nunca escritura.
export async function GET(req: NextRequest) {
  const auth = await requireArea8Auth()
  if ('error' in auth) return auth.error
  try {
    const requested = req.nextUrl.searchParams.get('as')
    let email = auth.email
    let isImpersonating = auth.acting
    if (requested && normalizarEmail(requested) !== email) {
      if (!auth.owner || auth.acting) return area8Fail('No tienes permiso para consultar las peticiones de otra persona.', 403).error
      const target = await prisma.usuarioAdmin.findFirst({ where: { email: { equals: normalizarEmail(requested), mode: 'insensitive' }, activo: true }, select: { email: true } })
      if (!target) return area8Fail('No se puede consultar esta cuenta.', 404).error
      email = normalizarEmail(target.email)
      isImpersonating = true
    }
    const where = { usuarioEmail: { equals: email, mode: 'insensitive' as const } }
    if (req.nextUrl.searchParams.get('resumen') === 'validacion') {
      const filtro = { ...where, estado: { in: estadosCompatibles('en_pruebas') } }
      const [peticiones, total] = await Promise.all([
        prisma.peticionInterna.findMany({ where: filtro, select: { id: true, titulo: true, fechaResolucion: true }, orderBy: { fechaResolucion: 'asc' }, take: 100 }),
        prisma.peticionInterna.count({ where: filtro }),
      ])
      return NextResponse.json({ total, peticiones, isImpersonating, usuarioEmail: email })
    }
    const page = Math.min(10000, Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1))
    if (!Number.isSafeInteger(page)) throw new Area8InputError('Página no válida.')
    const [peticiones, total] = await Promise.all([
      prisma.peticionInterna.findMany({ where, include: includePeticion, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200, skip: (page - 1) * 200 }),
      prisma.peticionInterna.count({ where }),
    ])
    return NextResponse.json({ peticiones: peticiones.map(serializePeticion), total, page, hasMore: page * 200 < total, isImpersonating, usuarioEmail: email })
  } catch (error) { return petitionError(error) }
}

export async function POST(req: NextRequest) {
  const auth = await requireArea8Auth({ write: true })
  if ('error' in auth) return auth.error
  if (readOnlyAs(req)) return area8Fail('Esta consulta es de solo lectura.', 403).error
  try {
    const body = await readBody(req)
    if (body.action === 'comentario') {
      const id = positiveId(body.id)
      const mensaje = text(body.mensaje, 'Comentario', 2000)
      const existing = await ownPetition(id, auth.email)
      if (!existing) return area8Fail('Petición no encontrada.', 404).error
      if (['hecha', 'descartada'].includes(normalizarEstado(existing.estado) || '')) return area8Fail('La conversación de esta petición está cerrada.', 409).error
      const peticion = await prisma.$transaction(async tx => {
        const change = await tx.peticionInterna.updateMany({ where: { ...ownWhere(id, auth.email), estado: existing.estado }, data: { updatedAt: new Date() } })
        if (change.count !== 1) throw new Error('AREA8_CONFLICT')
        await tx.peticionMensaje.create({ data: { peticionId: id, autorEmail: auth.email, autorNombre: auth.nombre, autorTipo: 'solicitante', tipo: 'comentario', mensaje } })
        return tx.peticionInterna.findUniqueOrThrow({ where: { id }, include: includePeticion })
      })
      return NextResponse.json({ success: true, peticion: serializePeticion(peticion) })
    }
    if (body.action === 'leer_aviso') {
      if (body.confirmo !== true) throw new Area8InputError('Confirma que has leído este aviso.')
      const id = text(body.eventoId, 'Aviso', 100)
      const count = await prisma.area8PeticionEvento.updateMany({ where: { id, usuarioEmail: { equals: auth.email, mode: 'insensitive' }, leidoAt: null }, data: { leidoAt: new Date() } })
      return NextResponse.json({ success: true, marcado: count.count === 1 })
    }
    if (body.action !== undefined) throw new Area8InputError('Acción no reconocida.')
    const tipo = body.tipo || 'mejora'
    const seccion = body.seccion || 'panel_admin'
    if (!['error', 'mejora', 'sugerencia'].includes(tipo) || !['panel_admin', 'web_publica', 'portal_empleado'].includes(seccion)) throw new Area8InputError('Tipo o sección no válidos.')
    const peticion = await prisma.peticionInterna.create({ data: {
      tipo, seccion, titulo: text(body.titulo, 'Título', 200), descripcion: text(body.descripcion, 'Descripción', 10000),
      captura: screenshot(body.captura), paginaUrl: pageUrl(body.paginaUrl), urgencia: urgency(body.urgencia || 'media'),
      usuarioEmail: auth.email, usuarioNombre: auth.nombre, prioridad: 'media', estado: 'nueva',
    }, include: includePeticion })
    return NextResponse.json({ success: true, peticion: serializePeticion(peticion) }, { status: 201 })
  } catch (error) { return petitionError(error) }
}

export async function PUT(req: NextRequest) {
  const auth = await requireArea8Auth({ write: true })
  if ('error' in auth) return auth.error
  if (readOnlyAs(req)) return area8Fail('Esta consulta es de solo lectura.', 403).error
  try {
    const body = await readBody(req)
    const id = positiveId(body.id)
    const existing = await ownPetition(id, auth.email)
    if (!existing) return area8Fail('Petición no encontrada.', 404).error
    if (normalizarEstado(existing.estado) !== 'nueva') return area8Fail('Solo se pueden editar peticiones nuevas.', 409).error
    if (body.tipo !== undefined && !['error', 'mejora', 'sugerencia'].includes(body.tipo)) throw new Area8InputError('Tipo no válido.')
    if (body.seccion !== undefined && !['panel_admin', 'web_publica', 'portal_empleado'].includes(body.seccion)) throw new Area8InputError('Sección no válida.')
    const data = {
      ...(body.tipo !== undefined && { tipo: body.tipo }),
      ...(body.seccion !== undefined && { seccion: body.seccion }),
      ...(body.titulo !== undefined && { titulo: text(body.titulo, 'Título', 200) }),
      ...(body.descripcion !== undefined && { descripcion: text(body.descripcion, 'Descripción', 10000) }),
      ...(body.captura !== undefined && { captura: screenshot(body.captura) }),
      ...(body.paginaUrl !== undefined && { paginaUrl: pageUrl(body.paginaUrl) }),
      ...(body.urgencia !== undefined && { urgencia: urgency(body.urgencia) }),
    }
    const peticion = await prisma.$transaction(async tx => {
      const change = await tx.peticionInterna.updateMany({ where: { ...ownWhere(id, auth.email), estado: existing.estado }, data })
      if (change.count !== 1) throw new Error('AREA8_CONFLICT')
      return tx.peticionInterna.findUniqueOrThrow({ where: { id }, include: includePeticion })
    })
    return NextResponse.json({ success: true, peticion: serializePeticion(peticion) })
  } catch (error) { return petitionError(error) }
}

// Solamente quien pidió la mejora puede dar conformidad: no la da un despliegue.
export async function PATCH(req: NextRequest) {
  const auth = await requireArea8Auth({ write: true })
  if ('error' in auth) return auth.error
  if (readOnlyAs(req)) return area8Fail('Esta consulta es de solo lectura.', 403).error
  try {
    const body = await readBody(req)
    const id = positiveId(body.id)
    if (typeof body.satisfecho !== 'boolean') throw new Area8InputError('Indica si la entrega cumple tus requisitos.')
    const comentario = body.comentario === undefined ? '' : text(body.comentario, 'Comentario', 2000, false)
    if (!body.satisfecho && !comentario) throw new Area8InputError('Explica qué ajustes necesitas.')
    const existing = await ownPetition(id, auth.email)
    if (!existing) return area8Fail('Petición no encontrada.', 404).error
    if (normalizarEstado(existing.estado) !== 'en_pruebas') return area8Fail('Esta petición no está pendiente de tu conformidad.', 409).error
    const estado = estadoTrasFeedback(body.satisfecho)
    const now = new Date()
    const mensaje = comentario || 'Confirmo que la entrega cumple mis requisitos.'
    const peticion = await prisma.$transaction(async tx => {
      const change = await tx.peticionInterna.updateMany({ where: { ...ownWhere(id, auth.email), estado: existing.estado }, data: { estado, feedbackSatisfecho: body.satisfecho, fechaFeedback: now, fechaCierre: body.satisfecho ? now : null } })
      if (change.count !== 1) throw new Error('AREA8_CONFLICT')
      await tx.peticionMensaje.create({ data: { peticionId: id, autorEmail: auth.email, autorNombre: auth.nombre, autorTipo: 'solicitante', tipo: body.satisfecho ? 'conformidad' : 'ajustes', mensaje } })
      await recordStateEvent(tx, existing, estado, auth.id, mensaje)
      return tx.peticionInterna.findUniqueOrThrow({ where: { id }, include: includePeticion })
    })
    return NextResponse.json({ success: true, peticion: serializePeticion(peticion), aviso: { preparado: true, enviado: false, canal: 'aplicacion' } })
  } catch (error) { return petitionError(error) }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireArea8Auth({ write: true })
  if ('error' in auth) return auth.error
  if (readOnlyAs(req)) return area8Fail('Esta consulta es de solo lectura.', 403).error
  try {
    checkWriteOrigin(req)
    const id = positiveId(req.nextUrl.searchParams.get('id'))
    const existing = await ownPetition(id, auth.email)
    if (!existing) return area8Fail('Petición no encontrada.', 404).error
    if (normalizarEstado(existing.estado) !== 'nueva' || existing.eventos.length || existing.tramitadaAt || existing.responsableId || existing.notasAdmin || existing.mensajes.some(message => message.autorTipo === 'admin')) return area8Fail('Solo puedes retirar una petición nueva que todavía no se haya tramitado.', 409).error
    const result = await prisma.peticionInterna.deleteMany({ where: { ...ownWhere(id, auth.email), estado: existing.estado, tramitadaAt: null, responsableId: null, notasAdmin: null, mensajes: { none: { autorTipo: 'admin' } }, eventos: { none: {} } } })
    if (result.count !== 1) throw new Error('AREA8_CONFLICT')
    return NextResponse.json({ success: true })
  } catch (error) { return petitionError(error) }
}
