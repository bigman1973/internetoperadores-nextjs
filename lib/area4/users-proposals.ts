import { createHash } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { esRevisor } from '../area5/core'
import { appendArea4Audit } from './audit'
import {
  APPROVED_ROLES, APPROVED_ROLES_VERSION, ROLE_ENUM, USERS_SECTIONS,
  approvedCodePermissions, mergeRolePermissions, missingApprovedRoleCodes, proposedRoleFor, protectedPersonReason,
} from './approved-roles'
import { configuredArea4OwnerId, evaluateArea4Capability, isArea4OwnerOnlyArea, type Area4Grant } from './policy'
import type { Area4Capability } from './policy'
import { AREA4_ACTIONS, area4CodeIsBaseline, area4RegistrySurfaceMatches, type Area4SurfaceMatch } from './section-registry'
import {
  SectionAssignmentError, area4SectionSurfaceAssigned, buildArea4RegistrySnapshot,
  emptyArea4SectionAssignmentState, loadArea4SectionAssignmentState, parseSectionAssignmentCommand, resolveArea4RoleTemplates,
  type Area4SectionAssignmentState, type RegistryEntitlement, type SectionAssignmentCommand,
} from './section-assignments'
import type { ApprovedRole, ApprovedRoleKey, PermissionDifference, PermissionMap, UsersDraft, UsersPerson, UsersProposal, UsersSection, UsersSnapshot } from './users-contract'

export class UsersProposalError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message) }
}
const invalid = () => new UsersProposalError('INVALID_DRAFT', 400, 'Borrador no válido.')
const ACTIONS = AREA4_ACTIONS.map(a => a.letter)
const CAPS = AREA4_ACTIONS.map(a => a.capability)
const MAX_USERS = 1000
const MAX_AREAS = 2000
const roleKeys = new Set(APPROVED_ROLES.map(r => r.key))
const sectionKeys = new Set(USERS_SECTIONS.map(s => s.key))

export type RoleTemplateSnapshot = {
  version: 1; templates: ApprovedRole[]; sections: UsersSection[];
  areas: { id: string; codigo: string; activo: boolean }[]; baselineCodes: string[]; compiled: PermissionMap;
}
export type UsersCurrentGrant = Area4Grant & { id: string; areaId: string; createdAt: string; updatedAt: string }
export type UsersCurrentUser = {
  id: number; nombre: string; email: string; activo: boolean; rol: string; roles: string[];
  perfilAsignado: string | null; permisosArea4Vivos: boolean; ultimoAcceso: string | null;
  createdAt: string; updatedAt: string; grants: UsersCurrentGrant[];
  approvedAssignment?: { auditId: string; auditCreatedAt: string; role: ApprovedRoleKey; extras: PermissionMap;
    registryEntitlements?: RegistryEntitlement[]; assignmentRevision?: string; roleTemplateSnapshot?: RoleTemplateSnapshot };
}
export type UsersCurrentState = {
  users: UsersCurrentUser[];
  areas: { id: string; codigo: string; padre: string | null; activo: boolean }[];
  profiles: { id: string; nombre: string; activo: boolean; permisos: unknown; updatedAt: string }[];
  assignments?: Area4SectionAssignmentState;
  resolvedRoles?: ApprovedRole[];
  registryMatches?: readonly Area4SurfaceMatch[];
}
export type UsersReadDatabase = Pick<PrismaClient, 'usuarioAdmin' | 'permisoArea' | 'perfilPermisos' | 'auditoriaPermisosArea4'>
export type UsersApplyDatabase = UsersReadDatabase & Pick<PrismaClient, '$transaction'>

function closedRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return (prototype === Object.prototype || prototype === null) && Object.keys(value).every(key => keys.includes(key))
}
export function normalizeUsersDrafts(value: unknown): UsersDraft[] {
  if (!Array.isArray(value) || value.length > MAX_USERS) throw invalid()
  const seen = new Set<number>()
  const result = value.map(item => {
    if (!closedRecord(item, ['userId', 'role', 'extras', 'active']) || Object.keys(item).length !== 4
      || typeof item.userId !== 'number' || !Number.isSafeInteger(item.userId) || item.userId < 1
      || seen.has(item.userId) || typeof item.role !== 'string' || !roleKeys.has(item.role as ApprovedRoleKey)
      || typeof item.active !== 'boolean' || !closedRecord(item.extras, [...sectionKeys])) throw invalid()
    seen.add(item.userId)
    const extras: PermissionMap = {}
    for (const key of Object.keys(item.extras).sort()) {
      const letters = item.extras[key]
      if (typeof letters !== 'string' || letters.length > 4 || !/^[VECX]*$/.test(letters) || new Set(letters).size !== letters.length) throw invalid()
      const normalized = ACTIONS.filter(a => letters.includes(a)).join('')
      if (normalized) extras[key] = normalized
    }
    return { userId: item.userId, role: item.role as ApprovedRoleKey, extras, active: item.active }
  })
  return result.sort((a, b) => a.userId - b.userId)
}
export type UsersProposalCommand = { action: 'preview'; drafts: UsersDraft[] } | { action: 'apply'; drafts: UsersDraft[]; confirmed: true; revision: string }
export type Area4UsersCommand = UsersProposalCommand | SectionAssignmentCommand
export function parseUsersProposalCommand(value: unknown): Area4UsersCommand {
  if (value && typeof value === 'object' && ['preview-sections', 'assign-sections'].includes((value as { action: string }).action)) return parseSectionAssignmentCommand(value)
  if (!closedRecord(value, ['action', 'drafts', 'confirmed', 'revision'])) throw invalid()
  if (value.action === 'preview' && Object.keys(value).length === 2) return { action: 'preview', drafts: normalizeUsersDrafts(value.drafts) }
  if (value.action === 'apply' && Object.keys(value).length === 4 && value.confirmed === true
    && typeof value.revision === 'string' && /^[a-f0-9]{64}$/.test(value.revision)) {
    return { action: 'apply', drafts: normalizeUsersDrafts(value.drafts), confirmed: true, revision: value.revision }
  }
  throw invalid()
}

export function usersApplyEnvironment(env: Record<string, string | undefined> = process.env): { allowed: boolean; label: string; reason: string } {
  let isolated = false
  try {
    const url = new URL(env.DATABASE_URL || '')
    isolated = ['postgres:', 'postgresql:'].includes(url.protocol) && url.username === 'io_staging_finanzas' && url.pathname === '/io_staging_finanzas'
  } catch { /* no credentials in errors */ }
  if (env.FINANCE_STAGING_SANDBOX !== '1' || env.VERCEL_ENV === 'production' || !isolated || env.IO_PRODUCTION_READ_ONLY === '1' || env.FINANCE_DEPLOYMENT_READ_ONLY === '1') {
    return { allowed: false, label: 'Solo propuesta · aplicación no autorizada', reason: 'Producción requiere publicación autorizada y copia previa; solo se aplica en staging aislado.' }
  }
  if (env.AREA4_STAGING_USER_APPLY !== '1') return { allowed: false, label: 'Staging · solo propuesta', reason: 'Aplicación cerrada: falta autorización explícita AREA4_STAGING_USER_APPLY y validación de guardias.' }
  return { allowed: true, label: 'Staging aislado · aplicación condicionada a guardias', reason: 'Los bloqueos de cada persona y las guardias Prisma/middleware siguen vigentes.' }
}
export function usersApplyOriginAllowed(origin: string, env: Record<string, string | undefined> = process.env): boolean {
  try {
    const url = new URL(origin)
    if (url.origin !== origin || url.protocol !== 'https:' || url.port || url.username || url.password) return false
    if (url.hostname === 'staging.internetoperadores.com') return true
    if (env.VERCEL_ENV !== 'preview' || !url.hostname.endsWith('.vercel.app')) return false
    // Exact configured preview hosts; never any arbitrary vercel.app deployment.
    const configured = [env.VERCEL_URL, env.AREA4_STAGING_PREVIEW_HOST].filter(Boolean)
    return configured.includes(url.hostname)
  } catch { return false }
}
export async function readUsersProposalJson(request: Request): Promise<Area4UsersCommand> {
  const origin = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  if (!origin || origin !== new URL(request.url).origin || (site && site !== 'same-origin')) throw new UsersProposalError('ORIGIN_NOT_ALLOWED', 403, 'Origen no autorizado.')
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new UsersProposalError('JSON_REQUIRED', 415, 'Se requiere JSON.')
  const limit = 256 * 1024
  const length = request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new UsersProposalError('REQUEST_TOO_LARGE', 413, 'Solicitud demasiado grande.')
  const reader = request.body?.getReader()
  if (!reader) throw invalid()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); throw new UsersProposalError('REQUEST_TOO_LARGE', 413, 'Solicitud demasiado grande.') }
      chunks.push(value)
    }
    return parseUsersProposalCommand(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  } catch (error) {
    if (error instanceof UsersProposalError || error instanceof SectionAssignmentError) throw error
    throw invalid()
  } finally { reader.releaseLock() }
}

const iso = (date: Date | null): string | null => date?.toISOString() ?? null
/** Narrow selects only: no passwordHash, employee/NIF records or external connections. */
export async function readUsersCurrentState(db: UsersReadDatabase, ownerId: number | null = configuredArea4OwnerId(), matches: readonly Area4SurfaceMatch[] = area4RegistrySurfaceMatches()): Promise<UsersCurrentState> {
  const [users, areas, profiles] = await Promise.all([
    db.usuarioAdmin.findMany({ take: MAX_USERS + 1, orderBy: { id: 'asc' }, select: {
      id: true, nombre: true, email: true, activo: true, rol: true, roles: true, perfilAsignado: true,
      permisosArea4Vivos: true, ultimoAcceso: true, createdAt: true, updatedAt: true,
      permisos: { orderBy: { areaId: 'asc' }, select: {
        id: true, areaId: true, lectura: true, escritura: true, confirmar: true, exportar: true, createdAt: true, updatedAt: true,
        area: { select: { codigo: true } },
      } },
    } }),
    db.permisoArea.findMany({ take: MAX_AREAS + 1, orderBy: { codigo: 'asc' }, select: { id: true, codigo: true, padre: true, activo: true } }),
    db.perfilPermisos.findMany({ take: MAX_USERS + 1, orderBy: { id: 'asc' }, select: { id: true, nombre: true, activo: true, permisos: true, updatedAt: true } }),
  ])
  if (users.length > MAX_USERS || areas.length > MAX_AREAS || profiles.length > MAX_USERS) throw new UsersProposalError('SNAPSHOT_LIMIT', 503, 'El volumen requiere una revisión paginada del propietario.')
  const state: UsersCurrentState = {
    users: users.map(({ permisos, ...u }) => ({ ...u, ultimoAcceso: iso(u.ultimoAcceso), createdAt: iso(u.createdAt)!, updatedAt: iso(u.updatedAt)!, grants: permisos.map(({ area, ...g }) => ({ ...g, codigo: area.codigo, createdAt: iso(g.createdAt)!, updatedAt: iso(g.updatedAt)! })) })),
    areas,
    profiles: profiles.map(p => ({ ...p, updatedAt: iso(p.updatedAt)! })),
  }
  if (matches.some(m => !m.baseline)) {
    state.assignments = await loadArea4SectionAssignmentState(db, ownerId, matches)
    state.registryMatches = matches
  }
  // Only already-adopted users need provenance. Bounded batches avoid an
  // unbounded scan of the audit log or one connection per account.
  const adopted = state.users.filter(u => u.permisosArea4Vivos)
  for (let start = 0; start < adopted.length; start += 8) await Promise.all(adopted.slice(start, start + 8).map(async user => {
    const event = await db.auditoriaPermisosArea4.findFirst({
      where: { objetivoUsuarioId: user.id, operacion: 'PERFIL_APLICADO', origen: '/api/admin/usuarios/propuestas' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, actorId: true, createdAt: true, despues: true },
    })
    const assignment = matchingAuditAssignment(user, event, state, ownerId)
    if (assignment) user.approvedAssignment = assignment
  }))
  return state
}

/** Metadata is trusted only when EVERY current role/state/grant matches the audited result. */
export function matchingAuditAssignment(user: UsersCurrentUser, event: { id: string; actorId: number; createdAt: Date; despues: unknown } | null, state: UsersCurrentState, ownerId: number | null): UsersCurrentUser['approvedAssignment'] | null {
  const owner = state.users.find(u => u.id === ownerId)
  if (!ownerId || !owner?.activo || owner.rol !== 'SUPER_ADMIN' || event?.actorId !== ownerId || !event.despues || typeof event.despues !== 'object' || Array.isArray(event.despues)) return null
  const after = event.despues as Record<string, unknown>
  try {
    const parsed = normalizeUsersDrafts([{ userId: user.id, role: after.approvedRole, extras: after.extras, active: after.activo }])[0]
    if (!user.permisosArea4Vivos || after.permisosArea4Vivos !== true || after.id !== user.id || after.rol !== user.rol
      || ROLE_ENUM[parsed.role] !== user.rol || user.perfilAsignado !== null || after.perfilAsignado !== null
      || parsed.active !== user.activo || !Array.isArray(after.roles) || canonical(after.roles) !== canonical(user.roles)
      || !Array.isArray(after.grants) || after.grants.length !== user.grants.length) return null
    const entries = after.grants as Array<Record<string, unknown>>
    if (new Set(entries.map(g => g.areaId)).size !== entries.length) return null
    if (!user.grants.every(grant => entries.some(g => g.areaId === grant.areaId && g.codigo === grant.codigo && CAPS.every(cap => g[cap] === Boolean(grant[cap]))))) return null
    if (user.roles.length !== 1 || user.roles[0] !== ROLE_ENUM[parsed.role]) return null
    // Identity is checked against the COMPLETE apply-time compilation, never the
    // new template. Otherwise a later section assignment erases historical identity.
    const snapshot = after.roleTemplateSnapshot === undefined ? null : validateRoleTemplateSnapshot(after.roleTemplateSnapshot, parsed)
    if (after.roleTemplateSnapshot !== undefined && !snapshot) return null
    if (snapshot && (after.confirmed !== true || after.ownerId !== ownerId || typeof after.revision !== 'string' || !/^[a-f0-9]{64}$/.test(after.revision))) return null
    const areas = snapshot?.areas ?? state.areas
    const desired = snapshot?.compiled ?? approvedCodePermissions(parsed.role, parsed.extras, areas.map(a => a.codigo), APPROVED_ROLES)
    if (user.grants.length !== areas.length || !areas.every(a => user.grants.some(g => g.areaId === a.id && g.codigo === a.codigo && grantLetters(g) === (a.activo ? desired[a.codigo] : '')))) return null
    if (!snapshot) return { auditId: event.id, auditCreatedAt: iso(event.createdAt)!, role: parsed.role, extras: parsed.extras }
    const entitlements = validateRegistryEntitlements(after.registryEntitlements, snapshot, parsed.role)
    if (!entitlements || typeof after.assignmentRevision !== 'string' || !/^[a-f0-9]{64}$/.test(after.assignmentRevision)) return null
    return { auditId: event.id, auditCreatedAt: iso(event.createdAt)!, role: parsed.role, extras: parsed.extras,
      registryEntitlements: entitlements, assignmentRevision: after.assignmentRevision, roleTemplateSnapshot: snapshot }
  } catch { return null }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`
}
export function resolvedUsersRoles(state: UsersCurrentState): ApprovedRole[] {
  return state.resolvedRoles ?? resolveArea4RoleTemplates(state.assignments, state.registryMatches)
}
export function usersProposalRevision(state: UsersCurrentState, drafts: UsersDraft[], ownerId: number | null): string {
  // Complete current state, all four grants, roles[], profile, adoption, dates,
  // area catalogue, live profiles, owner identity and actual templates are bound.
  return createHash('sha256').update(canonical({
    version: APPROVED_ROLES_VERSION, templates: resolvedUsersRoles(state), sections: USERS_SECTIONS, ownerId,
    assignments: state.assignments ?? emptyArea4SectionAssignmentState(),
    state: { users: [...state.users].sort((a, b) => a.id - b.id).map(u => ({ ...u, roles: [...u.roles].sort(), grants: [...u.grants].sort((a, b) => a.areaId.localeCompare(b.areaId)) })), areas: [...state.areas].sort((a, b) => a.codigo.localeCompare(b.codigo)), profiles: [...state.profiles].sort((a, b) => a.id.localeCompare(b.id)) },
    drafts: normalizeUsersDrafts(drafts),
  })).digest('hex')
}
function grantLetters(g: Area4Grant): string { return ACTIONS.filter((_, i) => g[CAPS[i]]).join('') }
export function currentUserCodePermissions(user: UsersCurrentUser, state: UsersCurrentState, ownerId: number | null): PermissionMap {
  const active = new Set(state.areas.filter(a => a.activo).map(a => a.codigo))
  const grants = user.grants.filter(g => active.has(g.codigo))
  const matches = state.registryMatches ?? area4RegistrySurfaceMatches()
  return Object.fromEntries(state.areas.map(area => [area.codigo, area.activo ? ACTIONS.filter((_, i) => evaluateArea4Capability({
    principal: { id: user.id, activo: user.activo, rol: user.rol, roles: user.roles }, grants,
    codigoArea: area.codigo, capability: CAPS[i], ownerId, permissionsAdopted: user.permisosArea4Vivos,
    newSurfaceConsent: Boolean(user.approvedAssignment?.registryEntitlements?.some(e => e.code === area.codigo && e.actions.includes(ACTIONS[i])
      && matches.some(m => !m.baseline && m.id === e.id && m.descriptor === e.descriptor
        && state.assignments && area4SectionSurfaceAssigned(m, state.assignments, user.approvedAssignment!.role, CAPS[i])))),
  })).join('') : '']))
}
function sectionsFromCodes(map: PermissionMap): PermissionMap {
  return Object.fromEntries(USERS_SECTIONS.map(s => [s.key, ACTIONS.filter(a => s.codes.some(c => (map[c] || '').includes(a))).join('')]))
}
export function permissionDifferences(current: PermissionMap, next: PermissionMap): PermissionDifference[] {
  return [...new Set([...Object.keys(current), ...Object.keys(next)])].sort().flatMap(code => {
    const lost = ACTIONS.filter(a => (current[code] || '').includes(a) && !(next[code] || '').includes(a)).join('')
    const gained = ACTIONS.filter(a => !(current[code] || '').includes(a) && (next[code] || '').includes(a)).join('')
    const section = USERS_SECTIONS.find(s => s.codes.includes(code))
    return lost || gained ? [{ section: code, label: section ? `${section.label} · ${code}` : code, lost, gained }] : []
  })
}
export function intendedSectionPermissions(role: ApprovedRoleKey, extras: PermissionMap, templates: ApprovedRole[] = APPROVED_ROLES): PermissionMap {
  const result = mergeRolePermissions(role, extras, templates)
  if (extras.clientes) for (const section of USERS_SECTIONS) if (section.codes.some(c => c.startsWith('admin.clientes.'))) {
    result[section.key] = ACTIONS.filter(a => `${result[section.key]}${extras.clientes}`.includes(a)).join('')
  }
  return result
}
function sectionPermissionDifferences(current: PermissionMap, next: PermissionMap): PermissionDifference[] {
  return USERS_SECTIONS.flatMap(section => {
    const lost = ACTIONS.filter(a => (current[section.key] || '').includes(a) && !(next[section.key] || '').includes(a)).join('')
    const gained = ACTIONS.filter(a => !(current[section.key] || '').includes(a) && (next[section.key] || '').includes(a)).join('')
    return lost || gained ? [{ section: section.key, label: `${section.label} · resumen de intención`, lost, gained }] : []
  })
}
export function proposalBlockedReason(user: UsersCurrentUser, draft: UsersDraft, state: UsersCurrentState, ownerId: number | null): string | undefined {
  const protection = protectedPersonReason({ id: user.id, name: user.nombre }, ownerId)
  if (protection) return protection
  if (draft.role === 'superadmin') return 'No se puede crear ni promover otro Superadmin.'
  const map = approvedCodePermissions(draft.role, draft.extras, state.areas.map(a => a.codigo), resolvedUsersRoles(state))
  const requested = mergeRolePermissions(draft.role, draft.extras, resolvedUsersRoles(state))
  if (Object.entries(map).some(([code, actions]) => actions && isArea4OwnerOnlyArea(code))) return 'No se pueden delegar ámbitos reservados al propietario mediante extras.'
  if (requested.personal && !requested.nominas) {
    return 'Personal sin nóminas no está aislado: API de empleados incluye nóminas/salarios y usa admin.personal.empleados. Requiere separación autorizada del dueño del módulo.'
  }
  if (draft.role === 'comercial' && requested['subida-precios']) return 'Comercial · Subida de precios V está pendiente de decisión: la guardia vigente solo admite Superadmin/Gerente.'
  if (requested.gastos?.includes('C') && !esRevisor(user.email)) return 'Gastos VEC no es efectivo para esta persona: Área 5 limita aprobación a sus revisores vivos, no al rol Gerente.'
  // No grant may be omitted because the catalogue has not been migrated.
  const needed = USERS_SECTIONS.filter(s => requested[s.key]).flatMap(s => s.codes)
  const existing = new Set(state.areas.map(a => a.codigo))
  if (needed.some(c => !existing.has(c))) return 'Faltan códigos reales del catálogo para completar la plantilla; no se aplican permisos parciales.'
  if (requested.gastos && !USERS_SECTIONS.find(s => s.key === 'gastos')!.codes.length) return 'Gastos del trabajador comparte código Portal/Nóminas: falta separación granular revisada; no se concede VE al padre.'
  if (Object.keys(map).length === 0) return 'Catálogo de permisos no disponible.'
  return undefined
}
function label(user: UsersCurrentUser): string {
  const labels: Record<string, string> = { SUPER_ADMIN: 'Superadmin', GERENTE: 'Gerente', CONTABILIDAD: 'Contabilidad', VENTAS: 'Comercial', VISOR: 'Empleado', RRHH: 'RRHH', MARKETING: 'Marketing' }
  const roles = [...new Set([user.rol, ...user.roles])].map(r => labels[r] || r).join(' + ')
  return user.perfilAsignado ? `${roles} · ${user.perfilAsignado}` : roles
}
function targetChanged(user: UsersCurrentUser, draft: UsersDraft, state: UsersCurrentState): boolean {
  if (user.activo !== draft.active || user.rol !== ROLE_ENUM[draft.role] || user.roles.length !== 1 || user.roles[0] !== ROLE_ENUM[draft.role]
    || user.perfilAsignado !== null || !user.permisosArea4Vivos || user.grants.length !== state.areas.length) return true
  const desired = approvedCodePermissions(draft.role, draft.extras, state.areas.map(a => a.codigo), resolvedUsersRoles(state))
  if (canonical(user.approvedAssignment?.registryEntitlements ?? []) !== canonical(personRegistryEntitlements(state, draft, desired))) return true
  return state.areas.some(a => {
    const grant = user.grants.find(g => g.areaId === a.id)
    return !grant || grantLetters(grant) !== (a.activo ? desired[a.codigo] : '')
  })
}
export function buildUsersProposal(state: UsersCurrentState, value: unknown, ownerId: number | null): UsersProposal {
  const drafts = normalizeUsersDrafts(value)
  const rows = drafts.map(draft => {
    const user = state.users.find(u => u.id === draft.userId)
    if (!user) throw new UsersProposalError('USER_NOT_FOUND', 409, 'Una cuenta ya no existe; recarga la propuesta.')
    const blockedReason = proposalBlockedReason(user, draft, state, ownerId)
    const current = currentUserCodePermissions(user, state, ownerId)
    const desired = approvedCodePermissions(draft.role, draft.extras, state.areas.map(a => a.codigo), resolvedUsersRoles(state))
    const next = Object.fromEntries(state.areas.map(a => [a.codigo, a.activo && draft.active ? desired[a.codigo] : '']))
    const intent = draft.active ? intendedSectionPermissions(draft.role, draft.extras, resolvedUsersRoles(state)) : {}
    return { userId: user.id, name: user.nombre, currentRoleLabel: label(user), role: draft.role, extras: draft.extras, active: draft.active,
      differences: [...sectionPermissionDifferences(sectionsFromCodes(current), intent), ...permissionDifferences(current, next)], changes: targetChanged(user, draft, state), ...(blockedReason ? { blockedReason } : {}),
    }
  })
  return { revision: usersProposalRevision(state, drafts, ownerId), drafts, rows }
}
export const USERS_PROPOSAL_WARNINGS = [
  'No se ha aplicado ningún cambio al cargar o previsualizar. Las cuentas desconocidas quedan fuera del lote automático; requieren borrador explícito del propietario.',
  'Quedaría representa intención aprobada, no permisos ya efectivos. Un borrador bloqueado no puede aplicarse; los resúmenes por apartado no sustituyen el detalle por código real.',
  'Personal comparte datos salariales y nóminas; Lorena/Personal sin Nóminas queda bloqueado hasta separar handlers. Denegar admin.empleados.nominas/admin.gastos_nominas/admin.personal.empleados no elimina datos incrustados en otras respuestas.',
  'Finanzas agrupa APIs de nóminas y rentabilidad bajo admin.finanzas; no se garantiza separación de esos datos únicamente con la matriz. Cada guardia del módulo prevalece.',
  'Área 5 limita revisión de gastos a David/Víctor por su guardia propia. Jordi Gerente no obtiene aprobación real; Gastos VEC es intención de maqueta, no garantía del servidor.',
  'Comercial/Subida de precios V requiere decisión autorizada y queda bloqueado. La guardia actual solo permite Superadmin/Gerente.',
  'Los grupos con varios códigos muestran la unión visual de capacidades. El informe hoy → quedaría detalla cada código y cada acción; los ocho hijos Draxton no dan VE al padre.',
  'La aplicación necesita autorización explícita staging y excepción exacta de middleware; nunca omite guardias Prisma/SQL. No se envían emails ni se sincronizan servicios externos.',
]
export function snapshotFromUsersState(state: UsersCurrentState, ownerId: number | null, env: Record<string, string | undefined> = process.env): UsersSnapshot {
  const people = state.users.map(u => ({ id: u.id, name: u.nombre }))
  const drafts: UsersDraft[] = state.users.flatMap(u => {
    if (protectedPersonReason({ id: u.id, name: u.nombre }, ownerId)) return []
    if (u.permisosArea4Vivos) return u.approvedAssignment ? [{ userId: u.id, role: u.approvedAssignment.role, extras: u.approvedAssignment.extras, active: u.activo }] : []
    const approved = proposedRoleFor({ id: u.id, name: u.nombre }, people, ownerId)
    return approved ? [{ userId: u.id, ...approved, active: u.activo }] : []
  })
  const proposal = buildUsersProposal(state, drafts, ownerId)
  const users: UsersPerson[] = state.users.map(u => {
    const draft = drafts.find(d => d.userId === u.id)
    const protectionReason = protectedPersonReason({ id: u.id, name: u.nombre }, ownerId)
    const currentCodes = currentUserCodePermissions(u, state, ownerId)
    return { id: u.id, name: u.nombre, email: u.email, active: u.activo, lastAccess: u.ultimoAcceso, currentRoleLabel: label(u),
      role: u.id === ownerId ? 'superadmin' : draft?.role || (u.permisosArea4Vivos ? ({ GERENTE: 'gerente', CONTABILIDAD: 'contabilidad', VENTAS: 'comercial' } as const)[u.rol] || 'empleado' : 'empleado'), extras: draft?.extras || {}, current: sectionsFromCodes(currentCodes),
      next: draft ? (u.activo ? intendedSectionPermissions(draft.role, draft.extras, resolvedUsersRoles(state)) : {}) : sectionsFromCodes(currentCodes), protected: Boolean(protectionReason), ...(protectionReason ? { protectionReason } : {}),
    }
  })
  const environment = usersApplyEnvironment(env)
  const missingCodes = missingApprovedRoleCodes(state.areas.map(a => a.codigo))
  return { users, roles: resolvedUsersRoles(state), sections: USERS_SECTIONS, proposal,
    registry: buildArea4RegistrySnapshot(state.assignments ?? emptyArea4SectionAssignmentState(), env, state.registryMatches),
    applyingAllowed: environment.allowed && proposal.rows.every(row => !row.blockedReason), environmentLabel: environment.label,
    warnings: [...USERS_PROPOSAL_WARNINGS, environment.reason, ...(missingCodes.length ? [`Catálogo pendiente (solo códigos ya registrados): ${missingCodes.join(', ')}.`] : [])],
  }
}
/** SSR callable; consistent read snapshot when a full Prisma client is provided. */
export async function loadUsersSnapshot(db: UsersReadDatabase & Partial<Pick<PrismaClient, '$transaction'>>, ownerId: number | null): Promise<UsersSnapshot> {
  const state = db.$transaction
    ? await db.$transaction(tx => readUsersCurrentState(tx, ownerId), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
    : await readUsersCurrentState(db, ownerId)
  return snapshotFromUsersState(state, ownerId)
}
export async function previewUsersProposal(db: UsersApplyDatabase, ownerId: number, drafts: UsersDraft[]): Promise<UsersProposal> {
  return db.$transaction(async tx => buildUsersProposal(await readUsersCurrentState(tx, ownerId), drafts, ownerId), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
}
function auditBackup(user: UsersCurrentUser) {
  return { id: user.id, nombre: user.nombre, rol: user.rol, roles: user.roles, activo: user.activo, perfilAsignado: user.perfilAsignado,
    permisosArea4Vivos: user.permisosArea4Vivos, updatedAt: user.updatedAt, grants: user.grants.map(g => ({ ...g })) }
}
/** No retry on serialization/stale revision. All user updates, full ACL replacements and audits share ONE transaction. */
export async function applyUsersProposal(
  db: UsersApplyDatabase, input: { actorId: number; ownerId: number; origin: string; confirmed: boolean; revision: string; drafts: UsersDraft[] },
  env: Record<string, string | undefined> = process.env,
  matches: readonly Area4SurfaceMatch[] = area4RegistrySurfaceMatches(),
): Promise<UsersSnapshot> {
  if (input.confirmed !== true) throw invalid()
  const environment = usersApplyEnvironment(env)
  if (!environment.allowed) throw new UsersProposalError('APPLY_NOT_AUTHORIZED', 409, environment.reason)
  if (!usersApplyOriginAllowed(input.origin, env)) throw new UsersProposalError('STAGING_ORIGIN_REQUIRED', 403, 'Se requiere un origen staging autorizado.')
  if (input.actorId !== input.ownerId || !Number.isSafeInteger(input.ownerId) || input.ownerId < 1) throw new UsersProposalError('OWNER_REQUIRED', 403, 'Solo el propietario real puede aplicar.')
  const drafts = normalizeUsersDrafts(input.drafts)
  try {
    return await db.$transaction(async tx => {
      const state = await readUsersCurrentState(tx, input.ownerId, matches)
      const actor = state.users.find(u => u.id === input.actorId)
      if (!actor?.activo || actor.rol !== 'SUPER_ADMIN' || actor.id !== input.ownerId || configuredArea4OwnerId(env) !== input.ownerId) throw new UsersProposalError('OWNER_REQUIRED', 403, 'La identidad viva del propietario ya no está autorizada.')
      const proposal = buildUsersProposal(state, drafts, input.ownerId)
      if (proposal.revision !== input.revision) throw new UsersProposalError('STALE_REVISION', 409, 'El estado cambió; recarga y confirma una nueva propuesta.')
      if (proposal.rows.some(r => r.blockedReason)) throw new UsersProposalError('BLOCKED_PROPOSAL', 409, 'Hay cuentas protegidas o permisos incompatibles; revisa los bloqueos de la propuesta.')
      if (!proposal.rows.some(r => r.changes)) throw new UsersProposalError('NO_CHANGES', 409, 'La propuesta no contiene cambios pendientes.')
      // All targets and owner were re-read inside the Serializable transaction.
      for (const row of proposal.rows.filter(r => r.changes)) {
        const before = state.users.find(u => u.id === row.userId)!
        const desired = approvedCodePermissions(row.role, row.extras, state.areas.map(a => a.codigo), resolvedUsersRoles(state))
        await tx.usuarioAdmin.update({ where: { id: row.userId }, data: {
          rol: ROLE_ENUM[row.role], roles: [ROLE_ENUM[row.role]], activo: row.active, perfilAsignado: null, permisosArea4Vivos: true,
        }, select: { id: true } })
        await tx.permisoUsuario.deleteMany({ where: { usuarioId: row.userId } })
        await tx.permisoUsuario.createMany({ data: state.areas.map(area => {
          const actions = area.activo ? desired[area.codigo] : ''
          return { usuarioId: row.userId, areaId: area.id, lectura: actions.includes('V'), escritura: actions.includes('E'), confirmar: actions.includes('C'), exportar: actions.includes('X') }
        }) })
        const after = { id: row.userId, rol: ROLE_ENUM[row.role], roles: [ROLE_ENUM[row.role]], activo: row.active, perfilAsignado: null,
          permisosArea4Vivos: true, approvedRole: row.role, extras: row.extras, revision: proposal.revision, templateVersion: APPROVED_ROLES_VERSION,
          confirmed: true, ownerId: input.ownerId,
          roleTemplateSnapshot: captureRoleTemplateSnapshot(state, desired),
          registryEntitlements: personRegistryEntitlements(state, { userId: row.userId, role: row.role, extras: row.extras, active: row.active }, desired),
          assignmentRevision: (state.assignments ?? emptyArea4SectionAssignmentState()).revision,
          grants: state.areas.map(a => ({ areaId: a.id, codigo: a.codigo, lectura: a.activo && desired[a.codigo].includes('V'), escritura: a.activo && desired[a.codigo].includes('E'), confirmar: a.activo && desired[a.codigo].includes('C'), exportar: a.activo && desired[a.codigo].includes('X') })),
        }
        await appendArea4Audit(tx, { actorId: input.actorId, objetivoUsuarioId: row.userId, operacion: 'PERFIL_APLICADO', areaCodigo: 'admin.usuarios',
          antes: auditBackup(before) as Prisma.InputJsonValue, despues: after, origen: '/api/admin/usuarios/propuestas' })
      }
      return snapshotFromUsersState(await readUsersCurrentState(tx, input.ownerId, matches), input.ownerId, env)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 30000 })
  } catch (error) {
    if (error instanceof UsersProposalError) throw error
    if ((error as { code?: string })?.code === 'P2034') throw new UsersProposalError('STALE_REVISION', 409, 'Conflicto concurrente; recarga y confirma de nuevo. No se ha reintentado la escritura.')
    // Never echo SQL, credentials, row values or error metadata.
    throw new UsersProposalError('APPLY_FAILED', 500, 'No se pudo aplicar; la transacción se revierte sin cambios parciales.')
  }
}

/** Server-generated apply-time snapshot. Never accepted in proposal JSON. */
export function captureRoleTemplateSnapshot(state: UsersCurrentState, compiled: PermissionMap): RoleTemplateSnapshot {
  return { version: 1, templates: structuredClone(resolvedUsersRoles(state)), sections: structuredClone(USERS_SECTIONS),
    areas: state.areas.map(a => ({ id: a.id, codigo: a.codigo, activo: a.activo })),
    baselineCodes: state.areas.filter(a => area4CodeIsBaseline(a.codigo)).map(a => a.codigo).sort(), compiled: { ...compiled } }
}
/** Historical compilation uses its own captured rows; no mutation of global registry/templates. */
function compileHistoricalPermissions(snapshot: RoleTemplateSnapshot, role: ApprovedRoleKey, extras: PermissionMap): PermissionMap {
  const base = snapshot.templates.find(r => r.key === role)!.permissions
  const selected = Object.fromEntries(snapshot.sections.map(s => [s.key, ACTIONS.filter(a => `${base[s.key] || ''}${extras[s.key] || ''}`.includes(a)).join('')]))
  const result: PermissionMap = Object.fromEntries(snapshot.areas.map(a => [a.codigo, '']))
  for (const row of snapshot.sections) for (const code of row.codes) if (Object.hasOwn(result, code)) result[code] = selected[row.key]
  if (extras.clientes) for (const code of Object.keys(result)) if (snapshot.baselineCodes.includes(code) && (code === 'admin.clientes' || code.startsWith('admin.clientes.'))) result[code] = ACTIONS.filter(a => `${result[code]}${extras.clientes}`.includes(a)).join('')
  if (role !== 'superadmin' && role !== 'gerente') for (const code of Object.keys(result)) if (/nomina|salari/i.test(code)) result[code] = ''
  if (['empleado', 'draxton', 'comercial', 'contabilidad'].includes(role) && Object.hasOwn(result, 'admin.peticiones')) result['admin.peticiones'] = ''
  return result
}
function validateRoleTemplateSnapshot(value: unknown, draft: UsersDraft): RoleTemplateSnapshot | null {
  try {
    if (!closedRecord(value, ['version', 'templates', 'sections', 'areas', 'baselineCodes', 'compiled']) || Object.keys(value).length !== 6 || value.version !== 1
      || !Array.isArray(value.templates) || value.templates.length !== 6 || !Array.isArray(value.sections) || value.sections.length > MAX_AREAS
      || !Array.isArray(value.areas) || value.areas.length > MAX_AREAS || !value.areas.length || !closedRecord(value.compiled, value.areas.map(a => a.codigo))
      || !Array.isArray(value.baselineCodes) || value.baselineCodes.some(c => typeof c !== 'string' || !(value.areas as { codigo: string }[]).some(a => a.codigo === c))
      || new Set(value.baselineCodes).size !== value.baselineCodes.length) return null
    const sections = value.sections as UsersSection[]
    if (new Set(sections.map(s => s.key)).size !== sections.length || sections.some(s => !closedRecord(s, ['key', 'label', 'group', 'codes'])
      || typeof s.key !== 'string' || typeof s.label !== 'string' || typeof s.group !== 'string' || !Array.isArray(s.codes) || s.codes.some(c => typeof c !== 'string'))) return null
    const keys = sections.map(s => s.key)
    const mapsValid = (map: unknown) => closedRecord(map, keys) && Object.keys(map).length === keys.length && Object.values(map).every(v => typeof v === 'string' && /^[VECX]{0,4}$/.test(v) && ACTIONS.filter(a => v.includes(a)).join('') === v)
    const templates = value.templates as ApprovedRole[]
    if (new Set(templates.map(t => t.key)).size !== 6 || templates.some(t => !roleKeys.has(t.key) || !closedRecord(t, ['key', 'name', 'description', 'permissions'])
      || typeof t.name !== 'string' || typeof t.description !== 'string' || !mapsValid(t.permissions))) return null
    const areas = value.areas as RoleTemplateSnapshot['areas']
    if (new Set(areas.map(a => a.id)).size !== areas.length || new Set(areas.map(a => a.codigo)).size !== areas.length || areas.some(a => !closedRecord(a, ['id', 'codigo', 'activo'])
      || typeof a.id !== 'string' || typeof a.codigo !== 'string' || typeof a.activo !== 'boolean') || Object.keys(value.compiled).length !== areas.length) return null
    if (Object.keys(draft.extras).some(key => !keys.includes(key))) return null
    const snapshot = value as RoleTemplateSnapshot
    if (canonical(snapshot.compiled) !== canonical(compileHistoricalPermissions(snapshot, draft.role, draft.extras))) return null
    return snapshot
  } catch { return null }
}
function validateRegistryEntitlements(value: unknown, snapshot: RoleTemplateSnapshot, role: ApprovedRoleKey): RegistryEntitlement[] | null {
  if (!Array.isArray(value) || value.length > MAX_AREAS) return null
  const ids = new Set<string>()
  for (const e of value) {
    if (!closedRecord(e, ['id', 'descriptor', 'sectionKey', 'code', 'actions', 'assignmentAuditId']) || Object.keys(e).length !== 6
      || !['id', 'descriptor', 'sectionKey', 'code', 'actions', 'assignmentAuditId'].every(k => typeof e[k] === 'string')
      || ids.has(e.id as string) || !e.assignmentAuditId || !e.descriptor || !/^[VECX]{1,4}$/.test(e.actions as string)
      || ACTIONS.filter(a => (e.actions as string).includes(a)).join('') !== e.actions
      || !(e.actions as string).includes('V') || isArea4OwnerOnlyArea(e.code as string) && role !== 'superadmin'
      || !snapshot.areas.some(a => a.codigo === e.code && a.activo)
      || [...e.actions as string].some(a => !snapshot.compiled[e.code as string]?.includes(a))) return null
    ids.add(e.id as string)
  }
  return value as RegistryEntitlement[]
}
export function personRegistryEntitlements(state: UsersCurrentState, draft: UsersDraft, desired: PermissionMap, matches: readonly Area4SurfaceMatch[] = state.registryMatches ?? area4RegistrySurfaceMatches()): RegistryEntitlement[] {
  if (!draft.active || !state.assignments?.available) return []
  return matches.filter(m => !m.baseline).flatMap(match => {
    const code = match.section.areaCode
    if (!state.areas.some(a => a.codigo === code && a.activo)) return []
    const actions = AREA4_ACTIONS.filter(a => desired[code]?.includes(a.letter) && area4SectionSurfaceAssigned(match, state.assignments!, draft.role, a.capability)).map(a => a.letter).join('')
    if (!actions.includes('V')) return []
    const assignment = state.assignments!.assignments.find(a => a.sectionKey === match.section.key)!
    return [{ id: match.id, descriptor: match.descriptor, sectionKey: match.section.key, code, actions, assignmentAuditId: assignment.auditId }]
  }).sort((a, b) => a.id.localeCompare(b.id))
}
export type Area4ConsentLiveUser = Pick<UsersCurrentUser, 'id' | 'activo' | 'rol' | 'roles' | 'perfilAsignado' | 'permisosArea4Vivos'> & {
  grants: readonly (Area4Grant & { areaId: string })[];
}
export type Area4ConsentDatabase = Pick<PrismaClient, 'usuarioAdmin' | 'permisoArea' | 'auditoriaPermisosArea4'>
/** Minimal live projection for new-surface gates; no name/email/password/NIF/JWT. */
export async function readArea4SurfaceAccessUser(db: Pick<PrismaClient, 'usuarioAdmin'>, id: number): Promise<Area4ConsentLiveUser | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null
  const user = await db.usuarioAdmin.findUnique({ where: { id }, select: {
    id: true, activo: true, rol: true, roles: true, perfilAsignado: true, permisosArea4Vivos: true,
    permisos: { take: MAX_AREAS + 1, orderBy: { areaId: 'asc' }, select: {
      areaId: true, lectura: true, escritura: true, confirmar: true, exportar: true, area: { select: { codigo: true } },
    } },
  } })
  if (!user || user.permisos.length > MAX_AREAS) return null
  const { permisos, ...identity } = user
  return { ...identity, grants: permisos.map(({ area, ...grant }) => ({ ...grant, codigo: area.codigo })) }
}
/**
 * New surfaces require both latest template eligibility and an exact surface
 * entitlement captured by a coherent owner-audited PERSONAL adoption. Existing
 * baseline surfaces return without any added queries. This is an intersection,
 * not a replacement for evaluateArea4Capability / module guards / acting rules.
 */
export async function validateArea4NewSurfaceConsent(
  db: Area4ConsentDatabase, liveUser: Area4ConsentLiveUser, match: Area4SurfaceMatch, capability: Area4Capability,
  ownerId: number | null, assignments?: Area4SectionAssignmentState,
): Promise<boolean> {
  if (match.baseline) return true
  if (!liveUser.activo) return false
  if (ownerId !== null && liveUser.id === ownerId && liveUser.rol === 'SUPER_ADMIN') return true
  if (!ownerId || !liveUser.permisosArea4Vivos || isArea4OwnerOnlyArea(match.section.areaCode)
    || !liveUser.grants.some(g => g.codigo === match.section.areaCode && g[capability] === true && g.lectura === true)) return false
  const [owner, areas] = await Promise.all([
    db.usuarioAdmin.findUnique({ where: { id: ownerId }, select: { id: true, activo: true, rol: true, roles: true } }),
    db.permisoArea.findMany({ take: MAX_AREAS + 1, orderBy: { codigo: 'asc' }, select: { id: true, codigo: true, padre: true, activo: true } }),
  ])
  if (!owner?.activo || owner.rol !== 'SUPER_ADMIN' || areas.length > MAX_AREAS || !areas.some(a => a.codigo === match.section.areaCode && a.activo)) return false
  let event
  try {
    event = await db.auditoriaPermisosArea4.findFirst({
      where: { objetivoUsuarioId: liveUser.id, operacion: 'PERFIL_APLICADO', origen: '/api/admin/usuarios/propuestas' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, actorId: true, createdAt: true, despues: true },
    })
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2021') return false
    throw error
  }
  const user: UsersCurrentUser = { ...liveUser, nombre: '', email: '', ultimoAcceso: null, createdAt: '', updatedAt: '',
    grants: liveUser.grants.map((g, i) => ({ ...g, id: `live-${i}`, createdAt: '', updatedAt: '' })) }
  const ownerUser: UsersCurrentUser = { ...user, ...owner, perfilAsignado: null, permisosArea4Vivos: false, grants: [] }
  const assignment = matchingAuditAssignment(user, event, { users: [ownerUser, user], areas, profiles: [] }, ownerId)
  if (!assignment?.registryEntitlements) return false // Old audits certify baseline only.
  const action = AREA4_ACTIONS.find(a => a.capability === capability)!.letter
  if (!assignment.registryEntitlements.some(e => e.id === match.id && e.descriptor === match.descriptor && e.sectionKey === match.section.key && e.code === match.section.areaCode && e.actions.includes(action))) return false
  const latest = assignments ?? await loadArea4SectionAssignmentState(db, ownerId)
  return area4SectionSurfaceAssigned(match, latest, assignment.role, capability)
}
