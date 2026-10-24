'use client';

import { CameraIcon, DocumentArrowUpIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';
import type { EasyMovement } from './easy-contract';

export type UploadDraft = Readonly<{
  movimientoId: string;
  versionGestion: number;
  nombreProveedor: string;
  concepto: string;
  fechaDocumento: string;
  importeDocumento: string;
  idempotencyKey: string;
  file: File;
}>;

type Props = Readonly<{
  movement: EasyMovement;
  makeIdempotencyKey: () => string;
  onReview: (draft: UploadDraft) => void;
  onCancel: () => void;
  disabled?: boolean;
}>;

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'application/pdf']);
export const MAX_B5_DOCUMENT_BYTES = 3 * 1024 * 1024;

/** Decimal positivo exacto para el ticket; evita redondeos locales. */
export function normaliseReviewedTicketAmount(value: string): string | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimals = ''] = normalized.split('.');
  if (/^0+$/.test(whole) && /^0{0,2}$/.test(decimals)) return null;
  return `${whole.replace(/^0+(?=\d)/, '') || '0'}${decimals ? `.${decimals}` : ''}`;
}

/** La selección local nunca copia importe o fecha del banco al comprobante. */
export default function PhotoCaptureForm({ movement, makeIdempotencyKey, onReview, onCancel, disabled = false }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [provider, setProvider] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const fileDescription = useMemo(() => file ? `${file.name} · ${Math.ceil(file.size / 1024)} KB` : 'Ningún archivo seleccionado', [file]);

  function choose(next: File | null) {
    setError('');
    if (!next) { setFile(null); return; }
    if (!ACCEPTED.has(next.type)) { setFile(null); setError('Selecciona un JPEG, PNG o PDF.'); return; }
    if (next.size === 0 || next.size > MAX_B5_DOCUMENT_BYTES) { setFile(null); setError('El archivo debe tener contenido y no superar 3 MB.'); return; }
    setFile(next);
  }
  function review() {
    const importeDocumento = normaliseReviewedTicketAmount(amount);
    if (!file) { setError('Selecciona una fotografía o PDF antes de continuar.'); return; }
    if (!provider.trim() || !date || !importeDocumento) { setError('Introduce proveedor, fecha e importe que figuran en el comprobante.'); return; }
    if (!checked) { setError('Confirma que has comprobado el comprobante antes de continuar.'); return; }
    onReview({ movimientoId: movement.id, versionGestion: movement.versionGestion, nombreProveedor: provider.trim(), concepto: movement.concepto, fechaDocumento: date, importeDocumento, idempotencyKey: makeIdempotencyKey(), file });
  }

  return <section className="mt-4 min-w-0 rounded-xl border border-orange-200 bg-orange-50 p-4" aria-labelledby={`upload-${movement.id}`}>
    <div className="flex gap-3"><CameraIcon className="mt-0.5 h-5 w-5 shrink-0 text-orange-800" aria-hidden="true" /><div className="min-w-0"><h3 id={`upload-${movement.id}`} className="font-bold text-slate-950">Añadir foto o PDF del comprobante</h3><p className="mt-1 text-sm text-slate-700">Copia los datos que aparecen en el ticket o recibo. La fecha y el importe del movimiento no se copian aquí. Añadir el archivo no confirma el movimiento.</p></div></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-800">Proveedor que figura en el comprobante<input value={provider} onChange={(event) => setProvider(event.target.value)} disabled={disabled} autoComplete="off" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100" /></label><label className="text-sm font-semibold text-slate-800">Fecha que figura en el comprobante<input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={disabled} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100" /></label><label className="text-sm font-semibold text-slate-800">Importe del comprobante (€)<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={disabled} placeholder="0,00" aria-describedby={`ticket-amount-help-${movement.id}`} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100" /><span id={`ticket-amount-help-${movement.id}`} className="mt-1 block text-xs font-normal text-slate-600">Escribe el importe del comprobante, con hasta dos decimales.</span></label><label className="min-w-0 text-sm font-semibold text-slate-800">Foto o PDF<div className="mt-1 flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-dashed border-orange-300 bg-white px-3 py-2 text-sm text-slate-700"><DocumentArrowUpIcon className="h-5 w-5 shrink-0 text-orange-700" aria-hidden="true" /><input type="file" accept="image/jpeg,image/png,application/pdf" capture="environment" disabled={disabled} onChange={(event) => choose(event.target.files?.[0] || null)} className="min-w-0 max-w-full text-xs text-slate-700 file:mr-2 file:max-w-[11rem] file:overflow-hidden file:text-ellipsis" /></div></label></div>
    <p className="mt-2 truncate text-xs text-slate-600" title={file?.name}>{fileDescription}. Máximo 3 MB; el servidor vuelve a comprobarlo.</p>
    <label className="mt-3 flex gap-2 rounded-lg border border-orange-200 bg-white/70 p-3 text-sm text-slate-800"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => setChecked(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-400 text-orange-600 focus:ring-orange-500" /><span>He comprobado el archivo, proveedor, fecha e importe. Entiendo que aún tendré que confirmar el movimiento por separado.</span></label>
    {error && <p role="alert" className="mt-3 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950"><ExclamationTriangleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={disabled} onClick={review} className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">Revisar y continuar</button><button type="button" disabled={disabled} onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50">Cancelar</button></div>
  </section>;
}
