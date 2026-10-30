'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { formatDate, formatMoney, type ConciliarReviewPreview, type ConciliarRow } from './conciliar-contract';

function firstFocusable(root: HTMLElement | null) {
  return root?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), [href]') ?? null;
}

/**
 * Diálogo de excepción humana para Área 3. No pide ni transporta importes,
 * documentos, referencias, hashes de archivo o textos libres: el único dato
 * que devuelve es el ACK versionado que el preflight READ ONLY ya selló.
 */
export default function ConciliarArea3ReviewDialog({
  row, review, busy, onCancel, onConfirm,
}: {
  row: ConciliarRow;
  review: ConciliarReviewPreview;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    firstFocusable(dialog.current)?.focus();
    return () => opener.current?.focus();
  }, []);
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); return; }
    if (event.key !== 'Tab') return;
    const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href]') ?? [])];
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const confirmable = review.puedeConfirmarRevision && review.acknowledgement !== null;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 sm:items-center" role="presentation">
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="conciliar-area3-review-title" onKeyDown={keyDown} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 text-slate-950 shadow-2xl panel-dark:bg-slate-900 panel-dark:text-white">
      <div className="flex items-start gap-3"><ExclamationTriangleIcon className="mt-0.5 h-6 w-6 shrink-0 text-amber-700 panel-dark:text-amber-300" aria-hidden="true" /><div><h2 id="conciliar-area3-review-title" className="text-lg font-extrabold">Revisar y confirmar esta propuesta</h2><p className="mt-2 text-sm leading-6 text-slate-700 panel-dark:text-slate-200">Es una excepción humana: seguirá registrada como revisión ámbar y no añade esta fila a la confirmación verde ni a ningún lote.</p></div></div>
      <dl className="mt-4 grid gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 panel-dark:border-amber-800 panel-dark:bg-amber-950/45 panel-dark:text-amber-100 sm:grid-cols-2"><div><dt className="font-semibold">Movimiento</dt><dd className="mt-1 font-extrabold tabular-nums">{formatMoney(row.importeCentimos)}</dd></div><div><dt className="font-semibold">Fecha bancaria</dt><dd className="mt-1 font-extrabold">{formatDate(row.fecha)}</dd></div><div><dt className="font-semibold">Documento propuesto</dt><dd className="mt-1 font-extrabold">{row.documento?.referencia ?? 'No disponible'}</dd></div><div><dt className="font-semibold">Fecha documental</dt><dd className="mt-1 font-extrabold">{formatDate(row.documento?.fecha ?? null)}</dd></div></dl>
      <section className="mt-4 rounded-xl border border-slate-200 p-3 text-sm leading-6 panel-dark:border-slate-700"><h3 className="font-extrabold">Comprobación del servidor</h3><p className="mt-1">{review.mensaje}</p><p className="mt-2 font-semibold">Resto del movimiento: 0. No se admiten pagos parciales, diferencias ni ajustes en esta vía.</p></section>
      {confirmable ? <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 panel-dark:border-amber-800 panel-dark:bg-amber-950/45 panel-dark:text-amber-100"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={busy} className="mt-1 h-4 w-4 rounded border-amber-600 text-amber-700 focus:ring-amber-600" /><span>He revisado la advertencia anterior y confirmo esta propuesta excepcional. La decisión y el deshacer completo quedarán auditados.</span></label> : <p role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-950 panel-dark:border-red-900 panel-dark:bg-red-950/45 panel-dark:text-red-100">Esta propuesta no se puede confirmar: actualiza y revisa el bloqueo indicado.</p>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={onCancel} className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:opacity-50 panel-dark:border-slate-600 panel-dark:bg-slate-900 panel-dark:text-slate-100">Cancelar</button><button type="button" disabled={busy || !confirmable || !acknowledged} onClick={onConfirm} className="min-h-10 rounded-md bg-amber-700 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-600 disabled:opacity-50">{busy ? 'Confirmando…' : 'Confirmar esta propuesta'}</button></div>
    </section>
  </div>;
}
