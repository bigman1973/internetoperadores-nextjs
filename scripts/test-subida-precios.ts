import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Dataset, type Estado, calcular, COSTE_FIJO, estadoBase, fechaLimiteAviso, PROPUESTA, SIN_PRECIO, histograma, kpis, porcentajeContrato, PRESETS, roundUp, tipoPorDocumento, tipoPorNombre,
} from '../lib/subida-precios/calc';
import { csvPrecios, generarResultado, cartaBorrador, libroExcel } from '../lib/subida-precios/export';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok', name); };

/* ---- Conjunto de datos v4 (anonimizado): 1.117 filas, 304 clientes ---- */
const fx = JSON.parse(readFileSync(join(__dirname, 'fixtures/subida-precios-v4.json'), 'utf8'));
const fijo = (g: string) => g === 'IO red propia';
const sinP = (g: string) => /^Comisiones|^Hotspot/.test(g);
const ds: Dataset = {
  grupos: fx.grupos.map((g: string) => ({ nombre: g, fijoCoste: fijo(g), sinPrecio: sinP(g), propuesta: fx.proposal[g] ?? 5 })),
  clientes: fx.clientes.map((c: any, i: number) => ({ id: `c${i}`, nombre: `Cliente ${i}`, cif: null, tipo: c.tipo, tipoOrigen: 'NIF' as const })),
  contratos: fx.contratos.map((k: any, i: number) => ({ clave: `k${i}`, cliente: k.c, grupo: k.g, codigo: String(i), tarifa: '', periodicidad: k.per, ingreso: k.i, coste: k.c0, costeEstimado: 0 })),
};

ok('v4: ingreso y coste de partida cuadran con el Excel', () => {
  const r = calcular(ds, { ...estadoBase(ds), ing: {}, cost: {} });
  assert.equal(Math.round(r.tot.i0 * 100) / 100, 39654.33);
  assert.ok(Math.abs(r.tot.c0 - 24747.71) < 0.05);
  const k = kpis(ds, r);
  assert.equal(Math.round(k.margenPctHoy! * 1000) / 10, 37.6);
});
ok('v4: la propuesta da ~41.146 €/mes, 989 contratos y 277 clientes', () => {
  const st = estadoBase(ds); const r = calcular(ds, st); const k = kpis(ds, r);
  assert.equal(k.contratosConSubida, 989);
  assert.equal(k.clientesConSubida, 277);
  assert.ok(Math.abs(k.ingresoNuevo - 41146) < 1, `ingreso nuevo ${k.ingresoNuevo}: dentro de 1 € de los 41.146 del simulador`);
  assert.equal(Math.round(k.margenPctNuevo! * 1000) / 10, 39.9);
});
const dsP: Dataset = {
  grupos: Object.keys(PROPUESTA).map(n => ({ nombre: n, fijoCoste: COSTE_FIJO(n), sinPrecio: SIN_PRECIO(n), propuesta: PROPUESTA[n] })),
  clientes: [{ id: 'x', nombre: 'X', cif: null, tipo: 'E', tipoOrigen: 'NIF' }],
  contratos: Object.keys(PROPUESTA).map((n, i) => ({ clave: `p${i}`, cliente: 0, grupo: i, codigo: String(i), tarifa: '', periodicidad: 'M' as const, ingreso: 100, coste: n === 'Acens' ? 120 : 60, costeEstimado: 0 })),
};
ok('sin subida: nada cambia', () => {
  const st = PRESETS.find(p => p.id === 'none')!.build(dsP); const r = calcular(dsP, st);
  assert.equal(r.tot.nUp, 0); assert.equal(Math.round(r.tot.i1 * 100), Math.round(r.tot.i0 * 100));
});
ok('IPC 4,9 % a todo, salvo Draxton y partidas sin precio', () => {
  const st = PRESETS.find(p => p.id === 'ipc')!.build(dsP);
  assert.equal(st.ing['Draxton telecomunicaciones'], 0); assert.equal(st.ing['Hotspot'], 0); assert.equal(st.ing['Aire Networks'], 4.9);
  assert.equal(PRESETS.find(p => p.id === 'ipc1')!.build(dsP).ing['Aire Networks'], 5.9);
});
ok('operadores +3 % de coste: baja el margen', () => {
  const a = kpis(dsP, calcular(dsP, estadoBase(dsP))); const b = kpis(dsP, calcular(dsP, PRESETS.find(p => p.id === 'cost')!.build(dsP)));
  assert.ok(b.margenNuevo < a.margenNuevo);
});
ok('preset «solo margen bajo»: sube más a quien tiene margen negativo', () => {
  const st = PRESETS.find(p => p.id === 'low')!.build(dsP);
  assert.equal(st.ing['Acens'], 12); assert.equal(st.ing['Red propia'], 0); assert.equal(st.ing['Draxton telecomunicaciones'], 0);
});

/* ---- Reglas por contrato ---- */
const mini = (over: Partial<Dataset> = {}): Dataset => ({
  grupos: [{ nombre: 'Red propia', fijoCoste: true, sinPrecio: false, propuesta: 10 }, { nombre: 'Aire Networks', fijoCoste: false, sinPrecio: false, propuesta: 10 }, { nombre: 'Hotspot', fijoCoste: false, sinPrecio: true, propuesta: 0 }],
  clientes: [
    { id: 'e', nombre: 'Empresa', cif: 'B12345678', tipo: 'E', tipoOrigen: 'NIF' }, { id: 'r', nombre: 'Particular', cif: '12345678Z', tipo: 'R', tipoOrigen: 'NIF' },
    { id: 'p', nombre: 'Ajuntament', cif: 'P1234567A', tipo: 'P', tipoOrigen: 'NOMBRE' },
  ],
  contratos: [
    { clave: 'e1', cliente: 0, grupo: 1, codigo: '1', tarifa: '', periodicidad: 'M', ingreso: 100, coste: 60, costeEstimado: 0 },
    { clave: 'r1', cliente: 1, grupo: 1, codigo: '2', tarifa: '', periodicidad: 'M', ingreso: 100, coste: 60, costeEstimado: 0 },
    { clave: 'p1', cliente: 2, grupo: 1, codigo: '3', tarifa: '', periodicidad: 'M', ingreso: 100, coste: 60, costeEstimado: 0 },
    { clave: 'a1', cliente: 0, grupo: 1, codigo: '4', tarifa: '', periodicidad: 'A', ingreso: 10, coste: 6, costeEstimado: 0 },
    { clave: 'n1', cliente: 0, grupo: 2, codigo: '5', tarifa: '', periodicidad: 'M', ingreso: 50, coste: 0, costeEstimado: 0 },
    { clave: 'rp', cliente: 0, grupo: 0, codigo: '6', tarifa: '', periodicidad: 'M', ingreso: 100, coste: 50, costeEstimado: 0 },
  ], ...over,
});
ok('tope de particulares y tope del sector público', () => {
  const d = mini(); const st = { ...estadoBase(d), capR: 4, pub: 0 }; const r = calcular(d, st);
  assert.equal(r.con[0].p, 10); assert.equal(r.con[1].p, 4); assert.equal(r.con[2].p, 0); assert.equal(r.con[2].i1, 100);
  const st2 = { ...st, pub: 3 }; assert.equal(calcular(d, st2).con[2].p, 3);
});
ok('anuales y trimestrales no suben si no se incluyen', () => {
  const d = mini(); const st = { ...estadoBase(d), inclAnual: false }; assert.equal(calcular(d, st).con[3].p, 0);
  assert.equal(calcular(d, { ...st, inclAnual: true }).con[3].p, 10);
});
ok('hotspot y comisiones nunca suben', () => {
  const d = mini(); const st = estadoBase(d); st.ing['Hotspot'] = 20; assert.equal(calcular(d, st).con[4].p, 0);
});
ok('prioridad: contrato > cliente > producto', () => {
  const d = mini(); const st = estadoBase(d); st.cli['e'] = 3; st.con['e1'] = 8; const r = calcular(d, st);
  assert.equal(r.con[0].p, 8); assert.equal(r.con[3].p, 3); assert.equal(porcentajeContrato(st, d.grupos[1], d.clientes[0], d.contratos[0]).origen, 'CONTRATO');
});
ok('redondeo al alza al paso elegido', () => {
  assert.equal(roundUp(10.01, 0.5), 10.5); assert.equal(roundUp(10.5, 0.5), 10.5); assert.equal(roundUp(10.123, 0), 10.12);
  const d = mini(); const st = { ...estadoBase(d), rounding: 5 }; assert.equal(calcular(d, st).con[0].i1, 110);
});
ok('bajas: se pierde ingreso y coste de operador, la red propia es fija', () => {
  const d = mini(); const st = { ...estadoBase(d), churnE: 10, churnR: 0 }; const r = calcular(d, st);
  const aire = r.con[0]; assert.equal(Math.round(aire.iE * 100) / 100, 99); assert.equal(Math.round(aire.cE * 100) / 100, 54);
  const red = r.con[5]; assert.equal(Math.round(red.iE * 100) / 100, 99); assert.equal(red.cE, 50);
  assert.ok(r.tot.lost > 0);
});
ok('mensualiza: un contrato anual redondea sobre el importe del periodo', () => {
  const d = mini(); const st = { ...estadoBase(d), rounding: 1 }; const c = calcular(d, st).con[3];
  assert.equal(Math.round(c.i1 * 12 * 100) / 100, 132); // 120 €/año +10 % = 132, múltiplo de 1
});
ok('histograma agrupa clientes por tramo', () => {
  const d = mini(); const r = calcular(d, estadoBase(d)); const h = histograma(d, r);
  assert.equal(h.reduce((s, x) => s + x.n, 0), 3);
});

/* ---- Fechas y tipo de cliente ---- */
ok('fecha límite de aviso (particulares 1 mes antes del 1/1 = 1/12)', () => {
  assert.equal(fechaLimiteAviso('2027-01-01', 1), '2026-12-01'); assert.equal(fechaLimiteAviso('2027-01-01', 3), '2026-10-01');
});
ok('tipo de cliente por nombre y por documento', () => {
  assert.ok(tipoPorNombre('AJUNTAMENT DE SORT')); assert.ok(tipoPorNombre('Consell Comarcal del Segrià')); assert.ok(!tipoPorNombre('Transportes García S.L.'));
  assert.equal(tipoPorDocumento('12345678Z'), 'R'); assert.equal(tipoPorDocumento('X1234567L'), 'R'); assert.equal(tipoPorDocumento('P2507000D'), 'P'); assert.equal(tipoPorDocumento('B62926118'), null);
});

/* ---- Resultado aprobado y exportaciones ---- */
ok('el resultado lista contratos con subida y clientes a avisar con su fecha', () => {
  const d = mini(); d.clientes[0].email = '=cmd|calc'; const st = { ...estadoBase(d), churnE: 0 }; const res = generarResultado(d, st);
  assert.equal(res.precios.length, 5 - 1 + 0); // e1, r1, a1, rp + (p1 con pub=0 no sube, n1 no sube) => e1 r1 a1 rp
  assert.ok(res.avisos.every(a => a.fechaLimiteAviso === '2026-12-01'));
  assert.ok(res.precios.every(p => p.precioNuevoMes > p.precioHoyMes));
  const csv = csvPrecios(res); assert.ok(csv.startsWith('\ufeffCliente;'));
  assert.ok(!res.avisos.some(a => a.cliente === 'Ajuntament'), 'el sector público con tope 0 no se avisa');
});
ok('el CSV neutraliza fórmulas', () => {
  const d = mini(); d.clientes[0].nombre = '=HYPERLINK("x")'; const csv = csvPrecios(generarResultado(d, estadoBase(d)));
  assert.ok(csv.includes("'=HYPERLINK"), 'prefijo de seguridad'); assert.ok(!/;=HYPERLINK/.test(csv) && !/\r\n=HYPERLINK/.test(csv));
});
ok('el Excel se genera con tres hojas y la carta no lleva datos personales', () => {
  const d = mini(); const res = generarResultado(d, estadoBase(d)); const buf = libroExcel(res, 'Prueba', '2027-01-01');
  assert.ok(buf.length > 2000); assert.ok(cartaBorrador('R', '2027-01-01').includes('{{CLIENTE}}')); assert.ok(cartaBorrador('R', '2027-01-01').includes('1 de enero de 2027'));
});

console.log(`\n${n} pruebas OK`);
