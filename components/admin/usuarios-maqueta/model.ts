import { approvedCodePermissions } from '@/lib/area4/approved-roles'
import type {
  ApprovedRoleKey, PermissionMap, UsersDraft, UsersPerson,
  UsersProposalRow, UsersSection, UsersSnapshot,
} from '@/lib/area4/users-contract'

export const ACTIONS = ['V', 'E', 'C', 'X'] as const
export const ACTION_LABELS = { V: 'ver', E: 'editar', C: 'confirmar', X: 'exportar' }
export const VIEWS = ['usuarios', 'roles', 'cambios', 'auditoria'] as const
export type View = typeof VIEWS[number]
export const STORAGE_KEY = 'io.area4.users.draft.v1'

export function normalizeActions(value: string): string {
  const letters = new Set(value.split('').filter(letter => ACTIONS.includes(letter as typeof ACTIONS[number])))
  if (letters.has('E') || letters.has('C') || letters.has('X')) letters.add('V')
  return ACTIONS.filter(letter => letters.has(letter)).join('')
}

export function cleanExtras(extras: PermissionMap, sections: UsersSection[]): PermissionMap {
  return Object.fromEntries(sections.flatMap(section => {
    const value = normalizeActions(typeof extras[section.key] === 'string' ? extras[section.key] : '')
    return value ? [[section.key, value]] : []
  }))
}

export function personDraft(person: UsersPerson): UsersDraft {
  return { userId: person.id, role: person.role, extras: { ...person.extras }, active: person.active }
}

/** Excluye siempre cuentas protegidas, incluido el propietario. */
export function safeDrafts(snapshot: UsersSnapshot, candidates: UsersDraft[]): UsersDraft[] {
  return snapshot.users.filter(person => !person.protected && candidates.some(draft => draft.userId === person.id)).map(person => {
    const candidate = candidates.find(draft => draft.userId === person.id)!
    const role = snapshot.roles.some(item => item.key === candidate.role && item.key !== 'superadmin')
      ? candidate.role : person.role
    return {
      userId: person.id, role,
      extras: cleanExtras(candidate.extras ?? {}, snapshot.sections),
      active: typeof candidate.active === 'boolean' ? candidate.active : person.active,
    }
  })
}

export function initialDrafts(snapshot: UsersSnapshot): UsersDraft[] {
  return safeDrafts(snapshot, snapshot.proposal.drafts)
}

function sameDraft(snapshot: UsersSnapshot, first?: UsersDraft, second?: UsersDraft): boolean {
  return Boolean(first && second && first.role === second.role && first.active === second.active
    && JSON.stringify(cleanExtras(first.extras, snapshot.sections)) === JSON.stringify(cleanExtras(second.extras, snapshot.sections)))
}

/** Expansión pura de la misma ACL que usa el servidor; no importa Prisma ni crypto. */
export function expandedPermissions(snapshot: UsersSnapshot, role: ApprovedRoleKey, extras: PermissionMap): PermissionMap {
  const codes = [...new Set(snapshot.sections.flatMap(section => section.codes))]
  const map = approvedCodePermissions(role, cleanExtras(extras, snapshot.sections), codes)
  return Object.fromEntries(snapshot.sections.map(section => [section.key,
    ACTIONS.filter(action => section.codes.some(code => (map[code] ?? '').includes(action))).join(''),
  ]))
}

export function effectivePermissions(snapshot: UsersSnapshot, person: UsersPerson, draft?: UsersDraft): PermissionMap {
  if (person.protected) return person.current
  if (!draft) return person.next
  if (sameDraft(snapshot, draft, snapshot.proposal.drafts.find(item => item.userId === person.id))) return person.next
  const state = draft
  if (!state.active) return {}
  return expandedPermissions(snapshot, state.role, state.extras)
}

export function localRows(snapshot: UsersSnapshot, drafts: UsersDraft[]): UsersProposalRow[] {
  return snapshot.users.map(person => {
    const explicitDraft = drafts.find(item => item.userId === person.id)
    const draft = explicitDraft ?? personDraft(person)
    const next = effectivePermissions(snapshot, person, explicitDraft)
    const current = person.active ? person.current : {}
    const localDifferences = person.protected || !explicitDraft ? [] : snapshot.sections.flatMap(section => {
      const before = current[section.key] ?? ''
      const after = next[section.key] ?? ''
      const lost = ACTIONS.filter(action => before.includes(action) && !after.includes(action)).join('')
      const gained = ACTIONS.filter(action => after.includes(action) && !before.includes(action)).join('')
      return lost || gained ? [{ section: section.key, label: section.label, lost, gained }] : []
    })
    const assignmentChanged = person.currentRoleLabel !== roleName(snapshot, draft.role)
      || draft.role !== person.role
      || JSON.stringify(cleanExtras(person.extras, snapshot.sections)) !== JSON.stringify(cleanExtras(draft.extras, snapshot.sections))
    const serverBaseline = snapshot.proposal.rows.find(row => row.userId === person.id)
    const originalDraft = snapshot.proposal.drafts.find(item => item.userId === person.id)
    const isOriginal = sameDraft(snapshot, originalDraft, draft)
    // La revisión original contiene todas las diferencias granulares por código,
    // no solo la unión visual de V/E/C/X del menú.
    const differences = isOriginal && serverBaseline ? serverBaseline.differences : localDifferences
    return {
      ...draft, name: person.name, currentRoleLabel: person.currentRoleLabel,
      differences,
      changes: !person.protected && Boolean(explicitDraft && (differences.length || assignmentChanged || person.active !== draft.active || (isOriginal && serverBaseline?.changes))),
      blockedReason: person.protected ? person.protectionReason ?? 'Cuenta protegida; no se modifica.' : serverBaseline?.blockedReason,
    }
  })
}

export function roleName(snapshot: UsersSnapshot, key: ApprovedRoleKey): string {
  return snapshot.roles.find(role => role.key === key)?.name ?? key
}

export function currentRoleKey(snapshot: UsersSnapshot, person: UsersPerson): ApprovedRoleKey | null {
  const primary = person.currentRoleLabel.split(' + ')[0].split(' · ')[0].trim().toLocaleLowerCase('es')
  const aliases: Record<string, ApprovedRoleKey> = { 'super admin': 'superadmin', 'visor': 'empleado', 'visor (solo portal)': 'empleado', 'ventas': 'comercial' }
  return snapshot.roles.find(role => role.name.toLocaleLowerCase('es') === primary)?.key ?? aliases[primary] ?? null
}

export function groupedSections(sections: UsersSection[]): [string, UsersSection[]][] {
  const groups = new Map<string, UsersSection[]>()
  for (const section of sections) groups.set(section.group, [...(groups.get(section.group) ?? []), section])
  return [...groups.entries()]
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toLocaleUpperCase('es')
}

export function formatDate(value: string | null, dateOnly = false): string {
  if (!value) return 'Nunca'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return dateOnly
    ? date.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })
    : date.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `No se pudo completar la solicitud (${response.status}).`)
  return data as T
}
