'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDownTrayIcon, ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon,
  ChevronDownIcon, ChevronUpDownIcon, ChevronUpIcon, ExclamationTriangleIcon, MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import {
  CONCILIAR_COLORS, CONCILIAR_GROUPS, CONCILIAR_TABS, formatDate, formatMagnitude, formatMoney,
  makeIdempotencyKey, parseConciliarActionResponse, parseConciliarHistoryResponse, parseConciliarReadResponse, parseConciliarRemesaPreviewResponse, parseConciliarUndoResponse,
  safeDocumentHref, safeFinanceHref, safeOutcomeMessage,
  type ConciliarActionResponse, type ConciliarColor, type ConciliarConfirmItem, type ConciliarMutationPayload,
  type ConciliarEmitidasGroup, type ConciliarGroup, type ConciliarReadResponse, type ConciliarRemesaPreview, type ConciliarRow, type ConciliarSortDirection, type ConciliarSortField, type ConciliarSummary, type ConciliarTab,
} from './conciliar-contract';
import { areAllVisibleGreensSelected, groupExplanation, humanGroup, requiresSeparateRemesaConfirmation, reviewSelectionForCurrentRows, setRowSelected, setVisibleGreenSelected } from './conciliar-ui-helpers';
import { ConciliarStreamRejectedError, ConciliarStreamUncertainError, readConciliarBatchResponse, type ConciliarClientBatchProgress } from './conciliar-batch-client';
import { useActuation } from '@/components/impersonation/ActuationProvider';
import { parseConciliarDocumentDetail, type ConciliarDocumentDetail } from '@/lib/finanzas/conciliar-document-detail-contract';
import { ConciliarDetailMemoryCache, conciliarDetailCacheKey } from './conciliar-detail-client';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
const loadConciliarDocumentPreview = () => import('./ConciliarDocumentPreview');
const ConciliarDocumentPreview = dynamic(loadConciliarDocumentPreview);
const ConciliarRecentHistory = dynamic(() => import('./ConciliarRecentHistory'));
const ConciliarRemesaConfirmationDialog = dynamic(() => import('./ConciliarRemesaConfirmationDialog'));
const ConfirmingInterestInvoices = dynamic(() => import('./ConfirmingInterestInvoices'), { ssr: false });

const API = '/api/admin/finanzas/conciliar';
const REMESA_PREVIEW_API = '/api/admin/finanzas/conciliar/remesa-preview';
const DOCUMENT_DETAIL_API = '/api/admin/finanzas/conciliar/detalle';
/** Cada lectura visible es una página exacta autorizada por el servidor. */
const PAGE_SIZE = 20;
const EXPORT_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 5_000;

type Notice = Readonly<{ tone: 'success' | 'error' | 'info'; text: string }> | null;
type Retry = Readonly<{ payload: ConciliarMutationPayload; label: string }> | null;
type Receipt = Readonly<{
  key: string;
  rowId: string;
  label: string;
  message: string;
  operationId: string | null;
  status: 'done' | 'asked' | 'undone' | 'failed';
  createdAt: number;
}>;
type OpenDocument = Readonly<{ row: ConciliarRow; status: 'loading' | 'ready' | 'error'; detail: ConciliarDocumentDetail | null; error: string | null }> | null;
type RemesaConfirmation = Readonly<{ row: ConciliarRow; preview: ConciliarRemesaPreview; payload: ConciliarMutationPayload }> | null;
type BatchResult = Readonly<{ operationId: string | null; outcomes: readonly Readonly<{ id: string; label: string; ok: boolean; message: string }>[] }>;

/** Una respuesta 2xx malformada no prueba que la acción no haya llegado al servidor. */
class UncertainResultError extends Error {}

const TAB_COPY: Record<ConciliarTab, Readonly<{ title: string; question: string; short: string }>> = {
  COBROS: { title: 'Cobros sin factura', question: '¿De qué factura es?', short: 'Cobros' },
  EMITIDAS: { title: 'Facturas sin cobro confirmado', question: '¿Hay un cobro que casa?', short: 'Emitidas' },
  PAGOS: { title: 'Pagos sin factura', question: '¿Qué papel lo justifica?', short: 'Pagos' },
  RECIBIDAS: { title: 'Facturas sin pagar', question: '¿Hay un pago que casa?', short: 'Recibidas' },
};

const COLOR_COPY: Record<ConciliarColor, Readonly<{ label: string; description: string; badge: string; dot: string; bar: string }>> = {
  VERDE: { label: 'Verde · listo', description: 'Coincide y está listo para confirmar.', badge: 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-100', dot: 'bg-emerald-600', bar: 'bg-emerald-600' },
  AMBAR: { label: 'Ámbar · revisar', description: 'Hay algo que comprobar antes de decidir.', badge: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100', dot: 'bg-amber-500', bar: 'bg-amber-500' },
  ROJO: { label: 'Rojo · falta el papel', description: 'Falta un papel; añádelo a Para pedir.', badge: 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/45 dark:text-red-100', dot: 'bg-red-600', bar: 'bg-red-600' },
};

const EMITIDAS_GROUP_COPY: Record<ConciliarEmitidasGroup, Readonly<{ label: string; rule: string; dot: string; active: string; idle: string }>> = {
  CON_PROPUESTA: { label: 'Con propuesta', rule: 'Verde con propuesta', dot: 'bg-emerald-600', active: 'border-emerald-600 bg-emerald-50 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/45 dark:text-emerald-100', idle: 'border-emerald-200 bg-white text-emerald-950 hover:border-emerald-500 dark:border-emerald-900 dark:bg-slate-900 dark:text-emerald-100' },
  PARA_REVISAR: { label: 'Para revisar', rule: 'Ámbar, incluido importe 0', dot: 'bg-amber-500', active: 'border-amber-500 bg-amber-50 text-amber-950 dark:border-amber-400 dark:bg-amber-950/45 dark:text-amber-100', idle: 'border-amber-200 bg-white text-amber-950 hover:border-amber-500 dark:border-amber-900 dark:bg-slate-900 dark:text-amber-100' },
  SIN_PROPUESTA: { label: 'Sin propuesta', rule: 'Rojo', dot: 'bg-red-600', active: 'border-red-600 bg-red-50 text-red-950 dark:border-red-500 dark:bg-red-950/45 dark:text-red-100', idle: 'border-red-200 bg-white text-red-950 hover:border-red-500 dark:border-red-900 dark:bg-slate-900 dark:text-red-100' },
};

const GROUP_FILTER_COPY: Record<ConciliarGroup, string> = {
  BANCO: 'Gastos del banco', PROVEEDORES: 'Proveedores', TARJETA: 'Tarjeta', NOMINAS: 'Nóminas',
  IMPUESTOS: 'Impuestos y Seguridad Social', TRASPASOS: 'Traspasos', CONFIRMING: 'Confirming y cesiones',
  REMESAS: 'Remesas', CLIENTES: 'Facturas de clientes', PRESTAMOS: 'Préstamos', DEVOLUCIONES: 'Devoluciones',
};

function accountLabel(account: { banco: string; cuenta: string | null }): string {
  return `${account.banco}${account.cuenta ? ` · ${account.cuenta}` : ''}`;
}

function dateForInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function friendlyError(value: unknown, fallback: string): string {
  const raw = value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
    ? (value as { error: string }).error : '';
  const normalized = raw.toLocaleLowerCase('es-ES');
  if (/permiso|autoriz/.test(normalized)) return 'No tienes permiso para completar esta acción.';
  if (/cambi|conflict|concurrent|desactualiz/.test(normalized)) return 'Estos datos han cambiado. Actualiza la lista y vuelve a confirmar.';
  return safeOutcomeMessage(raw, fallback);
}

function isUncertain(error: unknown): boolean {
  return error instanceof UncertainResultError || error instanceof TypeError || (error instanceof Error && /network|fetch|timeout|red/i.test(error.message));
}

/** Sólo abre la vista previa; el servidor comprueba tipo, fuente y remesa única. */
function remesaHint(row: ConciliarRow): boolean {
  return requiresSeparateRemesaConfirmation(row);
}

function humanUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'recién actualizada';
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function buildQuery(input: Readonly<{ tab: ConciliarTab; from: string; to: string; accountId: string; query: string; cutoffDate: string; historic?: boolean; emitidasGrupo?: ConciliarEmitidasGroup | ''; estado?: ConciliarColor | ''; grupo?: ConciliarGroup | ''; orden?: ConciliarSortField; direccion?: ConciliarSortDirection; limit: number; offset: number }>): URLSearchParams {
  const params = new URLSearchParams({ tab: input.tab, limit: String(input.limit), offset: String(input.offset) });
  if (input.from) params.set('desde', input.from);
  if (input.to) params.set('hasta', input.to);
  if (input.accountId) params.set('cuentaId', input.accountId);
  if (input.query.trim()) params.set('q', input.query.trim().slice(0, 120));
  params.set('cutoffDate', input.cutoffDate);
  if (input.historic) params.set('historic', '1');
  if (input.emitidasGrupo && input.tab === 'EMITIDAS' && !input.historic) params.set('emitidasGrupo', input.emitidasGrupo);
  if (input.estado) params.set('estado', input.estado);
  if (input.grupo) params.set('grupo', input.grupo);
  if (input.orden) params.set('orden', input.orden);
  if (input.direccion) params.set('direccion', input.direccion);
  return params;
}

/** UI state becomes a closed, normalized response view. It is presentation only:
 * rows, amounts, IDs and authority remain exclusively server-derived. */
function responseViewFor(input: Readonly<{ tab: ConciliarTab; from: string; to: string; accountId: string; query: string; cutoffDate: string; emitidasGrupo: ConciliarEmitidasGroup | ''; estado: ConciliarColor | ''; grupo: ConciliarGroup | ''; orden?: ConciliarSortField; direccion?: ConciliarSortDirection; limit: number; offset: number }>) {
  return {
    tab: input.tab,
    ...(input.from ? { desde: input.from } : {}),
    ...(input.to ? { hasta: input.to } : {}),
    ...(input.accountId ? { cuentaId: input.accountId } : {}),
    ...(input.query.trim() ? { q: input.query.trim().slice(0, 120) } : {}),
    cutoffDate: input.cutoffDate,
    historic: false,
    ...(input.tab === 'EMITIDAS' && input.emitidasGrupo ? { emitidasGrupo: input.emitidasGrupo } : {}),
    ...(input.estado ? { estado: input.estado } : {}),
    ...(input.grupo ? { grupo: input.grupo } : {}),
    ...(input.orden ? { orden: input.orden } : {}),
    ...(input.direccion ? { direccion: input.direccion } : {}),
    limit: input.limit,
    offset: input.offset,
  };
}
function responseViewKey(view: Readonly<{ tab: ConciliarTab; desde?: string; hasta?: string; cuentaId?: string; q?: string; cutoffDate?: string; historic?: boolean; emitidasGrupo?: ConciliarEmitidasGroup; estado?: ConciliarColor; grupo?: ConciliarGroup; orden?: ConciliarSortField; direccion?: ConciliarSortDirection; limit: number; offset: number }>): string {
  return buildQuery({
    tab: view.tab, from: view.desde ?? '', to: view.hasta ?? '', accountId: view.cuentaId ?? '', query: view.q ?? '',
    cutoffDate: view.cutoffDate ?? '2026-01-01', historic: view.historic ?? false, emitidasGrupo: view.emitidasGrupo ?? '', estado: view.estado ?? '', grupo: view.grupo ?? '', orden: view.orden, direccion: view.direccion, limit: view.limit, offset: view.offset,
  }).toString();
}

function colorWidth(summary: ConciliarSummary, color: ConciliarColor): number {
  const total = CONCILIAR_COLORS.reduce((sum, item) => sum + Math.abs(summary.colors[item].amountCentimos), 0);
  if (total === 0) return 0;
  return Math.max(0, Math.min(100, (Math.abs(summary.colors[color].amountCentimos) / total) * 100));
}

function Skeleton() {
  return <div aria-busy="true" aria-label="Cargando conciliación" className="space-y-2 p-3 sm:p-4">
    {Array.from({ length: 7 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}
  </div>;
}

function Empty({ text }: { text: string }) {
  return <div className="p-7 text-center text-sm text-slate-600 dark:text-slate-300">{text}</div>;
}

function SortHeader({ field, label, active, direction, onChange, align = 'left' }: { field: ConciliarSortField; label: string; active: boolean; direction: ConciliarSortDirection; onChange: (field: ConciliarSortField) => void; align?: 'left' | 'right' }) {
  const Icon = !active ? ChevronUpDownIcon : direction === 'ASC' ? ChevronUpIcon : ChevronDownIcon;
  const ariaSort = active ? direction === 'ASC' ? 'ascending' : 'descending' : 'none';
  return <span role="columnheader" aria-sort={ariaSort} className={align === 'right' ? 'text-right' : ''}><button type="button" onClick={() => onChange(field)} aria-label={`Ordenar por ${label}${active ? `, actualmente ${direction === 'ASC' ? 'ascendente' : 'descendente'}` : ''}`} className={`inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-[#BF3E00] focus:outline-none focus:ring-2 focus:ring-[#FF5300] ${align === 'right' ? 'ml-auto' : ''}`}>{label}<Icon className="h-3.5 w-3.5" aria-hidden="true" /></button></span>;
}

function SummaryTab({ summary, active, onClick }: { summary: ConciliarSummary; active: boolean; onClick: () => void }) {
  const content = TAB_COPY[summary.tab];
  const ariaBar = CONCILIAR_COLORS.map((color) => `${COLOR_COPY[color].label}: ${summary.colors[color].count} · ${formatMagnitude(summary.colors[color].amountCentimos)}`).join('. ');
  return <button type="button" role="tab" id={`conciliar-tab-${summary.tab}`} aria-controls={`conciliar-panel-${summary.tab}`} aria-selected={active} onClick={onClick} className={`min-w-0 rounded-xl border p-3 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#FF5300] focus:ring-offset-2 dark:focus:ring-offset-slate-950 ${active ? 'border-[#FF5300] bg-[#2D2A26] text-white' : 'border-slate-200 bg-white text-[#2D2A26] hover:border-[#FF5300] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'}`}>
    <span className={`block truncate text-xs font-bold uppercase tracking-wide ${active ? 'text-orange-200' : 'text-[#FF5300]'}`}>{content.short}</span>
    <span className="mt-1 block text-2xl font-extrabold tabular-nums">{summary.count.toLocaleString('es-ES')}</span>
    <span className={`mt-0.5 block truncate text-xs font-semibold tabular-nums ${active ? 'text-slate-200' : 'text-slate-600 dark:text-slate-300'}`}>{formatMoney(summary.amountCentimos)}</span>
    <span className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="img" aria-label={ariaBar}>
      {CONCILIAR_COLORS.map((color) => <span key={color} className={COLOR_COPY[color].bar} style={{ width: `${colorWidth(summary, color)}%` }} />)}
    </span>
    <span className="sr-only">{ariaBar}</span>
  </button>;
}

function EmitidasGroupFilters({ groups, activeGroup, onChange }: { groups: ConciliarReadResponse['emitidasGroups']; activeGroup: ConciliarEmitidasGroup | ''; onChange: (group: ConciliarEmitidasGroup) => void }) {
  return <section aria-label="Estado de facturas emitidas" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <div className="grid gap-2 sm:grid-cols-3">{groups.map((summary) => {
      const copy = EMITIDAS_GROUP_COPY[summary.group];
      const active = activeGroup === summary.group;
      return <button key={summary.group} type="button" aria-pressed={active} onClick={() => onChange(summary.group)} className={`rounded-lg border p-3 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#FF5300] focus:ring-offset-2 dark:focus:ring-offset-slate-950 ${active ? copy.active : copy.idle}`}>
        <span className="flex items-start justify-between gap-2"><span className="flex min-w-0 items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${copy.dot}`} aria-hidden="true" /><span className="truncate text-sm font-extrabold">{copy.label}</span></span><span className="shrink-0 text-lg font-extrabold tabular-nums">{summary.count.toLocaleString('es-ES')}</span></span>
        <span className="mt-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{copy.rule}</span>
        <span className="mt-2 block text-sm font-bold tabular-nums">{formatMagnitude(summary.amountCentimos)}</span>
      </button>;
    })}</div>
    <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">Los bloques ordenan la revisión; una propuesta no confirma el cobro ni marca la factura como cobrada.</p>
  </section>;
}

function Guide({ invoicePending }: { invoicePending: boolean }) {
  return <section aria-label="Guía rápida" className="grid gap-2 text-sm sm:grid-cols-3">
    {CONCILIAR_COLORS.map((color) => <p key={color} className={`rounded-lg border px-3 py-2 ${COLOR_COPY[color].badge}`}><span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${COLOR_COPY[color].dot}`} aria-hidden="true" /><strong>{COLOR_COPY[color].label.split(' · ')[0]}:</strong> {invoicePending ? color === 'VERDE' ? 'Hay un movimiento que casa: ábrelo y confirma allí.' : color === 'ROJO' ? 'La factura existe, pero aún no consta su cobro o pago confirmado.' : 'Revisa el saldo o el movimiento propuesto antes de decidir.' : COLOR_COPY[color].description}</p>)}
  </section>;
}

export type ConciliarDisplayGroup = Readonly<{
  key: string;
  label: string;
  explanation: string | null;
  rows: readonly ConciliarRow[];
  colorCounts: Readonly<Record<ConciliarColor, number>>;
}>;

type MutableConciliarDisplayGroup = {
  key: string;
  label: string;
  explanation: string | null;
  rows: ConciliarRow[];
  colorCounts: Record<ConciliarColor, number>;
};

/** Una clave de presentación reúne sin ambigüedad las variantes de una misma regla.
 * En particular, REMESA, REMESAS y sus subtipos se muestran como un solo grupo. */
function canonicalGroupLabel(row: ConciliarRow): string {
  if (!row.grupo) return row.color === 'ROJO' ? 'Para pedir' : 'Sin regla agrupada';
  return humanGroup(row.grupo);
}

function canonicalGroupKey(label: string): string {
  return label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-ES').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Agrupa primero por etiqueta canónica (nunca por color) y conserva el color de cada fila. */
export function groupConciliarRows(rows: readonly ConciliarRow[]): readonly ConciliarDisplayGroup[] {
  const groups = new Map<string, MutableConciliarDisplayGroup>();
  for (const row of rows) {
    const label = canonicalGroupLabel(row);
    const key = canonicalGroupKey(label) || 'sin-regla-agrupada';
    let group = groups.get(key);
    if (!group) {
      group = { key, label, explanation: groupExplanation(row.grupo) ?? groupExplanation(label), rows: [], colorCounts: { VERDE: 0, AMBAR: 0, ROJO: 0 } };
      groups.set(key, group);
    }
    group.rows.push(row);
    group.colorCounts[row.color] += 1;
  }
  const magnitude = (row: ConciliarRow) => Math.abs(row.importeCentimos);
  return [...groups.values()].map((group) => ({
    ...group,
    rows: group.rows.slice().sort((left, right) => magnitude(right) - magnitude(left) || left.id.localeCompare(right.id)),
  })).sort((left, right) => {
    const leftMagnitude = left.rows.length ? magnitude(left.rows[0]) : 0;
    const rightMagnitude = right.rows.length ? magnitude(right.rows[0]) : 0;
    return rightMagnitude - leftMagnitude || left.label.localeCompare(right.label, 'es-ES');
  });
}

function GroupHeader({ group }: { group: ConciliarDisplayGroup }) {
  const counts = CONCILIAR_COLORS.filter((color) => group.colorCounts[color] > 0);
  return <header className="flex min-w-0 items-start gap-2 px-2 pb-1 pt-4 first:pt-2">
    <div className="min-w-0"><h3 className="truncate text-sm font-extrabold text-[#2D2A26] dark:text-white">{group.label} <span className="font-medium text-slate-500 dark:text-slate-400">· {group.rows.length} en esta página</span></h3>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">{counts.map((color) => <span key={color} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${COLOR_COPY[color].dot}`} aria-hidden="true" />{COLOR_COPY[color].label.split(' · ')[0]}: {group.colorCounts[color]}</span>)}</p>
      {group.explanation && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{group.explanation}</p>}
    </div>
  </header>;
}

function ResultBadge({ receipt, onUndo, disabled }: { receipt: Receipt | undefined; onUndo: () => void; disabled: boolean }) {
  if (!receipt) return null;
  if (receipt.status === 'failed') return <span className="block truncate text-xs font-semibold text-red-700 dark:text-red-300" title={receipt.message}>No hecho</span>;
  if (receipt.status === 'undone') return <span className="block truncate text-xs font-semibold text-slate-600 dark:text-slate-300">Deshecho</span>;
  return <span className="flex min-w-0 items-center justify-end gap-1"><span className="truncate text-xs font-bold text-emerald-700 dark:text-emerald-300">{receipt.status === 'asked' ? 'Pedido' : 'Hecho'}</span>{receipt.status === 'done' && receipt.operationId && <button type="button" disabled={disabled} onClick={onUndo} className="shrink-0 text-xs font-bold text-[#FF5300] underline decoration-1 underline-offset-2 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:opacity-50">Deshacer</button>}</span>;
}

function MovementJump({ row }: { row: ConciliarRow }) {
  const link = row.linksMovimiento.map((item) => ({ ...item, href: safeFinanceHref(item.href) })).find((item) => item.href);
  if (!link) return null;
  return <a href={link.href!} className="truncate text-xs font-bold text-[#FF5300] underline decoration-1 underline-offset-2 focus:outline-none focus:ring-2 focus:ring-[#FF5300]" title={link.etiqueta}>{link.etiqueta || 'Ver movimiento que casa'}</a>;
}

function ConciliarRowView({ row, selected, selectionNeedsReview = false, receipt, busy, onSelect, onConfirm, onAsk, onOpen, onPrefetch, onUndo }: {
  row: ConciliarRow;
  selected: boolean;
  selectionNeedsReview?: boolean;
  receipt: Receipt | undefined;
  busy: boolean;
  onSelect: (checked: boolean) => void;
  onConfirm: () => void;
  onAsk: () => void;
  onOpen: (row: ConciliarRow) => void;
  onPrefetch: (row: ConciliarRow) => void;
  onUndo: () => void;
}) {
  const documentHref = safeDocumentHref(row.documento?.href ?? null);
  const isGreen = row.color === 'VERDE';
  const isRed = row.color === 'ROJO';
  const canConfirm = isGreen && row.seleccionable;
  const action = canConfirm ? <button type="button" disabled={busy} onClick={onConfirm} className="min-h-9 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1 disabled:opacity-50">Confirmar</button>
    : row.color === 'AMBAR' ? <button type="button" disabled={busy} onClick={() => onOpen(row)} className="min-h-9 rounded-md border border-amber-400 bg-white px-2.5 py-1.5 text-xs font-extrabold text-amber-900 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-slate-900 dark:text-amber-100">Abrir</button>
      : isRed && row.movimientoId ? <button type="button" disabled={busy} onClick={onAsk} className="min-h-9 rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs font-extrabold text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-slate-900 dark:text-red-100">Pedir</button>
        : <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{row.movimientoId ? 'Revisar' : 'Pendiente'}</span>;
  const account = [row.banco, row.cuenta].filter(Boolean).join(' · ') || 'Cuenta no disponible';
  const documentLabel = row.documento?.referencia || '—';
  const documentInfo = row.documento ? `${row.documento.tercero || ''} · ${formatMagnitude(row.documento.importeCentimos)} · ${formatDate(row.documento.fecha)}` : 'Sin documento propuesto';
  const management = row.gestionDocumento;
  const receivedFileHref = safeDocumentHref(management?.archivoHref ?? null) || (documentHref?.includes('/movimientos/') ? documentHref : null);
  const requestLabel = management?.documentoDisponible || management?.estado === 'RECIBIDO' ? 'Documento recibido · revisar y confirmar'
    : management?.estado === 'PEDIDO' && management.pedido ? `Pedido el ${formatDate(management.pedido.fecha)}${management.pedido.por ? ` · ${management.pedido.por}` : ''}`
      : management?.estado === 'PEDIDO_SIN_AUDITORIA' ? 'Pedido · fecha y persona no verificables' : null;
  return <article data-testid="conciliar-row" data-row-id={row.id} onMouseEnter={() => onPrefetch(row)} onFocus={() => onPrefetch(row)} onPointerDown={() => onPrefetch(row)} onTouchStart={() => onPrefetch(row)} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 border-t border-slate-100 px-2 py-2 hover:bg-orange-50/40 dark:border-slate-800 dark:hover:bg-orange-950/15 xl:grid-cols-[auto_minmax(88px,.55fr)_minmax(150px,1.5fr)_minmax(115px,.7fr)_minmax(180px,1fr)_auto_minmax(104px,.65fr)_auto] xl:gap-3 xl:px-3">
    <div className="hidden min-w-0 xl:block"><span className={`inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-1 text-xs font-bold ${COLOR_COPY[row.color].badge}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_COPY[row.color].dot}`} aria-hidden="true" />{isRed && !row.movimientoId ? 'Rojo · pendiente' : COLOR_COPY[row.color].label}</span></div>
    <p className="min-w-0 text-xs font-semibold text-slate-600 dark:text-slate-300" title={formatDate(row.fecha)}><span className={`mb-0.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold xl:hidden ${COLOR_COPY[row.color].badge}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_COPY[row.color].dot}`} aria-hidden="true" />{isRed && !row.movimientoId ? 'Rojo · pendiente' : COLOR_COPY[row.color].label}</span><span className="block whitespace-nowrap">{formatDate(row.fecha)}</span></p>
    <div className="min-w-0"><p className="truncate text-sm font-bold text-[#2D2A26] dark:text-white" title={row.concepto}>{row.concepto}</p><p className="truncate text-xs text-slate-500 dark:text-slate-400 xl:hidden" title={`${account} · ${documentLabel}`}>{account} · {documentLabel}</p><div className="xl:hidden"><MovementJump row={row} />{row.diferenciaCentimos !== 0 && <p className="text-xs text-amber-800 dark:text-amber-300">Diferencia: {formatMoney(row.diferenciaCentimos)}</p>}</div></div>
    <p className="hidden truncate text-xs text-slate-600 dark:text-slate-300 xl:block" title={account}>{account}</p>
    <div className="hidden min-w-0 xl:block"><p data-testid="conciliar-document-reference" className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100" title={`${documentLabel} · ${documentInfo}`}>{documentLabel}</p><MovementJump row={row} /></div>
    <div className="hidden text-right xl:block"><p className="whitespace-nowrap text-sm font-extrabold tabular-nums text-[#2D2A26] dark:text-white">{formatMoney(row.importeCentimos)}</p>{row.diferenciaCentimos !== 0 && <p className="whitespace-nowrap text-xs font-semibold tabular-nums text-amber-800 dark:text-amber-300">Dif. {formatMoney(row.diferenciaCentimos)}</p>}</div>
    <div className="hidden min-w-0 xl:block"><button type="button" onClick={() => onOpen(row)} title={row.motivo} aria-label="Ver nota completa" className="line-clamp-2 text-left text-xs leading-4 text-slate-600 underline decoration-dotted underline-offset-2 focus:outline-none focus:ring-2 focus:ring-[#FF5300] dark:text-slate-300">{row.motivo}</button><ResultBadge receipt={receipt} disabled={busy} onUndo={onUndo} /></div>
    <p className="whitespace-nowrap text-sm font-extrabold tabular-nums text-[#2D2A26] dark:text-white xl:hidden">{formatMoney(row.importeCentimos)}</p>
    <div className="flex items-center justify-end gap-1.5">{canConfirm && <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} aria-label={`${selectionNeedsReview ? 'Revisar y volver a seleccionar' : 'Seleccionar'} ${row.concepto}`} aria-describedby={selectionNeedsReview ? `conciliar-selection-review-${row.id}` : undefined} disabled={busy} className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 disabled:opacity-50" />}{action}</div>
    <button type="button" onClick={() => onOpen(row)} title={row.motivo} className="col-span-full line-clamp-2 text-left text-xs text-slate-600 underline decoration-dotted underline-offset-2 dark:text-slate-300 xl:hidden">{row.motivo}</button>
    {selectionNeedsReview && <p id={`conciliar-selection-review-${row.id}`} className="col-span-full px-1 text-xs font-semibold text-amber-800 dark:text-amber-300">La fila cambió desde que la seleccionaste. Desmárcala y vuelve a marcarla tras revisarla; no se confirmará mientras tanto.</p>}
    {receipt && <p className="col-span-full truncate px-1 text-xs xl:hidden"><ResultBadge receipt={receipt} disabled={busy} onUndo={onUndo} /></p>}
    {requestLabel && <p data-testid="conciliar-request-status" className="col-span-full rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-950 dark:bg-sky-950/40 dark:text-sky-100">{requestLabel}</p>}
    {receivedFileHref && <a href={receivedFileHref} target="_blank" rel="noopener noreferrer" className="col-span-full w-fit px-2 text-xs font-bold text-[#BF3E00] underline dark:text-orange-300">Abrir documento recibido</a>}
  </article>;
}


export default function ConciliarWorkspace({ initialTab = 'COBROS', initialQuery = '', initialCutoff = '2026-01-01', initialData }: { initialTab?: ConciliarTab; initialQuery?: string; initialCutoff?: string; initialData?: unknown }) {
  const { active: activeActuation } = useActuation();
  const { data: session } = useSession();
  const initialParsed = useMemo(() => initialData === undefined ? null : parseConciliarReadResponse(initialData), [initialData]);
  const [tab, setTab] = useState<ConciliarTab>(initialTab);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accountId, setAccountId] = useState('');
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [cutoffDate, setCutoffDate] = useState(initialCutoff);
  const [emitidasGrupo, setEmitidasGrupo] = useState<ConciliarEmitidasGroup | ''>('');
  const [estado, setEstado] = useState<ConciliarColor | ''>('');
  const [grupo, setGrupo] = useState<ConciliarGroup | ''>('');
  const [orden, setOrden] = useState<ConciliarSortField>('IMPORTE');
  const [direccion, setDireccion] = useState<ConciliarSortDirection>('DESC');
  const [globalOrder, setGlobalOrder] = useState(false);
  const [presentationRefreshRevision, setPresentationRefreshRevision] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [showInterestInvoices, setShowInterestInvoices] = useState(false);
  const [historicData, setHistoricData] = useState<ConciliarReadResponse | null>(null);
  const [historicLoading, setHistoricLoading] = useState(false);
  const [historicOpen, setHistoricOpen] = useState(false);
  const [historicOffset, setHistoricOffset] = useState(0);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ConciliarReadResponse | null>(initialParsed);
  const [loading, setLoading] = useState(initialParsed === null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  /** id -> hash sellado: una selección no confía en filas que ya no son vigentes. */
  const [selected, setSelected] = useState<ReadonlyMap<string, string>>(new Map());
  const [receipts, setReceipts] = useState<readonly Receipt[]>([]);
  const [openDocument, setOpenDocument] = useState<OpenDocument>(null);
  const [sending, setSending] = useState(false);
  const [batchProgress, setBatchProgress] = useState<ConciliarClientBatchProgress | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [retry, setRetry] = useState<Retry>(null);
  const [remesaConfirmation, setRemesaConfirmation] = useState<RemesaConfirmation>(null);
  const [remesaPreviewLoading, setRemesaPreviewLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const readController = useRef<AbortController | null>(null);
  const readSequence = useRef(0);
  const activeViewKey = useRef('');
  const exportController = useRef<AbortController | null>(null);
  const detailController = useRef<AbortController | null>(null);
  const detailSequence = useRef(0);
  const remesaPreviewController = useRef<AbortController | null>(null);
  const remesaPreviewSequence = useRef(0);
  const refreshAttempts = useRef(0);
  const historicController = useRef<AbortController | null>(null);
  const detailCache = useRef(new ConciliarDetailMemoryCache<ConciliarDocumentDetail>());
  const detailCacheIdentity = useRef<string | null>(null);
  const detailPrefetchControllers = useRef(new Set<AbortController>());
  const detailIdentityScope = activeActuation ? `actuacion:${activeActuation.sessionId}:${activeActuation.targetId}` : `usuario:${session?.user?.id ?? 'sin-sesion'}`;

  const requestInput = useMemo(() => ({ tab, from, to, accountId, query, cutoffDate, emitidasGrupo, estado, grupo, ...(orden === 'FECHA' && direccion === 'DESC' ? {} : { orden, direccion }), limit: PAGE_SIZE, offset }), [accountId, direccion, emitidasGrupo, estado, from, grupo, offset, orden, query, tab, to, cutoffDate]);
  activeViewKey.current = buildQuery(requestInput).toString();
  const initialRequestKey = useRef(initialParsed ? buildQuery({ tab: initialTab, from: '', to: '', accountId: '', query: initialQuery, cutoffDate: initialCutoff, limit: PAGE_SIZE, offset: 0 }).toString() : null);
  const rows = data?.rows ?? [];
  const visibleSelectable = useMemo(() => rows.filter((row) => row.color === 'VERDE' && row.seleccionable && !remesaHint(row)), [rows]);
  const selectionReview = useMemo(() => reviewSelectionForCurrentRows(selected, rows), [rows, selected]);
  const receiptByRow = useMemo(() => new Map(receipts.map((receipt) => [receipt.rowId, receipt])), [receipts]);
  const mutationsBlocked = sending || retry !== null || remesaPreviewLoading;

  const closeDetail = useCallback(() => {
    detailSequence.current += 1;
    detailController.current?.abort();
    detailController.current = null;
    setOpenDocument(null);
  }, []);

  const clearDetailCacheForIdentity = useCallback((identityScope: string) => {
    if (detailCacheIdentity.current === identityScope) return;
    detailCache.current.clear();
    detailCacheIdentity.current = identityScope;
  }, []);

  useEffect(() => {
    // Una actuación nueva o cerrada nunca puede reutilizar datos del actor anterior.
    detailCache.current.clear();
    detailCacheIdentity.current = detailIdentityScope;
    detailSequence.current += 1;
    detailController.current?.abort();
    detailPrefetchControllers.current.forEach((controller) => controller.abort());
    detailPrefetchControllers.current.clear();
    detailController.current = null;
    setOpenDocument(null);
    // No se transfiere ninguna selección entre identidades o sesiones de actuación.
    setSelected(new Map());
    setBatchProgress(null);
    setBatchResult(null);
  }, [detailIdentityScope]);

  const load = useCallback(async (silent = false, keepNotice = false) => {
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    const sequence = ++readSequence.current;
    if (silent) setRefreshing(true); else { setLoading(true); setData(null); }
    try {
      const response = await fetch(`${API}?${buildQuery(requestInput).toString()}`, { cache: 'no-store', signal: controller.signal });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(friendlyError(raw, 'No se pudo actualizar la conciliación.'));
      const parsed = parseConciliarReadResponse(raw);
      if (sequence !== readSequence.current) return;
      setData(parsed);
      if (!keepNotice) setNotice(null);
    } catch (error) {
      if (sequence !== readSequence.current || (error instanceof DOMException && error.name === 'AbortError')) return;
      setNotice({ tone: 'error', text: error instanceof Error ? safeOutcomeMessage(error.message, 'No se pudo actualizar la conciliación.') : 'No se pudo actualizar la conciliación.' });
    } finally {
      if (sequence === readSequence.current) { setLoading(false); setRefreshing(false); }
      if (readController.current === controller) readController.current = null;
    }
  }, [requestInput]);

  useEffect(() => {
    // El HTML ya incluye las filas autorizadas. No borrarlas para pedir lo mismo
    // después de hidratar ni arrancar una segunda consulta en StrictMode.
    if (readSequence.current === 0 && initialRequestKey.current === buildQuery(requestInput).toString()) return;
    void load();
  }, [load, presentationRefreshRevision, requestInput]);
  useEffect(() => () => { readSequence.current += 1; detailSequence.current += 1; remesaPreviewSequence.current += 1; readController.current?.abort(); detailController.current?.abort(); detailPrefetchControllers.current.forEach((controller) => controller.abort()); detailPrefetchControllers.current.clear(); remesaPreviewController.current?.abort(); exportController.current?.abort(); }, []);

  useEffect(() => {
    if (!data?.stale) { refreshAttempts.current = 0; return; }
    if (refreshAttempts.current >= 30 || mutationsBlocked) return;
    const timeout = window.setTimeout(() => {
      refreshAttempts.current += 1;
      void load(true, true);
    }, 1_200);
    return () => window.clearTimeout(timeout);
  }, [data, load, mutationsBlocked]);

  const changeTab = useCallback((next: ConciliarTab) => { if (next === tab) return; closeDetail(); remesaPreviewController.current?.abort(); setRemesaConfirmation(null); setTab(next); if (next !== 'EMITIDAS') setEmitidasGrupo(''); setOffset(0); }, [closeDetail, tab]);
  const changeAccount = useCallback((next: string) => { closeDetail(); setAccountId(next); setOffset(0); }, [closeDetail]);
  const changeDate = useCallback((kind: 'from' | 'to', value: string) => { closeDetail(); if (kind === 'from') setFrom(value); else setTo(value); setOffset(0); }, [closeDetail]);
  const submitSearch = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    closeDetail();
    const next = queryInput.trim().slice(0, 120);
    if (next) { setQuery(next); setOffset(0); return; }
    // Buscar vacío significa mostrar todo: restablece filtros de presentación
    // de forma visible, sin destruir la selección sellada que pueda quedar fuera.
    setQueryInput(''); setQuery(''); setFrom(''); setTo(''); setAccountId('');
    setEmitidasGrupo(''); setEstado(''); setGrupo(''); setOrden('IMPORTE'); setDireccion('DESC'); setGlobalOrder(false); setOffset(0);
    setPresentationRefreshRevision((current) => current + 1);
  }, [closeDetail, queryInput]);
  const changeEmitidasGrupo = useCallback((next: ConciliarEmitidasGroup) => {
    closeDetail(); remesaPreviewController.current?.abort(); setRemesaConfirmation(null);
    setEmitidasGrupo((current) => current === next ? '' : next);
    setOffset(0);
  }, [closeDetail]);
  const changeEstado = useCallback((next: ConciliarColor | '') => { closeDetail(); setEstado(next); setOffset(0); }, [closeDetail]);
  const changeGrupo = useCallback((next: ConciliarGroup | '') => { closeDetail(); setGrupo(next); setOffset(0); }, [closeDetail]);
  const changeOrder = useCallback((field: ConciliarSortField) => {
    closeDetail();
    setGlobalOrder(true);
    if (field === orden) setDireccion((current) => current === 'ASC' ? 'DESC' : 'ASC');
    else { setOrden(field); setDireccion(field === 'IMPORTE' ? 'DESC' : 'ASC'); }
    setOffset(0);
  }, [closeDetail, orden]);
  const changeCutoff = useCallback((value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return;
    closeDetail(); setCutoffDate(value); setOffset(0); setHistoricOffset(0); setHistoricData(null);
    // Una fecha de presentación, no autorización ni estado de cobro.
    document.cookie = `io_conciliar_cutoff=${value}; Path=/admin/finanzas/conciliar; SameSite=Lax; Secure; Max-Age=31536000`;
  }, [closeDetail]);

  useEffect(() => {
    if (!historicOpen || tab !== 'EMITIDAS') return;
    const controller = new AbortController(); historicController.current?.abort(); historicController.current = controller;
    setHistoricLoading(true);
    const params = buildQuery({ tab: 'EMITIDAS', from, to, accountId, query, cutoffDate, historic: true, estado, grupo, orden, direccion, limit: PAGE_SIZE, offset: historicOffset });
    void fetch(`${API}?${params}`, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(friendlyError(raw, 'No se pudieron leer las facturas anteriores.'));
      if (!controller.signal.aborted) setHistoricData(parseConciliarReadResponse(raw));
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setNotice({ tone: 'error', text: error instanceof Error ? safeOutcomeMessage(error.message, 'No se pudieron leer las facturas anteriores.') : 'No se pudieron leer las facturas anteriores.' });
    }).finally(() => { if (!controller.signal.aborted) setHistoricLoading(false); });
    return () => controller.abort();
  }, [accountId, cutoffDate, direccion, estado, from, grupo, historicOpen, historicOffset, orden, query, tab, to, data?.updatedAt]);

  const addReceipt = useCallback((receipt: Receipt) => {
    setReceipts((current) => [receipt, ...current.filter((item) => item.key !== receipt.key && item.rowId !== receipt.rowId)].slice(0, 20));
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch(`${API}/historial?limit=20&offset=0`, { cache: 'no-store' });
      if (!response.ok) return;
      const operations = parseConciliarHistoryResponse(await response.json());
      const persisted: Receipt[] = operations.map((operation) => ({
        key: operation.operationId, rowId: operation.operationId,
        label: `Confirmación de ${operation.count} movimiento(s)`,
        message: operation.undone ? 'Deshecho' : 'Confirmación conservada en el historial',
        operationId: operation.reversible ? operation.operationId : null,
        status: operation.undone ? 'undone' : 'done', createdAt: new Date(operation.createdAt).getTime(),
      }));
      setReceipts((current) => [...current.filter((receipt) => !persisted.some((item) => item.operationId === receipt.operationId)), ...persisted].sort((left, right) => right.createdAt - left.createdAt).slice(0, 20));
    } catch { /* El historial secundario no bloquea la lectura de las cuatro pestañas. */ }
  }, []);
  useEffect(() => { if (showHistory) void loadHistory(); }, [loadHistory, showHistory]);

  const finishOutcomes = useCallback((response: ConciliarActionResponse, action: 'confirmar' | 'pedir', rowLabels: ReadonlyMap<string, string>) => {
    for (const outcome of response.outcomes) {
      const message = safeOutcomeMessage(outcome.message, outcome.ok ? 'Acción realizada.' : 'No se pudo completar esta acción.');
      addReceipt({
        key: `${outcome.id}-${outcome.operationId ?? response.operationId ?? response.refreshedAt}-${action}`,
        rowId: outcome.id,
        label: rowLabels.get(outcome.id) ?? 'Movimiento de conciliación',
        message,
        operationId: outcome.ok && action === 'confirmar' ? outcome.operationId ?? response.operationId ?? null : null,
        status: outcome.ok ? action === 'pedir' ? 'asked' : 'done' : 'failed',
        createdAt: Date.now(),
      });
    }
  }, [addReceipt]);

  const post = useCallback(async (payload: ConciliarMutationPayload, label: string) => {
    if (sending) return;
    // A retry retains its original view/idempotency payload; a first attempt gets
    // the exact normalized view that was visibly rendered when it was sent.
    const command: ConciliarMutationPayload = payload.responseView ? payload : { ...payload, responseView: responseViewFor(requestInput) };
    const commandViewKey = command.responseView ? responseViewKey(command.responseView) : null;
    const adoptProjection = (projection: ConciliarReadResponse | undefined): boolean => {
      if (!projection || !commandViewKey || commandViewKey !== activeViewKey.current) return false;
      // Cancel an earlier GET of the old projection; it must not overwrite this
      // same-transaction snapshot with a stale pre-action response.
      readSequence.current += 1;
      readController.current?.abort();
      setData(projection);
      return true;
    };
    const isBatch = command.action === 'confirmar' && command.items.length > 1;
    setBatchResult(null);
    setBatchProgress(isBatch ? { completed: 0, total: command.items.length, retrying: false } : null);
    setSending(true);
    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isBatch ? { Accept: 'application/x-ndjson' } : {}),
          ...(activeActuation ? { 'x-io-acting-session': activeActuation.sessionId } : {}),
        },
        body: JSON.stringify(command),
      });
      const raw: unknown = command.action === 'confirmar' && isBatch
        ? await readConciliarBatchResponse(response, command.items.map((item) => item.id), setBatchProgress)
        : await response.json().catch(() => null);
      if (response.status === 409) {
        setRetry(null); setNotice({ tone: 'error', text: friendlyError(raw, 'Estos datos han cambiado. Actualiza: las filas modificadas no se enviarán sin volver a comprobar su hash.') });
        await load(true, true);
        return;
      }
      if (!response.ok) {
        const message = friendlyError(raw, 'No se pudo completar la acción.');
        if (response.status >= 500) { setRetry({ payload: command, label }); setNotice({ tone: 'error', text: `No pudimos comprobar el resultado. Reintenta exactamente la misma acción antes de continuar. ${message}` }); }
        else setNotice({ tone: 'error', text: message });
        return;
      }
      if (payload.action === 'deshacer') {
        let result;
        try { result = parseConciliarUndoResponse(raw); } catch { throw new UncertainResultError('No se pudo comprobar el deshacer.'); }
        setReceipts((current) => current.map((item) => item.operationId === result.operationId ? { ...item, status: result.undone ? 'undone' : item.status, message: safeOutcomeMessage(result.message, 'Acción deshecha.') } : item));
        setRetry(null);
        setNotice({ tone: result.undone ? 'success' : 'info', text: safeOutcomeMessage(result.message, result.undone ? 'Acción deshecha.' : 'La acción ya no se puede deshacer.') });
        if (!adoptProjection(result.projection)) void load(true, true);
        if (showHistory) void loadHistory();
        return;
      }
      let result;
      try { result = parseConciliarActionResponse(raw); } catch { throw new UncertainResultError('No se pudo comprobar la acción.'); }
      const labels = new Map(rows.map((row) => [row.id, row.documento?.referencia || row.concepto]));
      finishOutcomes(result, payload.action, labels);
      if (isBatch) setBatchResult({ operationId: result.operationId ?? null, outcomes: result.outcomes.map((outcome) => ({ id: outcome.id, label: labels.get(outcome.id) ?? 'Movimiento de conciliación', ok: outcome.ok, message: safeOutcomeMessage(outcome.message, outcome.ok ? 'Hecho.' : 'Revisa esta fila.') })) });
      setRetry(null);
      setSelected((current) => {
        const next = new Map(current);
        result.outcomes.filter((outcome) => outcome.ok).forEach((outcome) => next.delete(outcome.id));
        return next;
      });
      const succeeded = result.outcomes.filter((outcome) => outcome.ok).length;
      const failed = result.outcomes.length - succeeded;
      setNotice({ tone: failed ? 'info' : 'success', text: failed ? `${succeeded} hecha(s); ${failed} necesita(n) revisión. Consulta la actividad reciente.` : payload.action === 'pedir' ? 'Añadido a Para pedir. No se ha enviado ningún aviso.' : 'Hecho. Puedes deshacerlo aquí o desde la actividad reciente.' });
      if (!adoptProjection(result.projection)) void load(true, true);
      if (showHistory) void loadHistory();
    } catch (error) {
      if (error instanceof ConciliarStreamRejectedError) {
        setRetry(null);
        setNotice({ tone: 'error', text: error.message });
        if (command.action === 'confirmar' && isBatch) setBatchResult({ operationId: null, outcomes: command.items.map((item) => ({ id: item.id, label: rows.find((row) => row.id === item.id)?.documento?.referencia || rows.find((row) => row.id === item.id)?.concepto || 'Movimiento de conciliación', ok: false, message: 'El lote no se ha guardado. Revisa esta fila antes de volver a confirmar.' })) });
        void load(true, true);
      } else if (error instanceof ConciliarStreamUncertainError || isUncertain(error)) {
        setRetry({ payload: command, label });
        setNotice({ tone: 'error', text: 'No pudimos comprobar el resultado. Reintenta exactamente la misma acción antes de continuar.' });
      } else {
        setNotice({ tone: 'error', text: error instanceof Error ? safeOutcomeMessage(error.message, 'No se pudo completar la acción.') : 'No se pudo completar la acción.' });
      }
    } finally { setBatchProgress(null); setSending(false); }
  }, [activeActuation, finishOutcomes, load, loadHistory, requestInput, rows, sending, showHistory]);

  const confirmRows = useCallback((source: readonly ConciliarRow[]) => {
    if (mutationsBlocked || remesaPreviewLoading) return;
    const currentRows = new Map(rows.map((row) => [row.id, row]));
    // Un objeto capturado antes de un refresco nunca autoriza una decisión: se
    // vuelve a tomar de la página vigente y se compara el hash del servidor.
    const confirmable = source.flatMap((selectedRow) => {
      const current = currentRows.get(selectedRow.id);
      return current && current.decisionHash === selectedRow.decisionHash && current.color === 'VERDE' && current.seleccionable ? [current] : [];
    });
    const remesas = confirmable.filter(remesaHint);
    if (confirmable.length === 0) { setNotice({ tone: 'info', text: 'No hay movimientos verdes seleccionables en esta vista.' }); return; }
    if (remesas.length > 0 && (confirmable.length !== 1 || remesas.length !== 1)) {
      setNotice({ tone: 'info', text: 'Revisa y confirma la remesa por separado: no se puede mezclar con otros movimientos.' });
      return;
    }
    const items: ConciliarConfirmItem[] = confirmable.map((row) => ({ id: row.id, decisionHash: row.decisionHash }));
    const payload: ConciliarMutationPayload = { action: 'confirmar', idempotencyKey: makeIdempotencyKey(), items };
    if (remesas.length === 0) { void post(payload, items.length === 1 ? 'confirmación' : 'confirmación seleccionada'); return; }
    const row = remesas[0];
    remesaPreviewController.current?.abort();
    const controller = new AbortController();
    remesaPreviewController.current = controller;
    const sequence = ++remesaPreviewSequence.current;
    setRemesaPreviewLoading(true);
    // Lectura privada dedicada; no transporta fuente, importes ni facturas.
    // La ruta vuelve a autorizar la fila contra la propuesta vigente y actor efectivo.
    void fetch(`${REMESA_PREVIEW_API}?rowId=${encodeURIComponent(row.id)}`, {
      cache: 'no-store', signal: controller.signal,
    }).then(async (response) => {
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(friendlyError(raw, 'No se pudo revisar la composición completa de la remesa.'));
      const preview = parseConciliarRemesaPreviewResponse(raw);
      if (sequence !== remesaPreviewSequence.current) return;
      setRemesaConfirmation({ row, preview, payload });
    }).catch((error: unknown) => {
      if (sequence === remesaPreviewSequence.current && !(error instanceof DOMException && error.name === 'AbortError')) {
        setNotice({ tone: 'error', text: error instanceof Error ? safeOutcomeMessage(error.message, 'No se pudo revisar la composición completa de la remesa.') : 'No se pudo revisar la composición completa de la remesa.' });
      }
    }).finally(() => {
      if (sequence === remesaPreviewSequence.current) setRemesaPreviewLoading(false);
      if (remesaPreviewController.current === controller) remesaPreviewController.current = null;
    });
  }, [mutationsBlocked, post, remesaPreviewLoading, rows]);

  const confirmSelected = useCallback(() => {
    if (mutationsBlocked) return;
    const review = reviewSelectionForCurrentRows(selected, rows);
    const excluded: string[] = [];
    if (review.hiddenCount) excluded.push(`${review.hiddenCount} fuera del filtro o de esta página`);
    if (review.changedCount) excluded.push(`${review.changedCount} modificada(s) desde la selección`);
    if (review.unavailableCount) excluded.push(`${review.unavailableCount} ya no verde(s) o no confirmable(s)`);
    if (review.confirmableRows.length === 0) {
      setNotice({ tone: 'info', text: excluded.length ? `No se envía ninguna fila: ${excluded.join('; ')}. Ajusta el filtro o actualiza para revisarlas.` : 'No hay movimientos verdes seleccionables en esta vista.' });
      return;
    }
    if (excluded.length) setNotice({ tone: 'info', text: `Se volverán a comprobar ${review.confirmableRows.length} fila(s) visibles. No se enviarán ${excluded.join('; ')}.` });
    confirmRows(review.confirmableRows);
  }, [confirmRows, mutationsBlocked, rows, selected]);

  const askForDocument = useCallback((row: ConciliarRow) => {
    if (mutationsBlocked) return;
    void post({ action: 'pedir', id: row.id, decisionHash: row.decisionHash, idempotencyKey: makeIdempotencyKey() }, 'solicitud de documento');
  }, [mutationsBlocked, post]);

  const detailRowFromCurrentProjection = useCallback((requestedRow: ConciliarRow) => {
    const currentRow = rows.find((row) => row.id === requestedRow.id) ?? historicData?.rows.find((row) => row.id === requestedRow.id);
    if (!currentRow) return null;
    const updatedAt = rows.some((row) => row.id === currentRow.id) ? data?.updatedAt : historicData?.updatedAt;
    if (!updatedAt) return null;
    return { row: currentRow, key: conciliarDetailCacheKey({ rowId: currentRow.id, decisionHash: currentRow.decisionHash, updatedAt, identityScope: detailIdentityScope }) };
  }, [data?.updatedAt, detailIdentityScope, historicData?.rows, historicData?.updatedAt, rows]);

  /** GET privado por fila: el endpoint vuelve a resolver sesión, permiso y fuente antes de devolver un DTO plano. */
  const fetchDetail = useCallback(async (currentRow: ConciliarRow, signal?: AbortSignal) => {
    const response = await fetch(`${DOCUMENT_DETAIL_API}/${encodeURIComponent(currentRow.id)}`, { cache: 'no-store', signal });
    const raw: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(friendlyError(raw, 'No se pudo cargar el detalle de este documento.'));
    const detail = parseConciliarDocumentDetail(raw);
    if (detail.rowId !== currentRow.id) throw new Error('El detalle recibido no corresponde a la fila abierta.');
    return detail;
  }, []);

  /** La precarga sólo pide el DTO privado de la fila autorizada: nunca sigue ni descarga su PDF. */
  const prefetchDetail = useCallback((requestedRow: ConciliarRow) => {
    clearDetailCacheForIdentity(detailIdentityScope);
    void loadConciliarDocumentPreview().catch(() => undefined);
    const current = detailRowFromCurrentProjection(requestedRow);
    if (!current || !detailCache.current.canPrefetch(current.key)) return;
    const controller = new AbortController();
    detailPrefetchControllers.current.add(controller);
    void detailCache.current.load(current.key, () => fetchDetail(current.row, controller.signal)).catch(() => undefined).finally(() => detailPrefetchControllers.current.delete(controller));
  }, [clearDetailCacheForIdentity, detailIdentityScope, detailRowFromCurrentProjection, fetchDetail]);

  /** La fila se vuelve a tomar de la proyección visible antes de abrir; el DTO viaja sólo por la ruta privada dedicada. */
  const openDetail = useCallback(async (requestedRow: ConciliarRow) => {
    clearDetailCacheForIdentity(detailIdentityScope);
    void loadConciliarDocumentPreview().catch(() => undefined);
    const current = detailRowFromCurrentProjection(requestedRow);
    if (!current) {
      setNotice({ tone: 'info', text: 'Esta fila ya no está en la lista actual. Actualiza la conciliación antes de abrir su detalle.' });
      return;
    }
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    const sequence = ++detailSequence.current;
    setOpenDocument({ row: current.row, status: 'loading', detail: null, error: null });
    try {
      const detail = await detailCache.current.load(current.key, () => fetchDetail(current.row, controller.signal));
      if (sequence !== detailSequence.current) return;
      setOpenDocument((open) => open?.row.id === current.row.id ? { ...open, status: 'ready', detail, error: null } : open);
    } catch (error) {
      if (sequence !== detailSequence.current || (error instanceof DOMException && error.name === 'AbortError')) return;
      const message = error instanceof Error ? safeOutcomeMessage(error.message, 'No se pudo cargar el detalle de este documento.') : 'No se pudo cargar el detalle de este documento.';
      setOpenDocument((open) => open?.row.id === current.row.id ? { ...open, status: 'error', detail: null, error: message } : open);
      setNotice({ tone: 'error', text: `${message} Puedes reintentar el detalle sin modificar la conciliación.` });
    } finally {
      if (detailController.current === controller) detailController.current = null;
    }
  }, [clearDetailCacheForIdentity, detailIdentityScope, detailRowFromCurrentProjection, fetchDetail]);

  const undoReceipt = useCallback((receipt: Receipt) => {
    if (mutationsBlocked || !receipt.operationId) return;
    void post({ action: 'deshacer', operationId: receipt.operationId, idempotencyKey: makeIdempotencyKey() }, 'deshacer');
  }, [mutationsBlocked, post]);

  const toggleAllVisible = useCallback((checked: boolean) => {
    // Una remesa se abre y confirma sola, tras su composición completa. Este
    // gesto sólo añade/quita las visibles; no descarta selección explícita oculta.
    setSelected((current) => setVisibleGreenSelected(current, visibleSelectable, checked));
  }, [visibleSelectable]);

  const exportAll = useCallback(async () => {
    if (!data || exporting) return;
    if (data.total === 0) { setNotice({ tone: 'info', text: 'No hay resultados filtrados para exportar.' }); return; }
    if (data.total > MAX_EXPORT_ROWS) { setNotice({ tone: 'error', text: `La exportación está limitada a ${MAX_EXPORT_ROWS.toLocaleString('es-ES')} filas. Acota fechas, cuenta o búsqueda.` }); return; }
    exportController.current?.abort();
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    try {
      const collected: ConciliarRow[] = [];
      let snapshot: string | null = null;
      for (let pageOffset = 0; pageOffset < data.total; pageOffset += EXPORT_PAGE_SIZE) {
        const params = buildQuery({ tab, from, to, accountId, query, cutoffDate, emitidasGrupo, estado, grupo, orden, direccion, limit: EXPORT_PAGE_SIZE, offset: pageOffset });
        const response = await fetch(`${API}?${params.toString()}`, { cache: 'no-store', signal: controller.signal });
        const raw: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(friendlyError(raw, 'No se pudo leer una página para exportar.'));
        const page = parseConciliarReadResponse(raw);
        if (page.total !== data.total) throw new Error('Los resultados cambiaron durante la exportación. Actualiza y vuelve a exportar.');
        if (snapshot && page.updatedAt !== snapshot) throw new Error('Los datos cambiaron durante la exportación. Actualiza y vuelve a exportar.');
        snapshot = page.updatedAt;
        collected.push(...page.rows);
      }
      if (collected.length !== data.total) throw new Error('La exportación no recibió todas las filas. No se creó ningún archivo.');
      const XLSX = await import('xlsx');
      const { createConciliarXlsx, downloadConciliarXlsx } = await import('./conciliar-xlsx');
      const bytes = await createConciliarXlsx(XLSX, TAB_COPY[tab].short, collected);
      downloadConciliarXlsx(bytes, `conciliar-${tab.toLocaleLowerCase('es-ES')}-${dateForInput(new Date())}.xlsx`);
      setNotice({ tone: 'success', text: `${collected.length.toLocaleString('es-ES')} filas exportadas.` });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setNotice({ tone: 'error', text: error instanceof Error ? safeOutcomeMessage(error.message, 'No se pudo exportar.') : 'No se pudo exportar.' });
    } finally {
      if (exportController.current === controller) exportController.current = null;
      setExporting(false);
    }
  }, [accountId, data, direccion, emitidasGrupo, estado, exporting, from, grupo, orden, query, tab, to, cutoffDate]);

  const selectionNeedsReview = useCallback((row: ConciliarRow) => selected.has(row.id) && selected.get(row.id) !== row.decisionHash, [selected]);
  const emitidasGroupLabel = emitidasGrupo ? EMITIDAS_GROUP_COPY[emitidasGrupo].label : '';
  const displayGroups = groupConciliarRows(rows);
  const renderRow = (row: ConciliarRow) => <ConciliarRowView key={row.id} row={row} selected={selected.has(row.id)} selectionNeedsReview={selectionNeedsReview(row)} receipt={receiptByRow.get(row.id)} busy={mutationsBlocked} onSelect={(checked) => setSelected((current) => setRowSelected(current, row, checked))} onConfirm={() => confirmRows([row])} onAsk={() => askForDocument(row)} onOpen={openDetail} onPrefetch={prefetchDetail} onUndo={() => { const receipt = receiptByRow.get(row.id); if (receipt) undoReceipt(receipt); }} />;

  return <main className="mx-auto w-full max-w-[1700px] min-w-0 overflow-x-hidden space-y-4 px-3 py-4 text-[#2D2A26] dark:text-slate-100 sm:px-5 sm:py-6" style={{ fontFamily: 'var(--font-conciliar), Arial, Helvetica, sans-serif' }} data-testid="conciliar-workspace">
    <header data-conciliar-heading className="flex flex-col gap-3 border-b border-orange-100 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FF5300]">Conciliación</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#2D2A26] dark:text-white sm:text-3xl">Conciliar</h1><p data-conciliar-subtitle className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">Una vista directa de lo que queda por casar, revisar o pedir.</p></div>
      <button type="button" onClick={() => void load(true)} disabled={loading || refreshing || mutationsBlocked} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-[#FFB18C] bg-white px-3 py-2 text-sm font-bold text-[#BF3E00] shadow-sm hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900 dark:text-orange-200"><ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />Actualizar</button>
    </header>

    <Guide invoicePending={tab === 'EMITIDAS' || tab === 'RECIBIDAS'} />

    {batchProgress && <section data-testid="conciliar-batch-progress" role="status" aria-live="polite" className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100">
      <p className="font-extrabold">{batchProgress.retrying ? 'Reintentando el mismo lote…' : `Confirmando ${batchProgress.completed} de ${batchProgress.total}…`}</p>
      <progress aria-label="Progreso de confirmación del lote" value={batchProgress.completed} max={batchProgress.total} className="mt-2 h-2 w-full accent-orange-600" />
      <p className="mt-1 text-xs">El avance es provisional. Las filas sólo quedan hechas cuando termina de guardarse el lote.</p>
    </section>}
    {batchResult && <section aria-label="Resultado del lote" className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
      <details open><summary className="cursor-pointer font-extrabold">Resultado del lote: {batchResult.outcomes.filter((item) => item.ok).length} hecha(s), {batchResult.outcomes.filter((item) => !item.ok).length} para revisar</summary>
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">{batchResult.outcomes.map((item) => <li data-testid="conciliar-batch-result-row" key={item.id} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700"><span className={`font-extrabold ${item.ok ? 'text-emerald-800 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-200'}`}>{item.ok ? 'Hecho' : 'Revisar'}</span><span className="ml-2 break-words">{item.label}</span><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{item.message}</p></li>)}</ul>
      </details>
      {batchResult.operationId && <button type="button" disabled={mutationsBlocked} onClick={() => { if (batchResult.operationId) void post({ action: 'deshacer', operationId: batchResult.operationId, idempotencyKey: makeIdempotencyKey() }, 'deshacer lote'); }} className="mt-3 min-h-10 rounded-lg border border-slate-300 px-3 py-2 font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 dark:border-slate-600">Deshacer lote completo</button>}
    </section>}

    {data?.stale && <div role="status" aria-live="polite" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100">Los resúmenes tienen cambios pendientes de actualizar. Cada confirmación vuelve a comprobar su documento; los importes del resumen pueden cambiar.</div>}

    {notice && <div role={notice.tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/45 dark:text-red-100' : notice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-100' : 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/45 dark:text-sky-100'}`}><ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{notice.text}</span></div>}
    {retry && <div role="status" aria-live="assertive" className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"><span>El resultado está pendiente de comprobar. Reintenta la misma acción para evitar duplicados.</span><button type="button" onClick={() => void post(retry.payload, retry.label)} disabled={sending} className="min-h-10 shrink-0 rounded-md bg-amber-700 px-3 py-2 text-sm font-extrabold text-white hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-600 disabled:opacity-50">{sending ? 'Reintentando…' : 'Reintentar igual'}</button></div>}

    <section className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900"><div role="tablist" aria-label="Bandejas de conciliación" className="grid min-w-0 grid-cols-2 gap-2 xl:grid-cols-4">{data ? CONCILIAR_TABS.map((item) => { const summary = data.tabs.find((candidate) => candidate.tab === item); return summary ? <SummaryTab key={item} summary={summary} active={tab === item} onClick={() => changeTab(item)} /> : null; }) : CONCILIAR_TABS.map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}</div></section>

    <section aria-label="Fecha de corte de emitidas" className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-3xl text-slate-600 dark:text-slate-300">Emitidas cuenta sólo las facturas desde el corte. Las anteriores se conservan aparte: no damos por pendiente un cobro antiguo que nunca se confirmó aquí.</p>
      <label className="shrink-0 font-semibold">Fecha de corte<input type="date" value={cutoffDate} onChange={(event) => changeCutoff(event.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" /></label>
    </section>

    {tab === 'EMITIDAS' && data && <EmitidasGroupFilters groups={data.emitidasGroups} activeGroup={emitidasGrupo} onChange={changeEmitidasGrupo} />}

    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <form onSubmit={submitSearch} className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_145px_145px_190px_160px_210px_auto] xl:items-end">
        <label className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100">Buscar<span className="relative mt-1 block"><MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value.slice(0, 120))} maxLength={120} placeholder="Concepto, factura, tercero o importe" className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-[#2D2A26] focus:border-[#FF5300] focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></span></label>
        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Estado<select value={estado} onChange={(event) => changeEstado(event.target.value as ConciliarColor | '')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-[#2D2A26] focus:border-[#FF5300] focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white"><option value="">Todos los estados</option><option value="VERDE">Verde · listo</option><option value="AMBAR">Ámbar · revisar</option><option value="ROJO">Rojo · falta el papel</option></select></label>
        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Grupo / tipo<select value={grupo} onChange={(event) => changeGrupo(event.target.value as ConciliarGroup | '')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-[#2D2A26] focus:border-[#FF5300] focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white"><option value="">Todos los grupos / tipos</option>{CONCILIAR_GROUPS.map((item) => <option key={item} value={item}>{GROUP_FILTER_COPY[item]}</option>)}</select></label>
        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Desde<input type="date" value={from} onChange={(event) => changeDate('from', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-[#2D2A26] focus:border-[#FF5300] focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label>
        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Hasta<input type="date" value={to} onChange={(event) => changeDate('to', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-[#2D2A26] focus:border-[#FF5300] focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label>
        <label className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100">Cuenta<select value={accountId} onChange={(event) => changeAccount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-[#2D2A26] focus:border-[#FF5300] focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white"><option value="">Todas las cuentas</option>{(data?.cuentas ?? []).map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</select></label>
        <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#FF5300] px-3 py-2 text-sm font-extrabold text-white hover:bg-[#E04900] focus:outline-none focus:ring-2 focus:ring-[#FF5300] focus:ring-offset-2 dark:focus:ring-offset-slate-950"><MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />Buscar</button>
      </form>
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Buscar vacío restablece las fechas, cuenta, estado, grupo y orden para mostrar todo. No confirma selecciones que queden fuera del filtro.</p>
    </section>

    <section role="tabpanel" id={`conciliar-panel-${tab}`} aria-labelledby={`conciliar-tab-${tab}`} className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <header className="flex flex-col gap-3 border-b border-slate-200 px-3 py-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><h2 className="font-extrabold text-[#2D2A26] dark:text-white">{TAB_COPY[tab].title}{tab === 'EMITIDAS' && emitidasGroupLabel ? ` · ${emitidasGroupLabel}` : ''}</h2><p className="truncate text-xs text-slate-600 dark:text-slate-300">{TAB_COPY[tab].question}{data ? ` · ${data.total.toLocaleString('es-ES')} resultado(s)` : ''}{data ? ` · actualizado ${humanUpdatedAt(data.updatedAt)}` : ''}</p></div>
        <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => void exportAll()} disabled={!data || exporting || mutationsBlocked} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"><ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />{exporting ? 'Exportando…' : 'Exportar a Excel'}</button>{(visibleSelectable.length > 0 || selected.size > 0) && <><label className="inline-flex min-h-9 items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200"><input type="checkbox" checked={areAllVisibleGreensSelected(selected, visibleSelectable)} onChange={(event) => toggleAllVisible(event.target.checked)} disabled={mutationsBlocked || visibleSelectable.length === 0} className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" />Todos los verdes visibles</label><button type="button" onClick={confirmSelected} disabled={mutationsBlocked || selected.size === 0} className="min-h-9 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">Confirmar seleccionados{selected.size ? ` (${selected.size})` : ''}</button></>}</div>
      </header>
      {selected.size > 0 && (selectionReview.hiddenCount > 0 || selectionReview.changedCount > 0 || selectionReview.unavailableCount > 0) && <div role="status" className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/45 dark:text-amber-100">Selección conservada: {selectionReview.hiddenCount ? `${selectionReview.hiddenCount} fuera del filtro o de esta página. ` : ''}{selectionReview.changedCount ? `${selectionReview.changedCount} cambiada(s): vuelve a seleccionarla(s) tras revisar. ` : ''}{selectionReview.unavailableCount ? `${selectionReview.unavailableCount} ya no confirmable(s).` : ''} Nunca se enviarán automáticamente.</div>}
      <div className="min-w-0">{loading ? <Skeleton /> : !data ? <Empty text="No hay datos validados. Actualiza para volver a intentarlo." /> : rows.length === 0 ? <Empty text="No hay resultados con estos filtros." /> : <>
        <div role="row" className="hidden grid-cols-[auto_minmax(88px,.55fr)_minmax(150px,1.5fr)_minmax(115px,.7fr)_minmax(180px,1fr)_auto_minmax(104px,.65fr)_auto] gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 xl:grid"><span role="columnheader">Estado</span><SortHeader field="FECHA" label="Fecha" active={orden === 'FECHA'} direction={direccion} onChange={changeOrder} /><SortHeader field="CONCEPTO" label="Concepto / proveedor" active={orden === 'CONCEPTO'} direction={direccion} onChange={changeOrder} /><span role="columnheader">Cuenta</span><span role="columnheader">Documento</span><SortHeader field="IMPORTE" label="Importe" active={orden === 'IMPORTE'} direction={direccion} onChange={changeOrder} align="right" /><span role="columnheader">Nota</span><span role="columnheader">Acción</span></div>
        {globalOrder ? <div data-testid="conciliar-global-order">{rows.map(renderRow)}</div> : displayGroups.map((group) => <section data-conciliar-group={group.label} key={group.key}><GroupHeader group={group} />{group.rows.map(renderRow)}</section>)}
      </>}</div>
      {openDocument && <ConciliarDocumentPreview document={openDocument} onClose={closeDetail} onRetry={() => { if (openDocument) void openDetail(openDocument.row); }} />}
      {data && <footer className="flex flex-col gap-2 border-t border-slate-200 px-3 py-3 text-sm dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-600 dark:text-slate-300">Mostrando {data.total === 0 ? 0 : data.offset + 1}–{Math.min(data.offset + data.rows.length, data.total)} de {data.total.toLocaleString('es-ES')}.</p><div className="flex gap-2"><button type="button" disabled={data.offset === 0 || mutationsBlocked} onClick={() => { closeDetail(); setOffset(Math.max(0, data.offset - data.limit)); }} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-100"><ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />Anterior</button><button type="button" disabled={data.rows.length === 0 || data.offset + data.rows.length >= data.total || mutationsBlocked} onClick={() => { closeDetail(); setOffset(data.offset + data.rows.length); }} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-100">Ver más<ChevronRightIcon className="h-4 w-4" aria-hidden="true" /></button></div></footer>}
    </section>

    {tab === 'EMITIDAS' && data && <details onToggle={(event) => setHistoricOpen(event.currentTarget.open)} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <summary className="cursor-pointer text-sm font-semibold">Anteriores a la fecha de corte · {data.historicSummary.count.toLocaleString('es-ES')} facturas · {formatMagnitude(data.historicSummary.amountCentimos)}</summary>
      <p className="py-2 text-xs text-slate-600 dark:text-slate-300">No cuentan en el resumen. Su cobro histórico no consta confirmado en este panel; esto no prueba que el cliente deba ese importe.</p>
      {historicLoading ? <Skeleton /> : historicData && <>
        {historicData.rows.map((row) => <ConciliarRowView key={row.id} row={row} selected={false} receipt={undefined} busy={mutationsBlocked} onSelect={() => undefined} onConfirm={() => undefined} onAsk={() => undefined} onOpen={openDetail} onPrefetch={prefetchDetail} onUndo={() => undefined} />)}
        <div className="flex items-center justify-between gap-2 pt-3 text-xs"><span>{historicData.total ? historicData.offset + 1 : 0}–{Math.min(historicData.total, historicData.offset + historicData.rows.length)} de {historicData.total}</span><div className="flex gap-2"><button type="button" disabled={historicOffset === 0} onClick={() => { closeDetail(); setHistoricOffset(Math.max(0, historicOffset - PAGE_SIZE)); }} className="min-h-9 rounded border px-2 disabled:opacity-50">Anteriores</button><button type="button" disabled={historicOffset + historicData.rows.length >= historicData.total} onClick={() => { closeDetail(); setHistoricOffset(historicOffset + PAGE_SIZE); }} className="min-h-9 rounded border px-2 disabled:opacity-50">Siguientes</button></div></div>
      </>}
    </details>}

    {receipts.length > 0 && <ConciliarRecentHistory receipts={receipts} busy={mutationsBlocked} onUndo={undoReceipt} />}
    <button type="button" onClick={() => setShowHistory(true)} className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">{showHistory ? 'Historial cargado' : 'Ver historial de confirmaciones'}</button>
    <details onToggle={(event) => setShowInterestInvoices(event.currentTarget.open)} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><summary className="cursor-pointer text-sm font-semibold">Facturas bancarias de intereses de confirming</summary>{showInterestInvoices && <ConfirmingInterestInvoices />}</details>
    <p className="px-1 text-xs text-slate-500 dark:text-slate-400">Las confirmaciones se hacen una vez, quedan registradas y se pueden deshacer. Pedir sólo añade la fila a la lista interna; no envía correos ni notificaciones.</p>
    {remesaConfirmation && <ConciliarRemesaConfirmationDialog confirmation={remesaConfirmation} busy={sending} onCancel={() => { if (!sending) setRemesaConfirmation(null); }} onConfirm={() => { if (!sending) { const current = remesaConfirmation; setRemesaConfirmation(null); void post(current.payload, 'confirmación de remesa revisada'); } }} />}
  </main>;
}
