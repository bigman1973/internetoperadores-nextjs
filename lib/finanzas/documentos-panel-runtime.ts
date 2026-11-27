import { financeEnvironment } from './finance-environment'
import { fail, DOCUMENTOS_PANEL_ROOT, DOCUMENTOS_PRODUCTION_ROOT } from './documentos-panel-core'

export { DOCUMENTOS_PRODUCTION_ROOT } from './documentos-panel-core'
export const DOCUMENTOS_PRODUCTION_ACCOUNT = 'administracion@internetoperadores.com'
type Env = Record<string, string | undefined>
export type DocumentosRuntime = Readonly<{ environment: 'staging' | 'production'; stageOnly: boolean; readOnly: boolean; root: string }>
export type DocumentosProductionPins = Readonly<{ driveId: string; folderItemId: string; pendingFolderItemId: string; archivedFolderItemId: string }>
/** Approval allowlist only: these identifiers NEVER populate env or open Production. */
export const DOCUMENTOS_APPROVED_PRODUCTION_PINS: DocumentosProductionPins = Object.freeze({
  driveId: 'b!dKwRKEVNVkqVTYRAofWUsDd986ugfPhAt5zF_95R9jAHPFiBlpgQQYMomvM3D6Mc',
  folderItemId: '01OLVTNNTKKO7GOUF2HFEZBV354BP3HD6G',
  pendingFolderItemId: '01OLVTNNVIFF7PXWJMNVGLSTLPYQGEZPUV',
  archivedFolderItemId: '01OLVTNNWGRLAN46CBXRAIFY73LMMSCYD2',
})
export function isDocumentosApprovedProductionPins(pins: DocumentosProductionPins | null | undefined): boolean {
  return !!pins && Object.entries(DOCUMENTOS_APPROVED_PRODUCTION_PINS).every(([key, value]) => pins[key as keyof DocumentosProductionPins] === value)
}
export function assertDocumentosApprovedProductionPins(pins: DocumentosProductionPins): void {
  if (!isDocumentosApprovedProductionPins(pins)) fail(503, 'DOCUMENTOS_SELECTED_PIN_MISMATCH', 'Sólo se admite el drive y las tres carpetas aprobadas de 10. Panel IO.')
}
/** No aliases/defaults/Stage pins: all four optional config entries must match approval. */
export function documentosPanelProductionPins(env: Env = process.env): DocumentosProductionPins | null {
  const pins = {
    driveId: env.FINANCE_DOCUMENTOS_PRODUCTION_DRIVE_ID,
    folderItemId: env.FINANCE_DOCUMENTOS_PRODUCTION_FOLDER_ITEM_ID,
    pendingFolderItemId: env.FINANCE_DOCUMENTOS_PRODUCTION_PENDING_FOLDER_ITEM_ID,
    archivedFolderItemId: env.FINANCE_DOCUMENTOS_PRODUCTION_ARCHIVED_FOLDER_ITEM_ID,
  }
  if (!Object.values(pins).every(value => typeof value === 'string') || !isDocumentosApprovedProductionPins(pins as DocumentosProductionPins)) return null
  return Object.freeze(pins) as DocumentosProductionPins
}
/** Single document opt-in. Finance-wide flags cannot grant Documentos. No I/O. */
export function documentosPanelRuntime(env: Env = process.env): DocumentosRuntime | null {
  const readOnly = env.IO_PRODUCTION_READ_ONLY === '1' || env.FINANCE_DEPLOYMENT_READ_ONLY === '1'
  try {
    const environment = financeEnvironment({ stagingSandbox: env.FINANCE_STAGING_SANDBOX,
      vercelEnvironment: env.VERCEL_ENV, productionEnabled: env.FINANCE_MODEL_PRODUCTION_ENABLED,
      automaticLinksDisabled: env.FINANCE_AUTOMATIC_LINKS_DISABLED, databaseUrl: env.DATABASE_URL })
    if (environment === 'staging') {
      if (env.VERCEL_ENV === 'production' || readOnly || [env.FINANCE_EASY_PRODUCTION_ENABLED, env.FINANCE_MODEL_PRODUCTION_ENABLED, env.FINANCE_DOCUMENTOS_PRODUCTION_ENABLED].some(v => v !== undefined && v !== '0')) return null
      return { environment, stageOnly: true, readOnly: false, root: DOCUMENTOS_PANEL_ROOT }
    }
    if (environment !== 'production' || ![undefined, '0'].includes(env.FINANCE_STAGING_SANDBOX)
      || env.FINANCE_EASY_PRODUCTION_ENABLED !== '1' || env.FINANCE_DOCUMENTOS_PRODUCTION_ENABLED !== '1'
      || !documentosPanelProductionPins(env)) return null
    return { environment, stageOnly: false, readOnly, root: DOCUMENTOS_PRODUCTION_ROOT }
  } catch { return null }
}
export function documentosPanelProductionEnabled(env: Env = process.env): boolean {
  return documentosPanelRuntime(env)?.environment === 'production'
}
export function assertDocumentosPanelRuntime(write = false, env: Env = process.env): DocumentosRuntime {
  const context = documentosPanelRuntime(env)
  if (!context) fail(404, 'DOCUMENTOS_PANEL_RUNTIME_CLOSED', 'Documentos no aprobado o configuración/pins incompletos.')
  if (write && context.readOnly) fail(403, 'DOCUMENTOS_PANEL_READ_ONLY', 'El despliegue sólo permite lectura documental.')
  return context
}
