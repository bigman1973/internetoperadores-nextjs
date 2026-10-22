import { prisma } from '../lib/prisma'
import { assertFinanceStagingIsolated } from '../lib/finanzas/staging-safety'

/** Registro documental, no conciliación: conserva todas las fuentes originales.
 * --apply sólo añade wrappers económicos; por defecto devuelve conteos sin DML.
 */
async function main() {
  if (process.argv.slice(2).some(arg => !['--apply', '--dry-run'].includes(arg))) throw new Error('Argumento no válido')
  await assertFinanceStagingIsolated()
  const apply = process.argv.includes('--apply')
  const result = await prisma.$transaction(async tx => {
    const candidates = await tx.$queryRaw<Array<{ tipo: string; cantidad: bigint }>>`
      SELECT 'FACTURA_EMITIDA' AS tipo, COUNT(*) AS cantidad FROM facturas_emitidas
      UNION ALL SELECT 'FACTURA_RECIBIDA', COUNT(*) FROM facturas_recibidas
        WHERE calidad = 'VALIDA' AND copia_de_id IS NULL
          AND UPPER(BTRIM(proveedor)) NOT IN ('ERROR_OCR', 'DESCONOCIDO')
      UNION ALL SELECT 'REMESA', COUNT(*) FROM remesas
    `
    if (!apply) return { modo: 'DRY_RUN', candidatos: candidates.map(r => ({ tipo: r.tipo, cantidad: Number(r.cantidad) })) }
    // No determina cobrada/pagada ni añade líneas bancarias. NULL significa revisión.
    const emitidas = await tx.$executeRaw`
      INSERT INTO documentos_conciliables
        (id,tipo,importe_objetivo_centimos,factura_emitida_id,updated_at)
      SELECT gen_random_uuid(), 'FACTURA_EMITIDA'::"TipoDocumentoConciliable",
        NULLIF(b4_importe_bancario_centimos(total),0),id,NOW()
      FROM facturas_emitidas ON CONFLICT DO NOTHING
    `
    const recibidas = await tx.$executeRaw`
      INSERT INTO documentos_conciliables
        (id,tipo,importe_objetivo_centimos,factura_recibida_id,updated_at)
      SELECT gen_random_uuid(), 'FACTURA_RECIBIDA'::"TipoDocumentoConciliable",
        CASE WHEN b4_importe_bancario_centimos(total) = -2147483648 THEN NULL
             ELSE -NULLIF(b4_importe_bancario_centimos(total),0) END,id,NOW()
      FROM facturas_recibidas
      WHERE calidad = 'VALIDA' AND copia_de_id IS NULL
        AND UPPER(BTRIM(proveedor)) NOT IN ('ERROR_OCR', 'DESCONOCIDO')
      ON CONFLICT DO NOTHING
    `
    const remesas = await tx.$executeRaw`
      INSERT INTO documentos_conciliables
        (id,tipo,importe_objetivo_centimos,remesa_id,updated_at)
      SELECT gen_random_uuid(), 'REMESA'::"TipoDocumentoConciliable",
        CASE WHEN total_importe > 0 AND total_importe * 100 <= 2147483647
             THEN (total_importe * 100)::integer ELSE NULL END,id,NOW()
      FROM remesas ON CONFLICT DO NOTHING
    `
    return { modo: 'APPLY', creados: { emitidas, recibidas, remesas }, sinConciliacion: true }
  }, { isolationLevel: 'Serializable', timeout: 30000 })
  console.log(JSON.stringify(result))
}
main().catch(error => {
  console.error(error?.code || (error instanceof Error ? error.message : 'B4_DOCUMENT_INIT_FAILED'))
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
