import type { Area4Capability } from './policy'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])
const CONFIRM_ACTIONS = new Set([
  'confirmar', 'aprobar', 'aprobar_extra', 'aprobar_gasto', 'validar',
  'asociar_devolucion', 'asociar_facturas', 'vincular_factura_interes',
  'vincular_compra', 'vincular_personal', 'imputar', 'imputar-a-ventas',
  'imputar-todas-proveedor', 'aplicar-similares', 'guardar-lineas',
  'RESOLVER_CUARENTENA', 'RESOLVER_HISTORICA',
])
const EXPORT_ACTIONS = new Set(['exportar', 'export', 'download', 'descargar', 'pdf', 'excel', 'csv'])

/** Additional capability, never a substitute for a module's own live guard.
 * A preview is not a confirmation and viewing a document is not a bulk export.
 * This inventory is deliberately inspectable; new commands need review here.
 */
export function area4RequestCapabilities(input: Readonly<{
  path: string
  method: string
  action?: string | null
  queryAction?: string | null
  preview?: boolean
}>): readonly Area4Capability[] {
  const { path, method } = input
  if (method === 'OPTIONS') return []
  const actions = [input.action, input.queryAction].filter((a): a is string => Boolean(a))
  const caps = new Set<Area4Capability>(['lectura'])
  if (!SAFE.has(method)) caps.add('escritura')
  if (!input.preview && (actions.some(a => CONFIRM_ACTIONS.has(a)) || /\/(?:confirmar|aprobar|validar|confirmacion)(?:\/|$)/.test(path))) {
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
