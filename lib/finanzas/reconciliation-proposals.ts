/**
 * B6 — motor de propuestas de conciliación.
 *
 * Archivo externo de preparación: es deliberadamente puro. No importa Prisma,
 * variables de entorno, red, ficheros ni el repositorio. No ejecuta DML y no
 * llama a la confirmación B4. Sus salidas son borradores que B4 debe volver a
 * validar con instantáneas bloqueadas al confirmar.
 *
 * Compatibilidad B4: enteros firmados de céntimos, objetivo no nulo/no cero,
 * capacidad en el intervalo firmado [0, objetivo], sin abs() ni tolerancias.
 * Se replica sólo el guard DTO porque esta preparación vive fuera del repo;
 * al integrar, reconciliation-core.ts continúa siendo la autoridad de cierre.
 */

export const B4_ENTERO_MIN = -2_147_483_648;
export const B4_ENTERO_MAX = 2_147_483_647;

export type Cents = number & { readonly __b6Cents: unique symbol };
export type TipoDocumentoB4 =
  | 'FACTURA_RECIBIDA'
  | 'FACTURA_EMITIDA'
  | 'REMESA'
  | 'NOMINA'
  | 'IMPUESTO_TGSS'
  | 'PRESTAMO'
  | 'TICKET'
  | 'TRASPASO';
export type OrigenFactura = 'FI' | 'FR';
export type MotivoDiferenciaB4 = 'COMISION' | 'INTERESES' | 'IVA_COMISION' | 'REDONDEO';
export type EstadoPropuesta =
  | 'LISTA_PARA_CONFIRMACION_B4'
  | 'NECESITA_EVIDENCIA_MANUAL'
  | 'SIN_PROPUESTA'
  | 'PROPUESTA_TRASPASO_PAREADO';

export interface MovimientoB6 {
  /** Identificador opaco de movimientos_bancarios.id. */
  id: string;
  /** Fecha bancaria ISO civil YYYY-MM-DD. */
  fecha: string;
  concepto: string;
  /** Ordenante/destinatario extraído del extracto; no se inventa. */
  tercero: string | null;
  cuentaId: string;
  /** Céntimos firmados, no decimal, no cero. */
  importeCentimos: number;
  /** Sólo una referencia bancaria literal ya extraída por el adaptador de lectura. */
  referenciaBanco?: string | null;
  /** Campo literal del extracto; B6 no lo sintetiza ni lo normaliza como tercero. */
  infoAdicional?: string | null;
  /** Prueba de origen del adaptador; no se deduce desde el texto. */
  confirmingDraxton?: boolean;
}

export interface MetaFacturaB6 {
  source: OrigenFactura;
  numero: string | null;
  tercero: string | null;
  fecha: string | null;
}

export interface MetaRemesaB6 {
  remesaId: number;
  ispGestionId: number;
  /** Identificador extranjero/SEPA conservado literalmente; null significa que no hay prueba. */
  foreignId: string | null;
}

/**
 * Proyección de lectura de DocumentoConciliable B4. `asignadoCentimos` es el
 * neto de líneas activas, nunca un campo legado de "importe cobrado".
 */
export interface DocumentoConciliableB6 {
  documentoConciliableId: string;
  tipoDocumento: TipoDocumentoB4;
  stale: boolean;
  objetivoCentimos: number | null;
  asignadoCentimos: number;
  factura?: MetaFacturaB6 | null;
  remesa?: MetaRemesaB6 | null;
}

/** Una diferencia sólo existe si una fuente explícita la ha aportado. */
export interface DiferenciaConocidaB6 {
  movimientoId: string;
  evidenciaId: string;
  motivo: MotivoDiferenciaB4;
  importeCentimos: number;
}

/**
 * Evidencia explícita de que un abono SEPA del banco corresponde a una remesa
 * ISP. Ningún estado de ISP Gestión, proximidad temporal ni importe aislado es
 * una evidencia de este tipo.
 */
export interface AbonoSepaRemesaB6 {
  movimientoId: string;
  remesaIspGestionId: number;
  remesaForeignId: string;
  /** Literal foreign ID read from the bank source, not copied from Remesa. */
  foreignIdBanco: string;
  referenciaBanco: string;
  fechaBanco: string;
  importeCentimos: number;
  evidenciaId: string;
}

/** Una devolución reduce la contribución ya aplicada a una REMESA. */
export interface DevolucionRemesaB6 {
  movimientoId: string;
  remesaIspGestionId: number;
  remesaForeignId: string;
  /** Literal foreign ID read from the bank source, not copied from Remesa. */
  foreignIdBanco: string;
  referenciaBanco: string;
  fechaBanco: string;
  importeCentimos: number;
  evidenciaId: string;
}

/** Pareja expresamente aportada tras revisión B3; el motor no la descubre. */
export interface ParejaTraspasoPropioB6 {
  movimientoId: string;
  movimientoParejaId: string;
  cuentaOrigenPropiaId: string;
  cuentaDestinoPropiaId: string;
  fecha: string;
  importeParejaCentimos: number;
  evidenciaId: string;
}

export interface EntradaPropuestaB6 {
  movimiento: MovimientoB6;
  documentos: readonly DocumentoConciliableB6[];
  /** Si cualquier consulta candidata alcanzó su tope, no se puede probar unicidad. */
  lecturasCandidatasTruncadas?: readonly string[];
  /** Una etiqueta fuente de remesa obliga a prueba literal, no una ruta por factura. */
  evidenciaRemesaObligatoria?: 'ABONO_SEPA' | 'DEVOLUCION_REMESA';
  diferenciasConocidas?: readonly DiferenciaConocidaB6[];
  abonosSepa?: readonly AbonoSepaRemesaB6[];
  devoluciones?: readonly DevolucionRemesaB6[];
  parejasTraspaso?: readonly ParejaTraspasoPropioB6[];
}

export interface LineaDocumentoPropuestaB6 {
  tipo: 'DOCUMENTO';
  documentoConciliableId: string;
  importeCentimos: Cents;
}

export interface LineaDiferenciaPropuestaB6 {
  tipo: 'DIFERENCIA';
  motivoDiferencia: MotivoDiferenciaB4;
  importeCentimos: Cents;
  evidenciaId: string;
}

export type LineaPropuestaB6 = LineaDocumentoPropuestaB6 | LineaDiferenciaPropuestaB6;

interface BaseResultadoB6 {
  motor: 'B6_PROPONE_ONLY';
  movimientoId: string;
  fecha: string;
  cuentaId: string;
  importeMovimientoCentimos: Cents;
  tercero: string | null;
  /** B6 jamás confirma ni marca cobros/pagos/facturas. */
  requiereConfirmacionHumana: true;
  noEscrituras: true;
  razones: readonly string[];
}

export interface PropuestaB4Lista extends BaseResultadoB6 {
  estado: 'LISTA_PARA_CONFIRMACION_B4';
  clase: 'FACTURA_EXACTA' | 'GRUPO_FACTURAS_EXACTO' | 'CONFIRMING_DRAXTON' | 'ABONO_SEPA_REMESA' | 'DEVOLUCION_REMESA';
  /** La coincidencia de mismo día no equivale a una referencia literal. */
  confianza: 'LITERAL_REFERENCE' | 'SAME_DAY_EXACT' | 'ALTA_REGLA_EXACTA';
  lineas: readonly LineaPropuestaB6[];
  totalLineasCentimos: Cents;
  diferenciaPendienteCentimos: null;
  /** Siempre vacío: B6 no cambia la situación de Factura/FacturaEmitida. */
  facturasAMarcarCobradas: readonly [];
}

export interface PropuestaManual extends BaseResultadoB6 {
  estado: 'NECESITA_EVIDENCIA_MANUAL' | 'SIN_PROPUESTA';
  clase:
    | 'FACTURA_REFERENCIA_FALTA_O_AMBIGUA'
    | 'FACTURA_REGLA_FUERTE_NO_CUMPLE'
    | 'GRUPO_NO_CIERRA'
    | 'CONFIRMING_DIFERENCIA_SIN_EVIDENCIA'
    | 'ABONO_SEPA_SIN_EVIDENCIA_EXPLICITA'
    | 'DEVOLUCION_SIN_EVIDENCIA_O_CAPACIDAD'
    | 'TRASPASO_SIN_PAREJA_EXPLICITA'
    | 'CANDIDATOS_TRUNCADOS'
    | 'ENTRADA_INVALIDA';
  confianza: 'NINGUNA';
  lineas: readonly [];
  totalLineasCentimos: null;
  /** Es un residuo firmado mostrado, nunca una línea de ajuste inventada. */
  diferenciaPendienteCentimos: Cents | null;
  facturasAMarcarCobradas: readonly [];
}

export interface PropuestaTraspasoPareado extends BaseResultadoB6 {
  estado: 'PROPUESTA_TRASPASO_PAREADO';
  clase: 'TRASPASO_INTERNO_PENDIENTE_CONFIRMACION';
  confianza: 'ALTA_REGLA_EXACTA';
  movimientoParejaId: string;
  cuentaOrigenPropiaId: string;
  cuentaDestinoPropiaId: string;
  evidenciaId: string;
  /** B3 conserva la autoridad de catálogo y la revisión de categoría/tipo. */
  requiereRevisionCatalogoB3: true;
  /** Nunca es NO_REQUIERE automático. */
  noRequiereAutomatico: false;
  lineas: readonly [];
  totalLineasCentimos: null;
  diferenciaPendienteCentimos: null;
  facturasAMarcarCobradas: readonly [];
}

export type ResultadoPropuestaB6 = PropuestaB4Lista | PropuestaManual | PropuestaTraspasoPareado;

/** DTO plano para Bandeja B5: sólo strings, numbers, booleans o null; no Date/Decimal/Prisma. */
export interface PropuestaPendienteB5DTO {
  movimientoId: string;
  fecha: string;
  cuentaId: string;
  concepto: string;
  tercero: string | null;
  importeCentimos: number;
  estado: EstadoPropuesta;
  clase: string;
  confianza: string;
  puedeConfirmarB4: boolean;
  requiereEvidenciaManual: boolean;
  requiereRevisionCatalogoB3: boolean;
  documentoConciliableIdsCsv: string;
  referenciasEvidenciaCsv: string;
  totalLineasCentimos: number | null;
  diferenciaPendienteCentimos: number | null;
  razonesCsv: string;
}

export type ResultadoValidacion<T> =
  | { ok: true; value: T }
  | { ok: false; errores: readonly string[] };

const MOTIVOS_DIFERENCIA: readonly MotivoDiferenciaB4[] = ['COMISION', 'INTERESES', 'IVA_COMISION', 'REDONDEO'];
const TIPOS_FACTURA: readonly TipoDocumentoB4[] = ['FACTURA_EMITIDA', 'FACTURA_RECIBIDA'];
/** Patrón heredado estable (p. ej. Drax/CLL), sólo como pista literal. */
const REF_FACTURA_LEGACY = /\b([A-Za-z]{2,12}\d{2}\/\d{1,12})\b/g;
/** Un número aislado sólo puede ser referencia si tiene al menos seis dígitos. */
const REF_FACTURA_NUMERICA = /(?<![\p{L}\p{N}])(\d{6,})(?![\p{L}\p{N}])/gu;

function esObjeto(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function textoNoVacio(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function fechaIsoCivil(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Equivalente de guard de céntimos B4 para entradas de este DTO externo. */
export function validarCentsB6(value: unknown, permitirCero = false): ResultadoValidacion<Cents> {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isSafeInteger(value)) {
    return { ok: false, errores: ['CENTIMOS_NO_ENTERO_SEGURO'] };
  }
  if (value < B4_ENTERO_MIN || value > B4_ENTERO_MAX) {
    return { ok: false, errores: ['CENTIMOS_FUERA_RANGO_B4'] };
  }
  if (!permitirCero && value === 0) return { ok: false, errores: ['CENTIMOS_CERO_NO_ADMITIDO'] };
  return { ok: true, value: value as Cents };
}

function sumaExacta(values: readonly number[]): ResultadoValidacion<Cents> {
  let total = 0;
  for (const value of values) {
    const cents = validarCentsB6(value, false);
    if (!cents.ok) return cents;
    total += cents.value;
    if (!Number.isSafeInteger(total) || total < B4_ENTERO_MIN || total > B4_ENTERO_MAX) {
      return { ok: false, errores: ['SUMA_FUERA_RANGO_B4'] };
    }
  }
  return validarCentsB6(total, false);
}

function restaExacta(left: number, right: number, permitirCero = true): ResultadoValidacion<Cents> {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    return { ok: false, errores: ['RESTA_NO_SEGURA'] };
  }
  return validarCentsB6(left - right, permitirCero);
}

/** Sólo pliegues Unicode, acentos y espacios; no borra palabras, CIF ni razón social. */
export function normalizarTerceroExacto(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFKC')
    .replace(/[\s\u00A0]+/g, ' ')
    .trim()
    .toLocaleUpperCase('es-ES');
}

/** En referencias no se quitan signos ni espacios internos: sólo NFKC/caso literal. */
export function normalizarReferenciaLiteral(value: string): string {
  return value.normalize('NFKC').trim().toLocaleUpperCase('es-ES');
}

export function extraerReferenciasFacturaLiterales(concepto: string): readonly string[] {
  const refs = new Set<string>();
  for (const match of concepto.matchAll(REF_FACTURA_LEGACY)) {
    refs.add(normalizarReferenciaLiteral(match[1]));
  }
  for (const match of concepto.matchAll(REF_FACTURA_NUMERICA)) {
    refs.add(normalizarReferenciaLiteral(match[1]));
  }
  return [...refs];
}

interface ReferenciaFacturaB6 {
  clave: string;
  soloDigitos: boolean;
}

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function esNumeroFacturaSoloDigitos(numero: string): boolean {
  return /^\d+$/.test(numero);
}

/**
 * Los formatos alfanuméricos o con separadores los aporta el propio documento.
 * Los números puros cortos pueden ser teléfono, NIF u otro texto bancario.
 */
function numeroFacturaPuedeSerReferencia(numero: string | null): numero is string {
  if (!textoNoVacio(numero)) return false;
  const literal = normalizarReferenciaLiteral(numero);
  return !esNumeroFacturaSoloDigitos(literal) || literal.length >= 6;
}

/** No se quitan signos ni espacios internos: el número ha de aparecer literalmente. */
function conceptoContieneNumeroFacturaLiteral(concepto: string, numero: string): boolean {
  const literal = normalizarReferenciaLiteral(numero);
  const conceptoNormalizado = normalizarReferenciaLiteral(concepto);
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExpLiteral(literal)}(?=$|[^\\p{L}\\p{N}])`,
    'u',
  );
  return pattern.test(conceptoNormalizado);
}

/**
 * Los IDs con formatos distintos de Drax/CLL se aceptan sólo si son el número
 * literal de una factura ya leída; no se impone el formato heredado a todos.
 */
function referenciasFacturaEnConcepto(
  textoBancario: string,
  documentos: readonly DocumentoConciliableB6[],
): readonly ReferenciaFacturaB6[] {
  const refs = new Map<string, ReferenciaFacturaB6>();
  for (const clave of extraerReferenciasFacturaLiterales(textoBancario)) {
    refs.set(clave, { clave, soloDigitos: esNumeroFacturaSoloDigitos(clave) });
  }
  for (const doc of documentos) {
    const numero = doc.factura?.numero ?? null;
    if (!numeroFacturaPuedeSerReferencia(numero) || !conceptoContieneNumeroFacturaLiteral(textoBancario, numero)) continue;
    const clave = normalizarReferenciaLiteral(numero);
    refs.set(clave, { clave, soloDigitos: esNumeroFacturaSoloDigitos(clave) });
  }
  return [...refs.values()];
}

/** Busca referencias sólo en valores fuente, sin convertirlos en identidad de tercero. */
function textoBancarioFactura(movimiento: MovimientoB6): string {
  return [movimiento.concepto, movimiento.referenciaBanco ?? '', movimiento.infoAdicional ?? ''].join('\n');
}

function contienePistaTraspas(concepto: string): boolean {
  return /\bTRAS+P(?:AS|ASS|ASO)?\w*/iu.test(concepto);
}

function fuenteFacturaCompatible(doc: DocumentoConciliableB6): boolean {
  if (!TIPOS_FACTURA.includes(doc.tipoDocumento) || !doc.factura) return false;
  return (doc.factura.source === 'FI' && doc.tipoDocumento === 'FACTURA_EMITIDA')
    || (doc.factura.source === 'FR' && doc.tipoDocumento === 'FACTURA_RECIBIDA');
}

function capacidadEsCoherente(doc: DocumentoConciliableB6): boolean {
  const objetivo = validarCentsB6(doc.objetivoCentimos, false);
  const asignado = validarCentsB6(doc.asignadoCentimos, true);
  if (!objetivo.ok || !asignado.ok) return false;
  const lower = objetivo.value < 0 ? objetivo.value : 0;
  const upper = objetivo.value < 0 ? 0 : objetivo.value;
  return asignado.value >= lower && asignado.value <= upper;
}

function puedeAportar(doc: DocumentoConciliableB6, importe: number): boolean {
  const objetivo = validarCentsB6(doc.objetivoCentimos, false);
  const asignado = validarCentsB6(doc.asignadoCentimos, true);
  const line = validarCentsB6(importe, false);
  if (!objetivo.ok || !asignado.ok || !line.ok || !capacidadEsCoherente(doc)) return false;
  const resultante = asignado.value + line.value;
  if (!Number.isSafeInteger(resultante)) return false;
  const lower = objetivo.value < 0 ? objetivo.value : 0;
  const upper = objetivo.value < 0 ? 0 : objetivo.value;
  return resultante >= lower && resultante <= upper;
}

/** Capacidad normal aún no consumida; no se usa para una devolución explícita. */
function pendienteNormal(doc: DocumentoConciliableB6): Cents | null {
  const objetivo = validarCentsB6(doc.objetivoCentimos, false);
  const asignado = validarCentsB6(doc.asignadoCentimos, true);
  if (!objetivo.ok || !asignado.ok || !capacidadEsCoherente(doc)) return null;
  const pending = restaExacta(objetivo.value, asignado.value, false);
  return pending.ok ? pending.value : null;
}

function documentoElegibleBase(doc: DocumentoConciliableB6): boolean {
  return textoNoVacio(doc.documentoConciliableId)
    && doc.stale === false
    && validarCentsB6(doc.objetivoCentimos, false).ok
    && validarCentsB6(doc.asignadoCentimos, true).ok
    && capacidadEsCoherente(doc);
}

function documentoConReferenciaLiteral(doc: DocumentoConciliableB6, referencia: ReferenciaFacturaB6): boolean {
  if (!documentoElegibleBase(doc) || !fuenteFacturaCompatible(doc) || !doc.factura) return false;
  if (!numeroFacturaPuedeSerReferencia(doc.factura.numero)) return false;
  return normalizarReferenciaLiteral(doc.factura.numero) === referencia.clave;
}

function terceroFacturaCoincide(movimiento: MovimientoB6, doc: DocumentoConciliableB6): boolean {
  return !!doc.factura
    && textoNoVacio(movimiento.tercero)
    && textoNoVacio(doc.factura.tercero)
    && normalizarTerceroExacto(movimiento.tercero) === normalizarTerceroExacto(doc.factura.tercero);
}

function razonesFacturaReferencia(): readonly string[] {
  return [
    'IMPORTE_FIRMADO_EXACTO',
    'TERCERO_NORMALIZADO_EXACTO_SIN_FUZZY',
    'FECHA_FACTURA_NO_POSTERIOR_A_FECHA_BANCO',
    'REFERENCIA_FACTURA_LITERAL_UNIVOCA',
    'CAPACIDAD_B4_FIRMADA_VERIFICADA',
  ];
}

function razonesFacturaMismoDia(): readonly string[] {
  return [
    'IMPORTE_PENDIENTE_FIRMADO_EXACTO',
    'TERCERO_NORMALIZADO_EXACTO_SIN_FUZZY',
    'FECHA_FACTURA_IGUAL_A_FECHA_BANCO',
    'SIN_REFERENCIA_LITERAL_FACTURA',
    'CAPACIDAD_B4_FIRMADA_VERIFICADA',
  ];
}

function base(movimiento: MovimientoB6, razones: readonly string[]): BaseResultadoB6 {
  return {
    motor: 'B6_PROPONE_ONLY',
    movimientoId: movimiento.id,
    fecha: movimiento.fecha,
    cuentaId: movimiento.cuentaId,
    importeMovimientoCentimos: movimiento.importeCentimos as Cents,
    tercero: movimiento.tercero,
    requiereConfirmacionHumana: true,
    noEscrituras: true,
    razones,
  };
}

function manual(
  movimiento: MovimientoB6,
  clase: PropuestaManual['clase'],
  razones: readonly string[],
  diferenciaPendienteCentimos: Cents | null = null,
  estado: PropuestaManual['estado'] = 'NECESITA_EVIDENCIA_MANUAL',
): PropuestaManual {
  return {
    ...base(movimiento, razones),
    estado,
    clase,
    confianza: 'NINGUNA',
    lineas: [],
    totalLineasCentimos: null,
    diferenciaPendienteCentimos,
    facturasAMarcarCobradas: [],
  };
}

function lista(
  movimiento: MovimientoB6,
  clase: PropuestaB4Lista['clase'],
  lineas: readonly LineaPropuestaB6[],
  razones: readonly string[],
  confianza: PropuestaB4Lista['confianza'] = 'ALTA_REGLA_EXACTA',
): PropuestaB4Lista {
  const total = sumaExacta(lineas.map(linea => linea.importeCentimos));
  if (!total.ok || total.value !== movimiento.importeCentimos) {
    return manual(movimiento, 'ENTRADA_INVALIDA', ['CIERRE_INTERNO_NO_EXACTO']) as never;
  }
  return {
    ...base(movimiento, razones),
    estado: 'LISTA_PARA_CONFIRMACION_B4',
    clase,
    confianza,
    lineas,
    totalLineasCentimos: total.value,
    diferenciaPendienteCentimos: null,
    facturasAMarcarCobradas: [],
  };
}

function validarMovimiento(movimiento: MovimientoB6): readonly string[] {
  const errors: string[] = [];
  if (!textoNoVacio(movimiento.id)) errors.push('MOVIMIENTO_ID_INVALIDO');
  if (!fechaIsoCivil(movimiento.fecha)) errors.push('FECHA_MOVIMIENTO_INVALIDA');
  if (typeof movimiento.concepto !== 'string') errors.push('CONCEPTO_INVALIDO');
  if (!textoNoVacio(movimiento.cuentaId)) errors.push('CUENTA_INVALIDA');
  if (movimiento.tercero !== null && !textoNoVacio(movimiento.tercero)) errors.push('TERCERO_INVALIDO');
  if (movimiento.referenciaBanco !== undefined && movimiento.referenciaBanco !== null && typeof movimiento.referenciaBanco !== 'string') errors.push('REFERENCIA_BANCO_INVALIDA');
  if (movimiento.infoAdicional !== undefined && movimiento.infoAdicional !== null && typeof movimiento.infoAdicional !== 'string') errors.push('INFO_ADICIONAL_INVALIDA');
  const cents = validarCentsB6(movimiento.importeCentimos, false);
  if ('errores' in cents) errors.push(...cents.errores);
  return errors;
}

function diferenciasValidas(entrada: EntradaPropuestaB6): readonly DiferenciaConocidaB6[] {
  return (entrada.diferenciasConocidas ?? []).filter(diferencia =>
    diferencia.movimientoId === entrada.movimiento.id
    && textoNoVacio(diferencia.evidenciaId)
    && MOTIVOS_DIFERENCIA.includes(diferencia.motivo)
    && validarCentsB6(diferencia.importeCentimos, false).ok,
  );
}

function lineasDiferencia(diferencias: readonly DiferenciaConocidaB6[]): readonly LineaDiferenciaPropuestaB6[] {
  return diferencias.map(diferencia => ({
    tipo: 'DIFERENCIA',
    motivoDiferencia: diferencia.motivo,
    importeCentimos: diferencia.importeCentimos as Cents,
    evidenciaId: diferencia.evidenciaId,
  }));
}

/** Sin referencia sólo existe una candidata si las tres pruebas leídas son exactas. */
function proponerFacturaMismoDiaSinReferencia(entrada: EntradaPropuestaB6): ResultadoPropuestaB6 {
  const { movimiento } = entrada;
  if (!textoNoVacio(movimiento.tercero)) {
    return manual(movimiento, 'FACTURA_REGLA_FUERTE_NO_CUMPLE', ['FALTA_TERCERO_BANCARIO_EXPLICITO']);
  }
  const candidatos = entrada.documentos.filter(doc => documentoElegibleBase(doc)
    && fuenteFacturaCompatible(doc)
    && !!doc.factura
    && fechaIsoCivil(doc.factura.fecha)
    && doc.factura.fecha === movimiento.fecha
    && terceroFacturaCoincide(movimiento, doc)
    && pendienteNormal(doc) === movimiento.importeCentimos);
  if (candidatos.length !== 1) {
    return manual(movimiento, 'FACTURA_REFERENCIA_FALTA_O_AMBIGUA', [
      candidatos.length > 1
        ? 'VARIOS_CANDIDATOS_MISMO_DIA_EXACTOS_NO_SE_ELIGE_EL_PRIMERO'
        : 'SIN_CANDIDATO_MISMO_DIA_CON_IMPORTE_TERCERO_Y_FECHA_EXACTOS',
      'SIN_REFERENCIA_NO_SE_PROPONE_POR_IMPORTE_SOLO',
    ]);
  }
  const doc = candidatos[0];
  return lista(movimiento, 'FACTURA_EXACTA', [{
    tipo: 'DOCUMENTO',
    documentoConciliableId: doc.documentoConciliableId,
    importeCentimos: movimiento.importeCentimos as Cents,
  }], razonesFacturaMismoDia(), 'SAME_DAY_EXACT');
}

function proponerFacturas(entrada: EntradaPropuestaB6): ResultadoPropuestaB6 {
  const { movimiento } = entrada;
  const referencias = referenciasFacturaEnConcepto(textoBancarioFactura(movimiento), entrada.documentos);
  if (referencias.length === 0) return proponerFacturaMismoDiaSinReferencia(entrada);
  if (!textoNoVacio(movimiento.tercero)) {
    return manual(movimiento, 'FACTURA_REGLA_FUERTE_NO_CUMPLE', ['FALTA_TERCERO_BANCARIO_EXPLICITO']);
  }

  const encontrados: DocumentoConciliableB6[] = [];
  for (const referencia of referencias) {
    const candidatos = entrada.documentos.filter(doc => documentoConReferenciaLiteral(doc, referencia));
    if (candidatos.length !== 1) {
      return manual(movimiento, 'FACTURA_REFERENCIA_FALTA_O_AMBIGUA', [
        candidatos.length > 1
          ? 'REFERENCIA_LITERAL_AMBIGUA_ENTRE_VARIOS_DOCUMENTOS_ACTIVOS'
          : 'REFERENCIA_LITERAL_SIN_DOCUMENTO_ACTIVO_UNIVOCO',
        'NO_SE_DESEMPATA_POR_IMPORTE_NI_SIMILITUD',
      ]);
    }
    const doc = candidatos[0];
    if (!terceroFacturaCoincide(movimiento, doc)) {
      return manual(movimiento, 'FACTURA_REGLA_FUERTE_NO_CUMPLE', ['TERCERO_BANCARIO_Y_FACTURA_NO_COINCIDEN_EXACTAMENTE']);
    }
    if (!fechaIsoCivil(doc.factura!.fecha)) {
      return manual(movimiento, 'FACTURA_REGLA_FUERTE_NO_CUMPLE', ['FECHA_FACTURA_INVALIDA']);
    }
    if (doc.factura!.fecha > movimiento.fecha) {
      return manual(movimiento, 'FACTURA_REGLA_FUERTE_NO_CUMPLE', [
        'FACTURA_POSTERIOR_AL_MOVIMIENTO_REQUIERE_VERIFICACION_DOCUMENTAL_MANUAL',
      ]);
    }
    const pendiente = pendienteNormal(doc);
    if (pendiente === null) {
      return manual(movimiento, 'FACTURA_REGLA_FUERTE_NO_CUMPLE', ['CAPACIDAD_B4_NO_VERIFICABLE']);
    }
    if (referencia.soloDigitos && (doc.factura!.fecha !== movimiento.fecha || pendiente !== movimiento.importeCentimos)) {
      return manual(movimiento, 'FACTURA_REGLA_FUERTE_NO_CUMPLE', [
        'REFERENCIA_NUMERICA_REQUIERE_IMPORTE_TERCERO_Y_FECHA_MISMO_DIA_EXACTOS',
      ]);
    }
    encontrados.push(doc);
  }

  const pendientes = encontrados.map(pendienteNormal);
  if (pendientes.some((value): value is null => value === null)) {
    return manual(movimiento, 'FACTURA_REGLA_FUERTE_NO_CUMPLE', ['CAPACIDAD_B4_NO_VERIFICABLE']);
  }
  const totalFacturas = sumaExacta(pendientes as Cents[]);
  if ('errores' in totalFacturas) return manual(movimiento, 'ENTRADA_INVALIDA', totalFacturas.errores);
  const diferencias = diferenciasValidas(entrada);
  const totalDiferencias = diferencias.length ? sumaExacta(diferencias.map(d => d.importeCentimos)) : null;
  if (diferencias.length && totalDiferencias !== null && 'errores' in totalDiferencias) {
    return manual(movimiento, 'ENTRADA_INVALIDA', totalDiferencias.errores);
  }
  const totalLineas = diferencias.length
    ? sumaExacta([totalFacturas.value, (totalDiferencias as { ok: true; value: Cents }).value])
    : totalFacturas;
  if ('errores' in totalLineas) return manual(movimiento, 'ENTRADA_INVALIDA', totalLineas.errores);

  if (totalLineas.value !== movimiento.importeCentimos) {
    const residual = restaExacta(movimiento.importeCentimos, totalLineas.value, true);
    const confirming = movimiento.confirmingDraxton === true;
    return manual(
      movimiento,
      confirming ? 'CONFIRMING_DIFERENCIA_SIN_EVIDENCIA' : 'GRUPO_NO_CIERRA',
      confirming
        ? ['CONFIRMING_DRAXTON_NO_CIERRA', 'NO_SE_INVENTA_INTERES_COMISION_NI_LINEA_DE_AJUSTE']
        : ['SUMA_DE_GRUPO_NO_CIERRA_EXACTAMENTE', 'SOLO_SE_ADMITE_DIFERENCIA_CON_EVIDENCIA_EXPLICITA'],
      residual.ok ? residual.value : null,
    );
  }

  if (movimiento.confirmingDraxton === true) {
    if (encontrados.length < 2 || encontrados.some(doc => doc.factura?.source !== 'FI')) {
      return manual(movimiento, 'FACTURA_REGLA_FUERTE_NO_CUMPLE', [
        'CONFIRMING_DRAXTON_EXIGE_VARIAS_FACTURAS_FUENTE_FI_CON_REFERENCIAS_LITERALMENTE_CONOCIDAS',
      ]);
    }
  }

  const lineas: LineaPropuestaB6[] = [
    ...encontrados.map((doc, index) => ({
      tipo: 'DOCUMENTO' as const,
      documentoConciliableId: doc.documentoConciliableId,
      importeCentimos: pendientes[index] as Cents,
    })),
    ...lineasDiferencia(diferencias),
  ];
  return lista(
    movimiento,
    movimiento.confirmingDraxton === true
      ? 'CONFIRMING_DRAXTON'
      : encontrados.length === 1 ? 'FACTURA_EXACTA' : 'GRUPO_FACTURAS_EXACTO',
    lineas,
    [...razonesFacturaReferencia(), ...(diferencias.length ? ['DIFERENCIA_CONOCIDA_CON_EVIDENCIA_EXPLICITA'] : [])],
    'LITERAL_REFERENCE',
  );
}

function remesaElegible(doc: DocumentoConciliableB6): boolean {
  return documentoElegibleBase(doc)
    && doc.tipoDocumento === 'REMESA'
    && doc.remesa !== null
    && doc.remesa !== undefined
    && Number.isSafeInteger(doc.remesa.remesaId)
    && doc.remesa.remesaId > 0
    && Number.isSafeInteger(doc.remesa.ispGestionId)
    && doc.remesa.ispGestionId > 0
    && textoNoVacio(doc.remesa.foreignId);
}

function evidenciaAbonoEsValida(movimiento: MovimientoB6, evidence: AbonoSepaRemesaB6): boolean {
  return evidence.movimientoId === movimiento.id
    && textoNoVacio(evidence.evidenciaId)
    && textoNoVacio(evidence.remesaForeignId)
    && textoNoVacio(evidence.foreignIdBanco)
    && evidence.foreignIdBanco === evidence.remesaForeignId
    && textoNoVacio(evidence.referenciaBanco)
    && fechaIsoCivil(evidence.fechaBanco)
    && evidence.fechaBanco === movimiento.fecha
    && textoNoVacio(movimiento.referenciaBanco)
    && movimiento.referenciaBanco === evidence.referenciaBanco
    && validarCentsB6(evidence.importeCentimos, false).ok
    && evidence.importeCentimos === movimiento.importeCentimos;
}

function evidenciaDevolucionEsValida(movimiento: MovimientoB6, evidence: DevolucionRemesaB6): boolean {
  return evidence.movimientoId === movimiento.id
    && textoNoVacio(evidence.evidenciaId)
    && textoNoVacio(evidence.remesaForeignId)
    && textoNoVacio(evidence.foreignIdBanco)
    && evidence.foreignIdBanco === evidence.remesaForeignId
    && textoNoVacio(evidence.referenciaBanco)
    && fechaIsoCivil(evidence.fechaBanco)
    && evidence.fechaBanco === movimiento.fecha
    && textoNoVacio(movimiento.referenciaBanco)
    && movimiento.referenciaBanco === evidence.referenciaBanco
    && validarCentsB6(evidence.importeCentimos, false).ok
    && evidence.importeCentimos === movimiento.importeCentimos
    && evidence.importeCentimos < 0;
}

function proponerAbonoRemesa(entrada: EntradaPropuestaB6): ResultadoPropuestaB6 | null {
  const { movimiento } = entrada;
  const evidencias = (entrada.abonosSepa ?? []).filter(evidence => evidenciaAbonoEsValida(movimiento, evidence));
  if (!evidencias.length) return null;
  const matches = evidencias.flatMap(evidence => entrada.documentos.filter(doc => remesaElegible(doc)
    && doc.remesa!.ispGestionId === evidence.remesaIspGestionId
    && doc.remesa!.foreignId === evidence.remesaForeignId));
  if (evidencias.length !== 1 || matches.length !== 1 || !puedeAportar(matches[0], movimiento.importeCentimos)) {
    return manual(movimiento, 'ABONO_SEPA_SIN_EVIDENCIA_EXPLICITA', [
      'ABONO_SEPA_REQUIERE_UNA_EVIDENCIA_Y_UNA_REMESA_B4_UNIVOCA_CON_CAPACIDAD_FIRMADA',
      'NO_SE_USA_ESTADO_ISP_NI_CERCANIA_DE_IMPORTE_O_FECHA',
    ]);
  }
  return lista(movimiento, 'ABONO_SEPA_REMESA', [{
    tipo: 'DOCUMENTO',
    documentoConciliableId: matches[0].documentoConciliableId,
    importeCentimos: movimiento.importeCentimos as Cents,
  }], [
    'ABONO_SEPA_EXPLICITO',
    'REMESA_ISP_FOREIGN_ID_LITERAL',
    'FOREIGN_ID_LEIDO_LITERALMENTE_DEL_BANCO',
    'REFERENCIA_BANCO_LITERAL',
    'FECHA_BANCO_EXACTA',
    'CAPACIDAD_B4_FIRMADA_VERIFICADA',
    'NO_MARCA_FACTURAS_COBRADAS',
  ]);
}

function proponerDevolucionRemesa(entrada: EntradaPropuestaB6): ResultadoPropuestaB6 | null {
  const { movimiento } = entrada;
  const evidencias = (entrada.devoluciones ?? []).filter(evidence => evidenciaDevolucionEsValida(movimiento, evidence));
  if (!evidencias.length) return null;
  const matches = evidencias.flatMap(evidence => entrada.documentos.filter(doc => remesaElegible(doc)
    && doc.remesa!.ispGestionId === evidence.remesaIspGestionId
    && doc.remesa!.foreignId === evidence.remesaForeignId));
  if (evidencias.length !== 1 || matches.length !== 1 || !puedeAportar(matches[0], movimiento.importeCentimos)) {
    return manual(movimiento, 'DEVOLUCION_SIN_EVIDENCIA_O_CAPACIDAD', [
      'DEVOLUCION_REQUIERE_EVIDENCIA_EXPLICITA_Y_CAPACIDAD_REMANENTE_EN_LA_REMESA',
      'LA_APORTACION_NEGATIVA_NO_PUEDE_BAJAR_DEL_LIMITE_CERO',
    ]);
  }
  return lista(movimiento, 'DEVOLUCION_REMESA', [{
    tipo: 'DOCUMENTO',
    documentoConciliableId: matches[0].documentoConciliableId,
    importeCentimos: movimiento.importeCentimos as Cents,
  }], [
    'DEVOLUCION_EXPLICITA',
    'REMESA_ISP_FOREIGN_ID_LITERAL',
    'FOREIGN_ID_LEIDO_LITERALMENTE_DEL_BANCO',
    'REFERENCIA_BANCO_LITERAL',
    'CONTRIBUCION_FIRMADA_NEGATIVA_DENTRO_DE_CAPACIDAD_B4',
    'NO_MARCA_FACTURAS_COBRADAS',
  ]);
}

function proponerTraspaso(entrada: EntradaPropuestaB6): ResultadoPropuestaB6 | null {
  const { movimiento } = entrada;
  if (!contienePistaTraspas(movimiento.concepto)) return null;
  const parejas = (entrada.parejasTraspaso ?? []).filter(pair =>
    pair.movimientoId === movimiento.id
    && textoNoVacio(pair.movimientoParejaId)
    && textoNoVacio(pair.cuentaOrigenPropiaId)
    && textoNoVacio(pair.cuentaDestinoPropiaId)
    && textoNoVacio(pair.evidenciaId)
    && fechaIsoCivil(pair.fecha)
    && pair.fecha === movimiento.fecha
    && validarCentsB6(pair.importeParejaCentimos, false).ok,
  );
  if (parejas.length !== 1) {
    return manual(movimiento, 'TRASPASO_SIN_PAREJA_EXPLICITA', [
      'TRASSPAS_ES_SOLO_PISTA_B3',
      'FALTA_PAREJA_EXPLICITA_ENTRE_CUENTAS_PROPIAS_EN_MISMA_FECHA',
      'NUNCA_SE_PROPONE_NO_REQUIERE_AUTOMATICO',
    ]);
  }
  const pair = parejas[0];
  const cierre = movimiento.importeCentimos + pair.importeParejaCentimos;
  if (!Number.isSafeInteger(cierre) || cierre !== 0) {
    return manual(movimiento, 'TRASPASO_SIN_PAREJA_EXPLICITA', [
      'LA_PAREJA_EXPLICITA_NO_CIERRA_A_CERO_CON_SIGNO',
      'NO_HAY_ABS_NI_TOLERANCIA',
    ]);
  }
  return {
    ...base(movimiento, [
      'PISTA_TRASSPAS',
      'PAREJA_EXPLICITA_CUENTAS_PROPIAS',
      'MISMA_FECHA_EXACTA',
      'SUMA_FIRMADA_EXACTA_CERO',
      'PROPUESTA_SIN_ESCRITURA_NI_NO_REQUIERE_AUTOMATICO',
    ]),
    estado: 'PROPUESTA_TRASPASO_PAREADO',
    clase: 'TRASPASO_INTERNO_PENDIENTE_CONFIRMACION',
    confianza: 'ALTA_REGLA_EXACTA',
    movimientoParejaId: pair.movimientoParejaId,
    cuentaOrigenPropiaId: pair.cuentaOrigenPropiaId,
    cuentaDestinoPropiaId: pair.cuentaDestinoPropiaId,
    evidenciaId: pair.evidenciaId,
    requiereRevisionCatalogoB3: true,
    noRequiereAutomatico: false,
    lineas: [],
    totalLineasCentimos: null,
    diferenciaPendienteCentimos: null,
    facturasAMarcarCobradas: [],
  };
}

/**
 * Valida sólo los datos que se usan como fuente. Los documentos defectuosos no
 * se convierten en ceros: simplemente no son elegibles y llevan a evidencia
 * manual si fuesen necesarios para el caso.
 */
export function validarEntradaPropuestaB6(entrada: unknown): ResultadoValidacion<EntradaPropuestaB6> {
  if (!esObjeto(entrada) || !esObjeto(entrada.movimiento) || !Array.isArray(entrada.documentos)) {
    return { ok: false, errores: ['ENTRADA_B6_INVALIDA'] };
  }
  const movimiento = entrada.movimiento as unknown as MovimientoB6;
  const errors = [...validarMovimiento(movimiento)];
  if (entrada.lecturasCandidatasTruncadas !== undefined && (!Array.isArray(entrada.lecturasCandidatasTruncadas) || entrada.lecturasCandidatasTruncadas.some(value => !textoNoVacio(value)))) errors.push('LECTURAS_TRUNCADAS_INVALIDAS');
  if (entrada.evidenciaRemesaObligatoria !== undefined && entrada.evidenciaRemesaObligatoria !== 'ABONO_SEPA' && entrada.evidenciaRemesaObligatoria !== 'DEVOLUCION_REMESA') errors.push('EVIDENCIA_REMESA_OBLIGATORIA_INVALIDA');
  if (entrada.diferenciasConocidas !== undefined && !Array.isArray(entrada.diferenciasConocidas)) errors.push('DIFERENCIAS_INVALIDAS');
  if (entrada.abonosSepa !== undefined && !Array.isArray(entrada.abonosSepa)) errors.push('ABONOS_SEPA_INVALIDOS');
  if (entrada.devoluciones !== undefined && !Array.isArray(entrada.devoluciones)) errors.push('DEVOLUCIONES_INVALIDAS');
  if (entrada.parejasTraspaso !== undefined && !Array.isArray(entrada.parejasTraspaso)) errors.push('PAREJAS_TRASPASO_INVALIDAS');
  return errors.length ? { ok: false, errores: errors } : { ok: true, value: entrada as unknown as EntradaPropuestaB6 };
}

/**
 * Único punto de entrada del motor B6. La prioridad evita mezclar semánticas:
 * una pareja TRASSPAS explícita se revisa como traspaso; una evidencia de
 * remesa/devolución se revisa como tal; el resto sólo puede proponer facturas
 * si satisface TODA la regla fuerte. Ninguna salida persiste ni confirma.
 */
export function proponerConciliacionB6(entradaRaw: unknown): ResultadoValidacion<ResultadoPropuestaB6> {
  const entradaValidada = validarEntradaPropuestaB6(entradaRaw);
  if ('errores' in entradaValidada) return { ok: false, errores: entradaValidada.errores };
  const entrada = entradaValidada.value;
  const { movimiento } = entrada;

  if ((entrada.lecturasCandidatasTruncadas?.length ?? 0) > 0) {
    return { ok: true, value: manual(movimiento, 'CANDIDATOS_TRUNCADOS', [
      'LECTURA_CANDIDATA_TRUNCADA_NO_SE_ELIGE_EL_PRIMERO',
      ...entrada.lecturasCandidatasTruncadas!,
    ]) };
  }

  const transfer = proponerTraspaso({ ...entrada, movimiento: { ...movimiento, concepto: textoBancarioFactura(movimiento) } });
  if (transfer) return { ok: true, value: transfer };

  if (entrada.evidenciaRemesaObligatoria === 'ABONO_SEPA') {
    const abonoExigido = proponerAbonoRemesa(entrada);
    return { ok: true, value: abonoExigido ?? manual(movimiento, 'ABONO_SEPA_SIN_EVIDENCIA_EXPLICITA', [
      'ETIQUETA_BANCO_REMESA_SEPA_SIN_FOREIGN_ID_LITERAL_VERIFICABLE',
      'NO_SE_DESVIA_A_FACTURA_POR_IMPORTE_FECHA_O_ESTADO_ISP',
    ]) };
  }
  if (entrada.evidenciaRemesaObligatoria === 'DEVOLUCION_REMESA') {
    const devolucionExigida = proponerDevolucionRemesa(entrada);
    return { ok: true, value: devolucionExigida ?? manual(movimiento, 'DEVOLUCION_SIN_EVIDENCIA_O_CAPACIDAD', [
      'ETIQUETA_BANCO_DEVOLUCION_REMESA_SIN_FOREIGN_ID_LITERAL_VERIFICABLE',
      'NO_SE_DESVIA_A_FACTURA_POR_IMPORTE_FECHA_O_ESTADO_ISP',
    ]) };
  }

  const abono = proponerAbonoRemesa(entrada);
  if (abono) return { ok: true, value: abono };

  const devolucion = proponerDevolucionRemesa(entrada);
  if (devolucion) return { ok: true, value: devolucion };

  return { ok: true, value: proponerFacturas(entrada) };
}

/**
 * Adaptador plano de salida para la Bandeja B5. No añade reglas de negocio:
 * sólo reexpresa el resultado ya decidido por `proponerConciliacionB6` y deja
 * la confirmación B4 al flujo explícito posterior.
 */
export function proponerParaPendientesB5(entradaRaw: unknown): ResultadoValidacion<PropuestaPendienteB5DTO> {
  const propuesta = proponerConciliacionB6(entradaRaw);
  if ('errores' in propuesta) return { ok: false, errores: propuesta.errores };
  const entrada = entradaRaw as EntradaPropuestaB6;
  const value = propuesta.value;
  const lineasDocumento: string[] = [];
  const evidencias: string[] = [];
  for (const linea of value.lineas) {
    if (linea.tipo === 'DOCUMENTO') lineasDocumento.push(linea.documentoConciliableId);
    else evidencias.push(linea.evidenciaId);
  }
  if (value.estado === 'PROPUESTA_TRASPASO_PAREADO') evidencias.push(value.evidenciaId);
  return {
    ok: true,
    value: {
      movimientoId: value.movimientoId,
      fecha: value.fecha,
      cuentaId: value.cuentaId,
      concepto: entrada.movimiento.concepto,
      tercero: value.tercero,
      importeCentimos: value.importeMovimientoCentimos,
      estado: value.estado,
      clase: value.clase,
      confianza: value.confianza,
      puedeConfirmarB4: value.estado === 'LISTA_PARA_CONFIRMACION_B4',
      requiereEvidenciaManual: value.estado === 'NECESITA_EVIDENCIA_MANUAL' || value.estado === 'SIN_PROPUESTA',
      requiereRevisionCatalogoB3: value.estado === 'PROPUESTA_TRASPASO_PAREADO',
      documentoConciliableIdsCsv: lineasDocumento.join(','),
      referenciasEvidenciaCsv: evidencias.join(','),
      totalLineasCentimos: value.totalLineasCentimos,
      diferenciaPendienteCentimos: value.diferenciaPendienteCentimos,
      razonesCsv: value.razones.join('|'),
    },
  };
}
