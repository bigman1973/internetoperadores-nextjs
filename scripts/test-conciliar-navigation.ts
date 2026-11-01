import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { createConciliarSearchMachineState, readConciliarSearchHistory } from '../components/finanzas/conciliar/conciliar-global-search'
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8')
test('los enlaces conservan tab/q validados por servidor sin aceptar importes',()=>{
 const page=read('app/admin/finanzas/conciliar/page.tsx')
 const ui=read('components/finanzas/conciliar/ConciliarWorkspace.tsx')
 assert.match(page,/typeof query\.q === 'string'/)
 assert.match(page,/query\.q\.trim\(\)\.slice\(0, 120\)/)
 assert.match(page,/query\.tab === 'PAGOS'/)
 assert.match(page,/initialTab=\{initialTab\}/)
 assert.match(page,/const requestedOrden = query\.orden === 'FECHA'/)
 assert.match(page,/const requestedDireccion = query\.direccion === 'ASC'/)
 assert.match(page,/initialOrden=\{initialOrden\} initialDireccion=\{initialDireccion\} initialGlobalOrder=\{initialGlobalOrder\}/)
 assert.match(ui,/import \{ useConciliarGlobalSearch \} from '\.\/conciliar-global-search';/)
 assert.match(ui,/useConciliarGlobalSearch\(\{ initialTab, initialQuery, initialOffset: 0, initialData: initialParsed, read: readGlobal, cache: searchCache \}\)/)
 assert.match(ui,/const \{ tab, query, queryBox, offset, data \} = search;/)
 assert.doesNotMatch(page,/query\.(?:importe|amount|importeCentimos)\b/)
 const initial=createConciliarSearchMachineState('COBROS','  factura  ',0,true)
 assert.deepEqual(initial.view,{tab:'COBROS',query:'factura',offset:0})
 assert.deepEqual(readConciliarSearchHistory('?tab=PAGOS&q=%20factura%20&offset=20&importe=999',initial.view),{tab:'PAGOS',query:'factura',offset:20})
 assert.deepEqual(readConciliarSearchHistory('?tab=INYECTADA&q=segura&offset=-1&importe=999',initial.view),{tab:'COBROS',query:'segura',offset:0})
})
test('el lector mantiene céntimos enteros y no importa motores pesados de mutación',()=>{
 const reader=read('lib/finanzas/conciliar-projection-read.ts')
 const route=read('app/api/admin/finanzas/conciliar/route.ts')
 assert.match(reader,/COALESCE\(SUM\((?:p\.)?pendiente_centimos::bigint\),0\)::text AS amount/)
 assert.doesNotMatch(reader,/from ['"][^'"]*conciliar-(actions|db|confirming)['"]/) 
 assert.doesNotMatch(route,/^import .*from ['"][^'"]*conciliar-(actions|db|refresh)['"]/m)
 assert.match(route,/await import\('@\/lib\/finanzas\/conciliar-actions'\)/)
})
