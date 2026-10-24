import assert from 'node:assert/strict';
import {
  bankStatusLabel, documentLabel, formatKnownCents, labelsPhoneReason, parseCustomerAnalyticsResponse, privateDocumentHref,
} from '../components/finanzas/customer-analytics/customer-analytics-contract';

const response = {
  stagingOnly: true, automaticas: false, proposalsOnly: true,
  periodo: { desde: '2026-01-01', hasta: '2026-10-08', baseTemporal: 'fecha_factura' }, proveedor: { clave: 'TELEFONICA', documentosEncontrados: 2, documentosIncluidos: 1 },
  totales: { ingresoBaseCentimos: '120000', costeBaseDocumentadoCentimos: '20000', costeAsignablePropuestoCentimos: '20000', costeConfirmadoCentimos: null, porcentajeAsignablePorCosteBaseBp: null, bolsaSinAsignar: { baseConocidaNoAsignadaCentimos: '5000', documentosBaseConocidaNoAsignada: 1, documentosImporteDesconocido: 1, importeDesconocidoCentimos: null }, margenConfirmado: { centimos: null, porcentajeBp: null, caveat: 'No consta coste confirmado por cobro real' }, margenPotencialEstimado: { centimos: '100000', porcentajeBp: null, costeCompletoAsegurado: false, caveat: 'Coste incompleto' }, documentos: { total: 2, conBaseConocida: 1, conCosteLineaPropuesto: 1 }, lineas: { detectadasConContexto: 2, propuestas: 1, enRevision: 1 } },
  clientes: [{ cliente: { id: 1, nombre: 'Cliente de prueba' }, ingresos: { baseCentimos: '120000', facturas: 1 }, coste: { asignablePropuestoCentimos: '20000', confirmadoCentimos: null, baseDocumentadaRelacionadaCentimos: '20000', porcentajeAsignablePorCosteBaseBp: null, documentos: 1, lineasPropuestas: 1 }, margenConfirmado: { centimos: null, porcentajeBp: null }, margenPotencialEstimado: { centimos: '100000', porcentajeBp: null, costeCompletoAsegurado: false }, revision: { motivos: ['METODO_COBRO_REAL_NO_ACREDITADO'], documentos: 1, lineas: 1 } }],
  documentos: [{ facturaId: 'f1', numeroFactura: 'TF-2026-01', fecha: '2026-01-31', proveedor: 'TELEFONICA', baseFacturaCentimos: '20000', costePropuestoCentimos: '20000', baseNoAsignadaCentimos: '0', lineasDetectadas: 1, lineasPropuestas: 1, estado: 'PROPUESTA_PARCIAL', motivos: ['SUBTOTAL_NO_VERIFICADO'] }],
  deduplicacion: { documentosRecibidosExcluidos: 1, facturasEmitidasEspejoNoSumadas: 1, telefonosConContratoDuplicado: 0, telefonosSinContratoVigente: 1, contratosSinFechaInicio: 0, contratosConFechaBajaNoDeterminable: 0, clientesNoUnivocos: 0, lineasRechazadasPorControlBase: 0 }, bancoTelefono: { estado: 'CALCULADO_SIN_ASIGNAR_COSTE', usadoEnCoste: false, mensaje: 'Se leyeron movimientos bancarios, sin incluirlos en coste.' }, avisos: ['TELEFONO_SIN_CONTRATO_VIGENTE'],
};

const parsed = parseCustomerAnalyticsResponse(response);
assert.equal(parsed.proposalsOnly, true, 'El DTO sólo permite propuestas.');
assert.equal(parsed.totales.costeConfirmadoCentimos, null, 'Un coste no confirmado permanece no calculable.');
assert.equal(parsed.bancoTelefono.estado, 'CALCULADO_SIN_ASIGNAR_COSTE', 'La UI permite lectura bancaria separada del coste.');
assert.match(formatKnownCents(null), /No calculable/, 'Nunca se muestra 0 para un importe no conocido.');
assert.equal(formatKnownCents('12345678901234567890'), '123.456.789.012.345.678,90 €', 'El formatter no pierde precisión por Number.');
assert.equal(privateDocumentHref('a/b'), '/api/admin/finanzas/modo-facil/documentos/a%2Fb/archivo', 'Las fuentes usan una ruta privada interna.');
assert.equal(documentLabel(parsed.documentos[0]), 'Factura TF-2026-01', 'La UI prefiere el número humano al UUID.');
assert.equal(documentLabel({ ...parsed.documentos[0], numeroFactura: null }), 'Factura de 31 de enero de 2026', 'Si falta número, no expone el UUID interno.');
assert.equal(labelsPhoneReason('METODO_COBRO_REAL_NO_ACREDITADO'), 'No consta un coste confirmado por cobro real');
assert.match(bankStatusLabel('CALCULADO_SIN_ASIGNAR_COSTE'), /no asignada a coste/);
assert.throws(() => parseCustomerAnalyticsResponse({ ...response, stagingOnly: false }), /stagingOnly/);
assert.throws(() => parseCustomerAnalyticsResponse({ ...response, automaticas: true }), /automaticas/);
assert.throws(() => parseCustomerAnalyticsResponse({ ...response, proposalsOnly: false }), /proposalsOnly/);
assert.throws(() => parseCustomerAnalyticsResponse({ ...response, bancoTelefono: { ...response.bancoTelefono, usadoEnCoste: true } }), /bancoTelefono/);
assert.throws(() => parseCustomerAnalyticsResponse({ ...response, bancoTelefono: { ...response.bancoTelefono, estado: 'CALCULADO_Y_USADO_EN_COSTE' } }), /bancoTelefono/);
assert.throws(() => parseCustomerAnalyticsResponse({ ...response, totales: { ...response.totales, margenPotencialEstimado: { ...response.totales.margenPotencialEstimado, costeCompletoAsegurado: true } } }), /costeCompletoAsegurado/);
console.log('test-finance-phone-ui: OK');
