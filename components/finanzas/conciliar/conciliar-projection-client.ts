import type {
  ConciliarColor,
  ConciliarEmitidasGroup,
  ConciliarGroup,
  ConciliarReadResponse,
  ConciliarSortDirection,
  ConciliarSortField,
  ConciliarTab,
} from './conciliar-contract';

export const CONCILIAR_PROJECTION_CACHE_MAX_ENTRIES = 8;
export const CONCILIAR_PROJECTION_CACHE_TTL_MS = 20_000;

/** Tras leer body, una respuesta sólo puede tocar estado si sigue en su scope. */
export function isCurrentConciliarProjectionResponse(input: Readonly<{
  signal?: AbortSignal;
  requestScope: string;
  currentScope: string | null;
}>): boolean {
  return !input.signal?.aborted && input.currentScope === input.requestScope;
}

export type ConciliarProjectionCacheKeyInput = Readonly<{
  /** Identidad efectiva, capability window, permisos y epoch de esta instancia. */
  identityScope: string;
  /** Cambia agrupación de presentación; se aísla aunque no altere el GET. */
  globalOrder: boolean;
  tab: ConciliarTab;
  from: string;
  to: string;
  accountId: string;
  query: string;
  cutoffDate: string;
  emitidasGrupo: ConciliarEmitidasGroup | '';
  estado: ConciliarColor | '';
  grupo: ConciliarGroup | '';
  orden: ConciliarSortField;
  direccion: ConciliarSortDirection;
  limit: number;
  offset: number;
}>;

type ProjectionCacheEntry = Readonly<{
  value: ConciliarReadResponse;
  expiresAt: number;
}>;

type ProjectionPending = Readonly<{
  controller: AbortController;
  promise: Promise<ConciliarReadResponse>;
}>;

/**
 * La clave incluye todo parámetro que pueda alterar filas, orden o badges y un
 * alcance opaco de identidad. No es una credencial: sólo identifica una foto
 * privada ya autorizada dentro de una única instancia de Workspace.
 */
export function conciliarProjectionCacheKey(input: ConciliarProjectionCacheKeyInput): string {
  return JSON.stringify([
    input.identityScope,
    input.globalOrder,
    input.tab,
    input.from,
    input.to,
    input.accountId,
    input.query.trim().slice(0, 120),
    input.cutoffDate,
    input.emitidasGrupo,
    input.estado,
    input.grupo,
    input.orden,
    input.direccion,
    input.limit,
    input.offset,
  ]);
}

/**
 * LRU efímera y privada. No usa localStorage, sessionStorage ni estado global.
 * `clear()` incrementa una generación y aborta las precargas para que ninguna
 * respuesta anterior a un cambio de identidad, permiso o mutación pueda volver
 * a entrar en la memoria.
 */
export class ConciliarProjectionMemoryCache {
  private readonly entries = new Map<string, ProjectionCacheEntry>();
  private readonly pending = new Map<string, ProjectionPending>();
  private generation = 0;
  private readonly capacity: number;

  constructor(
    maxEntries = CONCILIAR_PROJECTION_CACHE_MAX_ENTRIES,
    private readonly ttlMs = CONCILIAR_PROJECTION_CACHE_TTL_MS,
  ) {
    this.capacity = Math.max(1, Math.floor(maxEntries));
  }

  get(key: string, now = Date.now()): ConciliarReadResponse | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: ConciliarReadResponse, now = Date.now()): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
    }
  }

  /** La lectura visible puede compartir la promesa de una precarga idéntica. */
  pendingFor(key: string): Promise<ConciliarReadResponse> | undefined {
    return this.pending.get(key)?.promise;
  }

  /**
   * Sólo se llama para las otras tres pestañas conocidas de una misma vista.
   * No recorre filas y es cancelable cuando se invalida el ámbito privado.
   */
  prefetch(key: string, loader: (signal: AbortSignal) => Promise<ConciliarReadResponse>, now = Date.now()): Promise<ConciliarReadResponse> {
    const cached = this.get(key, now);
    if (cached) return Promise.resolve(cached);
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight.promise;

    while (this.entries.size + this.pending.size >= this.capacity) {
      const oldestEntry = this.entries.keys().next().value;
      if (oldestEntry !== undefined) {
        this.entries.delete(oldestEntry);
        continue;
      }
      const oldestPending = this.pending.keys().next().value;
      if (oldestPending === undefined) break;
      this.cancel(oldestPending);
    }

    const generation = this.generation;
    const controller = new AbortController();
    let request: Promise<ConciliarReadResponse>;
    request = Promise.resolve()
      .then(() => loader(controller.signal))
      .then((value) => {
        if (!controller.signal.aborted && generation === this.generation && this.pending.get(key)?.promise === request) this.set(key, value);
        return value;
      })
      .finally(() => {
        if (this.pending.get(key)?.promise === request) this.pending.delete(key);
      });
    this.pending.set(key, { controller, promise: request });
    return request;
  }

  cancel(key: string): void {
    const request = this.pending.get(key);
    if (!request) return;
    this.pending.delete(key);
    request.controller.abort();
  }

  clear(): void {
    this.generation += 1;
    this.entries.clear();
    for (const { controller } of this.pending.values()) controller.abort();
    this.pending.clear();
  }

  size(now = Date.now()): number {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    return this.entries.size;
  }

  pendingSize(): number {
    return this.pending.size;
  }
}
