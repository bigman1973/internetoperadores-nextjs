export const dynamic = "force-dynamic";
import { requireAuth } from '../../lib/middleware/auth'
import { redirect } from 'next/navigation'
import AdminSidebar from '../../components/admin/AdminSidebar'
import { SidebarProvider } from '../../components/admin/AdminSidebarContext'
import AdminHeader from '../../components/admin/AdminHeader'
import SessionProvider from '../../components/SessionProvider'
import { RoleProvider } from '../../components/admin/RoleContext'
import ProtectedRoute from '../../components/admin/ProtectedRoute'
import prisma from '../../lib/prisma'
import { canAccessAdminPanel } from '../../lib/admin-panel-access'
import { countReadableAdminPermissionSeeds } from '../../lib/admin-permissions-ssr-contract'
import { readAdminPermissionsSsrWithFallback } from '../../lib/admin-permissions-ssr'
import ImpersonationBanner from '@/components/impersonation/ImpersonationBanner'
import { ActuationProvider } from '@/components/impersonation/ActuationProvider'
import PendingTicketsNotice from '../../components/finanzas/PendingTicketsNotice'
import { isEasyOnlyFinanceUser } from '@/lib/finanzas/easy-access-profile'
import { getFinanceEasyProfileRuntime, getFinanceEasyRuntimeContext } from '@/lib/finanzas/prototype-staging'
import { getConciliarRuntimeContext } from '@/lib/finanzas/conciliar-runtime'
import { hasAccess, permissionSignature } from '@/components/admin/sidebar-access-evaluator'
import {
  filterAuthorizedSidebarNavigation,
  getEasyOnlySidebarNavigation,
  type FinanceEnvironment,
} from '@/components/admin/sidebar-navigation'
import AdminSidebarMenu from '@/components/admin/server/AdminSidebarMenu'
import { AdminSidebarPlaceholder } from '@/components/admin/presentation/AdminSidebarPlaceholder'

type SidebarInitialModel = Readonly<{
  mode: 'easy' | 'privileged' | 'seed'
  navigation: ReturnType<typeof filterAuthorizedSidebarNavigation> | ReturnType<typeof getEasyOnlySidebarNavigation>
  permissionSignature: string
}>

/**
 * Forma un árbol de presentación sólo a partir de datos ya leídos para esta
 * respuesta. La semilla no se cachea ni se reutiliza en una API o request nuevo.
 */
function getSidebarInitialModel({
  userRole,
  userRoles,
  easyOnly,
  financeEnvironment,
  conciliarEnabled,
  initialPermissions,
}: {
  userRole: string
  userRoles: string[]
  easyOnly: boolean
  financeEnvironment: FinanceEnvironment
  /** Server-derived render/navigation seed; never authorization for an API. */
  conciliarEnabled: boolean
  initialPermissions: Awaited<ReturnType<typeof readAdminPermissionsSsrWithFallback>>
}): SidebarInitialModel | null {
  if (easyOnly) {
    return {
      mode: 'easy',
      navigation: getEasyOnlySidebarNavigation(financeEnvironment, conciliarEnabled),
      permissionSignature: '',
    }
  }

  const isSuperAdmin = userRole === 'SUPER_ADMIN'
  const isPrivilegedRealRole = isSuperAdmin || userRole === 'GERENTE'
  // Si falla la lectura no se puede inferir que el actor no tenga ACL granular.
  // Se mantiene un placeholder seguro hasta que RoleContext consulta la ACL viva.
  if (!isPrivilegedRealRole && initialPermissions === null) return null

  const permissions = initialPermissions || []
  const tienePermisosGranulares = permissions.some(permission => permission.lectura || permission.escritura)
  const navigation = filterAuthorizedSidebarNavigation(financeEnvironment, section => hasAccess({
    section,
    effectiveRole: userRole,
    isSuperAdmin,
    isViewingAs: false,
    isViewingAsUser: false,
    viewAsRole: null,
    userRoles,
    viewingUser: null,
    permisosGranulares: permissions,
    tienePermisosGranulares,
  }), conciliarEnabled)

  return {
    mode: isPrivilegedRealRole ? 'privileged' : 'seed',
    navigation,
    permissionSignature: permissionSignature(permissions),
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const start = performance.now()
  const trace = (phase: string) => {
    if (process.env.FINANCE_STAGING_SANDBOX === '1') console.info('conciliar-layout-timing', { phase, elapsedMs: Math.round(performance.now() - start) })
  }
  const session = await requireAuth('admin')
  trace('session')
  const actorId = Number(session.user.id)
  const userRole = session.user.role || 'VENTAS'
  const userRoles = session.user.roles || []
  const isPrivilegedRealRole = userRole === 'SUPER_ADMIN' || userRole === 'GERENTE'
  // Esta foto pertenece sólo a este render y al actor efectivo que requireAuth
  // acaba de comprobar. No es autoridad para APIs ni se conserva entre requests.
  const permissionSeed = !isPrivilegedRealRole
    ? readAdminPermissionsSsrWithFallback(prisma, actorId)
    : Promise.resolve(null)
  // Las lecturas posteriores a la autenticación son independientes y no mutan
  // estado. La foto, si está disponible, reutiliza su propio conteo de lectura;
  // ante un error se conserva exactamente el fallback histórico de count().
  const [profileEnvironment, financeContext, conciliarContext, initialPermissions, canAccessAdmin] = await Promise.all([
    getFinanceEasyProfileRuntime(),
    getFinanceEasyRuntimeContext(),
    getConciliarRuntimeContext(),
    permissionSeed,
    canAccessAdminPanel(session.user, async usuarioId => {
      const permissions = await permissionSeed
      if (permissions !== null && usuarioId === actorId) return countReadableAdminPermissionSeeds(permissions)
      return prisma.permisoUsuario.count({ where: { usuarioId, lectura: true } })
    }),
  ])
  trace('environment-and-access')
  const easyOnly = profileEnvironment !== null && await isEasyOnlyFinanceUser(Number(session.user.id))
  trace('profile')
  if (!canAccessAdmin && !easyOnly) {
    redirect('/empleado')
  }

  const financeEnvironment = financeContext?.runtime ?? null
  const conciliarEnabled = conciliarContext !== null
  const initialSidebar = getSidebarInitialModel({
    userRole,
    userRoles,
    easyOnly,
    financeEnvironment,
    conciliarEnabled,
    initialPermissions,
  })
  const initialMenu = initialSidebar ? (
    <AdminSidebarMenu
      navigation={initialSidebar.navigation}
      user={session.user}
      easyOnly={easyOnly}
      financeEnvironment={financeEnvironment}
      conciliarEnabled={conciliarEnabled}
    />
  ) : <AdminSidebarPlaceholder />

  return (
    <SessionProvider session={session}>
      <ActuationProvider>
        <ImpersonationBanner />
      <RoleProvider
        key={`effective-actor:${session.user.id}`}
        userRole={userRole}
        userRoles={userRoles}
        userId={session.user.id ? parseInt(session.user.id as string) : undefined}
        initialPermissions={initialPermissions ?? undefined}
        initialPermissionsLoaded={initialPermissions !== null}
        skipPermissionLoad={easyOnly}
      >
        <SidebarProvider>
          <div data-admin-shell className="min-h-screen overflow-x-hidden bg-gray-50 text-gray-900">
            <AdminSidebar
              user={session.user}
              easyOnly={easyOnly}
              financeEnvironment={financeEnvironment}
              conciliarEnabled={conciliarEnabled}
              initialMenu={initialMenu}
              initialMenuMode={initialSidebar?.mode ?? 'unavailable'}
              initialPermissionSignature={initialSidebar?.permissionSignature}
            />
            <div className="min-w-0 lg:pl-64">
              <AdminHeader />
              <main className="min-w-0 px-3 py-4 sm:p-6 lg:p-8">
                {easyOnly ? children : <ProtectedRoute>
                  {process.env.FINANCE_STAGING_SANDBOX === '1' && <PendingTicketsNotice />}
                  {children}
                </ProtectedRoute>}
              </main>
            </div>
          </div>
        </SidebarProvider>
      </RoleProvider>
      </ActuationProvider>
    </SessionProvider>
  )
}
