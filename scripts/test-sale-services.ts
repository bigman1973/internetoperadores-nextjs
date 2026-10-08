import assert from 'node:assert/strict';
import { monthlyTemplateEligible, serviceSummary, validateSaleServices } from '../lib/finanzas/sale-services';
const split = [
  { nombre: 'Internet radio', tipo: 'TELECO_RED_PROPIA', base: 25 },
  { nombre: 'Líneas móviles', tipo: 'TELECO_INTERMEDIACION', base: 15 },
];
assert.deepEqual(serviceSummary(validateSaleServices(split, 40), 40), { clasificado: 40, pendiente: 0, completo: true, mixto: true });
assert.deepEqual(serviceSummary(validateSaleServices(split, 50), 50), { clasificado: 40, pendiente: 10, completo: false, mixto: true });
assert.equal(validateSaleServices([{ nombre: 'Abono', tipo: 'PROYECTO', base: -12.55 }], -12.55)[0].base, -12.55);
assert.throws(() => validateSaleServices(split, 35));
for (const input of [
  [{ nombre: 'Servicio', tipo: 'CLIENTE_ENTERO', base: 10 }],
  [{ nombre: 'Servicio', tipo: 'PROYECTO', base: 1.005 }],
  [{ nombre: 'Servicio', tipo: 'PROYECTO', base: '10' }],
  [{ nombre: '', tipo: 'PROYECTO', base: 10 }],
  [{ nombre: 'Servicio', tipo: 'PROYECTO', base: -10 }],
  [{ nombre: 'Servicio', tipo: 'PROYECTO', base: 0 }],
  [{ nombre: 'Servicio', tipo: 'PROYECTO', base: true }],
  [{ nombre: 'Servicio', tipo: '__proto__', base: 10 }],
  [{ id: 'x', nombre: 'Servicio A', tipo: 'PROYECTO', base: 5 }, { id: 'x', nombre: 'Servicio B', tipo: 'PROYECTO', base: 5 }],
]) assert.throws(() => validateSaleServices(input, 100));
const current = { cif: 'B00000000', serie: 'TEST', concepto: 'Pack de prueba', lineas: '[{"concepto":"Pack","base":40}]', base: 40, fecha: new Date('2026-10-15') };
const previous = { ...current, fecha: new Date('2026-09-15'), lineas: '[{"base":40,"concepto":"Pack"}]' };
assert.equal(monthlyTemplateEligible(current, previous), true);
for (const changes of [ { cif: null }, { cif: 'B00000001' }, { serie: 'OTRA' }, { base: 41 }, { concepto: 'Otra prestación' }, { lineas: null }, { fecha: new Date('2026-08-15') } ]) assert.equal(monthlyTemplateEligible(current, { ...previous, ...changes }), false);
assert.equal(monthlyTemplateEligible({ ...current, lineas: null, concepto: null }, { ...previous, lineas: null, concepto: null }), false);
assert.equal(monthlyTemplateEligible({ ...current, fecha: new Date('2027-01-01') }, { ...previous, fecha: new Date('2026-12-31') }), true);
console.log('Servicios: packs mixtos, céntimos, remanente, abonos y referencias mensuales compatibles correctos; sin copiar costes ni horas.');
