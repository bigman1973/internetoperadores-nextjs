/* Refresco documental dirigido: mocks de SQL, sin BD, red, Graph, OCR, B4 ni worker real. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import {
  acquireConciliarDocumentTombstoneRefreshGateTx,
  refreshConciliarProjectionForDocumentTombstoneTx,
} from '../lib/finanzas/conciliar-document-tombstone-refresh'

const LIFECYCLE = '11111111-1111-4111-8111-111111111111'
const SNAPSHOT = '22222222-2222-4222-8222-222222222222'
const FINGERPRINT = 'a'.repeat(64)
const source = { kind: 'PAGO_FACTURA_RECIBIDA', facturaRecibidaId: 'factura-sintetica', movimientoId: 'movimiento-sintetico', versionB4: 1 }

function sqlText(statement: unknown): string {
  return statement && typeof statement === 'object' && Array.isArray((statement as { strings?: unknown }).strings)
    ? (statement as { strings: readonly string[] }).strings.join('?')
    : String(statement)
}

function projection() {
  return {
    id: 'fila-sintetica', tab: 'PAGOS', movimiento_id: 'movimiento-sintetico', cuenta_id: 'cuenta-sintetica', cuentaId: 'cuenta-sintetica',
    fecha: '2026-10-29', importe_centimos: -100, pendiente_centimos: -100, color: 'VERDE', grupo: 'FACTURA_RECIBIDA',
    motivo: 'Coincidencia previa', concepto: 'Sintético', banco: null, cuenta: null, documento: null, propuesta: null,
    seleccionable: true, diferencia_centimos: 0, links_movimiento: null, detail: null, source, source_fingerprint: FINGERPRINT,
    updated_at: '2026-10-29T12:00:00.000Z',
  }
}

function tx(input: { dirty: boolean; rows?: readonly Record<string, unknown>[] }) {
  const queries: string[] = []
  const writes: string[] = []
  return {
    queries,
    writes,
    tx: {
      async $queryRaw<T>(statement: unknown): Promise<T> {
        const sql = sqlText(statement)
        queries.push(sql)
        if (sql.includes('pg_advisory_xact_lock')) {
          assert.equal(classifyPrisma5RawSqlStatement([statement]), 'advisory_lock')
          return [{ locked: '1' }] as T
        }
        if (sql.includes('FROM estado_proyeccion_conciliar')) {
          assert.equal(classifyPrisma5RawSqlStatement([statement]), 'row_lock')
          return [{ dirty: input.dirty }] as T
        }
        if (sql.includes('FROM conciliar_proyecciones p')) {
          assert.equal(classifyPrisma5RawSqlStatement([statement]), 'row_lock')
          return (input.rows ?? [projection()]) as T
        }
        if (sql.includes('WITH requested AS')) {
          assert.equal(classifyPrisma5RawSqlStatement([statement]), 'read_only')
          return [{
          sourceKind: 'RECIBIDA', sourceId: 'factura-sintetica', lifecycleId: LIFECYCLE, state: 'TOMBSTONED',
          currentVersion: 1, snapshotId: SNAPSHOT, tombstoneRecorded: true, changePending: false, recoveryPending: false,
          }] as T
        }
        throw new Error('SQL sintético no reconocido')
      },
      async $executeRaw(statement: unknown): Promise<number> {
        assert.equal(classifyPrisma5RawSqlStatement([statement]), 'mutating')
        writes.push(sqlText(statement))
        return 1
      },
    },
  }
}

test('tombstone positivo resella sólo la fila documental afectada como ámbar/no seleccionable y avanza recibo de proyección', async () => {
  const memory = tx({ dirty: false })
  const gate = await acquireConciliarDocumentTombstoneRefreshGateTx(memory.tx as any)
  assert.deepEqual(gate, { wasDirty: false })
  const result = await refreshConciliarProjectionForDocumentTombstoneTx(memory.tx as any, gate, {
    source: 'ONEDRIVE', sourceItemKey: 'drive-sintetico:item-sintetico',
  })
  assert.deepEqual(result, { projectionInvalidated: true, rows: 1 })
  assert.equal(memory.writes.length, 3, 'marca dirty interna, upsert dirigido y recibo/versionado se quedan en la misma transacción')
  assert.match(memory.writes[0]!, /SET dirty_at=CURRENT_TIMESTAMP,dirty_reason=/)
  assert.match(memory.writes[1]!, /INSERT INTO conciliar_proyecciones/)
  assert.match(memory.writes[1]!, /ON CONFLICT \(id\) DO UPDATE/)
  assert.match(memory.writes[2]!, /projection_version=projection_version\+1/)
  assert(memory.queries.some((sql) => sql.includes('JOIN facturas_recibidas fr')))
  assert(memory.queries.some((sql) => sql.includes('WITH requested AS')))
  const all = [...memory.queries, ...memory.writes].join('\n')
  assert.doesNotMatch(all, /operaciones_justificacion_b4|vinculos_movimiento_documento|estado_justificacion_movimientos|movimientos_bancarios|INSERT INTO document_version_/)
})

test('sin fila Conciliar afectada no crea dirty ni refresco global', async () => {
  const memory = tx({ dirty: false, rows: [] })
  const gate = await acquireConciliarDocumentTombstoneRefreshGateTx(memory.tx as any)
  const result = await refreshConciliarProjectionForDocumentTombstoneTx(memory.tx as any, gate, {
    source: 'ONEDRIVE', sourceItemKey: 'drive-sintetico:item-sintetico',
  })
  assert.deepEqual(result, { projectionInvalidated: false, rows: 0 })
  assert.equal(memory.writes.length, 0)
})

test('un dirty ajeno se conserva y el refresco dirigido no programa rebuild ni sync', async () => {
  const memory = tx({ dirty: true })
  const gate = await acquireConciliarDocumentTombstoneRefreshGateTx(memory.tx as any)
  const result = await refreshConciliarProjectionForDocumentTombstoneTx(memory.tx as any, gate, {
    source: 'ONEDRIVE', sourceItemKey: 'drive-sintetico:item-sintetico',
  })
  assert.equal(result.projectionInvalidated, true)
  assert.equal(memory.writes.length, 2, 'no sobrescribe la marca dirty ajena')
  const all = [...memory.queries, ...memory.writes].join('\n')
  assert.doesNotMatch(all, /rebuildConciliarProjection|scheduleConciliarProjectionRefresh|beforeInventory|fetch|https?:/i)
})

console.log('OK: refresco documental dirigido con mocks; sólo filas afectadas, dirty ajeno preservado y sin B4/ledger/Graph/OCR/sync.')
