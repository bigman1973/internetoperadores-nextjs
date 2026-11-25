import type { Area4Capability } from './policy'
import { parseConciliarCommand } from '../finanzas/conciliar-contract'
import { AREA4_ACTIONS, AREA4_REQUEST_CONTRACT, area4RegisteredSurface } from './section-registry'

/** Methods, selectors, command labels and physical handler limits live in the registry. */
export function area4CommandBodyLimit(path: string, method: string): number | null {
  if ((AREA4_REQUEST_CONTRACT.safeMethods as readonly string[]).includes(method)) return null
  return area4RegisteredSurface(path, 'api')?.surface.request?.commandBodyLimit ?? null
}

function isClosedReadOnlyReviewPreview(path: string, method: string, body: unknown): boolean {
  if (method !== 'POST' || area4RegisteredSurface(path, 'api')?.surface.request?.readOnlyReview !== 'conciliar-closed-review-preview') return false
  try {
    const command = parseConciliarCommand(body)
    return command.action === 'confirmar' && 'review' in command && command.review.kind === 'REVIEW_PREVIEW'
  } catch { return false }
}

/** Additional capability, never a replacement for a handler's own live guard.
 * A closed read-only preview stays V; every mutation otherwise requires V + E.
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
  if (isClosedReadOnlyReviewPreview(path, method, input.body)) return [AREA4_ACTIONS[0].capability]
  const contract = AREA4_REQUEST_CONTRACT
  const actions = [input.action, input.queryAction].filter((action): action is string => Boolean(action))
  const segments = path.split('/').filter(Boolean)
  const caps = new Set<Area4Capability>([AREA4_ACTIONS[0].capability])
  if (!(contract.safeMethods as readonly string[]).includes(method)) caps.add(AREA4_ACTIONS[1].capability)
  const methodActions = area4RegisteredSurface(path, 'api')?.surface.request?.requiredActions
  const declaredActions = methodActions?.[method as keyof NonNullable<typeof methodActions>] || []
  for (const action of AREA4_ACTIONS) if (declaredActions.includes(action.letter)) caps.add(action.capability)
  if (actions.some(action => (contract.confirmActions as readonly string[]).includes(action))
    || segments.some(segment => (contract.confirmPathSegments as readonly string[]).includes(segment))) {
    caps.add(AREA4_ACTIONS[2].capability)
  }
  if (actions.some(action => (contract.exportActions as readonly string[]).includes(action))
    || segments.some(segment => (contract.exportPathSegments as readonly string[]).includes(segment))
    || (segments.at(-1) === contract.exportFinalSegment && path !== contract.singleDocumentException)) {
    caps.add(AREA4_ACTIONS[3].capability)
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
