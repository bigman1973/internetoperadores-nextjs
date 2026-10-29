import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import test from 'node:test'
import {readParaPedirProjection} from '../lib/finanzas/para-pedir-projection-read'
import {classifyPrisma5RawSqlStatement} from '../lib/prisma'

test('Para pedir excluye traspasos propios del conjunto, agrupación y totales sin mutaciones', async () => {
  const captured: Array<{sql:string}> = []
  const fake = {$queryRaw: async (query: {sql:string}) => {captured.push(query);return []}}
  await assert.rejects(() => readParaPedirProjection({limit:20,offset:0,estado:'TODOS',q:'',tercero:''},fake as never), /No se pudo leer la foto de Para pedir/)
  assert.equal(captured.length,1)
  assert.match(captured[0].sql,/UPPER\(COALESCE\(p\.grupo,''\)\) NOT IN \('TRASPASOS_PROPIOS','TRASPASOS ENTRE CUENTAS PROPIAS','GASTOS_BANCO','GASTOS DEL BANCO','COMISIONES','NOMINAS','NÓMINAS'\)/)
  assert.equal(classifyPrisma5RawSqlStatement([captured[0]]),'read_only')
  assert.doesNotMatch(captured[0].sql,/\b(?:INSERT|UPDATE|DELETE)\b/)
})
test('Conciliar muestra hora neutra junto a Actualizar y precarga sólo dos DTO privados', () => {
  const workspace=readFileSync(resolve(__dirname,'../components/finanzas/conciliar/ConciliarWorkspace.tsx'),'utf8')
  assert.match(workspace,/data-testid="conciliar-updated-at" className="text-xs text-slate-500/)
  assert.match(workspace,/formatConciliarUpdatedAt\(data\.updatedAt, \{ timeZone: 'Europe\/Madrid' \}\)/)
  assert.doesNotMatch(workspace,/Los resúmenes tienen cambios pendientes|última foto disponible/)
  assert.match(workspace,/data\.rows\.filter\(\(row\) => row\.documento !== null\)\.slice\(0, 2\)/)
  assert.match(workspace,/setTimeout\(\(\) => candidates\.forEach\(prefetchDetail\), 1_500\)/)
  assert.match(workspace,/onClick=\{\(\) => void load\(true\)\}/)
})
