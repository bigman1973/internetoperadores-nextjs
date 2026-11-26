/** Área 1 · Puertas CRM, correos recibidos y bloque de vínculos. Sin BD/red. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fichaNuevaHabilitada, importacionesCrmCerradas, vinculosBloqueProduccionHabilitado } from '../lib/area1-puertas-produccion'
import { area4VinculosBloqueProductionEnabled } from '../lib/area4/crm-vinculos-production'
import { m365Habilitado } from '../lib/area1-m365'
import { m365LegacyEnabled, M365_LEGACY_PENDING_MESSAGE, M365_LEGACY_PENDING_CODE } from '../lib/m365-legacy-policy'
let ok = 0
const t = (n: string, f: () => void) => { f(); ok++; console.log('ok', n) }
const leer = (p: string) => readFileSync(p, 'utf8')
const prod = { VERCEL_ENV: 'production' }
t('CRM cerrado en todos los entornos; sólo el literal 1 reabre la puerta única', () => {
  for (const VERCEL_ENV of ['production', 'preview', 'development', undefined]) {
    for (const value of [undefined, '', '0', 'true', 'false', 'yes', '2', '1 ', ' 1', ' 1 ']) {
      assert.equal(m365LegacyEnabled('crm', { VERCEL_ENV, M365_LEGACY_CRM_EXTERNAL_ENABLED: value }), false)
    }
    assert.equal(m365LegacyEnabled('crm', { VERCEL_ENV, M365_LEGACY_CRM_EXTERNAL_ENABLED: '1' }), true)
  }
  assert.equal(fichaNuevaHabilitada(prod), false)
  assert.equal(importacionesCrmCerradas(prod), true)
})
t('actividades: correo y petición Outlook cierran antes de conexión/token/reserva; preceden Opción C', () => {
  const s = leer('app/api/admin/crm/contactos/[id]/actividades/route.ts')
  const post = s.slice(s.indexOf('export async function POST'))
  const puerta = post.indexOf("!m365LegacyEnabled('crm')")
  assert.ok(puerta > 0 && post.slice(puerta - 80, puerta).includes("type === 'CORREO' || requestedOutlook"))
  for (const x of ['getOutlookConnectionStatus(', 'getOutlookUserAccessToken(', 'createOutlookUserCalendarEvent(', 'enviarCorreoComoUsuario(', 'sendCrmEmail(', 'prisma.$transaction(', 'prisma.crmActividad.findUnique(']) {
    const i = post.indexOf(x); assert.ok(i < 0 || i > puerta, x)
  }
  assert.equal(M365_LEGACY_PENDING_CODE, 'M365_LEGACY_PENDING')
  assert.equal(M365_LEGACY_PENDING_MESSAGE, 'Envio pendiente de activar (se hara desde Mi Outlook)')
  assert.ok(post.includes('m365LegacyPendingBody()') && post.includes('status: 503'))
})
t('estado de conexión expone puerta CRM directa; UI informativa sin deshabilitar reintentos', () => {
  assert.ok(leer('lib/outlook-user-connection.ts').includes("envios: m365LegacyEnabled('crm')"))
  const c = leer('components/admin/CrmActivityComposer.tsx')
  assert.ok(c.includes('outlookConnection.envios === false') && c.includes('M365_LEGACY_PENDING_MESSAGE'))
  assert.ok(c.includes('type="submit" disabled={saving}') && c.includes('setPendingMessage(M365_LEGACY_PENDING_MESSAGE)'))
  const f = leer('components/admin/FichaCliente.tsx')
  assert.ok(f.includes('M365_LEGACY_PENDING_MESSAGE') && f.includes('role="status" aria-live="polite"'))
  assert.ok(f.includes('disabled={!puedeEscribir || ocupado != null} onClick={enviar}'))
  assert.ok(f.includes('disabled={!m365.conexion.enabled} onChange={(e) => setEnOutlook'))
  assert.ok(!f.includes('Pendiente de activar:'))
})
t('correos recibidos: 404 sin M365 antes de autorizar o pedir token; botón oculto', () => {
  assert.equal(m365Habilitado(prod), false)
  const s = leer('app/api/admin/crm/empresas/[id]/correos-recibidos/route.ts')
  const get = s.slice(s.indexOf('export async function GET'))
  assert.ok(get.indexOf('!m365Habilitado()') > 0 && get.indexOf('!m365Habilitado()') < get.indexOf('authorizeCrmEmpresas()') && get.indexOf('!m365Habilitado()') < get.indexOf('getOutlookUserAccessToken'))
  assert.ok(leer('components/admin/FichaCliente.tsx').includes('m365.conexion.m365 === false ? null'))
})
t('bloque de vínculos: Production cerrado por defecto; excepción literal propia antes de auth, Stage conserva imports', () => {
  assert.equal(importacionesCrmCerradas(prod), true)
  assert.equal(vinculosBloqueProduccionHabilitado(prod), false)
  assert.equal(area4VinculosBloqueProductionEnabled(prod), false)
  const synthetic = { ...prod, DATABASE_URL: 'postgresql://postgres:synthetic@yamanote.proxy.rlwy.net:34880/railway',
    FINANCE_STAGING_SANDBOX: '0', FINANCE_DEPLOYMENT_READ_ONLY: '0', IO_PRODUCTION_READ_ONLY: '0' }
  for (const value of [undefined, '', '0', 'true', 'false', 'yes', '2', '01', '1 ', ' 1', ' 1 ']) {
    const env = { ...synthetic, AREA1_VINCULOS_BLOQUE_PRODUCCION: value }
    assert.equal(vinculosBloqueProduccionHabilitado(env), false)
    assert.equal(area4VinculosBloqueProductionEnabled(env), false)
  }
  const open = { ...synthetic, AREA1_VINCULOS_BLOQUE_PRODUCCION: '1' }
  assert.equal(vinculosBloqueProduccionHabilitado(open), true)
  assert.equal(area4VinculosBloqueProductionEnabled(open), true)
  assert.equal(importacionesCrmCerradas(open), true)
  assert.equal(area4VinculosBloqueProductionEnabled({ ...synthetic, AREA1_IMPORTACIONES_PRODUCCION: '1' }), false)
  for (const readonly of [{ FINANCE_DEPLOYMENT_READ_ONLY: '1' }, { IO_PRODUCTION_READ_ONLY: '1' }]) {
    assert.equal(area4VinculosBloqueProductionEnabled({ ...open, ...readonly }), false)
  }
  const s = leer('app/api/admin/crm/isp/vinculos/bloque/route.ts')
  const guard = s.slice(s.indexOf('function puertaBloque'), s.indexOf('export async function GET'))
  assert.ok(guard.includes("if (process.env.VERCEL_ENV !== 'production')"))
  assert.ok(guard.includes("return importacionesCrmCerradas() ? NextResponse.json({ error: 'No disponible.' }, { status: 404, headers: SIN_CACHE }) : null"))
  assert.ok(guard.includes("if (!area4VinculosBloqueProductionEnabled() || area4VinculosBloqueProductionSurface(request) !== 'api')"))
  assert.ok(guard.includes("return NextResponse.json({ error: 'No disponible.' }, { status: 404, headers: SIN_CACHE })"))
  assert.ok(guard.includes('if (!area4VinculosBloqueProductionOriginAllowed(request))'))
  for (const m of ['export async function GET', 'export async function POST']) {
    const b = s.slice(s.indexOf(m))
    assert.ok(b.indexOf('const puerta = puertaBloque(request)') > 0 && b.indexOf('if (puerta) return puerta') < b.indexOf('autorizarSuperadminIsp()'), m)
  }
})
console.log(`\n${ok}/5 OK`)
