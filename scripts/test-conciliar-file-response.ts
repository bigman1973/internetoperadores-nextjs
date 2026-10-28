import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  ConciliarFileResponseError,
  conciliarPdfFileResponse,
  safeConciliarPdfFilename,
} from '../lib/finanzas/conciliar-file-response'
import { requireB4ActorAccess, requireB4FinanceAccess } from '../lib/finanzas/reconciliation-auth'

const routeSource = readFileSync('app/api/admin/finanzas/conciliar/archivo/[id]/route.ts', 'utf8')
const syntheticPdf = Buffer.from('%PDF-1.7\n% synthetic only; no downloaded document\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'ascii')

test('Conciliar file response preserves controlled synthetic PDF bytes and hardened headers', async () => {
  const response = conciliarPdfFileResponse(syntheticPdf, 'Factura "Lorena"\r\n.pdf')

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/pdf')
  assert.equal(response.headers.get('content-length'), String(syntheticPdf.byteLength))
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN')
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'")
  assert.equal(response.headers.get('content-disposition'), "inline; filename*=UTF-8''Factura%20Lorena%20.pdf")
  assert.equal(response.headers.get('location'), null, 'the browser never receives a Graph/provider redirect')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), syntheticPdf)
})

test('Conciliar filename encoding cannot introduce response-header syntax', () => {
  const safe = safeConciliarPdfFilename("entrada'()\r\n.pdf")
  const response = conciliarPdfFileResponse(syntheticPdf, safe)
  const disposition = response.headers.get('content-disposition') ?? ''

  assert.equal(safe.includes('\r'), false)
  assert.equal(safe.includes('\n'), false)
  assert.match(disposition, /entrada%27%28%29%20.pdf$/)
  assert.equal(disposition.includes('\r'), false)
  assert.equal(disposition.includes('\n'), false)
})

test('Conciliar rejects a non-PDF before any inline response can be built', () => {
  assert.throws(
    () => conciliarPdfFileResponse(Buffer.from('<html>not a PDF</html>', 'utf8'), 'respuesta.html'),
    (error: unknown) => error instanceof ConciliarFileResponseError && error.code === 'ARCHIVO_NO_PDF',
  )
})

test('Conciliar B4 read authorization rejects an anonymous or live unpermitted user', async () => {
  const anonymous = await requireB4FinanceAccess('lectura', null)
  assert.equal(anonymous.ok, false)
  if (!anonymous.ok) {
    assert.equal(anonymous.response.status, 401)
    assert.match(anonymous.response.headers.get('content-type') ?? '', /^application\/json/)
    assert.equal(anonymous.response.headers.get('content-disposition'), null, 'an error cannot be interpreted as an inline PDF')
  }

  const liveUnpermittedDb: any = {
    usuarioAdmin: {
      findUnique: async () => ({ id: 73, activo: true, rol: 'VISOR', roles: [] }),
    },
    permisoArea: {
      findUnique: async () => ({ activo: true }),
    },
    permisoUsuario: {
      findMany: async () => [],
      count: async () => 1,
    },
  }
  const denied = await requireB4ActorAccess(73, 'lectura', liveUnpermittedDb)
  assert.equal(denied.ok, false)
  if (!denied.ok) {
    assert.equal(denied.response.status, 403)
    assert.match(denied.response.headers.get('content-type') ?? '', /^application\/json/)
    assert.equal(denied.response.headers.get('content-disposition'), null)
  }

  const accessIndex = routeSource.indexOf("requireB4FinanceAccess('lectura'")
  const resolverIndex = routeSource.indexOf('resolveConciliarProjectionFile(id)')
  assert(accessIndex >= 0 && resolverIndex >= 0 && accessIndex < resolverIndex, 'B4 access must happen before resolving the controlled file locator')
})
