import { z } from 'zod'
import { cambiarEstadoHueco } from '@/lib/asistente/aprendizaje'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { esMismoOrigen, jsonPrivado, leerJsonLimitado, uuidValido } from '@/lib/asistente/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const esquema = z.object({ estado: z.enum(['DESCARTADO', 'NUEVO']) })

export async function PATCH(req: Request, contexto: { params: Promise<{ id: string }> }) {
  const acceso = await exigirAdminAsistente('admin.asistente.aprendizaje', 'escritura')
  if ('response' in acceso) return acceso.response
  if (!esMismoOrigen(req)) return jsonPrivado({ error: 'Origen no válido' }, 403)
  const { id } = await contexto.params
  if (!uuidValido(id)) return jsonPrivado({ error: 'Hueco inválido' }, 400)
  const cuerpo = await leerJsonLimitado(req)
  const entrada = cuerpo.ok ? esquema.safeParse(cuerpo.datos) : { success: false as const }
  if (!entrada.success) return jsonPrivado({ error: 'Solicitud inválida' }, 400)
  try { return jsonPrivado({ ok: true, hueco: await cambiarEstadoHueco(id, entrada.data.estado) }) } catch { return jsonPrivado({ error: 'Hueco no encontrado' }, 404) }
}
