import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ROLES_PERMITIDOS = ['SUPER_ADMIN', 'GERENTE', 'RRHH']

// GET /api/admin/calendario?year=2026&month=7&tipo=VACACIONES
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (!ROLES_PERMITIDOS.includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || '2026')
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : null
    const tipo = searchParams.get('tipo') || null

    // Construir filtro
    const where: any = { anio: year }
    if (tipo) {
      where.tipo = tipo
    }
    if (month) {
      // Filtrar por mes: fechaInicio o fechaFin dentro del mes
      const startOfMonth = new Date(year, month - 1, 1)
      const endOfMonth = new Date(year, month, 0)
      where.OR = [
        { fechaInicio: { gte: startOfMonth, lte: endOfMonth } },
        { fechaFin: { gte: startOfMonth, lte: endOfMonth } },
        { AND: [{ fechaInicio: { lte: startOfMonth } }, { fechaFin: { gte: endOfMonth } }] }
      ]
    }

    const eventos = await prisma.calendarioPersonal.findMany({
      where,
      orderBy: { fechaInicio: 'asc' },
      include: {
        empleado: {
          select: { id: true, nombreCompleto: true, departamento: true }
        }
      }
    })

    // Resumen por empleado
    const resumenEmpleados: Record<string, { vacaciones: number; permisos: number; bajas: number }> = {}
    for (const evento of eventos) {
      const nombre = evento.empleadoNombre
      if (!resumenEmpleados[nombre]) {
        resumenEmpleados[nombre] = { vacaciones: 0, permisos: 0, bajas: 0 }
      }
      if (evento.tipo === 'VACACIONES') {
        resumenEmpleados[nombre].vacaciones += evento.totalDias || 1
      } else if (evento.tipo === 'PERMISO') {
        resumenEmpleados[nombre].permisos += 1
      } else if (evento.tipo === 'BAJA') {
        resumenEmpleados[nombre].bajas += evento.totalDias || 1
      }
    }

    // Última sincronización
    const lastSync = await prisma.syncLog.findFirst({
      where: { fuente: 'hrlog' },
      orderBy: { ejecutadoAt: 'desc' }
    })

    return NextResponse.json({
      eventos,
      resumenEmpleados,
      total: eventos.length,
      ultimaSincronizacion: lastSync?.ejecutadoAt || null,
      year,
      month
    })

  } catch (error: any) {
    console.error('Error obteniendo calendario:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
