'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
function compile(relative, resolve) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { exports: module.exports, module, require: resolve || require });
  return module.exports;
}
const policy = compile('components/public/metricool-policy.ts');
let pathname = '/';
const component = compile('components/public/MetricoolHead.tsx', name => name === 'next/navigation' ? { usePathname: () => pathname } : name === './metricool-policy' ? policy : require(name)).default;
const literal = 'function loadScript(a){var b=document.getElementsByTagName("head")[0],c=document.createElement("script");c.type="text/javascript",c.src="https://tracker.metricool.com/resources/be.js",c.onreadystatechange=a,c.onload=a,b.appendChild(c)}loadScript(function(){beTracker.t({hash:"512fdb9b70373111e3aad7add4a1990c"})});';
assert.equal(policy.METRICOOL_INITIAL_SNIPPET, literal);
for (pathname of ['/', '/tarifas/empresa', '/servicios', '/politica-privacidad', '/politica-cookies']) {
  const html = renderToStaticMarkup(React.createElement('head', null, React.createElement(component)));
  assert.equal(html.split('id="metricool-public-tracker"').length - 1, 1);
  assert(html.includes(literal));
}
for (pathname of ['/admin', '/admin/finanzas/conciliar', '/cliente', '/cliente/facturas', '/empleado', '/empleado/nominas', '/login', '/api/admin/finanzas/conciliar', '/auth/callback']) {
  assert.equal(policy.isMetricoolPublicPath(pathname), false);
  assert.equal(renderToStaticMarkup(React.createElement(component)), '');
}
assert.equal(policy.isMetricoolPublicPath(null), false);
const layout = fs.readFileSync(path.join(root, 'app/layout.js'), 'utf8');
assert(layout.includes('<head><MetricoolHead /></head>'));
const legal = 'Usamos Metricool (Metricool Software, S.L.) para medir de forma anónima y agregada las visitas, sin cookies ni identificadores. Actúa como encargado del tratamiento.';
for (const file of ['app/politica-privacidad/page.js', 'app/politica-cookies/page.js']) assert.equal(fs.readFileSync(path.join(root, file), 'utf8').split(legal).length - 1, 1);
// Official be.js exposes only a one-shot call: URL changes alone emit nothing.
const images = [];
const context = { document: { location: { href: 'https://example.test/' }, referrer: '' }, window: { innerWidth: 1200, innerHeight: 800 }, Image: class { set src(value) { images.push(value) } } };
vm.createContext(context);
vm.runInContext('beTracker={t:function(a){"undefined"==typeof a&&(a={}),a.u=document.location.href,a.bw=window.innerWidth,a.bh=window.innerHeight,document.referrer&&""!=document.referrer&&(a.ref=document.referrer);var b=[];for(var c in a)a.hasOwnProperty(c)&&b.push(encodeURIComponent(c)+"="+encodeURIComponent(a[c]));var d=new Image;d.src="https://tracker.metricool.com/c3po.jpg?"+b.join("&")}};', context);
vm.runInContext('beTracker.t({hash:"test-only"})', context);
context.document.location.href = 'https://example.test/tarifas/empresa';
assert.equal(images.length, 1);
assert(images[0].includes(encodeURIComponent('https://example.test/')));
console.log('Metricool: snippet literal, 5 rutas públicas, 9 privadas excluidas, dos textos legales exactos y limitación SPA verificados; 0 red y 0 BD.');
