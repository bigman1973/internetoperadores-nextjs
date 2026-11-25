import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConciliarReadResponse } from './conciliar-contract';
import { ConciliarProjectionMemoryCache, conciliarProjectionCacheKey, isCurrentConciliarProjectionResponse } from './conciliar-projection-client';

const snapshot = (updatedAt: string): ConciliarReadResponse => ({
  tabs: [], rows: [], total: 0, limit: 20, offset: 0, updatedAt,
  cuentas: [], stale: false, staleReason: null, cutoffDate: '2026-01-01',
  emitidasGroups: [], historicSummary: { count: 0, amountCentimos: 0 },
});

const view = (overrides: Partial<Parameters<typeof conciliarProjectionCacheKey>[0]> = {}) => ({
  identityScope: 'usuario-a:sesion-expira:roles:epoch:1', globalOrder: false, tab: 'PAGOS' as const, from: '', to: '', accountId: '',
  query: 'proveedor', cutoffDate: '2026-01-01', emitidasGrupo: '' as const,
  estado: '' as const, grupo: '' as const, orden: 'IMPORTE' as const,
  direccion: 'DESC' as const, limit: 20, offset: 0, ...overrides,
});

test('la clave de proyección separa identidad, ventana de capacidad y cada filtro de una vista', () => {
  const base = conciliarProjectionCacheKey(view());
  const variants = [
    view({ identityScope: 'actuacion:sesion:destino:expira:roles:epoch:2' }), view({ globalOrder: true }),
    view({ tab: 'COBROS' }), view({ from: '2026-01-02' }), view({ to: '2026-10-31' }),
    view({ accountId: 'cuenta-1' }), view({ query: 'otro proveedor' }), view({ cutoffDate: '2026-02-01' }),
    view({ tab: 'EMITIDAS', emitidasGrupo: 'CON_PROPUESTA' }), view({ estado: 'VERDE' }),
    view({ grupo: 'BANCO' }), view({ orden: 'FECHA' }), view({ direccion: 'ASC' }),
    view({ limit: 100 }), view({ offset: 20 }),
  ];
  for (const candidate of variants) assert.notEqual(conciliarProjectionCacheKey(candidate), base);
  assert.equal(conciliarProjectionCacheKey(view({ query: ' proveedor ' })), base);
});

test('la caché LRU privada expira, no supera la capacidad y no persiste una foto expirada', () => {
  const cache = new ConciliarProjectionMemoryCache(2, 100);
  cache.set('a', snapshot('2026-11-01T10:00:00.000Z'), 1_000);
  cache.set('b', snapshot('2026-11-01T10:01:00.000Z'), 1_000);
  assert.equal(cache.get('a', 1_010)?.updatedAt, '2026-11-01T10:00:00.000Z');
  cache.set('c', snapshot('2026-11-01T10:02:00.000Z'), 1_010);
  assert.equal(cache.get('b', 1_011), undefined);
  assert.equal(cache.size(1_011), 2);
  assert.equal(cache.get('a', 1_100), undefined);
  assert.equal(cache.size(1_111), 0);
});

test('clear aborta precargas y una respuesta antigua no puede repoblar otra identidad', async () => {
  const cache = new ConciliarProjectionMemoryCache(2, 1_000);
  let calls = 0;
  let signal: AbortSignal | undefined;
  let resolveLoad: ((value: ConciliarReadResponse) => void) | undefined;
  const loader = (receivedSignal: AbortSignal) => {
    calls += 1;
    signal = receivedSignal;
    return new Promise<ConciliarReadResponse>((resolve) => { resolveLoad = resolve; });
  };
  const first = cache.prefetch('pagos-privados', loader, 1_000);
  const second = cache.prefetch('pagos-privados', loader, 1_000);
  assert.equal(first, second, 'una navegación comparte el GET de la precarga exacta');
  await Promise.resolve();
  assert.equal(calls, 1);
  cache.clear();
  assert.equal(signal?.aborted, true);
  resolveLoad?.(snapshot('2026-11-01T10:00:00.000Z'));
  await assert.doesNotReject(first);
  assert.equal(cache.pendingSize(), 0);
  assert.equal(cache.get('pagos-privados', 1_001), undefined);
});

test('un 200 tardío no puede borrar un rechazo de identidad ni alimentar el scope nuevo', () => {
  const controller = new AbortController();
  assert.equal(isCurrentConciliarProjectionResponse({ signal: controller.signal, requestScope: 'actor-a:epoch:4', currentScope: 'actor-a:epoch:4' }), true);
  controller.abort();
  assert.equal(isCurrentConciliarProjectionResponse({ signal: controller.signal, requestScope: 'actor-a:epoch:4', currentScope: 'actor-a:epoch:5' }), false);
  assert.equal(isCurrentConciliarProjectionResponse({ requestScope: 'actor-a:epoch:4', currentScope: 'actor-b:epoch:5' }), false);
});
