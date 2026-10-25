import { z } from 'zod'
import prisma from '@/lib/prisma'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { esMismoOrigen, jsonPrivado, leerJsonLimitado, uuidValido } from '@/lib/asistente/http'
import { normalizar, sha256Hex, textoPlano, trocear } from '@/lib/asistente/text'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const esquema = z.object({ titulo: z.string().min(3).max(500).optional(), contenido: z.string().min(1).max(100000).optional(), estado: z.enum(['BORRADOR', 'PUBLICADO', 'ARCHIVADO']).optional() }).refine(valor => Object.keys(valor).length > 0)

export async function GET(_req: Request, contexto: { params: Promise<{ id: string }> }) {
  const acceso = await exigirAdminAsistente('admin.asistente.conocimiento', 'lectura'); if ('response' in acceso) return acceso.response
  const { id } = await contexto.params; if (!uuidValido(id)) return jsonPrivado({ error: 'Documento inválido' }, 400)
  const documento = await prisma.asistenteDocumento.findUnique({ where: { id }, include: { versiones: { orderBy: { version: 'desc' }, take: 1 } } })
  if (!documento) return jsonPrivado({ error: 'No encontrado' }, 404)
  return jsonPrivado({ id: documento.id, titulo: documento.titulo, espacio: documento.espacio, tipo: documento.tipo, estado: documento.estado, versionActual: documento.versionActual, contenido: documento.versiones[0]?.contenido || '', updatedAt: documento.updatedAt })
}

export async function PATCH(req: Request, contexto: { params: Promise<{ id: string }> }) {
  const acceso = await exigirAdminAsistente('admin.asistente.conocimiento', 'escritura'); if ('response' in acceso) return acceso.response
  if (!esMismoOrigen(req)) return jsonPrivado({ error: 'Origen no válido' }, 403)
  const { id } = await contexto.params; if (!uuidValido(id)) return jsonPrivado({ error: 'Documento inválido' }, 400)
  const cuerpo = await leerJsonLimitado(req, 120000); const entrada = cuerpo.ok ? esquema.safeParse(cuerpo.datos) : { success: false as const }
  if (!entrada.success) return jsonPrivado({ error: 'Solicitud inválida' }, 400)
  try {
    const actualizado = await prisma.$transaction(async tx => {
      const documento = await tx.asistenteDocumento.findUnique({ where: { id } }); if (!documento) return null
      if (!entrada.data.contenido) {
        const estado = entrada.data.estado || documento.estado
        if (entrada.data.estado && entrada.data.estado !== documento.estado) {
          // Publicar activa sólo la versión vigente; borrador/archivado la retira de las respuestas.
          const vigente = await tx.asistenteDocumentoVersion.findFirst({ where: { documentoId: id }, orderBy: { version: 'desc' }, select: { id: true } })
          await tx.asistenteFragmento.updateMany({ where: { documentoId: id, activo: true }, data: { activo: false } })
          if (vigente && estado === 'PUBLICADO') {
            await tx.asistenteFragmento.updateMany({ where: { documentoId: id, versionId: vigente.id }, data: { activo: true } })
            await tx.asistenteDocumentoVersion.update({ where: { id: vigente.id }, data: { aprobadoPor: acceso.actor.id } })
          }
        }
        return tx.asistenteDocumento.update({ where: { id }, data: { titulo: entrada.data.titulo || documento.titulo, estado, updatedAt: new Date() } })
      }
      const contenido = textoPlano(entrada.data.contenido); const version = documento.versionActual + 1
      const creada = await tx.asistenteDocumentoVersion.create({ data: { documentoId: id, version, contenido, checksum: sha256Hex(contenido), creadoPor: acceso.actor.id, aprobadoPor: entrada.data.estado === 'PUBLICADO' ? acceso.actor.id : null } })
      await tx.asistenteFragmento.updateMany({ where: { documentoId: id, activo: true }, data: { activo: false } })
      const fragmentos = trocear(contenido, { max: 900, solape: 140 })
      if (fragmentos.length) await tx.asistenteFragmento.createMany({ data: fragmentos.map((fragmento, orden) => ({ documentoId: id, versionId: creada.id, orden, titulo: entrada.data.titulo || documento.titulo, contenido: fragmento, contenidoNorm: normalizar(fragmento), espacio: documento.espacio, roles: documento.roles, tenantClienteId: documento.tenantClienteId, activo: (entrada.data.estado || documento.estado) === 'PUBLICADO' })) })
      return tx.asistenteDocumento.update({ where: { id }, data: { titulo: entrada.data.titulo || documento.titulo, estado: entrada.data.estado || documento.estado, versionActual: version, updatedAt: new Date() } })
    })
    if (!actualizado) return jsonPrivado({ error: 'No encontrado' }, 404)
    return jsonPrivado({ ok: true, documento: { id: actualizado.id, versionActual: actualizado.versionActual, estado: actualizado.estado } })
  } catch { return jsonPrivado({ error: 'No se ha podido actualizar el documento' }, 400) }
}
