import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ConciliarDocumentPreview from '../components/finanzas/conciliar/ConciliarDocumentPreview';
import {
  ConciliarDetailMemoryCache,
  calculateConfirmingNet,
  conciliarDetailCacheKey,
} from '../components/finanzas/conciliar/conciliar-detail-client';
import type { ConciliarRow } from '../components/finanzas/conciliar/conciliar-contract';
import type { ConciliarDocumentDetail } from '../lib/finanzas/conciliar-document-detail-contract';

const sha = 'b'.repeat(64);

const row: ConciliarRow = {
  id: 'confirming-sintetico', movimientoId: 'movimiento-sintetico', fecha: '2026-10-28', concepto: 'Abono confirming sintético', banco: 'Banco sintético', cuenta: 'ES00', importeCentimos: 9300, pendienteCentimos: 9300,
  color: 'AMBAR', grupo: 'CONFIRMING', motivo: 'Revisión sintética.', documento: null, propuesta: null, seleccionable: false, diferenciaCentimos: 0, linksMovimiento: [], detail: null, decisionHash: sha,
};

function detail(overrides: Partial<ConciliarDocumentDetail> = {}): ConciliarDocumentDetail {
  return {
    rowId: row.id, kind: 'CONFIRMING', titulo: 'Liquidación sintética', bancoEmisor: 'Banco sintético', numeroLiquidacion: 'LQ-1', referenciaDocumento: null, fechaLiquidacion: '2026-10-28', cuentaAbono: 'ES00', proveedor: null, numeroFactura: null, fechaFactura: null, importeFacturaCentimos: null,
    lineas: [], nominalCentimos: 10_000, interesesCentimos: 300, comisionCentimos: 300, ivaComisionCentimos: 100, netoDocumentoCentimos: 9300, importeBancoCentimos: 9300, cuadreExacto: true, avisos: [], pdfHref: null,
    ...overrides,
  };
}

test('las deducciones confirming sólo se calculan en céntimos explícitos y el drawer las pinta con menos', () => {
  const exact = calculateConfirmingNet(detail());
  assert.deepEqual(exact, { calculatedNetCentimos: 9300, declaredNetCentimos: 9300, matchesDeclaredNetExactly: true });
  assert.equal(calculateConfirmingNet(detail({ interesesCentimos: null })), null, 'un dato ausente no se completa con cero');
  assert.equal(calculateConfirmingNet(detail({ comisionCentimos: -1 })), null, 'una deducción firmada no se reinterpreta');

  const html = renderToStaticMarkup(createElement(ConciliarDocumentPreview, {
    document: { row, status: 'ready', detail: detail(), error: null }, onClose: () => undefined, onRetry: () => undefined,
  }));
  assert.match(html, /data-testid="conciliar-confirming-calculation"/);
  assert.match(html, /Cuadre exacto en céntimos\./);
  assert.match(html, /✔/);
  assert.match(html, /Intereses<\/dt><dd[^>]*>−3,00/);
  assert.match(html, /Comisión<\/dt><dd[^>]*>−3,00/);
  assert.match(html, /IVA de comisión<\/dt><dd[^>]*>−1,00/);
  assert.match(html, /−[^<]*3,00[^<]*−[^<]*3,00[^<]*−[^<]*1,00/);

  const unsealedHtml = renderToStaticMarkup(createElement(ConciliarDocumentPreview, {
    document: { row, status: 'ready', detail: detail({ cuadreExacto: false }), error: null }, onClose: () => undefined, onRetry: () => undefined,
  }));
  assert.doesNotMatch(unsealedHtml, /Cuadre exacto en céntimos\./, 'la igualdad local no sustituye el sellado del servidor');
  assert.doesNotMatch(unsealedHtml, /✔/);

  const mismatch = calculateConfirmingNet(detail({ netoDocumentoCentimos: 9301 }));
  assert.equal(mismatch?.matchesDeclaredNetExactly, false, 'un céntimo impide el cuadre');
  const mismatchHtml = renderToStaticMarkup(createElement(ConciliarDocumentPreview, {
    document: { row, status: 'ready', detail: detail({ netoDocumentoCentimos: 9301, cuadreExacto: false }), error: null }, onClose: () => undefined, onRetry: () => undefined,
  }));
  assert.match(mismatchHtml, /data-testid="conciliar-confirming-calculation"/);
  assert.doesNotMatch(mismatchHtml, /Cuadre exacto en céntimos\./);
  assert.doesNotMatch(mismatchHtml, /✔/);
});

test('la caché de detalle está acotada, deduplica una precarga y no sobrevive a cambio de identidad o versión', async () => {
  const base = { rowId: row.id, decisionHash: sha, updatedAt: '2026-10-28T10:00:00.000Z', identityScope: 'identidad-base' };
  const key = conciliarDetailCacheKey(base);
  assert.notEqual(key, conciliarDetailCacheKey({ ...base, decisionHash: 'c'.repeat(64) }));
  assert.notEqual(key, conciliarDetailCacheKey({ ...base, updatedAt: '2026-10-28T10:00:01.000Z' }));
  assert.notEqual(key, conciliarDetailCacheKey({ ...base, identityScope: 'actuacion:sesion-nueva' }));

  const cache = new ConciliarDetailMemoryCache<string>(2, 20_000);
  let calls = 0;
  let release: ((value: string) => void) | undefined;
  const deferred = new Promise<string>((resolve) => { release = resolve; });
  const first = cache.load(key, () => { calls += 1; return deferred; });
  const second = cache.load(key, () => { calls += 1; return Promise.resolve('segunda'); });
  assert.strictEqual(first, second, 'click durante precarga reutiliza la misma lectura privada');
  assert.equal(calls, 1, 'no inicia un segundo GET para la misma clave');
  release?.('detalle-autorizado');
  assert.equal(await first, 'detalle-autorizado');
  assert.equal(await cache.load(key, () => { calls += 1; return Promise.resolve('no-debe-leerse'); }), 'detalle-autorizado');
  assert.equal(calls, 1, 'un cache hit no falsea una petición adicional');

  cache.set('primero', 'uno', 1);
  cache.set('segundo', 'dos', 2);
  cache.set('tercero', 'tres', 3);
  assert.equal(cache.get('primero', 4), undefined, 'desaloja LRU al superar el límite');
  assert.equal(cache.get('segundo', Number.MAX_SAFE_INTEGER), undefined, 'caduca en memoria con TTL corto');

  let finishAfterClear: ((value: string) => void) | undefined;
  const pending = cache.load('pendiente', () => new Promise<string>((resolve) => { finishAfterClear = resolve; }));
  cache.clear();
  finishAfterClear?.('detalle-anterior');
  await pending;
  assert.equal(cache.get('pendiente'), undefined, 'la resolución anterior no repuebla tras invalidar identidad');
});
