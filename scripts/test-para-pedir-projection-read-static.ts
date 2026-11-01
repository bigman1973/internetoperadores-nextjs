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
assert.match(reader, /p\.read_metadata/);
assert.match(reader, /b\.read_metadata->>'gestion_estado'/);
assert.match(reader, /b\.read_metadata->>'pedido_fecha'/);
assert.match(reader, /b\.read_metadata->>'actor_visible'/);
assert.match(reader, /COALESCE\(NULLIF\(btrim\(p\.documento->>'tercero'\),''\),NULLIF\(btrim\(p\.read_metadata->>'tercero'\),''\)\)/);
assert.doesNotMatch(reader, /JOIN movimientos_bancarios|estado_justificacion_movimientos|pedido_audit|snapshot_resultado/);
assert.match(reader, /PEDIDO_SIN_AUDITORIA/);
assert.match(reader, /GROUP BY grupo_tercero/);
assert.match(reader, /CURRENT_DATE-15/);
assert.match(reader, /estado_pedido='SIN_PEDIR'.*AS faltan_pedir/);
assert.match(reader, /estado_pedido='PEDIDO'.*AS pedidos/);
assert.match(reader, /estado_pedido='PEDIDO_SIN_AUDITORIA'.*AS pedidos_sin_auditoria/);
assert.match(reader, /estado_pedido='RECIBIDO'.*AS recibidos/);
assert.match(reader, /faltanPedir: integer\(row\.faltan_pedir/);
assert.match(reader, /pedidosSinAuditoria: integer\(row\.pedidos_sin_auditoria/);
assert.match(reader, /recibidos: integer\(row\.recibidos/);
assert.match(reader, /LIMIT \$\{input\.limit\} OFFSET \$\{input\.offset\}/);
assert.doesNotMatch(reader, /readEasyReconciliation|candidatesForMovement|rebuildConciliarProjection|\b(?:INSERT|UPDATE|DELETE)\b|fetch\(/i, 'el lector no recalcula, no crea candidatos ni muta');

console.log(JSON.stringify({ test: 'para-pedir-projection-read-static', databaseQueries: 0, networkCalls: 0, verified: ['single-read-roundtrip', 'sql-grouping', 'b5-audit-only', 'no-get-rebuild', 'no-suggestion-n-plus-one'] }));
