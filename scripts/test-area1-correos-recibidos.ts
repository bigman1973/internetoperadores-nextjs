/**
 * Área 1 · Batería: correos recibidos de Outlook en la ficha (solo lectura, sin guardar el contenido).
 * Sin red ni BD: Graph se simula con un fetch falso; la ruta y el componente se comprueban por código.
 * Uso: DATABASE_URL=postgresql://x:y@localhost:1/x npx tsx scripts/test-area1-correos-recibidos.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { direccionesRecibidos, filtroRecibidos, leerCorreosRecibidos } from '../lib/area1-m365-graph'
import { eventosDeRecibidos } from '../lib/area1-ficha-cliente'

let ok = 0
let total = 0
async function test(nombre: string, fn: () => void | Promise<void>) {
  total++
  try { await fn(); ok++; console.log(`  ✓ ${nombre}`) } catch (e) { console.log(`  ✗ ${nombre}\n    ${e instanceof Error ? e.message : e}`) }
}
type Llamada = { url: URL; init: RequestInit | undefined }
function fetchFalso(respuestas: Array<{ status: number; body: unknown }>) {
  const llamadas: Llamada[] = []
  const impl = (async (url: string, init?: RequestInit) => {
    llamadas.push({ url: new URL(url), init })
    const r = respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)]
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
  return { impl, llamadas }
}
const msg = (id: string, de: string, fecha: string, extra: Record<string, unknown> = {}) => ({ id, receivedDateTime: fecha, from: { emailAddress: { address: de, name: `Nombre ${id}` } }, subject: `Asunto ${id}`, bodyPreview: 'x'.repeat(500), webLink: `https://outlook.test/${id}`, isDraft: false, ...extra })
const DESDE = new Date('2026-05-01T00:00:00Z')

async function main() {
  console.log('Correos recibidos de Outlook (solo lectura)')

  await test('direcciones: minúsculas, sin repetir, sin dominio propio, sin inválidas y con tope', () => {
    const r = direccionesRecibidos([' Ana@Cliente.es ', 'ana@cliente.es', 'yo@internetoperadores.com', 'no-es-email', null, '', "x'@a.es", 'b@cliente.es'])
    assert.deepEqual(r, ['ana@cliente.es', 'b@cliente.es'])
    assert.equal(direccionesRecibidos(Array.from({ length: 30 }, (_, i) => `p${i}@c.es`)).length, 20)
  })
  await test('filtro: fecha primero (exigido por $orderby) y comillas escapadas', () => {
    const f = filtroRecibidos(["a@c.es", "o'b@c.es"], DESDE)
    assert.ok(f.startsWith(`receivedDateTime ge ${DESDE.toISOString()} and (`))
    assert.ok(f.includes("from/emailAddress/address eq 'o''b@c.es'"))
    assert.ok(f.includes(' or '))
  })
  await test('sin direcciones no llama a Graph', async () => {
    const { impl, llamadas } = fetchFalso([{ status: 200, body: { value: [] } }])
    const r = await leerCorreosRecibidos('tok', [], { desde: DESDE }, impl)
    assert.equal(r.ok, true); assert.equal(r.correos.length, 0); assert.equal(llamadas.length, 0)
  })
  await test('solo GET a /me/messages con token delegado; sin cuerpo completo (bodyPreview)', async () => {
    const { impl, llamadas } = fetchFalso([{ status: 200, body: { value: [msg('1', 'a@c.es', '2026-11-20T10:00:00Z')] } }])
    await leerCorreosRecibidos('tok', ['a@c.es'], { desde: DESDE }, impl)
    assert.equal(llamadas.length, 1)
    const { url, init } = llamadas[0]
    assert.equal(init?.method, 'GET'); assert.equal(init?.body, undefined)
    assert.equal(url.pathname, '/v1.0/me/messages')
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer tok')
    const sel = url.searchParams.get('$select') || ''
    assert.ok(sel.includes('bodyPreview') && !/\bbody\b/.test(sel.replace('bodyPreview', '')))
    assert.equal(url.searchParams.get('$orderby'), 'receivedDateTime desc')
  })
  await test('descarta borradores y remitentes ajenos; recorta extracto; ordena del más reciente al más antiguo', async () => {
    const { impl } = fetchFalso([{ status: 200, body: { value: [
      msg('viejo', 'A@c.es', '2026-10-01T10:00:00Z'),
      msg('nuevo', 'a@c.es', '2026-11-20T10:00:00Z'),
      msg('borrador', 'a@c.es', '2026-11-21T10:00:00Z', { isDraft: true }),
      msg('ajeno', 'otro@x.es', '2026-11-22T10:00:00Z'),
    ] } }])
    const r = await leerCorreosRecibidos('tok', ['a@c.es'], { desde: DESDE }, impl)
    assert.deepEqual(r.correos.map((c) => c.id), ['nuevo', 'viejo'])
    assert.equal(r.correos[0].extracto?.length, 300)
    assert.equal(r.correos[1].de, 'a@c.es')
  })
  await test('si Graph rechaza el orden (400) reintenta sin $orderby y ordena localmente', async () => {
    const { impl, llamadas } = fetchFalso([{ status: 400, body: { error: { message: 'InefficientFilter' } } }, { status: 200, body: { value: [msg('1', 'a@c.es', '2026-11-01T10:00:00Z'), msg('2', 'a@c.es', '2026-11-05T10:00:00Z')] } }])
    const r = await leerCorreosRecibidos('tok', ['a@c.es'], { desde: DESDE }, impl)
    assert.equal(llamadas.length, 2); assert.equal(llamadas[1].url.searchParams.get('$orderby'), null)
    assert.deepEqual(r.correos.map((c) => c.id), ['2', '1'])
  })
  await test('error de Graph: ok=false sin correos', async () => {
    const { impl } = fetchFalso([{ status: 403, body: { error: { message: 'Forbidden' } } }])
    const r = await leerCorreosRecibidos('tok', ['a@c.es'], { desde: DESDE }, impl)
    assert.equal(r.ok, false); assert.equal(r.status, 403); assert.equal(r.correos.length, 0)
  })
  await test('eventos: Outlook, «Solo lectura», enlazados a la persona y con Responder solo si hay persona', () => {
    const hoy = new Date('2026-11-25T12:00:00Z')
    const ev = eventosDeRecibidos([
      { id: 'm1', recibido: '2026-11-24T09:00:00Z', de: 'ana@c.es', deNombre: 'Ana X', asunto: 'Factura', extracto: 'Hola' },
      { id: 'm2', recibido: '2026-11-23T09:00:00Z', de: 'empresa@c.es', deNombre: null, asunto: null, extracto: null },
      { id: 'm3', recibido: 'no-fecha', de: 'ana@c.es', deNombre: null, asunto: 'x', extracto: null },
    ], [{ id: 'p1', nombre: 'Ana', email: 'Ana@c.es' }], hoy)
    assert.equal(ev.length, 2)
    assert.equal(ev[0].id, 'outlook-recibido:m1'); assert.equal(ev[0].fuente, 'Outlook'); assert.equal(ev[0].cat, 'mail')
    assert.equal(ev[0].etiqueta, 'Solo lectura'); assert.equal(ev[0].contactoId, 'p1'); assert.equal(ev[0].quien, 'Ana')
    assert.deepEqual(ev[0].acciones, ['responder', 'ia'])
    assert.equal(ev[1].titulo, '(sin asunto)'); assert.equal(ev[1].contactoId, null); assert.deepEqual(ev[1].acciones, [])
  })

  const ruta = readFileSync('app/api/admin/crm/empresas/[id]/correos-recibidos/route.ts', 'utf8')
  await test('ruta: solo GET; no guarda nada en la BD ni envía correo', () => {
    assert.ok(/export async function GET\(/.test(ruta))
    assert.ok(!/export (async )?function (POST|PUT|PATCH|DELETE)/.test(ruta))
    assert.ok(!/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|\$transaction/.test(ruta))
    assert.ok(!/enviarCorreo|sendMail|sendEmail|getDefaultEmailSender/.test(ruta))
    assert.ok(ruta.includes("'Cache-Control': 'no-store'"))
  })
  await test('ruta: permiso de empresas, permiso de contactos, bloqueo en «Actuar como» y buzón del propio usuario', () => {
    assert.ok(ruta.includes('authorizeCrmEmpresas()'))
    assert.ok(ruta.includes("canAccessCrmRelated(auth.user, 'admin.crm.contactos')"))
    assert.ok(ruta.includes('bloqueoActuacion(session)'))
    assert.ok(ruta.includes("getOutlookUserAccessToken(userId, email, 'correo')"))
    assert.ok(ruta.indexOf('bloqueoActuacion') < ruta.indexOf('getOutlookUserAccessToken'))
  })
  const comp = readFileSync('components/admin/FichaCliente.tsx', 'utf8')
  await test('ficha: se piden al pulsar (GET) y se marcan como solo lectura', () => {
    const i = comp.indexOf('/correos-recibidos`')
    assert.ok(i > 0)
    assert.ok(!/method:\s*'POST'/.test(comp.slice(i, i + 160)))
    assert.ok(comp.includes('onClick={cargarRecibidos}'))
    assert.ok(comp.includes('Solo lectura: no se guardan en la ficha.'))
  })
  const registry = readFileSync('lib/area4/section-registry.ts', 'utf8')
  await test('registro del Área 4: ruta en crm.empresas con solo V', () => {
    const i = registry.indexOf('"/api/admin/crm/empresas/[id]/correos-recibidos"')
    assert.ok(i > 0)
    assert.ok(registry.slice(i, i + 200).includes('actions: ["V"]'))
  })

  console.log(`Resultado: ${ok}/${total}`)
  if (ok !== total) process.exit(1)
}
main()
