import { z } from 'zod'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { esMismoOrigen, jsonPrivado, leerJsonLimitado } from '@/lib/asistente/http'
import { descargarPaginaPublica, indexarFuente } from '@/lib/asistente/ingesta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const esquema = z.object({ url: z.string().url().max(1000) })

export async function POST(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.conocimiento', 'escritura'); if ('response' in acceso) return acceso.response
  if (!esMismoOrigen(req)) return jsonPrivado({ error: 'Origen no válido' }, 403)
  const cuerpo = await leerJsonLimitado(req); const entrada = cuerpo.ok ? esquema.safeParse(cuerpo.datos) : { success: false as const }
  if (!entrada.success) return jsonPrivado({ error: 'Solicitud inválida' }, 400)
  try { const fuente = await descargarPaginaPublica(entrada.data.url); const resultado = await indexarFuente(fuente, acceso.actor.id, { espacio: 'PUBLICO', estado: 'BORRADOR' }); return jsonPrivado({ ok: true, documentoId: resultado.documentoId, creado: resultado.creado, estado: resultado.estado }) } catch (error) { return jsonPrivado({ error: error instanceof Error ? error.message : 'URL no permitida' }, 400) }
}
