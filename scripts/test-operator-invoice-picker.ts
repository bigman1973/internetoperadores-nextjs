import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { OPERATOR_INVOICE_ALL_HISTORY_DEFAULT, operatorInvoiceParams } from '../lib/finanzas/operator-invoice-picker';

assert.equal(OPERATOR_INVOICE_ALL_HISTORY_DEFAULT, true);
for (const periodo of ['2026-10', '2025-01', '2027-12']) {
  const params = operatorInvoiceParams({ buscar: '  Cogent  ', page: 1, periodo });
  assert.equal(params.get('action'), 'facturas');
  assert.equal(params.get('buscar'), 'Cogent');
  assert.equal(params.has('periodo'), false, 'el mes de coste no debe ocultar facturas antiguas por defecto');
}
const limited = operatorInvoiceParams({ buscar: 'Cogent', page: 3, periodo: '2026-10', allHistory: false });
assert.equal(limited.get('periodo'), '2026-10');
assert.equal(limited.get('page'), '3');
const unlimited = operatorInvoiceParams({ buscar: 'proveedor + nombre & concepto', page: 2, periodo: '2026-10', allHistory: true });
assert.equal(new URLSearchParams(unlimited.toString()).get('buscar'), 'proveedor + nombre & concepto');
assert.equal(unlimited.has('periodo'), false);

// Render sintético del formulario inicial: no efectos, API, sesión ni base de datos.
const source = fs.readFileSync('components/finanzas/OperatorCosts.tsx', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText + '\nexports.__testCostEditor = CostEditor;';
const module = { exports: {} as any };
const require = createRequire(import.meta.url);
vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams, Intl, Date, Set, Map, AbortController, console, require: (name: string) => name === '@/lib/finanzas/operator-invoice-picker' ? { OPERATOR_INVOICE_ALL_HISTORY_DEFAULT, operatorInvoiceParams } : require(name) });
const html = renderToStaticMarkup(React.createElement(module.exports.__testCostEditor, { initialGroups: [], canWrite: true, onClose() {}, onSaved() {} }));
assert.match(html, /id="operator-invoice-search"/);
assert.match(html, /type="checkbox" checked=""/);
assert.match(html, /Busca entre las facturas de proveedores/);
assert.match(html, /El período de coste no limita esta búsqueda/);
assert.match(html, /Cargando facturas/);
assert.doesNotMatch(html, /Original elegida/);
console.log('Selector operadora: histórico por defecto, período solo opt-in, búsqueda literal, paginación y formulario inicial comprobados sin API ni DB.');
