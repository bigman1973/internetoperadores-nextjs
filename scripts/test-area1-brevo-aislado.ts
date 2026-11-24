/**
 * Área 1 · Batería del aislamiento de Brevo (sin red ni claves reales).
 * Demuestra: en staging/previews solo lecturas reales; correos desviados o no enviados; escrituras simuladas;
 * en producción nada cambia; depende del entorno y no de la clave.
 * Ejecutar: pnpm exec tsx scripts/test-area1-brevo-aislado.ts
 */
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { brevoModo, crearBrevoFetch, type BrevoRegistro } from '../lib/brevo-fetch'

let ok = 0
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); ok++; console.log(`ok - ${name}`) }
const root = join(__dirname, '..')

function arnes(env: Record<string, string | undefined>) {
  const llamadas: Array<{ url: string; init: RequestInit }> = []
  const registros: BrevoRegistro[] = []
  const f = crearBrevoFetch({
    env,
    fetchImpl: (async (url: string, init: RequestInit) => { llamadas.push({ url: String(url), init }); return new Response('{"real":true}', { status: 200 }) }) as unknown as typeof fetch,
    log: (r) => registros.push(r),
  })
  return { f, llamadas, registros }
}
const correo = (extra: Record<string, unknown> = {}) => ({ method: 'POST', headers: { 'api-key': 'k' }, body: JSON.stringify({ sender: { email: 'web@internetoperadores.com' }, to: [{ email: 'cliente@ejemplo.test' }], cc: [{ email: 'cc@ejemplo.test' }], bcc: [{ email: 'a@ejemplo.test' }, { email: 'b@ejemplo.test' }], subject: 'Hola', htmlContent: '<p>x</p>', ...extra }) })
const STAGING = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'staging' }
const SMTP = 'https://api.brevo.com/v3/smtp/email'

async function main() {
  await t('modo: producción real; preview y development aislados; local real salvo BREVO_STAGING_SANDBOX=1', () => {
    assert.equal(brevoModo({ VERCEL_ENV: 'production' }), 'real')
    assert.equal(brevoModo({ VERCEL_ENV: 'production', BREVO_STAGING_SANDBOX: '1' }), 'real')
    assert.equal(brevoModo({ VERCEL_ENV: 'preview' }), 'aislado')
    assert.equal(brevoModo({ VERCEL_ENV: 'development' }), 'aislado')
    assert.equal(brevoModo({}), 'real')
    assert.equal(brevoModo({ BREVO_STAGING_SANDBOX: '1' }), 'aislado')
  })
  await t('el modo depende del entorno, no de la clave', () => {
    for (const claves of [{}, { BREVO_API_KEY: 'a' }, { BREVO_API_KEY_STAGING: 'b' }, { BREVO_API_KEY: 'a', BREVO_API_KEY_STAGING: 'b' }]) {
      assert.equal(brevoModo({ ...STAGING, ...claves }), 'aislado')
      assert.equal(brevoModo({ VERCEL_ENV: 'production', ...claves }), 'real')
    }
  })
  await t('producción: correo, alta de contacto y lista llegan a Brevo SIN ningún cambio', async () => {
    const { f, llamadas, registros } = arnes({ VERCEL_ENV: 'production', BREVO_STAGING_TEST_EMAIL: 'pruebas@internetoperadores.com' })
    const init = correo()
    await f(SMTP, init)
    await f('https://api.brevo.com/v3/contacts', { method: 'POST', body: '{"email":"x@ejemplo.test"}' })
    await f('https://api.brevo.com/v3/contacts/lists/30/contacts/add', { method: 'POST', body: '{"emails":["x@ejemplo.test"]}' })
    assert.equal(llamadas.length, 3)
    assert.equal(llamadas[0].init, init)
    assert.equal(registros.length, 0)
  })
  await t('staging: las lecturas (GET) sí llegan a Brevo', async () => {
    const { f, llamadas } = arnes(STAGING)
    const r = await f('https://api.brevo.com/v3/contacts/lists?limit=50', { method: 'GET' })
    await f('https://api.brevo.com/v3/account')
    assert.equal(llamadas.length, 2); assert.equal(r.status, 200)
  })
  await t('staging sin BREVO_STAGING_TEST_EMAIL: el correo NO se envía y se registra sin emails', async () => {
    const { f, llamadas, registros } = arnes(STAGING)
    const r = await f(SMTP, correo())
    assert.equal(llamadas.length, 0)
    assert.equal(r.status, 201); assert.equal(r.headers.get('x-brevo-simulado'), '1')
    assert.ok((await r.json()).messageId)
    assert.deepEqual(registros, [{ modo: 'aislado', accion: 'no_enviado', metodo: 'POST', ruta: '/v3/smtp/email', destinatarios: 4 }])
    assert.ok(!JSON.stringify(registros).includes('@'))
  })
  await t('staging con correo de prueba no válido: tampoco se envía', async () => {
    const { f, llamadas } = arnes({ ...STAGING, BREVO_STAGING_TEST_EMAIL: 'no-es-un-email' })
    await f(SMTP, correo()); assert.equal(llamadas.length, 0)
  })
  await t('staging con BREVO_STAGING_TEST_EMAIL: va SOLO a esa dirección, sin cc ni bcc, con aviso en el asunto', async () => {
    const { f, llamadas, registros } = arnes({ ...STAGING, BREVO_STAGING_TEST_EMAIL: 'pruebas@internetoperadores.com' })
    await f(SMTP, correo())
    assert.equal(llamadas.length, 1)
    const enviado = JSON.parse(String(llamadas[0].init.body))
    assert.deepEqual(enviado.to, [{ email: 'pruebas@internetoperadores.com', name: 'Prueba staging' }])
    assert.equal(enviado.cc, undefined); assert.equal(enviado.bcc, undefined)
    assert.match(enviado.subject, /^\[STAGING · 4 dest\.\] Hola$/)
    assert.ok(!String(llamadas[0].init.body).includes('ejemplo.test'))
    assert.equal(registros[0].accion, 'desviado')
  })
  await t('staging: comunicado masivo en bcc y messageVersions también se desvían enteros', async () => {
    const { f, llamadas } = arnes({ ...STAGING, BREVO_STAGING_TEST_EMAIL: 'pruebas@internetoperadores.com' })
    const bcc = Array.from({ length: 50 }, (_, i) => ({ email: `c${i}@ejemplo.test` }))
    await f(SMTP, correo({ bcc, messageVersions: [{ to: [{ email: 'v1@ejemplo.test' }], bcc }, { to: [{ email: 'v2@ejemplo.test' }] }] }))
    const cuerpo = String(llamadas[0].init.body)
    assert.ok(!cuerpo.includes('ejemplo.test'))
    assert.equal(JSON.parse(cuerpo).messageVersions.length, 1)
  })
  await t('staging: altas, cambios y bajas de contactos y listas se simulan (0 llamadas)', async () => {
    const { f, llamadas, registros } = arnes({ ...STAGING, BREVO_STAGING_TEST_EMAIL: 'pruebas@internetoperadores.com' })
    const alta = await f('https://api.brevo.com/v3/contacts', { method: 'POST', body: '{"email":"x@ejemplo.test","listIds":[30]}' })
    assert.equal(alta.status, 201); assert.deepEqual(await alta.json(), { id: 0 })
    const lista = await f('https://api.brevo.com/v3/contacts/lists/31/contacts/add', { method: 'POST', body: '{"emails":["x@ejemplo.test"]}' })
    assert.deepEqual((await lista.json()).contacts.failure, [])
    await f('https://api.brevo.com/v3/contacts/x%40ejemplo.test', { method: 'PUT', body: '{}' })
    await f('https://api.brevo.com/v3/contacts/x%40ejemplo.test', { method: 'DELETE' })
    await f('https://api.brevo.com/v3/contacts/lists/32/contacts/remove', { method: 'POST', body: '{}' })
    assert.equal(llamadas.length, 0)
    assert.equal(registros.length, 5); assert.ok(registros.every((r) => r.accion === 'simulado'))
    assert.ok(!JSON.stringify(registros).includes('ejemplo.test'.replace('.', '%2E')) && !JSON.stringify(registros.map((r) => r.ruta)).includes('@'))
  })
  await t('staging: campañas y webhooks se simulan (0 llamadas)', async () => {
    const { f, llamadas } = arnes({ ...STAGING, BREVO_STAGING_TEST_EMAIL: 'pruebas@internetoperadores.com' })
    await f('https://api.brevo.com/v3/emailCampaigns', { method: 'POST', body: '{}' })
    await f('https://api.brevo.com/v3/emailCampaigns/5/sendNow', { method: 'POST' })
    await f('https://api.brevo.com/v3/webhooks', { method: 'POST', body: '{}' })
    assert.equal(llamadas.length, 0)
  })
  await t('ninguna ruta llama a api.brevo.com con fetch directo: todas pasan por brevoFetch', () => {
    const out = execSync(`grep -rnE "[^o]fetch\\(\\s*['\\\`]https://api\\.brevo" app lib || true`, { cwd: root }).toString().trim()
    assert.equal(out, '')
    const usos = Number(execSync(`grep -rnE "brevoFetch\\(\\s*['\\\`]https://api\\.brevo" app lib | wc -l`, { cwd: root }).toString().trim())
    assert.ok(usos >= 51, `usos=${usos}`)
  })
  console.log(`\n${ok} pruebas OK`)
}
main().catch((e) => { console.error(e); process.exit(1) })
