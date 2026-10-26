import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { esMismoOrigen, jsonPrivado, leerJsonLimitado } from '@/lib/asistente/http'
import { confirmarDerechoAsistente, previsualizarDerechoAsistente } from '@/lib/asistente/derechos'
import { ErrorPrivacidad } from '@/lib/asistente/retencion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function errorRespuesta(error: unknown) {
  if (error instanceof ErrorPrivacidad) return jsonPrivado({ error: error.message, codigo: error.codigo }, error.estado)
  return jsonPrivado({ error: 'No se pudo procesar el derecho de privacidad.', codigo: 'DERECHO_ERROR' }, 500)
}

function objeto(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)
}

/** Previsualiza o confirma una supresión/revocación sólo de registros asistente_*. */
export async function POST(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.configuracion', 'escritura')
  if ('response' in acceso) return acceso.response
  if (!esMismoOrigen(req)) return jsonPrivado({ error: 'Origen no válido' }, 403)
  const cuerpo = await leerJsonLimitado(req, 8192)
  if (!cuerpo.ok || !objeto(cuerpo.datos)) return jsonPrivado({ error: 'Solicitud inválida' }, 400)
  try {
    if (cuerpo.datos.fase === 'previsualizar') {
      const { fase: _fase, ...solicitud } = cuerpo.datos
      return jsonPrivado({ ok: true, ensayo: true, preview: await previsualizarDerechoAsistente(acceso.actor.id, solicitud) })
    }
    if (cuerpo.datos.fase === 'confirmar') {
      const { fase: _fase, ...confirmacion } = cuerpo.datos
      return jsonPrivado(await confirmarDerechoAsistente(acceso.actor.id, confirmacion))
    }
    return jsonPrivado({ error: 'Solicitud inválida' }, 400)
  } catch (error) {
    return errorRespuesta(error)
  }
}
