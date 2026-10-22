/**
 * The parent-owned P2 service is the source of truth for the shared contract.
 * During the parent merge, this file may be replaced by `p2-service/types.ts` and
 * provider imports stay `./types`.
 */
export type {
  SyncItemType,
  SyncOutcome,
  SyncProvider,
  SyncSourceItem,
} from '../../types'

/** A stable, short code fit for persisted safe-error fields. */
export class SyncProviderError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'SyncProviderError'
    this.code = code
  }
}
