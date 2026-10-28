/** Render hint only. Never read as authentication, permission or finance data. */
export const ADMIN_RENDER_SURFACE_HEADER = 'x-io-admin-render-surface'
export const CONCILIAR_READY_SURFACE = 'conciliar-ready'
export function adminRenderSurface(pathname: string, conciliarEnabled: boolean): string {
  return conciliarEnabled && pathname === '/admin/finanzas/conciliar' ? CONCILIAR_READY_SURFACE : 'default'
}
