import { Prisma } from '@prisma/client'
import net from 'node:net'
import prisma from '@/lib/prisma'
import type { AlcanceAsistente } from '@/lib/asistente/acl'
import { normalizar } from '@/lib/asistente/text'
import { fetchInterno, urlInternaSegura } from '@/lib/asistente/network'

export type FragmentoRecuperado = { id: string; documentoId: string; versionId: string; titulo: string; contenido: string; urlFuente: string | null; puntuacion: number }

function limiteSeguro(valor: number | undefined): number { return Math.max(1, Math.min(20, Number.isInteger(valor) ? Number(valor) : 6)) }

// Términos interrogativos o de forma no identifican por sí solos una fuente.
// Se descartan antes de buscar para que una pregunta sin contexto conserve el
// fallback seguro, en lugar de convertir una coincidencia genérica en respuesta.
const TERMINOS_SIN_CONTEXTO = new Set([
  'a', 'al', 'ante', 'como', 'con', 'cual', 'cuales', 'cuando', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'de', 'del', 'donde', 'el', 'en', 'es', 'esa', 'ese', 'esta', 'este', 'hay', 'la', 'las', 'lo', 'los', 'mi', 'mis', 'no', 'o', 'para', 'por', 'que', 'se', 'segun', 'si', 'sobre', 'su', 'sus', 'un', 'una', 'unos', 'unas',
  'contacto', 'contactar', 'concreto', 'concreta', 'dato', 'disponible', 'disponibles', 'documentacion', 'exacta', 'exacto', 'fijo', 'forma', 'formas', 'incluye', 'informacion', 'informe', 'maxima', 'maximo', 'opcion', 'opciones', 'pagina', 'pregunta', 'publicada', 'publicado', 'puedo', 'puedes', 'puede', 'pueden', 'universal',
])

function terminosConContexto(consulta: string): string {
  return normalizar(consulta)
    .split(' ')
    .filter(termino => termino.length > 1 && !TERMINOS_SIN_CONTEXTO.has(termino))
    .join(' ')
}

function filtroAlcance(alcance: AlcanceAsistente) {
  return {
    espacios: alcance.espacios,
    roles: alcance.roles,
    tenant: alcance.tenantId,
    todoInterno: alcance.puedeLeerTodoInterno === true,
  }
}

/** El chat jamás permite una allowlist de host públicamente enrutable. */
export function urlEmbeddingsInternaParaChat(valor: string | undefined): URL | null {
  const url = urlInternaSegura(valor)
  if (!url) return null
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.railway.internal')) return url
  if (net.isIP(host) === 4) {
    const partes = host.split('.').map(Number)
    if (partes[0] === 10 || partes[0] === 127 || partes[0] === 192 && partes[1] === 168 || partes[0] === 172 && partes[1] >= 16 && partes[1] <= 31) return url
  }
  if (net.isIP(host) === 6 && (host === '::1' || host.startsWith('fc') || host.startsWith('fd'))) return url
  return null
}

async function consultaFts(terminos: string, alcance: AlcanceAsistente, limite: number, operador: 'web' | 'plain'): Promise<FragmentoRecuperado[]> {
  const consulta = operador === 'web'
    ? Prisma.sql`websearch_to_tsquery('spanish', ${terminos})`
    : Prisma.sql`plainto_tsquery('spanish', ${terminos})`
  const { espacios, roles, tenant, todoInterno } = filtroAlcance(alcance)
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
       AND (f.espacio <> 'INTERNO' OR ${todoInterno} OR cardinality(f.roles) = 0 OR f.roles <@ ${roles}::text[])
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
 * el ranking prima las coincidencias del contenido sobre las del título. La
 * consulta ya descartó términos genéricos antes de llegar aquí, por lo que una
 * formulación natural puede recuperar evidencia literal sin abrir respuestas a
 * consultas ambiguas. Mantiene exactamente los filtros de espacio/rol/cliente.
 */
async function consultaCobertura(terminos: string, alcance: AlcanceAsistente, limite: number): Promise<FragmentoRecuperado[]> {
  const { espacios, roles, tenant, todoInterno } = filtroAlcance(alcance)
  const filas = await prisma.$queryRaw<Array<FragmentoRecuperado & { coincidenciasContenido: number; coincidenciasTitulo: number; n: number }>>(Prisma.sql`
    WITH lex AS (SELECT tsvector_to_array(to_tsvector('spanish', ${terminos})) AS l),
         q AS (SELECT l, cardinality(l) AS n,
                      ARRAY(SELECT CASE WHEN length(x) >= 6 THEN left(x, 5) ELSE x END FROM unnest(l) x) AS prefijos,
                      CASE WHEN cardinality(l) = 0 THEN NULL
                           ELSE to_tsquery('simple', array_to_string(ARRAY(SELECT quote_literal(CASE WHEN length(x) >= 6 THEN left(x, 5) ELSE x END) || CASE WHEN length(x) >= 6 THEN ':*' ELSE '' END FROM unnest(l) x), ' | ')) END AS tsq
                 FROM lex)
      SELECT c.* FROM (
        SELECT f.id::text AS "id", f.documento_id::text AS "documentoId", f.version_id::text AS "versionId",
               f.titulo AS "titulo", f.contenido AS "contenido", f.url_fuente AS "urlFuente",
               ts_rank_cd(f.tsv, q.tsq) AS "puntuacion",
             (SELECT count(*) FROM unnest(tsvector_to_array(to_tsvector('spanish', translate(lower(f.contenido), 'áéíóúüñ', 'aeiouun')))) t WHERE EXISTS (SELECT 1 FROM unnest(q.prefijos) p WHERE t = p OR length(p) >= 5 AND t LIKE p || '%'))::int AS "coincidenciasContenido",
             (SELECT count(*) FROM unnest(tsvector_to_array(to_tsvector('spanish', translate(lower(f.titulo), 'áéíóúüñ', 'aeiouun')))) t WHERE EXISTS (SELECT 1 FROM unnest(q.prefijos) p WHERE t = p OR length(p) >= 5 AND t LIKE p || '%'))::int AS "coincidenciasTitulo",
             q.n::int AS "n", f.created_at AS "creado"
        FROM asistente_fragmentos f
        JOIN asistente_documentos d ON d.id = f.documento_id
        CROSS JOIN q
       WHERE q.tsq IS NOT NULL
         AND f.activo = true
         AND d.estado = 'PUBLICADO'
         AND f.espacio = ANY(${espacios}::text[])
         AND (f.espacio <> 'INTERNO' OR ${todoInterno} OR cardinality(f.roles) = 0 OR f.roles <@ ${roles}::text[])
         AND (f.espacio <> 'CLIENTE' OR f.tenant_cliente_id = ${tenant})
         AND f.tsv @@ q.tsq
    ) c
     -- Una sola coincidencia en el cuerpo suele ser incidental (por ejemplo,
     -- «satélite» en una pregunta astronómica). Un título sí es suficiente
     -- porque identifica explícitamente el ámbito de la fuente.
     WHERE c."coincidenciasContenido" >= 2 OR c."coincidenciasTitulo" >= 1
     -- El título es el resumen aprobado de la fuente: pesa más que una palabra
     -- incidental del cuerpo (por ejemplo «monitorización» de soporte frente a
     -- una pregunta específicamente sobre respaldo).
     ORDER BY (c."coincidenciasTitulo" * 3 + c."coincidenciasContenido") DESC, c."puntuacion" DESC, c."creado" DESC
     LIMIT ${limite}
  `)
  return filas.map(({ id, documentoId, versionId, titulo, contenido, urlFuente, coincidenciasContenido, coincidenciasTitulo, n }) => ({
    id,
    documentoId,
    versionId,
    titulo,
    contenido,
    urlFuente,
    // El título es un resumen aprobado del documento y, por tanto, es una
    // señal de intención más fuerte que una coincidencia aislada del cuerpo.
    puntuacion: n > 0 ? (Number(coincidenciasContenido) + Number(coincidenciasTitulo) * 3) / Number(n) : 0,
  }))
}

async function embeddingConsulta(consulta: string): Promise<number[] | null> {
  const base = urlEmbeddingsInternaParaChat(process.env.ASSISTANT_EMBEDDINGS_URL)
  if (!base) return null
  const url = new URL('/v1/embeddings', base)
  try {
    const respuesta = await fetchInterno(url, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', ...(process.env.ASSISTANT_EMBEDDINGS_API_KEY ? { authorization: `Bearer ${process.env.ASSISTANT_EMBEDDINGS_API_KEY}` } : {}) }, body: JSON.stringify({ input: [consulta] }) })
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
  const contextual = terminosConContexto(consulta)
  if (normalizada.length < 2 || !contextual) return []
  const limite = limiteSeguro(opciones.limite)
  const terminos = contextual.split(' ').slice(0, 12).join(' ')
  const cobertura = await consultaCobertura(terminos, alcance, limite)
  // La cobertura ya busca todos los lexemas con el mismo filtro ACL. No se
  // mezcla ts_rank_cd (otra escala) para que una coincidencia parcial no
  // desplace a una fuente con más evidencia literal.
  return reordenarHibrido(cobertura, normalizada)
}
