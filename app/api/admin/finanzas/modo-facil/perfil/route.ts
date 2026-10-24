import {NextResponse} from 'next/server'
import {requireB4FinanceAccess} from '@/lib/finanzas/reconciliation-auth'
import {assertPrototypeStaging} from '@/lib/finanzas/prototype-staging'
import {isEasyOnlyStageUser,canManageEasyAutomationStage} from '@/lib/finanzas/easy-access-profile'
export const dynamic='force-dynamic'
export async function GET(){
  try{
    await assertPrototypeStaging()
    const auth=await requireB4FinanceAccess('lectura');if('response' in auth)return auth.response
    const easyOnly=await isEasyOnlyStageUser(auth.actor.id)
    const canManageAutomation=await canManageEasyAutomationStage(auth.actor.id)
    return NextResponse.json({easyOnly,canManageAutomation},{headers:{'cache-control':'private, no-store'}})
  }catch{return NextResponse.json({error:'No se pudo verificar el perfil.'},{status:403,headers:{'cache-control':'private, no-store'}})}
}
