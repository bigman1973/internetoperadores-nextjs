import type { Prisma } from '@prisma/client'
import type { SyncOutcome, SyncProvider, SyncSourceItem } from './types'

export type StagingProviderOptions = {
  /** Explicit test injection only; every key must begin `test:`. */
  metadataItems?: SyncSourceItem[]
}

/** Default staging behavior: prove job workflow with no provider network and no DML. */
export class EmptyStagingProvider implements SyncProvider {
  private readonly items: SyncSourceItem[]
  constructor(options: StagingProviderOptions = {}) {
    this.items = options.metadataItems ?? []
    if (this.items.some((item) => !item.key.startsWith('test:'))) {
      throw new Error('STAGING_FIXTURE_NAMESPACE_REQUIRED')
    }
  }
  async inventory(checkpoint: unknown) { return { items: this.items, checkpoint, complete: true } }
  async prepare(_item: SyncSourceItem) { return { simulation: true } }
  async apply(_tx: Prisma.TransactionClient, _item: SyncSourceItem, _actorId: number | null): Promise<SyncOutcome> {
    // A UI may display this as a simulation. It never calls financial domain DML.
    return 'SIN_CAMBIOS'
  }
}
