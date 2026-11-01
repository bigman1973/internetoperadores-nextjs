import type { ConciliarReadResponse, ConciliarRow, ConciliarSummary } from './conciliar-contract';

/**
 * Token local de una foto privada. No se serializa en órdenes de Conciliar ni
 * sustituye a la autorización del servidor: evita que una respuesta que ya
 * llegó al navegador se aplique a otra actuación, permiso, generación o vista.
 */
export type ConciliarPrivateProjectionToken = Readonly<{
  identityScope: string;
  generation: number;
  viewKey: string;
}>;

/** Sólo el servidor puede construir este resultado a partir de la proyección
 * vigente y de la misma vista normalizada que originó la acción. Nunca es input
 * de confirmar, deshacer o pedir. `changedRows` sólo contiene filas ya visibles;
 * una inserción fuera de página requiere la lectura normal de la proyección. */
export type ConciliarTargetedProjectionPatch = Readonly<{
  baseGeneration: number;
  generation: number;
  updatedAt: string;
  stale: boolean;
  staleReason: string | null;
  total: number;
  tabs: readonly ConciliarSummary[];
  changedRows: readonly ConciliarRow[];
  removedRowIds: readonly string[];
}>;

export type ConciliarTargetedRefreshResult = Readonly<{
  data: ConciliarReadResponse;
  token: ConciliarPrivateProjectionToken;
  /** Invalidar sólo estos detalles/selecciones; la caché de otra identidad no se toca. */
  invalidatedRowIds: readonly string[];
}>;

function validScope(value: string): boolean {
  return value.length > 0 && value.length <= 240;
}

function validGeneration(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validTimestamp(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 80 && Number.isFinite(new Date(value).getTime());
}

function validTotal(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function uniqueIds(values: readonly string[]): string[] | null {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 240 || seen.has(value)) return null;
    seen.add(value);
    ids.push(value);
  }
  return ids;
}

function completeTabs(tabs: readonly ConciliarSummary[]): boolean {
  const expected = new Set(['COBROS', 'EMITIDAS', 'PAGOS', 'RECIBIDAS']);
  if (tabs.length !== expected.size) return false;
  for (const tab of tabs) {
    if (!expected.delete(tab.tab) || !Number.isSafeInteger(tab.count) || tab.count < 0 || !Number.isSafeInteger(tab.amountCentimos)) return false;
    for (const color of ['VERDE', 'AMBAR', 'ROJO'] as const) {
      const summary = tab.colors[color];
      if (!summary || !Number.isSafeInteger(summary.count) || summary.count < 0 || !Number.isSafeInteger(summary.amountCentimos)) return false;
    }
  }
  return expected.size === 0;
}

/**
 * Aplica una mutación a la página ya visible, no una página nueva. La operación
 * falla cerrada (`null`) cuando necesitaría insertar una fila no leída, cuando
 * mezcla generaciones/identidades/vistas o cuando sus contadores no son
 * comprobables. El cableado de Workspace debe entonces usar su GET normal,
 * autorizado y paginado; no debe hacer una recarga global ni iniciar una
 * reconstrucción de proyección.
 */
export function applyConciliarTargetedRefresh(input: Readonly<{
  active: ConciliarPrivateProjectionToken;
  cached: ConciliarPrivateProjectionToken;
  current: ConciliarReadResponse;
  /** IDs que el resultado mutativo sellado declaró como afectados. */
  affectedRowIds: readonly string[];
  patch: ConciliarTargetedProjectionPatch;
}>): ConciliarTargetedRefreshResult | null {
  const { active, cached, current, affectedRowIds, patch } = input;
  if (!validScope(active.identityScope) || !validScope(cached.identityScope)
    || !validScope(active.viewKey) || !validScope(cached.viewKey)
    || !validGeneration(active.generation) || !validGeneration(cached.generation)) return null;
  if (active.identityScope !== cached.identityScope || active.viewKey !== cached.viewKey || active.generation !== cached.generation) return null;
  if (!validGeneration(patch.baseGeneration) || !validGeneration(patch.generation)
    || patch.baseGeneration !== cached.generation || patch.generation <= patch.baseGeneration
    || !validTimestamp(patch.updatedAt) || !validTotal(patch.total) || !completeTabs(patch.tabs)) return null;

  // Una foto marcada dirty no prueba una variante parcial. Se conserva el
  // comportamiento de seguridad actual: el integrador pide la foto autorizada
  // cuando esté lista en vez de presentar una mezcla de generaciones.
  if (current.stale !== false || current.staleReason !== null || patch.stale !== false || patch.staleReason !== null) return null;

  const affected = uniqueIds(affectedRowIds);
  const removed = uniqueIds(patch.removedRowIds);
  const changed = uniqueIds(patch.changedRows.map((row) => row.id));
  if (!affected || !removed || !changed || affected.length > 20) return null;
  const affectedSet = new Set(affected);
  const removedSet = new Set(removed);
  const changedSet = new Set(changed);
  if (removed.some((id) => !affectedSet.has(id)) || changed.some((id) => !affectedSet.has(id)) || removed.some((id) => changedSet.has(id))) return null;

  const currentById = new Map(current.rows.map((row) => [row.id, row]));
  // No se introducen filas fuera de la página ni se cambia su orden. Así una
  // respuesta selectiva nunca puede fingir una página completa con datos de otra
  // búsqueda; los huecos por borrado son reales hasta el siguiente GET del usuario.
  if (removed.some((id) => !currentById.has(id)) || changed.some((id) => !currentById.has(id))) return null;
  const totalDelta = patch.total - current.total;
  if (Math.abs(totalDelta) > affected.length) return null;

  const replacements = new Map(patch.changedRows.map((row) => [row.id, row]));
  const rows = current.rows.flatMap((row) => {
    if (removedSet.has(row.id)) return [];
    return [replacements.get(row.id) ?? row];
  });
  if (rows.length > current.limit || rows.length > patch.total) return null;

  return {
    data: {
      ...current,
      rows,
      total: patch.total,
      tabs: patch.tabs,
      updatedAt: patch.updatedAt,
      stale: false,
      staleReason: null,
    },
    token: { ...cached, generation: patch.generation },
    invalidatedRowIds: [...new Set([...changed, ...removed])],
  };
}
