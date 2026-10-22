import 'dotenv/config'
import prisma from '../lib/prisma'
import {assertFinanceStagingIsolated} from '../lib/finanzas/staging-safety'

/** Sólo lectura. El origen de id_externo está documentado en sync-facturas.ts:120/151. */
async function main(){
 await assertFinanceStagingIsolated()
 const rows=await prisma.$queryRaw<Array<{situacion:string;cantidad:bigint}>>`
   WITH fuentes AS(
    SELECT fi.id,fi.factura_isp_id,fi.origen_sistema,fi.id_externo,f.id AS isp_id,
      CASE
       WHEN fi.factura_isp_id IS NOT NULL THEN 'FK_EXISTENTE'
       WHEN fi.origen_sistema IS DISTINCT FROM 'ISPGestion' OR fi.id_externo IS NULL OR fi.id_externo!~'^[1-9][0-9]*$' THEN 'SIN_ORIGEN_EXTERNO_EXACTO'
       WHEN f.id IS NULL THEN 'ID_EXTERNO_SIN_FUENTE_ISP'
       WHEN EXISTS(SELECT 1 FROM facturas_emitidas otra WHERE otra.factura_isp_id=f.id AND otra.id<>fi.id) THEN 'COLISION_MAPA'
       WHEN b4_importe_bancario_centimos(fi.total) IS NULL
         OR f.total*100<>b4_importe_bancario_centimos(fi.total) THEN 'IMPORTE_FUENTE_INEXACTO_O_CAMBIADO'
       WHEN fi.fecha::date<>f.fecha::date OR fi.num_factura IS DISTINCT FROM f.numero_documento
         OR fi.serie IS DISTINCT FROM f.serie_factura OR fi.cliente IS DISTINCT FROM f.nombre_completo
         OR fi.cif IS DISTINCT FROM f.nif_cif THEN 'METADATOS_FUENTE_CAMBIADOS'
       WHEN fi.total=0 THEN 'ID_EXTERNO_EXACTO_VALIDADO_TOTAL_CERO'
       ELSE 'ID_EXTERNO_EXACTO_VALIDADO'
      END AS situacion
    FROM facturas_emitidas fi LEFT JOIN facturas f ON fi.origen_sistema='ISPGestion' AND fi.id_externo=f.isp_gestion_id::text
   )SELECT situacion,COUNT(*) AS cantidad FROM fuentes GROUP BY situacion ORDER BY situacion`
 for(const row of rows)console.log(row.situacion,Number(row.cantidad))
 console.log('B7 identidad: sólo lectura; no se han relacionado facturas ni cambiado importes o estados.')
}
main().catch(()=>{console.error('B7: no se completó la validación de identidad.');process.exitCode=1}).finally(()=>prisma.$disconnect())
