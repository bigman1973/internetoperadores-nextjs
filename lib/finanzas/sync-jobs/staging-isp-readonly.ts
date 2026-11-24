import type { Prisma } from '@prisma/client'
import type { SyncOutcome, SyncProvider, SyncSourceItem } from './types'

/**
 * Staging-only wrapper over the SAME ISP provider that production uses. Inventory and prepare run
 * for real (same GET `facturacion`, same scope, same delta filter), so staging reproduces exactly
 * what production would read and the exact error it would get. `apply` never touches the database:
 * it reports SIN_CAMBIOS, so no financial row can be created from staging.
 */
export function readOnlyStagingIspProvider(delegate: SyncProvider): SyncProvider {
  return {
    inventory: (checkpoint: unknown) => delegate.inventory(checkpoint),
    prepare: (item: SyncSourceItem) => delegate.prepare(item),
    async apply(_tx: Prisma.TransactionClient, _item: SyncSourceItem, _prepared: unknown, _actorId: number | null): Promise<SyncOutcome> {
      return 'SIN_CAMBIOS'
    },
  }
}
