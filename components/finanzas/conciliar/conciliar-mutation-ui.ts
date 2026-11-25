export type ConciliarPendingUiOperation = Readonly<{
  key: string;
  action: string;
  operationId: string | null;
  rowIds: readonly string[];
}>;

/** Un undo con destino desconocido no autoriza decisiones sobre ninguna fila. */
export function conciliarUiRowBlocked(pending: readonly ConciliarPendingUiOperation[], rowId?: string): boolean {
  return pending.some((operation) => operation.action !== 'deshacer' || operation.rowIds.length === 0 || rowId === undefined || operation.rowIds.includes(rowId));
}

export function canAdoptConciliarMutationProjection(input: Readonly<{
  synchronized: boolean;
  requestIdentity: string;
  currentIdentity: string | null;
  requestView: string;
  currentView: string;
  requestGeneration: number;
  currentGeneration: number;
  requestSequence: number;
  currentSequence: number;
  pendingCount: number;
}>): boolean {
  return input.synchronized
    && input.requestIdentity === input.currentIdentity
    && input.requestView === input.currentView
    && input.requestGeneration === input.currentGeneration
    && input.requestSequence === input.currentSequence
    && input.pendingCount === 1;
}

/** Reconocimiento en estado React: las refs del efecto no actualizan la UI. */
export function conciliarIdentityTransitioning(acknowledged: string | undefined, current: string): boolean {
  return acknowledged !== undefined && acknowledged !== current;
}
