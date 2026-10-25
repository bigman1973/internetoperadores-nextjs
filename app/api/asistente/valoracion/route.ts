import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAssistantRuntime } from '@/lib/asistente/config'
import { esMismoOrigen, ipSolicitud, jsonPrivado, leerJsonLimitado } from '@/lib/asistente/http'
import { consumirRateLimit } from '@/lib/asistente/rate-limit'
import { redactarPII } from '@/lib/asistente/pii'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const esquema = z.object({ mensajeId: z.string().uuid(), util: z.boolean(), comentario: z.string().max(500).optional() })

export async function POST(req: Request) {
  if (!(await getAssistantRuntime()).publicEnabled) return jsonPrivado({ codigo: 'ASSISTANT_DISABLED' }, 503)
  if (!esMismoOrigen(req)) return jsonPrivado({ codigo: 'ORIGEN_INVALIDO' }, 403)
  if (!(await consumirRateLimit(`valoracion:${ipSolicitud(req)}`, new Date(), 30)).permitido) return jsonPrivado({ codigo: 'RATE_LIMIT' }, 429)
  const cuerpo = await leerJsonLimitado(req); if (!cuerpo.ok) return jsonPrivado({ codigo: 'CUERPO_INVALIDO' }, 400)
  const entrada = esquema.safeParse(cuerpo.datos); if (!entrada.success) return jsonPrivado({ codigo: 'CUERPO_INVALIDO' }, 400)
  const mensaje = await prisma.asistenteMensaje.findFirst({ where: { id: entrada.data.mensajeId, rol: 'asistente', conversacion: { canal: 'PUBLICO' } }, select: { id: true } })
  if (!mensaje) return jsonPrivado({ codigo: 'MENSAJE_INVALIDO' }, 400)
  await prisma.asistenteValoracion.upsert({ where: { mensajeId: mensaje.id }, update: { util: entrada.data.util, comentarioAnon: entrada.data.comentario ? await redactarPII(entrada.data.comentario, { incluirCodigoPostal: true }) : null }, create: { mensajeId: mensaje.id, util: entrada.data.util, comentarioAnon: entrada.data.comentario ? await redactarPII(entrada.data.comentario, { incluirCodigoPostal: true }) : null } })
  return jsonPrivado({ ok: true })
}
