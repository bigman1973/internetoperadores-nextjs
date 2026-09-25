import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'

/**
 * Vincula contactos HubSpot con clientes reales del panel por correo normalizado.
 *
 * Solo convierte automáticamente cuando el correo identifica a un único cliente.
 * Los correos duplicados permanecen como leads para evitar asociaciones erróneas.
 * También retira enlaces automáticos que han dejado de coincidir, sin tocar futuras
 * asociaciones de otro origen. Nunca modifica HubSpot ni las pertenencias a listas.
 */
export async function reconciliarContactosCrmConClientes(emails?: string[]): Promise<number> {
  const normalizedEmails = [...new Set((emails || []).map((email) => email.trim().toLowerCase()).filter(Boolean))]
  const contactFilter = normalizedEmails.length > 0
    ? Prisma.sql`AND LOWER(TRIM(contacto.email)) IN (${Prisma.join(normalizedEmails)})`
    : Prisma.empty

  const desvinculados = await prisma.$executeRaw(Prisma.sql`
    WITH clientes_unicos AS (
      SELECT
        LOWER(TRIM(email)) AS email_normalizado,
        MIN(id) AS id,
        COUNT(*) AS coincidencias
      FROM clientes_web
      WHERE email IS NOT NULL
        AND TRIM(email) <> ''
        AND LOWER(TRIM(email)) NOT LIKE '%@placeholder.local'
      GROUP BY LOWER(TRIM(email))
      HAVING COUNT(*) = 1
    )
    UPDATE crm_registros_hubspot AS contacto
    SET cliente_web_id = NULL,
        vinculo_cliente_origen = NULL,
        convertido_at = NULL,
        updated_at = NOW()
    WHERE contacto.object_type_id = '0-1'
      AND contacto.vinculo_cliente_origen = 'EMAIL_AUTOMATICO'
      ${contactFilter}
      AND NOT EXISTS (
        SELECT 1
        FROM clientes_unicos cliente
        WHERE cliente.email_normalizado = LOWER(TRIM(contacto.email))
          AND cliente.id = contacto.cliente_web_id
      )
  `)

  const vinculados = await prisma.$executeRaw(Prisma.sql`
    WITH clientes_unicos AS (
      SELECT
        LOWER(TRIM(email)) AS email_normalizado,
        MIN(id) AS id
      FROM clientes_web
      WHERE email IS NOT NULL
        AND TRIM(email) <> ''
        AND LOWER(TRIM(email)) NOT LIKE '%@placeholder.local'
      GROUP BY LOWER(TRIM(email))
      HAVING COUNT(*) = 1
    ), clientes_por_email AS (
      SELECT cliente.id, cliente.segmento_crm, unico.email_normalizado
      FROM clientes_unicos unico
      JOIN clientes_web cliente ON cliente.id = unico.id
    )
    UPDATE crm_registros_hubspot AS contacto
    SET cliente_web_id = cliente.id,
        segmento_crm = cliente.segmento_crm,
        segmento_crm_actualizado_at = CASE WHEN contacto.segmento_crm IS DISTINCT FROM cliente.segmento_crm THEN NOW() ELSE contacto.segmento_crm_actualizado_at END,
        segmento_crm_actualizado_por = CASE WHEN contacto.segmento_crm IS DISTINCT FROM cliente.segmento_crm THEN 'Conversión automática a cliente' ELSE contacto.segmento_crm_actualizado_por END,
        vinculo_cliente_origen = 'EMAIL_AUTOMATICO',
        convertido_at = COALESCE(contacto.convertido_at, NOW()),
        updated_at = NOW()
    FROM clientes_por_email AS cliente
    WHERE contacto.object_type_id = '0-1'
      AND contacto.email IS NOT NULL
      ${contactFilter}
      AND LOWER(TRIM(contacto.email)) = cliente.email_normalizado
      AND (contacto.cliente_web_id IS NULL OR contacto.vinculo_cliente_origen = 'EMAIL_AUTOMATICO')
      AND (
        contacto.cliente_web_id IS DISTINCT FROM cliente.id
        OR contacto.segmento_crm IS DISTINCT FROM cliente.segmento_crm
        OR contacto.vinculo_cliente_origen IS DISTINCT FROM 'EMAIL_AUTOMATICO'
        OR contacto.convertido_at IS NULL
      )
  `)

  return Number(desvinculados) + Number(vinculados)
}
