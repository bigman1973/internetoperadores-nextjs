import 'dotenv/config'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import prisma from '../lib/prisma'
import {readBankInvoicing} from '../lib/finanzas/bank-invoicing-db'
import {assertFinanceStagingIsolated} from '../lib/finanzas/staging-safety'
import {parseBankInvoicingDto} from '../components/finanzas/facturacion-banco/typesparser'
async function counts(){return Promise.all([prisma.facturaEmitida.count(),prisma.vinculoMovimientoDocumento.count(),prisma.eventoJustificacionB4.count(),prisma.auditoriaRemesaB6.count(),prisma.identidadFacturaISPEventoB7.count()])}
async function main(){
 await assertFinanceStagingIsolated();const before=await counts()
 const dto=await prisma.$transaction(tx=>readBankInvoicing(tx,{enabled:true,assertIsolatedStaging:async()=>{}},new URLSearchParams('limit=2')),{isolationLevel:'RepeatableRead',timeout:60000})
 const parsed=parseBankInvoicingDto(dto);if(parsed.ok===false)throw Error(parsed.error)
 assert(dto.diagnostics.ispPaymentFieldsRead===false&&dto.diagnostics.mutations===false)
 assert(dto.summary.invoicesTotal===before[0]);assert.deepEqual(await counts(),before)
 console.log('B7 lectura real: población canónica, fuentes bancarias y contrato UI comprobados; sin escrituras.')
}
main().catch(error=>{writeFileSync('/home/ubuntu/finanzas-b7-20261022/readonly-error-private.txt',error instanceof Error?error.stack??error.message:'error de lectura',{mode:0o600});console.error('B7: diagnóstico guardado de forma privada.');process.exitCode=1}).finally(()=>prisma.$disconnect())
