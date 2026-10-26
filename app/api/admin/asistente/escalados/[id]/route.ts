import { z } from 'zod'
import prisma from '@/lib/prisma'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { esMismoOrigen, jsonPrivado, leerJsonLimitado, uuidValido } from '@/lib/asistente/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const cambio = z.object({ estado: z.enum(['PENDIENTE', 'ATENDIDO', 'DESCARTADO']) })

export async function PATCH(req: Request, contexto: { params: Promise<{ id: string }> }) {
  const acceso = await exigirAdminAsistente('admin.asistente.leads', 'escritura')
  if ('response' in acceso) return acceso.response
  if (!esMismoOrigen(req)) return jsonPrivado({ error: 'Origen no válido' }, 403)
  const { id } = await contexto.params
  if (!uuidValido(id)) return jsonPrivado({ error: 'Escalado no válido' }, 400)
  const cuerpo = await leerJsonLimitado(req)
  const entrada = cuerpo.ok ? cambio.safeParse(cuerpo.datos) : { success: false as const }
  if (!entrada.success) return jsonPrivado({ error: 'Solicitud inválida' }, 400)
  const escalado = await prisma.asistenteEscalado.update({
    where: { id }, data: { estado: entrada.data.estado },
    select: { id: true, estado: true },
  }).catch(() => null)
  if (!escalado) return jsonPrivado({ error: 'Escalado no encontrado' }, 404)
  return jsonPrivado({ ok: true, escalado })
}
