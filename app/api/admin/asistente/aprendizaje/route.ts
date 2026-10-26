import { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { crearPropuestaAprendizaje } from '@/lib/asistente/aprendizaje'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { esMismoOrigen, jsonPrivado, leerJsonLimitado, uuidValido } from '@/lib/asistente/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const esquema = z.object({
  origen: z.enum(['HUECO', 'VALORACION']),
  huecoId: z.string().uuid().optional(),
  valoracionId: z.string().uuid().optional(),
}).superRefine((valor, contexto) => {
  if (valor.origen === 'HUECO' && (!valor.huecoId || valor.valoracionId)) contexto.addIssue({ code: z.ZodIssueCode.custom, message: 'Hueco inválido' })
  if (valor.origen === 'VALORACION' && (!valor.valoracionId || valor.huecoId)) contexto.addIssue({ code: z.ZodIssueCode.custom, message: 'Valoración inválida' })
})

function limitePagina(req: Request): { take: number; offset: number; pagina: number } {
  const url = new URL(req.url)
  const pedido = Number(url.searchParams.get('limit') || 20)
  const paginaPedida = Number(url.searchParams.get('pagina') || 1)
  const take = Number.isInteger(pedido) ? Math.max(1, Math.min(50, pedido)) : 20
  const pagina = Number.isInteger(paginaPedida) ? Math.max(1, Math.min(10_000, paginaPedida)) : 1
  return { take, offset: (pagina - 1) * take, pagina }
}

export async function GET(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.aprendizaje', 'lectura')
  if ('response' in acceso) return acceso.response
  const { take, offset, pagina } = limitePagina(req)
  const recientes = new Date(Date.now() - 30 * 86_400_000)
  const [huecos, valoracionesNegativas, propuestas] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; preguntaNorm: string; pregunta: string; veces: number; canales: string[]; updatedAt: Date }>>(Prisma.sql`
      SELECT (array_agg(id ORDER BY updated_at DESC))[1]::text AS id,
             pregunta_norm AS "preguntaNorm", min(pregunta_anon) AS pregunta,
             sum(veces)::int AS veces, array_agg(DISTINCT canal) AS canales, max(updated_at) AS "updatedAt"
        FROM asistente_huecos
       WHERE estado IN ('NUEVO', 'PROPUESTO')
       GROUP BY pregunta_norm
       ORDER BY sum(veces) DESC, max(updated_at) DESC
       LIMIT ${take} OFFSET ${offset}
    `),
    prisma.asistenteValoracion.findMany({
      where: { util: false, createdAt: { gte: recientes } },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, comentarioAnon: true, createdAt: true, mensaje: { select: { textoAnon: true, conversacion: { select: { canal: true } } } } },
    }),
    prisma.asistentePropuestaAprendizaje.findMany({
      where: { estado: 'PROPUESTA' },
      orderBy: { createdAt: 'desc' },
      take,
      skip: offset,
      select: { id: true, origen: true, huecoId: true, valoracionId: true, pregunta: true, respuestaPropuesta: true, fuentes: true, estado: true, createdAt: true },
    }),
  ])
  return jsonPrivado({
    pagina,
    limite: take,
    huecos: huecos.map(hueco => ({ ...hueco, requiereRedactar: false })),
    valoracionesNegativas,
    propuestas: propuestas.map(propuesta => ({ ...propuesta, requiereRedactar: !propuesta.respuestaPropuesta.trim() })),
  })
}

export async function POST(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.aprendizaje', 'escritura')
  if ('response' in acceso) return acceso.response
  if (!esMismoOrigen(req)) return jsonPrivado({ error: 'Origen no válido' }, 403)
  const cuerpo = await leerJsonLimitado(req)
  const entrada = cuerpo.ok ? esquema.safeParse(cuerpo.datos) : { success: false as const }
  if (!entrada.success || (entrada.data.huecoId && !uuidValido(entrada.data.huecoId)) || (entrada.data.valoracionId && !uuidValido(entrada.data.valoracionId))) return jsonPrivado({ error: 'Solicitud inválida' }, 400)
  try {
    const propuesta = await crearPropuestaAprendizaje({ origen: entrada.data.origen!, huecoId: entrada.data.huecoId, valoracionId: entrada.data.valoracionId, actorId: acceso.actor.id })
    return jsonPrivado({ ok: true, propuesta }, 201)
  } catch (error) {
    const mensaje = error instanceof Error && ['ORIGEN_NO_DISPONIBLE'].includes(error.message) ? 'El origen ya no está disponible' : 'No se ha podido crear la propuesta'
    return jsonPrivado({ error: mensaje }, 400)
  }
}
