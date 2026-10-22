import assert from "node:assert/strict";
import test from "node:test";
import {
  A3ClientContractError,
  parseA3ConfigResponse,
  parseA3PreviewResponse,
  stableA3Json,
} from "../components/finanzas/exportar-a3/a3-parallel-response-parser";

const hash = "a".repeat(64);
const config = {
  kind: "A3_BORRADOR_PARALELO_CONFIG",
  profiles: [{ id: "profile-1", label: "Perfil revisable", requiresExplicitSelection: true, accounts: { clientes: "4300000", retencionProveedor: null } }],
  bankAccounts: [{ id: "11111111-1111-4111-8111-111111111111", label: "Cuenta operativa", active: true }],
  warning: "Seleccione explícitamente un perfil.",
};
const preview = {
  kind: "A3_BORRADOR_PARALELO",
  period: "2026-10",
  scope: "todo",
  configVersionSHA: hash,
  dataHash: hash,
  readiness: "listo para prueba externa",
  reviewRequired: true,
  assertion: "Borrador para prueba externa.",
  counts: {
    lines: 1, seats: 1, debeCentimos: "100", haberCentimos: "100",
    excludedBySource: { FACTURA_EMITIDA: 0, FACTURA_RECIBIDA: 0, GASTO: 0, NOMINA: 0, MOVIMIENTO_BANCARIO: 0 },
    incidences: 0, missingMappings: 0,
  },
  incidenceSummary: {},
  incidences: [],
  incidenceNextOffset: null,
  lines: [{ asiento: 1, apunte: 1, fecha: "01/10/2026", cuenta: "4300000", concepto: "Factura", debeCentimos: "100", haberCentimos: "0", documento: "F/1", diario: "VENTAS" }],
  linesOffset: 0,
  linesNextOffset: null,
  sourcePage: { items: [], offset: 0, nextOffset: null, total: 0 },
  warnings: ["Revisar antes de importar."],
};
const expected = { mes: "2026-10", scope: "todo" as const, page: { source: null, offset: 0, linesOffset: 0 } };

function expectContractError(callback: () => unknown, path: string): void {
  assert.throws(callback, (error: unknown) => error instanceof A3ClientContractError && error.message.includes(path));
}

test("A3 UI parser accepts complete declared config and preview contracts", () => {
  const parsedConfig = parseA3ConfigResponse(config);
  assert.equal(parsedConfig.profiles[0]?.accounts.clientes, "4300000");
  assert.equal(parsedConfig.profiles[0]?.accounts.retencionProveedor, null);
  const parsedPreview = parseA3PreviewResponse(preview, expected);
  assert.equal(parsedPreview.readiness, "listo para prueba externa");
  assert.equal(parsedPreview.counts.debeCentimos, "100");
  assert.equal(parsedPreview.lines[0]?.diario, "VENTAS");
});

test("A3 UI parser rejects a 200-shaped preview that omits readiness or supplies a fabricated zero", () => {
  const noReadiness = { ...preview } as Record<string, unknown>;
  delete noReadiness.readiness;
  expectContractError(() => parseA3PreviewResponse(noReadiness, expected), "readiness");
  expectContractError(() => parseA3PreviewResponse({ ...preview, counts: { ...preview.counts, debeCentimos: 0 } }, expected), "counts.debeCentimos");
});

test("A3 UI parser rejects a preview for another period, scope or requested pagination", () => {
  expectContractError(() => parseA3PreviewResponse({ ...preview, period: "2026-09" }, expected), "period");
  expectContractError(() => parseA3PreviewResponse({ ...preview, scope: "fi" }, expected), "scope");
  expectContractError(() => parseA3PreviewResponse({ ...preview, sourcePage: { ...preview.sourcePage, offset: 100 } }, expected), "sourcePage.offset");
  expectContractError(() => parseA3PreviewResponse({ ...preview, linesOffset: 100 }, expected), "linesOffset");
});

test("A3 UI parser rejects incomplete configuration rather than creating defaults", () => {
  expectContractError(() => parseA3ConfigResponse({ ...config, kind: "OTHER" }), "kind");
  expectContractError(() => parseA3ConfigResponse({ ...config, profiles: [{ ...config.profiles[0], requiresExplicitSelection: false }] }), "requiresExplicitSelection");
  expectContractError(() => parseA3ConfigResponse({ ...config, bankAccounts: [{}] }), "bankAccounts[0].active");
});

test("stable A3 payload key changes for mappings/config and is independent of property insertion order", () => {
  const first = { mes: "2026-10", config: { accounts: { clientes: "4300000" } }, mappings: { gastoById: { gasto: { cuentaGasto: "6290000" } } } };
  const reordered = { mappings: { gastoById: { gasto: { cuentaGasto: "6290000" } } }, config: { accounts: { clientes: "4300000" } }, mes: "2026-10" };
  assert.equal(stableA3Json(first), stableA3Json(reordered));
  assert.notEqual(stableA3Json(first), stableA3Json({ ...first, mappings: { gastoById: { gasto: { cuentaGasto: "6280000" } } } }));
});
