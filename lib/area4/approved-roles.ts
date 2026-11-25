import {
  AREA4_ACTIONS, AREA4_DRAXTON_TECHNICAL_MENU, AREA4_REGISTRY_USERS_SECTIONS,
  AREA4_SECTION_REGISTRY, area4CodeIsBaseline, area4UsersRowIsBaseline,
} from './section-registry'
import type { ApprovedRole, ApprovedRoleKey, PermissionMap } from './users-contract'

export const APPROVED_ROLES_VERSION = 'area4-maqueta-20261125-v1'
export const ROLE_ENUM = {
  superadmin: 'SUPER_ADMIN', gerente: 'GERENTE', contabilidad: 'CONTABILIDAD',
  comercial: 'VENTAS', draxton: 'VISOR', empleado: 'VISOR',
} as const
const codes = [...new Set(AREA4_SECTION_REGISTRY.map(section => section.areaCode))]
const letters = AREA4_ACTIONS.map(action => action.letter)
/** Compatibility alias, not an independent label/code/group inventory. */
export const USERS_SECTIONS = AREA4_REGISTRY_USERS_SECTIONS

const none = (): PermissionMap => Object.fromEntries(USERS_SECTIONS.map(section => [section.key, '']))
const pick = (base: PermissionMap, over: PermissionMap): PermissionMap => ({ ...base, ...over })
/** Only explicit source4d03 rows seed ordinary roles. New rows never inherit all(). */
const all = (value: string, owner = false): PermissionMap => Object.fromEntries(USERS_SECTIONS.map(section => [section.key, owner || area4UsersRowIsBaseline(section) ? value : '']))
const role = (key: ApprovedRoleKey, name: string, description: string, permissions: PermissionMap): ApprovedRole => ({ key, name, description, permissions })
export const APPROVED_ROLES: ApprovedRole[] = [
  role('superadmin', 'Superadmin', 'Todo; exclusivamente el propietario canónico configurado.', all(letters.join(''), true)),
  role('gerente', 'Gerente', 'Negocio sin administración, configuración, rentabilidad ni sistemas; guardias del módulo prevalecen.', pick(all(letters.join('')), {
    rentabilidad: '', sistemas: '', 'usuarios-permisos': '', auditoria: '', 'actuar-como': '', configuracion: '',
    historial: 'V', facturacion: 'VX', finanzas: 'VX', impuestos: 'VX', presupuesto: 'VEX', aapp: 'VX',
    nominas: 'VX', personal: 'VX', gastos: 'VEC', 'portal-empleado': 'V',
  })),
  role('contabilidad', 'Contabilidad', 'Facturación, conciliación, impuestos y AAPP; sin nóminas administrativas.', pick(none(), {
    inicio: 'V', facturacion: 'VECX', finanzas: 'VECX', impuestos: 'V', aapp: 'VECX', contratos: 'VX',
    'portal-empleado': 'V', peticiones: 'VE', gastos: 'VE',
  })),
  role('comercial', 'Comercial', 'CRM, clientes, altas y contratos; sin márgenes.', pick(none(), {
    inicio: 'V', crm: 'VECX', leads: 'VECX', comunicados: 'VE', clientes: 'VECX', 'altas-pendientes': 'VEC',
    contratos: 'VE', tarifas: 'V', 'subida-precios': 'V', 'portal-empleado': 'V', peticiones: 'VE', gastos: 'VE',
  })),
  role('draxton', 'Técnico Draxton', 'Solo sus ocho subapartados técnicos, sin permiso padre Clientes/Draxton.', pick(none(), {
    ...Object.fromEntries(AREA4_DRAXTON_TECHNICAL_MENU.map(item => [item.section, 'VE'])),
    'portal-empleado': 'V', peticiones: 'VE', gastos: 'VE', imputaciones: 'VE',
  })),
  role('empleado', 'Empleado', 'Su portal, sus gastos y sus peticiones; sujeto a ámbito propio del servidor.', pick(none(), {
    'portal-empleado': 'V', gastos: 'VE', peticiones: 'VE',
  })),
]

/** Only current registry codes: reports the catalogue; never assigns users or fabricates an area. */
export function missingApprovedRoleCodes(actualCodes: readonly string[]): string[] {
  const existing = new Set(actualCodes)
  return codes.filter(code => !existing.has(code)).sort()
}
export function normalizePersonName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
const approvedPeople: ReadonlyArray<{ names: string[]; role: ApprovedRoleKey; extras: PermissionMap }> = [
  { names: ['david perez'], role: 'gerente', extras: {} },
  { names: ['jordi giro', 'jordi giro marques'], role: 'gerente', extras: {} },
  { names: ['lorena gimeno', 'lorena gimeno martinez'], role: 'contabilidad', extras: { clientes: 'V', personal: 'VEC', imputaciones: 'VEC' } },
  { names: ['jesus parra', 'jesus parra garcia'], role: 'draxton', extras: {} },
  { names: ['alejandro martinez', 'alejandro martinez cayuelas'], role: 'draxton', extras: {} },
  { names: ['patricia parra', 'patricia parra garcia'], role: 'empleado', extras: {} },
]
export function protectedPersonReason(user: { id: number; name: string }, ownerId: number | null): string | undefined {
  if (user.id === ownerId) return 'Propietario canónico: identidad, estado y permisos inmutables.'
  const name = normalizePersonName(user.name)
  if (name === 'tutorial bot' || /^ivan perez(?: |$)/.test(name)) return 'Cuenta excluida por decisión del propietario; no se modifica en ningún estado.'
  return undefined
}
/** Closed name matches plus uniqueness in the live snapshot; never IDs or emails from the mock. */
export function proposedRoleFor(
  user: { id: number; name: string },
  currentSnapshot: readonly { id: number; name: string }[],
  ownerId: number | null = null,
): { role: ApprovedRoleKey; extras: PermissionMap } | null {
  if (protectedPersonReason(user, ownerId)) return null
  const approved = approvedPeople.find(person => person.names.includes(normalizePersonName(user.name)))
  if (!approved || currentSnapshot.filter(person => approved.names.includes(normalizePersonName(person.name))).length !== 1) return null
  return { role: approved.role, extras: { ...approved.extras } }
}

export function mergeRolePermissions(roleKey: ApprovedRoleKey, extras: PermissionMap, templates: readonly ApprovedRole[] = APPROVED_ROLES): PermissionMap {
  const base = templates.find(template => template.key === roleKey)?.permissions || {}
  return Object.fromEntries(USERS_SECTIONS.map(section => [section.key,
    letters.filter(action => `${base[section.key] || ''}${extras[section.key] || ''}`.includes(action)).join('')]))
}
/** Full replacement ACL: every actual area has explicit flags; unknown codes stay denied.
 * Templates may be resolved from exact audited assignments without mutating the seed.
 */
export function approvedCodePermissions(
  roleKey: ApprovedRoleKey,
  extras: PermissionMap,
  actualCodes: readonly string[],
  templates: readonly ApprovedRole[] = APPROVED_ROLES,
): PermissionMap {
  const selected = mergeRolePermissions(roleKey, extras, templates)
  const result: PermissionMap = Object.fromEntries(actualCodes.map(code => [code, '']))
  for (const row of USERS_SECTIONS) for (const code of row.codes) if (Object.hasOwn(result, code)) result[code] = selected[row.key]
  // Lorena's Clients V covers only reviewed current children, never future prefix descendants.
  if (extras.clientes) for (const code of actualCodes) if (area4CodeIsBaseline(code) && (code === 'admin.clientes' || code.startsWith('admin.clientes.'))) {
    result[code] = letters.filter(action => `${result[code]}${extras.clientes}`.includes(action)).join('')
  }
  // Salary is never obtained by Personal inheritance/extras.
  if (roleKey !== 'superadmin' && roleKey !== 'gerente') for (const code of actualCodes) if (/nomina|salari/i.test(code)) result[code] = ''
  // Employee requests are scoped; administrative queue access is not an employee grant.
  if (['empleado', 'draxton', 'comercial', 'contabilidad'].includes(roleKey) && Object.hasOwn(result, 'admin.peticiones')) result['admin.peticiones'] = ''
  return result
}
