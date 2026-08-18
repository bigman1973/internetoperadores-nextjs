'use client';
import { useState, useEffect, useCallback } from 'react';

interface Documento {
  id: number; organismo: string; categoria: string; titulo: string;
  descripcion: string | null; expediente: string | null;
  fechaDocumento: string; fechaNotificacion: string | null;
  fechaLimite: string | null; importe: number | null;
  estado: string; ejercicio: number | null; nombreArchivo: string | null;
  notas: string | null; createdAt: string;
}
interface Obligacion {
  id: number; organismo: string; nombre: string; descripcion: string | null;
  periodicidad: string; mesVencimiento: number | null; diaVencimiento: number | null;
  ejercicioActual: number | null; estadoActual: string;
  importeEstimado: number | null; notas: string | null; activa: boolean;
}

const CATEGORIAS = [
  { value: 'tasa_tgo', label: 'Tasa General Operadores (TGO)' },
  { value: 'declaracion_ibe', label: 'Declaracion IBE' },
  { value: 'requerimiento', label: 'Requerimiento' },
  { value: 'resolucion', label: 'Resolucion' },
  { value: 'subasignacion', label: 'Subasignacion numeracion' },
  { value: 'cambio_datos', label: 'Cambio de datos' },
  { value: 'pago', label: 'Pago / Recargo' },
  { value: 'recargo', label: 'Recargo ejecutivo' },
  { value: 'comunicacion', label: 'Comunicacion' },
  { value: 'otro', label: 'Otro' }
];
const ESTADOS = [
  { value: 'pendiente', label: 'Pendiente', color: 'bg-amber-100 text-amber-800' },
  { value: 'presentado', label: 'Presentado', color: 'bg-blue-100 text-blue-800' },
  { value: 'pagado', label: 'Pagado', color: 'bg-green-100 text-green-800' },
  { value: 'alegado', label: 'Alegado', color: 'bg-purple-100 text-purple-800' },
  { value: 'resuelto', label: 'Resuelto', color: 'bg-gray-100 text-gray-800' },
  { value: 'vencido', label: 'Vencido', color: 'bg-red-100 text-red-800' }
];
const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmtDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtMoney(n: number | null) {
  if (n === null || n === undefined) return '-';
  return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20ac';
}
function estadoBadge(estado: string) {
  const e = ESTADOS.find(s => s.value === estado);
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e?.color || 'bg-gray-100 text-gray-600'}`}>{e?.label || estado}</span>;
}
function catLabel(cat: string) {
  return CATEGORIAS.find(c => c.value === cat)?.label || cat;
}

export default function CNMCPage() {
  const [tab, setTab] = useState<'documentos'|'obligaciones'|'calendario'>('documentos');
  const [docs, setDocs] = useState<Documento[]>([]);
  const [obls, setObls] = useState<Obligacion[]>([]);
  const [resumen, setResumen] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filtroEjercicio, setFiltroEjercicio] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editDoc, setEditDoc] = useState<Documento | null>(null);
  const [form, setForm] = useState({ titulo: '', descripcion: '', expediente: '', fechaDocumento: new Date().toISOString().split('T')[0], fechaNotificacion: '', fechaLimite: '', importe: '', estado: 'pendiente', ejercicio: '', categoria: 'otro', notas: '', archivoPdf: '', nombreArchivo: '' });
  const [showOblForm, setShowOblForm] = useState(false);
  const [oblForm, setOblForm] = useState({ nombre: '', descripcion: '', periodicidad: 'anual', mesVencimiento: '', diaVencimiento: '', ejercicioActual: '', estadoActual: 'pendiente', importeEstimado: '', notas: '' });
  const [selectedDoc, setSelectedDoc] = useState<Documento | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ organismo: 'cnmc' });
      if (filtroEjercicio) params.set('ejercicio', filtroEjercicio);
      if (filtroEstado) params.set('estado', filtroEstado);
      if (filtroCategoria) params.set('categoria', filtroCategoria);
      const [docsRes, oblsRes, resRes] = await Promise.all([
        fetch(`/api/admin/aapp?action=documentos&${params}`),
        fetch('/api/admin/aapp?action=obligaciones&organismo=cnmc'),
        fetch('/api/admin/aapp?action=resumen&organismo=cnmc')
      ]);
      const docsData = await docsRes.json();
      const oblsData = await oblsRes.json();
      const resData = await resRes.json();
      setDocs(docsData.documentos || []);
      setObls(oblsData.obligaciones || []);
      setResumen(resData);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filtroEjercicio, filtroEstado, filtroCategoria]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveDoc = async () => {
    const action = editDoc ? 'actualizar_documento' : 'crear_documento';
    const payload: any = { action, organismo: 'cnmc', ...form };
    if (editDoc) payload.id = editDoc.id;
    if (!payload.archivoPdf) delete payload.archivoPdf;
    const res = await fetch('/api/admin/aapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) { setShowForm(false); setEditDoc(null); fetchData(); }
    else { const err = await res.json(); alert(err.error); }
  };

  const handleDeleteDoc = async (id: number) => {
    if (!confirm('Eliminar este documento?')) return;
    await fetch('/api/admin/aapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'eliminar_documento', id }) });
    fetchData();
  };

  const handleChangeEstado = async (id: number, estado: string) => {
    await fetch('/api/admin/aapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'actualizar_documento', id, estado }) });
    fetchData();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm(f => ({ ...f, archivoPdf: reader.result as string, nombreArchivo: file.name }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveObl = async () => {
    const res = await fetch('/api/admin/aapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'crear_obligacion', organismo: 'cnmc', ...oblForm }) });
    if (res.ok) { setShowOblForm(false); setOblForm({ nombre: '', descripcion: '', periodicidad: 'anual', mesVencimiento: '', diaVencimiento: '', ejercicioActual: '', estadoActual: 'pendiente', importeEstimado: '', notas: '' }); fetchData(); }
  };

  const openEdit = (doc: Documento) => {
    setEditDoc(doc);
    setForm({
      titulo: doc.titulo, descripcion: doc.descripcion || '', expediente: doc.expediente || '',
      fechaDocumento: doc.fechaDocumento?.split('T')[0] || '', fechaNotificacion: doc.fechaNotificacion?.split('T')[0] || '',
      fechaLimite: doc.fechaLimite?.split('T')[0] || '', importe: doc.importe !== null ? String(Number(doc.importe)) : '',
      estado: doc.estado, ejercicio: doc.ejercicio ? String(doc.ejercicio) : '', categoria: doc.categoria,
      notas: doc.notas || '', archivoPdf: '', nombreArchivo: doc.nombreArchivo || ''
    });
    setShowForm(true);
  };

  const openNew = () => {
    setEditDoc(null);
    setForm({ titulo: '', descripcion: '', expediente: '', fechaDocumento: new Date().toISOString().split('T')[0], fechaNotificacion: '', fechaLimite: '', importe: '', estado: 'pendiente', ejercicio: '', categoria: 'otro', notas: '', archivoPdf: '', nombreArchivo: '' });
    setShowForm(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AAPP - CNMC</h1>
          <p className="text-sm text-gray-500">Gestion documental y obligaciones con la Comision Nacional de los Mercados y la Competencia</p>
        </div>
        <button onClick={openNew} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">+ Nuevo documento</button>
      </div>

      {/* KPIs */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white border rounded-lg p-4">
            <p className="text-2xl font-bold text-gray-900">{resumen.totalDocs}</p>
            <p className="text-xs text-gray-500">Documentos</p>
          </div>
          <div className="bg-white border rounded-lg p-4 cursor-pointer hover:border-amber-400" onClick={() => { setFiltroEstado('pendiente'); }}>
            <p className="text-2xl font-bold text-amber-600">{resumen.pendientes}</p>
            <p className="text-xs text-gray-500">Pendientes</p>
          </div>
          <div className="bg-white border rounded-lg p-4 cursor-pointer hover:border-green-400" onClick={() => { setFiltroEstado('pagado'); }}>
            <p className="text-2xl font-bold text-green-600">{resumen.pagados}</p>
            <p className="text-xs text-gray-500">Pagados</p>
          </div>
          <div className="bg-white border rounded-lg p-4 cursor-pointer hover:border-red-400" onClick={() => { setFiltroEstado('vencido'); }}>
            <p className="text-2xl font-bold text-red-600">{resumen.vencidos}</p>
            <p className="text-xs text-gray-500">Vencidos</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-2xl font-bold text-indigo-600">{fmtMoney(resumen.importePendiente)}</p>
            <p className="text-xs text-gray-500">Importe pendiente</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['documentos','obligaciones','calendario'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {t === 'documentos' ? 'Documentos' : t === 'obligaciones' ? 'Obligaciones' : 'Calendario'}
          </button>
        ))}
      </div>

      {/* DOCUMENTOS */}
      {tab === 'documentos' && (
        <div>
          {/* Filtros */}
          <div className="flex flex-wrap gap-3 mb-4">
            <select value={filtroEjercicio} onChange={e => setFiltroEjercicio(e.target.value)} className="border rounded-lg px-3 py-2 text-sm text-gray-900">
              <option value="">Todos los ejercicios</option>
              {[2026,2025,2024,2023,2022,2021,2020].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="border rounded-lg px-3 py-2 text-sm text-gray-900">
              <option value="">Todos los estados</option>
              {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} className="border rounded-lg px-3 py-2 text-sm text-gray-900">
              <option value="">Todas las categorias</option>
              {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {(filtroEjercicio || filtroEstado || filtroCategoria) && (
              <button onClick={() => { setFiltroEjercicio(''); setFiltroEstado(''); setFiltroCategoria(''); }} className="text-sm text-red-600 hover:text-red-800">Limpiar filtros</button>
            )}
          </div>

          {loading ? <p className="text-gray-500">Cargando...</p> : (
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Titulo</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Categoria</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Ejercicio</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Expediente</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Importe</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">PDF</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {docs.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedDoc(d)}>
                      <td className="px-4 py-3 text-gray-900">{fmtDate(d.fechaDocumento)}</td>
                      <td className="px-4 py-3 text-gray-900 max-w-xs truncate">{d.titulo}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{catLabel(d.categoria)}</td>
                      <td className="px-4 py-3 text-gray-600">{d.ejercicio || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{d.expediente || '-'}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{fmtMoney(d.importe)}</td>
                      <td className="px-4 py-3 text-center">
                        <select value={d.estado} onClick={e => e.stopPropagation()} onChange={e => handleChangeEstado(d.id, e.target.value)} className="text-xs border rounded px-1 py-0.5">
                          {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        {d.nombreArchivo ? (
                          <a href={`/api/admin/aapp?action=pdf&id=${d.id}`} target="_blank" rel="noopener" className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Ver</a>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => openEdit(d)} className="text-blue-600 hover:text-blue-800" title="Editar">&#9998;</button>
                          <button onClick={() => handleDeleteDoc(d.id)} className="text-red-600 hover:text-red-800" title="Eliminar">&#128465;</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {docs.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No hay documentos</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* OBLIGACIONES */}
      {tab === 'obligaciones' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowOblForm(true)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">+ Nueva obligacion</button>
          </div>
          <div className="grid gap-4">
            {obls.map(o => (
              <div key={o.id} className="bg-white border rounded-lg p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{o.nombre}</h3>
                    <p className="text-sm text-gray-500 mt-1">{o.descripcion}</p>
                    <div className="flex gap-4 mt-3 text-sm">
                      <span className="text-gray-600">Periodicidad: <strong>{o.periodicidad}</strong></span>
                      {o.mesVencimiento && <span className="text-gray-600">Vencimiento: <strong>{o.diaVencimiento || '30'} de {MESES[o.mesVencimiento]}</strong></span>}
                      {o.importeEstimado && <span className="text-gray-600">Importe estimado: <strong>{fmtMoney(Number(o.importeEstimado))}</strong></span>}
                    </div>
                    {o.notas && <p className="text-xs text-gray-400 mt-2">{o.notas}</p>}
                  </div>
                  <div className="text-right">
                    {estadoBadge(o.estadoActual)}
                    {o.ejercicioActual && <p className="text-xs text-gray-400 mt-1">Ejercicio {o.ejercicioActual}</p>}
                  </div>
                </div>
              </div>
            ))}
            {obls.length === 0 && <p className="text-center text-gray-400 py-8">No hay obligaciones configuradas</p>}
          </div>
        </div>
      )}

      {/* CALENDARIO */}
      {tab === 'calendario' && (
        <div className="bg-white border rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Calendario de obligaciones CNMC</h3>
          <div className="space-y-3">
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(mes => {
              const oblsMes = obls.filter(o => o.mesVencimiento === mes);
              const docsMes = docs.filter(d => {
                const fl = d.fechaLimite ? new Date(d.fechaLimite).getMonth() + 1 : null;
                return fl === mes;
              });
              if (oblsMes.length === 0 && docsMes.length === 0) return null;
              return (
                <div key={mes} className="border rounded-lg p-4">
                  <h4 className="font-medium text-indigo-700 mb-2">{MESES[mes]}</h4>
                  {oblsMes.map(o => (
                    <div key={o.id} className="flex items-center gap-3 text-sm py-1">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      <span className="text-gray-700">{o.nombre}</span>
                      <span className="text-gray-400">- Dia {o.diaVencimiento || 30}</span>
                      {estadoBadge(o.estadoActual)}
                    </div>
                  ))}
                  {docsMes.map(d => (
                    <div key={d.id} className="flex items-center gap-3 text-sm py-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span className="text-gray-700">{d.titulo}</span>
                      <span className="text-gray-400">- {fmtDate(d.fechaLimite)}</span>
                      {estadoBadge(d.estado)}
                    </div>
                  ))}
                </div>
              );
            })}
            {obls.length === 0 && docs.filter(d => d.fechaLimite).length === 0 && (
              <p className="text-center text-gray-400 py-8">No hay obligaciones con fecha de vencimiento</p>
            )}
          </div>
        </div>
      )}

      {/* MODAL DETALLE DOCUMENTO */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedDoc(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selectedDoc.titulo}</h2>
                <p className="text-sm text-gray-500">{catLabel(selectedDoc.categoria)}</p>
              </div>
              <button onClick={() => setSelectedDoc(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-gray-500">Fecha documento:</span> <strong>{fmtDate(selectedDoc.fechaDocumento)}</strong></div>
                <div><span className="text-gray-500">Ejercicio:</span> <strong>{selectedDoc.ejercicio || '-'}</strong></div>
                <div><span className="text-gray-500">Notificacion:</span> <strong>{fmtDate(selectedDoc.fechaNotificacion)}</strong></div>
                <div><span className="text-gray-500">Fecha limite:</span> <strong className={selectedDoc.fechaLimite && new Date(selectedDoc.fechaLimite) < new Date() ? 'text-red-600' : ''}>{fmtDate(selectedDoc.fechaLimite)}</strong></div>
                <div><span className="text-gray-500">Expediente:</span> <strong>{selectedDoc.expediente || '-'}</strong></div>
                <div><span className="text-gray-500">Importe:</span> <strong>{fmtMoney(selectedDoc.importe)}</strong></div>
              </div>
              <div><span className="text-gray-500">Estado:</span> {estadoBadge(selectedDoc.estado)}</div>
              {selectedDoc.descripcion && <div><span className="text-gray-500">Descripcion:</span><p className="mt-1 text-gray-700">{selectedDoc.descripcion}</p></div>}
              {selectedDoc.notas && <div className="bg-amber-50 border border-amber-200 rounded p-3"><span className="text-amber-700 font-medium">Notas:</span><p className="mt-1 text-amber-800">{selectedDoc.notas}</p></div>}
              {selectedDoc.nombreArchivo && (
                <div className="pt-2">
                  <a href={`/api/admin/aapp?action=pdf&id=${selectedDoc.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">Ver PDF: {selectedDoc.nombreArchivo}</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL FORMULARIO DOCUMENTO */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{editDoc ? 'Editar documento' : 'Nuevo documento'}</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="col-span-2"><label className="block text-gray-600 mb-1">Titulo *</label><input value={form.titulo} onChange={e => setForm(f => ({...f, titulo: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900" /></div>
              <div><label className="block text-gray-600 mb-1">Categoria</label><select value={form.categoria} onChange={e => setForm(f => ({...f, categoria: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900">{CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
              <div><label className="block text-gray-600 mb-1">Estado</label><select value={form.estado} onChange={e => setForm(f => ({...f, estado: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900">{ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}</select></div>
              <div><label className="block text-gray-600 mb-1">Fecha documento *</label><input type="date" value={form.fechaDocumento} onChange={e => setForm(f => ({...f, fechaDocumento: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900" /></div>
              <div><label className="block text-gray-600 mb-1">Ejercicio</label><input type="number" value={form.ejercicio} onChange={e => setForm(f => ({...f, ejercicio: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900" placeholder="2024" /></div>
              <div><label className="block text-gray-600 mb-1">Fecha notificacion</label><input type="date" value={form.fechaNotificacion} onChange={e => setForm(f => ({...f, fechaNotificacion: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900" /></div>
              <div><label className="block text-gray-600 mb-1">Fecha limite</label><input type="date" value={form.fechaLimite} onChange={e => setForm(f => ({...f, fechaLimite: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900" /></div>
              <div><label className="block text-gray-600 mb-1">Expediente</label><input value={form.expediente} onChange={e => setForm(f => ({...f, expediente: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900" /></div>
              <div><label className="block text-gray-600 mb-1">Importe</label><input type="number" step="0.01" value={form.importe} onChange={e => setForm(f => ({...f, importe: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900" /></div>
              <div className="col-span-2"><label className="block text-gray-600 mb-1">Descripcion</label><textarea value={form.descripcion} onChange={e => setForm(f => ({...f, descripcion: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900" rows={3} /></div>
              <div className="col-span-2"><label className="block text-gray-600 mb-1">Notas internas</label><textarea value={form.notas} onChange={e => setForm(f => ({...f, notas: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900" rows={2} /></div>
              <div className="col-span-2"><label className="block text-gray-600 mb-1">Adjuntar PDF</label><input type="file" accept=".pdf" onChange={handleFileUpload} className="w-full text-sm" />{form.nombreArchivo && <p className="text-xs text-green-600 mt-1">Archivo: {form.nombreArchivo}</p>}</div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => { setShowForm(false); setEditDoc(null); }} className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSaveDoc} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{editDoc ? 'Guardar' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FORMULARIO OBLIGACION */}
      {showOblForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Nueva obligacion</h2>
            <div className="space-y-3 text-sm">
              <div><label className="block text-gray-600 mb-1">Nombre *</label><input value={oblForm.nombre} onChange={e => setOblForm(f => ({...f, nombre: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900" /></div>
              <div><label className="block text-gray-600 mb-1">Descripcion</label><textarea value={oblForm.descripcion} onChange={e => setOblForm(f => ({...f, descripcion: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900" rows={2} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-gray-600 mb-1">Periodicidad</label><select value={oblForm.periodicidad} onChange={e => setOblForm(f => ({...f, periodicidad: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900"><option value="anual">Anual</option><option value="trimestral">Trimestral</option><option value="mensual">Mensual</option><option value="puntual">Puntual</option></select></div>
                <div><label className="block text-gray-600 mb-1">Mes vencimiento</label><select value={oblForm.mesVencimiento} onChange={e => setOblForm(f => ({...f, mesVencimiento: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900"><option value="">-</option>{MESES.slice(1).map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}</select></div>
                <div><label className="block text-gray-600 mb-1">Dia</label><input type="number" min="1" max="31" value={oblForm.diaVencimiento} onChange={e => setOblForm(f => ({...f, diaVencimiento: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-gray-600 mb-1">Importe estimado</label><input type="number" step="0.01" value={oblForm.importeEstimado} onChange={e => setOblForm(f => ({...f, importeEstimado: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900" /></div>
                <div><label className="block text-gray-600 mb-1">Ejercicio actual</label><input type="number" value={oblForm.ejercicioActual} onChange={e => setOblForm(f => ({...f, ejercicioActual: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900" /></div>
              </div>
              <div><label className="block text-gray-600 mb-1">Notas</label><textarea value={oblForm.notas} onChange={e => setOblForm(f => ({...f, notas: e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-gray-900" rows={2} /></div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setShowOblForm(false)} className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSaveObl} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
