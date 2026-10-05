import assert from 'node:assert/strict';
import { classifyPayrollFile, findCostesFiles, payrollMonthFromFolder } from '../lib/microsoft-graph';
import { nameSuffixMatchesPerson, payrollAmountsMatch } from '../lib/nominas-sync';
import { parseCombinedSettlementReceipt, parseCostesIO } from '../lib/nominas-parser';

async function main() {
  const synthetic = { nombre: 'Persona de prueba', nif: '00000000T', mes: 9, anio: 2026, fechaCobro: '',
    devengadoTotal: 1200, netoPercibir: 1000, irpf: 100, ssTrabajador: 100,
    ssEmpresa: 200, baseIrpf: 1200, costeTotalEmpresa: 1400, complementoEspecie: 0 };
  assert.equal(payrollAmountsMatch(synthetic, { ...synthetic }), true);
  assert.equal(payrollAmountsMatch(synthetic, { ...synthetic, netoPercibir: 1001 }), false);
  assert.equal(payrollAmountsMatch(synthetic, { ...synthetic, costeTotalEmpresa: 1401 }), false);
  assert(nameSuffixMatchesPerson('DAVIDPEREZ', 'PEREZ MONTANO DAVID JAVIER'));
  assert(!nameSuffixMatchesPerson('OTRA PERSONA', 'PEREZ MONTANO DAVID JAVIER'));
  const settlementSummary = parseCostesIO([
    'Resumen de NóminaPAGA TOTAL DEL 01/09/2026 AL 30/09/2026',
    '00000000T', 'MENSUAL', '21/09/2026', '-50,00 950,00 1.000,00 1.000,00 200,00 250,00',
    '000004 PERSONA DE PRUEBA',
    '00000000T', 'FINIQUITO', '21/09/2026', '1.560,84 1.560,84',
    '000004 PERSONA DE PRUEBA',
  ].join('\n'));
  assert.equal(settlementSummary.nominas.length, 2);
  assert.equal(settlementSummary.nominas[1].tipo, 'LIQUIDACION');
  assert.equal(settlementSummary.nominas[1].netoPercibir, 1560.84);
  assert.equal(settlementSummary.nominas[0].ssEmpresa, 200);
  assert.equal(settlementSummary.nominas[0].costeTotalEmpresa, 1200);
  assert.equal(settlementSummary.verificado, true);
  const mixedReceipt = [
    'DOCUMENTO DE LIQUIDACIÓN Y FINIQUITO', 'Apellidos y Nombre: PRUEBA, PERSONA N.I.F.: 00000000T',
    '33,33 Indemnización 1.560,84', 'Totales 2.560,84 50,00',
    'Importe Líquido a percibir 2.510,84', 'En LLEIDA, a 21 de SEPTIEMBRE de 2026',
  ].join('\n');
  const parsedReceipt = parseCombinedSettlementReceipt(mixedReceipt);
  assert.equal(parsedReceipt?.mes, 9);
  assert.equal(parsedReceipt?.anio, 2026);
  assert.equal(parsedReceipt?.devengado, 256084);
  assert.equal(parsedReceipt?.liquido, 251084);
  assert.equal(parsedReceipt?.indemnizacion, 156084);
  assert.equal(parseCombinedSettlementReceipt(mixedReceipt.replace('2.510,84', '2.509,84')), null);
  const compensatedErrors = parseCostesIO([
    'Resumen de NóminaPAGA TOTAL DEL 01/09/2026 AL 30/09/2026',
    '00000000T', 'MENSUAL', '30/09/2026', '-51,00 950,00 1.000,00 1.000,00 200,00 251,00', '000001 PERSONA UNO',
    '00000001R', 'MENSUAL', '30/09/2026', '-49,00 950,00 1.000,00 1.000,00 200,00 249,00', '000002 PERSONA DOS',
  ].join('\n'));
  assert.equal(compensatedErrors.nominas.length, 2);
  assert.equal(compensatedErrors.verificado, false);
  assert.equal(payrollMonthFromFolder('SEPTIEMBRE 2026'), 9);
  assert.equal(payrollMonthFromFolder('09 - SEPTIEMBRE'), 9);
  assert.equal(classifyPayrollFile('COSTES INTERNET OPERADORES SEPTIEMBRE 2026.pdf'), 'costes_io');
  assert.equal(classifyPayrollFile('NÓMINA INTERNET OPERADORES SEPTIEMBRE 2026_DAVID PEREZ.pdf'), 'nomina_individual');
  assert.equal(classifyPayrollFile('NÓMINA INTERNET OPERADORES SEPTIEMBRE 2026_IVAN PEREZ.pdf'), 'nomina_individual');
  assert.equal(classifyPayrollFile('LIQUIDACIÓN INTERNET OPERADORES SEPTIEMBRE 2026_IVAN PEREZ.pdf'), 'liquidacion');
  assert.equal(classifyPayrollFile('COSTES SOTIC XXI SEPTIEMBRE 2026.pdf'), null);
  assert.equal(classifyPayrollFile('NÓMINA SOTIC XXI SEPTIEMBRE 2026_VICTOR GIRO.pdf'), null);

  process.env.SHAREPOINT_DRIVE_ID = 'test-drive';
  process.env.MICROSOFT_GRAPH_TENANT_ID = 'test-tenant';
  process.env.MICROSOFT_GRAPH_CLIENT_ID = 'test-client';
  process.env.MICROSOFT_GRAPH_CLIENT_SECRET = 'test-secret';
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (request: RequestInfo | URL) => {
    const url = String(request);
    calls++;
    if (url.includes('/oauth2/v2.0/token')) return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 });
    if (url.includes('page2')) return new Response(JSON.stringify({ value: [
      { id: 'ivan-liquidacion', name: 'LIQUIDACIÓN INTERNET OPERADORES SEPTIEMBRE 2026_IVAN PEREZ.pdf', file: { mimeType: 'application/pdf' } },
    ] }), { status: 200 });
    if (url.includes('3.%20N%C3%B3minas/2026:/children')) return new Response(JSON.stringify({ value: [
      { id: 'sep-folder', name: 'SEPTIEMBRE 2026', folder: { childCount: 5 } },
    ] }), { status: 200 });
    if (url.includes('SEPTIEMBRE%202026:/children')) return new Response(JSON.stringify({ value: [
      { id: 'bulk', name: 'COSTES INTERNET OPERADORES SEPTIEMBRE 2026.pdf', file: { mimeType: 'application/pdf' } },
      { id: 'david', name: 'NÓMINA INTERNET OPERADORES SEPTIEMBRE 2026_DAVID PEREZ.pdf', file: { mimeType: 'application/pdf' } },
      { id: 'ivan', name: 'NÓMINA INTERNET OPERADORES SEPTIEMBRE 2026_IVAN PEREZ.pdf', file: { mimeType: 'application/pdf' } },
      { id: 'sotic', name: 'NÓMINA SOTIC XXI SEPTIEMBRE 2026_VICTOR GIRO.pdf', file: { mimeType: 'application/pdf' } },
    ], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/drives/test-drive/page2' }), { status: 200 });
    throw new Error(`Unexpected Graph path ${url}`);
  };
  try {
    const results = await findCostesFiles(2026, [9]);
    assert.deepEqual(results.map(f => f.tipo), ['costes_io', 'nomina_individual', 'nomina_individual', 'liquidacion']);
    assert.equal(results.length, 4);
    assert.equal(results.every(f => f.monthNum === 9), true);
    assert.equal(calls, 4);
    console.log('Nóminas: filtros de septiembre, David, Iván y paginación Graph correctos');
  } finally { global.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
