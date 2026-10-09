import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OperatorCostBatch, {
  createOperatorCostBatchSelection,
  isOperatorCostBatchSelectionFrozen,
  validateOperatorCostBatchSelection,
  type OperatorCostBatchInvoice,
} from "../components/finanzas/OperatorCostBatch";

const groups = [
  { id: "grupo-red", nombre: "Red propia", ambito: "GLOBAL_RED_PROPIA" },
];

const positive: OperatorCostBatchInvoice = {
  id: "invoice-positive",
  proveedor: "Proveedor de prueba",
  numFactura: "P-001",
  fecha: "2026-02-15",
  base: 100,
  lineas: [
    { index: 0, descripcion: "Tramo A", importe: 40 },
    { index: 1, descripcion: "Tramo B", importe: 60 },
  ],
  version: "v1",
  reservada: false,
};

const credit: OperatorCostBatchInvoice = {
  ...positive,
  id: "invoice-credit",
  numFactura: "A-001",
  base: -100,
  lineas: [
    { index: 0, descripcion: "Abono parcial", importe: -40 },
    { index: 1, descripcion: "Abono restante", importe: -60 },
  ],
};

// A newly selected invoice has intentionally no article assignment.
const fresh = createOperatorCostBatchSelection(positive, "stable-request-id");
assert.deepEqual(fresh.assignments, {});
assert.equal(fresh.status, "idle");
assert.equal(
  isOperatorCostBatchSelectionFrozen(undefined),
  false,
  "una factura todavía no seleccionada debe poder seleccionarse",
);
assert.equal(isOperatorCostBatchSelectionFrozen(fresh), false);
for (const status of ["pending", "success", "error"] as const)
  assert.equal(isOperatorCostBatchSelectionFrozen({ status }), true);
assert.equal(fresh.requestId, "stable-request-id");

// Partial positive and credit allocations are valid, but an excess or inverse sign is not.
assert.equal(
  validateOperatorCostBatchSelection(positive, { 0: "grupo-red" }, [
    "grupo-red",
  ]).valid,
  true,
);
assert.equal(
  validateOperatorCostBatchSelection(
    positive,
    { 0: "grupo-red", 1: "grupo-red" },
    ["grupo-red"],
  ).valid,
  true,
);
assert.equal(
  validateOperatorCostBatchSelection(
    positive,
    { 0: "grupo-red", 1: "grupo-red", [-1]: "grupo-red" },
    ["grupo-red"],
  ).code,
  "indice_invalido",
);
assert.equal(
  validateOperatorCostBatchSelection(credit, { 0: "grupo-red" }, ["grupo-red"])
    .valid,
  true,
);
assert.equal(
  validateOperatorCostBatchSelection(credit, { [-1]: "grupo-red" }, [
    "grupo-red",
  ]).code,
  "indice_invalido",
);
assert.equal(
  validateOperatorCostBatchSelection(positive, { 0: "otro" }, ["grupo-red"])
    .code,
  "grupo_invalido",
);

// SSR requires no API call because effects do not run on the server. It verifies the
// default panel has the documented selector, no month control, and no auto-selection.
const html = renderToStaticMarkup(
  React.createElement(OperatorCostBatch, {
    grupos: groups,
    initialGroupId: "grupo-red",
    onSaved: () => undefined,
    onClose: () => undefined,
  }),
);
assert.match(html, /id="operator-batch-centre"/);
assert.match(html, /id="operator-batch-search"/);
assert.doesNotMatch(html, /type="month"/);
assert.doesNotMatch(html, /checked=""/);
assert.match(html, /0<\/strong> facturas seleccionadas/);
assert.match(html, /La búsqueda no se limita por período/);

console.log("OperatorCostBatch synthetic test passed");
