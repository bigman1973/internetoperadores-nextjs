// B7 candidato; SHA-256 base (root actual leído): 02a6491a7a291183f15d25034bdebdcb85d55278c6e4e421d39066f0339fcee1
export const VISTAS_B5 = [
  'CARGOS_SIN_DOCUMENTO',
  'COBROS_SIN_DOCUMENTO',
  'FACTURAS_RECIBIDAS_SIN_PAGO',
  'FACTURAS_EMITIDAS_SIN_COBRO',
] as const;
export type VistaB5 = (typeof VISTAS_B5)[number];
export type CoberturaB5 = 'CUBIERTA' | 'TODAS';
export type EstadoManualB5 = 'PENDIENTE' | 'PEDIDO' | 'RECIBIDO';
export type EstadoEfectivoB5 = EstadoManualB5 | 'VINCULADO' | 'NO_REQUIERE';
export type MotivoNoRequiereB4 =
  | 'COMISION_BANCARIA' | 'INTERES_BANCARIO' | 'REDONDEO_BANCARIO'
  | 'TRASPASO_INTERNO_SIN_DOCUMENTO' | 'MOVIMIENTO_TECNICO_BANCO' | 'CORRECCION_BANCARIA';

export type CuentaB5 = { id: string; banco: string; alias: string | null; fechaCorteExtracto: string | null };
export type ResponsableB5 = { id: number; nombre: string };
export type TarjetaB5 = { last4: string; titular: 'Víctor' | 'David' | 'Sin asignar' };
export type ConfiguracionB5 = { cuentas: CuentaB5[]; responsables: ResponsableB5[]; tarjetas: TarjetaB5[] };
export type CoberturaCuentasB5 = { cuentas: CuentaB5[]; sinCoberturaVerificableCount: number };

export type MovimientoPendienteB5 = {
  tipo: 'MOVIMIENTO'; id: string; grupoTercero: string; fechaOperacion: string | null;
  importeCentimos: number | null; concepto: string; referencia: string | null; infoAdicional: string | null;
  cuenta: CuentaB5; b4: { estado: 'SIN_DOCUMENTO' | 'JUSTIFICADO' | 'NO_REQUIERE'; version: number };
  gestion: { version: number; estadoManual: EstadoManualB5; estadoEfectivo: EstadoEfectivoB5; responsable: ResponsableB5 | null; nota: string | null };
  pistaB6: { clase: 'REFERENCIA_FACTURA_EXPLICITA' | 'SIN_REFERENCIA_EXPLICITA'; referenciaFactura: string | null; mensaje: string; propuesta: null | { modo: 'SOLO_PROPONER_B6'; importeCentimos: number; terceroExacto: string; fechaOperacionIso: string; referenciaFactura: string | null } };
  /** Extensión B5 prevista: sólo se filtra por esta metadata realmente devuelta, nunca por texto. */
  tarjeta?: { terminacion: string; titular: string };
};
export type EstadoCobroBancoB7 = 'COBRADA_CALCULADA' | 'PENDIENTE_COBRO' | 'PENDIENTE_COBRO_REVISION';
export type FuenteCobroBancoB7 = 'B4_DIRECTO' | 'B4_REMESA';
export type CoberturaBancoB7 = {
  status: 'KNOWN' | 'PARTIAL' | 'UNKNOWN'; asOf: string | null;
  activeAccountCount: number; accountsWithKnownCutoff: number;
};
export type FacturaPendienteB5 = {
  tipo: 'FACTURA_RECIBIDA' | 'FACTURA_EMITIDA'; id: string; documentoConciliableId: string | null;
  referencia: string | null; tercero: string; cliente?: string | null; cif: string | null; concepto: string | null;
  fecha: string | null; fechaVencimiento: string | null; importeObjetivoCentimos: number | null;
  importeAsignadoActivoCentimos: number | null; importePendienteCentimos: number | null;
  /** Metadata B7 opcional para no inventar estado alguno en fixtures B5 heredados. */
  documentoConciliableNoInferido?: boolean;
  importeNoVerificable?: boolean;
  estadoCobroBanco?: EstadoCobroBancoB7;
  estadoCobroBancoEtiqueta?: string;
  fuentesCobroBanco?: FuenteCobroBancoB7[];
  motivosRevisionBanco?: string[];
  /** Rectificativas documentales: bruto B4 y neto documental se mantienen separados. */
  creditNoteState?: 'PENDIENTE' | 'PARCIAL' | 'CERRADA' | 'REVISION';
  rectificationCents?: number | null;
  importePendienteTrasRectificativasCentimos?: number | null;
  creditNoteReviewReasons?: string[];
};
export type ItemPendienteB5 = MovimientoPendienteB5 | FacturaPendienteB5;
export type ItemsResponseB5 = {
  vista: VistaB5; cobertura: CoberturaB5; items: ItemPendienteB5[]; total: number; limit: number; offset: number;
  coberturaCuentas: CoberturaCuentasB5; criterioBanco: string;
  /** Raíz B7 opcional: si llega se valida; si no llega no se finge cobertura bancaria. */
  coberturaBanco?: CoberturaBancoB7; calculoBanco?: string; ambitoCuentaFacturas?: string;
};
export type ContadorB5 = {
  mes: string | null; cuenta: Pick<CuentaB5, 'id' | 'banco' | 'alias'>;
  importeJustificadoCentimos: string; importeEvaluableCentimos: string; porcentajeJustificadoBps: number | null;
  movimientosImporteNoExacto: number; parcial: boolean;
};
export type ContadoresResponseB5 = { contadores: ContadorB5[]; cobertura?: CoberturaB5; coberturaCuentas?: CoberturaCuentasB5 };
export type GestionPatchB5 = { movimientoId: string; version: number; responsableAdminId: number | null; estado: EstadoManualB5; nota: string | null };
export type ConfirmarNoRequiereB4 = {
  action: 'confirmar'; confirmacion: true; idempotencyKey: string; version: number;
  borrador: { movimientoId: string; importeMovimientoCentimos: number; estado: 'NO_REQUIERE'; motivoNoRequiere: MotivoNoRequiereB4; lineas: [] };
};
export type DocumentoFuturoB5 = {
  movimientoId: string; versionGestion: number; fechaDocumento: string; importeDocumento: string;
  concepto: string; proveedor: string; confirmacionDocumento: true; file: File; idempotencyKey: string;
};

const manual = ['PENDIENTE', 'PEDIDO', 'RECIBIDO'] as const;
const effective = [...manual, 'VINCULADO', 'NO_REQUIERE'] as const;
const motivos = ['COMISION_BANCARIA', 'INTERES_BANCARIO', 'REDONDEO_BANCARIO', 'TRASPASO_INTERNO_SIN_DOCUMENTO', 'MOVIMIENTO_TECNICO_BANCO', 'CORRECCION_BANCARIA'] as const;
const estadosCobroBancoB7 = ['COBRADA_CALCULADA', 'PENDIENTE_COBRO', 'PENDIENTE_COBRO_REVISION'] as const;
const fuentesCobroBancoB7 = ['B4_DIRECTO', 'B4_REMESA'] as const;
const coberturaBancoB7 = ['KNOWN', 'PARTIAL', 'UNKNOWN'] as const;
const estadosRectificativa = ['PENDIENTE', 'PARCIAL', 'CERRADA', 'REVISION'] as const;
// Runtime structures are narrowed at every nested boundary below. `any` here
// only lets TypeScript access a checked JSON record without weakening parser checks.
const isRecord = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const fail = (message: string): never => { throw new Error(`Respuesta B5 incompleta o inválida: ${message}`); };
const str = (value: unknown, field: string): string => typeof value === 'string' ? value : fail(field);
const nullableString = (value: unknown, field: string): string | null => {
  if (value === null) return null;
  return typeof value === 'string' ? value : fail(field);
};
const safeInt = (value: unknown, field: string): number => typeof value === 'number' && Number.isSafeInteger(value) ? value : fail(field);
/** Undefined is deliberately invalid: only explicit JSON null represents unknown money. */
const nullableSafeInt = (value: unknown, field: string): number | null => value === null ? null : safeInt(value, field);
const positive = (value: unknown, field: string): number => safeInt(value, field) > 0 ? safeInt(value, field) : fail(field);
const oneOf = <T extends readonly string[]>(value: unknown, values: T, field: string): T[number] => typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T[number] : fail(field);
export const esIsoDia = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
const isoOrNull = (value: unknown, field: string): string | null => { const output = nullableString(value, field); return output === null || esIsoDia(output) ? output : fail(field); };

/** Etiqueta exacta para UI: null es desconocido y 0 sigue siendo un importe conocido. */
export function formatCents(cents: number | null): string {
  if (cents === null || !Number.isSafeInteger(cents)) return 'Importe no verificable';
  const value = BigInt(cents);
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const euros = (absolute / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = (absolute % BigInt(100)).toString().padStart(2, '0');
  return `${negative ? '-' : '+'}${euros},${decimals} €`;
}

function cuenta(value: unknown, field: string): CuentaB5 {
  if (!isRecord(value)) fail(field);
  const raw = value as Record<string, unknown>;
  return { id: str(raw.id, `${field}.id`), banco: str(raw.banco, `${field}.banco`), alias: nullableString(raw.alias, `${field}.alias`), fechaCorteExtracto: isoOrNull(raw.fechaCorteExtracto, `${field}.fechaCorteExtracto`) };
}
function responsable(value: unknown, field: string): ResponsableB5 {
  if (!isRecord(value)) fail(field);
  const raw = value as Record<string, unknown>;
  return { id: positive(raw.id, `${field}.id`), nombre: str(raw.nombre, `${field}.nombre`) };
}
function cobertura(value: unknown, field: string): CoberturaCuentasB5 {
  if (!isRecord(value) || !Array.isArray(value.cuentas)) fail(field);
  const raw = value as Record<string, unknown>;
  const cuentas = raw.cuentas as unknown[];
  return { cuentas: cuentas.map((item: unknown, index: number) => cuenta(item, `${field}.cuentas[${index}]`)), sinCoberturaVerificableCount: safeInt(raw.sinCoberturaVerificableCount, `${field}.sinCoberturaVerificableCount`) };
}
function movimiento(value: Record<string, unknown>, field: string): MovimientoPendienteB5 {
  const raw = value as Record<string, any>;
  if (!isRecord(raw.cuenta) || !isRecord(raw.b4) || !isRecord(raw.gestion) || !isRecord(raw.pistaB6)) fail(field);
  const responsableValue = raw.gestion.responsable;
  const propuesta = raw.pistaB6.propuesta;
  const tarjetaValue = raw.tarjeta;
  if (propuesta !== null && !isRecord(propuesta)) fail(`${field}.pistaB6.propuesta`);
  if (tarjetaValue !== undefined && tarjetaValue !== null && (!isRecord(tarjetaValue) || !/^\d{4}$/.test(str(tarjetaValue.terminacion, `${field}.tarjeta.terminacion`)))) fail(`${field}.tarjeta`);
  return {
    tipo: 'MOVIMIENTO', id: str(raw.id, `${field}.id`), grupoTercero: str(raw.grupoTercero, `${field}.grupoTercero`), fechaOperacion: isoOrNull(raw.fechaOperacion, `${field}.fechaOperacion`), importeCentimos: raw.importeCentimos === null ? null : safeInt(raw.importeCentimos, `${field}.importeCentimos`), concepto: str(raw.concepto, `${field}.concepto`), referencia: nullableString(raw.referencia, `${field}.referencia`), infoAdicional: nullableString(raw.infoAdicional, `${field}.infoAdicional`), cuenta: cuenta(raw.cuenta, `${field}.cuenta`),
    b4: { estado: oneOf(raw.b4.estado, ['SIN_DOCUMENTO', 'JUSTIFICADO', 'NO_REQUIERE'] as const, `${field}.b4.estado`), version: positive(raw.b4.version, `${field}.b4.version`) },
    gestion: { version: positive(raw.gestion.version, `${field}.gestion.version`), estadoManual: oneOf(raw.gestion.estadoManual, manual, `${field}.gestion.estadoManual`), estadoEfectivo: oneOf(raw.gestion.estadoEfectivo, effective, `${field}.gestion.estadoEfectivo`), responsable: responsableValue === null ? null : responsable(responsableValue, `${field}.gestion.responsable`), nota: nullableString(raw.gestion.nota, `${field}.gestion.nota`) },
    pistaB6: { clase: oneOf(raw.pistaB6.clase, ['REFERENCIA_FACTURA_EXPLICITA', 'SIN_REFERENCIA_EXPLICITA'] as const, `${field}.pistaB6.clase`), referenciaFactura: nullableString(raw.pistaB6.referenciaFactura, `${field}.pistaB6.referenciaFactura`), mensaje: str(raw.pistaB6.mensaje, `${field}.pistaB6.mensaje`), propuesta: propuesta === null ? null : { modo: oneOf(propuesta.modo, ['SOLO_PROPONER_B6'] as const, `${field}.pistaB6.propuesta.modo`), importeCentimos: safeInt(propuesta.importeCentimos, `${field}.pistaB6.propuesta.importeCentimos`), terceroExacto: str(propuesta.terceroExacto, `${field}.pistaB6.propuesta.terceroExacto`), fechaOperacionIso: str(propuesta.fechaOperacionIso, `${field}.pistaB6.propuesta.fechaOperacionIso`), referenciaFactura: nullableString(propuesta.referenciaFactura, `${field}.pistaB6.propuesta.referenciaFactura`) } },
    ...(tarjetaValue === undefined || tarjetaValue === null ? {} : { tarjeta: { terminacion: str(tarjetaValue.terminacion, `${field}.tarjeta.terminacion`), titular: str(tarjetaValue.titular, `${field}.tarjeta.titular`) } }),
  };
}

function rectificativa(value: Record<string, unknown>, field: string): Pick<FacturaPendienteB5, 'creditNoteState' | 'rectificationCents' | 'importePendienteTrasRectificativasCentimos' | 'creditNoteReviewReasons'> {
  const fields = ['creditNoteState', 'rectificationCents', 'importePendienteTrasRectificativasCentimos', 'creditNoteReviewReasons'] as const;
  const present = fields.filter((name) => value[name] !== undefined);
  if (present.length === 0) return {};
  if (present.length !== fields.length) fail(`${field}.rectificativa incompleta`);
  if (!Array.isArray(value.creditNoteReviewReasons)) fail(`${field}.creditNoteReviewReasons`);
  return {
    creditNoteState: oneOf(value.creditNoteState, estadosRectificativa, `${field}.creditNoteState`),
    rectificationCents: nullableSafeInt(value.rectificationCents, `${field}.rectificationCents`),
    importePendienteTrasRectificativasCentimos: nullableSafeInt(value.importePendienteTrasRectificativasCentimos, `${field}.importePendienteTrasRectificativasCentimos`),
    creditNoteReviewReasons: (value.creditNoteReviewReasons as unknown[]).map((reason, index) => str(reason, `${field}.creditNoteReviewReasons[${index}]`)),
  };
}

function factura(value: Record<string, unknown>, field: string): FacturaPendienteB5 {
  const tipo = oneOf(value.tipo, ['FACTURA_RECIBIDA', 'FACTURA_EMITIDA'] as const, `${field}.tipo`);
  const client = value.cliente;
  const isB7 = tipo === 'FACTURA_EMITIDA' && (
    value.estadoCobroBanco !== undefined || value.estadoCobroBancoEtiqueta !== undefined
    || value.importeNoVerificable !== undefined || value.fuentesCobroBanco !== undefined || value.motivosRevisionBanco !== undefined
  );
  // FR remains the B5 contract: wrapper and every monetary field are actual integers.
  if (!isB7) {
    if (tipo === 'FACTURA_EMITIDA' && typeof client !== 'string') fail(`${field}.cliente`);
    return { tipo, id: str(value.id, `${field}.id`), documentoConciliableId: str(value.documentoConciliableId, `${field}.documentoConciliableId`), referencia: nullableString(value.referencia, `${field}.referencia`), tercero: str(value.tercero, `${field}.tercero`), ...(tipo === 'FACTURA_EMITIDA' ? { cliente: str(client, `${field}.cliente`) } : {}), cif: nullableString(value.cif, `${field}.cif`), concepto: nullableString(value.concepto, `${field}.concepto`), fecha: isoOrNull(value.fecha, `${field}.fecha`), fechaVencimiento: isoOrNull(value.fechaVencimiento, `${field}.fechaVencimiento`), importeObjetivoCentimos: safeInt(value.importeObjetivoCentimos, `${field}.importeObjetivoCentimos`), importeAsignadoActivoCentimos: safeInt(value.importeAsignadoActivoCentimos, `${field}.importeAsignadoActivoCentimos`), importePendienteCentimos: safeInt(value.importePendienteCentimos, `${field}.importePendienteCentimos`), ...rectificativa(value, field) };
  }
  if (value.importeNoVerificable === undefined || typeof value.importeNoVerificable !== 'boolean') fail(`${field}.importeNoVerificable`);
  const importeNoVerificable = value.importeNoVerificable as boolean;
  const estadoCobroBanco = oneOf(value.estadoCobroBanco, estadosCobroBancoB7, `${field}.estadoCobroBanco`);
  const fuentes = value.fuentesCobroBanco as unknown;
  const motivosRevision = value.motivosRevisionBanco as unknown;
  if (!Array.isArray(fuentes)) fail(`${field}.fuentesCobroBanco`);
  if (!Array.isArray(motivosRevision)) fail(`${field}.motivosRevisionBanco`);
  const fuentesCobroBanco = (fuentes as unknown[]).map((source, index) => oneOf(source, fuentesCobroBancoB7, `${field}.fuentesCobroBanco[${index}]`));
  if (new Set(fuentesCobroBanco).size !== fuentesCobroBanco.length) fail(`${field}.fuentesCobroBanco duplicadas`);
  const motivosRevisionBanco = (motivosRevision as unknown[]).map((reason, index) => {
    const parsed = str(reason, `${field}.motivosRevisionBanco[${index}]`);
    return parsed ? parsed : fail(`${field}.motivosRevisionBanco[${index}]`);
  });
  const importeObjetivoCentimos = nullableSafeInt(value.importeObjetivoCentimos, `${field}.importeObjetivoCentimos`);
  const importeAsignadoActivoCentimos = nullableSafeInt(value.importeAsignadoActivoCentimos, `${field}.importeAsignadoActivoCentimos`);
  const importePendienteCentimos = nullableSafeInt(value.importePendienteCentimos, `${field}.importePendienteCentimos`);
  const anyUnknown = importeObjetivoCentimos === null || importeAsignadoActivoCentimos === null || importePendienteCentimos === null;
  if (importeNoVerificable !== anyUnknown) fail(`${field}.importeNoVerificable no coincide con los importes B7`);
  return {
    tipo, id: str(value.id, `${field}.id`), documentoConciliableId: nullableString(value.documentoConciliableId, `${field}.documentoConciliableId`),
    referencia: nullableString(value.referencia, `${field}.referencia`), tercero: str(value.tercero, `${field}.tercero`), cliente: nullableString(client, `${field}.cliente`), cif: nullableString(value.cif, `${field}.cif`), concepto: nullableString(value.concepto, `${field}.concepto`),
    fecha: isoOrNull(value.fecha, `${field}.fecha`), fechaVencimiento: isoOrNull(value.fechaVencimiento, `${field}.fechaVencimiento`), importeObjetivoCentimos, importeAsignadoActivoCentimos, importePendienteCentimos,
    documentoConciliableNoInferido: value.documentoConciliableNoInferido === undefined ? undefined : (typeof value.documentoConciliableNoInferido === 'boolean' ? value.documentoConciliableNoInferido : fail(`${field}.documentoConciliableNoInferido`)),
    importeNoVerificable, estadoCobroBanco, estadoCobroBancoEtiqueta: str(value.estadoCobroBancoEtiqueta, `${field}.estadoCobroBancoEtiqueta`), fuentesCobroBanco, motivosRevisionBanco, ...rectificativa(value, field),
  };
}

function bancoB7(value: unknown, field: string): CoberturaBancoB7 {
  if (!isRecord(value)) fail(field);
  const raw = value as Record<string, unknown>;
  const activeAccountCount = safeInt(raw.activeAccountCount, `${field}.activeAccountCount`);
  const accountsWithKnownCutoff = safeInt(raw.accountsWithKnownCutoff, `${field}.accountsWithKnownCutoff`);
  if (activeAccountCount < 0 || accountsWithKnownCutoff < 0 || accountsWithKnownCutoff > activeAccountCount) fail(`${field}.cuentas`);
  return { status: oneOf(raw.status, coberturaBancoB7, `${field}.status`), asOf: isoOrNull(raw.asOf, `${field}.asOf`), activeAccountCount, accountsWithKnownCutoff };
}

export function leerItemsB5(value: unknown): ItemsResponseB5 {
  if (!isRecord(value) || !Array.isArray(value.items)) fail('envolvente de items');
  const raw = value as Record<string, unknown>;
  const vista = oneOf(raw.vista, VISTAS_B5, 'vista');
  const items = (raw.items as unknown[]).map((item: unknown, index: number) => { if (!isRecord(item)) fail(`items[${index}]`); const row = item as Record<string, unknown>; return row.tipo === 'MOVIMIENTO' ? movimiento(row, `items[${index}]`) : factura(row, `items[${index}]`); });
  return {
    vista, cobertura: oneOf(raw.cobertura, ['CUBIERTA', 'TODAS'] as const, 'cobertura'), items, total: safeInt(raw.total, 'total'), limit: positive(raw.limit, 'limit'), offset: safeInt(raw.offset, 'offset'), coberturaCuentas: cobertura(raw.coberturaCuentas, 'coberturaCuentas'), criterioBanco: str(raw.criterioBanco, 'criterioBanco'),
    ...(raw.coberturaBanco === undefined ? {} : { coberturaBanco: bancoB7(raw.coberturaBanco, 'coberturaBanco') }),
    ...(raw.calculoBanco === undefined ? {} : { calculoBanco: str(raw.calculoBanco, 'calculoBanco') }),
    ...(raw.ambitoCuentaFacturas === undefined ? {} : { ambitoCuentaFacturas: str(raw.ambitoCuentaFacturas, 'ambitoCuentaFacturas') }),
  };
}
export function leerConfiguracionB5(value: unknown): ConfiguracionB5 {
  if (!isRecord(value) || !Array.isArray(value.cuentas) || !Array.isArray(value.responsables) || !Array.isArray(value.tarjetas)) fail('configuración');
  const raw = value as Record<string, unknown>;
  return { cuentas: (raw.cuentas as unknown[]).map((item: unknown, index: number) => cuenta(item, `cuentas[${index}]`)), responsables: (raw.responsables as unknown[]).map((item: unknown, index: number) => responsable(item, `responsables[${index}]`)), tarjetas: (raw.tarjetas as unknown[]).map((item: unknown, index: number) => { if (!isRecord(item)) fail(`tarjetas[${index}]`); const card = item as Record<string, unknown>; return { last4: /^\d{4}$/.test(str(card.last4, `tarjetas[${index}].last4`)) ? str(card.last4, `tarjetas[${index}].last4`) : fail(`tarjetas[${index}].last4`), titular: oneOf(card.titular, ['Víctor', 'David', 'Sin asignar'] as const, `tarjetas[${index}].titular`) }; }) };
}
export function leerContadoresB5(value: unknown): ContadoresResponseB5 {
  if (!isRecord(value)) fail('envolvente de contadores');
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.contadores)) fail('contadores');
  const contadores = (source.contadores as unknown[]).map((item: unknown, index: number) => {
    if (!isRecord(item) || !isRecord(item.cuenta)) fail(`contadores[${index}]`);
    const row = item as Record<string, unknown>;
    const account = row.cuenta as Record<string, unknown>;
    const bps = row.porcentajeJustificadoBps;
    const evaluable = str(row.importeEvaluableCentimos, `contadores[${index}].importeEvaluableCentimos`);
    const justificado = str(row.importeJustificadoCentimos, `contadores[${index}].importeJustificadoCentimos`);
    if (!/^-?\d+$/.test(evaluable) || !/^-?\d+$/.test(justificado)) fail(`contadores[${index}].importes`);
    return { mes: isoOrNull(row.mes, `contadores[${index}].mes`), cuenta: { id: str(account.id, `contadores[${index}].cuenta.id`), banco: str(account.banco, `contadores[${index}].cuenta.banco`), alias: nullableString(account.alias, `contadores[${index}].cuenta.alias`) }, importeJustificadoCentimos: justificado, importeEvaluableCentimos: evaluable, porcentajeJustificadoBps: bps === null ? null : (safeInt(bps, `contadores[${index}].porcentajeJustificadoBps`) >= 0 && safeInt(bps, `contadores[${index}].porcentajeJustificadoBps`) <= 10000 ? safeInt(bps, `contadores[${index}].porcentajeJustificadoBps`) : fail(`contadores[${index}].porcentajeJustificadoBps`)), movimientosImporteNoExacto: safeInt(row.movimientosImporteNoExacto, `contadores[${index}].movimientosImporteNoExacto`), parcial: typeof row.parcial === 'boolean' ? row.parcial : fail(`contadores[${index}].parcial`) };
  });
  return { contadores, ...(source.cobertura === undefined ? {} : { cobertura: oneOf(source.cobertura, ['CUBIERTA', 'TODAS'] as const, 'contadores.cobertura') }), ...(source.coberturaCuentas === undefined ? {} : { coberturaCuentas: cobertura(source.coberturaCuentas, 'contadores.coberturaCuentas') }) };
}
export const esMotivoNoRequiere = (value: string): value is MotivoNoRequiereB4 => (motivos as readonly string[]).includes(value);
