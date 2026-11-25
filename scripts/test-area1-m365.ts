/* Batería Área 1 · Microsoft 365 (sin red, sin BD, sin datos personales). */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { aislarAsistentes, bloqueoActuacion, bloqueoCanalCorreo, canalCorreoInicial, aislarCorreo, avisoAislamiento, M365_SCOPES_TODOS, m365CorreoPrueba, m365Modo, scopesParaRenovar, tienePermiso } from '../lib/area1-m365'
import { enviarCorreoComoUsuario, leerEventoOutlook, leerHiloCorreo } from '../lib/area1-m365-graph'
import { construirPromptBorrador, generarBorrador, interpretarRespuesta, limpiarPeticion, type ContextoBorrador } from '../lib/area1-m365-borrador'

let ok = 0, ko = 0
function t(nombre: string, cond: boolean) { if (cond) { ok++; console.log(`  ✔ ${nombre}`) } else { ko++; console.log(`  ✘ ${nombre}`) } }
const PROD = { VERCEL_ENV: 'production' }
const STG = { VERCEL_ENV: 'preview' }
const PRUEBA = 'pruebas@internetoperadores.com'
const D = { to: ['a@cliente.test', 'b@cliente.test'], cc: ['c@cliente.test'], bcc: ['d@cliente.test'], subject: 'Asunto' }

async function main() {
  console.log('1. Modo por entorno (no depende de la clave)')
  t('producción → real', m365Modo(PROD) === 'real')
  t('producción + M365_STAGING_SANDBOX=1 → aislado', m365Modo({ ...PROD, M365_STAGING_SANDBOX: '1' }) === 'aislado')
  t('preview/staging → aislado', m365Modo(STG) === 'aislado')
  t('development → aislado', m365Modo({ VERCEL_ENV: 'development' }) === 'aislado')
  t('sin VERCEL_ENV (local) → aislado', m365Modo({}) === 'aislado')
  t('producción sin aviso en la ficha', avisoAislamiento(PROD) === null)

  console.log('2. Correo aislado')
  const real = aislarCorreo(D, PROD)
  t('producción: destinatarios intactos', real.accion === 'real' && real.to.length === 2 && real.cc.length === 1 && real.bcc.length === 1 && real.subject === 'Asunto')
  const sinPrueba = aislarCorreo(D, STG)
  t('staging sin dirección de prueba: no se envía, sin destinatarios', sinPrueba.accion === 'no_enviado' && !sinPrueba.to.length && !sinPrueba.cc.length && !sinPrueba.bcc.length)
  const desv = aislarCorreo(D, { ...STG, M365_STAGING_TEST_EMAIL: PRUEBA })
  t('staging con prueba: solo la dirección de prueba', desv.accion === 'desviado' && desv.to.length === 1 && desv.to[0] === PRUEBA && !desv.cc.length && !desv.bcc.length)
  t('staging con prueba: asunto marcado y recuento sin direcciones', desv.subject.startsWith('[STAGING · 4 destinatarios desviados]') && desv.destinatariosOriginales === 4)
  t('dirección de prueba externa rechazada → no se envía', m365CorreoPrueba({ M365_STAGING_TEST_EMAIL: 'x@gmail.com' }) === null && aislarCorreo(D, { ...STG, M365_STAGING_TEST_EMAIL: 'x@gmail.com' }).accion === 'no_enviado')

  console.log('3. Invitaciones de reunión aisladas')
  const asis = [{ email: 'a@cliente.test' }, { email: 'b@cliente.test' }]
  t('producción: invitados intactos', aislarAsistentes(asis, PROD).asistentes.length === 2)
  const ra = aislarAsistentes(asis, STG)
  t('staging sin prueba: sin invitados (solo tu agenda)', ra.accion === 'no_enviado' && ra.asistentes.length === 0)
  const rb = aislarAsistentes(asis, { ...STG, M365_STAGING_TEST_EMAIL: PRUEBA })
  t('staging con prueba: solo la dirección de prueba', rb.accion === 'desviado' && rb.asistentes.length === 1 && rb.asistentes[0].email === PRUEBA)

  console.log('4. Permisos delegados e incrementales')
  t('se piden Calendars.ReadWrite, Mail.Send, Mail.ReadWrite y offline_access', ['Calendars.ReadWrite', 'Mail.Send', 'Mail.ReadWrite', 'offline_access'].every((s) => (M365_SCOPES_TODOS as readonly string[]).includes(s)))
  t('ningún permiso de aplicación (.default / *.All)', !(M365_SCOPES_TODOS as readonly string[]).some((s) => /\.default|\.All$/i.test(s)))
  const antigua = 'openid profile offline_access User.Read Calendars.ReadWrite'
  t('conexión antigua: calendario sí, correo no', tienePermiso(antigua, 'calendario') && !tienePermiso(antigua, 'correo'))
  t('conexión antigua se renueva sin pedir correo', !/Mail\./.test(scopesParaRenovar(antigua)) && /Calendars\.ReadWrite/.test(scopesParaRenovar(antigua)))
  const nueva = 'https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/User.Read'
  t('conexión nueva (scopes con URL): correo sí', tienePermiso(nueva, 'correo') && /Mail\.Send/.test(scopesParaRenovar(nueva)))

  console.log('5. Graph: solo /me (delegado)')
  const llamadas: string[] = []
  const fakeOk = (async (url: string, init?: RequestInit) => {
    llamadas.push(`${init?.method || 'GET'} ${url}`)
    if (url.endsWith('/me/messages')) return new Response(JSON.stringify({ id: 'm1', conversationId: 'c1', internetMessageId: '<x>' }), { status: 201 })
    if (url.endsWith('/send')) return new Response(null, { status: 202 })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const env = await enviarCorreoComoUsuario({ accessToken: 't', subject: 's', html: 'h', to: [PRUEBA] }, fakeOk)
  t('envío: borrador + send, devuelve conversationId', env.success && env.conversationId === 'c1' && llamadas.length === 2 && llamadas[1].includes('/me/messages/m1/send'))
  t('nunca /users/{id} ni sendMail de aplicación', llamadas.every((l) => l.includes('/v1.0/me/')))
  const fake500 = (async (url: string) => url.endsWith('/me/messages') ? new Response(JSON.stringify({ id: 'm1' }), { status: 201 }) : new Response('{}', { status: 503 })) as typeof fetch
  const inc = await enviarCorreoComoUsuario({ accessToken: 't', subject: 's', html: 'h', to: [PRUEBA] }, fake500)
  t('fallo 5xx al enviar → incierto (no se reintenta solo)', !inc.success && inc.uncertain === true)
  t('sin destinatarios → no llama a Graph', !(await enviarCorreoComoUsuario({ accessToken: 't', subject: 's', html: 'h', to: [] }, (async () => { throw new Error('no') }) as typeof fetch)).success)
  const ev404 = await leerEventoOutlook('t', 'e1', (async () => new Response('{}', { status: 404 })) as typeof fetch)
  t('evento borrado en Outlook → cancelado', ev404.ok && ev404.evento?.existe === false && ev404.evento.cancelado === true)
  const evOk = await leerEventoOutlook('t', 'e1', (async () => new Response(JSON.stringify({ subject: 'R', start: { dateTime: '2026-12-01T09:00:00.0000000' }, end: { dateTime: '2026-12-01T10:00:00.0000000' }, attendees: [{ emailAddress: { address: 'A@x.test' }, status: { response: 'accepted' } }] }), { status: 200 })) as typeof fetch)
  t('evento: fecha UTC y respuestas', evOk.evento?.inicio === '2026-12-01T09:00:00.000Z' && evOk.evento.respuestas[0].respuesta === 'accepted')
  const hilo = await leerHiloCorreo('t', "c'1", 'yo@internetoperadores.com', (async (u: string) => { llamadas.push(u); return new Response(JSON.stringify({ value: [{ id: '1', from: { emailAddress: { address: 'yo@internetoperadores.com' } }, receivedDateTime: '2026-01-01' }, { id: '2', from: { emailAddress: { address: 'cli@x.test' } }, receivedDateTime: '2026-01-02' }, { id: '3', isDraft: true }] }), { status: 200 }) }) as typeof fetch)
  t('hilo: separa propios, ignora borradores, escapa comillas', hilo.mensajes.length === 2 && hilo.mensajes.filter((m) => !m.esPropio).length === 1 && decodeURIComponent(llamadas[llamadas.length - 1]).includes("c''1"))

  console.log('6. Borrador con IA: propone, nunca envía')
  const ctx: ContextoBorrador = { contacto: { nombre: 'Cliente Prueba', cargo: null, empresa: 'Empresa Prueba', segmento: 'EMPRESA', ciudad: null }, negocios: [{ nombre: 'Fibra', etapa: 'Propuesta enviada', importe: 1200, resultado: 'ABIERTO' }], actividades: [{ tipo: 'NOTA', fecha: '2026-11-01', titulo: null, resumen: 'Interesado en ampliar' }], contratos: [{ descripcion: 'Fibra 600', proveedor: 'X', velocidad: '600', importe: 45, permanenciaHasta: null }], facturacion2026: { meses: 10, total: 450 }, subidaPrecios: null, autor: 'Comercial' }
  const pr = construirPromptBorrador(ctx, { objetivo: 'proponer reunión', tono: 'cercano' })
  t('prompt con contexto de la ficha', pr.user.includes('Fibra 600') && pr.user.includes('Facturación 2026') && pr.user.includes('Interesado en ampliar'))
  t('prompt prohíbe inventar y no lleva márgenes', /NO lo inventes/.test(pr.system) && !/margen|rentabilidad/i.test(pr.user))
  t('respuesta JSON válida → borrador', interpretarRespuesta('{"asunto":"Hola","cuerpo":"Texto","avisos":["[fecha]"]}')?.avisos.length === 1)
  t('respuesta no válida → null', interpretarRespuesta('no json') === null && interpretarRespuesta('{"asunto":""}') === null)
  t('objetivo vacío rechazado', limpiarPeticion('', 'formal') === null && limpiarPeticion('ok sí', 'x')?.tono === 'cercano')
  let fetchLlamado = false
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = (async () => { fetchLlamado = true; return new Response('{}') }) as typeof fetch
  const b = await generarBorrador(ctx, { objetivo: 'x y z', tono: 'breve' }, { chat: { completions: { create: async () => ({ choices: [{ message: { content: '{"asunto":"A","cuerpo":"B","avisos":[]}' } }] }) } } })
  globalThis.fetch = fetchOriginal
  t('generarBorrador devuelve texto y no hace ninguna llamada de envío', b?.asunto === 'A' && !fetchLlamado)

  console.log('7. Comprobaciones estáticas de las rutas')
  const borradorRoute = readFileSync('app/api/admin/crm/contactos/[id]/m365/borrador/route.ts', 'utf8')
  t('ruta del borrador: solo GET, sin escritura ni envío', /export async function GET/.test(borradorRoute) && !/export async function (POST|PATCH|PUT|DELETE)/.test(borradorRoute) && !/sendCrmEmail|enviarCorreo|prisma\.\w+\.(create|update|upsert|delete)/.test(borradorRoute))
  const act = readFileSync('app/api/admin/crm/contactos/[id]/actividades/route.ts', 'utf8')
  t('actividades: el correo corporativo usa destinatarios aislados', /to: emailIsolation!\.to,\s*cc: emailIsolation!\.cc,\s*bcc: emailIsolation!\.bcc/.test(act))
  t('actividades: Outlook usa destinatarios aislados', /enviarCorreoComoUsuario\(\{[^}]*to: emailIsolation!\.to, cc: emailIsolation!\.cc, bcc: emailIsolation!\.bcc/.test(act))
  t('actividades: invitados pasan por aislarAsistentes', /aislarAsistentes\(requestedAttendees\)/.test(act) && /attendees,\s*\n\s*onlineMeeting/.test(act))
  t('actividades: «no_enviado» sale antes de cualquier envío', act.indexOf("accion === 'no_enviado'") > 0 && act.indexOf("accion === 'no_enviado'") < act.indexOf('await sendCrmEmail'))
  const libs = ['lib/area1-m365.ts', 'lib/area1-m365-graph.ts', 'lib/area1-m365-borrador.ts', 'lib/outlook-user-connection.ts'].map((f) => readFileSync(f, 'utf8')).join('\n')
  t('sin client_credentials en M365 del Área 1', !/client_credentials/.test(libs))
  const diffEmail = execSync('git diff origin/staging -- lib/email.ts middleware.js', { encoding: 'utf8' })
  t('lib/email.ts y middleware.js sin tocar', diffEmail.trim() === '')

  // Canal por defecto: Mi Outlook (decisión de Víctor 25/11)
  t('canal por defecto: Mi Outlook si la integración está activa (aunque no esté conectado)', canalCorreoInicial({ enabled: true, connected: false }) === 'outlook' && canalCorreoInicial({ enabled: true, connected: true, mail: true }) === 'outlook')
  t('canal por defecto: corporativo si la integración no está activa', canalCorreoInicial({ enabled: false, connected: false }) === 'corporativo')
  t('Mi Outlook sin conectar bloquea el envío (no cae al corporativo en silencio)', /Conecta tu Outlook/.test(bloqueoCanalCorreo(true, { enabled: true, connected: false }) || '') && /permiso de correo/.test(bloqueoCanalCorreo(true, { enabled: true, connected: true, mail: false }) || ''))
  t('corporativo elegido o Outlook listo: sin bloqueo', bloqueoCanalCorreo(false, { enabled: true, connected: false }) === null && bloqueoCanalCorreo(true, { enabled: true, connected: true, mail: true }) === null)
  const comp = readFileSync('components/admin/CrmActivityComposer.tsx', 'utf8')
  t('compositor: estado inicial y validación usan el canal por defecto', /useState\(\(\) => canalCorreoInicial\(outlookConnection\) === 'outlook'\)/.test(comp) && /bloqueoCanalCorreo\(viaOutlook, outlookConnection\)/.test(comp))
  // Único camino de envío con buzón delegado o corporativo del CRM: la ruta de actividades, y siempre aislado.
  const usos = execSync("git -c color.ui=never grep -l --no-color -E 'enviarCorreoComoUsuario\\(|createOutlookUserCalendarEvent\\(|sendCrmEmail\\(' -- app lib components", { encoding: 'utf8' }).trim().split('\n').sort()
  t('solo actividades/route.ts envía correo o crea eventos (además de sus definiciones)', JSON.stringify(usos) === JSON.stringify(['app/api/admin/crm/contactos/[id]/actividades/route.ts', 'lib/area1-m365-graph.ts', 'lib/email.ts', 'lib/outlook-calendar.ts']))
  const m365r = readFileSync('app/api/admin/crm/contactos/[id]/actividades/[actividadId]/m365/route.ts', 'utf8')
  t('ruta m365: solo lecturas Graph (sin enviar ni crear eventos)', !/enviarCorreoComoUsuario\(|createOutlookUserCalendarEvent\(|sendCrmEmail\(/.test(m365r))
  t('modo real solo con VERCEL_ENV=production; preview/staging/vacío aislados', m365Modo({ VERCEL_ENV: 'production' }) === 'real' && m365Modo({ VERCEL_ENV: 'preview' }) === 'aislado' && m365Modo({ VERCEL_ENV: 'staging' }) === 'aislado' && m365Modo({}) === 'aislado')
  // Actuar como: nada de Outlook, correo ni IA en nombre de otra persona
  t('bloqueoActuacion: bloquea con impersonation y deja pasar sin ella', !!bloqueoActuacion({ impersonation: { actorId: 1 } }) && bloqueoActuacion({}) === null && bloqueoActuacion(null) === null)
  for (const [f, re] of [
    ['app/api/admin/crm/contactos/[id]/actividades/[actividadId]/m365/route.ts', /bloqueoActuacion\(session\)/],
    ['app/api/admin/crm/contactos/[id]/m365/borrador/route.ts', /bloqueoActuacion\(session\)/],
    ['app/api/admin/crm/contactos/[id]/actividades/route.ts', /\(type === 'CORREO' \|\| requestedOutlook\) \? bloqueoActuacion\(session\)/],
  ] as const) { const src = readFileSync(f, 'utf8'); t(`actuar como bloqueado antes de Graph/IA: ${f.split('/').slice(-3).join('/')}`, re.test(src) && src.search(re) < Math.max(src.indexOf('getOutlookUserAccessToken('), src.indexOf('generarBorrador('), 0) + (src.includes('getOutlookUserAccessToken(') || src.includes('generarBorrador(') ? 0 : 1e9)) }
  console.log(`\nResultado: ${ok}/${ok + ko}`)
  if (ko) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
