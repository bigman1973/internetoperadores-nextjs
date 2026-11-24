/**
 * Área 1 · Batería de la lista blanca de listas de Brevo de IO (sintética, sin red).
 * Ejecutar: pnpm exec tsx scripts/test-area1-brevo-listas-io.ts
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { crearBrevoFetch, type BrevoRegistro } from '../lib/brevo-fetch'
import { brevoListasIO, listasDeLlamada, listasFueraDeIO } from '../lib/brevo-listas-io'

let ok = 0
const t = async (n: string, f: () => void | Promise<void>) => { await f(); ok++; console.log(`ok - ${n}`) }
const root = join(__dirname, '..')
const PROD = { VERCEL_ENV: 'production' }
function fake() {
  const llamadas: string[] = []; const logs: BrevoRegistro[] = []
  const fetchImpl = (async (u: any, i: any = {}) => { llamadas.push(`${(i.method || 'GET').toUpperCase()} ${new URL(String(u)).pathname}`); return new Response('{}', { status: 201 }) }) as typeof fetch
  return { llamadas, logs, f: (env: any) => crearBrevoFetch({ env, fetchImpl, log: (r) => logs.push(r) }) }
}

async function main() {
  await t('por defecto: 22-24 y 30-40 son de IO; 8-18 y las del grupo no', () => {
    const s = brevoListasIO({})
    for (const id of [22, 23, 24, 30, 31, 32, 33, 39, 40]) assert.ok(s.has(id), String(id))
    for (const id of [8, 10, 18, 1, 25, 41]) assert.ok(!s.has(id), String(id))
  })
  await t('BREVO_LISTAS_IO_EXTRA añade listas revisadas (p. ej. 8,10) e ignora basura', () => {
    const s = brevoListasIO({ BREVO_LISTAS_IO_EXTRA: '8, 10,abc,-3' })
    assert.ok(s.has(8) && s.has(10) && !s.has(-3))
  })
  await t('detecta listas en la ruta y en el cuerpo (listIds, unlinkListIds, recipients)', () => {
    assert.deepEqual(listasDeLlamada('/v3/contacts/lists/31/contacts/add', null), [31])
    assert.deepEqual(listasDeLlamada('/v3/contacts', JSON.stringify({ listIds: [30], unlinkListIds: [12] })), [30, 12])
    assert.deepEqual(listasDeLlamada('/v3/emailCampaigns', JSON.stringify({ recipients: { listIds: [5], exclusionListIds: [10] } })), [5, 10])
    assert.deepEqual(listasFueraDeIO('/v3/contacts', JSON.stringify({ listIds: [30, 5] }), {}), [5])
  })
  await t('producción: lista de IO pasa igual que antes (30/31/32)', async () => {
    const x = fake(); const f = x.f(PROD)
    await f('https://api.brevo.com/v3/contacts', { method: 'POST', body: JSON.stringify({ email: 'a@example.test', listIds: [30] }) })
    await f('https://api.brevo.com/v3/contacts/lists/32/contacts/add', { method: 'POST', body: JSON.stringify({ emails: ['a@example.test'] }) })
    assert.deepEqual(x.llamadas, ['POST /v3/contacts', 'POST /v3/contacts/lists/32/contacts/add'])
  })
  await t('producción: lista de otra empresa → 403 sin llamar a Brevo', async () => {
    const x = fake(); const f = x.f(PROD)
    const r = await f('https://api.brevo.com/v3/contacts', { method: 'POST', body: JSON.stringify({ email: 'a@example.test', listIds: [30, 5] }) })
    assert.equal(r.status, 403); assert.equal(x.llamadas.length, 0); assert.equal(x.logs[0].accion, 'bloqueado_lista_no_io')
  })
  await t('también bloquea LEER miembros de una lista ajena; el listado general de listas sí pasa', async () => {
    const x = fake(); const f = x.f({ VERCEL_ENV: 'preview' })
    assert.equal((await f('https://api.brevo.com/v3/contacts/lists/8/contacts')).status, 403)
    assert.equal((await f('https://api.brevo.com/v3/contacts/lists?limit=50&offset=0')).status, 201)
    assert.deepEqual(x.llamadas, ['GET /v3/contacts/lists'])
  })
  await t('estática: todas las listas fijas del código están en la lista blanca', () => {
    const permitidas = brevoListasIO({}); const vistos: number[] = []
    const recorrer = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== 'node_modules' && !n.startsWith('.')) recorrer(p) } else if (/\.(ts|tsx)$/.test(n)) {
      const s = readFileSync(p, 'utf8'); if (!s.includes('brevo')) continue
      for (const m of s.matchAll(/(?:BREVO_LISTA?_[A-Z_]+|PARTICULAR|EMPRESA)\s*[:=]\s*(\d+)/g)) vistos.push(Number(m[1]))
    } } }
    recorrer(join(root, 'app')); recorrer(join(root, 'lib'))
    assert.ok(vistos.length >= 3); for (const id of vistos) assert.ok(permitidas.has(id), `lista ${id}`)
  })
  console.log(`\n${ok} pruebas OK`)
}
main().catch((e) => { console.error(e); process.exit(1) })
