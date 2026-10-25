import { z } from 'zod'
import prisma from '@/lib/prisma'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { jsonPrivado, uuidValido } from '@/lib/asistente/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const consulta = z.object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) })

export async function GET(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.configuracion', 'lectura')
  if ('response' in acceso) return acceso.response
  const parametros = consulta.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parametros.success) return jsonPrivado({ error: 'Filtros no válidos' }, 400)
  const { cursor, limit } = parametros.data
  if (cursor && !uuidValido(cursor)) return jsonPrivado({ error: 'Cursor no válido' }, 400)
  const filas = await prisma.asistenteConfigCambio.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, campo: true, antes: true, despues: true, actorId: true, motivo: true, createdAt: true },
  })
  const ultima = filas.at(-1)
  const siguiente = ultima && filas.length === limit
    ? await prisma.asistenteConfigCambio.findFirst({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: { id: ultima.id },
      skip: 1,
      select: { id: true },
    })
    : null
  const hayMas = Boolean(siguiente)
  const items = filas
  return jsonPrivado({ items, siguienteCursor: hayMas ? items.at(-1)?.id ?? null : null })
}
