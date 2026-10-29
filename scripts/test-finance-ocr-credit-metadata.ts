import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import test from 'node:test'

const source=readFileSync(resolve('lib/finanzas/ocr-facturas.ts'),'utf8')
function fixture(extra:Record<string,unknown>={}) {
  return {proveedor:'Proveedor sintético',cif:null,numFactura:'ABONO-TEST',fecha:'2026-02-01',fechaVencimiento:null,base:-200,tipoIva:21,importeIva:-42,tipoIrpf:0,importeIrpf:0,total:-242,concepto:null,confianza:0.95,lineas:[],esInternacional:false,paisOrigen:null,domicilioProveedor:null,...extra}
}
async function extract(body:Record<string,unknown>) {
  let calls=0
  class FakeOpenAI {
    chat={completions:{create:async(input:{messages:unknown[]})=>{
      calls++
      assert(Array.isArray(input.messages))
      return {choices:[{message:{content:JSON.stringify(body)},finish_reason:'stop'}]}
    }}}
  }
  const sandbox={exports:{} as {extraerDatosFactura?:(base64:string,mime:string,name:string)=>Promise<Record<string,unknown>>},
    require:(name:string)=>{assert.equal(name,'openai');return {__esModule:true,default:FakeOpenAI}},
    process:{env:{OPENAI_API_KEY:'synthetic-unused-key'}},console:{log:()=>{},warn:()=>{},error:()=>{}}}
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,sandbox)
  const result=await sandbox.exports.extraerDatosFactura!('synthetic-unused-bytes','application/pdf','synthetic.pdf')
  assert.equal(calls,1,'uses only the stubbed existing OCR call; no second extractor')
  return result
}

test('OCR keeps the literal original reference, explicit currency and negative credit total',async()=>{
  const result=await extract(fixture({tipoDocumento:'RECTIFICATIVA',referenciaFacturaOriginal:'  ORIGINAL/TEST  ',moneda:'EUR'}))
  assert.equal(result.tipoDocumento,'RECTIFICATIVA')
  assert.equal(result.referenciaFacturaOriginal,'ORIGINAL/TEST')
  assert.equal(result.moneda,'EUR')
  assert.equal(result.total,-242)
})
test('missing credit metadata is not inferred from negative amount, date or filename',async()=>{
  const result=await extract(fixture())
  assert.equal(result.tipoDocumento,null)
  assert.equal(result.referenciaFacturaOriginal,null)
  assert.equal(result.moneda,null)
  assert.equal(result.total,-242)
})
test('invalid kind, control characters and unverified currency fail closed',async()=>{
  const result=await extract(fixture({tipoDocumento:'UNKNOWN',referenciaFacturaOriginal:'ORIGINAL\u0000TEST',moneda:'euros'}))
  assert.equal(result.tipoDocumento,null)
  assert.equal(result.referenciaFacturaOriginal,null)
  assert.equal(result.moneda,null)
})
