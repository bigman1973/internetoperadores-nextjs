import type { ConciliarDocumentDetail } from '@/lib/finanzas/conciliar-document-detail-contract';

export const CONCILIAR_DETAIL_CACHE_MAX_ENTRIES = 12;
export const CONCILIAR_DETAIL_CACHE_TTL_MS = 20_000;

type DetailCacheEntry<Value> = Readonly<{
  value: Value;
  expiresAt: number;
}>;

type DetailPending<Value> = Readonly<{
  controller: AbortController;
  promise: Promise<Value>;
}>;

export type ConciliarDetailCacheKeyInput = Readonly<{
  rowId: string;
  decisionHash: string;
  updatedAt: string;
  identityScope: string;
}>;

/**
 * No es una credencial ni sustituye la autorización: separa resultados ya
 * autorizados por fila, versión de proyección e identidad efectiva durante una
 * vida breve de este componente cliente.
 */
export function conciliarDetailCacheKey(input: ConciliarDetailCacheKeyInput): string {
  return JSON.stringify([input.identityScope, input.rowId, input.decisionHash, input.updatedAt]);
}

/**
 * Formato puramente de presentación. El timestamp sigue procediendo de la foto
 * que el servidor ya autorizó; no infiere ni promete ningún recálculo.
 */
export function formatConciliarUpdatedAt(value: string, options: Readonly<{ locale?: string; timeZone?: string }> = {}): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Cifras sin fecha de actualización verificable.';
  const time = new Intl.DateTimeFormat(options.locale ?? 'es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date);
  return `Cifras actualizadas a las ${time}`;
}

/**
 * Caché LRU sólo en memoria del componente. La suma de entradas y cargas queda
 * acotada; clear/cancel abortan su señal y una generación anterior nunca puede
 * volver a poblar la caché. No se comparte entre usuarios ni sesiones.
 */
export class ConciliarDetailMemoryCache<Value> {
  private readonly entries = new Map<string, DetailCacheEntry<Value>>();
  private readonly pending = new Map<string, DetailPending<Value>>();
  private generation = 0;
  private readonly capacity: number;

  constructor(
    maxEntries = CONCILIAR_DETAIL_CACHE_MAX_ENTRIES,
    private readonly ttlMs = CONCILIAR_DETAIL_CACHE_TTL_MS,
  ) {
    this.capacity = Math.max(1, Math.floor(maxEntries));
  }

  get(key: string, now = Date.now()): Value | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    // Reinsertar conserva el uso más reciente al desalojar la entrada más antigua.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: Value, now = Date.now()): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
    }
  }

  private makeRoomForPending(): void {
    while (this.entries.size + this.pending.size >= this.capacity) {
      const oldestEntry = this.entries.keys().next().value;
      if (oldestEntry !== undefined) {
        this.entries.delete(oldestEntry);
        continue;
      }
      const oldestPending = this.pending.keys().next().value;
      if (oldestPending === undefined) return;
      this.cancel(oldestPending);
    }
  }

  /** Las precargas oportunistas nunca desplazan una carga o resultado ya acotado. */
  canPrefetch(key: string, now = Date.now()): boolean {
    return this.get(key, now) !== undefined || this.pending.has(key) || this.entries.size + this.pending.size < this.capacity;
  }

  /**
   * Varias interacciones sobre la misma fila comparten una única petición. La
   * caché posee AbortController para que una precarga no pueda dejar una señal
   * abortada asociada a una apertura explícita posterior.
   */
  load(key: string, loader: (signal: AbortSignal) => Promise<Value>, now = Date.now()): Promise<Value> {
    const cached = this.get(key, now);
    if (cached !== undefined) return Promise.resolve(cached);
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight.promise;

    this.makeRoomForPending();
    const generation = this.generation;
    const controller = new AbortController();
    let request: Promise<Value>;
    request = Promise.resolve()
      .then(() => loader(controller.signal))
      .then((value) => {
        // Cancelar, cambiar identidad o limpiar la generación impide reinsertar
        // una respuesta que ya no pertenece a esta vista privada.
        if (generation === this.generation && this.pending.get(key)?.promise === request) this.set(key, value);
        return value;
      })
      .finally(() => {
        if (this.pending.get(key)?.promise === request) this.pending.delete(key);
      });
    this.pending.set(key, { controller, promise: request });
    return request;
  }

  cancel(key: string): void {
    const pending = this.pending.get(key);
    if (!pending) return;
    this.pending.delete(key);
    pending.controller.abort();
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

export type ConfirmingNetCalculation = Readonly<{
  calculatedNetCentimos: number;
  declaredNetCentimos: number;
  matchesDeclaredNetExactly: boolean;
}>;

/**
 * Sólo calcula cuando los cinco importes explícitos son enteros no negativos.
 * No completa faltas ni redondea: la igualdad se decide en céntimos.
 */
export function calculateConfirmingNet(detail: Pick<ConciliarDocumentDetail, 'nominalCentimos' | 'interesesCentimos' | 'comisionCentimos' | 'ivaComisionCentimos' | 'netoDocumentoCentimos'>): ConfirmingNetCalculation | null {
  const values = [
    detail.nominalCentimos,
    detail.interesesCentimos,
    detail.comisionCentimos,
    detail.ivaComisionCentimos,
    detail.netoDocumentoCentimos,
  ];
  if (values.some((value) => !Number.isSafeInteger(value) || (value as number) < 0)) return null;
  const [nominal, intereses, comision, iva, declaredNet] = values as number[];
  const calculatedNetCentimos = nominal - intereses - comision - iva;
  if (!Number.isSafeInteger(calculatedNetCentimos)) return null;
  return {
    calculatedNetCentimos,
    declaredNetCentimos: declaredNet,
    matchesDeclaredNetExactly: calculatedNetCentimos === declaredNet,
  };
}
