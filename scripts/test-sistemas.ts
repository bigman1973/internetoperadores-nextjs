import assert from 'node:assert/strict';
import { calcularCostes, servicioDeFactura, servicioDeMovimiento, tasaDeMes, listaMeses, type ReglaIn, type ServicioIn } from '../lib/sistemas/costes';
import { pareceCredencial } from '../lib/sistemas/secretos';

let ok = 0; const t = (n: string, f: () => void) => { f(); ok++; console.log('OK ', n); };
const S = (id: string, over: Partial<ServicioIn> = {}): ServicioIn => ({ id, slug: id, nombre: id, periodicidad: 'MENSUAL', estado: 'activo', prevision2027Manual: null, ...over });
const R = (servicioId: string, prioridad: number, p: string | null, c: string | null, b: string | null): ReglaIn => ({ servicioId, prioridad, proveedorRegex: p, conceptoRegex: c, bancoRegex: b, activa: true });
const servicios = [S('anthropic', { periodicidad: 'VARIABLE' }), S('m365'), S('acens'), S('hubspot', { estado: 'en_baja', periodicidad: 'ANUAL' }), S('isp'), S('manus', { periodicidad: 'VARIABLE' })];
const reglas = [
  R('m365', 10, 'microsoft', null, 'microsoft'), R('m365', 20, 'telefonica soluciones', 'microsoft|365|productividad', null),
  R('acens', 50, 'telefonica soluciones', null, 'acens'), R('anthropic', 100, 'anthropic', null, 'anthropic'),
  R('hubspot', 100, 'hubspot', null, 'hubspot'), R('isp', 100, 'ispgesti', null, 'ispgesti'), R('manus', 100, 'manus', null, 'manus ai'),
];
const base = { desde: '2026-01', hasta: '2026-11', mesActual: '2026-11', servicios, reglas, tasas: {} as Record<string, number> };
const f = (id: string, proveedor: string, fecha: string, b: number, concepto: string | null = null) => ({ id, proveedor, numFactura: id, fecha, base: b, total: b * 1.21, concepto });

t('regla por proveedor y acentos', () => {
  assert.equal(servicioDeFactura({ proveedor: 'ISPGestión Provider S.L', concepto: null }, reglas), 'isp');
  assert.equal(servicioDeFactura({ proveedor: 'Anthropic, PBC', concepto: null }, reglas), 'anthropic');
  assert.equal(servicioDeFactura({ proveedor: 'Proveedor desconocido', concepto: null }, reglas), null);
});
t('Telefónica Soluciones: Microsoft 365 a su servicio y el resto a Acens (por prioridad y concepto)', () => {
  assert.equal(servicioDeFactura({ proveedor: 'TELEFÓNICA SOLUCIONES DE INFORMÁTICA Y COMUNICACIONES DE ESPAÑA S.A.U.', concepto: 'Cuota: Microsoft 365 Empresa Estandar' }, reglas), 'm365');
  assert.equal(servicioDeFactura({ proveedor: 'TELEFÓNICA SOLUCIONES DE INFORMÁTICA Y COMUNICACIONES DE ESPAÑA S.A.U.', concepto: 'Cuota: Panda AntiRansomware 360' }, reglas), 'acens');
});
t('cargo del banco: tarjeta de Manus y de Anthropic', () => {
  assert.equal(servicioDeMovimiento({ concepto: 'Compra Manus Ai, Singapore, Tarjeta 4176', tercero: null }, reglas), 'manus');
  assert.equal(servicioDeMovimiento({ concepto: 'Compra Anthropic* Claude Team, Anthropic.com', tercero: null }, reglas), 'anthropic');
  assert.equal(servicioDeMovimiento({ concepto: 'Compra en Mercadona', tercero: null }, reglas), null);
});
t('coste mensual = base de factura (sin IVA) y no cuenta copias ni duplicados (los filtra la capa de datos)', () => {
  const r = calcularCostes({ ...base, facturas: [f('a', 'ISPGestión Provider S.L', '2026-10-01', 250), f('b', 'ISPGestión Provider S.L', '2026-11-03', 250)], movimientos: [], manuales: [] });
  const s = r.servicios.find(x => x.slug === 'isp')!; assert.equal(s.meses['2026-10'].facturado, 250); assert.equal(s.totalAnio, 500);
});
t('un cargo con factura vinculada o con justificante no se cuenta dos veces ni se avisa', () => {
  const mov = (id: string, over: any) => ({ id, fecha: '2026-09-15', importe: -63.12, concepto: 'Compra Anthropic* Claude Team', tercero: null, facturaId: null, conDocumento: false, ...over });
  const r = calcularCostes({ ...base, facturas: [f('a', 'Anthropic, PBC', '2026-09-13', 63.12)], movimientos: [mov('m1', { facturaId: 'a' }), mov('m2', { conDocumento: true }), mov('m3', {})], manuales: [] });
  const s = r.servicios.find(x => x.slug === 'anthropic')!;
  assert.equal(r.cargosSinFactura.length, 1); assert.equal(r.cargosSinFactura[0].movId, 'm3'); assert.equal(s.meses['2026-09'].facturado, 63.12); assert.equal(s.meses['2026-09'].sinFactura, 63.12);
  assert.ok(r.avisos.some(a => /no tienen factura ni justificante/.test(a)));
});
t('cargos positivos (abonos) no son coste', () => {
  const r = calcularCostes({ ...base, facturas: [], movimientos: [{ id: 'p', fecha: '2026-09-15', importe: 50, concepto: 'Abono Manus Ai', tercero: null, facturaId: null, conDocumento: false }], manuales: [] });
  assert.equal(r.cargosSinFactura.length, 0);
});
t('USD→EUR con la tasa del mes y con aviso si falta', () => {
  const man = { id: 'u', servicioId: 'manus', fecha: '2026-10-10', concepto: 'Créditos', importe: 100, moneda: 'USD' as const, ivaPct: 0, tipo: 'RECURRENTE' as const, estado: 'REAL' as const, anulado: false };
  const r1 = calcularCostes({ ...base, facturas: [], movimientos: [], manuales: [man], tasas: { '2026-10': 0.9 } });
  assert.equal(r1.servicios.find(x => x.slug === 'manus')!.meses['2026-10'].manual, 90); assert.equal(r1.avisos.length, 0);
  const r2 = calcularCostes({ ...base, facturas: [], movimientos: [], manuales: [man], tasas: {} });
  assert.ok(r2.avisos.some(a => /Falta la tasa USD\/EUR/.test(a))); assert.equal(r2.servicios.find(x => x.slug === 'manus')!.meses['2026-10'].manual, 0);
  const r3 = calcularCostes({ ...base, facturas: [], movimientos: [], manuales: [man], tasas: { '2026-09': 0.8 } });
  assert.equal(r3.servicios.find(x => x.slug === 'manus')!.meses['2026-10'].manual, 80); assert.ok(r3.avisos.some(a => /más cercano/.test(a)));
  assert.deepEqual(tasaDeMes('2026-10', { '2026-12': 1 }), { tasa: 1, exacta: false });
});
t('pago único de la API de ISP: 600 € + IVA va aparte y no entra en el ritmo mensual ni en la previsión', () => {
  const man = { id: 'x', servicioId: 'isp', fecha: null, concepto: 'API avanzada', importe: 600, moneda: 'EUR' as const, ivaPct: 21, tipo: 'UNICO' as const, estado: 'PREVISTO' as const, anulado: false };
  const r = calcularCostes({ ...base, facturas: [f('a', 'ISPGestión Provider S.L', '2026-09-02', 250), f('b', 'ISPGestión Provider S.L', '2026-10-01', 250), f('c', 'ISPGestión Provider S.L', '2026-08-03', 250)], movimientos: [], manuales: [man] });
  assert.equal(r.pagosUnicos.length, 1); assert.equal(r.pagosUnicos[0].base, 600); assert.equal(r.pagosUnicos[0].iva, 126); assert.equal(r.pagosUnicos[0].total, 726);
  assert.equal(r.totalPagosUnicosPrevistos, 726); assert.equal(r.totalPagosUnicosReales, 0);
  const s = r.servicios.find(x => x.slug === 'isp')!; assert.equal(s.totalAnio, 750); assert.equal(s.prevision2027, 3000);
});
t('previsión 2027: ritmo de los últimos 3 meses cerrados ×12 (no la media del año) y subida de proveedores', () => {
  const fs = [f('1', 'Anthropic, PBC', '2026-01-05', 10), f('2', 'Anthropic, PBC', '2026-08-05', 100), f('3', 'Anthropic, PBC', '2026-09-05', 100), f('4', 'Anthropic, PBC', '2026-10-05', 100), f('5', 'Anthropic, PBC', '2026-11-05', 999)];
  const r = calcularCostes({ ...base, facturas: fs, movimientos: [], manuales: [], subidaPct: 10 });
  const s = r.servicios.find(x => x.slug === 'anthropic')!; assert.equal(s.runRateMensual, 100); assert.equal(s.anualizado, 1200); assert.equal(s.prevision2027, 1320);
  assert.deepEqual(r.mesesCerrados.slice(-3), ['2026-08', '2026-09', '2026-10']);
});
t('servicio anual: la previsión es lo pagado en el año; en baja: cero y aviso si sigue costando', () => {
  const r = calcularCostes({ ...base, facturas: [f('h1', 'HubSpot Ireland Ltd', '2026-08-08', 1134), f('h2', 'HubSpot Ireland Ltd', '2026-10-08', 1134)], movimientos: [], manuales: [] });
  const s = r.servicios.find(x => x.slug === 'hubspot')!; assert.equal(s.prevision2027, 0); assert.equal(s.previsionOrigen, 'EN_BAJA');
  assert.ok(r.avisos.some(a => /figura en baja/.test(a)));
  const r2 = calcularCostes({ ...base, servicios: [S('hubspot', { periodicidad: 'ANUAL' })], facturas: [f('h1', 'HubSpot Ireland Ltd', '2026-02-08', 1134)], movimientos: [], manuales: [] });
  assert.equal(r2.servicios[0].prevision2027, 1134);
});
t('previsión manual manda sobre el cálculo', () => {
  const r = calcularCostes({ ...base, servicios: [S('isp', { prevision2027Manual: 5000 })], facturas: [f('a', 'ISPGestión Provider S.L', '2026-10-01', 250)], movimientos: [], manuales: [] });
  assert.equal(r.servicios[0].prevision2027, 5000); assert.equal(r.servicios[0].previsionOrigen, 'MANUAL');
});
t('el mes en curso no entra en el ritmo y los costes manuales anulados se ignoran', () => {
  const man = { id: 'z', servicioId: 'manus', fecha: '2026-10-10', concepto: 'x', importe: 50, moneda: 'EUR' as const, ivaPct: 0, tipo: 'RECURRENTE' as const, estado: 'REAL' as const, anulado: true };
  const r = calcularCostes({ ...base, facturas: [], movimientos: [], manuales: [man] });
  assert.equal(r.servicios.find(x => x.slug === 'manus')!.totalAnio, 0);
});
t('listaMeses', () => { assert.deepEqual(listaMeses('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']); });
t('filtro de credenciales: bloquea tokens y contraseñas, deja pasar texto normal', () => {
  for (const x of ['ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'sk-proj-abcdefghijklmnopqrstu', 'contraseña: Hola1234!', 'password=abc12345', 'postgresql://postgres:secreto@host:5432/db', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc', 'token: abcdef123456'])
    assert.equal(pareceCredencial(x), true, x);
  for (const x of ['Titular: Víctor Giró', 'Plan Team 5 usuarios, renovación anual', 'La clave del servicio está en el gestor de contraseñas', 'Cuenta de IT en vercel.com/internet-operadores']) assert.equal(pareceCredencial(x), false, x);
});
console.log(`\n${ok} pruebas OK`);
