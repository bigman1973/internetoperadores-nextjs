/** Área 1 · Puertas de producción: envíos del CRM, correos recibidos y bloque de vínculos. Sin BD/red. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { enviosCrmHabilitados, importacionesCrmCerradas, ENVIOS_PENDIENTES } from '../lib/area1-puertas-produccion'
import { m365Habilitado } from '../lib/area1-m365'
let ok = 0
const t = (n: string, f: () => void) => { f(); ok++; console.log('ok', n) }
const leer = (p: string) => readFileSync(p, 'utf8')
const prod = { VERCEL_ENV: 'production' }
t('envíos: cerrados en producción por defecto; se abren solo con AREA1_ENVIOS_CRM_PRODUCCION=1; fuera de producción abiertos', () => {
  assert.equal(enviosCrmHabilitados(prod), false)
  assert.equal(enviosCrmHabilitados({ ...prod, AREA1_ENVIOS_CRM_PRODUCCION: '0' }), false)
  assert.equal(enviosCrmHabilitados({ ...prod, AREA1_ENVIOS_CRM_PRODUCCION: ' 1 ' }), true)
  assert.equal(enviosCrmHabilitados({ VERCEL_ENV: 'preview' }), true)
  assert.equal(enviosCrmHabilitados({}), true)
})
t('actividades: CORREO y REUNION+syncOutlook → 409 PENDIENTE_ACTIVAR antes de conexión, token, Graph o lib/email', () => {
  const s = leer('app/api/admin/crm/contactos/[id]/actividades/route.ts')
  const post = s.slice(s.indexOf('export async function POST'))
  const puerta = post.indexOf('!enviosCrmHabilitados()')
  assert.ok(puerta > 0 && post.slice(puerta - 80, puerta).includes("type === 'CORREO' || requestedOutlook"))
  for (const x of ['getOutlookConnectionStatus(', 'getOutlookUserAccessToken(', 'createOutlookUserCalendarEvent(', 'enviarCorreoComoUsuario(', 'sendCrmEmail(']) {
    const i = post.indexOf(x); assert.ok(i < 0 || i > puerta, x)
  }
  assert.equal(ENVIOS_PENDIENTES, 'PENDIENTE_ACTIVAR')
  assert.ok(post.includes('codigo: ENVIOS_PENDIENTES') && post.includes('status: 409'))
})
t('estado de conexión expone envios; la UI muestra «Pendiente de activar» y no envía', () => {
  assert.ok(leer('lib/outlook-user-connection.ts').includes('envios: enviosCrmHabilitados()'))
  const c = leer('components/admin/CrmActivityComposer.tsx')
  assert.ok(c.includes('enviosPendientes = outlookConnection.envios === false') && c.includes("disabled={saving || (type === 'CORREO' && enviosPendientes)}") && c.includes("type === 'REUNION' && !enviosPendientes &&"))
  const f = leer('components/admin/FichaCliente.tsx')
  assert.ok(f.includes('disabled={m365.conexion.envios === false ||') && f.includes('disabled={!m365.conexion.enabled || reunionPendiente}'))
  assert.ok(/Pendiente de activar/.test(c) && /Pendiente de activar/.test(f))
})
t('correos recibidos: 404 sin M365 antes de autorizar o pedir token; botón oculto', () => {
  assert.equal(m365Habilitado(prod), false)
  const s = leer('app/api/admin/crm/empresas/[id]/correos-recibidos/route.ts')
  const get = s.slice(s.indexOf('export async function GET'))
  assert.ok(get.indexOf('!m365Habilitado()') > 0 && get.indexOf('!m365Habilitado()') < get.indexOf('authorizeCrmEmpresas()') && get.indexOf('!m365Habilitado()') < get.indexOf('getOutlookUserAccessToken'))
  assert.ok(leer('components/admin/FichaCliente.tsx').includes('m365.conexion.m365 === false ? null'))
})
t('bloque de vínculos: 404 en GET y POST si las importaciones están cerradas', () => {
  assert.equal(importacionesCrmCerradas(prod), true)
  const s = leer('app/api/admin/crm/isp/vinculos/bloque/route.ts')
  for (const m of ['export async function GET', 'export async function POST']) {
    const b = s.slice(s.indexOf(m)); assert.ok(b.indexOf('importacionesCrmCerradas()') > 0 && b.indexOf('importacionesCrmCerradas()') < b.indexOf('autorizarSuperadminIsp()'), m)
  }
})
console.log(`\n${ok}/5 OK`)
