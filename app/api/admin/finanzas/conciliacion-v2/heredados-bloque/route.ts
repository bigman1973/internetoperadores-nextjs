import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson,requireB4FinanceAccess,sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import { B4ServiceError } from '@/lib/finanzas/reconciliation-db'
import { readHistoricalBulkPreview,runHistoricalBulk } from '@/lib/finanzas/historical-bulk-db'
export const dynamic='force-dynamic'
export const maxDuration=180
const error=(e:unknown)=>e instanceof B4ServiceError?privateJson({error:e.message,codigo:e.code},e.status):['P2002','P2034','40P01'].includes(String((e as any)?.code))?privateJson({error:'Conflicto concurrente: vuelva a revisar las propuestas. No se ha confirmado el bloque.',codigo:'CONCURRENT_CONFLICT'},409):privateJson({error:'No se pudo completar el bloque; compruebe su estado antes de reintentar.',codigo:'HISTORICAL_BULK_FAILED'},500)
export async function GET(req:NextRequest){
 try{
  const access=await requireB4FinanceAccess('lectura',await getServerSession(authOptions));if('response'in access)return access.response
  const p=req.nextUrl.searchParams
  const limit=p.get('limit')??'25',offset=p.get('offset')??'0',cuentaId=p.get('cuentaId')??undefined,q=p.get('q')?.trim()||undefined
  if(!/^\d{1,2}$/.test(limit)||Number(limit)<1||Number(limit)>25||!/^\d{1,5}$/.test(offset)||Number(offset)>10000||cuentaId!==undefined&&(!cuentaId||cuentaId.length>160)||q!==undefined&&q.length>120)return privateJson({error:'Parámetro de revisión en bloque no válido.'},400)
  return privateJson(await readHistoricalBulkPreview({limit:Number(limit),offset:Number(offset),cuentaId,q},access.actor.id))
 }catch(e){return error(e)}
}
export async function POST(req:NextRequest){
 try{
  const access=await requireB4FinanceAccess('escritura',await getServerSession(authOptions));if('response'in access)return access.response
  if(!sameOrigin(req))return privateJson({error:'Origen de solicitud no válido.'},403)
  if(req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return privateJson({error:'Se requiere application/json.'},415)
  const length=req.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>65536))return privateJson({error:'Cuerpo demasiado grande.'},413)
  if(!req.body)return privateJson({error:'Cuerpo vacío.'},400)
  const reader=req.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text=''
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536){await reader.cancel();return privateJson({error:'Cuerpo demasiado grande.'},413)}text+=decoder.decode(part.value,{stream:true})}text+=decoder.decode()}catch{return privateJson({error:'JSON no válido.'},400)}
  let body:unknown;try{body=JSON.parse(text)}catch{return privateJson({error:'JSON no válido.'},400)}
  return privateJson(await runHistoricalBulk(access.actor.id,body))
 }catch(e){return error(e)}
}
export async function PUT(){return privateJson({error:'Método no permitido.'},405)}
export async function PATCH(){return privateJson({error:'Método no permitido.'},405)}
export async function DELETE(){return privateJson({error:'Método no permitido.'},405)}
