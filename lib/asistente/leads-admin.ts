import prisma from '@/lib/prisma'

export const ORIGEN_ASISTENTE = 'ASISTENTE' as const
export const ESTADOS_ASISTENTE = ['NUEVO', 'CONTACTADO', 'CERRADO', 'DESCARTADO'] as const
export const PUNTUACIONES_ASISTENTE = ['CALIENTE', 'TEMPLADO', 'FRIO'] as const
export type EstadoAsistente = typeof ESTADOS_ASISTENTE[number]
export type PuntuacionAsistente = typeof PUNTUACIONES_ASISTENTE[number]

type FiltrosAsistente = { estado?: EstadoAsistente; puntuacion?: PuntuacionAsistente; limit?: number }

const seleccionProyeccion = {
  id: true,
  conversacionId: true,
  tipo: true,
  codigoPostal: true,
  urgencia: true,
  resumen: true,
  necesidades: true,
  servicioRecomendado: true,
  puntuacion: true,
  estado: true,
  consentimiento: true,
  createdAt: true,
  updatedAt: true,
} as const

export type ProyeccionLeadAsistente = {
  id: string
  conversacionId: string
  origen: typeof ORIGEN_ASISTENTE
  tipo: string
  codigoPostal: string
  urgencia: string
  resumen: string | null
  necesidades: string | null
  servicioRecomendado: string | null
  puntuacion: string
  estado: string
  consentimiento: boolean
  createdAt: Date
  updatedAt: Date
}

function proyectar(lead: Omit<ProyeccionLeadAsistente, 'origen'>): ProyeccionLeadAsistente {
  return { ...lead, origen: ORIGEN_ASISTENTE }
}

/** Proyección sin PII para /admin/leads y rutas privadas del asistente. */
export async function listarProyeccionesLeadAsistente(filtros: FiltrosAsistente = {}): Promise<ProyeccionLeadAsistente[]> {
  const limit = Math.max(1, Math.min(100, filtros.limit ?? 50))
  const filas = await prisma.asistenteLead.findMany({
    where: { ...(filtros.estado ? { estado: filtros.estado } : {}), ...(filtros.puntuacion ? { puntuacion: filtros.puntuacion } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: seleccionProyeccion,
  })
  return filas.map(proyectar)
}

export async function obtenerProyeccionLeadAsistente(id: string): Promise<ProyeccionLeadAsistente | null> {
  const lead = await prisma.asistenteLead.findUnique({ where: { id }, select: seleccionProyeccion })
  return lead ? proyectar(lead) : null
}

export async function estadisticasProyeccionLeadAsistente(): Promise<Array<{ estado: string; _count: { id: number } }>> {
  const recuentos = await Promise.all(ESTADOS_ASISTENTE.map(async estado => ({
    estado,
    _count: { id: await prisma.asistenteLead.count({ where: { estado } }) },
  })))
  return recuentos
}
