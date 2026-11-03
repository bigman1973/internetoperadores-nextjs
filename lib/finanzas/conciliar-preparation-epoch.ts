import { Prisma } from '@prisma/client'
import { preparationHash } from './conciliar-preparation-core'
import type { Prisma as PrismaTypes } from '@prisma/client'

/** Deliberately over-inclusive: every public ordinary/partitioned source table,
 * including policy, payroll files, historical confirming evidence and receipts.
 * Exclude only this derived read side and nonfinancial Conciliar operation log.
 * No financial contents leave SQL; table digests are NOT action authority. */
export const PREPARATION_EPOCH_EXCLUDED_TABLES = [
  'conciliar_proyecciones', 'estado_proyeccion_conciliar', 'area3_conciliar_projection_changes',
  'operaciones_conciliar', 'patas_operacion_conciliar', '_prisma_migrations',
] as const
export async function readConciliarPreparationSourceEpochTx(tx: PrismaTypes.TransactionClient): Promise<string> {
  const tables = await tx.$queryRaw<Array<{ name: string; oid: string; shape: string }>>(Prisma.sql`
    SELECT c.relname AS name,c.oid::text AS oid,
      COALESCE((SELECT string_agg(a.attname||':'||a.atttypid::text||':'||a.atttypmod::text||':'||a.attnotnull::text,',' ORDER BY a.attnum)
        FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'') AS shape
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND c.relname NOT IN (${Prisma.join([...PREPARATION_EPOCH_EXCLUDED_TABLES])})
    ORDER BY c.relname LIMIT 1001
  `)
  if (tables.length > 1000 || tables.some(t => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.name))) throw new Error('CONCILIAR_PREPARATION_SOURCE_CATALOG_INVALID')
  // One source-hash statement instead of N network round trips. Every branch
  // reads its own source without row/advisory locks or JSON/source export.
  // Identifiers come only from this transaction's catalog, never checkpoint/CLI.
  // Sorted row digests preserve duplicates and do not assume a primary key.
  const branches = tables.map(table => Prisma.sql`
      SELECT ${table.name}::text AS name,count(*)::text AS count,md5(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),'')) AS digest
      FROM (SELECT md5(to_jsonb(s)::text||':'||s.xmin::text) AS row_hash FROM ${Prisma.raw(`public."${table.name}"`)} s) source_hashes
  `)
  const rows = branches.length ? await tx.$queryRaw<Array<{ name: string; count: string; digest: string }>>(Prisma.sql`
    SELECT name,count,digest FROM (${Prisma.join(branches, ' UNION ALL ')}) hashes ORDER BY name COLLATE "C" LIMIT 1001
  `) : []
  const byName = new Map(rows.map(row => [row.name, row]))
  if (rows.length !== tables.length || byName.size !== tables.length
    || rows.some(row => !/^\d+$/.test(row.count) || !/^[a-f0-9]{32}$/.test(row.digest))) throw new Error('CONCILIAR_PREPARATION_SOURCE_EPOCH_INVALID')
  const hashes = tables.map(table => ({ ...table, ...byName.get(table.name)! }))
  return preparationHash({ tables: hashes, controlledDrive: process.env.SHAREPOINT_DRIVE_ID ?? null, driveAlias: process.env.DRIVE_ID ?? null })
}
