#!/usr/bin/env npx tsx
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import fs from 'node:fs'
import { EasyCollectionsServiceError, throwEmbeddedEasyCollectionsError } from '../lib/finanzas/easy-collections-db'
import { B4ServiceError } from '../lib/finanzas/reconciliation-db'
const error = (code:string)=>new Prisma.PrismaClientKnownRequestError('fixture no data',{code,clientVersion:'5'})
const p2034=error('P2034')
assert.throws(()=>throwEmbeddedEasyCollectionsError(p2034,true),e=>e===p2034)
assert.throws(()=>throwEmbeddedEasyCollectionsError(p2034,false),e=>e instanceof EasyCollectionsServiceError && e.code==='SELECCION_CAMBIADA')
for(const e of [new EasyCollectionsServiceError(409,'SELECCION_CAMBIADA','fixture'),new B4ServiceError(409,'VERSION_CONFLICT','fixture'),error('P2028'),new Error('uncertain')]) {
 assert.throws(()=>throwEmbeddedEasyCollectionsError(e,true),observed=>observed===e)
}
assert.throws(()=>throwEmbeddedEasyCollectionsError({code:'P2034'},true),e=>e instanceof EasyCollectionsServiceError && e.code==='SELECCION_CAMBIADA')
const s=fs.readFileSync('lib/finanzas/easy-collections-db.ts','utf8')
assert.match(s,/runEasyCollectionsActionTx[\s\S]*?await assertFinanceEasyRuntime\(tx\)/)
assert.equal((fs.readFileSync('lib/finanzas/conciliar-actions.ts','utf8').match(/preserveSerializableP2034: true/g)||[]).length,2)
console.log('PASS: sólo Prisma P2034 crudo llega al retry exterior; negocio/P2028 inciertos no se reintentan; identidad por TransactionClient; opt-in interno exclusivo de Conciliar.')
