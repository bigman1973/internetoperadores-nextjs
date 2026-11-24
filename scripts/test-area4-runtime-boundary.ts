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
  module: mod, exports: mod.exports, process: { env: process.env }, console: { error() {} }, Headers, URL, performance, TextDecoder, JSON,
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
async function status(path: string, method = 'GET', body?: unknown, contentType = 'application/json', raw = false) {
  const request = new NextRequest(`https://area4.example.test${path}`, {
    method, ...(body === undefined ? {} : { body: raw ? String(body) : JSON.stringify(body), headers: { 'Content-Type': contentType } }),
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const response = await Promise.race([
    mod.exports.area4Boundary(request),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('BOUNDARY_TIMEOUT_UNCONSUMED_CLONE')), 1500) }),
  ]).finally(() => { if (timer) clearTimeout(timer) })
  // Release the untouched original branch only AFTER the boundary returns.
  // Thus this cannot hide a blocking await of clone.cancel() in the boundary.
  await request.body?.cancel()
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
  const manual = { action: 'confirmar_traspasos_propios_manual', idempotencyKey: '00000000-0000-4000-8000-000000000001',
    items: [{ id: 'area4-synthetic-pair', decisionHash: 'a'.repeat(64) }] }
  assert.equal(await status('/api/admin/finanzas/conciliar', 'POST', manual), 403, 'manual pairs require C')
  assert.equal(await status('/api/admin/finanzas/imputacion', 'POST', { action: 'guardar-lineas' }), 403)
  assert.equal(await status('/api/admin/finanzas/imputacion', 'POST', { action: 'guardar-lineas' }, 'text/plain'), 415, 'Content-Type cannot bypass C')
  assert.equal(await status('/api/admin/finanzas/imputacion', 'POST', { action: 'guardar-lineas' }, 'multipart/form-data'), 415, 'JSON command is not a multipart upload')
  assert.equal(await status('/api/admin/finanzas/imputacion', 'POST', { action: 'editar', accion: 'guardar-lineas' }), 400, 'conflicting selectors cannot bypass C')
  assert.equal(await status('/api/admin/finanzas/imputacion', 'POST', '{broken', 'application/json', true), 400)
  const preview = { action: 'confirmar', review: { kind: 'REVIEW_PREVIEW', id: 'area4-synthetic-review', decisionHash: 'b'.repeat(64) } }
  grants[0].escritura = false
  const auditBeforePreview = audit.length
  assert.equal(await status('/api/admin/finanzas/conciliar', 'POST', preview), 200, 'closed READ ONLY preview requires only V')
  assert.equal(audit.length, auditBeforePreview, 'preview does not emit confirmation intent')
  grants[0].escritura = true
  assert.equal(await status('/api/admin/finanzas/conciliar', 'POST', { ...preview, preview: true }), 403, 'extra keys cannot forge preview')
  assert.equal(await status('/api/admin/finanzas/conciliar', 'POST', { action: 'confirmar', preview: true }), 403, 'boolean preview cannot downgrade command')
  grants[0].lectura = false
  assert.equal(await status('/api/admin/finanzas/conciliar', 'POST', preview), 403, 'preview still requires V')
  grants[0].lectura = true; grants[0].escritura = true
  assert.equal(await status('/api/admin/finanzas/conciliar', 'POST', { action: 'confirmar', padding: 'x'.repeat(17 * 1024) }), 400, 'oversize clone denies promptly without Content-Length')
  assert.equal(await status('/api/admin/finanzas/facturas-emitidas', 'POST', { facturas: Array.from({ length: 200 }, (_, i) => ({ id: `area4-test-${i}`, concepto: 'x'.repeat(180) })) }), 200, 'ordinary batch retains handler limit, not global 16KiB')
  assert.equal(await status('/api/admin/finanzas/tickets/upload', 'POST', 'synthetic-upload', 'multipart/form-data', true), 200, 'non-command uploads preserve handler guard')
  assert.equal(await status('/api/admin/finanzas/exportar-a3?action=download'), 403)
  grants[0].confirmar = true
  assert.equal(await status('/api/admin/finanzas/conciliar', 'POST', { action: 'confirmar' }), 200)
  assert.equal(await status('/api/admin/finanzas/conciliar', 'POST', manual), 200)
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
