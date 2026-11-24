import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { normalizarEstado, estadosCompatibles, puedeCambiarEstadoAdmin, puedeEnviarAValidacion, transicionAdminPermitida } from '@/lib/peticiones-flujo'
import { requireArea8Auth, area8Fail } from '@/lib/area8/auth'
import { includePeticion, petitionError, recordStateEvent, serializePeticion } from '@/lib/area8/peticiones'
import { Area8InputError, positiveId, readBody, text, urgency } from '@/lib/area8/validation'

export async function GET(req: NextRequest) {
  const auth = await requireArea8Auth({ management: true })
  if ('error' in auth) return auth.error
  try {
    const estado = req.nextUrl.searchParams.get('estado') || ''
    const tipo = req.nextUrl.searchParams.get('tipo') || ''
    const normalized = normalizarEstado(estado)
    if (estado && !normalized || tipo && !['error', 'mejora', 'sugerencia'].includes(tipo)) throw new Area8InputError('Filtro no válido.')
    const page = Math.min(10000, Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1))
    if (!Number.isSafeInteger(page)) throw new Area8InputError('Página no válida.')
    const where = { ...(normalized && { estado: { in: estadosCompatibles(normalized) } }), ...(tipo && { tipo }) }
    const [peticiones, counts, tipos, totalFiltrado, responsables] = await Promise.all([
      prisma.peticionInterna.findMany({ where, include: includePeticion, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, skip: (page - 1) * 100 }),
      prisma.peticionInterna.groupBy({ by: ['estado'], _count: { _all: true } }),
      prisma.peticionInterna.groupBy({ by: ['tipo'], _count: { _all: true } }),
      prisma.peticionInterna.count({ where }),
      prisma.usuarioAdmin.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' }, take: 200 }),
    ])
    const stateCount = (value: string) => counts.reduce((sum, row) => sum + (normalizarEstado(row.estado) === value ? row._count._all : 0), 0)
    const typeCount = (value: string) => tipos.reduce((sum, row) => sum + (row.tipo === value ? row._count._all : 0), 0)
    const kpis = {
      total: counts.reduce((sum, row) => sum + row._count._all, 0),
      nuevas: stateCount('nueva'), pendientes: stateCount('nueva'), enAnalisis: stateCount('en_analisis'),
      aprobadas: stateCount('aprobada'), enDesarrollo: stateCount('en_desarrollo'),
      enPruebas: stateCount('en_pruebas'), porValidar: stateCount('en_pruebas'),
      conAjustes: counts.filter(row => row.estado === 'ajustes_solicitados').reduce((sum, row) => sum + row._count._all, 0),
      hechas: stateCount('hecha'), resueltas: stateCount('hecha'), descartadas: stateCount('descartada'),
      errores: typeCount('error'), mejoras: typeCount('mejora'), sugerencias: typeCount('sugerencia'),
    }
    const writable = await requireArea8Auth({ management: true, write: true })
    return NextResponse.json({ peticiones: peticiones.map(serializePeticion), kpis, responsables, capacidades: { gestionar: !('error' in writable), priorizar: auth.owner }, total: totalFiltrado, page, hasMore: page * 100 < totalFiltrado })
  } catch (error) { return petitionError(error) }
}

export async function POST(req: NextRequest) {
  const auth = await requireArea8Auth({ management: true, write: true })
  if ('error' in auth) return auth.error
  try {
    const body = await readBody(req)
    const id = positiveId(body.id)
    const existing = await prisma.peticionInterna.findUnique({ where: { id } })
    if (!existing) return area8Fail('Petición no encontrada.', 404).error
    const action = body.action
    // No se elimina el historial de una petición tramitada.
    if (action === 'eliminar') return area8Fail('Conserva la petición y su historial. Si no procede, descártala.', 409).error
    if (action === 'cambiar_prioridad' && !auth.owner) return area8Fail('Solo Víctor puede priorizar peticiones.', 403).error
    if (['hecha', 'descartada'].includes(normalizarEstado(existing.estado) || '')) return area8Fail('Esta petición está cerrada. Su historial se conserva.', 409).error

    const peticion = await prisma.$transaction(async tx => {
      const change = async (data: Record<string, any>) => {
        const result = await tx.peticionInterna.updateMany({ where: { id, estado: existing.estado, updatedAt: existing.updatedAt }, data: { ...data, tramitadaAt: existing.tramitadaAt || new Date() } })
        if (result.count !== 1) throw new Error('AREA8_CONFLICT')
      }
      if (action === 'cambiar_estado') {
        const estado = normalizarEstado(body.estado)
        if (estado === 'hecha') throw new Area8InputError('El cierre lo confirma quien pidió la mejora.')
        if (estado === 'en_pruebas') throw new Area8InputError('Utiliza «Enviar a pruebas» y explica lo realizado.')
        if (!puedeCambiarEstadoAdmin(estado)) throw new Area8InputError('Estado no permitido.')
        if (!transicionAdminPermitida(existing.estado, estado)) throw new Error('AREA8_CONFLICT')
        await change({ estado })
        await recordStateEvent(tx, existing, estado, auth.id)
      } else if (action === 'enviar_validacion') {
        const mensaje = text(body.mensaje, 'Resumen de lo realizado', 2000)
        if (!puedeEnviarAValidacion(existing.estado)) throw new Error('AREA8_CONFLICT')
        await change({ estado: 'en_pruebas', notasAdmin: mensaje, resueltaPor: auth.nombre, fechaResolucion: new Date(), feedbackSatisfecho: null, fechaFeedback: null, fechaCierre: null })
        await tx.peticionMensaje.create({ data: { peticionId: id, autorEmail: auth.email, autorNombre: auth.nombre, autorTipo: 'admin', tipo: 'entrega', mensaje } })
        await recordStateEvent(tx, existing, 'en_pruebas', auth.id, mensaje)
      } else if (action === 'comentario') {
        const mensaje = text(body.mensaje, 'Comentario', 2000)
        await change({ updatedAt: new Date() })
        await tx.peticionMensaje.create({ data: { peticionId: id, autorEmail: auth.email, autorNombre: auth.nombre, autorTipo: 'admin', tipo: 'comentario', mensaje } })
      } else if (action === 'asignar_responsable') {
        const responsableId = body.responsableId === null ? null : positiveId(body.responsableId)
        if (responsableId !== null) {
          const responsible = await tx.usuarioAdmin.findUnique({ where: { id: responsableId }, select: { activo: true } })
          if (!responsible?.activo) throw new Area8InputError('Selecciona una persona con cuenta activa.')
        }
        await change({ responsableId })
      } else if (action === 'cambiar_prioridad') {
        await change({ prioridad: urgency(body.prioridad) })
      } else if (action === 'notas_admin') {
        await change({ notasAdmin: text(body.notas || '', 'Notas', 10000, false) || null })
      } else throw new Area8InputError('Acción no reconocida.')
      return tx.peticionInterna.findUniqueOrThrow({ where: { id }, include: includePeticion })
    })
    return NextResponse.json({ success: true, peticion: serializePeticion(peticion), aviso: { preparado: ['cambiar_estado', 'enviar_validacion'].includes(action), enviado: false, canal: 'aplicacion' } })
  } catch (error) { return petitionError(error) }
}
