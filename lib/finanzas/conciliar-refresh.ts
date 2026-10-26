import { after } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertPrototypeStaging } from '@/lib/finanzas/prototype-staging'
import { rebuildConciliarProjection } from '@/lib/finanzas/conciliar-db'

/** Actualización finita propiedad de la aplicación. No crea temporizadores,
 * cron, llamadas HTTP ni proveedores. Production se queda fuera de esta fase. */
export async function refreshConciliarProjectionIfDirty(actorId: number | null) {
  if (process.env.FINANCE_STAGING_SANDBOX !== '1') return { rebuilt: false }
  await assertPrototypeStaging()
  const state = await prisma.$queryRaw<Array<{ dirty: boolean; ready: boolean }>>(Prisma.sql`
    SELECT dirty_at IS NOT NULL AS dirty,rebuilt_at IS NOT NULL AS ready
    FROM estado_proyeccion_conciliar WHERE singleton=true LIMIT 1
  `)
  if (state.length !== 1 || (!state[0].dirty && state[0].ready)) return { rebuilt: false }
  const rebuilt = await rebuildConciliarProjection(actorId)
  return { rebuilt: true, ...rebuilt }
}

/** after mantiene vivo el trabajo después de responder. El fallo conserva la
 * marca dirty para revisión y nunca altera el recibo monetario ya confirmado. */
export function scheduleConciliarProjectionRefresh(actorId: number | null) {
  if (process.env.FINANCE_STAGING_SANDBOX !== '1') return
  after(async () => {
    try { await refreshConciliarProjectionIfDirty(actorId) }
    catch { console.warn('CONCILIAR_REFRESH_PENDING') }
  })
}
