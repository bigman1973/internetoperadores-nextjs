'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDate, formatMoney, parseConciliarHistoryResponse, type ConciliarHistoryOperation, type ConciliarHistoryResponse } from './conciliar-contract';
export { formatConciliarConfirmationNotice } from './conciliar-confirmation-notice';

const HISTORY_API = '/api/admin/finanzas/conciliar/historial';
const PAGE_SIZE = 20;

type HistoryView = 'hoy' | 'historial';

type Props = Readonly<{
  activeActuationSessionId: string | null;
  busy: boolean;
  refreshKey: number;
  onUndo: (operationId: string) => void;
  onLoadError: (message: string) => void;
}>;

function scopeUndoLabel(operation: ConciliarHistoryOperation): string {
  if (operation.scope === 'batch') return `Deshacer lote de ${operation.count} confirmaciones`;
  const leg = operation.legs[0];
  return `Deshacer ${leg?.concepto ?? 'confirmación'}${leg?.documento ? ` · ${leg.documento}` : ''}`;
}

function actorLabel(operation: ConciliarHistoryOperation): string {
  if (!operation.actorEffectiveDisplay) return 'Actor efectivo no disponible en el recibo histórico.';
  if (operation.actorRealStatus === 'NO_DISPONIBLE_HISTORICO') return `Actor efectivo: ${operation.actorEffectiveDisplay}. Actor real no disponible en el recibo histórico.`;
  if (operation.actorRealStatus === 'IGUAL_AL_EFECTIVO') return `Actor: ${operation.actorEffectiveDisplay}.`;
  return `Actor real: ${operation.actorRealDisplay} → efectivo: ${operation.actorEffectiveDisplay}.`;
}

function Receipt({ operation, busy, onUndo }: Readonly<{ operation: ConciliarHistoryOperation; busy: boolean; onUndo: (operationId: string) => void }>) {
  const status = operation.state === 'REVERTIDA' ? 'Deshecho' : 'Confirmado';
  return <article className="rounded-lg border border-slate-200 p-3 panel-dark:border-slate-700">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="font-bold text-[#2D2A26] panel-dark:text-white">{status} · {new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(operation.confirmedAt))}</p>
        <p className="mt-1 text-xs text-slate-600 panel-dark:text-slate-300">{actorLabel(operation)}</p>
        {operation.revertedAt && <p className="mt-1 text-xs font-semibold text-slate-600 panel-dark:text-slate-300">Revertido: {new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(operation.revertedAt))}</p>}
      </div>
      {operation.reversible && <button type="button" disabled={busy} onClick={() => onUndo(operation.operationId)} className="min-h-10 shrink-0 rounded-md border border-slate-300 px-3 py-2 text-left text-xs font-bold text-[#BF3E00] hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:opacity-50 panel-dark:border-slate-600 panel-dark:text-orange-200">{scopeUndoLabel(operation)}</button>}
    </div>
    {!operation.detailsAvailable ? <p className="mt-3 rounded-md bg-slate-50 px-2 py-2 text-xs text-slate-600 panel-dark:bg-slate-950 panel-dark:text-slate-300">Este recibo anterior no conserva fecha, concepto, importe o documento. No se reconstruye con datos actuales.</p> : operation.scope === 'single' ? <ReceiptLeg operation={operation} /> : <details className="mt-3"><summary className="cursor-pointer text-xs font-bold text-[#BF3E00]">Ver las {operation.count} confirmaciones del lote</summary><p className="mt-1 text-xs text-slate-600 panel-dark:text-slate-300">El botón deshace el lote completo; no revierte una confirmación aislada.</p><ul className="mt-2 space-y-2">{operation.legs.map(leg => <li key={leg.ordinal} className="rounded-md bg-slate-50 px-2 py-2 panel-dark:bg-slate-950"><p className="text-sm font-semibold text-[#2D2A26] panel-dark:text-white">{formatDate(leg.fecha)} · {leg.concepto}</p><p className="mt-0.5 text-xs text-slate-600 panel-dark:text-slate-300">{formatMoney(leg.importeCentimos)} · {leg.documento ?? 'Sin documento en el recibo'}</p></li>)}</ul></details>}
  </article>;
}

function ReceiptLeg({ operation }: Readonly<{ operation: ConciliarHistoryOperation }>) {
  const leg = operation.legs[0];
  if (!leg) return null;
  return <div className="mt-3 rounded-md bg-slate-50 px-2 py-2 panel-dark:bg-slate-950"><p className="text-sm font-semibold text-[#2D2A26] panel-dark:text-white">{formatDate(leg.fecha)} · {leg.concepto}</p><p className="mt-0.5 text-xs text-slate-600 panel-dark:text-slate-300">{formatMoney(leg.importeCentimos)} · {leg.documento ?? 'Sin documento en el recibo'}</p></div>;
}

/** Carga diferida: la primera lectura ocurre al abrir Confirmados hoy o Historial. */
export default function ConciliarConfirmationHistory({ activeActuationSessionId, busy, refreshKey, onUndo, onLoadError }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<HistoryView>('hoy');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ConciliarHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!open) return;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setLoading(true);
    try {
      const params = new URLSearchParams({ vista: view, limit: String(PAGE_SIZE), offset: String(offset) });
      const response = await fetch(`${HISTORY_API}?${params.toString()}`, {
        cache: 'no-store', signal: next.signal,
        headers: activeActuationSessionId ? { 'x-io-acting-session': activeActuationSessionId } : undefined,
      });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(raw && typeof raw === 'object' && typeof (raw as { error?: unknown }).error === 'string' ? (raw as { error: string }).error : 'No se pudieron leer las confirmaciones.');
      if (!next.signal.aborted) setData(parseConciliarHistoryResponse(raw));
    } catch (error) {
      if (!next.signal.aborted) onLoadError(error instanceof Error ? error.message : 'No se pudieron leer las confirmaciones.');
    } finally {
      if (!next.signal.aborted) setLoading(false);
      if (controller.current === next) controller.current = null;
    }
  }, [activeActuationSessionId, offset, onLoadError, open, view]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => () => controller.current?.abort(), []);

  const changeView = (next: HistoryView) => { setView(next); setOffset(0); };
  return <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm panel-dark:border-slate-700 panel-dark:bg-slate-900">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-[#2D2A26] panel-dark:text-white">Confirmaciones</h2><p className="text-xs text-slate-600 panel-dark:text-slate-300">Recibos duraderos de tus confirmaciones. No incluye acciones Para pedir.</p></div><button type="button" onClick={() => setOpen(true)} className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#FF5300] panel-dark:border-slate-600 panel-dark:hover:bg-slate-800">{open ? 'Confirmaciones cargadas' : 'Ver confirmaciones'}</button></div>
    {open && <><div role="tablist" aria-label="Vistas de confirmaciones" className="mt-3 flex gap-2"><button type="button" role="tab" aria-selected={view === 'hoy'} onClick={() => changeView('hoy')} className={`min-h-9 rounded-md px-3 py-1.5 text-xs font-bold ${view === 'hoy' ? 'bg-[#2D2A26] text-white' : 'border border-slate-300 panel-dark:border-slate-600'}`}>Confirmados hoy</button><button type="button" role="tab" aria-selected={view === 'historial'} onClick={() => changeView('historial')} className={`min-h-9 rounded-md px-3 py-1.5 text-xs font-bold ${view === 'historial' ? 'bg-[#2D2A26] text-white' : 'border border-slate-300 panel-dark:border-slate-600'}`}>Historial</button></div>{loading ? <p className="py-4 text-sm text-slate-600 panel-dark:text-slate-300">Cargando confirmaciones…</p> : data && <div role="tabpanel" className="mt-3"><div className="space-y-2">{data.operations.length ? data.operations.map(operation => <Receipt key={operation.operationId} operation={operation} busy={busy} onUndo={onUndo} />) : <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600 panel-dark:bg-slate-950 panel-dark:text-slate-300">No hay confirmaciones en esta vista.</p>}</div><div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-600 panel-dark:text-slate-300"><span>{data.total ? data.offset + 1 : 0}–{Math.min(data.offset + data.operations.length, data.total)} de {data.total}</span><div className="flex gap-2"><button type="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="min-h-9 rounded border px-2 font-semibold disabled:opacity-50">Anterior</button><button type="button" disabled={data.offset + data.operations.length >= data.total || loading} onClick={() => setOffset(offset + PAGE_SIZE)} className="min-h-9 rounded border px-2 font-semibold disabled:opacity-50">Siguiente</button></div></div></div>}</>}
  </section>;
}
