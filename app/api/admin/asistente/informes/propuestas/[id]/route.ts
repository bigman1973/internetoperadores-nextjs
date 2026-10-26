import { z } from 'zod'
import { cambiarEstadoPropuestaInforme } from '@/lib/asistente/informes'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { esMismoOrigen, jsonPrivado, leerJsonLimitado, uuidValido } from '@/lib/asistente/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const esquema = z.object({ estado: z.enum(['ACEPTADA', 'DESCARTADA', 'HECHA']) })

export async function PATCH(req: Request, contexto: { params: Promise<{ id: string }> }) {
  const acceso = await exigirAdminAsistente('admin.asistente.propuestas', 'escritura')
  if ('response' in acceso) return acceso.response
  if (!esMismoOrigen(req)) return jsonPrivado({ error: 'Origen no válido' }, 403)
  const { id } = await contexto.params
  if (!uuidValido(id)) return jsonPrivado({ error: 'Propuesta inválida' }, 400)
  const cuerpo = await leerJsonLimitado(req)
  const entrada = cuerpo.ok ? esquema.safeParse(cuerpo.datos) : { success: false as const }
  if (!entrada.success) return jsonPrivado({ error: 'Solicitud inválida' }, 400)
  try {
    return jsonPrivado({ ok: true, propuesta: await cambiarEstadoPropuestaInforme(id, entrada.data.estado, acceso.actor.id) })
  } catch (error) {
    const codigo = error instanceof Error ? error.message : ''
    return jsonPrivado({ error: codigo === 'PROPUESTA_NO_PENDIENTE' ? 'La propuesta ya tiene una decisión registrada' : 'Propuesta no encontrada' }, codigo === 'PROPUESTA_NO_PENDIENTE' ? 409 : 404)
  }
}
