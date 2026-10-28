/* C3 B5: pruebas sintéticas puras. Sin Prisma, BD, red, build ni tsc. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { selectConciliarB5DocumentReview, type ConciliarB5ReviewInput, type ConciliarB5TicketCandidate } from '../lib/finanzas/conciliar-b5-document-core'

const MOVEMENT_ID = 'movimiento-c3-01'
const baseTicket: ConciliarB5TicketCandidate = {
  adjuntoB5Id: 'adjunto-c3-01', movimientoId: MOVEMENT_ID, gastoId: 'gasto-c3-01', documentoConciliableId: 'documento-c3-01',
  uploadCompleto: true, documentoActivo: true, gastoRevalidable: true, archivoControlado: true,
  fechaDocumento: '2026-10-20', importeDocumentoCentimos: 12_345, importeGastoCentimos: 12_345,
  importeObjetivoCentimos: -12_345, asignadoActivoCentimos: 0, referencia: 'TICKET-2026-001', tercero: 'Proveedor C3',
}
function input(overrides: Partial<ConciliarB5ReviewInput> = {}): ConciliarB5ReviewInput {
  return {
    movimientoId: MOVEMENT_ID, importeMovimientoCentimos: -12_345, fechaMovimiento: '2026-10-21',
    tickets: [baseTicket], soportes: [], ...overrides,
  }
}

test('ticket B5 del mismo movimiento, exacto, vigente y controlado queda revisable/confirmable sin exponer locator', () => {
  const result = selectConciliarB5DocumentReview(input())
  assert.equal(result.kind, 'TICKET')
  if (result.kind !== 'TICKET') throw new Error('La fixture debía producir ticket.')
  assert.equal(result.color, 'VERDE')
  assert.equal(result.seleccionable, true)
  assert.equal(result.importeDocumentoCentimos, 12_345)
  assert.deepEqual(result.source, {
    kind: 'PAGO_TICKET_B5', movimientoId: MOVEMENT_ID, adjuntoB5Id: 'adjunto-c3-01', gastoId: 'gasto-c3-01', documentoConciliableId: 'documento-c3-01',
  })
  assert.doesNotMatch(JSON.stringify(result), /drive|item|url|locator/i)
})

test('un desfase de un céntimo deja ticket B5 ámbar y no seleccionable', () => {
  const result = selectConciliarB5DocumentReview(input({ tickets: [{ ...baseTicket, importeObjetivoCentimos: -12_344 }] }))
  assert.equal(result.kind, 'TICKET')
  if (result.kind !== 'TICKET') throw new Error('La fixture debía producir ticket.')
  assert.equal(result.color, 'AMBAR')
  assert.equal(result.seleccionable, false)
  assert.equal(result.diferenciaCentimos, -1)
  assert.match(result.motivo, /importes.*no coinciden/i)
})

test('ticket B5 de fecha posterior o con capacidad ya usada no se puede confirmar', () => {
  for (const ticket of [
    { ...baseTicket, fechaDocumento: '2026-10-22' },
    { ...baseTicket, asignadoActivoCentimos: -12_345 },
  ]) {
    const result = selectConciliarB5DocumentReview(input({ tickets: [ticket] }))
    assert.equal(result.kind, 'TICKET')
    if (result.kind !== 'TICKET') throw new Error('La fixture debía producir ticket.')
    assert.equal(result.color, 'AMBAR')
    assert.equal(result.seleccionable, false)
  }
})

test('dos tickets B5 exactos no se eligen por importe: permanecen ámbar', () => {
  const result = selectConciliarB5DocumentReview(input({ tickets: [baseTicket, { ...baseTicket, adjuntoB5Id: 'adjunto-c3-02', gastoId: 'gasto-c3-02', documentoConciliableId: 'documento-c3-02' }] }))
  assert.equal(result.kind, 'TICKET')
  if (result.kind !== 'TICKET') throw new Error('La fixture debía producir ticket.')
  assert.equal(result.color, 'AMBAR')
  assert.equal(result.seleccionable, false)
  assert.match(result.motivo, /más de un ticket/i)
})

test('SOPORTE B5 completo es visible sólo ámbar y nunca fabrica importe ni selección', () => {
  const result = selectConciliarB5DocumentReview(input({ tickets: [], soportes: [{ adjuntoB5Id: 'soporte-c3-01', movimientoId: MOVEMENT_ID, uploadCompleto: true, referencia: 'Justificante manual' }] }))
  assert.deepEqual(result, {
    kind: 'SOPORTE', color: 'AMBAR', seleccionable: false,
    motivo: 'Hay un archivo recibido. Revísalo: no acredita por sí solo un importe ni justifica el cargo.',
    importeDocumentoCentimos: null, referencia: 'Justificante manual',
    source: { kind: 'PAGO_SOPORTE_B5', movimientoId: MOVEMENT_ID, adjuntoB5Id: 'soporte-c3-01' },
  })
})

test('un ticket de otro movimiento no se cruza por importe; sólo queda soporte ámbar si existe', () => {
  const result = selectConciliarB5DocumentReview(input({
    tickets: [{ ...baseTicket, movimientoId: 'otro-movimiento' }],
    soportes: [{ adjuntoB5Id: 'soporte-c3-01', movimientoId: MOVEMENT_ID, uploadCompleto: true, referencia: null }],
  }))
  assert.equal(result.kind, 'SOPORTE')
  if (result.kind !== 'SOPORTE') throw new Error('La fixture debía producir soporte.')
  assert.equal(result.importeDocumentoCentimos, null)
  assert.equal(result.seleccionable, false)
})

console.log('OK: C3 B5 conserva exactitud de céntimo/fecha/capacidad, no cruza movimientos y no da importe a SOPORTE.')
