/* P1: referencias documentales de facturas recibidas existentes, no conciliación.
 * Dry-run por defecto; --rollback prueba DML sin persistir; --apply requiere flag.
 * DATABASE_URL se proporciona de forma privada. No se modifica ninguna fuente.
 */
import { createHash } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { assertFinanceRuntimeReady } from '../lib/finanzas/finance-runtime-safety'
import { facturaEconomicaSQL } from '../lib/finanzas/invoice-economic-filter'
import { Prisma } from '@prisma/client'

async function snapshot(tx: Prisma.TransactionClient) {
  const tables = ['facturas_recibidas','movimientos_bancarios','facturas_emitidas', 'estado_justificacion_movimientos', 'vinculos_movimiento_documento', 'operaciones_justificacion_b4']
  const result: Record<string,string> = {}
  for (const table of tables) {
    const rows = await tx.$queryRaw<Array<{row:string}>>(Prisma.sql`SELECT to_jsonb(t)::text AS row FROM ${Prisma.raw('"'+table+'"')} t ORDER BY to_jsonb(t)::text`)
    result[table] = createHash('sha256').update(JSON.stringify(rows)).digest('hex')
  }
  return result
}
async function main() {
  const args = process.argv.slice(2)
  if (args.some(arg => !['--dry-run','--rollback','--apply'].includes(arg)) || args.length > 1) throw new Error('INVALID_ARGUMENTS')
  await assertFinanceRuntimeReady()
  const apply = args.includes('--apply')
  const rollback = args.includes('--rollback')
  if (apply && process.env.FINANCE_P1_CATALOGUE_APPLY !== '1') throw new Error('EXPLICIT_APPLY_REQUIRED')
  const actorId = Number(process.env.FINANCE_P1_ACTOR_ID)
  if ((apply || rollback) && (!Number.isSafeInteger(actorId) || actorId < 1)) throw new Error('AUDIT_ACTOR_REQUIRED')
  let result: unknown
  try {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('FINANCE_P1_CATALOGUE',0))`
      const before = await snapshot(tx)
      const [count] = await tx.$queryRaw<Array<{total:bigint}>>(Prisma.sql`SELECT count(*) AS total FROM facturas_recibidas f WHERE ${facturaEconomicaSQL('f')} AND NOT EXISTS (SELECT 1 FROM documentos_conciliables d WHERE d.factura_recibida_id=f.id)`)
      if (!apply && !rollback) { result={modo:'DRY_RUN',porRegistrar:Number(count.total),sinVinculosBancarios:true}; return }
      if (!(await tx.usuarioAdmin.findUnique({where:{id:actorId},select:{activo:true}}))?.activo) throw new Error('AUDIT_ACTOR_INACTIVE')
      const added = await tx.$queryRaw<Array<{id:string;factura_recibida_id:string}>>(Prisma.sql`
        INSERT INTO documentos_conciliables (id,tipo,importe_objetivo_centimos,factura_recibida_id,updated_at)
        SELECT gen_random_uuid(),'FACTURA_RECIBIDA'::"TipoDocumentoConciliable",
          CASE WHEN b4_importe_bancario_centimos(f.total)=-2147483648 THEN NULL
               ELSE -NULLIF(b4_importe_bancario_centimos(f.total),0) END,f.id,NOW()
        FROM facturas_recibidas f WHERE ${facturaEconomicaSQL('f')}
        ON CONFLICT DO NOTHING
        RETURNING id,factura_recibida_id
      `)
      if (added.length) await tx.auditoriaCalidadFactura.createMany({data:added.map(row=>({facturaId:row.factura_recibida_id,actorId,accion:'REGISTRAR_REFERENCIA_DOCUMENTAL_P1',detalle:{documentoConciliableId:row.id,sinVinculoBancario:true}}))})
      if (JSON.stringify(before)!==JSON.stringify(await snapshot(tx))) throw new Error('ORIGINAL_DATA_CHANGED')
      result={modo:rollback?'ROLLBACK':'APPLY',registrados:added.length,fuentesConservadas:true,sinVinculosBancarios:true}
      if (rollback) throw new Error('ROLLBACK_P1_EXPECTED')
    },{isolationLevel:'Serializable',timeout:120000,maxWait:10000})
  } catch(error) {
    if (!(rollback && error instanceof Error && error.message==='ROLLBACK_P1_EXPECTED')) throw error
  }
  console.log(JSON.stringify(result))
}
main().catch(()=>{console.error('P1_CATALOGUE_FAILED');process.exitCode=1}).finally(()=>prisma.$disconnect())
