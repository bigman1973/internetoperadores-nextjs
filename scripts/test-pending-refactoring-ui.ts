import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// SSR sintético: los useEffect no se ejecutan, por lo que este test no hace red ni toca la BD.
const source = fs.readFileSync(
  "components/finanzas/PendingRefactoringDocuments.tsx",
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;
const module = { exports: {} as any };
const require = createRequire(import.meta.url);
vm.runInNewContext(code, {
  module,
  exports: module.exports,
  Intl,
  Date,
  Map,
  Set,
  URLSearchParams,
  AbortController,
  require,
});

const PendingRefactoringDocuments = module.exports.default;
assert.equal(typeof PendingRefactoringDocuments, "function");

const html = renderToStaticMarkup(
  React.createElement(PendingRefactoringDocuments, {
    canWrite: true,
    onUseDocument() {},
    onRefresh() {},
    onBusyChange() {},
  }),
);

assert.match(html, /Pendientes de recibir por refacturación/);
assert.match(html, /aún no recibidos por IO: no registran pagos ni IVA/);
assert.match(html, /Buscar en Vola\/2026/);
assert.match(html, /id="pending-refactoring-search"/);
assert.match(html, /Proveedor, número o artículo/);
assert.match(html, /Analizar documentos seleccionados/);
assert.match(html, /<details/);
assert.match(html, /Cómo se calcula y estado del archivo/);
assert.match(html, /Base verificada sin asignar/);
assert.doesNotMatch(html, /<details[^>]*\sopen(?:=|\s|>)/);
assert.match(html, /Cargando documentos pendientes/);

// Los controles de cada fila requieren datos de API y no existen en el primer
// SSR. Se comprueban estáticamente para conservar el test sin red ni efectos.
assert.match(source, /max-h-\[60vh\].*overflow-y-auto/);
assert.match(source, /document\.resultado\?\.proveedor/);
assert.match(source, /document\.resultado\?\.numFactura/);
assert.match(source, /title=\{document\.nombre\}/);
assert.match(source, /Ruta completa/);
assert.match(source, /DocumentArrowDownIcon className=.*PDF/);
assert.match(source, /<PlusIcon className=.*Asignar/);
assert.match(source, /onUseDocument\(document\)/);
assert.match(source, /action: "analizar"/);
assert.doesNotMatch(source, /action:\s*"guardar"/);

console.log(
  "UI pendientes de refacturación: SSR aislado, resumen plegable, bandeja compacta, análisis explícito y asignación manual comprobados sin API ni BD.",
);
