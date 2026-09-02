import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { estadoTrasFeedback, normalizarEmail } from '@/lib/peticiones-flujo'
import { canImpersonate } from '@/lib/empleado-impersonation'

function peticionPropia(id: number, email: string) {
  return prisma.peticionInterna.findFirst({
    where: {
      id,
      usuarioEmail: { equals: normalizarEmail(email), mode: 'insensitive' },
    },
    include: { mensajes: { orderBy: { createdAt: 'asc' } } },
  })
}

// GET — obtener mis peticiones con su conversación o un resumen para el aviso de inicio
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sessionEmail = normalizarEmail(session.user.email)
  const requestedEmail = req.nextUrl.searchParams.get('as')
  let usuarioEmail = sessionEmail
  let isImpersonating = false

  if (requestedEmail && normalizarEmail(requestedEmail) !== sessionEmail) {
    if (!canImpersonate(sessionEmail, session.user.role || '')) {
      return NextResponse.json({ error: 'No tienes permisos para consultar las peticiones de otro usuario' }, { status: 403 })
    }
    usuarioEmail = normalizarEmail(requestedEmail)
    isImpersonating = true
  }

  if (req.nextUrl.searchParams.get('resumen') === 'validacion') {
    const peticiones = await prisma.peticionInterna.findMany({
      where: {
        usuarioEmail: { equals: usuarioEmail, mode: 'insensitive' },
        estado: 'pendiente_validacion',
      },
      select: { id: true, titulo: true, fechaResolucion: true },
      orderBy: { fechaResolucion: 'asc' },
    })
    return NextResponse.json({ total: peticiones.length, peticiones, isImpersonating, usuarioEmail })
  }

  const peticiones = await prisma.peticionInterna.findMany({
    where: { usuarioEmail: { equals: usuarioEmail, mode: 'insensitive' } },
    include: { mensajes: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })

  const ordenEstado: Record<string, number> = {
    pendiente_validacion: 0,
    ajustes_solicitados: 1,
    en_desarrollo: 2,
    aprobada: 3,
    pendiente: 4,
    resuelta: 5,
    descartada: 6,
  }
  peticiones.sort((a, b) => {
    const diferenciaEstado = (ordenEstado[a.estado] ?? 99) - (ordenEstado[b.estado] ?? 99)
    return diferenciaEstado || b.createdAt.getTime() - a.createdAt.getTime()
  })

  return NextResponse.json({ peticiones, isImpersonating, usuarioEmail })
}

// PUT — editar mi petición (solo si está pendiente)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()
    const { id, titulo, descripcion, captura } = body
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

    const existing = await peticionPropia(Number(id), session.user.email)
    if (!existing) return NextResponse.json({ error: 'Petición no encontrada' }, { status: 404 })
    if (existing.estado !== 'pendiente') return NextResponse.json({ error: 'Solo se pueden editar peticiones pendientes' }, { status: 400 })

    const updated = await prisma.peticionInterna.update({
      where: { id: Number(id) },
      data: {
        ...(typeof titulo === 'string' && titulo.trim() && { titulo: titulo.trim() }),
        ...(typeof descripcion === 'string' && descripcion.trim() && { descripcion: descripcion.trim() }),
        ...(captura !== undefined && { captura: captura || null }),
      },
    })
    return NextResponse.json({ success: true, peticion: updated })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH — validar una entrega como solicitante
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()
    const id = Number(body.id)
    const satisfecho = body.satisfecho
    const comentario = typeof body.comentario === 'string' ? body.comentario.trim() : ''

    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Petición no válida' }, { status: 400 })
    if (typeof satisfecho !== 'boolean') return NextResponse.json({ error: 'Debes indicar si la entrega cumple tus requisitos' }, { status: 400 })
    if (!satisfecho && !comentario) return NextResponse.json({ error: 'Explícanos qué ajustes necesitas para poder revisarlo' }, { status: 400 })

    const existing = await peticionPropia(id, session.user.email)
    if (!existing) return NextResponse.json({ error: 'Petición no encontrada' }, { status: 404 })
    if (existing.estado !== 'pendiente_validacion') {
      return NextResponse.json({ error: 'Esta petición no está pendiente de tu validación' }, { status: 409 })
    }

    const now = new Date()
    const estado = estadoTrasFeedback(satisfecho)
    const mensaje = comentario || 'Confirmo que la entrega cumple mis requisitos.'
    const autorEmail = normalizarEmail(session.user.email)
    const autorNombre = session.user.name || existing.usuarioNombre || autorEmail.split('@')[0]

    const updated = await prisma.$transaction(async tx => {
      const change = await tx.peticionInterna.updateMany({
        where: { id, estado: 'pendiente_validacion' },
        data: {
          estado,
          feedbackSatisfecho: satisfecho,
          fechaFeedback: now,
          fechaCierre: satisfecho ? now : null,
        },
      })
      if (change.count !== 1) throw new Error('FEEDBACK_CONFLICT')

      await tx.peticionMensaje.create({
        data: {
          peticionId: id,
          autorEmail,
          autorNombre,
          autorTipo: 'solicitante',
          tipo: satisfecho ? 'conformidad' : 'ajustes',
          mensaje,
        },
      })

      return tx.peticionInterna.findUniqueOrThrow({
        where: { id },
        include: { mensajes: { orderBy: { createdAt: 'asc' } } },
      })
    })

    return NextResponse.json({ success: true, peticion: updated })
  } catch (error: any) {
    if (error.message === 'FEEDBACK_CONFLICT') {
      return NextResponse.json({ error: 'Esta petición ya ha recibido una respuesta de validación' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE — eliminar mi petición (solo si está pendiente)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const id = Number(searchParams.get('id'))
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

    const existing = await peticionPropia(id, session.user.email)
    if (!existing) return NextResponse.json({ error: 'Petición no encontrada' }, { status: 404 })
    if (existing.estado !== 'pendiente') return NextResponse.json({ error: 'Solo se pueden eliminar peticiones pendientes' }, { status: 400 })

    await prisma.peticionInterna.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST — crear nueva petición
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()
    const { tipo, seccion, captura } = body
    const titulo = typeof body.titulo === 'string' ? body.titulo.trim() : ''
    const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : ''

    if (!titulo || !descripcion) {
      return NextResponse.json({ error: 'Título y descripción son obligatorios' }, { status: 400 })
    }

    const usuarioEmail = normalizarEmail(session.user.email)
    const peticion = await prisma.peticionInterna.create({
      data: {
        tipo: tipo || 'mejora',
        seccion: seccion || 'panel_admin',
        titulo,
        descripcion,
        captura: captura || null,
        usuarioEmail,
        usuarioNombre: session.user.name || usuarioEmail.split('@')[0],
        prioridad: tipo === 'error' ? 'alta' : 'media',
      },
    })

    return NextResponse.json({ success: true, peticion })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
