import assert from 'node:assert/strict'
import test from 'node:test'
import { actuationControlHeaders } from '../components/impersonation/control-client'

test('obtiene protección de sesión por GET sin caché y no concede permisos', async () => {
  const original = globalThis.fetch
  const calls: Array<{ url: unknown; init: RequestInit | undefined }> = []
  globalThis.fetch = (async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ csrfToken: 'a'.repeat(64), canStart: false }), { status: 200 })
  }) as typeof fetch
  try {
    assert.deepEqual(await actuationControlHeaders(), { 'Content-Type': 'application/json', Accept: 'application/json', 'x-io-actuation-csrf': 'a'.repeat(64) })
    assert.equal(calls[0].url, '/api/admin/actuar-como')
    assert.equal(calls[0].init?.cache, 'no-store')
    assert.equal(calls[0].init?.body, undefined)
  } finally { globalThis.fetch = original }
})

test('no admite respuesta sin token protegido', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({ canStart: true }), { status: 200 })) as typeof fetch
  try { await assert.rejects(actuationControlHeaders(), /proteger la solicitud/) }
  finally { globalThis.fetch = original }
})

test('no reutiliza protección tras perder autenticación', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch
  try { await assert.rejects(actuationControlHeaders(), /comprobar tu sesión/) }
  finally { globalThis.fetch = original }
})

test('rechaza token malformado, corto o excesivo', async () => {
  const original = globalThis.fetch
  try {
    for (const csrfToken of ['corto', 'a'.repeat(2049), 'a'.repeat(64) + '\r\n', 'a'.repeat(64) + ':']) {
      globalThis.fetch = (async () => new Response(JSON.stringify({ csrfToken }), { status: 200 })) as typeof fetch
      await assert.rejects(actuationControlHeaders(), /proteger la solicitud/)
    }
  } finally { globalThis.fetch = original }
})
