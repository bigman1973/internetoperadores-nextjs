import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { estadisticasProyeccionLeadAsistente, listarProyeccionesLeadAsistente, ESTADOS_ASISTENTE, PUNTUACIONES_ASISTENTE, type EstadoAsistente, type PuntuacionAsistente } from '@/lib/asistente/leads-admin'

export const dynamic = 'force-dynamic'

function esUnoDe<T extends readonly string[]>(valor: string | null, valores: T): valor is T[number] {
  return valor !== null && (valores as readonly string[]).includes(valor)
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const origen = searchParams.get('origen')

  // Mantiene el contrato de los leads web. La proyección del asistente se pide
  // de forma explícita desde el mismo módulo /admin/leads.
  if (origen === 'ASISTENTE') {
    const acceso = await exigirAdminAsistente('admin.asistente.leads', 'lectura')
    if ('response' in acceso) return acceso.response
    const estadoRaw = searchParams.get('estado')
    const puntuacionRaw = searchParams.get('puntuacion')
    if ((estadoRaw && !esUnoDe(estadoRaw, ESTADOS_ASISTENTE)) || (puntuacionRaw && !esUnoDe(puntuacionRaw, PUNTUACIONES_ASISTENTE))) {
      return NextResponse.json({ error: 'Filtros no válidos' }, { status: 400 })
    }
    const estado = estadoRaw as EstadoAsistente | null
    const puntuacion = puntuacionRaw as PuntuacionAsistente | null
    const [leads, stats] = await Promise.all([
      listarProyeccionesLeadAsistente({ estado: estado || undefined, puntuacion: puntuacion || undefined }),
      estadisticasProyeccionLeadAsistente(),
    ])
    return NextResponse.json({ leads, stats, origen: 'ASISTENTE' })
  }

  const estado = searchParams.get('estado')
  const prioridad = searchParams.get('prioridad')
  const sector = searchParams.get('sector')
  const buscar = searchParams.get('buscar')

  try {
    const where: Record<string, unknown> = {}
    if (estado) where.estado = estado
    if (prioridad) where.prioridad = prioridad
    if (sector) where.sector = sector
    if (buscar) {
      where.OR = [
        { nombreEmpresa: { contains: buscar, mode: 'insensitive' } },
        { contacto: { contains: buscar, mode: 'insensitive' } },
        { email: { contains: buscar, mode: 'insensitive' } },
      ]
    }

    const [leads, stats] = await Promise.all([
      prisma.leadMigracionWeb.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { cuestionario: { select: { id: true, token: true, estado: true } } },
      }),
      prisma.leadMigracionWeb.groupBy({ by: ['estado'], _count: { id: true } }),
    ])
    return NextResponse.json({ leads, stats })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
