'use client';

import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildDeshacerBloquePayload, type DeshacerBloquePayload } from './historical-bulk-contract';
import { crearClaveIdempotencia, fechaCorta } from './utils';

const RECEIPTS_ENDPOINT = '/api/admin/finanzas/conciliacion-v2/heredados-recibos';
const BULK_ENDPOINT = '/api/admin/finanzas/conciliacion-v2/heredados-bloque';
const MAX_BLOCKS = 100;
const MAX_OPERATIONS = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CENTS = /^-?(?:0|[1-9]\d*)$/;

type HistoricalBlockReceipt = Readonly<{
  bloqueId: string;
  fechaPrimeraConfirmacion: string;
  fechaUltimaConfirmacion: string;
  actor: string;
  confirmadas: number;
  operacionesAplicadas: number;
  operacionesRevertidas: number;
  operacionesPendientes: number;
  totalCargosCentimos: string;
  totalCobrosCentimos: string;
  delegacion: string | null;
}>;

type PendingUndo = Readonly<{
  receipt: HistoricalBlockReceipt;
  payload: DeshacerBloquePayload;
  uncertain: boolean;
}>;

type HistoricalBlockReceiptsPanelProps = Readonly<{
  canWrite: boolean;
  onChanged: () => void;
}>;

type ParseResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: string }>;

function ok<T>(value: T): ParseResult<T> { return { ok: true, value }; }
function fail<T = never>(error: string): ParseResult<T> { return { ok: false, error }; }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }

function visibleText(value: unknown, maximum: number, allowEmpty = false): string | null {
  if (typeof value !== 'string') return null;
  if (/[\u0000-\u001f\u007f<>]/u.test(value)) return null;
  const normalized = value.trim();
  // React escapa el contenido al renderizar; aun así no aceptamos controles para
  // que el recibo no pueda alterar etiquetas, lectores de pantalla ni registros.
  if (normalized.length > maximum || (!allowEmpty && normalized.length === 0)) return null;
  return normalized;
}

function timestamp(value: unknown): string | null {
  const candidate = visibleText(value, 80);
  if (!candidate || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(candidate)) return null;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) || date.toISOString() !== candidate ? null : candidate;
}

function cents(value: unknown, sign: 'cargo' | 'cobro'): string | null {
  if (typeof value !== 'string' || !CENTS.test(value) || value === '-0' || value.length > 31) return null;
  const amount = BigInt(value);
  if ((sign === 'cargo' && amount > BigInt(0)) || (sign === 'cobro' && amount < BigInt(0))) return null;
  return value;
}

function safeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_OPERATIONS;
}

/**
 * El contrato del recibo es deliberadamente más pequeño que el evento B4. Si
 * aparece una clave, hash o identidad inesperada se ignora; sólo los campos
 * públicos enumerados abajo pueden llegar al DOM.
 */
export function parseHistoricalBlockReceipts(value: unknown): ParseResult<readonly HistoricalBlockReceipt[]> {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > MAX_BLOCKS) return fail('La lista de recibos históricos está incompleta o supera su límite seguro.');
  const blocks = new Set<string>();
  const receipts: HistoricalBlockReceipt[] = [];
  for (const raw of value.items) {
    if (!isRecord(raw)) return fail('Un recibo histórico no tiene una forma verificable.');
    const bloqueId = visibleText(raw.bloqueId, 36);
    const fechaPrimeraConfirmacion = timestamp(raw.fechaPrimeraConfirmacion);
    const fechaUltimaConfirmacion = timestamp(raw.fechaUltimaConfirmacion);
    const actor = visibleText(raw.actor, 120);
    const totalCargosCentimos = cents(raw.totalCargosCentimos, 'cargo');
    const totalCobrosCentimos = cents(raw.totalCobrosCentimos, 'cobro');
    const delegacion = raw.delegacion === null ? null : visibleText(raw.delegacion, 180);
    if (!bloqueId || !UUID.test(bloqueId) || blocks.has(bloqueId) || !fechaPrimeraConfirmacion || !fechaUltimaConfirmacion || fechaPrimeraConfirmacion > fechaUltimaConfirmacion || !actor || !totalCargosCentimos || !totalCobrosCentimos || delegacion === null && raw.delegacion !== null || !safeCount(raw.confirmadas) || !safeCount(raw.operacionesAplicadas) || !safeCount(raw.operacionesRevertidas) || !safeCount(raw.operacionesPendientes)) {
      return fail('Un recibo histórico contiene identidad, fecha, estado o totales no verificables.');
    }
    const confirmadas = raw.confirmadas;
    const operacionesAplicadas = raw.operacionesAplicadas;
    const operacionesRevertidas = raw.operacionesRevertidas;
    const operacionesPendientes = raw.operacionesPendientes;
    if (confirmadas < 1 || operacionesAplicadas + operacionesRevertidas + operacionesPendientes !== confirmadas) return fail('El recuento de operaciones del bloque no es coherente.');
    blocks.add(bloqueId);
    receipts.push(Object.freeze({ bloqueId, fechaPrimeraConfirmacion, fechaUltimaConfirmacion, actor, confirmadas, operacionesAplicadas, operacionesRevertidas, operacionesPendientes, totalCargosCentimos, totalCobrosCentimos, delegacion }));
  }
  return ok(Object.freeze(receipts));
}

export function canUndoHistoricalBlock(receipt: HistoricalBlockReceipt): boolean {
  return receipt.confirmadas > 0
    && receipt.confirmadas <= MAX_OPERATIONS
    && receipt.operacionesAplicadas === receipt.confirmadas
    && receipt.operacionesRevertidas === 0
    && receipt.operacionesPendientes === 0;
}

function formatCents(value: string): string {
  const negative = value.startsWith('-');
  const digits = negative ? value.slice(1) : value;
  const normalized = digits.padStart(3, '0');
  const integer = normalized.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : value === '0' ? '' : '+'}${integer},${normalized.slice(-2)} €`;
}

function backendMessage(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  return visibleText(value.error, 360) || fallback;
}

function isRetryableFailure(error: unknown, responseStatus?: number): boolean {
  return responseStatus !== undefined ? responseStatus >= 500 : error instanceof TypeError || (error instanceof Error && /network|fetch/i.test(error.message));
}

function stateMessage(receipt: HistoricalBlockReceipt): string | null {
  if (canUndoHistoricalBlock(receipt)) return null;
  if (receipt.operacionesRevertidas > 0 && receipt.operacionesRevertidas < receipt.confirmadas) return 'El bloque está parcialmente revertido. Use la reversión individual de las operaciones restantes.';
  if (receipt.operacionesRevertidas === receipt.confirmadas) return 'Este bloque ya está completamente revertido.';
  return 'El bloque ya no conserva todas sus operaciones aplicadas. Use la reversión individual si procede.';
}

/**
 * Panel de consulta de auditoría. Sólo un segundo clic dentro del diálogo envía
 * una reversión; el montaje y las recargas ejecutan únicamente GET.
 */
export default function HistoricalBlockReceiptsPanel({ canWrite, onChanged }: HistoricalBlockReceiptsPanelProps) {
  const [receipts, setReceipts] = useState<readonly HistoricalBlockReceipt[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string>('');
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const [undoing, setUndoing] = useState(false);
  const requestSequence = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const loadReceipts = useCallback(async (force = false) => {
    if (!force && pendingUndo?.uncertain) {
      setNotice('Hay una reversión cuya respuesta no se pudo verificar. Reintente exactamente la misma reversión antes de actualizar los recibos.');
      return;
    }
    const sequence = ++requestSequence.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setNotice('');
    try {
      const response = await fetch(`${RECEIPTS_ENDPOINT}?limit=${MAX_BLOCKS}`, { cache: 'no-store', signal: controller.signal });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(backendMessage(json, 'No se pudieron leer los recibos históricos.'));
      const parsed = parseHistoricalBlockReceipts(json);
      if ('error' in parsed) throw new Error(`La respuesta de recibos no se puede usar de forma segura: ${parsed.error}`);
      if (sequence === requestSequence.current) setReceipts(parsed.value);
    } catch (error) {
      if (!controller.signal.aborted && sequence === requestSequence.current) setNotice(error instanceof Error ? error.message : 'No se pudieron leer los recibos históricos.');
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [pendingUndo?.uncertain]);

  useEffect(() => {
    void loadReceipts();
    return () => controllerRef.current?.abort();
  }, [loadReceipts]);

  useEffect(() => {
    if (pendingUndo) window.setTimeout(() => confirmButtonRef.current?.focus(), 0);
  }, [pendingUndo]);

  const undoableCount = useMemo(() => receipts?.filter(canUndoHistoricalBlock).length ?? 0, [receipts]);

  const openUndoReview = (receipt: HistoricalBlockReceipt) => {
    if (!canWrite || undoing || !canUndoHistoricalBlock(receipt)) return;
    if (pendingUndo?.uncertain) {
      if (pendingUndo.receipt.bloqueId === receipt.bloqueId) return;
      setNotice('Primero reintente la reversión cuya respuesta no pudo verificarse. Se conserva su misma clave de idempotencia.');
      return;
    }
    const payload = buildDeshacerBloquePayload(crearClaveIdempotencia(), receipt.bloqueId);
    if (!payload) {
      setNotice('El identificador del recibo no se puede usar para una reversión segura.');
      return;
    }
    setNotice('');
    setPendingUndo(Object.freeze({ receipt, payload, uncertain: false }));
  };

  const submitUndo = async () => {
    const pending = pendingUndo;
    if (!pending || undoing || !canWrite || !canUndoHistoricalBlock(pending.receipt)) return;
    setUndoing(true);
    setNotice('');
    try {
      const response = await fetch(BULK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Se conserva literalmente para que un 5xx/red se reintente con el mismo UUID y bloque.
        body: JSON.stringify(pending.payload),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = backendMessage(json, 'No se pudo deshacer el bloque histórico.');
        if (isRetryableFailure(new Error(message), response.status)) throw new Error(message);
        setPendingUndo(null);
        setNotice(message);
        void loadReceipts(true);
        return;
      }
      if (!isRecord(json) || json.ok !== true || json.bloqueId !== pending.payload.bloqueId || typeof json.idempotente !== 'boolean' || !safeCount(json.revertidas) || json.revertidas !== pending.receipt.confirmadas) {
        throw new Error('La respuesta de reversión no se puede verificar.');
      }
      setPendingUndo(null);
      setNotice(json.idempotente ? 'La reversión de este bloque ya constaba registrada.' : 'Reversión completa del bloque registrada. La auditoría se conserva.');
      onChanged();
      await loadReceipts(true);
    } catch (error) {
      // Un 5xx, una red caída o una respuesta correcta pero ilegible se tratan como
      // inciertos: el siguiente intento reenvía exactamente el objeto inmutable.
      setPendingUndo(Object.freeze({ ...pending, uncertain: true }));
      setNotice(error instanceof Error ? `${error.message} Reintente sin cambiar el bloque.` : 'No se pudo verificar la reversión. Reintente sin cambiar el bloque.');
    } finally {
      setUndoing(false);
    }
  };

  return <section aria-labelledby="historical-receipts-title" data-historical-receipts-version="1" className="min-w-0 max-w-full overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-sm">
    <header className="flex flex-col gap-3 border-b border-indigo-100 bg-indigo-50/60 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-800">Heredados · auditoría</p>
        <h2 id="historical-receipts-title" className="mt-1 text-lg font-bold text-slate-950">Recibos de bloques confirmados</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-700">Consulta de hasta {MAX_BLOCKS} bloques ya auditados. Los cargos y cobros se conservan separados; no se netean ni se recalculan por movimiento.</p>
      </div>
      <button type="button" onClick={() => { void loadReceipts(); }} disabled={loading || undoing || Boolean(pendingUndo?.uncertain)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-bold text-indigo-900 transition hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60">
        <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> {loading ? 'Leyendo recibos…' : 'Actualizar recibos'}
      </button>
    </header>

    <div className="space-y-4 px-4 py-4 sm:px-5">
      {!canWrite && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>Modo consulta.</strong> Puede revisar los recibos, pero su permiso actual no permite deshacer bloques.</p>}
      {notice && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">{notice}</p>}
      {receipts && <p className="text-xs text-slate-600">{receipts.length} bloques visibles · {undoableCount} {undoableCount === 1 ? 'bloque conserva' : 'bloques conservan'} todas sus operaciones aplicadas.</p>}
      {loading && !receipts && <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Leyendo únicamente los recibos históricos auditados…</p>}
      {receipts?.length === 0 && <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">No hay recibos de bloques históricos confirmados dentro del límite de consulta.</p>}
      {receipts && receipts.length > 0 && <ul className="grid gap-3 lg:grid-cols-2" aria-label="Recibos históricos confirmados">
        {receipts.map((receipt) => {
          const explanation = stateMessage(receipt);
          const undoable = canWrite && canUndoHistoricalBlock(receipt);
          return <li key={receipt.bloqueId} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0"><h3 className="text-base font-bold text-slate-950">Bloque de {receipt.confirmadas} {receipt.confirmadas === 1 ? 'operación' : 'operaciones'}</h3><p className="mt-1 text-sm text-slate-600">Confirmado entre {fechaCorta(receipt.fechaPrimeraConfirmacion)} y {fechaCorta(receipt.fechaUltimaConfirmacion)}</p><p className="mt-1 truncate text-xs text-slate-500">Registrado por: {receipt.actor}</p></div>
              <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${canUndoHistoricalBlock(receipt) ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : receipt.operacionesRevertidas > 0 ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-slate-100 text-slate-700 ring-slate-200'}`}>{canUndoHistoricalBlock(receipt) ? 'Aplicado completo' : receipt.operacionesRevertidas > 0 ? 'Con reversión' : 'No reversible en bloque'}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm"><ReceiptMetric label="Confirmadas" value={String(receipt.confirmadas)} /><ReceiptMetric label="Aplicadas" value={String(receipt.operacionesAplicadas)} /><ReceiptMetric label="Revertidas" value={String(receipt.operacionesRevertidas)} /><ReceiptMetric label="Pendientes" value={String(receipt.operacionesPendientes)} /><ReceiptMetric label="Cargos" value={formatCents(receipt.totalCargosCentimos)} tone="text-red-800" /><ReceiptMetric label="Cobros" value={formatCents(receipt.totalCobrosCentimos)} tone="text-emerald-800" /></dl>
            {receipt.delegacion && <p className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs font-semibold text-indigo-950">{receipt.delegacion}</p>}
            {explanation && <p className="mt-3 text-xs text-slate-600">{explanation}</p>}
            {undoable && <button type="button" onClick={() => openUndoReview(receipt)} disabled={undoing || Boolean(pendingUndo?.uncertain && pendingUndo.receipt.bloqueId !== receipt.bloqueId)} className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-bold text-amber-900 transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-60">Deshacer bloque</button>}
          </li>;
        })}
      </ul>}
    </div>

    {pendingUndo && <UndoReviewDialog pending={pendingUndo} busy={undoing} confirmRef={confirmButtonRef} onCancel={() => { if (!undoing) setPendingUndo((current) => current?.uncertain ? current : null); }} onConfirm={() => { void submitUndo(); }} />}
  </section>;
}

function ReceiptMetric({ label, value, tone = 'text-slate-950' }: Readonly<{ label: string; value: string; tone?: string }>) {
  return <div><dt className="text-xs font-semibold text-slate-600">{label}</dt><dd className={`mt-1 font-mono text-sm font-bold ${tone}`}>{value}</dd></div>;
}

function UndoReviewDialog({ pending, busy, confirmRef, onCancel, onConfirm }: Readonly<{
  pending: PendingUndo;
  busy: boolean;
  confirmRef: React.RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  const { receipt } = pending;
  return <div role="presentation" className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-4 sm:items-center sm:justify-center"><section role="dialog" aria-modal="true" aria-labelledby="historical-receipt-undo-title" onKeyDown={(event) => { if (event.key === 'Escape' && !busy && !pending.uncertain) onCancel(); }} className="w-full max-w-xl rounded-xl bg-white shadow-2xl"><header className="border-b border-slate-200 px-5 py-4"><div className="flex items-start gap-3"><div className="rounded-full bg-amber-100 p-2 text-amber-800"><ExclamationTriangleIcon className="h-5 w-5" aria-hidden="true" /></div><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800">Revisión antes de revertir</p><h2 id="historical-receipt-undo-title" className="mt-1 text-lg font-bold text-slate-950">Deshacer bloque de {receipt.confirmadas} operaciones</h2><p className="mt-1 text-sm text-slate-600">No se ejecuta ninguna reversión al abrir este aviso.</p></div></div></header><div className="space-y-4 px-5 py-4 text-sm">{pending.uncertain && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">La respuesta anterior no pudo verificarse. Al reintentar se enviarán exactamente el mismo bloque y la misma clave de idempotencia.</p>}<dl className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><ReceiptMetric label="Operaciones" value={String(receipt.confirmadas)} /><ReceiptMetric label="Aplicadas" value={String(receipt.operacionesAplicadas)} /><ReceiptMetric label="Cargos" value={formatCents(receipt.totalCargosCentimos)} tone="text-red-800" /><ReceiptMetric label="Cobros" value={formatCents(receipt.totalCobrosCentimos)} tone="text-emerald-800" /></dl><p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">La acción definitiva solicitará una reversión total. Si el estado cambia y alguna operación queda parcialmente revertida, deberá usar la reversión individual de las restantes.</p></div><footer className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end"><button type="button" disabled={busy || pending.uncertain} onClick={onCancel} className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50">Cancelar</button><button ref={confirmRef} type="button" onClick={onConfirm} disabled={busy} className="min-h-10 rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{busy ? 'Deshaciendo…' : pending.uncertain ? 'Reintentar reversión definitiva' : 'Deshacer definitivamente el bloque'}</button></footer></section></div>;
}
