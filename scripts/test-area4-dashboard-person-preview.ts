import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { parseDashboardPerson, selectDashboardPerson } from '../lib/area4/dashboard-person-preview'
import { hasAccess } from '../components/admin/sidebar-access-evaluator'
import { protectedPersonReason, APPROVED_ROLES, approvedCodePermissions, ROLE_ENUM } from '../lib/area4/approved-roles'
import { dashboardRole, loadDashboardModel } from '../lib/area4/dashboard-model'
import * as registry from '../lib/area4/section-registry'
import * as surfaceContract from '../lib/area4/surface-access-contract'
import { latestDashboardMarginSnapshot } from '../lib/area4/dashboard-native-projection'
import type { ApprovedRoleKey } from '../lib/area4/users-contract'

const now = new Date('2026-11-25T12:00:00Z')
function execute(file: string, imports: Record<string, unknown>) {
  const module = { exports: {} as any }
  const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  runInNewContext(js, { module, exports: module.exports, Date, Intl, console, process, require: (name: string) => {
    if (!(name in imports)) throw new Error(`UNEXPECTED_IMPORT:${name}`)
    return imports[name]
  } }, { filename: file })
  return module.exports
}
const roleKeys = APPROVED_ROLES.map(r => r.key).filter(k => k !== 'superadmin')
function serverHarness(revoked?: ApprovedRoleKey, deactivateAfterDirectory = false, denyNativeFinance = false) {
  const calls: string[] = []
  const codes = [...new Set(registry.area4RegistrySurfaceMatches().map(m => m.section.areaCode))]
  const people = roleKeys.map((key, i) => {
    const permissionMap = approvedCodePermissions(key, key === 'contabilidad' ? { clientes: 'V', personal: 'VEC', imputaciones: 'VEC' } : {}, codes)
    const grants = Object.entries(permissionMap).map(([codigo, p]) => ({ codigo, lectura: p.includes('V'), escritura: p.includes('E') }))
    return { id: 910 + i, nombre: `Persona ficticia ${key}`, rol: ROLE_ENUM[key], roles: [], activo: true, perfilAsignado: APPROVED_ROLES.find(r => r.key === key)!.name, permisosArea4Vivos: true, grants, permisos: grants.filter(g => g.lectura).map(g => ({ area: { codigo: g.codigo } })) }
  })
  const owner = { id: 903, nombre: 'Propietario ficticio', rol: 'SUPER_ADMIN', roles: [], activo: true, perfilAsignado: null }
  const db = {
    usuarioAdmin: {
      findMany: async () => { calls.push('directory'); return [...people, owner] },
      findUnique: async ({ where }: any) => {
        const user = where.id === owner.id ? owner : people.find(p => p.id === where.id)
        if (deactivateAfterDirectory && calls.includes('directory') && user?.id !== 903) return { ...user, activo: false }
        return user || null
      },
    },
    tarifa: { count: async () => 8 },
    $queryRaw: async () => [{ total: 123, empresas: 100, particulares: 23 }],
    $transaction: async (fn: any) => fn({}),
  }
  const crm = { kpis: { leadsAbiertos: 3, leadsSinContactar: 1, reunionesSemana: 2, ganadosMes: 1 }, reunionesHoy: [], tareas: [], pipelines: [] }
  const finance = { points: [], yearTotal: 123, monthTotal: 10, invoiceCount: 2, monthCount: 1, confirmed: 1, pendingReal: 3, withoutStatement: 4, revisionCount: 0, cutoff: null }
  const imports: Record<string, any> = {
    '@/lib/prisma': { default: db, __esModule: true },
    'next/navigation': { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } },
    '@/lib/admin-permissions-ssr': { readAdminPermissionsSsrWithFallback: async (_db: any, id: number) => { calls.push(`permissions:${id}`); return people.find(p => p.id === id)?.perfilAsignado === APPROVED_ROLES.find(r => r.key === revoked)?.name ? [] : people.find(p => p.id === id)?.grants || [] } },
    '@/components/admin/sidebar-access-evaluator': { hasAccess },
    '@/lib/api-admin-area-read': { checkAdminAreaRead: async () => null },
    '@/lib/permisos': { verificarPermisoServer: async (id: number, code: string) => { calls.push(`native-finance:${id}:${code}`); return { lectura: !denyNativeFinance } } },
    './policy': { isArea4Owner: (p: any) => p.id === 903 && p.rol === 'SUPER_ADMIN' && p.activo },
    './live-admin': { resolveLiveAdminPrincipal: async (_db: any, id: number) => { const p = await db.usuarioAdmin.findUnique({ where: { id } }); return p?.activo ? p : null }, readLiveArea4Adoption: async () => true },
    './surface-access': { readArea4SurfacePermissionSeedWithFallback: async () => [] },
    './surface-access-contract': surfaceContract,
    './dashboard-model': { dashboardRole, loadDashboardModel },
    './section-registry': registry,
    './approved-roles': { protectedPersonReason },
    './dashboard-person-preview': { parseDashboardPerson, selectDashboardPerson },
    '@/lib/area1-crm-resumen-vista': { resolverVista: (principal: any, selection: any) => { calls.push(`crm-principal:${principal.id}:${selection.alcance}:${selection.verComo}`); return { principal, puede: {} } } },
    '@/lib/area1-crm-resumen': { cargarResumenCrm: async (vista: any) => { calls.push(`crm-reader:${vista.principal.id}`); return crm } },
    '@/lib/finanzas/finance-runtime-safety': { assertFinanceRuntimeReady: async () => {} },
    '@/lib/finanzas/bank-invoicing-db': { readBankInvoicingPopulation: async () => { calls.push('finance-population'); return {} } },
    './dashboard-native-projection': { latestDashboardMarginSnapshot, projectDashboardFinance: () => finance, projectDashboardMargin: (_rows: any, month: string) => ({ month, value: 88.88 }) },
    './dashboard-decisions': { readDashboardDecisions: async () => { calls.push('private-decisions'); return [] } },
    '@/lib/rentabilidad/auth': { requireRentabilidadAdmin: async () => { calls.push('private-margin'); return { userId: 903 } } },
    '@/lib/rentabilidad/store': { listSnapshots: async () => [{ month: '2026-10', version: 11 }] },
    '@/lib/rentabilidad/report': { getRentabilidadReport: async () => ({ period: '2026-10', monthly: [] }) },
    '@/app/admin/rentabilidad/io-model': { monthProducts: () => [] },
  }
  const server = execute('lib/area4/dashboard-server.ts', imports)
  return { ...server, calls, people, session: { user: { id: '903', userType: 'admin', name: owner.nombre, role: 'SUPER_ADMIN' } } }
}

test('selector cerrado: no arrays, signos, rutas, decimales ni IDs ambiguos', () => {
  for (const bad of [['910'], '-1', '0', '1.1', ' 910', '0910', '/admin', '1e3']) assert.throws(() => parseDashboardPerson(bad), /DASHBOARD_PERSON_INVALID/)
  assert.equal(parseDashboardPerson(undefined), null)
  assert.equal(parseDashboardPerson('910'), 910)
})
test('Dirección conserva al propietario, personas activas y su margen de diez meses, sin selector ajeno', async () => {
  const h = serverHarness(), m = await h.readDashboardForSession(h.session, now)
  assert.equal(m.actorId, 903); assert.equal(m.role, 'superadmin'); assert.equal(m.previewingPerson, false)
  assert.ok(h.calls.includes('private-margin')); assert.ok(h.calls.includes('private-decisions'))
  assert.equal(m.columns.flat().find((b: any) => b.id === 'margen')?.points.length, 10)
  assert.ok(m.people.every((p: any) => p.id !== 903 && p.role !== 'superadmin'))
})
for (const key of roleKeys) test(`servidor real: ${key} carga identidad y ACL propias sin fuente privada ni sesión de actuación`, async () => {
  const h = serverHarness(), target = h.people.find(p => p.perfilAsignado === APPROVED_ROLES.find(r => r.key === key)!.name)!
  const sessionBefore = JSON.stringify(h.session)
  const m = await h.readDashboardForSession(h.session, now, String(target.id))
  assert.equal(m.actorId, target.id); assert.equal(m.viewerId, 903); assert.equal(m.previewingPerson, true); assert.equal(m.acting, false)
  assert.equal(m.role, key); assert.equal(m.userName, target.nombre); assert.equal(JSON.stringify(h.session), sessionBefore)
  assert.ok(h.calls.includes(`permissions:${target.id}`)); assert.ok(!h.calls.includes('permissions:903'))
  assert.ok(!h.calls.includes('private-margin')); assert.ok(!h.calls.includes('private-decisions'))
  for (const k of m.kpis) assert.equal(k.href, undefined)
  for (const b of m.columns.flat()) { assert.equal(b.href, undefined); for (const r of b.rows || []) assert.equal(r.href, undefined) }
  if (key === 'comercial') assert.ok(h.calls.includes(`crm-principal:${target.id}:mio:null`))
  if (['gerente', 'contabilidad'].includes(key)) assert.ok(h.calls.includes(`native-finance:${target.id}:admin.facturacion`))
})
test('guardia financiera nativa del target denegada: no se lee la población pese al propietario real', async () => {
  const h = serverHarness(undefined, false, true), target = h.people.find(p => p.rol === 'CONTABILIDAD')!
  const m = await h.readDashboardForSession(h.session, now, String(target.id))
  assert.ok(h.calls.includes(`native-finance:${target.id}:admin.facturacion`))
  assert.ok(!h.calls.includes('finance-population'))
  const financialKpis = m.kpis.filter((k: any) => ['facturado-anio', 'facturado-mes', 'cobro', 'por-confirmar', 'extractos'].includes(k.id))
  assert.ok(financialKpis.length > 0)
  assert.ok(financialKpis.every((k: any) => k.value === 'sin dato'))
})
test('no propietario y actuación: selector ajeno rechazado antes del directorio', async () => {
  for (const mode of ['other', 'acting']) {
    const h = serverHarness(), session = mode === 'acting' ? { ...h.session, impersonation: { actorId: 903 } } : { user: { ...h.session.user, id: String(h.people[0].id) } }
    await assert.rejects(() => h.readDashboardForSession(session, now, '912'), /REDIRECT:\/admin/)
    assert.deepEqual(h.calls, [])
  }
})
test('persona inexistente o desactivada después del directorio no produce datos', async () => {
  for (const [id, deactivate] of [['999', false], ['910', true]] as const) {
    const h = serverHarness(undefined, deactivate)
    await assert.rejects(() => h.readDashboardForSession(h.session, now, id), /REDIRECT:\/admin/)
    assert.deepEqual(h.calls, ['directory'])
  }
})
test('ACL de la persona revocada: no lectores ni contenido heredado del propietario', async () => {
  const h = serverHarness('comercial'), p = h.people.find(p => p.rol === 'VENTAS')!
  const m = await h.readDashboardForSession(h.session, now, String(p.id))
  assert.deepEqual(m.kpis, []); assert.equal(m.columns.flat().length, 0)
  assert.ok(!h.calls.some((c: string) => c.startsWith('crm-reader:')))
})
test('Decisiones: sin bloque de Área 5 (revertida); solo el aviso de Subida y sin importar módulos eliminados', async () => {
  const fuente = readFileSync('lib/area4/dashboard-decisions.ts', 'utf8')
  assert.ok(!/area5/i.test(fuente) && !/gastos-nominas/.test(fuente) && !/@\/lib\/prisma/.test(fuente))
  const h = execute('lib/area4/dashboard-decisions.ts', {})
  const rows = await h.readDashboardDecisions(903, now, () => true)
  assert.equal(rows.length, 1); assert.equal(rows[0].href, '/admin/subida-precios')
  assert.equal(h.dashboardPriceDeadline(new Date('2026-11-30T23:00:00Z')), null)
  assert.equal((await h.readDashboardDecisions(903, now, () => false)).length, 0)
})
test('cliente no modifica RoleContext; el indicador falso de avisos se ha quitado', () => {
  const client = readFileSync('components/admin/DashboardClient.tsx', 'utf8')
  assert.doesNotMatch(client, /setViewAsRole|setViewAsUser|impersonate|\/actuar-como/)
  assert.match(client, /dashboardPersona=/)
  assert.doesNotMatch(readFileSync('components/admin/dashboard/DashboardView.tsx', 'utf8'), /Avisos: sin dato/)
})
