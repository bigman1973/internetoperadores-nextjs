import { getAssistantRuntime } from '@/lib/asistente/config'
import { esMismoOrigen, ipSolicitud, jsonPrivado, leerJsonLimitado } from '@/lib/asistente/http'
import { consumirRateLimit, hmacAsistente } from '@/lib/asistente/rate-limit'
import { crearLead, esquemaLead } from '@/lib/asistente/leads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const configuracion = await getAssistantRuntime(); if (!configuracion.publicEnabled) return jsonPrivado({ codigo: 'ASSISTANT_DISABLED' }, 503)
  if (!esMismoOrigen(req)) return jsonPrivado({ codigo: 'ORIGEN_INVALIDO' }, 403)
  if (!(await consumirRateLimit(`lead:${ipSolicitud(req)}`, new Date(), 5)).permitido) return jsonPrivado({ codigo: 'RATE_LIMIT' }, 429)
  const cuerpo = await leerJsonLimitado(req); const entrada = cuerpo.ok ? esquemaLead.safeParse(cuerpo.datos) : { success: false as const }
  if (!entrada.success || entrada.data.consentimientoVersion !== configuracion.consentimientoVersion) return jsonPrivado({ codigo: 'CUERPO_INVALIDO' }, 400)
  try { const { conversacionId } = await crearLead(entrada.data, configuracion.retencionMeses, hmacAsistente(ipSolicitud(req))); return jsonPrivado({ ok: true, conversacionId, mensaje: 'Gracias. Hemos recibido tus datos y el equipo los revisará.' }) } catch { return jsonPrivado({ codigo: 'ASISTENTE_NO_DISPONIBLE' }, 503) }
}
