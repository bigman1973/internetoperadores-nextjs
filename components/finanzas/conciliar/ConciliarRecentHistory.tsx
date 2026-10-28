'use client';

type Receipt = Readonly<{
  key: string;
  rowId: string;
  label: string;
  message: string;
  operationId: string | null;
  status: 'done' | 'asked' | 'undone' | 'failed';
  createdAt: number;
}>;

/** La actividad empieza vacía y se divide hasta que una operación o el historial la necesita. */
export default function ConciliarRecentHistory({ receipts, busy, onUndo }: { receipts: readonly Receipt[]; busy: boolean; onUndo: (receipt: Receipt) => void }) {
  if (receipts.length === 0) return null;
  return <section aria-label="Actividad reciente" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm panel-dark:border-slate-700 panel-dark:bg-slate-900"><div className="flex items-baseline justify-between gap-3"><h2 className="font-bold text-[#2D2A26] panel-dark:text-white">Actividad reciente</h2><p className="text-xs text-slate-500 panel-dark:text-slate-400">En esta sesión</p></div><ul className="mt-2 divide-y divide-slate-100 panel-dark:divide-slate-800">{receipts.slice(0, 8).map((receipt) => <li key={receipt.key} className="flex min-w-0 items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#2D2A26] panel-dark:text-white">{receipt.label}</p><p className="truncate text-xs text-slate-600 panel-dark:text-slate-300">{receipt.status === 'undone' ? 'Deshecho' : receipt.status === 'failed' ? 'No hecho' : receipt.message}</p></div>{receipt.status === 'done' && receipt.operationId && <button type="button" disabled={busy} onClick={() => onUndo(receipt)} className="shrink-0 text-sm font-bold text-[#FF5300] underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:opacity-50">Deshacer</button>}</li>)}</ul></section>;
}
