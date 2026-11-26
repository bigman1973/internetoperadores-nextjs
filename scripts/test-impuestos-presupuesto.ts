import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcularImpuestos, clasificarRecibida, fechaLimite, type EmitidaIn, type RecibidaIn, type PresentadoIn } from '../lib/impuestos/calc';
import { permisosFin } from '../lib/impuestos/auth-permisos';
import { generarLineas, totales, seguimiento, mesesAplicables, type EntradaPresupuesto } from '../lib/presupuesto/calc';
let ok = 0; const t = (n: string, f: () => void) => { f(); ok++; console.log('OK ', n); };
const E = (id: string, fecha: string, base: number, tipo = 21, cuota?: number): EmitidaIn => ({ id, num: id, cliente: 'C', fecha, base, tipoIva: tipo, importeIva: cuota ?? Math.round(base * tipo) / 100 });
const R = (id: string, fecha: string, base: number, o: Partial<RecibidaIn & { imputacion: string | null }> = {}): RecibidaIn & { imputacion: string | null } => ({
  id, proveedor: 'Proveedor SL', num: id, fecha, base, tipoIva: 21, importeIva: Math.round(base * 21) / 100, tipoIrpf: null, importeIrpf: null, concepto: null, calidad: 'VALIDA', deducible: true, internacional: false, imputacion: 'Estructura', ...o,
});

// ---------- Impuestos ----------
t('fechas límite: 20/04, 20/07, 20/10 y 30/01 pasados al siguiente día hábil', () => {
  assert.equal(fechaLimite(2026, 1), '2026-04-20'); assert.equal(fechaLimite(2026, 2), '2026-07-20'); assert.equal(fechaLimite(2026, 3), '2026-10-20');
  assert.equal(fechaLimite(2026, 4), '2027-02-01'); // 30/01/2027 es sábado
  assert.equal(fechaLimite(2024, 2), '2024-07-22'); // 20/07/2024 es sábado
});
t('clasificación: confirming y cesiones no son gasto; extranjeras sin IVA se avisan; REVISAR no cuenta', () => {
  assert.equal(clasificarRecibida(R('a', '2026-01-10', 100)), 'GASTO');
  assert.equal(clasificarRecibida(R('b', '2026-01-10', 5000, { tipoIva: 0, importeIva: 0, proveedor: 'BBVA', concepto: 'Liquidación de bestretes' })), 'CONFIRMING');
  assert.equal(clasificarRecibida(R('c', '2026-01-10', 5000, { tipoIva: 0, importeIva: 0, proveedor: 'Draxton Powertrain' })), 'CONFIRMING');
  assert.equal(clasificarRecibida(R('d', '2026-01-10', 50, { tipoIva: 0, importeIva: 0, proveedor: 'Wildix OU' })), 'EXTRANJERA');
  assert.equal(clasificarRecibida(R('e', '2026-01-10', 50, { tipoIva: 0, importeIva: 0 })), 'SIN_IVA_SIN_CLASIFICAR');
  assert.equal(clasificarRecibida(R('f', '2026-01-10', 50, { calidad: 'REVISAR_LECTURA' })), 'REVISAR');
});
const base = (over: any = {}) => ({
  ejercicio: 2026, hoy: '2026-11-24',
  emitidas: [E('e1', '2026-01-15', 1000), E('e2', '2026-02-15', 2000), E('e3', '2026-04-10', 1000)],
  recibidas: [R('r1', '2026-01-20', 500), R('r2', '2026-02-20', 100, { tipoIva: 0, importeIva: 0, proveedor: 'BBVA', concepto: 'Liquidación de bestretes' })],
  nominas: [{ anio: 2026, mes: 1, irpf: 300 }, { anio: 2026, mes: 2, irpf: 310 }, { anio: 2026, mes: 3, irpf: 290 }], presentados: [] as PresentadoIn[], ...over,
});
t('303 del trimestre: repercutido − soportado, sin contar confirming', () => {
  const r = calcularImpuestos(base()); const q1 = r.trimestres[0];
  assert.equal(q1.repercutido.cuota, 630); assert.equal(q1.soportado.cuota, 105); assert.equal(q1.resultado303, 525); assert.equal(q1.soportado.n, 1);
  assert.ok(q1.avisos.some(a => a.codigo === 'CONFIRMING'));
});
t('111: nóminas + profesionales; 115: alquileres; retención negativa avisa', () => {
  const r = calcularImpuestos(base({ recibidas: [R('p1', '2026-01-20', 1000, { tipoIrpf: 15, importeIrpf: 150, concepto: 'Honorarios' }), R('a1', '2026-01-21', 500, { tipoIrpf: 19, importeIrpf: 95, concepto: 'Alquiler oficina enero' }), R('a2', '2026-03-21', 500, { tipoIrpf: 19, importeIrpf: -95, concepto: 'Alquiler oficina marzo' })] }));
  const q1 = r.trimestres[0]; assert.equal(q1.irpf111.nominas, 900); assert.equal(q1.irpf111.profesionales, 150); assert.equal(q1.irpf111.total, 1050);
  assert.equal(q1.irpf115.retenido, 0); assert.equal(q1.irpf115.n, 2); assert.ok(q1.avisos.some(a => a.codigo === 'IRPF_NEGATIVO'));
});
t('cuadre: cuadra, no cuadra y sin dato; el 111 detecta que solo se presentaron las nóminas', () => {
  const pres: PresentadoIn[] = [{ modelo: '303', ejercicio: 2026, trimestre: 1, importe: 420, estado: 'PAGADO', fuente: 'MANUAL' }, { modelo: '111', ejercicio: 2026, trimestre: 1, importe: 900, estado: 'PAGADO', fuente: 'AAPP' }];
  const r = calcularImpuestos(base({ presentados: pres, recibidas: [R('p1', '2026-01-20', 1000, { tipoIrpf: 15, importeIrpf: 150, concepto: 'Honorarios' })] })); const c = r.trimestres[0].cuadre;
  assert.equal(c.find(x => x.modelo === '303')!.semaforo, 'OK'); const c111 = c.find(x => x.modelo === '111')!; assert.equal(c111.semaforo, 'REVISAR'); assert.match(c111.explicacion, /profesionales/);
  assert.equal(r.trimestres[1].cuadre.find(x => x.modelo === '303')!.semaforo, 'SIN_DATO');
  assert.ok(r.trimestres[2].avisos.some(a => a.codigo === 'NO_PRESENTADO_303'));
});
t('manual sustituye a AAPP en el cuadre', () => {
  const pres: PresentadoIn[] = [{ modelo: '303', ejercicio: 2026, trimestre: 1, importe: 999, estado: 'PAGADO', fuente: 'AAPP' }, { modelo: '303', ejercicio: 2026, trimestre: 1, importe: 525, estado: 'PRESENTADO', fuente: 'MANUAL' }];
  assert.equal(calcularImpuestos(base({ presentados: pres })).trimestres[0].cuadre[0].presentado, 525);
});
t('trimestre en curso: previsión con ritmo de meses cerrados y tesorería = total/3', () => {
  const emitidas = ['2026-10-05', '2026-11-05'].map((f, i) => E('x' + i, f, 1000)); const recibidas = [R('s1', '2026-10-06', 200)];
  const r = calcularImpuestos(base({ emitidas, recibidas, nominas: [{ anio: 2026, mes: 9, irpf: 400 }] })); const q4 = r.trimestres[3];
  assert.equal(r.trimestreActual, 4); assert.ok(q4.previsto); assert.equal(q4.meses.length, 3); assert.ok(q4.meses.every(m => m.estimado || m.mes < '2026-11'));
  assert.ok(r.tesoreria); assert.equal(r.tesoreria!.apartarCadaMes, Math.round(((q4.previsto!.resultado303 + q4.previsto!.irpf111 + q4.previsto!.irpf115) / 3) * 100) / 100);
  assert.ok(q4.avisos.some(a => a.codigo === 'PREVISION'));
});
t('avisos: lectura por revisar, IVA incoherente, tipo raro y emitidas desactualizadas', () => {
  const r = calcularImpuestos(base({ hoy: '2026-03-31', emitidas: [E('e1', '2026-01-15', 1000, 21, 100), E('e2', '2026-02-15', 1000, 17)], recibidas: [R('r1', '2026-01-20', 500, { calidad: 'REVISAR_LECTURA' })] }));
  const cod = r.trimestres[0].avisos.map(a => a.codigo);
  for (const c of ['REVISAR_LECTURA', 'IVA_INCOHERENTE', 'TIPO_IVA_RARO', 'EMITIDAS_DESACTUALIZADAS']) assert.ok(cod.includes(c), c);
  assert.equal(r.trimestres[0].calidad, 'BAJA');
});
t('el tipo de IVA 21,00006 no se marca como raro', () => {
  const r = calcularImpuestos(base({ emitidas: [E('e1', '2026-01-15', 1000, 21.00006, 210)] })); assert.ok(!r.trimestres[0].avisos.some(a => a.codigo === 'TIPO_IVA_RARO'));
});
t('permisos: superadmin y gerente editan; contabilidad solo ve impuestos; resto sin acceso; solo superadmin aprueba', () => {
  assert.deepEqual(permisosFin('presupuesto', 'SUPER_ADMIN', []), { acceso: true, puedeEditar: true, puedeAprobar: true, soloLectura: false });
  assert.equal(permisosFin('presupuesto', 'GERENTE', ['GERENTE']).puedeAprobar, false); assert.equal(permisosFin('presupuesto', 'GERENTE', []).puedeEditar, true);
  assert.deepEqual(permisosFin('impuestos', 'VISOR', ['CONTABILIDAD']), { acceso: true, puedeEditar: false, puedeAprobar: false, soloLectura: true });
  assert.equal(permisosFin('presupuesto', 'CONTABILIDAD', ['CONTABILIDAD']).acceso, false);
  assert.equal(permisosFin('impuestos', 'VENTAS', ['VENTAS']).acceso, false); assert.equal(permisosFin('impuestos', 'VISOR', null).acceso, false);
});

// ---------- Presupuesto ----------
const PE = (over: Partial<EntradaPresupuesto> = {}): EntradaPresupuesto => ({
  ejercicio: 2027, mesesReal: 10, subidaProveedoresPct: 3,
  emitidas: [{ fecha: '2026-03-01', base: 10000, imputacion: 'Operadora' }, { fecha: '2026-11-01', base: 99999, imputacion: 'Operadora' }, { fecha: '2025-03-01', base: 5000, imputacion: 'Operadora' }],
  recibidas: [R('g1', '2026-02-01', 6000, { proveedor: 'Aire', imputacion: 'Operadora' }), R('g2', '2026-02-01', 400, { proveedor: 'Pequeño', imputacion: 'Operadora' }), R('g3', '2026-02-01', 30000, { tipoIva: 0, importeIva: 0, proveedor: 'BBVA', concepto: 'Confirming', imputacion: 'Draxton' }),
    R('g4', '2026-05-01', 3000, { proveedor: 'Dell', concepto: 'Servidor Dell PowerEdge', imputacion: 'Estructura' }), R('g5', '2026-05-01', 700, { proveedor: 'Otro', imputacion: null })] as any,
  nominas: [{ anio: 2026, mes: 1, costeEmpresa: 10000 }, { anio: 2026, mes: 2, costeEmpresa: 10000 }], recibidasRevisar: 2, escenarioSubida: null, escenarioSalarial: null, ...over,
});
t('presupuesto: ingresos anualizados ×12/10 solo ene–oct del año base', () => {
  const g = generarLineas(PE()); const ing = g.lineas.filter(l => l.tipo === 'INGRESO');
  assert.equal(ing.length, 1); assert.equal(ing[0].realAnual, 12000); assert.equal(ing[0].importe, 12000);
});
t('presupuesto: confirming fuera del gasto, subida de proveedores, inversión sin subida y cuentas pequeñas agrupadas', () => {
  const g = generarLineas(PE()); const gas = g.lineas.filter(l => l.tipo === 'GASTO' && l.fuente === 'FACTURAS');
  const aire = gas.find(l => l.cuenta === 'Aire')!; assert.equal(aire.realAnual, 7200); assert.equal(aire.importe, 7416);
  assert.ok(!gas.some(l => l.centro === 'Draxton')); assert.equal(g.excluido.confirming, 30000);
  const dell = gas.find(l => l.cuenta === 'Dell')!; assert.equal(dell.naturaleza, 'INVERSION'); assert.equal(dell.importe, dell.realAnual);
  assert.ok(gas.some(l => l.centro === 'Operadora' && /Otros proveedores/.test(l.cuenta))); assert.ok(gas.some(l => l.centro === 'Sin imputar'));
  assert.ok(g.avisos.some(a => a.codigo === 'GASTO_SIN_IMPUTAR') && g.avisos.some(a => a.codigo === 'REVISAR_LECTURA'));
});
t('presupuesto: personal con escenario salarial; sin escenario mantiene real anualizado; avisa de borrador', () => {
  const sin = generarLineas(PE()).lineas.find(l => l.fuente === 'NOMINAS')!; assert.equal(sin.realAnual, 120000); assert.equal(sin.importe, 120000);
  const con = generarLineas(PE({ escenarioSalarial: { id: 's', nombre: '+3 %', costeActualAnual: 100000, costePropuestoAnual: 103000, estado: 'borrador', fechaEfectiva: '2027-01-01' } }));
  assert.equal(con.lineas.find(l => l.fuente === 'NOMINAS')!.importe, 103000); assert.ok(con.avisos.some(a => a.codigo === 'SALARIAL_NO_APROBADO'));
});
t('presupuesto: subida de precios aprobada se prorratea por fecha de efecto; sin escenario avisa', () => {
  assert.ok(generarLineas(PE()).avisos.some(a => a.codigo === 'SIN_SUBIDA_APROBADA'));
  const g = generarLineas(PE({ escenarioSubida: { id: 'x', nombre: 'Propuesta', extraAnual: 18000, fechaEfecto: '2027-04-01' } }));
  const l = g.lineas.find(x => x.fuente === 'SUBIDA_PRECIOS')!; assert.equal(l.importe, 13500); assert.ok(!g.avisos.some(a => a.codigo === 'SIN_SUBIDA_APROBADA'));
  assert.equal(mesesAplicables(2027, '2026-12-01'), 12); assert.equal(mesesAplicables(2027, '2028-01-01'), 0); assert.equal(mesesAplicables(2027, null), 12);
});
t('presupuesto: totales separan corriente e inversión y calculan resultado y margen', () => {
  const tt = totales([{ tipo: 'INGRESO', naturaleza: 'CORRIENTE', realAnual: 1000, importe: 1100 }, { tipo: 'GASTO', naturaleza: 'CORRIENTE', realAnual: 400, importe: 420 }, { tipo: 'GASTO', naturaleza: 'INVERSION', realAnual: 100, importe: 80 }]);
  assert.equal(tt.resultado.real, 500); assert.equal(tt.resultado.presupuesto, 600); assert.equal(tt.gastoCorriente.presupuesto, 420); assert.equal(tt.inversion.presupuesto, 80); assert.equal(tt.margenPct.presupuesto, 54.55);
});
t('seguimiento: real mensual frente a presupuesto/12, solo meses cerrados, sin confirming', () => {
  const lineas = [{ tipo: 'INGRESO' as const, centro: 'Operadora', importe: 12000 }, { tipo: 'GASTO' as const, centro: 'Estructura', importe: 1200 }];
  const em = [{ fecha: '2027-01-10', base: 1500, imputacion: 'Operadora' }, { fecha: '2027-02-10', base: 900, imputacion: 'Operadora' }, { fecha: '2027-03-10', base: 5000, imputacion: 'Operadora' }];
  const rc = [R('s1', '2027-01-10', 100), R('s2', '2027-01-11', 9000, { tipoIva: 0, importeIva: 0, proveedor: 'BBVA', concepto: 'Confirming' })] as any;
  const s = seguimiento(2027, lineas, em, rc, [], '2027-03-05'); assert.equal(s.mesesCerrados, 2);
  const ing = s.filas.find(f => f.tipo === 'INGRESO')!; assert.equal(ing.presupuestoAcum, 2000); assert.equal(ing.realAcum, 2400); assert.equal(ing.diferencia, 400);
  const gas = s.filas.find(f => f.tipo === 'GASTO')!; assert.equal(gas.realAcum, 100); assert.equal(gas.presupuestoAcum, 200);
});
t('middleware: Impuestos y Presupuesto registrados y escrituras del sandbox acotadas', () => {
  const src = readFileSync(new URL('../proxy.js', import.meta.url), 'utf8');
  const st = src.indexOf('function financeAreas(pathname) {'); const en = src.indexOf('\nexport async function proxy', st);
  const areas = new Function(`${src.slice(st, en)};return financeAreas`)() as (p: string) => string[];
  assert.deepEqual(areas('/api/admin/finanzas/impuestos'), ['admin.finanzas.impuestos']);
  assert.deepEqual(areas('/api/admin/finanzas/impuestos/presentados'), ['admin.finanzas.impuestos']);
  assert.deepEqual(areas('/api/admin/finanzas/presupuesto/versiones/3/lineas'), ['admin.finanzas.presupuesto']);
  const a0 = src.indexOf('const allowed = '); const a1 = src.indexOf("\n    if ((path.startsWith('/api/cron/')", a0);
  const expr = src.slice(a0 + 'const allowed = '.length, a1).trim().replace(/;$/, '');
  const allowed = new Function('path', 'request', 'isAuthorizedP2Path', `return ${expr}`) as (p: string, r: { method: string }, f: (p: string) => boolean) => boolean;
  const ok2 = (p: string, m: string) => allowed(p, { method: m }, () => false);
  assert.equal(ok2('/api/admin/finanzas/impuestos/presentados', 'POST'), true);
  assert.equal(ok2('/api/admin/finanzas/impuestos/presentados', 'DELETE'), true);
  assert.equal(ok2('/api/admin/finanzas/presupuesto/versiones', 'POST'), true);
  assert.equal(ok2('/api/admin/finanzas/presupuesto/versiones/3', 'PATCH'), true);
  assert.equal(ok2('/api/admin/finanzas/presupuesto/versiones/3/lineas', 'DELETE'), true);
  assert.equal(ok2('/api/admin/finanzas/presupuesto/versiones/3/aprobar', 'POST'), true);
  assert.equal(ok2('/api/admin/finanzas/presupuesto/versiones/3/otra', 'POST'), false);
  assert.equal(ok2('/api/admin/finanzas/impuestos', 'POST'), false);
});

console.log(`\n${ok} pruebas OK`);
