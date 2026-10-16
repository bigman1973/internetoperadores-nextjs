import assert from "node:assert/strict";
import {
  progress,
  initialProgram,
  hitoInput,
  programaInput,
  date,
  uuid,
} from "../lib/certificaciones/core";

assert.equal(
  progress(initialProgram("ISO27001").hitos.create).porcentaje,
  null,
);
assert.equal(progress(initialProgram("TISAX").hitos.create).porcentaje, null);
assert.equal(initialProgram("ISO27001").estado, "IMPLANTACION");
assert.equal(initialProgram("TISAX").estado, "POR_DEFINIR");
assert(
  initialProgram("ISO27001").hitos.create.every(
    (h) => h.estado !== "COMPLETADO",
  ),
);
assert.equal(
  progress([
    { estado: "COMPLETADO" },
    { estado: "PENDIENTE" },
    { estado: "NO_APLICA" },
  ]).porcentaje,
  50,
);
assert.equal(
  progress([{ estado: "COMPLETADO" }, { estado: "COMPLETADO" }]).porcentaje,
  100,
);
assert.equal(progress([{ estado: "NO_APLICA" }]).porcentaje, null);
assert.equal(progress([{ estado: "EN_CURSO" }]).porcentaje, null);
assert.throws(() => hitoInput({ estado: "COMPLETADO" }));
assert.throws(() =>
  hitoInput({ estado: "NO_APLICA", evidencia: "No sabemos" }),
);
assert.equal(
  hitoInput({ estado: "PENDIENTE", evidencia: null }).estado,
  "PENDIENTE",
);
assert.equal(
  hitoInput({
    estado: "COMPLETADO",
    evidencia: "Acta de revisión del 16/10/2026 validada por Dirección.",
  }).estado,
  "COMPLETADO",
);
assert.throws(() => date("2026-02-30", "Fecha"));
assert.throws(() => date("2026-13-01", "Fecha"));
assert.equal(
  date("2026-10-21", "Fecha")?.toISOString().slice(0, 10),
  "2026-10-21",
);
assert.throws(() => programaInput({ estado: "VIGENTE" }));
assert.throws(() =>
  programaInput({
    estado: "IMPLANTACION",
    fechaEmision: "2026-10-21",
    fechaCaducidad: "2026-10-20",
  }),
);
assert.throws(() => uuid("1"));
assert.equal(
  programaInput({ estado: "IMPLANTACION", consultora: "Level4" })
    .documentoAcreditacionId,
  null,
);
assert.equal(
  initialProgram("ISO27001")
    .hitos.create.find((h) => h.clave === "DRAXTON")
    ?.fechaObjetivo?.toISOString()
    .slice(0, 10),
  "2026-10-21",
);
console.log(
  "Certificaciones: progreso, fechas, evidencias y ausencia de acreditación automática correctos.",
);
