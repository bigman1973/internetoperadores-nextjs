import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8')
test('los enlaces conservan tab/q validados por servidor sin aceptar importes',()=>{
 const page=read('app/admin/finanzas/conciliar/page.tsx')
 const ui=read('components/finanzas/conciliar/ConciliarWorkspace.tsx')
 assert.match(page,/typeof query\.q === 'string'/)
 assert.match(page,/query\.q\.trim\(\)\.slice\(0, 120\)/)
 assert.match(page,/query\.tab === 'PAGOS'/)
 assert.match(page,/initialTab=\{initialTab\}/)
 assert.match(ui,/useState<ConciliarTab>\(initialTab\)/)
 assert.match(ui,/useState\(initialQuery\)/)
})
test('el lector mantiene céntimos enteros y no importa motores pesados de mutación',()=>{
 const reader=read('lib/finanzas/conciliar-projection-read.ts')
 const route=read('app/api/admin/finanzas/conciliar/route.ts')
 assert.match(reader,/COALESCE\(SUM\(p\.pendiente_centimos::bigint\),0\)::text AS amount/)
 assert.doesNotMatch(reader,/from ['"][^'"]*conciliar-(actions|db|confirming)['"]/) 
 assert.doesNotMatch(route,/^import .*from ['"][^'"]*conciliar-(actions|db|refresh)['"]/m)
 assert.match(route,/await import\('@\/lib\/finanzas\/conciliar-actions'\)/)
})
