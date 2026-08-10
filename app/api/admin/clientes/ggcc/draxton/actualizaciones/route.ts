import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
export const dynamic = 'force-dynamic'

// GET: Obtener planificaciones, ejecuciones, imputaciones, tarifas y balance
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const anio = parseInt(searchParams.get('anio') || new Date().getFullYear().toString())
    const section = searchParams.get('section') || 'all'

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

    // Ejecuciones del año (o todas si se pide)
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

    // Técnicos asignados a Draxton (para selector)
    const personalDraxton = await prisma.personalContratoDraxton.findMany({
      where: { activo: true },
      select: { empleado: { select: { id: true, nombreCompleto: true } }, nivelTecnico: true, rol: true }
    })
    const tecnicosMap: Record<string, { id: string; nombre: string; nivel: number | null }> = {}
    personalDraxton.forEach(p => {
      tecnicosMap[p.empleado.id] = { id: p.empleado.id, nombre: p.empleado.nombreCompleto || '', nivel: p.nivelTecnico }
    })
    const tecnicos = Object.values(tecnicosMap)

    // Solo contratos de horas (tipo Mantenimiento CON horas asignadas)
    const contratos = await prisma.contratoDraxton.findMany({
      where: {
        estado: { in: ['Activo', 'activo', 'renovacion', 'Renovacion'] },
        horasContratadas: { gt: 0 },
      },
      select: { id: true, titulo: true, codigoContrato: true, tipo: true, horasContratadas: true, precioHoraContrato: true },
      orderBy: { titulo: 'asc' }
    })

    // Calcular horas ya imputadas a cada contrato (de todas las ejecuciones, no solo del año)
    const imputacionesPorContrato: Record<string, number> = {}
    const todasImputaciones = await prisma.actualizacionImputacion.findMany({
      select: { contratoId: true, horas: true }
    })
    todasImputaciones.forEach(i => {
      imputacionesPorContrato[i.contratoId] = (imputacionesPorContrato[i.contratoId] || 0) + i.horas
    })

    // Balance por contrato: horas contratadas - horas imputadas de actualizaciones
    const balanceContratos = contratos.map(c => ({
      ...c,
      horasContratadas: Number(c.horasContratadas) || 0,
      horasImputadasActualizaciones: imputacionesPorContrato[c.id] || 0,
      horasDisponibles: (Number(c.horasContratadas) || 0) - (imputacionesPorContrato[c.id] || 0),
    }))

    // Tarifas de conversión (con histórico)
    const tarifasConversion = await prisma.actualizacionTarifaConversion.findMany({
      orderBy: [{ concepto: 'asc' }, { fechaDesde: 'desc' }]
    })

    // KPIs
    const totalHoras = ejecuciones.reduce((s, e) => s + e.horasDedicadas, 0)
    const totalCoste = ejecuciones.reduce((s, e) => s + (e.costeTotal || 0), 0)
    const horasImputadas = ejecuciones.reduce((s, e) => s + e.totalImputado, 0)
    const horasPendientes = totalHoras - horasImputadas

    // Sugerencia de imputación: contrato con más horas disponibles
    const contratoSugerido = balanceContratos.sort((a, b) => b.horasDisponibles - a.horasDisponibles)[0] || null

    return NextResponse.json({
      planificaciones,
      planificacionesHistorico,
      ejecuciones,
      contratos: balanceContratos,
      tecnicos,
      tarifasConversion: tarifasConversion.map(t => ({ ...t, vigente: t.fechaHasta === null })),
      contratoSugerido,
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

// POST: CRUD de planificaciones, ejecuciones, imputaciones y tarifas
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
            nivelTecnico: parseInt(body.nivelTecnico) || 2,
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

        if (body.planificacionId && body.marcarEjecutada) {
          await prisma.actualizacionPlanificada.update({
            where: { id: body.planificacionId },
            data: { estado: 'ejecutada' }
          })
        }

        return NextResponse.json({ success: true, ejecucion: ejec })
      }

      case 'actualizarEjecucion': {
        const costeHora = body.costeHora !== undefined ? (body.costeHora ? parseFloat(body.costeHora) : null) : undefined
        const horas = body.horasDedicadas ? parseFloat(body.horasDedicadas) : undefined
        const costeTotal = costeHora !== undefined && horas ? horas * (costeHora || 0) : undefined

        // Recalcular pendienteImputar si cambian las horas
        let pendienteImputar = undefined
        if (horas !== undefined) {
          const ejActual = await prisma.actualizacionEjecucion.findUnique({ where: { id: body.ejecucionId } })
          if (ejActual) {
            pendienteImputar = horas - ejActual.totalImputado
          }
        }

        const ejec = await prisma.actualizacionEjecucion.update({
          where: { id: body.ejecucionId },
          data: {
            fecha: body.fecha ? new Date(body.fecha) : undefined,
            tecnicoId: body.tecnicoId !== undefined ? body.tecnicoId : undefined,
            tecnicoNombre: body.tecnicoNombre !== undefined ? body.tecnicoNombre : undefined,
            nivelTecnico: body.nivelTecnico !== undefined ? parseInt(body.nivelTecnico) : undefined,
            horasDedicadas: horas,
            tipo: body.tipo !== undefined ? body.tipo : undefined,
            plantasAfectadas: body.plantasAfectadas !== undefined ? body.plantasAfectadas : undefined,
            descripcion: body.descripcion !== undefined ? body.descripcion : undefined,
            costeHora,
            costeTotal: costeTotal !== undefined ? costeTotal : undefined,
            pendienteImputar,
          }
        })
        return NextResponse.json({ success: true, ejecucion: ejec })
      }

      // === IMPUTACIONES ===
      case 'imputarHoras': {
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

      // === PREVIEW BALANCE (no guarda, solo calcula) ===
      case 'previewImputacion': {
        const ejecucion = await prisma.actualizacionEjecucion.findUnique({
          where: { id: body.ejecucionId },
          include: { imputaciones: true }
        })
        if (!ejecucion) return NextResponse.json({ error: 'Ejecucion no encontrada' }, { status: 404 })

        const contratoId = body.contratoId
        const horasAImputar = parseFloat(body.horas)

        // Obtener contrato
        const contrato = await prisma.contratoDraxton.findUnique({
          where: { id: contratoId },
          select: { id: true, titulo: true, horasContratadas: true }
        })
        if (!contrato) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })

        // Horas ya imputadas a este contrato (de todas las ejecuciones)
        const imputacionesContrato = await prisma.actualizacionImputacion.findMany({
          where: { contratoId },
          select: { horas: true }
        })
        const horasYaImputadas = imputacionesContrato.reduce((s, i) => s + i.horas, 0)
        const horasContratadasNum = Number(contrato.horasContratadas) || 0

        return NextResponse.json({
          success: true,
          preview: {
            contrato: contrato.titulo,
            horasContratadas: horasContratadasNum,
            horasYaImputadas: Math.round(horasYaImputadas * 10) / 10,
            horasAImputar: horasAImputar,
            balanceActual: Math.round((horasContratadasNum - horasYaImputadas) * 10) / 10,
            balanceDespues: Math.round((horasContratadasNum - horasYaImputadas - horasAImputar) * 10) / 10,
          }
        })
      }

      // === TARIFAS DE CONVERSIÓN ===
      case 'addTarifaConversion': {
        // Cerrar tarifa anterior del mismo concepto
        const anterior = await prisma.actualizacionTarifaConversion.findFirst({
          where: { concepto: body.concepto, fechaHasta: null }
        })
        if (anterior) {
          const fechaDesde = new Date(body.fechaDesde)
          fechaDesde.setDate(fechaDesde.getDate() - 1)
          await prisma.actualizacionTarifaConversion.update({
            where: { id: anterior.id },
            data: { fechaHasta: fechaDesde }
          })
        }
        const tarifa = await prisma.actualizacionTarifaConversion.create({
          data: {
            concepto: body.concepto,
            factorConversion: parseFloat(body.factorConversion) || 1.0,
            costeHora: body.costeHora ? parseFloat(body.costeHora) : null,
            precioFacturacion: body.precioFacturacion ? parseFloat(body.precioFacturacion) : null,
            fechaDesde: new Date(body.fechaDesde),
            notas: body.notas || null,
          }
        })
        return NextResponse.json({ success: true, tarifa })
      }

      case 'deleteTarifaConversion': {
        await prisma.actualizacionTarifaConversion.delete({ where: { id: body.tarifaId } })
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
