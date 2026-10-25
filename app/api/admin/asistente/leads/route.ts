import { z } from 'zod'
import prisma from '@/lib/prisma'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { jsonPrivado, uuidValido } from '@/lib/asistente/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const consulta = z.object({
  estado: z.enum(['NUEVO', 'CONTACTADO', 'CERRADO', 'DESCARTADO']).optional(),
  puntuacion: z.enum(['CALIENTE', 'TEMPLADO', 'FRIO']).optional(),
  tipo: z.enum(['EMPRESA', 'HOGAR']).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

function contactoSeguro<T extends { consentimiento: boolean; nombre: string; empresa: string | null; email: string | null; telefono: string | null }>(lead: T) {
  const { consentimiento, nombre, empresa, email, telefono, ...resto } = lead
  return {
    ...resto,
    consentimiento,
    contacto: consentimiento ? { nombre, empresa, email, telefono } : null,
  }
}

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
      select: {
        id: true, conversacionId: true, tipo: true, codigoPostal: true, urgencia: true,
        resumen: true, necesidades: true, servicioRecomendado: true, puntuacion: true,
        estado: true, consentimiento: true, nombre: true, empresa: true, email: true,
        telefono: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.asistenteLead.count({ where: { estado: 'NUEVO' } }),
  ])
  const ultima = filas.at(-1)
  const siguiente = ultima && filas.length === limit
    ? await prisma.asistenteLead.findFirst({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: { id: ultima.id },
      skip: 1,
      select: { id: true },
    })
    : null
  const hayMas = Boolean(siguiente)
  const items = filas.map(contactoSeguro)
  return jsonPrivado({ items, nuevos, siguienteCursor: hayMas ? items.at(-1)?.id ?? null : null })
}
