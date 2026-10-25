import { z } from 'zod'
import prisma from '@/lib/prisma'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { jsonPrivado, uuidValido } from '@/lib/asistente/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const consulta = z.object({
  estado: z.enum(['PENDIENTE', 'ATENDIDO', 'DESCARTADO']).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export async function GET(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.leads', 'lectura')
  if ('response' in acceso) return acceso.response
  const parametros = consulta.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parametros.success) return jsonPrivado({ error: 'Filtros no válidos' }, 400)
  const { estado, cursor, limit } = parametros.data
  if (cursor && !uuidValido(cursor)) return jsonPrivado({ error: 'Cursor no válido' }, 400)

  const filas = await prisma.asistenteEscalado.findMany({
    where: estado ? { estado } : undefined,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true, conversacionId: true, motivo: true, dentroHorario: true, preferencia: true, franja: true,
      consentimiento: true, estado: true, createdAt: true, contactoNombre: true, contactoTelefono: true, contactoEmail: true,
    },
  })
  const ultima = filas.at(-1)
  const siguiente = ultima && filas.length === limit
    ? await prisma.asistenteEscalado.findFirst({
      where: estado ? { estado } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: { id: ultima.id },
      skip: 1,
      select: { id: true },
    })
    : null
  const hayMas = Boolean(siguiente)
  const items = filas.map(({ consentimiento, contactoNombre, contactoTelefono, contactoEmail, ...fila }) => ({
    ...fila,
    consentimiento,
    contacto: consentimiento ? { nombre: contactoNombre, telefono: contactoTelefono, email: contactoEmail } : null,
  }))
  return jsonPrivado({ items, siguienteCursor: hayMas ? items.at(-1)?.id ?? null : null })
}
