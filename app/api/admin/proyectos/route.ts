import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calcularFinanzasProyecto } from '@/lib/proyectos-finanzas'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tipo = req.nextUrl.searchParams.get('tipo') // 'cliente', 'interno' o null (todos)
  const estado = req.nextUrl.searchParams.get('estado') // 'ACTIVO', 'COMPLETADO', etc.

  const where: any = {}
  if (tipo) where.tipo = tipo
  if (estado && estado !== 'todos') where.estado = estado

  const proyectos = await prisma.proyecto.findMany({
    where,
    include: {
      asignaciones: {
        where: { activa: true },
        include: { empleado: { select: { id: true, nombreCompleto: true, departamento: true, costeHoraActual: true } } }
      },
      imputaciones: {
        select: { empleadoId: true, horas: true, costeImputado: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Calcular totales por proyecto
  const proyectosConTotales = proyectos.map(p => {
    const importeVenta = p.importeVenta ? Number(p.importeVenta) : 0
    const costeProveedores = p.costeProveedores ? Number(p.costeProveedores) : 0
    const otrosCostes = p.otrosCostes ? Number(p.otrosCostes) : 0
    const finanzas = calcularFinanzasProyecto({
      importeVenta,
      costeProveedores,
      otrosCostes,
      asignaciones: p.asignaciones.map(a => ({
        empleadoId: a.empleadoId,
        horasEstimadas: a.horasEstimadas,
        costeHora: a.costeHora,
        costeHoraEmpleado: a.empleado.costeHoraActual,
        activa: a.activa,
      })),
      imputaciones: p.imputaciones,
    })

    return {
      id: p.id,
      nombre: p.nombre,
      codigo: p.codigo,
      tipo: p.tipo,
      clienteNombre: p.clienteNombre,
      clienteId: p.clienteId,
      descripcion: p.descripcion,
      responsableId: p.responsableId,
      estado: p.estado,
      prioridad: p.prioridad,
      fechaInicio: p.fechaInicio,
      fechaFin: p.fechaFin,
      importeVenta,
      costeProveedores,
      otrosCostes,
      presupuesto: p.presupuesto,
      documentosJson: p.documentosJson,
      asignaciones: p.asignaciones,
      ...finanzas,
      // Compatibilidad con consumidores anteriores: estos campos siguen representando el dato real contabilizado.
      costeRecursos: finanzas.costeRecursosReal,
      margenBruto: finanzas.margenRealBruto,
      margenPct: finanzas.margenRealPct,
      createdAt: p.createdAt,
    }
  })

  return NextResponse.json({ proyectos: proyectosConTotales })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { accion } = body

  switch (accion) {
    case 'crear': {
      const { nombre, tipo, codigo, clienteNombre, clienteId, descripcion, responsableId, importeVenta, costeProveedores, otrosCostes, prioridad, fechaInicio, fechaFin, presupuesto } = body
      if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
      const proyecto = await prisma.proyecto.create({
        data: {
          nombre,
          tipo: tipo || 'interno',
          codigo: codigo || null,
          clienteNombre: clienteNombre || null,
          clienteId: clienteId && !isNaN(parseInt(clienteId)) ? parseInt(clienteId) : null,
          descripcion: descripcion || null,
          responsableId: responsableId || null,
          importeVenta: importeVenta ? parseFloat(importeVenta) : null,
          costeProveedores: costeProveedores ? parseFloat(costeProveedores) : null,
          otrosCostes: otrosCostes ? parseFloat(otrosCostes) : null,
          presupuesto: presupuesto ? parseFloat(presupuesto) : null,
          prioridad: prioridad || 'media',
          fechaInicio: fechaInicio ? new Date(fechaInicio) : null,
          fechaFin: fechaFin ? new Date(fechaFin) : null,
        }
      })
      return NextResponse.json({ proyecto }, { status: 201 })
    }

    case 'editar': {
      const { id, ...datos } = body
      const updateData: any = {}
      if (datos.nombre !== undefined) updateData.nombre = datos.nombre
      if (datos.tipo !== undefined) updateData.tipo = datos.tipo
      if (datos.codigo !== undefined) updateData.codigo = datos.codigo || null
      if (datos.clienteNombre !== undefined) updateData.clienteNombre = datos.clienteNombre || null
      if (datos.clienteId !== undefined) updateData.clienteId = datos.clienteId && !isNaN(parseInt(datos.clienteId)) ? parseInt(datos.clienteId) : null
      if (datos.descripcion !== undefined) updateData.descripcion = datos.descripcion || null
      if (datos.responsableId !== undefined) updateData.responsableId = datos.responsableId || null
      if (datos.importeVenta !== undefined) updateData.importeVenta = datos.importeVenta ? parseFloat(datos.importeVenta) : null
      if (datos.costeProveedores !== undefined) updateData.costeProveedores = datos.costeProveedores ? parseFloat(datos.costeProveedores) : null
      if (datos.otrosCostes !== undefined) updateData.otrosCostes = datos.otrosCostes ? parseFloat(datos.otrosCostes) : null
      if (datos.presupuesto !== undefined) updateData.presupuesto = datos.presupuesto ? parseFloat(datos.presupuesto) : null
      if (datos.prioridad !== undefined) updateData.prioridad = datos.prioridad
      if (datos.estado !== undefined) updateData.estado = datos.estado
      if (datos.fechaInicio !== undefined) updateData.fechaInicio = datos.fechaInicio ? new Date(datos.fechaInicio) : null
      if (datos.fechaFin !== undefined) updateData.fechaFin = datos.fechaFin ? new Date(datos.fechaFin) : null
      if (datos.documentosJson !== undefined) updateData.documentosJson = datos.documentosJson

      const proyecto = await prisma.proyecto.update({ where: { id }, data: updateData })
      return NextResponse.json({ proyecto })
    }

    case 'eliminar': {
      const { id } = body
      await prisma.asignacionProyecto.deleteMany({ where: { proyectoId: id } })
      await prisma.imputacionHoras.updateMany({ where: { proyectoId: id }, data: { proyectoId: null } })
      await prisma.proyecto.delete({ where: { id } })
      return NextResponse.json({ ok: true })
    }

    case 'asignar_recurso': {
      const { proyectoId, empleadoId, rol, horasEstimadas, costeHora, fechaInicio, fechaFin } = body
      const asignacion = await prisma.asignacionProyecto.create({
        data: {
          proyectoId,
          empleadoId,
          rol: rol || null,
          horasEstimadas: horasEstimadas ? parseFloat(horasEstimadas) : null,
          costeHora: costeHora ? parseFloat(costeHora) : null,
          fechaInicio: fechaInicio ? new Date(fechaInicio) : null,
          fechaFin: fechaFin ? new Date(fechaFin) : null,
        },
        include: { empleado: { select: { id: true, nombreCompleto: true, departamento: true } } }
      })
      return NextResponse.json({ asignacion })
    }

    case 'editar_recurso': {
      const { asignacionId, rol, horasEstimadas, costeHora, fechaInicio, fechaFin, activa } = body
      const updateData: any = {}
      if (rol !== undefined) updateData.rol = rol
      if (horasEstimadas !== undefined) updateData.horasEstimadas = horasEstimadas ? parseFloat(horasEstimadas) : null
      if (costeHora !== undefined) updateData.costeHora = costeHora ? parseFloat(costeHora) : null
      if (fechaInicio !== undefined) updateData.fechaInicio = fechaInicio ? new Date(fechaInicio) : null
      if (fechaFin !== undefined) updateData.fechaFin = fechaFin ? new Date(fechaFin) : null
      if (activa !== undefined) updateData.activa = activa

      const asignacion = await prisma.asignacionProyecto.update({
        where: { id: asignacionId },
        data: updateData,
        include: { empleado: { select: { id: true, nombreCompleto: true, departamento: true } } }
      })
      return NextResponse.json({ asignacion })
    }

    case 'eliminar_recurso': {
      const { asignacionId } = body
      await prisma.asignacionProyecto.delete({ where: { id: asignacionId } })
      return NextResponse.json({ ok: true })
    }

    case 'detalle': {
      const { id } = body
      const proyecto = await prisma.proyecto.findUnique({
        where: { id },
        include: {
          asignaciones: {
            include: { empleado: { select: { id: true, nombreCompleto: true, departamento: true, costeHoraActual: true } } }
          },
          imputaciones: {
            include: { empleado: { select: { id: true, nombreCompleto: true } } },
            orderBy: { fecha: 'desc' },
            take: 100
          }
        }
      })
      if (!proyecto) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

      // Calcular horas imputadas por empleado
      const horasPorEmpleado: Record<string, number> = {}
      const costesPorEmpleado: Record<string, number> = {}
      proyecto.imputaciones.forEach(imp => {
        horasPorEmpleado[imp.empleadoId] = (horasPorEmpleado[imp.empleadoId] || 0) + imp.horas
        costesPorEmpleado[imp.empleadoId] = (costesPorEmpleado[imp.empleadoId] || 0) + Number(imp.costeImputado || 0)
      })

      const importeVenta = proyecto.importeVenta ? Number(proyecto.importeVenta) : 0
      const costeProveedores = proyecto.costeProveedores ? Number(proyecto.costeProveedores) : 0
      const otrosCostes = proyecto.otrosCostes ? Number(proyecto.otrosCostes) : 0
      const finanzas = calcularFinanzasProyecto({
        importeVenta,
        costeProveedores,
        otrosCostes,
        asignaciones: proyecto.asignaciones.map(a => ({
          empleadoId: a.empleadoId,
          horasEstimadas: a.horasEstimadas,
          costeHora: a.costeHora,
          costeHoraEmpleado: a.empleado.costeHoraActual,
          activa: a.activa,
        })),
        imputaciones: proyecto.imputaciones.map(i => ({
          empleadoId: i.empleadoId,
          horas: i.horas,
          costeImputado: i.costeImputado,
        })),
      })

      return NextResponse.json({
        ...proyecto,
        importeVenta,
        costeProveedores,
        otrosCostes,
        horasPorEmpleado,
        costesPorEmpleado,
        ...finanzas,
        totalHorasImputadas: finanzas.horasImputadas,
        totalCosteRecursos: finanzas.costeRecursosReal,
      })
    }

    default:
      return NextResponse.json({ error: 'Accion no reconocida' }, { status: 400 })
  }
}
