import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const supplier = readFileSync(resolve(root, "components/finanzas/VentaProveedores.tsx"), "utf8");
const workspace = readFileSync(resolve(root, "components/finanzas/InvoiceCostWorkspace.tsx"), "utf8");

const supplierChecks: Array<[string, RegExp]> = [
  ["public props", /facturaId: string;[\s\S]*onSelectSupplier\?: \(proveedorKey: string\) => void;[\s\S]*onSaved\?: \(\) => void;/],
  ["GET provider contract", /rentabilidad\/proveedores\?\$\{params\.toString\(\)\}/],
  ["POST reference-only payload", /facturaId: saveFacturaId,[\s\S]*version,[\s\S]*nombres: draftNames/],
  ["300ms debounce", /window\.setTimeout\([\s\S]*\}, 300\)/],
  ["request abort", /requestRef\.current\?\.abort\(\)/],
  ["no stale catalogue response cache", /const catalogueCache/.test(supplier) ? /$a/ : /.*/],
  ["exact lower-trim name policy", /return value\.trim\(\);/],
  ["save is aborted on invoice change", /saveAbortRef\.current\?\.abort\(\)/],
  ["save callback guarded by captured invoice", /activeInvoiceRef\.current !== saveFacturaId/],
  ["maximum 160 characters", /MAX_NAME_LENGTH = 160/],
  ["maximum ten references", /MAX_REFERENCES = 10/],
  ["no automatic costs", /no crea costes, compras ni repartos automáticos/],
  ["empty state is explicit", /Proveedor sin informar[\s\S]*[Rr]ed propia\/material propio puede no tener proveedor externo/],
];

const workspaceChecks: Array<[string, RegExp]> = [
  ["supplier component precedes editor", /<VentaProveedores[\s\S]*\/>[\s\S]*<CostEditor/],
  ["exact supplier parameter", /params\.set\("proveedor", proveedor\)/],
  ["unrestricted purchase dates help", /Fechas del catálogo: <strong>TODO<\/strong>/],
  ["existing purchase link remains visible", /Abrir compra antes de seleccionar/],
  ["no new window from existing purchase detail", !/target="_blank"/.test(workspace) ? /.*/ : /$a/],
];

let failures = 0;
for (const [label, test] of [...supplierChecks, ...workspaceChecks]) {
  const source = supplierChecks.some(([name]) => name === label) ? supplier : workspace;
  if (!test.test(source)) {
    failures += 1;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

if (failures) process.exitCode = 1;
