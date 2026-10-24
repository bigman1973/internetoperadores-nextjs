import {NextRequest,NextResponse} from 'next/server'
import {Prisma} from '@prisma/client'
import prisma from '@/lib/prisma'
import {assertPrototypeStaging} from '@/lib/finanzas/prototype-staging'
import {requireB4FinanceAccess} from '@/lib/finanzas/reconciliation-auth'
export const dynamic='force-dynamic'
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'cache-control':'private, no-store'}})
const mask=(v:unknown)=>typeof v==='string'?v.replace(/\b[A-Z]{2}\d{2}(?:[\s-]?\d){12,30}\b/gi,'[IBAN ocultado]').replace(/\b\d{13,19}\b/g,'[referencia larga ocultada]').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[correo ocultado]'):''
function day(v:string){return /^2026-\d{2}-\d{2}$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v}
export async function GET(req:NextRequest){
 try{
  await assertPrototypeStaging();const auth=await requireB4FinanceAccess('lectura');if('response' in auth)return auth.response
  const p=req.nextUrl.searchParams,tarjeta=p.get('tarjeta')??'',desde=p.get('desde')??'2026-01-01',hasta=p.get('hasta')??'2026-10-08',ls=p.get('limit')??'100',os=p.get('offset')??'0';
  if(!['2390','8964'].includes(tarjeta)||!day(desde)||!day(hasta)||desde>hasta||!/^\d{1,3}$/.test(ls)||!/^\d{1,5}$/.test(os))return json({error:'Parámetros no válidos.'},400)
  const limit=Number(ls),offset=Number(os);if(limit<1||limit>100||offset>10000)return json({error:'Paginación no válida.'},400)
  const pattern=`(?:[*]{1,12}[[:space:]]*|[xX]{2,12}[[:space:]]*|TARJETA[[:space:]]+(?:NUMERO[[:space:]]*|N[º°.][[:space:]]*)?)${tarjeta}([^0-9]|$)`
  const where=Prisma.sql`m.fecha_operacion>=CAST(${desde} AS date) AND m.fecha_operacion<CAST(${hasta} AS date)+interval '1 day' AND b4_importe_bancario_centimos(m.importe)<0 AND concat_ws(' ',m.concepto,m.referencia,m.info_adicional) ~* ${pattern}`
  const result=await prisma.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
   const counts=await tx.$queryRaw<Array<any>>(Prisma.sql`SELECT COUNT(*)::int AS total,COALESCE(SUM(b4_importe_bancario_centimos(m.importe)),0)::bigint::text AS cents FROM movimientos_bancarios m WHERE ${where} LIMIT 1`)
   const accounts=await tx.$queryRaw<Array<any>>(Prisma.sql`SELECT DISTINCT c.banco,c.alias,RIGHT(regexp_replace(c.iban,'[^0-9A-Z]','','g'),4) AS last4 FROM movimientos_bancarios m JOIN cuentas_bancarias c ON c.id=m.cuenta_id WHERE ${where} ORDER BY c.banco,c.alias LIMIT 50`)
   const rows=await tx.$queryRaw<Array<any>>(Prisma.sql`SELECT m.fecha_operacion::date::text AS fecha,c.banco,c.alias,m.concepto,b4_importe_bancario_centimos(m.importe) AS cents,COALESCE(e.estado::text,'SIN_DOCUMENTO') AS estado FROM movimientos_bancarios m JOIN cuentas_bancarias c ON c.id=m.cuenta_id LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id WHERE ${where} ORDER BY abs(b4_importe_bancario_centimos(m.importe)::bigint) DESC,m.fecha_operacion DESC,m.id ASC LIMIT ${limit} OFFSET ${offset}`)
   return {counts:counts[0],accounts,rows}
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:20000})
  return json({stagingOnly:true,tarjeta,periodo:{desde,hasta},total:result.counts?.total??0,importeCargosCentimos:result.counts?.cents??'0',cuentas:result.accounts.map(c=>({banco:c.banco,alias:mask(c.alias)||null,ibanUltimos4:c.last4})),movimientos:result.rows.map(r=>({fecha:r.fecha,banco:r.banco,cuentaAlias:mask(r.alias)||null,concepto:mask(r.concepto),importeCentimos:Number(r.cents),estadoDocumento:r.estado})),limit,offset})
 }catch{return json({error:'No se pudieron consultar los cargos de las tarjetas.'},503)}
}
