'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { formatDate, formatMagnitude, formatMoney, type ConciliarRemesaPreview } from './conciliar-contract';

type RemesaConfirmation = Readonly<{ preview: ConciliarRemesaPreview }>;

function firstFocusable(root: HTMLElement | null) {
  return root?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]') ?? null;
}

/** La composición completa sólo llega y se renderiza después de abrir una remesa. */
export default function ConciliarRemesaConfirmationDialog({ confirmation, busy, onCancel, onConfirm }: { confirmation: RemesaConfirmation; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 100;
  const totalPages = Math.ceil(confirmation.preview.filas.length / pageSize);
  const visibleRows = confirmation.preview.filas.slice(page * pageSize, (page + 1) * pageSize);
  const first = page * pageSize + 1;
  const last = Math.min(confirmation.preview.filas.length, (page + 1) * pageSize);
  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => firstFocusable(dialog.current)?.focus(), 0);
    return () => opener.current?.focus();
  }, []);
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); return; }
    if (event.key !== 'Tab') return;
    const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]');
    if (!nodes?.length) { event.preventDefault(); return; }
    const firstNode = nodes[0], lastNode = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === firstNode) { event.preventDefault(); lastNode.focus(); }
    if (!event.shiftKey && document.activeElement === lastNode) { event.preventDefault(); firstNode.focus(); }
  }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 sm:items-center" role="presentation">
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="conciliar-remesa-confirm-title" onKeyDown={keyDown} className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-5 text-slate-950 shadow-2xl panel-dark:bg-slate-900 panel-dark:text-white">
      <div className="flex items-start gap-3"><ExclamationTriangleIcon className="mt-0.5 h-6 w-6 shrink-0 text-amber-700 panel-dark:text-amber-300" aria-hidden="true" /><div><h2 id="conciliar-remesa-confirm-title" className="text-lg font-extrabold">Segunda confirmación humana de la remesa</h2><p className="mt-2 text-sm leading-6 text-slate-700 panel-dark:text-slate-200">Revisa la composición completa. Confirmar asignará únicamente estas facturas a este abono; no confirma el resto de la remesa ni otras facturas.</p></div></div>
      <dl className="mt-4 grid gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 panel-dark:border-amber-800 panel-dark:bg-amber-950/45 panel-dark:text-amber-100 sm:grid-cols-3"><div><dt className="font-semibold">Remesa</dt><dd className="mt-1 font-extrabold tabular-nums">#{confirmation.preview.remesaId}</dd></div><div><dt className="font-semibold">Facturas asignadas ahora</dt><dd className="mt-1 font-extrabold tabular-nums">{confirmation.preview.totalFacturas.toLocaleString('es-ES')}</dd></div><div><dt className="font-semibold">Abono bancario</dt><dd className="mt-1 font-extrabold tabular-nums">{formatMoney(confirmation.preview.importeBancoCentimos)}</dd></div></dl>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 panel-dark:border-slate-700"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-slate-600 panel-dark:bg-slate-950 panel-dark:text-slate-300"><tr><th className="p-3 font-bold">#</th><th className="p-3 font-bold">Nº de factura</th><th className="p-3 font-bold">Cliente</th><th className="p-3 font-bold">Fecha factura</th><th className="p-3 text-right font-bold">Importe</th></tr></thead><tbody>{visibleRows.map((line) => <tr key={line.ordinal} className="border-t border-slate-200 text-slate-800 panel-dark:border-slate-700 panel-dark:text-slate-100"><td className="p-3 tabular-nums">{line.ordinal}</td><td className="p-3 font-semibold">{line.numeroFactura}</td><td className="max-w-[22rem] truncate p-3" title={line.cliente ?? undefined}>{line.cliente ?? 'Sin cliente publicado'}</td><td className="whitespace-nowrap p-3">{line.fechaFactura ? formatDate(line.fechaFactura) : 'Sin fecha publicada'}</td><td className="whitespace-nowrap p-3 text-right tabular-nums">{formatMagnitude(line.importeCentimos)}</td></tr>)}</tbody></table></div>
      {totalPages > 1 && <nav aria-label="Paginación de composición completa de remesa" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-slate-600 panel-dark:text-slate-300">Mostrando {first.toLocaleString('es-ES')}–{last.toLocaleString('es-ES')} de {confirmation.preview.totalFacturas.toLocaleString('es-ES')} facturas verificadas.</span><span className="flex gap-2"><button type="button" disabled={busy || page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:opacity-50 panel-dark:border-slate-600 panel-dark:bg-slate-900 panel-dark:text-slate-100">Anterior</button><button type="button" disabled={busy || page >= totalPages - 1} onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:opacity-50 panel-dark:border-slate-600 panel-dark:bg-slate-900 panel-dark:text-slate-100">Siguiente</button></span></nav>}
      <p className="mt-4 rounded-lg bg-slate-100 p-3 text-right text-sm font-extrabold text-slate-950 panel-dark:bg-slate-800 panel-dark:text-white">Sólo {confirmation.preview.totalFacturas.toLocaleString('es-ES')} facturas · total {formatMoney(confirmation.preview.importeBancoCentimos)}</p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={onCancel} className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:opacity-50 panel-dark:border-slate-600 panel-dark:bg-slate-900 panel-dark:text-slate-100">Cancelar</button><button type="button" disabled={busy} onClick={onConfirm} className="min-h-10 rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50">{busy ? 'Confirmando…' : `Confirmar sólo estas ${confirmation.preview.totalFacturas.toLocaleString('es-ES')} facturas`}</button></div>
    </section>
  </div>;
}
