import { z } from 'zod'
import prisma from '@/lib/prisma'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { jsonPrivado, uuidValido } from '@/lib/asistente/http'
import { ESTADOS_ASISTENTE, PUNTUACIONES_ASISTENTE, ORIGEN_ASISTENTE } from '@/lib/asistente/leads-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const consulta = z.object({
  estado: z.enum(ESTADOS_ASISTENTE).optional(),
  puntuacion: z.enum(PUNTUACIONES_ASISTENTE).optional(),
  tipo: z.enum(['EMPRESA', 'HOGAR']).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

const seleccion = {
  id: true, conversacionId: true, tipo: true, codigoPostal: true, urgencia: true,
  resumen: true, necesidades: true, servicioRecomendado: true, puntuacion: true,
  estado: true, consentimiento: true, createdAt: true, updatedAt: true,
} as const

export async function GET(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.leads', 'lectura')
  if ('response' in acceso) return acceso.response
  const parametros = consulta.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parametros.success) return jsonPrivado({ error: 'Filtros no válidos' }, 400)
  const { estado, puntuacion, tipo, cursor, limit } = parametros.data
  if (cursor && !uuidValido(cursor)) return jsonPrivado({ error: 'Cursor no válido' }, 400)

  const where = { ...(estado ? { estado } : {}), ...(puntuacion ? { puntuacion } : {}), ...(tipo ? { tipo } : {}) }
  const [filas, nuevos] = await Promise.all([
    prisma.asistenteLead.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: seleccion,
    }),
    prisma.asistenteLead.count({ where: { estado: 'NUEVO' } }),
  ])
  const ultima = filas.at(-1)
  const siguiente = ultima && filas.length === limit
    ? await prisma.asistenteLead.findFirst({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], cursor: { id: ultima.id }, skip: 1, select: { id: true } })
    : null
  return jsonPrivado({
    items: filas.map(lead => ({ ...lead, origen: ORIGEN_ASISTENTE })),
    nuevos,
    siguienteCursor: siguiente ? ultima?.id ?? null : null,
  })
}
