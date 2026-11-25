import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { construirDesglose, codigosContratos, idsFacturasRecibidas, parteDelMes, seriesDelProducto, type DatosDesglose } from '../lib/rentabilidad/desglose';
import { querySchema } from '../app/api/admin/rentabilidad/_shared';

// Foto sintética: un cliente con dos contratos (uno mensual, uno trimestral), un producto con serie sin contrato y costes real/estimado.
const foto = () => ({
  period: '2026-10',
  products: [
    { product: 'Fibra', income: 130, rawCost: 40, rawEstimatedCost: 20, cost: 40, estimatedCost: 20, contracts: 2, sources: [
      { source: 'factura:F1:linea:0', sourceId: 'F1', amount: 40, status: 'REAL', provider: 'Proveedor A', description: 'Línea fibra', sourceDate: '2026-10-05' },
      { source: 'estimacion:2026-10:b:referencia', amount: 20, status: 'ESTIMADO', provider: 'Proveedor B', description: 'Estimación del hueco' }] },
    { product: 'Zoom', income: 50, rawCost: 0, rawEstimatedCost: 0, contracts: 0, sources: [{ source: 'ISP_FACTURAS_SERIE', serie: 'ZOOM', amount: 50, status: 'REAL' }] },
  ],
  clients: [{ clientCode: 'C1', clientName: 'Cliente Uno', income: 130, contracts: [
    { contractCode: 'K1', clientName: 'Cliente Uno', product: 'Fibra', tariff: 'FIBRA 300', income: 100, costSources: [
      { source: 'factura:F1:linea:0', sourceId: 'F1', amount: 30, status: 'REAL', provider: 'Proveedor A', method: 'peso en ingreso del producto', description: 'Línea fibra' },
      { source: 'estimacion:2026-10:b:referencia', amount: 15, status: 'ESTIMADO', provider: 'Proveedor B', method: 'Mb contratados' }] },
    { contractCode: 'K2', clientName: 'Cliente Uno', product: 'Fibra', tariff: 'FIBRA 100', income: 30, costSources: [
      { source: 'factura:F1:linea:0', sourceId: 'F1', amount: 10, status: 'REAL', provider: 'Proveedor A', method: 'peso en ingreso del producto', description: 'Línea fibra' },
      { source: 'estimacion:2026-10:b:referencia', amount: 5, status: 'ESTIMADO', provider: 'Proveedor B', method: 'Mb contratados' }] },
  ] }],
});
const datos = (): DatosDesglose => ({
  lineas: [
    { contrato: 'K1', fecha: '2026-10-01', mes: '2026-10', base: 100, concepto: 'Cuota fibra octubre', tarifa: 'FIBRA 300', cif: 'B111', periodMonths: 1 },
    { contrato: 'K2', fecha: '2026-10-01', mes: '2026-10', base: 90, concepto: 'Cuota trimestral', tarifa: 'FIBRA 100', cif: 'B111', periodMonths: 3 },
    { contrato: 'K2', fecha: '2026-07-01', mes: '2026-07', base: 90, concepto: 'Cuota trimestral anterior', tarifa: 'FIBRA 100', cif: 'B111', periodMonths: 3 },
    { contrato: 'K9', fecha: '2026-10-01', mes: '2026-10', base: 999, concepto: 'De otro cliente', tarifa: 'X', cif: 'B999', periodMonths: 1 },
  ],
  emitidas: [{ cif: 'B111', fecha: '2026-10-01', numero: 'F26/1', base: 190 }],
  recibidas: [{ id: 'F1', proveedor: 'Proveedor A', numero: 'A-2026-77', fecha: '2026-10-05', base: 120, concepto: null }],
  series: [{ serie: 'ZOOM', numero: 'ZOOM26/9', fecha: '2026-10-19', cliente: 'Instituto', base: 50 }],
  versiones: [{ codigo: 'K1', payload: { price: '100', periodicity: 'MENSUAL', fechaAlta: '2024-01-10', estado: 'Activo' } }],
});

test('facturado por cliente: suma las líneas del mes, reparte la cuota trimestral y cuadra con la tabla', () => {
  const r = construirDesglose(foto(), 'cliente', 'C1', 'facturado', '2026-10', datos());
  assert.equal(r.cifraTabla, 130);
  assert.equal(r.sumaDetalle, 130);
  assert.equal(r.cuadra, true);
  assert.equal(r.filas.length, 2, 'la cuota trimestral de julio cubre jul-sep y no entra en octubre');
  assert.ok(r.filas.every(f => f.contrato !== 'K9'), 'no mezcla contratos de otro cliente');
  const trimestral = r.filas.filter(f => f.contrato === 'K2').map(f => f.importe).sort();
  assert.deepEqual(trimestral, [30]);
});
test('el nº de factura solo se muestra si es único ese día; si no, «sin dato» o candidatas, nunca inventado', () => {
  const d = datos(); d.emitidas.push({ cif: 'B111', fecha: '2026-10-01', numero: 'F26/2', base: 5 });
  const varias = construirDesglose(foto(), 'cliente', 'C1', 'facturado', '2026-10', d);
  assert.ok(varias.filas.every(f => f.factura === null && /Una de 2/.test(String(f.facturaNota))));
  const unica = construirDesglose(foto(), 'cliente', 'C1', 'facturado', '2026-10', datos());
  assert.ok(unica.filas.filter(f => f.fecha === '2026-10-01').every(f => f.factura === 'F26/1' && f.facturaExacta));
  const ninguna = construirDesglose(foto(), 'cliente', 'C1', 'facturado', '2026-10', { ...datos(), emitidas: [] });
  assert.ok(ninguna.filas.every(f => f.factura === null && f.facturaNota === null));
  assert.equal(ninguna.cobertura.sinFactura, 2);
});
test('facturado por producto incluye las series sin contrato (Zoom)', () => {
  const r = construirDesglose(foto(), 'producto', 'Zoom', 'facturado', '2026-10', datos());
  assert.equal(r.sumaDetalle, 50); assert.equal(r.cuadra, true);
  assert.equal(r.filas[0].factura, 'ZOOM26/9'); assert.equal(r.filas[0].contrato, null);
  assert.deepEqual(seriesDelProducto(foto(), 'Zoom'), ['ZOOM']);
});
test('un ajuste de redondeo mínimo se muestra como línea propia y el total cuadra; una diferencia grande no se oculta', () => {
  const f = foto(); f.clients[0].contracts[0].income = 100; f.products[0].income = 130.04; f.clients[0].income = 130.04;
  const r = construirDesglose(f, 'cliente', 'C1', 'facturado', '2026-10', datos());
  assert.equal(r.cuadra, true); assert.ok(r.filas.some(x => x.ajuste));
  const g = foto(); g.clients[0].income = 500;
  const r2 = construirDesglose(g, 'cliente', 'C1', 'facturado', '2026-10', datos());
  assert.equal(r2.cuadra, false); assert.ok(r2.notas.some(n => /no coincide/.test(n)));
});
test('coste por cliente: cada euro sale de una factura de proveedor o de una estimación y suma la cifra de la tabla', () => {
  const r = construirDesglose(foto(), 'cliente', 'C1', 'coste', '2026-10', datos());
  assert.equal(r.sumaDetalle, 60);
  const real = r.filas.filter(f => f.estado === 'REAL'), est = r.filas.filter(f => f.estado === 'ESTIMADO');
  assert.equal(real.length, 2); assert.equal(est.length, 2);
  assert.ok(real.every(f => f.factura === 'A-2026-77' && f.proveedor === 'Proveedor A' && f.totalFactura === 120));
  assert.ok(est.every(f => f.factura === null && /Estimación/.test(f.origen)));
  assert.deepEqual(idsFacturasRecibidas(foto(), 'cliente', 'C1'), ['F1']);
});
test('coste por producto cuadra con real + estimado de la tabla y marca la regla de reparto', () => {
  const r = construirDesglose(foto(), 'producto', 'Fibra', 'coste', '2026-10', datos());
  assert.equal(r.cifraTabla, 60); assert.equal(r.sumaDetalle, 60); assert.equal(r.cuadra, true);
  assert.equal(r.filas.find(f => f.estado === 'REAL')?.regla, 'Proporcional a lo que factura cada contrato');
});
test('contratos: alta, baja y estado importados; lo que no existe queda en null (sin dato)', () => {
  const r = construirDesglose(foto(), 'cliente', 'C1', 'contratos', '2026-10', datos());
  assert.equal(r.filas.length, 2); assert.equal(r.cuadra, true);
  const k1 = r.filas.find(f => f.contrato === 'K1')!, k2 = r.filas.find(f => f.contrato === 'K2')!;
  assert.equal(k1.alta, '2024-01-10'); assert.equal(k1.baja, null); assert.equal(k1.estadoIsp, 'Activo'); assert.equal(k1.cuota, 100);
  assert.equal(k2.alta, null); assert.equal(k2.estadoIsp, null); assert.equal(k2.cuota, null);
});
test('parteDelMes reparte trimestrales por meses cubiertos y no cuenta fuera de periodo', () => {
  assert.equal(parteDelMes({ mes: '2026-07', base: 90, periodMonths: 3 }, '2026-09').parte, 30);
  assert.equal(parteDelMes({ mes: '2026-07', base: 90, periodMonths: 3 }, '2026-10').parte, 0);
  assert.equal(parteDelMes({ mes: '2026-10', base: 40, periodMonths: 1 }, '2026-11').parte, 0);
});
test('es una función pura: no muta la foto ni los datos', () => {
  const f = foto(), d = datos(), a = JSON.stringify(f), b = JSON.stringify(d);
  for (const v of ['facturado', 'coste', 'contratos'] as const) { construirDesglose(f, 'cliente', 'C1', v, '2026-10', d); construirDesglose(f, 'producto', 'Fibra', v, '2026-10', d); }
  assert.equal(JSON.stringify(f), a); assert.equal(JSON.stringify(d), b);
  assert.deepEqual(codigosContratos(f, 'producto', 'Fibra'), ['K1', 'K2']);
});
test('API: el detalle exige cliente/producto + clave + vista + mes y rechaza parámetros extra', () => {
  assert.ok(querySchema.safeParse({ month: '2026-10', detalle: 'cliente', clave: 'C1', vista: 'coste' }).success);
  assert.ok(!querySchema.safeParse({ month: '2026-10', detalle: 'cliente', vista: 'coste' }).success);
  assert.ok(!querySchema.safeParse({ detalle: 'cliente', clave: 'C1', vista: 'coste' }).success);
  assert.ok(!querySchema.safeParse({ month: '2026-10', detalle: 'otro', clave: 'C1', vista: 'coste' }).success);
  assert.ok(!querySchema.safeParse({ month: '2026-10', detalle: 'cliente', clave: 'C1', vista: 'coste', sql: '1' }).success);
  assert.ok(querySchema.safeParse({ month: '2026-10', mode: 'real' }).success);
});
test('la capa de lectura solo hace SELECT y la ruta sigue protegida para el superadmin', () => {
  const datosTs = readFileSync(new URL('../lib/rentabilidad/desglose-datos.ts', import.meta.url), 'utf8');
  assert.ok(!/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/.test(datosTs.replace(/\/\*[\s\S]*?\*\//g, '')), 'sin sentencias de escritura');
  assert.match(datosTs, /io_staging_finanzas/);
  const ruta = readFileSync(new URL('../app/api/admin/rentabilidad/route.ts', import.meta.url), 'utf8');
  assert.ok(ruta.indexOf('requireRentabilidadAdmin') < ruta.indexOf('desglose-datos'), 'se autentica antes de leer');
});
