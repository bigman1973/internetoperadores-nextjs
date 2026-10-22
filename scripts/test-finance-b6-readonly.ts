import 'dotenv/config'
import assert from 'node:assert/strict'
import prisma from '../lib/prisma'
import {readRemesasListaB6,readFacturasISPChoicesB6,readDevolucionesB4B6} from '../lib/finanzas/b6-remesas-db'
import {parseRemesasListaResponseB6,parseFacturasISPChoicesResponseB6,parseMiembrosRemesaResponseB6,parseDevolucionesB4ResponseB6} from '../components/finanzas/remesas-b6/remesas-b6-parser'

async function counts(){return Promise.all([prisma.vinculoMovimientoDocumento.count(),prisma.auditoriaRemesaB6.count(),prisma.asignacionDevolucionRemesaB6.count(),prisma.factura.count({where:{remesaId:{not:null}}})])}
async function main(){
 const before=await counts()
 const remesas=parseRemesasListaResponseB6(await readRemesasListaB6({limit:2}))
 parseFacturasISPChoicesResponseB6(await readFacturasISPChoicesB6({limit:2}))
 parseDevolucionesB4ResponseB6(await readDevolucionesB4B6({limit:2}))
 if(remesas.items[0])parseMiembrosRemesaResponseB6(await readFacturasISPChoicesB6({remesaId:remesas.items[0].id,onlyMembers:true,limit:2}))
 const last=parseFacturasISPChoicesResponseB6(await readFacturasISPChoicesB6({limit:100,offset:3500}))
 assert(last.paginacion.offset===3500,'El catálogo no puede truncarse arbitrariamente en 2000')
 assert.deepEqual(await counts(),before,'B6 lectura no puede crear asociaciones ni vínculos')
 console.log('B6: cuatro contratos reales, parseadores de UI y catálogo posterior a 2000 correctos; sin escrituras.')
}
main().catch((error)=>{console.error('B6 contrato:',error instanceof Error?error.message:'error de lectura');process.exitCode=1}).finally(()=>prisma.$disconnect())
