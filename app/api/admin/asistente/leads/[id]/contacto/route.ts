import { getServerSession } from 'next-auth'
import prisma from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { jsonPrivado, uuidValido } from '@/lib/asistente/http'
import { leerContactoSeguro } from '@/lib/asistente/contacto-seguro'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * El permiso específico se comprueba antes de leer/descifrar. La suplantación
 * queda deliberadamente excluida incluso cuando el usuario efectivo hereda el
 * permiso de Leads del asistente.
 */
export async function GET(_req: Request, contexto: { params: Promise<{ id: string }> }) {
  const sesion = await getServerSession(authOptions)
  if ((sesion as { impersonation?: unknown } | null)?.impersonation) return jsonPrivado({ error: 'Contacto no disponible durante Actuar como' }, 403)

  const acceso = await exigirAdminAsistente('admin.asistente.leads.contacto', 'lectura')
  if ('response' in acceso) return acceso.response
  const { id } = await contexto.params
  if (!uuidValido(id)) return jsonPrivado({ error: 'Lead no válido' }, 400)

  const lead = await prisma.asistenteLead.findUnique({
    where: { id },
    select: { id: true, conversacionId: true, consentimiento: true },
  })
  if (!lead) return jsonPrivado({ error: 'Lead no encontrado' }, 404)
  if (!lead.consentimiento) return jsonPrivado({ contacto: null })

  try {
    const contacto = await leerContactoSeguro(prisma, { referenciaTipo: 'LEAD', referenciaId: lead.id, conversacionId: lead.conversacionId })
    return jsonPrivado({ contacto })
  } catch {
    return jsonPrivado({ error: 'No se puede recuperar el contacto seguro' }, 409)
  }
}
