import assert from 'node:assert/strict'
import { guardarCaptacionWebEn, origenCaptacion, vincularLeadExistenteEn, type EntradaCaptacionWeb } from '../lib/crm-captacion-web-core'

/** In-memory transaction double; no Prisma client, credentials or real database. */
export function crearDbFicticia() {
  let sequence = 0
  let tail: Promise<unknown> = Promise.resolve()
  const state: Record<string, any[]> = { crmRegistroHubspot: [], crmCaptacionWeb: [], leadMigracionWeb: [], leadSolucion: [], leadPartner: [], altaServicio: [] }
  const db: any = {}
  for (const name of Object.keys(state)) {
    db[name] = {
      create: async ({ data }: any) => {
        const row = { id: `fixture-${++sequence}`, createdAt: new Date('2026-11-02T15:00:00Z'), token: `synthetic-${sequence}`, ...data }
        state[name].push(row)
        return { ...row }
      },
      update: async ({ where, data }: any) => {
        const row = state[name].find(x => x.id === where.id)
        assert.ok(row)
        Object.assign(row, data)
        return { ...row }
      },
      findUnique: async ({ where }: any) => {
        const key = Object.keys(where)[0]
        return state[name].find(row => row[key] === where[key]) || null
      },
      findFirst: async ({ where }: any) => state[name].find(row => row.huella === where.huella && row.fechaEnvio >= where.fechaEnvio.gte) || null,
    }
  }
  db.tarifa = { findUnique: async () => ({ id: 1, precioConIva: 50, cuotaAlta: null, nombre: 'Tarifa sintética', nombreComercial: 'Tarifa sintética', permanencia: null }) }
  db.$executeRawUnsafe = async (sql: string) => { assert.match(sql, /^SELECT pg_advisory_xact_lock/); return 1 }
  db.$transaction = (fn: any) => {
    const work = tail.then(async () => {
      const before = structuredClone(state)
      try { return await fn(db) }
      catch (error) { for (const name of Object.keys(state)) state[name] = before[name]; throw error }
    })
    tail = work.catch(() => {})
    return work
  }
  return { db, state }
}

const request = (key?: string, referer = 'https://staging.internetoperadores.com/contacto?email=secret#token') => new Request('https://staging.internetoperadores.com/api/contacto', {
  method: 'POST', headers: { referer, ...(key ? { 'idempotency-key': key } : {}) },
})
const base: EntradaCaptacionWeb = {
  formulario: '/api/contacto', segmentoCrm: 'EMPRESA', nombre: 'Persona Sintética', email: 'persona@example.test',
  telefono: '000000000', empresa: 'Empresa Sintética', datos: { mensaje: 'Prueba ficticia' }, newsletter: false, privacidad: null,
}

async function main() {
  const { db, state } = crearDbFicticia()
  const instant = new Date('2026-11-02T15:59:59Z')
  const first = await guardarCaptacionWebEn(db, request(), base, instant)
  assert.equal(first.repetido, false)
  assert.equal(state.crmRegistroHubspot.length, 1)
  assert.equal(state.crmRegistroHubspot[0].hubspotId, null)
  assert.equal(state.crmRegistroHubspot[0].clienteWebId, undefined)
  const event = state.crmCaptacionWeb[0]
  assert.equal(event.webOrigen, 'https://staging.internetoperadores.com')
  assert.equal(event.paginaOrigen, '/contacto')
  assert.equal(event.consentimientoPrivacidad, null)
  assert.equal(event.consentimientoNewsletter, false)
  assert.equal(event.consentimientoVersion, null)
  assert.deepEqual(event.fechaEnvio, instant)
  const replay = await guardarCaptacionWebEn(db, request(), base, new Date('2026-11-02T16:00:01Z'))
  assert.equal(replay.contactoId, first.contactoId)
  assert.equal(replay.repetido, true)
  assert.equal(state.crmCaptacionWeb.length, 1)
  const concurrent = await Promise.all(Array.from({ length: 5 }, () => guardarCaptacionWebEn(db, request(), base, instant)))
  assert.ok(concurrent.every(x => x.contactoId === first.contactoId))
  // Another form is NOT automatically merged even when the email matches.
  await guardarCaptacionWebEn(db, request(), { ...base, formulario: '/api/demo' }, instant)
  assert.equal(state.crmRegistroHubspot.length, 2)
  // Explicit request key has immutable payload; a changed request is rejected.
  const keyed = await guardarCaptacionWebEn(db, request('unique-attempt'), { ...base, newsletter: true, privacidad: true }, instant)
  const keyedReplay = await guardarCaptacionWebEn(db, request('unique-attempt'), { ...base, newsletter: true, privacidad: true }, new Date('2026-11-03T00:00:00Z'))
  assert.equal(keyed.contactoId, keyedReplay.contactoId)
  assert.equal(state.crmCaptacionWeb.at(-1).consentimientoNewsletter, true)
  assert.ok(state.crmCaptacionWeb.at(-1).consentimientoVersion)
  await assert.rejects(guardarCaptacionWebEn(db, request('unique-attempt'), base, instant), /DATOS_DISTINTOS/)
  const count = state.crmRegistroHubspot.length
  await assert.rejects(guardarCaptacionWebEn(db, request(), { ...base, formulario: '/api/partners', persistir: async () => { throw new Error('detalle-fallido') } }, instant), /detalle-fallido/)
  assert.equal(state.crmRegistroHubspot.length, count, 'A detail failure rolls back the canonical contact')
  assert.equal(origenCaptacion(request(undefined, 'https://evil.example/contacto')).paginaOrigen, null)
  assert.equal(origenCaptacion(request(undefined, 'https://user:secret@staging.internetoperadores.com/contacto')).paginaOrigen, null)

  const privateCount = state.crmRegistroHubspot.length
  for (const cuentaFicticia of ['cuenta-sintetica-a', 'cuenta-sintetica-b']) {
    await guardarCaptacionWebEn(db, request(), {
      ...base, formulario: '/api/altas/crear', datos: { servicio: 'Resumen comercial' },
      datosIdempotencia: { cuenta: cuentaFicticia },
    }, instant)
    assert.deepEqual(state.crmCaptacionWeb.at(-1).datos, { servicio: 'Resumen comercial' })
  }
  assert.equal(state.crmRegistroHubspot.length, privateCount + 2, 'Different private requests are not technical replays')

  const modelByRoute = [
    ['/api/partners', 'PARTNER', 'leadPartner'], ['/api/contrata/migracion-web', 'EMPRESA', 'leadMigracionWeb'],
    ['/api/contrata/mantenimiento-it', 'EMPRESA', 'leadSolucion'], ['/api/altas/crear', 'PARTICULAR', 'altaServicio'],
  ] as const
  for (const [formulario, segmentoCrm, model] of modelByRoute) {
    const saved = await guardarCaptacionWebEn(db, request(`attempt-${model}`), {
      ...base, formulario, segmentoCrm, persistir: async (tx, contactoId) => (tx as any)[model].create({ data: { notas: 'Nota previa', cuestionarioId: 'cuestionario-previo', crmContactoId: contactoId } }),
    }, instant)
    assert.equal(saved.registro.crmContactoId, saved.contactoId)
    const repeated = await guardarCaptacionWebEn(db, request(`attempt-${model}`), {
      ...base, formulario, segmentoCrm, persistir: async () => { throw new Error('must-not-create-twice') },
    }, instant)
    assert.equal(repeated.registro.id, saved.registro.id)
  }
  for (const [tipo, model] of [['MIGRACION', 'leadMigracionWeb'], ['SOLUCION', 'leadSolucion'], ['PARTNER', 'leadPartner']] as const) {
    const old = await db[model].create({ data: { nombre: 'Legado sintético', contacto: 'Legado sintético', email: 'legado@example.test', notas: 'No perder', cuestionarioId: 'previo', presupuestoUrl: 'local-pdf', estado: 'CONTACTADO', segmentoCrm: tipo === 'PARTNER' ? 'PARTNER' : 'EMPRESA' } })
    const linked = await vincularLeadExistenteEn(db, tipo, old.id)
    assert.ok(linked.contactoId)
    const unchanged = await db[model].findUnique({ where: { id: old.id } })
    for (const key of ['id', 'notas', 'cuestionarioId', 'presupuestoUrl', 'estado', 'createdAt']) assert.deepEqual(unchanged[key], old[key])
    assert.equal((await vincularLeadExistenteEn(db, tipo, old.id)).contactoId, linked.contactoId)
  }
  console.log('OK area1: captura atómica, identidad local, origen saneado, consentimiento, reintentos/concurrencia, sin fusiones, enlaces manuales y detalle legado conservado')
}

if (process.argv[1]?.endsWith('test-area1-captacion-web.ts')) main().catch(error => { console.error(error); process.exitCode = 1 })
