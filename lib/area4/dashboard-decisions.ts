import prisma from '@/lib/prisma'
import type { DashboardRow } from './dashboard-contract'

/** Aviso de calendario, no un estado inventado de aprobación. */
export function dashboardPriceDeadline(now: Date): DashboardRow | null {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return day < '2026-12-01' ? { badge: '1 dic', tone: 'w', title: 'Revisar la subida de precios 2027', detail: 'Aviso de fecha: antes del 1 de diciembre de 2026. No se aplica ni confirma ninguna subida.', href: '/admin/subida-precios', action: 'Revisar' } : null
}

/** Solo propietario real. Reutiliza la guardia nativa; no basta el rol ni el V del menú. */
export async function readDashboardDecisions(viewerId: number, now: Date, canRead: (key: string, path: string) => boolean): Promise<DashboardRow[]> {
  const rows: DashboardRow[] = []
  if (canRead('personal-nominas', '/admin/gastos-nominas')) {
    try {
      const { actorRevisor } = await import('@/lib/area5/server')
      const actor = await actorRevisor()
      if (actor.usuarioId !== viewerId || actor.actuando || !actor.revisor) throw new Error('DASHBOARD_SOURCE_DENIED')
      // Mismo estado y población que GET Área 5; nunca gastos.length (lista limitada a 400).
      const counts = await prisma.$queryRaw<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM area5_gastos WHERE estado = 'PENDIENTE' LIMIT 1`
      const total = counts[0]?.total
      if (Number.isSafeInteger(total) && total > 0) rows.push({ badge: String(total), tone: 'w', title: 'Gastos de trabajadores por aprobar', detail: 'Recuento global de gastos pendientes de revisión, sin límite de lista.', href: '/admin/gastos-nominas', action: 'Revisar' })
    } catch { /* Módulo ausente, guardia denegada o fallo de lectura: no mostrar un falso pendiente. */ }
  }
  if (canRead('subida-precios', '/admin/subida-precios')) {
    const deadline = dashboardPriceDeadline(now)
    if (deadline) rows.push(deadline)
  }
  // No existe en esta base un lector/almacén específico de solicitudes de acceso.
  // No se presentan propuestas de rol ni peticiones de mejora como solicitudes de acceso.
  return rows
}
