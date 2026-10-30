import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  RectificativasHumanasPanelView,
  rectificativasDecisionsBlocked,
  rectificativasPanelRenderState,
  type RectificativasHumanasPanelViewProps,
} from '../components/finanzas/rectificativas/RectificativasHumanasPanel'

const noop = () => {}
const props = (overrides: Partial<RectificativasHumanasPanelViewProps> = {}): RectificativasHumanasPanelViewProps => ({
  canRead: true,
  canWrite: true,
  loading: false,
  sending: false,
  data: { migrationReady: true, links: [] },
  readError: null,
  notice: null,
  reason: {},
  onRetry: noop,
  onReasonChange: noop,
  onDecide: noop,
  ...overrides,
})

const empty = props()
assert.equal(rectificativasPanelRenderState(empty), 'vacio')
assert.equal(renderToStaticMarkup(createElement(RectificativasHumanasPanelView, empty)), '', 'Un listado realmente vacío no añade superficie visual.')
assert.equal(rectificativasDecisionsBlocked({ canWrite: true, sending: false, readError: null }), false)
assert.equal(rectificativasDecisionsBlocked({ canWrite: true, sending: false, readError: 'Lectura obsoleta' }), true)
assert.equal(rectificativasDecisionsBlocked({ canWrite: true, sending: true, readError: null }), true)
assert.equal(rectificativasDecisionsBlocked({ canWrite: false, sending: false, readError: null }), true)

const populated = props({
  data: {
    migrationReady: true,
    links: [{
      id: 'synthetic-link', exactReference: 'R-SINTETICA', legacyState: 'PROPOSED', effectiveState: 'PROPOSED', createdAt: '2030-01-01T00:00:00.000Z',
      originalDocument: { number: 'ORIGINAL-SINTETICA', date: '2030-01-01T00:00:00.000Z', totalCents: 1000 },
      creditDocument: { number: 'RECT-SINTETICA', date: '2030-01-02T00:00:00.000Z', totalCents: -1000 },
    }],
  },
})
const populatedHtml = renderToStaticMarkup(createElement(RectificativasHumanasPanelView, populated))
assert.equal(rectificativasPanelRenderState(populated), 'contenido')
assert.match(populatedHtml, /Rectificativas documentales/)
assert.match(populatedHtml, /R-SINTETICA/)
assert.match(populatedHtml, /Confirmar/)

const failedRead = props({
  data: null,
  readError: 'Fallo sintético de lectura',
})
const failedReadHtml = renderToStaticMarkup(createElement(RectificativasHumanasPanelView, failedRead))
assert.equal(rectificativasPanelRenderState(failedRead), 'error')
assert.match(failedReadHtml, /role="alert"/)
assert.match(failedReadHtml, /Fallo sintético de lectura/)
assert.match(failedReadHtml, /Reintentar/)

const staleVisibleAfterFailedRefresh = props({
  data: populated.data,
  readError: 'Fallo sintético al refrescar una lista previa',
})
const staleHtml = renderToStaticMarkup(createElement(RectificativasHumanasPanelView, staleVisibleAfterFailedRefresh))
assert.equal(rectificativasPanelRenderState(staleVisibleAfterFailedRefresh), 'error')
assert.match(staleHtml, /R-SINTETICA/, 'La lista previa queda visible para explicar el fallo.')
assert.match(staleHtml, /<button(?=[^>]*disabled)[^>]*>Confirmar<\/button>/, 'No se puede confirmar desde una lectura obsoleta.')
assert.match(staleHtml, /<button(?=[^>]*disabled)[^>]*>Rechazar<\/button>/, 'No se puede rechazar desde una lectura obsoleta.')
assert.match(staleHtml, /<input(?=[^>]*aria-label="Motivo para rechazar")(?=[^>]*disabled)[^>]*\/>/, 'Tampoco se prepara una decisión sobre datos obsoletos.')

const decided = props({
  data: {
    migrationReady: true,
    links: [{ ...populated.data!.links[0]!, effectiveState: 'CONFIRMED' }],
  },
})
const decidedHtml = renderToStaticMarkup(createElement(RectificativasHumanasPanelView, decided))
assert.match(decidedHtml, /Volver a pendiente/, 'Una decisión vigente sólo expone el deshacer explícito.')
assert.doesNotMatch(decidedHtml, />Confirmar<|>Rechazar</)

const actionNoticeAfterLastRow = props({
  notice: 'Rectificativa confirmada.',
})
const noticeHtml = renderToStaticMarkup(createElement(RectificativasHumanasPanelView, actionNoticeAfterLastRow))
assert.equal(rectificativasPanelRenderState(actionNoticeAfterLastRow), 'aviso')
assert.match(noticeHtml, /Rectificativa confirmada/, 'El aviso no desaparece cuando la última fila deja el listado vacío.')

console.log('rectificativas panel SSR synthetic: empty hidden, populated visible, stale rows decision-locked after error, undo-only state, read retry and final-action notice retained')
