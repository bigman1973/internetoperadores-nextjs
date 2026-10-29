import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import test from 'node:test'

const source=readFileSync('lib/finanzas/sync-jobs/assembly.ts','utf8')
const start=source.indexOf('export function createProductionOneDriveProvider(')
assert(start>=0)
const code=source.slice(start,source.indexOf('\n}',start)+2)

function factory() {
  let cipherCalls=0
  class LegacyProvider {constructor(readonly options:unknown){}}
  class Lifecycle {constructor(_client:unknown,_guard:unknown){}}
  const sandbox={exports:{} as {createProductionOneDriveProvider?:(client:unknown,env:Record<string,string>)=>unknown},
    OneDriveSyncProvider:LegacyProvider,PrismaOneDriveDocumentLifecycle:Lifecycle,
    createExistingB1GraphReadPort:()=>({}),createPrismaOneDriveDomain:()=>({}),
    extraerDatosFactura:()=>{throw Error('OCR_MUST_NOT_RUN')},validarResultadoOcrNuevo:()=>({}),
    approvedHistoricalDriveId:()=>null,
    graphDeltaCursorCipherFromEnvironment:(_value:unknown)=>{cipherCalls++;throw Error('DELTA_PRIVATE_KEY_REQUIRED')},
    process:{env:{}},hasEffectiveP2ActorWriteAccessInTx:()=>{throw Error('DATABASE_MUST_NOT_RUN')}}
  vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,sandbox)
  const env={VERCEL_ENV:'production',FINANCE_BACKGROUND_SYNC_ENABLED:'1',FINANCE_ONEDRIVE_SYNC_ENABLED:'1'}
  return {build:sandbox.exports.createProductionOneDriveProvider!,env,LegacyProvider,cipherCalls:()=>cipherCalls}
}

test('unconfigured Delta preserves the existing P2 provider without requiring new keys',()=>{
  const f=factory();assert(f.build({},f.env) instanceof f.LegacyProvider);assert.equal(f.cipherCalls(),0)
})
test('explicitly disabled Delta preserves P2; an explicit opt-in still requires a private key',()=>{
  const f=factory();assert(f.build({},{...f.env,FINANCE_GRAPH_DELTA_ENABLED:'0'}) instanceof f.LegacyProvider)
  assert.equal(f.cipherCalls(),0)
  assert.throws(()=>f.build({},{...f.env,FINANCE_GRAPH_DELTA_ENABLED:'1'}),/DELTA_PRIVATE_KEY_REQUIRED/)
  assert.equal(f.cipherCalls(),1)
})
