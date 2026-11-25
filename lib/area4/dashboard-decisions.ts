import type { DashboardRow } from './dashboard-contract'

/** Aviso de calendario, no un estado inventado de aprobación. */
export function dashboardPriceDeadline(now: Date): DashboardRow | null {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return day < '2026-12-01' ? { badge: '1 dic', tone: 'w', title: 'Revisar la subida de precios 2027', detail: 'Aviso de fecha: antes del 1 de diciembre de 2026. No se aplica ni confirma ninguna subida.', href: '/admin/subida-precios', action: 'Revisar' } : null
}

/** Decisiones del propietario. Gastos de trabajadores (Área 5) queda fuera de esta candidata: no hay lector ni enlace. */
export async function readDashboardDecisions(_viewerId: number, now: Date, canRead: (key: string, path: string) => boolean): Promise<DashboardRow[]> {
  const rows: DashboardRow[] = []
  if (canRead('subida-precios', '/admin/subida-precios')) {
    const deadline = dashboardPriceDeadline(now)
    if (deadline) rows.push(deadline)
  }
  // No existe en esta base un lector/almacén específico de solicitudes de acceso.
  // No se presentan propuestas de rol ni peticiones de mejora como solicitudes de acceso.
  return rows
}
