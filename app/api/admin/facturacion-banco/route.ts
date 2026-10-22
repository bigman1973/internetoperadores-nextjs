import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { checkAdminAreaRead } from '@/lib/api-admin-area-read'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety';
import { readBankInvoicing } from '@/lib/finanzas/bank-invoicing-db'
import { B7QueryError } from '@/lib/finanzas/bank-invoicing-contract'

export const dynamic='force-dynamic'
const headers={ 'Cache-Control':'private, no-store' }
export async function GET(request:NextRequest){
 try{
  const session=await getServerSession(authOptions)
  const denied=await checkAdminAreaRead('admin.facturacion',[],session)
  if(denied){denied.headers.set('Cache-Control',headers['Cache-Control']);return denied}
  const actor=await prisma.usuarioAdmin.findUnique({where:{id:Number(session!.user.id)},select:{activo:true}})
  if(!actor?.activo)return NextResponse.json({error:'Usuario no activo.'},{status:403,headers})
  await assertFinanceRuntimeReady()
  const data=await prisma.$transaction(tx=>readBankInvoicing(tx,{enabled:true,assertIsolatedStaging:async()=>{}},request.nextUrl.searchParams),{isolationLevel:'RepeatableRead',maxWait:10000,timeout:60000})
  return NextResponse.json(data,{headers})
 }catch(error){
  if(error instanceof B7QueryError)return NextResponse.json({error:error.message,codigo:error.code},{status:400,headers})
  console.error('Lectura B7 no completada.')
  return NextResponse.json({error:'No se pudo comprobar la facturación desde el banco. No se sustituyen los datos por ceros.'},{status:500,headers})
 }
}
