import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
const root=new URL('../',import.meta.url)
const text=(path:string)=>readFileSync(new URL(path,root),'utf8')
test('private remesa preview derives selection exclusively from rowId and uses effective access',()=>{
 const source=text('app/api/admin/finanzas/conciliar/remesa-preview/route.ts')
 assert.match(source,/assertConciliarRuntime\(\)/)
 assert.match(source,/requireB4FinanceAccess\('lectura', await getServerSession\(authOptions\)\)/)
 assert.match(source,/entries\.length !== 1/)
 assert.match(source,/source\.proposalCompositionHash/)
 assert.match(source,/detail\.remesaDetalle\.compositionHash !== source\.proposalCompositionHash/)
 assert.match(source,/return privateJson\(\{ preview: detail \}\)/)
 assert.doesNotMatch(source,/confirmarB4|\$executeRaw|\.create\(|\.update\(|rebuildConciliarProjection|fetch\(/)
})
test('projection seals complete remittance composition and confirmation revalidates that seal',()=>{
 const projection=text('lib/finanzas/conciliar-db.ts'),reader=text('lib/finanzas/conciliar-projection-read.ts'),actions=text('lib/finanzas/conciliar-actions.ts')
 assert.match(projection,/remittanceSealForProposal/)
 assert.match(projection,/proposalCompositionHash: remesaSeal\.compositionHash/)
 assert.match(reader,/proposalCompositionHash: row\.proposalCompositionHash/)
 assert.match(actions,/expectedCompositionHash: receiptSource\.compositionHash/)
 assert.match(actions,/confirmarReciboRemesaCompuestaTx/)
})
test('database receipt cannot accept later lines or duplicate direct confirmation',()=>{
 const sql=text('prisma/migrations/20261027_b7_remittance_payment_receipts/migration.sql')
 assert.match(sql,/receipt_tx IS DISTINCT FROM txid_current\(\)/)
 assert.match(sql,/B7_RECIBO_REMESA_APPEND_ONLY/)
 assert.match(sql,/b7_fi_directa_sin_recibo_remesa_ct/)
 assert.match(sql,/DEFERRABLE INITIALLY DEFERRED/)
 assert.doesNotMatch(sql,/UPDATE facturas|DELETE FROM|TRUNCATE TABLE|DROP TABLE/)
})

test('versioned remittance owns a native B4 leg, never a phantom legacy proposal block',()=>{
 const source=text('lib/finanzas/conciliar-actions.ts')
 const branch=source.slice(source.indexOf('if (receiptSource) {'),source.indexOf('const result: any = await runEasyCollectionsActionTx',source.indexOf('if (receiptSource) {')))
 assert.match(branch,/operationB4Id: String\(result\.operationB4Id\)/)
 assert.match(branch,/reciboCobroRemesaB7Id: String\(result\.reciboId\)/)
 assert.doesNotMatch(branch,/proposalBlockId:/)
 assert.match(source,/await requireLiveWrite\(actorId, tx\)/)
 assert.match(source,/await assertConciliarRuntime\(database\)/)
 assert.match(source,/runWithConciliarSerializableAuthorization\(tx, \(\) => runConciliarTransactionCommand\(tx, actorId, command,/)
})
