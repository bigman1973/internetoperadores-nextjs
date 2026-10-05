'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRole } from '@/components/admin/RoleContext';

type Doc = { id: string; nombre: string; tipo: string; anio: number | null; mes: number | null; createdAt: string };
const MONTHS = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function EmployeePrivateDocuments({ employeeId }: { employeeId: string }) {
  const { isSuperAdmin, isViewingAs } = useRole();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tipo, setTipo] = useState<'LIQUIDACION' | 'CARTA_EXTINCION'>('LIQUIDACION');
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(9);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const canView = isSuperAdmin && !isViewingAs;
  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/empleados/${encodeURIComponent(employeeId)}/documentos`, { cache: 'no-store' });
    if (response.ok) setDocs((await response.json()).documentos || []);
  }, [employeeId]);
  useEffect(() => { if (canView) void load(); }, [load, canView]);
  if (!canView) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true); setMessage('Comprobando el documento y la carpeta privada...');
    try {
      const data = new FormData();
      data.set('archivo', file); data.set('tipo', tipo); data.set('anio', String(year)); data.set('mes', String(month));
      const response = await fetch(`/api/admin/empleados/${encodeURIComponent(employeeId)}/documentos`, { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo vincular el archivo');
      setMessage(result.yaExistia ? 'Documento ya vinculado: no se creó otra copia.' : 'Documento verificado y vinculado al expediente.');
      setFile(null); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Revisa el documento en OneDrive'); }
    finally { setBusy(false); }
  }

  return <section className="rounded-xl border border-amber-200 bg-white p-5" aria-labelledby="expediente-documental">
    <h2 id="expediente-documental" className="text-lg font-semibold text-gray-900">Expediente documental privado</h2>
    <p className="mt-1 text-sm text-gray-600">Esta tarjeta del expediente solo está disponible para superadministración. Una liquidación puede aparecer también en las nóminas del propio empleado al sincronizar el mes. OneDrive mantiene los permisos actuales de la carpeta: si la carta requiere mayor restricción allí, habrá que moverla a una carpeta específica. Vincular un archivo no contabiliza una segunda nómina.</p>
    <div className="mt-4 space-y-2">
      {docs.length ? docs.map(doc => <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 p-3 text-sm">
        <span className="font-medium text-gray-800">{doc.tipo === 'LIQUIDACION' ? 'Liquidación' : 'Carta de extinción'} · {MONTHS[doc.mes || 0]} {doc.anio} <span className="block text-xs font-normal text-gray-500">{doc.nombre}</span></span>
        <a href={`/api/admin/empleados/${encodeURIComponent(employeeId)}/documentos/${encodeURIComponent(doc.id)}`} target="_blank" rel="noopener noreferrer" className="font-medium text-orange-700 hover:underline">Abrir archivo protegido</a>
      </div>) : <p className="text-sm text-gray-500">Todavía no hay documentos vinculados a este expediente.</p>}
    </div>
    <form onSubmit={submit} className="mt-5 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-4">
      <label className="text-xs font-medium text-gray-700">Tipo<select className="mt-1 w-full rounded-lg border p-2 text-sm" value={tipo} onChange={e => { setTipo(e.target.value as typeof tipo); setFile(null); }}><option value="LIQUIDACION">Liquidación PDF</option><option value="CARTA_EXTINCION">Carta de extinción DOCX</option></select></label>
      <label className="text-xs font-medium text-gray-700">Año<input className="mt-1 w-full rounded-lg border p-2 text-sm" type="number" min="2024" max="2100" value={year} onChange={e => setYear(Number(e.target.value))} /></label>
      <label className="text-xs font-medium text-gray-700">Mes<select className="mt-1 w-full rounded-lg border p-2 text-sm" value={month} onChange={e => setMonth(Number(e.target.value))}>{MONTHS.slice(1).map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select></label>
      <label className="text-xs font-medium text-gray-700">Archivo<input className="mt-1 block w-full text-sm" type="file" accept={tipo === 'LIQUIDACION' ? '.pdf,application/pdf' : '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'} onChange={e => setFile(e.target.files?.[0] || null)} /></label>
      <div className="sm:col-span-4 flex items-center gap-3"><button type="submit" disabled={!file || busy} className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Verificando…' : 'Verificar y vincular en OneDrive'}</button><span className="text-xs text-gray-500">Si el mismo archivo ya está en la carpeta, se reutiliza.</span></div>
      {message && <p role="status" className="sm:col-span-4 text-sm text-gray-700">{message}</p>}
    </form>
  </section>;
}
