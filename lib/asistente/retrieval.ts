import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import type { AlcanceAsistente } from '@/lib/asistente/acl'
import { normalizar } from '@/lib/asistente/text'
import { fetchInterno, urlInternaSegura } from '@/lib/asistente/network'

export type FragmentoRecuperado = { id: string; documentoId: string; versionId: string; titulo: string; contenido: string; urlFuente: string | null; puntuacion: number }

function limiteSeguro(valor: number | undefined): number { return Math.max(1, Math.min(20, Number.isInteger(valor) ? Number(valor) : 6)) }

async function consultaFts(terminos: string, alcance: AlcanceAsistente, limite: number, operador: 'web' | 'plain'): Promise<FragmentoRecuperado[]> {
  const consulta = operador === 'web'
    ? Prisma.sql`websearch_to_tsquery('spanish', ${terminos})`
    : Prisma.sql`plainto_tsquery('spanish', ${terminos})`
  const espacios = alcance.espacios
  const roles = alcance.roles
  const tenant = alcance.tenantId
  return prisma.$queryRaw<FragmentoRecuperado[]>(Prisma.sql`
    WITH q AS (SELECT ${consulta} AS tsq)
    SELECT f.id::text AS "id", f.documento_id::text AS "documentoId", f.version_id::text AS "versionId",
           f.titulo AS "titulo", f.contenido AS "contenido", f.url_fuente AS "urlFuente",
           ts_rank_cd(f.tsv, q.tsq) AS "puntuacion"
      FROM asistente_fragmentos f
      JOIN asistente_documentos d ON d.id = f.documento_id
      CROSS JOIN q
     WHERE f.activo = true
       AND d.estado = 'PUBLICADO'
       AND f.espacio = ANY(${espacios}::text[])
       AND (f.espacio <> 'INTERNO' OR cardinality(f.roles) = 0 OR f.roles <@ ${roles}::text[])
       AND (f.espacio <> 'CLIENTE' OR f.tenant_cliente_id = ${tenant})
       AND f.tsv @@ q.tsq
     ORDER BY "puntuacion" DESC, f.created_at DESC
     LIMIT ${limite}
  `)
}

function coseno(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let punto = 0, aa = 0, bb = 0
  for (let i = 0; i < a.length; i += 1) { punto += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i] }
  return aa && bb ? punto / Math.sqrt(aa * bb) : 0
}

/**
 * Tercer intento para preguntas naturales («¿cuánto tarda la instalación?»),
 * donde exigir todas las palabras no encuentra nada: OR de los lexemas, pero
 * el fragmento debe contener al menos la mitad (mínimo 2 si hay 3 o más) para
 * no citar fragmentos poco relacionados. Mismos filtros de espacio/rol/cliente.
 * La puntuación es la proporción de términos cubiertos (0–1).
 */
async function consultaCobertura(terminos: string, alcance: AlcanceAsistente, limite: number): Promise<FragmentoRecuperado[]> {
  const espacios = alcance.espacios
  const roles = alcance.roles
  const tenant = alcance.tenantId
  const filas = await prisma.$queryRaw<Array<FragmentoRecuperado & { coincidencias: number; n: number }>>(Prisma.sql`
    WITH lex AS (SELECT tsvector_to_array(to_tsvector('spanish', ${terminos})) AS l),
         q AS (SELECT l, cardinality(l) AS n,
                      CASE WHEN cardinality(l) = 0 THEN NULL
                           ELSE to_tsquery('simple', array_to_string(ARRAY(SELECT quote_literal(x) FROM unnest(l) x), ' | ')) END AS tsq
                 FROM lex)
    SELECT c.* FROM (
      SELECT f.id::text AS "id", f.documento_id::text AS "documentoId", f.version_id::text AS "versionId",
             f.titulo AS "titulo", f.contenido AS "contenido", f.url_fuente AS "urlFuente",
             ts_rank_cd(f.tsv, q.tsq) AS "puntuacion",
             (SELECT count(*) FROM unnest(tsvector_to_array(f.tsv)) t WHERE t = ANY(q.l))::int AS "coincidencias",
             q.n::int AS "n", f.created_at AS "creado"
        FROM asistente_fragmentos f
        JOIN asistente_documentos d ON d.id = f.documento_id
        CROSS JOIN q
       WHERE q.tsq IS NOT NULL
         AND f.activo = true
         AND d.estado = 'PUBLICADO'
         AND f.espacio = ANY(${espacios}::text[])
         AND (f.espacio <> 'INTERNO' OR cardinality(f.roles) = 0 OR f.roles <@ ${roles}::text[])
         AND (f.espacio <> 'CLIENTE' OR f.tenant_cliente_id = ${tenant})
         AND f.tsv @@ q.tsq
    ) c
     WHERE c."coincidencias" >= GREATEST(CASE WHEN c."n" >= 3 THEN 2 ELSE 1 END, CEIL(c."n" * 0.5))
     ORDER BY c."coincidencias" DESC, c."puntuacion" DESC, c."creado" DESC
     LIMIT ${limite}
  `)
  return filas.map(({ id, documentoId, versionId, titulo, contenido, urlFuente, coincidencias, n }) => ({ id, documentoId, versionId, titulo, contenido, urlFuente, puntuacion: n > 0 ? Number(coincidencias) / Number(n) : 0 }))
}

async function embeddingConsulta(consulta: string): Promise<number[] | null> {
  const base = urlInternaSegura(process.env.ASSISTANT_EMBEDDINGS_URL)
  if (!base) return null
  const url = new URL('/v1/embeddings', base)
  try {
    const respuesta = await fetchInterno(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.ASSISTANT_EMBEDDINGS_API_KEY ? { authorization: `Bearer ${process.env.ASSISTANT_EMBEDDINGS_API_KEY}` } : {}) }, body: JSON.stringify({ input: [consulta] }) })
    if (!respuesta.ok) return null
    const datos = await respuesta.json() as { data?: Array<{ embedding?: unknown }> }
    const vector = datos.data?.[0]?.embedding
    return Array.isArray(vector) && vector.length <= 2048 && vector.every(numero => typeof numero === 'number' && Number.isFinite(numero)) ? vector : null
  } catch { return null }
}

async function reordenarHibrido(fragmentos: FragmentoRecuperado[], consulta: string): Promise<FragmentoRecuperado[]> {
  const vector = await embeddingConsulta(consulta)
  if (!vector || fragmentos.length < 2) return fragmentos
  try {
    const ids = fragmentos.map(fragmento => fragmento.id)
    const filas = await prisma.$queryRaw<Array<{ id: string; embedding: number[] | null }>>(Prisma.sql`
      SELECT id::text AS "id", embedding FROM asistente_fragmentos WHERE id = ANY(${ids}::uuid[])
    `)
    const porId = new Map(filas.map(fila => [fila.id, fila.embedding || []]))
    return [...fragmentos].sort((a, b) => coseno((porId.get(b.id) || []) as number[], vector) - coseno((porId.get(a.id) || []) as number[], vector))
  } catch { return fragmentos }
}

export async function buscar(consulta: string, alcance: AlcanceAsistente, opciones: { limite?: number } = {}): Promise<FragmentoRecuperado[]> {
  const normalizada = normalizar(consulta)
  if (normalizada.length < 2) return []
  const limite = limiteSeguro(opciones.limite)
  let resultados = await consultaFts(normalizada, alcance, limite, 'web')
  if (resultados.length === 0) resultados = await consultaFts(normalizada.split(' ').filter(Boolean).slice(0, 12).join(' '), alcance, limite, 'plain')
  if (resultados.length === 0) resultados = await consultaCobertura(normalizada.split(' ').filter(Boolean).slice(0, 12).join(' '), alcance, limite)
  return reordenarHibrido(resultados, normalizada)
}
