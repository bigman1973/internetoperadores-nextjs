/** Política de actuación: el destino conserva sus permisos de servidor vivos.
 * La actuación sólo añade restricciones sensibles y una fase explícita de
 * mutaciones manuales auditadas; nunca concede permisos del actor real. */
export const IMPERSONATION_MAX_SECONDS = 60 * 60
export const IMPERSONATION_CONTEXT_HEADER = 'x-io-impersonation-context'
export const IMPERSONATION_EXPECTED_SESSION_HEADER = 'x-io-acting-session'
export const IMPERSONATION_CONTEXT_VERSION = 'v1'
export const IMPERSONATION_IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,128}$/
export const IMPERSONATION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type AdminIdentity = Readonly<{
  id: number
  activo: boolean
  rol: string
  roles?: readonly string[] | null
}>

export type StartDecision =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: 'ACTOR_INVALID' | 'ACTOR_NOT_SUPER_ADMIN' | 'TARGET_INVALID' | 'TARGET_SELF' | 'TARGET_SUPER_ADMIN' | 'NESTED_IMPERSONATION' }>

function normalizedRoles(roles: readonly string[] | null | undefined): string[] {
  return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === 'string') : []
}

/** A secondary SUPER_ADMIN is still a super-admin target and is never admissible. */
export function hasSuperAdminRole(identity: Pick<AdminIdentity, 'rol' | 'roles'>): boolean {
  return identity.rol === 'SUPER_ADMIN' || normalizedRoles(identity.roles).includes('SUPER_ADMIN')
}

/** Only a current primary SUPER_ADMIN may originate a real acting session. */
export function canStartImpersonation(actor: AdminIdentity, target: AdminIdentity, alreadyImpersonating: boolean): StartDecision {
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0 || !actor.activo) return { ok: false, code: 'ACTOR_INVALID' }
  if (actor.rol !== 'SUPER_ADMIN') return { ok: false, code: 'ACTOR_NOT_SUPER_ADMIN' }
  if (!Number.isSafeInteger(target.id) || target.id <= 0 || !target.activo) return { ok: false, code: 'TARGET_INVALID' }
  if (alreadyImpersonating) return { ok: false, code: 'NESTED_IMPERSONATION' }
  if (target.id === actor.id) return { ok: false, code: 'TARGET_SELF' }
  if (hasSuperAdminRole(target)) return { ok: false, code: 'TARGET_SUPER_ADMIN' }
  return { ok: true }
}

export type LiveSessionDecision =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: 'SESSION_NOT_FOUND' | 'SESSION_CLOSED' | 'SESSION_EXPIRED' | 'ACTOR_REVOKED' | 'TARGET_REVOKED' | 'TARGET_SUPER_ADMIN' | 'SOURCE_SESSION_MISMATCH' | 'RUNTIME_DISABLED' }>

/**
 * Pure last line of defence shared by the database adapters. Target roles and
 * the MODO_FACIL_ONLY profile are deliberately not token authority: callers
 * pass freshly read rows only.
 */
export function evaluateLiveImpersonation(input: Readonly<{
  sessionFound: boolean
  closed: boolean
  expiresAt: Date
  now: Date
  actor: AdminIdentity | null
  target: AdminIdentity | null
  sourceSessionMatches: boolean
  runtimeEnabled: boolean
}>): LiveSessionDecision {
  if (!input.runtimeEnabled) return { ok: false, code: 'RUNTIME_DISABLED' }
  if (!input.sessionFound) return { ok: false, code: 'SESSION_NOT_FOUND' }
  if (input.closed) return { ok: false, code: 'SESSION_CLOSED' }
  if (!(input.expiresAt instanceof Date) || input.expiresAt.getTime() <= input.now.getTime()) return { ok: false, code: 'SESSION_EXPIRED' }
  if (!input.sourceSessionMatches) return { ok: false, code: 'SOURCE_SESSION_MISMATCH' }
  if (!input.actor?.activo || input.actor.rol !== 'SUPER_ADMIN') return { ok: false, code: 'ACTOR_REVOKED' }
  if (!input.target?.activo) return { ok: false, code: 'TARGET_REVOKED' }
  if (hasSuperAdminRole(input.target)) return { ok: false, code: 'TARGET_SUPER_ADMIN' }
  return { ok: true }
}

export function isSafeMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

export type ImpersonationBodyAction = string | '__multipart__' | null
export type TargetPermissionKind = 'lectura' | 'escritura'

export type TargetPermissionRequirement = Readonly<{
  /** Existing permiso_area codes. A rule is an OR unless allAreas is true. */
  areas: readonly string[]
  required: TargetPermissionKind
  allAreas?: boolean
  /** Mirrors the existing finance middleware's target-side CONTABILIDAD bridge. */
  allowLegacyFinanceRole?: boolean
}>

export type ImpersonationRouteDecision =
  | Readonly<{ allowed: false }>
  | Readonly<{
    allowed: true
    purpose: string
    /** The route itself derives every identity from the effective target session. */
    targetOnly: true
    permission?: TargetPermissionRequirement
  }>

type RouteMatcher = string | RegExp
type MatrixRule = Readonly<{
  id: string
  purpose: string
  path: RouteMatcher
  methods: readonly string[]
  targetOnly: true
  permission?: TargetPermissionRequirement
}>

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const
const B4 = 'admin.finanzas.conciliacion'
const B2 = 'admin.finanzas.facturas'
const B3 = 'admin.finanzas.importar'
const B5 = 'admin.finanzas.movimientos'
const B7 = 'admin.facturacion'
const B8 = 'admin.finanzas.analitica_costes'

function financeRead(id: string, path: RouteMatcher, areas: readonly string[], purpose = id, allAreas = false): MatrixRule {
  return {
    id,
    purpose,
    path,
    methods: SAFE_METHODS,
    targetOnly: true,
    permission: { areas, required: 'lectura', ...(allAreas ? { allAreas: true } : {}), allowLegacyFinanceRole: true },
  }
}

/**
 * Positive matrix for every business surface admitted while an acting cookie is
 * active. There are deliberately no prefixes: an added legacy route cannot
 * inherit an allow merely because it lives below /api/admin/finanzas.
 *
 * The listed financial APIs are read-only at this boundary. POST is separately
 * limited to MANUAL_BODY_ACTIONS below and must satisfy the same live target
 * area check. Payroll, users, contracts, CRM, configuration, aapp, sync,
 * imports-with-effects and all other unreviewed modules are absent by design.
 */
export const IMPERSONATION_ROUTE_MATRIX: readonly MatrixRule[] = [
  // Target-only employee views. These handlers use resolveEmpleado() from the
  // effective session and do not accept an acting-time `as` selector.
  { id: 'employee-home', purpose: 'employee.self.home', path: '/empleado', methods: SAFE_METHODS, targetOnly: true },
  { id: 'employee-timesheet-page', purpose: 'employee.self.timesheet', path: '/empleado/imputaciones', methods: SAFE_METHODS, targetOnly: true },
  { id: 'employee-alerts', purpose: 'employee.self.alerts', path: '/api/empleado/alertas', methods: SAFE_METHODS, targetOnly: true },
  { id: 'employee-timesheet', purpose: 'employee.self.timesheet', path: '/api/empleado/imputaciones', methods: SAFE_METHODS, targetOnly: true },

  // Pages mapped to their existing financial areas.
  financeRead('finance-home-page', '/admin/finanzas', ['admin.finanzas']),
  financeRead('finance-analytics-page', '/admin/finanzas/analitica-costes', [B8]),
  financeRead('finance-operator-costs-page', '/admin/finanzas/analitica-costes/costes-operadora', [B8]),
  financeRead('finance-client-analytics-page', '/admin/finanzas/analitica-cliente', [B4]),
  financeRead('finance-ggcc-page', '/admin/finanzas/clientes/ggcc-draxton', ['admin.finanzas.ggcc_draxton']),
  financeRead('finance-pending-collections-page', '/admin/finanzas/cobros-pendientes', ['admin.finanzas.cobros_pendientes']),
  financeRead('finance-reconciliation-page', '/admin/finanzas/conciliacion', [B4]),
  financeRead('finance-manual-reconciliation-page', '/admin/finanzas/conciliacion/manual', [B4]),
  financeRead('finance-remittances-page', '/admin/finanzas/conciliacion-remesas', ['admin.finanzas.conciliacion_remesas']),
  financeRead('finance-reconciliation-v2-page', '/admin/finanzas/conciliacion-v2', [B4]),
  financeRead('finance-operator-costs-legacy-page', '/admin/finanzas/costes-operadora', [B8]),
  financeRead('finance-tax-data-page', /^\/admin\/finanzas\/datos-fiscales(?:\/[A-Za-z0-9_-]{1,100}\/mayor)?$/, ['admin.finanzas.datos_fiscales']),
  financeRead('finance-statement-page', '/admin/finanzas/estado-cuentas', [B3]),
  financeRead('finance-a3-page', '/admin/finanzas/exportar-a3', ['admin.finanzas.exportar_a3']),
  financeRead('finance-invoices-page', /^\/admin\/finanzas\/facturas(?:\/[A-Za-z0-9_-]{1,100})?$/, [B2]),
  financeRead('finance-issued-invoices-page', '/admin/finanzas/facturas-emitidas', ['admin.finanzas.facturas_emitidas']),
  financeRead('finance-import-page', '/admin/finanzas/importar', [B3]),
  financeRead('finance-easy-page', '/admin/finanzas/modo-facil', [B4]),
  financeRead('finance-request-page', '/admin/finanzas/para-pedir', [B4]),
  financeRead('finance-movements-page', '/admin/finanzas/movimientos', [B5]),
  financeRead('finance-pending-page', '/admin/finanzas/pendientes', [B4]),
  financeRead('finance-allocation-page', '/admin/finanzas/reparto-clientes', [B8]),

  // APIs mapped one-by-one to the same pre-existing financial area catalog.
  financeRead('finance-dashboard-api', '/api/admin/finanzas/dashboard', ['admin.finanzas']),
  financeRead('finance-analytics-api', '/api/admin/finanzas/analitica-costes', [B8]),
  financeRead('finance-operator-costs-api', /^\/api\/admin\/finanzas\/costes-operadora(?:\/(?:[A-Za-z0-9_-]{1,100}\/pdf|pendientes(?:\/[A-Za-z0-9_-]{1,100}\/pdf)?))?$/, [B8]),
  financeRead('finance-allocation-api', '/api/admin/finanzas/reparto-clientes', [B8]),
  financeRead('finance-profitability-api', /^\/api\/admin\/finanzas\/rentabilidad(?:\/(?:lineas|proveedores|servicios))?$/, [B8]),
  financeRead('finance-ggcc-api', /^\/api\/admin\/finanzas\/clientes\/ggcc-draxton(?:\/(?:confirming-lineas|informe-confirming))?$/, ['admin.finanzas.ggcc_draxton']),
  financeRead('finance-pending-collections-api', '/api/admin/finanzas/cobros-pendientes', ['admin.finanzas.cobros_pendientes']),
  financeRead('finance-reconciliation-api', /^\/api\/admin\/finanzas\/conciliacion(?:\/(?:manual|sugerencias))?$/, [B4]),
  financeRead('finance-reconciliation-proposals-api', '/api/admin/finanzas/conciliacion-propuestas', [B4]),
  financeRead('finance-reconciliation-v2-api', /^\/api\/admin\/finanzas\/conciliacion-v2(?:\/heredados-(?:bloque|excluidas|recibos))?$/, [B4]),
  financeRead('finance-remittances-api', /^\/api\/admin\/finanzas\/conciliacion-remesas(?:\/(?:detalle-remesa|marcar-cobradas))?$/, ['admin.finanzas.conciliacion_remesas']),
  financeRead('finance-accounts-api', '/api/admin/finanzas/cuentas', [B5, B4]),
  financeRead('finance-tax-data-api', /^\/api\/admin\/finanzas\/datos-fiscales(?:\/[A-Za-z0-9_-]{1,100}(?:\/mayor)?)?$/, ['admin.finanzas.datos_fiscales']),
  financeRead('finance-statement-api', '/api/admin/finanzas/estado-cuentas', [B3]),
  financeRead('finance-cutoffs-api', '/api/admin/finanzas/cortes-cobertura', [B3, B4, B7], 'finance.cutoffs.read', true),
  financeRead('finance-a3-api', '/api/admin/finanzas/exportar-a3', ['admin.finanzas.exportar_a3']),
  financeRead('finance-invoices-api', /^\/api\/admin\/finanzas\/facturas(?:\/(?:estimacion|proveedores|calidad(?:\/[A-Za-z0-9_-]{1,100}(?:\/pdf)?)?|[A-Za-z0-9_-]{1,100}(?:\/(?:comentarios|movimientos-candidatos|ocr|pdf))?))?$/, [B2]),
  financeRead('finance-issued-invoices-api', '/api/admin/finanzas/facturas-emitidas', ['admin.finanzas.facturas_emitidas']),
  financeRead('finance-import-api', '/api/admin/finanzas/importar-movimientos', [B3]),
  financeRead('finance-imputation-api', '/api/admin/finanzas/imputacion', [B2]),
  financeRead('finance-movements-api', /^\/api\/admin\/finanzas\/movimientos(?:\/[A-Za-z0-9_-]{1,100}(?:\/archivos)?)?$/, [B5]),
  financeRead('finance-cost-centres-api', /^\/api\/admin\/finanzas\/centros-coste(?:\/asignar)?$/, [B4]),
  financeRead('finance-pending-api', /^\/api\/admin\/finanzas\/pendientes(?:\/documento)?$/, [B4]),
  financeRead('finance-b6-api', '/api/admin/finanzas/remesas/b6', [B4]),
  financeRead('finance-easy-api', '/api/admin/finanzas/modo-facil', [B4]),
  financeRead('finance-easy-profile-api', '/api/admin/finanzas/modo-facil/perfil', [B4]),
  financeRead('finance-easy-cards-api', '/api/admin/finanzas/modo-facil/tarjetas', [B4]),
  financeRead('finance-easy-request-api', '/api/admin/finanzas/modo-facil/para-pedir', [B4]),
  financeRead('finance-easy-file-api', /^\/api\/admin\/finanzas\/modo-facil\/documentos\/[A-Za-z0-9_-]{1,100}\/archivo$/, [B4]),
  financeRead('finance-easy-third-parties-api', '/api/admin/finanzas/modo-facil/terceros', [B4]),
  financeRead('finance-easy-third-parties-batch-api', '/api/admin/finanzas/modo-facil/terceros/bloque', [B4]),
]

/**
 * These are the only delegated writes in phase 1. Every other write is denied
 * before a handler runs, even if the effective target ordinarily has a server
 * permission. Adding a write requires its own reviewed transaction/audit path.
 */
const MANUAL_BODY_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  '/api/admin/finanzas/modo-facil': ['confirmar_factura', 'no_requiere'],
  '/api/admin/finanzas/modo-facil/deshacer': ['deshacer'],
  '/api/admin/finanzas/modo-facil/reglas': ['crear', 'desactivar'],
  '/api/admin/finanzas/modo-facil/terceros': ['confirmar', 'revertir'],
  '/api/admin/finanzas/modo-facil/terceros/bloque': ['aceptar_seleccionados', 'deshacer_lote'],
}

function controlEndpointAllowed(path: string, method: string, action: ImpersonationBodyAction): boolean {
  if (path !== '/api/admin/actuar-como') return false
  // `iniciar` reaches only the endpoint's exact lost-response replay branch;
  // the endpoint/ledger still require the embedded target and same key.
  return isSafeMethod(method) || (method === 'POST' && (action === 'salir' || action === 'iniciar'))
}

/** Authentication is not a blanket exemption: magic links/mail and arbitrary
 * auth-adjacent endpoints remain denied while acting. A fresh sign-in replaces
 * the acting ledger before its callback can issue a different account cookie. */
export function isLoginReplacementPath(path: string): boolean {
  return /^\/api\/auth\/(?:signin|callback)(?:\/|$)/.test(path)
}

function nextAuthAllowedDuringImpersonation(path: string, method: string): boolean {
  if (!path.startsWith('/api/auth/')) return false
  if (isLoginReplacementPath(path)) return method === 'GET' || method === 'POST'
  if (path === '/api/auth/signout') return method === 'POST'
  if (['/api/auth/session', '/api/auth/csrf', '/api/auth/providers'].includes(path)) return isSafeMethod(method)
  return false
}

/**
 * Sensitive routes cannot be entered as another person, including GET routes
 * which can have hidden effects. This is path based on purpose, not on a
 * client-provided role or actor id. It is intentionally a second deny fence;
 * absence from the positive matrix remains the primary default.
 */
export function isSensitiveImpersonationPath(path: string): boolean {
  const lowered = path.toLowerCase()
  if (lowered === '/api/admin/actuar-como/registro' || lowered === '/admin/actuar-como') return true
  if (lowered.startsWith('/api/cron/') || lowered.includes('/cron/')) return true
  // Employee payroll has an explicit target-only matrix entry. Administrative
  // payroll remains a sensitive, unreviewed surface and cannot inherit it.
  if (lowered.startsWith('/api/admin/nominas') || lowered.startsWith('/admin/nominas')) return true

  const segments = lowered.split('/').filter(Boolean)
  return segments.some(segment =>
    /^(?:usuarios?|roles?|permisos?|password|contrasen(?:a|as)|2fa|mfa|identidad|identities|email|emails|correo|mail|comunicados?|comunicaciones?|chat|notific(?:acion|aciones)|enviar|send|sync(?:hronize)?(?:[-_].*)?|sincroniz(?:ar|acion|aciones)?|import(?:ar|acion|aciones)?|graph|outlook|azure|integraciones?|config(?:uracion)?|deploy(?:ment)?|vercel|publicar|publish|aapp)$/.test(segment),
  )
}

function ownPermissionReadAllowed(path: string, method: string, search: URLSearchParams, userId?: number): boolean {
  return path === '/api/admin/permisos'
    && isSafeMethod(method)
    && Number.isSafeInteger(userId)
    && userId! > 0
    && search.get('action') === 'usuario'
    && search.get('usuarioId') === String(userId)
    && [...search.keys()].every(key => key === 'action' || key === 'usuarioId')
}

function manualMutationAllowed(path: string, method: string, action: ImpersonationBodyAction): boolean {
  if (path === '/api/admin/finanzas/modo-facil/foto') return method === 'POST' && action === '__multipart__'
  const actions = MANUAL_BODY_ACTIONS[path]
  return method === 'POST' && Array.isArray(actions) && typeof action === 'string' && actions.includes(action)
}

function matcherMatches(matcher: RouteMatcher, path: string): boolean {
  return typeof matcher === 'string' ? matcher === path : matcher.test(path)
}

function hasLegacyIdentitySelector(search: URLSearchParams): boolean {
  return [...search.keys()].some(key => ['as', 'actorid', 'actor_id'].includes(key.toLowerCase()))
}

/**
 * Resolves a request only against the explicit acting-mode matrix. This is
 * intentionally pure: middleware later checks any returned area requirement
 * against freshly read target DB permissions, not actor claims or privileges.
 */
export function impersonationRouteDecision(
  path: string,
  method: string,
  search: URLSearchParams = new URLSearchParams(),
  userId?: number,
  bodyAction: ImpersonationBodyAction = null,
): ImpersonationRouteDecision {
  if (hasLegacyIdentitySelector(search)) return { allowed: false }
  if (nextAuthAllowedDuringImpersonation(path, method)) return { allowed: true, purpose: 'auth.control', targetOnly: true }
  if (controlEndpointAllowed(path, method, bodyAction)) return { allowed: true, purpose: 'impersonation.control', targetOnly: true }
  if (ownPermissionReadAllowed(path, method, search, userId)) return { allowed: true, purpose: 'permissions.self', targetOnly: true }
  if (isSensitiveImpersonationPath(path)) return { allowed: false }

  if (manualMutationAllowed(path, method, bodyAction)) {
    return {
      allowed: true,
      purpose: 'finance.easy.manual-mutation',
      targetOnly: true,
      permission: { areas: [B4], required: 'escritura', allowLegacyFinanceRole: true },
    }
  }

  const rule = IMPERSONATION_ROUTE_MATRIX.find(candidate => candidate.methods.includes(method) && matcherMatches(candidate.path, path))
  if (!rule) return { allowed: false }
  return { allowed: true, purpose: rule.purpose, targetOnly: true, permission: rule.permission }
}

/** Compatibility wrapper for current callers and focused unit tests. */
export function impersonationRequestAllowed(
  path: string,
  method: string,
  search: URLSearchParams = new URLSearchParams(),
  userId?: number,
  bodyAction: ImpersonationBodyAction = null,
): boolean {
  return impersonationRouteDecision(path, method, search, userId, bodyAction).allowed
}

export type LiveTargetPermissionSnapshot = Readonly<{
  activo: boolean
  rol: string
  roles?: readonly string[] | null
  permisos: readonly Readonly<{ area: string; lectura: boolean; escritura: boolean }>[]
}>

/**
 * Evaluates *only* a freshly-read effective target row. `actorId`, actor role,
 * token roles and client input are intentionally absent from the contract.
 * Existing GERENTE and no-granular-permission CONTABILIDAD behavior is retained
 * only as an effective target's live DB role behavior, never as an actor grant.
 */
export function targetHasLiveRoutePermission(input: Readonly<{
  target: LiveTargetPermissionSnapshot | null
  requirement: TargetPermissionRequirement
  activeAreas: readonly string[]
}>): boolean {
  const target = input.target
  if (!target?.activo || hasSuperAdminRole(target)) return false
  const activeAreas = new Set(input.activeAreas)
  const requiredAreas = input.requirement.areas.filter(area => activeAreas.has(area))
  if (requiredAreas.length === 0) return false

  // This is the target's own live primary role, which is also how the existing
  // permission model authorizes GERENTE. It does not consult the real actor.
  if (target.rol === 'GERENTE') return true

  const hasGranularPermission = target.permisos.some(permission => permission.lectura || permission.escritura)
  const hasPermissionFor = (area: string) => target.permisos.some(permission =>
    permission[input.requirement.required] && (area === permission.area || area.startsWith(`${permission.area}.`)),
  )
  const directPermission = input.requirement.allAreas
    ? requiredAreas.every(hasPermissionFor)
    : requiredAreas.some(hasPermissionFor)
  if (directPermission) return true

  // Preserve only the existing finance-specific compatibility rule. It is
  // constrained to the target's DB role and disappears as soon as that target
  // has any granular permission rows.
  const targetRoles = [target.rol, ...normalizedRoles(target.roles)]
  return input.requirement.allowLegacyFinanceRole === true
    && !hasGranularPermission
    && targetRoles.includes('CONTABILIDAD')
}

/**
 * Extracts the pathname from Request.url without constructing URL. URL pathname
 * normalization erases `%2e%2e` before a policy can reject it. This accepts a
 * URL only as opaque transport text; it does not decode or normalize it.
 */
export function rawRequestPathBeforeNormalization(requestUrl: string): string | null {
  if (typeof requestUrl !== 'string' || requestUrl.length > 8192) return null
  const schemeEnd = requestUrl.indexOf('://')
  if (schemeEnd <= 0) return null
  const afterAuthority = requestUrl.slice(schemeEnd + 3)
  const firstDelimiter = afterAuthority.search(/[/?#]/)
  if (firstDelimiter === -1) return '/'
  if (afterAuthority[firstDelimiter] !== '/') return '/'
  const pathAndSuffix = afterAuthority.slice(firstDelimiter)
  const suffix = pathAndSuffix.search(/[?#]/)
  return suffix === -1 ? pathAndSuffix : pathAndSuffix.slice(0, suffix)
}

/**
 * Compares a raw request path captured before URL normalization with Next's
 * pathname. Acting mode accepts one canonical lowercase slash-separated form
 * only. Rejecting every percent escape is deliberate: no reviewed route needs
 * encoded path data and it eliminates encoded separators, dot segments and
 * double-decoding discrepancies between proxies and Next.
 */
export function canonicalActingPath(rawPath: string | null, normalizedPath: string): string | null {
  if (!rawPath || !normalizedPath || !rawPath.startsWith('/') || !normalizedPath.startsWith('/')) return null
  if (rawPath.length > 2048 || normalizedPath.length > 2048) return null
  if (rawPath.includes('%') || rawPath.includes('\\') || rawPath.includes('//')) return null
  if (/[\u0000-\u001f\u007f]/.test(rawPath)) return null
  if (rawPath !== rawPath.toLowerCase()) return null
  if (rawPath !== '/' && rawPath.endsWith('/')) return null
  if (rawPath.split('/').some(segment => segment === '.' || segment === '..')) return null
  if (normalizedPath !== rawPath) return null
  return normalizedPath
}

export function normalizedReason(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return null
  const reason = value.trim()
  return reason.length >= 1 && reason.length <= 500 ? reason : null
}

export function validIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && IMPERSONATION_IDEMPOTENCY_KEY.test(value)
}

export function strictSameOrigin(origin: string | null, configuredOrigin: string | null | undefined): boolean {
  if (!origin || !configuredOrigin) return false
  try {
    const configured = new URL(configuredOrigin)
    // Acting is never enabled over HTTP: a Secure session cookie is mandatory.
    return configured.protocol === 'https:' && origin === configured.origin
  } catch {
    return false
  }
}
