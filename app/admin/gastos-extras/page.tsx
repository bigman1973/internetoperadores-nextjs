'use client';
import { useState, useEffect, useMemo } from 'react';

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
  const [filtroEmpleado, setFiltroEmpleado] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState('');

  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

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

  // Filtrado local
  const gastosFiltrados = useMemo(() => {
    let result = gastos;
    if (filtroEmpleado) result = result.filter(g => (g.empleado?.nombreCompleto || g.nombre) === filtroEmpleado);
    if (filtroEstado) result = result.filter(g => g.estado === filtroEstado);
    if (filtroTipo) result = result.filter(g => g.tipo === filtroTipo);
    return result;
  }, [gastos, filtroEmpleado, filtroEstado, filtroTipo]);

  const extrasFiltrados = useMemo(() => {
    let result = extras;
    if (filtroEmpleado) result = result.filter(h => (h.empleado?.nombreCompleto || h.nombre) === filtroEmpleado);
    if (filtroEstado) result = result.filter(h => h.estado === filtroEstado);
    return result;
  }, [extras, filtroEmpleado, filtroEstado]);

  // Listas para filtros
  const empleadosUnicos = useMemo(() => {
    const names = tab === 'gastos'
      ? gastos.map(g => g.empleado?.nombreCompleto || g.nombre)
      : extras.map(h => h.empleado?.nombreCompleto || h.nombre);
    return [...new Set(names)].sort();
  }, [gastos, extras, tab]);

  const tiposUnicos = useMemo(() => {
    return [...new Set(gastos.map(g => g.tipo))].sort();
  }, [gastos]);

  const estadosUnicos = useMemo(() => {
    const items = tab === 'gastos' ? gastos : extras;
    return [...new Set(items.map(i => i.estado))].sort();
  }, [gastos, extras, tab]);

  // KPIs filtrados
  const kpisFiltrados = useMemo(() => {
    if (tab === 'gastos') {
      const items = gastosFiltrados;
      const totalImporte = items.reduce((s, g) => s + g.importe, 0);
      const visaEmpresa = items.filter(g => g.tipo.toLowerCase().includes('visa')).reduce((s, g) => s + g.importe, 0);
      const pendienteNomina = items.filter(g => !g.tipo.toLowerCase().includes('visa')).reduce((s, g) => s + g.importe, 0);
      return {
        total: items.length,
        totalImporte: Math.round(totalImporte * 100) / 100,
        pendientes: items.filter(g => g.estado === 'en_tramite').length,
        aprobados: items.filter(g => g.estado === 'aprobado').length,
        visaEmpresa: Math.round(visaEmpresa * 100) / 100,
        pendienteNomina: Math.round(pendienteNomina * 100) / 100,
      };
    } else {
      const items = extrasFiltrados;
      const totalMin = items.reduce((s, h) => s + h.totalMinutos, 0);
      return {
        total: items.length,
        totalMinutos: totalMin,
        totalHoras: `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`,
        pendientes: items.filter(h => h.estado === 'en_tramite').length,
        aprobados: items.filter(h => ['aprobada', 'aprobado'].includes(h.estado)).length,
      };
    }
  }, [gastosFiltrados, extrasFiltrados, tab]);

  async function handleAction(action: string, id: number) {
    if (!confirm('Confirmar accion?')) return;
    await fetch('/api/admin/gastos-extras', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id })
    });
    fetchData();
  }

  async function handleSync(tipo: 'gastos' | 'extras') {
    setSyncing(tipo);
    setSyncMsg('Conectando con HRLog...');
    try {
      const res = await fetch('/api/admin/gastos-extras', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: `sync_${tipo}`, anio })
      });
      const data = await res.json();
      if (data.success) {
        setSyncMsg(`Sincronizado: ${data.importados || 0} registros importados/actualizados`);
        fetchData();
      } else {
        setSyncMsg(`Error: ${data.error || 'Error desconocido'}`);
      }
    } catch (e: any) {
      setSyncMsg(`Error de conexion: ${e.message}`);
    }
    setTimeout(() => { setSyncing(null); setSyncMsg(''); }, 4000);
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

  const tipoBadge = (tipo: string) => {
    const esVisa = tipo.toLowerCase().includes('visa');
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${esVisa ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
        {esVisa ? 'VISA Empresa' : tipo}
      </span>
    );
  };

  const formatMin = (m: number) => `${Math.floor(m/60)}h ${m%60}m`;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gastos y Horas Extra</h1>
          <p className="text-gray-500 text-sm">Control de gastos y horas extra importados desde HRLog</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleSync('gastos')}
            disabled={!!syncing}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            {syncing === 'gastos' ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            )}
            Sincronizar Gastos
          </button>
          <button
            onClick={() => handleSync('extras')}
            disabled={!!syncing}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
          >
            {syncing === 'extras' ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
            Sincronizar Extras
          </button>
        </div>
      </div>

      {/* Sync message */}
      {syncMsg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${syncMsg.includes('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {syncMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => { setTab('gastos'); setFiltroEmpleado(''); setFiltroEstado(''); setFiltroTipo(''); }} className={`px-4 py-2 rounded-lg font-medium text-sm ${tab === 'gastos' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
          Gastos ({gastos.length})
        </button>
        <button onClick={() => { setTab('extras'); setFiltroEmpleado(''); setFiltroEstado(''); setFiltroTipo(''); }} className={`px-4 py-2 rounded-lg font-medium text-sm ${tab === 'extras' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
          Horas Extra ({extras.length})
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">{"A\u00f1o"}</label>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm text-gray-900">
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">Mes</label>
          <select value={mes} onChange={e => setMes(e.target.value ? Number(e.target.value) : '')} className="border rounded-lg px-3 py-2 text-sm text-gray-900">
            <option value="">{"Todo el a\u00f1o"}</option>
            {meses.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">Empleado</label>
          <select value={filtroEmpleado} onChange={e => setFiltroEmpleado(e.target.value)} className="border rounded-lg px-3 py-2 text-sm text-gray-900">
            <option value="">Todos</option>
            {empleadosUnicos.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">Estado</label>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="border rounded-lg px-3 py-2 text-sm text-gray-900">
            <option value="">Todos</option>
            {estadosUnicos.map(e => <option key={e} value={e}>{e === 'en_tramite' ? 'En tramite' : e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
          </select>
        </div>
        {tab === 'gastos' && (
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">Tipo pago</label>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm text-gray-900">
              <option value="">Todos</option>
              {tiposUnicos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
        {(filtroEmpleado || filtroEstado || filtroTipo) && (
          <button onClick={() => { setFiltroEmpleado(''); setFiltroEstado(''); setFiltroTipo(''); }} className="mt-5 text-xs text-orange-600 hover:text-orange-800 font-medium">
            Limpiar filtros
          </button>
        )}
      </div>

      {/* KPIs */}
      {!loading && (
        <div className={`grid gap-4 mb-6 ${tab === 'gastos' ? 'grid-cols-2 md:grid-cols-6' : 'grid-cols-2 md:grid-cols-4'}`}>
          {tab === 'gastos' ? (<>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-xs text-gray-500">Total gastos</p>
              <p className="text-2xl font-bold text-gray-900">{kpisFiltrados.total}</p>
            </div>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-xs text-gray-500">Importe total</p>
              <p className="text-2xl font-bold text-green-600">{kpisFiltrados.totalImporte?.toFixed(2)} EUR</p>
            </div>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-xs text-gray-500">VISA Empresa</p>
              <p className="text-xl font-bold text-blue-600">{kpisFiltrados.visaEmpresa?.toFixed(2)} EUR</p>
              <p className="text-xs text-blue-500 mt-1">Ya pagado por empresa</p>
            </div>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-xs text-gray-500">Pendiente abonar</p>
              <p className="text-xl font-bold text-amber-600">{kpisFiltrados.pendienteNomina?.toFixed(2)} EUR</p>
              <p className="text-xs text-amber-500 mt-1">Abonar en nomina</p>
            </div>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-xs text-gray-500">En tramite</p>
              <p className="text-2xl font-bold text-yellow-600">{kpisFiltrados.pendientes}</p>
            </div>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-xs text-gray-500">Aprobados</p>
              <p className="text-2xl font-bold text-green-600">{kpisFiltrados.aprobados}</p>
            </div>
          </>) : (<>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-xs text-gray-500">Total registros</p>
              <p className="text-2xl font-bold text-gray-900">{kpisFiltrados.total}</p>
            </div>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-xs text-gray-500">Horas extra totales</p>
              <p className="text-2xl font-bold text-indigo-600">{kpisFiltrados.totalHoras}</p>
            </div>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-xs text-gray-500">En tramite</p>
              <p className="text-2xl font-bold text-yellow-600">{kpisFiltrados.pendientes}</p>
            </div>
            <div className="bg-white border rounded-xl p-4">
              <p className="text-xs text-gray-500">Aprobadas</p>
              <p className="text-2xl font-bold text-green-600">{kpisFiltrados.aprobados}</p>
            </div>
          </>)}
        </div>
      )}

      {/* Desglose por empleado */}
      {!loading && kpis.porEmpleado && kpis.porEmpleado.length > 0 && !filtroEmpleado && (
        <div className="bg-white border rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Por empleado</h3>
          <div className="space-y-2">
            {kpis.porEmpleado.map((e: any, i: number) => (
              <div key={i} className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-1 rounded" onClick={() => setFiltroEmpleado(e.nombre)}>
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
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo pago</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Importe</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Abono</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Gestionado</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {gastosFiltrados.map(g => {
                const esVisa = g.tipo.toLowerCase().includes('visa');
                return (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{g.empleado?.nombreCompleto || g.nombre}</td>
                    <td className="px-4 py-3 text-gray-600">{new Date(g.fecha).toLocaleDateString('es-ES')}</td>
                    <td className="px-4 py-3 text-gray-600">{g.motivo}</td>
                    <td className="px-4 py-3">{tipoBadge(g.tipo)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{g.importe.toFixed(2)} EUR</td>
                    <td className="px-4 py-3 text-center">
                      {esVisa ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">Pagado empresa</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Abonar nomina</span>
                      )}
                    </td>
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
                );
              })}
            </tbody>
          </table>
          {gastosFiltrados.length === 0 && <div className="text-center py-8 text-gray-500">No hay gastos con estos filtros</div>}
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
                <th className="px-4 py-3 text-left font-medium text-gray-600">Gestionado</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {extrasFiltrados.map(h => (
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
          {extrasFiltrados.length === 0 && <div className="text-center py-8 text-gray-500">No hay horas extra con estos filtros</div>}
        </div>
      )}
    </div>
  );
}
