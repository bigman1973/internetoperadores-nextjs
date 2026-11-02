import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { Prisma } from '@prisma/client'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import { precheckConciliarRowTx, precheckConciliarRowsBatchTx, assertConciliarGreenPrechecksBatchTx, type ConciliarPrecheckRow } from '../lib/finanzas/conciliar-precheck'
import { preflightB4DraftTx, preflightB4NoDocumentDraftFromSource } from '../lib/finanzas/reconciliation-db'
import { planConciliarConfirmBatch } from '../lib/finanzas/conciliar-batch'

function row(index=0, overrides:Partial<ConciliarPrecheckRow>={}):ConciliarPrecheckRow {
  const id=`fee-${String(index).padStart(3,'0')}`
  return { id:`row-${id}`,movimientoId:id,fecha:'2026-10-30',concepto:'COMISION',banco:'BANCO',cuenta:'CUENTA',importeCentimos:-125,pendienteCentimos:-125,color:'VERDE',grupo:'BANCO',motivo:'Comisión exacta',documento:null,propuesta:null,seleccionable:true,diferenciaCentimos:0,detail:null,decisionHash:'d'.repeat(64),sourceFingerprint:'f'.repeat(64),source:{kind:'COMISION_BANCARIA',movimientoId:id,versionB4:1},...overrides }
}
type Source={id:string;version:number;amount:number|null;concepto:string;referencia:null;info:null;tercero:null;banco:string;decimal:string|null;previous:any}
function source(subject:ConciliarPrecheckRow, overrides:Partial<Source>={}):Source {
  return {id:subject.movimientoId!,version:subject.source.versionB4!,amount:subject.importeCentimos,concepto:'COMISION DE MANTENIMIENTO',referencia:null,info:null,tercero:null,banco:'BANCO',decimal:'-1.25',previous:null,...overrides}
}
function txFor(sources:readonly Source[], options:{ unavailableDocs?:boolean; failure?:Error }={}) {
  const statements:string[]=[]
  const byId=new Map(sources.map(s=>[s.id,s]))
  const tx={
    async $queryRaw(statement:any,...values:any[]) {
      const sql=Array.isArray(statement)?statement.join('?'):statement.strings.join('?')
      const params=Array.isArray(statement)?values:statement.values
      statements.push(sql)
      if(options.failure) throw options.failure
      if(sql.includes("to_regclass('public.facturas_recibidas')")) {
        assert.equal(options.unavailableDocs,true,'unexpected documentary gate')
        return [{facturasRecibidas:false,nominas:false,nominaDocumentos:false,adjuntosB5:false}]
      }
      assert.equal(classifyPrisma5RawSqlStatement(Array.isArray(statement)?[statement,...values]:[statement]),'read_only')
      if(sql.includes(' AS decimal FROM "movimientos_bancarios"')) return byId.has(params[0])?[{decimal:byId.get(params[0])!.decimal}]:[]
      assert.match(sql,/FROM movimientos_bancarios m JOIN cuentas_bancarias c/,'only exact G7 bank source SELECT allowed')
      const requested=params.filter((p:unknown)=>typeof p==='string')
      return requested.flatMap((id:string)=>byId.has(id)?[structuredClone(byId.get(id)!)]:[])
    },
    movimientoBancario:{async findUnique(args:any) {
      assert.deepEqual(args.select,{id:true,importe:true})
      const live=byId.get(args.where.id);return live?{id:live.id,importe:live.decimal}:null
    }},
    estadoJustificacionMovimientoB4:{async findUnique(args:any) {
      assert.deepEqual(Object.keys(args),['where']);return structuredClone(byId.get(args.where.movimientoId)?.previous??null)
    }},
  }
  return {tx:tx as never,statements}
}
async function equivalence(rows:readonly ConciliarPrecheckRow[],sources:readonly Source[],options:Parameters<typeof txFor>[1]={}) {
  const individual=txFor(sources,options),batch=txFor(sources,options)
  const expected=[]
  for(const subject of rows) expected.push(await precheckConciliarRowTx(individual.tx,subject))
  const actual=await precheckConciliarRowsBatchTx(batch.tx,rows)
  assert.deepEqual(actual,expected,'same code/mode/administrative reason as authoritative individual gate')
  return {actual,individual,batch}
}

test('G7 1/20 comisiones: carga única, mismos predicados y errores, estado virtual y persistido',async()=>{
  for(const size of [1,20]) {
    const rows=Array.from({length:size},(_,index)=>row(index))
    const sources=rows.map((r,i)=>source(r,i%2?{previous:{estado:'SIN_DOCUMENTO',motivoNoRequiere:null,version:1}}:{}))
    const {actual,batch,individual}=await equivalence(rows,sources)
    assert.ok(actual.every(d=>d.confirmable))
    assert.equal(batch.statements.length,1,'batch financial read, not a promise per row')
    assert.equal(individual.statements.length,size*2,'fee source + exact decimal for each individual row')
    assert.match(batch.statements[0],/ORDER BY m.id ASC LIMIT \?/)
    assert.doesNotMatch(batch.statements[0],/FOR UPDATE|INSERT|UPDATE|DELETE/)
  }
})

test('G7 céntimos, importe exacto, reclasificación, ausencia y estado/version: mismo fallo',async()=>{
  const r=row()
  for(const sources of [[],[source(r,{amount:null,decimal:'-1.251'})],[source(r,{amount:-126,decimal:'-1.26'})],[source(r,{concepto:'COMPRA TARJETA'})],[source(r,{version:2,previous:{estado:'SIN_DOCUMENTO',version:2}})],[source(r,{previous:{estado:'NO_REQUIERE',motivoNoRequiere:'COMISION_BANCARIA',version:1}})],[source(r,{decimal:null})]]) {
    const {actual}=await equivalence([r],sources)
    assert.equal(actual[0].confirmable,false)
  }
  const invalidVersion=row(0,{source:{kind:'COMISION_BANCARIA',movimientoId:r.movimientoId!,versionB4:0}})
  assert.equal((await equivalence([invalidVersion],[source(r)])).actual[0].code,'VERSION_OBSOLETA')
})

test('G7 mixto/unsupported/document source absent/manual owntransfer malformed no atajos verdes',async()=>{
  const fee=row(),unsupported=row(1,{source:{kind:'UNSUPPORTED' as never,movimientoId:'fee-001',versionB4:1}})
  const invoice=row(2,{source:{kind:'PAGO_FACTURA_RECIBIDA',movimientoId:'fee-002',facturaRecibidaId:'invoice',versionB4:1,documentLifecycleVersionState:'a'.repeat(64)}})
  const manual=row(3,{source:{kind:'TRANSFERENCIA_PROPIA_MANUAL',movimientoId:'fee-003',versionB4:1}})
  const result=await equivalence([fee,unsupported,invoice,manual],[source(fee)],{unavailableDocs:true})
  assert.equal(result.actual[0].confirmable,true)
  assert.deepEqual(result.actual.slice(1).map(d=>d.confirmable),[false,false,false])
  assert.equal(result.actual[1].code,'TIPO_NO_ADMITIDO')
  assert.equal(result.actual[2].code,'FUENTE_DOCUMENTAL_NO_DISPONIBLE')
  assert.equal(result.actual[3].code,'PAREJA_ACCION_SEPARADA')
})

test('sin memo entre invocaciones: mismo verde/hash luego liveness rota bloquea; EOF propaga',async()=>{
  const r=row(),mock=txFor([source(r)])
  assert.equal((await precheckConciliarRowsBatchTx(mock.tx,[r]))[0].confirmable,true)
  const changed=txFor([source(r,{amount:-126})])
  await assert.rejects(assertConciliarGreenPrechecksBatchTx(changed.tx,[r]),(e:any)=>e.code==='DECISION_CAMBIADA')
  const eof=new Error('EOF ambiguous result')
  await assert.rejects(precheckConciliarRowsBatchTx(txFor([],{failure:eof}).tx,[r]),e=>e===eof)
})

test('borrador NO_REQUIERE: individual y loaded usan validación B4 real, no fechas inventadas',async()=>{
  const r=row(),s=source(r),raw={version:1,borrador:{movimientoId:s.id,importeMovimientoCentimos:-125,estado:'NO_REQUIERE',motivoNoRequiere:'COMISION_BANCARIA',lineas:[]}}
  assert.deepEqual(await preflightB4DraftTx(txFor([s]).tx,raw),preflightB4NoDocumentDraftFromSource(raw,s))
  const withDate=row(0,{fecha:'2026-11-01'})
  assert.deepEqual((await equivalence([withDate],[s])).actual[0],(await equivalence([r],[s])).actual[0],'fees do not fabricate document date authority')
  assert.throws(()=>preflightB4NoDocumentDraftFromSource({...raw,borrador:{...raw.borrador,estado:'JUSTIFICADO'}},s),(e:any)=>e.code==='VALIDATION_ERROR')
})

test('selección/hash/targets duplicados y locks deterministas preservan rechazo antes del lote',()=>{
  const a=row(1),b=row(0),fail=(status:number,code:string,message:string):never=>{throw Object.assign(new Error(message),{status,code})}
  const selections=[a,b].map(r=>({id:r.id,decisionHash:r.decisionHash!}))
  const plan=planConciliarConfirmBatch(selections,[b,a] as never,fail)
  assert.deepEqual(plan.rows.map(r=>r.id),[a.id,b.id])
  assert.deepEqual(plan.movementIds,['fee-000','fee-001'])
  assert.throws(()=>planConciliarConfirmBatch([selections[0],selections[0]],[a,a] as never,fail),(e:any)=>e.code==='MOVIMIENTO_REPETIDO')
  assert.throws(()=>planConciliarConfirmBatch([{...selections[0],decisionHash:'e'.repeat(64)}],[a] as never,fail),(e:any)=>e.code==='DECISION_CAMBIADA')
  const transfer={...a,source:{kind:'TRANSFERENCIA_PROPIA',movimientoId:a.movimientoId,movimientoParId:b.movimientoId,versionB4:1}}
  assert.throws(()=>planConciliarConfirmBatch(selections,[transfer,b] as never,fail),(e:any)=>e.code==='MOVIMIENTO_REPETIDO')
  const batch=readFileSync('lib/finanzas/conciliar-batch.ts','utf8')
  assert.match(batch,/ORDER BY v\.movimiento_id ASC/)
  assert.match(batch,/await lockB4FeeMovementsTx[\s\S]*await lockP1FeeMovementsTx[\s\S]*await lockedFeeSourcesTx[\s\S]*await persistConciliarBankFeeBatchTx/)
})
