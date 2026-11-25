import { createHash } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { appendArea4Audit } from './audit'
import { APPROVED_ROLES, USERS_SECTIONS } from './approved-roles'
import { configuredArea4OwnerId, isArea4OwnerOnlyArea, type Area4Capability } from './policy'
import { AREA4_ACTIONS, area4RegistrySurfaceMatches, area4SectionIsBaseline, type Area4SurfaceMatch } from './section-registry'
import type { ActionLetter, ApprovedRole, ApprovedRoleKey } from './users-contract'
import { usersApplyEnvironment, usersApplyOriginAllowed } from './users-proposals'

export const AREA4_SECTION_ASSIGNMENT_ORIGIN = '/api/admin/usuarios/propuestas'
export const AREA4_SECTION_ASSIGNMENT_OPERATION = 'SECCION_ROLES_ASIGNADOS' as const
export const AREA4_ASSIGNMENT_ROLE_KEYS = ['superadmin', 'gerente', 'contabilidad', 'comercial', 'draxton', 'empleado'] as const
export type SectionRoleSelection = Record<ApprovedRoleKey, string>
export type SectionAssignmentDraft = { sectionKey: string; roles: SectionRoleSelection }
export type SectionAssignmentCommand =
  | { action: 'preview-sections'; drafts: SectionAssignmentDraft[] }
  | { action: 'assign-sections'; drafts: SectionAssignmentDraft[]; confirmed: true; revision: string }
export type SectionAssignmentSurface = { id: string; path: string; kind: 'page' | 'api'; descriptor: string; actions: ActionLetter[] }
export type SectionAssignmentEvidence = {
  sectionKey: string; auditId: string; auditCreatedAt: string; valid: boolean;
  surfaces: SectionAssignmentSurface[]; roles: SectionRoleSelection | null;
}
export type Area4SectionAssignmentState = {
  catalogueRevision: string; baselineRevision: string; revision: string;
  assignments: SectionAssignmentEvidence[]; available: boolean;
}
export type SectionAssignmentPending = {
  sectionKey: string; label: string; group: string; surfaces: SectionAssignmentSurface[];
}
export type Area4RegistrySnapshot = Area4SectionAssignmentState & {
  pending: SectionAssignmentPending[]; assigningAllowed: boolean; warnings: string[];
}
export type SectionAssignmentProposal = {
  revision: string; drafts: SectionAssignmentDraft[];
  rows: (SectionAssignmentPending & { before: SectionRoleSelection | null; roles: SectionRoleSelection })[];
  catalogueRevision: string; baselineRevision: string; assignmentRevision: string;
}
export type RegistryEntitlement = {
  id: string; descriptor: string; sectionKey: string; code: string; actions: string; assignmentAuditId: string;
}
export type SectionAssignmentReadDatabase = Pick<PrismaClient, 'auditoriaPermisosArea4'>
export type SectionAssignmentDatabase = SectionAssignmentReadDatabase & Pick<PrismaClient, 'usuarioAdmin' | '$transaction'>
export class SectionAssignmentError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message) }
}
const invalid = () => new SectionAssignmentError('INVALID_SECTION_DRAFT', 400, 'Selección de apartados no válida.')
export function area4CanonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) return `[${value.map(area4CanonicalJson).join(',')}]`
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${area4CanonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`
}
export const area4Digest = (value: unknown) => createHash('sha256').update(area4CanonicalJson(value)).digest('hex')
function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return (proto === Object.prototype || proto === null) && Object.keys(value).every(key => keys.includes(key))
}
const letters = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[VECX]{0,4}$/.test(value) || new Set(value).size !== value.length || (/[ECX]/.test(value) && !value.includes('V'))) throw invalid()
  return AREA4_ACTIONS.filter(a => value.includes(a.letter)).map(a => a.letter).join('')
}
export function normalizeSectionAssignmentDrafts(value: unknown): SectionAssignmentDraft[] {
  if (!Array.isArray(value) || !value.length || value.length > 256) throw invalid()
  const seen = new Set<string>()
  return value.map(item => {
    if (!record(item, ['sectionKey', 'roles']) || Object.keys(item).length !== 2 || typeof item.sectionKey !== 'string'
      || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(item.sectionKey) || seen.has(item.sectionKey)
      || !record(item.roles, AREA4_ASSIGNMENT_ROLE_KEYS) || Object.keys(item.roles).length !== 6) throw invalid()
    seen.add(item.sectionKey)
    const roles = Object.fromEntries(AREA4_ASSIGNMENT_ROLE_KEYS.map(key => [key, letters(item.roles[key])])) as SectionRoleSelection
    return { sectionKey: item.sectionKey, roles }
  }).sort((a, b) => a.sectionKey.localeCompare(b.sectionKey))
}
export function parseSectionAssignmentCommand(value: unknown): SectionAssignmentCommand {
  if (!record(value, ['action', 'drafts', 'confirmed', 'revision'])) throw invalid()
  if (value.action === 'preview-sections' && Object.keys(value).length === 2) return { action: 'preview-sections', drafts: normalizeSectionAssignmentDrafts(value.drafts) }
  if (value.action === 'assign-sections' && Object.keys(value).length === 4 && value.confirmed === true && typeof value.revision === 'string' && /^[a-f0-9]{64}$/.test(value.revision)) {
    return { action: 'assign-sections', confirmed: true, revision: value.revision, drafts: normalizeSectionAssignmentDrafts(value.drafts) }
  }
  throw invalid()
}
export function sectionAssignmentEnvironment(env: Record<string, string | undefined> = process.env) {
  const base = usersApplyEnvironment({ ...env, AREA4_STAGING_USER_APPLY: '1' })
  return { allowed: base.allowed && env.AREA4_STAGING_SECTION_ASSIGN === '1', reason: base.allowed
    ? 'Asignar plantillas requiere autorización explícita AREA4_STAGING_SECTION_ASSIGN=1; no modifica cuentas.' : base.reason }
}
export function area4AssignmentSurface(match: Area4SurfaceMatch): SectionAssignmentSurface {
  return { id: match.id, path: match.surface.path, kind: match.surface.kind, descriptor: match.descriptor,
    actions: [...(match.surface.actions ?? AREA4_ACTIONS.map(a => a.letter))] }
}
function newSections(matches: readonly Area4SurfaceMatch[]) {
  const keys = [...new Set(matches.filter(m => !m.baseline).map(m => m.section.key))].sort()
  if (keys.length > 256 || matches.length > 2000) throw new SectionAssignmentError('REGISTRY_LIMIT', 503, 'El registro requiere revisión paginada.')
  return keys
}
export function emptyArea4SectionAssignmentState(matches: readonly Area4SurfaceMatch[] = area4RegistrySurfaceMatches()): Area4SectionAssignmentState {
  const catalogueRevision = area4Digest(matches.map(m => [m.id, m.descriptor, m.baseline]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
  const baselineRevision = area4Digest(matches.filter(m => m.baseline).map(m => [m.id, m.descriptor]).sort((a, b) => a[0].localeCompare(b[0])))
  return { catalogueRevision, baselineRevision, revision: area4Digest({ catalogueRevision, baselineRevision, assignments: [], available: true }), assignments: [], available: true }
}
function validatedEvidence(sectionKey: string, event: { id: string; actorId: number; createdAt: Date; despues: unknown }, ownerId: number | null): SectionAssignmentEvidence {
  const result: SectionAssignmentEvidence = { sectionKey, auditId: event.id, auditCreatedAt: event.createdAt.toISOString(), valid: false, surfaces: [], roles: null }
  try {
    const after = event.despues
    if (!ownerId || event.actorId !== ownerId || !record(after, ['version', 'sectionKey', 'surfaces', 'roles', 'revision', 'catalogueRevision', 'baselineRevision', 'ownerId', 'confirmed'])
      || Object.keys(after).length !== 9 || after.version !== 1 || after.confirmed !== true || after.ownerId !== ownerId || after.sectionKey !== sectionKey
      || !['revision', 'catalogueRevision', 'baselineRevision'].every(key => typeof after[key] === 'string' && /^[a-f0-9]{64}$/.test(after[key] as string))
      || !Array.isArray(after.surfaces) || !after.surfaces.length || after.surfaces.length > 2000) return result
    const roles = normalizeSectionAssignmentDrafts([{ sectionKey, roles: after.roles }])[0].roles
    const surfaces: SectionAssignmentSurface[] = []
    for (const s of after.surfaces) {
      if (!record(s, ['id', 'path', 'kind', 'descriptor', 'actions']) || Object.keys(s).length !== 5 || typeof s.id !== 'string' || typeof s.path !== 'string'
        || !['page', 'api'].includes(s.kind as string) || s.id !== `${s.kind}:${s.path}` || typeof s.descriptor !== 'string' || s.descriptor.length > 16384
        || !Array.isArray(s.actions) || !s.actions.length || s.actions.some(a => !['V', 'E', 'C', 'X'].includes(a)) || new Set(s.actions).size !== s.actions.length) return result
      surfaces.push(s as SectionAssignmentSurface)
    }
    if (new Set(surfaces.map(s => s.id)).size !== surfaces.length) return result
    return { ...result, valid: true, roles, surfaces }
  } catch { return result }
}
/** Read only. Exactly one latest record per nonbaseline section, never search backwards for a valid grant. */
export async function loadArea4SectionAssignmentState(
  db: SectionAssignmentReadDatabase, ownerId: number | null, matches: readonly Area4SurfaceMatch[] = area4RegistrySurfaceMatches(),
): Promise<Area4SectionAssignmentState> {
  const state = emptyArea4SectionAssignmentState(matches)
  const keys = newSections(matches)
  if (!keys.length) return state // Historical-only registry: ZERO additional audit reads.
  const assignments: SectionAssignmentEvidence[] = []
  try {
    for (let start = 0; start < keys.length; start += 8) {
      const batch = await Promise.all(keys.slice(start, start + 8).map(async sectionKey => {
        const event = await db.auditoriaPermisosArea4.findFirst({
          where: { operacion: AREA4_SECTION_ASSIGNMENT_OPERATION, origen: AREA4_SECTION_ASSIGNMENT_ORIGIN, areaCodigo: `section:${sectionKey}` },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, actorId: true, createdAt: true, despues: true },
        })
        return event ? validatedEvidence(sectionKey, event, ownerId) : null
      }))
      assignments.push(...batch.filter((e): e is SectionAssignmentEvidence => e !== null))
    }
  } catch (error) {
    if ((error as { code?: string })?.code !== 'P2021') throw error
    return { ...state, available: false, revision: area4Digest({ ...state, available: false }) }
  }
  return { ...state, assignments, revision: area4Digest({ catalogueRevision: state.catalogueRevision, baselineRevision: state.baselineRevision, assignments, available: true }) }
}
/** Template eligibility only; caller MUST intersect live exact ACL and personal adoption. */
export function area4SectionSurfaceAssigned(match: Area4SurfaceMatch, state: Area4SectionAssignmentState, role: ApprovedRoleKey, capability?: Area4Capability): boolean {
  if (match.baseline) return true
  if (!state.available || (isArea4OwnerOnlyArea(match.section.areaCode) && role !== 'superadmin')) return false
  const e = state.assignments.find(a => a.sectionKey === match.section.key)
  const action = capability ? AREA4_ACTIONS.find(a => a.capability === capability)?.letter : 'V'
  const surface = e?.surfaces.find(s => s.id === match.id && s.descriptor === match.descriptor)
  return Boolean(e?.valid && surface && action && surface.actions.includes(action) && e.roles?.[role]?.includes(action))
}
export function resolveArea4RoleTemplates(state?: Area4SectionAssignmentState, matches: readonly Area4SurfaceMatch[] = area4RegistrySurfaceMatches()): ApprovedRole[] {
  return APPROVED_ROLES.map(role => {
    const permissions = { ...role.permissions }
    if (state?.available) for (const match of matches.filter(m => !m.baseline)) {
      const e = state.assignments.find(a => a.sectionKey === match.section.key)
      if (!e?.valid || !e.roles || !e.surfaces.some(s => s.id === match.id && s.descriptor === match.descriptor) || (role.key !== 'superadmin' && isArea4OwnerOnlyArea(match.section.areaCode))) continue
      // Old grouped rows keep baseline rights. New rows receive only explicit assignments.
      const row = USERS_SECTIONS.find(s => s.key === match.section.key)?.key ?? (area4SectionIsBaseline(match.section)
        ? match.section.usersRowKey ?? USERS_SECTIONS.find(s => s.codes.includes(match.section.areaCode))?.key : undefined)
      if (row) permissions[row] = AREA4_ACTIONS.filter(a => `${permissions[row] || ''}${e.roles[role.key]}`.includes(a.letter)).map(a => a.letter).join('')
    }
    return { ...role, permissions }
  })
}
export function buildArea4RegistrySnapshot(state: Area4SectionAssignmentState, env: Record<string, string | undefined> = process.env, matches: readonly Area4SurfaceMatch[] = area4RegistrySurfaceMatches()): Area4RegistrySnapshot {
  const pending = newSections(matches).flatMap(sectionKey => {
    const surfaces = matches.filter(m => m.section.key === sectionKey && !m.baseline)
    const e = state.assignments.find(a => a.sectionKey === sectionKey)
    const unreviewed = surfaces.filter(m => !e?.valid || !e.surfaces.some(s => s.id === m.id && s.descriptor === m.descriptor))
    return unreviewed.length ? [{ sectionKey, label: surfaces[0].section.label, group: surfaces[0].section.group, surfaces: unreviewed.map(area4AssignmentSurface) }] : []
  })
  return { ...state, pending, assigningAllowed: state.available && sectionAssignmentEnvironment(env).allowed,
    warnings: ['Asignar una plantilla no adopta cuentas ni concede acceso personal. La ACL viva y las guardias del módulo prevalecen.', ...(!state.available ? ['Auditoría no disponible: las superficies nuevas quedan cerradas.'] : [])] }
}
async function readOwner(db: Pick<PrismaClient, 'usuarioAdmin'>, ownerId: number) {
  return db.usuarioAdmin.findUnique({ where: { id: ownerId }, select: { id: true, activo: true, rol: true, roles: true, perfilAsignado: true, updatedAt: true } })
}
function assertOwner(owner: Awaited<ReturnType<typeof readOwner>>, ownerId: number) {
  if (!owner?.activo || owner.id !== ownerId || owner.rol !== 'SUPER_ADMIN') throw new SectionAssignmentError('OWNER_REQUIRED', 403, 'Solo el propietario canónico vivo puede asignar.')
}
export function buildSectionAssignmentProposal(state: Area4SectionAssignmentState, drafts: SectionAssignmentDraft[], owner: unknown, ownerId: number, matches: readonly Area4SurfaceMatch[] = area4RegistrySurfaceMatches()): SectionAssignmentProposal {
  const normalized = normalizeSectionAssignmentDrafts(drafts)
  if (!state.available) throw new SectionAssignmentError('ASSIGNMENT_UNAVAILABLE', 503, 'No se puede confirmar sin auditoría disponible.')
  const rows = normalized.map(d => {
    const surfaces = matches.filter(m => m.section.key === d.sectionKey && !m.baseline)
    if (!surfaces.length) throw invalid()
    if (surfaces.some(m => isArea4OwnerOnlyArea(m.section.areaCode)) && AREA4_ASSIGNMENT_ROLE_KEYS.some(r => r !== 'superadmin' && d.roles[r])) throw new SectionAssignmentError('OWNER_ONLY_SECTION', 409, 'Un ámbito exclusivo del propietario no se puede delegar.')
    const supported = new Set(surfaces.flatMap(m => area4AssignmentSurface(m).actions))
    if (Object.values(d.roles).some(value => [...value].some(a => !supported.has(a as ActionLetter)))) throw invalid()
    const e = state.assignments.find(a => a.sectionKey === d.sectionKey)
    return { sectionKey: d.sectionKey, label: surfaces[0].section.label, group: surfaces[0].section.group, surfaces: surfaces.map(area4AssignmentSurface), before: e?.valid ? e.roles : null, roles: d.roles }
  })
  return { revision: area4Digest({ version: 1, ownerId, owner, state, drafts: normalized, catalogue: matches.map(m => [m.id, m.descriptor, m.baseline]) }),
    drafts: normalized, rows, catalogueRevision: state.catalogueRevision, baselineRevision: state.baselineRevision, assignmentRevision: state.revision }
}
export async function previewArea4SectionAssignments(db: SectionAssignmentDatabase, ownerId: number, drafts: SectionAssignmentDraft[], env: Record<string, string | undefined> = process.env, matches: readonly Area4SurfaceMatch[] = area4RegistrySurfaceMatches()): Promise<SectionAssignmentProposal> {
  if (configuredArea4OwnerId(env) !== ownerId) throw new SectionAssignmentError('OWNER_REQUIRED', 403, 'Propietario no autorizado.')
  return db.$transaction(async tx => {
    const owner = await readOwner(tx, ownerId); assertOwner(owner, ownerId)
    return buildSectionAssignmentProposal(await loadArea4SectionAssignmentState(tx, ownerId, matches), drafts, owner, ownerId, matches)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
}
export async function applyArea4SectionAssignments(db: SectionAssignmentDatabase, input: { actorId: number; ownerId: number; origin: string; confirmed: boolean; revision: string; drafts: SectionAssignmentDraft[] }, env: Record<string, string | undefined> = process.env, matches: readonly Area4SurfaceMatch[] = area4RegistrySurfaceMatches()): Promise<Area4RegistrySnapshot> {
  if (input.confirmed !== true || !/^[a-f0-9]{64}$/.test(input.revision)) throw invalid()
  if (!sectionAssignmentEnvironment(env).allowed) throw new SectionAssignmentError('SECTION_ASSIGN_NOT_AUTHORIZED', 409, sectionAssignmentEnvironment(env).reason)
  if (!usersApplyOriginAllowed(input.origin, env)) throw new SectionAssignmentError('STAGING_ORIGIN_REQUIRED', 403, 'Se requiere un origen staging autorizado.')
  if (input.actorId !== input.ownerId || configuredArea4OwnerId(env) !== input.ownerId) throw new SectionAssignmentError('OWNER_REQUIRED', 403, 'Solo el propietario real puede asignar.')
  const drafts = normalizeSectionAssignmentDrafts(input.drafts)
  try {
    return await db.$transaction(async tx => {
      const owner = await readOwner(tx, input.ownerId); assertOwner(owner, input.ownerId)
      const state = await loadArea4SectionAssignmentState(tx, input.ownerId, matches)
      const proposal = buildSectionAssignmentProposal(state, drafts, owner, input.ownerId, matches)
      if (proposal.revision !== input.revision) throw new SectionAssignmentError('STALE_REVISION', 409, 'El estado cambió; previsualiza y confirma de nuevo.')
      for (const row of proposal.rows) await appendArea4Audit(tx, {
        actorId: input.actorId, operacion: AREA4_SECTION_ASSIGNMENT_OPERATION, areaCodigo: `section:${row.sectionKey}`, origen: AREA4_SECTION_ASSIGNMENT_ORIGIN,
        antes: (state.assignments.find(a => a.sectionKey === row.sectionKey) ?? null) as Prisma.InputJsonValue | null,
        despues: { version: 1, sectionKey: row.sectionKey, surfaces: row.surfaces, roles: row.roles, confirmed: true, ownerId: input.ownerId,
          revision: proposal.revision, catalogueRevision: state.catalogueRevision, baselineRevision: state.baselineRevision },
      })
      return buildArea4RegistrySnapshot(await loadArea4SectionAssignmentState(tx, input.ownerId, matches), env, matches)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 30000 })
  } catch (error) {
    if (error instanceof SectionAssignmentError) throw error
    if ((error as { code?: string })?.code === 'P2034') throw new SectionAssignmentError('STALE_REVISION', 409, 'Conflicto concurrente; no se ha reintentado la escritura.')
    throw new SectionAssignmentError('SECTION_ASSIGN_FAILED', 500, 'No se pudo asignar; transacción revertida sin cambios parciales.')
  }
}
