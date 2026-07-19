import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ID del contrato de guardias de Draxton
const CONTRATO_GUARDIAS_ID = '8d5e4790-cf71-4047-a286-9b0d6e6e8cef'

// GET: Obtener toda la configuración de guardias
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const section = searchParams.get('section') || 'all'
    const anio = parseInt(searchParams.get('anio') || new Date().getFullYear().toString())

    // Obtener o crear config
    let config = await prisma.guardiaConfig.findUnique({
      where: { contratoId: CONTRATO_GUARDIAS_ID },
      include: {
        tecnicos: {
          include: {
            empleado: { select: { id: true, nombreCompleto: true, categoria: true, estado: true } },
            historicoNiveles: { orderBy: { fechaCambio: 'asc' } }
          },
          orderBy: { fechaAlta: 'asc' }
        },
        tarifas: { orderBy: [{ nivel: 'asc' }, { fechaDesde: 'desc' }] },
      }
    })

    if (!config) {
      // Crear config inicial
      config = await prisma.guardiaConfig.create({
        data: { contratoId: CONTRATO_GUARDIAS_ID },
        include: {
          tecnicos: {
            include: {
              empleado: { select: { id: true, nombreCompleto: true, categoria: true, estado: true } },
              historicoNiveles: { orderBy: { fechaCambio: 'asc' } }
            },
            orderBy: { fechaAlta: 'asc' }
          },
          tarifas: { orderBy: [{ nivel: 'asc' }, { fechaDesde: 'desc' }] },
        }
      })
    }

    // Obtener contrato para fechas
    const contrato = await prisma.contratoDraxton.findUnique({
      where: { id: CONTRATO_GUARDIAS_ID },
      select: { titulo: true, fechaInicio: true, fechaInicioServicio: true, fechaFin: true, importeMensual: true, estado: true }
    })

    // Asignaciones del año
    const inicioAnio = new Date(anio, 0, 1)
    const finAnio = new Date(anio, 11, 31)
    const asignaciones = await prisma.guardiaAsignacion.findMany({
      where: {
        configId: config.id,
        semanaInicio: { gte: inicioAnio, lte: finAnio }
      },
      include: {
        tecnico: {
          include: { empleado: { select: { nombreCompleto: true } } }
        }
      },
      orderBy: { semanaInicio: 'asc' }
    })

    // Incidencias (si se piden)
    let incidencias: any[] = []
    if (section === 'all' || section === 'incidencias') {
      const desde = searchParams.get('desde') ? new Date(searchParams.get('desde')!) : inicioAnio
      const hasta = searchParams.get('hasta') ? new Date(searchParams.get('hasta')!) : finAnio
      incidencias = await prisma.guardiaIncidencia.findMany({
        where: {
          configId: config.id,
          fechaHora: { gte: desde, lte: hasta }
        },
        include: {
          asignacion: {
            include: { tecnico: { include: { empleado: { select: { nombreCompleto: true } } } } }
          }
        },
        orderBy: { fechaHora: 'desc' }
      })
    }

    return NextResponse.json({
      config: {
        id: config.id,
        contratoId: config.contratoId,
        margenDesplazamiento: config.margenDesplazamiento,
        precioHoraCliente: config.precioHoraCliente,
        costeHoraTecnico: (config as any).costeHoraTecnico,
        costeDesplazFijo: (config as any).costeDesplazFijo,
        precioDesplazCliente: (config as any).precioDesplazCliente,
        observaciones: config.observaciones,
      },
      contrato,
      tecnicos: config.tecnicos,
      tarifas: config.tarifas.map(t => ({ ...t, vigente: t.fechaHasta === null })),
      asignaciones,
      incidencias,
    })
  } catch (error: any) {
    console.error('Error GET guardias:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Crear/actualizar configuración, técnicos, tarifas, asignaciones o incidencias
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    // Obtener config
    let config = await prisma.guardiaConfig.findUnique({ where: { contratoId: CONTRATO_GUARDIAS_ID } })
    if (!config) {
      config = await prisma.guardiaConfig.create({ data: { contratoId: CONTRATO_GUARDIAS_ID } })
    }

    switch (action) {
      case 'updateConfig': {
        const updated = await prisma.guardiaConfig.update({
          where: { id: config.id },
          data: {
            margenDesplazamiento: body.margenDesplazamiento != null ? parseFloat(body.margenDesplazamiento) : undefined,
            precioHoraCliente: body.precioHoraCliente != null ? parseFloat(body.precioHoraCliente) : undefined,
            observaciones: body.observaciones,
          }
        })
        return NextResponse.json({ success: true, config: updated })
      }

      case 'addTecnico': {
        const tecnico = await prisma.guardiaTecnico.create({
          data: {
            configId: config.id,
            empleadoId: body.empleadoId,
            nivel: body.nivel || 1,
            fechaAlta: new Date(body.fechaAlta || new Date()),
          },
          include: { empleado: { select: { id: true, nombreCompleto: true, categoria: true, estado: true } } }
        })
        return NextResponse.json({ success: true, tecnico })
      }

      case 'updateTecnico': {
        // Obtener técnico actual para registrar histórico
        const tecnicoActual = await prisma.guardiaTecnico.findUnique({ where: { id: body.tecnicoId } })
        if (!tecnicoActual) return NextResponse.json({ error: 'Técnico no encontrado' }, { status: 404 })
        
        // Si cambia el nivel, crear registro histórico
        if (body.nivel && body.nivel !== tecnicoActual.nivel) {
          await prisma.guardiaTecnicoHistorico.create({
            data: {
              tecnicoId: body.tecnicoId,
              nivelAnterior: tecnicoActual.nivel,
              nivelNuevo: body.nivel,
              fechaCambio: new Date(body.fechaCambio || new Date()),
              motivo: body.motivo || null,
            }
          })
        }
        
        const tecnico = await prisma.guardiaTecnico.update({
          where: { id: body.tecnicoId },
          data: {
            nivel: body.nivel || undefined,
            activo: body.activo,
            fechaBaja: body.fechaBaja ? new Date(body.fechaBaja) : undefined,
          }
        })
        return NextResponse.json({ success: true, tecnico })
      }

      case 'removeTecnico': {
        await prisma.guardiaTecnico.update({
          where: { id: body.tecnicoId },
          data: { activo: false, fechaBaja: new Date() }
        })
        return NextResponse.json({ success: true })
      }

      case 'addTarifa': {
        // Cerrar tarifa anterior del mismo nivel
        const tarifaAnterior = await prisma.guardiaTarifa.findFirst({
          where: { configId: config.id, nivel: body.nivel, fechaHasta: null }
        })
        if (tarifaAnterior) {
          const fechaDesde = new Date(body.fechaDesde)
          fechaDesde.setDate(fechaDesde.getDate() - 1)
          await prisma.guardiaTarifa.update({
            where: { id: tarifaAnterior.id },
            data: { fechaHasta: fechaDesde }
          })
        }
        const tarifa = await prisma.guardiaTarifa.create({
          data: {
            configId: config.id,
            nivel: body.nivel,
            importeSemana: parseFloat(body.importeSemana),
            fechaDesde: new Date(body.fechaDesde),
          }
        })
        return NextResponse.json({ success: true, tarifa })
      }

      case 'deleteTarifa': {
        await prisma.guardiaTarifa.delete({ where: { id: body.tarifaId } })
        return NextResponse.json({ success: true })
      }

      case 'asignarSemana': {
        const asignacion = await prisma.guardiaAsignacion.upsert({
          where: { configId_semanaInicio: { configId: config.id, semanaInicio: new Date(body.semanaInicio) } },
          update: {
            tecnicoId: body.tecnicoId,
            importeSemana: body.importeSemana ? parseFloat(body.importeSemana) : undefined,
            notas: body.notas,
          },
          create: {
            configId: config.id,
            tecnicoId: body.tecnicoId,
            semanaInicio: new Date(body.semanaInicio),
            semanaFin: new Date(body.semanaFin),
            importeSemana: body.importeSemana ? parseFloat(body.importeSemana) : undefined,
            notas: body.notas,
          },
          include: { tecnico: { include: { empleado: { select: { nombreCompleto: true } } } } }
        })
        return NextResponse.json({ success: true, asignacion })
      }

      case 'crearIncidencia': {
        const incidencia = await prisma.guardiaIncidencia.create({
          data: {
            configId: config.id,
            asignacionId: body.asignacionId || null,
            fechaHora: new Date(body.fechaHora || new Date()),
            resumen: body.resumen,
            descripcion: body.descripcion || null,
            avisadoPor: body.avisadoPor,
            departamento: body.departamento || null,
            zonaAfectada: body.zonaAfectada || null,
            urgencia: body.urgencia || 'inmediata',
            estado: 'abierta',
          }
        })
        return NextResponse.json({ success: true, incidencia })
      }

      case 'actualizarIncidencia': {
        const incidencia = await prisma.guardiaIncidencia.update({
          where: { id: body.incidenciaId },
          data: {
            estado: body.estado,
            tipoResolucion: body.tipoResolucion,
            fechaResolucion: body.fechaResolucion ? new Date(body.fechaResolucion) : undefined,
            detalleResolucion: body.detalleResolucion,
            horasDesplazamiento: body.horasDesplazamiento != null ? parseFloat(body.horasDesplazamiento) : undefined,
            costeDesplazamiento: body.costeDesplazamiento != null ? parseFloat(body.costeDesplazamiento) : undefined,
            importeClienteDesp: body.importeClienteDesp != null ? parseFloat(body.importeClienteDesp) : undefined,
            escaladoInterno: body.escaladoInterno,
            escaladoCliente: body.escaladoCliente,
            detalleEscalado: body.detalleEscalado,
            resumen: body.resumen,
            descripcion: body.descripcion,
            avisadoPor: body.avisadoPor,
            departamento: body.departamento,
            zonaAfectada: body.zonaAfectada,
            urgencia: body.urgencia,
          }
        })
        return NextResponse.json({ success: true, incidencia })
      }

      case 'updateConfig': {
        let config = await prisma.guardiaConfig.findUnique({ where: { contratoId: CONTRATO_GUARDIAS_ID } })
        if (!config) {
          config = await prisma.guardiaConfig.create({ data: { contratoId: CONTRATO_GUARDIAS_ID } })
        }
        const updated = await prisma.guardiaConfig.update({
          where: { id: config.id },
          data: {
            costeHoraTecnico: body.costeHoraTecnico ?? null,
            costeDesplazFijo: body.costeDesplazFijo ?? null,
            precioHoraCliente: body.precioHoraCliente ?? null,
            precioDesplazCliente: body.precioDesplazCliente ?? null,
            margenDesplazamiento: body.margenDesplazamiento ?? null,
          }
        })
        return NextResponse.json({ success: true, config: updated })
      }

      default:
        return NextResponse.json({ error: `Acción no reconocida: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Error POST guardias:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE: Eliminar asignación o incidencia
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const id = searchParams.get('id')

    if (!type || !id) {
      return NextResponse.json({ error: 'Faltan parámetros type e id' }, { status: 400 })
    }

    switch (type) {
      case 'asignacion':
        await prisma.guardiaAsignacion.delete({ where: { id } })
        break
      case 'incidencia':
        await prisma.guardiaIncidencia.delete({ where: { id } })
        break
      case 'tarifa':
        await prisma.guardiaTarifa.delete({ where: { id } })
        break
      default:
        return NextResponse.json({ error: `Tipo no reconocido: ${type}` }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE guardias:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
