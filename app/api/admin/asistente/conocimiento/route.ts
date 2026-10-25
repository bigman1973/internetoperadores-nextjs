import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import prisma from '@/lib/prisma'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { esMismoOrigen, jsonPrivado, leerJsonLimitado } from '@/lib/asistente/http'
import { extraerArchivo, indexarFuente, type FuenteIngesta } from '@/lib/asistente/ingesta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const esquema = z.object({ titulo: z.string().min(3).max(500), contenido: z.string().min(1).max(100000), tipo: z.enum(['FAQ', 'TXT', 'MD']).default('FAQ'), espacio: z.enum(['PUBLICO', 'INTERNO']).default('INTERNO') })
function espacioFormulario(valor: FormDataEntryValue | null): 'PUBLICO' | 'INTERNO' | null {
  if (valor === null || valor === '') return 'INTERNO'
  return valor === 'PUBLICO' || valor === 'INTERNO' ? valor : null
}

export async function GET(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.conocimiento', 'lectura'); if ('response' in acceso) return acceso.response
  const url = new URL(req.url); const limitePedido = Number(url.searchParams.get('limit') || 20); const take = Number.isInteger(limitePedido) ? Math.max(1, Math.min(50, limitePedido)) : 20
  const cursor = url.searchParams.get('cursor') || undefined
  const documentos = await prisma.asistenteDocumento.findMany({ orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: take + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, titulo: true, espacio: true, tipo: true, origen: true, estado: true, versionActual: true, updatedAt: true } })
  const hayMas = documentos.length > take; const items = hayMas ? documentos.slice(0, take) : documentos
  return jsonPrivado({ items, siguienteCursor: hayMas ? items[items.length - 1]?.id || null : null })
}

export async function POST(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.conocimiento', 'escritura'); if ('response' in acceso) return acceso.response
  if (!esMismoOrigen(req)) return jsonPrivado({ error: 'Origen no válido' }, 403)
  const tipoContenido = req.headers.get('content-type') || ''
  let fuente: FuenteIngesta
  let espacio: 'PUBLICO' | 'INTERNO' = 'INTERNO'
  try {
    if (tipoContenido.includes('multipart/form-data')) {
      const longitud = Number(req.headers.get('content-length')); if (Number.isFinite(longitud) && longitud > 10 * 1024 * 1024) return jsonPrivado({ error: 'Archivo demasiado grande' }, 413)
      const formulario = await req.formData(); const archivo = formulario.get('archivo')
      if (!(archivo instanceof File)) return jsonPrivado({ error: 'Archivo requerido' }, 400)
      const elegido = espacioFormulario(formulario.get('espacio')); if (!elegido) return jsonPrivado({ error: 'Espacio no válido' }, 400)
      espacio = elegido
      const extraido = await extraerArchivo(Buffer.from(await archivo.arrayBuffer()), archivo.name)
      fuente = { titulo: String(formulario.get('titulo') || 'Documento administrativo').slice(0, 500), contenido: extraido.contenido, tipo: extraido.tipo, origen: `admin:${randomUUID()}`, urlFuente: null }
    } else {
      const cuerpo = await leerJsonLimitado(req, 120000); const entrada = cuerpo.ok ? esquema.safeParse(cuerpo.datos) : { success: false as const }
      if (!entrada.success) return jsonPrivado({ error: 'Solicitud inválida' }, 400)
      espacio = entrada.data.espacio
      fuente = { titulo: entrada.data.titulo, contenido: entrada.data.contenido, tipo: entrada.data.tipo, origen: `admin:${randomUUID()}`, urlFuente: null }
    }
    // Todo conocimiento subido entra como BORRADOR: no responde hasta que una persona lo publica (PATCH estado=PUBLICADO).
    const resultado = await indexarFuente(fuente, acceso.actor.id, { espacio, estado: 'BORRADOR' })
    return jsonPrivado({ ok: true, documentoId: resultado.documentoId, creado: resultado.creado, estado: resultado.estado }, 201)
  } catch (error) { return jsonPrivado({ error: error instanceof Error ? error.message : 'No se ha podido procesar el conocimiento' }, 400) }
}
