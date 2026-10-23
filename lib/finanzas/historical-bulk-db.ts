import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import prisma from '../prisma'
import { assertFinanceRuntimeReady } from './finance-runtime-safety'
import { requireB4ActorAccess } from './reconciliation-auth'
import { facturaEconomicaWhere } from './invoice-economic-filter'
import { archivoRecibidaControlado, bibliotecaFinancieraConfigurada } from './archivo-fuente-controlada'
import { decimalTextToCentimos,sha256Canonical } from './historical-b4-core'
import { B4ServiceError, createDocumentoB4Tx, confirmarB4Tx, deshacerB4Tx } from './reconciliation-db'
import { bulkTotals,digest,exactHistoricalPopulation,MAX_HISTORICAL_BULK,MAX_HISTORICAL_POPULATION,type MaterialHistorical,type MaterialSource,type BulkItem } from './historical-bulk-core'

import {signHistoricalBulkPreview,verifyHistoricalBulkPreview,PREVIEW_TOKEN_MAX} from './historical-bulk-preview'

type Tx=Prisma.TransactionClient & Record<string,any>
type Raw=Record<string,any>
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail=(status:number,code:string,text:string):never=>{throw new B4ServiceError(status,code,text)}
const iso=(value:unknown)=>value instanceof Date && Number.isFinite(value.getTime())?value.toISOString():typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null
const sourceKey=(tipo:string,id:string)=>tipo+':'+id
const configs:Record<string,{model:string;table:string;column:string;pointer:string;negative:boolean;select:any}>={
 FACTURA_RECIBIDA:{model:'facturaRecibida',table:'facturas_recibidas',column:'total',pointer:'facturaRecibidaId',negative:true,select:{id:true,numFactura:true,proveedor:true,fecha:true,fechaVencimiento:true,calidad:true,copiaDeId:true,conflictoIdentidad:true,duplicadoExterno:true,oneDriveDriveId:true,oneDriveItemId:true,archivoOneDrive:true}},
 FACTURA_EMITIDA:{model:'facturaEmitida',table:'facturas_emitidas',column:'total',pointer:'facturaEmitidaId',negative:false,select:{id:true,numFactura:true,cliente:true,fecha:true,fechaVencimiento:true,facturaISPId:true}},
 NOMINA:{model:'nomina',table:'nominas',column:'neto_percibir',pointer:'nominaId',negative:true,select:{id:true,mes:true,anio:true,archivoUrl:true}},
 TICKET:{model:'gasto',table:'gastos',column:'importe',pointer:'gastoId',negative:true,select:{id:true,concepto:true,comercio:true,fecha:true,estado:true,metodoPago:true,oneDriveItemId:true}},
}
export async function readHistoricalBulkMaterialTx(base:Prisma.TransactionClient,virtualRows?:Raw[]):Promise<MaterialHistorical[]> {
 const tx=base as Tx
 const virtual=virtualRows?Prisma.sql`WITH legado_conciliacion_b4 AS (SELECT * FROM jsonb_to_recordset(CAST(${JSON.stringify(virtualRows)} AS jsonb)) AS l(id uuid,movimiento_id text,clasificacion text,documentos jsonb,source_hash text,importe_banco_centimos int,snapshot_legacy jsonb,lote text)), reversiones_legado_b4 AS (SELECT NULL::text AS lote WHERE FALSE)`:Prisma.empty
 const rows=await tx.$queryRaw<Raw[]>(Prisma.sql`
  ${virtual}
  SELECT l.id::text AS "historicoId",l.movimiento_id AS "movimientoId",l.clasificacion,l.documentos,l.source_hash AS "sourceHash",
   l.snapshot_legacy::text AS "snapshotLegacyText",l.importe_banco_centimos AS "importeSnapshot",m.importe::text AS "importeTexto",m.fecha_operacion AS "fechaOperacion",m.concepto,m.cuenta_id AS "cuentaId",c.banco,c.alias AS "cuentaAlias",
   COALESCE(e.estado::text,'SIN_DOCUMENTO') AS estado,COALESCE(e.version,1) AS version,
   jsonb_build_object('FACTURA_RECIBIDA',jsonb_build_object('fecha',l.snapshot_legacy->'facturaRecibida'->>'fecha','numero',l.snapshot_legacy->'facturaRecibida'->>'num_factura'),
    'FACTURA_EMITIDA',jsonb_build_object('fecha',l.snapshot_legacy->'facturaEmitida'->>'fecha','numero',l.snapshot_legacy->'facturaEmitida'->>'num_factura'),
    'TICKET',jsonb_build_object('fecha',l.snapshot_legacy->'gasto'->>'fecha','numero',l.snapshot_legacy->'gasto'->>'concepto')) AS proof
  FROM legado_conciliacion_b4 l JOIN movimientos_bancarios m ON m.id=l.movimiento_id JOIN cuentas_bancarias c ON c.id=m.cuenta_id
  LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
  WHERE l.clasificacion='PROPUESTA' AND NOT EXISTS(SELECT 1 FROM reversiones_legado_b4 r WHERE r.lote=l.lote)
  ORDER BY m.fecha_operacion DESC,m.id ASC LIMIT ${MAX_HISTORICAL_POPULATION+1}`)
 if(rows.length>MAX_HISTORICAL_POPULATION)fail(409,'HISTORICAL_POPULATION_TOO_LARGE','La población supera el límite seguro; acote el lote antes de confirmar.')
 const sources=new Map<string,MaterialSource>()
 for(const [tipo,config]of Object.entries(configs)){
  const refs=rows.flatMap(row=>Array.isArray(row.documentos)?row.documentos.filter((d:Raw)=>d.tipo===tipo&&typeof d.sourceId==='string'):[])
  const ids=[...new Set<string>(refs.map((d:Raw)=>d.sourceId))];if(!ids.length)continue
  const sourceRows:Raw[]=await (tx as any)[config.model].findMany({where:{id:{in:ids},...(tipo==='FACTURA_RECIBIDA'?{AND:[facturaEconomicaWhere]}:{})},select:config.select})
  const decimals=await tx.$queryRaw<Array<{id:string;decimal:string}>>(Prisma.sql`SELECT id::text AS id,${Prisma.raw('"'+config.column+'"')}::text AS decimal FROM ${Prisma.raw('"'+config.table+'"')} WHERE id::text IN (${Prisma.join(ids)}) LIMIT ${ids.length}`)
  const amounts=new Map(decimals.map(r=>[r.id,decimalTextToCentimos(r.decimal)]))
  const wrappers:Raw[]=await (tx as any).documentoConciliable.findMany({where:{[config.pointer]:{in:ids}},select:{id:true,tipo:true,activo:true,version:true,importeObjetivoCentimos:true,[config.pointer]:true}})
  const wrapperIds=wrappers.map((d:Raw)=>d.id)
  const netRows=wrapperIds.length?await tx.$queryRaw<Array<{id:string;net:string;count:number}>>(Prisma.sql`SELECT documento_conciliable_id::text AS id,SUM(importe_centimos)::text AS net,COUNT(*)::int AS count FROM vinculos_movimiento_documento WHERE activo AND documento_conciliable_id IN (${Prisma.join(wrapperIds.map((id:string)=>Prisma.sql`CAST(${id} AS uuid)`))}) GROUP BY documento_conciliable_id LIMIT ${wrapperIds.length}`):[]
  const nets=new Map(netRows.map(r=>[r.id,r.net]));const activeCounts=new Map(netRows.map(r=>[r.id,r.count]))
  const ispIds=sourceRows.filter((s:Raw)=>s.facturaISPId!==undefined&&s.facturaISPId!==null).map((s:Raw)=>s.facturaISPId)
  const ispRows=ispIds.length?await tx.$queryRaw<Array<{id:number;decimal:string}>>(Prisma.sql`SELECT id,total::text AS decimal FROM facturas WHERE id IN (${Prisma.join(ispIds)}) LIMIT ${ispIds.length}`):[]
  const ispAmounts=new Map(ispRows.map(r=>[r.id,decimalTextToCentimos(r.decimal)]))
  for(const s of sourceRows){
   const value=amounts.get(s.id);const target=value===null||value===undefined?null:config.negative?-value:value
   const docs=wrappers.filter((d:Raw)=>d[config.pointer]===s.id)
   const wrapper=docs.length===1?docs[0]:null
   let valid=target!==null
   if(tipo==='FACTURA_RECIBIDA')valid=valid && s.calidad==='VALIDA'&&s.copiaDeId===null&&!s.conflictoIdentidad&&!s.duplicadoExterno&&!['ERROR_OCR','DESCONOCIDO'].includes(String(s.proveedor).trim().toUpperCase())
   if(tipo==='TICKET')valid=valid && value!==null&&value!==undefined&&value>0&&['APROBADO','CONTABILIZADO'].includes(s.estado)&&s.metodoPago==='TARJETA_EMPRESA'
   if(tipo==='NOMINA')valid=valid && value!==null&&value!==undefined&&value>0
   if(s.facturaISPId!==undefined&&s.facturaISPId!==null)valid=valid && ispAmounts.get(s.facturaISPId)===value
   if(docs.length && (!wrapper||!wrapper.activo||wrapper.tipo!==tipo||wrapper.importeObjetivoCentimos!==target))valid=false
   const fileProof=tipo==='FACTURA_RECIBIDA'?archivoRecibidaControlado(s):tipo==='TICKET'&&bibliotecaFinancieraConfigurada()&&/^[A-Za-z0-9!_.~-]{4,220}$/.test(s.oneDriveItemId||'')?{itemId:s.oneDriveItemId,driveId:bibliotecaFinancieraConfigurada()}:null
   const reference=tipo==='FACTURA_RECIBIDA'?`Factura recibida ${s.numFactura||s.id}`:tipo==='FACTURA_EMITIDA'?`Factura emitida ${s.numFactura||s.id}`:tipo==='NOMINA'?`Nómina ${String(s.mes).padStart(2,'0')}/${s.anio}`:`Ticket ${s.concepto||s.id}`
   // Una emitida vigente es evidencia económica de cobro, no una prueba de PDF.
   // Sólo cargos nuevos exigen archivo controlado, igual que la confirmación B4 individual.
   const archivo=fileProof!==null
   sources.set(sourceKey(tipo,s.id),{tipo,sourceId:s.id,referencia:reference.slice(0,240),tercero:s.proveedor??s.cliente??s.comercio??null,fecha:iso(s.fecha),fechaVencimiento:iso(s.fechaVencimiento),importeObjetivoCentimos:target??0,documentoConciliableId:wrapper?.id??null,wrapperVersion:wrapper?.version??null,valid,archivo,sourceDateSnapshot:null,targetSnapshot:null,netoActivo:wrapper?nets.get(wrapper.id)??'0':'0',activeCount:wrapper?activeCounts.get(wrapper.id)??0:0,fileProof})
  }
 }
 return rows.map(row=>{
  const snapshot=JSON.parse(row.snapshotLegacyText);const sourceIntegrity=sha256Canonical({algorithm:'SHA-256',version:1,snapshotLegacy:snapshot,importeBancoExactoTexto:String(snapshot.movimiento?.importe)})===row.sourceHash
  const docs=Array.isArray(row.documentos)?row.documentos:[];let unsupported=!Array.isArray(row.documentos)
  const material:MaterialSource[]=docs.map((d:Raw)=>{
   if(!configs[d.tipo]||typeof d.sourceId!=='string'){unsupported=true;return null}
   const s=sources.get(sourceKey(d.tipo,d.sourceId));if(!s)return {tipo:d.tipo,sourceId:d.sourceId,referencia:'Documento no verificable',tercero:null,fecha:null,fechaVencimiento:null,importeObjetivoCentimos:0,documentoConciliableId:null,valid:false,archivo:false,wrapperVersion:null,sourceDateSnapshot:null,targetSnapshot:null,netoActivo:'0',activeCount:0,fileProof:null}
   const original=row.proof?.[d.tipo]
   const referenceValid=d.referencia===s.referencia && (d.documentoConciliableId===null || d.documentoConciliableId===s.documentoConciliableId)
   return {...s,valid:s.valid&&referenceValid,sourceDateSnapshot:iso(original?.fecha),targetSnapshot:typeof d.importeObjetivoCentimos==='number'?d.importeObjetivoCentimos:null}
  }).filter(Boolean)
  return {historicoId:row.historicoId,movimientoId:row.movimientoId,clasificacion:row.clasificacion,estado:row.estado,version:row.version,fechaOperacion:iso(row.fechaOperacion)??'',concepto:row.concepto,banco:row.banco,cuentaAlias:row.cuentaAlias,cuentaId:row.cuentaId,importeMovimientoCentimos:decimalTextToCentimos(row.importeTexto),importeSnapshot:row.importeSnapshot,documentos:material,unsupported,sourceHash:row.sourceHash,sourceIntegrity,fechaBancoSnapshot:iso(snapshot.movimiento?.fecha_operacion)} as MaterialHistorical
 })
}
export type HistoricalBulkOptions={limit?:number;offset?:number;cuentaId?:string;q?:string}
export async function readHistoricalBulkPreviewTx(tx:Prisma.TransactionClient,options:HistoricalBulkOptions={},actorId=0) {
 const material=await readHistoricalBulkMaterialTx(tx);const population=exactHistoricalPopulation(material)
 const scope=new Set(material.filter(row=>(!options.cuentaId||(row as any).cuentaId===options.cuentaId)&&(!options.q||row.concepto.toLocaleLowerCase('es-ES').includes(options.q.toLocaleLowerCase('es-ES')))).map(row=>row.movimientoId))
 const items=population.items.filter(row=>scope.has(row.movimientoId));const limit=Math.min(25,Math.max(1,options.limit??25)),offset=Math.max(0,Math.min(10000,options.offset??0))
 return {items:items.slice(offset,offset+limit),totalExactas:items.length,totalPropuestas:scope.size,...bulkTotals(items),excluidasPorMotivo:population.excluidasPorMotivo,limit,offset,maxBloque:MAX_HISTORICAL_BULK,previewToken:signHistoricalBulkPreview(actorId,items.slice(offset,offset+limit)),criterio:'Importes firmados exactos, documento económico vigente, fecha no posterior al banco y sin doble asignación. Los cargos requieren archivo controlado. La confirmación humana crea B4; esta lectura no escribe.'}
}
export async function readHistoricalBulkPreview(options:HistoricalBulkOptions={},actorId=0) {
 await assertFinanceRuntimeReady()
 return prisma.$transaction(async base=>{await base.$executeRaw`SET TRANSACTION READ ONLY`;return readHistoricalBulkPreviewTx(base,options,actorId)},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:60000,maxWait:10000})
}
function keys(raw:unknown,allowed:string[]):asserts raw is Raw {if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==allowed.length||Object.keys(raw).some(k=>!allowed.includes(k)))fail(400,'VALIDATION_ERROR','El cuerpo no cumple el contrato del bloque.')}
export function parseHistoricalBulkCommand(input:unknown){
 if(!input||typeof input!=='object')fail(400,'VALIDATION_ERROR','Solicitud de bloque no válida.')
 const action=(input as Raw).action
 if(action==='confirmar_exactas'){
  keys(input,['action','confirmacion','idempotencyKey','items','previewToken'])
  if(typeof input.previewToken!=='string'||!input.previewToken||input.previewToken.length>PREVIEW_TOKEN_MAX||input.confirmacion!==true||!UUID.test(input.idempotencyKey)||!Array.isArray(input.items)||!input.items.length||input.items.length>25)fail(400,'VALIDATION_ERROR','Se exige confirmación humana y entre 1 y 25 propuestas exactas.')
  const seen=new Set<string>()
  for(const item of input.items){keys(item,['historicoId','movimientoId','fingerprint']);if(typeof item.historicoId!=='string'||!UUID.test(item.historicoId)||typeof item.movimientoId!=='string'||!item.movimientoId||item.movimientoId.length>160||!(/^[a-f0-9]{64}$/.test(item.fingerprint))||seen.has(item.movimientoId))fail(400,'VALIDATION_ERROR','Selección de propuestas no válida.');seen.add(item.movimientoId)}
  return {...input,items:[...input.items].sort((a:Raw,b:Raw)=>a.movimientoId.localeCompare(b.movimientoId))} as Raw
 }
 keys(input,['action','confirmacion','idempotencyKey','bloqueId'])
 if(action!=='deshacer_bloque'||input.confirmacion!==true||!UUID.test(input.idempotencyKey)||!UUID.test(input.bloqueId))fail(400,'VALIDATION_ERROR','La reversión exige un bloque y una confirmación humana explícita.')
 return input
}
async function liveActor(actorId:number){if(!(await requireB4ActorAccess(actorId,'escritura')).ok)fail(403,'FORBIDDEN','Ya no dispone de permiso de conciliación.')}
async function lockBatch(tx:Tx,actorId:number,key:string){await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`HB:${actorId}:${key}`},0))::text AS locked`}
async function receipt(tx:Tx,actorId:number,keyHash:string,kind:'CONFIRMACION'|'REVERSION'){
 return tx.eventoJustificacionB4.findMany({where:{actorId,detalle:{path:['bulkKeyHash'],equals:keyHash},accion:kind==='CONFIRMACION'?'APROBACION':'REVERSION'},include:{operacion:true},orderBy:{createdAt:'asc'},take:26})
}
function replayResult(rows:Raw[],hash:string,kind:'CONFIRMACION'|'REVERSION'){
 if(!rows.length)return null
 if(rows.length>25||rows.some(row=>row.detalle.bulkRequestHash!==hash||row.detalle.bulkKind!==kind))fail(409,'IDEMPOTENCY_PAYLOAD_MISMATCH','La clave del bloque ya se usó con otra selección.')
 const details=rows[0].detalle
 return {ok:true,bloqueId:details.bloqueId,confirmadas:kind==='CONFIRMACION'?rows.length:undefined,revertidas:kind==='REVERSION'?rows.length:rows.filter(r=>r.operacion.estado==='REVERTIDA').length,idempotente:true,totalCargosCentimos:details.totalCargosCentimos,totalCobrosCentimos:details.totalCobrosCentimos}
}
export async function confirmHistoricalBulkTx(base:Prisma.TransactionClient,actorId:number,input:unknown){
 const tx=base as Tx;const raw=parseHistoricalBulkCommand(input);if(raw.action!=='confirmar_exactas')fail(400,'VALIDATION_ERROR','Acción de confirmación incorrecta.');await liveActor(actorId)
 const keyHash=digest({actorId,key:raw.idempotencyKey});const hash=digest(raw)
 await lockBatch(tx,actorId,raw.idempotencyKey)
 const replay=replayResult(await receipt(tx,actorId,keyHash,'CONFIRMACION'),hash,'CONFIRMACION');if(replay)return replay
 if(!verifyHistoricalBulkPreview(raw.previewToken,actorId,raw.items))fail(409,'HISTORICAL_PREVIEW_EXPIRED','La lista previa ha caducado o no corresponde al usuario y la selección; actualice la previsualización. No se ha confirmado nada.')
 // Fuente/movimientos bloqueados en orden estable: una concurrencia cancela todo el bloque, nunca confirma parcialmente.
 await tx.$executeRawUnsafe("SET LOCAL lock_timeout='10s'")
 await tx.$executeRawUnsafe('LOCK TABLE facturas_recibidas,facturas_emitidas,facturas,nominas,gastos IN SHARE MODE')
 await tx.$executeRawUnsafe('LOCK TABLE documentos_conciliables,estado_justificacion_movimientos IN SHARE ROW EXCLUSIVE MODE')
 for(const item of raw.items)await tx.$queryRaw`SELECT id FROM movimientos_bancarios WHERE id=${item.movimientoId} FOR UPDATE`
 const historicalLocks=await tx.$queryRaw<Raw[]>(Prisma.sql`SELECT l.id FROM legado_conciliacion_b4 l WHERE l.id IN (${Prisma.join(raw.items.map((i:Raw)=>Prisma.sql`CAST(${i.historicoId} AS uuid)`))}) ORDER BY l.id FOR SHARE`)
 if(historicalLocks.length!==raw.items.length)fail(409,'HISTORICAL_SELECTION_CHANGED','La selección histórica ha cambiado; vuelva a previsualizar.')
 const wrappers=await tx.$queryRaw<Raw[]>`SELECT id FROM documentos_conciliables ORDER BY id FOR UPDATE`
 const current=exactHistoricalPopulation(await readHistoricalBulkMaterialTx(tx))
 const byId=new Map<string,BulkItem>(current.items.map(item=>[item.movimientoId,item] as [string,BulkItem]))
 const selected:BulkItem[]=raw.items.map((wanted:Raw)=>{const item=byId.get(wanted.movimientoId);if(!item||item.historicoId!==wanted.historicoId||item.fingerprint!==wanted.fingerprint)fail(409,'HISTORICAL_SELECTION_CHANGED','Una propuesta ya no es exacta o ha cambiado; no se ha confirmado ninguna.');return item})
 const totals=bulkTotals(selected),bloqueId=randomUUID()
 for(const item of selected){
  const lineas=[]
  for(const doc of item.documentos){const wrapper=await createDocumentoB4Tx(tx,actorId,{action:'documento',tipoDocumento:doc.tipo,sourceId:doc.sourceId});lineas.push({tipo:'DOCUMENTO',documentoConciliableId:wrapper.documento.id,importeCentimos:doc.importeObjetivoCentimos})}
  const result=await confirmarB4Tx(tx,actorId,{action:'confirmar',confirmacion:true,idempotencyKey:'HB:'+raw.idempotencyKey+':'+digest(item.movimientoId).slice(0,24),version:item.version,borrador:{movimientoId:item.movimientoId,importeMovimientoCentimos:item.importeMovimientoCentimos,estado:'JUSTIFICADO',lineas}})
  await tx.eventoJustificacionB4.create({data:{operacionId:result.operacion.id,movimientoId:item.movimientoId,actorId,accion:'APROBACION',detalle:{origen:'HISTORICO',confirmacionHumana:true,bulkKind:'CONFIRMACION',bulkKeyHash:keyHash,bulkRequestHash:hash,bloqueId,historicoId:item.historicoId,fingerprint:item.fingerprint,...totals}}})
 }
 return {ok:true,bloqueId,confirmadas:selected.length,idempotente:false,...totals}
}
export async function undoHistoricalBulkTx(base:Prisma.TransactionClient,actorId:number,input:unknown){
 const tx=base as Tx;const raw=parseHistoricalBulkCommand(input);if(raw.action!=='deshacer_bloque')fail(400,'VALIDATION_ERROR','Acción de reversión incorrecta.');await liveActor(actorId)
 const keyHash=digest({actorId,key:raw.idempotencyKey}),hash=digest(raw)
 await lockBatch(tx,actorId,raw.idempotencyKey)
 const replay=replayResult(await receipt(tx,actorId,keyHash,'REVERSION'),hash,'REVERSION');if(replay)return replay
 const events=await tx.eventoJustificacionB4.findMany({where:{accion:'APROBACION',detalle:{path:['bloqueId'],equals:raw.bloqueId}},include:{operacion:true},take:26})
 const originals=events.filter((e:Raw)=>e.detalle.bulkKind==='CONFIRMACION')
 if(!originals.length||originals.length>25)fail(404,'HISTORICAL_BATCH_NOT_FOUND','No se encontró un bloque humano reversible.')
 for(const event of [...originals].sort((a:Raw,b:Raw)=>a.movimientoId.localeCompare(b.movimientoId)))await tx.$queryRaw`SELECT id FROM movimientos_bancarios WHERE id=${event.movimientoId} FOR UPDATE`
 for(const event of originals){const operation=await tx.operacionJustificacionB4.findUnique({where:{id:event.operacionId}});if(operation.estado!=='APLICADA'||operation.revertidaAt)fail(409,'HISTORICAL_BATCH_CHANGED','Una operación del bloque ya fue deshecha; use la reversión individual de las restantes.')}
 for(const event of originals){
  const state=await tx.estadoJustificacionMovimientoB4.findUnique({where:{movimientoId:event.movimientoId}})
  const active=await tx.vinculoMovimientoDocumento.findMany({where:{operacionCreacionId:event.operacionId,activo:true},select:{id:true,importeCentimos:true}})
  const result=await deshacerB4Tx(tx,actorId,{action:'deshacer',confirmacion:true,idempotencyKey:'HBU:'+raw.idempotencyKey+':'+digest(event.movimientoId).slice(0,24),version:state?.version??-1,operacionId:event.operacionId,lineas:active})
  await tx.eventoJustificacionB4.create({data:{operacionId:result.operacion.id,movimientoId:event.movimientoId,actorId,accion:'REVERSION',detalle:{origen:'HISTORICO',confirmacionHumana:true,bulkKind:'REVERSION',bulkKeyHash:keyHash,bulkRequestHash:hash,bloqueId:raw.bloqueId,...bulkTotals([])}}})
 }
 return {ok:true,bloqueId:raw.bloqueId,revertidas:originals.length,idempotente:false}
}
export async function runHistoricalBulk(actorId:number,input:unknown){
 const command=parseHistoricalBulkCommand(input);await assertFinanceRuntimeReady()
 return prisma.$transaction(async(tx):Promise<Record<string,unknown>>=>command.action==='confirmar_exactas'?await confirmHistoricalBulkTx(tx,actorId,input):await undoHistoricalBulkTx(tx,actorId,input),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:120000,maxWait:10000})
}
