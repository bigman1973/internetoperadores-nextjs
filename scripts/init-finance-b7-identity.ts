import 'dotenv/config'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import prisma from '../lib/prisma'
import {assertFinanceStagingIsolated} from '../lib/finanzas/staging-safety'
import {Prisma} from '@prisma/client'

type IdentityRow={fiId:string;ispId:number;idExterno:string;fecha:string;numero:string;serie:string|null;cliente:string;cif:string|null;totalCentimos:number}
function hash(v:unknown){return createHash('sha256').update(JSON.stringify(v)).digest('hex')}
async function digest(tx:Prisma.TransactionClient,table:'facturas_emitidas'|'facturas'){
 const projection=table==='facturas_emitidas'?"to_jsonb(t)-'factura_isp_id'":"to_jsonb(t)"
 const [v]=await tx.$queryRawUnsafe<Array<{s:string}>>(`SELECT COALESCE(jsonb_agg(x.r ORDER BY x.r::text),'[]'::jsonb)::text AS s FROM(SELECT ${projection} AS r FROM ${table} t)x`)
 return hash(v.s)
}
async function main(){
 const apply=process.argv.includes('--apply');const actorArg=process.argv.find(x=>x.startsWith('--actor='));const actorId=Number(actorArg?.slice(8))
 if(apply&&(!Number.isSafeInteger(actorId)||actorId<=0))throw Error('Actor verificado obligatorio')
 await assertFinanceStagingIsolated()
 const result=await prisma.$transaction(async tx=>{
  if(apply){
   const actors=await tx.$queryRaw<Array<{id:number}>>`SELECT id FROM usuarios_admin WHERE id=${actorId} AND activo AND rol='SUPER_ADMIN' FOR SHARE`
   if(actors.length!==1)throw Error('Actor no autorizado')
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('B7_FI_ISP_IDENTIDAD_EXACTA'))`
  }
  const before=await Promise.all([digest(tx,'facturas_emitidas'),digest(tx,'facturas')])
  const rows=await tx.$queryRaw<IdentityRow[]>`
   SELECT fi.id AS "fiId",f.id AS "ispId",fi.id_externo AS "idExterno",fi.fecha::date::text AS fecha,
    fi.num_factura AS numero,fi.serie,fi.cliente,fi.cif,b4_importe_bancario_centimos(fi.total) AS "totalCentimos"
   FROM facturas_emitidas fi JOIN facturas f ON fi.origen_sistema='ISPGestion' AND fi.id_externo=f.isp_gestion_id::text
   WHERE fi.factura_isp_id IS NULL AND f.isp_gestion_id>0 AND b4_importe_bancario_centimos(fi.total) IS NOT NULL
    AND f.total*100=b4_importe_bancario_centimos(fi.total)
    AND fi.fecha::date=f.fecha::date AND fi.num_factura IS NOT DISTINCT FROM f.numero_documento
    AND fi.serie IS NOT DISTINCT FROM f.serie_factura AND fi.cliente IS NOT DISTINCT FROM f.nombre_completo
    AND fi.cif IS NOT DISTINCT FROM f.nif_cif
    AND NOT EXISTS(SELECT 1 FROM facturas_emitidas otra WHERE otra.factura_isp_id=f.id AND otra.id<>fi.id)
   ORDER BY fi.id FOR UPDATE OF fi`
  if(apply&&rows.length){
   const events=rows.map(row=>({id:randomUUID(),factura_emitida_id:row.fiId,factura_isp_id:row.ispId,actor_id:actorId,fuente_hash:hash(row),snapshot:{...row,noAcreditaCobro:true,origenVerificado:'ISPGestion.idExterno=Factura.ispGestionId'}}))
   await tx.$executeRaw(Prisma.sql`INSERT INTO identidad_factura_isp_eventos_b7(id,factura_emitida_id,factura_isp_id,actor_id,fuente_hash,snapshot)
    SELECT x.id::uuid,x.factura_emitida_id,x.factura_isp_id,x.actor_id,x.fuente_hash,x.snapshot
    FROM jsonb_to_recordset(${JSON.stringify(events)}::jsonb) AS x(id text,factura_emitida_id text,factura_isp_id integer,actor_id integer,fuente_hash text,snapshot jsonb)`)
   const updated=await tx.$executeRaw(Prisma.sql`UPDATE facturas_emitidas fi SET factura_isp_id=x.factura_isp_id
    FROM jsonb_to_recordset(${JSON.stringify(events.map(x=>({factura_emitida_id:x.factura_emitida_id,factura_isp_id:x.factura_isp_id})))}::jsonb) AS x(factura_emitida_id text,factura_isp_id integer)
    WHERE fi.id=x.factura_emitida_id AND fi.factura_isp_id IS NULL`)
   assert(updated===rows.length)
   await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
  }
  assert.deepEqual(await Promise.all([digest(tx,'facturas_emitidas'),digest(tx,'facturas')]),before,'Se alteraron campos originales distintos de la FK de identidad')
  return {eligible:rows.length,zero:rows.filter(x=>x.totalCentimos===0).length}
 },{isolationLevel:'Serializable',maxWait:10000,timeout:180000})
 console.log(`B7 identidad ${apply?'aplicada':'dry-run'}: ${result.eligible} fuentes exactas (${result.zero} con total cero conocido). Sin modificar importes, fechas, estados de cobro o vínculos bancarios.`)
}
main().catch(error=>{console.error('B7 identidad no completada:',error instanceof Error?error.name:'error');process.exitCode=1}).finally(()=>prisma.$disconnect())
