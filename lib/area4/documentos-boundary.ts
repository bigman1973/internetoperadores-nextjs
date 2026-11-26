import { area4RegisteredSurface } from './section-registry'
import { documentosPanelRuntime, type DocumentosRuntime } from '../finanzas/documentos-panel-runtime'

/** Routing eligibility only: live NEW-surface V/E/C consent is always checked afterward.
 * No profile, role, permission or Microsoft grant is created by this function. */
export function documentosPanelRequestContext(path: string, method: string, env: Record<string, string | undefined> = process.env): DocumentosRuntime | null {
  const match = area4RegisteredSurface(path, 'api')
  if (!match || match.baseline || match.section.areaCode !== 'admin.finanzas.facturas'
    || match.surface.availability?.closedByGate !== 'documentosPanel') return null
  const declared = match.surface.request?.requiredActions
  if (!declared || !Object.prototype.hasOwnProperty.call(declared, method)) return null
  const context = documentosPanelRuntime(env)
  if (!context || (context.readOnly && method !== 'GET')) return null
  return context
}
