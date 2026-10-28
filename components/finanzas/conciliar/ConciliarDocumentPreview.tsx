'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { formatDate, formatMagnitude, formatMoney, type ConciliarRow } from './conciliar-contract';

type DocumentPreview = Readonly<{
  rowId: string;
  title: string;
  href: string | null;
  explanation: string | null;
  movement: ConciliarRow;
}>;

/** Se carga sólo tras abrir el detalle de una fila ya autorizada. */
export default function ConciliarDocumentPreview({ document, onClose }: { document: DocumentPreview; onClose: () => void }) {
  return <aside className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-label={`Documento: ${document.title}`}>
    <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 dark:border-slate-700"><p className="min-w-0 truncate text-sm font-bold text-[#2D2A26] dark:text-white">{document.title}</p><button type="button" onClick={onClose} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#FF5300] dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Cerrar documento"><XMarkIcon className="h-5 w-5" aria-hidden="true" /></button></header>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-3 text-xs leading-5">
      <dt>Movimiento</dt><dd className="break-words font-semibold">{document.movement.concepto}</dd>
      <dt>Fecha e importe</dt><dd>{formatDate(document.movement.fecha)} · {formatMoney(document.movement.importeCentimos)}</dd>
      <dt>Documento</dt><dd className="break-words">{document.movement.documento?.referencia || '—'}</dd>
      {document.movement.documento && <><dt>Emisión e importe</dt><dd>{formatDate(document.movement.documento.fecha)} · {formatMagnitude(document.movement.documento.importeCentimos)}</dd></>}
      <dt>Diferencia</dt><dd className={document.movement.diferenciaCentimos ? 'font-bold text-amber-800 dark:text-amber-300' : ''}>{formatMoney(document.movement.diferenciaCentimos)}</dd>
    </dl>
    {document.explanation && <p className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/45 dark:text-amber-100">{document.explanation}</p>}
    {document.href ? <iframe title={`Vista previa de ${document.title}`} src={document.href} sandbox="" referrerPolicy="same-origin" className="h-[520px] w-full bg-slate-100 dark:bg-slate-800" /> : <p className="px-3 py-4 text-xs text-slate-600 dark:text-slate-300">No hay un PDF descargable verificado para esta propuesta. La información anterior permite revisar la diferencia sin darla por confirmada.</p>}
  </aside>;
}
