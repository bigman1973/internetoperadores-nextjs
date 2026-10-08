import assert from 'node:assert/strict';
import { allocationCents, parseCostFilters, normalizedProviderKey, validDay } from '../lib/finanzas/cost-analytics';
assert.equal(validDay('2026-09-30'), true);
assert.equal(validDay('2026-02-30'), false);
assert.equal(validDay('2024-02-29'), true);
assert.equal(validDay('2025-02-29'), false);
assert.equal(parseCostFilters(new URLSearchParams('desde=2026-09-01&hasta=2026-09-30')).limit, 30);
for (const q of ['desde=2026-09-31', 'desde=2026-10-01&hasta=2026-09-30', 'page=-1', 'limit=101', 'limit=0', 'page=NaN', 'page=2.5', 'nivel=sql', 'estadoAnalitica=arbitrario']) {
  assert.throws(() => parseCostFilters(new URLSearchParams(q)), q);
}
assert.equal(normalizedProviderKey(' Empresa   ejemplo ', ' b-123 '), 'cif:B123');
assert.equal(normalizedProviderKey(' Empresa   ejemplo ', null), 'nombre:EMPRESA EJEMPLO');
assert.deepEqual(allocationCents(100, 80, true), { assigned: 8000, remaining: 2000, issue: false });
assert.deepEqual(allocationCents(100, 101, true), { assigned: 10000, remaining: 0, issue: true });
assert.deepEqual(allocationCents(100, -5, true), { assigned: 0, remaining: 10000, issue: true });
assert.deepEqual(allocationCents(-100, -80, true), { assigned: -8000, remaining: -2000, issue: false });
assert.deepEqual(allocationCents(100, 0, true), { assigned: 0, remaining: 10000, issue: true });
assert.equal(allocationCents(100, 80, false).assigned, 0);
assert.equal(allocationCents(12.34, 12.34, true).remaining, 0);
for (const [base, allocated] of [[100, 0], [100, 80], [100, 130], [-100, -80], [0.3, 0.1 + 0.2]]) {
  const result = allocationCents(base, allocated, true);
  assert.equal(result.assigned + result.remaining, Math.round(base * 100));
}
console.log('Regresiones de costes: período, paginación, agrupación y céntimos correctos');
