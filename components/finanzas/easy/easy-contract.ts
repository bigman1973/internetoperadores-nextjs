export type SentidoEasy = 'TODOS' | 'CARGOS' | 'COBROS';
export type SemaforoEasy = 'VERDE' | 'AMARILLO' | 'ROJO' | 'GRIS';
export type TipoTerceroPaso1 = 'CLIENTE' | 'PROVEEDOR' | 'BANCO' | 'CUENTA_PROPIA' | 'EMPLEADO';
export type EstadoPaso1 = 'IDENTIFICADO' | 'PROPUESTO' | 'SIN_IDENTIFICAR';
export type OrigenPaso1 = 'ENTIDAD_FISCAL' | 'EMPLEADO' | 'NOMINA_EMPLEADO' | 'FACTURA_RECIBIDA' | 'FACTURA_EMITIDA' | 'CLIENTE_CONTRATO_ACTUAL' | 'CUENTA_PROPIA_ACTUAL' | 'MANUAL' | 'AUTO_RECIBO';
export type EstadoPaso2 = 'SIN_DOCUMENTO' | 'JUSTIFICADO' | 'NO_REQUIERE';

export type PasoSentidoContador = Readonly<{ movimientos: number; importeCentimos: string; identificados?: number }>;
/**
 * Subtotal de un estado documental. Es opcional mientras las respuestas
 * antiguas no publiquen el desglose; nunca se deduce desde otra cohorte.
 */
export type Paso2EstadoContador = Readonly<{ movimientos: number; importeCentimos: string }>;
export type Paso2MesContador = Readonly<{
  mes: string;
  documentoConfirmado?: Paso2EstadoContador;
  noRequiere?: Paso2EstadoContador;
}>;
export type Paso1Contadores = Readonly<{
  cohorte: 'TODOS_MOVIMIENTOS_VENTANA'; totalMovimientos: number; cargos: PasoSentidoContador; cobros: PasoSentidoContador;
  identificados: number; propuestosTexto: number; sinIdentificar: number;
}>;
export type Paso2Contadores = Readonly<{
  cohorte: 'PENDIENTES_B4_SIN_DOCUMENTO'; totalMovimientos: number; cargos: PasoSentidoContador; cobros: PasoSentidoContador;
  criterio: 'B4_DOCUMENTAL_INDEPENDIENTE_DE_PASO_1';
  /** Extensiones P2 opcionales: no sustituyen el denominador SIN_DOCUMENTO. */
  totalVentanaMovimientos?: number;
  justificados?: Readonly<{ movimientos: number; cargos: PasoSentidoContador; cobros: PasoSentidoContador }>;
  /** Desglose opcional de resultados B4 publicado por backend; no reemplaza la cola pendiente. */
  noRequiere?: Readonly<{ movimientos: number; cargos: PasoSentidoContador; cobros: PasoSentidoContador }>;
  periodo?: Readonly<{ documentoConfirmado: Paso2EstadoContador; noRequiere: Paso2EstadoContador }>;
  /** Serie opcional, de lectura, para presentar los mismos estados sin sumar períodos distintos. */
  meses?: readonly Paso2MesContador[];
}>;
export type PasosModoFacil = Readonly<{ version: 'EASY_PASOS_V1'; paso1: Paso1Contadores; paso2: Paso2Contadores }>;

export type EasySuggestion = Readonly<{
  id: string;
  tipo: string;
  sourceId: string;
  /** Puede ser null: la confirmación humana B4 crea el wrapper en la misma transacción. */
  documentoConciliableId: string | null;
  referencia: string;
  tercero: string | null;
  fecha: string | null;
  vencimiento: string | null;
  importeCentimos: number;
  archivoDisponible: boolean;
  exacta: boolean;
  archivoPrivadoHref?: string | null;
  motivos: string[];
}>;

export type EasyMovement = Readonly<{
  id: string;
  version: number;
  fecha: string;
  concepto: string;
  importeCentimos: number;
  contraparte: string;
  cuenta: { id: string; banco: string; alias: string | null };
  tarjeta: string | null;
  responsableTarjeta: string | null;
  versionGestion: number;
  estado: 'SIN_DOCUMENTO';
  reglaAplicadaId: string | null;
  motivoNoRequierePropuesto?: string | null;
  sugerencias: EasySuggestion[];
}>;

export type EasyMonth = Readonly<{
  mes: string;
  pendientes: number;
  justificados: number;
  noRequiere: number;
  importeJustificadoCentimos: string;
  importePendienteCentimos: string;
  coberturaVerificada: boolean;
  semaforo: SemaforoEasy;
  mensaje: string;
}>;

export type EasyRule = Readonly<{
  id: string;
  /** Versión de concurrencia obligatoria para desactivar una regla. */
  version: number;
  contraparte: string;
  accion: string;
  activa: boolean;
  modo: 'SOLO_PROPONER';
  usosConfirmados: number;
}>;

export type EasyReadResponse = Readonly<{
  stagingOnly: true;
  automaticas: false;
  criterio: string;
  periodo: { desde: string; hasta: string };
  total: number;
  limit: number;
  offset: number;
  totales: { cargos: number; cobros: number; cargosCentimos: string; cobrosCentimos: string };
  meses: EasyMonth[];
  reglas: EasyRule[];
  movimientos: EasyMovement[];
  /** Ausente mientras el backend no haya aplicado la migración P1. */
  pasos?: PasosModoFacil;
}>;

export type ConfirmarFacturaPayload = Readonly<{
  action: 'confirmar_factura'; movimientoId: string; version: number; sugerenciaId: string; idempotencyKey: string; confirmacion: true;
}>;
export type NoRequierePayload = Readonly<{
  action: 'no_requiere'; movimientoId: string; version: number; motivoNoRequiere: string; idempotencyKey: string; confirmacion: true;
}>;
/** El wrapper B4 recibe únicamente la recuperación acordada; no se inventan líneas ni versión en la UI. */
export type DeshacerModoFacilPayload = Readonly<{
  action: 'deshacer'; confirmacion: true; operacionId: string; idempotencyKey: string;
}>;
export type CrearReglaPayload = Readonly<{
  action: 'crear'; operacionId: string; modo: 'SOLO_PROPONER'; confirmacion: true;
}>;
export type DesactivarReglaPayload = Readonly<{
  action: 'desactivar'; reglaId: string; version: number; confirmacion: true;
}>;

const safeString = (value: unknown): value is string => typeof value === 'string';
const safeInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const CENTS_TEXT = /^[+-]?\d+$/;

function readString(value: unknown, field: string): string {
  if (!safeString(value)) throw new Error(`El campo ${field} no es texto válido.`);
  return value;
}
function readNullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return readString(value, field);
}
function readInteger(value: unknown, field: string): number {
  if (!safeInteger(value)) throw new Error(`El campo ${field} no es un entero seguro.`);
  return value;
}
function readNonNegativeInteger(value: unknown, field: string): number {
  const parsed = readInteger(value, field);
  if (parsed < 0) throw new Error(`El campo ${field} no puede ser negativo.`);
  return parsed;
}
function readArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`El campo ${field} debe ser una lista.`);
  return value;
}
function objectAt(value: unknown, field: string): Record<string, unknown> {
  const parsed = record(value);
  if (!parsed) throw new Error(`El campo ${field} debe ser un objeto.`);
  return parsed;
}
function readCentsText(value: unknown, field: string): string {
  const parsed = readString(value, field);
  if (!CENTS_TEXT.test(parsed)) throw new Error(`El campo ${field} no contiene céntimos exactos.`);
  return parsed;
}

function validatedPrivateHref(value: unknown): string {
  if (typeof value !== 'string' || value.length > 600 || !/^\/api\/admin\/finanzas\/(?:modo-facil\/documentos\/[A-Za-z0-9_-]+\/archivo|movimientos\/[A-Za-z0-9_-]+\/archivos\?archivoId=ADJUNTO_B5%3A[A-Za-z0-9_-]+)$/.test(value)) throw new Error('La ruta privada del archivo no es válida.');
  return value;
}

function parseSuggestion(value: unknown, index: number): EasySuggestion {
  const raw = objectAt(value, `sugerencias[${index}]`);
  return {
    id: readString(raw.id, `sugerencias[${index}].id`),
    tipo: readString(raw.tipo, `sugerencias[${index}].tipo`),
    sourceId: readString(raw.sourceId, `sugerencias[${index}].sourceId`),
    documentoConciliableId: readNullableString(raw.documentoConciliableId, `sugerencias[${index}].documentoConciliableId`),
    referencia: readString(raw.referencia, `sugerencias[${index}].referencia`),
    tercero: readNullableString(raw.tercero, `sugerencias[${index}].tercero`),
    fecha: readNullableString(raw.fecha, `sugerencias[${index}].fecha`),
    vencimiento: readNullableString(raw.vencimiento, `sugerencias[${index}].vencimiento`),
    importeCentimos: readInteger(raw.importeCentimos, `sugerencias[${index}].importeCentimos`),
    archivoDisponible: raw.archivoDisponible === true || raw.archivoDisponible === false ? raw.archivoDisponible : (() => { throw new Error(`El campo sugerencias[${index}].archivoDisponible no es booleano.`); })(),
    exacta: raw.exacta === true || raw.exacta === false ? raw.exacta : (() => { throw new Error(`El campo sugerencias[${index}].exacta no es booleano.`); })(),
    archivoPrivadoHref: raw.archivoPrivadoHref === undefined || raw.archivoPrivadoHref === null ? null : validatedPrivateHref(raw.archivoPrivadoHref),
    motivos: readArray(raw.motivos, `sugerencias[${index}].motivos`).map((item, motiveIndex) => readString(item, `sugerencias[${index}].motivos[${motiveIndex}]`)),
  };
}

function parseMovement(value: unknown, index: number): EasyMovement {
  const raw = objectAt(value, `movimientos[${index}]`);
  const account = objectAt(raw.cuenta, `movimientos[${index}].cuenta`);
  if (raw.estado !== 'SIN_DOCUMENTO') throw new Error(`El estado de movimientos[${index}] no pertenece a la cola Modo Fácil.`);
  return {
    id: readString(raw.id, `movimientos[${index}].id`),
    version: readInteger(raw.version, `movimientos[${index}].version`),
    fecha: readString(raw.fecha, `movimientos[${index}].fecha`),
    concepto: readString(raw.concepto, `movimientos[${index}].concepto`),
    importeCentimos: readInteger(raw.importeCentimos, `movimientos[${index}].importeCentimos`),
    contraparte: readString(raw.contraparte, `movimientos[${index}].contraparte`),
    cuenta: { id: readString(account.id, `movimientos[${index}].cuenta.id`), banco: readString(account.banco, `movimientos[${index}].cuenta.banco`), alias: readNullableString(account.alias, `movimientos[${index}].cuenta.alias`) },
    tarjeta: readNullableString(raw.tarjeta, `movimientos[${index}].tarjeta`),
    responsableTarjeta: readNullableString(raw.responsableTarjeta, `movimientos[${index}].responsableTarjeta`),
    versionGestion: readInteger(raw.versionGestion, `movimientos[${index}].versionGestion`),
    estado: 'SIN_DOCUMENTO',
    reglaAplicadaId: readNullableString(raw.reglaAplicadaId, `movimientos[${index}].reglaAplicadaId`),
    motivoNoRequierePropuesto: raw.motivoNoRequierePropuesto === undefined ? null : readNullableString(raw.motivoNoRequierePropuesto, 'motivoNoRequierePropuesto'),
    sugerencias: readArray(raw.sugerencias, `movimientos[${index}].sugerencias`).map(parseSuggestion),
  };
}

function parsePasoSentido(value: unknown, field: string, requireIdentified: boolean): PasoSentidoContador {
  const raw = objectAt(value, field);
  const result: { movimientos: number; importeCentimos: string; identificados?: number } = { movimientos: readNonNegativeInteger(raw.movimientos, `${field}.movimientos`), importeCentimos: readCentsText(raw.importeCentimos, `${field}.importeCentimos`) };
  if (requireIdentified) result.identificados = readNonNegativeInteger(raw.identificados, `${field}.identificados`);
  return result;
}
function parsePaso2Estado(value: unknown, field: string): Paso2EstadoContador {
  const raw = objectAt(value, field);
  return { movimientos: readNonNegativeInteger(raw.movimientos, `${field}.movimientos`), importeCentimos: readCentsText(raw.importeCentimos, `${field}.importeCentimos`) };
}
function parsePasos(value: unknown): PasosModoFacil {
  const raw = objectAt(value, 'pasos');
  if (raw.version !== 'EASY_PASOS_V1') throw new Error('La versión de pasos no es compatible.');
  const paso1 = objectAt(raw.paso1, 'pasos.paso1'); const paso2 = objectAt(raw.paso2, 'pasos.paso2');
  if (paso1.cohorte !== 'TODOS_MOVIMIENTOS_VENTANA') throw new Error('La cohorte de Paso 1 no es válida.');
  if (paso2.cohorte !== 'PENDIENTES_B4_SIN_DOCUMENTO' || paso2.criterio !== 'B4_DOCUMENTAL_INDEPENDIENTE_DE_PASO_1') throw new Error('La cohorte documental de Paso 2 no es válida.');
  const periodo = paso2.periodo === undefined ? undefined : (() => {
    const rawPeriodo = objectAt(paso2.periodo, 'pasos.paso2.periodo');
    return { documentoConfirmado: parsePaso2Estado(rawPeriodo.documentoConfirmado, 'pasos.paso2.periodo.documentoConfirmado'), noRequiere: parsePaso2Estado(rawPeriodo.noRequiere, 'pasos.paso2.periodo.noRequiere') };
  })();
  const meses = paso2.meses === undefined ? undefined : readArray(paso2.meses, 'pasos.paso2.meses').map((value, index): Paso2MesContador => {
    const rawMes = objectAt(value, `pasos.paso2.meses[${index}]`);
    const documentoConfirmado = rawMes.documentoConfirmado === undefined ? undefined : parsePaso2Estado(rawMes.documentoConfirmado, `pasos.paso2.meses[${index}].documentoConfirmado`);
    const noRequiere = rawMes.noRequiere === undefined ? undefined : parsePaso2Estado(rawMes.noRequiere, `pasos.paso2.meses[${index}].noRequiere`);
    if (!documentoConfirmado && !noRequiere) throw new Error(`El mes pasos.paso2.meses[${index}] no incluye un estado documental verificable.`);
    return { mes: readString(rawMes.mes, `pasos.paso2.meses[${index}].mes`), documentoConfirmado, noRequiere };
  });
  return {
    version: 'EASY_PASOS_V1',
    paso1: { cohorte: 'TODOS_MOVIMIENTOS_VENTANA', totalMovimientos: readNonNegativeInteger(paso1.totalMovimientos, 'pasos.paso1.totalMovimientos'), cargos: parsePasoSentido(paso1.cargos, 'pasos.paso1.cargos', true), cobros: parsePasoSentido(paso1.cobros, 'pasos.paso1.cobros', true), identificados: readNonNegativeInteger(paso1.identificados, 'pasos.paso1.identificados'), propuestosTexto: readNonNegativeInteger(paso1.propuestosTexto, 'pasos.paso1.propuestosTexto'), sinIdentificar: readNonNegativeInteger(paso1.sinIdentificar, 'pasos.paso1.sinIdentificar') },
    paso2: { cohorte: 'PENDIENTES_B4_SIN_DOCUMENTO', totalMovimientos: readNonNegativeInteger(paso2.totalMovimientos, 'pasos.paso2.totalMovimientos'), cargos: parsePasoSentido(paso2.cargos, 'pasos.paso2.cargos', false), cobros: parsePasoSentido(paso2.cobros, 'pasos.paso2.cobros', false), criterio: 'B4_DOCUMENTAL_INDEPENDIENTE_DE_PASO_1', periodo, meses },
  };
}

/** Rechaza respuestas parciales para no sustituir evidencias desconocidas por ceros UI. */
export function parseEasyReadResponse(value: unknown): EasyReadResponse {
  const raw = objectAt(value, 'respuesta');
  if (raw.stagingOnly !== true) throw new Error('La respuesta no declara stagingOnly:true.');
  if (raw.automaticas !== false) throw new Error('La respuesta no declara automaticas:false.');
  const period = objectAt(raw.periodo, 'periodo');
  const totals = objectAt(raw.totales, 'totales');
  const months = readArray(raw.meses, 'meses').map((month, index): EasyMonth => {
    const item = objectAt(month, `meses[${index}]`);
    if (!['VERDE', 'AMARILLO', 'ROJO', 'GRIS'].includes(String(item.semaforo))) throw new Error(`El semáforo de meses[${index}] no es válido.`);
    if (typeof item.coberturaVerificada !== 'boolean') throw new Error(`La cobertura de meses[${index}] no es válida.`);
    return {
      mes: readString(item.mes, `meses[${index}].mes`), pendientes: readInteger(item.pendientes, `meses[${index}].pendientes`), justificados: readInteger(item.justificados, `meses[${index}].justificados`), noRequiere: readInteger(item.noRequiere, `meses[${index}].noRequiere`),
      importeJustificadoCentimos: readCentsText(item.importeJustificadoCentimos, `meses[${index}].importeJustificadoCentimos`), importePendienteCentimos: readCentsText(item.importePendienteCentimos, `meses[${index}].importePendienteCentimos`),
      coberturaVerificada: item.coberturaVerificada, semaforo: item.semaforo as SemaforoEasy, mensaje: readString(item.mensaje, `meses[${index}].mensaje`),
    };
  });
  const rules = readArray(raw.reglas, 'reglas').map((rule, index): EasyRule => {
    const item = objectAt(rule, `reglas[${index}]`);
    if (item.activa !== true && item.activa !== false) throw new Error(`El estado de reglas[${index}] no es válido.`);
    if (item.modo !== 'SOLO_PROPONER') throw new Error(`La regla ${index} no es proposal-only.`);
    return { id: readString(item.id, `reglas[${index}].id`), version: readInteger(item.version, `reglas[${index}].version`), contraparte: readString(item.contraparte, `reglas[${index}].contraparte`), accion: readString(item.accion, `reglas[${index}].accion`), activa: item.activa, modo: 'SOLO_PROPONER', usosConfirmados: readInteger(item.usosConfirmados, `reglas[${index}].usosConfirmados`) };
  });
  return {
    stagingOnly: true, automaticas: false, criterio: readString(raw.criterio, 'criterio'),
    periodo: { desde: readString(period.desde, 'periodo.desde'), hasta: readString(period.hasta, 'periodo.hasta') },
    total: readNonNegativeInteger(raw.total, 'total'), limit: readNonNegativeInteger(raw.limit, 'limit'), offset: readNonNegativeInteger(raw.offset, 'offset'),
    totales: { cargos: readNonNegativeInteger(totals.cargos, 'totales.cargos'), cobros: readNonNegativeInteger(totals.cobros, 'totales.cobros'), cargosCentimos: readCentsText(totals.cargosCentimos, 'totales.cargosCentimos'), cobrosCentimos: readCentsText(totals.cobrosCentimos, 'totales.cobrosCentimos') },
    meses: months, reglas: rules, movimientos: readArray(raw.movimientos, 'movimientos').map(parseMovement), pasos: raw.pasos === undefined ? undefined : parsePasos(raw.pasos),
  };
}

export function cents(value: number | null | undefined): string {
  if (!Number.isSafeInteger(value)) return 'Importe no verificable';
  const abs = Math.abs(value);
  const euros = (abs / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  return `${value < 0 ? '−' : value > 0 ? '+' : ''}${euros}`;
}

/** Formatter exacto para centimos serializados; nunca convierte BigInt a Number. */
export function formatCentsText(value: string): string {
  if (!CENTS_TEXT.test(value)) return 'Importe no verificable';
  const negative = value.startsWith('-');
  const raw = (negative || value.startsWith('+') ? value.slice(1) : value).replace(/^0+(?=\d)/, '') || '0';
  const normalized = raw.padStart(3, '0');
  const whole = normalized.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '−' : value.startsWith('+') ? '+' : ''}${whole},${normalized.slice(-2)} €`;
}

export function displayDate(value: string | null): string {
  if (!value) return 'No disponible';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

/** Convierte YYYY-MM en el nombre que entiende una persona, sin modificar la clave recibida. */
export function monthLabel(value: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/.exec(value);
  if (!match) return value;
  const date = new Date(`${match[1]}-${match[2]}-01T12:00:00`);
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(date).replace(/^./u, (letter) => letter.toLocaleUpperCase('es-ES'));
}

export function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
}

export function sortQueueByMagnitude(movements: readonly EasyMovement[]): EasyMovement[] {
  return [...movements].sort((left, right) => Math.abs(right.importeCentimos) - Math.abs(left.importeCentimos) || left.fecha.localeCompare(right.fecha) || left.id.localeCompare(right.id));
}

export function lastFour(card: string | null): string {
  if (!card) return '—';
  const digits = card.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : card;
}

/** Un archivo es condición B4 para cargos; una factura emitida exacta puede confirmar un cobro sin archivo. */
export function canConfirmSuggestion(movement: Pick<EasyMovement, 'importeCentimos'>, suggestion: Pick<EasySuggestion, 'exacta' | 'archivoDisponible'>): boolean {
  return suggestion.exacta && (movement.importeCentimos >= 0 || suggestion.archivoDisponible);
}

export function suggestionEvidenceLabel(suggestion: Pick<EasySuggestion, 'exacta' | 'archivoDisponible'>): string {
  if (suggestion.exacta) return 'Coincidencia exacta';
  return suggestion.archivoDisponible ? 'Requiere revisión' : 'Sin archivo descargable';
}

export function noRequireReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    COMISION_BANCARIA: 'Comisión bancaria', INTERES_BANCARIO: 'Interés bancario', REDONDEO_BANCARIO: 'Redondeo bancario',
    TRASPASO_INTERNO_SIN_DOCUMENTO: 'Traspaso interno sin justificante', MOVIMIENTO_TECNICO_BANCO: 'Movimiento técnico del banco', CORRECCION_BANCARIA: 'Corrección bancaria',
    SIN_DOCUMENTO: 'Sin justificante',
  };
  return labels[reason] || 'Motivo de revisión seleccionado';
}

export function ruleActionLabel(_action: string): string { return 'Sólo sugerir en futuras revisiones'; }

export function buildConfirmInvoicePayload(movement: Pick<EasyMovement, 'id' | 'version'>, suggestion: Pick<EasySuggestion, 'id'>, idempotencyKey: string): ConfirmarFacturaPayload {
  return { action: 'confirmar_factura', movimientoId: movement.id, version: movement.version, sugerenciaId: suggestion.id, idempotencyKey, confirmacion: true };
}
export function buildNoRequirePayload(movement: Pick<EasyMovement, 'id' | 'version'>, motivoNoRequiere: string, idempotencyKey: string): NoRequierePayload {
  return { action: 'no_requiere', movimientoId: movement.id, version: movement.version, motivoNoRequiere, idempotencyKey, confirmacion: true };
}
export function buildUndoPayload(operacionId: string, idempotencyKey: string): DeshacerModoFacilPayload {
  return { action: 'deshacer', confirmacion: true, operacionId, idempotencyKey };
}
export function buildCreateRulePayload(operacionId: string): CrearReglaPayload {
  return { action: 'crear', operacionId, modo: 'SOLO_PROPONER', confirmacion: true };
}
export function buildDisableRulePayload(rule: Pick<EasyRule, 'id' | 'version'>): DesactivarReglaPayload {
  return { action: 'desactivar', reglaId: rule.id, version: rule.version, confirmacion: true };
}
