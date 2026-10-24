'use client';

import { ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cents, displayDate, makeIdempotencyKey, type EstadoPaso1, type EstadoPaso2, type OrigenPaso1, type Paso1Contadores, type SentidoEasy, type TipoTerceroPaso1 } from './easy-contract';

const API = '/api/admin/finanzas/modo-facil/terceros';
const BULK_API = '/api/admin/finanzas/modo-facil/terceros/bloque';
export const THIRD_PARTY_PAGE_SIZE = 25;
const MAX_SEARCH = 120;
type Notice = Readonly<{ tone: 'error' | 'success' | 'info'; text: string }> | null;
type Candidate = Readonly<{ id: string; tipoTercero: TipoTerceroPaso1; etiqueta: string; origenPaso1: Exclude<OrigenPaso1, 'MANUAL' | 'AUTO_RECIBO'> }>;
type StepOne = Readonly<{ estadoPaso1: EstadoPaso1; tipoTercero: TipoTerceroPaso1 | null; etiqueta: string | null; origenPaso1: OrigenPaso1 | null; decisionId: string | null; version: number; propuestaTexto: string | null; candidatos: readonly Candidate[] }>;
type P1Movement = Readonly<{ id: string; fecha: string; concepto: string; importeCentimos: number; cuenta: { banco: string; alias: string | null }; paso1: StepOne; paso2: { estadoPaso2: EstadoPaso2 } }>;
type ThirdPartyRead = Readonly<{ periodo: { desde: string; hasta: string }; contador: Paso1Contadores; total: number; limit: number; offset: number; movimientos: readonly P1Movement[] }>;
export type BulkItem = Readonly<{ movimientoId: string; version: number; sugerenciaId: string; fingerprint: string; fecha: string; importeCentimos: number; tipoTercero: 'CLIENTE' | 'PROVEEDOR' | 'BANCO'; etiqueta: string; concepto: string; banco: string; alias: string | null }>;
export type BulkRead = Readonly<{ total: number; totalPropuestosTexto: number; totalElegibles: number; totalAmbiguos: number; totalSinCoincidencia: number; limit: number; offset: number; maxBloque: number; items: readonly BulkItem[]; previewToken: string | null }>;
export type BulkSelection = Readonly<Pick<BulkItem, 'movimientoId' | 'version' | 'sugerenciaId' | 'fingerprint'>>;
export type BulkAcceptPayload = Readonly<{ action: 'aceptar_seleccionados'; confirmacion: true; idempotencyKey: string; previewToken: string; items: readonly BulkSelection[] }>;
export type BulkUndoPayload = Readonly<{ action: 'deshacer_lote'; confirmacion: true; idempotencyKey: string; loteId: string }>;
type ManualPayload = Readonly<{ action: 'confirmar'; movimientoId: string; version: number; sugerenciaId: string; idempotencyKey: string; confirmacion: true }>;
export type ManualUndoPayload = Readonly<{ action: 'revertir'; decisionId: string; version: number; idempotencyKey: string; confirmacion: true }>;
type Pending =
  | Readonly<{ kind: 'bulk'; payload: BulkAcceptPayload }>
  | Readonly<{ kind: 'bulk-undo'; payload: BulkUndoPayload }>
  | Readonly<{ kind: 'manual'; payload: ManualPayload; label: string }>
  | Readonly<{ kind: 'manual-undo'; payload: ManualUndoPayload; label: string }>;
type ManualReceipt = Readonly<{ decisionId: string; label: string; payload: ManualUndoPayload }>;

const THIRD_TYPES: readonly TipoTerceroPaso1[] = ['CLIENTE', 'PROVEEDOR', 'BANCO', 'CUENTA_PROPIA', 'EMPLEADO'];
const STEP_ONE_STATES: readonly EstadoPaso1[] = ['IDENTIFICADO', 'PROPUESTO', 'SIN_IDENTIFICAR'];
const STEP_TWO_STATES: readonly EstadoPaso2[] = ['SIN_DOCUMENTO', 'JUSTIFICADO', 'NO_REQUIERE'];
const ORIGINS: readonly OrigenPaso1[] = ['ENTIDAD_FISCAL', 'EMPLEADO', 'NOMINA_EMPLEADO', 'FACTURA_RECIBIDA', 'FACTURA_EMITIDA', 'CLIENTE_CONTRATO_ACTUAL', 'CUENTA_PROPIA_ACTUAL', 'MANUAL', 'AUTO_RECIBO'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class RequestFailure extends Error {
  constructor(message: string, readonly uncertain: boolean) { super(message); }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`La respuesta no incluye ${field} verificable.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`La respuesta no incluye ${field} verificable.`);
  return value;
}
function nullableText(value: unknown, field: string): string | null { return value === null ? null : text(value, field); }
function integer(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`La respuesta no incluye ${field} verificable.`);
  return value as number;
}
function nonNegative(value: unknown, field: string): number {
  const parsed = integer(value, field);
  if (parsed < 0) throw new Error(`La respuesta no incluye ${field} válido.`);
  return parsed;
}
function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`La respuesta no incluye ${field} verificable.`);
  return value;
}
function enumValue<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value === 'string' && (values as readonly string[]).includes(value)) return value as T;
  throw new Error(`La respuesta no incluye ${field} válido.`);
}
function centsText(value: unknown, field: string): string {
  const parsed = text(value, field);
  if (!/^[+-]?\d+$/.test(parsed)) throw new Error(`La respuesta no incluye ${field} exacto.`);
  return parsed;
}
function frozen<T extends object>(value: T): Readonly<T> { return Object.freeze(value); }
function candidate(value: unknown, field: string): Candidate {
  const raw = record(value, field);
  const id = text(raw.id, `${field}.id`);
  if (!/^p1_[A-Za-z0-9_-]+$/.test(id)) throw new Error(`${field}.id no es válido.`);
  const origin = enumValue(raw.origenPaso1, ORIGINS, `${field}.origenPaso1`);
  if (origin === 'MANUAL' || origin === 'AUTO_RECIBO') throw new Error(`${field} no corresponde a una ficha actual.`);
  return { id, tipoTercero: enumValue(raw.tipoTercero, THIRD_TYPES, `${field}.tipoTercero`), etiqueta: text(raw.etiqueta, `${field}.etiqueta`), origenPaso1: origin };
}
function parseCounter(value: unknown): Paso1Contadores {
  const raw = record(value, 'contador');
  if (raw.cohorte !== 'TODOS_MOVIMIENTOS_VENTANA') throw new Error('La lectura no es válida.');
  const side = (input: unknown, field: string) => {
    const item = record(input, field);
    return { movimientos: nonNegative(item.movimientos, `${field}.movimientos`), importeCentimos: centsText(item.importeCentimos, `${field}.importeCentimos`), identificados: nonNegative(item.identificados, `${field}.identificados`) };
  };
  return {
    cohorte: 'TODOS_MOVIMIENTOS_VENTANA', totalMovimientos: nonNegative(raw.totalMovimientos, 'contador.totalMovimientos'),
    cargos: side(raw.cargos, 'contador.cargos'), cobros: side(raw.cobros, 'contador.cobros'), identificados: nonNegative(raw.identificados, 'contador.identificados'),
    propuestosTexto: nonNegative(raw.propuestosTexto, 'contador.propuestosTexto'), sinIdentificar: nonNegative(raw.sinIdentificar, 'contador.sinIdentificar'),
  };
}
function isCanonicalUuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
function isUuidV4(value: unknown): value is string { return typeof value === 'string' && UUID_V4.test(value); }
function validPreviewToken(value: unknown): value is string { return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 16_000; }
function validBulkSelection(value: BulkSelection): boolean {
  return typeof value.movimientoId === 'string' && value.movimientoId.length > 0 && value.movimientoId.length <= 160
    && Number.isSafeInteger(value.version) && value.version >= 0
    && /^p1_[a-f0-9]{64}$/.test(value.sugerenciaId) && /^[a-f0-9]{64}$/.test(value.fingerprint);
}

/** Kept exported for existing contract tests. Search candidates always come from a server-issued ID. */
export function parseThirdPartySearchCandidates(value: unknown): readonly Candidate[] {
  const values = Array.isArray(value) ? value : array(record(value, 'búsqueda').candidatos, 'candidatos');
  return values.map((item, index) => candidate(item, `candidatos[${index}]`));
}

/** Kept exported for existing contract tests. */
export function parseThirdPartyRead(value: unknown): ThirdPartyRead {
  const raw = record(value, 'respuesta');
  if (raw.stagingOnly !== true || raw.automaticas !== false) throw new Error('La respuesta no declara una lectura aislada sin automatismos.');
  const period = record(raw.periodo, 'periodo');
  const movimientos = array(raw.movimientos, 'movimientos').map((item, index): P1Movement => {
    const movement = record(item, `movimientos[${index}]`);
    const account = record(movement.cuenta, `movimientos[${index}].cuenta`);
    const step = record(movement.paso1, `movimientos[${index}].quien`);
    const document = record(movement.paso2, `movimientos[${index}].estado`);
    return {
      id: text(movement.id, `movimientos[${index}].id`), fecha: text(movement.fecha, `movimientos[${index}].fecha`), concepto: text(movement.concepto, `movimientos[${index}].concepto`), importeCentimos: integer(movement.importeCentimos, `movimientos[${index}].importeCentimos`),
      cuenta: { banco: text(account.banco, `movimientos[${index}].cuenta.banco`), alias: nullableText(account.alias, `movimientos[${index}].cuenta.alias`) },
      paso1: {
        estadoPaso1: enumValue(step.estadoPaso1, STEP_ONE_STATES, 'estado'), tipoTercero: step.tipoTercero === null ? null : enumValue(step.tipoTercero, THIRD_TYPES, 'tipo'),
        etiqueta: nullableText(step.etiqueta, 'nombre'), origenPaso1: step.origenPaso1 === null ? null : enumValue(step.origenPaso1, ORIGINS, 'origen'),
        decisionId: nullableText(step.decisionId, 'recibo'), version: nonNegative(step.version, 'versión'), propuestaTexto: nullableText(step.propuestaTexto, 'texto'),
        candidatos: array(step.candidatos, 'candidatos').map((itemCandidate, candidateIndex) => candidate(itemCandidate, `candidatos[${candidateIndex}]`)),
      },
      paso2: { estadoPaso2: enumValue(document.estadoPaso2, STEP_TWO_STATES, 'estado') },
    };
  });
  const total = nonNegative(raw.total, 'total');
  const limit = nonNegative(raw.limit, 'limit');
  const offset = nonNegative(raw.offset, 'offset');
  if (limit < 1 || limit > 100 || movimientos.length > limit || offset > total) throw new Error('La página no es válida.');
  return { periodo: { desde: text(period.desde, 'periodo.desde'), hasta: text(period.hasta, 'periodo.hasta') }, contador: parseCounter(raw.contador), total, limit, offset, movimientos };
}

/** Closed parser for the accept-in-one-click list. It never fills in absent movement context. */
export function parseThirdPartyBulkRead(value: unknown): BulkRead {
  const raw = record(value, 'lista');
  if (raw.stagingOnly !== true || raw.automaticas !== false) throw new Error('La lista no es de la zona aislada.');
  const item = (value: unknown, index: number): BulkItem => {
    const row = record(value, `items[${index}]`);
    const tipo = enumValue(row.tipoTercero, ['CLIENTE', 'PROVEEDOR', 'BANCO'] as const, 'tipo');
    const suggestion = text(row.sugerenciaId, 'propuesta');
    if (!/^p1_[a-f0-9]{64}$/.test(suggestion)) throw new Error('La propuesta no es válida.');
    const fingerprint = text(row.fingerprint, 'huella');
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('La lista debe actualizarse.');
    if (typeof row.concepto !== 'string') throw new Error('La lista no incluye el concepto verificable.');
    return {
      movimientoId: text(row.movimientoId, 'movimiento'), version: nonNegative(row.version, 'versión'), sugerenciaId: suggestion, fingerprint,
      fecha: text(row.fecha, 'fecha'), importeCentimos: integer(row.importeCentimos, 'importe'), tipoTercero: tipo, etiqueta: text(row.etiqueta, 'ficha'),
      concepto: row.concepto, banco: text(row.banco, 'banco'), alias: nullableText(row.alias, 'alias'),
    };
  };
  const total = nonNegative(raw.total, 'total');
  const limit = nonNegative(raw.limit, 'limit');
  const offset = nonNegative(raw.offset, 'offset');
  const maxBloque = nonNegative(raw.maxBloque, 'máximo');
  const items = array(raw.items, 'items').map(item);
  const previewToken = raw.previewToken === null ? null : validPreviewToken(raw.previewToken) ? raw.previewToken : (() => { throw new Error('La actualización no es válida.'); })();
  if (limit < 1 || limit > THIRD_PARTY_PAGE_SIZE || maxBloque < 1 || maxBloque > THIRD_PARTY_PAGE_SIZE || items.length > limit || offset > total || total < items.length || (items.length > 0 && previewToken === null)) throw new Error('La página no es válida.');
  if (new Set(items.map(row => row.movimientoId)).size !== items.length) throw new Error('La página contiene movimientos repetidos.');
  return {
    total, totalPropuestosTexto: nonNegative(raw.totalPropuestosTexto, 'pendientes'), totalElegibles: nonNegative(raw.totalElegibles, 'elegibles'),
    totalAmbiguos: nonNegative(raw.totalAmbiguos, 'ambiguos'), totalSinCoincidencia: nonNegative(raw.totalSinCoincidencia, 'sin coincidencia'),
    limit, offset, maxBloque, items, previewToken,
  };
}

/** Compatibility name for clients that used the original private parser name. */
export const parseBulkRead = parseThirdPartyBulkRead;

export function sortThirdPartyBulkItems(items: readonly BulkItem[]): readonly BulkItem[] {
  return [...items].sort((left, right) => Math.abs(right.importeCentimos) - Math.abs(left.importeCentimos) || right.fecha.localeCompare(left.fecha) || left.movimientoId.localeCompare(right.movimientoId));
}

/** Keeps only currently visible choices, replacing their data with this page's fresh signed rows. */
export function replaceBulkSelection(current: Readonly<Record<string, BulkItem>>, freshItems: readonly BulkItem[]): Record<string, BulkItem> {
  return Object.fromEntries(freshItems.filter(item => Boolean(current[item.movimientoId])).map(item => [item.movimientoId, item]));
}

export function pageRange(total: number, offset: number, limit: number): Readonly<{ from: number; to: number; previousOffset: number; nextOffset: number | null }> {
  const safeTotal = Number.isSafeInteger(total) && total >= 0 ? total : 0;
  const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : THIRD_PARTY_PAGE_SIZE;
  const safeOffset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
  const from = safeTotal === 0 || safeOffset >= safeTotal ? 0 : safeOffset + 1;
  const to = from === 0 ? 0 : Math.min(safeTotal, safeOffset + safeLimit);
  return { from, to, previousOffset: Math.max(0, safeOffset - safeLimit), nextOffset: safeOffset + safeLimit < safeTotal ? safeOffset + safeLimit : null };
}

export function buildBulkAcceptPayload(idempotencyKey: unknown, previewToken: unknown, source: readonly BulkItem[]): BulkAcceptPayload | null {
  if (!isUuidV4(idempotencyKey) || !validPreviewToken(previewToken) || source.length < 1 || source.length > THIRD_PARTY_PAGE_SIZE) return null;
  const items = source.map((item): BulkSelection => frozen({ movimientoId: item.movimientoId, version: item.version, sugerenciaId: item.sugerenciaId, fingerprint: item.fingerprint }));
  if (new Set(items.map(item => item.movimientoId)).size !== items.length || items.some(item => !validBulkSelection(item))) return null;
  return frozen({ action: 'aceptar_seleccionados', confirmacion: true, idempotencyKey: idempotencyKey.toLowerCase(), previewToken, items: frozen(items) });
}

export function buildBulkUndoPayload(idempotencyKey: unknown, loteId: unknown): BulkUndoPayload | null {
  if (!isUuidV4(idempotencyKey) || !isCanonicalUuid(loteId)) return null;
  return frozen({ action: 'deshacer_lote', confirmacion: true, idempotencyKey: idempotencyKey.toLowerCase(), loteId: loteId.toLowerCase() });
}

export function buildManualUndoPayload(idempotencyKey: unknown, decisionId: unknown, version: unknown): ManualUndoPayload | null {
  if (!isUuidV4(idempotencyKey) || !isCanonicalUuid(decisionId) || !Number.isSafeInteger(version) || (version as number) < 1) return null;
  return frozen({ action: 'revertir', confirmacion: true, idempotencyKey: idempotencyKey.toLowerCase(), decisionId: decisionId.toLowerCase(), version: version as number });
}

/** The retry receives the original immutable action, including its original idempotency key. */
export function retryExactAction<T>(action: T | null): T | null { return action; }

export function manualUndoFromConfirmation(value: unknown, source: Pick<ManualPayload, 'movimientoId' | 'version'>, idempotencyKey: unknown): ManualUndoPayload | null {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  if (!raw || raw.ok !== true || raw.accion !== 'CONFIRMADA' || raw.movimientoId !== source.movimientoId || raw.reversible !== true || !isCanonicalUuid(raw.decisionId)) return null;
  return buildManualUndoPayload(idempotencyKey, raw.decisionId, source.version + 1);
}

function bulkReceipt(value: unknown): { loteId: string; aceptados: number } | null {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  if (!raw || raw.ok !== true || !isCanonicalUuid(raw.loteId) || !Number.isSafeInteger(raw.aceptados) || (raw.aceptados as number) < 1 || (raw.aceptados as number) > THIRD_PARTY_PAGE_SIZE) return null;
  return { loteId: raw.loteId.toLowerCase(), aceptados: raw.aceptados as number };
}
function bulkUndoReceipt(value: unknown): boolean {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  return Boolean(raw && raw.ok === true && isCanonicalUuid(raw.loteId) && Number.isSafeInteger(raw.revertidos) && (raw.revertidos as number) >= 1 && (raw.revertidos as number) <= THIRD_PARTY_PAGE_SIZE);
}
function manualUndoReceipt(value: unknown): boolean {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  return Boolean(raw && raw.ok === true && raw.accion === 'REVERTIDA' && isCanonicalUuid(raw.decisionId));
}
function friendlyError(status: number, code: unknown): string {
  if (status === 409 || code === 'SELECCION_CAMBIADA' || code === 'VERSION_CONFLICT') return 'La lista ha cambiado. Actualízala y vuelve a revisarla.';
  if (status === 403 || code === 'SIN_PERMISO_ACTUAL') return 'No tienes permiso para completar esta acción.';
  if (status === 503) return 'Esta opción no está disponible ahora. Puedes seguir revisando la lista.';
  return 'No se pudo completar la acción. Actualiza la lista y vuelve a intentarlo.';
}
function isUncertain(error: unknown): boolean {
  return error instanceof RequestFailure ? error.uncertain : error instanceof TypeError || (error instanceof Error && /network|red|timeout|fetch/i.test(error.message));
}
function selectionTotals(items: readonly BulkItem[]) {
  let cargos = 0; let cobros = 0; let nCargos = 0; let nCobros = 0;
  for (const item of items) {
    if (item.importeCentimos < 0) { cargos += item.importeCentimos; nCargos += 1; }
    else if (item.importeCentimos > 0) { cobros += item.importeCentimos; nCobros += 1; }
  }
  return { cargos, cobros, nCargos, nCobros };
}
function sortManualRows(items: readonly P1Movement[]): readonly P1Movement[] {
  return [...items].sort((left, right) => Math.abs(right.importeCentimos) - Math.abs(left.importeCentimos) || right.fecha.localeCompare(left.fecha) || left.id.localeCompare(right.id));
}
function pageText(data: { total: number; offset: number; limit: number }): string {
  const range = pageRange(data.total, data.offset, data.limit);
  return range.from === 0 ? 'Sin resultados' : `${range.from}–${range.to} de ${data.total}`;
}

export default function NewThirdPartyWorkspace({ enabled, from, to, query, sentido, card, simple = false, onChanged }: Readonly<{ enabled: boolean; from: string; to: string; query: string; sentido: SentidoEasy; card: string; simple?: boolean; onChanged?: () => void }>) {
  const [bulk, setBulk] = useState<BulkRead | null>(null);
  const [manual, setManual] = useState<ThirdPartyRead | null>(null);
  const [bulkOffset, setBulkOffset] = useState(0);
  const [manualOffset, setManualOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [selected, setSelected] = useState<Record<string, BulkItem>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [doneLot, setDoneLot] = useState<string | null>(null);
  const [manualReceipts, setManualReceipts] = useState<readonly ManualReceipt[]>([]);
  const [searchDraft, setSearchDraft] = useState<Record<string, string>>({});
  const [searched, setSearched] = useState<Record<string, readonly Candidate[]>>({});
  const [manualChoice, setManualChoice] = useState<Record<string, string>>({});
  const [searching, setSearching] = useState<string | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    setBulkOffset(0);
    setManualOffset(0);
    setSelected({});
    setSearched({});
    setManualChoice({});
  }, [card, from, query, sentido, to]);

  const load = useCallback(async (silent = false, preserveNotice = false) => {
    if (!enabled) return;
    const sequence = ++requestSequence.current;
    if (silent) setRefreshing(true); else setLoading(true);
    const common = new URLSearchParams({ desde: from, hasta: to, limit: String(THIRD_PARTY_PAGE_SIZE), sentido });
    if (query.trim()) common.set('q', query.trim().slice(0, MAX_SEARCH));
    if (card) common.set('tarjeta', card);
    const bulkParams = new URLSearchParams(common);
    bulkParams.set('offset', String(bulkOffset));
    const manualParams = new URLSearchParams(common);
    manualParams.set('offset', String(manualOffset));
    manualParams.set('pendientes', 'SI');
    try {
      const [bulkResponse, manualResponse] = await Promise.all([
        fetch(`${BULK_API}?${bulkParams}`, { cache: 'no-store' }),
        fetch(`${API}?${manualParams}`, { cache: 'no-store' }),
      ]);
      const [bulkRaw, manualRaw]: unknown[] = await Promise.all([bulkResponse.json().catch(() => null), manualResponse.json().catch(() => null)]);
      if (!bulkResponse.ok) throw new RequestFailure(friendlyError(bulkResponse.status, (bulkRaw as { codigo?: unknown } | null)?.codigo), bulkResponse.status >= 500);
      if (!manualResponse.ok) throw new RequestFailure(friendlyError(manualResponse.status, (manualRaw as { codigo?: unknown } | null)?.codigo), manualResponse.status >= 500);
      const nextBulk = parseThirdPartyBulkRead(bulkRaw);
      const nextManual = parseThirdPartyRead(manualRaw);
      if (sequence !== requestSequence.current) return;
      setBulk(nextBulk);
      setManual(nextManual);
      setSelected(current => replaceBulkSelection(current, nextBulk.items));
      if (nextBulk.total > 0 && nextBulk.offset >= nextBulk.total) setBulkOffset(Math.floor((nextBulk.total - 1) / THIRD_PARTY_PAGE_SIZE) * THIRD_PARTY_PAGE_SIZE);
      if (nextManual.total > 0 && nextManual.offset >= nextManual.total) setManualOffset(Math.floor((nextManual.total - 1) / THIRD_PARTY_PAGE_SIZE) * THIRD_PARTY_PAGE_SIZE);
      if (!preserveNotice) setNotice(null);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setNotice({ tone: 'error', text: error instanceof RequestFailure ? error.message : 'No se ha podido actualizar la lista. Vuelve a intentarlo.' });
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [bulkOffset, card, enabled, from, manualOffset, query, sentido, to]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => sortThirdPartyBulkItems(bulk?.items ?? []), [bulk]);
  const chosen = useMemo(() => rows.filter(item => Boolean(selected[item.movimientoId])), [rows, selected]);
  const totals = useMemo(() => selectionTotals(chosen), [chosen]);
  const manualRows = useMemo(() => sortManualRows((manual?.movimientos ?? []).filter(movement => movement.paso1.estadoPaso1 !== 'IDENTIFICADO')), [manual]);
  const actionBusy = loading || refreshing || submitting || pending !== null;
  const allCurrent = rows.length > 0 && rows.every(item => Boolean(selected[item.movimientoId]));
  const simplePending = manual?.total ?? bulk?.total ?? null;

  function toggleAll() {
    if (actionBusy) return;
    setSelected(allCurrent ? {} : Object.fromEntries(rows.map(item => [item.movimientoId, item])));
  }
  function toggle(item: BulkItem) {
    if (actionBusy) return;
    setSelected(current => {
      const next = { ...current };
      if (next[item.movimientoId]) delete next[item.movimientoId]; else next[item.movimientoId] = item;
      return next;
    });
  }
  function acceptSelected() {
    if (actionBusy || !bulk?.previewToken || chosen.length === 0) return;
    const payload = buildBulkAcceptPayload(makeIdempotencyKey(), bulk.previewToken, chosen);
    if (!payload) {
      setNotice({ tone: 'error', text: 'La selección ya no está disponible. Actualiza la lista.' });
      return;
    }
    void send({ kind: 'bulk', payload });
  }
  async function searchManual(movement: P1Movement) {
    if (actionBusy || searching) return;
    const buscar = (searchDraft[movement.id] || '').trim().slice(0, MAX_SEARCH);
    if (!buscar) {
      setNotice({ tone: 'error', text: 'Escribe un nombre o identificación para buscar una ficha existente.' });
      return;
    }
    setSearching(movement.id);
    try {
      const response = await fetch(`${API}?${new URLSearchParams({ recurso: 'buscar', movimientoId: movement.id, buscar })}`, { cache: 'no-store' });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error();
      setSearched(current => ({ ...current, [movement.id]: parseThirdPartySearchCandidates(raw) }));
    } catch {
      setNotice({ tone: 'error', text: 'No se ha podido buscar una ficha existente. Vuelve a intentarlo.' });
    } finally {
      setSearching(null);
    }
  }
  function chooseManual(movement: P1Movement) {
    const chosenId = manualChoice[movement.id];
    if (!chosenId || actionBusy) return;
    const payload: ManualPayload = frozen({ action: 'confirmar', movimientoId: movement.id, version: movement.paso1.version, sugerenciaId: chosenId, idempotencyKey: makeIdempotencyKey(), confirmacion: true });
    const candidate = (searched[movement.id] ?? []).find(item => item.id === chosenId);
    void send({ kind: 'manual', payload, label: candidate?.etiqueta ?? 'la ficha elegida' });
  }
  function startBulkUndo() {
    if (!doneLot || actionBusy) return;
    const payload = buildBulkUndoPayload(makeIdempotencyKey(), doneLot);
    if (!payload) return;
    void send({ kind: 'bulk-undo', payload });
  }
  function startManualUndo(receipt: ManualReceipt) {
    if (actionBusy) return;
    void send({ kind: 'manual-undo', payload: receipt.payload, label: receipt.label });
  }

  async function send(action: Pending) {
    if (submitting) return;
    setSubmitting(true);
    const endpoint = action.kind === 'bulk' || action.kind === 'bulk-undo' ? BULK_API : API;
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action.payload) });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new RequestFailure(friendlyError(response.status, (raw as { codigo?: unknown } | null)?.codigo), response.status >= 500);
      if (!raw || typeof raw !== 'object' || (raw as { ok?: unknown }).ok !== true) throw new RequestFailure('No se ha podido comprobar el resultado. No hagas otra modificación antes de reintentar la misma acción.', true);
      setPending(null);
      if (action.kind === 'bulk') {
        const receipt = bulkReceipt(raw);
        if (!receipt) throw new RequestFailure('No se ha podido comprobar el resultado. No hagas otra modificación antes de reintentar la misma acción.', true);
        setSelected({});
        setDoneLot(receipt.loteId);
        setNotice({ tone: 'success', text: `Hecho. Se han aceptado ${receipt.aceptados} movimientos y puedes deshacer este lote.` });
      } else if (action.kind === 'bulk-undo') {
        if (!bulkUndoReceipt(raw)) throw new RequestFailure('No se ha podido comprobar el resultado. No hagas otra modificación antes de reintentar la misma acción.', true);
        setDoneLot(null);
        setNotice({ tone: 'success', text: 'Hecho. Se ha deshecho el lote completo.' });
      } else if (action.kind === 'manual') {
        const undoPayload = manualUndoFromConfirmation(raw, action.payload, makeIdempotencyKey());
        if (!undoPayload) throw new RequestFailure('No se ha podido comprobar el resultado. No hagas otra modificación antes de reintentar la misma acción.', true);
        const receipt: ManualReceipt = { decisionId: undoPayload.decisionId, label: action.label, payload: undoPayload };
        setManualReceipts(current => [receipt, ...current.filter(item => item.decisionId !== receipt.decisionId)]);
        setNotice({ tone: 'success', text: 'Hecho. Puedes deshacer esta ficha si detectas un error.' });
      } else {
        if (!manualUndoReceipt(raw)) throw new RequestFailure('No se ha podido comprobar el resultado. No hagas otra modificación antes de reintentar la misma acción.', true);
        setManualReceipts(current => current.filter(item => item.payload.decisionId !== action.payload.decisionId));
        setNotice({ tone: 'success', text: 'Hecho. Se ha deshecho la ficha elegida.' });
      }
      // The parent list is refreshed immediately without delaying this receipt and its undo action.
      void Promise.resolve(onChanged?.()).catch(() => undefined);
      void load(true, true);
    } catch (error) {
      const message = error instanceof RequestFailure ? error.message : 'No se pudo completar la acción. Vuelve a intentarlo.';
      if (isUncertain(error)) {
        setPending(action);
        setNotice({ tone: 'error', text: `Resultado pendiente de comprobar. Reintenta exactamente la misma acción antes de hacer otra modificación. ${message}` });
      } else {
        setPending(null);
        setNotice({ tone: 'error', text: message });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!enabled) return null;
  const noticeClass = notice?.tone === 'error' ? 'border-red-300 bg-red-50 text-red-950' : notice?.tone === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-blue-300 bg-blue-50 text-blue-950';
  const bulkPages = bulk ? pageRange(bulk.total, bulk.offset, bulk.limit) : null;
  const manualPages = manual ? pageRange(manual.total, manual.offset, manual.limit) : null;

  return <section className="space-y-4" aria-labelledby="who-title">
    <header className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="who-title" className="text-xl font-extrabold text-slate-950">Quién es</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">Revisa sólo coincidencias exactas con una ficha que ya existe. Un nombre del banco no crea fichas ni se acepta solo.</p>
        </div>
        <button type="button" disabled={loading || refreshing || submitting || pending !== null} onClick={() => void load(true)} className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-bold text-blue-950 disabled:opacity-50">
          <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />Actualizar
        </button>
      </div>
    </header>

    {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${noticeClass}`}>{notice.text}</p>}
    {pending && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4" role="alert">
      <h3 className="font-extrabold text-amber-950">Resultado pendiente de comprobar</h3>
      <p className="mt-1 text-sm text-amber-950">No hagas otra modificación. Reintenta el mismo envío para recuperar su resultado.</p>
      <button type="button" disabled={submitting} onClick={() => { const action = retryExactAction(pending); if (action) void send(action); }} className="mt-3 rounded-lg bg-amber-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Reintentar la misma acción</button>
    </section>}

    {(doneLot || manualReceipts.length > 0) && <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4" aria-labelledby="third-party-done-title">
      <h3 id="third-party-done-title" className="font-extrabold text-emerald-950">Hecho</h3>
      <p className="mt-1 text-sm text-emerald-950">Puedes deshacer una acción de esta sesión si detectas un error.</p>
      <div className="mt-3 space-y-2">
        {doneLot && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3"><p className="font-bold text-slate-950">Aceptación de movimientos</p><button type="button" disabled={actionBusy} onClick={startBulkUndo} className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-800 disabled:opacity-50">Deshacer lote</button></div>}
        {manualReceipts.map(receipt => <div key={receipt.decisionId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3"><p className="font-bold text-slate-950">Ficha elegida: {receipt.label}</p><button type="button" disabled={actionBusy} onClick={() => startManualUndo(receipt)} className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-800 disabled:opacity-50">Deshacer</button></div>)}
      </div>
    </section>}

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="ready-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="ready-title" className="font-extrabold text-slate-950">Pendiente</h3>
          <p className="mt-1 text-sm text-slate-600">
            {simple
              ? simplePending === null ? 'Cargando lista…' : <><strong>{simplePending}</strong> pendientes</>
              : bulk ? <><strong>{bulk.totalElegibles}</strong> coincidencias únicas de <strong>{bulk.totalPropuestosTexto}</strong> nombres propuestos. {bulk.totalAmbiguos ? `${bulk.totalAmbiguos} necesitan revisión porque hay más de una ficha.` : ''}</> : 'Cargando lista…'}
          </p>
        </div>
        {rows.length > 0 && <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800"><input type="checkbox" checked={allCurrent} onChange={toggleAll} disabled={actionBusy} />Seleccionar toda esta página</label>}
      </div>

      {chosen.length > 0 && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
        <p className="font-bold text-blue-950">Vas a aceptar {chosen.length} seleccionado(s)</p>
        <div className="mt-2 grid gap-2 text-sm text-slate-800 sm:grid-cols-2"><p>Cargos: <strong>{totals.nCargos}</strong> · {cents(totals.cargos)}</p><p>Cobros: <strong>{totals.nCobros}</strong> · {cents(totals.cobros)}</p></div>
        <button type="button" disabled={actionBusy || !bulk?.previewToken} onClick={acceptSelected} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><ShieldCheckIcon className="h-5 w-5" aria-hidden="true" />Aceptar seleccionados</button>
      </div>}

      <div className="mt-4 space-y-3">
        {!loading && rows.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-700">No hay coincidencias únicas para aceptar con estos filtros en esta página.</p>}
        {rows.map(item => <article key={item.movimientoId} className="rounded-xl border border-slate-200 p-3">
          <div className="flex gap-3">
            <input aria-label={`Seleccionar ${item.etiqueta}`} type="checkbox" checked={Boolean(selected[item.movimientoId])} disabled={actionBusy} onChange={() => toggle(item)} className="mt-1 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="font-extrabold text-slate-950">Ficha encontrada: {item.etiqueta}</p><p className="mt-1 break-words text-sm text-slate-600">{item.concepto || 'Sin concepto indicado'} · {displayDate(item.fecha)}</p><p className="mt-1 break-words text-sm text-slate-600">{item.banco}{item.alias ? ` · ${item.alias}` : ''} · {item.tipoTercero.toLocaleLowerCase('es-ES')}</p></div>
                <p className="font-extrabold tabular-nums text-slate-950">{cents(item.importeCentimos)}</p>
              </div>
            </div>
          </div>
        </article>)}
      </div>

      {bulk && bulkPages && <nav aria-label="Paginación de coincidencias listas" className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <button type="button" disabled={loading || bulkPages.from === 0 || bulkPages.previousOffset === bulk.offset} onClick={() => setBulkOffset(bulkPages.previousOffset)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50"><ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />Anterior</button>
        <span className="text-sm text-slate-700">{pageText(bulk)}</span>
        <button type="button" disabled={loading || bulkPages.nextOffset === null} onClick={() => setBulkOffset(bulkPages.nextOffset ?? bulk.offset)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50">Siguiente<ChevronRightIcon className="h-4 w-4" aria-hidden="true" /></button>
      </nav>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="manual-title">
      <h3 id="manual-title" className="font-extrabold text-slate-950">Buscar una ficha existente</h3>
      <p className="mt-1 text-sm text-slate-600">Si necesitas revisar una ficha por tu cuenta, busca y elige una que ya exista. No se crea ninguna ficha desde este texto.</p>
      <div className="mt-4 space-y-4">
        {!loading && manualRows.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-700">No hay movimientos pendientes en esta página.</p>}
        {manualRows.map(movement => {
          const candidates = searched[movement.id] || [];
          const picked = manualChoice[movement.id];
          const draft = searchDraft[movement.id] || '';
          return <article key={movement.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><p className="font-bold text-slate-950">{movement.concepto}</p><p className="mt-1 text-sm text-slate-600">{movement.paso1.propuestaTexto ? `Nombre visto en el banco: ${movement.paso1.propuestaTexto}` : 'Sin nombre indicado por el banco'}</p></div>
              <p className="font-extrabold tabular-nums text-slate-950">{cents(movement.importeCentimos)}</p>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha</dt><dd className="font-semibold text-slate-900">{displayDate(movement.fecha)}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cuenta</dt><dd className="break-words font-semibold text-slate-900">{movement.cuenta.banco}{movement.cuenta.alias ? ` · ${movement.cuenta.alias}` : ''}</dd></div>
            </dl>
            <div className="mt-3 flex gap-2">
              <input value={draft} maxLength={MAX_SEARCH} onChange={event => setSearchDraft(current => ({ ...current, [movement.id]: event.target.value }))} placeholder="Nombre o identificación de la ficha" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950" />
              <button type="button" disabled={actionBusy || searching === movement.id || !draft.trim()} onClick={() => void searchManual(movement)} className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-bold text-blue-950 disabled:opacity-50"><MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />Buscar</button>
            </div>
            {candidates.length > 0 && <div className="mt-3 space-y-2">
              {candidates.map(item => <label key={item.id} className={`block cursor-pointer rounded-lg border p-2 ${picked === item.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}><input type="radio" name={`manual-${movement.id}`} checked={picked === item.id} onChange={() => setManualChoice(current => ({ ...current, [movement.id]: item.id }))} className="mr-2" /><strong className="text-slate-950">{item.etiqueta}</strong></label>)}
              <button type="button" disabled={actionBusy || !picked} onClick={() => chooseManual(movement)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Guardar ficha elegida</button>
            </div>}
          </article>;
        })}
      </div>
      {manual && manualPages && <nav aria-label="Paginación de búsqueda manual" className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <button type="button" disabled={loading || manualPages.from === 0 || manualPages.previousOffset === manual.offset} onClick={() => setManualOffset(manualPages.previousOffset)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50"><ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />Anterior</button>
        <span className="text-sm text-slate-700">{pageText(manual)}</span>
        <button type="button" disabled={loading || manualPages.nextOffset === null} onClick={() => setManualOffset(manualPages.nextOffset ?? manual.offset)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50">Siguiente<ChevronRightIcon className="h-4 w-4" aria-hidden="true" /></button>
      </nav>}
    </section>
  </section>;
}
