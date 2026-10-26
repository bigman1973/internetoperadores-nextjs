'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  formatCents,
  type ConfiguracionB5,
  type ConfirmarNoRequiereB4,
  type EstadoManualB5,
  type GestionPatchB5,
  type MovimientoPendienteB5,
  type MotivoNoRequiereB4,
} from './types';

const API = '/api/admin/finanzas/pendientes';
const FUTURE_DOCUMENT_API = '/api/admin/finanzas/pendientes/documento';
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const NO_REQUIRE_REASONS: Array<{ value: MotivoNoRequiereB4; label: string }> = [
  { value: 'COMISION_BANCARIA', label: 'Comisión bancaria' },
  { value: 'INTERES_BANCARIO', label: 'Interés bancario' },
  { value: 'REDONDEO_BANCARIO', label: 'Redondeo bancario' },
  { value: 'TRASPASO_INTERNO_SIN_DOCUMENTO', label: 'Traspaso interno sin documento' },
  { value: 'MOVIMIENTO_TECNICO_BANCO', label: 'Movimiento técnico del banco' },
  { value: 'CORRECCION_BANCARIA', label: 'Corrección bancaria' },
];

type NoRequireDialogState = {
  movement: MovimientoPendienteB5;
  reason: MotivoNoRequiereB4 | '';
  payload: ConfirmarNoRequiereB4 | null;
  retry: boolean;
};

type Attachment = {
  id: string;
  tipoDocumento: string;
  estado: string;
  nombreTercero: string | null;
  concepto: string | null;
  fechaDocumento: string | null;
  importeDocumentoCentimos: number | null;
  storageName: string;
  authenticatedWebUrl: string | null;
};

function message(value: unknown, fallback: string): string {
  return value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
    ? (value as { error: string }).error : fallback;
}
function formatMoney(cents: number | null): string { return formatCents(cents); }
function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat('es-ES').format(new Date(`${value}T00:00:00`)) : 'Fecha no disponible';
}
function labelReason(reason: MotivoNoRequiereB4 | ''): string {
  return NO_REQUIRE_REASONS.find((item) => item.value === reason)?.label || '';
}
function isAllowedUpload(file: File): boolean {
  return ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) && file.size <= MAX_UPLOAD_BYTES;
}

export function EditDialog({ movement, responsables, canWrite, onClose, onSave }: {
  movement: MovimientoPendienteB5;
  responsables: ConfiguracionB5['responsables'];
  canWrite: boolean;
  onClose: () => void;
  onSave: (payload: GestionPatchB5) => Promise<void>;
}) {
  const [responsable, setResponsable] = useState(String(movement.gestion.responsable?.id || ''));
  const [estado, setEstado] = useState<EstadoManualB5>(movement.gestion.estadoManual);
  const [nota, setNota] = useState(movement.gestion.nota || '');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSave({ movimientoId: movement.id, version: movement.gestion.version, responsableAdminId: responsable ? Number(responsable) : null, estado, nota: nota.trim() || null });
  };
  return <Modal title="Editar gestión humana" onClose={onClose}><form onSubmit={submit} className="space-y-4"><p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{movement.concepto || 'Sin concepto'} · <strong>{formatMoney(movement.importeCentimos)}</strong>. Esta edición no vincula documentos ni cambia B4.</p><label className="block text-sm font-semibold">Responsable<select data-testid="b5-responsible" value={responsable} onChange={(event) => setResponsable(event.target.value)} disabled={!canWrite || responsables.length === 0} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Sin asignar</option>{responsables.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>{responsables.length === 0 && <span className="mt-1 block text-xs font-normal text-amber-800">El selector requiere la metadata activa del recurso configuracion.</span>}</label><label className="block text-sm font-semibold">Estado<select data-testid="b5-manual-state" value={estado} onChange={(event) => setEstado(event.target.value as EstadoManualB5)} disabled={!canWrite} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="PENDIENTE">Pendiente</option><option value="PEDIDO">Pedido</option><option value="RECIBIDO">Recibido</option></select></label><label className="block text-sm font-semibold">Nota<textarea data-testid="b5-note" value={nota} maxLength={2000} onChange={(event) => setNota(event.target.value)} rows={4} disabled={!canWrite} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Cancelar</button><button data-testid="b5-save-management" type="submit" disabled={!canWrite} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Guardar y releer</button></div></form></Modal>;
}

export function NoRequireDialog({ state, onClose, onReason, onReview, onConfirm }: {
  state: NoRequireDialogState;
  onClose: () => void;
  onReason: (reason: MotivoNoRequiereB4 | '') => void;
  onReview: () => void;
  onConfirm: () => void;
}) {
  const final = Boolean(state.payload);
  return <Modal title={final ? 'Confirmar No requiere en B4' : 'Marcar No requiere'} onClose={onClose}><div className="space-y-4"><div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950"><strong>Valor bancario real:</strong> {formatMoney(state.movement.importeCentimos)}. Un importe de 0,00 € técnico puede confirmarse, pero un importe desconocido no.</div>{final ? <><p className="text-sm text-slate-700">Revise la acción definitiva. B4 creará una operación auditable con líneas vacías; esta pantalla no hace PATCH ni altera estados de cobro/pago.</p><p className="text-sm"><strong>Motivo cerrado:</strong> {labelReason(state.payload!.borrador.motivoNoRequiere)}</p>{state.retry && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Se reintentará exactamente el mismo payload y la misma clave de idempotencia.</p>}<Actions cancel={onClose} confirm={onConfirm} label={state.retry ? 'Reintentar confirmación' : 'Confirmar definitivamente'} testId="b5-confirm-no-require" /></> : <><label className="block text-sm font-semibold">Motivo cerrado<select data-testid="b5-no-require-reason" value={state.reason} onChange={(event) => onReason(event.target.value as MotivoNoRequiereB4 | '')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Seleccione un motivo</option>{NO_REQUIRE_REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></label><p className="text-xs text-slate-600">No existe “Otro” ni texto libre; no se envían líneas documentales.</p><Actions cancel={onClose} confirm={onReview} disabled={!state.reason} label="Revisar acción" testId="b5-review-no-require" /></>}</div></Modal>;
}

export function AttachmentsDialog({ movement, onClose }: { movement: MovimientoPendienteB5; onClose: () => void }) {
  const [rows, setRows] = useState<Attachment[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${API}?recurso=adjuntos&movimientoId=${encodeURIComponent(movement.id)}`, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(json, 'No se pudieron leer los adjuntos.'));
      if (!Array.isArray(json?.adjuntos) || json.adjuntos.some((row: any) => typeof row?.id !== 'string' || typeof row.storageName !== 'string' || !['TICKET', 'SOPORTE'].includes(row.tipoDocumento) || !['RESERVADO', 'UPLOAD_COMPLETO'].includes(row.estado))) throw new Error('Lectura documental incompleta; no se interpreta como ausencia de archivos.');
      if (!controller.signal.aborted) setRows(json.adjuntos);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo leer.'); });
    return () => controller.abort();
  }, [movement.id]);
  const safeUrl = (value: string | null) => { try { const url = new URL(value || ''); return url.protocol === 'https:' && url.hostname.endsWith('.sharepoint.com') && !url.username && !url.password && !url.search && !url.hash ? url.href : null; } catch { return null; } };
  return <Modal title="Archivos del movimiento" onClose={onClose}><div className="space-y-3"><p className="text-sm text-slate-700">{movement.concepto}. Guardar un soporte no implica factura canónica ni pago conciliado.</p>{error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">{error}</p> : rows === null ? <p role="status" className="text-sm text-slate-600">Leyendo adjuntos…</p> : rows.length === 0 ? <p className="text-sm text-slate-600">No constan adjuntos guardados en esta bandeja para el movimiento.</p> : <ul className="space-y-3">{rows.map((row) => { const url = safeUrl(row.authenticatedWebUrl); return <li key={row.id} className="rounded-lg border border-slate-200 p-3"><p className="font-semibold text-slate-950">{row.concepto || 'Documento guardado'}</p><p className="mt-1 text-xs text-slate-700">{row.tipoDocumento === 'TICKET' ? 'Ticket validado' : 'Soporte'} · {row.nombreTercero || 'Tercero no informado'} · {row.fechaDocumento ? formatDate(row.fechaDocumento) : 'Fecha desconocida'} · {formatMoney(row.importeDocumentoCentimos)}</p>{row.estado === 'RESERVADO' ? <p className="mt-2 text-xs font-semibold text-amber-900">Subida no completada. Se conserva la reserva para revisión; no se sobrescriben archivos.</p> : url ? <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block rounded-md border border-orange-300 px-3 py-2 text-sm font-bold text-orange-900">Abrir en SharePoint</a> : <p className="mt-2 text-xs text-amber-900">Enlace no verificable; requiere revisión.</p>}</li>; })}</ul>}<button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Cerrar</button></div></Modal>;
}

export function UploadDialog({ movement, onClose, onSaved }: { movement: MovimientoPendienteB5; onClose: () => void; onSaved: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [tipo, setTipo] = useState<'SOPORTE' | 'TICKET'>('SOPORTE');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    if (!file || !isAllowedUpload(file)) { setError('Seleccione PDF, JPEG o PNG, no vacío y de hasta 3 MiB.'); return; }
    if (form.get('confirmacionDocumento') !== 'on') { setError('Revise y confirme los datos antes de subir.'); return; }
    const fields = { movimientoId: movement.id, versionGestion: String(movement.gestion.version), tipoDocumento: tipo, fechaDocumento: String(form.get('fechaDocumento') || ''), importeDocumento: String(form.get('importeDocumento') || '').trim().replace(',', '.'), nombreProveedor: String(form.get('nombreProveedor') || '').trim(), concepto: String(form.get('concepto') || '').trim(), confirmacionDocumento: 'true' };
    if (!fields.nombreProveedor || !fields.concepto) { setError('Informe tercero y descripción del documento.'); return; }
    if (tipo === 'TICKET' && (!fields.fechaDocumento || !fields.importeDocumento)) { setError('Un ticket requiere fecha e importe positivo expresamente revisados.'); return; }
    setBusy(true); setError('');
    try {
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const fingerprint = JSON.stringify({ ...fields, digest, mime: file.type });
      if (!requestRef.current || requestRef.current.fingerprint !== fingerprint) requestRef.current = { fingerprint, key: crypto.randomUUID() };
      const payload = new FormData();
      Object.entries(fields).forEach(([name, value]) => payload.set(name, value));
      payload.set('idempotencyKey', requestRef.current.key);
      payload.set('archivo', file);
      const response = await fetch(FUTURE_DOCUMENT_API, { method: 'POST', body: payload });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(json, 'No se pudo guardar el documento. El mismo contenido conserva su clave para un reintento explícito.'));
      if (json?.ok !== true || !['SOPORTE', 'TICKET'].includes(json.tipoDocumento) || typeof json.idAdjunto !== 'string') throw new Error('Respuesta documental incompleta; actualice antes de volver a subir.');
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el documento.'); } finally { setBusy(false); }
  };
  return <Modal title="Subir documento" onClose={() => { if (!busy) onClose(); }}><form onSubmit={(event) => void submit(event)} className="space-y-4"><p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">Sólo guarda el archivo en la carpeta de staging, fuera del circuito de gestoría. No vincula el banco ni ejecuta OCR. La fecha y el importe nunca se copian del movimiento.</p><label className="block text-sm font-semibold">Tipo de documento<select data-testid="b5-document-type" value={tipo} onChange={(event) => setTipo(event.target.value as 'SOPORTE' | 'TICKET')} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="SOPORTE">Factura u otro soporte — no crea compra ni venta</option>{movement.importeCentimos !== null && movement.importeCentimos < 0 && <option value="TICKET">Nuevo ticket de gasto validado</option>}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">Fecha del documento<input data-testid="b5-document-date" type="date" name="fechaDocumento" required={tipo === 'TICKET'} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="block text-sm font-semibold">Importe del documento (€)<input data-testid="b5-document-amount" name="importeDocumento" inputMode="decimal" placeholder="123,45 — sin separador de miles" required={tipo === 'TICKET'} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label></div>{tipo === 'SOPORTE' && <p className="text-xs text-slate-600">Si no conoce la fecha o el importe, déjelos vacíos: se conservan como desconocidos, no como cero.</p>}<label className="block text-sm font-semibold">Tercero del documento<input data-testid="b5-document-party" name="nombreProveedor" required maxLength={300} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="block text-sm font-semibold">Descripción<input data-testid="b5-document-concept" name="concepto" required maxLength={1000} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="block text-sm font-semibold">Archivo<input data-testid="b5-document-file" type="file" accept="application/pdf,image/jpeg,image/png" required disabled={busy} onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1 block w-full text-sm" /></label><label className="flex gap-2 text-sm"><input data-testid="b5-document-confirm" type="checkbox" name="confirmacionDocumento" required disabled={busy} /><span>He revisado el archivo y sus datos. {tipo === 'TICKET' ? 'Confirmo este gasto como ticket validado.' : 'Lo guardo sólo como soporte; no se convierte en factura ni gasto.'} No se concilia automáticamente.</span></label>{error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">{error}</p>}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50">Cancelar</button><button data-testid="b5-upload-document" type="submit" disabled={busy} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar documento revisado'}</button></div></form></Modal>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="b5-dialog-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-200 px-5 py-4"><h2 id="b5-dialog-title" className="font-bold text-slate-950">{title}</h2><button type="button" aria-label="Cerrar diálogo" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"><XMarkIcon className="h-5 w-5" aria-hidden="true" /></button></header><div className="p-5">{children}</div></section></div>;
}
function Actions({ cancel, confirm, disabled, label, testId }: { cancel: () => void; confirm?: () => void; disabled?: boolean; label: string; testId: string }) {
  return <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={cancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800">Cancelar</button><button data-testid={testId} type={confirm ? 'button' : 'submit'} onClick={confirm} disabled={disabled} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{label}</button></div>;
}
