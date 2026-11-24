import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateReport, applyReportMode } from '../lib/rentabilidad/report';
import { compactReportPresentation } from '../lib/rentabilidad/presentation';
import { INITIAL_COST_RULES } from '../lib/rentabilidad/defaults';
const input = () => ({ contracts: [{ contractCode: 'TEST1', clientCode: 'CLIENT1', clientName: 'Cliente sintético', provider: 'Aire Networks', tariff: 'CANARIO', price: '60', periodMonths: 1, active: true, startDate: '2026-01-01', source: 'TEST' }], lines: [{ contractCode: 'TEST1', clientCode: 'CLIENT1', date: '2026-10-01', concept: 'Cuota sintética', baseAmount: '60', month: '2026-10' }], costs: [], rules: INITIAL_COST_RULES, references: [], decisions: [] });
test('compactación no muta la foto ni pierde contratos, costes ni fuentes seleccionadas', () => {
  const full = calculateReport(input(), '2026-10'), before = JSON.stringify(full);
  const slim = compactReportPresentation(full);
  assert.equal(JSON.stringify(full), before);
  assert.equal(slim.contracts, undefined);
  assert.deepEqual(slim.clients.flatMap((c: any) => c.contracts).sort((a: any,b: any) => a.contractCode.localeCompare(b.contractCode)), full.contracts.slice().sort((a: any,b: any) => a.contractCode.localeCompare(b.contractCode)));
  for (const key of ['products','clients','summary','comparison','alerts','controls','references','externalCosts','initialCostByInvoiceMonth']) assert.deepEqual(slim[key], full[key]);
  for (let i=0;i<full.monthly.length;i++) for (let j=0;j<full.monthly[i].products.length;j++) {
    const { sources, ...metrics } = full.monthly[i].products[j];
    assert.deepEqual(slim.monthly[i].products[j], metrics);
  }
});
test('compactación después de vista contratada conserva null y pendientes', () => {
  const full = applyReportMode(calculateReport(input(), '2026-10'), 'contratado');
  const slim = compactReportPresentation(full);
  assert.deepEqual(slim.clients, full.clients); assert.deepEqual(slim.summary, full.summary);
  assert.equal(slim.clients[0].contracts[0].cost, null); assert.equal(slim.clients[0].contracts[0].margin, null);
});
test('factura tardía cambia hash económico y resultado; repetición sin cambios lo conserva', () => {
  const data = input(), empty = calculateReport(data, '2026-10');
  const late = { id: 'SYNTHETIC_LATE', provider: 'Aire Networks', number: 'SYNTH-LATE', date: '2026-10-10', base: 20 };
  const changed = calculateReport(data, '2026-10', 'real', { invoices: [late] });
  const repeated = calculateReport(data, '2026-10', 'real', { invoices: [late] });
  assert.notEqual(changed.controls.sourceHash, empty.controls.sourceHash);
  assert.equal(changed.controls.sourceHash, repeated.controls.sourceHash);
  assert.equal(changed.products.find((p:any)=>p.product==='Aire Networks').cost, 20);
  assert.equal(empty.products.find((p:any)=>p.product==='Aire Networks').cost, 0);
});
