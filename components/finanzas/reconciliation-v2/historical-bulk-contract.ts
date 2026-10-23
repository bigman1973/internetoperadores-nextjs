export const HISTORICAL_BULK_LIMIT = 25;

const MAX_ID_LENGTH = 160;
const MAX_FINGERPRINT_LENGTH = 320;
const MAX_VISIBLE_TEXT_LENGTH = 500;
const MAX_DATE_LENGTH = 80;
const MAX_CRITERION_LENGTH = 300;
const MAX_REASON_LENGTH = 160;
const MAX_EXCLUSION_REASONS = 50;
const MAX_DOCUMENTS_PER_ITEM = 50;
const MAX_CENTS_DIGITS = 30;
const MAX_PREVIEW_TOKEN_LENGTH = 24_000;

export type HistoricalBulkDocument = Readonly<{
  tipo: string;
  sourceId: string;
  referencia: string;
  tercero: string | null;
  fecha: string | null;
  fechaVencimiento: string | null;
  importeObjetivoCentimos: number;
  documentoConciliableId: string | null;
}>;

export type HistoricalBulkItem = Readonly<{
  historicoId: string;
  movimientoId: string;
  fingerprint: string;
  fechaOperacion: string;
  concepto: string;
  banco: string;
  cuentaAlias: string | null;
  importeMovimientoCentimos: number;
  version: number;
  documentos: readonly HistoricalBulkDocument[];
}>;

export type HistoricalBulkPreview = Readonly<{
  previewToken: string;
  items: readonly HistoricalBulkItem[];
  totalExactas: number;
  totalPropuestas: number;
  totalCargosCentimos: string;
  totalCobrosCentimos: string;
  excluidasPorMotivo: Readonly<Record<string, number>>;
  limit: number;
  offset: number;
  maxBloque: 25;
  criterio: string;
}>;

export type ConfirmarExactasPayload = Readonly<{
  action: 'confirmar_exactas';
  confirmacion: true;
  idempotencyKey: string;
  previewToken: string;
  items: readonly Readonly<{
    historicoId: string;
    movimientoId: string;
    fingerprint: string;
  }>[];
}>;

export type DeshacerBloquePayload = Readonly<{
  action: 'deshacer_bloque';
  confirmacion: true;
  idempotencyKey: string;
  bloqueId: string;
}>;

export type HistoricalBulkConfirmation = Readonly<{
  ok: true;
  bloqueId: string;
  confirmadas: number;
  idempotente: boolean;
  totalCargosCentimos: string;
  totalCobrosCentimos: string;
  revertidas?: number;
}>;

export type HistoricalBulkUndo = Readonly<{
  ok: true;
  bloqueId: string;
  revertidas: number;
  idempotente: boolean;
}>;

export type ParseResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: string }>;

function ok<T>(value: T): ParseResult<T> {
  return { ok: true, value };
}

function fail<T = never>(error: string): ParseResult<T> {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, maxLength: number, allowEmpty = false): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized.length > maxLength || (!allowEmpty && normalized.length === 0)) return null;
  return normalized;
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === null) return null;
  const parsed = text(value, maxLength);
  return parsed === null ? undefined : parsed;
}

/** El token HMAC viene del servidor y se conserva literalmente; la UI no lo genera ni lo normaliza. */
function previewToken(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PREVIEW_TOKEN_LENGTH || /\s/u.test(value)) return null;
  return value;
}

function safeInteger(value: unknown, minimum = Number.MIN_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function civilOrTimestamp(value: unknown): string | null {
  const candidate = text(value, MAX_DATE_LENGTH);
  const match = candidate && /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)?)?$/.exec(candidate);
  if (!match) return null;
  const civil = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (civil.getUTCFullYear() !== Number(match[1]) || civil.getUTCMonth() !== Number(match[2]) - 1 || civil.getUTCDate() !== Number(match[3])) return null;
  return candidate;
}

function optionalCivilOrTimestamp(value: unknown): string | null | undefined {
  if (value === null) return null;
  const parsed = civilOrTimestamp(value);
  return parsed === null ? undefined : parsed;
}

/** Céntimos serializados: enteros con signo, sin pasar por Number ni Math.abs. */
function centsText(value: unknown): string | null {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)$/.test(value) || value.length > MAX_CENTS_DIGITS + 1) return null;
  if (value === '-0') return null;
  return value;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseDocument(value: unknown): ParseResult<HistoricalBulkDocument> {
  if (!isRecord(value)) return fail('Un documento de la propuesta no tiene una forma verificable.');
  const tipo = text(value.tipo, 80);
  const sourceId = text(value.sourceId, MAX_ID_LENGTH);
  const referencia = text(value.referencia, MAX_VISIBLE_TEXT_LENGTH);
  const tercero = optionalText(value.tercero, MAX_VISIBLE_TEXT_LENGTH);
  const fecha = optionalCivilOrTimestamp(value.fecha);
  const fechaVencimiento = optionalCivilOrTimestamp(value.fechaVencimiento);
  const documentoConciliableId = optionalText(value.documentoConciliableId, MAX_ID_LENGTH);
  if (!tipo || !sourceId || !referencia || tercero === undefined || fecha === undefined || fechaVencimiento === undefined || documentoConciliableId === undefined || !safeInteger(value.importeObjetivoCentimos)) {
    return fail('Un documento de la propuesta contiene datos incompletos o importes no exactos.');
  }
  return ok(Object.freeze({
    tipo,
    sourceId,
    referencia,
    tercero,
    fecha,
    fechaVencimiento,
    importeObjetivoCentimos: value.importeObjetivoCentimos,
    documentoConciliableId,
  }));
}

function parseItem(value: unknown): ParseResult<HistoricalBulkItem> {
  if (!isRecord(value)) return fail('Una propuesta exacta no tiene una forma verificable.');
  const historicoId = text(value.historicoId, MAX_ID_LENGTH);
  const movimientoId = text(value.movimientoId, MAX_ID_LENGTH);
  const fingerprint = text(value.fingerprint, MAX_FINGERPRINT_LENGTH);
  const fechaOperacion = civilOrTimestamp(value.fechaOperacion);
  const concepto = text(value.concepto, MAX_VISIBLE_TEXT_LENGTH, true);
  const banco = text(value.banco, MAX_VISIBLE_TEXT_LENGTH);
  const cuentaAlias = optionalText(value.cuentaAlias, MAX_VISIBLE_TEXT_LENGTH);
  if (!historicoId || !movimientoId || !fingerprint || !fechaOperacion || concepto === null || !banco || cuentaAlias === undefined || !safeInteger(value.importeMovimientoCentimos) || !safeInteger(value.version, 0) || !Array.isArray(value.documentos) || value.documentos.length > MAX_DOCUMENTS_PER_ITEM) {
    return fail('Una propuesta exacta contiene identidad, fecha, importe o documentos no verificables.');
  }
  const documentos: HistoricalBulkDocument[] = [];
  for (const document of value.documentos) {
    const parsed = parseDocument(document);
    if ('error' in parsed) return fail(parsed.error);
    documentos.push(parsed.value);
  }
  return ok(Object.freeze({
    historicoId,
    movimientoId,
    fingerprint,
    fechaOperacion,
    concepto,
    banco,
    cuentaAlias,
    importeMovimientoCentimos: value.importeMovimientoCentimos,
    version: value.version,
    documentos: Object.freeze(documentos),
  }));
}

/**
 * Lee exclusivamente una previsualización. Cualquier forma inesperada invalida
 * la respuesta completa; nunca se sustituyen importes, totales ni documentos.
 */
export function parseHistoricalBulkPreview(value: unknown): ParseResult<HistoricalBulkPreview> {
  if (!isRecord(value) || !Array.isArray(value.items)) return fail('La respuesta de propuestas exactas está incompleta.');
  const token = previewToken(value.previewToken);
  if (token === null) return fail('El token de la previsualización no es verificable.');
  if (!safeInteger(value.totalExactas, 0) || !safeInteger(value.totalPropuestas, 0) || value.totalPropuestas < value.totalExactas || !safeInteger(value.limit, 1) || value.limit !== HISTORICAL_BULK_LIMIT || !safeInteger(value.offset, 0) || value.maxBloque !== HISTORICAL_BULK_LIMIT) {
    return fail('La paginación o los límites de las propuestas exactas no son verificables.');
  }
  if (value.items.length > HISTORICAL_BULK_LIMIT || value.offset > value.totalExactas || value.items.length > value.totalExactas - value.offset) {
    return fail('La página de propuestas exactas no es coherente con su total global.');
  }
  const totalCargosCentimos = centsText(value.totalCargosCentimos);
  const totalCobrosCentimos = centsText(value.totalCobrosCentimos);
  const criterio = text(value.criterio, MAX_CRITERION_LENGTH);
  if (!totalCargosCentimos || !totalCobrosCentimos || !criterio || !isRecord(value.excluidasPorMotivo)) {
    return fail('Los totales o el criterio de las propuestas exactas no son verificables.');
  }
  // Cargos y cobros se conservan separados y firmados: no se calculan ni se netean.
  if (BigInt(totalCargosCentimos) > BigInt(0) || BigInt(totalCobrosCentimos) < BigInt(0)) {
    return fail('Los totales de cargos y cobros no conservan su signo contable.');
  }
  const exclusionEntries = Object.entries(value.excluidasPorMotivo);
  if (exclusionEntries.length > MAX_EXCLUSION_REASONS || exclusionEntries.some(([reason, count]) => !text(reason, MAX_REASON_LENGTH) || !safeInteger(count, 0))) {
    return fail('Los motivos excluidos no son verificables.');
  }

  const items: HistoricalBulkItem[] = [];
  const historicalIds = new Set<string>();
  const movementIds = new Set<string>();
  for (const rawItem of value.items) {
    const parsed = parseItem(rawItem);
    if ('error' in parsed) return fail(parsed.error);
    if (historicalIds.has(parsed.value.historicoId) || movementIds.has(parsed.value.movimientoId)) {
      return fail('La página contiene propuestas repetidas y no se puede confirmar de forma segura.');
    }
    historicalIds.add(parsed.value.historicoId);
    movementIds.add(parsed.value.movimientoId);
    items.push(parsed.value);
  }

  return ok(Object.freeze({
    previewToken: token,
    items: Object.freeze(items),
    totalExactas: value.totalExactas,
    totalPropuestas: value.totalPropuestas,
    totalCargosCentimos,
    totalCobrosCentimos,
    excluidasPorMotivo: Object.freeze(Object.fromEntries(exclusionEntries.map(([reason, count]) => [reason.trim(), count]))),
    limit: HISTORICAL_BULK_LIMIT,
    offset: value.offset,
    maxBloque: HISTORICAL_BULK_LIMIT,
    criterio,
  }) as HistoricalBulkPreview);
}

function payloadItem(value: unknown): Readonly<{ historicoId: string; movimientoId: string; fingerprint: string }> | null {
  if (!isRecord(value)) return null;
  const historicoId = text(value.historicoId, MAX_ID_LENGTH);
  const movimientoId = text(value.movimientoId, MAX_ID_LENGTH);
  const fingerprint = text(value.fingerprint, MAX_FINGERPRINT_LENGTH);
  return historicoId && movimientoId && fingerprint ? Object.freeze({ historicoId, movimientoId, fingerprint }) : null;
}

/** Construye un cuerpo inmutable, acotado e idempotente; no realiza ninguna escritura. */
export function buildConfirmarExactasPayload(idempotencyKey: unknown, items: readonly unknown[], token: unknown): ConfirmarExactasPayload | null {
  const parsedToken = previewToken(token);
  if (!isUuid(idempotencyKey) || parsedToken === null || !Array.isArray(items) || items.length === 0 || items.length > HISTORICAL_BULK_LIMIT) return null;
  const parsedItems = items.map(payloadItem);
  if (parsedItems.some((item): item is null => item === null)) return null;
  const validItems = parsedItems as Readonly<{ historicoId: string; movimientoId: string; fingerprint: string }>[];
  const historicalIds = new Set(validItems.map((item) => item.historicoId));
  const movementIds = new Set(validItems.map((item) => item.movimientoId));
  if (historicalIds.size !== validItems.length || movementIds.size !== validItems.length) return null;
  return Object.freeze({
    action: 'confirmar_exactas',
    confirmacion: true,
    idempotencyKey,
    previewToken: parsedToken,
    items: Object.freeze(validItems),
  });
}

export function buildDeshacerBloquePayload(idempotencyKey: unknown, bloqueId: unknown): DeshacerBloquePayload | null {
  if (!isUuid(idempotencyKey) || !isUuid(bloqueId)) return null;
  return Object.freeze({ action: 'deshacer_bloque', confirmacion: true, idempotencyKey, bloqueId });
}

export function puedeEnviarConfirmacion(canWrite: boolean, reconocimientoHumano: boolean, payload: ConfirmarExactasPayload | null): boolean {
  return canWrite && reconocimientoHumano && payload !== null;
}

export function puedeEnviarDeshacer(canWrite: boolean, reconocimientoHumano: boolean, payload: DeshacerBloquePayload | null): boolean {
  return canWrite && reconocimientoHumano && payload !== null;
}

function parseConfirmationBase(value: unknown): ParseResult<Omit<HistoricalBulkConfirmation, 'revertidas'>> {
  if (!isRecord(value) || value.ok !== true || !isUuid(value.bloqueId) || !safeInteger(value.confirmadas, 0) || value.confirmadas > HISTORICAL_BULK_LIMIT || typeof value.idempotente !== 'boolean') {
    return fail('La respuesta de confirmación del bloque no es verificable.');
  }
  const totalCargosCentimos = centsText(value.totalCargosCentimos);
  const totalCobrosCentimos = centsText(value.totalCobrosCentimos);
  if (!totalCargosCentimos || !totalCobrosCentimos || BigInt(totalCargosCentimos) > BigInt(0) || BigInt(totalCobrosCentimos) < BigInt(0)) {
    return fail('Los totales devueltos por el bloque no son verificables.');
  }
  return ok(Object.freeze({
    ok: true,
    bloqueId: value.bloqueId,
    confirmadas: value.confirmadas,
    idempotente: value.idempotente,
    totalCargosCentimos,
    totalCobrosCentimos,
  }));
}

export function parseHistoricalBulkConfirmation(value: unknown): ParseResult<HistoricalBulkConfirmation> {
  const base = parseConfirmationBase(value);
  if ('error' in base) return fail(base.error);
  if (!isRecord(value) || (value.revertidas !== undefined && (!safeInteger(value.revertidas, 0) || value.revertidas > HISTORICAL_BULK_LIMIT))) {
    return fail('La respuesta de confirmación contiene una reversión no verificable.');
  }
  const revertidas = value.revertidas === undefined ? undefined : value.revertidas as number;
  return ok(Object.freeze({ ...base.value, ...(revertidas === undefined ? {} : { revertidas }) }) as HistoricalBulkConfirmation);
}

export function parseHistoricalBulkUndo(value: unknown): ParseResult<HistoricalBulkUndo> {
  if (!isRecord(value) || value.ok !== true || !isUuid(value.bloqueId) || !safeInteger(value.revertidas, 0) || value.revertidas > HISTORICAL_BULK_LIMIT || typeof value.idempotente !== 'boolean') {
    return fail('La respuesta de reversión del bloque no es verificable.');
  }
  return ok(Object.freeze({ ok: true, bloqueId: value.bloqueId, revertidas: value.revertidas, idempotente: value.idempotente }));
}

/** Nunca expone el campo técnico `codigo` al usuario final. */
export function mensajeHumanoDelError(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  const message = text(value.error, 360);
  if (!message || /^[A-Z0-9_:-]+$/.test(message)) return fallback;
  return message;
}
