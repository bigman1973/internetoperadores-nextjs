import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
export const dynamic = 'force-dynamic'

// GET: Obtener planificaciones, ejecuciones e imputaciones
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const anio = parseInt(searchParams.get('anio') || new Date().getFullYear().toString())

    // Planificaciones activas (pendientes + programadas)
    const planificaciones = await prisma.actualizacionPlanificada.findMany({
      where: { estado: { in: ['pendiente', 'programada'] } },
      include: { ejecuciones: { select: { id: true, fecha: true, horasDedicadas: true } } },
      orderBy: { fechaPropuesta: 'asc' }
    })

    // Planificaciones completadas/canceladas
    const planificacionesHistorico = await prisma.actualizacionPlanificada.findMany({
      where: { estado: { in: ['ejecutada', 'cancelada'] } },
      include: { ejecuciones: { select: { id: true, fecha: true, horasDedicadas: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 20
    })

    // Ejecuciones del año
    const inicioAnio = new Date(anio, 0, 1)
    const finAnio = new Date(anio, 11, 31)
    const ejecuciones = await prisma.actualizacionEjecucion.findMany({
      where: { fecha: { gte: inicioAnio, lte: finAnio } },
      include: {
        imputaciones: true,
        planificacion: { select: { titulo: true } }
      },
      orderBy: { fecha: 'desc' }
    })

    // Contratos Draxton para imputar
    const contratos = await prisma.contratoDraxton.findMany({
      where: { estado: { in: ['activo', 'renovacion'] } },
      select: { id: true, titulo: true, codigoContrato: true, tipo: true },
      orderBy: { titulo: 'asc' }
    })

    // KPIs
    const totalHoras = ejecuciones.reduce((s, e) => s + e.horasDedicadas, 0)
    const totalCoste = ejecuciones.reduce((s, e) => s + (e.costeTotal || 0), 0)
    const horasImputadas = ejecuciones.reduce((s, e) => s + e.totalImputado, 0)
    const horasPendientes = totalHoras - horasImputadas

    return NextResponse.json({
      planificaciones,
      planificacionesHistorico,
      ejecuciones,
      contratos,
      kpis: {
        totalHoras: Math.round(totalHoras * 10) / 10,
        totalCoste: Math.round(totalCoste * 100) / 100,
        horasImputadas: Math.round(horasImputadas * 10) / 10,
        horasPendientes: Math.round(horasPendientes * 10) / 10,
        totalEjecuciones: ejecuciones.length,
        planificacionesPendientes: planificaciones.filter(p => p.estado === 'pendiente').length,
      }
    })
  } catch (error: any) {
    console.error('Error GET actualizaciones:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: CRUD de planificaciones, ejecuciones e imputaciones
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    switch (action) {
      // === PLANIFICACIONES ===
      case 'crearPlanificacion': {
        const plan = await prisma.actualizacionPlanificada.create({
          data: {
            titulo: body.titulo,
            descripcion: body.descripcion || null,
            prioridad: body.prioridad || 'normal',
            estado: body.estado || 'pendiente',
            fechaPropuesta: body.fechaPropuesta ? new Date(body.fechaPropuesta) : null,
            servidoresAfectados: body.servidoresAfectados || null,
            plantasAfectadas: body.plantasAfectadas || null,
            solicitadoPor: body.solicitadoPor || null,
            tecnicoAsignado: body.tecnicoAsignado || null,
            notas: body.notas || null,
          }
        })
        return NextResponse.json({ success: true, planificacion: plan })
      }

      case 'actualizarPlanificacion': {
        const plan = await prisma.actualizacionPlanificada.update({
          where: { id: body.planificacionId },
          data: {
            titulo: body.titulo,
            descripcion: body.descripcion,
            prioridad: body.prioridad,
            estado: body.estado,
            fechaPropuesta: body.fechaPropuesta ? new Date(body.fechaPropuesta) : undefined,
            servidoresAfectados: body.servidoresAfectados,
            plantasAfectadas: body.plantasAfectadas,
            solicitadoPor: body.solicitadoPor,
            tecnicoAsignado: body.tecnicoAsignado,
            notas: body.notas,
          }
        })
        return NextResponse.json({ success: true, planificacion: plan })
      }

      // === EJECUCIONES ===
      case 'crearEjecucion': {
        const costeHora = body.costeHora ? parseFloat(body.costeHora) : null
        const horas = parseFloat(body.horasDedicadas)
        const costeTotal = costeHora ? horas * costeHora : null

        const ejec = await prisma.actualizacionEjecucion.create({
          data: {
            planificacionId: body.planificacionId || null,
            fecha: new Date(body.fecha),
            tecnicoId: body.tecnicoId || null,
            tecnicoNombre: body.tecnicoNombre || null,
            nivelTecnico: body.nivelTecnico || 2,
            horasDedicadas: horas,
            tipo: body.tipo || 'remoto',
            plantasAfectadas: body.plantasAfectadas || null,
            descripcion: body.descripcion || null,
            costeHora,
            costeTotal,
            totalImputado: 0,
            pendienteImputar: horas,
          }
        })

        // Si viene de una planificación, marcarla como ejecutada si no hay más pendientes
        if (body.planificacionId && body.marcarEjecutada) {
          await prisma.actualizacionPlanificada.update({
            where: { id: body.planificacionId },
            data: { estado: 'ejecutada' }
          })
        }

        return NextResponse.json({ success: true, ejecucion: ejec })
      }

      case 'actualizarEjecucion': {
        const costeHora = body.costeHora ? parseFloat(body.costeHora) : undefined
        const horas = body.horasDedicadas ? parseFloat(body.horasDedicadas) : undefined
        const costeTotal = costeHora && horas ? horas * costeHora : undefined

        const ejec = await prisma.actualizacionEjecucion.update({
          where: { id: body.ejecucionId },
          data: {
            fecha: body.fecha ? new Date(body.fecha) : undefined,
            tecnicoId: body.tecnicoId,
            tecnicoNombre: body.tecnicoNombre,
            nivelTecnico: body.nivelTecnico,
            horasDedicadas: horas,
            tipo: body.tipo,
            plantasAfectadas: body.plantasAfectadas,
            descripcion: body.descripcion,
            costeHora,
            costeTotal,
          }
        })
        return NextResponse.json({ success: true, ejecucion: ejec })
      }

      // === IMPUTACIONES ===
      case 'imputarHoras': {
        // body.imputaciones = [{ contratoId, horas, notas }]
        const ejecucion = await prisma.actualizacionEjecucion.findUnique({
          where: { id: body.ejecucionId },
          include: { imputaciones: true }
        })
        if (!ejecucion) return NextResponse.json({ error: 'Ejecucion no encontrada' }, { status: 404 })

        const imputaciones = body.imputaciones as { contratoId: string; horas: number; notas?: string }[]
        const totalNuevo = imputaciones.reduce((s, i) => s + i.horas, 0)
        const totalExistente = ejecucion.imputaciones.reduce((s, i) => s + i.horas, 0)

        if (totalExistente + totalNuevo > ejecucion.horasDedicadas + 0.01) {
          return NextResponse.json({ error: `No puedes imputar mas de ${ejecucion.horasDedicadas}h (ya imputadas: ${totalExistente}h)` }, { status: 400 })
        }

        // Crear imputaciones
        for (const imp of imputaciones) {
          await prisma.actualizacionImputacion.create({
            data: {
              ejecucionId: body.ejecucionId,
              contratoId: imp.contratoId,
              horas: imp.horas,
              notas: imp.notas || null,
            }
          })
        }

        // Actualizar totales en ejecución
        const nuevoTotal = totalExistente + totalNuevo
        await prisma.actualizacionEjecucion.update({
          where: { id: body.ejecucionId },
          data: {
            totalImputado: nuevoTotal,
            pendienteImputar: ejecucion.horasDedicadas - nuevoTotal,
          }
        })

        return NextResponse.json({ success: true })
      }

      case 'eliminarImputacion': {
        const imp = await prisma.actualizacionImputacion.findUnique({ where: { id: body.imputacionId } })
        if (!imp) return NextResponse.json({ error: 'Imputacion no encontrada' }, { status: 404 })

        await prisma.actualizacionImputacion.delete({ where: { id: body.imputacionId } })

        // Recalcular totales
        const ejec = await prisma.actualizacionEjecucion.findUnique({
          where: { id: imp.ejecucionId },
          include: { imputaciones: true }
        })
        if (ejec) {
          const total = ejec.imputaciones.reduce((s, i) => s + i.horas, 0)
          await prisma.actualizacionEjecucion.update({
            where: { id: ejec.id },
            data: { totalImputado: total, pendienteImputar: ejec.horasDedicadas - total }
          })
        }

        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: `Accion no reconocida: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Error POST actualizaciones:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const id = searchParams.get('id')

    if (!type || !id) return NextResponse.json({ error: 'Faltan type e id' }, { status: 400 })

    switch (type) {
      case 'planificacion':
        await prisma.actualizacionPlanificada.delete({ where: { id } })
        break
      case 'ejecucion':
        await prisma.actualizacionEjecucion.delete({ where: { id } })
        break
      default:
        return NextResponse.json({ error: `Tipo no reconocido: ${type}` }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE actualizaciones:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
