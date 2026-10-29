import type { Prisma } from '@prisma/client'

/** Public contract shared with the independently delivered /p2-onedrive and /p2-isp adapters. */
export type SyncSource = 'ONEDRIVE' | 'ISP'
export type SyncItemType =
  | 'ONEDRIVE_FACTURA'
  | 'ONEDRIVE_CONFIRMING_SOPORTE'
  | 'ISP_FACTURA'

export type SyncOutcome = 'NUEVA' | 'ACTUALIZADA' | 'SIN_CAMBIOS' | 'REVISAR' | 'ERROR'

/** Resultado opcional ya durable de `beforeInventory`; no solicita otro sync. */
export type SyncBeforeInventoryResult = Readonly<{
  projectionInvalidated?: boolean
}>

/**
 * Normalized, resumable metadata only. It must never contain credentials,
 * pre-authorized download URLs, headers, document bytes, or provider errors.
 */
export type SyncSourceItem = {
  key: string
  tipo: SyncItemType
  data: Prisma.InputJsonValue
}

/**
 * Recibo privado de entrega desde un evento Graph Delta ya durable hacia el
 * ítem P2. No viaja por API/UI y sólo se reconoce tras confirmar el ítem.
 */
export type SyncDeltaDispatch = Readonly<{
  sourceKey: string
  driveId: string
  eventKey: string
  /** null sólo para un evento fuera de los tipos P2 admitidos; se acusa sin item. */
  itemKey: string | null
}>

export type SyncInventoryPage = Readonly<{
  items: SyncSourceItem[]
  checkpoint: unknown
  complete: boolean
  /** Ausente en el proveedor heredado; privado para el recorrido Delta opt-in. */
  deltaDispatches?: readonly SyncDeltaDispatch[]
}>

/**
 * A provider performs network/OCR work in `inventory` and `prepare` only.
 * `apply` is called inside the service-owned database transaction and MUST use
 * the supplied transaction: it must not open an independent Prisma transaction.
 */
export interface SyncProvider {
  /**
   * Hook exclusivamente servidor antes del inventario nativo. Sólo recibe la
   * identidad de la reclamación P2; no recibe scopes del navegador ni datos de
   * proveedor. El worker conserva la propiedad del lease/cancelación.
   */
  beforeInventory?(input: Readonly<{
    jobId: string
    actorId: number | null
    source: SyncSource
    leaseToken: string
  }>): Promise<void | SyncBeforeInventoryResult>
  inventory(checkpoint: unknown): Promise<SyncInventoryPage>
  prepare(item: SyncSourceItem): Promise<unknown>
  apply(
    tx: Prisma.TransactionClient,
    item: SyncSourceItem,
    prepared: unknown,
    actorId: number | null,
  ): Promise<SyncOutcome>
  /**
   * Optional, closed-code annotation for an already computed outcome. It runs in
   * the same apply transaction after `apply`; it must never expose provider data.
   * A descriptor failure must not replace the provider outcome.
   */
  describeOutcome?(input: {
    item: SyncSourceItem
    prepared: unknown
    outcome: SyncOutcome
  }): { safeError?: string | null } | null | undefined
}

export type SyncProviderFactory = (source: SyncSource) => SyncProvider

export type SyncJobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_ERRORS'
  | 'FAILED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'

export type SyncJobPhase = 'INVENTORY' | 'PROCESSING' | 'FINALIZING'
export type SyncItemStatus = 'QUEUED' | 'PROCESSING' | 'RETRY' | 'COMPLETED' | 'CANCELLED' | 'FINAL_ERROR'
export type SyncTrigger = 'MANUAL' | 'DAILY_UTC' | 'LEGACY_BRIDGE'

export type SyncCounters = {
  /** null until the provider has returned a complete inventory barrier. */
  total: number | null
  processed: number
  nuevas: number
  actualizadas: number
  errores: number
  unchanged: number
  cancelled: number
}

export type SyncJobRecord = SyncCounters & {
  id: string
  source: SyncSource
  status: SyncJobStatus
  phase: SyncJobPhase
  trigger: SyncTrigger
  idempotencyKey: string
  requestHash: string
  scope: Prisma.InputJsonValue
  checkpoint: Prisma.InputJsonValue
  actorId: number | null
  attempts: number
  /** Number of times an expired job lease was reclaimed; bounded by the worker. */
  recoveries: number
  cancelRequestedAt: Date | null
  leaseToken: string | null
  leaseUntil: Date | null
  lastError: string | null
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
}

export type SyncItemRecord = {
  id: string
  jobId: string
  source: SyncSource
  item: SyncSourceItem
  sequence: number
  status: SyncItemStatus
  outcome: SyncOutcome | null
  attempts: number
  retryAt: Date | null
  leaseToken: string | null
  leaseUntil: Date | null
  /** Set in the same transaction as domain changes and the terminal state. */
  confirmedAt: Date | null
  lastError: string | null
  createdAt: Date
  processedAt: Date | null
}

export type JobSummary = Pick<
  SyncJobRecord,
  | 'id'
  | 'source'
  | 'status'
  | 'phase'
  | 'total'
  | 'processed'
  | 'nuevas'
  | 'actualizadas'
  | 'errores'
  | 'unchanged'
  | 'cancelled'
  | 'createdAt'
  | 'startedAt'
  | 'finishedAt'
  | 'lastError'
>
