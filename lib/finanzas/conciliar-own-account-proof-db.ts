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

type AttestedAccountRow = Readonly<{
  accountId: string
}>

const ACCOUNT_ID = /^[A-Za-z0-9:_-]{1,160}$/

/**
 * Reads ownership for the review-only Conciliar path. A current, revocable
 * human declaration wins whenever that ledger exists. Older staging data has
 * only the pre-existing append-only human account attestation; it is admitted
 * solely when the revocable ledger is absent, with an active policy in the
 * current environment and the original explicit confirmation intact.
 *
 * This reader never writes and is deliberately separate from the historical
 * automatic-transfer reader: consuming its result cannot authorize B4.
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
  const tableAvailable = schema.length === 1 && !!schema[0]?.found
  // `sameVersionCount` keeps a corrupted duplicate current declaration from
  // becoming ownership evidence while returning at most one row per account.
  const declarations = tableAvailable
    ? await tx.$queryRaw<DeclarationRow[]>(Prisma.sql`
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
    : []
  const declarationsProof = manualOwnAccountProof(declarations.map(row => ({
    accountId: row.accountId,
    version: Number(row.version),
    state: row.state === 'DECLARADA' || row.state === 'REVOCADA' ? row.state : 'REVOCADA',
    confirmationDeclared: row.confirmationDeclared === true,
    sameVersionCount: Number(row.sameVersionCount),
  })))

  // The legacy ledger is an append-only, explicit human attestation. It is
  // purposely only read when the revocable declaration ledger is absent: once
  // deployed, an absent, revoked or malformed current declaration fails closed.
  const legacyFallbackAccountIds = tableAvailable ? [] : accountIds
  const attestations = legacyFallbackAccountIds.length
    ? await tx.$queryRaw<AttestedAccountRow[]>(Prisma.sql`
      SELECT DISTINCT a.cuenta_id AS "accountId"
      FROM atestaciones_cuenta_auto_modo_facil a
      JOIN politicas_auto_modo_facil p ON p.id=a.politica_id
        AND p.estado='ACTIVA'
        AND p.entorno=CASE WHEN current_database()='io_staging_finanzas' THEN 'STAGING' ELSE 'PRODUCTION' END
      JOIN cuentas_bancarias c ON c.id=a.cuenta_id AND c.activa=true
      WHERE a.confirmacion_titularidad_io=true
        AND a.snapshot->>'schema'='EASY_AUTO_ACCOUNT_ATTESTATION_V1'
        AND a.snapshot->>'origen'='REGLA'
        AND a.cuenta_id IN (${Prisma.join(legacyFallbackAccountIds.map(id => Prisma.sql`${id}`))})
      ORDER BY a.cuenta_id ASC
      LIMIT ${legacyFallbackAccountIds.length}
    `)
    : []
  const accountIdsFromExistingAttestations = attestations.flatMap(row => typeof row.accountId === 'string' && legacyFallbackAccountIds.includes(row.accountId) ? [row.accountId] : [])
  return {
    tableAvailable,
    proof: {
      source: CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE,
      accountIds: new Set([...declarationsProof.accountIds, ...accountIdsFromExistingAttestations]),
    },
  }
}
