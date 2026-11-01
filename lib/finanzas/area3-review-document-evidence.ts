import {
  lockConciliarDocumentSourceForConfirmationTx,
  readConciliarDocumentSourceEligibilityTx,
} from './conciliar-document-source-guard'
import type { ConciliarProjectionSource } from './conciliar-contract'

type Tx = Parameters<typeof readConciliarDocumentSourceEligibilityTx>[0]

export type Area3ReviewDocumentEvidenceKind = 'LIFECYCLE_CAPTURED' | 'LEGACY_CONTROLLED_FINGERPRINT'
export type Area3ReviewDocumentEvidence = Readonly<{
  eligible: boolean
  hash: string | null
  kind: Area3ReviewDocumentEvidenceKind | null
}>

export type Area3ReviewDocumentEvidenceSource = Readonly<{
  invoiceId: string
  driveId: string | null
  itemId: string | null
  archivo: string | null
}>

function unavailable(): Area3ReviewDocumentEvidence {
  return { eligible: false, hash: null, kind: null }
}

/**
 * Strict reader for a server-owned invoice file proof. It repeats the current
 * source guard but never turns source metadata into a content hash. Production
 * source rows contain a controlled remote drive/item locator, not preserved
 * immutable bytes or an authenticated content fingerprint. The existing PDF
 * viewer resolves that locator through the remote provider; it is not a local
 * byte source this reader may reuse. Therefore, without the frozen
 * lifecycle/observation tables, the only honest outcome is unavailable/ÁMBAR.
 */
export async function readArea3ReviewDocumentEvidenceTx(
  tx: Tx,
  input: Readonly<{
    source: Area3ReviewDocumentEvidenceSource
    projectionSource: ConciliarProjectionSource
    lock: boolean
  }>,
): Promise<Area3ReviewDocumentEvidence> {
  const documentSource = input.lock
    ? await lockConciliarDocumentSourceForConfirmationTx(tx, {
      source: input.projectionSource,
      expectedVersionState: input.projectionSource.documentLifecycleVersionState,
    })
    : await readConciliarDocumentSourceEligibilityTx(tx, input.projectionSource)
  if (!documentSource.elegible) return unavailable()

  // `input.source` is only the already locked invoice material. It is not used
  // as a locator, byte source or hash: no real content fingerprint exists in
  // the production source columns. Returning unavailable preserves fail-closed
  // Area 3 review behavior until separately authorised authentic observations.
  void input.source
  return unavailable()
}
