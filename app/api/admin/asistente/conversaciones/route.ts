import { z } from 'zod'
import prisma from '@/lib/prisma'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { jsonPrivado, uuidValido } from '@/lib/asistente/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const consulta = z.object({
  canal: z.enum(['PUBLICO', 'INTERNO', 'CLIENTE']).optional(),
  estado: z.enum(['ABIERTA', 'ESCALADA', 'CERRADA']).optional(),
  sinFuente: z.enum(['si', 'no']).optional(),
  escalada: z.enum(['si', 'no']).optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

function rangoDia(fecha: string): { inicio: Date; fin: Date } | null {
  const inicio = new Date(`${fecha}T00:00:00.000Z`)
  if (Number.isNaN(inicio.getTime()) || inicio.toISOString().slice(0, 10) !== fecha) return null
  const fin = new Date(inicio)
  fin.setUTCDate(fin.getUTCDate() + 1)
  return { inicio, fin }
}

export async function GET(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.conversaciones', 'lectura')
  if ('response' in acceso) return acceso.response

  const parametros = consulta.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parametros.success) return jsonPrivado({ error: 'Filtros no válidos' }, 400)
  const { canal, estado, sinFuente, escalada, fecha, cursor, limit } = parametros.data
  if (cursor && !uuidValido(cursor)) return jsonPrivado({ error: 'Cursor no válido' }, 400)

  const where: any = {}
  if (canal) where.canal = canal
  if (estado) where.estado = estado
  if (sinFuente === 'si') where.mensajesLista = { some: { sinFuente: true } }
  if (sinFuente === 'no') where.mensajesLista = { none: { sinFuente: true } }
  if (escalada === 'si') where.OR = [{ estado: 'ESCALADA' }, { escalados: { some: {} } }]
  if (escalada === 'no') where.AND = [{ estado: { not: 'ESCALADA' } }, { escalados: { none: {} } }]
  if (fecha) {
    const rango = rangoDia(fecha)
    if (!rango) return jsonPrivado({ error: 'Fecha no válida' }, 400)
    where.createdAt = { gte: rango.inicio, lt: rango.fin }
  }

  const filas = await prisma.asistenteConversacion.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      canal: true,
      estado: true,
      escaladoMotivo: true,
      mensajes: true,
      createdAt: true,
      updatedAt: true,
      mensajesLista: { where: { sinFuente: true }, select: { id: true }, take: 1 },
      escalados: { select: { id: true }, take: 1 },
    },
  })
  const ultima = filas.at(-1)
  const siguiente = ultima && filas.length === limit
    ? await prisma.asistenteConversacion.findFirst({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      cursor: { id: ultima.id },
      skip: 1,
      select: { id: true },
    })
    : null
  const hayMas = Boolean(siguiente)
  const items = filas.map(({ mensajesLista, escalados, ...fila }) => ({
    ...fila,
    sinFuente: mensajesLista.length > 0,
    escalada: fila.estado === 'ESCALADA' || escalados.length > 0,
  }))
  return jsonPrivado({ items, siguienteCursor: hayMas ? items.at(-1)?.id ?? null : null })
}
