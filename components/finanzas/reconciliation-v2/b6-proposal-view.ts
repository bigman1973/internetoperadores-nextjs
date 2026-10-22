/**
 * Vista B6 externa y sin efectos.
 *
 * Sólo importa el núcleo B4 puro compartido; no llama a red fuera del panel, no
 * usa entorno, BD ni servidor y no confirma B4. Convierte una respuesta JSON no
 * fiable del GET B6 en una vista inmutable sólo si conserva las garantías
 * necesarias para preparar un borrador. B4 sigue siendo quien revalida y
 * confirma dentro de su transacción.
 */

import { validarBorradorMovimiento } from '@/lib/finanzas/reconciliation-core';

export const B4_CENTS_MIN = -2_147_483_648;
export const B4_CENTS_MAX = 2_147_483_647;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_HEX = /^[0-9a-f]{64}$/i;

/** UUID canónico requerido por el envoltorio DocumentoConciliable de B4. */
export function isB4DocumentId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

const DOCUMENT_TYPES = [
  'FACTURA_RECIBIDA',
  'FACTURA_EMITIDA',
  'REMESA',
  'NOMINA',
  'IMPUESTO_TGSS',
  'PRESTAMO',
  'TICKET',
  'TRASPASO',
] as const;
const DIFFERENCE_REASONS = ['COMISION', 'INTERESES', 'REDONDEO'] as const;
const READY_CLASSES = [
  'FACTURA_EXACTA',
  'GRUPO_FACTURAS_EXACTO',
  'CONFIRMING_DRAXTON',
  'ABONO_SEPA_REMESA',
  'DEVOLUCION_REMESA',
] as const;
const MANUAL_CLASSES = [
  'FACTURA_REFERENCIA_FALTA_O_AMBIGUA',
  'FACTURA_REGLA_FUERTE_NO_CUMPLE',
  'GRUPO_NO_CIERRA',
  'CONFIRMING_DIFERENCIA_SIN_EVIDENCIA',
  'ABONO_SEPA_SIN_EVIDENCIA_EXPLICITA',
  'DEVOLUCION_SIN_EVIDENCIA_O_CAPACIDAD',
  'TRASPASO_SIN_PAREJA_EXPLICITA',
  'CANDIDATOS_TRUNCADOS',
  'ENTRADA_INVALIDA',
] as const;

type DocumentoTipo = (typeof DOCUMENT_TYPES)[number];
type DifferenceReason = (typeof DIFFERENCE_REASONS)[number];
type ReadyClass = (typeof READY_CLASSES)[number];
type ManualClass = (typeof MANUAL_CLASSES)[number];
export type EstadoPropuestaB6 =
  | 'LISTA_PARA_CONFIRMACION_B4'
  | 'NECESITA_EVIDENCIA_MANUAL'
  | 'SIN_PROPUESTA'
  | 'PROPUESTA_TRASPASO_PAREADO';

/** Props B4 capturados al iniciar la lectura, no valores procedentes del GET. */
export type SnapshotB4Actual = Readonly<{
  movimientoId: string;
  estadoB4: string;
  versionMovimiento: number;
  importeMovimientoCentimos: number | null;
}>;

export type LineaPreparadaB6 =
  | Readonly<{
      tipo: 'DOCUMENTO';
      documentoConciliableId: string;
      importeCentimos: number;
    }>
  | Readonly<{
      tipo: 'DIFERENCIA';
      motivoDiferencia: DifferenceReason;
      importeCentimos: number;
    }>;

/** Único objeto que el panel entrega al padre; no contiene una confirmación. */
export type BorradorPreparadoB6 = Readonly<{
  movimientoId: string;
  version: number;
  importeCentimos: number;
  lineas: readonly LineaPreparadaB6[];
  documentos: readonly DocumentoVistaB6[];
}>;

export type DocumentoVistaB6 = Readonly<{
  id: string;
  tipo: DocumentoTipo;
  referencia: string | null;
  tercero: string | null;
  fecha: string | null;
  objetivoCentimos: number | null;
  asignadoCentimos: number;
  stale: boolean;
}>;

type LineaDocumentoVista = Readonly<{
  tipo: 'DOCUMENTO';
  documentoConciliableId: string;
  importeCentimos: number;
}>;
type LineaDiferenciaVista = Readonly<{
  tipo: 'DIFERENCIA';
  motivoDiferencia: DifferenceReason;
  importeCentimos: number;
  /** Etiqueta segura; nunca se interpreta como HTML. */
  evidenciaEtiqueta: string;
  /** Cita opcional saneada, sólo para el cuerpo privado y de sólo lectura. */
  evidenciaQuote: string | null;
  /** Fragmento bancario saneado; procede de evidencia explícita, no se inventa. */
  bankSnippet: string | null;
}>;
export type LineaVistaB6 = LineaDocumentoVista | LineaDiferenciaVista;

type BaseProposal = Readonly<{
  clase: string;
  confianza: string;
  movimientoId: string;
  cuentaId: string;
  fecha: string;
  tercero: string | null;
  importeMovimientoCentimos: number;
  razones: readonly string[];
}>;

export type PropuestaListaB6 = BaseProposal & Readonly<{
  estado: 'LISTA_PARA_CONFIRMACION_B4';
  clase: ReadyClass;
  lineas: readonly LineaVistaB6[];
  totalLineasCentimos: number;
  diferenciaPendienteCentimos: null;
}>;

export type PropuestaManualB6 = BaseProposal & Readonly<{
  estado: 'NECESITA_EVIDENCIA_MANUAL' | 'SIN_PROPUESTA';
  clase: ManualClass;
  lineas: readonly [];
  totalLineasCentimos: null;
  diferenciaPendienteCentimos: number | null;
}>;

export type PropuestaTraspasoB6 = BaseProposal & Readonly<{
  estado: 'PROPUESTA_TRASPASO_PAREADO';
  clase: 'TRASPASO_INTERNO_PENDIENTE_CONFIRMACION';
  lineas: readonly [];
  totalLineasCentimos: null;
  diferenciaPendienteCentimos: null;
  movimientoParejaId: string;
  cuentaOrigenPropiaId: string;
  cuentaDestinoPropiaId: string;
  evidenciaEtiqueta: string;
}>;

export type PropuestaVistaB6 = PropuestaListaB6 | PropuestaManualB6 | PropuestaTraspasoB6;

export type RespuestaVistaB6 = Readonly<{
  movimientoId: string;
  fingerprintB4: string;
  b4: Readonly<{ estado: 'SIN_DOCUMENTO'; version: number }>;
  propuesta: PropuestaVistaB6;
  documentos: readonly DocumentoVistaB6[];
  advertencias: readonly string[];
}>;

export type ParseResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: string }>;

function ok<T>(value: T): ParseResult<T> {
  return { ok: true, value };
}

function fail<T = never>(error: string): ParseResult<T> {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function isSafeCents(value: unknown, allowZero: boolean): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= B4_CENTS_MIN
    && value <= B4_CENTS_MAX
    && (allowZero || value !== 0);
}

function isOpaqueId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
}

function isNonEmptyText(value: unknown, maxLength = 240): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isOptionalDisplayText(value: unknown, maxLength = 240): value is string | null {
  return value === null || isNonEmptyText(value, maxLength);
}

function isIsoCivil(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function readonlyArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]);
}

function readonlyObject<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

/**
 * El texto se muestra siempre como child de React (no `dangerouslySetInnerHTML`).
 * Esta limpieza adicional limita controles y longitud para que una evidencia no
 * rompa la tarjeta ni salga como dato no estructurado.
 */
export function sanitizePrivateText(value: string, maxLength = 220): string {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function evidenceDisplay(evidenciaId: string): Readonly<{
  evidenciaEtiqueta: string;
  evidenciaQuote: string | null;
  bankSnippet: string | null;
}> {
  const safe = sanitizePrivateText(evidenciaId, 720);
  // El adaptador actual usa BANCO:<movimiento>:INTERESES:<cita>. Sólo la cita
  // se expone; el ID opaco nunca se convierte en HTML ni se usa como identidad.
  const match = /^BANCO:[^:]+:([A-Z_]+):(.*)$/u.exec(safe);
  if (match) {
    const quote = sanitizePrivateText(match[2], 180);
    return readonlyObject({
      evidenciaEtiqueta: `Evidencia bancaria explícita (${humanDifferenceReason(match[1])})`,
      evidenciaQuote: quote || null,
      bankSnippet: quote || null,
    });
  }
  return readonlyObject({
    evidenciaEtiqueta: 'Evidencia explícita registrada',
    evidenciaQuote: null,
    bankSnippet: null,
  });
}

function parseSnapshot(snapshot: SnapshotB4Actual): ParseResult<Readonly<{
  movimientoId: string;
  estadoB4: 'SIN_DOCUMENTO';
  versionMovimiento: number;
  importeMovimientoCentimos: number;
}>> {
  if (!isOpaqueId(snapshot.movimientoId)) return fail('El identificador del movimiento actual no es válido.');
  if (snapshot.estadoB4 !== 'SIN_DOCUMENTO') return fail('Las propuestas B6 sólo se leen para un movimiento B4 SIN_DOCUMENTO.');
  if (!Number.isSafeInteger(snapshot.versionMovimiento) || snapshot.versionMovimiento < 0) {
    return fail('La versión actual de B4 no es verificable.');
  }
  if (!isSafeCents(snapshot.importeMovimientoCentimos, false)) {
    return fail('El importe bancario actual es desconocido, cero o no es un céntimo B4 válido; no se sustituye por cero.');
  }
  return ok(readonlyObject({
    movimientoId: snapshot.movimientoId,
    estadoB4: 'SIN_DOCUMENTO',
    versionMovimiento: snapshot.versionMovimiento,
    importeMovimientoCentimos: snapshot.importeMovimientoCentimos,
  }));
}

function parseDocument(value: unknown): ParseResult<DocumentoVistaB6> {
  if (!isRecord(value)) return fail('Un metadato documental de B6 no es un objeto válido.');
  if (!isB4DocumentId(value.id)) return fail('B6 devolvió un identificador documental que B4 no puede validar.');
  if (!isOneOf(value.tipo, DOCUMENT_TYPES)) return fail('B6 devolvió un tipo documental fuera del catálogo B4.');
  if (!isOptionalDisplayText(value.referencia) || !isOptionalDisplayText(value.tercero) || (value.fecha !== null && !isIsoCivil(value.fecha))) {
    return fail('Los metadatos mostrados del documento no son fiables.');
  }
  if (value.objetivoCentimos !== null && !isSafeCents(value.objetivoCentimos, false)) {
    return fail('Un objetivo documental no es un importe B4 conocido.');
  }
  if (!isSafeCents(value.asignadoCentimos, true) || typeof value.stale !== 'boolean') {
    return fail('La capacidad documental no es verificable.');
  }
  return ok(readonlyObject({
    id: value.id.toLowerCase(),
    tipo: value.tipo,
    referencia: value.referencia === null ? null : sanitizePrivateText(value.referencia),
    tercero: value.tercero === null ? null : sanitizePrivateText(value.tercero),
    fecha: value.fecha as string|null,
    objetivoCentimos: value.objetivoCentimos as number|null,
    asignadoCentimos: value.asignadoCentimos,
    stale: value.stale,
  }));
}

function parseDocuments(value: unknown): ParseResult<readonly DocumentoVistaB6[]> {
  if (!Array.isArray(value) || value.length > 200) return fail('La lista de documentos B6 está ausente o supera el límite verificable.');
  const ids = new Set<string>();
  const documents: DocumentoVistaB6[] = [];
  for (const item of value) {
    const parsed = parseDocument(item);
    if ('error' in parsed) return fail(parsed.error);
    if (ids.has(parsed.value.id)) return fail('B6 devolvió metadatos repetidos para el mismo documento B4.');
    ids.add(parsed.value.id);
    documents.push(parsed.value);
  }
  return ok(readonlyArray(documents));
}

function parseLines(value: unknown): ParseResult<readonly LineaVistaB6[]> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 200) {
    return fail('Una propuesta lista debe contener entre una y 200 líneas; no se crea una línea cero.');
  }
  const lines: LineaVistaB6[] = [];
  const documentIds = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || !isSafeCents(item.importeCentimos, false)) {
      return fail('Una línea propuesta no usa céntimos enteros B4 válidos.');
    }
    if (item.tipo === 'DOCUMENTO') {
      if (!isB4DocumentId(item.documentoConciliableId)) {
        return fail('Una línea DOCUMENTO no apunta a un envoltorio B4 válido.');
      }
      const id = item.documentoConciliableId.toLowerCase();
      if (documentIds.has(id)) return fail('Un documento sólo puede aparecer una vez en el borrador B4.');
      documentIds.add(id);
      lines.push(readonlyObject({ tipo: 'DOCUMENTO', documentoConciliableId: id, importeCentimos: item.importeCentimos }));
      continue;
    }
    if (item.tipo === 'DIFERENCIA') {
      if (!isOneOf(item.motivoDiferencia, DIFFERENCE_REASONS) || !isNonEmptyText(item.evidenciaId, 1024)) {
        return fail('Una diferencia requiere un motivo cerrado y evidencia explícita; no existe una diferencia inventada.');
      }
      const evidence = evidenceDisplay(item.evidenciaId);
      lines.push(readonlyObject({
        tipo: 'DIFERENCIA',
        motivoDiferencia: item.motivoDiferencia,
        importeCentimos: item.importeCentimos,
        ...evidence,
      }));
      continue;
    }
    return fail('El tipo de línea de B6 no forma parte del contrato B4.');
  }
  return ok(readonlyArray(lines));
}

function safeSum(lines: readonly LineaVistaB6[]): number | null {
  let total = 0;
  for (const line of lines) {
    total += line.importeCentimos;
    if (!Number.isSafeInteger(total) || total < B4_CENTS_MIN || total > B4_CENTS_MAX) return null;
  }
  return total;
}

function isWithinSignedRange(value: number, target: number): boolean {
  return value >= Math.min(0, target) && value <= Math.max(0, target);
}

/**
 * Filtra campos de visualización y delega el cierre/capacidad final al núcleo
 * B4 puro. No basta con que el JSON declare un total: la misma semántica B4
 * comprueba UUID, suma firmada, objetivos y netos de las instantáneas.
 */
function validateReadyCapacity(
  lines: readonly LineaVistaB6[],
  documents: readonly DocumentoVistaB6[],
  movimientoId: string,
  importeMovimientoCentimos: number,
): string | null {
  const byId = new Map(documents.map((document) => [document.id, document] as const));
  for (const line of lines) {
    if (line.tipo !== 'DOCUMENTO') continue;
    const document = byId.get(line.documentoConciliableId);
    if (!document) return 'La propuesta apunta a un documento que no aparece en su instantánea B4.';
    if (document.stale || document.objetivoCentimos === null || document.referencia === null) {
      return 'El documento propuesto está obsoleto o no tiene objetivo y referencia verificables.';
    }
    if (!isSafeCents(document.objetivoCentimos, false) || !isSafeCents(document.asignadoCentimos, true)) {
      return 'La capacidad del documento propuesto no es un importe B4 conocido.';
    }
    if (!isWithinSignedRange(document.asignadoCentimos, document.objetivoCentimos)) {
      return 'La capacidad previa del documento ya está fuera del intervalo firmado B4.';
    }
    const next = document.asignadoCentimos + line.importeCentimos;
    if (!Number.isSafeInteger(next) || next < B4_CENTS_MIN || next > B4_CENTS_MAX || !isWithinSignedRange(next, document.objetivoCentimos)) {
      return 'La propuesta excede la capacidad firmada actual del documento.';
    }
  }
  const coreLines = lines.map((line) => line.tipo === 'DOCUMENTO'
    ? { tipo: 'DOCUMENTO' as const, documentoConciliableId: line.documentoConciliableId, importeCentimos: line.importeCentimos }
    : { tipo: 'DIFERENCIA' as const, motivoDiferencia: line.motivoDiferencia, importeCentimos: line.importeCentimos });
  const coreSnapshots = lines.flatMap((line) => {
    if (line.tipo !== 'DOCUMENTO') return [];
    const document = byId.get(line.documentoConciliableId);
    if (!document || document.objetivoCentimos === null) return [];
    return [{
      documentoConciliableId: document.id,
      tipoDocumento: document.tipo,
      importeObjetivoCentimos: document.objetivoCentimos,
      netoActivoPrevioCentimos: document.asignadoCentimos,
    }];
  });
  const validatedByCore = validarBorradorMovimiento({
    movimientoId,
    importeMovimientoCentimos,
    estado: 'JUSTIFICADO',
    lineas: coreLines,
  }, coreSnapshots);
  if (!validatedByCore.ok) return 'El núcleo B4 no acepta el cierre exacto o la capacidad de esta instantánea.';
  return null;
}

function parseBase(result: Record<string, unknown>, expected: Readonly<{
  movimientoId: string;
  importeMovimientoCentimos: number;
}>): ParseResult<Readonly<{
  clase: string;
  confianza: string;
  movimientoId: string;
  cuentaId: string;
  fecha: string;
  tercero: string | null;
  importeMovimientoCentimos: number;
  razones: readonly string[];
}>> {
  if (result.motor !== 'B6_PROPONE_ONLY' || result.noEscrituras !== true || result.requiereConfirmacionHumana !== true) {
    return fail('La respuesta no declara el contrato B6 de propuesta sin escrituras y con confirmación humana.');
  }
  if (result.movimientoId !== expected.movimientoId || !isOpaqueId(result.movimientoId)) {
    return fail('La respuesta B6 no corresponde al movimiento bancario abierto.');
  }
  if (!isOpaqueId(result.cuentaId) || !isIsoCivil(result.fecha)) {
    return fail('Falta la prueba de cuenta o fecha bancaria de la propuesta.');
  }
  if (!isSafeCents(result.importeMovimientoCentimos, false) || result.importeMovimientoCentimos !== expected.importeMovimientoCentimos) {
    return fail('El importe de la propuesta no coincide exactamente con el importe bancario actual.');
  }
  if (!isOptionalDisplayText(result.tercero) || typeof result.clase !== 'string' || typeof result.confianza !== 'string') {
    return fail('La identidad o clasificación de la propuesta no es verificable.');
  }
  if (!Array.isArray(result.razones) || result.razones.length > 40 || result.razones.some((reason) => !isNonEmptyText(reason, 180))) {
    return fail('Las razones de la propuesta no son una lista segura y verificable.');
  }
  if (!Array.isArray(result.facturasAMarcarCobradas) || result.facturasAMarcarCobradas.length !== 0) {
    return fail('B6 no puede marcar facturas cobradas o pagadas desde una propuesta.');
  }
  return ok(readonlyObject({
    clase: result.clase,
    confianza: result.confianza,
    movimientoId: result.movimientoId,
    cuentaId: result.cuentaId,
    fecha: result.fecha,
    tercero: result.tercero === null ? null : sanitizePrivateText(result.tercero),
    importeMovimientoCentimos: result.importeMovimientoCentimos,
    razones: readonlyArray(result.razones.map((reason) => sanitizePrivateText(reason, 180))),
  }));
}

function parseReady(
  result: Record<string, unknown>,
  base: ParseResult<Readonly<{
    clase: string; confianza: string; movimientoId: string; cuentaId: string; fecha: string; tercero: string | null;
    importeMovimientoCentimos: number; razones: readonly string[];
  }>>,
  documents: readonly DocumentoVistaB6[],
): ParseResult<PropuestaListaB6> {
  if ('error' in base) return fail(base.error);
  if (!isOneOf(base.value.clase, READY_CLASSES)) return fail('La clase de la propuesta lista no es una regla B6 reconocida.');
  const lines = parseLines(result.lineas);
  if ('error' in lines) return fail(lines.error);
  if (!lines.value.some((line) => line.tipo === 'DOCUMENTO')) return fail('Un borrador JUSTIFICADO requiere al menos un documento; las diferencias solas no cierran B4.');
  const sum = safeSum(lines.value);
  if (sum === null || sum !== base.value.importeMovimientoCentimos) {
    return fail('Las líneas propuestas no cierran exactamente el importe bancario firmado.');
  }
  if (!isSafeCents(result.totalLineasCentimos, false) || result.totalLineasCentimos !== sum || result.diferenciaPendienteCentimos !== null) {
    return fail('El total o el residuo de la propuesta lista no conserva el cierre B4 exacto.');
  }
  const capacityError = validateReadyCapacity(
    lines.value,
    documents,
    base.value.movimientoId,
    base.value.importeMovimientoCentimos,
  );
  if (capacityError) return fail(capacityError);
  return ok(readonlyObject({
    ...base.value,
    estado: 'LISTA_PARA_CONFIRMACION_B4' as const,
    clase: base.value.clase,
    lineas: lines.value,
    totalLineasCentimos: sum,
    diferenciaPendienteCentimos: null,
  }));
}

function parseManual(
  state: 'NECESITA_EVIDENCIA_MANUAL' | 'SIN_PROPUESTA',
  result: Record<string, unknown>,
  base: ParseResult<Readonly<{
    clase: string; confianza: string; movimientoId: string; cuentaId: string; fecha: string; tercero: string | null;
    importeMovimientoCentimos: number; razones: readonly string[];
  }>>,
): ParseResult<PropuestaManualB6> {
  if ('error' in base) return fail(base.error);
  if (!isOneOf(base.value.clase, MANUAL_CLASSES) || base.value.confianza !== 'NINGUNA') {
    return fail('La propuesta manual no usa una clase B6 reconocida.');
  }
  if (!Array.isArray(result.lineas) || result.lineas.length !== 0 || result.totalLineasCentimos !== null) {
    return fail('Una propuesta manual no puede contener líneas preparables.');
  }
  if (result.diferenciaPendienteCentimos !== null && !isSafeCents(result.diferenciaPendienteCentimos, false)) {
    return fail('La diferencia pendiente no es un importe firmado conocido.');
  }
  return ok(readonlyObject({
    ...base.value,
    estado: state,
    clase: base.value.clase,
    lineas: readonlyArray([]) as readonly [],
    totalLineasCentimos: null,
    diferenciaPendienteCentimos: result.diferenciaPendienteCentimos as number|null,
  }));
}

function parseTransfer(
  result: Record<string, unknown>,
  base: ParseResult<Readonly<{
    clase: string; confianza: string; movimientoId: string; cuentaId: string; fecha: string; tercero: string | null;
    importeMovimientoCentimos: number; razones: readonly string[];
  }>>,
): ParseResult<PropuestaTraspasoB6> {
  if ('error' in base) return fail(base.error);
  if (base.value.clase !== 'TRASPASO_INTERNO_PENDIENTE_CONFIRMACION'
    || result.requiereRevisionCatalogoB3 !== true
    || result.noRequiereAutomatico !== false
    || !isOpaqueId(result.movimientoParejaId)
    || !isOpaqueId(result.cuentaOrigenPropiaId)
    || !isOpaqueId(result.cuentaDestinoPropiaId)
    || !isNonEmptyText(result.evidenciaId, 1024)
    || !Array.isArray(result.lineas) || result.lineas.length !== 0
    || result.totalLineasCentimos !== null || result.diferenciaPendienteCentimos !== null) {
    return fail('La propuesta de traspaso no conserva el contrato de revisión B3/B4 sin aplicación automática.');
  }
  return ok(readonlyObject({
    ...base.value,
    estado: 'PROPUESTA_TRASPASO_PAREADO' as const,
    clase: 'TRASPASO_INTERNO_PENDIENTE_CONFIRMACION' as const,
    lineas: readonlyArray([]) as readonly [],
    totalLineasCentimos: null,
    diferenciaPendienteCentimos: null,
    movimientoParejaId: result.movimientoParejaId,
    cuentaOrigenPropiaId: result.cuentaOrigenPropiaId,
    cuentaDestinoPropiaId: result.cuentaDestinoPropiaId,
    evidenciaEtiqueta: evidenceDisplay(result.evidenciaId).evidenciaEtiqueta,
  }));
}

/**
 * Parseo de frontera: no confía en el tipo TypeScript de response.json(). No
 * muta el JSON recibido; devuelve una nueva instantánea congelada o un error.
 */
export function parseProposalResponse(raw: unknown, snapshot: SnapshotB4Actual): ParseResult<RespuestaVistaB6> {
  const current = parseSnapshot(snapshot);
  if ('error' in current) return fail(current.error);
  if (!isRecord(raw)) return fail('La respuesta de B6 no es un objeto JSON válido.');
  if (raw.movimientoId !== current.value.movimientoId || typeof raw.fingerprintB4 !== 'string' || !SHA256_HEX.test(raw.fingerprintB4)) {
    return fail('La respuesta no contiene una huella SHA-256 verificable para este movimiento.');
  }
  if (!isRecord(raw.b4) || raw.b4.estado !== 'SIN_DOCUMENTO' || raw.b4.estado !== current.value.estadoB4
    || raw.b4.version !== current.value.versionMovimiento) {
    return fail('La respuesta corresponde a una versión o estado B4 distinto del que está abierto.');
  }
  const documents = parseDocuments(raw.documentos);
  if ('error' in documents) return fail(documents.error);
  if (!Array.isArray(raw.advertencias) || raw.advertencias.length > 40 || raw.advertencias.some((warning) => !isNonEmptyText(warning, 180))) {
    return fail('Las advertencias B6 no tienen un formato seguro.');
  }
  if (!isRecord(raw.resultado) || !isOneOf(raw.resultado.estado, [
    'LISTA_PARA_CONFIRMACION_B4',
    'NECESITA_EVIDENCIA_MANUAL',
    'SIN_PROPUESTA',
    'PROPUESTA_TRASPASO_PAREADO',
  ] as const)) {
    return fail('El estado de la propuesta B6 no es reconocido.');
  }

  const expected = readonlyObject({
    movimientoId: current.value.movimientoId,
    importeMovimientoCentimos: current.value.importeMovimientoCentimos,
  });
  const base = parseBase(raw.resultado, expected);
  let proposal: ParseResult<PropuestaVistaB6>;
  switch (raw.resultado.estado) {
    case 'LISTA_PARA_CONFIRMACION_B4': proposal = parseReady(raw.resultado, base, documents.value); break;
    case 'NECESITA_EVIDENCIA_MANUAL': proposal = parseManual('NECESITA_EVIDENCIA_MANUAL', raw.resultado, base); break;
    case 'SIN_PROPUESTA': proposal = parseManual('SIN_PROPUESTA', raw.resultado, base); break;
    case 'PROPUESTA_TRASPASO_PAREADO': proposal = parseTransfer(raw.resultado, base); break;
  }
  if ('error' in proposal) return fail(proposal.error);

  return ok(readonlyObject({
    movimientoId: current.value.movimientoId,
    fingerprintB4: raw.fingerprintB4.toLowerCase(),
    b4: readonlyObject({ estado: 'SIN_DOCUMENTO', version: current.value.versionMovimiento }),
    propuesta: proposal.value,
    documentos: documents.value,
    advertencias: readonlyArray(raw.advertencias.map((warning) => sanitizePrivateText(warning, 180))),
  }));
}

/** Canonicalización compatible con la función `canonical` del adaptador B6 del repositorio. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** El contenido exacto que el GET B6 incluye actualmente en fingerprintB4. */
export function fingerprintInputB4(response: RespuestaVistaB6): Readonly<Record<string, unknown>> {
  return readonlyObject({
    movimientoId: response.movimientoId,
    b4Estado: response.b4.estado,
    b4Version: response.b4.version,
    importeCentimos: response.propuesta.importeMovimientoCentimos,
    documentos: response.documentos.map((document) => readonlyObject({
      id: document.id,
      objetivoCentimos: document.objetivoCentimos,
      asignadoCentimos: document.asignadoCentimos,
      stale: document.stale,
    })),
  });
}

/**
 * Verifica en navegador la SHA-256 del snapshot B4. Se ejecuta después de
 * parsear y antes de mostrar/preparar una propuesta; sin WebCrypto se rechaza
 * conservadoramente la respuesta en vez de confiar en una huella no verificable.
 */
export async function verifyFingerprintB4(response: RespuestaVistaB6): Promise<boolean> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof TextEncoder === 'undefined') return false;
  const encoded = new TextEncoder().encode(canonicalJson(fingerprintInputB4(response)));
  const digest = await subtle.digest('SHA-256', encoded);
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return actual === response.fingerprintB4;
}

/** Convierte una propuesta lista ya validada en el único payload de preparación permitido. */
export function prepareDraftFromProposal(
  response: RespuestaVistaB6,
  snapshot: SnapshotB4Actual,
): ParseResult<BorradorPreparadoB6> {
  const current = parseSnapshot(snapshot);
  if ('error' in current) return fail(current.error);
  if (response.propuesta.estado !== 'LISTA_PARA_CONFIRMACION_B4') {
    return fail('Sólo una propuesta lista puede preparar un borrador B4.');
  }
  if (response.movimientoId !== current.value.movimientoId
    || response.b4.estado !== 'SIN_DOCUMENTO'
    || response.b4.version !== current.value.versionMovimiento
    || response.propuesta.importeMovimientoCentimos !== current.value.importeMovimientoCentimos) {
    return fail('La propuesta ya no coincide con la instantánea B4 actual.');
  }
  const lines: LineaPreparadaB6[] = response.propuesta.lineas.map((line) => line.tipo === 'DOCUMENTO'
    ? readonlyObject({ tipo: 'DOCUMENTO' as const, documentoConciliableId: line.documentoConciliableId, importeCentimos: line.importeCentimos })
    : readonlyObject({ tipo: 'DIFERENCIA' as const, motivoDiferencia: line.motivoDiferencia, importeCentimos: line.importeCentimos }));
  // Vuelve a comprobar el cierre sin reutilizar un total declarado por la red.
  const total = safeSum(response.propuesta.lineas);
  if (total === null || total !== current.value.importeMovimientoCentimos || !lines.some((line) => line.tipo === 'DOCUMENTO')) {
    return fail('El borrador no conserva un cierre B4 exacto y documentado.');
  }
  return ok(readonlyObject({
    movimientoId: current.value.movimientoId,
    version: current.value.versionMovimiento,
    importeCentimos: current.value.importeMovimientoCentimos,
    lineas: readonlyArray(lines),
    documentos: response.documentos,
  }));
}

/** Formato exacto desde enteros; no divide céntimos ni usa `Number#toFixed`. */
export function formatCentsEs(value: number | null): string {
  if (!isSafeCents(value, true)) return 'Importe no disponible';
  const raw = String(value);
  const negative = raw.startsWith('-');
  const digits = (negative ? raw.slice(1) : raw).padStart(3, '0');
  const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimal = digits.slice(-2);
  const sign = negative ? '-' : value > 0 ? '+' : '';
  return `${sign}${whole},${decimal} €`;
}

export function humanDifferenceReason(value: string): string {
  switch (value) {
    case 'COMISION': return 'Comisión bancaria';
    case 'INTERESES': return 'Intereses bancarios';
    case 'REDONDEO': return 'Redondeo documentado';
    default: return 'Diferencia con evidencia';
  }
}

/** Traducciones de razones técnicas; las no conocidas se muestran como texto de revisión, no como regla nueva. */
export function humanProposalReason(code: string): string {
  const labels: Readonly<Record<string, string>> = {
    IMPORTE_FIRMADO_EXACTO: 'El importe firmado coincide exactamente.',
    TERCERO_NORMALIZADO_EXACTO_SIN_FUZZY: 'El tercero coincide de forma exacta; no se ha usado similitud.',
    FECHA_FACTURA_NO_POSTERIOR_A_FECHA_BANCO: 'La fecha del documento no es posterior al movimiento bancario.',
    FECHA_FACTURA_IGUAL_A_FECHA_BANCO: 'La fecha del documento coincide exactamente con la fecha bancaria.',
    REFERENCIA_FACTURA_LITERAL_UNIVOCA: 'La referencia documental literal es única.',
    CAPACIDAD_B4_FIRMADA_VERIFICADA: 'La capacidad firmada B4 es verificable.',
    SIN_REFERENCIA_LITERAL_FACTURA: 'No hay referencia literal; se exige fecha, tercero e importe exactos.',
    VARIOS_CANDIDATOS_MISMO_DIA_EXACTOS_NO_SE_ELIGE_EL_PRIMERO: 'Hay varias candidatas exactas: no se elige la primera.',
    SIN_CANDIDATO_MISMO_DIA_CON_IMPORTE_TERCERO_Y_FECHA_EXACTOS: 'No existe una única candidata con importe, tercero y fecha exactos.',
    SIN_REFERENCIA_NO_SE_PROPONE_POR_IMPORTE_SOLO: 'El importe aislado no genera una propuesta.',
    REFERENCIA_LITERAL_AMBIGUA_ENTRE_VARIOS_DOCUMENTOS_ACTIVOS: 'La referencia literal es ambigua entre varios documentos activos.',
    REFERENCIA_LITERAL_SIN_DOCUMENTO_ACTIVO_UNIVOCO: 'La referencia literal no identifica un documento activo único.',
    NO_SE_DESEMPATA_POR_IMPORTE_NI_SIMILITUD: 'No se desempata por importe ni por similitud.',
    FALTA_TERCERO_BANCARIO_EXPLICITO: 'Falta un tercero bancario explícito.',
    SIN_REFERENCIA_FACTURA_PATRON_ESTABLE: 'No se ha detectado una referencia de factura con patrón estable.',
    TERCERO_BANCARIO_Y_FACTURA_NO_COINCIDEN_EXACTAMENTE: 'El tercero bancario y el documental no coinciden exactamente.',
    FACTURA_POSTERIOR_AL_MOVIMIENTO_REQUIERE_VERIFICACION_DOCUMENTAL_MANUAL: 'El documento es posterior al movimiento: requiere verificación manual.',
    CAPACIDAD_B4_NO_VERIFICABLE: 'La capacidad B4 no es verificable.',
    SUMA_DE_GRUPO_NO_CIERRA_EXACTAMENTE: 'El grupo documental no cierra el importe exacto.',
    SOLO_SE_ADMITE_DIFERENCIA_CON_EVIDENCIA_EXPLICITA: 'Una diferencia sólo se admite con evidencia explícita.',
    CONFIRMING_DRAXTON_NO_CIERRA: 'El confirming no cierra de forma exacta.',
    CONFIRMING_DRAXTON_EXIGE_VARIAS_FACTURAS_FUENTE_FI_CON_REFERENCIAS_LITERALMENTE_CONOCIDAS: 'El confirming exige varias facturas FI con referencias literales conocidas.',
    CONFIRMING_SIN_TERCERO_LEGAL_DRAXTON_EXACTO: 'La pista de confirming no tiene un tercero legal Draxton exacto.',
    NO_SE_INVENTA_INTERES_COMISION_NI_LINEA_DE_AJUSTE: 'No se inventa interés, comisión ni línea de ajuste.',
    LECTURA_CANDIDATA_TRUNCADA_NO_SE_ELIGE_EL_PRIMERO: 'La lectura de candidatas se truncó: no se elige la primera.',
    CONSULTA_REFERENCIA_LITERAL_LIMIT_201: 'La consulta de referencias alcanzó su límite; no se puede probar unicidad.',
    CONSULTA_MISMO_DIA_TERCERO_RESTANTE_LIMIT_201: 'La consulta de mismo día alcanzó su límite; no se puede probar unicidad.',
    FALTA_PAREJA_EXPLICITA_ENTRE_CUENTAS_PROPIAS_EN_MISMA_FECHA: 'Falta una pareja explícita entre cuentas propias en la misma fecha.',
    NUNCA_SE_PROPONE_NO_REQUIERE_AUTOMATICO: 'Nunca se propone «No requiere documento» de forma automática.',
    LA_PAREJA_EXPLICITA_NO_CIERRA_A_CERO_CON_SIGNO: 'La pareja explícita no cierra a cero respetando el signo.',
    NO_HAY_ABS_NI_TOLERANCIA: 'No se usa valor absoluto ni tolerancia.',
    ABONO_SEPA_REQUIERE_UNA_EVIDENCIA_Y_UNA_REMESA_B4_UNIVOCA_CON_CAPACIDAD_FIRMADA: 'El abono SEPA requiere una evidencia y una remesa B4 única con capacidad firmada.',
    DEVOLUCION_REQUIERE_EVIDENCIA_EXPLICITA_Y_CAPACIDAD_REMANENTE_EN_LA_REMESA: 'La devolución exige evidencia explícita y capacidad restante.',
  };
  return labels[code] ?? `Revisión requerida: ${sanitizePrivateText(code, 150).replaceAll('_', ' ').toLowerCase()}`;
}

export function humanProposalClass(proposal: PropuestaVistaB6): string {
  switch (proposal.clase) {
    case 'FACTURA_EXACTA': return 'Factura exacta';
    case 'GRUPO_FACTURAS_EXACTO': return 'Grupo de facturas exacto';
    case 'CONFIRMING_DRAXTON': return 'Confirming con referencias verificadas';
    case 'ABONO_SEPA_REMESA': return 'Abono SEPA de remesa';
    case 'DEVOLUCION_REMESA': return 'Devolución de remesa';
    case 'FACTURA_REFERENCIA_FALTA_O_AMBIGUA': return 'Referencia de factura ausente o ambigua';
    case 'FACTURA_REGLA_FUERTE_NO_CUMPLE': return 'La regla documental fuerte no se cumple';
    case 'GRUPO_NO_CIERRA': return 'El grupo no cierra exactamente';
    case 'CONFIRMING_DIFERENCIA_SIN_EVIDENCIA': return 'Confirming con diferencia sin evidencia';
    case 'ABONO_SEPA_SIN_EVIDENCIA_EXPLICITA': return 'Abono SEPA sin evidencia explícita';
    case 'DEVOLUCION_SIN_EVIDENCIA_O_CAPACIDAD': return 'Devolución sin evidencia o capacidad';
    case 'TRASPASO_SIN_PAREJA_EXPLICITA': return 'Traspaso sin pareja explícita';
    case 'CANDIDATOS_TRUNCADOS': return 'Lectura de candidatas truncada';
    case 'ENTRADA_INVALIDA': return 'Datos de propuesta no verificables';
    case 'TRASPASO_INTERNO_PENDIENTE_CONFIRMACION': return 'Traspaso interno pendiente de revisión';
    default: return 'Propuesta B6';
  }
}
