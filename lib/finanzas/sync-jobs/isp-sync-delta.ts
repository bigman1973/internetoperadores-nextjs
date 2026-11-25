import { Prisma, type PrismaClient } from '@prisma/client'
import type { SyncSourceItem } from './types'
import { ispPersistedSourceMatches } from './providers/isp/isp-issued-invoice-provider'

const READ_BATCH = 250
export function ispLatestResultUnresolved(row: {outcome:string|null;confirmedAt:unknown}): boolean {
  return !row.confirmedAt || !['NUEVA','ACTUALIZADA','SIN_CAMBIOS'].includes(row.outcome ?? '')
}
/** Read-only, bounded inventory optimization. Actual writes retain their original live transaction guards. */
export async function filterIspChangedItems(client: PrismaClient, items: readonly SyncSourceItem[]): Promise<SyncSourceItem[]> {
  const changed: SyncSourceItem[] = []
  for (let offset = 0; offset < items.length; offset += READ_BATCH) {
    const batch = items.slice(offset, offset + READ_BATCH)
    const ids = batch.map(item => Number((item.data as Record<string,unknown>).id)).filter(id=>Number.isSafeInteger(id)&&id>0&&id<=2147483647)
    if (!ids.length) { changed.push(...batch); continue }
    const [facturas, externalFIs, latest] = await Promise.all([
      client.factura.findMany({where:{ispGestionId:{in:ids}},select:{id:true,ispGestionId:true,serieFactura:true,numeroDocumento:true,documento:true,fecha:true,idCliente:true,codigoCliente:true,nombreCompleto:true,nifCif:true,ejercicio:true,base:true,totalImpuesto:true,total:true,facturaEmitidaB4:{select:{id:true,origenSistema:true,idExterno:true,numFactura:true,serie:true,cliente:true,cif:true,fecha:true,base:true,importeIva:true,total:true,facturaISPId:true}}}}),
      client.facturaEmitida.findMany({where:{idExterno:{in:ids.map(String)}},select:{id:true,origenSistema:true,idExterno:true,numFactura:true,serie:true,cliente:true,cif:true,fecha:true,base:true,importeIva:true,total:true,facturaISPId:true}}),
      client.$queryRaw<Array<{sourceKey:string;outcome:string|null;confirmedAt:Date|null}>>(Prisma.sql`
        SELECT DISTINCT ON (i.source_key) i.source_key AS "sourceKey",i.outcome::text AS outcome,i.confirmed_at AS "confirmedAt"
          FROM finance_sync_items_p2 i JOIN finance_sync_jobs_p2 j ON j.id=i.job_id
         WHERE j.source='ISP'::"FinanceSyncSourceP2" AND i.source_key=ANY(${batch.map(item=>item.key)}::text[])
         ORDER BY i.source_key,j.created_at DESC,i.created_at DESC,i.sequence DESC,i.id DESC LIMIT ${batch.length}
      `),
    ])
    const byId = new Map(facturas.map(f=>[f.ispGestionId,f]))
    const fiById = new Map(externalFIs.map(f=>[f.idExterno,f]))
    const unresolved = new Set(latest.filter(ispLatestResultUnresolved).map(row=>row.sourceKey))
    for (const item of batch) {
      const id = Number((item.data as Record<string,unknown>).id)
      if (unresolved.has(item.key) || !ispPersistedSourceMatches(item,byId.get(id),fiById.get(String(id)))) changed.push(item)
    }
  }
  return changed
}
