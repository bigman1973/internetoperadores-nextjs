'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ArchivoMovimientoPrivado = Readonly<{
  archivoId: string | null;
  origen: string | null;
  vinculo: string;
  estado: 'DISPONIBLE' | 'FALTA_ARCHIVO_DESCARGABLE';
  nombre: string | null;
  mimeType: string | null;
  tipoDocumentoB4: string | null;
  documentoConciliableId: string | null;
  noMonetario: boolean;
  motivo?: string;
}>;

type Response = Readonly<{
  movimientoId: string;
  archivos: readonly ArchivoMovimientoPrivado[];
  noEscrituras: true;
  requiereConfirmacionHumanaParaVinculos: true;
}>;

export type PrivateMovementFilesProps = Readonly<{
  movimientoId: string;
  /** Mantiene el mismo componente usable fuera del drawer B4. */
  compact?: boolean;
}>;

function parseResponse(raw: unknown, movimientoId: string): Response | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as any;
  if (data.movimientoId !== movimientoId || data.noEscrituras !== true || data.requiereConfirmacionHumanaParaVinculos !== true || !Array.isArray(data.archivos)) return null;
  for (const file of data.archivos) {
    if (!file || typeof file !== 'object' || !['DISPONIBLE', 'FALTA_ARCHIVO_DESCARGABLE'].includes(file.estado)
      || typeof file.vinculo !== 'string' || typeof file.noMonetario !== 'boolean') return null;
    if (file.estado === 'DISPONIBLE' && (typeof file.archivoId !== 'string' || typeof file.nombre !== 'string')) return null;
    if (file.estado === 'FALTA_ARCHIVO_DESCARGABLE' && typeof file.motivo !== 'string') return null;
  }
  return data as Response;
}
function backendError(raw: unknown): string {
  const message = raw && typeof raw === 'object' ? (raw as any).error : null;
  return typeof message === 'string' && message.trim() ? message.trim().slice(0, 260) : 'No se pudieron leer los archivos privados.';
}
function originLabel(origin: string | null): string {
  switch (origin) {
    case 'NOMINA_DOCUMENTO': return 'Nómina';
    case 'NOMINA_ARCHIVO_URL_RELATIVA': return 'Nómina histórica';
    case 'FACTURA_RECIBIDA_ONEDRIVE': return 'Factura recibida';
    case 'GASTO_TICKET_ONEDRIVE': return 'Ticket / gasto';
    case 'DOCUMENTO_AAPP_BASE64': return 'Documento AAPP';
    case 'PAGO_FRACCIONADO_DOCUMENTO_AAPP_BASE64': return 'Cuota AAPP';
    case 'ADJUNTO_B5': return 'Soporte B5';
    case 'CONFIRMING_REFERIDO': return 'Soporte confirming';
    default: return 'Soporte';
  }
}

/**
 * Sólo lista y descarga por href interno. No muestra ni recibe URL externa, drive
 * ni item. Abrir un archivo no prepara ni confirma ningún vínculo B4.
 */
export default function PrivateMovementFiles({ movimientoId, compact = false }: PrivateMovementFilesProps) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<Response | null>(null);
  const [error, setError] = useState('');
  const sequence = useRef(0);

  useEffect(() => {
    sequence.current += 1;
    setLoading(false); setResponse(null); setError('');
  }, [movimientoId]);

  const load = useCallback(async () => {
    const token = ++sequence.current;
    setLoading(true); setError(''); setResponse(null);
    try {
      const result = await fetch(`/api/admin/finanzas/movimientos/${encodeURIComponent(movimientoId)}/archivos`, { cache: 'no-store' });
      const raw: unknown = await result.json().catch(() => null);
      if (token !== sequence.current) return;
      if (!result.ok) throw new Error(backendError(raw));
      const parsed = parseResponse(raw, movimientoId);
      if (!parsed) throw new Error('La respuesta de archivos es incompleta; no se muestran resultados parciales.');
      setResponse(parsed);
    } catch (cause) {
      if (token === sequence.current) setError(cause instanceof Error ? cause.message : 'No se pudieron leer los archivos privados.');
    } finally {
      if (token === sequence.current) setLoading(false);
    }
  }, [movimientoId]);

  const endpoint = `/api/admin/finanzas/movimientos/${encodeURIComponent(movimientoId)}/archivos`;
  return <section aria-labelledby={`private-files-${movimientoId}`} className={`rounded-xl border border-slate-200 bg-white ${compact ? 'p-3' : 'p-4'}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id={`private-files-${movimientoId}`} className="font-bold text-slate-950">Archivos del movimiento</h3><p className="mt-1 text-xs text-slate-600">Sólo soportes privados pertenecientes a este movimiento. La descarga no modifica B4.</p></div><button type="button" onClick={() => { void load(); }} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Cargando…' : response ? 'Actualizar archivos' : 'Ver archivos'}</button></div>
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">{error}</p>}
    {!error && response && <div className="mt-3">{response.archivos.length === 0 ? <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No hay soportes listados para este movimiento.</p> : <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">{response.archivos.map((file, index) => <li key={file.archivoId || `${file.documentoConciliableId || 'incidencia'}-${index}`} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{file.estado === 'DISPONIBLE' ? file.nombre : 'Archivo descargable pendiente'}</p><p className="mt-1 text-xs text-slate-600">{file.estado === 'DISPONIBLE' ? `${originLabel(file.origen)} · ${file.noMonetario ? 'soporte no monetario' : 'documento financiero'}` : file.motivo}</p></div>{file.estado === 'DISPONIBLE' && file.archivoId ? <a href={`${endpoint}?archivoId=${encodeURIComponent(file.archivoId)}`} className="inline-flex shrink-0 items-center justify-center rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-900 hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500">Descargar</a> : <span className="text-xs font-semibold text-amber-800">Incidencia</span>}</li>)}</ul>}</div>}
  </section>;
}
