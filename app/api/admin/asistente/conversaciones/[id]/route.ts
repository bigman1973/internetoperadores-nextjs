import prisma from '@/lib/prisma'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { jsonPrivado, uuidValido } from '@/lib/asistente/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, contexto: { params: Promise<{ id: string }> }) {
  const acceso = await exigirAdminAsistente('admin.asistente.conversaciones', 'lectura')
  if ('response' in acceso) return acceso.response
  const { id } = await contexto.params
  if (!uuidValido(id)) return jsonPrivado({ error: 'Conversación no válida' }, 400)

  const conversacion = await prisma.asistenteConversacion.findUnique({
    where: { id },
    select: {
      id: true,
      canal: true,
      visitanteHash: true,
      estado: true,
      escaladoMotivo: true,
      mensajes: true,
      createdAt: true,
      updatedAt: true,
      mensajesLista: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 50,
        select: {
          id: true,
          rol: true,
          textoAnon: true,
          fuentes: true,
          sinFuente: true,
          puntuacion: true,
          intent: true,
          createdAt: true,
          valoracion: { select: { util: true, comentarioAnon: true, createdAt: true } },
        },
      },
    },
  })
  if (!conversacion) return jsonPrivado({ error: 'Conversación no encontrada' }, 404)
  const { visitanteHash, ...segura } = conversacion
  return jsonPrivado({
    ...segura,
    visitanteHashCorto: visitanteHash ? visitanteHash.slice(0, 8) : null,
    mensajesTruncados: conversacion.mensajes > conversacion.mensajesLista.length,
  })
}
