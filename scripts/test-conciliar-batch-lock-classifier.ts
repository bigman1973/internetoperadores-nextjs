import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { classifyPrisma5RawSqlStatement } from '../lib/prisma';

function vector(size: number) {
  return Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(v.movimiento_id,0))::text AS locked FROM (VALUES ${Prisma.join(Array.from({ length: size }, (_, i) => Prisma.sql`(CAST(${'fixture-' + i} AS text))`))}) AS v(movimiento_id) ORDER BY v.movimiento_id ASC`;
}
for (const size of [1, 20, 100]) assert.equal(classifyPrisma5RawSqlStatement([vector(size)]), 'advisory_lock');
assert.equal(classifyPrisma5RawSqlStatement([vector(101)]), 'unknown');
const base = vector(2).text;
const unsafe = [
  base.replace(' ASC', ' DESC'),
  base.replace('pg_advisory_xact_lock', 'pg_advisory_lock'),
  base.replace('pg_advisory_xact_lock', 'pg_catalog.pg_advisory_xact_lock'),
  base.replace('hashtextextended', 'unreviewed_function'),
  base.replace('$1', "'literal'"),
  base + '; DELETE FROM movimientos_bancarios',
  base + ' LIMIT 20',
  base.replace('v.movimiento_id,0', 'v.movimiento_id,1'),
];
for (const sql of unsafe) assert.equal(classifyPrisma5RawSqlStatement([Prisma.raw(sql)]), 'unknown', 'The new grammar must not accept any other shape.');
const injectedValue = Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(v.movimiento_id,0))::text AS locked FROM (VALUES (CAST(${"fixture'); SELECT pg_sleep(99);--"} AS text))) AS v(movimiento_id) ORDER BY v.movimiento_id ASC`;
assert.equal(classifyPrisma5RawSqlStatement([injectedValue]), 'advisory_lock', 'Untrusted text stays a bound value, never a SQL token.');
console.log(JSON.stringify({ ok: true, boundVectorSizes: [1, 20, 100], forbiddenVariantsRejected: unsafe.length + 1, noGenericSqlAllowance: true, databaseQueries: 0 }));
