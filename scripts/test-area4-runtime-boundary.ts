import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import * as registry from '../lib/area4/section-registry'
import * as policy from '../lib/area4/policy'
import * as requestPolicy from '../lib/area4/request-policy'
import { AREA4_TEMPLATES } from '../lib/area4/templates'

process.env.AREA4_OWNER_USER_ID = '3'
let principal: any = null
let token: any = null
let grants: any[] = []
let adopted = true
let dbError: any = null
let auditFailure = false
const audit: any[] = []
const database = {
  usuarioAdmin: { findUnique: async ({ select }: any) => {
    if (dbError && select.permisosArea4Vivos) throw dbError
    if (!principal) return null
    return { ...principal, permisosArea4Vivos: adopted, permisos: grants.map(p => ({ ...p, area: { codigo: p.codigo } })) }
  } },
  $transaction: async (fn: any) => fn({ auditoriaPermisosArea4: { create: async ({ data }: any) => {
    if (auditFailure) throw new Error('AUDIT_FAILURE')
    audit.push(data)
    return data
  } } }),
}
const source = readFileSync('middleware.js', 'utf8') + '\nmodule.exports.area4Boundary = area4RegisteredAdminApiBoundary;'
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const mod: any = { exports: {} }
vm.runInNewContext(code, {
  module: mod, exports: mod.exports, process: { env: process.env }, console: { error() {} }, Headers, URL, performance, TextDecoder,
  require(name: string) {
    if (name === 'next/server') return { NextResponse }
    if (name === './lib/admin-render-surface') return {}
    if (name === './lib/finanzas/conciliar-runtime') return {}
    if (name === './lib/high-risk-api-policy') return {}
    if (name === './lib/altas/contrato-access') return {}
    if (name === 'next-auth/jwt') return { getToken: async () => token }
    if (name === '@/lib/area4/section-registry') return registry
    if (name === '@/lib/area4/policy') return policy
    if (name === '@/lib/area4/request-policy') return requestPolicy
    if (name === '@/lib/prisma') return { default: database }
    if (name === '@/lib/impersonation') return { readImpersonationClaims: () => null }
    if (name === '@/lib/area4/audit') return { appendArea4Audit: async (tx: any, input: any) => tx.auditoriaPermisosArea4.create({ data: input }) }
    throw new Error(`Unexpected module ${name}`)
  },
})
let checks = 0
async function status(path: string, method = 'GET', body?: unknown) {
  const response = await mod.exports.area4Boundary(new NextRequest(`https://area4.example.test${path}`, {
    method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  }))
  checks++
  return response?.status ?? 200 // 200 here means dispatch, NOT successful page rendering.
}
function set(role = 'VISOR', id = 100) {
  principal = { id, activo: true, rol: role, roles: [] }
  token = { id: String(id), userType: 'admin', role: 'SUPER_ADMIN' } // deliberately stale/misleading JWT
  adopted = true; grants = []; dbError = null; auditFailure = false
}
async function run() {
  const pages = registry.AREA4_SECTION_REGISTRY.flatMap(s => s.surfaces.filter(p => p.kind === 'page' && p.path.startsWith('/admin')).map(p => ({ ...p, area: s.areaCode })))
  for (const template of AREA4_TEMPLATES) {
    set(template.id === 'area4-gerente-operativo' ? 'GERENTE' : 'VISOR')
    grants = template.permisos.map(({ areaCodigo, ...p }) => ({ codigo: areaCodigo, ...p }))
    for (const page of pages) {
      const path = page.path.replace(/\[[^\]]+\]/g, 'area4-synthetic-resource')
      const expected = page.path === '/admin'
        ? (principal.rol === 'GERENTE' || grants.some(p => p.codigo.startsWith('admin.') && p.lectura))
        : policy.evaluateArea4Capability({ principal, grants, codigoArea: page.area, capability: 'lectura', ownerId: 3 })
      assert.equal(await status(path), expected ? 200 : 403, `${template.id} ${page.path}`)
    }
  }
  set('SUPER_ADMIN', 3)
  for (const page of pages) assert.equal(await status(page.path.replace(/\[[^\]]+\]/g, 'area4-synthetic-resource')), 200)
  set('SUPER_ADMIN', 4)
  assert.equal(await status('/admin/clientes'), 403, 'secondary superadmin is not owner')
  set(); principal.activo = false
  assert.equal(await status('/api/admin/clientes'), 401)
  set(); token = null
  assert.equal(await status('/api/admin/clientes'), 401)
  set(); assert.equal(await status('/api/admin/permisos?action=usuario&usuarioId=100'), 200)
  assert.equal(await status('/api/admin/permisos?action=usuario&usuarioId=101'), 403)
  assert.equal(await status('/api/admin/permisos?action=verificar&codigo=admin.crm'), 200)
  assert.equal(await status('/api/admin/actuar-como'), 200, 'control plane delegates to its existing ledger guard')
  assert.equal(await status('/api/admin/actuar-como', 'POST', { action: 'salir' }), 200)
  assert.equal(await status('/admin/clientes'), 403, 'adopted zero grants do not fall back')
  grants = [{ codigo: 'admin.finanzas', lectura: true, escritura: true, confirmar: false, exportar: false }]
  assert.equal(await status('/api/admin/finanzas/conciliar', 'POST', { action: 'confirmar' }), 403)
  assert.equal(await status('/api/admin/finanzas/exportar-a3?action=download'), 403)
  grants[0].confirmar = true
  assert.equal(await status('/api/admin/finanzas/conciliar', 'POST', { action: 'confirmar' }), 200)
  assert.equal(audit.at(-1).operacion, 'CONFIRMACION_SOLICITADA')
  assert.equal(audit.at(-1).despues.resultado, 'INTENTO')
  auditFailure = true
  assert.equal(await status('/api/admin/finanzas/conciliar', 'POST', { action: 'confirmar' }), 503)
  auditFailure = false; grants[0].exportar = true
  assert.equal(await status('/api/admin/finanzas/exportar-a3?action=download'), 200)
  dbError = { code: 'P2022', meta: { column: 'usuarios_admin.permisos_area4_vivos' } }
  assert.equal(await status('/admin/clientes'), 200, 'exact pre-migration compatibility')
  dbError = { code: 'P2022', meta: { column: 'other_missing_column' } }
  assert.equal(await status('/admin/clientes'), 503, 'other schema errors never authorize')
  dbError = { code: 'P1001' }
  assert.equal(await status('/admin/clientes'), 503)
  assert.equal(policy.grantAllowsArea4Capability([
    { codigo: 'admin.clientes', lectura: true, escritura: true },
    { codigo: 'admin.clientes.ggcc.draxton', lectura: false, escritura: false },
  ], 'admin.clientes.ggcc.draxton.personal', 'lectura'), false)
  console.log(JSON.stringify({ ok: true, checks, registeredAdminPages: pages.length, templateProfiles: AREA4_TEMPLATES.length + 1,
    evidence: 'REAL_MIDDLEWARE_WITH_SYNTHETIC_DB_AND_SESSION', renderedPages: false, httpAcceptance: false,
    confirmationAudit: 'PRE_DISPATCH_ATTEMPT_ONLY', databaseWrites: false }))
}
run().catch(e => { console.error(e); process.exitCode = 1 })
