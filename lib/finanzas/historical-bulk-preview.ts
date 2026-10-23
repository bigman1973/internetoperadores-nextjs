import { createHmac,timingSafeEqual } from 'node:crypto'
import { bulkTotals,type BulkItem } from './historical-bulk-core'
export const PREVIEW_TOKEN_MAX=24000
const secret=()=>{const value=process.env.NEXTAUTH_SECRET;if(!value||value.length<24)throw new Error('HISTORICAL_PREVIEW_SECRET_UNAVAILABLE');return value}
const sign=(value:string)=>createHmac('sha256',secret()).update('historical-bulk-preview:v1:'+value).digest('base64url')
export function signHistoricalBulkPreview(actorId:number,items:readonly BulkItem[],now=Date.now()){
 const body=Buffer.from(JSON.stringify({v:1,actorId,issued:now,expires:now+15*60*1000,items:items.map(({historicoId,movimientoId,fingerprint,importeMovimientoCentimos})=>({historicoId,movimientoId,fingerprint,importeMovimientoCentimos})),...bulkTotals(items)})).toString('base64url')
 const token=body+'.'+sign(body);if(token.length>PREVIEW_TOKEN_MAX)throw Error('HISTORICAL_PREVIEW_TOO_LARGE');return token
}
export function verifyHistoricalBulkPreview(token:string,actorId:number,selected:readonly {historicoId:string;movimientoId:string;fingerprint:string}[],now=Date.now()):boolean {
 try{
  if(typeof token!=='string'||token.length>PREVIEW_TOKEN_MAX||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return false
  const [body,mac]=token.split('.'),actual=Buffer.from(mac,'base64url'),expected=Buffer.from(sign(body),'base64url')
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return false
  const receipt=JSON.parse(Buffer.from(body,'base64url').toString('utf8'))
  if(receipt.v!==1||receipt.actorId!==actorId||!Number.isSafeInteger(receipt.expires)||!Number.isSafeInteger(receipt.issued)||receipt.issued>now||receipt.expires<now||receipt.expires-receipt.issued!==15*60*1000||!Array.isArray(receipt.items)||receipt.items.length>25)return false
  const totals=bulkTotals(receipt.items);if(totals.totalCargosCentimos!==receipt.totalCargosCentimos||totals.totalCobrosCentimos!==receipt.totalCobrosCentimos)return false
  return selected.length>0&&selected.length<=25&&selected.every(item=>receipt.items.some((known:any)=>known.historicoId===item.historicoId&&known.movimientoId===item.movimientoId&&known.fingerprint===item.fingerprint))
 }catch{return false}
}
