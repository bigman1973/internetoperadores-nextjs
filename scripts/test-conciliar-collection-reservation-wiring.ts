/* G1 wiring/query guard: sintético, sin BD, red, build ni mutaciones. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  canonicalDeltaProposalRows,
  closeDeltaProposalDependencies,
} from '../lib/finanzas/conciliar-delta'

const db = readFileSync('lib/finanzas/conciliar-db.ts', 'utf8')
const delta = readFileSync('lib/finanzas/conciliar-delta.ts', 'utf8')
const adapter = readFileSync('scripts/tests/conciliar-release-regression-adapter.ts', 'utf8')

function between(source: string, start: string, end: string): string {
  const left = source.indexOf(start)
  const right = source.indexOf(end, left + start.length)
  assert.ok(left >= 0 && right > left, `missing bounded source ${start}`)
  return source.slice(left, right)
}

test('rebuild y revalidación usan un plan G1 completo, no la primera propuesta por movimiento', () => {
  assert.match(db, /import\s*\{[\s\S]*planCollectionDocumentReservations/)
  assert.match(db, /export function collectionReservationResolution/)
  assert.match(db, /readLiveCollectionDocumentReservations/)
  assert.doesNotMatch(db, /const proposalByMovement = new Map<string, any>\(\)/)

  const rebuild = between(db, 'export async function rebuildConciliarProjectionTx', 'export async function rebuildConciliarProjection(')
  assert.match(rebuild, /readCollectionClientIdentityProfiles\(tx, proposals\.map/)
  assert.match(rebuild, /collectionReservationResolution\(\{[\s\S]*proposals, movements, invoiceDates, issuedReferences, clientIdentityByProposal, reservations/)
  assert.match(rebuild, /const selectedProposal = collectionReservations\.selectedByMovement\.get\(id\)/)
  assert.match(rebuild, /const reviewProposal = selectedProposal \? undefined : collectionReservations\.soleReviewByMovement\.get\(id\)/)
  assert.match(rebuild, /if \(selectedProposal && collection\.row\.color === 'VERDE'\)/)

  const revalidation = between(db, 'export async function assertLiveCollectionProjectionForActionTx', 'export function proposalCompositionInvoiceIds')
  assert.match(revalidation, /unresolvedMovements\(tx\), liveCollectionProposals\(tx\)/)
  assert.match(revalidation, /readLiveCollectionDocumentReservations\(base\)/)
  assert.match(revalidation, /collectionReservationResolution\(/)
  assert.match(revalidation, /selectedByMovement\.get\(source\.movimientoId\)\?\.propuestaId !== source\.propuestaId/)
})

test('el constructor mantiene la propuesta de revisión visible pero nunca seleccionable', () => {
  const constructor = between(db, 'export function collectionProjectionForMovement', 'export async function confirmingProjectionForMovement')
  assert.match(constructor, /reservationReviewOnly = false/)
  assert.match(constructor, /const green = !reservationReviewOnly && status\.green/)
  assert.match(constructor, /motivo = reservationReviewOnly/)
  assert.match(constructor, /'La propuesta de cobro requiere revisión antes de confirmar\.'/)
})

test('la lectura de reservas usa propietarios reales B4/B7 y no crea FI, nulos ni consultas por factura', () => {
  const reader = between(db, 'export async function readLiveCollectionDocumentReservations', 'export type CollectionReservationResolution')
  for (const fragment of [
    "v.activo AND v.tipo_linea='DOCUMENTO'",
    'd.activo AND d.factura_emitida_id IS NOT NULL',
    "o.estado='APLICADA'",
    'o.revertida_at IS NULL',
    "state.estado='JUSTIFICADO'",
    'recibos_cobro_remesa_b7',
    'lineas_recibo_cobro_remesa_b7',
    "receipt.estado='CONFIRMADO'",
    "line.snapshot->'facturaEmitida'->>'id'=line.factura_emitida_id",
  ]) assert.ok(reader.includes(fragment), `missing real reservation guard: ${fragment}`)
  assert.doesNotMatch(reader, /ROW_NUMBER\s*\(/i)
  assert.doesNotMatch(reader, /TRANSLATE\s*\(/i)
  assert.doesNotMatch(reader, /facturas_emitidas\s+fi\s+WHERE/i)
  assert.doesNotMatch(reader, /status:\s*'HISTORICAL'/)
  assert.doesNotMatch(reader, /documentKey:\s*['"]0['"]|proposalKey:\s*['"]0['"]|movementKey:\s*['"]0['"]/) 
})

test('delta conserva todas las propuestas hermanas y cierra sus dependencias completas antes de pintar', () => {
  assert.doesNotMatch(delta, /function canonicalProposalRows/)
  assert.match(delta, /export function canonicalDeltaProposalRows/)
  assert.match(delta, /const byProposal = new Map<string, ProposalRow>\(\)/)
  assert.match(delta, /collectionReservationResolution\(/)
  assert.match(delta, /readLiveCollectionDocumentReservations\(tx\)/)
  assert.match(delta, /if \(!clientIdentityProfiles\) return null/)
  assert.match(delta, /row\.row\.color !== 'VERDE'/)

  const forward = closeDeltaProposalDependencies(['fi-a'], [
    { propuestaId: 'proposal-a', movimientoId: 'movement-a', invoiceIds: ['fi-a'] },
    { propuestaId: 'proposal-a-review', movimientoId: 'movement-a', invoiceIds: ['fi-b'] },
    { propuestaId: 'proposal-b', movimientoId: 'movement-b', invoiceIds: ['fi-b'] },
  ])
  const reverse = closeDeltaProposalDependencies(['fi-a'], [
    { propuestaId: 'proposal-b', movimientoId: 'movement-b', invoiceIds: ['fi-b'] },
    { propuestaId: 'proposal-a-review', movimientoId: 'movement-a', invoiceIds: ['fi-b'] },
    { propuestaId: 'proposal-a', movimientoId: 'movement-a', invoiceIds: ['fi-a'] },
  ])
  assert.deepEqual(forward, { invoiceIds: ['fi-a', 'fi-b'], movimientoIds: ['movement-a', 'movement-b'] })
  assert.deepEqual(reverse, forward)
  const canonical = canonicalDeltaProposalRows([
    { propuestaId: 'p-review', movimientoId: 'm', fecha: '2026-01-01', composicion: [{ facturaEmitidaId: 'fi-b' }] },
    { propuestaId: 'p-exact', movimientoId: 'm', fecha: '2026-01-01', composicion: [{ facturaEmitidaId: 'fi-a' }] },
  ])
  assert.deepEqual(canonical?.map(row => row.propuestaId), ['p-exact', 'p-review'])
})

test('el adaptador global lee seleccionable y distingue RESERVED de REVIEW con reservas B4/B7 observadas', () => {
  assert.match(adapter, /p\.seleccionable/)
  assert.match(adapter, /COLLECTION_RESERVATION_COUNT_SQL/)
  assert.match(adapter, /COLLECTION_RESERVATION_PAGE_SQL/)
  assert.match(adapter, /assignment: row\.color === 'VERDE' && row\.seleccionable === true \? 'RESERVED'/)
  assert.match(adapter, /quote: row\.color === 'VERDE' && row\.seleccionable === true \? 'EXACT' as const : 'AMBER' as const/)
  assert.match(adapter, /sourceOnly: false/)
  assert.match(adapter, /projectionProof: \{ proposalKey: row\.source\.propuestaId, movementKey: row\.movementKey, color: row\.color, seleccionable: row\.seleccionable \}/)
  assert.doesNotMatch(adapter, /sourceOnly: true, projectionProof: null/)
  assert.match(adapter, /quotedAmountCents: proposal \? integer\(proposal\.amountCents\) : null/)
  assert.match(adapter, /collectionReservations/)
  assert.doesNotMatch(adapter, /ROW_NUMBER\s*\(/i)
  assert.doesNotMatch(adapter, /TRANSLATE\s*\(/i)
})

console.log('OK: wiring G1 global/delta, revalidación y SQL guards verificados con fixtures sintéticas.')
