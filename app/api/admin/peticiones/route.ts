import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { normalizarEmail, puedeCambiarEstadoAdmin, puedeEnviarAValidacion } from '@/lib/peticiones-flujo'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || session.user.userType !== 'admin') return null
  return session
}

const includeConversacion = {
  mensajes: { orderBy: { createdAt: 'asc' as const } },
}

// GET — obtener todas las peticiones (admin)
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const estado = searchParams.get('estado') || ''
  const tipo = searchParams.get('tipo') || ''

  const where: any = {}
  if (estado) where.estado = estado
  if (tipo) where.tipo = tipo

  const [peticiones, todas] = await Promise.all([
    prisma.peticionInterna.findMany({
      where,
      include: includeConversacion,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.peticionInterna.findMany({ select: { estado: true, tipo: true } }),
  ])

  const kpis = {
    total: todas.length,
    pendientes: todas.filter(p => p.estado === 'pendiente').length,
    aprobadas: todas.filter(p => p.estado === 'aprobada').length,
    enDesarrollo: todas.filter(p => p.estado === 'en_desarrollo').length,
    porValidar: todas.filter(p => p.estado === 'pendiente_validacion').length,
    conAjustes: todas.filter(p => p.estado === 'ajustes_solicitados').length,
    resueltas: todas.filter(p => p.estado === 'resuelta').length,
    descartadas: todas.filter(p => p.estado === 'descartada').length,
    errores: todas.filter(p => p.tipo === 'error').length,
    mejoras: todas.filter(p => p.tipo === 'mejora').length,
    sugerencias: todas.filter(p => p.tipo === 'sugerencia').length,
  }

  return NextResponse.json({ peticiones, kpis })
}

// POST — acciones admin
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()
    const { action } = body
    const id = Number(body.id)

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Petición no válida' }, { status: 400 })
    }

    const existing = await prisma.peticionInterna.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Petición no encontrada' }, { status: 404 })

    if (action === 'cambiar_estado') {
      if (body.estado === 'resuelta') {
        return NextResponse.json({ error: 'El cierre solo se realiza cuando el solicitante confirma que está satisfecho' }, { status: 409 })
      }
      if (body.estado === 'pendiente_validacion') {
        return NextResponse.json({ error: 'Utiliza “Enviar al usuario para validación” e indica qué se ha realizado' }, { status: 409 })
      }
      if (!puedeCambiarEstadoAdmin(body.estado)) {
        return NextResponse.json({ error: 'Estado no permitido para administración' }, { status: 400 })
      }

      const peticion = await prisma.peticionInterna.update({
        where: { id },
        data: { estado: body.estado },
        include: includeConversacion,
      })
      return NextResponse.json({ success: true, peticion })
    }

    if (action === 'enviar_validacion') {
      const mensaje = typeof body.mensaje === 'string' ? body.mensaje.trim() : ''
      if (!mensaje) {
        return NextResponse.json({ error: 'Explica al solicitante qué se ha realizado antes de enviar a validación' }, { status: 400 })
      }
      if (!puedeEnviarAValidacion(existing.estado)) {
        return NextResponse.json({ error: 'La petición debe estar aprobada, en desarrollo o requerir ajustes antes de enviarla a validación' }, { status: 409 })
      }

      const now = new Date()
      const autorEmail = normalizarEmail(session.user.email)
      const autorNombre = session.user.name || autorEmail
      const peticion = await prisma.$transaction(async tx => {
        await tx.peticionMensaje.create({
          data: {
            peticionId: id,
            autorEmail,
            autorNombre,
            autorTipo: 'admin',
            tipo: 'entrega',
            mensaje,
          },
        })

        return tx.peticionInterna.update({
          where: { id },
          data: {
            estado: 'pendiente_validacion',
            notasAdmin: mensaje,
            resueltaPor: autorNombre,
            fechaResolucion: now,
            feedbackSatisfecho: null,
            fechaFeedback: null,
            fechaCierre: null,
          },
          include: includeConversacion,
        })
      })

      return NextResponse.json({ success: true, peticion })
    }

    if (action === 'cambiar_prioridad') {
      const prioridades = ['baja', 'media', 'alta', 'critica']
      if (!prioridades.includes(body.prioridad)) return NextResponse.json({ error: 'Prioridad no válida' }, { status: 400 })

      const peticion = await prisma.peticionInterna.update({
        where: { id },
        data: { prioridad: body.prioridad },
        include: includeConversacion,
      })
      return NextResponse.json({ success: true, peticion })
    }

    if (action === 'notas_admin') {
      const notas = typeof body.notas === 'string' ? body.notas.trim() : ''
      const peticion = await prisma.peticionInterna.update({
        where: { id },
        data: { notasAdmin: notas || null },
        include: includeConversacion,
      })
      return NextResponse.json({ success: true, peticion })
    }

    if (action === 'eliminar') {
      await prisma.peticionInterna.delete({ where: { id } })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
