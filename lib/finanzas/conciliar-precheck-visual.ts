import type { ConciliarProjectionSource } from './conciliar-contract'
export const CONCILIAR_GREEN_PRECHECK_STAMP = 'CONCILIAR_GREEN_PRECHECK_20261030_V1' as const
export const CONCILIAR_GREEN_PENDING_REASON = 'Hay cambios pendientes de comprobar. Pulsa Actualizar antes de confirmar.'
/** Visual gate is metadata-only. Financial validation is performed at projection
 * construction; dirty invalidates every previous green assertion without I/O. */
export function conciliarVisualGreenIsCurrent(input:Readonly<{source:ConciliarProjectionSource;dirty:boolean}>):boolean {
  return input.dirty===false && input.source.g7Precheck===CONCILIAR_GREEN_PRECHECK_STAMP
}
/** Strict pair source grammars accept only the reviewed internal metadata stamp.
 * An unknown stamp is left intact and therefore rejected by their exact parser. */
export function withoutConciliarPrecheckStamp(value:unknown):unknown {
  if(!value || typeof value!=='object' || Array.isArray(value)) return value
  const source=value as Record<string,unknown>
  if(source.g7Precheck!==CONCILIAR_GREEN_PRECHECK_STAMP) return value
  const {g7Precheck:_stamp,...rest}=source
  return rest
}
