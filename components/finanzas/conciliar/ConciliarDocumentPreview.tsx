'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { formatDate, formatMagnitude, formatMoney, type ConciliarRow } from './conciliar-contract';
import type { ConciliarDocumentDetail } from '@/lib/finanzas/conciliar-document-detail-contract';
import { calculateConfirmingNet } from './conciliar-detail-client';

type DocumentDrawer = Readonly<{
  row: ConciliarRow;
  status: 'loading' | 'ready' | 'error';
  detail: ConciliarDocumentDetail | null;
  error: string | null;
}>;

type DetailField = readonly [label: string, value: string | number | null, deduction?: boolean];

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')) : [];
}

function lineTotal(detail: ConciliarDocumentDetail): number | null {
  let total = 0;
  for (const line of detail.lineas) {
    total += line.nominalCentimos;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

function formatDeduction(cents: number): string {
  return `−${formatMagnitude(cents)}`;
}

function DetailFields({ fields }: { fields: readonly DetailField[] }) {
  return <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
    {fields.map(([label, value, deduction]) => <div key={label} className="min-w-0 border-b border-slate-100 pb-2 dark:border-slate-800">
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words font-semibold text-slate-950 dark:text-white">{value === null ? 'No consta' : typeof value === 'number' ? deduction ? formatDeduction(value) : formatMoney(value) : value}</dd>
    </div>)}
  </dl>;
}

function amountFields(detail: ConciliarDocumentDetail): readonly DetailField[] {
  switch (detail.kind) {
    case 'CONFIRMING':
      return [
        ['Total nominal', detail.nominalCentimos],
        ['Intereses', detail.interesesCentimos, true],
        ['Comisión', detail.comisionCentimos, true],
        ['IVA de comisión', detail.ivaComisionCentimos, true],
        ['Neto del documento', detail.netoDocumentoCentimos],
        ['Ingreso del banco', detail.importeBancoCentimos],
      ];
    case 'REMESA':
      return [
        ['Suma de recibos', detail.nominalCentimos],
        ['Ingreso del banco', detail.importeBancoCentimos],
      ];
    case 'FACTURA':
      return [
        ['Importe de factura', detail.importeFacturaCentimos ?? detail.nominalCentimos],
        ['Salida del banco', detail.importeBancoCentimos],
      ];
    default:
      return [
        ['Importe del documento', detail.nominalCentimos],
        ['Importe bancario', detail.importeBancoCentimos],
      ];
  }
}

function reconciliationCopy(detail: ConciliarDocumentDetail): Readonly<{ comparison: string; status: string }> {
  const status = detail.cuadreExacto ? 'Estado: exacto.' : 'Estado: desajuste.';
  if (detail.kind === 'REMESA') return { comparison: 'Suma de recibos = ingreso del banco', status };
  if (detail.kind === 'CONFIRMING' && (detail.bancoEmisor === 'BBVA' || detail.bancoEmisor === 'CaixaBank')) {
    return { comparison: 'Neto del documento = ingreso del banco', status };
  }
  return { comparison: 'Importe del documento = importe bancario', status };
}

function bankFields(detail: ConciliarDocumentDetail): readonly DetailField[] {
  const common: DetailField[] = [
    ['Banco', detail.bancoEmisor],
    [detail.kind === 'REMESA' ? 'Fecha de abono' : 'Fecha de liquidación', detail.fechaLiquidacion ? formatDate(detail.fechaLiquidacion) : null],
    ['Cuenta de abono', detail.cuentaAbono],
  ];
  if (detail.kind !== 'CONFIRMING') return common;
  const numeroLiquidacion = detail.numeroLiquidacion !== null && /^[A-Za-z0-9][A-Za-z0-9/-]{0,119}$/.test(detail.numeroLiquidacion) && !/\.(?:pdf|xml|csv|xlsx?|docx?)$/i.test(detail.numeroLiquidacion)
    ? detail.numeroLiquidacion
    : null;
  return [
    ['Banco', detail.bancoEmisor],
    ['Documento de liquidación', detail.referenciaDocumento ?? null],
    ...(numeroLiquidacion === null ? [] : [['Nº de liquidación', numeroLiquidacion] as const]),
    ['Fecha de liquidación', detail.fechaLiquidacion ? formatDate(detail.fechaLiquidacion) : null],
    ['Cuenta de abono', detail.cuentaAbono],
  ];
}

function DetailContent({ detail }: { detail: ConciliarDocumentDetail }) {
  const isRemesa = detail.kind === 'REMESA';
  const isConfirming = detail.kind === 'CONFIRMING';
  const isSupplierInvoice = detail.kind === 'FACTURA';
  const confirmingNet = isConfirming ? calculateConfirmingNet(detail) : null;
  const confirmingExact = confirmingNet?.matchesDeclaredNetExactly === true && detail.cuadreExacto;
  const total = lineTotal(detail);
  const linesTitle = isRemesa ? 'Recibos que constan en este documento' : isConfirming ? 'Facturas que constan en el documento' : 'Líneas que constan en el documento';
  const reconciliation = reconciliationCopy(detail);
  const bankSectionTitle = isConfirming ? 'Liquidación bancaria' : isRemesa ? 'Abono bancario' : 'Movimiento bancario';

  return <div className="space-y-5 px-4 py-5 sm:px-6">
    <section aria-labelledby="conciliar-bank-detail-title">
      <h3 id="conciliar-bank-detail-title" className="text-sm font-extrabold text-slate-950 dark:text-white">{bankSectionTitle}</h3>
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/45">
        <DetailFields fields={bankFields(detail)} />
      </div>
    </section>

    {isSupplierInvoice && <section aria-labelledby="conciliar-supplier-detail-title">
      <h3 id="conciliar-supplier-detail-title" className="text-sm font-extrabold text-slate-950 dark:text-white">Factura de proveedor</h3>
      <div className="mt-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <DetailFields fields={[
          ['Número de factura', detail.numeroFactura],
          ['Proveedor', detail.proveedor],
          ['Fecha de factura', detail.fechaFactura ? formatDate(detail.fechaFactura) : null],
        ]} />
      </div>
    </section>}

    <section aria-labelledby="conciliar-amounts-detail-title">
      <h3 id="conciliar-amounts-detail-title" className="text-sm font-extrabold text-slate-950 dark:text-white">Importes del documento</h3>
      <div className="mt-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <DetailFields fields={amountFields(detail)} />
        {confirmingNet && <p data-testid="conciliar-confirming-calculation" className={`mt-4 rounded-lg border px-3 py-2 text-sm leading-5 ${confirmingExact ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-100' : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100'}`}><span className="font-extrabold">{formatMagnitude(detail.nominalCentimos!)} − {formatMagnitude(detail.interesesCentimos!)} − {formatMagnitude(detail.comisionCentimos!)} − {formatMagnitude(detail.ivaComisionCentimos!)} = {formatMagnitude(confirmingNet.calculatedNetCentimos)}</span><span className="ml-1">Neto documental: {formatMoney(confirmingNet.declaredNetCentimos)}.</span>{confirmingExact && <span className="ml-1 font-bold">✔ Cuadre exacto en céntimos.</span>}</p>}
      </div>
    </section>

    {detail.lineas.length > 0 && <section aria-labelledby="conciliar-lines-detail-title">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div><h3 id="conciliar-lines-detail-title" className="text-sm font-extrabold text-slate-950 dark:text-white">{linesTitle}</h3>
          {isRemesa && <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">La lista recoge todos los recibos incluidos en este documento. Una liquidación puede pagar sólo una parte de los recibos; no se infiere ningún pago fuera de esta lista.</p>}
        </div>
        {total !== null && <p className="shrink-0 text-sm font-extrabold tabular-nums text-slate-950 dark:text-white">Suma de la lista: {formatMoney(total)}</p>}
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-max min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-950 dark:text-slate-300"><tr><th className="px-4 py-3 font-bold">Número</th><th className="px-4 py-3 font-bold">Cliente</th><th className="px-4 py-3 font-bold">Emisión</th><th className="px-4 py-3 font-bold">Vencimiento</th><th className="px-4 py-3 text-right font-bold">Nominal</th></tr></thead>
          <tbody>{detail.lineas.map((line, index) => <tr key={`${line.numero}-${index}`} className="border-t border-slate-200 align-top text-slate-800 dark:border-slate-700 dark:text-slate-100"><td className="px-4 py-3 font-semibold">{line.numero}</td><td className="px-4 py-3">{line.cliente ?? 'No consta'}</td><td className="whitespace-nowrap px-4 py-3">{line.fechaEmision ? formatDate(line.fechaEmision) : 'No consta'}</td><td className="whitespace-nowrap px-4 py-3">{line.fechaVencimiento ? formatDate(line.fechaVencimiento) : 'No consta'}</td><td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(line.nominalCentimos)}</td></tr>)}</tbody>
        </table>
      </div>
    </section>}

    <section aria-label="Comprobación de importes" className={`rounded-xl border p-4 text-sm ${detail.cuadreExacto ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-100' : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100'}`}>
      <p className="font-extrabold">{reconciliation.comparison}</p>
      <p className="mt-1 leading-5">{reconciliation.status}</p>
      {!detail.cuadreExacto && <p className="mt-1 leading-5">Los importes no cuadran exactamente. Revísalos antes de tomar cualquier decisión.</p>}
      {detail.avisos.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 leading-5">{detail.avisos.map((notice, index) => <li key={`${notice}-${index}`}>{notice}</li>)}</ul>}
    </section>
  </div>;
}

/** Drawer textual: se abre sólo tras pedir el detalle privado de una fila existente. */
export default function ConciliarDocumentPreview({ document: drawer, onClose, onRetry }: { document: DocumentDrawer; onClose: () => void; onRetry: () => void }) {
  const dialog = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = 'conciliar-document-drawer-title';

  useEffect(() => {
    const browserDocument = globalThis.document;
    if (!browserDocument) return undefined;
    const activeElement = globalThis.document.activeElement;
    opener.current = typeof globalThis.HTMLElement !== 'undefined' && activeElement instanceof globalThis.HTMLElement ? activeElement : null;
    const timer = globalThis.setTimeout(() => focusableElements(dialog.current)[0]?.focus(), 0);
    const previousOverflow = globalThis.document.body.style.overflow;
    globalThis.document.body.style.overflow = 'hidden';
    return () => {
      globalThis.clearTimeout(timer);
      globalThis.document.body.style.overflow = previousOverflow;
      opener.current?.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const browserDocument = globalThis.document;
    if (!browserDocument) return undefined;
    const nodes = focusableElements(dialog.current);
    if (!nodes.length) { event.preventDefault(); return; }
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && globalThis.document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && globalThis.document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  const detail = drawer.detail;
  const title = detail?.titulo || drawer.row.documento?.referencia || drawer.row.concepto || 'Detalle documental';
  return <div className="fixed inset-x-0 bottom-0 z-[90] flex bg-slate-950/55" style={{ top: 'var(--actuation-banner-height, 0px)' }} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown} className="ml-auto flex h-full max-h-full w-full flex-col overflow-hidden bg-white text-[#2D2A26] shadow-2xl dark:bg-slate-900 dark:text-slate-100 sm:w-[min(1100px,calc(100vw-3rem))] sm:border-l sm:border-slate-200 dark:sm:border-slate-700">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-700 sm:px-6"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FF5300]">Documento</p><h2 id={titleId} className="mt-1 break-words text-lg font-extrabold text-slate-950 dark:text-white">{title}</h2><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Movimiento: {formatDate(drawer.row.fecha)} · {formatMoney(drawer.row.importeCentimos)}</p></div><button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#FF5300] dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Cerrar detalle documental"><XMarkIcon className="h-5 w-5" aria-hidden="true" /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto"><div data-testid="conciliar-document-detail-note" className="mx-4 mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-100 sm:mx-6"><p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Nota del movimiento</p><p className="mt-1 whitespace-pre-wrap break-words">{drawer.row.motivo}</p></div>{drawer.status === 'loading' && <div data-testid="conciliar-document-detail-loading" role="status" aria-live="polite" className="flex items-center gap-3 px-4 py-6 text-sm text-slate-700 dark:text-slate-200 sm:px-6"><ArrowPathIcon className="h-5 w-5 animate-spin text-[#FF5300]" aria-hidden="true" />Cargando el detalle documental…</div>}{drawer.status === 'error' && <div role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-950 dark:border-red-900 dark:bg-red-950/45 dark:text-red-100 sm:m-6"><p className="font-extrabold">No se pudo cargar el detalle documental.</p><p className="mt-1">{drawer.error}</p><button type="button" onClick={onRetry} className="mt-3 min-h-10 rounded-lg border border-red-300 bg-white px-3 py-2 font-bold text-red-900 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-[#FF5300] dark:border-red-800 dark:bg-slate-900 dark:text-red-100">Reintentar detalle</button></div>}{drawer.status === 'ready' && detail && <div data-testid="conciliar-document-detail-loaded"><DetailContent detail={detail} /></div>}</div>
      <footer className="shrink-0 border-t border-slate-200 px-4 py-3 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:text-slate-300 sm:flex sm:items-center sm:justify-between sm:px-6"><p>Abrir este detalle no confirma ni modifica la conciliación.</p>{detail?.pdfHref && <a href={detail.pdfHref} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-10 items-center font-extrabold text-[#BF3E00] underline decoration-1 underline-offset-2 focus:outline-none focus:ring-2 focus:ring-[#FF5300] sm:mt-0">Abrir PDF</a>}</footer>
    </aside>
  </div>;
}
