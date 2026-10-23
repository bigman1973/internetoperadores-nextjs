import test from "node:test";
import assert from "node:assert/strict";

import {
  ORIGEN_CONVERSION_HISTORICA,
  planificarConversionHistoricaAB4,
  type DocumentoHistorico,
  type EnlaceHistorico,
  type MovimientoHistorico,
} from "../lib/finanzas/historical-links-b4-core";

const ARCHIVO = "archivo-controlado-1";
const MANUAL = "registro-manual-1";

function documento(parcial: Partial<DocumentoHistorico> = {}): DocumentoHistorico {
  return {
    id: "doc-1",
    tipoDocumento: "FACTURA_RECIBIDA",
    importeDocumentoCentimos: -10_000,
    fechaDocumentoISO: "2026-10-01",
    periodoNomina: null,
    identidad: {
      estado: "REAL_VIGENTE_ARCHIVO_CONTROLADO_DISPONIBLE",
      archivoControladoId: ARCHIVO,
    },
    calidadB2: "CANONICA",
    estadoB4: { estado: "AUSENTE", documentoB4Id: null },
    traspaso: null,
    movimientoIdsHistoricos: ["mov-1"],
    evidenciaAcumuladaFirmada: null,
    ...parcial,
  };
}

function enlace(parcial: Partial<EnlaceHistorico> = {}): EnlaceHistorico {
  return {
    id: "enlace-1",
    origen: ORIGEN_CONVERSION_HISTORICA,
    clase: "DOCUMENTO",
    documentoLegacyId: "doc-1",
    entregaACuentaEmpleadoId: null,
    importeLineaCentimos: null,
    procedencia: { clase: "MANUAL_VERIFICADA", registroManualVerificadoId: MANUAL },
    snapshotLegacy: { tabla: "movimientos_bancarios", columna: "factura_id", valor: "doc-1" },
    ...parcial,
  };
}

function movimiento(parcial: Partial<MovimientoHistorico> = {}): MovimientoHistorico {
  return {
    id: "mov-1",
    importeBancoCentimos: -10_000,
    fechaPagoISO: "2026-10-02",
    b4Existente: false,
    enlacesLegacy: [enlace()],
    ...parcial,
  };
}

function plan(movimientos: readonly MovimientoHistorico[], documentos: readonly DocumentoHistorico[]) {
  return planificarConversionHistoricaAB4({ movimientos, documentos });
}

test("confirma sólo un vínculo histórico manual, canónico, exacto y con soporte controlado", () => {
  const [resultado] = plan([movimiento()], [documento()]);

  assert.equal(resultado.origen, "HISTORICO");
  assert.equal(resultado.estado, "JUSTIFICADO");
  assert.deepEqual(resultado.motivosPropuesta, []);
  assert.equal(resultado.lineasSugeridas.length, 0);
  assert.equal(resultado.lineasConfirmadas.length, 1);
  assert.deepEqual(resultado.lineasConfirmadas[0], {
    tipo: "DOCUMENTO",
    modo: "CONFIRMED",
    movimientoId: "mov-1",
    importeCentimos: -10_000,
    documento: {
      documentoLegacyId: "doc-1",
      tipoDocumento: "FACTURA_RECIBIDA",
      accion: "CREAR",
      documentoB4Id: null,
      archivoControladoId: ARCHIVO,
    },
    enlaceLegacyIds: ["enlace-1"],
  });
  assert.deepEqual(resultado.enlacesLegacy[0].snapshotLegacy, enlace().snapshotLegacy);
});

test("rechaza cualquier desigualdad firmada de céntimos; no usa abs, tolerancia ni redondeo", () => {
  const [resultado] = plan([movimiento({ importeBancoCentimos: 10_000 })], [documento()]);

  assert.equal(resultado.estado, "PROPUESTA");
  assert.deepEqual(resultado.lineasConfirmadas, []);
  assert.equal(resultado.lineasSugeridas.length, 1);
  assert.ok(resultado.motivosPropuesta.includes("IMPORTE_NO_IGUAL_FIRMADO_EXACTO"));
});

test("banco nulo o cero siempre queda en propuesta", () => {
  for (const importeBancoCentimos of [null, 0]) {
    const [resultado] = plan([movimiento({ importeBancoCentimos })], [documento()]);
    assert.equal(resultado.estado, "PROPUESTA");
    assert.equal(resultado.lineasConfirmadas.length, 0);
    assert.ok(resultado.motivosPropuesta.includes(
      importeBancoCentimos === null ? "IMPORTE_BANCARIO_DESCONOCIDO" : "IMPORTE_BANCARIO_CERO",
    ));
  }
});

test("procedencia desconocida o motor tolerante no se infiere como manual", () => {
  const procedencias: readonly EnlaceHistorico["procedencia"][] = [
    { clase: "DESCONOCIDA" },
    { clase: "VINCULO_HISTORICO_TOLERANTE", motorId: "legacy-fuzzy" },
    {
      clase: "VINCULO_HISTORICO_EXACTO",
      motorId: "legacy-engine",
      pruebaSinToleranciaControladaId: null,
      reglaComparacion: "IGUALDAD_CENTIMOS_FIRMADOS",
    },
  ];
  for (const procedencia of procedencias) {
    const [resultado] = plan([movimiento({ enlacesLegacy: [enlace({ procedencia })] })], [documento()]);
    assert.equal(resultado.estado, "PROPUESTA");
    assert.equal(resultado.lineasConfirmadas.length, 0);
    assert.ok(resultado.motivosPropuesta.some((motivo) =>
      motivo === "PROCEDENCIA_DESCONOCIDA" || motivo === "VINCULO_HISTORICO_TOLERANTE_O_NO_DEMOSTRADO"));
  }
});

test("bloquea documento posterior, identidad/archivo no acreditados y B2 no canónica", () => {
  const [resultado] = plan([movimiento()], [documento({
    fechaDocumentoISO: "2026-10-03",
    identidad: { estado: "ARCHIVO_NO_DISPONIBLE", archivoControladoId: null },
    calidadB2: "OCR",
  })]);

  assert.equal(resultado.estado, "PROPUESTA");
  assert.ok(resultado.motivosPropuesta.includes("FECHA_DOCUMENTO_POSTERIOR_AL_PAGO"));
  assert.ok(resultado.motivosPropuesta.includes("IDENTIDAD_REAL_VIGENTE_O_ARCHIVO_CONTROLADO_AUSENTE"));
  assert.ok(resultado.motivosPropuesta.includes("B2_NO_CANONICA"));
});

test("conserva todo enlace inválido y trata EntregaACuentaEmpleadoId como empleado, no documento", () => {
  const entrega = enlace({
    id: "entrega-1",
    clase: "ENTREGA_A_CUENTA_EMPLEADO",
    documentoLegacyId: null,
    entregaACuentaEmpleadoId: "empleado-8",
    snapshotLegacy: { entregaACuentaEmpleadoId: "empleado-8", importe: "-100.00" },
  });
  const [resultado] = plan([movimiento({ enlacesLegacy: [entrega] })], [documento()]);

  assert.equal(resultado.estado, "PROPUESTA");
  assert.equal(resultado.enlacesLegacy.length, 1);
  assert.equal(resultado.enlacesLegacy[0].id, "entrega-1");
  assert.deepEqual(resultado.enlacesLegacy[0].snapshotLegacy, entrega.snapshotLegacy);
  assert.ok(resultado.enlacesLegacy[0].motivosPropuesta.includes("ENTREGA_A_CUENTA_EMPLEADO_NO_ES_DOCUMENTO"));
});

test("múltiples destinos sin importe por línea no se reparte ni se selecciona arbitrariamente", () => {
  const otroDocumento = documento({ id: "doc-2", movimientoIdsHistoricos: ["mov-1"] });
  const [resultado] = plan([movimiento({
    enlacesLegacy: [enlace(), enlace({ id: "enlace-2", documentoLegacyId: "doc-2" })],
  })], [documento(), otroDocumento]);

  assert.equal(resultado.estado, "PROPUESTA");
  assert.equal(resultado.lineasConfirmadas.length, 0);
  assert.equal(resultado.enlacesLegacy.length, 2);
  assert.ok(resultado.motivosPropuesta.includes("MULTIPLES_DESTINOS_HISTORICOS"));
  assert.ok(resultado.motivosPropuesta.includes("MULTIPLES_DESTINOS_SIN_IMPORTE_POR_LINEA"));
});

test("un documento conectado a más de un movimiento deja TODOS en propuesta sin evidencia acumulada firmada precisa", () => {
  const movimientos = [
    movimiento(),
    movimiento({ id: "mov-2", enlacesLegacy: [enlace({ id: "enlace-2" })] }),
  ];
  const docCompartido = documento({ movimientoIdsHistoricos: ["mov-1", "mov-2"] });
  const resultados = plan(movimientos, [docCompartido]);

  assert.equal(resultados.length, 2);
  for (const resultado of resultados) {
    assert.equal(resultado.estado, "PROPUESTA");
    assert.equal(resultado.lineasConfirmadas.length, 0);
    assert.ok(resultado.motivosPropuesta.includes("DOCUMENTO_COMPARTIDO_SIN_EVIDENCIA_ACUMULADA_FIRMADA"));
  }
});

test("respeta B4 existente: no confirma ni duplica el movimiento", () => {
  const [resultado] = plan([movimiento({ b4Existente: true })], [documento({
    estadoB4: { estado: "UNICO_REUTILIZABLE", documentoB4Id: "b4-documento-ya-existente" },
  })]);

  assert.equal(resultado.estado, "PROPUESTA");
  assert.equal(resultado.lineasConfirmadas.length, 0);
  assert.ok(resultado.motivosPropuesta.includes("MOVIMIENTO_B4_EXISTENTE"));
});

test("traspaso exige pareja real recíproca, cuentas distintas, signos opuestos y archivo existente", () => {
  const transferencia = documento({
    tipoDocumento: "TRASPASO",
    traspaso: {
      movimientoParejaId: "mov-2",
      cuentaMovimientoId: "cuenta-1",
      cuentaParejaId: "cuenta-1",
      importeParejaCentimos: -10_000,
      reciprocaRealVerificada: false,
      archivoControladoId: null,
    },
  });
  const [resultado] = plan([movimiento({ importeBancoCentimos: 10_000 })], [transferencia]);

  assert.equal(resultado.estado, "PROPUESTA");
  assert.ok(resultado.motivosPropuesta.includes("TRASPASO_SIN_PAREJA_RECIPROCA_REAL"));
});

test("nómina necesita período explícitamente compatible", () => {
  const [resultado] = plan([movimiento()], [documento({
    tipoDocumento: "NOMINA",
    periodoNomina: {
      inicioISO: "2026-09-01",
      finISO: "2026-09-30",
      compatibilidadConPago: "DESCONOCIDA",
      evidenciaControladaId: null,
    },
  })]);

  assert.equal(resultado.estado, "PROPUESTA");
  assert.ok(resultado.motivosPropuesta.includes("PERIODO_NOMINA_NO_COMPATIBLE"));
});
