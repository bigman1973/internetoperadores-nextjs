import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { assertPrototypeStaging } from '@/lib/finanzas/prototype-staging'
import { EASY_ONLY_PROFILE } from '@/lib/finanzas/easy-access-core'

export async function isEasyOnlyStageUser(userId:number):Promise<boolean>{
  if(process.env.FINANCE_STAGING_SANDBOX!=='1'||process.env.VERCEL_ENV==='production')return false
  if(!Number.isSafeInteger(userId)||userId<=0)throw Error('ACCESS_ACTOR_INVALID')
  await assertPrototypeStaging()
  const rows=await prisma.$queryRaw<Array<{perfil:string}>>(Prisma.sql`SELECT perfil FROM perfiles_acceso_modo_facil WHERE usuario_id=${userId} ORDER BY version DESC LIMIT 1`)
  return rows[0]?.perfil===EASY_ONLY_PROFILE
}
export async function canManageEasyAutomationStage(userId:number):Promise<boolean>{
  await assertPrototypeStaging()
  if(await isEasyOnlyStageUser(userId))return false
  const user=await prisma.usuarioAdmin.findUnique({where:{id:userId},select:{activo:true,rol:true}})
  return !!user?.activo&&['SUPER_ADMIN','GERENTE'].includes(user.rol)
}
