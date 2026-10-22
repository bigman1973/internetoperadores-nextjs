import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { facturaEconomicaSQL, facturaEconomicaWhere, facturaNoConfirmingDraxtonWhere } from '../lib/finanzas/invoice-economic-filter'
import { readConciliacionB4 } from '../lib/finanzas/reconciliation-db'
import { costCTE, parseCostFilters, totalColumns } from '../lib/finanzas/cost-analytics'

async function main() {
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
    const visibleWhere: Prisma.FacturaRecibidaWhereInput = {AND:[facturaNoConfirmingDraxtonWhere,{naturalezaDocumento:'FACTURA_RECIBIDA'}]}
    const [visible, economic, sqlRows, sums] = await Promise.all([
      tx.facturaRecibida.count({where:visibleWhere}),
      tx.facturaRecibida.count({where:facturaEconomicaWhere}),
      tx.$queryRaw<Array<{n:bigint;ids:string[]}>>(Prisma.sql`SELECT count(*) AS n,array_agg(fr.id ORDER BY fr.id) AS ids FROM facturas_recibidas fr WHERE ${facturaEconomicaSQL('fr')}`),
      tx.facturaRecibida.aggregate({where:facturaEconomicaWhere,_sum:{base:true,importeIva:true,importeIrpf:true,total:true}}),
    ])
    const rows = await tx.facturaRecibida.findMany({where:facturaEconomicaWhere,select:{id:true},orderBy:{id:'asc'}})
    assert.equal(economic,Number(sqlRows[0].n),'Prisma y SQL deben admitir el mismo número')
    assert.deepEqual(rows.map(row=>row.id),sqlRows[0].ids||[],'Prisma y SQL deben admitir exactamente las mismas facturas')
    assert.ok(visible>0 && economic>0,'El listado y el conjunto económico no deben aparecer vacíos')
    const filters = parseCostFilters(new URLSearchParams())
    const [cost] = await tx.$queryRaw<any[]>(Prisma.sql`${costCTE(filters)} SELECT ${totalColumns} FROM filtrados`)
    assert.ok(Number(cost.totalFacturas)>0,'Analítica debe tener facturas económicas')
    return {visibles:visible,economicas:economic,prismaSqlCoinciden:true,analiticaNoVacia:true,totalesHash:createHash('sha256').update(JSON.stringify(sums._sum)).digest('hex')}
  },{isolationLevel:'RepeatableRead',timeout:60000})
  const before = await prisma.vinculoMovimientoDocumento.count()
  const b4 = await readConciliacionB4(10,10)
  assert.equal(await prisma.vinculoMovimientoDocumento.count(),before,'La lectura B4 no crea vínculos')
  const docs = (b4 as any).documentos
  console.log(JSON.stringify({...result,documentosB4Leidos:Array.isArray(docs)?docs.length:0,escriturasFinancieras:0}))
}
main().catch(()=>{console.error('P1_READONLY_CONTRACT_FAILED');process.exitCode=1}).finally(()=>prisma.$disconnect())
