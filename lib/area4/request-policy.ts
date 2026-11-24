import type { Area4Capability } from './policy'
import { parseConciliarCommand } from '../finanzas/conciliar-contract'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])
const CONFIRM_ACTIONS = new Set([
  'confirmar', 'confirmar_traspasos_propios_manual', 'aprobar', 'aprobar_extra', 'aprobar_gasto', 'validar',
  'asociar_devolucion', 'asociar_facturas', 'vincular_factura_interes',
  'vincular_compra', 'vincular_personal', 'imputar', 'imputar-a-ventas',
  'imputar-todas-proveedor', 'aplicar-similares', 'guardar-lineas',
  'RESOLVER_CUARENTENA', 'RESOLVER_HISTORICA',
])
const EXPORT_ACTIONS = new Set(['exportar', 'export', 'download', 'descargar', 'pdf', 'excel', 'csv'])

/** Only these handlers dispatch a JSON command selector. Ordinary batch bodies
 * and multipart uploads are left to their existing handler limits and guards.
 * New command handlers must be registered here before their actions are exposed.
 */
const JSON_COMMAND_PATHS = [
  /^\/api\/admin\/empleados\/organigrama$/,
  /^\/api\/admin\/empleados\/escenarios-salariales(?:\/[^/]+)?$/,
  /^\/api\/admin\/proyectos$/,
  /^\/api\/admin\/peticiones$/,
  /^\/api\/admin\/finanzas\/imputacion$/,
  /^\/api\/admin\/finanzas\/conciliacion-remesas$/,
  /^\/api\/admin\/crm\/isp\/vinculos$/,
  /^\/api\/admin\/comunicados\/asistente-ia$/,
  /^\/api\/admin\/finanzas\/conciliar$/,
  /^\/api\/admin\/finanzas\/conciliar\/intereses$/,
  /^\/api\/admin\/clientes\/ggcc\/exagrid\/finanzas$/,
  /^\/api\/admin\/finanzas\/clientes\/ggcc-draxton$/,
  /^\/api\/admin\/clientes\/ggcc\/draxton\/personal-contrato$/,
  /^\/api\/admin\/imputaciones$/,
  /^\/api\/admin\/gastos-extras$/,
  /^\/api\/admin\/clientes\/ggcc\/draxton\/guardias$/,
  /^\/api\/admin\/aapp$/,
  /^\/api\/admin\/clientes\/ggcc\/draxton\/actualizaciones$/,
] as const

export function area4CommandBodyLimit(path: string, method: string): number | null {
  if (SAFE.has(method) || !JSON_COMMAND_PATHS.some(pattern => pattern.test(path))) return null
  // Conciliar already enforces this exact closed-contract limit. Other command
  // handlers get a separate generous cap; there is no global 16 KiB body limit.
  return path === '/api/admin/finanzas/conciliar' ? 16 * 1024 : 8 * 1024 * 1024
}

function isClosedReadOnlyReviewPreview(path: string, method: string, body: unknown): boolean {
  if (path !== '/api/admin/finanzas/conciliar' || method !== 'POST') return false
  try {
    const command = parseConciliarCommand(body)
    return command.action === 'confirmar' && 'review' in command && command.review.kind === 'REVIEW_PREVIEW'
  } catch { return false }
}

/** Additional capability, never a substitute for a module's own live guard.
 * A preview is not a confirmation and viewing a document is not a bulk export.
 * This inventory is deliberately inspectable; new commands need review here.
 */
export function area4RequestCapabilities(input: Readonly<{
  path: string
  method: string
  action?: string | null
  queryAction?: string | null
  body?: unknown
}>): readonly Area4Capability[] {
  const { path, method } = input
  if (method === 'OPTIONS') return []
  if (isClosedReadOnlyReviewPreview(path, method, input.body)) return ['lectura']
  const actions = [input.action, input.queryAction].filter((a): a is string => Boolean(a))
  const caps = new Set<Area4Capability>(['lectura'])
  if (!SAFE.has(method)) caps.add('escritura')
  if (actions.some(a => CONFIRM_ACTIONS.has(a)) || /\/(?:confirmar|aprobar|validar|confirmacion)(?:\/|$)/.test(path)) {
    caps.add('confirmar')
  }
  if (actions.some(a => EXPORT_ACTIONS.has(a)) || /\/(?:exportar(?:-a3)?|export|exportaciones|excel|csv)(?:\/|$)/.test(path)
    || (/\/pdf$/.test(path) && path !== '/api/admin/finanzas/conciliar/documento')) {
    caps.add('exportar')
  }
  return [...caps]
}

export function area4CanReadOwnPermissionSnapshot(input: Readonly<{
  path: string
  method: string
  action: string | null
  usuarioId: string | null
  uid: string | null
  effectiveId: number
}>): boolean {
  if (input.path !== '/api/admin/permisos' || !['GET', 'HEAD'].includes(input.method)) return false
  if (input.action === 'usuario') return Number(input.usuarioId) === input.effectiveId
  if (input.action === 'verificar') return input.uid === null || Number(input.uid) === input.effectiveId
  return false
}
