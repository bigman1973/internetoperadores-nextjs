'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpTrayIcon, CameraIcon, MapPinIcon, PaperClipIcon, XMarkIcon } from '@heroicons/react/24/outline';
import AvisosGastos from '@/components/area5/AvisosGastos';

interface Gasto {
  id: string; tipo: 'TICKET' | 'KILOMETRAJE'; fecha: string; concepto: string; categoria: string | null; proyecto: string | null; cliente: string | null;
  comercio: string | null; cifComercio: string | null; importe: number; tipoIva: number | null; importeIva: number | null; km: number | null; eurKm: number | null;
  ocrEstado: string; estado: 'BORRADOR' | 'PENDIENTE' | 'ACLARACION' | 'APROBADO' | 'RECHAZADO'; motivo: string | null; cierreId: string | null; tieneAdjunto: boolean;
}
interface Evento { id: number; actor: string; accion: string; texto: string | null; fecha: string }

const CATEGORIAS = ['COMIDA', 'DIETA', 'DESPLAZAMIENTO', 'COMBUSTIBLE', 'PARKING', 'PEAJE', 'ALOJAMIENTO', 'MATERIAL', 'FORMACION', 'OTROS'];
const ESTADO: Record<string, { t: string; c: string }> = {
  BORRADOR: { t: 'Borrador', c: 'bg-gray-100 text-gray-700' }, PENDIENTE: { t: 'En revisión', c: 'bg-amber-100 text-amber-800' },
  ACLARACION: { t: 'Te piden aclaración', c: 'bg-violet-100 text-violet-800' }, APROBADO: { t: 'Aprobado', c: 'bg-emerald-100 text-emerald-800' }, RECHAZADO: { t: 'Rechazado', c: 'bg-red-100 text-red-800' },
};
const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const hoy = () => new Date().toISOString().slice(0, 10);
const J = { 'Content-Type': 'application/json' };

export default function MisGastosPage() {
  const [gastos, setGastos] = useState<Gasto[] | null>(null);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [abierto, setAbierto] = useState<Gasto | null>(null);
  const [km, setKm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const r = await fetch('/api/empleado/mis-gastos', { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) { setError(d.error || 'No se pudieron cargar tus gastos'); setGastos([]); return; }
    setGastos(d.gastos); setNombre(d.empleado?.nombreCompleto || '');
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function subir(file: File) {
    setError(''); setSubiendo(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/empleado/mis-gastos', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo subir el ticket');
      await cargar(); setAbierto(d.gasto);
    } catch (e: any) { setError(e.message); } finally { setSubiendo(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  const total = (gastos || []).filter(g => g.estado === 'APROBADO').reduce((s, g) => s + g.importe, 0);
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900">Mis gastos</h1>
      <p className="mt-1 text-sm text-gray-500">{nombre ? `${nombre} · ` : ''}Sube tus tickets o kilometraje. Si David o Víctor los aprueban, se abonan en tu nómina.</p>
      <div className="mt-5"><AvisosGastos /></div>
      <div className="flex flex-wrap gap-3">
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => e.target.files?.[0] && subir(e.target.files[0])} />
        <button type="button" disabled={subiendo} onClick={() => fileRef.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60">
          <CameraIcon className="h-5 w-5" />{subiendo ? 'Leyendo el ticket…' : 'Subir ticket (foto o PDF)'}
        </button>
        <button type="button" onClick={() => setKm(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50">
          <MapPinIcon className="h-5 w-5" />Añadir kilometraje
        </button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {gastos && gastos.length > 0 && <p className="mt-6 text-sm text-gray-600">Aprobado y pendiente de cierre o ya abonado: <strong>{eur(total)}</strong></p>}
      <div className="mt-3 space-y-2">
        {gastos === null && <p className="text-sm text-gray-500">Cargando…</p>}
        {gastos?.length === 0 && !error && <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">Todavía no has subido ningún gasto.</p>}
        {gastos?.map(g => (
          <button type="button" key={g.id} onClick={() => setAbierto(g)} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-orange-300">
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900">{g.concepto}</p>
              <p className="text-xs text-gray-500">{g.fecha.split('-').reverse().join('/')} · {g.tipo === 'KILOMETRAJE' ? `${g.km} km × ${g.eurKm} €/km` : g.comercio || 'Ticket'}{g.tieneAdjunto && <PaperClipIcon className="ml-1 inline h-3.5 w-3.5" />}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold text-gray-900">{g.importe > 0 ? eur(g.importe) : '—'}</p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO[g.estado].c}`}>{g.cierreId && g.estado === 'APROBADO' ? 'Aprobado · en cierre' : ESTADO[g.estado].t}</span>
            </div>
          </button>
        ))}
      </div>
      {abierto && <Editor gasto={abierto} cerrar={() => { setAbierto(null); cargar(); }} />}
      {km && <KmForm cerrar={() => { setKm(false); cargar(); }} />}
    </div>
  );
}

function Modal({ titulo, cerrar, children }: { titulo: string; cerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-label={titulo} className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{titulo}</h2>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="min-h-11 min-w-11 rounded-lg p-2 hover:bg-gray-100"><XMarkIcon className="h-5 w-5" /></button></div>
        {children}
      </section>
    </div>
  );
}
const inp = 'mt-1 block min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-gray-50';

function KmForm({ cerrar }: { cerrar: () => void }) {
  const [f, setF] = useState({ fecha: hoy(), concepto: '', km: '', eurKm: '0.26', proyecto: '', cliente: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const imp = (Number(f.km) || 0) * (Number(f.eurKm) || 0);
  async function guardar(enviar: boolean) {
    setErr(''); setBusy(true);
    const r = await fetch('/api/empleado/mis-gastos', { method: 'POST', headers: J, body: JSON.stringify({ tipo: 'KILOMETRAJE', ...f, km: Number(f.km), eurKm: Number(f.eurKm), enviar }) });
    const d = await r.json(); setBusy(false);
    if (!r.ok) return setErr(d.error || 'No se pudo guardar');
    cerrar();
  }
  return (
    <Modal titulo="Añadir kilometraje" cerrar={cerrar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">Fecha<input type="date" max={hoy()} className={inp} value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">Origen, destino o motivo<input className={inp} maxLength={200} value={f.concepto} onChange={e => setF({ ...f, concepto: e.target.value })} placeholder="Ej.: Tarragona → Reus, visita cliente" /></label>
        <label className="text-sm font-medium text-gray-700">Kilómetros<input inputMode="decimal" className={inp} value={f.km} onChange={e => setF({ ...f, km: e.target.value.replace(',', '.') })} /></label>
        <label className="text-sm font-medium text-gray-700">€ por km<input inputMode="decimal" className={inp} value={f.eurKm} onChange={e => setF({ ...f, eurKm: e.target.value.replace(',', '.') })} /></label>
        <label className="text-sm font-medium text-gray-700">Cliente (si aplica)<input className={inp} maxLength={200} value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} /></label>
        <label className="text-sm font-medium text-gray-700">Proyecto (si aplica)<input className={inp} maxLength={200} value={f.proyecto} onChange={e => setF({ ...f, proyecto: e.target.value })} /></label>
      </div>
      <p className="mt-4 text-sm text-gray-700">Importe: <strong>{eur(imp)}</strong></p>
      {Number(f.eurKm) > 0.26 && <p className="mt-1 text-xs text-amber-700">Por encima de 0,26 €/km el exceso tributa en nómina.</p>}
      {err && <p role="alert" className="mt-3 text-sm text-red-700">{err}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={() => guardar(false)} className="min-h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium">Guardar borrador</button>
        <button type="button" disabled={busy} onClick={() => guardar(true)} className="min-h-11 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white disabled:opacity-60">Enviar a revisión</button>
      </div>
    </Modal>
  );
}

function Editor({ gasto, cerrar }: { gasto: Gasto; cerrar: () => void }) {
  const editable = !gasto.cierreId && (gasto.estado === 'BORRADOR' || gasto.estado === 'ACLARACION');
  const [f, setF] = useState({
    fecha: gasto.fecha, concepto: gasto.concepto, categoria: gasto.categoria || '', comercio: gasto.comercio || '', cifComercio: gasto.cifComercio || '',
    importe: gasto.importe ? String(gasto.importe) : '', tipoIva: gasto.tipoIva === null ? '' : String(gasto.tipoIva), proyecto: gasto.proyecto || '', cliente: gasto.cliente || '',
    km: gasto.km ? String(gasto.km) : '', eurKm: gasto.eurKm ? String(gasto.eurKm) : '',
  });
  const [respuesta, setRespuesta] = useState('');
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [err, setErr] = useState(''); const [aviso, setAviso] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch(`/api/empleado/mis-gastos/${gasto.id}`).then(r => r.json()).then(d => setEventos(d.eventos || [])).catch(() => {}); }, [gasto.id]);
  const esKm = gasto.tipo === 'KILOMETRAJE';
  const body = () => esKm
    ? { fecha: f.fecha, concepto: f.concepto, km: Number(f.km), eurKm: Number(f.eurKm), proyecto: f.proyecto, cliente: f.cliente }
    : { fecha: f.fecha, concepto: f.concepto, categoria: f.categoria || null, comercio: f.comercio, cifComercio: f.cifComercio, importe: Number(f.importe), tipoIva: f.tipoIva === '' ? null : Number(f.tipoIva), proyecto: f.proyecto, cliente: f.cliente };
  async function guardar(enviar: boolean) {
    setErr(''); setAviso(''); setBusy(true);
    try {
      const p = await fetch(`/api/empleado/mis-gastos/${gasto.id}`, { method: 'PATCH', headers: J, body: JSON.stringify(body()) });
      const pd = await p.json(); if (!p.ok) throw new Error(pd.error || 'No se pudo guardar');
      if (!enviar) { if (pd.avisos?.length) { setAviso(pd.avisos.join(' ')); } else cerrar(); return; }
      const s = await fetch(`/api/empleado/mis-gastos/${gasto.id}`, { method: 'POST', headers: J, body: JSON.stringify({ accion: 'enviar', texto: respuesta }) });
      const sd = await s.json(); if (!s.ok) throw new Error(sd.error || 'No se pudo enviar');
      cerrar();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function borrar() {
    if (!confirm('¿Borrar este borrador?')) return;
    const r = await fetch(`/api/empleado/mis-gastos/${gasto.id}`, { method: 'DELETE' });
    if (r.ok) cerrar(); else setErr((await r.json()).error || 'No se pudo borrar');
  }
  const ocr = gasto.ocrEstado === 'OK' ? 'Leído automáticamente: comprueba que los datos coinciden con el ticket.' : gasto.ocrEstado === 'NO' ? '' : 'No se pudo leer el ticket automáticamente: rellena los datos a mano.';
  return (
    <Modal titulo={esKm ? 'Kilometraje' : 'Revisa tu ticket'} cerrar={cerrar}>
      <div className="mb-3 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO[gasto.estado].c}`}>{ESTADO[gasto.estado].t}</span>
        {gasto.tieneAdjunto && <a href={`/api/empleado/mis-gastos/${gasto.id}/adjunto`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-orange-700 underline"><ArrowUpTrayIcon className="h-4 w-4 rotate-180" />Ver ticket</a>}</div>
      {gasto.motivo && (gasto.estado === 'ACLARACION' || gasto.estado === 'RECHAZADO') && <p className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900"><strong>{gasto.estado === 'RECHAZADO' ? 'Motivo del rechazo:' : 'Te preguntan:'}</strong> {gasto.motivo}</p>}
      {editable && ocr && <p className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">{ocr}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">Fecha<input type="date" max={hoy()} disabled={!editable} className={inp} value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></label>
        {!esKm && <label className="text-sm font-medium text-gray-700">Categoría<select disabled={!editable} className={inp} value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })}><option value="">—</option>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select></label>}
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">Concepto<input disabled={!editable} maxLength={200} className={inp} value={f.concepto} onChange={e => setF({ ...f, concepto: e.target.value })} /></label>
        {esKm ? (<>
          <label className="text-sm font-medium text-gray-700">Kilómetros<input inputMode="decimal" disabled={!editable} className={inp} value={f.km} onChange={e => setF({ ...f, km: e.target.value.replace(',', '.') })} /></label>
          <label className="text-sm font-medium text-gray-700">€ por km<input inputMode="decimal" disabled={!editable} className={inp} value={f.eurKm} onChange={e => setF({ ...f, eurKm: e.target.value.replace(',', '.') })} /></label>
        </>) : (<>
          <label className="text-sm font-medium text-gray-700">Comercio<input disabled={!editable} maxLength={200} className={inp} value={f.comercio} onChange={e => setF({ ...f, comercio: e.target.value })} /></label>
          <label className="text-sm font-medium text-gray-700">CIF del comercio<input disabled={!editable} maxLength={40} className={inp} value={f.cifComercio} onChange={e => setF({ ...f, cifComercio: e.target.value })} /></label>
          <label className="text-sm font-medium text-gray-700">Importe total (con IVA) €<input inputMode="decimal" disabled={!editable} className={inp} value={f.importe} onChange={e => setF({ ...f, importe: e.target.value.replace(',', '.') })} /></label>
          <label className="text-sm font-medium text-gray-700">IVA<select disabled={!editable} className={inp} value={f.tipoIva} onChange={e => setF({ ...f, tipoIva: e.target.value })}><option value="">Sin indicar</option><option value="0">0 % (exento)</option><option value="4">4 %</option><option value="10">10 %</option><option value="21">21 %</option></select></label>
        </>)}
        <label className="text-sm font-medium text-gray-700">Cliente (si aplica)<input disabled={!editable} maxLength={200} className={inp} value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} /></label>
        <label className="text-sm font-medium text-gray-700">Proyecto (si aplica)<input disabled={!editable} maxLength={200} className={inp} value={f.proyecto} onChange={e => setF({ ...f, proyecto: e.target.value })} /></label>
      </div>
      {gasto.estado === 'ACLARACION' && <label className="mt-3 block text-sm font-medium text-gray-700">Tu aclaración<textarea className={inp + ' py-2'} rows={3} maxLength={1000} value={respuesta} onChange={e => setRespuesta(e.target.value)} /></label>}
      {aviso && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{aviso}</p>}
      {err && <p role="alert" className="mt-3 text-sm text-red-700">{err}</p>}
      {eventos.length > 0 && <details className="mt-4 text-sm text-gray-600"><summary className="cursor-pointer font-medium">Historial</summary><ul className="mt-2 space-y-1">{eventos.map(e => <li key={e.id}>{new Date(e.fecha).toLocaleString('es-ES')} · {e.accion.replace(/_/g, ' ').toLowerCase()}{e.texto ? ` — ${e.texto}` : ''}</li>)}</ul></details>}
      {editable && (
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {gasto.estado === 'BORRADOR' && <button type="button" disabled={busy} onClick={borrar} className="mr-auto min-h-11 rounded-lg px-4 text-sm font-medium text-red-600 hover:bg-red-50">Borrar</button>}
          <button type="button" disabled={busy} onClick={() => guardar(false)} className="min-h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium">Guardar</button>
          <button type="button" disabled={busy} onClick={() => guardar(true)} className="min-h-11 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white disabled:opacity-60">{gasto.estado === 'ACLARACION' ? 'Responder y reenviar' : 'Enviar a revisión'}</button>
        </div>
      )}
    </Modal>
  );
}
