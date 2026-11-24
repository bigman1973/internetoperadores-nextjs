import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import * as XLSX from 'xlsx';
import sharp from 'sharp';
import {
  cents, cuadrar, desglosarIva, editable, esRevisor, extraerConceptosNomina, fechaValida, importeKm, listaRevisores, normalizarGasto, parseOcrJson, transicion,
} from '../lib/area5/core';
import { borradorGestoria, libroExcel, pdfTrabajador, resumenPorTrabajador, type LineaPaquete } from '../lib/area5/paquete';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok', name); };
const HOY = '2026-11-24';

(async () => {
  await ok('revisores: solo David y Víctor; Lorena y otros no', () => {
    assert.ok(esRevisor('David.Perez@internetoperadores.com'));
    assert.ok(esRevisor('victor@internetoperadores.com'));
    assert.ok(esRevisor('victor@lfgd.es'));
    assert.ok(!esRevisor('lorena.gimeno@internetoperadores.com'));
    assert.ok(!esRevisor('jordi@farmsplanet.es'));
    assert.ok(!esRevisor(null));
    assert.ok(listaRevisores('ana@internetoperadores.com, x').includes('ana@internetoperadores.com'));
  });

  await ok('IVA: desglose al céntimo', () => {
    assert.deepEqual(desglosarIva(12.1, 21), { baseEur: 10, cuotaEur: 2.1, totalEur: 12.1 });
    const d = desglosarIva(9.99, 10);
    assert.equal(cents(d.baseEur) + cents(d.cuotaEur), 999);
  });

  await ok('kilometraje: km × €/km, aviso por encima de 0,26', () => {
    assert.equal(importeKm(120, 0.26), 31.2);
    const g = normalizarGasto({ tipo: 'KILOMETRAJE', fecha: '2026-11-10', concepto: 'Tarragona-Reus', km: '120', eurKm: '0.30' }, HOY);
    assert.equal(g.importe, 36);
    assert.ok(g.avisos.some(a => a.includes('0,26')));
    assert.equal(normalizarGasto({ tipo: 'KILOMETRAJE', fecha: '2026-11-10', concepto: 'x', km: 10, eurKm: 0.26 }, HOY).avisos.length, 0);
  });

  await ok('ticket: IVA calculado, cuota inconsistente avisada, validaciones', () => {
    const g = normalizarGasto({ tipo: 'TICKET', fecha: '2026-11-20', concepto: 'Comida cliente', importe: 24.2, tipoIva: 10 }, HOY);
    assert.equal(g.baseImponible, 22); assert.equal(g.importeIva, 2.2);
    const solo = normalizarGasto({ tipo: 'TICKET', fecha: '2026-11-20', concepto: 'x', importe: 12.1, importeIva: 2.1 }, HOY);
    assert.equal(solo.tipoIva, 21);
    assert.ok(normalizarGasto({ tipo: 'TICKET', fecha: '2026-11-20', concepto: 'x', importe: 10, tipoIva: 21, importeIva: 5 }, HOY).avisos.length > 0);
    assert.throws(() => normalizarGasto({ tipo: 'TICKET', fecha: '2026-11-20', concepto: 'x', importe: 0 }, HOY));
    assert.throws(() => normalizarGasto({ tipo: 'TICKET', fecha: '2026-12-01', concepto: 'x', importe: 5 }, HOY), /futura/);
    assert.throws(() => normalizarGasto({ tipo: 'TICKET', fecha: '2024-01-01', concepto: 'x', importe: 5 }, HOY), /18 meses/);
    assert.throws(() => normalizarGasto({ tipo: 'TICKET', fecha: '2026-11-20', concepto: '  ', importe: 5 }, HOY));
    assert.equal(fechaValida('2026-02-31', HOY), 'Fecha no válida');
    assert.equal(fechaValida('2026-02-28', HOY), null);
  });

  await ok('estados: flujo trabajador → revisor, nada tras el cierre', () => {
    assert.equal(transicion('BORRADOR', 'enviar'), 'PENDIENTE');
    assert.equal(transicion('PENDIENTE', 'aprobar'), 'APROBADO');
    assert.equal(transicion('PENDIENTE', 'rechazar'), 'RECHAZADO');
    assert.equal(transicion('PENDIENTE', 'aclaracion'), 'ACLARACION');
    assert.equal(transicion('ACLARACION', 'enviar'), 'PENDIENTE');
    assert.equal(transicion('BORRADOR', 'aprobar'), null);
    assert.equal(transicion('APROBADO', 'aprobar'), null);
    assert.equal(transicion('APROBADO', 'reabrir'), 'PENDIENTE');
    assert.equal(transicion('APROBADO', 'reabrir', true), null);
    assert.ok(editable('ACLARACION', false) && !editable('PENDIENTE', false) && !editable('BORRADOR', true));
  });

  await ok('OCR: tolera markdown y basura, descarta valores imposibles', () => {
    const s = parseOcrJson('```json\n{"comercio":"Repsol","cifComercio":"A28","fecha":"2026-11-18","concepto":"Gasolina","importe":"45,30","tipoIva":21,"importeIva":7.86,"categoria":"combustible","confianza":0.93}\n```', HOY)!;
    assert.equal(s.importe, 45.3); assert.equal(s.categoria, 'COMBUSTIBLE'); assert.equal(s.fecha, '2026-11-18');
    const mal = parseOcrJson('texto {"fecha":"2031-01-01","importe":-4,"tipoIva":77,"confianza":4} fin', HOY)!;
    assert.equal(mal.fecha, null); assert.equal(mal.importe, null); assert.equal(mal.tipoIva, null); assert.equal(mal.confianza, null);
    assert.equal(parseOcrJson('no es json'), null);
    assert.equal(parseOcrJson(''), null);
  });

  await ok('nómina: conceptos de gasto, km con unidades×precio, ambiguos marcados', () => {
    const t = [
      '100 - SALARIO BASE 1.500,00', '120 - DIETAS EXENTAS 45,60', '121 - KILOMETRAJE 120,00 0,26 31,20',
      '122 - GASTOS DE LOCOMOCION 10,00 7,00 99,00', '130 - REINTEGRO DE GASTOS -20,00', '140 - PLUS TRANSPORTE 50,00',
    ].join('\n');
    const c = extraerConceptosNomina(t);
    const dietas = c.find(x => x.codigo === '120')!; assert.ok(dietas.esGasto && dietas.importeCents === 4560 && !dietas.dudoso);
    const km = c.find(x => x.codigo === '121')!; assert.ok(km.esGasto && km.importeCents === 3120);
    assert.ok(c.find(x => x.codigo === '122')!.dudoso);
    assert.ok(c.find(x => x.codigo === '130')!.dudoso);
    assert.ok(!c.some(x => x.codigo === '100'));
  });

  const base = { empleadoId: 'e1', nombre: 'Ana', numGastos: 2, kmCents: 3120, nominaImportada: true, respaldoNominaCents: null as number | null };
  await ok('cuadre: cuadra, diferencia en ambos sentidos, sin nómina, sin desglose, ambiguo', () => {
    const cs = [{ codigo: '120', concepto: 'DIETAS', importeCents: 4560, esGasto: true, dudoso: false }, { codigo: '121', concepto: 'KILOMETRAJE', importeCents: 3120, esGasto: true, dudoso: false }];
    assert.equal(cuadrar({ ...base, gastosCents: 7680, conceptos: cs }).estado, 'CUADRA');
    const menos = cuadrar({ ...base, gastosCents: 9000, conceptos: cs });
    assert.equal(menos.estado, 'DIFERENCIA'); assert.equal(menos.diferenciaCents, -1320); assert.match(menos.mensaje, /menos/);
    const mas = cuadrar({ ...base, gastosCents: 5000, conceptos: cs });
    assert.equal(mas.diferenciaCents, 2680); assert.match(mas.mensaje, /más/);
    assert.equal(cuadrar({ ...base, gastosCents: 7680, conceptos: [], nominaImportada: false }).estado, 'SIN_NOMINA');
    assert.equal(cuadrar({ ...base, gastosCents: 7680, conceptos: [] }).estado, 'SIN_DESGLOSE');
    assert.equal(cuadrar({ ...base, gastosCents: 7680, conceptos: [], respaldoNominaCents: 7680 }).estado, 'CUADRA');
    assert.equal(cuadrar({ ...base, gastosCents: 7680, conceptos: [{ codigo: '1', concepto: 'x', importeCents: 0, esGasto: false, dudoso: true }] }).estado, 'REVISAR');
    assert.equal(cuadrar({ ...base, gastosCents: 0, numGastos: 0, kmCents: 0, conceptos: cs }).diferenciaCents, 7680);
  });

  const linea = (o: Partial<LineaPaquete>): LineaPaquete => ({ id: 'aaaaaaaa-0000-0000-0000-000000000001', empleadoId: 'e1', empleadoNombre: 'Ana Ñandú', empleadoNif: '1X', tipo: 'TICKET', fecha: '2026-11-10', concepto: 'Comida cliente € ñ', categoria: 'COMIDA', proyecto: null, cliente: 'ACME', comercio: 'Bar', importe: 24.2, tipoIva: 10, baseImponible: 22, importeIva: 2.2, km: null, eurKm: null, revisorEmail: 'david.perez@internetoperadores.com', revisadoAt: '2026-11-12T10:00:00Z', ...o });
  const lineas = [linea({}), linea({ id: 'bbbbbbbb-0000-0000-0000-000000000002', tipo: 'KILOMETRAJE', concepto: 'Visita', km: 120, eurKm: 0.26, importe: 31.2, tipoIva: null, baseImponible: null, importeIva: null, comercio: null }), linea({ id: 'cccccccc-0000-0000-0000-000000000003', empleadoId: 'e2', empleadoNombre: 'Luis', importe: 10, concepto: 'Parking' })];

  await ok('paquete: resumen, Excel con 2 hojas y totales correctos, borrador de correo', () => {
    const r = resumenPorTrabajador(lineas);
    assert.equal(r.length, 2); assert.equal(r.find(x => x.empleadoId === 'e1')!.total, 55.4); assert.equal(r.find(x => x.empleadoId === 'e1')!.importeKm, 31.2);
    const wb = XLSX.read(libroExcel('2026-11', lineas), { type: 'buffer' });
    assert.deepEqual(wb.SheetNames, ['Resumen', 'Detalle']);
    assert.equal(XLSX.utils.sheet_to_json(wb.Sheets.Detalle, { header: 1 }).length, 4);
    const solo = XLSX.read(libroExcel('2026-11', lineas, 'e2'), { type: 'buffer' });
    assert.equal(XLSX.utils.sheet_to_json(solo.Sheets.Detalle, { header: 1 }).length, 2);
    const b = borradorGestoria('2026-11', r.map(x => ({ nombre: x.nombre, total: x.total })), null);
    assert.match(b.asunto, /noviembre de 2026/); assert.match(b.cuerpo, /Total: 65,40 €/); assert.equal(b.destinatario, '');
  });

  await ok('paquete: PDF con portada + foto + PDF original incrustados', async () => {
    const jpg = await sharp({ create: { width: 300, height: 500, channels: 3, background: '#ccc' } }).jpeg().toBuffer();
    const orig = await PDFDocument.create(); orig.addPage([200, 200]); orig.addPage([200, 200]);
    const tickets = new Map([
      [lineas[0].id, { gastoId: lineas[0].id, mime: 'image/jpeg', datos: jpg }],
      ['dddddddd-0000-0000-0000-000000000004', { gastoId: 'x', mime: 'application/pdf', datos: Buffer.from(await orig.save()) }],
    ]);
    const l2 = linea({ id: 'dddddddd-0000-0000-0000-000000000004', concepto: 'Peaje', importe: 5 });
    const pdf = await PDFDocument.load(await pdfTrabajador('2026-11', [lineas[0], lineas[1], l2], tickets));
    // portada(1) + foto(1) + pdf original(2) + detalle km(1)
    assert.equal(pdf.getPageCount(), 5);
    // un PDF corrupto no rompe el paquete
    const bad = new Map([[lineas[0].id, { gastoId: 'x', mime: 'application/pdf', datos: Buffer.from('%PDF-roto') }]]);
    assert.ok((await PDFDocument.load(await pdfTrabajador('2026-11', [lineas[0]], bad))).getPageCount() >= 2);
  });

  console.log(`\n${n} pruebas del Área 5 correctas`);
})().catch(e => { console.error(e); process.exit(1); });
