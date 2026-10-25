import { Prisma } from '@prisma/client'
import net from 'node:net'
import prisma from '@/lib/prisma'
import type { AlcanceAsistente } from '@/lib/asistente/acl'
import { normalizar } from '@/lib/asistente/text'
import { urlInternaSegura } from '@/lib/asistente/network'
import { esAlcanceSoloPublico, filtrarCandidatosPublicos, reordenarCandidatosLocalmente } from '@/lib/asistente/relevance'

export type FragmentoRecuperado = {
  id: string
  documentoId: string
  versionId: string
  titulo: string
  contenido: string
  urlFuente: string | null
  puntuacion: number
  /** Sólo se usa como segunda defensa de aptitud en el canal público. */
  origen?: string | null
  tipo?: string | null
}

/** El chat sólo entrega hasta tres fuentes distintas; normalmente el reranker deja una o dos. */
function limiteSeguro(valor: number | undefined): number { return Math.max(1, Math.min(3, Number.isInteger(valor) ? Number(valor) : 3)) }

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

/**
 * Recupera únicamente filas permitidas. La ACL de espacio, roles y tenant es
 * parte de ESTA consulta SQL y se ejecuta antes del ranking local: el
 * reranker no recibe contenido privado para decidir si ocultarlo después.
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
               d.origen AS "origen", d.tipo AS "tipo", ts_rank_cd(f.tsv, q.tsq) AS "puntuacion",
             (SELECT count(*) FROM unnest(tsvector_to_array(to_tsvector('spanish', translate(lower(f.contenido), 'áéíóúüñ', 'aeiouun')))) t WHERE EXISTS (SELECT 1 FROM unnest(q.prefijos) p WHERE t = p OR length(p) >= 5 AND t LIKE p || '%'))::int AS "coincidenciasContenido",
             (SELECT count(*) FROM unnest(tsvector_to_array(to_tsvector('spanish', translate(lower(f.titulo), 'áéíóúüñ', 'aeiouun')))) t WHERE EXISTS (SELECT 1 FROM unnest(q.prefijos) p WHERE t = p OR length(p) >= 5 AND t LIKE p || '%'))::int AS "coincidenciasTitulo",
             q.n::int AS "n", f.created_at AS "creado"
        FROM asistente_fragmentos f
        JOIN asistente_documentos d ON d.id = f.documento_id
        CROSS JOIN q
       WHERE q.tsq IS NOT NULL
         AND f.activo = true
         AND d.estado = 'PUBLICADO'
         AND d.espacio = f.espacio
         AND (d.espacio <> 'INTERNO' OR ${todoInterno} OR cardinality(d.roles) = 0 OR d.roles <@ ${roles}::text[])
         AND (d.espacio <> 'CLIENTE' OR d.tenant_cliente_id = ${tenant})
         AND (d.espacio <> 'PUBLICO' OR (d.tenant_cliente_id IS NULL AND f.tenant_cliente_id IS NULL))
         AND f.espacio = ANY(${espacios}::text[])
         AND (f.espacio <> 'INTERNO' OR ${todoInterno} OR cardinality(f.roles) = 0 OR f.roles <@ ${roles}::text[])
         AND (f.espacio <> 'CLIENTE' OR f.tenant_cliente_id = ${tenant})
         AND f.tsv @@ q.tsq
    ) c
     -- Una señal de cuerpo permite recuperar atributos como monitorización.
     -- La aceptación temática estricta se hace después sobre filas SQL-ACL.
     WHERE c."coincidenciasContenido" >= 1 OR c."coincidenciasTitulo" >= 1
     ORDER BY (c."coincidenciasTitulo" * 3 + c."coincidenciasContenido") DESC, c."puntuacion" DESC, c."creado" DESC
     LIMIT ${limite}
  `)
  return filas.map(({ id, documentoId, versionId, titulo, contenido, urlFuente, origen, tipo, coincidenciasContenido, coincidenciasTitulo, n }) => ({
    id,
    documentoId,
    versionId,
    titulo,
    contenido,
    urlFuente,
    origen,
    tipo,
    // Señal de recuperación únicamente; el orden final procede del reranker
    // local que contrasta intención y tópico.
    puntuacion: n > 0 ? (Number(coincidenciasContenido) + Number(coincidenciasTitulo) * 3) / Number(n) : 0,
  }))
}

export async function buscar(consulta: string, alcance: AlcanceAsistente, opciones: { limite?: number } = {}): Promise<FragmentoRecuperado[]> {
  const normalizada = normalizar(consulta)
  const contextual = terminosConContexto(consulta)
  if (normalizada.length < 2 || !contextual) return []
  const limite = limiteSeguro(opciones.limite)
  const terminos = contextual.split(' ').slice(0, 12).join(' ')

  // El margen de candidatos es siempre SQL-ACL; se usa sólo para permitir que
  // el reranker descarte coincidencias accidentales antes de entregar fuentes.
  const autorizadas = await consultaCobertura(terminos, alcance, 80)
  // La política compartida filtra el contenido y exige procedencia certificada
  // en tarifas públicas; la ACL de documento y fragmento ya se aplicó en SQL.
  const aptas = esAlcanceSoloPublico(alcance.espacios) ? filtrarCandidatosPublicos(autorizadas) : autorizadas
  return reordenarCandidatosLocalmente(normalizada, aptas, limite)
}
