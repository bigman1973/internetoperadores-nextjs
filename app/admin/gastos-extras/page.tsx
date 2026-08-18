'use client';
import { useState, useEffect } from 'react';

interface Gasto {
  id: number; nombre: string; fecha: string; motivo: string; tipo: string;
  importe: number; estado: string; gestionadoPor: string | null; fechaSolicitud: string | null;
  empleado?: { id: string; nombreCompleto: string; departamento: string | null };
}
interface Extra {
  id: number; nombre: string; inicio: string; fin: string; totalMinutos: number;
  estado: string; gestionadoPor: string | null; fechaSolicitud: string | null;
  empleado?: { id: string; nombreCompleto: string; departamento: string | null };
}

export default function GastosExtrasPage() {
  const [tab, setTab] = useState<'gastos' | 'extras'>('gastos');
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [kpis, setKpis] = useState<any>({});
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [mes, setMes] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);

  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tipo: tab, anio: anio.toString() });
      if (mes) params.set('mes', mes.toString());
      const res = await fetch(`/api/admin/gastos-extras?${params}`);
      const data = await res.json();
      if (tab === 'gastos') { setGastos(data.gastos || []); }
      else { setExtras(data.extras || []); }
      setKpis(data.kpis || {});
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, [tab, anio, mes]);

  async function handleAction(action: string, id: number) {
    if (!confirm('Confirmar accion?')) return;
    await fetch('/api/admin/gastos-extras', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id })
    });
    fetchData();
  }

  const estadoBadge = (e: string) => {
    const colors: Record<string, string> = {
      'en_tramite': 'bg-yellow-100 text-yellow-800',
      'aprobado': 'bg-green-100 text-green-800', 'aprobada': 'bg-green-100 text-green-800',
      'denegado': 'bg-red-100 text-red-800', 'denegada': 'bg-red-100 text-red-800',
      'completada': 'bg-blue-100 text-blue-800',
    };
    const labels: Record<string, string> = {
      'en_tramite': 'En tramite', 'aprobado': 'Aprobado', 'aprobada': 'Aprobada',
      'denegado': 'Denegado', 'denegada': 'Denegada', 'completada': 'Completada',
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[e] || 'bg-gray-100 text-gray-800'}`}>{labels[e] || e}</span>;
  };

  const formatMin = (m: number) => `${Math.floor(m/60)}h ${m%60}m`;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gastos y Horas Extra</h1>
          <p className="text-gray-500 text-sm">Control de gastos y horas extra importados desde HRLog</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('gastos')} className={`px-4 py-2 rounded-lg font-medium text-sm ${tab === 'gastos' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
          Gastos
        </button>
        <button onClick={() => setTab('extras')} className={`px-4 py-2 rounded-lg font-medium text-sm ${tab === 'extras' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
          Horas Extra
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4 items-center">
        <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm text-gray-900">
          <option value={2026}>2026</option>
          <option value={2025}>2025</option>
        </select>
        <select value={mes} onChange={e => setMes(e.target.value ? Number(e.target.value) : '')} className="border rounded-lg px-3 py-2 text-sm text-gray-900">
          <option value="">Todo el anio</option>
          {meses.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
      </div>

      {/* KPIs */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {tab === 'gastos' ? (<>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-sm text-gray-500">Total gastos</p>
              <p className="text-2xl font-bold text-gray-900">{kpis.total || 0}</p>
            </div>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-sm text-gray-500">Importe total</p>
              <p className="text-2xl font-bold text-green-600">{(kpis.totalImporte || 0).toFixed(2)} EUR</p>
            </div>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-sm text-gray-500">Pendientes</p>
              <p className="text-2xl font-bold text-yellow-600">{kpis.pendientes || 0}</p>
            </div>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-sm text-gray-500">Aprobados</p>
              <p className="text-2xl font-bold text-blue-600">{kpis.aprobados || 0}</p>
            </div>
          </>) : (<>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-sm text-gray-500">Total registros</p>
              <p className="text-2xl font-bold text-gray-900">{kpis.total || 0}</p>
            </div>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-sm text-gray-500">Horas extra totales</p>
              <p className="text-2xl font-bold text-indigo-600">{kpis.totalHoras || '0h 0m'}</p>
            </div>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-sm text-gray-500">Pendientes</p>
              <p className="text-2xl font-bold text-yellow-600">{kpis.pendientes || 0}</p>
            </div>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-sm text-gray-500">Aprobadas</p>
              <p className="text-2xl font-bold text-blue-600">{kpis.aprobados || 0}</p>
            </div>
          </>)}
        </div>
      )}

      {/* Desglose por empleado */}
      {!loading && kpis.porEmpleado && kpis.porEmpleado.length > 0 && (
        <div className="bg-white border rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Por empleado</h3>
          <div className="space-y-2">
            {kpis.porEmpleado.map((e: any, i: number) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{e.nombre}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{e.count} registros</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {tab === 'gastos' ? `${e.total.toFixed(2)} EUR` : formatMin(e.totalMin)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : tab === 'gastos' ? (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Empleado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Motivo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Importe</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Gestionado por</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {gastos.map(g => (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{g.empleado?.nombreCompleto || g.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{new Date(g.fecha).toLocaleDateString('es-ES')}</td>
                  <td className="px-4 py-3 text-gray-600">{g.motivo}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{g.tipo}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{g.importe.toFixed(2)} EUR</td>
                  <td className="px-4 py-3 text-center">{estadoBadge(g.estado)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{g.gestionadoPor || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    {g.estado === 'en_tramite' && (
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => handleAction('aprobar_gasto', g.id)} className="text-green-600 hover:text-green-800 text-xs font-medium">Aprobar</button>
                        <button onClick={() => handleAction('denegar_gasto', g.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Denegar</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {gastos.length === 0 && <div className="text-center py-8 text-gray-500">No hay gastos en este periodo</div>}
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Empleado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Inicio</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Fin</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Gestionado por</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {extras.map(h => (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{h.empleado?.nombreCompleto || h.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{new Date(h.inicio).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-3 text-gray-600">{new Date(h.fin).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMin(h.totalMinutos)}</td>
                  <td className="px-4 py-3 text-center">{estadoBadge(h.estado)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{h.gestionadoPor || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    {h.estado === 'en_tramite' && (
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => handleAction('aprobar_extra', h.id)} className="text-green-600 hover:text-green-800 text-xs font-medium">Aprobar</button>
                        <button onClick={() => handleAction('denegar_extra', h.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Denegar</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {extras.length === 0 && <div className="text-center py-8 text-gray-500">No hay horas extra en este periodo</div>}
        </div>
      )}
    </div>
  );
}
