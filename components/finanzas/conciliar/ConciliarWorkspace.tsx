'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDownTrayIcon, ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon,
  ExclamationTriangleIcon, MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import {
  CONCILIAR_COLORS, CONCILIAR_TABS, escapeSpreadsheet, formatDate, formatMagnitude, formatMoney,
  makeIdempotencyKey, parseConciliarActionResponse, parseConciliarDetailResponse, parseConciliarHistoryResponse, parseConciliarReadResponse, parseConciliarRemesaPreviewResponse, parseConciliarUndoResponse,
  safeDocumentHref, safeFinanceHref, safeOutcomeMessage,
  type ConciliarActionResponse, type ConciliarColor, type ConciliarConfirmItem, type ConciliarMutationPayload,
  type ConciliarEmitidasGroup, type ConciliarReadResponse, type ConciliarRemesaPreview, type ConciliarRow, type ConciliarSummary, type ConciliarTab,
} from './conciliar-contract';
import { useActuation } from '@/components/impersonation/ActuationProvider';
import dynamic from 'next/dynamic';
const ConciliarDocumentPreview = dynamic(() => import('./ConciliarDocumentPreview'));
const ConciliarRecentHistory = dynamic(() => import('./ConciliarRecentHistory'));
const ConciliarRemesaConfirmationDialog = dynamic(() => import('./ConciliarRemesaConfirmationDialog'));
const ConfirmingInterestInvoices = dynamic(() => import('./ConfirmingInterestInvoices'), { ssr: false });

const API = '/api/admin/finanzas/conciliar';
const REMESA_PREVIEW_API = '/api/admin/finanzas/conciliar/remesa-preview';
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
type OpenDocument = Readonly<{ rowId: string; title: string; href: string | null; explanation: string | null; movement: ConciliarRow }> | null;
type RemesaConfirmation = Readonly<{ row: ConciliarRow; preview: ConciliarRemesaPreview; payload: ConciliarMutationPayload }> | null;

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

function groupExplanation(group: string | null): string | null {
  if (!group) return null;
  const normalized = group.toLocaleLowerCase('es-ES');
  if (normalized.includes('banco') || normalized.includes('comisi')) return 'Comisiones, cuotas y gastos que aplica el banco.';
  if (normalized.includes('traspas')) return 'El mismo importe debe aparecer en otra cuenta propia dentro de tres días.';
  if (normalized.includes('nómina') || normalized.includes('nomina')) return 'Se compara con la nómina del empleado y del mes correspondiente.';
  if (normalized.includes('confirm') || normalized.includes('cesión') || normalized.includes('cesion')) return 'El documento de confirming indica las facturas y, si procede, los intereses.';
  if (normalized.includes('remesa')) return 'La suma de recibos se compara con cada ingreso y muestra lo que queda pendiente.';
  return null;
}

function humanGroup(group: string | null): string {
  if (!group) return 'Sin grupo';
  const key = group.toLocaleLowerCase('es-ES');
  if (/banco|comisi/.test(key)) return 'Gastos del banco';
  if (/traspas/.test(key)) return 'Traspasos entre cuentas propias';
  if (/n[oó]mina/.test(key)) return 'Nóminas';
  if (/confirm|cesi[oó]n/.test(key)) return 'Confirming y cesiones de crédito';
  if (/remesa/.test(key)) return 'Remesas';
  if (/emitida/.test(key)) return 'Facturas de clientes';
  if (/recibida|proveedor/.test(key)) return 'Facturas de proveedores';
  if (/tarjeta/.test(key)) return 'Tarjeta · ticket o factura';
  if (/impuesto|aeat|seguridad/.test(key)) return 'Impuestos y Seguridad Social';
  if (/pr[eé]stamo/.test(key)) return 'Préstamos';
  if (/devoluci/.test(key)) return 'Devoluciones de recibos';
  return group.replace(/_/g, ' ').toLocaleLowerCase('es-ES');
}

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
  return /remesa/i.test(`${row.grupo ?? ''} ${row.documento?.referencia ?? ''}`);
}

function humanUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'recién actualizada';
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function buildQuery(input: Readonly<{ tab: ConciliarTab; from: string; to: string; accountId: string; query: string; cutoffDate: string; historic?: boolean; emitidasGrupo?: ConciliarEmitidasGroup | ''; limit: number; offset: number }>): URLSearchParams {
  const params = new URLSearchParams({ tab: input.tab, limit: String(input.limit), offset: String(input.offset) });
  if (input.from) params.set('desde', input.from);
  if (input.to) params.set('hasta', input.to);
  if (input.accountId) params.set('cuentaId', input.accountId);
  if (input.query.trim()) params.set('q', input.query.trim().slice(0, 120));
  params.set('cutoffDate', input.cutoffDate);
  if (input.historic) params.set('historic', '1');
  if (input.emitidasGrupo && input.tab === 'EMITIDAS' && !input.historic) params.set('emitidasGrupo', input.emitidasGrupo);
  return params;
}

/** UI state becomes a closed, normalized response view. It is presentation only:
 * rows, amounts, IDs and authority remain exclusively server-derived. */
function responseViewFor(input: Readonly<{ tab: ConciliarTab; from: string; to: string; accountId: string; query: string; cutoffDate: string; emitidasGrupo: ConciliarEmitidasGroup | ''; limit: number; offset: number }>) {
  return {
    tab: input.tab,
    ...(input.from ? { desde: input.from } : {}),
    ...(input.to ? { hasta: input.to } : {}),
    ...(input.accountId ? { cuentaId: input.accountId } : {}),
    ...(input.query.trim() ? { q: input.query.trim().slice(0, 120) } : {}),
    cutoffDate: input.cutoffDate,
    historic: false,
    ...(input.tab === 'EMITIDAS' && input.emitidasGrupo ? { emitidasGrupo: input.emitidasGrupo } : {}),
    limit: input.limit,
    offset: input.offset,
  };
}
function responseViewKey(view: Readonly<{ tab: ConciliarTab; desde?: string; hasta?: string; cuentaId?: string; q?: string; cutoffDate?: string; historic?: boolean; emitidasGrupo?: ConciliarEmitidasGroup; limit: number; offset: number }>): string {
  return buildQuery({
    tab: view.tab, from: view.desde ?? '', to: view.hasta ?? '', accountId: view.cuentaId ?? '', query: view.q ?? '',
    cutoffDate: view.cutoffDate ?? '2026-01-01', historic: view.historic ?? false, emitidasGrupo: view.emitidasGrupo ?? '', limit: view.limit, offset: view.offset,
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

function GroupHeader({ group, color, count }: { group: string | null; color: ConciliarColor; count: number }) {
  const explanation = groupExplanation(group);
  const label = group ? humanGroup(group) : color === 'ROJO' ? 'Para pedir' : 'Sin regla agrupada';
  return <header className="flex min-w-0 items-start gap-2 px-2 pb-1 pt-4 first:pt-2">
    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${COLOR_COPY[color].dot}`} aria-hidden="true" />
    <div className="min-w-0"><h3 className="truncate text-sm font-extrabold text-[#2D2A26] dark:text-white">{label} <span className="font-medium text-slate-500 dark:text-slate-400">· {count} en esta página</span></h3>{explanation && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{explanation}</p>}</div>
  </header>;
}

function ResultBadge({ receipt, onUndo, disabled }: { receipt: Receipt | undefined; onUndo: () => void; disabled: boolean }) {
  if (!receipt) return null;
  if (receipt.status === 'failed') return <span className="block truncate text-xs font-semibold text-red-700 dark:text-red-300" title={receipt.message}>No hecho</span>;
  if (receipt.status === 'undone') return <span className="block truncate text-xs font-semibold text-slate-600 dark:text-slate-300">Deshecho</span>;
  return <span className="flex min-w-0 items-center justify-end gap-1"><span className="truncate text-xs font-bold text-emerald-700 dark:text-emerald-300">{receipt.status === 'asked' ? 'Añadido' : 'Hecho'}</span>{receipt.operationId && <button type="button" disabled={disabled} onClick={onUndo} className="shrink-0 text-xs font-bold text-[#FF5300] underline decoration-1 underline-offset-2 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:opacity-50">Deshacer</button>}</span>;
}

function MovementJump({ row }: { row: ConciliarRow }) {
  const link = row.linksMovimiento.map((item) => ({ ...item, href: safeFinanceHref(item.href) })).find((item) => item.href);
  if (!link) return null;
  return <a href={link.href!} className="truncate text-xs font-bold text-[#FF5300] underline decoration-1 underline-offset-2 focus:outline-none focus:ring-2 focus:ring-[#FF5300]" title={link.etiqueta}>{link.etiqueta || 'Ver movimiento que casa'}</a>;
}

function ConciliarRowView({ row, selected, receipt, busy, onSelect, onConfirm, onAsk, onOpen, onUndo }: {
  row: ConciliarRow;
  selected: boolean;
  receipt: Receipt | undefined;
  busy: boolean;
  onSelect: (checked: boolean) => void;
  onConfirm: () => void;
  onAsk: () => void;
  onOpen: (row: ConciliarRow) => void;
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
  return <article data-testid="conciliar-row" data-row-id={row.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 border-t border-slate-100 px-2 py-2 hover:bg-orange-50/40 dark:border-slate-800 dark:hover:bg-orange-950/15 xl:grid-cols-[auto_minmax(88px,.55fr)_minmax(150px,1.5fr)_minmax(115px,.7fr)_minmax(180px,1fr)_auto_minmax(104px,.65fr)_auto] xl:gap-3 xl:px-3">
    <div className="hidden min-w-0 xl:block"><span className={`inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-1 text-xs font-bold ${COLOR_COPY[row.color].badge}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_COPY[row.color].dot}`} aria-hidden="true" />{isRed && !row.movimientoId ? 'Rojo · pendiente' : COLOR_COPY[row.color].label}</span></div>
    <p className="min-w-0 text-xs font-semibold text-slate-600 dark:text-slate-300" title={formatDate(row.fecha)}><span className={`mb-0.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold xl:hidden ${COLOR_COPY[row.color].badge}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_COPY[row.color].dot}`} aria-hidden="true" />{isRed && !row.movimientoId ? 'Rojo · pendiente' : COLOR_COPY[row.color].label}</span><span className="block whitespace-nowrap">{formatDate(row.fecha)}</span></p>
    <div className="min-w-0"><p className="truncate text-sm font-bold text-[#2D2A26] dark:text-white" title={row.concepto}>{row.concepto}</p><p className="truncate text-xs text-slate-500 dark:text-slate-400 xl:hidden" title={`${account} · ${documentLabel}`}>{account} · {documentLabel}</p><div className="xl:hidden"><MovementJump row={row} />{row.diferenciaCentimos !== 0 && <p className="text-xs text-amber-800 dark:text-amber-300">Diferencia: {formatMoney(row.diferenciaCentimos)}</p>}</div></div>
    <p className="hidden truncate text-xs text-slate-600 dark:text-slate-300 xl:block" title={account}>{account}</p>
    <div className="hidden min-w-0 xl:block"><p data-testid="conciliar-document-reference" className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100" title={`${documentLabel} · ${documentInfo}`}>{documentLabel}</p><MovementJump row={row} /></div>
    <div className="hidden text-right xl:block"><p className="whitespace-nowrap text-sm font-extrabold tabular-nums text-[#2D2A26] dark:text-white">{formatMoney(row.importeCentimos)}</p>{row.diferenciaCentimos !== 0 && <p className="whitespace-nowrap text-xs font-semibold tabular-nums text-amber-800 dark:text-amber-300">Dif. {formatMoney(row.diferenciaCentimos)}</p>}</div>
    <div className="hidden min-w-0 xl:block"><button type="button" onClick={() => onOpen(row)} title={row.motivo} aria-label="Ver nota completa" className="line-clamp-2 text-left text-xs leading-4 text-slate-600 underline decoration-dotted underline-offset-2 focus:outline-none focus:ring-2 focus:ring-[#FF5300] dark:text-slate-300">{row.motivo}</button><ResultBadge receipt={receipt} disabled={busy} onUndo={onUndo} /></div>
    <p className="whitespace-nowrap text-sm font-extrabold tabular-nums text-[#2D2A26] dark:text-white xl:hidden">{formatMoney(row.importeCentimos)}</p>
    <div className="flex items-center justify-end gap-1.5">{canConfirm && <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} aria-label={`Seleccionar ${row.concepto}`} disabled={busy} className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 disabled:opacity-50" />}{action}</div>
    <button type="button" onClick={() => onOpen(row)} title={row.motivo} className="col-span-full line-clamp-2 text-left text-xs text-slate-600 underline decoration-dotted underline-offset-2 dark:text-slate-300 xl:hidden">{row.motivo}</button>
    {receipt && <p className="col-span-full truncate px-1 text-xs xl:hidden"><ResultBadge receipt={receipt} disabled={busy} onUndo={onUndo} /></p>}
  </article>;
}


export default function ConciliarWorkspace({ initialTab = 'COBROS', initialQuery = '', initialCutoff = '2026-01-01', initialData }: { initialTab?: ConciliarTab; initialQuery?: string; initialCutoff?: string; initialData?: unknown }) {
  const { active: activeActuation } = useActuation();
  const initialParsed = useMemo(() => initialData === undefined ? null : parseConciliarReadResponse(initialData), [initialData]);
  const [tab, setTab] = useState<ConciliarTab>(initialTab);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accountId, setAccountId] = useState('');
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [cutoffDate, setCutoffDate] = useState(initialCutoff);
  const [emitidasGrupo, setEmitidasGrupo] = useState<ConciliarEmitidasGroup | ''>('');
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
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [receipts, setReceipts] = useState<readonly Receipt[]>([]);
  const [openDocument, setOpenDocument] = useState<OpenDocument>(null);
  const [sending, setSending] = useState(false);
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

  const requestInput = useMemo(() => ({ tab, from, to, accountId, query, cutoffDate, emitidasGrupo, limit: PAGE_SIZE, offset }), [accountId, emitidasGrupo, from, offset, query, tab, to, cutoffDate]);
  activeViewKey.current = buildQuery(requestInput).toString();
  const initialRequestKey = useRef(initialParsed ? buildQuery({ tab: initialTab, from: '', to: '', accountId: '', query: initialQuery, cutoffDate: initialCutoff, limit: PAGE_SIZE, offset: 0 }).toString() : null);
  const rows = data?.rows ?? [];
  const visibleSelectable = useMemo(() => rows.filter((row) => row.color === 'VERDE' && row.seleccionable), [rows]);
  const receiptByRow = useMemo(() => new Map(receipts.map((receipt) => [receipt.rowId, receipt])), [receipts]);
  const mutationsBlocked = sending || retry !== null || remesaPreviewLoading;

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
      // The selection is intentionally page-bound: filters or a fresh projection never carry hidden rows.
      setSelected(new Set());
      setOpenDocument((current) => current && !parsed.rows.some((row) => row.id === current.rowId) ? null : current);
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
  }, [load, requestInput]);
  useEffect(() => () => { readSequence.current += 1; detailSequence.current += 1; remesaPreviewSequence.current += 1; readController.current?.abort(); detailController.current?.abort(); remesaPreviewController.current?.abort(); exportController.current?.abort(); }, []);

  useEffect(() => {
    if (!data?.stale) { refreshAttempts.current = 0; return; }
    if (refreshAttempts.current >= 30 || mutationsBlocked) return;
    const timeout = window.setTimeout(() => {
      refreshAttempts.current += 1;
      void load(true, true);
    }, 1_200);
    return () => window.clearTimeout(timeout);
  }, [data, load, mutationsBlocked]);

  const changeTab = useCallback((next: ConciliarTab) => { if (next === tab) return; remesaPreviewController.current?.abort(); setRemesaConfirmation(null); setTab(next); if (next !== 'EMITIDAS') setEmitidasGrupo(''); setOffset(0); setSelected(new Set()); setOpenDocument(null); }, [tab]);
  const changeAccount = useCallback((next: string) => { setAccountId(next); setOffset(0); }, []);
  const changeDate = useCallback((kind: 'from' | 'to', value: string) => { if (kind === 'from') setFrom(value); else setTo(value); setOffset(0); }, []);
  const submitSearch = useCallback((event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setQuery(queryInput.trim().slice(0, 120)); setOffset(0); }, [queryInput]);
  const changeEmitidasGrupo = useCallback((next: ConciliarEmitidasGroup) => {
    remesaPreviewController.current?.abort(); setRemesaConfirmation(null);
    setEmitidasGrupo((current) => current === next ? '' : next);
    setOffset(0); setSelected(new Set()); setOpenDocument(null);
  }, []);
  const changeCutoff = useCallback((value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return;
    setCutoffDate(value); setOffset(0); setHistoricOffset(0); setHistoricData(null);
    // Una fecha de presentación, no autorización ni estado de cobro.
    document.cookie = `io_conciliar_cutoff=${value}; Path=/admin/finanzas/conciliar; SameSite=Lax; Secure; Max-Age=31536000`;
  }, []);

  useEffect(() => {
    if (!historicOpen || tab !== 'EMITIDAS') return;
    const controller = new AbortController(); historicController.current?.abort(); historicController.current = controller;
    setHistoricLoading(true);
    const params = buildQuery({ tab: 'EMITIDAS', from, to, accountId, query, cutoffDate, historic: true, limit: PAGE_SIZE, offset: historicOffset });
    void fetch(`${API}?${params}`, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(friendlyError(raw, 'No se pudieron leer las facturas anteriores.'));
      if (!controller.signal.aborted) setHistoricData(parseConciliarReadResponse(raw));
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setNotice({ tone: 'error', text: error instanceof Error ? safeOutcomeMessage(error.message, 'No se pudieron leer las facturas anteriores.') : 'No se pudieron leer las facturas anteriores.' });
    }).finally(() => { if (!controller.signal.aborted) setHistoricLoading(false); });
    return () => controller.abort();
  }, [accountId, cutoffDate, from, historicOpen, historicOffset, query, tab, to, data?.updatedAt]);

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
      setSelected(new Set());
      setOpenDocument((current) => current && !projection.rows.some((row) => row.id === current.rowId) ? null : current);
      return true;
    };
    setSending(true);
    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeActuation ? { 'x-io-acting-session': activeActuation.sessionId } : {}),
        },
        body: JSON.stringify(command),
      });
      const raw: unknown = await response.json().catch(() => null);
      if (response.status === 409) {
        setRetry(null); setSelected(new Set()); setNotice({ tone: 'error', text: friendlyError(raw, 'Estos datos han cambiado. Pulsa Actualizar y vuelve a decidir con los datos nuevos.') });
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
      setRetry(null);
      setSelected((current) => {
        const next = new Set(current);
        result.outcomes.filter((outcome) => outcome.ok).forEach((outcome) => next.delete(outcome.id));
        return next;
      });
      const succeeded = result.outcomes.filter((outcome) => outcome.ok).length;
      const failed = result.outcomes.length - succeeded;
      setNotice({ tone: failed ? 'info' : 'success', text: failed ? `${succeeded} hecha(s); ${failed} necesita(n) revisión. Consulta la actividad reciente.` : payload.action === 'pedir' ? 'Añadido a Para pedir. No se ha enviado ningún aviso.' : 'Hecho. Puedes deshacerlo aquí o desde la actividad reciente.' });
      if (!adoptProjection(result.projection)) void load(true, true);
      if (showHistory) void loadHistory();
    } catch (error) {
      if (isUncertain(error)) {
        setRetry({ payload: command, label });
        setNotice({ tone: 'error', text: 'No pudimos comprobar el resultado. Reintenta exactamente la misma acción antes de continuar.' });
      } else {
        setNotice({ tone: 'error', text: error instanceof Error ? safeOutcomeMessage(error.message, 'No se pudo completar la acción.') : 'No se pudo completar la acción.' });
      }
    } finally { setSending(false); }
  }, [activeActuation, finishOutcomes, load, loadHistory, requestInput, rows, sending, showHistory]);

  const confirmRows = useCallback((source: readonly ConciliarRow[]) => {
    if (mutationsBlocked || remesaPreviewLoading) return;
    const confirmable = source.filter((row) => row.color === 'VERDE' && row.seleccionable);
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
  }, [mutationsBlocked, post, remesaPreviewLoading]);

  const askForDocument = useCallback((row: ConciliarRow) => {
    if (mutationsBlocked) return;
    void post({ action: 'pedir', id: row.id, decisionHash: row.decisionHash, idempotencyKey: makeIdempotencyKey() }, 'solicitud de documento');
  }, [mutationsBlocked, post]);

  const openDetail = useCallback(async (row: ConciliarRow) => {
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    const sequence = ++detailSequence.current;
    try {
      const response = await fetch(`${API}?rowId=${encodeURIComponent(row.id)}`, { cache: 'no-store', signal: controller.signal });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(friendlyError(raw, 'No se pudo abrir el detalle de este documento.'));
      const detail = parseConciliarDetailResponse(raw);
      if (sequence !== detailSequence.current || detail.id !== row.id) return;
      const href = safeDocumentHref(detail.documento?.href ?? null);
      setOpenDocument({ rowId: detail.id, title: detail.documento?.referencia || 'Detalle del movimiento', href, explanation: detail.detail || detail.motivo, movement: detail });
    } catch (error) {
      if (sequence !== detailSequence.current || (error instanceof DOMException && error.name === 'AbortError')) return;
      setNotice({ tone: 'error', text: error instanceof Error ? safeOutcomeMessage(error.message, 'No se pudo abrir el detalle de este documento.') : 'No se pudo abrir el detalle de este documento.' });
    } finally {
      if (detailController.current === controller) detailController.current = null;
    }
  }, []);

  const undoReceipt = useCallback((receipt: Receipt) => {
    if (mutationsBlocked || !receipt.operationId) return;
    void post({ action: 'deshacer', operationId: receipt.operationId, idempotencyKey: makeIdempotencyKey() }, 'deshacer');
  }, [mutationsBlocked, post]);

  const toggleAllVisible = useCallback((checked: boolean) => {
    // Una remesa se abre y confirma sola, tras su composición completa.
    setSelected(checked ? new Set(visibleSelectable.filter((row) => !remesaHint(row)).map((row) => row.id)) : new Set());
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
        const params = buildQuery({ tab, from, to, accountId, query, cutoffDate, emitidasGrupo, limit: EXPORT_PAGE_SIZE, offset: pageOffset });
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
      const exportRows = collected.map((row) => ({
        Fecha: escapeSpreadsheet(row.fecha),
        Estado: escapeSpreadsheet(COLOR_COPY[row.color].label),
        Grupo: escapeSpreadsheet(humanGroup(row.grupo)),
        Concepto: escapeSpreadsheet(row.concepto),
        Banco: escapeSpreadsheet(row.banco ?? ''),
        Cuenta: escapeSpreadsheet(row.cuenta ?? ''),
        Importe: row.importeCentimos / 100,
        Pendiente: row.pendienteCentimos / 100,
        Documento: escapeSpreadsheet(row.documento?.referencia ?? ''),
        Tercero: escapeSpreadsheet(row.documento?.tercero ?? ''),
        'Importe documento': row.documento ? row.documento.importeCentimos / 100 : '',
        'Fecha documento': escapeSpreadsheet(row.documento?.fecha ?? ''),
        Diferencia: row.diferenciaCentimos / 100,
        Motivo: escapeSpreadsheet(row.motivo),
      }));
      const sheet = XLSX.utils.json_to_sheet(exportRows);
      sheet['!cols'] = [12, 18, 22, 42, 20, 20, 14, 14, 20, 26, 18, 18, 14, 46].map((wch) => ({ wch }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, TAB_COPY[tab].short.slice(0, 31));
      XLSX.writeFile(book, `conciliar-${tab.toLocaleLowerCase('es-ES')}-${dateForInput(new Date())}.xlsx`, { compression: true });
      setNotice({ tone: 'success', text: `${collected.length.toLocaleString('es-ES')} filas exportadas.` });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setNotice({ tone: 'error', text: error instanceof Error ? safeOutcomeMessage(error.message, 'No se pudo exportar.') : 'No se pudo exportar.' });
    } finally {
      if (exportController.current === controller) exportController.current = null;
      setExporting(false);
    }
  }, [accountId, data, emitidasGrupo, exporting, from, query, tab, to, cutoffDate]);

  const grouped = useMemo(() => {
    const buckets = new Map<ConciliarColor, Map<string, ConciliarRow[]>>();
    for (const color of CONCILIAR_COLORS) buckets.set(color, new Map());
    for (const row of rows) {
      const key = row.grupo || (row.color === 'ROJO' ? row.motivo : '');
      const groups = buckets.get(row.color)!;
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    return buckets;
  }, [rows]);
  const emitidasGroupLabel = emitidasGrupo ? EMITIDAS_GROUP_COPY[emitidasGrupo].label : '';

  return <main className="mx-auto w-full max-w-[1700px] min-w-0 overflow-x-hidden space-y-4 px-3 py-4 text-[#2D2A26] dark:text-slate-100 sm:px-5 sm:py-6" style={{ fontFamily: 'var(--font-conciliar), Arial, Helvetica, sans-serif' }} data-testid="conciliar-workspace">
    <header data-conciliar-heading className="flex flex-col gap-3 border-b border-orange-100 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FF5300]">Conciliación</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#2D2A26] dark:text-white sm:text-3xl">Conciliar</h1><p data-conciliar-subtitle className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">Una vista directa de lo que queda por casar, revisar o pedir.</p></div>
      <button type="button" onClick={() => void load(true)} disabled={loading || refreshing || mutationsBlocked} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-[#FFB18C] bg-white px-3 py-2 text-sm font-bold text-[#BF3E00] shadow-sm hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900 dark:text-orange-200"><ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />Actualizar</button>
    </header>

    <Guide invoicePending={tab === 'EMITIDAS' || tab === 'RECIBIDAS'} />

    {data?.stale && <div role="status" aria-live="polite" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100">Los resúmenes tienen cambios pendientes de actualizar. Cada confirmación vuelve a comprobar su documento; los importes del resumen pueden cambiar.</div>}

    {notice && <div role={notice.tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/45 dark:text-red-100' : notice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-100' : 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/45 dark:text-sky-100'}`}><ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{notice.text}</span></div>}
    {retry && <div role="status" aria-live="assertive" className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"><span>El resultado está pendiente de comprobar. Reintenta la misma acción para evitar duplicados.</span><button type="button" onClick={() => void post(retry.payload, retry.label)} disabled={sending} className="min-h-10 shrink-0 rounded-md bg-amber-700 px-3 py-2 text-sm font-extrabold text-white hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-600 disabled:opacity-50">{sending ? 'Reintentando…' : 'Reintentar igual'}</button></div>}

    <section className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900"><div role="tablist" aria-label="Bandejas de conciliación" className="grid min-w-0 grid-cols-2 gap-2 xl:grid-cols-4">{data ? CONCILIAR_TABS.map((item) => { const summary = data.tabs.find((candidate) => candidate.tab === item); return summary ? <SummaryTab key={item} summary={summary} active={tab === item} onClick={() => changeTab(item)} /> : null; }) : CONCILIAR_TABS.map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}</div></section>

    <section aria-label="Fecha de corte de emitidas" className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-3xl text-slate-600 dark:text-slate-300">Emitidas cuenta sólo las facturas desde el corte. Las anteriores se conservan aparte: no damos por pendiente un cobro antiguo que nunca se confirmó aquí.</p>
      <label className="shrink-0 font-semibold">Fecha de corte<input type="date" value={cutoffDate} onChange={(event) => changeCutoff(event.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" /></label>
    </section>

    {tab === 'EMITIDAS' && data && <EmitidasGroupFilters groups={data.emitidasGroups} activeGroup={emitidasGrupo} onChange={changeEmitidasGrupo} />}

    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"><form onSubmit={submitSearch} className="grid min-w-0 gap-2 md:grid-cols-[minmax(160px,1fr)_145px_145px_210px_auto] md:items-end"><label className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100">Buscar<span className="relative mt-1 block"><MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value.slice(0, 120))} maxLength={120} placeholder="Concepto, factura, tercero o importe" className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-[#2D2A26] focus:border-[#FF5300] focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></span></label><label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Desde<input type="date" value={from} onChange={(event) => changeDate('from', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-[#2D2A26] focus:border-[#FF5300] focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label><label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Hasta<input type="date" value={to} onChange={(event) => changeDate('to', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-[#2D2A26] focus:border-[#FF5300] focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label><label className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100">Cuenta<select value={accountId} onChange={(event) => changeAccount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-[#2D2A26] focus:border-[#FF5300] focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white"><option value="">Todas las cuentas</option>{(data?.cuentas ?? []).map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</select></label><button type="submit" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#FF5300] px-3 py-2 text-sm font-extrabold text-white hover:bg-[#E04900] focus:outline-none focus:ring-2 focus:ring-[#FF5300] focus:ring-offset-2 dark:focus:ring-offset-slate-950"><MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />Buscar</button></form></section>

    <section role="tabpanel" id={`conciliar-panel-${tab}`} aria-labelledby={`conciliar-tab-${tab}`} className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"><header className="flex flex-col gap-3 border-b border-slate-200 px-3 py-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h2 className="font-extrabold text-[#2D2A26] dark:text-white">{TAB_COPY[tab].title}{tab === 'EMITIDAS' && emitidasGroupLabel ? ` · ${emitidasGroupLabel}` : ''}</h2><p className="truncate text-xs text-slate-600 dark:text-slate-300">{TAB_COPY[tab].question}{data ? ` · ${data.total.toLocaleString('es-ES')} resultado(s)` : ''}{data ? ` · actualizado ${humanUpdatedAt(data.updatedAt)}` : ''}</p></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => void exportAll()} disabled={!data || exporting || mutationsBlocked} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"><ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />{exporting ? 'Exportando…' : 'Exportar a Excel'}</button>{visibleSelectable.length > 0 && <><label className="inline-flex min-h-9 items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200"><input type="checkbox" checked={visibleSelectable.length > 0 && visibleSelectable.every((row) => selected.has(row.id))} onChange={(event) => toggleAllVisible(event.target.checked)} disabled={mutationsBlocked} className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" />Todos los verdes visibles</label><button type="button" onClick={() => confirmRows(rows.filter((row) => selected.has(row.id)))} disabled={mutationsBlocked || selected.size === 0} className="min-h-9 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">Confirmar seleccionados{selected.size ? ` (${selected.size})` : ''}</button></>}</div></header>
      <div className={`grid min-w-0 ${openDocument ? "2xl:grid-cols-[minmax(0,1fr)_minmax(360px,.55fr)] 2xl:items-start" : ""}`}><div className="min-w-0">{loading ? <Skeleton /> : !data ? <Empty text="No hay datos validados. Actualiza para volver a intentarlo." /> : rows.length === 0 ? <Empty text="No hay resultados con estos filtros." /> : <><div className="hidden grid-cols-[auto_minmax(88px,.55fr)_minmax(150px,1.5fr)_minmax(115px,.7fr)_minmax(180px,1fr)_auto_minmax(104px,.65fr)_auto] gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 xl:grid"><span>Estado</span><span>Fecha</span><span>Concepto</span><span>Cuenta</span><span>Documento</span><span className="text-right">Importe</span><span>Nota</span><span>Acción</span></div>{CONCILIAR_COLORS.map((color) => { const groups = grouped.get(color)!; return [...groups.entries()].map(([group, colorRows]) => <section key={`${color}-${group || 'general'}`} aria-label={`${COLOR_COPY[color].label}: ${group || 'sin grupo'}`}><GroupHeader group={group || null} color={color} count={colorRows.length} />{colorRows.map((row) => <ConciliarRowView key={row.id} row={row} selected={selected.has(row.id)} receipt={receiptByRow.get(row.id)} busy={mutationsBlocked} onSelect={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(row.id); else next.delete(row.id); return next; })} onConfirm={() => confirmRows([row])} onAsk={() => askForDocument(row)} onOpen={openDetail} onUndo={() => { const receipt = receiptByRow.get(row.id); if (receipt) undoReceipt(receipt); }} />)}</section>); })}</>}</div>{openDocument && <div className="border-t border-slate-200 p-3 dark:border-slate-700 xl:sticky xl:top-3 xl:border-l xl:border-t-0"><ConciliarDocumentPreview document={openDocument} onClose={() => setOpenDocument(null)} /></div>}</div>
      {data && <footer className="flex flex-col gap-2 border-t border-slate-200 px-3 py-3 text-sm dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-600 dark:text-slate-300">Mostrando {data.total === 0 ? 0 : data.offset + 1}–{Math.min(data.offset + data.rows.length, data.total)} de {data.total.toLocaleString('es-ES')}.</p><div className="flex gap-2"><button type="button" disabled={data.offset === 0 || mutationsBlocked} onClick={() => setOffset(Math.max(0, data.offset - data.limit))} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:opacity-50 dark:border-slate-600 dark:text-slate-100"><ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />Anterior</button><button type="button" disabled={data.rows.length === 0 || data.offset + data.rows.length >= data.total || mutationsBlocked} onClick={() => setOffset(data.offset + data.rows.length)} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:opacity-50 dark:border-slate-600 dark:text-slate-100">Ver más<ChevronRightIcon className="h-4 w-4" aria-hidden="true" /></button></div></footer>}
    </section>

    {tab === 'EMITIDAS' && data && <details onToggle={(event) => setHistoricOpen(event.currentTarget.open)} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <summary className="cursor-pointer text-sm font-semibold">Anteriores a la fecha de corte · {data.historicSummary.count.toLocaleString('es-ES')} facturas · {formatMagnitude(data.historicSummary.amountCentimos)}</summary>
      <p className="py-2 text-xs text-slate-600 dark:text-slate-300">No cuentan en el resumen. Su cobro histórico no consta confirmado en este panel; esto no prueba que el cliente deba ese importe.</p>
      {historicLoading ? <Skeleton /> : historicData && <>
        {historicData.rows.map((row) => <ConciliarRowView key={row.id} row={row} selected={false} receipt={undefined} busy={mutationsBlocked} onSelect={() => undefined} onConfirm={() => undefined} onAsk={() => undefined} onOpen={openDetail} onUndo={() => undefined} />)}
        <div className="flex items-center justify-between gap-2 pt-3 text-xs"><span>{historicData.total ? historicData.offset + 1 : 0}–{Math.min(historicData.total, historicData.offset + historicData.rows.length)} de {historicData.total}</span><div className="flex gap-2"><button type="button" disabled={historicOffset === 0} onClick={() => setHistoricOffset(Math.max(0, historicOffset - PAGE_SIZE))} className="min-h-9 rounded border px-2 disabled:opacity-50">Anteriores</button><button type="button" disabled={historicOffset + historicData.rows.length >= historicData.total} onClick={() => setHistoricOffset(historicOffset + PAGE_SIZE)} className="min-h-9 rounded border px-2 disabled:opacity-50">Siguientes</button></div></div>
      </>}
    </details>}

    {receipts.length > 0 && <ConciliarRecentHistory receipts={receipts} busy={mutationsBlocked} onUndo={undoReceipt} />}
    <button type="button" onClick={() => setShowHistory(true)} className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">{showHistory ? 'Historial cargado' : 'Ver historial de confirmaciones'}</button>
    <details onToggle={(event) => setShowInterestInvoices(event.currentTarget.open)} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><summary className="cursor-pointer text-sm font-semibold">Facturas bancarias de intereses de confirming</summary>{showInterestInvoices && <ConfirmingInterestInvoices />}</details>
    <p className="px-1 text-xs text-slate-500 dark:text-slate-400">Las confirmaciones se hacen una vez, quedan registradas y se pueden deshacer. Pedir sólo añade la fila a la lista interna; no envía correos ni notificaciones.</p>
    {remesaConfirmation && <ConciliarRemesaConfirmationDialog confirmation={remesaConfirmation} busy={sending} onCancel={() => { if (!sending) setRemesaConfirmation(null); }} onConfirm={() => { if (!sending) { const current = remesaConfirmation; setRemesaConfirmation(null); void post(current.payload, 'confirmación de remesa revisada'); } }} />}
  </main>;
}
