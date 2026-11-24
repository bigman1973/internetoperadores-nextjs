/**
 * Área 1 · Batería sintética de la clave de Brevo (sin red ni claves reales).
 * Ejecutar: pnpm exec tsx scripts/test-area1-brevo-config.ts
 */
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { brevoApiKeySource, comprobarBrevo, getBrevoApiKey } from '../lib/brevo-config'

let ok = 0
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); ok++; console.log(`ok - ${name}`) }
const root = join(__dirname, '..')

async function main() {
  await t('prioridad: BREVO_API_KEY_STAGING sobre BREVO_API_KEY', () => {
    assert.equal(brevoApiKeySource({ BREVO_API_KEY_STAGING: 'st', BREVO_API_KEY: 'pr' }), 'BREVO_API_KEY_STAGING')
    assert.equal(getBrevoApiKey({ BREVO_API_KEY_STAGING: ' st ', BREVO_API_KEY: 'pr' }), 'st')
  })
  await t('sin clave de staging (o vacía) usa BREVO_API_KEY', () => {
    assert.equal(getBrevoApiKey({ BREVO_API_KEY: ' pr ' }), 'pr')
    assert.equal(getBrevoApiKey({ BREVO_API_KEY_STAGING: '   ', BREVO_API_KEY: 'pr' }), 'pr')
    assert.equal(brevoApiKeySource({ BREVO_API_KEY_STAGING: '', BREVO_API_KEY: 'pr' }), 'BREVO_API_KEY')
  })
  await t('sin ninguna: vacío y NO_CONFIGURADA, sin llamar a la red', async () => {
    assert.equal(getBrevoApiKey({}), '')
    let llamadas = 0
    const r = await comprobarBrevo((async () => { llamadas++; return new Response('{}') }) as typeof fetch, {})
    assert.equal(r.error, 'BREVO_API_KEY_NO_CONFIGURADA'); assert.equal(llamadas, 0)
  })
  await t('comprobación: solo GET a cuenta y listas, y nunca devuelve la clave', async () => {
    const vistas: Array<{ url: string; method: string; key: string }> = []
    const fake = (async (url: string, init: RequestInit) => {
      vistas.push({ url, method: String(init.method), key: String((init.headers as Record<string, string>)['api-key']) })
      if (url.endsWith('/v3/account')) return new Response(JSON.stringify({ companyName: 'Empresa prueba', email: 'no-se-devuelve@ejemplo.test', plan: [{ type: 'free' }] }))
      return new Response(JSON.stringify({ count: 2, lists: [{ id: 30, name: 'Empresas', uniqueSubscribers: 11 }, { id: 31, name: 'Particulares', totalSubscribers: 4 }] }))
    }) as unknown as typeof fetch
    const r = await comprobarBrevo(fake, { BREVO_API_KEY_STAGING: 'clave-secreta-st', BREVO_API_KEY: 'clave-pr' })
    assert.ok(r.ok); assert.equal(r.fuente, 'BREVO_API_KEY_STAGING')
    assert.deepEqual(vistas.map((v) => v.method), ['GET', 'GET'])
    assert.ok(vistas.every((v) => v.key === 'clave-secreta-st'))
    assert.deepEqual(r.listas, [{ id: 30, nombre: 'Empresas', suscriptores: 11 }, { id: 31, nombre: 'Particulares', suscriptores: 4 }])
    const json = JSON.stringify(r)
    assert.ok(!json.includes('clave-secreta-st') && !json.includes('clave-pr') && !json.includes('no-se-devuelve'))
  })
  await t('clave revocada o no válida: 401 explicado', async () => {
    const r = await comprobarBrevo((async () => new Response('{"code":"unauthorized","message":"Key not found"}', { status: 401 })) as typeof fetch, { BREVO_API_KEY: 'x' })
    assert.equal(r.ok, false); assert.equal(r.error, 'BREVO_HTTP_401_CLAVE_NO_VALIDA_O_REVOCADA'); assert.equal(r.pruebas.cuenta?.codigo, 'unauthorized')
  })
  await t('clave sin permiso de listas: cuenta OK, listas con error', async () => {
    const f = (async (url: string) => url.endsWith('/v3/account') ? new Response('{"plan":[]}') : new Response('{}', { status: 403 })) as unknown as typeof fetch
    const r = await comprobarBrevo(f, { BREVO_API_KEY: 'x' })
    assert.equal(r.ok, false); assert.equal(r.error, 'BREVO_LISTAS_HTTP_403')
  })
  await t('clave restringida sin permiso de cuenta: listas OK igualmente y el mensaje no incluye la clave', async () => {
    const f = (async (url: string) => url.endsWith('/v3/account') ? new Response('{"code":"permission_denied","message":"denied for k-secreta"}', { status: 403 }) : new Response('{"count":1,"lists":[{"id":32,"name":"Partners","uniqueSubscribers":0}]}')) as unknown as typeof fetch
    const r = await comprobarBrevo(f, { BREVO_API_KEY_STAGING: 'k-secreta' })
    assert.equal(r.ok, true); assert.equal(r.error, 'BREVO_CUENTA_HTTP_403_SIN_PERMISO_CUENTA'); assert.equal(r.listas.length, 1)
    assert.ok(!JSON.stringify(r).includes('k-secreta'))
  })
  await t('ningún fichero del panel lee process.env.BREVO_API_KEY directamente', () => {
    const out = execSync(`grep -rln "process.env.BREVO" app lib || true`, { cwd: root }).toString().trim().split('\n').filter(Boolean)
    assert.deepEqual(out, [])
  })
  console.log(`\n${ok} pruebas OK`)
}
main().catch((e) => { console.error(e); process.exit(1) })
