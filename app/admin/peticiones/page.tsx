'use client';
import { useState, useEffect } from 'react';

interface Peticion {
  id: number; tipo: string; seccion: string; titulo: string; descripcion: string;
  prioridad: string; estado: string; captura: string | null; notasAdmin: string | null;
  usuarioEmail: string; usuarioNombre: string; resueltaPor: string | null;
  fechaResolucion: string | null; createdAt: string; updatedAt: string;
}

const ESTADOS = [
  { v: 'pendiente', l: 'Pendiente', c: 'bg-yellow-100 text-yellow-800' },
  { v: 'aprobada', l: 'Aprobada', c: 'bg-blue-100 text-blue-800' },
  { v: 'en_desarrollo', l: 'En desarrollo', c: 'bg-indigo-100 text-indigo-800' },
  { v: 'resuelta', l: 'Resuelta', c: 'bg-green-100 text-green-800' },
  { v: 'descartada', l: 'Descartada', c: 'bg-gray-100 text-gray-600' },
];
const TIPOS = [
  { v: 'error', l: 'Error', c: 'bg-red-100 text-red-800' },
  { v: 'mejora', l: 'Mejora', c: 'bg-blue-100 text-blue-800' },
  { v: 'sugerencia', l: 'Sugerencia', c: 'bg-green-100 text-green-800' },
];
const PRIORIDADES = [
  { v: 'baja', l: 'Baja', c: 'text-gray-500' },
  { v: 'media', l: 'Media', c: 'text-yellow-600' },
  { v: 'alta', l: 'Alta', c: 'text-orange-600' },
  { v: 'critica', l: 'Critica', c: 'text-red-600' },
];

export default function AdminPeticionesPage() {
  const [peticiones, setPeticiones] = useState<Peticion[]>([]);
  const [kpis, setKpis] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [detalle, setDetalle] = useState<Peticion | null>(null);
  const [notasEdit, setNotasEdit] = useState('');

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroEstado) params.set('estado', filtroEstado);
      if (filtroTipo) params.set('tipo', filtroTipo);
      const res = await fetch(`/api/admin/peticiones?${params}`);
      const data = await res.json();
      setPeticiones(data.peticiones || []);
      setKpis(data.kpis || {});
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, [filtroEstado, filtroTipo]);

  async function handleAction(action: string, id: number, extra?: any) {
    await fetch('/api/admin/peticiones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id, ...extra })
    });
    fetchData();
    if (detalle?.id === id) {
      const updated = peticiones.find(p => p.id === id);
      if (updated) setDetalle({ ...updated, ...(extra || {}) });
    }
  }

  async function handleGuardarNotas() {
    if (!detalle) return;
    await handleAction('notas_admin', detalle.id, { notas: notasEdit });
    setDetalle(d => d ? { ...d, notasAdmin: notasEdit } : null);
  }

  const estadoBadge = (e: string) => {
    const m = ESTADOS.find(s => s.v === e);
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m?.c || 'bg-gray-100'}`}>{m?.l || e}</span>;
  };
  const tipoBadge = (t: string) => {
    const m = TIPOS.find(s => s.v === t);
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m?.c || 'bg-gray-100'}`}>{m?.l || t}</span>;
  };
  const prioridadBadge = (p: string) => {
    const m = PRIORIDADES.find(s => s.v === p);
    return <span className={`text-xs font-semibold ${m?.c || 'text-gray-500'}`}>{m?.l || p}</span>;
  };
  const seccionLabel = (s: string) => {
    const map: Record<string, string> = { 'panel_admin': 'Panel Admin', 'web_publica': 'Web', 'portal_empleado': 'Portal' };
    return map[s] || s;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Peticiones y Mejoras</h1>
          <p className="text-gray-500 text-sm">Gestiona las peticiones del equipo</p>
        </div>
      </div>

      {/* KPIs */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-white border rounded-xl p-3 cursor-pointer hover:border-yellow-400" onClick={() => setFiltroEstado(filtroEstado === 'pendiente' ? '' : 'pendiente')}>
            <p className="text-xs text-gray-500">Pendientes</p>
            <p className="text-2xl font-bold text-yellow-600">{kpis.pendientes || 0}</p>
          </div>
          <div className="bg-white border rounded-xl p-3 cursor-pointer hover:border-blue-400" onClick={() => setFiltroEstado(filtroEstado === 'aprobada' ? '' : 'aprobada')}>
            <p className="text-xs text-gray-500">Aprobadas</p>
            <p className="text-2xl font-bold text-blue-600">{kpis.aprobadas || 0}</p>
          </div>
          <div className="bg-white border rounded-xl p-3 cursor-pointer hover:border-indigo-400" onClick={() => setFiltroEstado(filtroEstado === 'en_desarrollo' ? '' : 'en_desarrollo')}>
            <p className="text-xs text-gray-500">En desarrollo</p>
            <p className="text-2xl font-bold text-indigo-600">{kpis.enDesarrollo || 0}</p>
          </div>
          <div className="bg-white border rounded-xl p-3 cursor-pointer hover:border-green-400" onClick={() => setFiltroEstado(filtroEstado === 'resuelta' ? '' : 'resuelta')}>
            <p className="text-xs text-gray-500">Resueltas</p>
            <p className="text-2xl font-bold text-green-600">{kpis.resueltas || 0}</p>
          </div>
          <div className="bg-white border rounded-xl p-3">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-2xl font-bold text-gray-900">{kpis.total || 0}</p>
            <div className="flex gap-2 mt-1">
              <span className="text-xs text-red-500">{kpis.errores || 0} errores</span>
              <span className="text-xs text-blue-500">{kpis.mejoras || 0} mejoras</span>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">Estado</label>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="border rounded-lg px-3 py-2 text-sm text-gray-900">
            <option value="">Todos</option>
            {ESTADOS.map(e => <option key={e.v} value={e.v}>{e.l}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">Tipo</label>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm text-gray-900">
            <option value="">Todos</option>
            {TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>
        {(filtroEstado || filtroTipo) && (
          <button onClick={() => { setFiltroEstado(''); setFiltroTipo(''); }} className="mt-5 text-xs text-orange-600 hover:text-orange-800 font-medium">
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : peticiones.length === 0 ? (
        <div className="text-center py-16 bg-white border rounded-xl">
          <p className="text-gray-500">No hay peticiones con estos filtros</p>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Titulo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Usuario</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Seccion</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Prioridad</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {peticiones.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setDetalle(p); setNotasEdit(p.notasAdmin || ''); }}>
                  <td className="px-4 py-3 text-gray-400 text-xs">#{p.id}</td>
                  <td className="px-4 py-3">{tipoBadge(p.tipo)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{p.titulo}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{p.usuarioNombre}</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">{seccionLabel(p.seccion)}</td>
                  <td className="px-4 py-3 text-center">{prioridadBadge(p.prioridad)}</td>
                  <td className="px-4 py-3 text-center">{estadoBadge(p.estado)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(p.createdAt).toLocaleDateString('es-ES')}</td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <select
                      value={p.estado}
                      onChange={e => handleAction('cambiar_estado', p.id, { estado: e.target.value })}
                      className="text-xs border rounded px-1 py-0.5 text-gray-700"
                    >
                      {ESTADOS.map(e => <option key={e.v} value={e.v}>{e.l}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal detalle */}
      {detalle && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetalle(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {tipoBadge(detalle.tipo)}
                  {estadoBadge(detalle.estado)}
                  {prioridadBadge(detalle.prioridad)}
                  <span className="text-xs text-gray-400">{seccionLabel(detalle.seccion)}</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900">#{detalle.id} — {detalle.titulo}</h2>
                <p className="text-sm text-gray-500 mt-1">Por {detalle.usuarioNombre} el {new Date(detalle.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
              </div>
              <button onClick={() => setDetalle(null)} className="text-gray-400 hover:text-gray-600 text-xl">X</button>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{detalle.descripcion}</p>
            </div>

            {detalle.captura && (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Captura adjunta:</p>
                <img src={detalle.captura} alt="Captura" className="max-h-64 rounded-lg border cursor-pointer" onClick={() => window.open(detalle.captura!, '_blank')} />
              </div>
            )}

            {/* Cambiar estado y prioridad */}
            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Estado</label>
                <select value={detalle.estado} onChange={e => { handleAction('cambiar_estado', detalle.id, { estado: e.target.value }); setDetalle(d => d ? { ...d, estado: e.target.value } : null); }} className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900">
                  {ESTADOS.map(e => <option key={e.v} value={e.v}>{e.l}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Prioridad</label>
                <select value={detalle.prioridad} onChange={e => { handleAction('cambiar_prioridad', detalle.id, { prioridad: e.target.value }); setDetalle(d => d ? { ...d, prioridad: e.target.value } : null); }} className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900">
                  {PRIORIDADES.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
                </select>
              </div>
            </div>

            {/* Notas admin */}
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Notas / Respuesta al usuario</label>
              <textarea value={notasEdit} onChange={e => setNotasEdit(e.target.value)} rows={3}
                placeholder="Escribe una nota o respuesta que el usuario podra ver..."
                className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
              <button onClick={handleGuardarNotas} className="mt-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                Guardar notas
              </button>
            </div>

            {detalle.resueltaPor && (
              <div className="bg-green-50 rounded-lg p-3 text-sm text-green-800">
                Resuelta por <strong>{detalle.resueltaPor}</strong> el {detalle.fechaResolucion ? new Date(detalle.fechaResolucion).toLocaleDateString('es-ES') : '-'}
              </div>
            )}

            {/* Eliminar */}
            <div className="mt-4 pt-4 border-t flex justify-end">
              <button onClick={() => { if (confirm('Eliminar esta peticion?')) { handleAction('eliminar', detalle.id); setDetalle(null); } }}
                className="text-xs text-red-500 hover:text-red-700">Eliminar peticion</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
