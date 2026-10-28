import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readCollectionClientIdentityProfiles, collectionClientIdentityMatches, movementPartyAliases } from '../lib/finanzas/conciliar-db'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
async function main() {
  const captured: unknown[] = []
  const id = '10000000-0000-4000-8000-000000000001'
  const tx = { $queryRaw: async (sql: unknown) => {
    captured.push(sql)
    return captured.length === 1 ? [{proposalId:id,movimientoId:'movement-test',compositionCount:1,compositionInvoiceIdCount:1,invoiceCount:1,distinctInvoiceCount:1,invoiceCifs:['B12345678'],invoiceNames:['Cliente Prueba S.L.'],entityCif:null,entityType:null,entityActive:null,entityLegalName:null,entityCommercialName:null,entityBoundToMovement:false}]
      : [{cif:'B12345678',legal:'Cliente Prueba S.L.',commercial:null}]
  } }
  const profiles = await readCollectionClientIdentityProfiles(tx as never,[id])
  assert.equal(captured.length,2)
  for (const sql of captured) assert.equal(classifyPrisma5RawSqlStatement([sql]),'read_only','sólo funciones de lectura ya autorizadas')
  assert.equal(collectionClientIdentityMatches(profiles?.get(id),['Cliente Prueba S.L.']),true)
  assert.equal(collectionClientIdentityMatches(profiles?.get(id),['Otro Cliente']),false)
  const actions = readFileSync('lib/finanzas/conciliar-actions.ts','utf8')
  const helper = actions.slice(actions.indexOf('async function confirmCollectionProposal('),actions.indexOf('async function confirmConfirming('))
  assert.ok(helper.includes('await assertLiveCollectionProjectionForActionTx(tx,row)'))
  assert.ok(helper.indexOf('await assertLiveCollectionProjectionForActionTx') < helper.indexOf('const selection ='))
  assert.deepEqual(movementPartyAliases({importeCentimos:100,terceroConfirmado:'Cliente Prueba · Cliente registrado · NIF/CIF B•••78'}),['Cliente Prueba'])
  assert.deepEqual(movementPartyAliases({importeCentimos:100,tercero:'Texto banco · dato'}),['Texto banco · dato'])
  console.log(JSON.stringify({ok:true,realParameterizedQueries:captured.length,databaseQueries:0,networkCalls:0,liveRevalidationBeforeConfirmation:true}))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
