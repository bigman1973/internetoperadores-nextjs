import { z } from 'zod'
import prisma from '@/lib/prisma'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { esMismoOrigen, jsonPrivado, leerJsonLimitado, uuidValido } from '@/lib/asistente/http'
import { obtenerProyeccionLeadAsistente, ESTADOS_ASISTENTE, ORIGEN_ASISTENTE } from '@/lib/asistente/leads-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const cambio = z.object({
  estado: z.enum(ESTADOS_ASISTENTE),
})

export async function GET(_req: Request, contexto: { params: Promise<{ id: string }> }) {
  const acceso = await exigirAdminAsistente('admin.asistente.leads', 'lectura')
  if ('response' in acceso) return acceso.response
  const { id } = await contexto.params
  if (!uuidValido(id)) return jsonPrivado({ error: 'Lead no válido' }, 400)
  const lead = await obtenerProyeccionLeadAsistente(id)
  if (!lead) return jsonPrivado({ error: 'Lead no encontrado' }, 404)
  return jsonPrivado({ lead })
}

export async function PATCH(req: Request, contexto: { params: Promise<{ id: string }> }) {
  const acceso = await exigirAdminAsistente('admin.asistente.leads', 'escritura')
  if ('response' in acceso) return acceso.response
  if (!esMismoOrigen(req)) return jsonPrivado({ error: 'Origen no válido' }, 403)
  const { id } = await contexto.params
  if (!uuidValido(id)) return jsonPrivado({ error: 'Lead no válido' }, 400)
  const cuerpo = await leerJsonLimitado(req)
  const entrada = cuerpo.ok ? cambio.safeParse(cuerpo.datos) : { success: false as const }
  if (!entrada.success) return jsonPrivado({ error: 'Solicitud inválida' }, 400)

  const actualizado = await prisma.asistenteLead.update({
    where: { id },
    data: { estado: entrada.data.estado, updatedAt: new Date() },
    select: { id: true },
  }).catch(() => null)
  if (!actualizado) return jsonPrivado({ error: 'Lead no encontrado' }, 404)
  const lead = await obtenerProyeccionLeadAsistente(id)
  return jsonPrivado({ ok: true, lead: lead ? { ...lead, origen: ORIGEN_ASISTENTE } : null })
}
