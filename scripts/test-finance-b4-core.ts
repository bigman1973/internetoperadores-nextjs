import assert from "node:assert/strict";
import test from "node:test";

import {
  convertirImporteBancarioACentimos,
  convertirImporteUiACentimos,
  prepararCancelacionTotal,
  type Centimos,
  type UUID,
  validarBorradorMovimiento,
} from "../lib/finanzas/reconciliation-core";

const UUID_A = "11111111-1111-4111-8111-111111111111" as UUID;
const UUID_B = "22222222-2222-4222-8222-222222222222" as UUID;
const UUID_C = "33333333-3333-4333-8333-333333333333" as UUID;
const UUID_LINEA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as UUID;
const UUID_LINEA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as UUID;
const UUID_OPERACION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as UUID;

const c = (valor: number): Centimos => valor as Centimos;

function codigos(resultado: { ok: false; errors: readonly { codigo: string }[] } | { ok: true }): string[] {
  return "errors" in resultado ? resultado.errors.map((error) => error.codigo) : [];
}

function debeFallar(
  resultado: { ok: false; errors: readonly { codigo: string }[] } | { ok: true },
  codigo: string,
): void {
  assert.equal(resultado.ok, false, `Se esperaba el rechazo ${codigo}`);
  if (!resultado.ok) assert.ok(codigos(resultado).includes(codigo), `Códigos: ${codigos(resultado).join(", ")}`);
}

test("UI decimal: formato español exacto, sin Float ni redondeos", () => {
  const miles = convertirImporteUiACentimos("1.234,56");
  assert.deepEqual(miles, { ok: true, value: c(123_456) });

  const negativo = convertirImporteUiACentimos("-12,5");
  assert.deepEqual(negativo, { ok: true, value: c(-1_250) });

  debeFallar(convertirImporteUiACentimos("0.001"), "DECIMALES_EXCESIVOS_O_FORMATO_INVALIDO");
  debeFallar(convertirImporteUiACentimos(0.1 + 0.2), "DECIMALES_EXCESIVOS_O_FORMATO_INVALIDO");
  debeFallar(convertirImporteUiACentimos(Number.NaN), "DECIMAL_NO_FINITO");
  debeFallar(convertirImporteUiACentimos("0,00"), "CERO_NO_PERMITIDO");
});

test("confirming: banco +980, facturas +1000 e intereses -20 cierra exacto", () => {
  const resultado = validarBorradorMovimiento(
    {
      movimientoId: "mov-confirming-1",
      importeMovimientoCentimos: 98_000,
      estado: "JUSTIFICADO",
      lineas: [
        { tipo: "DOCUMENTO", documentoConciliableId: UUID_A, importeCentimos: 60_000 },
        { tipo: "DOCUMENTO", documentoConciliableId: UUID_B, importeCentimos: 40_000 },
        { tipo: "DIFERENCIA", motivoDiferencia: "INTERESES", importeCentimos: -2_000 },
      ],
    },
    [
      {
        documentoConciliableId: UUID_A,
        tipoDocumento: "FACTURA_EMITIDA",
        importeObjetivoCentimos: 60_000,
        netoActivoPrevioCentimos: 0,
      },
      {
        documentoConciliableId: UUID_B,
        tipoDocumento: "FACTURA_EMITIDA",
        importeObjetivoCentimos: 40_000,
        netoActivoPrevioCentimos: 0,
      },
    ],
  );

  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.equal(resultado.value.sumaLineasCentimos, 98_000);
    assert.deepEqual(resultado.value.diferenciasAgrupadas, [
      { motivoDiferencia: "INTERESES", importeCentimos: -2_000 },
    ]);
    assert.deepEqual(
      resultado.value.capacidades.map((plan) => plan.netoResultanteCentimos),
      [60_000, 40_000],
    );
  }
});

test("las diferencias pueden repetirse y se agrupan explícitamente por motivo", () => {
  const resultado = validarBorradorMovimiento(
    {
      movimientoId: "mov-diferencias-agrupadas",
      importeMovimientoCentimos: 9_700,
      estado: "JUSTIFICADO",
      lineas: [
        { tipo: "DOCUMENTO", documentoConciliableId: UUID_A, importeCentimos: 10_000 },
        { tipo: "DIFERENCIA", motivoDiferencia: "COMISION", importeCentimos: -100 },
        { tipo: "DIFERENCIA", motivoDiferencia: "COMISION", importeCentimos: -200 },
      ],
    },
    [{ documentoConciliableId: UUID_A, tipoDocumento: "FACTURA_EMITIDA", importeObjetivoCentimos: 10_000, netoActivoPrevioCentimos: 0 }],
  );
  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.deepEqual(resultado.value.diferenciasAgrupadas, [
      { motivoDiferencia: "COMISION", importeCentimos: -300 },
    ]);
  }
});

test("un cierre no exacto se rechaza aunque la diferencia parezca una comisión", () => {
  debeFallar(
    validarBorradorMovimiento(
      {
        movimientoId: "mov-1",
        importeMovimientoCentimos: 9_800,
        estado: "JUSTIFICADO",
        lineas: [
          { tipo: "DOCUMENTO", documentoConciliableId: UUID_A, importeCentimos: 10_000 },
          { tipo: "DIFERENCIA", motivoDiferencia: "COMISION", importeCentimos: -100 },
        ],
      },
      [{ documentoConciliableId: UUID_A, tipoDocumento: "FACTURA_EMITIDA", importeObjetivoCentimos: 10_000, netoActivoPrevioCentimos: 0 }],
    ),
    "CIERRE_MOVIMIENTO_NO_EXACTO",
  );
});

test("capacidad firmada: pago negativo y reembolso positivo devuelven el neto a cero", () => {
  const pago = validarBorradorMovimiento(
    {
      movimientoId: "mov-pago",
      importeMovimientoCentimos: -10_000,
      estado: "JUSTIFICADO",
      lineas: [{ tipo: "DOCUMENTO", documentoConciliableId: UUID_A, importeCentimos: -10_000 }],
    },
    [{ documentoConciliableId: UUID_A, tipoDocumento: "FACTURA_RECIBIDA", importeObjetivoCentimos: -10_000, netoActivoPrevioCentimos: 0 }],
  );
  assert.equal(pago.ok, true);
  if (pago.ok) assert.equal(pago.value.capacidades[0].netoResultanteCentimos, -10_000);

  const reembolso = validarBorradorMovimiento(
    {
      movimientoId: "mov-reembolso",
      importeMovimientoCentimos: 10_000,
      estado: "JUSTIFICADO",
      lineas: [{ tipo: "DOCUMENTO", documentoConciliableId: UUID_A, importeCentimos: 10_000 }],
    },
    [{ documentoConciliableId: UUID_A, tipoDocumento: "FACTURA_RECIBIDA", importeObjetivoCentimos: -10_000, netoActivoPrevioCentimos: -10_000 }],
  );
  assert.equal(reembolso.ok, true);
  if (reembolso.ok) assert.equal(reembolso.value.capacidades[0].netoResultanteCentimos, 0);
});

test("abonos de ambas facturas conservan el objetivo firmado de la fuente", () => {
  const abonoRecibido = validarBorradorMovimiento(
    {
      movimientoId: "mov-abono-recibido",
      importeMovimientoCentimos: 10_000,
      estado: "JUSTIFICADO",
      lineas: [{ tipo: "DOCUMENTO", documentoConciliableId: UUID_A, importeCentimos: 10_000 }],
    },
    // FACTURA_RECIBIDA: total -100,00 se orienta desde backend como -total = +100,00.
    [{ documentoConciliableId: UUID_A, tipoDocumento: "FACTURA_RECIBIDA", importeObjetivoCentimos: 10_000, netoActivoPrevioCentimos: 0 }],
  );
  assert.equal(abonoRecibido.ok, true);

  const abonoEmitido = validarBorradorMovimiento(
    {
      movimientoId: "mov-abono-emitido",
      importeMovimientoCentimos: -10_000,
      estado: "JUSTIFICADO",
      lineas: [{ tipo: "DOCUMENTO", documentoConciliableId: UUID_B, importeCentimos: -10_000 }],
    },
    // FACTURA_EMITIDA: el total -100,00 conserva su signo de fuente.
    [{ documentoConciliableId: UUID_B, tipoDocumento: "FACTURA_EMITIDA", importeObjetivoCentimos: -10_000, netoActivoPrevioCentimos: 0 }],
  );
  assert.equal(abonoEmitido.ok, true);
});

test("un vínculo de devolución conserva su signo y sólo deshace capacidad ya consumida", () => {
  const devolucion = validarBorradorMovimiento(
    {
      movimientoId: "mov-devolucion-emitida",
      importeMovimientoCentimos: -10_000,
      estado: "JUSTIFICADO",
      lineas: [{ tipo: "DOCUMENTO", documentoConciliableId: UUID_A, importeCentimos: -10_000 }],
    },
    [{ documentoConciliableId: UUID_A, tipoDocumento: "FACTURA_EMITIDA", importeObjetivoCentimos: 10_000, netoActivoPrevioCentimos: 10_000 }],
  );
  assert.equal(devolucion.ok, true);
  if (devolucion.ok) {
    assert.equal(devolucion.value.capacidades[0].deltaBorradorCentimos, -10_000);
    assert.equal(devolucion.value.capacidades[0].netoResultanteCentimos, 0);
  }
});

test("la capacidad protege ambos extremos, para objetivo positivo y negativo", () => {
  debeFallar(
    validarBorradorMovimiento(
      { movimientoId: "mov-exceso-cobro", importeMovimientoCentimos: 1, estado: "JUSTIFICADO", lineas: [{ tipo: "DOCUMENTO", documentoConciliableId: UUID_A, importeCentimos: 1 }] },
      [{ documentoConciliableId: UUID_A, tipoDocumento: "FACTURA_EMITIDA", importeObjetivoCentimos: 10_000, netoActivoPrevioCentimos: 10_000 }],
    ),
    "CAPACIDAD_DOCUMENTAL_EXCEDIDA",
  );
  debeFallar(
    validarBorradorMovimiento(
      { movimientoId: "mov-exceso-pago", importeMovimientoCentimos: -1, estado: "JUSTIFICADO", lineas: [{ tipo: "DOCUMENTO", documentoConciliableId: UUID_A, importeCentimos: -1 }] },
      [{ documentoConciliableId: UUID_A, tipoDocumento: "TICKET", importeObjetivoCentimos: -10_000, netoActivoPrevioCentimos: -10_000 }],
    ),
    "CAPACIDAD_DOCUMENTAL_EXCEDIDA",
  );
});

test("un objetivo desconocido null no inventa capacidad ni puede justificar", () => {
  debeFallar(
    validarBorradorMovimiento(
      { movimientoId: "mov-desconocido", importeMovimientoCentimos: 250, estado: "JUSTIFICADO", lineas: [{ tipo: "DOCUMENTO", documentoConciliableId: UUID_A, importeCentimos: 250 }] },
      [{ documentoConciliableId: UUID_A, tipoDocumento: "PRESTAMO", importeObjetivoCentimos: null, netoActivoPrevioCentimos: 0 }],
    ),
    "CAPACIDAD_DOCUMENTAL_DESCONOCIDA",
  );
});

test("estado único: NO_REQUIERE exige motivo cerrado; SIN_DOCUMENTO no acepta líneas", () => {
  debeFallar(
    validarBorradorMovimiento(
      { movimientoId: "mov-no-requiere", importeMovimientoCentimos: -99, estado: "NO_REQUIERE", lineas: [] },
      [],
    ),
    "MOTIVO_NO_REQUIERE_INVALIDO",
  );
  debeFallar(
    validarBorradorMovimiento(
      { movimientoId: "mov-otro", importeMovimientoCentimos: -99, estado: "NO_REQUIERE", motivoNoRequiere: "OTRO", lineas: [] },
      [],
    ),
    "MOTIVO_NO_REQUIERE_INVALIDO",
  );
  const noRequiereValido = validarBorradorMovimiento(
    { movimientoId: "mov-comision", importeMovimientoCentimos: -99, estado: "NO_REQUIERE", motivoNoRequiere: "COMISION_BANCARIA", lineas: [] },
    [],
  );
  assert.equal(noRequiereValido.ok, true);

  debeFallar(
    validarBorradorMovimiento(
      { movimientoId: "mov-sin-doc", importeMovimientoCentimos: -99, estado: "SIN_DOCUMENTO", lineas: [{ tipo: "DIFERENCIA", motivoDiferencia: "COMISION", importeCentimos: -99 }] },
      [],
    ),
    "SIN_DOCUMENTO_CON_LINEAS",
  );
});

test("el importe bancario cero sólo admite estados sin líneas documentales", () => {
  assert.deepEqual(convertirImporteBancarioACentimos(0), { ok: true, value: c(0) });
  assert.deepEqual(convertirImporteUiACentimos("0,00"), {
    ok: false,
    errors: [{ codigo: "CERO_NO_PERMITIDO", ruta: "importe", mensaje: "El importe es desconocido si falta; 0,00 no es un importe B4 admisible." }],
  });

  const tecnicoBanco = validarBorradorMovimiento(
    {
      movimientoId: "mov-cero-tecnico",
      importeMovimientoCentimos: 0,
      estado: "NO_REQUIERE",
      motivoNoRequiere: "MOVIMIENTO_TECNICO_BANCO",
      lineas: [],
    },
    [],
  );
  assert.equal(tecnicoBanco.ok, true);

  const sinDocumento = validarBorradorMovimiento(
    {
      movimientoId: "mov-cero-sin-documento",
      importeMovimientoCentimos: 0,
      estado: "SIN_DOCUMENTO",
      lineas: [],
    },
    [],
  );
  assert.equal(sinDocumento.ok, true);

  debeFallar(
    validarBorradorMovimiento(
      {
        movimientoId: "mov-cero-justificado",
        importeMovimientoCentimos: 0,
        estado: "JUSTIFICADO",
        lineas: [{ tipo: "DOCUMENTO", documentoConciliableId: UUID_A, importeCentimos: 1 }],
      },
      [{ documentoConciliableId: UUID_A, tipoDocumento: "FACTURA_EMITIDA", importeObjetivoCentimos: 1, netoActivoPrevioCentimos: 0 }],
    ),
    "CERO_NO_PERMITIDO",
  );
});

test("el contrato rechaza claves desconocidas, ceros, línea documental repetida y diferencia sin motivo", () => {
  debeFallar(
    validarBorradorMovimiento(
      {
        movimientoId: "mov-llave",
        importeMovimientoCentimos: 100,
        estado: "JUSTIFICADO",
        lineaOculta: true,
        lineas: [
          { tipo: "DOCUMENTO", documentoConciliableId: UUID_A, importeCentimos: 50 },
          { tipo: "DOCUMENTO", documentoConciliableId: UUID_A, importeCentimos: 50 },
          { tipo: "DIFERENCIA", importeCentimos: 0 },
        ],
      },
      [{ documentoConciliableId: UUID_A, tipoDocumento: "FACTURA_EMITIDA", importeObjetivoCentimos: 100, netoActivoPrevioCentimos: 0 }],
    ),
    "CLAVE_DESCONOCIDA",
  );
  const resultado = validarBorradorMovimiento(
    {
      movimientoId: "mov-reglas-linea",
      importeMovimientoCentimos: 100,
      estado: "JUSTIFICADO",
      lineas: [
        { tipo: "DOCUMENTO", documentoConciliableId: UUID_A, importeCentimos: 50 },
        { tipo: "DOCUMENTO", documentoConciliableId: UUID_A, importeCentimos: 50 },
        { tipo: "DIFERENCIA", importeCentimos: 0 },
      ],
    },
    [{ documentoConciliableId: UUID_A, tipoDocumento: "FACTURA_EMITIDA", importeObjetivoCentimos: 100, netoActivoPrevioCentimos: 0 }],
  );
  debeFallar(resultado, "DOCUMENTO_DUPLICADO_EN_BORRADOR");
  debeFallar(resultado, "MOTIVO_DIFERENCIA_INVALIDO");
  debeFallar(resultado, "CERO_NO_PERMITIDO");
});

test("PRESTAMO y TRASPASO no se inventan: admiten objetivo documentado de cualquier signo", () => {
  const prestamoActivo = validarBorradorMovimiento(
    { movimientoId: "mov-prestamo-cobro", importeMovimientoCentimos: 10_000, estado: "JUSTIFICADO", lineas: [{ tipo: "DOCUMENTO", documentoConciliableId: UUID_C, importeCentimos: 10_000 }] },
    [{ documentoConciliableId: UUID_C, tipoDocumento: "PRESTAMO", importeObjetivoCentimos: 10_000, netoActivoPrevioCentimos: 0 }],
  );
  assert.equal(prestamoActivo.ok, true);
  const prestamoPasivo = validarBorradorMovimiento(
    { movimientoId: "mov-prestamo-cuota", importeMovimientoCentimos: -10_000, estado: "JUSTIFICADO", lineas: [{ tipo: "DOCUMENTO", documentoConciliableId: UUID_C, importeCentimos: -10_000 }] },
    [{ documentoConciliableId: UUID_C, tipoDocumento: "PRESTAMO", importeObjetivoCentimos: -10_000, netoActivoPrevioCentimos: 0 }],
  );
  assert.equal(prestamoPasivo.ok, true);
});

test("deshacer exige exactamente todas las líneas activas con sus importes", () => {
  const originales = [
    { id: UUID_LINEA_A, importeCentimos: 10_000 },
    { id: UUID_LINEA_B, importeCentimos: -200 },
  ];
  debeFallar(
    prepararCancelacionTotal(UUID_OPERACION, "mov-deshacer", originales, [originales[0]]),
    "CANCELACION_PARCIAL",
  );
  debeFallar(
    prepararCancelacionTotal(UUID_OPERACION, "mov-deshacer", originales, [
      { id: UUID_LINEA_A, importeCentimos: 9_999 },
      originales[1],
    ]),
    "CANCELACION_IMPORTE_NO_COINCIDE",
  );
  const total = prepararCancelacionTotal(UUID_OPERACION, "mov-deshacer", originales, originales);
  assert.equal(total.ok, true);
  if (total.ok) assert.deepEqual(total.value.lineasAAnular, originales);
});
