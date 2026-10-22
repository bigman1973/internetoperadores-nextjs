/* VM-only B5 tests. Run: npx tsx pending-core.test.ts */
import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIGURACION_TARJETAS_B5,
  antiguedadDias,
  esTraspasoExcluibleB5,
  estadoEfectivoB5,
  pendienteDocumentoB4,
  porcentajeJustificadoBps,
  pistaB6,
  terminacionTarjetaConfigurada,
  validarPatchGestionB5,
} from "../lib/finanzas/pending-core";

test("B4 es la autoridad: JUSTIFICADO y NO_REQUIERE sustituyen sólo en lectura al estado manual", () => {
  assert.deepEqual(estadoEfectivoB5("SIN_DOCUMENTO", undefined), { ok: true, value: "PENDIENTE" });
  assert.deepEqual(estadoEfectivoB5("SIN_DOCUMENTO", "PEDIDO"), { ok: true, value: "PEDIDO" });
  assert.deepEqual(estadoEfectivoB5("JUSTIFICADO", "RECIBIDO"), { ok: true, value: "VINCULADO" });
  assert.deepEqual(estadoEfectivoB5("NO_REQUIERE", "PENDIENTE"), { ok: true, value: "NO_REQUIERE" });
  assert.equal(estadoEfectivoB5("SIN_DOCUMENTO", "VINCULADO" as never).ok, false);
});

test("pendiente de factura recibida se calcula en céntimos B4 firmados, no desde campos legacy", () => {
  assert.deepEqual(pendienteDocumentoB4({ importeObjetivoCentimos: -12_500, importeAsignadoActivoCentimos: 0 }), {
    ok: true, value: { estado: "PENDIENTE_BANCO", importePendienteCentimos: -12_500 },
  });
  assert.deepEqual(pendienteDocumentoB4({ importeObjetivoCentimos: -12_500, importeAsignadoActivoCentimos: -4_500 }), {
    ok: true, value: { estado: "PARCIAL_BANCO", importePendienteCentimos: -8_000 },
  });
  assert.deepEqual(pendienteDocumentoB4({ importeObjetivoCentimos: -12_500, importeAsignadoActivoCentimos: -12_500 }), {
    ok: true, value: { estado: "COBRADA_O_PAGADA_BANCO", importePendienteCentimos: null },
  });
});

test("una capacidad B4 incoherente o importe no exacto no se convierte en un falso pendiente", () => {
  assert.deepEqual(pendienteDocumentoB4({ importeObjetivoCentimos: 1_000, importeAsignadoActivoCentimos: -1 }), {
    ok: true, value: { estado: "CAPACIDAD_B4_INCOHERENTE", importePendienteCentimos: null },
  });
  assert.equal(pendienteDocumentoB4({ importeObjetivoCentimos: 10.5, importeAsignadoActivoCentimos: 0 }).ok, false);
  assert.deepEqual(pendienteDocumentoB4({ importeObjetivoCentimos: null, importeAsignadoActivoCentimos: 0 }), {
    ok: true, value: { estado: "SIN_OBJETIVO_B4", importePendienteCentimos: null },
  });
});

test("la pista B6 reconoce sólo la referencia literal y jamás entrega un ID vinculable", () => {
  const found = pistaB6({
    importeCentimos: -19_990, tercero: "Draxon Telecom", fechaOperacionIso: "2026-10-20",
    concepto: "Pago Drax26/94", referencia: null, infoAdicional: null,
  });
  assert.equal(found.ok, true);
  if (found.ok) {
    assert.equal(found.value.clase, "REFERENCIA_FACTURA_EXPLICITA");
    assert.equal(found.value.referenciaFactura, "DRAX26/94");
    assert.deepEqual(found.value.propuesta, {
      modo: "SOLO_PROPONER_B6", importeCentimos: -19_990, terceroExacto: "Draxon Telecom",
      fechaOperacionIso: "2026-10-20", referenciaFactura: "DRAX26/94",
    });
    assert.equal("documentoConciliableId" in (found.value.propuesta ?? {}), false);
  }
  const absent = pistaB6({ importeCentimos: -100, tercero: null, fechaOperacionIso: "2026-10-20", concepto: "pago", referencia: null, infoAdicional: null });
  assert.equal(absent.ok, true);
  if (absent.ok) assert.equal(absent.value.propuesta, null);
});

test("TRASSPAS textual no excluye ni concilia; sólo evidencia B4 explícita excluye un traspaso del contador", () => {
  assert.equal(esTraspasoExcluibleB5({ tieneTraspasoInternoB4: false, tieneLineaActivaDocumentoTraspasoB4: false, estadoB4: "SIN_DOCUMENTO", motivoNoRequiereB4: null }), false);
  assert.equal(esTraspasoExcluibleB5({ tieneTraspasoInternoB4: true, tieneLineaActivaDocumentoTraspasoB4: false, estadoB4: "SIN_DOCUMENTO", motivoNoRequiereB4: null }), true);
  assert.equal(esTraspasoExcluibleB5({ tieneTraspasoInternoB4: false, tieneLineaActivaDocumentoTraspasoB4: false, estadoB4: "NO_REQUIERE", motivoNoRequiereB4: "TRASPASO_INTERNO_SIN_DOCUMENTO" }), true);
});

test("contador de importe usa bps enteros, excluye denominador nulo y no redondea moneda", () => {
  assert.deepEqual(porcentajeJustificadoBps(12_345, 20_000), { ok: true, value: 6172 });
  assert.deepEqual(porcentajeJustificadoBps(0, 0), { ok: true, value: null });
  assert.equal(porcentajeJustificadoBps(10_001, 10_000).ok, false);
});

test("antigüedad se recibe con fecha explícita y vencimiento no se inventa", () => {
  assert.deepEqual(antiguedadDias("2026-10-01", "2026-10-22"), { ok: true, value: 21 });
  assert.equal(antiguedadDias("2026/10/01", "2026-10-22").ok, false);
});

test("las cuatro tarjetas se muestran con el responsable de negocio y ningún ID de admin se adivina", () => {
  assert.deepEqual(CONFIGURACION_TARJETAS_B5.map((entry) => [entry.terminacion, entry.etiquetaTitular, entry.responsableAdminIdConfigurado]), [
    ["9029", "Víctor", null], ["6440", "David", null], ["2390", "Sin asignar", null], ["8964", "Sin asignar", null],
  ]);
  assert.equal(terminacionTarjetaConfigurada(["COMPRA TARJETA *9029"])?.etiquetaTitular, "Víctor");
  assert.equal(terminacionTarjetaConfigurada(["9029 y 6440"]), null, "dos terminaciones no son una asignación");
});

test("PATCH admite sólo gestión humana versionada; no puede escribir VINCULADO/NO_REQUIERE", () => {
  assert.deepEqual(validarPatchGestionB5({ movimientoId: "m-1", version: 1, responsableAdminId: null, estado: "PEDIDO", nota: "Solicitado al proveedor" }), {
    ok: true, value: { movimientoId: "m-1", version: 1, responsableAdminId: null, estado: "PEDIDO", nota: "Solicitado al proveedor" },
  });
  assert.equal(validarPatchGestionB5({ movimientoId: "m-1", version: 1, responsableAdminId: null, estado: "VINCULADO", nota: null }).ok, false);
  assert.equal(validarPatchGestionB5({ movimientoId: "m-1", version: 1, responsableAdminId: null, estado: "NO_REQUIERE", nota: null }).ok, false);
});

console.log("OK B5 core: autoridad B4, céntimos firmados, sin heurística de traspasos, B6 sólo propone, tarjetas configuradas y PATCH humano versionado; sin BD/red/escrituras.");
