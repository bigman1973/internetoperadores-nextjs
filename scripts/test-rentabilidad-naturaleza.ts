import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateReport } from '../lib/rentabilidad/report';
import { classifyIncomeLine } from '../lib/rentabilidad/engine';
import { costRealVsEstimatedRows, incomeNatureRows } from '../app/admin/rentabilidad/view-model';

const contract = (code: string, extra: any = {}) => ({ contractCode: code, clientCode: 'A', clientName: 'Cliente de prueba', provider: 'Aire Networks', tariff: 'CANARIO', price: '60', discount: '0', periodMonths: 1, active: true, startDate: '2026-01-01', source: 'LORENA', ...extra });
const line = (code: string, concept: string, amount: string, extra: any = {}) => ({ contractCode: code, clientCode: 'A', clientName: 'Cliente de prueba', concept, baseAmount: amount, month: '2026-10', date: '2026-10-05', ...extra });

test('conceptos reales de ISP se clasifican por naturaleza', () => {
  const casos: Array<[string, string]> = [
    ['Router 4G (cuota única)', 'INSTALACION_PUNTUAL'],
    ['Terminal inalámbrico con WiFi WI-ONE (Cuota única-compra)', 'INSTALACION_PUNTUAL'],
    ['Migración de datos (cuota única)', 'INSTALACION_PUNTUAL'],
    ['Pack 50 licencias CAL (cuota única)', 'INSTALACION_PUNTUAL'],
    ['eSIM (Cuota única)', 'INSTALACION_PUNTUAL'],
    ['Cargo por no devolución equipos', 'INSTALACION_PUNTUAL'],
    ['Instalación fibra oficina', 'INSTALACION_PUNTUAL'],
    ['Servicios de Externalización IT- Servicio de horas mensuales según contrato (PCL26-00039)- FONOLLERES', 'SERVICIOS_IT'],
    ['SERVICIO DE HORAS MENSUALES SEGÚN CONTRATO. RECURSO IT BARCELONA', 'SERVICIOS_IT'],
    ['Cuota Servicio- BOLSA HORAS TÉCNICO N1 (Tahal) de Abril', 'SERVICIOS_IT'],
    ['Cuota Servicio- IO BACKUP CLOUD 1TB de octubre * PUESTA EN MARCHA IO BACKUP(1 Un.) - 47,64€', 'RECURRENTE'],
    ['Cuota Servicio IP FIJA de junio * IP FIXA UNICA - 9,00€', 'RECURRENTE'],
    ['Cuota Servicio DRAXTON LLEIDA - DIBA PRINCIPAL FTTO 100M/100M de mayo', 'RECURRENTE'],
    ['', 'RECURRENTE'],
  ];
  for (const [concepto, esperado] of casos) assert.equal(classifyIncomeLine(concepto), esperado, concepto);
  assert.equal(classifyIncomeLine('Cuota mensual', 'MANTENIMIENTO INFORMÁTICO GENERAL'), 'SERVICIOS_IT');
});

test('el informe separa recurrente, IT e instalaciones y la suma cuadra con el total', () => {
  const i: any = { contracts: [contract('1'), contract('2', { provider: 'IO', tariff: 'MANTENIMIENTO INFORMÁTICO GENERAL' })], lines: [
    line('1', 'Cuota Servicio Internet de octubre', '60'), line('1', 'Router 4G (cuota única)', '120'), line('1', 'Migración de datos (cuota única)', '80'),
    line('2', 'Servicios de Externalización IT- Servicio de horas mensuales según contrato', '1000'),
  ] };
  const r: any = calculateReport(i, '2026-10', 'real');
  const aire = r.products.find((p: any) => p.product === 'Aire Networks');
  assert.equal(aire.income, 260); assert.equal(aire.incomeOneOff, 200); assert.equal(aire.incomeIT, 0); assert.equal(aire.incomeRecurring, 60);
  const it = r.products.find((p: any) => p.product === 'Servicios IT');
  assert.equal(it.income, 1000); assert.equal(it.incomeIT, 1000); assert.equal(it.incomeRecurring, 0);
  const m = r.summary.month;
  assert.equal(m.incomeOneOff, 200); assert.equal(m.incomeIT, 1000); assert.equal(m.incomeRecurring, 60); assert.equal(m.income, 1260);
  assert.equal(Math.round((m.incomeRecurring + m.incomeIT + m.incomeOneOff) * 100), Math.round(m.income * 100));
  const c1 = r.monthly.find((x: any) => x.month === '2026-10') ? null : null; void c1;
});

test('la vista por naturaleza añade TOTAL y el porcentaje puntual', () => {
  const rows = incomeNatureRows([{ product: 'A', income: 260, incomeIT: 0, incomeOneOff: 200, incomeRecurring: 60 }, { product: 'B', income: 1000, incomeIT: 1000, incomeOneOff: 0, incomeRecurring: 0 }, { product: 'C', income: 0 }]);
  assert.equal(rows.length, 3); const total = rows.at(-1)!;
  assert.equal(total.product, 'TOTAL'); assert.equal(total.income, 1260); assert.equal(total.incomeOneOff, 200); assert.equal(total.oneOffPct, 15.87);
});

test('coste real frente a estimado: marca cada fuente estimada y no mezcla importes', () => {
  const rows = costRealVsEstimatedRows([
    { product: 'Aire Networks', cost: 100, estimatedCost: 0, sources: [{ status: 'REAL', amount: 100, provider: 'Aire' }] },
    { product: 'Wildix', cost: 0, estimatedCost: 40, sources: [{ status: 'ESTIMADO', amount: 40, provider: 'Wildix', payer: 'Vola' }] },
    { product: 'Telefónica', cost: 50, estimatedCost: 50, sources: [{ status: 'REAL', amount: 50 }, { status: 'ESTIMADO', amount: 50 }] },
    { product: 'Otros', cost: 0, estimatedCost: 0, sources: [] },
  ]);
  assert.deepEqual(rows.map(r => [r.product, r.costReal, r.costEstimated, r.status]), [['Aire Networks', 100, 0, 'REAL'], ['Wildix', 0, 40, 'ESTIMADO'], ['Telefónica', 50, 50, 'REAL + ESTIMADO'], ['TOTAL', 150, 90, 'REAL + ESTIMADO']]);
  assert.equal(rows[1].estimatedSources.length, 1); assert.equal(rows[2].estimatedPct, 50); assert.equal(rows.at(-1)!.costTotal, 240);
});

const drax = (extra: any = {}) => contract('5759', { provider: 'Telefónica', clientName: 'DRAXTON EUROPE ASIA', tariff: 'CONEXIÓN INTERNET DRAXTON', description: 'FTTO Draxton', price: '499.5', active: false, endDate: '2026-10-31', ...extra });
const ggccActivo = (extra: any = {}) => ({ id: 'g1', codigoContrato: 'DRX-TELCO 2026', titulo: 'Draxton telecomunicaciones Internet', estado: 'Activo', importeMensual: 6429.04, fechaInicioServicio: '2026-04-01', fechaFin: '2028-02-20', contratosProveedor: [], personalAsignado: [], ...extra });

test('Draxton sigue activo en nov y dic mientras el contrato GGCC esté vigente, con alerta de discrepancia', () => {
  const i: any = { contracts: [drax()], lines: [line('5759', 'Cuota Servicio DRAXTON de octubre', '499.5')] };
  for (const month of ['2026-11', '2026-12']) {
    const r: any = calculateReport(i, month, 'real', { ggcc: [ggccActivo()] });
    const p = r.products.find((x: any) => x.product === 'Draxton telecomunicaciones');
    assert.equal(p.contracts, 1, month);
    assert.equal(p.contractedIncome, 499.5, month);
    assert.ok(r.alerts.some((a: any) => a.type === 'VIGENCIA_CONTRATO_VS_BAJA' && /5759/.test(a.title)), month);
    assert.equal(i.contracts[0].active, false); // no se sobrescribe la fuente
  }
});

test('Draxton: sin contrato GGCC vigente (caducado o no activo) la baja se respeta', () => {
  const i: any = { contracts: [drax()], lines: [] };
  for (const g of [ggccActivo({ estado: 'Finalizado' }), ggccActivo({ fechaFin: '2026-10-31' }), ggccActivo({ fechaInicioServicio: '2027-01-01', fechaInicio: '2027-01-01' })]) {
    const r: any = calculateReport(i, '2026-11', 'real', { ggcc: [g] });
    assert.equal(r.products.find((x: any) => x.product === 'Draxton telecomunicaciones')?.contracts ?? 0, 0);
    assert.ok(!r.alerts.some((a: any) => a.type === 'VIGENCIA_CONTRATO_VS_BAJA'));
  }
});

test('la vigencia GGCC no reactiva contratos de otros productos ni líneas con alta futura', () => {
  const i: any = { contracts: [contract('1', { active: false, endDate: '2026-10-31' }), drax({ contractCode: '5800', startDate: '2027-03-01', endDate: undefined, active: true })], lines: [] };
  const r: any = calculateReport(i, '2026-11', 'real', { ggcc: [ggccActivo()] });
  assert.equal(r.products.find((x: any) => x.product === 'Aire Networks')?.contracts ?? 0, 0);
  assert.equal(r.products.find((x: any) => x.product === 'Draxton telecomunicaciones')?.contracts ?? 0, 0);
});
