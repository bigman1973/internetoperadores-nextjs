import { AREA4_DRAXTON_TECHNICAL_MENU, AREA4_SECTION_REGISTRY, type Area4MenuGroup } from './section-registry'
import type { ApprovedRole, ApprovedRoleKey, PermissionMap, UsersSection } from './users-contract'

export const APPROVED_ROLES_VERSION = 'area4-maqueta-20261125-v1'
export const ROLE_ENUM = {
  superadmin: 'SUPER_ADMIN', gerente: 'GERENTE', contabilidad: 'CONTABILIDAD',
  comercial: 'VENTAS', draxton: 'VISOR', empleado: 'VISOR',
} as const
const codes = [...new Set(AREA4_SECTION_REGISTRY.map(s => s.areaCode))]
const children = (root: string) => codes.filter(c => c === root || c.startsWith(`${root}.`))
const technicalCodes = AREA4_DRAXTON_TECHNICAL_MENU.map(item => AREA4_SECTION_REGISTRY.find(s => s.key === item.section)!.areaCode)
const section = (key: string, label: string, group: Area4MenuGroup, values: string[]): UsersSection => ({ key, label, group, codes: [...new Set(values)] })

/** Human groups are presentation, not an inheritance rule. Eight technical rows remain explicit. */
export const USERS_SECTIONS: UsersSection[] = [
  section('inicio', 'Dashboard', 'Inicio', ['admin']),
  section('estadisticas', 'Estadísticas', 'Inicio', children('admin.estadisticas')),
  section('crm', 'CRM', 'Comercial', children('admin.crm')),
  section('leads', 'Leads', 'Comercial', children('admin.leads')),
  section('comunicados', 'Comunicados', 'Comercial', children('admin.comunicados')),
  section('clientes', 'Clientes', 'Clientes y contratos', ['admin.clientes', ...children('admin.clientes.migracion_adamo'), ...children('admin.proyectos')]),
  section('draxton', 'Grandes cuentas · Draxton', 'Clientes y contratos', children('admin.clientes.ggcc.draxton').filter(c => !technicalCodes.includes(c))),
  section('exagrid', 'Grandes cuentas · Exagrid', 'Clientes y contratos', children('admin.clientes.ggcc.exagrid')),
  section('altas-pendientes', 'Altas pendientes', 'Clientes y contratos', children('admin.altas_pendientes')),
  section('contratos', 'Contratos', 'Clientes y contratos', children('admin.contratos')),
  section('tarifas', 'Tarifas', 'Clientes y contratos', children('admin.tarifas')),
  section('subida-precios', 'Subida de precios', 'Clientes y contratos', children('admin.subida_precios')),
  section('facturacion', 'Facturación', 'Finanzas', ['admin.facturacion', ...children('admin.finanzas.facturas'), ...children('admin.finanzas.facturas_emitidas')]),
  section('finanzas', 'Conciliar y movimientos', 'Finanzas', children('admin.finanzas').filter(c => !/\.(impuestos|presupuesto|facturas|facturas_emitidas|nominas|rentabilidad)(\.|$)/.test(c))),
  section('rentabilidad', 'Rentabilidad', 'Finanzas', children('admin.rentabilidad')),
  section('impuestos', 'Impuestos', 'Finanzas', children('admin.finanzas.impuestos')),
  section('presupuesto', 'Presupuesto', 'Finanzas', children('admin.finanzas.presupuesto')),
  section('aapp', 'AAPP', 'Finanzas', children('admin.aapp')),
  section('personal', 'Personal', 'Personas', children('admin.empleados').filter(c => !/nomina|salari/i.test(c))),
  section('nominas', 'Nóminas', 'Personas', codes.filter(c => /nomina|salari/i.test(c))),
  section('gastos', 'Gastos del trabajador', 'Personas', codes.filter(c => /^empleado\.(?:mis_gastos|gastos)(?:\.|$)/.test(c))),
  section('imputaciones', 'Imputaciones', 'Personas', ['admin.imputaciones', ...codes.filter(c => /^empleado\.imputaciones(?:\.|$)/.test(c))]),
  section('portal-empleado', 'Portal del empleado', 'Personas', ['empleado.portal']),
  section('proyectos-internos', 'Proyectos internos', 'Operación', children('admin.proyectos_internos')),
  section('certificaciones', 'Certificaciones', 'Operación', children('admin.certificaciones')),
  section('peticiones', 'Peticiones', 'Operación', ['admin.peticiones', 'empleado.peticiones']),
  section('usuarios-permisos', 'Usuarios y permisos', 'Administración', [...children('admin.usuarios'), ...children('admin.permisos')]),
  section('auditoria', 'Auditoría', 'Administración', children('admin.auditoria')),
  section('actuar-como', 'Actuar como', 'Administración', children('admin.actuar_como')),
  section('historial', 'Historial', 'Administración', children('admin.historial')),
  section('configuracion', 'Configuración', 'Administración', children('admin.configuracion')),
  section('sistemas', 'Sistemas y servicios', 'Administración', children('admin.sistemas')),
  // The mock omits this current registry group; never silently inherit admin V.
  section('asistente', 'Asistente IA · superficie actual', 'Comercial', children('admin.asistente')),
  ...AREA4_DRAXTON_TECHNICAL_MENU.map(item => section(item.section, item.name, 'Clientes y contratos', [AREA4_SECTION_REGISTRY.find(s => s.key === item.section)!.areaCode])),
]

const none = (): PermissionMap => Object.fromEntries(USERS_SECTIONS.map(s => [s.key, '']))
const pick = (base: PermissionMap, over: PermissionMap): PermissionMap => ({ ...base, ...over })
const all = (value: string): PermissionMap => Object.fromEntries(USERS_SECTIONS.map(s => [s.key, value]))
const role = (key: ApprovedRoleKey, name: string, description: string, permissions: PermissionMap): ApprovedRole => ({ key, name, description, permissions })
export const APPROVED_ROLES: ApprovedRole[] = [
  role('superadmin', 'Superadmin', 'Todo; exclusivamente el propietario canónico configurado.', all('VECX')),
  role('gerente', 'Gerente', 'Negocio sin administración, configuración, rentabilidad ni sistemas; guardias del módulo prevalecen.', pick(all('VECX'), {
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

/** Only current registry codes: prepares a catalogue report, never assigns users or fabricates an area. */
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
  const approved = approvedPeople.find(p => p.names.includes(normalizePersonName(user.name)))
  if (!approved || currentSnapshot.filter(u => approved.names.includes(normalizePersonName(u.name))).length !== 1) return null
  return { role: approved.role, extras: { ...approved.extras } }
}

export function mergeRolePermissions(roleKey: ApprovedRoleKey, extras: PermissionMap): PermissionMap {
  const base = APPROVED_ROLES.find(r => r.key === roleKey)!.permissions
  return Object.fromEntries(USERS_SECTIONS.map(s => [s.key, 'VECX'.split('').filter(a => `${base[s.key] || ''}${extras[s.key] || ''}`.includes(a)).join('')]))
}
/** A full replacement ACL: every actual DB area gets four explicit flags, including denials.
 * Unknown areas stay denied. Dashboard admin V cannot re-open an unmapped area.
 */
export function approvedCodePermissions(roleKey: ApprovedRoleKey, extras: PermissionMap, actualCodes: readonly string[]): PermissionMap {
  const selected = mergeRolePermissions(roleKey, extras)
  const result: PermissionMap = Object.fromEntries(actualCodes.map(c => [c, '']))
  for (const row of USERS_SECTIONS) for (const code of row.codes) if (Object.hasOwn(result, code)) result[code] = selected[row.key]
  // Lorena's Clients V explicitly includes current children, without writing a broad Draxton VE.
  if (extras.clientes) for (const code of actualCodes) if (code === 'admin.clientes' || code.startsWith('admin.clientes.')) {
    result[code] = 'VECX'.split('').filter(a => `${result[code]}${extras.clientes}`.includes(a)).join('')
  }
  // Salary is never obtained by Personal inheritance/extras.
  if (roleKey !== 'superadmin' && roleKey !== 'gerente') for (const code of actualCodes) if (/nomina|salari/i.test(code)) result[code] = ''
  // Employee requests are scoped; operating the administrative queue is not an employee grant.
  if (['empleado', 'draxton', 'comercial', 'contabilidad'].includes(roleKey) && Object.hasOwn(result, 'admin.peticiones')) result['admin.peticiones'] = ''
  return result
}
