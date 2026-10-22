import 'dotenv/config'
import assert from 'node:assert/strict'
import prisma from '../lib/prisma'
import {readPendientesB5,readContadoresPendientesB5,readConfiguracionPendientesB5} from '../lib/finanzas/pending-db'
import {leerItemsB5,leerContadoresB5,leerConfiguracionB5,VISTAS_B5} from '../components/finanzas/pendientes/types'
import {assertFinanceStagingIsolated} from '../lib/finanzas/staging-safety'

async function main(){
  await assertFinanceStagingIsolated()
  const since=new Date('2026-10-01'),until=new Date('2026-10-31')
  const before=await prisma.auditoriaGestionPendienteB5.count()
  for(const vista of VISTAS_B5){
    const result=await readPendientesB5({vista,desde:since,hasta:until,limit:2})
    leerItemsB5(result)
    assert(result.total>=result.items.length)
  }
  const contadores=await readContadoresPendientesB5({desde:since,hasta:until})
  leerContadoresB5(contadores)
  leerConfiguracionB5(await readConfiguracionPendientesB5())
  for(const tarjeta of ['9029','6440','2390','8964'])leerItemsB5(await readPendientesB5({vista:'CARGOS_SIN_DOCUMENTO',tarjeta,limit:1}))
  assert.equal(await prisma.auditoriaGestionPendienteB5.count(),before)
  console.log('B5: cuatro vistas, contadores, configuración y filtros de tarjetas cumplen el contrato UI. Sin escrituras.')
}
main().catch(error=>{console.error('Lectura B5 rechazada:',error instanceof Error?error.message:'Error');process.exitCode=1}).finally(()=>prisma.$disconnect())
