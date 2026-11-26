/**
 * DOM real, sin servidor, red ni BD.
 * Ejecutar: pnpm exec tsx scripts/test-facturacion-interacciones.ts
 * Requiere esbuild (dependencia de tsx), Python Playwright y Chromium locales.
 * Sólo se sustituyen RoleContext y fuentes; parsers, core, gráficos y cliente son reales.
 * CSS vacío: estas pruebas verifican DOM/comportamiento, no diseño visual.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))
const esbuild = createRequire(require.resolve('tsx/package.json'))('esbuild')

const browserEntry = String.raw`
import React from 'react';
import { createRoot } from 'react-dom/client';
import FacturacionClient from '@/app/admin/facturacion/FacturacionClient';
import { buildBankInvoicingAnalytics, classifyInvoice } from '@/lib/finanzas/bank-invoicing-analytics';
import { summarizeBankInvoicing } from '@/lib/finanzas/bank-invoicing-core';
import { parseB7GetQuery, invoiceMatchesB7Query } from '@/lib/finanzas/bank-invoicing-contract';
import { parseBankInvoicingDto } from '@/components/finanzas/facturacion-banco/typesparser';
import { parseMonthlyInvoicingDto } from '@/components/finanzas/monthly-invoicing/response-parser';

const NativeDate = Date;
class FixedDate extends NativeDate {
  constructor(...args) { if (args.length === 0) super('2026-11-24T12:00:00Z'); else super(...args); }
  static now() { return new NativeDate('2026-11-24T12:00:00Z').getTime(); }
}
window.Date = FixedDate;
const p = new URLSearchParams(location.search);
const mode = p.get('mode') || 'normal';
const permissionMode = p.get('permissions') || 'all';
const destinations = ['admin.finanzas.conciliacion', 'admin.crm.empresas', 'admin.finanzas.facturas_emitidas', 'admin.finanzas.importar'];
const permissions = {
  // Baseline registrado NO es ACL. El negativo mantiene surfaces=TRUE.
  surfaces: permissionMode === 'no-surfaces' ? [] : ['/admin/finanzas/conciliar', '/admin/crm/empresas', '/admin/finanzas/facturas-emitidas', '/admin/finanzas/estado-cuentas'],
  areas: {'admin.facturacion': ['none', 'no-surfaces'].includes(permissionMode) ? ['lectura'] : ['lectura', 'escritura', 'exportar'],
    ...Object.fromEntries(destinations.map(area => [area, permissionMode === 'none' ? [] : ['lectura']]))},
  calls: [], isViewingAs: permissionMode === 'preview', effectiveRole: 'SUPER_ADMIN',
};
window.__permissions = permissions;
const coverage = { status: 'KNOWN', asOf: '2026-10-01', activeAccountCount: 2, accountsWithKnownCutoff: 2 };
const settlements = Array.from({length: mode === 'zero' ? 1 : 53}, (_, i) => {
  const n = i + 1, unknown = mode === 'unknown' && i === 0;
  const amount = mode === 'zero' ? 0 : unknown ? null : 12345 + i;
  const paid = amount === null ? null : i % 3 === 2 ? amount : 0;
  const serie = i % 2 ? 'INST' : 'CLL';
  return {
    invoiceId: 'cmfixtureinvoice' + String(n).padStart(8, '0'),
    numFactura: serie + '26/' + String(n).padStart(4, '0'),
    cliente: i === 0 ? 'Cliente Alfa' : i === 1 ? 'Cliente Beta' : 'Cliente ' + n,
    fechaISO: mode === 'access' && i === 0 ? '2026-11-10' : '2026-' + String(i % 3 + 1).padStart(2, '0') + '-10', fechaVencimientoISO: null,
    facturaISPId: 9000 + n, targetCents: amount, paidDocumentaryCents: paid,
    remainingCents: amount === null ? null : amount - paid,
    cashCents: null, attributableCashDifferenceCents: null,
    paymentSources: [], paymentState: unknown ? 'PENDIENTE_COBRO_REVISION' : paid !== 0 ? 'COBRADA_CALCULADA' : 'PENDIENTE_COBRO',
    reasons: unknown ? ['IMPORTE_FUENTE_INEXACTO_O_AUSENTE'] : [],
  };
});
const previous = {...settlements[0], invoiceId: 'cmfixtureprevious00000001', numFactura: 'CLL25/0001', fechaISO: '2025-01-10'};
const all = [...settlements, previous];
const series = new Map(all.map(i => [i.invoiceId, /^[A-Z]+/.exec(i.numFactura)[0]]));
const monthly = {
  recurso: 'resumenFacturacionIspHistorico', query: {mes: null},
  resumenMensual: Array.from({length: 12}, (_, i) => {
    const invoices = settlements.filter(x => x.fechaISO.slice(5,7) === String(i+1).padStart(2,'0'));
    return {mes: '2026-' + String(i+1).padStart(2,'0'), totalFacturadoCents: invoices.reduce((s,x) => s+(x.targetCents ?? 0),0), numFacturas: invoices.length,
      vvalleyFacturadoCents: 0, vvalleyNumFacturas: 0, arrowFacturadoCents: 0, arrowNumFacturas: 0,
      ipsNorteFacturadoCents: 0, ipsNorteNumFacturas: 0, mayoristasTotalCents: 0,
      mayoristasPorcentajeCentimas: invoices.length ? 0 : null, totalRemesadoCents: 0, numRemesas: 0};
  }), porSerie: [], diagnostics: {invoicesExcludedInvalidDate: 0, invoicesExcludedInvalidAmount: 0,
    remittancesExcludedInvalidDate: 0, remittancesExcludedInvalidAmount: 0, seriesMonth: null,
    source: 'FACTURA_ISP_Y_REMESA_ISP_HISTORICAS', payments: 'NO_CALCULADOS_AQUI__B7_B4_B6_ES_LA_UNICA_FUENTE_DE_COBRADO_Y_PENDIENTE'},
};
const exclusionModes = {remittanceDate: 'remittancesExcludedInvalidDate', remittanceAmount: 'remittancesExcludedInvalidAmount',
  invoiceDate: 'invoicesExcludedInvalidDate', invoiceAmount: 'invoicesExcludedInvalidAmount'};
if (exclusionModes[mode]) monthly.diagnostics[exclusionModes[mode]] = 1;
if (mode.startsWith('remittance')) {
  monthly.resumenMensual[0].totalRemesadoCents = 25000;
  monthly.resumenMensual[0].numRemesas = 1;
}
if (mode.startsWith('invoice')) {
  monthly.resumenMensual[0].vvalleyFacturadoCents = 12000;
  monthly.resumenMensual[0].vvalleyNumFacturas = 1;
  monthly.resumenMensual[0].mayoristasTotalCents = 12000;
  monthly.resumenMensual[0].mayoristasPorcentajeCentimas = Math.round(12000 / monthly.resumenMensual[0].totalFacturadoCents * 10000);
}
const parsedMonthly = parseMonthlyInvoicingDto(monthly);
if (!parsedMonthly.ok) throw new Error('Fixture ISP inválida: ' + parsedMonthly.error);
const h = window.__h = {requests: [], violations: [], holds: [], failedYear: null, crm: [], crmMeta: {}, pending: {},
  monthly: parsedMonthly.value,
  hold(key, match) { this.holds.push({key, match}); },
  release(key) { const r = this.pending[key]; if (!r) throw new Error('No existe solicitud pendiente: ' + key); delete this.pending[key]; r(); },
};
function response(json, status = 200) { return {ok: status >= 200 && status < 300, status, json: async () => structuredClone(json)}; }
function fixture(url) {
  if (url.pathname === '/api/admin/facturacion-banco') {
    const query = parseB7GetQuery(url.searchParams);
    if (query.anio === h.failedYear) return response({error: 'Año no disponible'}, 503);
    const buckets = {confirmado: 'COBRADA', por_confirmar: 'REAL', sin_extracto: 'SIN_EXTRACTO', revision: 'REVISION'};
    const matching = all.filter(i => invoiceMatchesB7Query(i, query)
      && (!query.serie || series.get(i.invoiceId) === query.serie)
      && (!query.cobro || classifyInvoice(i, coverage.asOf) === buckets[query.cobro]));
    const dto = {
      recurso: 'facturacionBancoB7', query, pagination: {limit: query.limit, offset: query.offset, total: matching.length},
      summary: summarizeBankInvoicing(matching, null), bankCoverage: coverage,
      items: matching.slice(query.offset, query.offset + query.limit),
      analitica: buildBankInvoicingAnalytics({settlements: all, serieById: series, coverage, query, today: '2026-11-24', matching}),
      calculationBasis: 'B4_ACTIVE_APLICADA_NO_REVERTIDA_JUSTIFICADO_DOCUMENTO__B6_EXPLICITA__RECIBO_REMESA_B7_V1',
    };
    const parsed = parseBankInvoicingDto(dto);
    if (!parsed.ok) throw new Error('Fixture B7 inválida: ' + parsed.error);
    return response(dto);
  }
  if (url.pathname === '/api/admin/facturacion/resumen') return mode === 'noisp' ? response({error: 'ISP no disponible'}, 503) : response(monthly);
  if (url.pathname === '/api/admin/finanzas/cortes-cobertura') return response({accounts: [{alias: 'Cuenta local', banco: 'Banco local', activa: true, effectiveCutoffDate: coverage.asOf}]});
  if (url.pathname === '/api/admin/finanzas/sync-jobs') return response({activeJob: null, lastJob: null});
  if (url.pathname === '/api/admin/crm/empresas') return response({companies: h.crm, total: h.crm.length, page: 1, limit: 40, ...h.crmMeta});
  if (url.pathname === '/api/admin/finanzas/facturas-emitidas') {
    const invoice = all.find(i => i.numFactura === url.searchParams.get('q'));
    if (!invoice) return response({facturas: []});
    const suffix = invoice === settlements[0] ? 'ALFA' : 'BETA';
    const row = {id: invoice.invoiceId, numFactura: invoice.numFactura, cif: 'NIF-' + suffix,
      base: 100, importeIva: 21, formaCobro: 'Transferencia ' + suffix,
      lineas: [{concepto: 'LÍNEA-' + suffix, contrato: 'CONTRATO-' + suffix, importe: 100}]};
    // Mismo número comercial, identidad distinta: debe descartarse siempre.
    return response({facturas: [{...row, id: 'cmidentidaddiferente00001', cif: 'NIF-SEÑUELO', lineas: [{concepto: 'LÍNEA-SEÑUELO', importe: 999}]}, row]});
  }
  throw new Error('Endpoint no previsto: ' + url.pathname);
}
window.fetch = async (input, init = {}) => {
  const raw = typeof input === 'string' ? input : input.url;
  const method = (init.method || 'GET').toUpperCase();
  const record = {url: raw, method}; h.requests.push(record);
  if (method !== 'GET' || !raw.startsWith('/api/')) {h.violations.push(record); throw new Error('Red/escritura prohibida');}
  const url = new URL(raw, 'https://fixture.invalid');
  let value;
  try { value = fixture(url); } catch (error) { h.violations.push({url: raw, error: String(error)}); throw error; }
  const index = h.holds.findIndex(x => Object.entries(x.match).every(([k,v]) => k === 'path' ? url.pathname === v : url.searchParams.get(k) === String(v)));
  if (index >= 0) {
    const {key} = h.holds.splice(index,1)[0];
    await new Promise(resolve => {h.pending[key] = resolve;});
  }
  return value;
};
createRoot(document.getElementById('root')).render(<FacturacionClient />);
`

const pythonTests = String.raw`
import sys, json, re, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

html = Path(sys.argv[1]).as_uri()
suite = sys.argv[2]
failures = []
network = []
errors = []
results = []
local_navigations = []
unexpected_navigations = []

def run(name, fn):
    try:
        fn()
        results.append({'name': name, 'ok': True})
        print('PASS ' + name, flush=True)
    except Exception as e:
        failures.append(name)
        results.append({'name': name, 'ok': False, 'error': str(e)})
        print('FAIL ' + name + '\n' + traceback.format_exc(), flush=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    def block_network(route):
        network.append(route.request.url)
        route.abort()
    context.route(re.compile(r'^https?://'), block_network)
    def page(mode='normal', permissions='all', view='resumen'):
        p = context.new_page()
        p.expected_crm = None
        p.crm_navigations = []
        def local_destination(route):
            url = route.request.url
            p.crm_navigations.append(url)
            local_navigations.append(url)
            if url != p.expected_crm: unexpected_navigations.append(url)
            route.fulfill(status=200, content_type='text/html', body='<p id="local-crm-destination">Destino CRM local, sin app destino ni red</p>')
        p.route(re.compile(r'^file:///admin/'), local_destination)
        p.on('pageerror', lambda error: errors.append(str(error)))
        p.goto(html + '?mode=' + mode + '&permissions=' + permissions + '#' + view)
        expect(p.locator('#kpis .kpi.click')).to_have_count(6)
        expect(p.locator('#v-' + view)).to_have_count(1)
        return p
    def healthy(p):
        assert p.evaluate('window.__h.violations') == [], p.evaluate('window.__h.violations')
        assert all(x['method'] == 'GET' for x in p.evaluate('window.__h.requests'))
    def done(p):
        healthy(p)
        p.close()
    def wait_request(p, match):
        p.wait_for_function('(m) => window.__h.requests.some(r => {const u = new URL(r.url, "https://fixture.invalid"); return Object.entries(m).every(([k,v]) => k === "path" ? u.pathname === v : u.searchParams.get(k) === String(v));})', arg=match)
    def hold(p, key, match):
        p.evaluate('(x) => window.__h.hold(x.key, x.match)', {'key': key, 'match': match})
    def wait_pending(p, key):
        p.wait_for_function('(key) => !!window.__h.pending[key]', arg=key)
    def release(p, key):
        p.evaluate('(key) => window.__h.release(key)', key)
    def crm_requests(p):
        return p.evaluate('window.__h.requests.filter(r => new URL(r.url, "https://fixture.invalid").pathname === "/api/admin/crm/empresas").map(r => Object.fromEntries(new URL(r.url, "https://fixture.invalid").searchParams))')
    def no_crm_navigation(p, initial):
        assert p.url == initial, (initial, p.url)
        assert p.crm_navigations == [], p.crm_navigations
    def navigate_crm(p, company_id, action):
        healthy(p)
        p.expected_crm = 'file:///admin/crm/empresas/' + company_id
        with p.expect_navigation(wait_until='domcontentloaded', timeout=5000): action()
        assert p.url == p.expected_crm, p.url
        assert p.crm_navigations == [p.expected_crm], p.crm_navigations
        expect(p.locator('#local-crm-destination')).to_have_count(1)
        p.close()
    def assert_tab(p, view):
        expect(p.locator('[role=tab]')).to_have_count(5)
        expect(p.locator('[role=tab][aria-selected=true]')).to_have_count(1)
        expect(p.locator('[role=tab][aria-selected=true]')).to_have_attribute('href', '#' + view)
        expect(p.locator('main section.view')).to_have_count(1)
        expect(p.locator('#v-' + view)).to_have_count(1)
        assert p.evaluate('location.hash') == '#' + view

    def tabs():
        p = page(view='clientes')
        assert_tab(p, 'clientes')
        for view in ['resumen', 'facturas', 'cobros', 'clientes', 'meses']:
            p.locator('[role=tab][href="#' + view + '"]').click()
            assert_tab(p, view)
        p.evaluate('location.hash = "cobros"')
        expect(p.locator('#v-cobros')).to_have_count(1)
        assert_tab(p, 'cobros')
        p.locator('[role=tab][href="#facturas"]').focus()
        p.keyboard.press('Enter')
        assert_tab(p, 'facturas')
        p.locator('[role=tab][href="#meses"]').focus()
        p.keyboard.press('Space')
        assert_tab(p, 'meses')
        p.evaluate('location.hash = "no-existe"')
        expect(p.locator('#v-meses')).to_have_count(1)
        done(p)

    def pagination_filters():
        p = page(view='facturas')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        expect(p.locator('.pager')).to_contain_text('Mostrando 1–50 de 53')
        p.get_by_role('button', name='Siguiente', exact=True).click()
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(3)
        expect(p.locator('.pager')).to_contain_text('Mostrando 51–53 de 53')
        wait_request(p, {'path': '/api/admin/facturacion-banco', 'limit': '50', 'offset': '50'})
        expect(p.get_by_role('button', name='Siguiente', exact=True)).to_be_disabled()
        p.get_by_role('button', name='Anterior', exact=True).click()
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        p.get_by_label('Mes', exact=True).select_option('01')
        wait_request(p, {'path': '/api/admin/facturacion-banco', 'mes': '2026-01', 'offset': '0', 'limit': '50'})
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(18)
        p.get_by_label('Serie', exact=True).select_option('CLL')
        wait_request(p, {'mes': '2026-01', 'serie': 'CLL', 'offset': '0'})
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(9)
        p.get_by_label('Estado', exact=True).select_option('por_confirmar')
        wait_request(p, {'mes': '2026-01', 'serie': 'CLL', 'cobro': 'por_confirmar', 'offset': '0'})
        p.get_by_label('Buscar facturas').fill('  Cliente Alfa  ')
        wait_request(p, {'q': 'Cliente Alfa', 'mes': '2026-01', 'serie': 'CLL', 'cobro': 'por_confirmar', 'offset': '0', 'limit': '50'})
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(1)
        expect(p.locator('#v-facturas tbody')).to_contain_text('CLL26/0001')
        p.get_by_label('Buscar facturas').fill('ningún-cliente')
        expect(p.locator('#v-facturas tbody')).to_contain_text('Ninguna factura cumple el filtro.')
        done(p)

    def list_race():
        p = page(view='facturas')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        hold(p, 'oldList', {'path': '/api/admin/facturacion-banco', 'q': 'Cliente Alfa', 'limit': '50'})
        p.get_by_label('Buscar facturas').fill('Cliente Alfa')
        wait_pending(p, 'oldList')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(0)
        p.get_by_label('Buscar facturas').fill('Cliente Beta')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(1)
        expect(p.locator('#v-facturas tbody')).to_contain_text('INST26/0002')
        release(p, 'oldList')
        p.wait_for_timeout(150)
        expect(p.locator('#v-facturas tbody')).to_contain_text('INST26/0002')
        expect(p.locator('#v-facturas tbody')).not_to_contain_text('CLL26/0001')
        done(p)

    def year_failure():
        p = page(view='facturas')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        p.locator('#v-facturas tbody tr.rowclick').first.dispatch_event('click')
        expect(p.get_by_role('dialog')).to_have_count(1)
        p.evaluate('window.__h.failedYear = 2025')
        hold(p, 'failedMain', {'path': '/api/admin/facturacion-banco', 'anio': '2025', 'limit': '1'})
        hold(p, 'failedList', {'path': '/api/admin/facturacion-banco', 'anio': '2025', 'limit': '50'})
        p.get_by_label('Año', exact=True).select_option('2025')
        wait_pending(p, 'failedMain')
        wait_pending(p, 'failedList')
        expect(p.locator('#kpis .kpi.click')).to_have_count(0)
        expect(p.locator('#v-facturas')).to_have_count(0)
        expect(p.get_by_role('dialog')).to_have_count(0)
        release(p, 'failedList')
        release(p, 'failedMain')
        expect(p.get_by_role('alert')).to_contain_text('Año no disponible')
        expect(p.locator('#kpis .kpi.click')).to_have_count(0)
        expect(p.locator('main table')).to_have_count(0)
        done(p)

    def year_race():
        p = page(view='facturas')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        hold(p, 'oldYear', {'path': '/api/admin/facturacion-banco', 'anio': '2025', 'limit': '1'})
        hold(p, 'oldYearList', {'path': '/api/admin/facturacion-banco', 'anio': '2025', 'limit': '50'})
        p.get_by_label('Año', exact=True).select_option('2025')
        wait_pending(p, 'oldYear')
        wait_pending(p, 'oldYearList')
        # Mientras carga, sólo queda el año seleccionado: añadimos una opción DOM,
        # sin tocar React ni su lógica, para emitir el cambio real al año anterior.
        p.get_by_label('Año', exact=True).evaluate('(s) => {s.add(new Option("2026", "2026"));}')
        p.get_by_label('Año', exact=True).select_option('2026')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        expect(p.locator('#kpis')).to_contain_text('Facturado 2026')
        release(p, 'oldYearList')
        release(p, 'oldYear')
        p.wait_for_timeout(150)
        expect(p.locator('#kpis')).to_contain_text('Facturado 2026')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        expect(p.locator('#v-facturas tbody')).not_to_contain_text('CLL25/0001')
        done(p)

    def detail_races():
        p = page(view='facturas')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        hold(p, 'detailA', {'path': '/api/admin/finanzas/facturas-emitidas', 'q': 'CLL26/0001'})
        hold(p, 'detailB', {'path': '/api/admin/finanzas/facturas-emitidas', 'q': 'INST26/0002'})
        p.locator('#v-facturas tbody tr.rowclick').nth(0).dispatch_event('click')
        wait_pending(p, 'detailA')
        p.locator('#v-facturas tbody tr.rowclick').nth(1).dispatch_event('click')
        wait_pending(p, 'detailB')
        release(p, 'detailB')
        dialog = p.get_by_role('dialog')
        expect(dialog).to_have_attribute('aria-label', 'Factura INST26/0002')
        expect(dialog).to_contain_text('NIF-BETA')
        expect(dialog).to_contain_text('LÍNEA-BETA')
        expect(dialog).not_to_contain_text('SEÑUELO')
        release(p, 'detailA')
        p.wait_for_timeout(150)
        expect(dialog).to_contain_text('LÍNEA-BETA')
        expect(dialog).not_to_contain_text('LÍNEA-ALFA')
        # Sin CSS, el backdrop fijo tapa físicamente el drawer: se emite el
        # evento del botón real, sin sustituir el handler del componente.
        p.get_by_role('button', name='Cerrar', exact=True).dispatch_event('click')
        expect(p.get_by_role('dialog')).to_have_count(0)
        hold(p, 'closedA', {'path': '/api/admin/finanzas/facturas-emitidas', 'q': 'CLL26/0001'})
        p.locator('#v-facturas tbody tr.rowclick').first.dispatch_event('click')
        wait_pending(p, 'closedA')
        p.keyboard.press('Escape')
        expect(p.get_by_role('dialog')).to_have_count(0)
        release(p, 'closedA')
        p.wait_for_timeout(150)
        expect(p.get_by_role('dialog')).to_have_count(0)
        p.locator('#v-facturas tbody tr.rowclick').nth(1).dispatch_event('click')
        expect(p.get_by_role('dialog')).to_contain_text('LÍNEA-BETA')
        expect(p.get_by_role('dialog')).not_to_contain_text('LÍNEA-ALFA')
        done(p)

    def negative_permissions(permissions='none'):
        p = page(mode='access', permissions=permissions)
        grants = p.evaluate('window.__permissions')
        if permissions == 'none':
            assert len(grants['surfaces']) == 4, grants
            assert grants['areas']['admin.facturacion'] == ['lectura'], grants
            assert all(grants['areas'][area] == [] for area in ['admin.finanzas.conciliacion', 'admin.crm.empresas', 'admin.finanzas.facturas_emitidas', 'admin.finanzas.importar']), grants
        for view in ['resumen', 'facturas', 'cobros', 'clientes', 'meses']:
            p.locator('[role=tab][href="#' + view + '"]').click()
            expect(p.locator('#v-' + view)).to_have_count(1)
            expect(p.locator('a[href^="/admin/crm"]')).to_have_count(0)
            expect(p.locator('a[href^="/admin/finanzas/conciliar"]')).to_have_count(0)
            expect(p.get_by_role('button', name='Sincronizar con ISP', exact=True)).to_have_count(0)
            expect(p.get_by_label('Acciones').locator('option[value="excel"]')).to_have_count(0)
            expect(p.get_by_label('Acciones').locator('option[value="anio"]')).to_have_count(0)
            expect(p.get_by_label('Acciones').locator('option[value="libro"]')).to_have_count(0)
            if view == 'resumen':
                expect(p.locator('.look').get_by_role('button', name='Conciliar', exact=True)).to_have_count(0)
                expect(p.locator('.look').get_by_role('button', name='Cargar', exact=True)).to_have_count(0)
                expect(p.locator('svg[aria-label="Principales clientes"] g[style*="pointer"]')).to_have_count(0)
            if view == 'clientes':
                expect(p.locator('#v-clientes tbody tr.rowclick')).to_have_count(0)
        p.locator('[role=tab][href="#facturas"]').click()
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        p.locator('#v-facturas tbody tr.rowclick').first.dispatch_event('click')
        expect(p.get_by_role('dialog')).to_have_count(1)
        expect(p.get_by_role('dialog').locator('a')).to_have_count(0)
        expect(p.get_by_role('button', name='Abrir ficha del cliente', exact=True)).to_have_count(0)
        assert not any('/crm/' in r['url'] or '/facturas-emitidas?' in r['url'] for r in p.evaluate('window.__h.requests'))
        done(p)

    def positive_permissions():
        p = page(mode='access')
        expect(p.locator('a[href="/admin/finanzas/conciliar"]')).to_have_count(2)
        expect(p.locator('.look').get_by_role('button', name='Conciliar', exact=True)).to_have_count(1)
        expect(p.locator('.look').get_by_role('button', name='Cargar', exact=True)).to_have_count(1)
        expect(p.locator('svg[aria-label="Principales clientes"] g[style*="pointer"]')).not_to_have_count(0)
        expect(p.get_by_label('Acciones').locator('option[value="libro"]')).to_have_count(1)
        calls = p.evaluate('window.__permissions.calls')
        for area in ['admin.finanzas.conciliacion', 'admin.crm.empresas', 'admin.finanzas.facturas_emitidas', 'admin.finanzas.importar']:
            assert {'kind': 'area', 'area': area, 'tipo': 'lectura'} in calls, (area, calls)
        p.locator('[role=tab][href="#clientes"]').click()
        expect(p.locator('#v-clientes tbody tr.rowclick')).not_to_have_count(0)
        p.locator('[role=tab][href="#facturas"]').click()
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        expect(p.locator('#v-facturas tbody tr.rowclick').first.locator('a[href="/admin/crm/empresas"]')).to_have_count(1)
        p.locator('#v-facturas tbody tr.rowclick').first.dispatch_event('click')
        expect(p.get_by_role('dialog')).to_contain_text('NIF-ALFA')
        expect(p.get_by_role('dialog')).to_contain_text('LÍNEA-ALFA')
        expect(p.get_by_role('button', name='Abrir ficha del cliente', exact=True)).to_have_count(1)
        expect(p.get_by_role('dialog').locator('a[href="/admin/finanzas/conciliar"]')).to_have_count(1)
        done(p)

    def preview_permissions():
        p = page(permissions='preview')
        expect(p.get_by_role('button', name='Sincronizar con ISP', exact=True)).to_have_count(0)
        expect(p.get_by_label('Acciones').locator('option[value="excel"]')).to_have_count(0)
        expect(p.get_by_label('Acciones').locator('option[value="anio"]')).to_have_count(0)
        done(p)

    def crm_ambiguity():
        p = page(view='facturas')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        initial = p.url
        p.evaluate('window.__h.crm = [{id:"cmnear0001", nombre:"Cliente Alfa Sur"}]')
        p.locator('#v-facturas tbody tr.rowclick').first.locator('a').click()
        expect(p.locator('.toast')).to_contain_text('no tiene ficha')
        assert p.url == initial
        p.evaluate('window.__h.crm = [{id:"cmexact0001",nombre:"Cliente Alfa"},{id:"cmexact0002",nombre:"CLIENTE ALFA"}]')
        p.locator('#v-facturas tbody tr.rowclick').first.locator('a').click()
        expect(p.locator('.toast')).to_contain_text('varias fichas')
        assert p.url == initial
        expect(p.get_by_role('dialog')).to_have_count(0)
        done(p)

    def crm_known_nif_mismatch():
        p = page(view='facturas')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        initial = p.url
        p.locator('#v-facturas tbody tr.rowclick').first.dispatch_event('click')
        expect(p.get_by_role('dialog')).to_contain_text('NIF-ALFA')
        p.evaluate('window.__h.crm = [{id:"cmwrongnif", nombre:"Cliente Alfa", nif:"NIF-OTRO"}]')
        p.get_by_role('button', name='Abrir ficha del cliente', exact=True).dispatch_event('click')
        wait_request(p, {'path': '/api/admin/crm/empresas', 'query': 'NIF-ALFA', 'limit': '40'})
        expect(p.locator('.toast')).to_be_visible()
        no_crm_navigation(p, initial)
        requests = crm_requests(p)
        assert len(requests) == 1 and requests[0]['query'] == 'NIF-ALFA', requests
        expect(p.get_by_role('dialog')).to_contain_text('NIF-ALFA')
        done(p)

    def crm_pending_detail_identity():
        p = page(view='facturas')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        initial = p.url
        hold(p, 'identityDetail', {'path': '/api/admin/finanzas/facturas-emitidas', 'q': 'CLL26/0001'})
        p.locator('#v-facturas tbody tr.rowclick').first.dispatch_event('click')
        wait_pending(p, 'identityDetail')
        drawer = p.get_by_role('dialog')
        expect(drawer.locator('a[href="/admin/crm/empresas"]')).to_have_count(0)
        expect(drawer.get_by_role('button', name='Abrir ficha del cliente', exact=True)).to_have_count(0)
        assert crm_requests(p) == []
        # También se invalida una lectura anterior iniciada desde el listado;
        # se emite el evento real sin retirar el backdrop ni alterar el handler.
        p.evaluate('window.__h.crm = [{id:"cmcontradictorypending", nombre:"Cliente Alfa", nif:"NIF-OTRO"}]')
        hold(p, 'identityName', {'path': '/api/admin/crm/empresas', 'query': 'Cliente Alfa'})
        p.locator('#v-facturas tbody tr.rowclick').first.locator('a').dispatch_event('click')
        wait_pending(p, 'identityName')
        release(p, 'identityDetail')
        expect(drawer).to_contain_text('NIF-ALFA')
        expect(drawer.get_by_role('button', name='Abrir ficha del cliente', exact=True)).to_have_count(1)
        release(p, 'identityName')
        p.wait_for_timeout(150)
        no_crm_navigation(p, initial)
        drawer.get_by_role('button', name='Abrir ficha del cliente', exact=True).dispatch_event('click')
        wait_request(p, {'path': '/api/admin/crm/empresas', 'query': 'NIF-ALFA'})
        expect(p.locator('.toast')).to_be_visible()
        no_crm_navigation(p, initial)
        done(p)

    def crm_metadata_rejected(meta):
        p = page(view='facturas')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        initial = p.url
        p.evaluate('(meta) => {window.__h.crm = [{id:"cmuniquealfa", nombre:"Cliente Alfa"}]; window.__h.crmMeta = meta;}', meta)
        p.locator('#v-facturas tbody tr.rowclick').first.locator('a').click()
        wait_request(p, {'path': '/api/admin/crm/empresas', 'query': 'Cliente Alfa', 'limit': '40'})
        expect(p.locator('.toast')).to_be_visible()
        no_crm_navigation(p, initial)
        assert len(crm_requests(p)) == 1, crm_requests(p)
        done(p)

    def crm_positive_name():
        p = page(view='facturas')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        p.evaluate('window.__h.crm = [{id:"cmexactname", nombre:"CLIENTE ALFA"}]')
        navigate_crm(p, 'cmexactname', lambda: p.locator('#v-facturas tbody tr.rowclick').first.locator('a').click())

    def crm_positive_nif():
        p = page(view='facturas')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        p.locator('#v-facturas tbody tr.rowclick').first.dispatch_event('click')
        expect(p.get_by_role('dialog')).to_contain_text('NIF-ALFA')
        p.evaluate('window.__h.crm = [{id:"cmexactnif", nombre:"Razón social distinta", nif:"nif alfa"}]')
        navigate_crm(p, 'cmexactnif', lambda: p.get_by_role('button', name='Abrir ficha del cliente', exact=True).dispatch_event('click'))

    def crm_click_race():
        p = page(view='facturas')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        initial = p.url
        p.evaluate('window.__h.crm = [{id:"cmstalealfa", nombre:"Cliente Alfa"}]')
        hold(p, 'crmA', {'path': '/api/admin/crm/empresas', 'query': 'Cliente Alfa'})
        p.locator('#v-facturas tbody tr.rowclick').nth(0).locator('a').click()
        wait_pending(p, 'crmA')
        p.evaluate('window.__h.crm = []')
        p.locator('#v-facturas tbody tr.rowclick').nth(1).locator('a').click()
        wait_request(p, {'path': '/api/admin/crm/empresas', 'query': 'Cliente Beta'})
        expect(p.locator('.toast')).to_be_visible()
        release(p, 'crmA')
        p.wait_for_timeout(150)
        no_crm_navigation(p, initial)
        assert [r['query'] for r in crm_requests(p)] == ['Cliente Alfa', 'Cliente Beta'], crm_requests(p)
        done(p)

    def crm_context_race(change):
        p = page(view='facturas')
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        p.evaluate('window.__h.crm = [{id:"cmstalecontext", nombre:"Cliente Alfa"}]')
        hold(p, 'crmContext', {'path': '/api/admin/crm/empresas', 'query': 'Cliente Alfa'})
        p.locator('#v-facturas tbody tr.rowclick').first.locator('a').click()
        wait_pending(p, 'crmContext')
        if change == 'tab':
            p.locator('[role=tab][href="#meses"]').click()
            expect(p.locator('#v-meses')).to_have_count(1)
        elif change == 'hash':
            p.evaluate('location.hash = "clientes"')
            expect(p.locator('#v-clientes')).to_have_count(1)
        else:
            p.get_by_label('Año', exact=True).select_option('2025')
            expect(p.locator('#kpis')).to_contain_text('Facturado 2025')
        changed_url = p.url
        release(p, 'crmContext')
        p.wait_for_timeout(150)
        no_crm_navigation(p, changed_url)
        if change == 'year': expect(p.get_by_label('Año', exact=True)).to_have_value('2025')
        elif change == 'tab': assert_tab(p, 'meses')
        else: assert_tab(p, 'clientes')
        done(p)

    def unknown_total():
        p = page(mode='unknown')
        kpi = p.locator('#kpis .kpi').filter(has=p.locator('.eyebrow', has_text='Facturado 2026'))
        expect(kpi.locator('.v')).to_have_text('sin dato')
        expect(p.get_by_role('status')).to_contain_text('Subtotal conocido:')
        expect(p.get_by_role('status')).to_contain_text('1 facturas sin importe verificable')
        expect(p.locator('#v-resumen .fmeter')).to_have_count(0)
        for text in p.locator('#v-resumen .chk').all_text_contents():
            assert not text.lstrip().startswith(('✔', '✓')), text
            assert 'diferencia 0' not in text, text
        average = p.locator('#kpis .kpi').filter(has=p.locator('.eyebrow', has_text='Media mensual'))
        expect(average.locator('.v')).to_have_text('sin dato')
        p.locator('[role=tab][href="#meses"]').click()
        expect(p.locator('#v-meses .chk')).to_contain_text('no se puede confirmar el cuadre')
        expect(p.locator('#v-meses .chk')).not_to_contain_text('✔')
        p.locator('[role=tab][href="#facturas"]').click()
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(50)
        cells = p.locator('#v-facturas tbody tr.rowclick').first.locator('td')
        for index in [3,4,5]: expect(cells.nth(index)).to_have_text('sin dato')
        done(p)

    def no_isp():
        p = page(mode='noisp', view='meses')
        expect(p.locator('#v-meses .tot')).to_contain_text('Subtotal conocido')
        values = p.locator('#v-meses .tot td').all_text_contents()[1:]
        assert values and all(v.strip() == 'sin dato' for v in values), values
        assert not any('0 €' in v or '0,00' in v for v in values), values
        expect(p.locator('#v-meses .chk')).to_have_count(0)
        p.locator('[role=tab][href="#resumen"]').click()
        expect(p.locator('#v-resumen')).to_contain_text('Mayoristas: sin dato comparable')
        expect(p.locator('#v-resumen')).to_contain_text('Remesas: sin dato')
        done(p)

    def isp_exclusions(mode, diagnostic, dimension):
        p = page(mode=mode, view='meses')
        assert p.evaluate('(key) => window.__h.monthly.diagnostics[key]', diagnostic) == 1
        expect(p.get_by_role('status')).to_contain_text('Resumen ISP incompleto')
        expect(p.get_by_role('status')).to_contain_text('no como cero')
        rows = p.locator('#v-meses tbody tr:not(.tot):not(.sub)')
        expect(rows).to_have_count(11)
        affected = [5, 6] if dimension == 'remittances' else [1, 2, 3, 4]
        for row in rows.all() + [p.locator('#v-meses .tot')]:
            for index in affected: expect(row.locator('td').nth(index)).to_have_text('sin dato')
        expect(p.locator('#v-meses .tot td').first).to_have_text('Subtotal conocido')
        expect(p.locator('#v-meses .sub')).to_have_count(1)
        expect(p.locator('#v-meses .sub')).to_contain_text('No son los totales completos')
        expected_fact = p.evaluate('window.__h.monthly.resumenMensual.slice(0, 11).reduce((s, r) => s + r.totalFacturadoCents, 0) / 100')
        subtotal_text = p.evaluate('(value) => value.toLocaleString("es-ES", {minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always"}) + " €"', expected_fact)
        expect(p.locator('#v-meses .sub')).to_contain_text(subtotal_text)
        expected_rem = p.evaluate('window.__h.monthly.resumenMensual.slice(0, 11).reduce((s, r) => s + r.totalRemesadoCents, 0) / 100')
        subtotal_rem = p.evaluate('(value) => value.toLocaleString("es-ES", {minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always"}) + " €"', expected_rem)
        expect(p.locator('#v-meses .sub')).to_contain_text('remesado ' + subtotal_rem)
        if dimension == 'remittances': assert expected_rem == 250, expected_rem
        expect(p.locator('#v-meses .chk')).to_contain_text('no se puede confirmar el cuadre')
        expect(p.locator('#v-meses .chk')).not_to_contain_text('✔')
        expect(p.locator('#v-meses .chk')).to_have_class(re.compile(r'\bwarn\b'))
        if dimension == 'remittances':
            expect(rows.first.locator('td').nth(1)).not_to_have_text('sin dato')
            expect(p.locator('#v-meses .tot td').nth(1)).to_have_text(subtotal_text)
            expect(rows.first.locator('td').nth(3)).to_have_text('0,00 €')
        else:
            expect(rows.first.locator('td').nth(5)).to_have_text('0,00 €')
            expect(rows.first.locator('td').nth(6)).to_have_text('0')
            expect(p.locator('#v-meses .tot td').nth(5)).to_have_text('0,00 €')
            expect(p.locator('#v-meses .tot td').nth(6)).to_have_text('0')
        p.locator('[role=tab][href="#resumen"]').click()
        chart = p.locator('svg[aria-label="Facturado por mes"]')
        if dimension == 'remittances':
            expect(chart.locator('path')).to_have_count(0)
            expect(chart.locator('circle')).to_have_count(0)
            expect(p.locator('#v-resumen .legend span').filter(has_text='Remesado (domiciliaciones)')).to_have_count(0)
            expect(p.locator('#v-resumen')).to_contain_text('Remesas: sin dato')
            expect(p.locator('.look').filter(has_text='0 remesas')).to_have_count(0)
            expect(p.locator('.look').filter(has_text='sin remesar')).to_have_count(0)
        else:
            expect(chart.locator('rect[fill="var(--before)"]')).to_have_count(0)
            expect(p.locator('#v-resumen')).to_contain_text('Mayoristas: sin dato comparable')
            # Las remesas sí son conocidas: no se contaminan con exclusiones de facturas.
            expect(chart.locator('path')).to_have_count(1)
            expect(chart.locator('circle')).to_have_count(11)
            expect(p.locator('.look').filter(has_text='0 remesas')).to_have_count(1)
        done(p)

    def known_zero():
        p = page(mode='zero')
        kpi = p.locator('#kpis .kpi').filter(has=p.locator('.eyebrow', has_text='Facturado 2026'))
        expect(kpi.locator('.v')).to_have_text('0 €')
        expect(p.get_by_role('status')).to_have_count(0)
        expect(p.locator('svg[aria-label="Facturado por mes"] path')).to_have_count(1)
        expect(p.locator('svg[aria-label="Facturado por mes"] circle')).to_have_count(11)
        expect(p.locator('.look').filter(has_text='0 remesas')).to_have_count(1)
        p.locator('[role=tab][href="#meses"]').click()
        cells = p.locator('#v-meses tbody tr').first.locator('td')
        for index in [1, 3, 5]: expect(cells.nth(index)).to_have_text('0,00 €')
        for index in [4, 6]:
            if index == 4: expect(cells.nth(index)).to_have_text('0,00 %')
            else: expect(cells.nth(index)).to_have_text('0')
        expect(p.locator('#v-meses .tot td').first).to_have_text('Total')
        expect(p.locator('#v-meses .chk')).to_contain_text('✔')
        expect(p.locator('#v-meses .sub')).to_have_count(0)
        p.locator('[role=tab][href="#facturas"]').click()
        expect(p.locator('#v-facturas tbody tr.rowclick')).to_have_count(1)
        expect(p.locator('#v-facturas tbody tr.rowclick td').nth(3)).to_have_text('0,00 €')
        done(p)

    if suite == 'interacciones':
        for name, fn in [('cinco vistas y hash/teclado', tabs), ('paginación de 50 y filtros reales', pagination_filters),
          ('listado: respuesta tardía no sustituye el filtro nuevo', list_race), ('cambio de año fallido borra cifras y detalle', year_failure),
          ('año/listado: respuestas tardías no sustituyen el año nuevo', year_race), ('detalle A/B y cerrar: identidad canónica y respuestas tardías', detail_races),
          ('CRM no elige aproximación ni coincidencias múltiples', crm_ambiguity),
          ('CRM drawer: NIF conocido no permite fallback por nombre distinto', crm_known_nif_mismatch),
          ('CRM detalle pendiente: no enlace prematuro y NIF exacto invalida nombre anterior', crm_pending_detail_identity),
          ('CRM respuesta completa: nombre exacto navega al destino local real', crm_positive_name),
          ('CRM respuesta completa: NIF exacto navega aunque el nombre difiera', crm_positive_nif),
          ('CRM clic B invalida A: respuesta A posterior no navega', crm_click_race),
          ('CRM cambio de pestaña invalida respuesta pendiente', lambda: crm_context_race('tab')),
          ('CRM cambio de hash invalida respuesta pendiente', lambda: crm_context_race('hash')),
          ('CRM cambio de año invalida respuesta pendiente', lambda: crm_context_race('year'))]: run(name, fn)
        for label, meta in [('total truncado > 40', {'total': 41}), ('total no cubierto por companies', {'total': 2}),
          ('total ausente', {'total': None}), ('total fraccionario', {'total': 1.5}), ('total negativo', {'total': -1}),
          ('page ausente', {'page': None}), ('page cero', {'page': 0}), ('page posterior', {'page': 2}), ('page fraccionaria', {'page': 1.5}),
          ('limit ausente', {'limit': None}), ('limit cero', {'limit': 0}), ('limit fraccionario', {'limit': 40.5}), ('limit fuera de rango', {'limit': 41})]:
            run('CRM rechaza ' + label + ' aunque haya candidato único', lambda meta=meta: crm_metadata_rejected(meta))
    else:
        for name, fn in [('total desconocido conserva sin dato, subtotal y ausencia de cuadre', unknown_total),
          ('sin ISP: subtotal desconocido no se inventa como cero', no_isp), ('cero conocido sí se conserva como cero', known_zero),
          ('surface TRUE y solo lectura facturación: ACL destino negativa en vistas/detalle', negative_permissions),
          ('surface FALSE y ACL lectura positiva: destinos siguen ocultos', lambda: negative_permissions('no-surfaces')),
          ('surface TRUE y lecturas ACL exactas: destinos y detalle disponibles', positive_permissions),
          ('vista como usuario no exporta ni sincroniza', preview_permissions)]: run(name, fn)
        for mode, diagnostic, dimension in [('remittanceDate', 'remittancesExcludedInvalidDate', 'remittances'),
          ('remittanceAmount', 'remittancesExcludedInvalidAmount', 'remittances'),
          ('invoiceDate', 'invoicesExcludedInvalidDate', 'invoices'), ('invoiceAmount', 'invoicesExcludedInvalidAmount', 'invoices')]:
            run('ISP ' + diagnostic + ': dimensión desconocida, subtotal verificable y sin falso cuadre', lambda mode=mode, diagnostic=diagnostic, dimension=dimension: isp_exclusions(mode, diagnostic, dimension))
    for p in context.pages:
        try: healthy(p)
        except Exception as e: failures.append('guardia fetch'); print(str(e))
    context.close()
    browser.close()
if network: failures.append('solicitudes externas'); print('NETWORK ' + json.dumps(network))
if errors: failures.append('errores de página'); print('PAGEERROR ' + json.dumps(errors))
if unexpected_navigations: failures.append('navegación inesperada'); print('UNEXPECTED_NAV ' + json.dumps(unexpected_navigations))
print(json.dumps({'suite': suite, 'tests': results, 'count': len(results), 'passed': sum(x['ok'] for x in results), 'externalRequests': network, 'pageErrors': errors, 'localCrmNavigations': local_navigations, 'unexpectedNavigations': unexpected_navigations}, ensure_ascii=False), flush=True)
sys.exit(1 if failures else 0)
`

export async function runFacturacionDomTests(suite: 'interacciones' | 'presentacion'): Promise<void> {
  const temp = mkdtempSync(join(tmpdir(), `facturacion-${suite}-`))
  try {
    const entry = join(temp, 'entry.tsx')
    writeFileSync(entry, browserEntry, 'utf8')
    writeFileSync(join(temp, 'role.ts'), `export function useRole() { const p = window.__permissions; return { ...p, hasSurfaceAccess: (href) => { p.calls.push({kind: 'surface', href}); return p.surfaces.includes(href); }, hasAreaAccess: (area, tipo = 'lectura') => { p.calls.push({kind: 'area', area, tipo}); return (p.areas[area] ?? []).includes(tipo); } }; }\n`, 'utf8')
    writeFileSync(join(temp, 'fonts.ts'), 'export const ioFontClasses = "";\n', 'utf8')
    await esbuild.build({
      absWorkingDir: root, entryPoints: [entry], outfile: join(temp, 'bundle.js'), bundle: true,
      platform: 'browser', format: 'iife', jsx: 'automatic', target: ['chrome120'],
      nodePaths: [join(root, 'node_modules')], alias: {'@': root}, loader: {'.css': 'empty'},
      define: {'process.env.NODE_ENV': '"production"'},
      plugins: [{name: 'local-context-and-fonts', setup(build) {
        build.onResolve({filter: /(?:^|\/)RoleContext(?:\.tsx)?$/}, () => ({path: join(temp, 'role.ts')}))
        build.onResolve({filter: /^\.\/fonts$/}, args => args.importer.endsWith('/components/io-ui/kit.tsx') ? {path: join(temp, 'fonts.ts')} : undefined)
      }}],
    })
    writeFileSync(join(temp, 'index.html'), '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; img-src \'none\'; font-src \'none\'"></head><body><div id="root"></div><script src="./bundle.js"></script></body></html>\n', 'utf8')
    writeFileSync(join(temp, 'run.py'), pythonTests, 'utf8')
    const result = spawnSync('python3', [join(temp, 'run.py'), join(temp, 'index.html'), suite], {cwd: root, stdio: 'inherit', timeout: 180_000})
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`Pruebas DOM ${suite}: salida ${result.status ?? result.signal}`)
  } finally {
    rmSync(temp, {recursive: true, force: true})
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runFacturacionDomTests('interacciones').catch(error => { console.error(error); process.exitCode = 1 })
}
