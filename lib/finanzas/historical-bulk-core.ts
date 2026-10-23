import { createHash } from 'node:crypto'

export const MAX_HISTORICAL_BULK = 25
export const MAX_HISTORICAL_POPULATION = 10000
export type BulkDocument = {tipo:string;sourceId:string;referencia:string;tercero:string|null;fecha:string|null;fechaVencimiento:string|null;importeObjetivoCentimos:number;documentoConciliableId:string|null}
export type BulkItem = {historicoId:string;movimientoId:string;fingerprint:string;fechaOperacion:string;concepto:string;banco:string;cuentaAlias:string|null;importeMovimientoCentimos:number;version:number;documentos:BulkDocument[]}
export type MaterialSource = BulkDocument & {valid:boolean;archivo:boolean;wrapperVersion:number|null;sourceDateSnapshot:string|null;targetSnapshot:number|null;netoActivo:string;activeCount:number;fileProof:unknown}
export type MaterialHistorical = {historicoId:string;movimientoId:string;clasificacion:string;estado:string;version:number;fechaOperacion:string;concepto:string;banco:string;cuentaAlias:string|null;importeMovimientoCentimos:number|null;importeSnapshot:number|null;documentos:MaterialSource[];unsupported:boolean;sourceHash:string;sourceIntegrity:boolean;fechaBancoSnapshot:string|null}
export function stable(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']'
  if(value && typeof value==='object')return '{'+Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}'
  return JSON.stringify(value) ?? 'null'
}
export const digest=(value:unknown)=>createHash('sha256').update(stable(value)).digest('hex')
const cents=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n!==0&&n>=-2147483648&&n<=2147483647
const date=(value:string|null)=>{if(!value||!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)||!Number.isFinite(Date.parse(value)))return null;const civil=value.slice(0,10);return new Date(civil+'T00:00:00Z').toISOString().slice(0,10)===civil?civil:null}
export function exactHistoricalPlan(row:MaterialHistorical):{item:BulkItem}|{reason:string} {
  if(!row.sourceIntegrity)return {reason:'INTEGRIDAD_HISTORICA_NO_VERIFICABLE'}
  if(!date(row.fechaBancoSnapshot)||date(row.fechaBancoSnapshot)!==date(row.fechaOperacion))return {reason:'FECHA_BANCARIA_HISTORICA_CAMBIADA'}
  if(row.clasificacion!=='PROPUESTA'||row.estado!=='SIN_DOCUMENTO')return {reason:'YA_RESUELTA_B4'}
  if(!cents(row.importeMovimientoCentimos)||row.importeMovimientoCentimos!==row.importeSnapshot)return {reason:'IMPORTE_BANCARIO_CAMBIADO_O_NO_EXACTO'}
  if(row.unsupported)return {reason:'REFERENCIA_NO_DOCUMENTAL_O_AMBIGUA'}
  if(!row.documentos.length || row.documentos.length>6)return {reason:'SIN_DOCUMENTO_VERIFICABLE'}
  const seen=new Set<string>();let sum=BigInt(0)
  for(const doc of row.documentos){
    const key=doc.tipo+':'+doc.sourceId
    if(seen.has(key))return {reason:'DOCUMENTO_DUPLICADO'};seen.add(key)
    if(!doc.valid)return {reason:'DOCUMENTO_NO_ECONOMICO_O_CAMBIADO'}
    if(!cents(doc.importeObjetivoCentimos)||doc.importeObjetivoCentimos!==doc.targetSnapshot)return {reason:'IMPORTE_DOCUMENTAL_CAMBIADO_O_NO_EXACTO'}
    if(Math.sign(doc.importeObjetivoCentimos)!==Math.sign(row.importeMovimientoCentimos))return {reason:'SIGNO_DOCUMENTAL_INCOMPATIBLE'}
    if(doc.activeCount!==0||!/^-?\d+$/.test(doc.netoActivo)||BigInt(doc.netoActivo)!==BigInt(0))return {reason:'DOCUMENTO_YA_ASIGNADO'}
    if(row.importeMovimientoCentimos<0&&!doc.archivo)return {reason:'SIN_ARCHIVO_CONTROLADO'}
    const issued=date(doc.fecha),bank=date(row.fechaOperacion),historical=date(doc.sourceDateSnapshot)
    if(!issued || !bank || !historical)return {reason:'FECHA_DOCUMENTAL_NO_VERIFICABLE'}
    if(issued!==historical)return {reason:'FECHA_DOCUMENTAL_CAMBIADA'}
    if(issued>bank)return {reason:'FACTURA_POSTERIOR_AL_MOVIMIENTO'}
    sum+=BigInt(doc.importeObjetivoCentimos)
  }
  if(sum!==BigInt(row.importeMovimientoCentimos))return {reason:'IMPORTES_NO_COINCIDEN_AL_CENTIMO'}
  const documentos=row.documentos.map(({tipo,sourceId,referencia,tercero,fecha,fechaVencimiento,importeObjetivoCentimos,documentoConciliableId})=>({tipo,sourceId,referencia,tercero,fecha,fechaVencimiento,importeObjetivoCentimos,documentoConciliableId}))
  return {item:{historicoId:row.historicoId,movimientoId:row.movimientoId,fingerprint:digest(row),fechaOperacion:row.fechaOperacion,concepto:row.concepto,banco:row.banco,cuentaAlias:row.cuentaAlias,importeMovimientoCentimos:row.importeMovimientoCentimos,version:row.version,documentos}}
}
export function exactHistoricalPopulation(rows:MaterialHistorical[]) {
  const candidates:BulkItem[]=[];const excluidasPorMotivo:Record<string,number>={}
  const exclude=(reason:string)=>{excluidasPorMotivo[reason]=(excluidasPorMotivo[reason]||0)+1}
  for(const row of rows){const planned=exactHistoricalPlan(row);if('reason'in planned)exclude(planned.reason);else candidates.push(planned.item)}
  const documentUse=new Map<string,number>()
  for(const item of candidates)for(const doc of item.documentos){const key=doc.tipo+':'+doc.sourceId;documentUse.set(key,(documentUse.get(key)||0)+1)}
  const items=candidates.filter(item=>{const shared=item.documentos.some(doc=>(documentUse.get(doc.tipo+':'+doc.sourceId)||0)>1);if(shared)exclude('DOCUMENTO_COMPARTIDO_ENTRE_PROPUESTAS');return !shared})
  return {items,excluidasPorMotivo,...bulkTotals(items)}
}
export function bulkTotals(items:readonly Pick<BulkItem,'importeMovimientoCentimos'>[]) {
  let cargos=BigInt(0),cobros=BigInt(0)
  for(const item of items){const n=BigInt(item.importeMovimientoCentimos);if(n<0)cargos+=n;else cobros+=n}
  return {totalCargosCentimos:cargos.toString(),totalCobrosCentimos:cobros.toString()}
}
