import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8')
test('los enlaces conservan tab/q validados por servidor sin aceptar importes',()=>{
 const page=read('app/admin/finanzas/conciliar/page.tsx')
 const ui=read('components/finanzas/conciliar/ConciliarWorkspace.tsx')
 const search=read('components/finanzas/conciliar/conciliar-global-search.ts')
 assert.match(page,/typeof query\.q === 'string'/)
 assert.match(page,/query\.q\.trim\(\)\.slice\(0, 120\)/)
 assert.match(page,/query\.tab === 'PAGOS'/)
 assert.match(page,/initialTab=\{initialTab\}/)
 assert.match(page,/const requestedOrden = query\.orden === 'FECHA'/)
 assert.match(page,/const requestedDireccion = query\.direccion === 'ASC'/)
 assert.match(page,/initialOrden=\{initialOrden\} initialDireccion=\{initialDireccion\} initialGlobalOrder=\{initialGlobalOrder\}/)
 assert.match(ui,/useConciliarGlobalSearch\(\{ initialTab, initialQuery, initialOffset: 0, initialData: initialParsed, read: readGlobal \}\)/)
 assert.match(search,/view: \{ tab: initialTab, query: normalizeConciliarSearchQuery\(initialQuery\), offset: normalizeOffset\(initialOffset\) \}/)
 assert.match(search,/return nextState\(state, \{ tab: action\.tab, query: state\.view\.query, offset: 0 \}, 'loading', 'replace'\)/)
 assert.match(search,/url\.searchParams\.set\('tab', view\.tab\)/)
 assert.match(search,/if \(view\.query\) url\.searchParams\.set\('q', view\.query\)/)
 assert.doesNotMatch(ui,/useState<ConciliarTab>\(initialTab\)/)
})
test('el lector mantiene céntimos enteros y no importa motores pesados de mutación',()=>{
 const reader=read('lib/finanzas/conciliar-projection-read.ts')
 const route=read('app/api/admin/finanzas/conciliar/route.ts')
 assert.match(reader,/COALESCE\(SUM\((?:p\.)?pendiente_centimos::bigint\),0\)::text AS amount/)
 assert.doesNotMatch(reader,/from ['"][^'"]*conciliar-(actions|db|confirming)['"]/) 
 assert.doesNotMatch(route,/^import .*from ['"][^'"]*conciliar-(actions|db|refresh)['"]/m)
 assert.match(route,/await import\('@\/lib\/finanzas\/conciliar-actions'\)/)
})
