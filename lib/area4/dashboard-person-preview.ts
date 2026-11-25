import type { DashboardPerson } from './dashboard-contract'

/** Selector local al Dashboard: nunca una sesión ni una concesión de permisos. */
export function parseDashboardPerson(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) throw new Error('DASHBOARD_PERSON_INVALID')
  const id = Number(value)
  if (!Number.isSafeInteger(id)) throw new Error('DASHBOARD_PERSON_INVALID')
  return id
}

export function selectDashboardPerson(owner: boolean, acting: boolean, viewerId: number, personId: number | null, people: readonly DashboardPerson[]): DashboardPerson | null {
  if (personId === null || personId === viewerId) return null
  if (!owner || acting) throw new Error('DASHBOARD_PREVIEW_DENIED')
  const person = people.find(p => p.id === personId && p.role !== 'superadmin')
  if (!person) throw new Error('DASHBOARD_PREVIEW_DENIED')
  return person
}
