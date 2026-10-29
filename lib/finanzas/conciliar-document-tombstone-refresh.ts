/*
 * Refresco localizado de Conciliar tras un tombstone documental positivo.
 *
 * Se ejecuta exclusivamente dentro de la misma transacción que ya ha validado
 * fence P2, permiso efectivo y evidencia Delta. No descubre borrados, no llama
 * proveedores ni reconstruye toda la proyección. Sólo vuelve ámbar/no
 * seleccionables las filas cuya fuente persistida resuelve exactamente al
 * lifecycle OneDrive ya tombstoned.
 */
import { Prisma } from '@prisma/client'
import { conciliarHash } from './conciliar-core'
import { CONCILIAR_TABS, type ConciliarProjectionSource, type ConciliarRow, type ConciliarTab } from './conciliar-contract'
import {
  conciliarDocumentLifecycleBatchSourceKey,
  conciliarDocumentLifecycleGuardMessage,
  preloadConciliarDocumentLifecycleEligibilityTx,
} from './conciliar-document-lifecycle-guard'
import { projectionRow, type ProjectionSqlRow } from './conciliar-projection-read'

const PROJECTION_LOCK_KEY = 'conciliar:projection:rebuild:v1'
const PROJECTION_REFRESH_BATCH = 500
const ONEDRIVE_SOURCE = 'ONEDRIVE'
const TOMBSTONE_DIRTY_REASON = 'DOCUMENT_TOMBSTONE'
const SOURCE_ITEM_KEY = /^[^\u0000-\u001F\u007F]{1,4096}$/

export type ConciliarDocumentTombstoneRefreshTx = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>

type ExistingProjectionRow = ProjectionSqlRow & Readonly<{ cuentaId: string | null }>

type RefreshRow = Readonly<{
  tab: ConciliarTab
  row: Omit<ConciliarRow, 'decisionHash'>
  source: ConciliarProjectionSource
  sourceFingerprint: string
  cuentaId: string | null
}>

/**
 * Holds Conciliar's established rebuild advisory lock before lifecycle is locked.
 * The Delta caller must acquire this gate before it reads the lifecycle, matching
 * the order used by Conciliar actions (projection state -> document lifecycle).
 */
export async function acquireConciliarDocumentTombstoneRefreshGateTx(
  tx: ConciliarDocumentTombstoneRefreshTx,
): Promise<Readonly<{ wasDirty: boolean }>> {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${PROJECTION_LOCK_KEY},0))::text AS locked
  `)
  const states = await tx.$queryRaw<Array<{ dirty: boolean }>>(Prisma.sql`
    SELECT dirty_at IS NOT NULL AS dirty
    FROM estado_proyeccion_conciliar
    WHERE singleton=true
    LIMIT 1
    FOR UPDATE
  `)
  if (states.length !== 1 || typeof states[0]?.dirty !== 'boolean') {
    throw new Error('CONCILIAR_PROJECTION_STATE_UNAVAILABLE')
  }
  return { wasDirty: states[0].dirty }
}

function projectionFingerprint(input: Readonly<{
  tab: ConciliarTab
  source: ConciliarProjectionSource
  row: Omit<ConciliarRow, 'decisionHash'>
}>): string {
  return conciliarHash({
    schema: 'CONCILIAR_SOURCE_V2',
    tab: input.tab,
    source: input.source,
    row: {
      id: input.row.id,
      movimientoId: input.row.movimientoId,
      fecha: input.row.fecha,
      importeCentimos: input.row.importeCentimos,
      pendienteCentimos: input.row.pendienteCentimos,
      documento: input.row.documento,
      propuesta: input.row.propuesta,
      linksMovimiento: input.row.linksMovimiento,
    },
  })
}

function toRefreshRow(value: ExistingProjectionRow): RefreshRow {
  const current = projectionRow(value)
  if (!(CONCILIAR_TABS as readonly string[]).includes(String(value.tab))) {
    throw new Error('CONCILIAR_TOMBSTONE_REFRESH_ROW_INVALID')
  }
  const {
    decisionHash: _decisionHash,
    source: _source,
    sourceFingerprint: _sourceFingerprint,
    updatedAt: _updatedAt,
    ...row
  } = current
  const cuentaId = value.cuentaId
  if (cuentaId !== null && typeof cuentaId !== 'string') throw new Error('CONCILIAR_TOMBSTONE_REFRESH_ROW_INVALID')
  return {
    tab: value.tab as ConciliarTab,
    row,
    source: current.source,
    sourceFingerprint: current.sourceFingerprint,
    cuentaId,
  }
}

/**
 * Re-seals existing rows through the same lifecycle eligibility batch used by a
 * full rebuild. It deliberately does not derive state from a provider absence or
 * from the caller: the server reads the persisted lifecycle/tombstone again.
 */
async function sealRefreshRowsTx(
  tx: ConciliarDocumentTombstoneRefreshTx,
  rows: readonly RefreshRow[],
): Promise<readonly RefreshRow[]> {
  const eligibilityBySource = await preloadConciliarDocumentLifecycleEligibilityTx(tx, rows.map((row) => row.source))
  return rows.map((current) => {
    const sourceKey = conciliarDocumentLifecycleBatchSourceKey(current.source)
    if (!sourceKey) throw new Error('CONCILIAR_TOMBSTONE_REFRESH_SOURCE_INVALID')
    const eligibility = eligibilityBySource.get(sourceKey)
    if (!eligibility) throw new Error('CONCILIAR_TOMBSTONE_REFRESH_ELIGIBILITY_MISSING')
    const source: ConciliarProjectionSource = {
      ...current.source,
      documentLifecycleVersionState: eligibility.versionEstado,
    }
    const row: Omit<ConciliarRow, 'decisionHash'> = eligibility.elegible
      ? current.row
      : {
        ...current.row,
        color: 'AMBAR',
        motivo: conciliarDocumentLifecycleGuardMessage(eligibility.codigo),
        seleccionable: false,
        detail: current.row.detail ?? conciliarDocumentLifecycleGuardMessage(eligibility.codigo),
      }
    return {
      ...current,
      row,
      source,
      sourceFingerprint: projectionFingerprint({ tab: current.tab, source, row }),
    }
  })
}

function insertValue(value: RefreshRow) {
  return {
    id: value.row.id,
    tab: value.tab,
    movimientoId: value.row.movimientoId,
    cuentaId: value.cuentaId,
    fecha: value.row.fecha,
    importeCentimos: value.row.importeCentimos,
    pendienteCentimos: value.row.pendienteCentimos,
    color: value.row.color,
    grupo: value.row.grupo,
    motivo: value.row.motivo,
    concepto: value.row.concepto,
    banco: value.row.banco,
    cuenta: value.row.cuenta,
    documento: value.row.documento,
    propuesta: value.row.propuesta,
    seleccionable: value.row.seleccionable,
    diferenciaCentimos: value.row.diferenciaCentimos,
    linksMovimiento: value.row.linksMovimiento ?? null,
    detail: value.row.detail,
    source: value.source,
    sourceFingerprint: value.sourceFingerprint,
  }
}

async function upsertRefreshRowsTx(
  tx: ConciliarDocumentTombstoneRefreshTx,
  rows: readonly RefreshRow[],
): Promise<void> {
  for (let start = 0; start < rows.length; start += PROJECTION_REFRESH_BATCH) {
    const values = rows.slice(start, start + PROJECTION_REFRESH_BATCH).map(insertValue)
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO conciliar_proyecciones(
        id,tab,movimiento_id,cuenta_id,fecha,importe_centimos,pendiente_centimos,color,grupo,motivo,concepto,banco,cuenta,
        documento,propuesta,seleccionable,diferencia_centimos,links_movimiento,detail,source,source_fingerprint,updated_at
      )
      SELECT x.id,x.tab,x."movimientoId",x."cuentaId",CAST(x.fecha AS date),x."importeCentimos",x."pendienteCentimos",x.color,
        x.grupo,x.motivo,x.concepto,x.banco,x.cuenta,x.documento,x.propuesta,x.seleccionable,x."diferenciaCentimos",
        x."linksMovimiento",x.detail,x.source,x."sourceFingerprint",CURRENT_TIMESTAMP
      FROM jsonb_to_recordset(CAST(${JSON.stringify(values)} AS jsonb)) AS x(
        id text,tab text,"movimientoId" text,"cuentaId" text,fecha text,"importeCentimos" integer,"pendienteCentimos" integer,
        color text,grupo text,motivo text,concepto text,banco text,cuenta text,documento jsonb,propuesta text,seleccionable boolean,
        "diferenciaCentimos" integer,"linksMovimiento" jsonb,detail text,source jsonb,"sourceFingerprint" text
      )
      ON CONFLICT (id) DO UPDATE SET
        tab=EXCLUDED.tab,movimiento_id=EXCLUDED.movimiento_id,cuenta_id=EXCLUDED.cuenta_id,fecha=EXCLUDED.fecha,
        importe_centimos=EXCLUDED.importe_centimos,pendiente_centimos=EXCLUDED.pendiente_centimos,color=EXCLUDED.color,
        grupo=EXCLUDED.grupo,motivo=EXCLUDED.motivo,concepto=EXCLUDED.concepto,banco=EXCLUDED.banco,cuenta=EXCLUDED.cuenta,
        documento=EXCLUDED.documento,propuesta=EXCLUDED.propuesta,seleccionable=EXCLUDED.seleccionable,
        diferencia_centimos=EXCLUDED.diferencia_centimos,links_movimiento=EXCLUDED.links_movimiento,detail=EXCLUDED.detail,
        source=EXCLUDED.source,source_fingerprint=EXCLUDED.source_fingerprint,updated_at=EXCLUDED.updated_at
    `)
  }
}

/**
 * Applies the presentation-only consequence of an already applied tombstone.
 * The selection is server-owned: projected received-invoice/confirming sources
 * join their current persisted invoice source, then compare its stable
 * driveId:itemId key. No source key comes from HTTP or from a projection row.
 */
export async function refreshConciliarProjectionForDocumentTombstoneTx(
  tx: ConciliarDocumentTombstoneRefreshTx,
  _gate: Readonly<{ wasDirty: boolean }>,
  lifecycle: Readonly<{ source: string; sourceItemKey: string }>,
): Promise<Readonly<{ projectionInvalidated: boolean; rows: number }>> {
  if (lifecycle.source !== ONEDRIVE_SOURCE || !SOURCE_ITEM_KEY.test(lifecycle.sourceItemKey)) {
    throw new Error('CONCILIAR_TOMBSTONE_REFRESH_SOURCE_INVALID')
  }
  const selected = await tx.$queryRaw<ExistingProjectionRow[]>(Prisma.sql`
    SELECT p.*,p.cuenta_id AS "cuentaId"
    FROM conciliar_proyecciones p
    JOIN facturas_recibidas fr ON (
      (p.source->>'kind'='PAGO_FACTURA_RECIBIDA' AND p.source->>'facturaRecibidaId'=fr.id)
      OR
      (p.source->>'kind'='COBRO_CONFIRMING' AND p.source->>'confirmingId'=fr.id)
    )
    WHERE (fr.onedrive_drive_id || ':' || fr.onedrive_item_id)=${lifecycle.sourceItemKey}
    ORDER BY p.id ASC
    LIMIT 501
    FOR UPDATE OF p
  `)
  if (selected.length > 500) throw new Error('CONCILIAR_TOMBSTONE_REFRESH_TOO_MANY_ROWS')
  if (!selected.length) return { projectionInvalidated: false, rows: 0 }

  // This marker is the durable handoff to any reader/worker that observes the
  // transaction. It is created only for the positive tombstone already selected
  // above. An older unrelated dirty marker is left untouched and never cleared.
  if (!_gate.wasDirty) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE estado_proyeccion_conciliar
      SET dirty_at=CURRENT_TIMESTAMP,dirty_reason=${TOMBSTONE_DIRTY_REASON}
      WHERE singleton=true AND dirty_at IS NULL
    `)
  }
  const sealed = await sealRefreshRowsTx(tx, selected.map(toRefreshRow))
  // The guard's reread is the final authority. If the tombstone was unexpectedly
  // absent after the caller's lifecycle lock, stop rather than publishing a false
  // invalidation.
  if (sealed.some((row) => row.row.color !== 'AMBAR' || row.row.seleccionable)) {
    throw new Error('CONCILIAR_TOMBSTONE_REFRESH_NOT_SEALED')
  }
  await upsertRefreshRowsTx(tx, sealed)
  // A pre-existing dirty marker belongs to another source and must not be cleared
  // by this narrow refresh. We clear only the marker just written above, after all
  // affected rows were resealed in this same transaction; no full rebuild is run.
  await tx.$executeRaw(Prisma.sql`
    UPDATE estado_proyeccion_conciliar
    SET dirty_at=CASE WHEN ${_gate.wasDirty} THEN dirty_at ELSE NULL END,
        dirty_reason=CASE WHEN ${_gate.wasDirty} THEN dirty_reason ELSE NULL END,
        rebuilt_at=CASE WHEN ${_gate.wasDirty} THEN rebuilt_at ELSE CURRENT_TIMESTAMP END,
        projection_version=projection_version+1
    WHERE singleton=true
      AND (${_gate.wasDirty} OR dirty_reason=${TOMBSTONE_DIRTY_REASON})
  `)
  return { projectionInvalidated: true, rows: sealed.length }
}
