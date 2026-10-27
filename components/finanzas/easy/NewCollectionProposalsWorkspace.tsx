'use client';

import { ArrowPathIcon, CheckCircleIcon, ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cents, displayDate, makeIdempotencyKey } from './easy-contract';
import { mayWriteEasyWorkspace, type EasyAccessProfile } from './easy-two-step-client';

const API = '/api/admin/finanzas/modo-facil/cobros';
export const COLLECTION_PROPOSALS_PAGE_SIZE = 25;
// Máximo de cobros por bloque: debe coincidir con EASY_COLLECTIONS_MAX_BLOCK_ITEMS del servidor.
export const COLLECTION_PROPOSALS_MAX_BLOCK = 12;
const MAX_SEARCH = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Level = 'EXACTA' | 'REVISAR';
type Notice = Readonly<{ tone: 'error' | 'success' | 'info'; text: string }> | null;
type CollectionLine = Readonly<{ tipo: 'DOCUMENTO' | 'DIFERENCIA'; referencia: string; importeCentimos: number }>;
type Composition = Readonly<{ numFactura: string; cliente: string; importeCentimos: number; vencimiento: string | null; facturaEmitidaId: string | null }>;
type RemittanceDetailLine = Readonly<{ ordinal: number; numeroFactura: string; cliente: string | null; fechaFactura: string | null; importeCentimos: number }>;
type RemittanceDetail = Readonly<{ remesaId: number; totalFacturas: number; importeBancoCentimos: number; compositionHash: string; filas: readonly RemittanceDetailLine[] }>;
type TwinMovement = Readonly<{ movimientoId: string; fecha: string; cuentaAlias: string | null; concepto: string; importeCentimos: number }>;
type Proposal = Readonly<{
  propuestaId: string;
  movimientoId: string;
  fecha: string;
  banco: string;
  cuentaAlias: string | null;
  concepto: string;
  importeMovimientoCentimos: number;
  metodo: string;
  etiquetaMetodo: string;
  nivel: Level;
  explicacion: string;
  lineas: readonly CollectionLine[];
  composicion: readonly Composition[];
  composicionTotal: number;
  composicionImporteCentimos: number;
  preview: Readonly<{ remesaDetalle: RemittanceDetail | null }>;
  par: TwinMovement | null;
  fingerprint: string;
  seleccionable: boolean;
  motivoNoSeleccionable: string | null;
}>;
type MethodTotal = Readonly<{ metodo: string; etiqueta: string; exactas: number; revisar: number; importeCentimos: number }>;
type RecentBlock = Readonly<{ bloqueId: string; at: string; confirmadas: number; importeCentimos: number; revertido: boolean }>;
type CollectionRead = Readonly<{
  generacion: Readonly<{ id: string; creadaAt: string; fuente: string }>;
  totales: Readonly<{ pendientes: number; pendientesImporteCentimos: number; exactas: number; exactasImporteCentimos: number; revisar: number; revisarImporteCentimos: number; porMetodo: readonly MethodTotal[] }>;
  items: readonly Proposal[];
  limit: number;
  offset: number;
  previewToken: string;
  bloquesRecientes: readonly RecentBlock[];
}>;
type Selection = Readonly<Pick<Proposal, 'propuestaId' | 'movimientoId' | 'fingerprint' | 'fecha' | 'concepto' | 'importeMovimientoCentimos' | 'etiquetaMetodo' | 'nivel' | 'metodo' | 'preview'>>;
type ConfirmPayload = Readonly<{ action: 'confirmar_bloque'; confirmacion: true; idempotencyKey: string; previewToken: string; items: readonly Readonly<{ propuestaId: string; movimientoId: string; fingerprint: string }>[] }>;
type UndoPayload = Readonly<{ action: 'deshacer_bloque'; confirmacion: true; idempotencyKey: string; bloqueId: string }>;
type Confirmation = Readonly<{ kind: 'confirm'; payload: ConfirmPayload; rows: readonly Selection[]; remesaDetalle: RemittanceDetail | null }>;
type PendingAction = Confirmation | Readonly<{ kind: 'undo'; payload: UndoPayload; block: RecentBlock }>;

const REMITTANCE_METHODS = new Set(['REMESA_VENCIMIENTO', 'REMESA_UNION', 'REMESA_RESIDUO']);

class RequestFailure extends Error {
  constructor(message: string, readonly uncertain: boolean) { super(message); }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`La respuesta no incluye ${field} comprobable.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`La respuesta no incluye ${field} comprobable.`);
  return value;
}
function nullableText(value: unknown, field: string): string | null { return value === null ? null : text(value, field); }
function integer(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`La respuesta no incluye ${field} comprobable.`);
  return value as number;
}
function nonNegative(value: unknown, field: string): number {
  const parsed = integer(value, field);
  if (parsed < 0) throw new Error(`La respuesta no incluye ${field} válido.`);
  return parsed;
}
function values(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`La respuesta no incluye ${field} comprobable.`);
  return value;
}
function uuid(value: unknown, field: string): string {
  const parsed = text(value, field);
  if (!UUID.test(parsed)) throw new Error(`La respuesta no incluye ${field} válido.`);
  return parsed;
}
function uuidV4(value: unknown): value is string { return typeof value === 'string' && UUID_V4.test(value); }
function fingerprint(value: unknown, field: string): string {
  const parsed = text(value, field);
  if (!/^[a-f0-9]{64}$/.test(parsed)) throw new Error(`La respuesta no incluye ${field} válido.`);
  return parsed;
}
function previewToken(value: unknown): string {
  const parsed = text(value, 'previewToken');
  if (parsed.length > 16_000 || parsed !== parsed.trim()) throw new Error('La lista no incluye una revisión válida.');
  return parsed;
}
function boolean(value: unknown, field: string): boolean {
  if (value !== true && value !== false) throw new Error(`La respuesta no incluye ${field} comprobable.`);
  return value;
}
function level(value: unknown, field: string): Level {
  if (value === 'EXACTA' || value === 'REVISAR') return value;
  throw new Error(`La respuesta no incluye ${field} válido.`);
}
function parseLine(value: unknown, field: string): CollectionLine {
  const raw = record(value, field);
  if (raw.tipo !== 'DOCUMENTO' && raw.tipo !== 'DIFERENCIA') throw new Error(`La respuesta no incluye ${field}.tipo válido.`);
  return { tipo: raw.tipo, referencia: text(raw.referencia, `${field}.referencia`), importeCentimos: integer(raw.importeCentimos, `${field}.importeCentimos`) };
}
function parseComposition(value: unknown, field: string): Composition {
  const raw = record(value, field);
  return {
    numFactura: text(raw.numFactura, `${field}.numFactura`),
    cliente: text(raw.cliente, `${field}.cliente`),
    importeCentimos: integer(raw.importeCentimos, `${field}.importeCentimos`),
    vencimiento: nullableText(raw.vencimiento, `${field}.vencimiento`),
    facturaEmitidaId: raw.facturaEmitidaId === null ? null : text(raw.facturaEmitidaId, `${field}.facturaEmitidaId`),
  };
}
function remittanceMethod(value: string): boolean { return REMITTANCE_METHODS.has(value); }
function parseRemittanceDetail(value: unknown, field: string): RemittanceDetail | null {
  if (value === null) return null;
  const raw = record(value, field);
  const remesaId = nonNegative(raw.remesaId, `${field}.remesaId`);
  const totalFacturas = nonNegative(raw.totalFacturas, `${field}.totalFacturas`);
  const importeBancoCentimos = integer(raw.importeBancoCentimos, `${field}.importeBancoCentimos`);
  const compositionHash = fingerprint(raw.compositionHash, `${field}.compositionHash`);
  const lines = values(raw.filas, `${field}.filas`);
  if (remesaId < 1 || totalFacturas < 1 || totalFacturas > 2_000 || importeBancoCentimos <= 0 || lines.length !== totalFacturas) {
    throw new Error(`La respuesta no incluye ${field} completo y verificable.`);
  }
  const ordinals = new Set<number>();
  let total = 0;
  const filas = lines.map((valueForLine, index): RemittanceDetailLine => {
    const line = record(valueForLine, `${field}.filas[${index}]`);
    const ordinal = nonNegative(line.ordinal, `${field}.filas[${index}].ordinal`);
    const importeCentimos = integer(line.importeCentimos, `${field}.filas[${index}].importeCentimos`);
    if (ordinal < 1 || ordinal > totalFacturas || ordinals.has(ordinal) || importeCentimos <= 0) {
      throw new Error(`La respuesta no incluye ${field}.filas comprobables.`);
    }
    ordinals.add(ordinal);
    total += importeCentimos;
    if (!Number.isSafeInteger(total)) throw new Error(`La composición de ${field} supera un total verificable.`);
    const fechaFactura = line.fechaFactura === undefined || line.fechaFactura === null ? null : text(line.fechaFactura, `${field}.filas[${index}].fechaFactura`);
    if (fechaFactura !== null && !/^\d{4}-\d{2}-\d{2}$/.test(fechaFactura)) throw new Error(`La respuesta no incluye ${field}.filas[${index}].fechaFactura válida.`);
    return {
      ordinal,
      numeroFactura: text(line.numeroFactura, `${field}.filas[${index}].numeroFactura`),
      cliente: line.cliente === undefined || line.cliente === null ? null : text(line.cliente, `${field}.filas[${index}].cliente`),
      fechaFactura,
      importeCentimos,
    };
  });
  if (ordinals.size !== totalFacturas || total !== importeBancoCentimos) throw new Error(`La composición de ${field} no cierra el importe bancario.`);
  return { remesaId, totalFacturas, importeBancoCentimos, compositionHash, filas: filas.sort((left, right) => left.ordinal - right.ordinal) };
}
function parseProposalPreview(value: unknown, field: string, metodo: string): Proposal['preview'] {
  if (value === undefined && !remittanceMethod(metodo)) return { remesaDetalle: null };
  const raw = record(value, `${field}.preview`);
  const remesaDetalle = parseRemittanceDetail(raw.remesaDetalle, `${field}.preview.remesaDetalle`);
  if (remittanceMethod(metodo) !== Boolean(remesaDetalle)) throw new Error(`La respuesta no incluye ${field}.preview coherente con su método.`);
  return { remesaDetalle };
}
function parseTwin(value: unknown, field: string): TwinMovement | null {
  if (value === null) return null;
  const raw = record(value, field);
  return {
    movimientoId: text(raw.movimientoId, `${field}.movimientoId`),
    fecha: text(raw.fecha, `${field}.fecha`),
    cuentaAlias: nullableText(raw.cuentaAlias, `${field}.cuentaAlias`),
    concepto: text(raw.concepto, `${field}.concepto`),
    importeCentimos: integer(raw.importeCentimos, `${field}.importeCentimos`),
  };
}
function parseProposal(value: unknown, index: number): Proposal {
  const field = `items[${index}]`;
  const raw = record(value, field);
  const composition = values(raw.composicion, `${field}.composicion`).map((item, itemIndex) => parseComposition(item, `${field}.composicion[${itemIndex}]`));
  const compositionTotal = nonNegative(raw.composicionTotal, `${field}.composicionTotal`);
  if (composition.length > 60 || composition.length > compositionTotal) throw new Error(`La respuesta no incluye ${field}.composicion válida.`);
  const metodo = text(raw.metodo, `${field}.metodo`);
  const preview = parseProposalPreview(raw.preview, field, metodo);
  if (preview.remesaDetalle && (preview.remesaDetalle.totalFacturas !== compositionTotal || preview.remesaDetalle.importeBancoCentimos !== integer(raw.importeMovimientoCentimos, `${field}.importeMovimientoCentimos`))) {
    throw new Error(`La composición completa de ${field} no coincide con el cobro.`);
  }
  return {
    propuestaId: uuid(raw.propuestaId, `${field}.propuestaId`),
    movimientoId: text(raw.movimientoId, `${field}.movimientoId`),
    fecha: text(raw.fecha, `${field}.fecha`),
    banco: text(raw.banco, `${field}.banco`),
    cuentaAlias: nullableText(raw.cuentaAlias, `${field}.cuentaAlias`),
    concepto: typeof raw.concepto === 'string' ? raw.concepto : (() => { throw new Error(`La respuesta no incluye ${field}.concepto comprobable.`); })(),
    importeMovimientoCentimos: integer(raw.importeMovimientoCentimos, `${field}.importeMovimientoCentimos`),
    metodo,
    etiquetaMetodo: text(raw.etiquetaMetodo, `${field}.etiquetaMetodo`),
    nivel: level(raw.nivel, `${field}.nivel`),
    explicacion: text(raw.explicacion, `${field}.explicacion`),
    lineas: values(raw.lineas, `${field}.lineas`).map((item, itemIndex) => parseLine(item, `${field}.lineas[${itemIndex}]`)),
    composicion: composition,
    composicionTotal: compositionTotal,
    composicionImporteCentimos: integer(raw.composicionImporteCentimos, `${field}.composicionImporteCentimos`),
    preview,
    par: parseTwin(raw.par, `${field}.par`),
    fingerprint: fingerprint(raw.fingerprint, `${field}.fingerprint`),
    seleccionable: boolean(raw.seleccionable, `${field}.seleccionable`),
    motivoNoSeleccionable: nullableText(raw.motivoNoSeleccionable, `${field}.motivoNoSeleccionable`),
  };
}
function parseMethodTotal(value: unknown, index: number): MethodTotal {
  const raw = record(value, `totales.porMetodo[${index}]`);
  return { metodo: text(raw.metodo, `totales.porMetodo[${index}].metodo`), etiqueta: text(raw.etiqueta, `totales.porMetodo[${index}].etiqueta`), exactas: nonNegative(raw.exactas, `totales.porMetodo[${index}].exactas`), revisar: nonNegative(raw.revisar, `totales.porMetodo[${index}].revisar`), importeCentimos: integer(raw.importeCentimos, `totales.porMetodo[${index}].importeCentimos`) };
}
function parseRecentBlock(value: unknown, index: number): RecentBlock {
  const raw = record(value, `bloquesRecientes[${index}]`);
  return { bloqueId: uuid(raw.bloqueId, `bloquesRecientes[${index}].bloqueId`), at: text(raw.at, `bloquesRecientes[${index}].at`), confirmadas: nonNegative(raw.confirmadas, `bloquesRecientes[${index}].confirmadas`), importeCentimos: integer(raw.importeCentimos, `bloquesRecientes[${index}].importeCentimos`), revertido: boolean(raw.revertido, `bloquesRecientes[${index}].revertido`) };
}

/** Consumimos sólo la forma publicada por la cola; si cambia, no se habilita ningún envío. */
export function parseCollectionProposalsRead(value: unknown): CollectionRead {
  const raw = record(value, 'respuesta');
  const generation = record(raw.generacion, 'generacion');
  const totals = record(raw.totales, 'totales');
  const items = values(raw.items, 'items').map(parseProposal);
  const limit = nonNegative(raw.limit, 'limit');
  const offset = nonNegative(raw.offset, 'offset');
  if (limit < 1 || limit > COLLECTION_PROPOSALS_PAGE_SIZE || offset > 10_000 || items.length > limit) throw new Error('La página de cobros no es válida.');
  if (new Set(items.map((item) => item.propuestaId)).size !== items.length || new Set(items.map((item) => item.movimientoId)).size !== items.length) throw new Error('La página de cobros contiene filas repetidas.');
  const methods = values(totals.porMetodo, 'totales.porMetodo').map(parseMethodTotal);
  if (new Set(methods.map((item) => item.metodo)).size !== methods.length) throw new Error('Los tipos disponibles no son válidos.');
  return {
    generacion: { id: uuid(generation.id, 'generacion.id'), creadaAt: text(generation.creadaAt, 'generacion.creadaAt'), fuente: text(generation.fuente, 'generacion.fuente') },
    totales: {
      pendientes: nonNegative(totals.pendientes, 'totales.pendientes'), pendientesImporteCentimos: integer(totals.pendientesImporteCentimos, 'totales.pendientesImporteCentimos'),
      exactas: nonNegative(totals.exactas, 'totales.exactas'), exactasImporteCentimos: integer(totals.exactasImporteCentimos, 'totales.exactasImporteCentimos'),
      revisar: nonNegative(totals.revisar, 'totales.revisar'), revisarImporteCentimos: integer(totals.revisarImporteCentimos, 'totales.revisarImporteCentimos'),
      porMetodo: methods,
    },
    items, limit, offset, previewToken: previewToken(raw.previewToken), bloquesRecientes: values(raw.bloquesRecientes, 'bloquesRecientes').map(parseRecentBlock),
  };
}

export function sortCollectionProposals(items: readonly Proposal[]): readonly Proposal[] {
  return [...items].sort((left, right) => Math.abs(right.importeMovimientoCentimos) - Math.abs(left.importeMovimientoCentimos) || left.movimientoId.localeCompare(right.movimientoId));
}

/** La selección siempre se sustituye por las filas recién leídas y firmadas por el servidor. */
export function replaceCollectionSelection(current: Readonly<Record<string, Selection>>, fresh: readonly Proposal[]): Record<string, Selection> {
  return Object.fromEntries(fresh.filter((item) => Boolean(current[item.propuestaId])).map((item) => [item.propuestaId, selectionFrom(item)]));
}
function selectionFrom(item: Proposal): Selection {
  return { propuestaId: item.propuestaId, movimientoId: item.movimientoId, fingerprint: item.fingerprint, fecha: item.fecha, concepto: item.concepto, importeMovimientoCentimos: item.importeMovimientoCentimos, etiquetaMetodo: item.etiquetaMetodo, nivel: item.nivel, metodo: item.metodo, preview: item.preview };
}
function frozen<T extends object>(value: T): Readonly<T> { return Object.freeze(value); }
export function buildCollectionConfirmPayload(idempotencyKey: unknown, token: unknown, selected: readonly Selection[]): ConfirmPayload | null {
  if (!uuidV4(idempotencyKey) || typeof token !== 'string' || !token.trim() || token.length > 16_000 || selected.length < 1 || selected.length > COLLECTION_PROPOSALS_MAX_BLOCK) return null;
  if (selected.some((item) => !UUID.test(item.propuestaId) || !item.movimientoId || !/^[a-f0-9]{64}$/.test(item.fingerprint))) return null;
  if (new Set(selected.map((item) => item.propuestaId)).size !== selected.length || new Set(selected.map((item) => item.movimientoId)).size !== selected.length) return null;
  if (selected.some((item) => item.nivel === 'REVISAR') && selected.length !== 1) return null;
  const items = selected.map((item) => frozen({ propuestaId: item.propuestaId, movimientoId: item.movimientoId, fingerprint: item.fingerprint }));
  return frozen({ action: 'confirmar_bloque', confirmacion: true, idempotencyKey: idempotencyKey.toLowerCase(), previewToken: token, items: frozen(items) });
}
export function buildCollectionUndoPayload(idempotencyKey: unknown, blockId: unknown): UndoPayload | null {
  if (!uuidV4(idempotencyKey) || !UUID.test(typeof blockId === 'string' ? blockId : '')) return null;
  return frozen({ action: 'deshacer_bloque', confirmacion: true, idempotencyKey: idempotencyKey.toLowerCase(), bloqueId: (blockId as string).toLowerCase() });
}
/** Un resultado incierto debe repetir el mismo cuerpo, incluso su clave de idempotencia. */
export function retryCollectionAction<T>(action: T | null): T | null { return action; }

function firstFocusable(root: HTMLElement | null) {
  return root?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]') ?? null;
}
function ConfirmationDialog({ action, busy, onCancel, onConfirm }: Readonly<{ action: Confirmation; busy: boolean; onCancel: () => void; onConfirm: () => void }>) {
  const dialog = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [page, setPage] = useState(0);
  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => firstFocusable(dialog.current)?.focus(), 0);
    return () => opener.current?.focus();
  }, []);
  function keyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); return; }
    if (event.key !== 'Tab') return;
    const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]');
    if (!nodes?.length) { event.preventDefault(); return; }
    const first = nodes[0]; const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  const total = action.rows.reduce((sum, item) => sum + item.importeMovimientoCentimos, 0);
  const reviewingOne = action.rows.length === 1 && action.rows[0].nivel === 'REVISAR';
  const remesa = action.remesaDetalle;
  const linesPerPage = 100;
  const totalPages = remesa ? Math.ceil(remesa.filas.length / linesPerPage) : 0;
  const visibleLines = remesa ? remesa.filas.slice(page * linesPerPage, (page + 1) * linesPerPage) : [];
  const firstLine = remesa ? page * linesPerPage + 1 : 0;
  const lastLine = remesa ? Math.min(remesa.filas.length, (page + 1) * linesPerPage) : 0;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 sm:items-center" role="presentation">
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="collection-confirm-title" onKeyDown={keyDown} className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ${remesa ? 'max-w-6xl' : 'max-w-xl'}`}>
      <div className="flex items-start gap-3"><ShieldCheckIcon className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" /><div><h2 id="collection-confirm-title" className="text-lg font-extrabold text-slate-950">{remesa ? 'Segunda confirmación humana de la remesa' : 'Confirmar cobros seleccionados'}</h2><p className="mt-2 text-sm leading-6 text-slate-700">Nada se guardará hasta pulsar «Confirmar».</p>{reviewingOne && !remesa && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-950">Revisa que la factura sea la correcta antes de confirmar.</p>}</div></div>
      <ul className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200" aria-label="Cobros que se van a confirmar">{action.rows.map((item) => <li key={item.propuestaId} className="flex flex-wrap items-start justify-between gap-2 p-3"><div className="min-w-0"><p className="font-bold text-slate-950">{displayDate(item.fecha)} · {item.etiquetaMetodo}</p><p className="mt-1 truncate text-sm text-slate-600" title={item.concepto}>{item.concepto || 'Sin concepto indicado'}</p></div><p className="shrink-0 font-extrabold tabular-nums text-slate-950">{cents(item.importeMovimientoCentimos)}</p></li>)}</ul>
      {remesa && <section className="mt-4" aria-labelledby="remittance-composition-title"><div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950"><h3 id="remittance-composition-title" className="font-extrabold">Composición completa verificada</h3><p className="mt-1">Se han cargado las {remesa.totalFacturas.toLocaleString('es-ES')} facturas de esta remesa, sin muestra compacta. Confirma sólo estas facturas y este abono de {cents(remesa.importeBancoCentimos)}; no se confirma el resto de la remesa.</p></div><div className="mt-3 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-3 font-bold">#</th><th className="p-3 font-bold">Nº de factura</th><th className="p-3 font-bold">Cliente</th><th className="p-3 font-bold">Fecha factura</th><th className="p-3 text-right font-bold">Importe</th></tr></thead><tbody>{visibleLines.map((line) => <tr key={line.ordinal} className="border-t border-slate-200 text-slate-800"><td className="p-3 tabular-nums">{line.ordinal}</td><td className="p-3 font-semibold">{line.numeroFactura}</td><td className="max-w-[20rem] truncate p-3" title={line.cliente ?? undefined}>{line.cliente || 'Sin cliente publicado'}</td><td className="whitespace-nowrap p-3">{line.fechaFactura ? displayDate(line.fechaFactura) : 'Sin fecha publicada'}</td><td className="whitespace-nowrap p-3 text-right tabular-nums">{cents(line.importeCentimos)}</td></tr>)}</tbody></table></div>{totalPages > 1 && <nav aria-label="Paginación de composición completa de remesa" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-slate-700">Mostrando {firstLine.toLocaleString('es-ES')}–{lastLine.toLocaleString('es-ES')} de {remesa.totalFacturas.toLocaleString('es-ES')} facturas verificadas.</span><span className="flex gap-2"><button type="button" disabled={busy || page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50">Anterior</button><button type="button" disabled={busy || page >= totalPages - 1} onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50">Siguiente</button></span></nav>}<p className="mt-3 rounded-lg bg-slate-100 p-3 text-right text-sm font-bold text-slate-950">{remesa.totalFacturas.toLocaleString('es-ES')} facturas verificadas · total {cents(remesa.importeBancoCentimos)}</p></section>}
      {!remesa && <p className="mt-4 rounded-lg bg-slate-100 p-3 text-right text-sm font-bold text-slate-950">{action.rows.length} {action.rows.length === 1 ? 'cobro' : 'cobros'} · total {cents(total)}</p>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={onCancel} className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50">Cancelar</button><button type="button" disabled={busy} onClick={onConfirm} className="min-h-10 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50">{busy ? 'Guardando…' : remesa ? `Confirmar sólo estas ${remesa.totalFacturas.toLocaleString('es-ES')} facturas` : 'Confirmar'}</button></div>
    </section>
  </div>;
}

function pageRange(total: number, offset: number, limit: number) {
  const from = total === 0 || offset >= total ? 0 : offset + 1;
  const to = from === 0 ? 0 : Math.min(total, offset + limit);
  return { from, to, previous: Math.max(0, offset - limit), next: offset + limit < total ? offset + limit : null };
}
// La composición de una remesa puede tener decenas de facturas y la tarjeta
// se pinta en móvil y en escritorio: la tabla sólo se monta al abrirla.
function CompositionDetails({ item }: Readonly<{ item: Proposal }>) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const remesa = item.preview.remesaDetalle;
  const linesPerPage = 100;
  const totalPages = remesa ? Math.ceil(remesa.filas.length / linesPerPage) : 0;
  const visibleRemesaLines = remesa ? remesa.filas.slice(page * linesPerPage, (page + 1) * linesPerPage) : [];
  const firstLine = remesa ? page * linesPerPage + 1 : 0;
  const lastLine = remesa ? Math.min(remesa.filas.length, (page + 1) * linesPerPage) : 0;
  const remaining = item.composicionTotal - item.composicion.length;
  return <details onToggle={(event) => { setOpen(event.currentTarget.open); if (!event.currentTarget.open) setPage(0); }} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm"><summary className="cursor-pointer font-bold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-600">Ver facturas ({item.composicionTotal})</summary>{open && (remesa ? <><p className="mt-2 rounded-md bg-amber-50 p-2 text-xs font-semibold leading-5 text-amber-950">Composición completa verificada: estas son las únicas facturas que se asignarían a este abono de {cents(remesa.importeBancoCentimos)}.</p><div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="text-slate-600"><tr><th className="pr-3 pb-2 font-bold">#</th><th className="pr-3 pb-2 font-bold">Nº de factura</th><th className="pr-3 pb-2 font-bold">Cliente</th><th className="pr-3 pb-2 font-bold">Fecha</th><th className="pb-2 text-right font-bold">Importe</th></tr></thead><tbody>{visibleRemesaLines.map((invoice) => <tr key={invoice.ordinal} className="border-t border-slate-200 text-slate-800"><td className="py-2 pr-3 tabular-nums">{invoice.ordinal}</td><td className="py-2 pr-3 font-semibold">{invoice.numeroFactura}</td><td className="max-w-[15rem] truncate py-2 pr-3" title={invoice.cliente ?? undefined}>{invoice.cliente || 'Sin cliente publicado'}</td><td className="whitespace-nowrap py-2 pr-3">{invoice.fechaFactura ? displayDate(invoice.fechaFactura) : 'Sin fecha publicada'}</td><td className="whitespace-nowrap py-2 text-right tabular-nums">{cents(invoice.importeCentimos)}</td></tr>)}</tbody></table></div>{totalPages > 1 && <nav aria-label="Paginación de vista previa completa de remesa" className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span>{firstLine.toLocaleString('es-ES')}–{lastLine.toLocaleString('es-ES')} de {remesa.totalFacturas.toLocaleString('es-ES')} facturas verificadas</span><span className="flex gap-2"><button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} className="min-h-9 rounded border border-slate-300 bg-white px-2 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50">Anterior</button><button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} className="min-h-9 rounded border border-slate-300 bg-white px-2 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50">Siguiente</button></span></nav>}</> : <><div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="text-slate-600"><tr><th className="pr-3 pb-2 font-bold">Nº de factura</th><th className="pr-3 pb-2 font-bold">Cliente</th><th className="pr-3 pb-2 font-bold">Importe</th><th className="pb-2 font-bold">Vencimiento</th></tr></thead><tbody>{item.composicion.map((invoice, index) => <tr key={`${invoice.numFactura}-${invoice.facturaEmitidaId ?? index}`} className="border-t border-slate-200 text-slate-800"><td className="py-2 pr-3 font-semibold">{invoice.numFactura}</td><td className="max-w-[15rem] truncate py-2 pr-3" title={invoice.cliente}>{invoice.cliente}</td><td className="whitespace-nowrap py-2 pr-3 tabular-nums">{cents(invoice.importeCentimos)}</td><td className="whitespace-nowrap py-2">{invoice.vencimiento ? displayDate(invoice.vencimiento) : 'Sin vencimiento'}</td></tr>)}</tbody></table></div>{remaining > 0 && <p className="mt-2 text-xs font-semibold text-slate-700">y {remaining} más · total {cents(item.composicionImporteCentimos)}</p>}</>)}</details>;
}
function contentSummary(item: Proposal) {
  if (item.composicionTotal === 0) return null;
  return <CompositionDetails item={item} />;
}
function proposalExtra(item: Proposal): ReactNode {
  const differences = item.lineas.filter((line) => line.tipo === 'DIFERENCIA');
  return <>{item.par && <p className="mt-2 rounded-lg bg-sky-50 p-2 text-sm text-sky-950">Sale de {item.par.cuentaAlias || 'otra cuenta propia'} el {displayDate(item.par.fecha)} por {cents(item.par.importeCentimos)}.</p>}{differences.map((line, index) => <p key={`${line.referencia}-${index}`} className="mt-2 text-sm font-semibold text-amber-950">Gastos/intereses del banco: {cents(line.importeCentimos)}</p>)}{contentSummary(item)}</>;
}

export default function NewCollectionProposalsWorkspace({ enabled, disabled = false, profile, onChanged }: Readonly<{ enabled: boolean; disabled?: boolean; profile: EasyAccessProfile | null; onChanged?: () => void }>) {
  const [data, setData] = useState<CollectionRead | null>(null);
  const [levelFilter, setLevelFilter] = useState<Level>('EXACTA');
  const [method, setMethod] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Record<string, Selection>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [localBlocks, setLocalBlocks] = useState<readonly RecentBlock[]>([]);
  const sequence = useRef(0);
  const profileChecked = profile !== null;
  const mayWrite = mayWriteEasyWorkspace(profile);
  const actionBusy = disabled || !mayWrite || loading || refreshing || submitting || pending !== null;

  const load = useCallback(async (silent = false, preserveNotice = false) => {
    if (!enabled) return;
    const currentSequence = ++sequence.current;
    if (silent) setRefreshing(true); else setLoading(true);
    const params = new URLSearchParams({ nivel: levelFilter, limit: String(COLLECTION_PROPOSALS_PAGE_SIZE), offset: String(offset) });
    if (method) params.set('metodo', method);
    if (query.trim()) params.set('q', query.trim().slice(0, MAX_SEARCH));
    try {
      const response = await fetch(`${API}?${params.toString()}`, { cache: 'no-store' });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new RequestFailure('No se ha podido cargar la lista de cobros. Vuelve a intentarlo.', response.status >= 500);
      const next = parseCollectionProposalsRead(raw);
      if (currentSequence !== sequence.current) return;
      setData(next);
      setSelected((current) => replaceCollectionSelection(current, next.items));
      const filteredTotal = method
        ? next.totales.porMetodo.find((item) => item.metodo === method)?.[levelFilter === 'EXACTA' ? 'exactas' : 'revisar']
        : next.totales[levelFilter === 'EXACTA' ? 'exactas' : 'revisar'];
      if (!query.trim() && filteredTotal && next.offset >= filteredTotal) setOffset(Math.floor((filteredTotal - 1) / COLLECTION_PROPOSALS_PAGE_SIZE) * COLLECTION_PROPOSALS_PAGE_SIZE);
      if (!preserveNotice) setNotice(null);
    } catch (error) {
      if (currentSequence !== sequence.current) return;
      setNotice({ tone: 'error', text: error instanceof RequestFailure ? error.message : 'No se ha podido cargar la lista de cobros. Vuelve a intentarlo.' });
    } finally {
      if (currentSequence === sequence.current) { setLoading(false); setRefreshing(false); }
    }
  }, [enabled, levelFilter, method, offset, query]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSelected({}); }, [levelFilter, method, query]);

  const rows = useMemo(() => sortCollectionProposals(data?.items ?? []), [data]);
  const chosen = useMemo(() => rows.filter((item) => Boolean(selected[item.propuestaId])), [rows, selected]);
  const chosenTotal = useMemo(() => chosen.reduce((sum, item) => sum + item.importeMovimientoCentimos, 0), [chosen]);
  const publishedLevelTotal = data ? (method ? data.totales.porMetodo.find((item) => item.metodo === method)?.[levelFilter === 'EXACTA' ? 'exactas' : 'revisar'] : data.totales[levelFilter === 'EXACTA' ? 'exactas' : 'revisar']) : 0;
  // El contrato no publica un total después de buscar texto. En ese caso sólo
  // avanzamos cuando la página completa indica que podría haber otra.
  const pages = data ? pageRange(query.trim() ? data.offset + rows.length + (rows.length === data.limit ? data.limit : 0) : publishedLevelTotal ?? 0, data.offset, data.limit) : null;
  const mayHaveNextPage = Boolean(data && (query.trim() ? rows.length === data.limit : pages?.next !== null));
  const recentBlocks = useMemo(() => {
    const blocks = new Map<string, RecentBlock>();
    for (const block of data?.bloquesRecientes ?? []) if (!block.revertido) blocks.set(block.bloqueId, block);
    for (const block of localBlocks) if (block.revertido) blocks.delete(block.bloqueId); else blocks.set(block.bloqueId, block);
    return [...blocks.values()].sort((left, right) => right.at.localeCompare(left.at));
  }, [data, localBlocks]);
  const noWriteReason = !profileChecked ? 'Estamos comprobando tu permiso antes de permitir cambios.' : !mayWrite ? 'Tu permiso actual permite revisar la lista, pero no confirmar ni deshacer cobros.' : disabled ? 'Hay otra acción pendiente de comprobar. Termínala antes de confirmar o deshacer este bloque.' : null;

  function resetPage(change: () => void) { change(); setOffset(0); setSelected({}); }
  function toggle(item: Proposal) {
    if (actionBusy || !profileChecked || !item.seleccionable) return;
    setSelected((current) => {
      const next = { ...current };
      if (next[item.propuestaId]) delete next[item.propuestaId];
      else {
        // El servidor confirma una remesa de una en una. Su etiqueta sólo abre
        // la revisión: nunca se usa para inferir facturas ni para confirmar.
        if (levelFilter === 'REVISAR' || remittanceMethod(item.metodo)) return { [item.propuestaId]: selectionFrom(item) };
        if (Object.values(next).some((selectedItem) => remittanceMethod(selectedItem.metodo))) return next;
        if (Object.keys(next).length >= COLLECTION_PROPOSALS_MAX_BLOCK) return next;
        next[item.propuestaId] = selectionFrom(item);
      }
      return next;
    });
  }
  function selectFirst() {
    if (actionBusy || !profileChecked) return;
    const available = rows.filter((item) => item.seleccionable && !remittanceMethod(item.metodo)).slice(0, levelFilter === 'REVISAR' ? 1 : COLLECTION_PROPOSALS_MAX_BLOCK);
    setSelected(Object.fromEntries(available.map((item) => [item.propuestaId, selectionFrom(item)])));
  }
  function requestConfirmation() {
    if (actionBusy || !profileChecked || !data || chosen.length === 0) return;
    const selectedRemittances = chosen.filter((item) => remittanceMethod(item.metodo));
    if (selectedRemittances.length > 0 && (chosen.length !== 1 || selectedRemittances.length !== 1 || !selectedRemittances[0].preview.remesaDetalle)) {
      setNotice({ tone: 'error', text: 'La remesa debe revisarse sola con su composición completa antes de confirmar.' });
      return;
    }
    const payload = buildCollectionConfirmPayload(makeIdempotencyKey(), data.previewToken, chosen);
    if (!payload) { setNotice({ tone: 'error', text: 'La selección ya no está disponible. Actualiza la lista y vuelve a revisarla.' }); return; }
    setConfirmation({ kind: 'confirm', payload, rows: chosen.map(selectionFrom), remesaDetalle: selectedRemittances[0]?.preview.remesaDetalle ?? null });
  }
  function requestUndo(block: RecentBlock) {
    if (actionBusy || !profileChecked) return;
    const payload = buildCollectionUndoPayload(makeIdempotencyKey(), block.bloqueId);
    if (!payload) { setNotice({ tone: 'error', text: 'No se ha podido preparar la reversión de este bloque. Actualiza la lista.' }); return; }
    void send({ kind: 'undo', payload, block });
  }
  function serverMessage(body: unknown, fallback: string): string {
    if (!body || typeof body !== 'object') return fallback;
    const raw = body as { error?: unknown; mensaje?: unknown; message?: unknown };
    const value = [raw.error, raw.mensaje, raw.message].find((item) => typeof item === 'string' && item.trim()) as string | undefined;
    return value ? value.trim().slice(0, 600) : fallback;
  }
  async function send(action: PendingAction) {
    if (submitting || !profileChecked || !mayWrite || disabled) return;
    setSubmitting(true);
    try {
      const response = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action.payload) });
      const raw: unknown = await response.json().catch(() => null);
      if (response.status === 409) {
        setConfirmation(null); setPending(null);
        setNotice({ tone: 'info', text: `${serverMessage(raw, 'Esta propuesta ha cambiado.')} La lista se ha actualizado.` });
        await load(true, true);
        return;
      }
      if (!response.ok) throw new RequestFailure(serverMessage(raw, 'No se ha podido completar la acción. Vuelve a intentarlo.'), response.status >= 500);
      const receipt = record(raw, 'resultado');
      if (receipt.ok !== true) throw new RequestFailure('No se ha podido comprobar el resultado. Reintenta la misma acción antes de hacer otra modificación.', true);
      if (action.kind === 'confirm') {
        const blockId = uuid(receipt.bloqueId, 'resultado.bloqueId');
        const confirmed = nonNegative(receipt.confirmadas, 'resultado.confirmadas');
        const amount = integer(receipt.importeCentimos, 'resultado.importeCentimos');
        if (confirmed !== action.rows.length || confirmed > COLLECTION_PROPOSALS_MAX_BLOCK) throw new RequestFailure('No se ha podido comprobar el resultado. Reintenta la misma acción antes de hacer otra modificación.', true);
        const block: RecentBlock = { bloqueId: blockId, at: new Date().toISOString(), confirmadas: confirmed, importeCentimos: amount, revertido: false };
        setLocalBlocks((current) => [block, ...current.filter((item) => item.bloqueId !== block.bloqueId)]);
        setSelected({}); setConfirmation(null); setPending(null);
        setNotice({ tone: 'success', text: `Hecho: ${confirmed} ${confirmed === 1 ? 'cobro confirmado' : 'cobros confirmados'} (${cents(amount)}).` });
      } else {
        if (uuid(receipt.bloqueId, 'resultado.bloqueId').toLowerCase() !== action.block.bloqueId.toLowerCase()) throw new RequestFailure('No se ha podido comprobar el resultado. Reintenta la misma acción antes de hacer otra modificación.', true);
        const reverted = nonNegative(receipt.revertidas, 'resultado.revertidas');
        if (reverted < 1) throw new RequestFailure('No se ha podido comprobar el resultado. Reintenta la misma acción antes de hacer otra modificación.', true);
        setLocalBlocks((current) => current.map((item) => item.bloqueId === action.block.bloqueId ? { ...item, revertido: true } : item));
        setPending(null);
        setNotice({ tone: 'success', text: 'Deshecho: los cobros vuelven a estar pendientes.' });
      }
      void Promise.resolve(onChanged?.()).catch(() => undefined);
      await load(true, true);
    } catch (error) {
      const uncertain = error instanceof RequestFailure ? error.uncertain : error instanceof TypeError || (error instanceof Error && /network|red|timeout|fetch/i.test(error.message));
      const message = error instanceof RequestFailure ? error.message : 'No se ha podido completar la acción. Vuelve a intentarlo.';
      setConfirmation(null);
      if (uncertain) { setPending(action); setNotice({ tone: 'error', text: `Resultado pendiente de comprobar. Reintenta exactamente la misma acción antes de continuar. ${message}` }); }
      else { setPending(null); setNotice({ tone: 'error', text: message }); }
    } finally { setSubmitting(false); }
  }

  if (!enabled) return null;
  const noticeClass = notice?.tone === 'error' ? 'border-red-300 bg-red-50 text-red-950' : notice?.tone === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-blue-300 bg-blue-50 text-blue-950';
  return <section className="space-y-4" aria-labelledby="collection-proposals-title">
    <header className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="collection-proposals-title" className="text-xl font-extrabold text-slate-950">Cobros con factura propuesta</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">Cada cobro del banco con la factura o remesa que lo explica. Revisa y confirma de mayor a menor importe.</p></div><button type="button" disabled={loading || refreshing || submitting || pending !== null} onClick={() => void load(true, true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50"><ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />Actualizar</button></div>
      <p className="mt-4 rounded-xl border border-emerald-200 bg-white p-3 text-sm text-slate-800">{data ? <><strong className="text-slate-950">{data.totales.exactas} propuestas listas · {cents(data.totales.exactasImporteCentimos)}</strong><span className="mx-2 text-slate-400" aria-hidden="true">·</span><strong className="text-slate-950">{data.totales.revisar}</strong> para revisar una a una</> : 'Cargando las propuestas de cobro…'}</p>
    </header>

    {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${noticeClass}`}>{notice.text}</p>}
    {pending && <section role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4"><h3 className="font-extrabold text-amber-950">Resultado pendiente de comprobar</h3><p className="mt-1 text-sm leading-6 text-amber-950">No hagas otra modificación. Reintenta el mismo envío para recuperar su resultado.</p><button type="button" disabled={submitting} onClick={() => { const action = retryCollectionAction(pending); if (action) void send(action); }} className="mt-3 min-h-10 rounded-lg bg-amber-800 px-4 py-2 text-sm font-bold text-white hover:bg-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-600 disabled:opacity-50">{submitting ? 'Reintentando…' : 'Reintentar la misma acción'}</button></section>}
    {noWriteReason && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Modo consulta temporal.</strong> {noWriteReason}</p>}

    {recentBlocks.length > 0 && <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4" aria-labelledby="collection-done-title"><div className="flex gap-2"><CheckCircleIcon className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" /><div><h3 id="collection-done-title" className="font-extrabold text-emerald-950">Hecho</h3><p className="mt-1 text-sm text-emerald-950">Puedes deshacer un bloque completo si detectas un error.</p></div></div><ul className="mt-3 space-y-2">{recentBlocks.map((block) => <li key={block.bloqueId} className="flex flex-col gap-2 rounded-lg bg-white p-3 sm:flex-row sm:items-center sm:justify-between"><p className="font-bold text-slate-950">Hecho: {block.confirmadas} {block.confirmadas === 1 ? 'cobro confirmado' : 'cobros confirmados'} ({cents(block.importeCentimos)})</p><button type="button" disabled={actionBusy || !profileChecked} title={noWriteReason ?? undefined} onClick={() => requestUndo(block)} className="min-h-10 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-600 disabled:cursor-not-allowed disabled:opacity-50">Deshacer este bloque</button></li>)}</ul></section>}

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Lista de propuestas de cobro"><div className="grid gap-3 lg:grid-cols-3"><label className="text-sm font-bold text-slate-800">Tipo<select value={method} onChange={(event) => resetPage(() => setMethod(event.target.value))} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600"><option value="">Todas</option>{data?.totales.porMetodo.map((item) => <option key={item.metodo} value={item.metodo}>{item.etiqueta}</option>)}</select></label><fieldset><legend className="text-sm font-bold text-slate-800">Mostrar</legend><div className="mt-1 inline-flex min-h-10 rounded-lg border border-slate-300 p-1" role="group" aria-label="Nivel de revisión"><button type="button" aria-pressed={levelFilter === 'EXACTA'} onClick={() => resetPage(() => setLevelFilter('EXACTA'))} className={`rounded-md px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-600 ${levelFilter === 'EXACTA' ? 'bg-emerald-700 text-white' : 'text-slate-800 hover:bg-slate-100'}`}>Listas para confirmar</button><button type="button" aria-pressed={levelFilter === 'REVISAR'} onClick={() => resetPage(() => setLevelFilter('REVISAR'))} className={`rounded-md px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-600 ${levelFilter === 'REVISAR' ? 'bg-amber-600 text-white' : 'text-slate-800 hover:bg-slate-100'}`}>Revisar una a una</button></div></fieldset><label className="text-sm font-bold text-slate-800">Buscar<div className="mt-1 flex"><input value={query} maxLength={MAX_SEARCH} onChange={(event) => resetPage(() => setQuery(event.target.value))} placeholder="Concepto, banco o factura…" className="min-h-10 min-w-0 flex-1 rounded-l-lg border border-slate-300 px-3 py-2 text-slate-950 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600" /><span className="inline-flex min-h-10 items-center rounded-r-lg bg-slate-900 px-3 text-white" aria-hidden="true"><MagnifyingGlassIcon className="h-5 w-5" /></span></div></label></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><div><p className="text-sm text-slate-700">{chosen.length ? <><strong className="text-slate-950">{chosen.length}</strong> seleccionado{chosen.length === 1 ? '' : 's'} · <strong className="text-slate-950">{cents(chosenTotal)}</strong></> : levelFilter === 'REVISAR' ? 'Elige un solo cobro para revisarlo antes de confirmar.' : 'Marca los cobros que quieras confirmar juntos.'}</p>{levelFilter === 'EXACTA' && <button type="button" disabled={actionBusy || !profileChecked || rows.filter((item) => item.seleccionable).length === 0} title={noWriteReason ?? undefined} onClick={selectFirst} className="mt-2 min-h-10 text-sm font-bold text-emerald-800 underline decoration-emerald-400 underline-offset-4 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">Seleccionar las 12 primeras listas</button>}</div><button type="button" disabled={actionBusy || !profileChecked || chosen.length === 0} title={noWriteReason ?? undefined} onClick={requestConfirmation} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheckIcon className="h-5 w-5" aria-hidden="true" />Confirmar seleccionados</button></div>

      {!loading && rows.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-700">No hay propuestas para estos filtros.</p>}
      <div className="mt-4 space-y-3 md:hidden">{rows.map((item) => { const disabledRow = actionBusy || !profileChecked || !item.seleccionable || (levelFilter === 'REVISAR' && chosen.length > 0 && !selected[item.propuestaId]); return <article key={item.propuestaId} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start gap-3"><input aria-label={`Seleccionar ${item.concepto || item.etiquetaMetodo}`} type="checkbox" checked={Boolean(selected[item.propuestaId])} disabled={disabledRow} title={!item.seleccionable ? item.motivoNoSeleccionable ?? 'Este cobro no está disponible para confirmar.' : noWriteReason ?? undefined} onChange={() => toggle(item)} className="mt-0.5 h-10 w-10 shrink-0" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-extrabold text-slate-950">{displayDate(item.fecha)}</p><p className="mt-1 text-sm text-slate-600">{item.banco}{item.cuentaAlias ? ` · ${item.cuentaAlias}` : ''}</p></div><p className="shrink-0 font-extrabold tabular-nums text-slate-950">{cents(item.importeMovimientoCentimos)}</p></div><p className="mt-2 truncate text-sm font-semibold text-slate-900" title={item.concepto}>{item.concepto || 'Sin concepto indicado'}</p><p className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-950">{item.etiquetaMetodo}</p><p className="mt-2 text-sm leading-5 text-slate-700">{item.explicacion}</p>{!item.seleccionable && <p className="mt-2 text-sm font-semibold text-amber-950">{item.motivoNoSeleccionable || 'Este cobro no está disponible para confirmar.'}</p>}{proposalExtra(item)}</div></div></article>; })}</div>
      <div className="mt-4 hidden overflow-x-auto md:block"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600"><tr><th className="w-12 p-3"><span className="sr-only">Seleccionar</span></th><th className="p-3">Fecha</th><th className="p-3">Banco / cuenta</th><th className="p-3">Concepto</th><th className="p-3 text-right">Importe</th><th className="p-3">Tipo y explicación</th></tr></thead><tbody>{rows.map((item) => { const disabledRow = actionBusy || !profileChecked || !item.seleccionable || (levelFilter === 'REVISAR' && chosen.length > 0 && !selected[item.propuestaId]); return <tr key={item.propuestaId} className="border-b border-slate-200 align-top"><td className="p-3"><input aria-label={`Seleccionar ${item.concepto || item.etiquetaMetodo}`} type="checkbox" checked={Boolean(selected[item.propuestaId])} disabled={disabledRow} title={!item.seleccionable ? item.motivoNoSeleccionable ?? 'Este cobro no está disponible para confirmar.' : noWriteReason ?? undefined} onChange={() => toggle(item)} className="h-10 w-10" /></td><td className="whitespace-nowrap p-3 font-semibold text-slate-900">{displayDate(item.fecha)}</td><td className="p-3 text-slate-700">{item.banco}{item.cuentaAlias ? <><br />{item.cuentaAlias}</> : null}</td><td className="max-w-[17rem] p-3"><p className="truncate font-semibold text-slate-900" title={item.concepto}>{item.concepto || 'Sin concepto indicado'}</p></td><td className="whitespace-nowrap p-3 text-right font-extrabold tabular-nums text-slate-950">{cents(item.importeMovimientoCentimos)}</td><td className="min-w-[19rem] p-3"><p className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-950">{item.etiquetaMetodo}</p><p className="mt-2 leading-5 text-slate-700">{item.explicacion}</p>{!item.seleccionable && <p className="mt-2 text-sm font-semibold text-amber-950">{item.motivoNoSeleccionable || 'Este cobro no está disponible para confirmar.'}</p>}{proposalExtra(item)}</td></tr>; })}</tbody></table></div>
      {data && pages && <nav aria-label="Paginación de cobros con factura propuesta" className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-4"><button type="button" disabled={loading || data.offset === 0} onClick={() => { setOffset(Math.max(0, data.offset - data.limit)); setSelected({}); }} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50"><ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />Anterior</button><span className="text-sm text-slate-700">{rows.length ? `${data.offset + 1}–${data.offset + rows.length}${query.trim() ? '' : ` de ${publishedLevelTotal ?? 0}`}` : 'Sin resultados'}</span><button type="button" disabled={loading || !mayHaveNextPage} onClick={() => { setOffset(data.offset + data.limit); setSelected({}); }} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50">Siguiente<ChevronRightIcon className="h-4 w-4" aria-hidden="true" /></button></nav>}
    </section>
    {confirmation && <ConfirmationDialog action={confirmation} busy={submitting} onCancel={() => { if (!submitting) setConfirmation(null); }} onConfirm={() => void send(confirmation)} />}
  </section>;
}
