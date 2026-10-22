import prisma from '@/lib/prisma'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety';
export async function readPendingAttachments(movimientoId:string){
  if(!movimientoId||movimientoId.trim()!==movimientoId||movimientoId.length>160)throw Error('INVALID_MOVEMENT_ID')
  await assertFinanceRuntimeReady()
  const rows=await prisma.adjuntoPendienteB5.findMany({where:{movimientoId},select:{id:true,tipoDocumento:true,estado:true,nombreTercero:true,concepto:true,fechaDocumento:true,importeDocumentoCentimos:true,storageName:true,authenticatedWebUrl:true,documentoConciliableId:true,createdAt:true},orderBy:{createdAt:'desc'},take:50})
  return {adjuntos:rows.map(row=>({...row,fechaDocumento:row.fechaDocumento?.toISOString().slice(0,10)??null,createdAt:row.createdAt.toISOString()}))}
}
