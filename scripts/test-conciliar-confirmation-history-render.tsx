import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import ConciliarConfirmationHistory from '../components/finanzas/conciliar/ConciliarConfirmationHistory'

test('render: el panel de confirmaciones empieza cerrado y no carga historial por SSR', () => {
  const markup = renderToStaticMarkup(<ConciliarConfirmationHistory
    activeActuationSessionId={null}
    busy={false}
    refreshKey={0}
    onUndo={() => undefined}
    onLoadError={() => undefined}
  />)
  assert.match(markup, /Confirmaciones/)
  assert.match(markup, /Recibos duraderos de tus confirmaciones/)
  assert.match(markup, /Ver confirmaciones/)
  assert.doesNotMatch(markup, /Confirmados hoy/)
  assert.doesNotMatch(markup, /Historial<\/button>/)
})
