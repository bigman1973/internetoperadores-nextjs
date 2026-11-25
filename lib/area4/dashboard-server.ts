import prisma from '@/lib/prisma'
import type { Session } from 'next-auth'
import { redirect } from 'next/navigation'
import { readAdminPermissionsSsrWithFallback } from '@/lib/admin-permissions-ssr'
import { hasAccess } from '@/components/admin/sidebar-access-evaluator'
import { checkAdminAreaRead } from '@/lib/api-admin-area-read'
import { isArea4Owner } from './policy'
import { resolveLiveAdminPrincipal, readLiveArea4Adoption } from './live-admin'
import { readArea4SurfacePermissionSeedWithFallback } from './surface-access'
import { area4SurfaceSeedAllows } from './surface-access-contract'
import { loadDashboardModel, type DashboardFinance, type DashboardReaders } from './dashboard-model'
import type { DashboardPoint } from './dashboard-contract'
/** One authenticated SSR response. No persistent caches, HTTP/Graph, sync or writes. */
export async function readDashboardForSession(session: Session, now = new Date()) {
  const userId = Number(session.user.id)
  const principal = await resolveLiveAdminPrincipal(prisma, userId)
  if (!principal) redirect('/login')
  const acting = Boolean(session.impersonation)
  const owner = !acting && isArea4Owner(principal)
  const [permissions, adopted, surfaces, profile] = await Promise.all([
    readAdminPermissionsSsrWithFallback(prisma, userId), readLiveArea4Adoption(prisma, userId),
    owner ? Promise.resolve([]) : readArea4SurfacePermissionSeedWithFallback(prisma, userId),
    prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { perfilAsignado: true } }),
  ])
  const canRead = (sectionKey: string, sourcePath: string) => (owner || permissions !== null) && hasAccess({ section: sectionKey, effectiveRole: principal.rol, isSuperAdmin: principal.rol === 'SUPER_ADMIN', isArea4Owner: owner, isViewingAs: false, isViewingAsUser: acting, viewAsRole: null, userRoles: [...(principal.roles || [])], viewingUser: acting ? { id: principal.id, nombre: session.user.name || '', email: '', rol: principal.rol, roles: [...(principal.roles || [])] } : null, permisosGranulares: permissions || [], tienePermisosGranulares: adopted || (permissions?.length || 0) > 0, permissionsAdopted: adopted, surfacePermissions: surfaces }) && (owner || area4SurfaceSeedAllows(surfaces, sourcePath))
  const year = Number(now.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'Europe/Madrid' }))
  const monthNumber = Number(now.toLocaleDateString('en-GB', { month: '2-digit', timeZone: 'Europe/Madrid' }))
  const readers: DashboardReaders = {
    finance: async (): Promise<DashboardFinance> => {
      // Native source guard is retained in addition to registry V.
      if (await checkAdminAreaRead('admin.facturacion', [], session)) throw new Error('DASHBOARD_SOURCE_DENIED')
      const { assertFinanceRuntimeReady } = await import('@/lib/finanzas/finance-runtime-safety')
      const { readBankInvoicingPopulation } = await import('@/lib/finanzas/bank-invoicing-db')
      const { projectDashboardFinance } = await import('./dashboard-native-projection')
      const result = await prisma.$transaction(async tx => {
        await assertFinanceRuntimeReady(tx)
        return readBankInvoicingPopulation(tx, { enabled: true, assertIsolatedStaging: async () => {} })
      }, { isolationLevel: 'RepeatableRead', timeout: 60000, maxWait: 10000 })
      const today = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Madrid' }).format(now)
      return projectDashboardFinance(result, year, monthNumber, today, canRead('conciliacion', '/admin/finanzas/conciliar'))
    },
    clients: async () => {
      const rows = await prisma.$queryRaw<Array<{ total: number; empresas: number; particulares: number }>>`
        SELECT COUNT(DISTINCT c.id)::int AS total,
          COUNT(DISTINCT c.id) FILTER (WHERE c.persona_fisica = false)::int AS empresas,
          COUNT(DISTINCT c.id) FILTER (WHERE c.persona_fisica = true)::int AS particulares
        FROM clientes_web c INNER JOIN contratos_servicio cs ON cs.cliente_id = c.cliente_id_isp
        WHERE c.activo = true AND cs.activo = true LIMIT 1`
      if (rows.length !== 1) throw new Error('DASHBOARD_CLIENTS_UNKNOWN')
      return rows[0]
    },
    contracts: async () => {
      const [rows, tarifas] = await Promise.all([
        prisma.$queryRaw<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM contratos_servicio WHERE activo = true LIMIT 1`,
        canRead('tarifas', '/admin/tarifas') ? prisma.tarifa.count({ where: { activa: true } }) : Promise.resolve(null),
      ])
      if (rows.length !== 1) throw new Error('DASHBOARD_CONTRACTS_UNKNOWN')
      return { total: rows[0].total, tarifas }
    },
    crm: async () => {
      const { resolverVista } = await import('@/lib/area1-crm-resumen-vista')
      const { cargarResumenCrm } = await import('@/lib/area1-crm-resumen')
      const vista = resolverVista({ id: principal.id, nombre: session.user.name || '', rol: principal.rol, roles: [...(principal.roles || [])] }, { alcance: 'mio', verComo: null })
      // Summary extras belong to different sources and are not needed here.
      vista.puede = { ...vista.puede, avisosMargen: false, importesMargen: false, consentimiento: false, limpieza: false, importarIsp: false, vinculosIsp: false, pipelinesPorComercial: false, verComo: false }
      return cargarResumenCrm(vista, now)
    },
    rentabilidad: async (): Promise<DashboardPoint[]> => {
      if (!owner || acting) throw new Error('DASHBOARD_OWNER_REQUIRED')
      const { requireRentabilidadAdmin } = await import('@/lib/rentabilidad/auth')
      const auth = await requireRentabilidadAdmin()
      if ('error' in auth || auth.userId !== principal.id) throw new Error('DASHBOARD_SOURCE_DENIED')
      const { listSnapshots } = await import('@/lib/rentabilidad/store')
      const { getRentabilidadReport } = await import('@/lib/rentabilidad/report')
      const { monthProducts } = await import('@/app/admin/rentabilidad/io-model')
      const { projectDashboardMargin } = await import('./dashboard-native-projection')
      const snapshots = await listSnapshots()
      const latest = snapshots.filter(s => typeof s.month === 'string' && s.month.startsWith(`${year}-`) && s.month <= `${year}-${String(monthNumber).padStart(2,'0')}`).sort((a,b) => String(b.month).localeCompare(String(a.month)) || Number(b.version) - Number(a.version))[0]
      if (!latest) throw new Error('DASHBOARD_NO_PREPARED_REPORT')
      const report = await getRentabilidadReport(latest.month, 'real')
      // Reuse exactly the current Rentabilidad UI aggregator; no hand-coded percentages.
      return Array.from({ length: monthNumber }, (_,i) => {
        const m = `${year}-${String(i+1).padStart(2,'0')}`
        const products = monthProducts(report, m)
        return projectDashboardMargin(products, m, report.period)
      })
    },
  }
  return loadDashboardModel({ principal, name: session.user.name || 'Usuario', profile: profile?.perfilAsignado, owner, acting, now, canRead }, readers)
}
