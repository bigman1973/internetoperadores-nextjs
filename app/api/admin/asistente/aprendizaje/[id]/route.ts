import { z } from 'zod'
import { decidirPropuestaAprendizaje } from '@/lib/asistente/aprendizaje'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { esMismoOrigen, jsonPrivado, leerJsonLimitado, uuidValido } from '@/lib/asistente/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const esquema = z.object({
  accion: z.enum(['aprobar', 'descartar']),
  pregunta: z.string().max(1600).optional(),
  respuesta: z.string().max(6000).optional(),
  espacio: z.enum(['PUBLICO', 'INTERNO']).optional(),
})

export async function PATCH(req: Request, contexto: { params: Promise<{ id: string }> }) {
  const acceso = await exigirAdminAsistente('admin.asistente.aprendizaje', 'escritura')
  if ('response' in acceso) return acceso.response
  if (!esMismoOrigen(req)) return jsonPrivado({ error: 'Origen no válido' }, 403)
  const { id } = await contexto.params
  if (!uuidValido(id)) return jsonPrivado({ error: 'Propuesta inválida' }, 400)
  const cuerpo = await leerJsonLimitado(req)
  const entrada = cuerpo.ok ? esquema.safeParse(cuerpo.datos) : { success: false as const }
  if (!entrada.success) return jsonPrivado({ error: 'Solicitud inválida' }, 400)
  try {
    const propuesta = await decidirPropuestaAprendizaje({ id, actorId: acceso.actor.id, accion: entrada.data.accion!, pregunta: entrada.data.pregunta, respuesta: entrada.data.respuesta, espacio: entrada.data.espacio })
    return jsonPrivado({ ok: true, propuesta })
  } catch (error) {
    const codigo = error instanceof Error ? error.message : ''
    const estado = codigo === 'PROPUESTA_NO_ENCONTRADA' ? 404 : 400
    const mensaje = codigo === 'RESPUESTA_REQUERIDA' ? 'Es necesario revisar y completar la respuesta antes de aprobarla' : codigo === 'PROPUESTA_NO_ENCONTRADA' ? 'Propuesta no encontrada' : 'La propuesta ya no se puede modificar'
    return jsonPrivado({ error: mensaje }, estado)
  }
}
