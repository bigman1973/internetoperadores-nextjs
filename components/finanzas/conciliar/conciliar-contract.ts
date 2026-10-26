'use client';

import type {
  ConciliarAskCommand,
  ConciliarColor as ServerConciliarColor,
  ConciliarCommand,
  ConciliarConfirmCommand,
  ConciliarConfirmItem as ServerConciliarConfirmItem,
  ConciliarDocument as ServerConciliarDocument,
  ConciliarMovementLink as ServerConciliarMovementLink,
  ConciliarRow as ServerConciliarRow,
  ConciliarTab as ServerConciliarTab,
  ConciliarTabSummary,
  ConciliarUndoCommand,
} from '@/lib/finanzas/conciliar-contract';

export const CONCILIAR_TABS = ['COBROS', 'EMITIDAS', 'PAGOS', 'RECIBIDAS'] as const;
export const CONCILIAR_COLORS = ['VERDE', 'AMBAR', 'ROJO'] as const;

export type ConciliarTab = ServerConciliarTab;
export type ConciliarColor = ServerConciliarColor;
export type ConciliarDocument = ServerConciliarDocument;
export type ConciliarMovementLink = ServerConciliarMovementLink;
/** La API hace opcional linksMovimiento; el parser siempre lo normaliza a lista. */
export type ConciliarRow = Readonly<Omit<ServerConciliarRow, 'linksMovimiento'> & { linksMovimiento: readonly ConciliarMovementLink[] }>;
export type ConciliarSummary = ConciliarTabSummary;

export type ConciliarAccount = Readonly<{ id: string; banco: string; cuenta: string | null }>;

export type ConciliarReadResponse = Readonly<{
  tabs: readonly ConciliarSummary[];
  rows: readonly ConciliarRow[];
  total: number;
  limit: number;
  offset: number;
  updatedAt: string;
  cuentas: readonly ConciliarAccount[];
  stale: boolean;
  staleReason: string | null;
}>;

export type ConciliarConfirmItem = ServerConciliarConfirmItem;
export type ConciliarConfirmPayload = ConciliarConfirmCommand;
export type ConciliarAskPayload = ConciliarAskCommand;
export type ConciliarUndoPayload = ConciliarUndoCommand;
export type ConciliarMutationPayload = ConciliarCommand;

export type ConciliarOutcome = Readonly<{
  id: string;
  ok: boolean;
  code: string;
  message: string;
  operationId?: string;
}>;
export type ConciliarActionResponse = Readonly<{
  operationId?: string;
  outcomes: readonly ConciliarOutcome[];
  refreshedAt: string;
}>;
export type ConciliarUndoResponse = Readonly<{
  operationId: string;
  undone: boolean;
  message: string;
  refreshedAt: string;
}>;

type UnknownRecord = Record<string, unknown>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function object(value: unknown, field: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`La respuesta no incluye ${field} correctamente.`);
  return value;
}
function text(value: unknown, field: string, max = 2_000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`La respuesta no incluye ${field} correctamente.`);
  return value;
}
function nullableText(value: unknown, field: string, max = 2_000): string | null {
  return value === null ? null : text(value, field, max);
}
function integer(value: unknown, field: string, nonNegative = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || (nonNegative && value < 0)) throw new Error(`La respuesta no incluye ${field} correctamente.`);
  return value;
}
function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`La respuesta no incluye ${field} correctamente.`);
  return value;
}
function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`La respuesta no incluye ${field} correctamente.`);
  return value;
}
function opaqueId(value: unknown, field: string, maximum = 240): string {
  return text(value, field, maximum);
}
function parseOperationId(value: unknown, field: string): string {
  const parsed = text(value, field, 64);
  if (!UUID.test(parsed)) throw new Error(`La respuesta no incluye ${field} correctamente.`);
  return parsed;
}
function decisionHash(value: unknown, field: string): string {
  const parsed = text(value, field, 64).toLowerCase();
  if (!SHA256.test(parsed)) throw new Error(`La respuesta no incluye ${field} correctamente.`);
  return parsed;
}
function date(value: unknown, field: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  const parsed = text(value, field, 32);
  if (!DATE.test(parsed)) throw new Error(`La respuesta no incluye ${field} correctamente.`);
  return parsed;
}
function tab(value: unknown, field: string): ConciliarTab {
  if (!CONCILIAR_TABS.includes(value as ConciliarTab)) throw new Error(`La respuesta no incluye ${field} correctamente.`);
  return value as ConciliarTab;
}
function color(value: unknown, field: string): ConciliarColor {
  if (!CONCILIAR_COLORS.includes(value as ConciliarColor)) throw new Error(`La respuesta no incluye ${field} correctamente.`);
  return value as ConciliarColor;
}

function parseDocument(value: unknown, field: string): ConciliarDocument | null {
  if (value === null) return null;
  const raw = object(value, field);
  const href = raw.href === null ? null : text(raw.href, `${field}.href`, 900);
  return {
    referencia: text(raw.referencia, `${field}.referencia`, 320),
    tercero: nullableText(raw.tercero, `${field}.tercero`, 320),
    importeCentimos: integer(raw.importeCentimos, `${field}.importeCentimos`),
    fecha: date(raw.fecha, `${field}.fecha`, true),
    href,
  };
}

function parseLinks(value: unknown, field: string): readonly ConciliarMovementLink[] {
  if (value === undefined) return [];
  const source = array(value, field);
  if (source.length > 20) throw new Error(`La respuesta no incluye ${field} correctamente.`);
  return source.map((item, index) => {
    const raw = object(item, `${field}[${index}]`);
    return {
      id: opaqueId(raw.id, `${field}[${index}].id`),
      href: text(raw.href, `${field}[${index}].href`, 900),
      etiqueta: text(raw.etiqueta, `${field}[${index}].etiqueta`, 240),
    };
  });
}

function parseRow(value: unknown, field: string): ConciliarRow {
  const raw = object(value, field);
  return {
    id: opaqueId(raw.id, `${field}.id`),
    movimientoId: raw.movimientoId === null ? null : opaqueId(raw.movimientoId, `${field}.movimientoId`),
    fecha: date(raw.fecha, `${field}.fecha`)!,
    concepto: text(raw.concepto, `${field}.concepto`, 1_600),
    banco: nullableText(raw.banco, `${field}.banco`, 320),
    cuenta: nullableText(raw.cuenta, `${field}.cuenta`, 320),
    importeCentimos: integer(raw.importeCentimos, `${field}.importeCentimos`),
    pendienteCentimos: integer(raw.pendienteCentimos, `${field}.pendienteCentimos`),
    color: color(raw.color, `${field}.color`),
    grupo: nullableText(raw.grupo, `${field}.grupo`, 240),
    motivo: text(raw.motivo, `${field}.motivo`, 900),
    documento: parseDocument(raw.documento, `${field}.documento`),
    propuesta: raw.propuesta === null ? null : text(raw.propuesta, `${field}.propuesta`, 900),
    seleccionable: boolean(raw.seleccionable, `${field}.seleccionable`),
    diferenciaCentimos: integer(raw.diferenciaCentimos, `${field}.diferenciaCentimos`),
    linksMovimiento: parseLinks(raw.linksMovimiento, `${field}.linksMovimiento`),
    detail: nullableText(raw.detail, `${field}.detail`, 1_600),
    decisionHash: decisionHash(raw.decisionHash, `${field}.decisionHash`),
  };
}

function parseSummary(value: unknown, index: number): ConciliarSummary {
  const raw = object(value, `tabs[${index}]`);
  const rawColors = object(raw.colors, `tabs[${index}].colors`);
  const colors = {} as Record<ConciliarColor, { count: number; amountCentimos: number }>;
  for (const item of CONCILIAR_COLORS) {
    const valueForColor = object(rawColors[item], `tabs[${index}].colors.${item}`);
    colors[item] = {
      count: integer(valueForColor.count, `tabs[${index}].colors.${item}.count`, true),
      amountCentimos: integer(valueForColor.amountCentimos, `tabs[${index}].colors.${item}.amountCentimos`),
    };
  }
  return {
    tab: tab(raw.tab, `tabs[${index}].tab`),
    count: integer(raw.count, `tabs[${index}].count`, true),
    amountCentimos: integer(raw.amountCentimos, `tabs[${index}].amountCentimos`),
    colors,
  };
}

/** Rechaza respuestas incompletas: la UI nunca convierte datos desconocidos en ceros. */
export function parseConciliarReadResponse(value: unknown): ConciliarReadResponse {
  const raw = object(value, 'respuesta');
  const summaries = array(raw.tabs, 'tabs').map(parseSummary);
  if (summaries.length !== CONCILIAR_TABS.length || new Set(summaries.map((summary) => summary.tab)).size !== CONCILIAR_TABS.length) {
    throw new Error('El resumen de conciliación está incompleto.');
  }
  const rows = array(raw.rows, 'rows').map((row, index) => parseRow(row, `rows[${index}]`));
  const accounts = array(raw.cuentas, 'cuentas').map((valueForAccount, index): ConciliarAccount => {
    const account = object(valueForAccount, `cuentas[${index}]`);
    return { id: opaqueId(account.id, `cuentas[${index}].id`, 160), banco: text(account.banco, `cuentas[${index}].banco`, 320), cuenta: nullableText(account.cuenta, `cuentas[${index}].cuenta`, 320) };
  });
  const limit = integer(raw.limit, 'limit', true);
  if (limit < 1 || limit > 100 || rows.length > limit) throw new Error('El tamaño de página de conciliación no es válido.');
  return {
    tabs: summaries,
    rows,
    total: integer(raw.total, 'total', true),
    limit,
    offset: integer(raw.offset, 'offset', true),
    updatedAt: text(raw.updatedAt, 'updatedAt', 80),
    cuentas: accounts,
    stale: raw.stale === true,
    staleReason: typeof raw.staleReason === 'string' ? raw.staleReason.slice(0, 900) : null,
  };
}

/** La lectura lateral devuelve una única fila autorizada, no una nueva cola. */
export function parseConciliarDetailResponse(value: unknown): ConciliarRow {
  return parseRow(value, 'detalle');
}

function parseOutcome(value: unknown, index: number): ConciliarOutcome {
  const raw = object(value, `outcomes[${index}]`);
  const operationId = raw.operationId === undefined ? undefined : parseOperationId(raw.operationId, `outcomes[${index}].operationId`);
  return {
    id: opaqueId(raw.id, `outcomes[${index}].id`),
    ok: boolean(raw.ok, `outcomes[${index}].ok`),
    code: text(raw.code, `outcomes[${index}].code`, 160),
    message: text(raw.message, `outcomes[${index}].message`, 900),
    ...(operationId ? { operationId } : {}),
  };
}

export function parseConciliarActionResponse(value: unknown): ConciliarActionResponse {
  const raw = object(value, 'respuesta de acción');
  const outcomes = array(raw.outcomes, 'outcomes').map(parseOutcome);
  if (outcomes.length < 1 || outcomes.length > 100) throw new Error('La respuesta de la acción está incompleta.');
  const operationId = raw.operationId === undefined ? undefined : parseOperationId(raw.operationId, 'operationId');
  return { ...(operationId ? { operationId } : {}), outcomes, refreshedAt: text(raw.refreshedAt, 'refreshedAt', 80) };
}

export function parseConciliarUndoResponse(value: unknown): ConciliarUndoResponse {
  const raw = object(value, 'respuesta de deshacer');
  return {
    operationId: parseOperationId(raw.operationId, 'operationId'),
    undone: boolean(raw.undone, 'undone'),
    message: text(raw.message, 'message', 900),
    refreshedAt: text(raw.refreshedAt, 'refreshedAt', 80),
  };
}

export function parseConciliarHistoryResponse(value: unknown) {
  const raw = object(value, 'historial');
  const operations = array(raw.operations, 'operations');
  if (operations.length > 100) throw new Error('El historial supera el límite permitido.');
  return operations.filter((valueForOperation) => {
    const operation = object(valueForOperation, 'operación');
    return operation.action === 'CONFIRMAR';
  }).map((valueForOperation) => {
    const operation = object(valueForOperation, 'operación');
    const result = object(operation.result, 'resultado');
    return {
      operationId: parseOperationId(operation.id, 'operationId'),
      reversible: operation.reversible === true && operation.state === 'APLICADA',
      undone: operation.state === 'REVERTIDA',
      count: Array.isArray(result.outcomes) ? result.outcomes.length : 1,
      createdAt: text(operation.createdAt, 'createdAt', 80),
    };
  });
}

export function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (letter) => {
    const random = Math.floor(Math.random() * 16);
    const value = letter === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function isUuid(value: string): boolean { return UUID.test(value); }

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '−' : cents > 0 ? '+' : '';
  return `${sign}${(Math.abs(cents) / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`;
}

export function formatMagnitude(cents: number): string {
  return (Math.abs(cents) / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

export function formatDate(value: string | null): string {
  if (!value) return 'Sin fecha';
  const dateForDisplay = new Date(`${value}T12:00:00`);
  return Number.isNaN(dateForDisplay.getTime()) ? value : new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(dateForDisplay);
}

/** Sólo permite los lectores privados controlados por el panel, nunca una URL externa. */
export function safeDocumentHref(value: string | null): string | null {
  if (!value || value.length > 900 || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('..')) return null;
  try {
    const url = new URL(value, 'https://conciliar.local');
    if (url.origin !== 'https://conciliar.local') return null;
    const pathAllowed = /^\/api\/admin\/finanzas\/conciliar\/archivo\/[A-Za-z0-9_-]{1,240}$/.test(url.pathname) && !url.search;
    if (!pathAllowed) return null;
    return `${url.pathname}${url.search}`;
  } catch { return null; }
}

/** Los enlaces de detalle sólo pueden quedarse dentro de las rutas financieras conocidas. */
export function safeFinanceHref(value: string): string | null {
  if (value.length > 900 || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('..')) return null;
  try {
    const url = new URL(value, 'https://conciliar.local');
    if (url.origin !== 'https://conciliar.local') return null;
    if (!/^\/admin\/finanzas\/(?:conciliar|movimientos|facturas|conciliacion-v2)(?:\/|$)/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}`;
  } catch { return null; }
}

/** Prefija valores que Excel podría interpretar como fórmula; no altera los datos de la API. */
export function escapeSpreadsheet(value: string): string {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

export function safeOutcomeMessage(value: string, fallback: string): string {
  const message = value.trim().slice(0, 420);
  return /\b(?:b4|b6|firmad[oa]|fingerprint|hash|capacidad)\b/i.test(message) ? fallback : message || fallback;
}
