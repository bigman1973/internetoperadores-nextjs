import assert from 'node:assert/strict';
import {
  availablePercentage,
  endOfProfitDay,
  literalLike,
  parseProfitFilters,
  percentageToHundredths,
  toMoney,
  validProfitDay,
} from '../lib/finanzas/sales-profitability';

assert.equal(validProfitDay('2000-01-01'), true);
assert.equal(validProfitDay('2200-12-31'), true);
assert.equal(validProfitDay('1999-12-31'), false);
assert.equal(validProfitDay('2201-01-01'), false);
assert.equal(validProfitDay('2026-02-29'), false);
assert.equal(validProfitDay('2024-02-29'), true);
assert.equal(endOfProfitDay('2026-12-31').toISOString(), '2027-01-01T00:00:00.000Z');

const defaultFilters = parseProfitFilters(new URLSearchParams('desde=2026-01-01&hasta=2026-01-31'));
assert.equal(defaultFilters.nivel, 'servicios');
assert.equal(defaultFilters.limit, 25);
assert.equal(parseProfitFilters(new URLSearchParams('desde=2026-01-01&hasta=2026-01-31&servicioKey=TELECO_RED_PROPIA')).servicioKey, 'TELECO_RED_PROPIA');
for (const query of [
  'desde=2026-02-30&hasta=2026-03-01',
  'desde=2026-03-01&hasta=2026-02-28',
  'desde=1999-01-01&hasta=2026-01-01',
  'desde=2026-01-01&hasta=2026-01-31&limit=51',
  'desde=2026-01-01&hasta=2026-01-31&page=0',
  'desde=2026-01-01&hasta=2026-01-31&nivel=inyeccion',
  'desde=2026-01-01&hasta=2026-01-31&servicioKey=todo',
]) assert.throws(() => parseProfitFilters(new URLSearchParams(query)), query);

assert.equal(literalLike('50%_\\'), '%50\\%\\_\\\\%');
assert.equal(percentageToHundredths(0.01), 1);
assert.equal(percentageToHundredths(100), 10000);
assert.equal(percentageToHundredths(12.345), null);
assert.equal(percentageToHundredths(0), null);
assert.equal(percentageToHundredths(100.01), null);
assert.equal(availablePercentage(7_500), 2_500);
assert.equal(availablePercentage(10_500), 0);
assert.equal(toMoney(0.1 + 0.2), 0.3);
assert.equal(toMoney(-12.345), -12.34);

console.log(JSON.stringify({
  fechasISO2000a2200: true,
  filtrosObligatorios: true,
  busquedaLiteralEscapada: true,
  porcentajesGlobalesEnCentimas: true,
  redondeoPresentacionSoloDinero: true,
}));
