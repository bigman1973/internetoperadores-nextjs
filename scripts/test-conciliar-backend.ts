/*
 * Pruebas puras/estáticas de Conciliar. Las referencias son fixtures sintéticas:
 * no cargan rutas Next, Prisma, BD, Graph ni secretos privados.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  ConciliarValidationError,
  parseConciliarCommand,
  parseConciliarGetInput,
} from '../lib/finanzas/conciliar-contract'
import { conciliarHash } from '../lib/finanzas/conciliar-core'
import { archivoRecibidaControlado, bibliotecaFinancieraConfigurada } from '../lib/finanzas/archivo-fuente-controlada'

function throwsValidation(run: () => unknown, status: number, code = 'VALIDATION_ERROR') {
  assert.throws(run, (error: unknown) => error instanceof ConciliarValidationError && error.status === status && error.code === code)
}
function withEnvironment<T>(values: Record<string, string | undefined>, run: () => T): T {
  const old = new Map(Object.keys(values).map(key => [key, process.env[key]]))
  try {
    for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key] = value
    return run()
  } finally {
    for (const [key, value] of old) value === undefined ? delete process.env[key] : process.env[key] = value
  }
}

test('fixture sintética: GET conserva filtros acotados, fecha exacta y paginación', () => {
  const actual = parseConciliarGetInput({ tab: 'PAGOS', desde: '2026-10-01', hasta: '2026-10-31', cuentaId: 'cuenta-sintetica-01', q: 'Factura sintética', limit: '100', offset: '0' })
  assert.deepEqual(actual, { tab: 'PAGOS', desde: '2026-10-01', hasta: '2026-10-31', cuentaId: 'cuenta-sintetica-01', q: 'Factura sintética', cutoffDate: '2026-01-01', historic: false, limit: 100, offset: 0 })
  throwsValidation(() => parseConciliarGetInput({ tab: 'PAGOS', extra: 'origen-cliente' }), 400)
  throwsValidation(() => parseConciliarGetInput({ desde: '2026-02-30' }), 400)
  throwsValidation(() => parseConciliarGetInput({ limit: '101' }), 400)
  throwsValidation(() => parseConciliarGetInput({ cutoffDate: '2026-02-30' }), 400)
  throwsValidation(() => parseConciliarGetInput({ tab: 'PAGOS', historic: '1' }), 400)
  throwsValidation(() => parseConciliarGetInput({ tab: 'EMITIDAS', historic: 'yes' }), 400)
  assert.equal(parseConciliarGetInput({ tab: 'EMITIDAS', historic: '1', cutoffDate: '2026-02-01' }).historic, true)
})

test('fixture sintética: los grupos de Emitidas son filtros cerrados de la cola activa', () => {
  const selected = parseConciliarGetInput({ tab: 'EMITIDAS', emitidasGrupo: 'CON_PROPUESTA', desde: '2026-10-01', hasta: '2026-10-31', cuentaId: 'cuenta-sintetica-01', q: 'Factura sintética', cutoffDate: '2026-02-01', limit: '50', offset: '100' })
  assert.deepEqual(selected, { tab: 'EMITIDAS', emitidasGrupo: 'CON_PROPUESTA', desde: '2026-10-01', hasta: '2026-10-31', cuentaId: 'cuenta-sintetica-01', q: 'Factura sintética', cutoffDate: '2026-02-01', historic: false, limit: 50, offset: 100 })
  assert.equal(parseConciliarGetInput({ tab: 'EMITIDAS', emitidasGrupo: 'PARA_REVISAR' }).emitidasGrupo, 'PARA_REVISAR')
  assert.equal(parseConciliarGetInput({ tab: 'EMITIDAS', emitidasGrupo: 'SIN_PROPUESTA' }).emitidasGrupo, 'SIN_PROPUESTA')
  assert.equal(parseConciliarGetInput({ tab: 'EMITIDAS', emitidasGrupo: '' }).emitidasGrupo, undefined)
  throwsValidation(() => parseConciliarGetInput({ tab: 'EMITIDAS', emitidasGrupo: 'para_revisar' }), 400)
  throwsValidation(() => parseConciliarGetInput({ tab: 'COBROS', emitidasGrupo: 'CON_PROPUESTA' }), 400)
  throwsValidation(() => parseConciliarGetInput({ tab: 'PAGOS', emitidasGrupo: 'PARA_REVISAR' }), 400)
  throwsValidation(() => parseConciliarGetInput({ tab: 'RECIBIDAS', emitidasGrupo: 'SIN_PROPUESTA' }), 400)
  throwsValidation(() => parseConciliarGetInput({ tab: 'EMITIDAS', historic: '1', emitidasGrupo: 'CON_PROPUESTA' }), 400)
})

test('fixture sintética: POST confirmar usa sólo identidad opaca y hash de decisión', () => {
  const a = 'a'.repeat(64), b = 'b'.repeat(64)
  const parsed = parseConciliarCommand({
    action: 'confirmar', idempotencyKey: '11111111-1111-4111-8111-111111111111',
    items: [{ id: 'fila-sintetica-b', decisionHash: b }, { id: 'fila-sintetica-a', decisionHash: a }],
  })
  assert.equal(parsed.action, 'confirmar')
  if (parsed.action !== 'confirmar') throw new Error('fixture no confirmado')
  assert.deepEqual(parsed.items.map(item => item.id), ['fila-sintetica-a', 'fila-sintetica-b'])
  throwsValidation(() => parseConciliarCommand({ action: 'confirmar', idempotencyKey: '11111111-1111-4111-8111-111111111111', items: [{ id: 'fila-sintetica-a', decisionHash: a, importeCentimos: 1 }] }), 400)
  throwsValidation(() => parseConciliarCommand({ action: 'pedir', id: 'fila-sintetica-roja', decisionHash: a, idempotencyKey: 'not-a-uuid', movimientoId: 'nunca-aceptado' }), 400)
})

test('fixture sintética: una factura recibida sólo permite locator de biblioteca controlada', () => {
  withEnvironment({ SHAREPOINT_DRIVE_ID: 'drive-fixture-001', DRIVE_ID: undefined }, () => {
    assert.equal(bibliotecaFinancieraConfigurada(), 'drive-fixture-001')
    assert.deepEqual(archivoRecibidaControlado({
      oneDriveDriveId: null, oneDriveItemId: 'item-fixture-001',
      archivoOneDrive: '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026/factura-sintetica.pdf',
    }), { driveId: 'drive-fixture-001', itemId: 'item-fixture-001' })
    assert.equal(archivoRecibidaControlado({ oneDriveItemId: 'item-fixture-001', archivoOneDrive: 'https://example.test/factura.pdf' }), null)
    assert.equal(archivoRecibidaControlado({ oneDriveItemId: 'item-fixture-001', archivoOneDrive: '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/../fuera.pdf' }), null)
  })
})

test('estático: las rutas no exponen nóminas genéricas ni URL/drive/item del navegador', () => {
  const root = process.cwd()
  const main = readFileSync(resolve(root, 'app/api/admin/finanzas/conciliar/route.ts'), 'utf8')
  const archive = readFileSync(resolve(root, 'app/api/admin/finanzas/conciliar/archivo/[id]/route.ts'), 'utf8')
  const history = readFileSync(resolve(root, 'app/api/admin/finanzas/conciliar/historial/route.ts'), 'utf8')
  const db = readFileSync(resolve(root, 'lib/finanzas/conciliar-db.ts'), 'utf8')
  for (const source of [main, archive, history]) {
    assert.match(source, /assertPrototypeStaging/)
    assert.match(source, /requireB4FinanceAccess/)
    assert.match(source, /Método no permitido/)
  }
  assert.match(main, /sameOrigin\(request\)/)
  assert.match(main, /readJsonLimited\(request, MAX_JSON_BYTES\)/)
  assert.match(main, /rowId debe ser la única consulta de detalle/)
  assert.match(archive, /resolveConciliarProjectionFile/)
  assert.match(archive, /descargarGraphPrivadoAcotado/)
  assert.match(archive, /isPdf/)
  assert.doesNotMatch(archive, /api\/admin\/nominas\/download/)
  assert.doesNotMatch(archive, /request\.nextUrl\.searchParams\.get\(['"](?:url|driveId|itemId)/)
  assert.match(db, /driveItemDesdeArchivoUrlNominaControlada/)
  assert.match(db, /bibliotecaFinancieraConfigurada/)
})

test('estático: el rebuild ensaya con rollback y sólo aplica tras --apply', () => {
  const source = readFileSync(resolve(process.cwd(), 'scripts/rebuild-conciliar-staging.ts'), 'utf8')
  assert.match(source, /staging-private\.env/)
  assert.match(source, /DryRunRollback/)
  assert.match(source, /rebuildConciliarProjectionTx\(tx, null\)/)
  assert.match(source, /argv\.includes\('--apply'\)/)
  assert.match(source, /MAX_REBUILD_ROWS = 25_000/)
  assert.doesNotMatch(source, /descargarGraphPrivadoAcotado|fetch\(/)
})

console.log('OK: Conciliar backend validado con fixtures sintéticas; sin BD, red ni Graph.')

test('huella: los campos opcionales ausentes coinciden con la serialización JSON', () => {
  assert.equal(conciliarHash({ a: 1, optional: undefined }), conciliarHash({ a: 1 }));
  assert.notEqual(conciliarHash({ a: 1, optional: null }), conciliarHash({ a: 1 }));
  assert.throws(() => conciliarHash([undefined]));
});

test('SQL: SUM(bigint) de PostgreSQL se entrega como texto de céntimos exactos', () => {
  const source=readFileSync(resolve(process.cwd(),'lib/finanzas/conciliar-db.ts'),'utf8');
  assert.match(source,/COALESCE\(SUM\(p\.pendiente_centimos::bigint\),0\)::text AS amount/);
});
