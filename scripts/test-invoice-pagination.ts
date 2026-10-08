import assert from 'node:assert/strict';
import { invoicePage } from '../lib/finanzas/invoice-pagination';
import { parseProfitFilters } from '../lib/finanzas/sales-profitability';
const invoices = Array.from({ length: 321 }, (_, id) => ({ id }));
const seen = new Set<number>();
for (let page = 1; page <= invoicePage(invoices, 1).totalPages; page++) {
  for (const item of invoicePage(invoices, page).items) { assert.ok(!seen.has(item.id)); seen.add(item.id); }
}
assert.equal(seen.size, 321);
assert.equal(invoicePage(invoices, 7).items.length, 21);
assert.equal(invoicePage(invoices, 99).page, 7);
assert.equal(invoicePage([], 9).from, 0);
assert.equal(invoicePage(invoices, -1).page, 1);
assert.equal(invoicePage(invoices, NaN).page, 1);
assert.equal(invoicePage(invoices, 1, 0).items.length, 50);
const params = new URLSearchParams('desde=2026-10-01&hasta=2026-10-31&nivel=compras&proveedor=  Proveedor exacto  &todasFechas=1');
assert.equal(parseProfitFilters(params).proveedor, 'proveedor exacto');
assert.equal(parseProfitFilters(params).todasFechas, true);
assert.equal(parseProfitFilters(new URLSearchParams('desde=2026-10-01&hasta=2026-10-31')).todasFechas, false);
params.set('proveedor', 'a'.repeat(161));
assert.throws(() => parseProfitFilters(params));
console.log('Paginación íntegra de 321 filas y filtros de proveedor: OK');
