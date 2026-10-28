/**
 * Núcleo semántico B4 para conciliación bancaria.
 *
 * Este módulo es deliberadamente puro: no importa Prisma, no consulta una BD,
 * no lee entorno y no genera UUID. La capa de API/servicio debe obtener en una
 * transacción las instantáneas de capacidad y persistir solamente el plan que
 * este módulo haya aceptado.
 */

export const ENTERO_PG_MIN = -2_147_483_648;
export const ENTERO_PG_MAX = 2_147_483_647;
/** Límite del metadato separado B8; el cuerpo HTTP sigue teniendo su propio límite. */
export const MAX_B8_METADATA_JSON_BYTES = 32 * 1024;

/** Un importe canónico B4: entero firmado de céntimos dentro de Int de PostgreSQL. */
export type Centimos = number & { readonly __centimosB4: unique symbol };
export type UUID = string & { readonly __uuidB4: unique symbol };

export const ESTADOS_JUSTIFICACION = [
  "SIN_DOCUMENTO",
  "JUSTIFICADO",
  "NO_REQUIERE",
] as const;
export type EstadoJustificacionMovimiento = (typeof ESTADOS_JUSTIFICACION)[number];

export const MOTIVOS_NO_REQUIERE = [
  "COMISION_BANCARIA",
  "INTERES_BANCARIO",
  "REDONDEO_BANCARIO",
  "TRASPASO_INTERNO_SIN_DOCUMENTO",
  "MOVIMIENTO_TECNICO_BANCO",
  "CORRECCION_BANCARIA",
] as const;
export type MotivoNoRequiere = (typeof MOTIVOS_NO_REQUIERE)[number];

export const TIPOS_DOCUMENTO_CONCILIABLE = [
  "FACTURA_RECIBIDA",
  "FACTURA_EMITIDA",
  "REMESA",
  "NOMINA",
  "IMPUESTO_TGSS",
  "PRESTAMO",
  "TICKET",
  "TRASPASO",
] as const;
export type TipoDocumentoConciliable = (typeof TIPOS_DOCUMENTO_CONCILIABLE)[number];

export const TIPOS_LINEA_VINCULO = ["DOCUMENTO", "DIFERENCIA"] as const;
export type TipoLineaVinculo = (typeof TIPOS_LINEA_VINCULO)[number];

export const MOTIVOS_DIFERENCIA = ["COMISION", "INTERESES", "IVA_COMISION", "REDONDEO"] as const;
export type MotivoDiferencia = (typeof MOTIVOS_DIFERENCIA)[number];

export interface ErrorValidacionB4 {
  codigo: string;
  ruta: string;
  mensaje: string;
}

export type Resultado<T> =
  | { ok: true; value: T }
  | { ok: false; errors: readonly ErrorValidacionB4[] };

export interface LineaDocumentoBorrador {
  tipo: "DOCUMENTO";
  /** UUID de documentos_conciliables; nunca un ID legacy de factura/remesa. */
  documentoConciliableId: UUID;
  importeCentimos: Centimos;
  /** Metadato B8 opcional; no integra economía, hash ni snapshots B4. */
  centroCosteFinanzasId?: UUID | null;
}

export interface LineaDiferenciaBorrador {
  tipo: "DIFERENCIA";
  motivoDiferencia: MotivoDiferencia;
  importeCentimos: Centimos;
}

export type LineaBorrador = LineaDocumentoBorrador | LineaDiferenciaBorrador;

export interface BorradorMovimiento {
  /** ID opaco existente de MovimientoBancario; no se presupone que sea UUID. */
  movimientoId: string;
  importeMovimientoCentimos: Centimos;
  estado: EstadoJustificacionMovimiento;
  motivoNoRequiere?: MotivoNoRequiere;
  lineas: readonly LineaBorrador[];
}

/**
 * Instantánea que la futura transacción deberá leer y bloquear para cada
 * documento usado. `netoActivoPrevioCentimos` es SUM firmado de líneas activas,
 * no un campo legado de importe cobrado/pagado.
 */
export interface InstantaneaCapacidadDocumento {
  documentoConciliableId: UUID;
  tipoDocumento: TipoDocumentoConciliable;
  /** null significa capacidad desconocida; 0 nunca representa un objetivo. */
  importeObjetivoCentimos: Centimos | null;
  /** Puede ser 0: es un acumulado, no un importe documental desconocido. */
  netoActivoPrevioCentimos: number;
}

export interface GrupoDiferencias {
  motivoDiferencia: MotivoDiferencia;
  /** Suma firmada exacta de las líneas de ese motivo. */
  importeCentimos: number;
}

export interface PlanCapacidadDocumento {
  documentoConciliableId: UUID;
  tipoDocumento: TipoDocumentoConciliable;
  importeObjetivoCentimos: Centimos | null;
  netoActivoPrevioCentimos: number;
  deltaBorradorCentimos: number;
  netoResultanteCentimos: number;
  /** Con objetivo null no se inventa saldo ni estado de cobro/pago. */
  capacidadConocida: boolean;
  /** null equivale a «no calculable», nunca a una capacidad ilimitada. */
  dentroDelObjetivo: boolean | null;
}

export interface PlanBorradorMovimiento {
  borrador: BorradorMovimiento;
  sumaLineasCentimos: number;
  diferenciasAgrupadas: readonly GrupoDiferencias[];
  capacidades: readonly PlanCapacidadDocumento[];
}

export interface LineaActivaCancelable {
  id: UUID;
  importeCentimos: Centimos;
}

export interface CancelacionTotal {
  operacionOriginalId: UUID;
  movimientoId: string;
  lineasAAnular: readonly LineaActivaCancelable[];
}

const UUID_CANONICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fallo<T = never>(...errors: ErrorValidacionB4[]): Resultado<T> {
  return { ok: false, errors };
}

function exito<T>(value: T): Resultado<T> {
  return { ok: true, value };
}

function agregarError(
  errores: ErrorValidacionB4[],
  codigo: string,
  ruta: string,
  mensaje: string,
): void {
  errores.push({ codigo, ruta, mensaje });
}

function esRegistroJson(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function tienePropia(objeto: Record<string, unknown>, clave: string): boolean {
  return Object.prototype.hasOwnProperty.call(objeto, clave);
}

/**
 * Proyección inmutable para la economía B4: sólo DOCUMENTO puede llevar el
 * metadato B8 y éste nunca participa en su hash ni en sus snapshots. Se deja
 * intacta cualquier propiedad de DIFERENCIA para que el validador B8 la rechace
 * explícitamente, en vez de ocultarla durante la preparación económica.
 */
export function solicitudB4SinCentroCosteFinanzas(rawSolicitud: unknown): unknown {
  if (!esRegistroJson(rawSolicitud) || !esRegistroJson(rawSolicitud.borrador) || !Array.isArray(rawSolicitud.borrador.lineas)) {
    return rawSolicitud;
  }
  return {
    ...rawSolicitud,
    borrador: {
      ...rawSolicitud.borrador,
      lineas: rawSolicitud.borrador.lineas.map((linea) => {
        if (!esRegistroJson(linea) || linea.tipo !== "DOCUMENTO") return linea;
        const { centroCosteFinanzasId: _centroCosteFinanzasId, ...lineaEconomica } = linea;
        return lineaEconomica;
      }),
    },
  };
}

/** JSON B8 debe ser serializable y acotado antes de persistir su recibo separado. */
export function metadataB8JsonAcotado(value: unknown): boolean {
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" && new TextEncoder().encode(json).byteLength <= MAX_B8_METADATA_JSON_BYTES;
  } catch {
    return false;
  }
}

function validarClavesExactas(
  objeto: Record<string, unknown>,
  permitidas: readonly string[],
  ruta: string,
  errores: ErrorValidacionB4[],
): void {
  const permitidasSet = new Set(permitidas);
  for (const clave of Object.keys(objeto)) {
    if (!permitidasSet.has(clave)) {
      agregarError(
        errores,
        "CLAVE_DESCONOCIDA",
        `${ruta}.${clave}`,
        `La clave «${clave}» no forma parte del contrato B4.`,
      );
    }
  }
}

function validarCadenaNoVacia(
  value: unknown,
  ruta: string,
  errores: ErrorValidacionB4[],
): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    agregarError(errores, "CADENA_INVALIDA", ruta, "Se requiere una cadena no vacía.");
    return undefined;
  }
  return value;
}

function validarUuid(
  value: unknown,
  ruta: string,
  errores: ErrorValidacionB4[],
): UUID | undefined {
  if (typeof value !== "string" || !UUID_CANONICO.test(value)) {
    agregarError(errores, "UUID_INVALIDO", ruta, "Se requiere un UUID canónico para el envoltorio o línea B4.");
    return undefined;
  }
  return value.toLowerCase() as UUID;
}

function esUnoDe<T extends readonly string[]>(value: unknown, valores: T): value is T[number] {
  return typeof value === "string" && (valores as readonly string[]).includes(value);
}

function validarCentimos(
  value: unknown,
  ruta: string,
  errores: ErrorValidacionB4[],
  permitirCero: boolean,
): Centimos | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    agregarError(
      errores,
      "CENTIMOS_INVALIDOS",
      ruta,
      "El importe debe ser un entero finito de céntimos; no se aceptan strings, NaN ni fracciones.",
    );
    return undefined;
  }
  if (value < ENTERO_PG_MIN || value > ENTERO_PG_MAX) {
    agregarError(
      errores,
      "CENTIMOS_FUERA_RANGO_PG",
      ruta,
      `El importe debe estar entre ${ENTERO_PG_MIN} y ${ENTERO_PG_MAX} céntimos.`,
    );
    return undefined;
  }
  if (!permitirCero && value === 0) {
    agregarError(
      errores,
      "CERO_NO_PERMITIDO",
      ruta,
      "Un importe B4 desconocido es null; un importe de línea, movimiento u objetivo no puede ser 0.",
    );
    return undefined;
  }
  return value as Centimos;
}

/**
 * Convierte una entrada UI decimal a céntimos sin redondear. Admite el formato
 * español no ambiguo «1.234,56», el decimal simple «12,50» y «12.50».
 * Para números JS se usa `toString()` y se rechazan residuos binarios como
 * `0.1 + 0.2` ("0.30000000000000004"), notación exponencial, NaN e infinito.
 */
export function convertirImporteUiACentimos(entrada: unknown): Resultado<Centimos> {
  let texto: string;

  if (typeof entrada === "number") {
    if (!Number.isFinite(entrada)) {
      return fallo({
        codigo: "DECIMAL_NO_FINITO",
        ruta: "importe",
        mensaje: "No se aceptan NaN ni infinito.",
      });
    }
    texto = entrada.toString();
    if (/[eE]/.test(texto)) {
      return fallo({
        codigo: "NOTACION_EXPONENCIAL_NO_ADMITIDA",
        ruta: "importe",
        mensaje: "La entrada numérica debe expresar como máximo dos decimales sin notación exponencial.",
      });
    }
  } else if (typeof entrada === "string") {
    texto = entrada.trim();
  } else {
    return fallo({
      codigo: "DECIMAL_INVALIDO",
      ruta: "importe",
      mensaje: "El importe UI debe ser number o string decimal con formato admitido.",
    });
  }

  if (texto.length === 0) {
    return fallo({ codigo: "DECIMAL_VACIO", ruta: "importe", mensaje: "El importe no puede estar vacío." });
  }

  let signo = BigInt(1);
  if (texto[0] === "+" || texto[0] === "-") {
    if (texto[0] === "-") signo = BigInt(-1);
    texto = texto.slice(1);
  }
  if (texto.length === 0) {
    return fallo({ codigo: "DECIMAL_INVALIDO", ruta: "importe", mensaje: "Faltan dígitos tras el signo." });
  }

  let enteros: string;
  let decimales = "";
  const tienePunto = texto.includes(".");
  const tieneComa = texto.includes(",");

  if (tienePunto && tieneComa) {
    const match = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(texto);
    if (!match) {
      return fallo({
        codigo: "FORMATO_DECIMAL_AMBIGUO",
        ruta: "importe",
        mensaje: "Con punto y coma sólo se admite el formato español de miles «1.234,56».",
      });
    }
    enteros = match[1].replaceAll(".", "");
    decimales = match[2] ?? "";
  } else if (tieneComa) {
    const match = /^(\d+)(?:,(\d{1,2}))?$/.exec(texto);
    if (!match) {
      return fallo({
        codigo: "DECIMALES_EXCESIVOS_O_FORMATO_INVALIDO",
        ruta: "importe",
        mensaje: "Sólo se admiten uno o dos decimales separados por coma.",
      });
    }
    enteros = match[1];
    decimales = match[2] ?? "";
  } else if (tienePunto) {
    // Sin coma el punto sólo es separador decimal. Los miles españoles se
    // aceptan únicamente en el formato inequívoco «1.234,56» de la rama anterior.
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(texto);
    if (!match) {
      return fallo({
        codigo: "DECIMALES_EXCESIVOS_O_FORMATO_INVALIDO",
        ruta: "importe",
        mensaje: "Sólo se admiten uno o dos decimales separados por punto.",
      });
    }
    enteros = match[1];
    decimales = match[2] ?? "";
  } else {
    if (!/^\d+$/.test(texto)) {
      return fallo({
        codigo: "FORMATO_DECIMAL_INVALIDO",
        ruta: "importe",
        mensaje: "El importe contiene caracteres no admitidos.",
      });
    }
    enteros = texto;
  }

  try {
    const fraccionCentimos = BigInt((decimales + "00").slice(0, 2));
    const resultado = signo * (BigInt(enteros) * BigInt(100) + fraccionCentimos);
    if (resultado === BigInt(0)) {
      return fallo({
        codigo: "CERO_NO_PERMITIDO",
        ruta: "importe",
        mensaje: "El importe es desconocido si falta; 0,00 no es un importe B4 admisible.",
      });
    }
    if (resultado < BigInt(ENTERO_PG_MIN) || resultado > BigInt(ENTERO_PG_MAX)) {
      return fallo({
        codigo: "CENTIMOS_FUERA_RANGO_PG",
        ruta: "importe",
        mensaje: `El resultado debe estar entre ${ENTERO_PG_MIN} y ${ENTERO_PG_MAX} céntimos.`,
      });
    }
    return exito(Number(resultado) as Centimos);
  } catch {
    return fallo({
      codigo: "FORMATO_DECIMAL_INVALIDO",
      ruta: "importe",
      mensaje: "No se pudo convertir el importe sin redondeo.",
    });
  }
}

/**
 * Valida céntimos exactos ya recibidos del backend. A diferencia de la entrada
 * UI, admite 0 para movimientos bancarios sin documento.
 */
export function convertirImporteBancarioACentimos(
  entrada: unknown,
  ruta = "importeMovimientoCentimos",
): Resultado<Centimos> {
  const errores: ErrorValidacionB4[] = [];
  const importeCentimos = validarCentimos(entrada, ruta, errores, true);
  return errores.length > 0 || importeCentimos === undefined
    ? { ok: false, errors: errores }
    : exito(importeCentimos);
}

/** Suma importes firmados exactamente como enteros; no aplica abs() ni tolerancias. */
export function sumarCentimosFirmados(importes: readonly number[]): Resultado<number> {
  let suma = 0;
  for (let indice = 0; indice < importes.length; indice += 1) {
    const errores: ErrorValidacionB4[] = [];
    const importe = validarCentimos(importes[indice], `importes[${indice}]`, errores, false);
    if (errores.length > 0 || importe === undefined) return { ok: false, errors: errores };
    suma += importe;
    if (!Number.isSafeInteger(suma)) {
      return fallo({
        codigo: "SUMA_FUERA_RANGO_SEGURO",
        ruta: "importes",
        mensaje: "La suma no puede representarse exactamente en JavaScript.",
      });
    }
  }
  return exito(suma);
}

function validarLineaBorrador(
  raw: unknown,
  ruta: string,
  errores: ErrorValidacionB4[],
): LineaBorrador | undefined {
  if (!esRegistroJson(raw)) {
    agregarError(errores, "OBJETO_INVALIDO", ruta, "Cada línea debe ser un objeto JSON.");
    return undefined;
  }

  const tipoRaw = raw.tipo;
  if (!esUnoDe(tipoRaw, TIPOS_LINEA_VINCULO)) {
    validarClavesExactas(raw, ["tipo", "importeCentimos", "documentoConciliableId", "motivoDiferencia"], ruta, errores);
    agregarError(errores, "TIPO_LINEA_INVALIDO", `${ruta}.tipo`, "La línea debe ser DOCUMENTO o DIFERENCIA.");
    return undefined;
  }

  const importeCentimos = validarCentimos(raw.importeCentimos, `${ruta}.importeCentimos`, errores, false);
  if (tipoRaw === "DOCUMENTO") {
    const incluyeCentroCoste = tienePropia(raw, "centroCosteFinanzasId");
    validarClavesExactas(raw, ["tipo", "documentoConciliableId", "importeCentimos", "centroCosteFinanzasId"], ruta, errores);
    const documentoConciliableId = validarUuid(
      raw.documentoConciliableId,
      `${ruta}.documentoConciliableId`,
      errores,
    );
    if (importeCentimos === undefined || documentoConciliableId === undefined) return undefined;
    if (!incluyeCentroCoste) return { tipo: "DOCUMENTO", documentoConciliableId, importeCentimos };
    if (raw.centroCosteFinanzasId === null) {
      return { tipo: "DOCUMENTO", documentoConciliableId, importeCentimos, centroCosteFinanzasId: null };
    }
    const centroCosteFinanzasId = validarUuid(raw.centroCosteFinanzasId, `${ruta}.centroCosteFinanzasId`, errores);
    if (centroCosteFinanzasId === undefined) return undefined;
    return { tipo: "DOCUMENTO", documentoConciliableId, importeCentimos, centroCosteFinanzasId };
  }

  validarClavesExactas(raw, ["tipo", "motivoDiferencia", "importeCentimos"], ruta, errores);
  if (!esUnoDe(raw.motivoDiferencia, MOTIVOS_DIFERENCIA)) {
    agregarError(
      errores,
      "MOTIVO_DIFERENCIA_INVALIDO",
      `${ruta}.motivoDiferencia`,
      "Una diferencia exige COMISION, INTERESES, IVA_COMISION o REDONDEO; no existe OTRO.",
    );
    return undefined;
  }
  if (importeCentimos === undefined) return undefined;
  return { tipo: "DIFERENCIA", motivoDiferencia: raw.motivoDiferencia, importeCentimos };
}

function validarBorradorEstructural(raw: unknown): Resultado<BorradorMovimiento> {
  const errores: ErrorValidacionB4[] = [];
  if (!esRegistroJson(raw)) {
    return fallo({ codigo: "OBJETO_INVALIDO", ruta: "$", mensaje: "El borrador debe ser un objeto JSON." });
  }

  validarClavesExactas(
    raw,
    ["movimientoId", "importeMovimientoCentimos", "estado", "motivoNoRequiere", "lineas"],
    "$",
    errores,
  );

  const movimientoId = validarCadenaNoVacia(raw.movimientoId, "$.movimientoId", errores);
  const importeMovimientoResultado = convertirImporteBancarioACentimos(
    raw.importeMovimientoCentimos,
    "$.importeMovimientoCentimos",
  );
  if ("errors" in importeMovimientoResultado) errores.push(...importeMovimientoResultado.errors);
  const importeMovimientoCentimos = importeMovimientoResultado.ok
    ? importeMovimientoResultado.value
    : undefined;

  let estado: EstadoJustificacionMovimiento | undefined;
  if (esUnoDe(raw.estado, ESTADOS_JUSTIFICACION)) {
    estado = raw.estado;
  } else {
    agregarError(errores, "ESTADO_INVALIDO", "$.estado", "El estado debe ser SIN_DOCUMENTO, JUSTIFICADO o NO_REQUIERE.");
  }

  const lineas: LineaBorrador[] = [];
  if (!Array.isArray(raw.lineas)) {
    agregarError(errores, "LINEAS_INVALIDAS", "$.lineas", "lineas debe ser un array, incluso cuando esté vacío.");
  } else {
    const documentosVistos = new Set<string>();
    raw.lineas.forEach((lineaRaw, indice) => {
      const linea = validarLineaBorrador(lineaRaw, `$.lineas[${indice}]`, errores);
      if (!linea) return;
      if (linea.tipo === "DOCUMENTO") {
        if (documentosVistos.has(linea.documentoConciliableId)) {
          agregarError(
            errores,
            "DOCUMENTO_DUPLICADO_EN_BORRADOR",
            `$.lineas[${indice}].documentoConciliableId`,
            "Un mismo envoltorio documental sólo puede aparecer una vez en un borrador; agrupe sólo las diferencias por motivo explícito.",
          );
          return;
        }
        documentosVistos.add(linea.documentoConciliableId);
      }
      lineas.push(linea);
    });
  }

  let motivoNoRequiere: MotivoNoRequiere | undefined;
  if (estado === "NO_REQUIERE") {
    if (!tienePropia(raw, "motivoNoRequiere") || !esUnoDe(raw.motivoNoRequiere, MOTIVOS_NO_REQUIERE)) {
      agregarError(
        errores,
        "MOTIVO_NO_REQUIERE_INVALIDO",
        "$.motivoNoRequiere",
        "NO_REQUIERE exige exactamente un motivo cerrado; OTRO y texto libre no existen.",
      );
    } else {
      motivoNoRequiere = raw.motivoNoRequiere;
    }
    if (lineas.length !== 0) {
      agregarError(errores, "NO_REQUIERE_CON_LINEAS", "$.lineas", "NO_REQUIERE no puede conservar líneas activas.");
    }
  } else if (estado === "SIN_DOCUMENTO") {
    if (tienePropia(raw, "motivoNoRequiere")) {
      agregarError(
        errores,
        "MOTIVO_NO_REQUIERE_FUERA_DE_ESTADO",
        "$.motivoNoRequiere",
        "El motivo sólo se permite cuando el estado es NO_REQUIERE.",
      );
    }
    if (lineas.length !== 0) {
      agregarError(errores, "SIN_DOCUMENTO_CON_LINEAS", "$.lineas", "SIN_DOCUMENTO no puede conservar líneas activas.");
    }
  } else if (estado === "JUSTIFICADO") {
    if (tienePropia(raw, "motivoNoRequiere")) {
      agregarError(
        errores,
        "MOTIVO_NO_REQUIERE_FUERA_DE_ESTADO",
        "$.motivoNoRequiere",
        "El motivo sólo se permite cuando el estado es NO_REQUIERE.",
      );
    }
    if (!lineas.some((linea) => linea.tipo === "DOCUMENTO")) {
      agregarError(
        errores,
        "JUSTIFICADO_SIN_DOCUMENTO",
        "$.lineas",
        "JUSTIFICADO exige al menos una línea DOCUMENTO; las diferencias no justifican por sí solas.",
      );
    }
    if (importeMovimientoCentimos === 0) {
      agregarError(
        errores,
        "CERO_NO_PERMITIDO",
        "$.importeMovimientoCentimos",
        "JUSTIFICADO exige un importe bancario distinto de 0; 0 sólo se admite sin líneas en SIN_DOCUMENTO o NO_REQUIERE.",
      );
    }
  }

  if (errores.length > 0 || movimientoId === undefined || importeMovimientoCentimos === undefined || estado === undefined) {
    return { ok: false, errors: errores };
  }

  return exito({ movimientoId, importeMovimientoCentimos, estado, motivoNoRequiere, lineas });
}

/**
 * Sólo REMESA tiene orientación comprobable aquí: representa un cobro real
 * positivo. Facturas, nómina, impuesto/TGSS y ticket llegan ya firmados desde
 * su fuente (sin abs()); PRESTAMO y TRASPASO tampoco se crean ni se adivinan.
 */
export function signoObjetivoEsperado(
  tipoDocumento: TipoDocumentoConciliable,
): -1 | 1 | undefined {
  switch (tipoDocumento) {
    case "REMESA":
      return 1;
    case "FACTURA_EMITIDA":
    case "FACTURA_RECIBIDA":
    case "NOMINA":
    case "IMPUESTO_TGSS":
    case "TICKET":
    case "PRESTAMO":
    case "TRASPASO":
      return undefined;
  }
}

/** Valida y normaliza instantáneas de capacidad recibidas desde la futura transacción. */
export function validarInstantaneasCapacidad(
  raw: unknown,
): Resultado<readonly InstantaneaCapacidadDocumento[]> {
  const errores: ErrorValidacionB4[] = [];
  if (!Array.isArray(raw)) {
    return fallo({
      codigo: "INSTANTANEAS_INVALIDAS",
      ruta: "instantaneas",
      mensaje: "Las instantáneas de capacidad deben ser un array.",
    });
  }

  const instantaneas: InstantaneaCapacidadDocumento[] = [];
  const ids = new Set<string>();
  raw.forEach((item, indice) => {
    const ruta = `instantaneas[${indice}]`;
    if (!esRegistroJson(item)) {
      agregarError(errores, "OBJETO_INVALIDO", ruta, "Cada instantánea debe ser un objeto JSON.");
      return;
    }
    validarClavesExactas(
      item,
      ["documentoConciliableId", "tipoDocumento", "importeObjetivoCentimos", "netoActivoPrevioCentimos"],
      ruta,
      errores,
    );
    const documentoConciliableId = validarUuid(item.documentoConciliableId, `${ruta}.documentoConciliableId`, errores);
    let tipoDocumento: TipoDocumentoConciliable | undefined;
    if (esUnoDe(item.tipoDocumento, TIPOS_DOCUMENTO_CONCILIABLE)) {
      tipoDocumento = item.tipoDocumento;
    } else {
      agregarError(errores, "TIPO_DOCUMENTO_INVALIDO", `${ruta}.tipoDocumento`, "Tipo de documento conciliable no admitido.");
    }

    let importeObjetivoCentimos: Centimos | null | undefined;
    if (item.importeObjetivoCentimos === null) {
      importeObjetivoCentimos = null;
    } else {
      importeObjetivoCentimos = validarCentimos(
        item.importeObjetivoCentimos,
        `${ruta}.importeObjetivoCentimos`,
        errores,
        false,
      );
    }
    const netoActivoPrevioCentimos = validarCentimos(
      item.netoActivoPrevioCentimos,
      `${ruta}.netoActivoPrevioCentimos`,
      errores,
      true,
    );

    if (documentoConciliableId && ids.has(documentoConciliableId)) {
      agregarError(errores, "INSTANTANEA_DOCUMENTO_DUPLICADA", `${ruta}.documentoConciliableId`, "Cada envoltorio sólo puede aportar una instantánea.");
    }
    if (documentoConciliableId) ids.add(documentoConciliableId);

    if (
      tipoDocumento !== undefined &&
      importeObjetivoCentimos !== undefined &&
      importeObjetivoCentimos !== null
    ) {
      const signoEsperado = signoObjetivoEsperado(tipoDocumento);
      if (signoEsperado !== undefined && Math.sign(importeObjetivoCentimos) !== signoEsperado) {
        agregarError(
          errores,
          "SIGNO_OBJETIVO_INCOHERENTE",
          `${ruta}.importeObjetivoCentimos`,
          `El objetivo de ${tipoDocumento} debe ser ${signoEsperado > 0 ? "positivo" : "negativo"}.`,
        );
      }
    }

    if (
      documentoConciliableId !== undefined &&
      tipoDocumento !== undefined &&
      importeObjetivoCentimos !== undefined &&
      netoActivoPrevioCentimos !== undefined
    ) {
      instantaneas.push({
        documentoConciliableId,
        tipoDocumento,
        importeObjetivoCentimos,
        netoActivoPrevioCentimos,
      });
    }
  });

  return errores.length > 0 ? { ok: false, errors: errores } : exito(instantaneas);
}

function dentroDeRangoFirmado(neto: number, objetivo: number): boolean {
  return neto >= Math.min(0, objetivo) && neto <= Math.max(0, objetivo);
}

function agruparDiferencias(lineas: readonly LineaBorrador[]): readonly GrupoDiferencias[] {
  const acumuladas = new Map<MotivoDiferencia, number>();
  for (const linea of lineas) {
    if (linea.tipo === "DIFERENCIA") {
      acumuladas.set(linea.motivoDiferencia, (acumuladas.get(linea.motivoDiferencia) ?? 0) + linea.importeCentimos);
    }
  }
  return MOTIVOS_DIFERENCIA.flatMap((motivoDiferencia) => {
    const importeCentimos = acumuladas.get(motivoDiferencia);
    return importeCentimos === undefined ? [] : [{ motivoDiferencia, importeCentimos }];
  });
}

/**
 * Valida un borrador de operación que aún no se ha persistido.
 *
 * El futuro endpoint debe suministrar instantáneas recién leídas y bloqueadas en
 * la misma transacción serializable que usará para aplicar el plan. Esta función
 * no realiza ese bloqueo ni autoriza nada: únicamente asegura la semántica
 * determinista que debe volver a comprobarse en la transacción.
 */
export function validarBorradorMovimiento(
  rawBorrador: unknown,
  rawInstantaneas: unknown,
): Resultado<PlanBorradorMovimiento> {
  const borradorResultado = validarBorradorEstructural(rawBorrador);
  const instantaneasResultado = validarInstantaneasCapacidad(rawInstantaneas);
  const errores: ErrorValidacionB4[] = [];
  if ("errors" in borradorResultado) errores.push(...borradorResultado.errors);
  if ("errors" in instantaneasResultado) errores.push(...instantaneasResultado.errors);
  if (!borradorResultado.ok || !instantaneasResultado.ok) return { ok: false, errors: errores };

  const borrador = borradorResultado.value;
  const porDocumento = new Map(
    instantaneasResultado.value.map((instantanea) => [instantanea.documentoConciliableId, instantanea] as const),
  );

  if (borrador.estado !== "JUSTIFICADO" && instantaneasResultado.value.length !== 0) {
    agregarError(
      errores,
      "INSTANTANEAS_SIN_LINEAS_DOCUMENTALES",
      "instantaneas",
      "SIN_DOCUMENTO y NO_REQUIERE no tienen líneas documentales activas ni requieren capacidad.",
    );
  }

  const sumaResultado = sumarCentimosFirmados(borrador.lineas.map((linea) => linea.importeCentimos));
  if ("errors" in sumaResultado) errores.push(...sumaResultado.errors);
  const sumaLineasCentimos = sumaResultado.ok ? sumaResultado.value : 0;

  if (borrador.estado === "JUSTIFICADO" && sumaResultado.ok && sumaLineasCentimos !== borrador.importeMovimientoCentimos) {
    agregarError(
      errores,
      "CIERRE_MOVIMIENTO_NO_EXACTO",
      "$.lineas",
      `La suma firmada de líneas (${sumaLineasCentimos}) debe ser exactamente igual al importe bancario (${borrador.importeMovimientoCentimos}); no hay abs() ni tolerancia.`,
    );
  }

  const capacidades: PlanCapacidadDocumento[] = [];
  for (let indice = 0; indice < borrador.lineas.length; indice += 1) {
    const linea = borrador.lineas[indice];
    if (linea.tipo !== "DOCUMENTO") continue;
    const instantanea = porDocumento.get(linea.documentoConciliableId);
    const ruta = `$.lineas[${indice}].documentoConciliableId`;
    if (!instantanea) {
      agregarError(
        errores,
        "DOCUMENTO_SIN_INSTANTANEA",
        ruta,
        "La transacción debe aportar una instantánea del envoltorio documental usado.",
      );
      continue;
    }
    if (instantanea.importeObjetivoCentimos === null) {
      agregarError(
        errores,
        "CAPACIDAD_DOCUMENTAL_DESCONOCIDA",
        ruta,
        "Un documento sin importe objetivo fiable no aporta capacidad y no puede cerrar un JUSTIFICADO.",
      );
      continue;
    }

    const objetivo = instantanea.importeObjetivoCentimos;
    if (!dentroDeRangoFirmado(instantanea.netoActivoPrevioCentimos, objetivo)) {
      agregarError(
        errores,
        "CAPACIDAD_PREVIA_INCOHERENTE",
        `instantaneas.${linea.documentoConciliableId}.netoActivoPrevioCentimos`,
        "El neto activo previo ya cae fuera del intervalo firmado [0, objetivo]; debe revisarse antes de aplicar otro vínculo.",
      );
      continue;
    }

    const netoResultanteCentimos = instantanea.netoActivoPrevioCentimos + linea.importeCentimos;
    if (!Number.isSafeInteger(netoResultanteCentimos)) {
      agregarError(
        errores,
        "SUMA_FUERA_RANGO_SEGURO",
        `$.lineas[${indice}].importeCentimos`,
        "La capacidad resultante no puede representarse exactamente.",
      );
      continue;
    }
    if (!dentroDeRangoFirmado(netoResultanteCentimos, objetivo)) {
      agregarError(
        errores,
        "CAPACIDAD_DOCUMENTAL_EXCEDIDA",
        `$.lineas[${indice}].importeCentimos`,
        `El neto firmado resultante (${netoResultanteCentimos}) queda fuera de [0, ${objetivo}]. Los reembolsos/devoluciones sólo pueden deshacer capacidad previamente consumida.`,
      );
      continue;
    }

    capacidades.push({
      documentoConciliableId: instantanea.documentoConciliableId,
      tipoDocumento: instantanea.tipoDocumento,
      importeObjetivoCentimos: objetivo,
      netoActivoPrevioCentimos: instantanea.netoActivoPrevioCentimos,
      deltaBorradorCentimos: linea.importeCentimos,
      netoResultanteCentimos,
      capacidadConocida: true,
      dentroDelObjetivo: true,
    });
  }

  const documentosDeLineas = new Set(
    borrador.lineas
      .filter((linea): linea is LineaDocumentoBorrador => linea.tipo === "DOCUMENTO")
      .map((linea) => linea.documentoConciliableId),
  );
  for (const instantanea of instantaneasResultado.value) {
    if (!documentosDeLineas.has(instantanea.documentoConciliableId)) {
      agregarError(
        errores,
        "INSTANTANEA_SIN_LINEA_DOCUMENTAL",
        `instantaneas.${instantanea.documentoConciliableId}`,
        "No se aceptan instantáneas de documentos no incluidos en el borrador.",
      );
    }
  }

  if (errores.length > 0) return { ok: false, errors: errores };
  return exito({
    borrador,
    sumaLineasCentimos,
    diferenciasAgrupadas: agruparDiferencias(borrador.lineas),
    capacidades,
  });
}

/**
 * Construye el plan inmutable de deshacer para una operación ya aplicada.
 * No permite deshacer sólo una parte: cada línea activa original debe aparecer
 * una única vez y con el mismo importe. La futura persistencia marcará estas
 * líneas activo=false y registrará nueva operación/eventos; nunca hará DELETE.
 */
export function prepararCancelacionTotal(
  operacionOriginalId: unknown,
  movimientoId: unknown,
  lineasActivasOriginales: unknown,
  lineasSolicitadas: unknown,
): Resultado<CancelacionTotal> {
  const errores: ErrorValidacionB4[] = [];
  const operacion = validarUuid(operacionOriginalId, "operacionOriginalId", errores);
  const movimiento = validarCadenaNoVacia(movimientoId, "movimientoId", errores);

  const validarLista = (
    raw: unknown,
    ruta: string,
  ): Map<UUID, LineaActivaCancelable> | undefined => {
    if (!Array.isArray(raw)) {
      agregarError(errores, "LINEAS_CANCELACION_INVALIDAS", ruta, "Se requiere un array de líneas activas.");
      return undefined;
    }
    const resultado = new Map<UUID, LineaActivaCancelable>();
    raw.forEach((item, indice) => {
      const rutaLinea = `${ruta}[${indice}]`;
      if (!esRegistroJson(item)) {
        agregarError(errores, "OBJETO_INVALIDO", rutaLinea, "Cada línea debe ser un objeto JSON.");
        return;
      }
      validarClavesExactas(item, ["id", "importeCentimos"], rutaLinea, errores);
      const id = validarUuid(item.id, `${rutaLinea}.id`, errores);
      const importeCentimos = validarCentimos(item.importeCentimos, `${rutaLinea}.importeCentimos`, errores, false);
      if (id === undefined || importeCentimos === undefined) return;
      if (resultado.has(id)) {
        agregarError(errores, "LINEA_CANCELACION_DUPLICADA", `${rutaLinea}.id`, "La línea sólo puede cancelarse una vez.");
        return;
      }
      resultado.set(id, { id, importeCentimos });
    });
    return resultado;
  };

  const originales = validarLista(lineasActivasOriginales, "lineasActivasOriginales");
  const solicitadas = validarLista(lineasSolicitadas, "lineasSolicitadas");
  if (!originales || !solicitadas || originales.size === 0) {
    if (originales && originales.size === 0) {
      agregarError(errores, "SIN_LINEAS_ACTIVAS_PARA_CANCELAR", "lineasActivasOriginales", "Una operación sin líneas activas no tiene vínculos que deshacer.");
    }
    return { ok: false, errors: errores };
  }

  for (const [id, original] of originales) {
    const solicitada = solicitadas.get(id);
    if (!solicitada) {
      agregarError(errores, "CANCELACION_PARCIAL", "lineasSolicitadas", `Falta la línea activa ${id}; B4 sólo permite deshacer total.`);
    } else if (solicitada.importeCentimos !== original.importeCentimos) {
      agregarError(errores, "CANCELACION_IMPORTE_NO_COINCIDE", `lineasSolicitadas.${id}.importeCentimos`, "La cancelación debe reflejar exactamente el importe original, no uno recalculado.");
    }
  }
  for (const id of solicitadas.keys()) {
    if (!originales.has(id)) {
      agregarError(errores, "CANCELACION_LINEA_AJENA", "lineasSolicitadas", `La línea ${id} no pertenece al conjunto activo de la operación original.`);
    }
  }

  if (errores.length > 0 || operacion === undefined || movimiento === undefined) return { ok: false, errors: errores };
  return exito({
    operacionOriginalId: operacion,
    movimientoId: movimiento,
    lineasAAnular: Array.from(originales.values()),
  });
}

/** Conveniencia para pruebas/capa API: expone la lista cerrada sin mutabilidad. */
export function catalogoB4(): Readonly<{
  estados: readonly EstadoJustificacionMovimiento[];
  motivosNoRequiere: readonly MotivoNoRequiere[];
  tiposDocumento: readonly TipoDocumentoConciliable[];
  motivosDiferencia: readonly MotivoDiferencia[];
}> {
  return {
    estados: ESTADOS_JUSTIFICACION,
    motivosNoRequiere: MOTIVOS_NO_REQUIERE,
    tiposDocumento: TIPOS_DOCUMENTO_CONCILIABLE,
    motivosDiferencia: MOTIVOS_DIFERENCIA,
  };
}
