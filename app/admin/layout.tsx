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
import { hasAccess, permissionSignature, type AdminSidebarPreviewUser } from '@/components/admin/sidebar-access-evaluator'
import {
  filterAuthorizedSidebarNavigation,
  getEasyOnlySidebarNavigation,
  type FinanceEnvironment,
} from '@/components/admin/sidebar-navigation'
import AdminSidebarMenu from '@/components/admin/server/AdminSidebarMenu'
import { AdminSidebarPlaceholder } from '@/components/admin/presentation/AdminSidebarPlaceholder'
import { isArea4Owner } from '@/lib/area4/policy'
import { resolveLiveAdminPrincipal, readLiveArea4Adoption } from '@/lib/area4/live-admin'
import { readArea4MenuConfiguration, resolveArea4MenuPresentation, type Area4MenuPresentation } from '@/lib/area4/menu-presentation'
import { readArea4SurfacePermissionSeedWithFallback } from '@/lib/area4/surface-access'
import { area4SurfacePermissionSignature, area4SurfaceSeedAllows, type Area4SurfacePermissionSeed } from '@/lib/area4/surface-access-contract'
import { rentabilidadReadonlyMenuDisponible } from '@/lib/produccion-disponibilidad'

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
  rentabilidadReadonlyEnabled,
  initialPermissions,
  isArea4Owner: isOwner,
  isViewingAsUser,
  viewingUser,
  menuPresentation,
  permissionsAdopted,
  surfacePermissions,
}: {
  userRole: string
  userRoles: string[]
  easyOnly: boolean
  financeEnvironment: FinanceEnvironment
  /** Server-derived render/navigation seed; never authorization for an API. */
  conciliarEnabled: boolean
  rentabilidadReadonlyEnabled: boolean
  initialPermissions: Awaited<ReturnType<typeof readAdminPermissionsSsrWithFallback>>
  isArea4Owner: boolean
  isViewingAsUser: boolean
  viewingUser: AdminSidebarPreviewUser | null
  menuPresentation: Area4MenuPresentation
  permissionsAdopted: boolean
  surfacePermissions: readonly Area4SurfacePermissionSeed[]
}): SidebarInitialModel | null {
  if (easyOnly) {
    return {
      mode: 'easy',
      navigation: getEasyOnlySidebarNavigation(financeEnvironment, conciliarEnabled),
      permissionSignature: '',
    }
  }

  const isSuperAdmin = userRole === 'SUPER_ADMIN'
  const isPrivilegedRealRole = isOwner || userRole === 'GERENTE'
  // Si falla la lectura no se puede inferir que el usuario efectivo no tenga
  // ACL granular: también Gerente puede tener revocaciones explícitas.
  // Se mantiene un placeholder seguro hasta que RoleContext consulta la ACL viva.
  if (!isOwner && initialPermissions === null) return null

  const permissions = initialPermissions || []
  const tienePermisosGranulares = permissionsAdopted || permissions.length > 0
  const navigation = filterAuthorizedSidebarNavigation(financeEnvironment, section => hasAccess({
    section,
    effectiveRole: userRole,
    isSuperAdmin,
    isArea4Owner: isOwner,
    // La actuación real conserva los grants del usuario efectivo. Marcar sólo
    // isViewingAs simularía un rol y el evaluador descartaría esos grants.
    isViewingAs: false,
    isViewingAsUser,
    viewAsRole: null,
    userRoles,
    viewingUser,
    permisosGranulares: permissions,
    tienePermisosGranulares,
    permissionsAdopted,
    surfacePermissions,
  }), conciliarEnabled, menuPresentation, href => isOwner || area4SurfaceSeedAllows(surfacePermissions, href), rentabilidadReadonlyEnabled)

  return {
    mode: isPrivilegedRealRole ? 'privileged' : 'seed',
    navigation,
    permissionSignature: `${permissionSignature(permissions)}::${area4SurfacePermissionSignature(surfacePermissions)}`,
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
  // requireAuth devuelve session.user efectivo: auth valida la actuación viva
  // antes de construir la sesión. Nunca se consulta la ACL de impersonation.actorId.
  const effectiveUserId = Number(session.user.id)
  const livePrincipal = await resolveLiveAdminPrincipal(prisma, effectiveUserId)
  if (!livePrincipal) redirect('/login')
  const userRole = livePrincipal.rol
  const userRoles = [...(livePrincipal.roles || [])]
  const isViewingAsUser = Boolean(session.impersonation)
  const viewingUser: AdminSidebarPreviewUser | null = isViewingAsUser ? {
    id: livePrincipal.id,
    nombre: session.user.name || '',
    email: session.user.email || '',
    rol: userRole,
    roles: userRoles,
  } : null
  const isOwner = !isViewingAsUser && isArea4Owner(livePrincipal)
  // Esta foto pertenece sólo a este render y al actor efectivo que requireAuth
  // acaba de comprobar. No es autoridad para APIs ni se conserva entre requests.
  const permissionSeed = !isOwner
    ? readAdminPermissionsSsrWithFallback(prisma, effectiveUserId)
    : Promise.resolve(null)
  // Las lecturas posteriores a la autenticación son independientes y no mutan
  // estado. La foto, si está disponible, reutiliza su propio conteo de lectura;
  // ante un error se conserva exactamente el fallback histórico de count().
  const [profileEnvironment, financeContext, conciliarContext, initialPermissions, canAccessAdmin, menuConfiguration, permissionsAdopted, surfacePermissions] = await Promise.all([
    getFinanceEasyProfileRuntime(),
    getFinanceEasyRuntimeContext(),
    getConciliarRuntimeContext(),
    permissionSeed,
    canAccessAdminPanel({ ...session.user, role: userRole, roles: userRoles }, async usuarioId => {
      const permissions = await permissionSeed
      if (permissions !== null && usuarioId === effectiveUserId) return countReadableAdminPermissionSeeds(permissions)
      return prisma.permisoUsuario.count({ where: { usuarioId, lectura: true, area: { activo: true, codigo: { startsWith: 'admin.' } } } })
    }),
    readArea4MenuConfiguration(prisma),
    readLiveArea4Adoption(prisma, effectiveUserId),
    isOwner ? Promise.resolve([]) : readArea4SurfacePermissionSeedWithFallback(prisma, effectiveUserId),
  ])
  trace('environment-and-access')
  const easyOnly = profileEnvironment !== null && await isEasyOnlyFinanceUser(Number(session.user.id))
  trace('profile')
  if (!canAccessAdmin && !easyOnly) {
    redirect('/empleado')
  }

  const financeEnvironment = financeContext?.runtime ?? null
  const conciliarEnabled = conciliarContext !== null
  // The existing profile runtime also proves production identity when the easy
  // UI is off/read-only. Do not widen financeEnvironment for unrelated entries.
  const rentabilidadReadonlyEnabled = rentabilidadReadonlyMenuDisponible(financeEnvironment ?? profileEnvironment)
  const menuPresentation = resolveArea4MenuPresentation(menuConfiguration, livePrincipal)
  const initialSidebar = getSidebarInitialModel({
    userRole,
    userRoles,
    easyOnly,
    financeEnvironment,
    conciliarEnabled,
    rentabilidadReadonlyEnabled,
    initialPermissions,
    isArea4Owner: isOwner,
    isViewingAsUser,
    viewingUser,
    menuPresentation,
    permissionsAdopted,
    surfacePermissions,
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
        isArea4Owner={isOwner}
        permissionsAdopted={permissionsAdopted}
        actingUser={viewingUser ?? undefined}
        initialSurfacePermissions={surfacePermissions}
      >
        <SidebarProvider>
          <div data-admin-shell className="min-h-screen overflow-x-hidden bg-gray-50 text-gray-900">
            <AdminSidebar
              user={session.user}
              easyOnly={easyOnly}
              financeEnvironment={financeEnvironment}
              conciliarEnabled={conciliarEnabled}
              rentabilidadReadonlyEnabled={rentabilidadReadonlyEnabled}
              initialMenu={initialMenu}
              initialMenuMode={initialSidebar?.mode ?? 'unavailable'}
              initialPermissionSignature={initialSidebar?.permissionSignature}
              menuPresentation={menuPresentation}
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
