import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const compile = (file: string, tail = '') => ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText + tail;
function execute(code: string) {
  const module = { exports: {} as any };
  vm.runInNewContext(code, { module, exports: module.exports, Map, Set, Date, require(name: string) {
    if (name === 'react') return React;
    if (name === './RoleContext') return { useRole: () => ({ hasAccess: () => true }) };
    if (name === 'next/navigation') return { usePathname: () => '/admin/finanzas/analitica-costes/costes-operadora' };
    return require(name);
  } });
  return module.exports;
}
const guard = execute(compile('components/admin/ProtectedRoute.tsx'));
assert.equal(guard.pathToAreaCode('/admin/finanzas/analitica-costes/costes-operadora'), 'admin.finanzas.analitica_costes');
assert.equal(guard.pathToAreaCode('/admin/finanzas/costes-operadora'), 'admin.finanzas.analitica_costes');
const { __navigation } = execute(compile('components/admin/AdminSidebar.tsx', '\nexports.__navigation = navigation;'));
const finance = __navigation.find((n:any) => n.name === 'Finanzas');
assert(!finance.children.some((n:any) => n.name === 'Costes de operadora'), 'no duplicar operadora al nivel de Finanzas');
const analytics = finance.children.find((n:any) => n.name === 'Analítica de Costes');
assert.equal(analytics.subitems.length,1);
assert.equal(analytics.subitems[0].name,'Costes de operadora');
assert.equal(analytics.subitems[0].section,'finanzas.analitica_costes');
const legacy = fs.readFileSync('app/admin/finanzas/costes-operadora/page.tsx','utf8');
assert.match(legacy,/redirect\("\/admin\/finanzas\/analitica-costes\/costes-operadora"\)/);
const shell = fs.readFileSync('app/admin/finanzas/analitica-costes/costes-operadora/page.tsx','utf8');
assert.match(shell,/checkAdminAreaRead/);
assert.match(shell,/activo: true/);
console.log('Navegación operadora: subapartado único de Analítica, URL anterior redirige, mismo permiso y shell privado conservados.');
