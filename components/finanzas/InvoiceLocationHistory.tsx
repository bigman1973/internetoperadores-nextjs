'use client';
import { useState } from 'react';
type Entry = { id: string; motivo: string; createdAt: string; anterior: { carpetaOrigen?: string; oneDriveRutaActual?: string }; actual: { carpetaOrigen?: string; oneDriveRutaActual?: string } };
export default function InvoiceLocationHistory({ facturaId }: { facturaId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');
  async function toggle() {
    setOpen(!open);
    if (open || entries) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/finanzas/sincronizar-onedrive?facturaId=${encodeURIComponent(facturaId)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error('No se pudo consultar el historial');
      setEntries(data.historial || []);
    } catch { setError('No se pudo consultar el historial. Cierra y vuelve a abrir para reintentar.'); }
    finally { setLoading(false); }
  }
  return <div onClick={event => event.stopPropagation()} className="mt-1 text-left max-w-xs">
    <button type="button" onClick={toggle} aria-expanded={open} className="text-xs text-blue-700 underline hover:text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">{open ? 'Ocultar historial' : 'Ver historial de ubicación'}</button>
    {open && <div className="mt-2 rounded border border-slate-200 bg-white p-2 text-xs text-slate-800 max-h-64 overflow-auto">
      {loading && <p>Consultando historial…</p>}
      {error && <p className="text-red-800">{error}</p>}
      {entries?.length === 0 && <p>Aún no hay cambios de ubicación registrados.</p>}
      {entries?.map(entry => <div key={entry.id} className="py-2 border-b border-slate-100 last:border-0">
        <p className="font-medium">{new Date(entry.createdAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</p>
        <p className="break-words">{entry.anterior.carpetaOrigen || 'Sin ubicación'} → {entry.actual.carpetaOrigen || 'Sin ubicación'}</p>
        <p className="mt-1 text-slate-600">{entry.motivo === 'VERIFICACION_BIBLIOTECA_HISTORICA' ? 'Biblioteca histórica confirmada por el usuario' : entry.motivo === 'NORMALIZACION_ETIQUETA' ? 'Normalización de etiqueta histórica' : entry.motivo === 'ALTA_ONEDRIVE' ? 'Alta documental' : 'Lectura de ubicación actual en OneDrive'}</p>
      </div>)}
    </div>}
  </div>;
}
