import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { documentosPanelRequestContext } from '../lib/area4/documentos-boundary'
import { area4RegisteredSurface, area4RegistrySurfaceMatches } from '../lib/area4/section-registry'
import { area4RequestCapabilities } from '../lib/area4/request-policy'

const stage = { DATABASE_URL: 'postgresql://io_staging_finanzas@127.0.0.1:9/io_staging_finanzas', FINANCE_STAGING_SANDBOX: '1', VERCEL_ENV: 'preview' }
const prod = { DATABASE_URL: 'postgresql://postgres@ yamanote.proxy.rlwy.net:34880/railway'.replace('@ ', '@'), VERCEL_ENV: 'production', FINANCE_MODEL_PRODUCTION_ENABLED: '1', FINANCE_EASY_PRODUCTION_ENABLED: '1', FINANCE_AUTOMATIC_LINKS_DISABLED: '1', FINANCE_DOCUMENTOS_PRODUCTION_ENABLED: '1', FINANCE_DOCUMENTOS_PRODUCTION_DRIVE_ID: 'drive-ficticio', FINANCE_DOCUMENTOS_PRODUCTION_FOLDER_ITEM_ID: 'folder-ficticio' }
let passed = 0
function check(name: string, fn: () => void) { fn(); passed++; console.log('OK', name) }
const upload = '/api/admin/finanzas/documentos', item = `${upload}/revision-ficticia`, compare = `${upload}/comparacion`
for (const p of [upload, item, compare]) {
  check(`NEW exacta ${p}`, () => { const match = area4RegisteredSurface(p, 'api')!; assert.equal(match.baseline, false); assert.equal(match.surface.availability?.closedByGate, 'documentosPanel'); assert.equal(match.surface.menu, undefined) })
  check(`V staging ${p}`, () => assert.equal(documentosPanelRequestContext(p, 'GET', stage)?.environment, 'staging'))
  check(`V Production opt-in ${p}`, () => assert.equal(documentosPanelRequestContext(p, 'GET', prod)?.environment, 'production'))
  check(`V readonly ${p}`, () => assert.equal(documentosPanelRequestContext(p, 'GET', { ...prod, IO_PRODUCTION_READ_ONLY: '1' })?.readOnly, true))
  for (const method of ['DELETE', 'PATCH', 'PUT', 'HEAD', 'OPTIONS']) check(`método no declarado ${method} ${p}`, () => assert.equal(documentosPanelRequestContext(p, method, prod), null))
}
for (const p of [upload, item]) {
  check(`POST opt-in ${p}`, () => assert.equal(documentosPanelRequestContext(p, 'POST', prod)?.environment, 'production'))
  for (const flag of ['IO_PRODUCTION_READ_ONLY', 'FINANCE_DEPLOYMENT_READ_ONLY']) check(`readonly POST ${flag}`, () => assert.equal(documentosPanelRequestContext(p, 'POST', { ...prod, [flag]: '1' }), null))
}
check('comparación nunca POST', () => assert.equal(documentosPanelRequestContext(compare, 'POST', prod), null))
for (const gate of [undefined, '0', 'true', 'yes', '2']) check(`flag explícito ${gate}`, () => assert.equal(documentosPanelRequestContext(upload, 'GET', { ...prod, FINANCE_DOCUMENTOS_PRODUCTION_ENABLED: gate }), null))
for (const p of [`${upload}/revision/fuera`, `${upload}/comparacion/extra`, '/api/admin/finanzas/nominas', '/api/admin/crm/isp/importar', '/api/admin/finanzas/facturas', '/api/admin/finanzas/conciliar/confirming-documentos']) check(`vecino cerrado ${p}`, () => assert.equal(documentosPanelRequestContext(p, 'GET', prod), null))
check('database staging no clasifica Production', () => assert.equal(documentosPanelRequestContext(upload, 'GET', { ...prod, DATABASE_URL: stage.DATABASE_URL }), null))
check('no hereda pins Stage', () => assert.equal(documentosPanelRequestContext(upload, 'GET', { ...prod, FINANCE_DOCUMENTOS_PRODUCTION_DRIVE_ID: undefined, SHAREPOINT_DRIVE_ID: 'drive-ficticio' }), null))
check('C sólo para validar y archivar', () => { for (const action of ['VALIDAR', 'ARCHIVAR']) assert.deepEqual(area4RequestCapabilities({ path: item, method: 'POST', action }), ['lectura', 'escritura', 'confirmar']); assert.deepEqual(area4RequestCapabilities({ path: item, method: 'POST', action: 'GUARDAR' }), ['lectura', 'escritura']) })
check('439 descriptores históricos no regenerados', () => assert.equal(area4RegistrySurfaceMatches().filter(m => m.surface.baselineDescriptor).length, 439))
check('proxy mantiene frontera viva posterior a la excepción documental', () => { const source = readFileSync(new URL('../proxy.js', import.meta.url), 'utf8'); assert.ok(source.includes('!documentRoutingAllowed && !easyOnlyRequestAllowed')); assert.ok(source.includes('await area4RegisteredAdminApiBoundary(request)')); assert.ok(source.includes("documentos: ['admin.finanzas.facturas']")); assert.ok(source.includes('request.headers.has(\'next-action\')')) })
console.log(`${passed}/${passed} OK · frontera pura, sin BD, sesión, .env o Graph`)
