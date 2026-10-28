/* Prueba estática pura: no importa Prisma, handlers, red ni base de datos. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('lib/finanzas/para-pedir-projection-read.ts'), 'utf8');
const reader = source.slice(source.indexOf('export async function readParaPedirProjection'));

assert.equal((reader.match(/client\.\$queryRaw/g) ?? []).length, 1, 'la portada debe resolver página, resumen, grupos y estado con un único viaje SQL');
assert.match(reader, /WITH projection_base AS/);
assert.match(reader, /SELECT DISTINCT ON \(p\.movimiento_id\)/);
assert.match(source, /import \{ projectionRow \} from '\.\/conciliar-projection-read'/);
assert.match(reader, /p\.id AS conciliar_row_id/);
assert.match(reader, /p\.source_fingerprint AS conciliar_source_fingerprint/);
assert.match(source, /function conciliarPedir/);
assert.match(source, /currentState !== 'SIN_PEDIR' \|\| row\.conciliar_color !== 'ROJO'/);
assert.match(source, /return \{ rowId: projected\.id, decisionHash: projected\.decisionHash \}/);
assert.match(reader, /p\.tab IN \('COBROS','PAGOS'\)/);
assert.match(reader, /JOIN movimientos_bancarios m ON m\.id=p\.movimiento_id/);
assert.match(reader, /NULLIF\(btrim\(m\.tercero\),''\)/);
assert.match(reader, /estado_justificacion_movimientos e/);
assert.match(reader, /e\.estado::text<>'SIN_DOCUMENTO'/);
assert.match(reader, /pedido_audit AS/);
assert.match(reader, /snapshot_resultado->>'estado'='PEDIDO'/);
assert.match(reader, /a\.created_at::date AS pedido_dia/);
assert.match(reader, /u\.nombre AS actor_nombre/);
assert.match(reader, /PEDIDO_SIN_AUDITORIA/);
assert.match(reader, /GROUP BY grupo_tercero/);
assert.match(reader, /CURRENT_DATE-15/);
assert.match(reader, /LIMIT \$\{input\.limit\} OFFSET \$\{input\.offset\}/);
assert.doesNotMatch(reader, /readEasyReconciliation|candidatesForMovement|rebuildConciliarProjection|\b(?:INSERT|UPDATE|DELETE)\b|fetch\(/i, 'el lector no recalcula, no crea candidatos ni muta');

console.log(JSON.stringify({ test: 'para-pedir-projection-read-static', databaseQueries: 0, networkCalls: 0, verified: ['single-read-roundtrip', 'sql-grouping', 'b5-audit-only', 'no-get-rebuild', 'no-suggestion-n-plus-one'] }));
