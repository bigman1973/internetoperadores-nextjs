import 'dotenv/config'
import {Prisma} from '@prisma/client'
import prisma from '../lib/prisma'
import {assertFinanceStagingIsolated} from '../lib/finanzas/staging-safety'
import {requireB4ActorAccess} from '../lib/finanzas/reconciliation-auth'

function arg(name:string){const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined}
async function main(){
  await assertFinanceStagingIsolated()
  const actorId=Number(arg('--actor')),victorId=Number(arg('--victor')),davidId=Number(arg('--david'))
  if(![actorId,victorId,davidId].every(id=>Number.isInteger(id)&&id>0)||victorId===davidId)throw Error('IDs explícitos válidos y distintos requeridos')
  const access=await requireB4ActorAccess(actorId,'escritura')
  if(access.ok===false)throw Error('Actor sin escritura financiera activa')
  const ids=[...new Set([actorId,victorId,davidId])]
  const active=await prisma.usuarioAdmin.findMany({where:{id:{in:ids},activo:true},select:{id:true},take:3})
  if(active.length!==ids.length)throw Error('Titular o actor inactivo/inexistente')
  const cards=[{last4:'9029',titularAdminId:victorId},{last4:'6440',titularAdminId:davidId},{last4:'2390',titularAdminId:null},{last4:'8964',titularAdminId:null}]
  const existing=await prisma.tarjetaFinancieraB5.findMany({select:{last4:true,titularAdminId:true},take:4})
  for(const card of existing){if(cards.find(c=>c.last4===card.last4)?.titularAdminId!==card.titularAdminId)throw Error('Conflicto de configuración: no se modifica un registro previo')}
  if(!process.argv.includes('--apply')){console.log('B5 tarjetas: simulación; sin escrituras.');return}
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('FINANCE_B5_CARD_CONFIG',0))::text`
    const current=await tx.tarjetaFinancieraB5.findMany({select:{last4:true,titularAdminId:true},take:4})
    for(const card of current){if(cards.find(c=>c.last4===card.last4)?.titularAdminId!==card.titularAdminId)throw Error('Conflicto concurrente de configuración')}
    await tx.tarjetaFinancieraB5.createMany({data:cards.map(c=>({...c,registradaPorId:actorId})),skipDuplicates:true})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
  console.log('B5: cuatro tarjetas registradas; dos titulares verificados y dos sin asignar. Idempotencia conservada.')
}
main().catch(()=>{console.error('Inicialización B5 rechazada; revise destino, actor e IDs explícitos.');process.exitCode=1}).finally(()=>prisma.$disconnect())
