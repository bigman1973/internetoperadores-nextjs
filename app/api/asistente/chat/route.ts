import { getAssistantRuntime } from '@/lib/asistente/config'
import { esMismoOrigen, ipSolicitud, jsonPrivado, leerJsonLimitado, uuidValido } from '@/lib/asistente/http'
import { consumirRateLimit, hmacAsistente } from '@/lib/asistente/rate-limit'
import { responderMensaje } from '@/lib/asistente/responder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const configuracion = await getAssistantRuntime()
  if (!configuracion.publicEnabled) return jsonPrivado({ codigo: 'ASSISTANT_DISABLED' }, 503)
  if (!esMismoOrigen(req)) return jsonPrivado({ codigo: 'ORIGEN_INVALIDO' }, 403)
  const cuerpo = await leerJsonLimitado(req)
  if (!cuerpo.ok || !cuerpo.datos || typeof cuerpo.datos !== 'object' || Array.isArray(cuerpo.datos)) return jsonPrivado({ codigo: 'MENSAJE_INVALIDO' }, 400)
  const datos = cuerpo.datos as Record<string, unknown>
  if (typeof datos.hp === 'string' && datos.hp.trim() || (typeof datos.t === 'number' && Number.isFinite(datos.t) && datos.t < 1500)) return jsonPrivado({ conversacionId: null, mensajeId: null, respuesta: 'Gracias por tu consulta. Si necesitas ayuda, puedes contactar con nuestro equipo.', fuentes: [], sinFuente: true, escalar: false, ctas: [{ tipo: 'CONTACTO', texto: 'Contacto', url: '/contacto' }], modo: configuracion.modo })
  if (typeof datos.mensaje !== 'string' || !datos.mensaje.trim()) return jsonPrivado({ codigo: 'MENSAJE_INVALIDO' }, 400)
  if (datos.mensaje.length > configuracion.maxChars) return jsonPrivado({ codigo: 'MENSAJE_LARGO' }, 400)
  if (datos.conversacionId !== undefined && !uuidValido(datos.conversacionId)) return jsonPrivado({ codigo: 'MENSAJE_INVALIDO' }, 400)
  const limite = await consumirRateLimit(ipSolicitud(req))
  if (!limite.permitido) return jsonPrivado({ codigo: 'RATE_LIMIT' }, 429)
  try {
    return jsonPrivado(await responderMensaje({ mensaje: datos.mensaje, conversacionId: datos.conversacionId as string | undefined, contexto: 'PUBLICO', visitanteHash: hmacAsistente(ipSolicitud(req)) }))
  } catch (error) {
    const codigo = error instanceof Error ? error.message : ''
    if (codigo === 'ASSISTANT_DISABLED') return jsonPrivado({ codigo: 'ASSISTANT_DISABLED' }, 503)
    if (codigo === 'MENSAJE_LARGO' || codigo === 'MENSAJE_INVALIDO') return jsonPrivado({ codigo }, 400)
    return jsonPrivado({ codigo: 'ASISTENTE_NO_DISPONIBLE' }, 503)
  }
}
