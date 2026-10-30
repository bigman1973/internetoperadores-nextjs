/* Filtro Para pedir y UI neutral: sin BD, red, DML, build ni TSC. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { readParaPedirProjection } from '../lib/finanzas/para-pedir-projection-read'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'

test('Para pedir excluye sólo las dos grafías de traspasos propios sin mutaciones ni falsos positivos de otras clases', async () => {
  const captured: Array<{ sql: string }> = []
  const fake = { $queryRaw: async (query: { sql: string }) => { captured.push(query); return [] } }
  await assert.rejects(
    () => readParaPedirProjection({ limit: 20, offset: 0, estado: 'TODOS', q: '', tercero: '' }, fake as never),
    /No se pudo leer la foto de Para pedir/,
  )
  assert.equal(captured.length, 1)
  const sql = captured[0]!.sql
  assert.match(sql, /UPPER\(COALESCE\(p\.grupo,''\)\) NOT IN \('TRASPASOS_PROPIOS','TRASPASOS ENTRE CUENTAS PROPIAS','GASTOS_BANCO','GASTOS DEL BANCO','COMISIONES','NOMINAS','NÓMINAS'\)/)
  assert.equal(classifyPrisma5RawSqlStatement([captured[0] as never]), 'read_only')
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i)
})

test('Conciliar muestra timestamp neutral junto a Actualizar y retira sólo el texto stale', () => {
  const workspace = readFileSync(resolve(__dirname, '../components/finanzas/conciliar/ConciliarWorkspace.tsx'), 'utf8')
  const detail = readFileSync(resolve(__dirname, '../components/finanzas/conciliar/conciliar-detail-client.ts'), 'utf8')
  assert.match(workspace, /data-testid="conciliar-updated-at" className="text-xs text-slate-500/)
  assert.match(workspace, /formatConciliarUpdatedAt\(data\.updatedAt, \{ timeZone: 'Europe\/Madrid' \}\)/)
  assert.doesNotMatch(workspace, /Los resúmenes tienen cambios pendientes de actualizar/)
  assert.match(detail, /Cifras sin fecha de actualización verificable\./)
  assert.match(detail, /return `Cifras actualizadas a las \$\{time\}`/)
})

console.log('OK: Para pedir excluye sólo traspasos propios y la interfaz muestra fecha neutral sin cola confirming ni aviso stale.')
