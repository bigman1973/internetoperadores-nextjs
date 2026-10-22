import 'dotenv/config'
import assert from 'node:assert/strict'
import {Prisma} from '@prisma/client'
import prisma from '../lib/prisma'
import {readMonthlyInvoicing} from '../lib/finanzas/monthly-invoicing-db'
import {readFiscalEstimate} from '../lib/finanzas/fiscal-estimate-db'
import {parseMonthlyInvoicingDto} from '../components/finanzas/monthly-invoicing/response-parser'
import {parseFiscalEstimateDto} from '../components/finanzas/fiscal-estimate/response-parser'
import {facturaEconomicaWhere,facturaEconomicaSQL} from '../lib/finanzas/invoice-economic-filter'
async function run(){assert.equal(process.env.FINANCE_STAGING_SANDBOX,'1');const identity=await prisma.$queryRaw<any[]>`SELECT current_database() AS db,current_user AS usuario`;assert.equal(identity[0].db,'io_staging_finanzas');assert.equal(identity[0].usuario,'io_staging_finanzas');await prisma.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const before=await tx.vinculoMovimientoDocumento.count();for(const mes of [null,'2026-10']){const data=await readMonthlyInvoicing(tx,{mes});assert.equal(parseMonthlyInvoicingDto({recurso:'resumenFacturacionIspHistorico',query:{mes},...data}).ok,true)}const f=await readFiscalEstimate(tx,{desde:'2026-01-01',hasta:'2026-12-31'});assert.equal(parseFiscalEstimateDto({recurso:'estimacionFiscalDocumental',estimacion:f}).ok,true);const excluded=await tx.facturaRecibida.count({where:{AND:[facturaEconomicaWhere,{carpetaOrigen:{contains:'3. Confirming Draxton 2026'}}]}});assert.equal(excluded,0);const sql=await tx.$queryRaw<any[]>(Prisma.sql`SELECT count(*)::int AS n FROM facturas_recibidas fr WHERE ${facturaEconomicaSQL('fr')} AND fr.carpeta_origen ILIKE '%3. Confirming Draxton 2026%'`);assert.equal(sql[0].n,0);assert.equal(await tx.vinculoMovimientoDocumento.count(),before)},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:30000});console.log('Resúmenes y previsión fiscal: contratos reales válidos, confirming excluido y ningún vínculo creado')}
run().catch(e=>{console.error('Prueba de sólo lectura incompleta:',e.name);process.exitCode=1}).finally(()=>prisma.$disconnect())
