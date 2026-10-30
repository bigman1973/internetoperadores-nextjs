import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import ConciliarArea3ReviewDialog from '../components/finanzas/conciliar/ConciliarArea3ReviewDialog'
import type { ConciliarReviewPreview, ConciliarRow } from '../components/finanzas/conciliar/conciliar-contract'

const row: ConciliarRow = {
  id: 'area3-row', movimientoId: 'movement-1', fecha: '2026-10-30', concepto: 'Pago sintético', banco: 'Banco', cuenta: 'Cuenta',
  importeCentimos: -10_000, pendienteCentimos: -10_000, color: 'AMBAR', grupo: 'PROVEEDORES', motivo: 'Revisión humana.',
  documento: { referencia: 'FAC-2026-42', tercero: 'Proveedor', importeCentimos: -10_000, fecha: '2026-10-29', href: null },
  propuesta: null, seleccionable: false, diferenciaCentimos: 0, linksMovimiento: [], detail: null, decisionHash: 'a'.repeat(64),
}
const review: ConciliarReviewPreview = {
  id: row.id, decisionHash: row.decisionHash, color: 'AMBAR', puedeConfirmarRevision: true, confirmableGreen: false,
  codigo: 'ACK_REQUERIDO', mensaje: 'El proveedor y el importe coinciden, pero requiere revisión.', sourceHash: 'b'.repeat(64),
  acknowledgement: { schema: 'AREA3_REVIEW_ACK_V1', version: '2026-10-30', motivo: 'SIN_REFERENCIA_DOCUMENTAL', sourceHash: 'b'.repeat(64) },
}

test('render G7: la excepción permanece ámbar, no es seleccionable y requiere ACK humano', () => {
  const html = renderToStaticMarkup(<ConciliarArea3ReviewDialog row={row} review={review} busy={false} onCancel={() => undefined} onConfirm={() => undefined} />)
  assert.match(html, /excepción humana: seguirá registrada como revisión ámbar/i)
  assert.match(html, /Comprobación del servidor/)
  assert.match(html, /Resto del movimiento: 0/)
  assert.match(html, /He revisado la advertencia anterior/)
  assert.match(html, /Confirmar esta propuesta/)
  assert.match(html, /disabled=""/, 'el botón no puede confirmar antes de que Lorena marque el ACK')
  assert.doesNotMatch(html, /Confirmar seleccionados/)
})
