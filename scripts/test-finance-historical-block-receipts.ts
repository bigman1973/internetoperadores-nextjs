import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { groupHistoricalBlockReceiptEvents, HISTORICAL_DELEGATION_TEXT } from '../lib/finanzas/historical-block-receipts-db'
import { canUndoHistoricalBlock, parseHistoricalBlockReceipts } from '../components/finanzas/reconciliation-v2/HistoricalBlockReceiptsPanel'
import { buildDeshacerBloquePayload } from '../components/finanzas/reconciliation-v2/historical-bulk-contract'

const blockId = '123e4567-e89b-42d3-a456-426614174001'
const otherBlockId = '123e4567-e89b-42d3-a456-426614174002'

function event(overrides: Record<string, unknown> = {}) {
  return {
    bloqueId: blockId,
    movimientoId: 'movimiento-prueba',
    createdAt: new Date('2026-10-23T10:00:00.000Z'),
    actorNombre: 'Administración financiera',
    estadoOperacion: 'APLICADA',
    totalCargosCentimos: '-12345',
    totalCobrosCentimos: '6789',
    ejecutor: 'Manus',
    instruccionDe: 'Víctor Giró',
    fechaInstruccion: '2026-10-23',
    ...overrides,
  }
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    bloqueId: blockId,
    fechaPrimeraConfirmacion: '2026-10-23T10:00:00.000Z',
    fechaUltimaConfirmacion: '2026-10-23T10:01:00.000Z',
    actor: 'Administración financiera',
    confirmadas: 2,
    operacionesAplicadas: 2,
    operacionesRevertidas: 0,
    operacionesPendientes: 0,
    totalCargosCentimos: '-12345',
    totalCobrosCentimos: '6789',
    delegacion: HISTORICAL_DELEGATION_TEXT,
    ...overrides,
  }
}

test('agrupa por bloque, conserva los totales del detalle sin duplicarlos y marca la delegación canónica', () => {
  const grouped = groupHistoricalBlockReceiptEvents([
    event(),
    event({ movimientoId: 'movimiento-prueba-2', createdAt: new Date('2026-10-23T10:01:00.000Z') }),
    event({ bloqueId: otherBlockId, movimientoId: 'movimiento-prueba-3', createdAt: new Date('2026-10-22T10:00:00.000Z'), totalCargosCentimos: '0', totalCobrosCentimos: '10', ejecutor: null, instruccionDe: null, fechaInstruccion: null }),
  ])
  assert.equal(grouped.length, 2)
  const first = grouped.find((item) => item.bloqueId === blockId)
  assert(first)
  assert.equal(first.confirmadas, 2)
  assert.equal(first.operacionesAplicadas, 2)
  assert.equal(first.totalCargosCentimos, '-12345')
  assert.equal(first.totalCobrosCentimos, '6789')
  assert.equal(first.delegacion, HISTORICAL_DELEGATION_TEXT)
  assert.equal(grouped.find((item) => item.bloqueId === otherBlockId)?.delegacion, null)
})

test('falla cerradamente si el recibo contiene estados, importes o totales incoherentes', () => {
  assert.throws(() => groupHistoricalBlockReceiptEvents([event({ estadoOperacion: 'CUALQUIERA' })]))
  assert.throws(() => groupHistoricalBlockReceiptEvents([event(), event({ totalCargosCentimos: '-1' })]))
  assert.throws(() => groupHistoricalBlockReceiptEvents(Array.from({ length: 26 }, (_, index) => event({ movimientoId: `movimiento-${index}`, createdAt: new Date(1_000 + index) }))))
})

test('parser de interfaz sólo admite el contrato público, importes firmados y texto seguro', () => {
  const parsed = parseHistoricalBlockReceipts({ items: [receipt({ bulkKeyHash: 'no-debe-llegar-al-dom', requestHash: 'tampoco' })] })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) throw new Error('El parser rechazó un recibo válido.')
  assert.deepEqual(Object.keys(parsed.value[0]).sort(), [
    'actor', 'bloqueId', 'confirmadas', 'delegacion', 'fechaPrimeraConfirmacion', 'fechaUltimaConfirmacion',
    'operacionesAplicadas', 'operacionesPendientes', 'operacionesRevertidas', 'totalCargosCentimos', 'totalCobrosCentimos',
  ].sort())
  assert.equal(parseHistoricalBlockReceipts({ items: [receipt({ actor: '<script>alert(1)</script>\n' })] }).ok, false)
  assert.equal(parseHistoricalBlockReceipts({ items: [receipt({ totalCargosCentimos: '12345' })] }).ok, false)
  assert.equal(parseHistoricalBlockReceipts({ items: [receipt({ confirmadas: 2, operacionesAplicadas: 1, operacionesRevertidas: 0, operacionesPendientes: 0 })] }).ok, false)
  assert.equal(parseHistoricalBlockReceipts({ items: Array.from({ length: 101 }, () => receipt()) }).ok, false)
})

test('sólo permite reversión en bloque cuando todas las operaciones siguen aplicadas', () => {
  assert.equal(canUndoHistoricalBlock(receipt()), true)
  assert.equal(canUndoHistoricalBlock(receipt({ operacionesAplicadas: 1, operacionesRevertidas: 1 })), false)
  assert.equal(canUndoHistoricalBlock(receipt({ operacionesAplicadas: 1, operacionesPendientes: 1 })), false)
  assert.equal(canUndoHistoricalBlock(receipt({ confirmadas: 26, operacionesAplicadas: 26 })), false)
})

test('el cuerpo de reversión es UUID estricto e inmutable para reintentar exactamente el mismo POST', () => {
  const key = '123e4567-e89b-42d3-a456-426614174003'
  const payload = buildDeshacerBloquePayload(key, blockId)
  assert.deepEqual(payload, { action: 'deshacer_bloque', confirmacion: true, idempotencyKey: key, bloqueId: blockId })
  assert.ok(payload && Object.isFrozen(payload))
  assert.equal(buildDeshacerBloquePayload(key, 'bloque-visible-no-valido'), null)
})

test('el panel no realiza POST al montar y sólo apunta al endpoint existente de reversión', () => {
  const source = readFileSync(new URL('../components/finanzas/reconciliation-v2/HistoricalBlockReceiptsPanel.tsx', import.meta.url), 'utf8')
  assert.match(source, /const BULK_ENDPOINT = '\/api\/admin\/finanzas\/conciliacion-v2\/heredados-bloque'/)
  assert.match(source, /method: 'POST'/)
  assert.match(source, /onConfirm=\{\(\) => \{ void submitUndo\(\); \}\}/)
  const beforeExplicitSubmit = source.slice(0, source.indexOf('const submitUndo'))
  assert.doesNotMatch(beforeExplicitSubmit, /method: 'POST'/)
})
