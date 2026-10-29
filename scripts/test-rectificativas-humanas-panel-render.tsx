import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  RectificativasHumanasPanelView,
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

const actionNoticeAfterLastRow = props({
  notice: 'Rectificativa confirmada.',
})
const noticeHtml = renderToStaticMarkup(createElement(RectificativasHumanasPanelView, actionNoticeAfterLastRow))
assert.equal(rectificativasPanelRenderState(actionNoticeAfterLastRow), 'aviso')
assert.match(noticeHtml, /Rectificativa confirmada/, 'El aviso no desaparece cuando la última fila deja el listado vacío.')

console.log('rectificativas panel SSR synthetic: empty hidden, populated visible, read error retryable, final-action notice retained')
