import prisma from '@/lib/prisma'

/**
 * Métricas globales (no filtradas) del directorio. Se calculan en una sola
 * consulta para no abrir una docena de conexiones/viajes a Railway en cada clic.
 * El conjunto visible se materializa una sola vez y se reutiliza en los KPIs
 * y el selector de unidades. Sin caché: las ediciones y las importaciones se
 * reflejan en cuanto se vuelve a abrir el directorio.
 */
export async function getCrmContactDirectoryStats() {
  const [row] = await prisma.$queryRaw<Array<{
    stats: {
      total: number
      customers: number
      withoutEmail: number
      fullContacts: number
      failedContacts: number
      withoutBusinessUnit: number
    }
    units: Array<{ unit: string; total: number }>
    ambiguous: number
    contactsWithOpenDeals: number
  }>>`
    WITH visible AS MATERIALIZED (
      SELECT miembro.registro_id AS id
      FROM crm_lista_miembros miembro
      JOIN crm_listas lista ON lista.id = miembro.lista_id
      WHERE miembro.activo = true AND lista.activo = true
      UNION
      SELECT relacion.contacto_id AS id
      FROM crm_negocio_contactos relacion
      JOIN crm_negocios_hubspot negocio ON negocio.hubspot_id = relacion.negocio_hubspot_id
      WHERE negocio.activo = true
    ), eligible AS MATERIALIZED (
      SELECT contacto.cliente_web_id, contacto.email,
             contacto.propiedades_completas_at, contacto.propiedades_completas_error,
             contacto.unidades_negocio
      FROM visible
      JOIN crm_registros_hubspot contacto ON contacto.id = visible.id
      WHERE contacto.object_type_id = '0-1'
    ), totals AS (
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE cliente_web_id IS NOT NULL)::int AS "customers",
             COUNT(*) FILTER (WHERE email IS NULL)::int AS "withoutEmail",
             COUNT(*) FILTER (WHERE propiedades_completas_at IS NOT NULL)::int AS "fullContacts",
             COUNT(*) FILTER (WHERE propiedades_completas_error IS NOT NULL)::int AS "failedContacts",
             COUNT(*) FILTER (WHERE cardinality(unidades_negocio) = 0)::int AS "withoutBusinessUnit"
      FROM eligible
    ), units AS (
      SELECT unidad AS unit, COUNT(*)::int AS total
      FROM eligible CROSS JOIN LATERAL unnest(unidades_negocio) AS unidad
      GROUP BY unidad
    ), duplicated_emails AS (
      SELECT LOWER(TRIM(email)) AS normalized_email
      FROM clientes_web
      WHERE email IS NOT NULL AND TRIM(email) <> ''
        AND LOWER(TRIM(email)) NOT LIKE '%@placeholder.local'
      GROUP BY LOWER(TRIM(email))
      HAVING COUNT(*) > 1
    )
    SELECT row_to_json(totals) AS stats,
           COALESCE((SELECT json_agg(units) FROM units), '[]'::json) AS units,
           (SELECT COUNT(*)::int FROM crm_registros_hubspot contacto
              JOIN duplicated_emails duplicado
                ON duplicado.normalized_email = LOWER(TRIM(contacto.email))
             WHERE contacto.object_type_id = '0-1') AS ambiguous,
           (SELECT COUNT(DISTINCT contacto_id)::int
              FROM crm_negocio_contactos relacion
              JOIN crm_negocios_hubspot negocio ON negocio.hubspot_id = relacion.negocio_hubspot_id
              JOIN crm_registros_hubspot contacto ON contacto.id = relacion.contacto_id
             WHERE contacto.object_type_id = '0-1' AND negocio.activo = true AND negocio.cerrado = false
           ) AS "contactsWithOpenDeals"
    FROM totals
  `
  if (!row) throw new Error('No se pudieron consultar las métricas del directorio CRM.')
  return row
}
