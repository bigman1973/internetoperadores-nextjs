/*
 * Wrapper P2 de Delta para OneDrive.
 *
 * Delega inventario/prepare/apply sin sustituir la barrera P2 ni el OCR existente.
 * `beforeInventory` sólo se invoca por un worker que aporta job/actor/fence; el
 * constructor no realiza E/S de red. Graph se inyecta y sólo se usa tras el
 * preflight de permiso/fence, nunca desde `inventory`.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import {
  GraphDriveRootDeltaAdapter,
  type GraphDeltaTransport,
  type GraphDriveRootDeltaScope,
} from '@/lib/finanzas/graph-delta-adapter'
import {
  createPrismaGraphDeltaVersionStore,
  type GraphDeltaCursorCipher,
} from '@/lib/finanzas/graph-delta-prisma-store'
import type { SyncOutcome, SyncProvider, SyncSource, SyncSourceItem } from '../../types'
import type { OneDriveSyncProvider } from './provider'

export const ONEDRIVE_DELTA_SOURCE_KEY = 'ONEDRIVE_RECEIVED_INVOICES' as const

export type OneDriveDeltaBeforeInventoryInput = Readonly<{
  jobId: string
  actorId: number | null
  source: SyncSource
  /** P2 worker claim token: never enters UI/provider audit payloads. */
  leaseToken: string
}>

export type OneDriveDeltaClient = Pick<PrismaClient, '$transaction' | '$queryRaw'>

export type OneDriveDeltaLifecycleOptions = Readonly<{
  delegate: OneDriveSyncProvider<Prisma.TransactionClient>
  prisma: OneDriveDeltaClient
  transport: GraphDeltaTransport
  cursorCipher: GraphDeltaCursorCipher
  /** Resolves the B1-verified drive/root only after the job preflight passes. */
  resolveScope(): Promise<GraphDriveRootDeltaScope>
  assertEffectiveFinanceWriteAccess: (tx: Prisma.TransactionClient, actorId: number) => Promise<boolean>
}>

export class DeltaAwareOneDriveProvider implements SyncProvider {
  readonly source = 'ONEDRIVE' as const

  constructor(private readonly options: OneDriveDeltaLifecycleOptions) {
    if (typeof options.resolveScope !== 'function') throw new Error('DELTA_SCOPE_SOURCE_INVALID')
  }

  async beforeInventory(input: OneDriveDeltaBeforeInventoryInput): Promise<void> {
    if (input.source !== 'ONEDRIVE') throw new Error('DELTA_SOURCE_INVALID')
    const store = createPrismaGraphDeltaVersionStore({
      prisma: this.options.prisma,
      fence: { jobId: input.jobId, actorId: input.actorId, leaseToken: input.leaseToken },
      cursorCipher: this.options.cursorCipher,
      assertEffectiveFinanceWriteAccess: this.options.assertEffectiveFinanceWriteAccess,
    })
    // Do this before constructing a transport request. If actor/fence/cancellation
    // is invalid, no authenticated Delta GET is issued and no cursor is written.
    await store.assertReady()
    const scope = await this.options.resolveScope()
    if (scope.sourceKey !== ONEDRIVE_DELTA_SOURCE_KEY) throw new Error('DELTA_SCOPE_SOURCE_INVALID')
    await new GraphDriveRootDeltaAdapter({ transport: this.options.transport, store }).run(scope)
  }

  inventory(checkpoint: unknown) { return this.options.delegate.inventory(checkpoint) }
  prepare(item: SyncSourceItem): Promise<unknown> { return this.options.delegate.prepare(item) }
  apply(tx: Prisma.TransactionClient, item: SyncSourceItem, prepared: unknown, actorId: number | null): Promise<SyncOutcome> {
    return this.options.delegate.apply(tx, item, prepared, actorId)
  }
  describeOutcome(input: { item: SyncSourceItem; prepared: unknown; outcome: SyncOutcome }) {
    const delegate: SyncProvider = this.options.delegate
    return delegate.describeOutcome?.(input)
  }
}
