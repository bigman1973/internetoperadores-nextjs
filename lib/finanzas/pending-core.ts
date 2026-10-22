/**
 * B5 — núcleo puro de la bandeja Pendientes.
 *
 * Sin Prisma, BD, red, fecha implícita ni efectos. B4 conserva la autoridad
 * para JUSTIFICADO/NO_REQUIERE; este módulo sólo prepara una proyección segura.
 */

export const B5_MANUAL_STATES = ["PENDIENTE", "PEDIDO", "RECIBIDO"] as const;
export const B5_EFFECTIVE_STATES = [...B5_MANUAL_STATES, "VINCULADO", "NO_REQUIERE"] as const;
export type EstadoManualB5 = (typeof B5_MANUAL_STATES)[number];
export type EstadoEfectivoB5 = (typeof B5_EFFECTIVE_STATES)[number];
export type EstadoB4 = "SIN_DOCUMENTO" | "JUSTIFICADO" | "NO_REQUIERE";
export type Centimos = number & { readonly __centimosB5: unique symbol };

export const CENTIMOS_MIN = -2_147_483_648;
export const CENTIMOS_MAX = 2_147_483_647;
const REFERENCIA_FACTURA_EXPLICITA = /(?:^|[^A-Z0-9])([A-Z]{2,12}\d{2}\/[0-9]{1,10})(?=$|[^A-Z0-9])/iu;

export type Resultado<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

function ok<T>(value: T): Resultado<T> { return { ok: true, value }; }
function fail<T = never>(code: string, message: string): Resultado<T> { return { ok: false, code, message }; }

export function esCentimosExactos(value: unknown, allowZero = true): value is Centimos {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= CENTIMOS_MIN
    && value <= CENTIMOS_MAX
    && (allowZero || value !== 0);
}

/** Nunca devuelve VINCULADO/NO_REQUIERE desde un campo editable B5. */
export function estadoEfectivoB5(estadoB4: EstadoB4, estadoManual: EstadoManualB5 | null | undefined): Resultado<EstadoEfectivoB5> {
  if (estadoB4 === "JUSTIFICADO") return ok("VINCULADO");
  if (estadoB4 === "NO_REQUIERE") return ok("NO_REQUIERE");
  if (estadoManual === null || estadoManual === undefined) return ok("PENDIENTE");
  if ((B5_MANUAL_STATES as readonly string[]).includes(estadoManual)) return ok(estadoManual);
  return fail("ESTADO_MANUAL_CORRUPTO", "La gestión B5 sólo puede conservar PENDIENTE, PEDIDO o RECIBIDO.");
}

export type PendienteDocumentoB4Input = Readonly<{
  importeObjetivoCentimos: number | null;
  importeAsignadoActivoCentimos: number;
}>;

export type PendienteDocumentoB4 = Readonly<{
  estado: "SIN_OBJETIVO_B4" | "PENDIENTE_BANCO" | "PARCIAL_BANCO" | "COBRADA_O_PAGADA_BANCO" | "CAPACIDAD_B4_INCOHERENTE";
  importePendienteCentimos: Centimos | null;
}>;

/**
 * Calcula exclusivamente target B4 menos SUM de líneas DOCUMENTO activas B4.
 * Conserva signo: una factura recibida usual suele tener target negativo y una
 * emitida positivo. Ningún campo legacy de pago/cobro ni ISP participa.
 */
export function pendienteDocumentoB4(input: PendienteDocumentoB4Input): Resultado<PendienteDocumentoB4> {
  const { importeObjetivoCentimos: target, importeAsignadoActivoCentimos: assigned } = input;
  if (target === null) return ok({ estado: "SIN_OBJETIVO_B4", importePendienteCentimos: null });
  if (!esCentimosExactos(target, false) || !esCentimosExactos(assigned, true)) {
    return fail("CENTIMOS_B4_INVALIDOS", "El objetivo y el neto activo B4 deben ser enteros firmados de céntimos dentro del rango PostgreSQL.");
  }
  // Misma capacidad firmada que B4: [target, 0] para pagaderos y [0, target]
  // para cobrables. Esto detecta datos dañados sin convertir ni redondear.
  const lower = Math.min(0, target);
  const upper = Math.max(0, target);
  if (assigned < lower || assigned > upper) {
    return ok({ estado: "CAPACIDAD_B4_INCOHERENTE", importePendienteCentimos: null });
  }
  const remaining = target - assigned;
  if (!Number.isSafeInteger(remaining) || remaining < CENTIMOS_MIN || remaining > CENTIMOS_MAX) {
    return fail("CENTIMOS_B4_FUERA_RANGO", "El pendiente firmado no cabe exactamente en céntimos PostgreSQL.");
  }
  if (remaining === 0) return ok({ estado: "COBRADA_O_PAGADA_BANCO", importePendienteCentimos: null });
  if (Math.sign(remaining) !== Math.sign(target)) {
    return ok({ estado: "CAPACIDAD_B4_INCOHERENTE", importePendienteCentimos: null });
  }
  return ok({
    estado: assigned === 0 ? "PENDIENTE_BANCO" : "PARCIAL_BANCO",
    importePendienteCentimos: remaining as Centimos,
  });
}

/** Días civiles; se inyecta la fecha de corte/prueba y no se usa Date.now(). */
export function antiguedadDias(fechaFacturaIso: string, hoyIso: string): Resultado<number> {
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDate.test(fechaFacturaIso) || !isoDate.test(hoyIso)) return fail("FECHA_INVALIDA", "Las fechas deben ser YYYY-MM-DD.");
  const factura = Date.parse(`${fechaFacturaIso}T00:00:00.000Z`);
  const hoy = Date.parse(`${hoyIso}T00:00:00.000Z`);
  if (!Number.isFinite(factura) || !Number.isFinite(hoy) || new Date(factura).toISOString().slice(0,10)!==fechaFacturaIso || new Date(hoy).toISOString().slice(0,10)!==hoyIso) return fail("FECHA_INVALIDA", "La fecha no es un día de calendario válido.");
  return ok(Math.trunc((hoy - factura) / 86_400_000));
}

export type PistaB6 = Readonly<{
  clase: "REFERENCIA_FACTURA_EXPLICITA" | "SIN_REFERENCIA_EXPLICITA";
  referenciaFactura: string | null;
  mensaje: string;
  propuesta: Readonly<{
    modo: "SOLO_PROPONER_B6";
    importeCentimos: Centimos | null;
    terceroExacto: string | null;
    fechaOperacionIso: string;
    referenciaFactura: string | null;
  }> | null;
}>;

/**
 * No busca documentos ni devuelve un ID candidato. Sólo entrega a B6 criterios
 * explícitos: mismo importe firmado, tercero literal, fecha y referencia literal.
 */
export function pistaB6(input: Readonly<{
  importeCentimos: number | null;
  tercero: string | null;
  fechaOperacionIso: string;
  concepto: string | null;
  referencia: string | null;
  infoAdicional: string | null;
}>): Resultado<PistaB6> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaOperacionIso)) return fail("FECHA_INVALIDA", "La fecha de operación B5 debe ser YYYY-MM-DD.");
  if (input.importeCentimos !== null && !esCentimosExactos(input.importeCentimos, false)) {
    return fail("CENTIMOS_BANCO_INVALIDOS", "El banco sólo puede aportar céntimos exactos o null.");
  }
  const raw = [input.referencia, input.concepto, input.infoAdicional].filter((x): x is string => typeof x === "string").join(" ").toUpperCase();
  const match = REFERENCIA_FACTURA_EXPLICITA.exec(raw);
  const referenciaFactura = match?.[1]?.toUpperCase() ?? null;
  const terceroExacto = input.tercero?.trim() || null;
  const proposal = input.importeCentimos !== null && terceroExacto !== null
    ? { modo: "SOLO_PROPONER_B6" as const, importeCentimos: input.importeCentimos as Centimos, terceroExacto, fechaOperacionIso: input.fechaOperacionIso, referenciaFactura }
    : null;
  return ok(referenciaFactura
    ? { clase: "REFERENCIA_FACTURA_EXPLICITA", referenciaFactura, mensaje: `Referencia literal detectada: ${referenciaFactura}. B6 deberá proponer, nunca vincular.`, propuesta: proposal }
    : { clase: "SIN_REFERENCIA_EXPLICITA", referenciaFactura: null, mensaje: "Sin referencia literal de factura; no se infiere una candidata.", propuesta: proposal });
}

/** No es una heurística de concepto: sólo evidencia B4/traspaso interno explícita. */
export function esTraspasoExcluibleB5(input: Readonly<{
  tieneTraspasoInternoB4: boolean;
  tieneLineaActivaDocumentoTraspasoB4: boolean;
  estadoB4: EstadoB4;
  motivoNoRequiereB4: string | null;
}>): boolean {
  return input.tieneTraspasoInternoB4
    || input.tieneLineaActivaDocumentoTraspasoB4
    || (input.estadoB4 === "NO_REQUIERE" && input.motivoNoRequiereB4 === "TRASPASO_INTERNO_SIN_DOCUMENTO");
}

/** Ratio de importe sólo para el contador: módulos de céntimos, no matching B4. */
export function porcentajeJustificadoBps(importeJustificadoAbsolutoCentimos: number, importeEvaluableAbsolutoCentimos: number): Resultado<number | null> {
  if (!Number.isSafeInteger(importeJustificadoAbsolutoCentimos) || !Number.isSafeInteger(importeEvaluableAbsolutoCentimos)
    || importeJustificadoAbsolutoCentimos < 0 || importeEvaluableAbsolutoCentimos < 0
    || importeJustificadoAbsolutoCentimos > importeEvaluableAbsolutoCentimos) {
    return fail("CONTADOR_INVALIDO", "Los acumulados del contador deben ser enteros absolutos coherentes.");
  }
  if (importeEvaluableAbsolutoCentimos === 0) return ok(null);
  return ok(Number(BigInt(importeJustificadoAbsolutoCentimos) * BigInt(10_000) / BigInt(importeEvaluableAbsolutoCentimos)));
}

export type ConfiguracionTarjetaB5 = Readonly<{
  terminacion: "9029" | "6440" | "2390" | "8964";
  etiquetaTitular: "Víctor" | "David" | "Sin asignar";
  responsableAdminIdConfigurado: number | null;
}>;

/**
 * Los IDs reales de UsuarioAdmin no se deducen de nombres, tarjetas ni una
 * búsqueda de BD. El integrador sólo podrá rellenar IDs ya verificados de su
 * configuración de despliegue; null mantiene la tarjeta sin asignar.
 */
export const CONFIGURACION_TARJETAS_B5: readonly ConfiguracionTarjetaB5[] = [
  { terminacion: "9029", etiquetaTitular: "Víctor", responsableAdminIdConfigurado: null },
  { terminacion: "6440", etiquetaTitular: "David", responsableAdminIdConfigurado: null },
  { terminacion: "2390", etiquetaTitular: "Sin asignar", responsableAdminIdConfigurado: null },
  { terminacion: "8964", etiquetaTitular: "Sin asignar", responsableAdminIdConfigurado: null },
] as const;

/** Sólo acepta una terminación literal aislada; no usa semejanza de textos. */
export function terminacionTarjetaConfigurada(textos: readonly (string | null | undefined)[]): ConfiguracionTarjetaB5 | null {
  const found = new Set<string>();
  for (const text of textos) {
    if (!text) continue;
    for (const entry of CONFIGURACION_TARJETAS_B5) {
      if (new RegExp(`(?:^|[^0-9])${entry.terminacion}(?=$|[^0-9])`).test(text)) found.add(entry.terminacion);
    }
  }
  if (found.size !== 1) return null;
  return CONFIGURACION_TARJETAS_B5.find((entry) => entry.terminacion === [...found][0]) ?? null;
}

export type PatchGestionB5 = Readonly<{
  movimientoId: string;
  version: number;
  responsableAdminId: number | null;
  estado: EstadoManualB5;
  nota: string | null;
}>;

/** Valida la forma exacta del PATCH; VINCULADO/NO_REQUIERE no son editables. */
export function validarPatchGestionB5(raw: unknown): Resultado<PatchGestionB5> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("VALIDATION_ERROR", "El cuerpo debe ser un objeto JSON.");
  const body = raw as Record<string, unknown>;
  const allowed = ["movimientoId", "version", "responsableAdminId", "estado", "nota"];
  if (Object.keys(body).length !== allowed.length || allowed.some((key) => !Object.prototype.hasOwnProperty.call(body, key)) || Object.keys(body).some((key) => !allowed.includes(key))) {
    return fail("VALIDATION_ERROR", "El PATCH debe usar exactamente movimientoId, version, responsableAdminId, estado y nota.");
  }
  if (typeof body.movimientoId !== "string" || body.movimientoId.trim().length === 0 || body.movimientoId.length > 160) return fail("VALIDATION_ERROR", "movimientoId no es válido.");
  if (!Number.isInteger(body.version) || (body.version as number) < 1) return fail("VALIDATION_ERROR", "version debe ser un entero positivo.");
  if (body.responsableAdminId !== null && (!Number.isInteger(body.responsableAdminId) || (body.responsableAdminId as number) < 1)) return fail("VALIDATION_ERROR", "responsableAdminId debe ser un ID positivo o null.");
  if (!(B5_MANUAL_STATES as readonly string[]).includes(body.estado as string)) return fail("VALIDATION_ERROR", "estado sólo permite PENDIENTE, PEDIDO o RECIBIDO; VINCULADO y NO_REQUIERE vienen de B4.");
  if (body.nota !== null && (typeof body.nota !== "string" || body.nota.trim().length === 0 || body.nota.trim().length > 2_000)) return fail("VALIDATION_ERROR", "nota debe ser null o texto no vacío de hasta 2000 caracteres.");
  return ok({
    movimientoId: body.movimientoId.trim(),
    version: body.version as number,
    responsableAdminId: body.responsableAdminId as number | null,
    estado: body.estado as EstadoManualB5,
    nota: body.nota === null ? null : (body.nota as string).trim(),
  });
}
