import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ROLES_PERMITIDOS = ['SUPER_ADMIN', 'GERENTE', 'FINANCIERO', 'RRHH', 'VISOR']

// GET /api/admin/vacaciones?year=2026
// Devuelve saldos de vacaciones por empleado y solicitudes recientes
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

    // Obtener saldos de vacaciones
    const saldos = await prisma.saldoVacaciones.findMany({
      where: { anio: year },
      orderBy: { empleadoNombre: 'asc' },
      include: {
        empleado: {
          select: { id: true, nombreCompleto: true, departamento: true }
        }
      }
    })

    // Obtener solicitudes de vacaciones del año
    const solicitudes = await prisma.calendarioPersonal.findMany({
      where: {
        anio: year,
        tipo: 'VACACIONES'
      },
      orderBy: { fechaInicio: 'desc' },
      include: {
        empleado: {
          select: { id: true, nombreCompleto: true }
        }
      }
    })

    // KPIs globales
    const totalDiasEmpresa = saldos.reduce((sum, s) => sum + s.diasTotal, 0)
    const totalDisfrutados = saldos.reduce((sum, s) => sum + s.diasDisfrutadas, 0)
    const totalAprobados = saldos.reduce((sum, s) => sum + s.diasAprobadas, 0)
    const totalEnTramite = saldos.reduce((sum, s) => sum + s.diasEnTramite, 0)
    const totalDisponibles = saldos.reduce((sum, s) => sum + s.saldoActual, 0)

    // Última sincronización
    const lastSync = await prisma.syncLog.findFirst({
      where: { fuente: 'hrlog' },
      orderBy: { ejecutadoAt: 'desc' }
    })

    return NextResponse.json({
      saldos,
      solicitudes,
      kpis: {
        empleados: saldos.length,
        totalDiasEmpresa,
        totalDisfrutados,
        totalAprobados,
        totalEnTramite,
        totalDisponibles,
        porcentajeConsumido: totalDiasEmpresa > 0 
          ? Math.round((totalDisfrutados / totalDiasEmpresa) * 100) 
          : 0
      },
      ultimaSincronizacion: lastSync?.ejecutadoAt || null,
      year
    })

  } catch (error: any) {
    console.error('Error obteniendo vacaciones:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
