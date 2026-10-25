export type SentidoEasy = 'TODOS' | 'CARGOS' | 'COBROS';
export type SemaforoEasy = 'VERDE' | 'AMARILLO' | 'ROJO' | 'GRIS';
export type TipoTerceroPaso1 = 'CLIENTE' | 'PROVEEDOR' | 'BANCO' | 'CUENTA_PROPIA' | 'EMPLEADO';
export type EstadoPaso1 = 'IDENTIFICADO' | 'PROPUESTO' | 'SIN_IDENTIFICAR';
export type OrigenPaso1 = 'ENTIDAD_FISCAL' | 'EMPLEADO' | 'NOMINA_EMPLEADO' | 'FACTURA_RECIBIDA' | 'FACTURA_EMITIDA' | 'CLIENTE_CONTRATO_ACTUAL' | 'CUENTA_PROPIA_ACTUAL' | 'MANUAL' | 'AUTO_RECIBO';
export type EstadoPaso2 = 'SIN_DOCUMENTO' | 'JUSTIFICADO' | 'NO_REQUIERE';

export type PasoSentidoContador = Readonly<{ movimientos: number; importeCentimos: string; identificados?: number }>;
export type Paso2EstadoContador = Readonly<{ movimientos: number; importeCentimos: string }>;
export type Paso2MesContador = Readonly<{ mes: string; documentoConfirmado?: Paso2EstadoContador; noRequiere?: Paso2EstadoContador }>;
export type Paso1Contadores = Readonly<{
  cohorte: 'TODOS_MOVIMIENTOS_VENTANA'; totalMovimientos: number; cargos: PasoSentidoContador; cobros: PasoSentidoContador;
  identificados: number; propuestosTexto: number; sinIdentificar: number;
}>;
export type Paso2Contadores = Readonly<{
  cohorte: 'PENDIENTES_B4_SIN_DOCUMENTO'; totalMovimientos: number; cargos: PasoSentidoContador; cobros: PasoSentidoContador;
  criterio: 'B4_DOCUMENTAL_INDEPENDIENTE_DE_PASO_1';
  totalVentanaMovimientos?: number;
  justificados?: Readonly<{ movimientos: number; cargos: PasoSentidoContador; cobros: PasoSentidoContador }>;
  noRequiere?: Readonly<{ movimientos: number; cargos: PasoSentidoContador; cobros: PasoSentidoContador }>;
  periodo?: Readonly<{ documentoConfirmado: Paso2EstadoContador; noRequiere: Paso2EstadoContador }>;
  meses?: readonly Paso2MesContador[];
}>;
export type PasosModoFacil = Readonly<{ version: 'EASY_PASOS_V1'; paso1: Paso1Contadores; paso2: Paso2Contadores }>;

export type EasySuggestion = Readonly<{
  id: string;
  tipo: string;
  sourceId: string;
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

/** Dato opcional: el servidor lo añade sin sustituir los campos ya publicados del movimiento. */
export type EasyWhoIs = Readonly<{ estado: EstadoPaso1; nombre: string | null }>;

export type EasyCollectionLevel = 'EXACTA' | 'REVISAR';
export type EasyCollectionLine = Readonly<{ tipo: 'DOCUMENTO' | 'DIFERENCIA'; referencia: string; importeCentimos: number }>;
export type EasyCollectionInvoice = Readonly<{
  numFactura: string | null;
  cliente: string | null;
  importeCentimos: number;
  vencimiento: string | null;
  facturaEmitidaId: string | null;
  totalFacturaCentimos: number | null;
  fechaFactura: string | null;
}>;
export type EasyCollectionPair = Readonly<{ fecha: string; cuentaAlias: string | null; concepto: string; importeCentimos: number }>;
/**
 * Proyección opcional, firmada por el servidor, de una propuesta 1→N de cobro.
 * Su ausencia conserva la respuesta histórica de Modo Fácil sin sustituirla.
 */
export type EasyCollectionProposal = Readonly<{
  rol: 'PRINCIPAL' | 'PAR';
  propuestaId: string;
  movimientoId: string;
  fingerprint: string;
  previewToken: string | null;
  metodo: string;
  etiquetaMetodo: string;
  nivel: EasyCollectionLevel;
  explicacion: string;
  importeMovimientoCentimos: number;
  lineas: readonly EasyCollectionLine[];
  composicion: readonly EasyCollectionInvoice[];
  composicionTotal: number;
  composicionImporteCentimos: number;
  clientesDistintos: number;
  diferenciaCentimos: number;
  par: EasyCollectionPair | null;
  seleccionable: boolean;
  motivoNoSeleccionable: string | null;
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
  /** Ausente hasta que la proyección del servidor publique la identificación. */
  quienEs?: EasyWhoIs;
  /** Ausente en servidores previos; nunca se inventa una propuesta local. */
  propuestaCobro?: EasyCollectionProposal | null;
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
  version: number;
  contraparte: string;
  accion: string;
  activa: boolean;
  modo: 'SOLO_PROPONER';
  usosConfirmados: number;
}>;

export type EasyReadResponse = Readonly<{
  stagingOnly: boolean;
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
  pasos?: PasosModoFacil;
}>;

export type ConfirmarFacturaPayload = Readonly<{
  action: 'confirmar_factura'; movimientoId: string; version: number; sugerenciaId: string; idempotencyKey: string; confirmacion: true;
}>;
export type NoRequierePayload = Readonly<{
  action: 'no_requiere'; movimientoId: string; version: number; motivoNoRequiere: string; idempotencyKey: string; confirmacion: true;
}>;
export type DeshacerModoFacilPayload = Readonly<{
  action: 'deshacer'; confirmacion: true; operacionId: string; idempotencyKey: string;
}>;
export type CrearReglaPayload = Readonly<{
  action: 'crear'; operacionId: string; modo: 'SOLO_PROPONER'; confirmacion: true;
}>;
export type DesactivarReglaPayload = Readonly<{
  action: 'desactivar'; reglaId: string; version: number; confirmacion: true;
}>;
export type ConfirmarBloqueCobroPayload = Readonly<{
  action: 'confirmar_bloque';
  confirmacion: true;
  idempotencyKey: string;
  previewToken: string;
  items: readonly Readonly<{ propuestaId: string; movimientoId: string; fingerprint: string }>[];
}>;
export type DeshacerBloqueCobroPayload = Readonly<{
  action: 'deshacer_bloque';
  confirmacion: true;
  idempotencyKey: string;
  bloqueId: string;
}>;

const safeString = (value: unknown): value is string => typeof value === 'string';
const safeInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const CENTS_TEXT = /^[+-]?\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readString(value: unknown, field: string): string {
  if (!safeString(value)) throw new Error(`El campo ${field} no es texto válido.`);
  return value;
}
function readBoundedString(value: unknown, field: string, maximum: number): string {
  const parsed = readString(value, field);
  if (!parsed.trim() || parsed.length > maximum) throw new Error(`El campo ${field} no es texto válido.`);
  return parsed;
}
function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`El campo ${field} no es booleano válido.`);
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

function parseWhoIs(value: unknown, field: string): EasyWhoIs {
  const raw = objectAt(value, field);
  if (raw.estado !== 'IDENTIFICADO' && raw.estado !== 'PROPUESTO' && raw.estado !== 'SIN_IDENTIFICAR') throw new Error(`El campo ${field}.estado no es válido.`);
  return { estado: raw.estado, nombre: readNullableString(raw.nombre, `${field}.nombre`) };
}

function parseCollectionLine(value: unknown, field: string): EasyCollectionLine {
  const raw = objectAt(value, field);
  if (raw.tipo !== 'DOCUMENTO' && raw.tipo !== 'DIFERENCIA') throw new Error(`El campo ${field}.tipo no es válido.`);
  return { tipo: raw.tipo, referencia: readBoundedString(raw.referencia, `${field}.referencia`, 600), importeCentimos: readInteger(raw.importeCentimos, `${field}.importeCentimos`) };
}
function parseCollectionInvoice(value: unknown, field: string): EasyCollectionInvoice {
  const raw = objectAt(value, field);
  const nullableBounded = (input: unknown, inputField: string, maximum: number) => input === null ? null : readBoundedString(input, inputField, maximum);
  return {
    numFactura: nullableBounded(raw.numFactura, `${field}.numFactura`, 240),
    cliente: nullableBounded(raw.cliente, `${field}.cliente`, 240),
    importeCentimos: readInteger(raw.importeCentimos, `${field}.importeCentimos`),
    vencimiento: nullableBounded(raw.vencimiento, `${field}.vencimiento`, 40),
    facturaEmitidaId: nullableBounded(raw.facturaEmitidaId, `${field}.facturaEmitidaId`, 160),
    totalFacturaCentimos: raw.totalFacturaCentimos === null ? null : readInteger(raw.totalFacturaCentimos, `${field}.totalFacturaCentimos`),
    fechaFactura: nullableBounded(raw.fechaFactura, `${field}.fechaFactura`, 40),
  };
}
function parseCollectionProposal(value: unknown, field: string): EasyCollectionProposal {
  const raw = objectAt(value, field);
  if (raw.rol !== 'PRINCIPAL' && raw.rol !== 'PAR') throw new Error(`El campo ${field}.rol no es válido.`);
  if (raw.nivel !== 'EXACTA' && raw.nivel !== 'REVISAR') throw new Error(`El campo ${field}.nivel no es válido.`);
  const propuestaId = readBoundedString(raw.propuestaId, `${field}.propuestaId`, 64);
  if (!UUID.test(propuestaId)) throw new Error(`El campo ${field}.propuestaId no es válido.`);
  const fingerprint = readBoundedString(raw.fingerprint, `${field}.fingerprint`, 64);
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error(`El campo ${field}.fingerprint no es válido.`);
  const previewToken = raw.previewToken === null ? null : readBoundedString(raw.previewToken, `${field}.previewToken`, 16_000);
  if (raw.seleccionable !== true && raw.seleccionable !== false) throw new Error(`El campo ${field}.seleccionable no es válido.`);
  if (raw.seleccionable && !previewToken) throw new Error(`El campo ${field}.previewToken no es válido.`);
  const composicion = readArray(raw.composicion, `${field}.composicion`).map((item, index) => parseCollectionInvoice(item, `${field}.composicion[${index}]`));
  const composicionTotal = readNonNegativeInteger(raw.composicionTotal, `${field}.composicionTotal`);
  if (composicion.length > 60 || composicion.length > composicionTotal || composicionTotal > 10_000) throw new Error(`El campo ${field}.composicion no es válido.`);
  const par = raw.par === null ? null : (() => {
    const pair = objectAt(raw.par, `${field}.par`);
    return { fecha: readBoundedString(pair.fecha, `${field}.par.fecha`, 40), cuentaAlias: pair.cuentaAlias === null ? null : readBoundedString(pair.cuentaAlias, `${field}.par.cuentaAlias`, 240), concepto: readBoundedString(pair.concepto, `${field}.par.concepto`, 1_000), importeCentimos: readInteger(pair.importeCentimos, `${field}.par.importeCentimos`) };
  })();
  return {
    rol: raw.rol, propuestaId, movimientoId: readBoundedString(raw.movimientoId, `${field}.movimientoId`, 160), fingerprint, previewToken,
    metodo: readBoundedString(raw.metodo, `${field}.metodo`, 80), etiquetaMetodo: readBoundedString(raw.etiquetaMetodo, `${field}.etiquetaMetodo`, 240), nivel: raw.nivel,
    explicacion: readBoundedString(raw.explicacion, `${field}.explicacion`, 600), importeMovimientoCentimos: readInteger(raw.importeMovimientoCentimos, `${field}.importeMovimientoCentimos`),
    lineas: readArray(raw.lineas, `${field}.lineas`).map((item, index) => parseCollectionLine(item, `${field}.lineas[${index}]`)),
    composicion, composicionTotal, composicionImporteCentimos: readInteger(raw.composicionImporteCentimos, `${field}.composicionImporteCentimos`),
    clientesDistintos: readNonNegativeInteger(raw.clientesDistintos, `${field}.clientesDistintos`), diferenciaCentimos: readInteger(raw.diferenciaCentimos, `${field}.diferenciaCentimos`),
    par, seleccionable: raw.seleccionable, motivoNoSeleccionable: raw.motivoNoSeleccionable === null ? null : readBoundedString(raw.motivoNoSeleccionable, `${field}.motivoNoSeleccionable`, 600),
  };
}

function parseMovement(value: unknown, index: number): EasyMovement {
  const raw = objectAt(value, `movimientos[${index}]`);
  const account = objectAt(raw.cuenta, `movimientos[${index}].cuenta`);
  if (raw.estado !== 'SIN_DOCUMENTO') throw new Error(`El estado de movimientos[${index}] no pertenece a la cola Modo Fácil.`);
  const quienEs = raw.quienEs === undefined ? undefined : parseWhoIs(raw.quienEs, `movimientos[${index}].quienEs`);
  const propuestaCobro = raw.propuestaCobro === undefined ? undefined : raw.propuestaCobro === null ? null : parseCollectionProposal(raw.propuestaCobro, `movimientos[${index}].propuestaCobro`);
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
    quienEs,
    propuestaCobro,
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
  if (paso1.cohorte !== 'TODOS_MOVIMIENTOS_VENTANA') throw new Error('El resumen de quién es no es válido.');
  if (paso2.cohorte !== 'PENDIENTES_B4_SIN_DOCUMENTO' || paso2.criterio !== 'B4_DOCUMENTAL_INDEPENDIENTE_DE_PASO_1') throw new Error('El resumen de documentos no es válido.');
  const periodo = paso2.periodo === undefined ? undefined : (() => {
    const rawPeriodo = objectAt(paso2.periodo, 'pasos.paso2.periodo');
    return { documentoConfirmado: parsePaso2Estado(rawPeriodo.documentoConfirmado, 'pasos.paso2.periodo.documentoConfirmado'), noRequiere: parsePaso2Estado(rawPeriodo.noRequiere, 'pasos.paso2.periodo.noRequiere') };
  })();
  const meses = paso2.meses === undefined ? undefined : readArray(paso2.meses, 'pasos.paso2.meses').map((value, index): Paso2MesContador => {
    const rawMes = objectAt(value, `pasos.paso2.meses[${index}]`);
    const documentoConfirmado = rawMes.documentoConfirmado === undefined ? undefined : parsePaso2Estado(rawMes.documentoConfirmado, `pasos.paso2.meses[${index}].documentoConfirmado`);
    const noRequiere = rawMes.noRequiere === undefined ? undefined : parsePaso2Estado(rawMes.noRequiere, `pasos.paso2.meses[${index}].noRequiere`);
    if (!documentoConfirmado && !noRequiere) throw new Error(`El mes pasos.paso2.meses[${index}] no incluye un estado verificable.`);
    return { mes: readString(rawMes.mes, `pasos.paso2.meses[${index}].mes`), documentoConfirmado, noRequiere };
  });
  return {
    version: 'EASY_PASOS_V1',
    paso1: { cohorte: 'TODOS_MOVIMIENTOS_VENTANA', totalMovimientos: readNonNegativeInteger(paso1.totalMovimientos, 'pasos.paso1.totalMovimientos'), cargos: parsePasoSentido(paso1.cargos, 'pasos.paso1.cargos', true), cobros: parsePasoSentido(paso1.cobros, 'pasos.paso1.cobros', true), identificados: readNonNegativeInteger(paso1.identificados, 'pasos.paso1.identificados'), propuestosTexto: readNonNegativeInteger(paso1.propuestosTexto, 'pasos.paso1.propuestosTexto'), sinIdentificar: readNonNegativeInteger(paso1.sinIdentificar, 'pasos.paso1.sinIdentificar') },
    paso2: { cohorte: 'PENDIENTES_B4_SIN_DOCUMENTO', totalMovimientos: readNonNegativeInteger(paso2.totalMovimientos, 'pasos.paso2.totalMovimientos'), cargos: parsePasoSentido(paso2.cargos, 'pasos.paso2.cargos', false), cobros: parsePasoSentido(paso2.cobros, 'pasos.paso2.cobros', false), criterio: 'B4_DOCUMENTAL_INDEPENDIENTE_DE_PASO_1', periodo, meses },
  };
}

/** Rechaza respuestas parciales para no sustituir información desconocida por ceros. */
export function parseEasyReadResponse(value: unknown): EasyReadResponse {
  const raw = objectAt(value, 'respuesta');
  const stagingOnly = readBoolean(raw.stagingOnly, 'stagingOnly');
  if (raw.automaticas !== false) throw new Error('La respuesta no declara automaticas:false.');
  const period = objectAt(raw.periodo, 'periodo');
  const totals = objectAt(raw.totales, 'totales');
  const months = readArray(raw.meses, 'meses').map((month, index): EasyMonth => {
    const item = objectAt(month, `meses[${index}]`);
    if (!['VERDE', 'AMARILLO', 'ROJO', 'GRIS'].includes(String(item.semaforo))) throw new Error(`El semáforo de meses[${index}] no es válido.`);
    if (typeof item.coberturaVerificada !== 'boolean') throw new Error(`La cobertura de meses[${index}] no es válida.`);
    return { mes: readString(item.mes, `meses[${index}].mes`), pendientes: readInteger(item.pendientes, `meses[${index}].pendientes`), justificados: readInteger(item.justificados, `meses[${index}].justificados`), noRequiere: readInteger(item.noRequiere, `meses[${index}].noRequiere`), importeJustificadoCentimos: readCentsText(item.importeJustificadoCentimos, `meses[${index}].importeJustificadoCentimos`), importePendienteCentimos: readCentsText(item.importePendienteCentimos, `meses[${index}].importePendienteCentimos`), coberturaVerificada: item.coberturaVerificada, semaforo: item.semaforo as SemaforoEasy, mensaje: readString(item.mensaje, `meses[${index}].mensaje`) };
  });
  const rules = readArray(raw.reglas, 'reglas').map((rule, index): EasyRule => {
    const item = objectAt(rule, `reglas[${index}]`);
    if (item.activa !== true && item.activa !== false) throw new Error(`El estado de reglas[${index}] no es válido.`);
    if (item.modo !== 'SOLO_PROPONER') throw new Error(`La regla ${index} no es proposal-only.`);
    return { id: readString(item.id, `reglas[${index}].id`), version: readInteger(item.version, `reglas[${index}].version`), contraparte: readString(item.contraparte, `reglas[${index}].contraparte`), accion: readString(item.accion, `reglas[${index}].accion`), activa: item.activa, modo: 'SOLO_PROPONER', usosConfirmados: readInteger(item.usosConfirmados, `reglas[${index}].usosConfirmados`) };
  });
  return {
    stagingOnly, automaticas: false, criterio: readString(raw.criterio, 'criterio'),
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

/** Sólo forma el cuerpo de una propuesta ya firmada por el servidor para un único cobro. */
export function buildCollectionConfirmPayload(proposal: Pick<EasyCollectionProposal, 'propuestaId' | 'movimientoId' | 'fingerprint' | 'previewToken' | 'seleccionable'>, idempotencyKey: string): ConfirmarBloqueCobroPayload | null {
  if (!UUID_V4.test(idempotencyKey) || !proposal.seleccionable || !proposal.previewToken || proposal.previewToken.length > 16_000 || !UUID.test(proposal.propuestaId) || !proposal.movimientoId || !/^[a-f0-9]{64}$/.test(proposal.fingerprint)) return null;
  const item = Object.freeze({ propuestaId: proposal.propuestaId, movimientoId: proposal.movimientoId, fingerprint: proposal.fingerprint });
  return Object.freeze({ action: 'confirmar_bloque' as const, confirmacion: true as const, idempotencyKey: idempotencyKey.toLowerCase(), previewToken: proposal.previewToken, items: Object.freeze([item]) });
}
export function buildCollectionUndoPayload(bloqueId: string, idempotencyKey: string): DeshacerBloqueCobroPayload | null {
  if (!UUID_V4.test(idempotencyKey) || !UUID.test(bloqueId)) return null;
  return Object.freeze({ action: 'deshacer_bloque' as const, confirmacion: true as const, idempotencyKey: idempotencyKey.toLowerCase(), bloqueId: bloqueId.toLowerCase() });
}
