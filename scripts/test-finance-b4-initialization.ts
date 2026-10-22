import assert from "node:assert/strict";
import test from "node:test";

import {
  centimosLegacyExactos,
  fuenteDesdeRaw,
  parsearOpcionesInicializacionB4,
  planificarInicializacionB4,
  sha256Estable,
  uuidEstableB4,
  type EntradaPlanInicializacionB4,
  type FuenteLegacyB4,
} from "./init-finance-b4";

const MOV = "mov-b4-prueba";
const UUID_EXISTENTE = "22222222-2222-5222-8222-222222222222";

function fuente(overrides: Partial<FuenteLegacyB4> = {}): FuenteLegacyB4 {
  return {
    tipo: "FACTURA_EMITIDA",
    targetId: "emitida-1",
    sourceId: "m:mov:factura_emitida",
    sourceKind: "FACTURA_EMITIDA",
    importeObjetivoCentimos: 10_000,
    valida: true,
    ...overrides,
  };
}

function entrada(overrides: Partial<EntradaPlanInicializacionB4> = {}): EntradaPlanInicializacionB4 {
  return {
    movimientoId: MOV,
    importeBancoCentimos: 10_000,
    fuentes: [fuente()],
    envoltoriosExistentes: [],
    ...overrides,
  };
}

test("CLI: dry-run por defecto y actor explícito; no existe actor de sistema", () => {
  assert.deepEqual(parsearOpcionesInicializacionB4(["--actor=7"]), { modo: "DRY_RUN", actorId: 7 });
  assert.deepEqual(parsearOpcionesInicializacionB4(["--dry-run", "--actor=42"]), { modo: "DRY_RUN", actorId: 42 });
  assert.deepEqual(parsearOpcionesInicializacionB4(["--apply", "--actor=42"]), { modo: "APPLY", actorId: 42 });
  assert.throws(() => parsearOpcionesInicializacionB4([]), /B4_INIT_ACTOR_REQUIRED/);
  assert.throws(() => parsearOpcionesInicializacionB4(["--apply", "--dry-run", "--actor=1"]), /B4_INIT_CLI_INVALID/);
  assert.throws(() => parsearOpcionesInicializacionB4(["--actor=system"]), /B4_INIT_ACTOR_REQUIRED/);
});

test("inicializa 1:1 sólo con importe bancario firmado y objetivo verificable", () => {
  const plan = planificarInicializacionB4(entrada());
  assert.equal(plan.estadoInicial, "SIN_DOCUMENTO");
  assert.equal(plan.estadoFinal, "JUSTIFICADO");
  assert.equal(plan.candidato?.importeCentimos, 10_000);
  assert.equal(plan.candidato?.esParcial, false);
  assert.equal(plan.envoltorios.length, 1);
  assert.equal(plan.envoltorios[0].accion, "CREAR");
  assert.equal(plan.envoltorios[0].id, uuidEstableB4("B4_INIT_V1:documento:FACTURA_EMITIDA:emitida-1"));
});

test("dos destinos legacy no se reparten ni inventan líneas: queda SIN_DOCUMENTO", () => {
  const plan = planificarInicializacionB4(entrada({
    fuentes: [fuente(), fuente({ targetId: "emitida-2", sourceId: "m:mov:gasto", tipo: "TICKET", sourceKind: "GASTO", importeObjetivoCentimos: -10_000 })],
  }));
  assert.equal(plan.estadoFinal, "SIN_DOCUMENTO");
  assert.equal(plan.candidato, null);
  assert.ok(plan.incidencias.includes("MULTIPLES_DESTINOS_LEGACY_SIN_IMPORTE_POR_LINEA"));
});

test("destino legacy nulo/ausente no crea envoltorio ni vínculo", () => {
  const plan = planificarInicializacionB4(entrada({
    fuentes: [fuente({ targetId: null, valida: false, incidencia: "REFERENCIA_LEGACY_APUNTA_A_DESTINO_AUSENTE" })],
  }));
  assert.equal(plan.envoltorios.length, 0);
  assert.equal(plan.candidato, null);
  assert.ok(plan.incidencias.includes("REFERENCIA_LEGACY_APUNTA_A_DESTINO_AUSENTE"));
});

test("factura recibida copia/no canónica B2 queda pendiente; jamás es envoltorio económico", () => {
  const raw = fuenteDesdeRaw({
    source_kind: "FACTURA_RECIBIDA", tipo: "FACTURA_RECIBIDA", target_id: "fr-copia", source_id: "m:fr",
    target_exists: true, calidad: "COPIA", copia_de_id: "fr-original", conflicto_identidad: false, duplicado_externo: false,
    importe_fuente: 100, factura_isp_id: null, id_externo: null, alias_proof: null,
  });
  const plan = planificarInicializacionB4(entrada({ importeBancoCentimos: -10_000, fuentes: [raw] }));
  assert.equal(plan.envoltorios.length, 0);
  assert.equal(plan.estadoFinal, "SIN_DOCUMENTO");
  assert.ok(plan.incidencias.includes("FACTURA_RECIBIDA_NO_CANONICA_O_CONFLICTO_B2"));
});

test("signos inversos se rechazan y una factura recibida canónica usa total negativo", () => {
  const recibida = fuenteDesdeRaw({
    source_kind: "FACTURA_RECIBIDA", tipo: "FACTURA_RECIBIDA", target_id: "fr-1", source_id: "m:fr",
    target_exists: true, calidad: "VALIDA", copia_de_id: null, conflicto_identidad: false, duplicado_externo: false,
    importe_fuente: 100, factura_isp_id: null, id_externo: null, alias_proof: null,
  });
  assert.equal(recibida.importeObjetivoCentimos, -10_000);
  assert.equal(planificarInicializacionB4(entrada({ importeBancoCentimos: -10_000, fuentes: [recibida] })).estadoFinal, "JUSTIFICADO");
  const invertido = planificarInicializacionB4(entrada({ importeBancoCentimos: 10_000, fuentes: [recibida] }));
  assert.equal(invertido.estadoFinal, "SIN_DOCUMENTO");
  assert.ok(invertido.incidencias.some((i) => i.includes("CAPACIDAD_DOCUMENTAL_EXCEDIDA")));
});

test("un banco menor confirma parcial exacto documentado; uno mayor no sobrepasa capacidad", () => {
  const parcial = planificarInicializacionB4(entrada({ importeBancoCentimos: 6_000 }));
  assert.equal(parcial.estadoFinal, "JUSTIFICADO");
  assert.deepEqual(parcial.candidato, {
    documentoConciliableId: uuidEstableB4("B4_INIT_V1:documento:FACTURA_EMITIDA:emitida-1"),
    importeCentimos: 6_000,
    esParcial: true,
  });
  const exceso = planificarInicializacionB4(entrada({ importeBancoCentimos: 10_001 }));
  assert.equal(exceso.estadoFinal, "SIN_DOCUMENTO");
  assert.ok(exceso.incidencias.some((i) => i.includes("CAPACIDAD_DOCUMENTAL_EXCEDIDA")));
});

test("remesa sólo pasa por FK real exacta; sub-remesa legacy no reparte ni se usa como vínculo", () => {
  const directa = fuente({ tipo: "REMESA", targetId: "77", sourceId: "cr:77", sourceKind: "REMESA_CONCILIACION", importeObjetivoCentimos: 12_000 });
  assert.equal(planificarInicializacionB4(entrada({ importeBancoCentimos: 12_000, fuentes: [directa] })).estadoFinal, "JUSTIFICADO");
  const sub = planificarInicializacionB4(entrada({
    importeBancoCentimos: 12_000,
    fuentes: [fuente({ tipo: "REMESA", targetId: "77", sourceId: "sr:77", sourceKind: "REMESA_SUBREMESA", importeObjetivoCentimos: 12_000 })],
  }));
  assert.equal(sub.estadoFinal, "SIN_DOCUMENTO");
});

test("un envoltorio existente inactivo o con capacidad desconocida no se reactiva ni vincula", () => {
  for (const existente of [
    { id: UUID_EXISTENTE, tipo: "FACTURA_EMITIDA" as const, targetId: "emitida-1", importeObjetivoCentimos: 10_000, activo: false, netoActivoPrevioCentimos: 0 },
    { id: UUID_EXISTENTE, tipo: "FACTURA_EMITIDA" as const, targetId: "emitida-1", importeObjetivoCentimos: null, activo: true, netoActivoPrevioCentimos: 0 },
  ]) {
    const plan = planificarInicializacionB4(entrada({ envoltoriosExistentes: [existente] }));
    assert.equal(plan.estadoFinal, "SIN_DOCUMENTO");
    assert.equal(plan.candidato, null);
  }
});

test("un envoltorio corrupto sin destino no se activa ni se reutiliza", () => {
  const plan = planificarInicializacionB4(entrada({
    envoltoriosExistentes: [{ id: UUID_EXISTENTE, tipo: "FACTURA_EMITIDA", targetId: null, importeObjetivoCentimos: 10_000, activo: false, netoActivoPrevioCentimos: 0 }],
  }));
  assert.equal(plan.envoltorios.some((e) => e.id === UUID_EXISTENTE), false);
  assert.ok(plan.incidencias.includes("ENVOLTORIO_EXISTENTE_SIN_OBJETIVO_REAL"));
});

test("cero bancario no se convierte en vínculo, conciliado ni NO_REQUIERE", () => {
  const plan = planificarInicializacionB4(entrada({ importeBancoCentimos: 0 }));
  assert.equal(plan.estadoFinal, "SIN_DOCUMENTO");
  assert.equal(plan.candidato, null);
  assert.ok(plan.incidencias.includes("IMPORTE_BANCARIO_CERO_SIN_INFERENCIA"));
});

test("sólo un motivo legacy cerrado y persistido podría ser NO_REQUIERE; faltando evidencia no se infiere", () => {
  const plan = planificarInicializacionB4(entrada({ fuentes: [], importeBancoCentimos: -99 }));
  assert.equal(plan.estadoFinal, "SIN_DOCUMENTO");
  assert.equal(plan.candidato, null);
  assert.equal(plan.incidencias.includes("SIN_ENLACE_LEGACY_DIRECTO_VALIDO"), true);
});

test("nómina toma exclusivamente neto_percibir, nunca bruto ni coste de empresa", () => {
  const nomina = fuenteDesdeRaw({
    source_kind: "NOMINA", tipo: "NOMINA", target_id: "n-1", source_id: "m:n-1", target_exists: true,
    importe_fuente: "1234.56", factura_isp_id: null, id_externo: null, alias_proof: null,
  });
  assert.equal(nomina.importeObjetivoCentimos, -123_456);
  const plan = planificarInicializacionB4(entrada({ importeBancoCentimos: -123_456, fuentes: [nomina] }));
  assert.equal(plan.estadoFinal, "JUSTIFICADO");
});

test("mirror ISP sólo admite prueba FK o idExterno numérico que ya resuelve a Factura real; no fuzzy", () => {
  const directa = fuenteDesdeRaw({
    source_kind: "FACTURA_EMITIDA", tipo: "FACTURA_EMITIDA", target_id: "fe-1", source_id: "m:fe-1", target_exists: true,
    importe_fuente: 100, factura_isp_id: 901, id_externo: "901", alias_proof: "FK",
  });
  assert.deepEqual(directa.aliasFacturaIsp, { estado: "FK_EXISTENTE_VERIFICADA", facturaIspId: 901 });
  const noProbada = fuenteDesdeRaw({
    source_kind: "FACTURA_EMITIDA", tipo: "FACTURA_EMITIDA", target_id: "fe-1", source_id: "m:fe-1", target_exists: true,
    importe_fuente: 100, factura_isp_id: null, id_externo: "901", alias_proof: null,
  });
  assert.equal(noProbada.aliasFacturaIsp?.estado, "SIN_PRUEBA_DIRECTA");
});

test("conversiones legacy: exactas, firmadas y sin hydration fallback a cero", () => {
  assert.equal(centimosLegacyExactos("-1.23"), -123);
  assert.equal(centimosLegacyExactos(19.99), 1999);
  assert.equal(centimosLegacyExactos(0.30000000000000004), null);
  assert.equal(centimosLegacyExactos(0.001), null);
  assert.equal(centimosLegacyExactos(Number.NaN), null);
  assert.equal(centimosLegacyExactos(null), null);
  assert.equal(centimosLegacyExactos(0), 0);
});

test("repetir el mismo plan conserva UUID/hash; no hay timestamp ni random churn", () => {
  const a = planificarInicializacionB4(entrada());
  const b = planificarInicializacionB4(entrada());
  assert.deepEqual(a, b);
  assert.equal(sha256Estable(a), sha256Estable(b));
  assert.equal(a.envoltorios[0].id, uuidEstableB4("B4_INIT_V1:documento:FACTURA_EMITIDA:emitida-1"));
});

console.log("OK B4 inicialización pura: estados/versiones, enlaces 1:1, copias/ambigüedades/ceros, signos/capacidad/parciales, remesas, nóminas, alias ISP y reintentos; sin BD, red, entorno ni escrituras.");

test("abonos históricos mantienen el signo real, sin abs ni importe desconocido", () => {
  const fr=fuenteDesdeRaw({source_kind:"FACTURA_RECIBIDA",tipo:"FACTURA_RECIBIDA",target_id:"fr-abono",source_id:"m:fr-abono",target_exists:true,calidad:"VALIDA",copia_de_id:null,importe_fuente:-19.99});
  assert.equal(fr.importeObjetivoCentimos,1999);
  assert.equal(planificarInicializacionB4(entrada({importeBancoCentimos:1999,fuentes:[fr]})).estadoFinal,"JUSTIFICADO");
  const fe=fuenteDesdeRaw({source_kind:"FACTURA_EMITIDA",tipo:"FACTURA_EMITIDA",target_id:"fe-abono",source_id:"m:fe-abono",target_exists:true,importe_fuente:-19.99});
  assert.equal(fe.importeObjetivoCentimos,-1999);
  assert.equal(planificarInicializacionB4(entrada({importeBancoCentimos:-1999,fuentes:[fe]})).estadoFinal,"JUSTIFICADO");
});
