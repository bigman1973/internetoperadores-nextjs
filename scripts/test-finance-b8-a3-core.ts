import test from "node:test";
import assert from "node:assert/strict";
import {
  EXISTING_A3_REVIEW_PROFILE,
  a3CalendarDateKey,
  isA3ConfirmedTransferPair,
  parseExactDecimalToCents,
  prepareA3ParallelDraft,
  readA3DateIdPage,
  safeCsvText,
  type A3AccountConfig,
} from "../lib/finanzas/a3-parallel-core";

const config: A3AccountConfig = {
  ...EXISTING_A3_REVIEW_PROFILE,
  id: "test-selected",
  label: "Configuración de prueba seleccionada",
  explicitlySelected: true,
  accounts: { ...EXISTING_A3_REVIEW_PROFILE.accounts, retencionProveedor: "4751999" },
  bankAccountByCuentaId: { bank1: "5720001" },
};
function fi(overrides: Record<string, unknown> = {}) {
  return { id: "fi1", fecha: "2026-10-03", numFactura: "F/1", cliente: "Cliente", base: "100.00", importeIva: "21.00", importeIrpf: "15.00", total: "106.00", tipoIva: "21", facturaIspId: null, ...overrides };
}
function fr(overrides: Record<string, unknown> = {}) {
  return { id: "fr1", fecha: "2026-10-03", numFactura: "R/1", proveedor: "Proveedor", calidad: "VALIDA", copiaDeId: null, conflictoIdentidad: false, duplicadoExterno: false, base: "100.00", importeIva: "21.00", importeIrpf: "15.00", total: "106.00", tipoIva: "21", ...overrides };
}

test("FI uses exact cents, 473 in Debe and balances total+IRPF=base+IVA", () => {
  const result = prepareA3ParallelDraft({ accountConfig: config, facturasEmitidas: [fi()] });
  assert.equal(result.readiness, "listo para prueba externa");
  assert.equal(result.lines.length, 4);
  assert.deepEqual(result.lines.map((line) => [line.cuenta, line.debeCentimos.toString(), line.haberCentimos.toString()]), [
    ["4300000", "10600", "0"], ["7050000", "0", "10000"], ["4770021", "0", "2100"], ["4730000", "1500", "0"],
  ]);
  assert.equal(result.totals.debeCentimos, "12100");
  assert.equal(result.totals.haberCentimos, "12100");
});

test("FR retention needs its separately selected account; historic 473 is never silently reused", () => {
  const missing = prepareA3ParallelDraft({ accountConfig: { ...config, accounts: { ...config.accounts, retencionProveedor: null } }, facturasRecibidas: [fr()] });
  assert.equal(missing.lines.length, 0);
  assert.ok(missing.incidences.some((item) => item.code === "CUENTA_RETENCION_PROVEEDOR_PENDIENTE"));
  const result = prepareA3ParallelDraft({ accountConfig: config, facturasRecibidas: [fr()] });
  assert.ok(result.lines.some((line) => line.cuenta === "4751999" && line.haberCentimos === BigInt(1500)));
});

test("signed credit notes explicitly reverse debit and credit without abs", () => {
  const result = prepareA3ParallelDraft({ accountConfig: config, facturasEmitidas: [fi({ base: "-100.00", importeIva: "-21.00", importeIrpf: "-15.00", total: "-106.00" })] });
  assert.equal(result.lines.length, 4);
  assert.deepEqual(result.lines.map((line) => [line.cuenta, line.debeCentimos.toString(), line.haberCentimos.toString()]), [
    ["4300000", "0", "10600"], ["7050000", "10000", "0"], ["4770021", "2100", "0"], ["4730000", "0", "1500"],
  ]);
  assert.equal(result.totals.debeCentimos, result.totals.haberCentimos);
});

test("null data and binary float residue are blocked instead of rounded", () => {
  const nullData = prepareA3ParallelDraft({ accountConfig: config, facturasEmitidas: [fi({ total: null })] });
  assert.equal(nullData.lines.length, 0);
  assert.ok(nullData.incidences.some((item) => item.code === "IMPORTE_FUENTE_NO_EXACTO"));
  assert.equal(parseExactDecimalToCents("0.30000000000000004"), null);
  const residue = prepareA3ParallelDraft({ accountConfig: config, facturasEmitidas: [fi({ total: "106.00000000000001" })] });
  assert.equal(residue.lines.length, 0);
  assert.ok(residue.incidences.some((item) => item.code === "IMPORTE_FUENTE_NO_EXACTO"));
});

test("CSV fields escape delimiters/newlines and protect spreadsheet formulas", () => {
  const result = prepareA3ParallelDraft({ accountConfig: config, facturasEmitidas: [fi({ numFactura: "=2+3", cliente: "A;\"B\nC" })] });
  assert.ok(result.csv.includes("'=2+3"));
  assert.ok(result.csv.includes('"FE \'=2+3 A;""B\nC"'));
  assert.ok(result.incidences.some((item) => item.code === "PROTECCION_FORMULA_CSV"));
  assert.deepEqual(safeCsvText("@SUM(A1:A2)"), { value: "'@SUM(A1:A2)", formulaProtected: true });
});

test("unknown bank map blocks rather than defaulting 572, and B4 proved transfer is excluded", () => {
  const unknownMap = prepareA3ParallelDraft({ accountConfig: config, movimientosBancarios: [{ id: "b1", fechaOperacion: "2026-10-05", cuentaId: "unknown", referencia: "B/1", concepto: "Cobro", tercero: "Persona", importe: "10.00", traspasoB4Confirmado: false, cuentaContrapartida: "4300000", contraparteHumana: "Persona" }] });
  assert.equal(unknownMap.lines.length, 0);
  assert.ok(unknownMap.incidences.some((item) => item.code === "CUENTA_CONTRAPARTIDA_FALTANTE"));
  const transfer = prepareA3ParallelDraft({ accountConfig: config, movimientosBancarios: [{ id: "b2", fechaOperacion: "2026-10-05", cuentaId: "bank1", referencia: "B/2", concepto: "Traspaso", tercero: null, importe: "10.00", traspasoB4Confirmado: true, cuentaContrapartida: null, contraparteHumana: null }] });
  assert.equal(transfer.lines.length, 0);
  assert.equal(transfer.totals.excludedBySource.MOVIMIENTO_BANCARIO, 1);
  assert.ok(transfer.incidences.some((item) => item.code === "TRASPASO_B4_CONFIRMADO_EXCLUIDO"));
});

test("the pure core is read-only: input data/configuration are not mutated", () => {
  const input = { accountConfig: config, facturasEmitidas: [fi()] };
  const before = JSON.stringify(input);
  prepareA3ParallelDraft(input);
  assert.equal(JSON.stringify(input), before);
});

test("500-row date/id keyset pagination retains every mixed-hour row exactly once", () => {
  // Synthetic only: timestamp ordering is intentionally hostile to a date/id cursor.
  const rows = Array.from({ length: 501 }, (_, index) => ({
    id: String(501 - index).padStart(4, "0"),
    timestamp: `2026-10-03T${String((index * 7) % 24).padStart(2, "0")}:${String((index * 13) % 60).padStart(2, "0")}:00.000Z`,
  }));
  const key = (row: typeof rows[number]) => ({ date: a3CalendarDateKey(row.timestamp)!, id: row.id });
  const first = readA3DateIdPage(rows, null, 500, key);
  const second = readA3DateIdPage(rows, key(first[first.length - 1]!), 500, key);
  const returned = [...first, ...second];
  assert.equal(first.length, 500);
  assert.equal(second.length, 1);
  assert.equal(new Set(returned.map((row) => row.id)).size, 501);
  assert.deepEqual(returned.map((row) => row.id), [...rows].map((row) => row.id).sort());
});

test("confirmed transfer requires exact opposite current bank counterpart, not merely a linked pair", () => {
  const current = {
    originMovementId: "origin", destinationMovementId: "destination", originCuentaId: "bank-a", destinationCuentaId: "bank-b",
    originImporte: "12.34", destinationImporte: "-12.34", bothCurrentB4TransferProofs: true,
  } as const;
  assert.equal(isA3ConfirmedTransferPair(current), true);
  assert.equal(isA3ConfirmedTransferPair({ ...current, destinationImporte: "12.34" }), false);
  assert.equal(isA3ConfirmedTransferPair({ ...current, destinationCuentaId: "bank-a" }), false);
  assert.equal(isA3ConfirmedTransferPair({ ...current, bothCurrentB4TransferProofs: false }), false);
});
