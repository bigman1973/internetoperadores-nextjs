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
      select: { id: true, titulo: true, codigoContrato: true, tipo: true, horasContratadas: true, precioHoraContrato: true, importeMensual: true, fechaInicio: true, fechaFin: true },
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

    // Tarifas de conversión (con histórico)
    const tarifasConversion = await prisma.actualizacionTarifaConversion.findMany({
      orderBy: [{ concepto: 'asc' }, { fechaDesde: 'desc' }]
    })

    // Factor de conversión vigente (el principal, normalmente n2_remoto)
    const factorVigente = tarifasConversion.find(t => t.fechaHasta === null)?.factorConversion || 1

    // Obtener saldo real de cada contrato desde balance-mensual (misma lógica que seguimiento)
    const contratosConPersonal = await prisma.contratoDraxton.findMany({
      where: { id: { in: contratos.map(c => c.id) } },
      select: {
        id: true,
        horasContratadas: true,
        nivelContratado: true,
        fechaInicio: true,
        fechaFin: true,
        personalAsignado: {
          select: { porcentajeDedicacion: true, nivelTecnico: true, fechaInicio: true, fechaFin: true }
        }
      }
    })

    // Calcular saldo acumulado por contrato (horas equivalentes cubiertas - comprometidas)
    const HORAS_NETAS_MES = 128.67
    function diasLaborablesMes(a: number, m: number): number {
      let count = 0;
      const dias = new Date(a, m, 0).getDate();
      for (let d = 1; d <= dias; d++) { const day = new Date(a, m - 1, d).getDay(); if (day !== 0 && day !== 6) count++; }
      return count;
    }
    function diasLaborablesActivos(a: number, m: number, fi: Date | null, ff: Date | null): number {
      const p1 = new Date(a, m - 1, 1); const p2 = new Date(a, m, 0);
      let inicio = fi && fi > p1 ? fi : p1; let fin = ff && ff < p2 ? ff : p2;
      if (fin < inicio) return 0;
      let count = 0; const cur = new Date(inicio);
      while (cur <= fin) { const day = cur.getDay(); if (day !== 0 && day !== 6) count++; cur.setDate(cur.getDate() + 1); }
      return count;
    }

    const mesActual = new Date().getMonth() + 1
    const saldosPorContrato: Record<string, number> = {}
    for (const cp of contratosConPersonal) {
      const hContratadas = Number(cp.horasContratadas) || 0
      const nivelContratado = cp.nivelContratado || 1
      let saldoAcum = 0
      for (let m = 1; m <= mesActual; m++) {
        const diasLab = diasLaborablesMes(anio, m)
        let horasEquivMes = 0
        for (const p of cp.personalAsignado) {
          const fi = p.fechaInicio ? new Date(p.fechaInicio) : null
          const ff = p.fechaFin ? new Date(p.fechaFin) : null
          const diasAct = diasLaborablesActivos(anio, m, fi, ff)
          const proporcion = diasLab > 0 ? diasAct / diasLab : 0
          const horasBase = HORAS_NETAS_MES * (p.porcentajeDedicacion / 100) * proporcion
          const mult = (p.nivelTecnico || 1) / nivelContratado
          horasEquivMes += horasBase * mult
        }
        saldoAcum += horasEquivMes - hContratadas
      }
      saldosPorContrato[cp.id] = Math.round(saldoAcum * 10) / 10
    }

    // Balance por contrato: saldo real del seguimiento
    const balanceContratos = contratos.map(c => {
      const horasMes = Number(c.horasContratadas) || 0
      const precioHora = Number(c.precioHoraContrato) || (horasMes > 0 && c.importeMensual ? Number(c.importeMensual) / horasMes : 0)
      const saldoContrato = saldosPorContrato[c.id] || 0 // saldo real del seguimiento (positivo = horas de más, negativo = horas pendientes)
      const horasImputadasConFactor = (imputacionesPorContrato[c.id] || 0) * factorVigente
      return {
        ...c,
        horasMes,
        precioHoraContrato: Math.round(precioHora * 100) / 100,
        saldoContrato, // saldo real del seguimiento
        horasImputadasActualizaciones: imputacionesPorContrato[c.id] || 0,
        horasImputadasConFactor: Math.round(horasImputadasConFactor * 10) / 10,
        horasDisponibles: Math.round(saldoContrato - horasImputadasConFactor), // saldo - ya imputadas de actualizaciones
      }
    })

    // KPIs con factor de conversión
    const totalHoras = ejecuciones.reduce((s, e) => s + e.horasDedicadas, 0)
    const totalHorasContrato = totalHoras * factorVigente // horas equivalentes de contrato
    const totalCoste = ejecuciones.reduce((s, e) => s + (e.costeTotal || 0), 0)
    const horasImputadas = ejecuciones.reduce((s, e) => s + e.totalImputado, 0)
    const horasImputadasContrato = horasImputadas * factorVigente
    const horasPendientes = totalHoras - horasImputadas
    const horasPendientesContrato = horasPendientes * factorVigente

    // Sugerencia de imputación: contrato con más horas disponibles
    const contratoSugerido = balanceContratos.sort((a, b) => b.horasDisponibles - a.horasDisponibles)[0] || null

    return NextResponse.json({
      planificaciones,
      planificacionesHistorico,
      ejecuciones,
      contratos: balanceContratos,
      tecnicos,
      factorVigente,
      tarifasConversion: tarifasConversion.map(t => ({ ...t, vigente: t.fechaHasta === null })),
      contratoSugerido,
      kpis: {
        totalHoras: Math.round(totalHoras * 10) / 10,
        totalHorasContrato: Math.round(totalHorasContrato * 10) / 10,
        totalCoste: Math.round(totalCoste * 100) / 100,
        horasImputadas: Math.round(horasImputadas * 10) / 10,
        horasImputadasContrato: Math.round(horasImputadasContrato * 10) / 10,
        horasPendientes: Math.round(horasPendientes * 10) / 10,
        horasPendientesContrato: Math.round(horasPendientesContrato * 10) / 10,
        totalEjecuciones: ejecuciones.length,
        planificacionesPendientes: planificaciones.filter(p => p.estado === 'pendiente').length,
        factorVigente,
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

      case 'updateTarifaConversion': {
        const updated = await prisma.actualizacionTarifaConversion.update({
          where: { id: body.tarifaId },
          data: {
            ...(body.costeHora !== undefined && { costeHora: body.costeHora ? parseFloat(body.costeHora) : null }),
            ...(body.precioFacturacion !== undefined && { precioFacturacion: body.precioFacturacion ? parseFloat(body.precioFacturacion) : null }),
            ...(body.factorConversion !== undefined && { factorConversion: parseFloat(body.factorConversion) || 1.0 }),
            ...(body.notas !== undefined && { notas: body.notas || null }),
          }
        })
        return NextResponse.json({ success: true, tarifa: updated })
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
