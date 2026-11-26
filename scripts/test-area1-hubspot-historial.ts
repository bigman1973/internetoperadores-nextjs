/**
 * Área 1 · Batería del historial de HubSpot (sintética, sin red ni BD).
 * Ejecutar: pnpm exec tsx scripts/test-area1-hubspot-historial.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { consentimientoDesdePropiedades, leerEngagements, planificarHistorial, textoPlano, type EngagementHubspot } from '../lib/area1-hubspot-historial'

let ok = 0
const t = async (n: string, f: () => void | Promise<void>) => { await f(); ok++; console.log(`ok - ${n}`) }
const root = join(__dirname, '..')

const ctx = () => ({
  contactos: new Map([['c-io', { id: 'L1', esIO: true }], ['c-io2', { id: 'L2', esIO: true }], ['c-lf', { id: 'L3', esIO: false }]]),
  negociosExcluidos: new Set(['d-lfdeal']),
  yaImportados: new Set(['n-ya']),
  propietarios: new Map([['7', 'Comercial A']]),
  ahora: new Date('2026-11-24T00:00:00Z'),
})
const e = (id: string, objeto: EngagementHubspot['objeto'], properties: Record<string, string>, contactos: string[], negocios: string[] = []): EngagementHubspot => ({ id, objeto, properties, contactos, negocios })

async function main() {
  await t('nota de IO: fecha, autor y origen HubSpot; título desde el texto', () => {
    const { filas, resumen } = planificarHistorial([e('n1', 'notes', { hs_note_body: '<p>Llamar el lunes</p><p>detalle</p>', hs_timestamp: '2025-03-01T10:00:00Z', hubspot_owner_id: '7' }, ['c-io'])], ctx())
    assert.equal(filas.length, 1); const f = filas[0]
    assert.equal(f.tipo, 'NOTA'); assert.equal(f.contactoId, 'L1'); assert.equal(f.titulo, 'Llamar el lunes')
    assert.equal(f.fechaActividad, '2025-03-01T10:00:00.000Z'); assert.equal(f.creadoPorNombre, 'Comercial A')
    assert.equal((f.metadatos as any).origen, 'HubSpot'); assert.equal(resumen.notes.nuevos, 1)
  })
  await t('sin duplicar: lo ya importado no se vuelve a planificar', () => {
    const { filas, resumen } = planificarHistorial([e('n-ya', 'notes', { hs_note_body: 'x' }, ['c-io'])], ctx())
    assert.equal(filas.length, 0); assert.equal(resumen.notes.yaImportados, 1); assert.equal(resumen.notes.importables, 1)
  })
  await t('LFDeal «Operaciones de Traspaso» se excluye aunque el contacto sea de IO', () => {
    const { filas, resumen } = planificarHistorial([e('m1', 'meetings', { hs_meeting_title: 'Visita' }, ['c-io'], ['d-otro', 'd-lfdeal'])], ctx())
    assert.equal(filas.length, 0); assert.equal(resumen.meetings.excluidosLFDeal, 1)
  })
  await t('solo fichas de IO: sin ficha local o solo LFDeal/otras unidades → fuera', () => {
    const { filas, resumen } = planificarHistorial([e('a', 'notes', {}, ['desconocido']), e('b', 'notes', {}, ['c-lf']), e('c', 'notes', {}, [])], ctx())
    assert.equal(filas.length, 0); assert.equal(resumen.notes.sinFichaLocal, 2); assert.equal(resumen.notes.noIO, 1)
  })
  await t('varios contactos: principal el primero de IO y el resto como relacionados (sin no-IO)', () => {
    const { filas } = planificarHistorial([e('n2', 'notes', { hs_note_body: 'x' }, ['c-lf', 'c-io', 'c-io2'])], ctx())
    assert.equal(filas[0].contactoId, 'L1'); assert.deepEqual(filas[0].contactosExtra, ['L2'])
  })
  await t('correo: asunto, cuerpo en texto y dirección', () => {
    const { filas } = planificarHistorial([e('em', 'emails', { hs_email_subject: 'Oferta', hs_email_html: '<b>Hola</b>', hs_email_direction: 'INCOMING_EMAIL', hs_timestamp: '1700000000000' }, ['c-io'])], ctx())
    assert.equal(filas[0].tipo, 'CORREO'); assert.equal(filas[0].descripcion, 'Hola'); assert.equal(filas[0].direccion, 'ENTRANTE')
    assert.equal(filas[0].fechaActividad, new Date(1700000000000).toISOString())
  })
  await t('tarea: crea actividad TAREA y tarea con estado, prioridad, vencimiento y responsable', () => {
    const { filas } = planificarHistorial([e('tk', 'tasks', { hs_task_subject: 'Enviar contrato', hs_task_status: 'COMPLETED', hs_task_priority: 'HIGH', hs_timestamp: '2025-05-05T00:00:00Z', hs_task_completion_date: '2025-05-06T00:00:00Z', hubspot_owner_id: '7' }, ['c-io'])], ctx())
    const tr = filas[0].tarea!
    assert.equal(filas[0].tipo, 'TAREA'); assert.equal(tr.estado, 'COMPLETADA'); assert.equal(tr.prioridad, 'ALTA')
    assert.equal(tr.venceAt, '2025-05-05T00:00:00.000Z'); assert.equal(tr.completadoAt, '2025-05-06T00:00:00.000Z'); assert.equal(tr.asignadoANombre, 'Comercial A')
    const pend = planificarHistorial([e('tk2', 'tasks', { hs_task_status: 'NOT_STARTED' }, ['c-io'])], ctx()).filas[0].tarea!
    assert.equal(pend.estado, 'PENDIENTE'); assert.equal(pend.prioridad, 'MEDIA'); assert.equal(pend.completadoAt, null)
  })
  await t('consentimiento: baja global manda; base legal; bajas por tipo; rebote', () => {
    const et = new Map([['hs_email_optout_117907962', 'Marketing Information']])
    assert.equal(consentimientoDesdePropiedades('x', { hs_email_optout: 'true', hs_legal_basis: 'Freely given consent from contact' }).estado, 'BAJA')
    assert.equal(consentimientoDesdePropiedades('x', { hs_legal_basis: 'Not applicable;Freely given consent from contact' }).estado, 'CONSENTIMIENTO')
    assert.equal(consentimientoDesdePropiedades('x', { hs_legal_basis: 'Legitimate interest – prospect/lead' }).estado, 'INTERES_LEGITIMO')
    assert.equal(consentimientoDesdePropiedades('x', { hs_legal_basis: 'Not applicable' }).estado, 'SIN_BASE_LEGAL')
    const c = consentimientoDesdePropiedades('x', { hs_email_optout_117907962: 'true', hs_email_optout_117908024: 'false', hs_email_hard_bounce_reason_enum: 'MAILBOX', hs_marketable_status: 'false' }, et)
    assert.deepEqual(c.bajasTipos, ['Marketing Information']); assert.equal(c.rebote, true); assert.equal(c.marketing, false)
  })
  await t('lectura de HubSpot: solo GET, pagina y sigue asociaciones paginadas', async () => {
    const vistos: string[] = []
    const req = async <T,>(path: string): Promise<T> => {
      vistos.push(path)
      if (path.includes('/associations/contacts')) return { results: [{ id: 'c3' }] } as T
      if (path.includes('after=P2')) return { results: [{ id: '2', properties: {}, associations: {} }] } as T
      return { results: [{ id: '1', properties: { hs_note_body: 'x' }, associations: { contacts: { results: [{ id: 'c1' }], paging: { next: { after: 'A' } } }, deals: { results: [{ id: 'd1' }] } } }], paging: { next: { after: 'P2' } } } as T
    }
    const r = await leerEngagements('notes', req)
    assert.equal(r.length, 2); assert.deepEqual(r[0].contactos, ['c1', 'c3']); assert.deepEqual(r[0].negocios, ['d1'])
    assert.ok(vistos.every((p) => p.startsWith('/crm/v3/objects/notes')))
  })
  await t('estática: el módulo no hace peticiones de escritura a HubSpot y escribe con ON CONFLICT', () => {
    const src = readFileSync(join(root, 'lib/area1-hubspot-historial.ts'), 'utf8')
    assert.ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(src))
    assert.ok(src.includes('ON CONFLICT (hubspot_id) DO NOTHING')); assert.ok(src.includes('ON CONFLICT (contacto_id, canal, fuente)'))
    assert.equal(textoPlano('<p>a&amp;b</p>'), 'a&b')
  })
  await t('ruta: simular es GET (pasa el sandbox de staging) e importar solo POST con confirmar', () => {
    const r = readFileSync(join(root, 'app/api/admin/crm/hubspot/historial/route.ts'), 'utf8')
    assert.match(r, /export async function GET\(\)\s*\{\s*(if \(importacionesCrmCerradas\(\)\) return NextResponse\.json\(\{ error: 'No disponible\.' \}, \{ status: 404 \}\)\s*)?return ejecutar\('simular'\)/)
    assert.match(r, /export async function POST[\s\S]*confirmar !== true[\s\S]*propietarioImportacion\(\)[\s\S]*ejecutar\('importar', owner\.actorId\)/)
    assert.ok(!r.split('export async function POST')[0].includes("ejecutar('importar')"))
    const lib = readFileSync(join(root, 'lib/area1-hubspot-historial.ts'), 'utf8')
    const i = lib.indexOf("if (modo === 'simular') return resultado"); const w = lib.search(/crmSincronizacionHubspot\.create|INSERT INTO/)
    assert.ok(i > 0 && i < w, 'simular vuelve antes de cualquier escritura')
    const mw = readFileSync(join(root, 'middleware.js'), 'utf8')
    assert.ok(mw.includes("['GET', 'HEAD', 'OPTIONS'].includes(request.method)"), 'el sandbox de staging deja pasar GET')
    assert.ok(!mw.includes('/api/admin/crm/hubspot/historial'), 'importar no tiene excepción en el sandbox')
  })
  console.log(`\n${ok} pruebas OK`)
}
main().catch((err) => { console.error(err); process.exit(1) })
