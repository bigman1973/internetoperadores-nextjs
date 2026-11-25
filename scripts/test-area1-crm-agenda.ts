/* Área 1 · Batería: «Mi día» del Resumen con la agenda de Outlook (solo lectura, sin BD ni red). Ejecutar: npx tsx scripts/test-area1-crm-agenda.ts */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { leerAgendaOutlook } from '../lib/area1-m365-graph'
import { cruzarAgenda, grupoTarea, dominioDe, cargarAgendaOutlook } from '../lib/area1-crm-agenda'
import { inicioDiaMadrid } from '../lib/area1-crm-resumen'
let ok = 0
const TOTAL = 10
const t = async (n: string, f: () => void | Promise<void>) => { await f(); ok++; console.log('ok', n) }

async function main() {
  await t('leerAgendaOutlook: un solo GET a /me/calendarView, Prefer UTC, filtra cancelados y pasa a UTC', async () => {
    const llamadas: Array<{ url: string; init: any }> = []
    const fake = async (url: string, init: any) => {
      llamadas.push({ url, init })
      return new Response(JSON.stringify({ value: [
        { id: 'a', subject: 'Revisión', start: { dateTime: '2026-11-25T09:00:00.0000000' }, end: { dateTime: '2026-11-25T10:00:00.0000000' }, onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/x' }, webLink: 'https://outlook.office.com/x', attendees: [{ emailAddress: { address: 'Ana@Cliente-Demo.es' } }], organizer: { emailAddress: { address: 'yo@internetoperadores.com' } } },
        { id: 'b', subject: 'Cancelada', isCancelled: true, start: { dateTime: '2026-11-25T11:00:00' } },
      ] }), { status: 200 })
    }
    const r = await leerAgendaOutlook('tok', new Date('2026-11-24T23:00:00Z'), new Date('2026-11-26T23:00:00Z'), fake as any)
    assert.equal(llamadas.length, 1)
    assert.equal(llamadas[0].init.method, 'GET')
    assert.ok(llamadas[0].url.startsWith('https://graph.microsoft.com/v1.0/me/calendarView?'))
    assert.equal(llamadas[0].init.headers.Prefer, 'outlook.timezone="UTC"')
    assert.equal(llamadas[0].init.body, undefined)
    assert.equal(r.eventos.length, 1)
    assert.equal(r.eventos[0].inicio, '2026-11-25T09:00:00.000Z')
    assert.deepEqual(r.eventos[0].asistentes, ['ana@cliente-demo.es'])
    assert.equal(r.eventos[0].teamsJoinUrl, 'https://teams.microsoft.com/l/x')
  })
  await t('leerAgendaOutlook: error de Graph → ok false sin eventos', async () => {
    const r = await leerAgendaOutlook('tok', new Date(), new Date(), (async () => new Response(JSON.stringify({ error: { message: 'x' } }), { status: 403 })) as any)
    assert.equal(r.ok, false); assert.equal(r.status, 403); assert.equal(r.eventos.length, 0)
  })
  const ev = (id: string, inicio: string, asistentes: string[], extra: any = {}) => ({ id, asunto: 'Reunión ' + id, inicio, fin: null, todoElDia: false, teamsJoinUrl: null, webLink: null, asistentes, organizador: null, ...extra })
  const manana0 = new Date('2026-11-25T23:00:00Z')
  await t('cruzarAgenda: contacto por email exacto antes que empresa por dominio; propio excluido', () => {
    const r = cruzarAgenda([ev('1', '2026-11-25T09:00:00Z', ['ana@cliente-demo.es', 'yo@internetoperadores.com', 'otro@cliente-demo.es'])], 'Yo@internetoperadores.com',
      [{ id: 'c1', email: 'ANA@cliente-demo.es', nombre: 'Contacto Demo', empresa: null }],
      [{ id: 'e1', nombre: 'Empresa Demo', dominio: 'https://www.cliente-demo.es/' }], manana0)
    assert.deepEqual(r[0].fichas.map((f) => f.href), ['/admin/crm/contactos/c1', '/admin/crm/empresas/e1'])
    assert.equal(r[0].dia, 'HOY'); assert.equal(r[0].hora, '10:00')
  })
  await t('cruzarAgenda: dominios genéricos y el propio no enlazan empresa; máximo 4 fichas', () => {
    const r = cruzarAgenda([ev('1', '2026-11-25T09:00:00Z', ['x@gmail.com', 'y@internetoperadores.com'])], 'yo@internetoperadores.com', [],
      [{ id: 'g', nombre: 'Gmail', dominio: 'gmail.com' }, { id: 'p', nombre: 'Nosotros', dominio: 'internetoperadores.com' }], manana0)
    assert.equal(r[0].fichas.length, 0)
    const muchos = Array.from({ length: 6 }, (_, i) => `p${i}@d.es`)
    const r2 = cruzarAgenda([ev('1', '2026-11-25T09:00:00Z', muchos)], 'yo@internetoperadores.com', muchos.map((m, i) => ({ id: 'c' + i, email: m, nombre: 'N' + i, empresa: null })), [], manana0)
    assert.equal(r2[0].fichas.length, 4)
  })
  await t('cruzarAgenda: mañana, todo el día y sin inicio', () => {
    const r = cruzarAgenda([ev('1', '2026-11-26T08:00:00Z', [], { todoElDia: true }), ev('2', null as any, [])], 'yo@x.es', [], [], manana0)
    assert.equal(r.length, 1); assert.equal(r[0].dia, 'MANANA'); assert.equal(r[0].hora, 'Todo el día')
    assert.equal(dominioDe('A@B.ES'), 'b.es')
  })
  await t('grupoTarea: vencida, hoy, semana, fuera de semana y sin fecha', () => {
    const hoy = inicioDiaMadrid(new Date('2026-11-25T10:00:00Z'))
    const fin = new Date('2026-11-30T23:00:00Z')
    assert.equal(grupoTarea(new Date(hoy.getTime() - 1), hoy, fin), 'VENCIDA')
    assert.equal(grupoTarea(new Date(hoy.getTime() + 3600000), hoy, fin), 'HOY')
    assert.equal(grupoTarea(new Date(hoy.getTime() + 2 * 86400000), hoy, fin), 'SEMANA')
    assert.equal(grupoTarea(new Date(fin.getTime() + 1), hoy, fin), null)
    assert.equal(grupoTarea(null, hoy, fin), null)
  })
  await t('cargarAgendaOutlook bloqueada («Ver como» o «Actuar como») no consulta conexión ni Graph', async () => {
    const r = await cargarAgendaOutlook({ userId: 1, email: 'yo@internetoperadores.com', bloqueada: 'bloqueado' })
    assert.deepEqual(r, { estado: 'no_disponible', motivo: 'bloqueado' })
  })
  const agenda = readFileSync('lib/area1-crm-agenda.ts', 'utf8')
  const graph = readFileSync('lib/area1-m365-graph.ts', 'utf8')
  const page = readFileSync('app/admin/crm/page.tsx', 'utf8')
  await t('fuente: la agenda solo lee (sin POST, PATCH, DELETE, sendMail ni escrituras en BD)', () => {
    assert.ok(!/method:\s*'(POST|PATCH|PUT|DELETE)'|sendMail|\.(create|update|upsert|delete)(Many)?\(/.test(agenda))
    const fn = graph.slice(graph.indexOf('export async function leerAgendaOutlook'))
    const cuerpo = fn.slice(0, fn.indexOf('\n}\n'))
    assert.ok(cuerpo.includes("method: 'GET'") && !/POST|PATCH|DELETE|body:/.test(cuerpo))
  })
  await t('página: Outlook bloqueado en «Ver como» y en actuación; botón Conectar solo con escritura', () => {
    assert.ok(page.includes('vista.verComoActivo ?') && page.includes('bloqueoActuacion(session)'))
    assert.ok(page.includes("'/api/admin/integraciones/outlook/connect?returnTo=/admin/crm'") && page.includes('Conectar mi Outlook'))
    assert.ok(/puedeConectar = !!permisoCrm\?\.escritura && !vista\.verComoActivo && !bloqueoActuacion\(session\)/.test(page))
  })
  await t('página: sin datos de ejemplo; tareas en Vencidas / Hoy / Esta semana', () => {
    assert.ok(!/ejemplo|demo|lorem/i.test(page.slice(page.indexOf('<h2>Mi día</h2>'), page.indexOf('Clientes a cuidar'))))
    assert.ok(page.includes("['VENCIDA', 'Vencidas'], ['HOY', 'Hoy'], ['SEMANA', 'Esta semana']"))
    const res = readFileSync('lib/area1-crm-resumen.ts', 'utf8')
    assert.ok(res.includes("estado: 'PENDIENTE', venceAt: { lt: domingoFin } }"))
  })
  console.log(`\n${ok}/${TOTAL} ok`)
  assert.equal(ok, TOTAL)
}
main().catch((e) => { console.error(e); process.exit(1) })
