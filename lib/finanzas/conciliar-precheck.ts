/** G7 universal. A green badge is an assertion, never financial authority.
 * All paths call these same read-only validators; action services retain locks
 * and repeat the predicates before writing. No browser amount/source is trusted. */
import { Prisma } from '@prisma/client'
import type { ConciliarProjectionSource, ConciliarRow } from './conciliar-contract'
import { ConciliarDbError } from './conciliar-errors'
import { assertLiveCollectionProjectionForActionTx } from './conciliar-db'
import { projectionRow, type ProjectionSqlRow } from './conciliar-projection-read'
import { preflightConciliarBankFeeTx, preflightConciliarReceivedInvoiceTx, preflightConciliarPayrollTx, preflightConciliarConfirmingTx, preflightConciliarB5TicketTx, preflightConciliarLifecycleTx } from './conciliar-confirm-validators'
import { preflightB4DraftTx, preflightB4SourceLinesTx, B4ServiceError } from './reconciliation-db'
import { EasyReconciliationServiceError } from './easy-reconciliation-db'
import { EasyCollectionsServiceError, preflightEasyCollectionSelectionTx } from './easy-collections-db'
import { preflightRemittanceReceiptTx, RemittancePaymentReceiptError } from './remittance-payment-receipts-db'
import { preflightConciliarStrictTransferTx } from './conciliar-transfers'
import { preflightConciliarHumanOwnTransferTx } from './conciliar-human-own-transfer'
import { ConciliarConfirmingServiceError } from './conciliar-confirming'
import { ArchivoFinancieroAssertError } from './archivo-financiero-assert'
import { conciliarDecisionHash } from './conciliar-core'

import { CONCILIAR_PRECHECK_KINDS } from './conciliar-precheck-kinds'
export { CONCILIAR_PRECHECK_KINDS } from './conciliar-precheck-kinds'
export type ConciliarPrecheckRow = Omit<ConciliarRow,'decisionHash'> & {source:ConciliarProjectionSource; decisionHash?:string; sourceFingerprint?:string}
export type ConciliarPrecheck = Readonly<{schema:'CONCILIAR_PRECHECK_V1'; confirmable:boolean; mode:'ESTANDAR'|'PAREJA_HUMANA'|'ENLACE'|'BLOQUEADA'; code:string; motivo:string}>
type Tx = Prisma.TransactionClient & Record<string, any>
export type ConciliarPrecheckContext = Readonly<{ rows?:ReadonlyMap<string,ConciliarPrecheckRow>; visited?:ReadonlySet<string> }>
const pass = (mode:ConciliarPrecheck['mode']):ConciliarPrecheck => ({schema:'CONCILIAR_PRECHECK_V1',confirmable:true,mode,code:'CONFIRMABLE',motivo:'Comprobado con las fuentes actuales del servidor.'})
const blocked = (code:string,motivo:string):ConciliarPrecheck => ({schema:'CONCILIAR_PRECHECK_V1',confirmable:false,mode:'BLOQUEADA',code,motivo})
const movementRequired = (row:ConciliarPrecheckRow):string => {
  if(!row.source.movimientoId || row.source.movimientoId!==row.movimientoId) throw new ConciliarDbError(409,'FILA_SIN_MOVIMIENTO','Falta el movimiento bancario que corresponde a esta fila.')
  return row.source.movimientoId
}
function noDocumentDraft(movimientoId:string, importeCentimos:number, version:number, fee=false) {
  return {version,borrador:{movimientoId,importeMovimientoCentimos:importeCentimos,estado:'NO_REQUIERE',motivoNoRequiere:fee?'COMISION_BANCARIA':'TRASPASO_INTERNO_SIN_DOCUMENTO',lineas:[]}}
}
function knownFinancialFailure(error:unknown):boolean {
  return error instanceof ConciliarDbError || error instanceof B4ServiceError || error instanceof EasyReconciliationServiceError || error instanceof EasyCollectionsServiceError || error instanceof RemittancePaymentReceiptError || error instanceof ConciliarConfirmingServiceError || error instanceof ArchivoFinancieroAssertError
}
const PRECHECK_ADMINISTRATIVE_REASON='La documentación o el movimiento ya no permiten confirmar esta fila. Actualiza la lista y revisa la propuesta.'
function missingRemittanceReceiptCount(value:unknown):number|null {
  return Number.isSafeInteger(value) && Number(value)>0 ? Number(value) : null
}
/** The only dynamic G7 motive is the reviewed Area 3 missing-receipts count.
 * Accept it only from the exact map failure plus bounded metadata or its closed
 * server template; all other provider/B4/B6 messages remain private. */
export function conciliarPrecheckFailureReason(error:unknown):string {
  if(!(error instanceof ConciliarDbError || error instanceof RemittancePaymentReceiptError)
    || error.code!=='MAPA_FI_ISP_REMESA_INEXACTO') return PRECHECK_ADMINISTRATIVE_REASON
  const details=error instanceof RemittancePaymentReceiptError && error.details && typeof error.details==='object' && !Array.isArray(error.details)
    ? error.details as Record<string,unknown> : null
  const fromDetails=missingRemittanceReceiptCount(details?.missingReceiptCount)
  if(fromDetails!==null) return `Falta enlazar ${fromDetails} recibos.`
  const match=/^Falta enlazar ([1-9]\d*) recibos\.(?: La confirmación requiere el enlace FI–ISP explícito y vigente\.)?$/.exec(error.message)
  const fromMessage=missingRemittanceReceiptCount(match?.[1]===undefined ? null : Number(match[1]))
  return fromMessage===null ? PRECHECK_ADMINISTRATIVE_REASON : `Falta enlazar ${fromMessage} recibos.`
}
/** Unknown errors propagate: an unavailable server is never converted to green. */
export async function precheckConciliarRowTx(base:Prisma.TransactionClient,row:ConciliarPrecheckRow,context:ConciliarPrecheckContext={}):Promise<ConciliarPrecheck> {
  const tx=base as Tx
  if(!(CONCILIAR_PRECHECK_KINDS as readonly string[]).includes(row.source.kind)) return blocked('TIPO_NO_ADMITIDO','Esta fila no tiene una confirmación disponible.')
  if(row.color!=='VERDE') return blocked('REVISION_REQUERIDA',row.motivo || 'Esta fila necesita revisión antes de confirmar.')
  if(context.visited?.has(row.id)) return blocked('ENLACE_CIRCULAR','No se puede comprobar el movimiento propuesto para este documento.')
  try {
    // Documentary mirrors remain non-selectable. Their exact linked bank row
    // must pass the SAME financial check, not merely carry another green badge.
    if(row.source.kind==='PENDIENTE_FACTURA_EMITIDA' || (row.source.kind==='PAGO_FACTURA_RECIBIDA' && !row.source.movimientoId)) {
      if(row.seleccionable || row.linksMovimiento?.length!==1) return blocked('ENLACE_NO_UNICO','Falta un movimiento único y comprobable para este documento.')
      const linkedId=row.linksMovimiento[0].id
      const stored=context.rows?.get(linkedId)
      const loaded=stored ? [] : await tx.$queryRaw<ProjectionSqlRow[]>(Prisma.sql`SELECT * FROM conciliar_proyecciones WHERE id=${linkedId} LIMIT 2`)
      const linked=stored ?? (loaded.length===1 ? projectionRow(loaded[0]) : null)
      if(!linked || linked.color!=='VERDE' || (row.source.facturaRecibidaId && linked.source.facturaRecibidaId!==row.source.facturaRecibidaId)
        || (row.source.kind==='PENDIENTE_FACTURA_EMITIDA' && linked.source.kind!=='COBRO_PROPUESTA' && linked.source.kind!=='COBRO_CONFIRMING')) return blocked('ENLACE_CAMBIADO','El movimiento propuesto ya no coincide con este documento. Actualiza la lista.')
      const decision=await precheckConciliarRowTx(base,linked,{...context,visited:new Set([...(context.visited??[]),row.id])})
      return decision.confirmable ? pass('ENLACE') : decision
    }
    const movimientoId=movementRequired(row),version=row.source.versionB4
    if(!Number.isSafeInteger(version) || Number(version)<1) return blocked('VERSION_OBSOLETA','El movimiento cambió desde que se preparó la fila. Actualiza la lista.')
    await preflightConciliarLifecycleTx(tx,row.source)
    switch(row.source.kind) {
      case 'COMISION_BANCARIA': {
        await preflightConciliarBankFeeTx(tx,row)
        await preflightB4DraftTx(tx,noDocumentDraft(movimientoId,row.importeCentimos,version!,true))
        return pass('ESTANDAR')
      }
      case 'PAGO_FACTURA_RECIBIDA': {
        await preflightConciliarReceivedInvoiceTx(tx,row)
        await preflightB4SourceLinesTx(tx,{movimientoId,importeCentimos:row.importeCentimos,version:version!,lineas:[{tipo:'DOCUMENTO',tipoDocumento:'FACTURA_RECIBIDA',sourceId:row.source.facturaRecibidaId!,importeCentimos:row.importeCentimos}]})
        return pass('ESTANDAR')
      }
      case 'PAGO_TICKET_B5': {
        await preflightConciliarB5TicketTx(tx,row)
        await preflightB4SourceLinesTx(tx,{movimientoId,importeCentimos:row.importeCentimos,version:version!,lineas:[{tipo:'DOCUMENTO',tipoDocumento:'TICKET',sourceId:row.source.gastoId!,importeCentimos:row.importeCentimos}]})
        return pass('ESTANDAR')
      }
      case 'PAGO_NOMINA': {
        await preflightConciliarPayrollTx(tx,row)
        await preflightB4SourceLinesTx(tx,{movimientoId,importeCentimos:row.importeCentimos,version:version!,lineas:[{tipo:'DOCUMENTO',tipoDocumento:'NOMINA',sourceId:row.source.nominaId!,importeCentimos:row.importeCentimos}]})
        return pass('ESTANDAR')
      }
      case 'COBRO_CONFIRMING': {
        const candidate=await preflightConciliarConfirmingTx(tx,row)
        await preflightB4DraftTx(tx,{version:version!,borrador:{movimientoId,importeMovimientoCentimos:row.importeCentimos,estado:'JUSTIFICADO',lineas:candidate.lineasB4.map(line=>line.tipo==='DOCUMENTO'?{tipo:'DOCUMENTO',documentoConciliableId:line.documentoConciliableId!,importeCentimos:line.importeCentimos}:{tipo:'DIFERENCIA',motivoDiferencia:line.motivoDiferencia,importeCentimos:line.importeCentimos})}})
        return pass('ESTANDAR')
      }
      case 'COBRO_PROPUESTA': {
        await assertLiveCollectionProjectionForActionTx(tx,row,false)
        if(!row.source.propuestaId || !row.source.proposalFingerprint) return blocked('PROPUESTA_INCOMPLETA','El cobro ya no conserva su propuesta completa.')
        const selection={propuestaId:row.source.propuestaId,movimientoId,fingerprint:row.source.proposalFingerprint}
        if(row.source.remesaId) {
          if(!row.source.proposalCompositionHash) return blocked('COMPOSICION_INCOMPLETA','Falta comprobar la composición completa de la remesa.')
          await preflightRemittanceReceiptTx(tx,selection,row.source.proposalCompositionHash)
          await preflightB4SourceLinesTx(tx,{movimientoId,importeCentimos:row.importeCentimos,version:version!,lineas:[{tipo:'DOCUMENTO',tipoDocumento:'REMESA',sourceId:String(row.source.remesaId),importeCentimos:row.importeCentimos}]})
        } else {
          const proposal=await preflightEasyCollectionSelectionTx(tx,selection)
          if(proposal.version!==version) return blocked('VERSION_OBSOLETA','El cobro cambió. Actualiza la lista.')
          await preflightB4SourceLinesTx(tx,{movimientoId,importeCentimos:row.importeCentimos,version:version!,lineas:proposal.lineas})
        }
        return pass('ESTANDAR')
      }
      case 'TRANSFERENCIA_PROPIA': {
        const pair=await preflightConciliarStrictTransferTx(tx,row.source,row.importeCentimos)
        for(const leg of pair) await preflightB4DraftTx(tx,noDocumentDraft(leg.id,leg.amount,leg.version))
        return pass('ESTANDAR')
      }
      case 'TRANSFERENCIA_PROPIA_MANUAL': {
        if(row.seleccionable) return blocked('PAREJA_ACCION_SEPARADA','La pareja propia requiere su confirmación humana separada.')
        const pair=await preflightConciliarHumanOwnTransferTx(tx,row.source,row.importeCentimos)
        for(const leg of [pair.primary,pair.paired]) await preflightB4DraftTx(tx,noDocumentDraft(leg.id,leg.importeCentimos,leg.versionB4))
        return pass('PAREJA_HUMANA')
      }
      default: return blocked('TIPO_NO_CONFIRMABLE','Esta fila necesita una revisión antes de confirmar.')
    }
  } catch(error:unknown) {
    if(!knownFinancialFailure(error)) throw error
    const code=error && typeof error==='object' && 'code' in error ? String(error.code) : 'FUENTE_CAMBIADA'
    // Do not expose B4/B6/C11, SQL, wrapper or ledger jargon as a user motive.
    return blocked(code,conciliarPrecheckFailureReason(error))
  }
}
/** Only downgrades. Never promotes amber, never acknowledges a warning. */
export async function guardConciliarGreenRowTx<T extends ConciliarPrecheckRow>(tx:Prisma.TransactionClient,row:T,context:ConciliarPrecheckContext={}):Promise<T> {
  if(row.color!=='VERDE') return row
  const result=await precheckConciliarRowTx(tx,row,context)
  if(result.confirmable) return row
  const {accionHumana:_human,...withoutHuman}=row
  const next={...withoutHuman,color:'AMBAR' as const,seleccionable:false,motivo:result.motivo}
  if(row.sourceFingerprint) next.decisionHash=conciliarDecisionHash({row:next,source:row.source,sourceFingerprint:row.sourceFingerprint})
  return next as T
}
export async function assertConciliarGreenPrecheckTx(tx:Prisma.TransactionClient,row:ConciliarPrecheckRow) {
  const result=await precheckConciliarRowTx(tx,row)
  if(!result.confirmable) throw new ConciliarDbError(422,result.code,result.motivo)
  return result
}
