'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  ClipboardDocumentCheckIcon,
  DocumentMagnifyingGlassIcon,
  DocumentTextIcon,
  LinkIcon,
  PencilSquareIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useRole } from '@/components/admin/RoleContext';

type Tab = 'copias' | 'revisar';
type JsonRecord = Record<string, unknown>;
type OriginQuality = 'CUARENTENA' | 'HISTORICA' | null;

type InvoiceItem = {
  id: string;
  proveedor: string | null;
  cif: string | null;
  numFactura: string | null;
  fecha: string | null;
  base: number | null;
  importeIva: number | null;
  importeIrpf: number | null;
  total: number | null;
  motivoRevision: string | null;
  createdAt: string | null;
  archivoOneDrive: string | null;
  /** URL privada emitida por el backend B2; nunca se construye una URL Graph en el cliente. */
  pdfUrl: string | null;
  origenCalidad: OriginQuality;
  /** Versión de una entrada en la cola de cuarentena. */
  version: number | null;
  /** Versión de calidad de una factura histórica marcada para revisión. */
  versionCalidad: number | null;
  copiaDeId: string | null;
  canonica: {
    id: string;
    proveedor: string | null;
    cif: string | null;
    numFactura: string | null;
    fecha: string | null;
    total: number | null;
  } | null;
};

type PageData = {
  items: InvoiceItem[];
  total: number | null;
  page: number;
  totalPages: number | null;
};

type Inventory = {
  cuarentena: PageData;
  copias: PageData;
  importeExcluidoCopias: number | null;
  facturasRevisionHistorica: number | null;
  canWriteB2: boolean | null;
};

type Correction = {
  proveedor: string;
  cif: string;
  numFactura: string;
  fecha: string;
  base: string;
  tipoIva: string;
  importeIva: string;
  tipoIrpf: string;
  importeIrpf: string;
  total: string;
  concepto: string;
};

const PAGE_SIZE = 25;
const euros = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function integerOrNull(value: unknown): number | null {
  const number = numberOrNull(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function invoiceFrom(value: unknown): InvoiceItem | null {
  const item = asRecord(value);
  const id = item ? stringOrNull(item.id) : null;
  if (!item || !id) return null;
  const canonical = asRecord(item.canonica);
  const origin = stringOrNull(item.origenCalidad);
  return {
    id,
    proveedor: stringOrNull(item.proveedor),
    cif: stringOrNull(item.cif),
    numFactura: stringOrNull(item.numFactura),
    fecha: stringOrNull(item.fecha),
    base: numberOrNull(item.base),
    importeIva: numberOrNull(item.importeIva),
    importeIrpf: numberOrNull(item.importeIrpf),
    total: numberOrNull(item.total),
    motivoRevision: stringOrNull(item.motivoRevision),
    createdAt: stringOrNull(item.createdAt),
    archivoOneDrive: stringOrNull(item.archivoOneDrive),
    pdfUrl: stringOrNull(item.pdfUrl),
    origenCalidad: origin === 'CUARENTENA' || origin === 'HISTORICA' ? origin : null,
    version: integerOrNull(item.version),
    versionCalidad: integerOrNull(item.versionCalidad),
    copiaDeId: stringOrNull(item.copiaDeId),
    canonica: canonical && stringOrNull(canonical.id) ? {
      id: stringOrNull(canonical.id) as string,
      proveedor: stringOrNull(canonical.proveedor),
      cif: stringOrNull(canonical.cif),
      numFactura: stringOrNull(canonical.numFactura),
      fecha: stringOrNull(canonical.fecha),
      total: numberOrNull(canonical.total),
    } : null,
  };
}

function pageFrom(value: unknown): PageData {
  const data = asRecord(value) || {};
  const items = Array.isArray(data.items) ? data.items.map(invoiceFrom).filter((item): item is InvoiceItem => Boolean(item)) : [];
  return {
    items,
    total: integerOrNull(data.total),
    page: integerOrNull(data.page) || 1,
    totalPages: integerOrNull(data.totalPages),
  };
}

function inventoryFrom(value: unknown): Inventory {
  const data = asRecord(value) || {};
  const summary = asRecord(data.resumen) || {};
  const permission = typeof data.canWriteB2 === 'boolean'
    ? data.canWriteB2
    : typeof (asRecord(data.permisos) || {}).canWriteB2 === 'boolean'
      ? (asRecord(data.permisos) || {}).canWriteB2 as boolean
      : null;
  return {
    cuarentena: pageFrom(data.cuarentena),
    copias: pageFrom(data.copias),
    importeExcluidoCopias: numberOrNull(summary.importeExcluidoCopias),
    facturasRevisionHistorica: integerOrNull(summary.facturasRevisionHistorica),
    canWriteB2: permission,
  };
}

function correctionFrom(item: InvoiceItem): Correction {
  const text = (value: number | null) => value === null ? '' : String(value);
  return {
    proveedor: item.proveedor || '',
    cif: item.cif || '',
    numFactura: item.numFactura || '',
    // A date from a filename or a historical migration is never silently treated as document evidence.
    fecha: '',
    base: text(item.base),
    tipoIva: '21',
    importeIva: text(item.importeIva),
    tipoIrpf: '0',
    importeIrpf: text(item.importeIrpf),
    total: text(item.total),
    concepto: '',
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'No se ha podido completar la petición.';
}

function dateLabel(value: string | null): string {
  if (!value) return 'Fecha no disponible';
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
}

function moneyLabel(value: number | null, missing = 'SIN IMPORTE'): string {
  return value === null ? missing : euros.format(value);
}

function invoiceName(item: InvoiceItem): string {
  return item.numFactura || item.proveedor || 'Factura sin identificar';
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
}

function revisionVersion(item: InvoiceItem): number | null {
  return item.origenCalidad === 'HISTORICA' ? item.versionCalidad : item.version;
}

function DetailLink({ id, children, title }: { id: string; children: React.ReactNode; title?: string }) {
  return <a href={`/admin/finanzas/facturas/${encodeURIComponent(id)}`} title={title} className="inline-flex items-center gap-1 font-bold text-blue-900 underline decoration-2 underline-offset-2 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700">{children}</a>;
}

function Pagination({ page, total, totalPages, onPage, disabled, label }: { page: number; total: number | null; totalPages: number | null; onPage: (next: number) => void; disabled: boolean; label: string }) {
  if (!totalPages || totalPages <= 1) return null;
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  return <nav aria-label={label} className="flex flex-col gap-2 border-t border-slate-300 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
    <p className="text-xs font-medium text-slate-800">Mostrando {first}–{total === null ? '—' : Math.min(page * PAGE_SIZE, total)} de {total === null ? '—' : total}</p>
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onPage(page - 1)} disabled={disabled || page <= 1} className="inline-flex items-center gap-1 rounded border border-slate-400 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Anterior</button>
      <span className="text-xs font-bold text-slate-950">Página {page} de {totalPages}</span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={disabled || page >= totalPages} className="inline-flex items-center gap-1 rounded border border-slate-400 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Siguiente</button>
    </div>
  </nav>;
}

function CopyRows({ items }: { items: InvoiceItem[] }) {
  if (!items.length) return <p className="px-4 py-8 text-center text-sm font-medium text-slate-800">No hay copias en esta página.</p>;
  return <div className="divide-y divide-slate-200">
    {items.map((item) => <article key={item.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_130px_minmax(170px,auto)] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-slate-950">{invoiceName(item)}</p>
        <p className="mt-0.5 truncate text-xs font-medium text-slate-800">{item.proveedor || 'Proveedor no disponible'}{item.fecha ? ` · ${dateLabel(item.fecha)}` : ''}</p>
        <p className="mt-1 text-xs font-bold text-amber-950">Copia excluida de los totales.</p>
      </div>
      <p className="text-sm font-bold tabular-nums text-slate-950 sm:text-right">{moneyLabel(item.total)}</p>
      {item.canonica?.id ? <DetailLink id={item.canonica.id} title="Abrir factura canónica"><LinkIcon className="h-4 w-4" />Canónica: {item.canonica.numFactura || item.canonica.proveedor || 'abrir factura'}</DetailLink> : item.copiaDeId ? <DetailLink id={item.copiaDeId} title="Abrir factura canónica"><LinkIcon className="h-4 w-4" />Abrir canónica</DetailLink> : <span className="text-xs font-bold text-red-900">Canónica no disponible</span>}
    </article>)}
  </div>;
}

function ReviewRows({ items, canWriteB2, onReview }: { items: InvoiceItem[]; canWriteB2: boolean; onReview: (item: InvoiceItem) => void }) {
  if (!items.length) return <p className="px-4 py-8 text-center text-sm font-medium text-slate-800">No hay documentos pendientes de revisión de lectura.</p>;
  return <div className="divide-y divide-slate-200">
    {items.map((item) => {
      const version = revisionVersion(item);
      const historical = item.origenCalidad === 'HISTORICA';
      const mayReview = canWriteB2 && version !== null;
      return <article key={item.id} className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold text-slate-950">{item.archivoOneDrive || invoiceName(item)}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${historical ? 'bg-violet-100 text-violet-950' : 'bg-red-100 text-red-950'}`}>{historical ? 'Histórica' : 'Cuarentena'}</span>
          </div>
          <p className="mt-1 text-xs font-bold text-red-950">Revisar lectura · {moneyLabel(item.total)}</p>
          {item.motivoRevision && <p className="mt-1 text-xs text-slate-800"><strong>Motivo:</strong> {item.motivoRevision}</p>}
          <p className="mt-1 text-xs text-slate-700">En cola desde: {dateLabel(item.createdAt)}</p>
          {version === null && <p className="mt-1 text-xs font-bold text-red-900">No se puede corregir todavía: el backend no expuso una versión de revisión.</p>}
        </div>
        {item.pdfUrl ? <a href={item.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 rounded border border-slate-400 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700"><DocumentTextIcon className="h-4 w-4" />Ver PDF protegido</a> : <p className="text-xs font-bold text-slate-800">PDF protegido pendiente de exponer por la cola B2.</p>}
        <button type="button" onClick={() => onReview(item)} disabled={!mayReview} title={!canWriteB2 ? 'Se requiere permiso B2 de escritura y permiso granular de Finanzas.' : version === null ? 'Falta la versión para aplicar una corrección segura.' : undefined} className="inline-flex w-fit items-center gap-1 rounded bg-blue-900 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"><PencilSquareIcon className="h-4 w-4" />Corregir lectura</button>
      </article>;
    })}
  </div>;
}

function CorrectionDrawer({ item, canWriteB2, onClose, onSaved }: { item: InvoiceItem; canWriteB2: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Correction>(() => correctionFrom(item));
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const providerInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<{ fingerprint: string; solicitudId: string } | null>(null);
  const version = revisionVersion(item);

  const requestClose = useCallback(() => {
    if (submitting) return;
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }, [dirty, onClose, submitting]);

  function update(key: keyof Correction, value: string) {
    setForm(previous => {
      if (previous[key] === value) return previous;
      setDirty(true);
      return { ...previous, [key]: value };
    });
    setConfirmClose(false);
    setError('');
    setSuccess('');
  }

  function numeric(value: string, field: string): number {
    const parsed = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsed) || value.trim() === '') throw new Error(`${field} es obligatorio y debe ser numérico.`);
    return parsed;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteB2 || submitting || version === null) return;
    setError('');
    setSuccess('');
    let correction: JsonRecord;
    try {
      if (!form.proveedor.trim() || !form.cif.trim() || !form.numFactura.trim() || !form.fecha) throw new Error('Proveedor, CIF, número de factura y fecha del documento son obligatorios.');
      correction = {
        proveedor: form.proveedor.trim(),
        cif: form.cif.trim(),
        numFactura: form.numFactura.trim(),
        fecha: form.fecha,
        base: numeric(form.base, 'Base'),
        tipoIva: numeric(form.tipoIva, 'Tipo de IVA'),
        importeIva: numeric(form.importeIva, 'Importe de IVA'),
        tipoIrpf: numeric(form.tipoIrpf, 'Tipo de IRPF'),
        importeIrpf: numeric(form.importeIrpf, 'Importe de IRPF'),
        total: numeric(form.total, 'Total'),
        ...(form.concepto.trim() ? { concepto: form.concepto.trim() } : {}),
      };
    } catch (validationError) {
      setError(errorText(validationError));
      return;
    }

    /*
     * The API body deliberately contains no `id`: the ID belongs in the PATCH path and
     * the backend only accepts B2 correction fields.  It is still part of this local
     * fingerprint, so a network retry can only reuse a UUID for the exact target and
     * exact payload. The server verifies its own fingerprint before idempotent reuse.
     */
    const requestFingerprint = JSON.stringify({ id: item.id, version, correction });
    if (requestRef.current?.fingerprint !== requestFingerprint) {
      requestRef.current = { fingerprint: requestFingerprint, solicitudId: createRequestId() };
    }
    const body = { solicitudId: requestRef.current.solicitudId, version, ...correction };

    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/finanzas/facturas/calidad/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `No se ha podido guardar la corrección (${response.status}).`);
      setDirty(false);
      setSuccess(data?.repetida ? 'La corrección ya existía; se ha recuperado la factura sin duplicarla.' : 'Corrección guardada. La factura queda pendiente de revisión.');
      onSaved();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();
    providerInputRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, []);

  return <dialog
    ref={dialogRef}
    aria-labelledby="invoice-review-title"
    aria-describedby="invoice-review-description"
    onCancel={event => {
      event.preventDefault();
      requestClose();
    }}
    onClick={event => {
      if (event.target === event.currentTarget) requestClose();
    }}
    className="fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-left text-slate-950 backdrop:bg-slate-950/60"
  >
    <div className="flex h-full justify-end">
      <button type="button" aria-label="Cerrar revisión" tabIndex={-1} disabled={submitting} onClick={requestClose} className="hidden flex-1 cursor-default sm:block" />
      <section className="flex h-full w-full max-w-none flex-col border-l-2 border-slate-950 bg-white shadow-2xl sm:max-w-xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-slate-900 p-4">
          <div>
            <h3 id="invoice-review-title" className="text-lg font-extrabold text-slate-950">Corregir lectura OCR</h3>
            <p id="invoice-review-description" className="mt-1 text-xs font-medium text-slate-800">Indica la fecha que figura en el documento; no se reutiliza una fecha de nombre o sincronización y no se modifica el original.</p>
          </div>
          <button type="button" onClick={requestClose} disabled={submitting} aria-label="Cerrar revisión" className="rounded border border-slate-500 p-1.5 text-slate-950 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><XMarkIcon className="h-5 w-5" /></button>
        </header>
        {confirmClose && <div role="alert" className="shrink-0 border-b border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-bold">¿Cerrar el formulario? Los cambios que no hayas guardado se perderán.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setConfirmClose(false)} disabled={submitting} className="rounded border border-amber-500 bg-white px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-700 disabled:opacity-50">Seguir editando</button>
            <button type="button" onClick={onClose} disabled={submitting} className="rounded bg-amber-900 px-3 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-700 disabled:opacity-50">Descartar y cerrar</button>
          </div>
        </div>}
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
            <div className="rounded border border-amber-400 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>{item.origenCalidad === 'HISTORICA' ? 'Factura histórica marcada para revisión:' : 'Documento en cuarentena:'}</strong> {item.archivoOneDrive || item.id}. Verifica el PDF antes de guardar. Los importes vacíos no se convierten en cero.</div>
            {error && <p role="alert" className="rounded border-2 border-red-700 bg-red-50 px-3 py-2 text-sm font-bold text-red-950">{error}</p>}
            {success && <p role="status" aria-live="polite" className="rounded border-2 border-emerald-700 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-950">{success}</p>}
            {version === null && <p role="alert" className="rounded border-2 border-red-700 bg-red-50 px-3 py-2 text-sm font-bold text-red-950">Falta la versión de la revisión; refresca la bandeja antes de corregir.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field inputRef={providerInputRef} label="Proveedor" value={form.proveedor} onChange={value => update('proveedor', value)} required className="sm:col-span-2" />
              <Field label="CIF emisor" value={form.cif} onChange={value => update('cif', value)} required />
              <Field label="Número de factura" value={form.numFactura} onChange={value => update('numFactura', value)} required />
              <DateField label="Fecha del documento" value={form.fecha} onChange={value => update('fecha', value)} required />
              <Field label="Concepto" value={form.concepto} onChange={value => update('concepto', value)} />
              <NumberField label="Base imponible" value={form.base} onChange={value => update('base', value)} required />
              <NumberField label="Tipo IVA (%)" value={form.tipoIva} onChange={value => update('tipoIva', value)} required />
              <NumberField label="Importe IVA" value={form.importeIva} onChange={value => update('importeIva', value)} required />
              <NumberField label="Tipo IRPF (%)" value={form.tipoIrpf} onChange={value => update('tipoIrpf', value)} required />
              <NumberField label="Importe IRPF" value={form.importeIrpf} onChange={value => update('importeIrpf', value)} required />
              <NumberField label="Total" value={form.total} onChange={value => update('total', value)} required />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t-2 border-slate-900 bg-slate-50 p-4">
            <button type="button" onClick={requestClose} disabled={submitting} className="rounded border border-slate-500 bg-white px-3 py-2 text-sm font-bold text-slate-950 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={!canWriteB2 || submitting || version === null} className="inline-flex items-center gap-1 rounded bg-blue-900 px-3 py-2 text-sm font-bold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"><ClipboardDocumentCheckIcon className="h-4 w-4" />{submitting ? 'Guardando…' : 'Guardar corrección'}</button>
          </div>
        </form>
      </section>
    </div>
  </dialog>;
}

function Field({ label, value, onChange, required, className = '', inputRef }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; className?: string; inputRef?: React.RefObject<HTMLInputElement | null> }) {
  const id = `quality-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <label htmlFor={id} className={`block ${className}`}><span className="mb-1 block text-xs font-bold text-slate-950">{label}{required ? ' *' : ''}</span><input ref={inputRef} id={id} required={required} value={value} onChange={event => onChange(event.target.value)} className="w-full rounded border border-slate-500 bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-slate-600 focus:border-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-700" /></label>;
}

function DateField({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  const id = `quality-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <label htmlFor={id} className="block"><span className="mb-1 block text-xs font-bold text-slate-950">{label}{required ? ' *' : ''}</span><input id={id} required={required} type="date" value={value} onChange={event => onChange(event.target.value)} className="w-full rounded border border-slate-500 bg-white px-3 py-2 text-sm text-slate-950 focus:border-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-700" /></label>;
}

function NumberField({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  const id = `quality-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <label htmlFor={id} className="block"><span className="mb-1 block text-xs font-bold text-slate-950">{label}{required ? ' *' : ''}</span><input id={id} required={required} inputMode="decimal" value={value} onChange={event => onChange(event.target.value)} placeholder="0,00" className="w-full rounded border border-slate-500 bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-slate-600 focus:border-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-700" /></label>;
}

export default function InvoiceQualityWorkspace() {
  const { hasAreaAccess, permisosLoaded } = useRole();
  const granularCanWrite = hasAreaAccess('admin.finanzas.facturas', 'escritura');
  const granularCanRead = hasAreaAccess('admin.finanzas.facturas', 'lectura');
  const [tab, setTab] = useState<Tab>('revisar');
  const [inventory, setInventory] = useState<Inventory>({
    cuarentena: { items: [], total: null, page: 1, totalPages: null },
    copias: { items: [], total: null, page: 1, totalPages: null },
    importeExcluidoCopias: null,
    facturasRevisionHistorica: null,
    canWriteB2: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<InvoiceItem | null>(null);
  const controllers = useRef<AbortController[]>([]);

  const canWriteB2 = granularCanWrite && inventory.canWriteB2 === true;
  const currentPage = tab === 'copias' ? inventory.copias : inventory.cuarentena;

  const load = useCallback(async () => {
    controllers.current.forEach(controller => controller.abort());
    const controller = new AbortController();
    controllers.current = [controller];
    setLoading(true);
    setError('');
    const page = tab === 'copias' ? inventory.copias.page : inventory.cuarentena.page;
    const query = new URLSearchParams({ tipo: tab === 'copias' ? 'copias' : 'cuarentena', page: String(page), limit: String(PAGE_SIZE) });
    try {
      const response = await fetch(`/api/admin/finanzas/facturas/calidad?${query.toString()}`, { signal: controller.signal, cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `No se ha podido cargar el inventario B2 (${response.status}).`);
      if (!controller.signal.aborted) setInventory(inventoryFrom(data));
    } catch (loadError) {
      if (!controller.signal.aborted) setError(errorText(loadError));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [inventory.copias.page, inventory.cuarentena.page, refresh, tab]);

  useEffect(() => {
    load();
    return () => controllers.current.forEach(controller => controller.abort());
  }, [load]);

  const tabs = useMemo(() => [
    { id: 'revisar' as Tab, label: 'Revisar lectura', count: inventory.cuarentena.total, icon: DocumentMagnifyingGlassIcon },
    { id: 'copias' as Tab, label: 'Copias', count: inventory.copias.total, icon: DocumentTextIcon },
  ], [inventory.copias.total, inventory.cuarentena.total]);

  function changeTab(next: Tab) {
    setTab(next);
    setError('');
  }

  function refreshAfterSave() {
    setSelected(null);
    setRefresh(value => value + 1);
  }

  if (permisosLoaded && !granularCanRead) return <section className="rounded-xl border-2 border-red-800 bg-red-50 p-4 text-sm font-bold text-red-950" role="alert">No tienes permiso de lectura para la calidad de facturas.</section>;

  return <section aria-label="Control de calidad de facturas" className="rounded-xl border-2 border-slate-800 bg-white shadow-sm">
    <header className="flex flex-col gap-3 border-b-2 border-slate-800 bg-slate-50 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="flex items-center gap-2"><DocumentMagnifyingGlassIcon className="h-6 w-6 text-blue-900" /><h2 className="text-lg font-extrabold text-slate-950">Calidad de facturas</h2></div><p className="mt-1 max-w-3xl text-sm font-medium text-slate-800">Revisa documentos pendientes y copias sin duplicar el listado principal de facturas activas. Ambos permanecen excluidos de los totales fiscales.</p></div>
      <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading} className="inline-flex w-fit items-center gap-1 rounded border border-slate-500 bg-white px-3 py-2 text-xs font-bold text-slate-950 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</button>
    </header>

    <div className="grid gap-2 border-b border-slate-300 bg-white p-2 sm:grid-cols-2" role="tablist" aria-label="Bandejas de calidad">
      {tabs.map(({ id, label, count, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} aria-controls={`quality-panel-${id}`} onClick={() => changeTab(id)} className={`flex min-h-11 items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm font-extrabold focus:outline-none focus:ring-2 focus:ring-blue-700 ${tab === id ? 'bg-blue-900 text-white' : 'border border-slate-400 bg-white text-slate-950 hover:bg-slate-100'}`}><span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" />{label}</span><span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${tab === id ? 'bg-white text-slate-950' : 'bg-slate-200 text-slate-950'}`}>{count === null ? '—' : count}</span></button>)}
    </div>

    <div className="grid gap-2 border-b border-slate-300 bg-slate-50 p-3 sm:grid-cols-2">
      <p className="rounded border border-slate-400 bg-white px-3 py-2 text-xs font-medium text-slate-900"><strong>Copias excluidas:</strong> {inventory.copias.total === null ? '—' : inventory.copias.total} · <strong>Importe excluido:</strong> {moneyLabel(inventory.importeExcluidoCopias, 'SIN IMPORTE')}</p>
      <p className="rounded border border-slate-400 bg-white px-3 py-2 text-xs font-medium text-slate-900"><strong>Lecturas históricas a revisar:</strong> {inventory.facturasRevisionHistorica === null ? '—' : inventory.facturasRevisionHistorica} · no se muestran como contabilizadas.</p>
    </div>

    {error && <div role="alert" className="m-3 flex flex-col gap-2 rounded border-2 border-red-700 bg-red-50 p-3 text-sm font-bold text-red-950 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><button type="button" onClick={() => setRefresh(value => value + 1)} className="w-fit underline decoration-2 underline-offset-2 focus:outline-none focus:ring-2 focus:ring-red-800">Reintentar</button></div>}

    <div id={`quality-panel-${tab}`} role="tabpanel" className={loading && !currentPage.items.length ? 'min-h-[600px]' : 'min-h-28'}>
      {loading && !currentPage.items.length ? <p className="px-4 py-8 text-center text-sm font-bold text-slate-800">Cargando inventario de calidad…</p> : tab === 'copias' ? <CopyRows items={inventory.copias.items} /> : <ReviewRows items={inventory.cuarentena.items} canWriteB2={canWriteB2} onReview={setSelected} />}
      <Pagination page={currentPage.page} total={currentPage.total} totalPages={currentPage.totalPages} onPage={next => { if (tab === 'copias') setInventory(value => ({ ...value, copias: { ...value.copias, page: next } })); else setInventory(value => ({ ...value, cuarentena: { ...value.cuarentena, page: next } })); }} disabled={loading} label={`Paginación de ${tabs.find(item => item.id === tab)?.label || 'facturas'}`} />
    </div>
    {selected && <CorrectionDrawer item={selected} canWriteB2={canWriteB2} onClose={() => setSelected(null)} onSaved={refreshAfterSave} />}
  </section>;
}
