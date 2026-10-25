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

function clavesExactas(valor: Record<string, unknown>, claves: string[]): boolean {
  const recibidas = Object.keys(valor)
  return recibidas.length === claves.length && claves.every(clave => Object.hasOwn(valor, clave)) && recibidas.every(clave => claves.includes(clave))
}

function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
}

export function validarConfirmacionRetencion(valor: unknown): { previewToken: string; confirmacion: true; idempotencyKey: string } {
  if (!objeto(valor) || !clavesExactas(valor, ['accion', 'previewToken', 'confirmacion', 'idempotencyKey'])) throw new ErrorPrivacidad('SOLICITUD_INVALIDA')
  if (valor.accion !== 'confirmar' || typeof valor.previewToken !== 'string' || valor.previewToken.length < 32 || valor.previewToken.length > 4096 || valor.confirmacion !== true || !esUuid(valor.idempotencyKey)) throw new ErrorPrivacidad('SOLICITUD_INVALIDA')
  return { previewToken: valor.previewToken, confirmacion: true, idempotencyKey: valor.idempotencyKey }
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
    if (cuerpo.datos.accion === 'confirmar') {
      const confirmacion = validarConfirmacionRetencion(cuerpo.datos)
      const resultado = await confirmarPrivacidad({ actorId: acceso.actor.id, ...confirmacion, ejecutor: 'admin.retencion' })
      return jsonPrivado(resultado)
    }
    return jsonPrivado({ error: 'Solicitud inválida' }, 400)
  } catch (error) {
    return errorRespuesta(error)
  }
}
