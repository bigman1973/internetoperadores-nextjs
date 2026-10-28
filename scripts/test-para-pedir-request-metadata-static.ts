/* Prueba estática pura: protege el contrato bulk B5 sin BD, red ni navegador. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('lib/finanzas/para-pedir-request-metadata.ts'), 'utf8');
const helper = source.slice(source.indexOf('export async function readParaPedirRequestMetadataTx'));

assert.equal((helper.match(/\$queryRaw/g) ?? []).length, 1, 'los metadatos B5 se resuelven en una única consulta bulk');
assert.match(helper, /ids\.length > MAX_METADATA_MOVEMENTS/);
assert.match(source, /const MAX_METADATA_MOVEMENTS = 100/);
assert.match(helper, /ultimo_pedido_auditado AS/);
assert.match(helper, /snapshot_resultado->>'estado'='PEDIDO'/);
assert.match(helper, /a\.created_at::date::text AS pedido_fecha/);
assert.match(helper, /LEFT JOIN usuarios_admin u ON u\.id=a\.actor_id/);
assert.match(helper, /adjuntos_actuales AS/);
assert.match(helper, /a\.estado::text='UPLOAD_COMPLETO'/);
assert.match(helper, /a\.tipo_documento='TICKET'/);
assert.match(helper, /a\.gasto_id IS NOT NULL AND a\.documento_conciliable_id IS NOT NULL/);
assert.match(helper, /requiereRevisionConfirmacion: true/);
assert.match(helper, /vinculadoAutomaticamente: false/);
assert.doesNotMatch(helper, /INSERT|UPDATE|DELETE|fetch\(|confirmarB4|createDocumento/i, 'el DTO no sube, vincula ni confirma B4');

console.log(JSON.stringify({ test: 'para-pedir-request-metadata-static', databaseQueries: 0, networkCalls: 0, verified: ['one-bulk-query', 'b5-real-audit', 'support-is-review-only', 'no-auto-b4'] }));
