import assert from 'node:assert/strict'
import {Prisma} from '@prisma/client'
import prisma from '../lib/prisma'
import {readFileSync} from 'node:fs'
import {isEasyOnlyStageUser,canManageEasyAutomationStage} from '../lib/finanzas/easy-access-profile'
import {assertPrototypeStaging} from '../lib/finanzas/prototype-staging'
async function main(){
 await assertPrototypeStaging()
 const target=JSON.parse(readFileSync(process.env.FINANCE_EASY_PROFILE_TARGET_FILE!,'utf8'))
 const actor=Number(readFileSync(process.env.FINANCE_EASY_PROFILE_ACTOR_FILE!,'utf8').trim())
 assert(await isEasyOnlyStageUser(target.id));assert.equal(await canManageEasyAutomationStage(target.id),false);assert(await canManageEasyAutomationStage(actor))
 const previous=await prisma.usuarioAdmin.findUniqueOrThrow({where:{id:target.id},select:{rol:true,roles:true,perfilAsignado:true,email:true,nombre:true}})
 try{await prisma.$transaction(async tx=>{
  const initial=await tx.$queryRaw<Array<any>>`SELECT id::text,version FROM perfiles_acceso_modo_facil WHERE usuario_id=${target.id} ORDER BY version DESC LIMIT 1`
  await tx.$executeRawUnsafe('SAVEPOINT immutable_profile')
  await assert.rejects(()=>tx.$executeRaw`UPDATE perfiles_acceso_modo_facil SET perfil='RESTABLECIDO' WHERE id=CAST(${initial[0].id} AS uuid)`)
  await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT immutable_profile')
  await tx.$executeRawUnsafe('SAVEPOINT immutable_delete')
  await assert.rejects(()=>tx.$executeRaw`DELETE FROM perfiles_acceso_modo_facil WHERE id=CAST(${initial[0].id} AS uuid)`)
  await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT immutable_delete')
  await tx.$executeRaw(Prisma.sql`INSERT INTO perfiles_acceso_modo_facil(usuario_id,version,perfil,actor_id,instruccion,snapshot) VALUES(${target.id},${initial[0].version+1},'RESTABLECIDO',${actor},'Ensayo reversible bajo rollback, no restablece permisos reales.', '{}'::jsonb) RETURNING version`)
  const inside=await tx.$queryRaw<Array<any>>`SELECT perfil FROM perfiles_acceso_modo_facil WHERE usuario_id=${target.id} ORDER BY version DESC LIMIT 1`;assert.equal(inside[0].perfil,'RESTABLECIDO')
  throw Error('EXPECTED_ROLLBACK')
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20000})}catch(e:any){if(e.message!=='EXPECTED_ROLLBACK')throw e}
 assert(await isEasyOnlyStageUser(target.id));const after=await prisma.usuarioAdmin.findUniqueOrThrow({where:{id:target.id},select:{rol:true,roles:true,perfilAsignado:true,email:true,nombre:true}});assert.deepEqual(after,previous)
 console.log(JSON.stringify({passed:true,stagingOnly:true,liveProfileChecked:true,staleManagerRoleCannotAutomate:true,appendOnly:true,rollback:true,originalUserUnchanged:true}))
}
main().catch(e=>{console.error('EASY_ACCESS_POSTGRES_FAILED:'+e.message);process.exitCode=1}).finally(()=>prisma.$disconnect())
