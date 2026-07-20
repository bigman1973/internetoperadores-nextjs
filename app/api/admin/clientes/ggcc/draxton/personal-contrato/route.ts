import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET: Obtener personal asignado a un contrato (o todos los contratos)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const contratoId = searchParams.get('contratoId')

  const where: any = {}
  if (contratoId) {
    where.contratoDraxtonId = contratoId
  }

  const asignaciones = await prisma.personalContratoDraxton.findMany({
    where,
    include: {
      empleado: {
        select: {
          id: true,
          nombreCompleto: true,
          categoria: true,
          departamento: true,
          estado: true,
          costeHoraActual: true,
          nominas: {
            where: { anio: new Date().getFullYear() },
            orderBy: { mes: 'desc' },
            take: 6, // Últimos 6 meses para calcular promedio
            select: {
              mes: true,
              anio: true,
              costeTotalEmpresa: true,
              devengadoTotal: true,
              gastosDesplazamiento: true,
            },
          },
        },
      },
      tareas: {
        orderBy: { orden: 'asc' },
      },
      contratoDraxton: {
        select: {
          id: true,
          titulo: true,
          tipo: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Calcular coste empresa mensual y coste/hora (sin desplazamientos)
  const resultado = asignaciones.map(a => {
    const nominas = a.empleado.nominas || []
    let costeMensualSinDesplaz = 0
    let costeHora = 0

    if (nominas.length > 0) {
      // Promedio de coste total empresa - gastos desplazamiento
      const totalSinDesplaz = nominas.reduce((sum, n) => {
        const costeEmpresa = n.costeTotalEmpresa || 0
        const desplazamiento = n.gastosDesplazamiento || 0
        return sum + (costeEmpresa - desplazamiento)
      }, 0)
      costeMensualSinDesplaz = totalSinDesplaz / nominas.length
      // Horas estándar: 1720h/año = 143.33h/mes
      costeHora = costeMensualSinDesplaz / 143.33
    } else if (a.empleado.costeHoraActual) {
      costeHora = a.empleado.costeHoraActual
      costeMensualSinDesplaz = costeHora * 143.33
    }

    return {
      id: a.id,
      contratoDraxtonId: a.contratoDraxtonId,
      contrato: a.contratoDraxton,
      empleadoId: a.empleadoId,
      empleado: {
        id: a.empleado.id,
        nombreCompleto: a.empleado.nombreCompleto,
        categoria: a.empleado.categoria,
        departamento: a.empleado.departamento,
        estado: a.empleado.estado,
      },
      porcentajeDedicacion: a.porcentajeDedicacion,
      rol: a.rol,
      funciones: a.funciones,
      fechaInicio: a.fechaInicio,
      fechaFin: a.fechaFin,
      activo: a.activo,
      notas: a.notas,
      tareas: a.tareas,
      // Costes calculados
      costeMensualTotal: costeMensualSinDesplaz,
      costeMensualImputado: costeMensualSinDesplaz * (a.porcentajeDedicacion / 100),
      costeHora: costeHora,
      mesesConDatos: nominas.length,
    }
  })

  return NextResponse.json({ asignaciones: resultado })
}

// POST: Asignar personal a un contrato
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json()
  const { action } = body

  // Acción: asignar empleado
  if (action === 'asignar') {
    const { contratoId, empleadoId, porcentajeDedicacion, rol, funciones, fechaInicio, fechaFin } = body

    if (!contratoId || !empleadoId) {
      return NextResponse.json({ error: 'contratoId y empleadoId requeridos' }, { status: 400 })
    }

    const asignacion = await prisma.personalContratoDraxton.upsert({
      where: {
        contratoDraxtonId_empleadoId: {
          contratoDraxtonId: contratoId,
          empleadoId: empleadoId,
        },
      },
      create: {
        contratoDraxtonId: contratoId,
        empleadoId: empleadoId,
        porcentajeDedicacion: porcentajeDedicacion || 100,
        rol: rol || null,
        funciones: funciones || null,
        fechaInicio: fechaInicio ? new Date(fechaInicio) : new Date(),
        fechaFin: fechaFin ? new Date(fechaFin) : null,
      },
      update: {
        porcentajeDedicacion: porcentajeDedicacion || 100,
        rol: rol || undefined,
        funciones: funciones || undefined,
        activo: true,
      },
    })

    return NextResponse.json({ ok: true, asignacion })
  }

  // Acción: actualizar asignación (dedicación, rol, funciones, etc.)
  if (action === 'actualizar') {
    const { asignacionId, porcentajeDedicacion, rol, funciones, activo, notas } = body

    if (!asignacionId) {
      return NextResponse.json({ error: 'asignacionId requerido' }, { status: 400 })
    }

    const updateData: any = {}
    if (porcentajeDedicacion !== undefined) updateData.porcentajeDedicacion = porcentajeDedicacion
    if (rol !== undefined) updateData.rol = rol
    if (funciones !== undefined) updateData.funciones = funciones
    if (activo !== undefined) updateData.activo = activo
    if (notas !== undefined) updateData.notas = notas

    const updated = await prisma.personalContratoDraxton.update({
      where: { id: asignacionId },
      data: updateData,
    })

    return NextResponse.json({ ok: true, updated })
  }

  // Acción: añadir tarea al checklist
  if (action === 'addTarea') {
    const { asignacionId, descripcion } = body

    if (!asignacionId || !descripcion) {
      return NextResponse.json({ error: 'asignacionId y descripcion requeridos' }, { status: 400 })
    }

    // Obtener el orden máximo actual
    const maxOrden = await prisma.personalContratoTarea.findFirst({
      where: { personalContratoId: asignacionId },
      orderBy: { orden: 'desc' },
      select: { orden: true },
    })

    const tarea = await prisma.personalContratoTarea.create({
      data: {
        personalContratoId: asignacionId,
        descripcion,
        orden: (maxOrden?.orden || 0) + 1,
      },
    })

    return NextResponse.json({ ok: true, tarea })
  }

  // Acción: toggle tarea completada
  if (action === 'toggleTarea') {
    const { tareaId } = body

    if (!tareaId) {
      return NextResponse.json({ error: 'tareaId requerido' }, { status: 400 })
    }

    const tarea = await prisma.personalContratoTarea.findUnique({ where: { id: tareaId } })
    if (!tarea) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

    const updated = await prisma.personalContratoTarea.update({
      where: { id: tareaId },
      data: { completada: !tarea.completada },
    })

    return NextResponse.json({ ok: true, tarea: updated })
  }

  // Acción: eliminar tarea
  if (action === 'deleteTarea') {
    const { tareaId } = body

    if (!tareaId) {
      return NextResponse.json({ error: 'tareaId requerido' }, { status: 400 })
    }

    await prisma.personalContratoTarea.delete({ where: { id: tareaId } })
    return NextResponse.json({ ok: true })
  }

  // Acción: desasignar (dar de baja)
  if (action === 'desasignar') {
    const { asignacionId } = body

    if (!asignacionId) {
      return NextResponse.json({ error: 'asignacionId requerido' }, { status: 400 })
    }

    await prisma.personalContratoDraxton.update({
      where: { id: asignacionId },
      data: { activo: false, fechaFin: new Date() },
    })

    return NextResponse.json({ ok: true })
  }

  // Acción: eliminar asignación
  if (action === 'eliminar') {
    const { asignacionId } = body

    if (!asignacionId) {
      return NextResponse.json({ error: 'asignacionId requerido' }, { status: 400 })
    }

    await prisma.personalContratoDraxton.delete({ where: { id: asignacionId } })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}
