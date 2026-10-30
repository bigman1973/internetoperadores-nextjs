import { Prisma } from '@prisma/client'
import { archivoRecibidaControlado } from './archivo-fuente-controlada'
import {
  lockConciliarDocumentLifecycleForConfirmationTx,
  readConciliarDocumentLifecycleEligibilityTx,
} from './conciliar-document-lifecycle-guard'
import type { ConciliarProjectionSource } from './conciliar-contract'

type Tx = Pick<Prisma.TransactionClient, '$queryRaw'>

type DocumentHashRow = Readonly<{ contentSha256: string | null }>

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

const SHA256 = /^[a-f0-9]{64}$/
const LEGACY_KIND = 'PREVIEW_EXISTING_FILE_MANIFEST'
const LEGACY_OBSERVATION = 'AREA3_PREVIEW_EXISTING_FILE_V1'

function unavailable(): Area3ReviewDocumentEvidence {
  return { eligible: false, hash: null, kind: null }
}

function oneValidHash(rows: readonly DocumentHashRow[]): string | null {
  const hash = rows.length === 1 ? rows[0]?.contentSha256 : null
  return typeof hash === 'string' && SHA256.test(hash) ? hash : null
}

/**
 * Strict reader for a server-owned invoice file proof. It never creates a
 * lifecycle/snapshot, never trusts a browser locator, and never treats source
 * metadata as a content hash. The existing lifecycle guard always runs first;
 * a legacy hash is only a bounded proof for an explicitly untracked document.
 */
export async function readArea3ReviewDocumentEvidenceTx(
  tx: Tx,
  input: Readonly<{
    source: Area3ReviewDocumentEvidenceSource
    projectionSource: ConciliarProjectionSource
    lock: boolean
  }>,
): Promise<Area3ReviewDocumentEvidence> {
  const lifecycle = input.lock
    ? await lockConciliarDocumentLifecycleForConfirmationTx(tx, {
      source: input.projectionSource,
      expectedVersionState: input.projectionSource.documentLifecycleVersionState,
    })
    : await readConciliarDocumentLifecycleEligibilityTx(tx, input.projectionSource)
  if (!lifecycle.elegible) return unavailable()

  // This resolves the same server row read by the lifecycle guard. In
  // particular, a filename/path or an item id supplied by a caller cannot
  // manufacture a controlled source or a drive identity.
  const controlled = archivoRecibidaControlado({
    oneDriveDriveId: input.source.driveId,
    oneDriveItemId: input.source.itemId,
    archivoOneDrive: input.source.archivo,
  })
  if (!controlled) return unavailable()

  if (lifecycle.lifecycleConocido) {
    const rows = await tx.$queryRaw<DocumentHashRow[]>(Prisma.sql`
      SELECT s.content_sha256 AS "contentSha256"
      FROM document_version_lifecycle l
      JOIN document_version_snapshots s ON s.lifecycle_id=l.id AND s.version_number=l.current_version
      WHERE l.source='ONEDRIVE'
        AND l.state='ACTIVE'::"DocumentVersionLifecycleState"
        AND l.source_item_key=(${controlled.driveId} || ':' || ${controlled.itemId})
        AND s.artifact_state='CAPTURED'::"DocumentVersionArtifactState"
      LIMIT 2${input.lock ? Prisma.sql` FOR KEY SHARE OF s` : Prisma.empty}
    `)
    const hash = oneValidHash(rows)
    return hash ? { eligible: true, hash, kind: 'LIFECYCLE_CAPTURED' } : unavailable()
  }

  // An untracked historical lifecycle has no snapshot to read. An existing Area
  // 3 observation is admissible only when all original persisted source
  // coordinates still match the very invoice row being reviewed and its
  // source-version timestamp. `controlled.driveId` is only the configured
  // library proof for historical paths; it must not rewrite an original null
  // drive in either the invoice or the append-only observation. The table is
  // append-only; exactly one matching observation is required, so an old,
  // lost, changed or ambiguous hash cannot stand in for current evidence.
  const rows = await tx.$queryRaw<DocumentHashRow[]>(Prisma.sql`
    SELECT h.content_sha256 AS "contentSha256"
    FROM area3_received_document_hashes h
    JOIN facturas_recibidas f ON f.id=h.factura_recibida_id
    WHERE h.factura_recibida_id=${input.source.invoiceId}
      AND h.source_kind=${LEGACY_KIND}
      AND h.source_observation=${LEGACY_OBSERVATION}
      AND h.source_item_id=${controlled.itemId}
      AND h.source_drive_id IS NOT DISTINCT FROM f.onedrive_drive_id
      AND h.source_updated_at=f.updated_at
      AND f.onedrive_item_id=${controlled.itemId}
      AND h.content_sha256 ~ '^[a-f0-9]{64}$'
      AND h.byte_length BETWEEN 1 AND 20971520
    LIMIT 2${input.lock ? Prisma.sql` FOR KEY SHARE OF h,f` : Prisma.empty}
  `)
  const hash = oneValidHash(rows)
  return hash ? { eligible: true, hash, kind: 'LEGACY_CONTROLLED_FINGERPRINT' } : unavailable()
}
