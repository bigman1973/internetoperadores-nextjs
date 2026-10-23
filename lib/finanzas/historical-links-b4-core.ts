/**
 * Planificador puro para migrar vínculos legacy a B4.
 *
 * No realiza I/O, no genera IDs, no persiste y no redondea importes. El
 * adaptador debe entregar una instantánea coherente de los vínculos históricos
 * de todos los movimientos/documentos que vayan a tratarse.
 */

export const ORIGEN_CONVERSION_HISTORICA = "HISTORICO" as const;
export type OrigenConversionHistorica = typeof ORIGEN_CONVERSION_HISTORICA;

/** Céntimos firmados ya normalizados por el adaptador; nunca importes decimales. */
export type CentimosFirmados = number;

export const TIPOS_DOCUMENTO_B4_HISTORICO = [
  "FACTURA_RECIBIDA",
  "FACTURA_EMITIDA",
  "REMESA",
  "NOMINA",
  "IMPUESTO_TGSS",
  "PRESTAMO",
  "TICKET",
  "TRASPASO",
] as const;
export type TipoDocumentoB4Historico = (typeof TIPOS_DOCUMENTO_B4_HISTORICO)[number];

/** Motivos cerrados: la capa consumidora no debe inventar texto libre. */
export const MOTIVOS_PROPUESTA_HISTORICA = [
  "SIN_ENLACES_HISTORICOS",
  "MOVIMIENTO_ID_INVALIDO",
  "ORIGEN_NO_HISTORICO",
  "ENLACE_HISTORICO_ID_INVALIDO",
  "MOVIMIENTO_B4_EXISTENTE",
  "IMPORTE_BANCARIO_DESCONOCIDO",
  "IMPORTE_BANCARIO_CERO",
  "FECHA_PAGO_DESCONOCIDA_O_INVALIDA",
  "ENLACE_HISTORICO_SIN_DESTINO_DOCUMENTAL",
  "ENTREGA_A_CUENTA_EMPLEADO_NO_ES_DOCUMENTO",
  "DESTINO_DOCUMENTAL_NO_ENCONTRADO",
  "DOCUMENTO_HISTORICO_DUPLICADO_EN_ENTRADA",
  "TIPO_DOCUMENTO_NO_ADMITIDO",
  "MULTIPLES_DESTINOS_SIN_IMPORTE_POR_LINEA",
  "MULTIPLES_DESTINOS_HISTORICOS",
  "ENLACES_HISTORICOS_DUPLICADOS_PARA_DOCUMENTO",
  "IMPORTE_LINEA_LEGACY_NO_COINCIDE_EXACTAMENTE",
  "IMPORTE_DOCUMENTAL_DESCONOCIDO",
  "IMPORTE_DOCUMENTAL_CERO",
  "IMPORTE_NO_IGUAL_FIRMADO_EXACTO",
  "FECHA_DOCUMENTO_DESCONOCIDA_O_INVALIDA",
  "FECHA_DOCUMENTO_POSTERIOR_AL_PAGO",
  "PERIODO_NOMINA_NO_COMPATIBLE",
  "IDENTIDAD_REAL_VIGENTE_O_ARCHIVO_CONTROLADO_AUSENTE",
  "B2_NO_CANONICA",
  "PROCEDENCIA_DESCONOCIDA",
  "VINCULO_HISTORICO_TOLERANTE_O_NO_DEMOSTRADO",
  "DOCUMENTO_COMPARTIDO_SIN_EVIDENCIA_ACUMULADA_FIRMADA",
  "EVIDENCIA_ACUMULADA_FIRMADA_IMPRECISA",
  "ESTADO_DOCUMENTO_B4_DESCONOCIDO",
  "DOCUMENTO_B4_DUPLICADO",
  "REFERENCIA_DOCUMENTO_B4_INVALIDA",
  "TRASPASO_SIN_PAREJA_RECIPROCA_REAL",
  "TRASPASO_CUENTAS_NO_DIFERENTES",
  "TRASPASO_IMPORTES_NO_OPUESTOS_EXACTOS",
  "TRASPASO_ARCHIVO_CONTROLADO_AUSENTE",
] as const;
export type MotivoPropuestaHistorica = (typeof MOTIVOS_PROPUESTA_HISTORICA)[number];

export interface EvidenciaIdentidadHistorica {
  /** Sólo este estado acredita simultáneamente identidad real, vigente y fichero controlado disponible. */
  estado: "REAL_VIGENTE_ARCHIVO_CONTROLADO_DISPONIBLE" | "NO_VERIFICADA" | "CADUCADA" | "ARCHIVO_NO_DISPONIBLE";
  /** Identificador de un fichero existente; el núcleo jamás crea uno. */
  archivoControladoId: string | null;
}

export interface PeriodoNominaHistorico {
  inicioISO: string | null;
  finISO: string | null;
  /** Verificación humana/documental explícita, no una inferencia desde una nota vacía. */
  compatibilidadConPago: "VERIFICADA" | "NO_VERIFICADA" | "DESCONOCIDA";
  evidenciaControladaId: string | null;
}

export interface ParejaTraspasoHistorica {
  movimientoParejaId: string | null;
  cuentaMovimientoId: string | null;
  cuentaParejaId: string | null;
  importeParejaCentimos: CentimosFirmados | null;
  /** Atestigua que existe la pareja bancaria real, no una pareja deducida. */
  reciprocaRealVerificada: boolean;
  /** Sólo se referencia; nunca se sintetiza un archivo para un traspaso. */
  archivoControladoId: string | null;
}

export interface EvidenciaAcumuladaFirmada {
  clase: "FIRMADA_DOCUMENTADA_PRECISA";
  documentoLegacyId: string;
  archivoFirmaControladoId: string | null;
  /** Cada movimiento enlazado debe aparecer una única vez con su importe firmado real. */
  asignaciones: readonly {
    movimientoId: string;
    importeCentimos: CentimosFirmados;
  }[];
  totalDocumentadoCentimos: CentimosFirmados | null;
}

export interface EstadoDocumentoB4Historico {
  /** AUSENTE permite preparar una creación posterior; el núcleo no la ejecuta. */
  estado: "AUSENTE" | "UNICO_REUTILIZABLE" | "DUPLICADO" | "DESCONOCIDO";
  documentoB4Id: string | null;
}

export interface DocumentoHistorico {
  id: string;
  tipoDocumento: TipoDocumentoB4Historico;
  importeDocumentoCentimos: CentimosFirmados | null;
  /** Para todo tipo salvo NOMINA debe ser la fecha de emisión/recepción aplicable. */
  fechaDocumentoISO: string | null;
  periodoNomina: PeriodoNominaHistorico | null;
  identidad: EvidenciaIdentidadHistorica;
  /** Sólo CANONICA pasa: OCR, copia, conflicto y confirming de cliente quedan bloqueados. */
  calidadB2: "CANONICA" | "OCR" | "COPIA" | "CONFLICTO_IDENTIDAD" | "CONFIRMING_CLIENTE" | "DESCONOCIDA";
  estadoB4: EstadoDocumentoB4Historico;
  traspaso: ParejaTraspasoHistorica | null;
  /**
   * Relación completa extraída de legacy, incluso si algunos movimientos no se
   * están convirtiendo en este lote. Permite no seleccionar arbitrariamente un
   * documento compartido.
   */
  movimientoIdsHistoricos: readonly string[];
  evidenciaAcumuladaFirmada: EvidenciaAcumuladaFirmada | null;
}

export type ProcedenciaHistorica =
  | {
      clase: "MANUAL_VERIFICADA";
      registroManualVerificadoId: string | null;
    }
  | {
      clase: "VINCULO_HISTORICO_EXACTO";
      motorId: string | null;
      pruebaSinToleranciaControladaId: string | null;
      reglaComparacion: "IGUALDAD_CENTIMOS_FIRMADOS" | "OTRA";
    }
  | {
      clase: "VINCULO_HISTORICO_TOLERANTE";
      motorId: string | null;
    }
  | {
      clase: "DESCONOCIDA";
    };

export type ClaseEnlaceHistorico = "DOCUMENTO" | "ENTREGA_A_CUENTA_EMPLEADO" | "OTRO";

export interface EnlaceHistorico {
  id: string;
  origen: OrigenConversionHistorica | "OTRO";
  clase: ClaseEnlaceHistorico;
  /** null en EntregaACuentaEmpleado: ese ID identifica a una persona, no un documento. */
  documentoLegacyId: string | null;
  entregaACuentaEmpleadoId: string | null;
  /** Es opcional para un único destino, pero imposible de repartir con varios destinos. */
  importeLineaCentimos: CentimosFirmados | null;
  procedencia: ProcedenciaHistorica;
  /** Extracto inalterado de la fila legacy, incluido cuando el enlace es inválido. */
  snapshotLegacy: unknown;
}

export interface MovimientoHistorico {
  id: string;
  importeBancoCentimos: CentimosFirmados | null;
  fechaPagoISO: string | null;
  /** Si existe, el plan se limita a una propuesta y no toca ni duplica B4. */
  b4Existente: boolean;
  enlacesLegacy: readonly EnlaceHistorico[];
}

export interface EntradaConversionHistorica {
  movimientos: readonly MovimientoHistorico[];
  documentos: readonly DocumentoHistorico[];
}

export interface ReferenciaDocumentoB4Plan {
  documentoLegacyId: string;
  tipoDocumento: TipoDocumentoB4Historico;
  /** Crear es sólo una instrucción para la transacción futura, nunca I/O de este núcleo. */
  accion: "CREAR" | "REUTILIZAR";
  documentoB4Id: string | null;
  /** Siempre proviene del archivo controlado de entrada: no se inventa un archivo. */
  archivoControladoId: string;
}

export interface LineaHistoricaB4Plan {
  tipo: "DOCUMENTO";
  modo: "SUGERIDA" | "CONFIRMED";
  movimientoId: string;
  importeCentimos: CentimosFirmados;
  documento: ReferenciaDocumentoB4Plan;
  enlaceLegacyIds: readonly string[];
}

export interface EnlaceLegacyConservado {
  id: string;
  origen: OrigenConversionHistorica;
  clase: ClaseEnlaceHistorico;
  documentoLegacyId: string | null;
  entregaACuentaEmpleadoId: string | null;
  importeLineaCentimos: CentimosFirmados | null;
  procedencia: ProcedenciaHistorica;
  /** Se conserva inclusive para enlaces que nunca podrían producir una línea B4. */
  snapshotLegacy: unknown;
  motivosPropuesta: readonly MotivoPropuestaHistorica[];
}

export interface ResultadoConversionHistorica {
  origen: OrigenConversionHistorica;
  movimientoId: string;
  estado: "JUSTIFICADO" | "PROPUESTA";
  motivosPropuesta: readonly MotivoPropuestaHistorica[];
  /** Sólo aparece si se cumplieron todas las reglas duras; contiene una línea exacta. */
  lineasConfirmadas: readonly LineaHistoricaB4Plan[];
  /** Candidatos exactos para revisión; no autorizan escritura ni cambian estado B4. */
  lineasSugeridas: readonly LineaHistoricaB4Plan[];
  /** Uno por cada enlace de entrada, en el mismo orden, incluso si es inválido. */
  enlacesLegacy: readonly EnlaceLegacyConservado[];
}

interface ContextoLote {
  documentosPorId: ReadonlyMap<string, DocumentoHistorico>;
  documentosDuplicados: ReadonlySet<string>;
  movimientosPorId: ReadonlyMap<string, MovimientoHistorico>;
  movimientosCompartidosPorDocumento: ReadonlyMap<string, ReadonlySet<string>>;
}

const ORDEN_MOTIVOS = new Map<string, number>(MOTIVOS_PROPUESTA_HISTORICA.map((motivo, indice) => [motivo, indice]));

function textoNoVacio(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function centimosValidos(value: CentimosFirmados | null): value is CentimosFirmados {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function centimosNoCero(value: CentimosFirmados | null): value is CentimosFirmados {
  return centimosValidos(value) && value !== 0;
}

function ordenarMotivos(motivos: Iterable<MotivoPropuestaHistorica>): readonly MotivoPropuestaHistorica[] {
  return [...new Set(motivos)].sort((a, b) => (ORDEN_MOTIVOS.get(a) ?? 0) - (ORDEN_MOTIVOS.get(b) ?? 0));
}

/** Comprueba una fecha civil ISO sin convertir importes ni depender de la zona horaria. */
function fechaIsoValida(value: string | null): value is string {
  if (!textoNoVacio(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function esTipoDocumento(value: unknown): value is TipoDocumentoB4Historico {
  return typeof value === "string" && (TIPOS_DOCUMENTO_B4_HISTORICO as readonly string[]).includes(value);
}

function motivosProcedencia(procedencia: ProcedenciaHistorica): readonly MotivoPropuestaHistorica[] {
  if (procedencia.clase === "MANUAL_VERIFICADA") {
    return textoNoVacio(procedencia.registroManualVerificadoId) ? [] : ["PROCEDENCIA_DESCONOCIDA"];
  }
  if (procedencia.clase === "VINCULO_HISTORICO_EXACTO") {
    return textoNoVacio(procedencia.motorId)
      && textoNoVacio(procedencia.pruebaSinToleranciaControladaId)
      && procedencia.reglaComparacion === "IGUALDAD_CENTIMOS_FIRMADOS"
      ? []
      : ["VINCULO_HISTORICO_TOLERANTE_O_NO_DEMOSTRADO"];
  }
  if (procedencia.clase === "DESCONOCIDA") return ["PROCEDENCIA_DESCONOCIDA"];
  return ["VINCULO_HISTORICO_TOLERANTE_O_NO_DEMOSTRADO"];
}

function motivosFecha(documento: DocumentoHistorico, fechaPagoISO: string | null): readonly MotivoPropuestaHistorica[] {
  if (!fechaIsoValida(fechaPagoISO)) return ["FECHA_PAGO_DESCONOCIDA_O_INVALIDA"];
  if (documento.tipoDocumento === "NOMINA") {
    const periodo = documento.periodoNomina;
    if (!periodo || !fechaIsoValida(periodo.inicioISO) || !fechaIsoValida(periodo.finISO)
      || periodo.inicioISO > periodo.finISO
      || periodo.compatibilidadConPago !== "VERIFICADA"
      || !textoNoVacio(periodo.evidenciaControladaId)) {
      return ["PERIODO_NOMINA_NO_COMPATIBLE"];
    }
    return [];
  }
  if (!fechaIsoValida(documento.fechaDocumentoISO)) return ["FECHA_DOCUMENTO_DESCONOCIDA_O_INVALIDA"];
  return documento.fechaDocumentoISO <= fechaPagoISO ? [] : ["FECHA_DOCUMENTO_POSTERIOR_AL_PAGO"];
}

function motivosEstadoB4(documento: DocumentoHistorico): readonly MotivoPropuestaHistorica[] {
  if (documento.estadoB4.estado === "DUPLICADO") return ["DOCUMENTO_B4_DUPLICADO"];
  if (documento.estadoB4.estado === "DESCONOCIDO") return ["ESTADO_DOCUMENTO_B4_DESCONOCIDO"];
  if (documento.estadoB4.estado === "UNICO_REUTILIZABLE" && !textoNoVacio(documento.estadoB4.documentoB4Id)) {
    return ["REFERENCIA_DOCUMENTO_B4_INVALIDA"];
  }
  return [];
}

function motivosTraspaso(documento: DocumentoHistorico, movimiento: MovimientoHistorico): readonly MotivoPropuestaHistorica[] {
  if (documento.tipoDocumento !== "TRASPASO") return [];
  const pareja = documento.traspaso;
  if (!pareja || !pareja.reciprocaRealVerificada || !textoNoVacio(pareja.movimientoParejaId)
    || pareja.movimientoParejaId === movimiento.id) {
    return ["TRASPASO_SIN_PAREJA_RECIPROCA_REAL"];
  }
  const motivos: MotivoPropuestaHistorica[] = [];
  if (!textoNoVacio(pareja.cuentaMovimientoId) || !textoNoVacio(pareja.cuentaParejaId)
    || pareja.cuentaMovimientoId === pareja.cuentaParejaId) {
    motivos.push("TRASPASO_CUENTAS_NO_DIFERENTES");
  }
  if (!centimosNoCero(movimiento.importeBancoCentimos) || !centimosNoCero(pareja.importeParejaCentimos)
    || BigInt(movimiento.importeBancoCentimos) + BigInt(pareja.importeParejaCentimos) !== BigInt(0)) {
    motivos.push("TRASPASO_IMPORTES_NO_OPUESTOS_EXACTOS");
  }
  if (!textoNoVacio(pareja.archivoControladoId)) motivos.push("TRASPASO_ARCHIVO_CONTROLADO_AUSENTE");
  return motivos;
}

function movimientosDeDocumento(
  documentoId: string,
  documento: DocumentoHistorico,
  contexto: ContextoLote,
): ReadonlySet<string> {
  const resultado = new Set<string>();
  for (const movimientoId of documento.movimientoIdsHistoricos) {
    if (textoNoVacio(movimientoId)) resultado.add(movimientoId);
  }
  for (const movimientoId of contexto.movimientosCompartidosPorDocumento.get(documentoId) ?? []) resultado.add(movimientoId);
  return resultado;
}

/**
 * Una evidencia acumulada sólo elimina el conflicto compartido si enumera todos
 * los movimientos conocidos, sus importes bancarios firmados y un total igual
 * al documento. Aun así no relaja la igualdad individual banco/documento.
 */
function evidenciaAcumuladaEsPrecisa(
  documento: DocumentoHistorico,
  movimientoIds: ReadonlySet<string>,
  contexto: ContextoLote,
): boolean {
  const evidencia = documento.evidenciaAcumuladaFirmada;
  if (!evidencia || evidencia.clase !== "FIRMADA_DOCUMENTADA_PRECISA"
    || evidencia.documentoLegacyId !== documento.id
    || !textoNoVacio(evidencia.archivoFirmaControladoId)
    || !centimosNoCero(evidencia.totalDocumentadoCentimos)) return false;
  if (evidencia.asignaciones.length !== movimientoIds.size || movimientoIds.size < 2) return false;

  const vistos = new Set<string>();
  let total = BigInt(0);
  for (const asignacion of evidencia.asignaciones) {
    if (!textoNoVacio(asignacion.movimientoId) || vistos.has(asignacion.movimientoId)
      || !movimientoIds.has(asignacion.movimientoId) || !centimosNoCero(asignacion.importeCentimos)) return false;
    const movimiento = contexto.movimientosPorId.get(asignacion.movimientoId);
    if (!movimiento || !centimosNoCero(movimiento.importeBancoCentimos)
      || movimiento.importeBancoCentimos !== asignacion.importeCentimos) return false;
    vistos.add(asignacion.movimientoId);
    total = total + BigInt(asignacion.importeCentimos);
  }
  if (vistos.size !== movimientoIds.size || !centimosNoCero(documento.importeDocumentoCentimos)) return false;
  return total === BigInt(evidencia.totalDocumentadoCentimos)
    && total === BigInt(documento.importeDocumentoCentimos);
}

function motivosDocumento(
  documento: DocumentoHistorico,
  movimiento: MovimientoHistorico,
  contexto: ContextoLote,
): readonly MotivoPropuestaHistorica[] {
  const motivos: MotivoPropuestaHistorica[] = [];
  if (!esTipoDocumento(documento.tipoDocumento)) motivos.push("TIPO_DOCUMENTO_NO_ADMITIDO");
  if (!centimosValidos(documento.importeDocumentoCentimos)) motivos.push("IMPORTE_DOCUMENTAL_DESCONOCIDO");
  else if (documento.importeDocumentoCentimos === 0) motivos.push("IMPORTE_DOCUMENTAL_CERO");
  else if (!centimosNoCero(movimiento.importeBancoCentimos)
    || documento.importeDocumentoCentimos !== movimiento.importeBancoCentimos) {
    motivos.push("IMPORTE_NO_IGUAL_FIRMADO_EXACTO");
  }
  motivos.push(...motivosFecha(documento, movimiento.fechaPagoISO));
  if (documento.identidad.estado !== "REAL_VIGENTE_ARCHIVO_CONTROLADO_DISPONIBLE"
    || !textoNoVacio(documento.identidad.archivoControladoId)) {
    motivos.push("IDENTIDAD_REAL_VIGENTE_O_ARCHIVO_CONTROLADO_AUSENTE");
  }
  if (documento.calidadB2 !== "CANONICA") motivos.push("B2_NO_CANONICA");
  motivos.push(...motivosEstadoB4(documento));
  motivos.push(...motivosTraspaso(documento, movimiento));

  const movimientoIds = movimientosDeDocumento(documento.id, documento, contexto);
  if (movimientoIds.size > 1 && !evidenciaAcumuladaEsPrecisa(documento, movimientoIds, contexto)) {
    motivos.push(documento.evidenciaAcumuladaFirmada
      ? "EVIDENCIA_ACUMULADA_FIRMADA_IMPRECISA"
      : "DOCUMENTO_COMPARTIDO_SIN_EVIDENCIA_ACUMULADA_FIRMADA");
  }
  return ordenarMotivos(motivos);
}

function referenciaDocumentoB4(documento: DocumentoHistorico): ReferenciaDocumentoB4Plan | null {
  if (!textoNoVacio(documento.identidad.archivoControladoId)) return null;
  if (documento.estadoB4.estado === "AUSENTE") {
    return {
      documentoLegacyId: documento.id,
      tipoDocumento: documento.tipoDocumento,
      accion: "CREAR",
      documentoB4Id: null,
      archivoControladoId: documento.identidad.archivoControladoId,
    };
  }
  if (documento.estadoB4.estado === "UNICO_REUTILIZABLE" && textoNoVacio(documento.estadoB4.documentoB4Id)) {
    return {
      documentoLegacyId: documento.id,
      tipoDocumento: documento.tipoDocumento,
      accion: "REUTILIZAR",
      documentoB4Id: documento.estadoB4.documentoB4Id,
      archivoControladoId: documento.identidad.archivoControladoId,
    };
  }
  return null;
}

function conservarEnlace(
  enlace: EnlaceHistorico,
  motivos: readonly MotivoPropuestaHistorica[],
): EnlaceLegacyConservado {
  return {
    id: enlace.id,
    origen: ORIGEN_CONVERSION_HISTORICA,
    clase: enlace.clase,
    documentoLegacyId: enlace.documentoLegacyId,
    entregaACuentaEmpleadoId: enlace.entregaACuentaEmpleadoId,
    importeLineaCentimos: enlace.importeLineaCentimos,
    procedencia: enlace.procedencia,
    snapshotLegacy: enlace.snapshotLegacy,
    motivosPropuesta: ordenarMotivos(motivos),
  };
}

function crearContexto(input: EntradaConversionHistorica): ContextoLote {
  const documentosPorId = new Map<string, DocumentoHistorico>();
  const documentosDuplicados = new Set<string>();
  for (const documento of input.documentos) {
    if (!textoNoVacio(documento.id)) continue;
    if (documentosPorId.has(documento.id)) documentosDuplicados.add(documento.id);
    else documentosPorId.set(documento.id, documento);
  }
  const movimientosPorId = new Map<string, MovimientoHistorico>();
  const movimientosCompartidosPorDocumento = new Map<string, Set<string>>();
  for (const movimiento of input.movimientos) {
    if (!textoNoVacio(movimiento.id)) continue;
    movimientosPorId.set(movimiento.id, movimiento);
    for (const enlace of movimiento.enlacesLegacy) {
      if (enlace.clase !== "DOCUMENTO" || !textoNoVacio(enlace.documentoLegacyId)) continue;
      const ids = movimientosCompartidosPorDocumento.get(enlace.documentoLegacyId) ?? new Set<string>();
      ids.add(movimiento.id);
      movimientosCompartidosPorDocumento.set(enlace.documentoLegacyId, ids);
    }
  }
  return { documentosPorId, documentosDuplicados, movimientosPorId, movimientosCompartidosPorDocumento };
}

function motivosBaseMovimiento(movimiento: MovimientoHistorico): readonly MotivoPropuestaHistorica[] {
  const motivos: MotivoPropuestaHistorica[] = [];
  if (!textoNoVacio(movimiento.id)) motivos.push("MOVIMIENTO_ID_INVALIDO");
  if (!centimosValidos(movimiento.importeBancoCentimos)) motivos.push("IMPORTE_BANCARIO_DESCONOCIDO");
  else if (movimiento.importeBancoCentimos === 0) motivos.push("IMPORTE_BANCARIO_CERO");
  if (!fechaIsoValida(movimiento.fechaPagoISO)) motivos.push("FECHA_PAGO_DESCONOCIDA_O_INVALIDA");
  if (movimiento.b4Existente) motivos.push("MOVIMIENTO_B4_EXISTENTE");
  if (movimiento.enlacesLegacy.length === 0) motivos.push("SIN_ENLACES_HISTORICOS");
  return motivos;
}

function enlaceCandidato(
  movimiento: MovimientoHistorico,
  enlace: EnlaceHistorico,
  documento: DocumentoHistorico | undefined,
  contexto: ContextoLote,
  hayMultiplesDestinos: boolean,
): { motivos: readonly MotivoPropuestaHistorica[]; linea: LineaHistoricaB4Plan | null } {
  const motivos: MotivoPropuestaHistorica[] = [];
  if (!textoNoVacio(enlace.id)) motivos.push("ENLACE_HISTORICO_ID_INVALIDO");
  if (enlace.origen !== ORIGEN_CONVERSION_HISTORICA) motivos.push("ORIGEN_NO_HISTORICO");
  if (enlace.clase === "ENTREGA_A_CUENTA_EMPLEADO" || textoNoVacio(enlace.entregaACuentaEmpleadoId)) {
    motivos.push("ENTREGA_A_CUENTA_EMPLEADO_NO_ES_DOCUMENTO");
  }
  if (enlace.clase !== "DOCUMENTO") motivos.push("ENLACE_HISTORICO_SIN_DESTINO_DOCUMENTAL");
  if (!textoNoVacio(enlace.documentoLegacyId)) {
    motivos.push("ENLACE_HISTORICO_SIN_DESTINO_DOCUMENTAL");
  }
  if (hayMultiplesDestinos && enlace.importeLineaCentimos === null) {
    motivos.push("MULTIPLES_DESTINOS_SIN_IMPORTE_POR_LINEA");
  }
  motivos.push(...motivosProcedencia(enlace.procedencia));

  if (!documento) {
    if (textoNoVacio(enlace.documentoLegacyId)) motivos.push("DESTINO_DOCUMENTAL_NO_ENCONTRADO");
    return { motivos: ordenarMotivos(motivos), linea: null };
  }
  if (contexto.documentosDuplicados.has(documento.id)) motivos.push("DOCUMENTO_HISTORICO_DUPLICADO_EN_ENTRADA");
  motivos.push(...motivosDocumento(documento, movimiento, contexto));
  if (enlace.importeLineaCentimos !== null && !centimosValidos(enlace.importeLineaCentimos)) {
    motivos.push("IMPORTE_LINEA_LEGACY_NO_COINCIDE_EXACTAMENTE");
  } else if (enlace.importeLineaCentimos !== null
    && (!centimosNoCero(movimiento.importeBancoCentimos) || enlace.importeLineaCentimos !== movimiento.importeBancoCentimos)) {
    motivos.push("IMPORTE_LINEA_LEGACY_NO_COINCIDE_EXACTAMENTE");
  }

  const referencia = referenciaDocumentoB4(documento);
  const linea = referencia && centimosNoCero(movimiento.importeBancoCentimos)
    ? {
        tipo: "DOCUMENTO" as const,
        modo: "SUGERIDA" as const,
        movimientoId: movimiento.id,
        importeCentimos: movimiento.importeBancoCentimos,
        documento: referencia,
        enlaceLegacyIds: [enlace.id],
      }
    : null;
  return { motivos: ordenarMotivos(motivos), linea };
}

/**
 * Proyecta todos los movimientos en orden de entrada. Nunca escoge un destino
 * entre varios: sólo confirma exactamente un enlace DOCUMENTO y un documento
 * inequívoco. Los resultados PROPUESTA pueden exponer un candidato SUGERIDA,
 * pero jamás una línea CONFIRMED.
 */
export function planificarConversionHistoricaAB4(input: EntradaConversionHistorica): readonly ResultadoConversionHistorica[] {
  const contexto = crearContexto(input);
  return input.movimientos.map((movimiento) => {
    const motivosMovimiento = new Set<MotivoPropuestaHistorica>(motivosBaseMovimiento(movimiento));
    const enlacesDocumento = movimiento.enlacesLegacy.filter((enlace) => enlace.clase === "DOCUMENTO" && textoNoVacio(enlace.documentoLegacyId));
    if (enlacesDocumento.length > 1) motivosMovimiento.add("MULTIPLES_DESTINOS_HISTORICOS");

    const evaluaciones = movimiento.enlacesLegacy.map((enlace) => {
      const documento = enlace.clase === "DOCUMENTO" && textoNoVacio(enlace.documentoLegacyId)
        ? contexto.documentosPorId.get(enlace.documentoLegacyId)
        : undefined;
      return {
        enlace,
        ...enlaceCandidato(movimiento, enlace, documento, contexto, enlacesDocumento.length > 1),
      };
    });

    const destinos = new Set(enlacesDocumento.map((enlace) => enlace.documentoLegacyId as string));
    if (destinos.size > 1) motivosMovimiento.add("MULTIPLES_DESTINOS_HISTORICOS");
    const candidato = evaluaciones.length === 1 ? evaluaciones[0] : null;
    const puedeConfirmar = candidato !== null
      && candidato.linea !== null
      && candidato.motivos.length === 0
      && motivosMovimiento.size === 0
      && !movimiento.b4Existente;

    const motivosFinales = ordenarMotivos([
      ...motivosMovimiento,
      ...evaluaciones.flatMap((evaluacion) => evaluacion.motivos),
    ]);
    const enlacesLegacy = evaluaciones.map((evaluacion) => conservarEnlace(evaluacion.enlace, evaluacion.motivos));
    if (puedeConfirmar && candidato?.linea) {
      const confirmed: LineaHistoricaB4Plan = { ...candidato.linea, modo: "CONFIRMED" };
      return {
        origen: ORIGEN_CONVERSION_HISTORICA,
        movimientoId: movimiento.id,
        estado: "JUSTIFICADO",
        motivosPropuesta: [],
        lineasConfirmadas: [confirmed],
        lineasSugeridas: [],
        enlacesLegacy,
      };
    }

    const sugeridas = candidato?.linea ? [candidato.linea] : [];
    return {
      origen: ORIGEN_CONVERSION_HISTORICA,
      movimientoId: movimiento.id,
      estado: "PROPUESTA",
      motivosPropuesta: motivosFinales.length > 0 ? motivosFinales : ["SIN_ENLACES_HISTORICOS"],
      lineasConfirmadas: [],
      lineasSugeridas: sugeridas,
      enlacesLegacy,
    };
  });
}
