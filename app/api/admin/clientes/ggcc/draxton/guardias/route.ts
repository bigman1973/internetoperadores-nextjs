import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { checkAdminAreaRead, checkAdminAreaWrite } from '@/lib/api-admin-area-read'
import { validateAddTecnicoInput } from '@/lib/draxton-guardias-validation'

// ID del contrato de guardias de Draxton
const CONTRATO_GUARDIAS_ID = '8d5e4790-cf71-4047-a286-9b0d6e6e8cef'
const AREA_CONTRATO_GUARDIAS = 'admin.clientes.ggcc.draxton.contrato_guardias'

// GET: Obtener toda la configuración de guardias
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const section = searchParams.get('section') || 'all'
    const session = await getServerSession(authOptions)
    // El selector pertenece a Guardias y no expone el listado global de personal.
    const denied = await checkAdminAreaRead(AREA_CONTRATO_GUARDIAS, [], session)
    if (denied) return denied

    if (section === 'tecnicos-disponibles') {
      const configActual = await prisma.guardiaConfig.findUnique({
        where: { contratoId: CONTRATO_GUARDIAS_ID },
        select: { tecnicos: { select: { empleadoId: true } } },
      })
      const empleadosAsignados = configActual?.tecnicos.map(tecnico => tecnico.empleadoId) || []
      const tecnicos = await prisma.empleado.findMany({
        where: {
          estado: 'ACTIVO',
          ...(empleadosAsignados.length > 0 ? { id: { notIn: empleadosAsignados } } : {}),
        },
        select: { id: true, nombreCompleto: true, categoria: true, estado: true },
        orderBy: { nombreCompleto: 'asc' },
      })
      return NextResponse.json({ tecnicos })
    }

    const anio = parseInt(searchParams.get('anio') || new Date().getFullYear().toString())

    // La lectura no debe inicializar configuración: esa mutación pertenece a POST.
    const config = await prisma.guardiaConfig.findUnique({
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
        tarifasGenerales: { orderBy: [{ concepto: 'asc' }, { fechaDesde: 'desc' }] },
      }
    })

    if (!config) {
      const contrato = await prisma.contratoDraxton.findUnique({
        where: { id: CONTRATO_GUARDIAS_ID },
        select: { titulo: true, fechaInicio: true, fechaInicioServicio: true, fechaFin: true, importeMensual: true, estado: true }
      })
      return NextResponse.json({
        config: null,
        contrato,
        tecnicos: [],
        tarifas: [],
        tarifasGenerales: [],
        asignaciones: [],
        incidencias: [],
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
        costeKmTecnico: (config as any).costeKmTecnico,
        precioFijoDesplazCliente: (config as any).precioFijoDesplazCliente,
        observaciones: config.observaciones,
      },
      contrato,
      tecnicos: config.tecnicos,
      tarifas: config.tarifas.map(t => ({ ...t, vigente: t.fechaHasta === null })),
      tarifasGenerales: (config as any).tarifasGenerales?.map((t: any) => ({ ...t, vigente: t.fechaHasta === null })) || [],
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
    const session = await getServerSession(authOptions)
    const denied = await checkAdminAreaWrite(AREA_CONTRATO_GUARDIAS, [], session)
    if (denied) return denied

    const body = await req.json()
    const { action } = body
    const addTecnicoValidation = action === 'addTecnico' ? validateAddTecnicoInput(body) : null
    if (addTecnicoValidation && 'error' in addTecnicoValidation) {
      return NextResponse.json({ error: addTecnicoValidation.error }, { status: 400 })
    }
    if (addTecnicoValidation?.ok) {
      const empleado = await prisma.empleado.findUnique({
        where: { id: addTecnicoValidation.value.empleadoId },
        select: { estado: true },
      })
      if (!empleado) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
      if (empleado.estado !== 'ACTIVO') return NextResponse.json({ error: 'Solo se pueden añadir empleados activos' }, { status: 409 })
    }

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
            costeHoraTecnico: body.costeHoraTecnico != null ? parseFloat(body.costeHoraTecnico) : undefined,
            costeKmTecnico: body.costeKmTecnico != null ? parseFloat(body.costeKmTecnico) : undefined,
            precioFijoDesplazCliente: body.precioFijoDesplazCliente != null ? parseFloat(body.precioFijoDesplazCliente) : undefined,
            observaciones: body.observaciones,
          }
        })
        return NextResponse.json({ success: true, config: updated })
      }

      case 'addTecnico': {
        if (!addTecnicoValidation?.ok) {
          return NextResponse.json({ error: 'Datos de técnico no válidos' }, { status: 400 })
        }
        const { empleadoId, nivel, fechaAlta } = addTecnicoValidation!.value
        const existente = await prisma.guardiaTecnico.findUnique({
          where: { configId_empleadoId: { configId: config.id, empleadoId } },
          select: { id: true },
        })
        if (existente) {
          return NextResponse.json({ error: 'El empleado ya está asignado al contrato de guardias' }, { status: 409 })
        }

        try {
          const tecnico = await prisma.guardiaTecnico.create({
            data: {
              configId: config.id,
              empleadoId,
              nivel,
              fechaAlta: new Date(`${fechaAlta}T00:00:00.000Z`),
            },
            include: { empleado: { select: { id: true, nombreCompleto: true, categoria: true, estado: true } } }
          })
          // Añadir un técnico no crea ni modifica asignaciones semanales.
          return NextResponse.json({ success: true, tecnico })
        } catch (error: any) {
          if (error?.code === 'P2002') {
            return NextResponse.json({ error: 'El empleado ya está asignado al contrato de guardias' }, { status: 409 })
          }
          throw error
        }
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
            estado: body.estado || 'abierta',
            categoria: body.categoria || null,
            planta: body.planta || null,
            horaInicio: body.horaInicio || null,
            horaFin: body.horaFin || null,
            tipoResolucion: body.tipoResolucion || null,
            detalleResolucion: body.detalleResolucion || null,
            escaladoInterno: body.escaladoInterno || false,
            escaladoCliente: body.escaladoCliente || false,
            detalleEscalado: body.detalleEscalado || null,
            horasDesplazamiento: body.horasDesplazamiento != null ? parseFloat(body.horasDesplazamiento) : null,
            kmRecorridos: body.kmRecorridos != null ? parseFloat(body.kmRecorridos) : null,
            costeDesplazamiento: body.costeDesplazamiento != null ? parseFloat(body.costeDesplazamiento) : null,
            importeClienteDesp: body.importeClienteDesp != null ? parseFloat(body.importeClienteDesp) : null,
            fechaResolucion: body.estado === 'resuelta' ? new Date() : null,
          }
        })
        return NextResponse.json({ success: true, incidencia })
      }

      case 'importarEML': {
        // Importar incidencias desde archivos EML
        const { parseGuardiaEML } = await import('@/lib/guardias/eml-parser')
        const emlFiles: { filename: string; content: string }[] = body.files || []
        let importados = 0
        let duplicados = 0
        let errores = 0
        const resultados: any[] = []

        for (const file of emlFiles) {
          try {
            const parsed = parseGuardiaEML(file.content, file.filename)
            
            // Verificar duplicado por emailId
            const existente = await prisma.guardiaIncidencia.findUnique({
              where: { emailId: parsed.emailId }
            })
            if (existente) {
              duplicados++
              resultados.push({ file: file.filename, status: 'duplicado' })
              continue
            }

            // Buscar asignación de la semana correspondiente
            const lunes = getMonday(parsed.fecha)
            const asignacion = await prisma.guardiaAsignacion.findFirst({
              where: {
                configId: config.id,
                semanaInicio: lunes
              }
            })

            // Crear incidencia
            await prisma.guardiaIncidencia.create({
              data: {
                configId: config.id,
                asignacionId: asignacion?.id || null,
                fechaHora: parsed.fecha,
                resumen: parsed.resumen || parsed.emailSubject,
                descripcion: parsed.descripcion,
                avisadoPor: 'Servicio de Guardia',
                estado: 'resuelta',
                tipoResolucion: parsed.tipoResolucion,
                escaladoInterno: parsed.escaladoInterno,
                emailId: parsed.emailId,
                emailSubject: parsed.emailSubject,
                emailFrom: parsed.emailFrom,
                emailDate: parsed.emailDate,
                archivoEml: parsed.archivoEml,
                categoria: parsed.categoria,
                horaInicio: parsed.horaInicio,
                horaFin: parsed.horaFin,
                duracionMinutos: parsed.duracionMinutos,
                planta: parsed.planta,
                zonaAfectada: parsed.planta,
                departamento: parsed.categoria === 'csoc' ? 'CSOC' : null,
              }
            })
            importados++
            resultados.push({ file: file.filename, status: 'importado', fecha: parsed.fecha, tecnico: parsed.tecnicoNombre })
          } catch (err: any) {
            errores++
            resultados.push({ file: file.filename, status: 'error', error: err.message })
          }
        }

        return NextResponse.json({ success: true, importados, duplicados, errores, total: emlFiles.length, resultados })
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
            kmRecorridos: body.kmRecorridos != null ? parseFloat(body.kmRecorridos) : undefined,
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

      case 'addTarifaGeneral': {
        // Cerrar tarifa general anterior del mismo concepto
        const tarifaGenAnterior = await prisma.guardiaTarifaGeneral.findFirst({
          where: { configId: config.id, concepto: body.concepto, fechaHasta: null }
        })
        if (tarifaGenAnterior) {
          const fechaDesde = new Date(body.fechaDesde)
          fechaDesde.setDate(fechaDesde.getDate() - 1)
          await prisma.guardiaTarifaGeneral.update({
            where: { id: tarifaGenAnterior.id },
            data: { fechaHasta: fechaDesde }
          })
        }
        const tarifaGen = await prisma.guardiaTarifaGeneral.create({
          data: {
            configId: config.id,
            concepto: body.concepto,
            valor: parseFloat(body.valor),
            fechaDesde: new Date(body.fechaDesde),
            notas: body.notas || null,
          }
        })
        // Actualizar también el campo directo en config para que el cálculo en tiempo real funcione
        const fieldMap: Record<string, string> = {
          'coste_km_tecnico': 'costeKmTecnico',
          'coste_hora_tecnico': 'costeHoraTecnico',
          'precio_hora_cliente': 'precioHoraCliente',
          'precio_fijo_desplaz_cliente': 'precioFijoDesplazCliente',
        }
        const fieldName = fieldMap[body.concepto]
        if (fieldName) {
          await prisma.guardiaConfig.update({
            where: { id: config.id },
            data: { [fieldName]: parseFloat(body.valor) }
          })
        }
        return NextResponse.json({ success: true, tarifa: tarifaGen })
      }

      case 'deleteTarifaGeneral': {
        await prisma.guardiaTarifaGeneral.delete({ where: { id: body.tarifaId } })
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: `Acción no reconocida: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Error POST guardias:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helper: obtener el lunes de la semana de una fecha
function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// DELETE: Eliminar asignación o incidencia
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const denied = await checkAdminAreaWrite(AREA_CONTRATO_GUARDIAS, [], session)
    if (denied) return denied

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
      case 'tarifaGeneral':
        await prisma.guardiaTarifaGeneral.delete({ where: { id } })
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
