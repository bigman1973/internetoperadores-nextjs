import {Prisma} from '@prisma/client'
import prisma from '../lib/prisma'
import {readFileSync,writeFileSync} from 'node:fs'
import {assertPrototypeStaging} from '../lib/finanzas/prototype-staging'
import {canManageEasyAutomationStage} from '../lib/finanzas/easy-access-profile'
const apply=process.argv.includes('--apply');const restore=process.argv.includes('--restore');
async function main(){
 await assertPrototypeStaging()
 const file=process.env.FINANCE_EASY_PROFILE_TARGET_FILE;if(!file)throw Error('PRIVATE_TARGET_FILE_REQUIRED')
 const expected=JSON.parse(readFileSync(file,'utf8'))
 const actorFile=process.env.FINANCE_EASY_PROFILE_ACTOR_FILE;if(!actorFile)throw Error('PRIVATE_ACTOR_FILE_REQUIRED')
 const actor=Number(readFileSync(actorFile,'utf8').trim());if(!Number.isSafeInteger(actor)||!await canManageEasyAutomationStage(actor))throw Error('PROFILE_ACTOR_INVALID')
 const result=await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended('easy-profile:'||CAST(${expected.id} AS text),0))`
  const rows=await tx.usuarioAdmin.findMany({where:{id:expected.id,email:expected.email,nombre:expected.nombre,activo:true},select:{id:true,nombre:true,email:true,rol:true,roles:true,perfilAsignado:true,activo:true},take:2})
  if(rows.length!==1)throw Error('TARGET_IDENTITY_CHANGED')
  const before=JSON.stringify(rows[0]);
  const previous=await tx.$queryRaw<Array<{perfil:string;version:number}>>(Prisma.sql`SELECT perfil,version FROM perfiles_acceso_modo_facil WHERE usuario_id=${expected.id} ORDER BY version DESC LIMIT 1`)
  const profile=restore?'RESTABLECIDO':'MODO_FACIL_ONLY';const idem=previous[0]?.perfil===profile
  const version=idem?previous[0].version:(previous[0]?.version??0)+1
  if(!idem)await tx.$executeRaw(Prisma.sql`INSERT INTO perfiles_acceso_modo_facil(usuario_id,version,perfil,actor_id,instruccion,snapshot) VALUES(${expected.id},${version},${profile},${actor},${restore?'Restablecimiento explícito del perfil de acceso anterior en staging.':'Víctor Giró autoriza el 24/10/2026 el acceso de Lorena sólo a Modo fácil y Para pedir en staging.'},CAST(${JSON.stringify({schema:'EASY_ACCESS_STAGE_V1',previousProfile:previous[0]?.perfil??null,rolesUnchanged:true,previousUser:rows[0],scope:['modo-facil','para-pedir'],productionWrites:0})} AS jsonb))`)
  const after=await tx.usuarioAdmin.findUniqueOrThrow({where:{id:expected.id},select:{id:true,nombre:true,email:true,rol:true,roles:true,perfilAsignado:true,activo:true}})
  if(JSON.stringify(after)!==before)throw Error('USER_LEGACY_CHANGED')
  if(!apply)throw Object.assign(Error('ROLLBACK_OK'),{receipt:{stagingOnly:true,applied:false,rollback:true,idempotent:idem,profile,version,userUnchanged:true}})
  return {stagingOnly:true,applied:true,rollback:false,idempotent:idem,profile,version,userUnchanged:true}
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20000})
 return result
}
main().then(r=>{if(process.env.FINANCE_EASY_PROFILE_RECEIPT)writeFileSync(process.env.FINANCE_EASY_PROFILE_RECEIPT,JSON.stringify(r,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(r))}).catch((e:any)=>{if(e.message==='ROLLBACK_OK'){console.log(JSON.stringify(e.receipt));return}console.error('STAGING_PROFILE_STOPPED:'+e.message);process.exitCode=1}).finally(()=>prisma.$disconnect())
