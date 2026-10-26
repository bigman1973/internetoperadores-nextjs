import { z } from 'zod'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { esMismoOrigen, jsonPrivado, leerJsonLimitado } from '@/lib/asistente/http'
import { responderMensaje } from '@/lib/asistente/responder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const esquema = z.object({ mensaje: z.string().min(1).max(4000), conversacionId: z.string().uuid().optional(), modoAyuda: z.enum(['propuesta', 'respuesta_cliente', 'resumen_incidencia']).optional() })

export async function POST(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.chat', 'escritura'); if ('response' in acceso) return acceso.response
  if (!esMismoOrigen(req)) return jsonPrivado({ error: 'Origen no válido' }, 403)
  const cuerpo = await leerJsonLimitado(req); const entrada = cuerpo.ok ? esquema.safeParse(cuerpo.datos) : { success: false as const }
  if (!entrada.success) return jsonPrivado({ error: 'Solicitud inválida' }, 400)
  try {
    const resultado = await responderMensaje({ mensaje: entrada.data.mensaje, conversacionId: entrada.data.conversacionId, contexto: 'INTERNO' })
    return jsonPrivado({ ...resultado, modoAyuda: entrada.data.modoAyuda || 'respuesta_cliente' })
  } catch (error) { return jsonPrivado({ error: error instanceof Error && error.message === 'NO_AUTORIZADO' ? 'No autorizado' : 'Asistente no disponible' }, error instanceof Error && error.message === 'NO_AUTORIZADO' ? 403 : 503) }
}
