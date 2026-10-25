import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { esMismoOrigen, jsonPrivado, leerJsonLimitado } from '@/lib/asistente/http'
import { ErrorPrivacidad, confirmarPrivacidad, previsualizarPurga } from '@/lib/asistente/retencion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function errorRespuesta(error: unknown) {
  if (error instanceof ErrorPrivacidad) return jsonPrivado({ error: error.message, codigo: error.codigo }, error.estado)
  return jsonPrivado({ error: 'No se pudo procesar la operación de retención.', codigo: 'RETENCION_ERROR' }, 500)
}

function objeto(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)
}

/**
 * La ruta permanece en ensayo salvo `accion: confirmar`, que exige confirmación
 * humana, previsualización firmada y una nueva comprobación en transacción.
 */
export async function POST(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.configuracion', 'escritura')
  if ('response' in acceso) return acceso.response
  if (!esMismoOrigen(req)) return jsonPrivado({ error: 'Origen no válido' }, 403)
  const cuerpo = await leerJsonLimitado(req, 8192)
  if (!cuerpo.ok || !objeto(cuerpo.datos)) return jsonPrivado({ error: 'Solicitud inválida' }, 400)
  try {
    if (cuerpo.datos.accion === 'previsualizar' && Object.keys(cuerpo.datos).length === 1) {
      return jsonPrivado({ ok: true, ensayo: true, preview: await previsualizarPurga({ actorId: acceso.actor.id }) })
    }
    if (cuerpo.datos.accion === 'confirmar' && Object.keys(cuerpo.datos).length === 5) {
      const { accion: _accion, previewToken, confirmacion, idempotencyKey, ejecutor } = cuerpo.datos
      if (typeof previewToken !== 'string' || confirmacion !== true || typeof idempotencyKey !== 'string' || (ejecutor !== undefined && typeof ejecutor !== 'string')) return jsonPrivado({ error: 'Solicitud inválida' }, 400)
      const resultado = await confirmarPrivacidad({ actorId: acceso.actor.id, previewToken, confirmacion: true, idempotencyKey, ejecutor: typeof ejecutor === 'string' ? ejecutor.slice(0, 80) : 'admin.retencion' })
      return jsonPrivado(resultado)
    }
    return jsonPrivado({ error: 'Solicitud inválida' }, 400)
  } catch (error) {
    return errorRespuesta(error)
  }
}
