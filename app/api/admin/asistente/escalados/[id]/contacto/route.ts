import { getServerSession } from 'next-auth'
import prisma from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { jsonPrivado, uuidValido } from '@/lib/asistente/http'
import { leerContactoSeguro } from '@/lib/asistente/contacto-seguro'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * El contacto no forma parte de la bandeja. Antes de cualquier lectura se
 * rechaza Actuar como y se exige el permiso granular de contacto consentido.
 */
export async function GET(_req: Request, contexto: { params: Promise<{ id: string }> }) {
  const sesion = await getServerSession(authOptions)
  if ((sesion as { impersonation?: unknown } | null)?.impersonation) {
    return jsonPrivado({ error: 'Contacto no disponible durante Actuar como' }, 403)
  }

  const acceso = await exigirAdminAsistente('admin.asistente.leads.contacto', 'lectura')
  if ('response' in acceso) return acceso.response
  const { id } = await contexto.params
  if (!uuidValido(id)) return jsonPrivado({ error: 'Escalado no válido' }, 400)

  const escalado = await prisma.asistenteEscalado.findUnique({
    where: { id },
    select: { id: true, conversacionId: true, consentimiento: true },
  })
  if (!escalado) return jsonPrivado({ error: 'Escalado no encontrado' }, 404)
  if (!escalado.consentimiento) return jsonPrivado({ contacto: null })

  try {
    const contacto = await leerContactoSeguro(prisma, {
      referenciaTipo: 'ESCALADO',
      referenciaId: escalado.id,
      conversacionId: escalado.conversacionId,
    })
    return jsonPrivado({ contacto })
  } catch {
    return jsonPrivado({ error: 'No se puede recuperar el contacto seguro' }, 409)
  }
}
