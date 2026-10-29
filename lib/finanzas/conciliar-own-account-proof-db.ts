import { Prisma } from '@prisma/client'
import {
  CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE,
  manualOwnAccountProof,
  type ConciliarManualOwnAccountProof,
} from './conciliar-own-account-proof-core'

type ReadClient = Readonly<{ $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T> }>

export type ConciliarManualOwnAccountProofRead = Readonly<{
  tableAvailable: boolean
  proof: ConciliarManualOwnAccountProof
}>

type DeclarationRow = Readonly<{
  accountId: string
  version: number | bigint
  state: string
  confirmationDeclared: boolean
  sameVersionCount: number | bigint
}>

const ACCOUNT_ID = /^[A-Za-z0-9:_-]{1,160}$/

/**
 * Reads the latest human declaration from the pre-existing audited table.
 * It is deliberately a review-only reader: it neither reads auto-policy tables
 * nor changes the stricter historical automatic-transfer route.
 */
export async function readManualOwnAccountProofTx(
  tx: ReadClient,
  rawAccountIds: readonly string[],
): Promise<ConciliarManualOwnAccountProofRead> {
  const accountIds = [...new Set(rawAccountIds.filter((id): id is string => typeof id === 'string' && ACCOUNT_ID.test(id)))].sort()
  const empty = { source: CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE, accountIds: new Set<string>() }
  if (!accountIds.length) return { tableAvailable: true, proof: empty }

  const schema = await tx.$queryRaw<Array<{ found: string | null }>>(Prisma.sql`
    SELECT to_regclass('public.declaraciones_titularidad_modo_facil')::text AS found LIMIT 1
  `)
  if (schema.length !== 1 || !schema[0]?.found) return { tableAvailable: false, proof: empty }

  // `sameVersionCount` keeps a corrupted duplicate current declaration from
  // becoming ownership evidence while returning at most one row per account.
  const rows = await tx.$queryRaw<DeclarationRow[]>(Prisma.sql`
    WITH scoped AS (
      SELECT d.cuenta_id,d.version,d.estado::text AS estado,d.confirmacion_declarada
      FROM declaraciones_titularidad_modo_facil d
      JOIN cuentas_bancarias c ON c.id=d.cuenta_id AND c.activa=true
      WHERE d.cuenta_id IN (${Prisma.join(accountIds.map(id => Prisma.sql`${id}`))})
        AND d.fecha_declaracion<=CURRENT_DATE
    ), version_counts AS (
      SELECT cuenta_id,version,COUNT(*)::bigint AS same_version_count
      FROM scoped GROUP BY cuenta_id,version
    ), current_versions AS (
      SELECT cuenta_id,MAX(version) AS version FROM scoped GROUP BY cuenta_id
    )
    SELECT DISTINCT ON (s.cuenta_id)
      s.cuenta_id AS "accountId",s.version,s.estado AS state,
      s.confirmacion_declarada AS "confirmationDeclared",v.same_version_count AS "sameVersionCount"
    FROM scoped s
    JOIN current_versions c ON c.cuenta_id=s.cuenta_id AND c.version=s.version
    JOIN version_counts v ON v.cuenta_id=s.cuenta_id AND v.version=s.version
    ORDER BY s.cuenta_id ASC,s.version DESC
    LIMIT ${accountIds.length}
  `)

  return {
    tableAvailable: true,
    proof: manualOwnAccountProof(rows.map(row => ({
      accountId: row.accountId,
      version: Number(row.version),
      state: row.state === 'DECLARADA' || row.state === 'REVOCADA' ? row.state : 'REVOCADA',
      confirmationDeclared: row.confirmationDeclared === true,
      sameVersionCount: Number(row.sameVersionCount),
    }))),
  }
}
