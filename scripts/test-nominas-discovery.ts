import assert from 'node:assert/strict';
import { classifyPayrollFile, findCostesFiles, payrollMonthFromFolder } from '../lib/microsoft-graph';
import { payrollAmountsMatch } from '../lib/nominas-sync';

async function main() {
  const synthetic = { nombre: 'Persona de prueba', nif: '00000000T', mes: 9, anio: 2026, fechaCobro: '',
    devengadoTotal: 1200, netoPercibir: 1000, irpf: 100, ssTrabajador: 100,
    ssEmpresa: 200, baseIrpf: 1200, costeTotalEmpresa: 1400, complementoEspecie: 0 };
  assert.equal(payrollAmountsMatch(synthetic, { ...synthetic }), true);
  assert.equal(payrollAmountsMatch(synthetic, { ...synthetic, netoPercibir: 1001 }), false);
  assert.equal(payrollAmountsMatch(synthetic, { ...synthetic, costeTotalEmpresa: 1401 }), false);
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
