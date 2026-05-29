"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';

interface Contrato {
  id: number;
  titulo: string;
  tarifa: string;
  precio: number;
  importeRemesar: number;
  fechaInicio: string | null;
  fechaBaja: string | null;
  causaBaja: string | null;
  permanencia: number;
  fechaPermanencia: string | null;
  categoria: string | null;
  telefonosContrato: string | null;
  observaciones: string | null;
  activo: boolean;
  conceptoFacturacion: string | null;
}

interface ServiciosData {
  contratos: Contrato[];
  stats: {
    totalActivos: number;
    totalInactivos: number;
    facturacionMensual: number;
  };
  porCategoria: Array<{
    categoria: string;
    count: number;
    total: number;
  }>;
}

export default function ServiciosPage() {
  const [data, setData] = useState<ServiciosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'activos' | 'todos' | 'bajas'>('activos');

  useEffect(() => {
    fetch('/api/cliente/servicios')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-red-500">Error al cargar los servicios.</div>;
  }

  const contratosFiltrados = data.contratos.filter(c => {
    if (filtro === 'activos') return c.activo;
    if (filtro === 'bajas') return !c.activo;
    return true;
  });

  const getCategoriaIcon = (cat: string | null) => {
    const catLower = (cat || '').toLowerCase();
    if (catLower.includes('internet') || catLower.includes('fibra')) return '🌐';
    if (catLower.includes('móvil') || catLower.includes('movil')) return '📱';
    if (catLower.includes('fij') || catLower.includes('voz')) return '📞';
    if (catLower.includes('hosting') || catLower.includes('cloud')) return '☁️';
    if (catLower.includes('centralita') || catLower.includes('pbx')) return '🏢';
    return '📋';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis Servicios</h1>
        <p className="text-gray-500 mt-1">Consulta todos los servicios contratados con Internet Operadores.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <p className="text-sm text-gray-500">Servicios activos</p>
          <p className="text-2xl font-bold text-green-600">{data.stats.totalActivos}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <p className="text-sm text-gray-500">Facturación mensual</p>
          <p className="text-2xl font-bold text-gray-900">{data.stats.facturacionMensual.toFixed(2)} €</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <p className="text-sm text-gray-500">Servicios dados de baja</p>
          <p className="text-2xl font-bold text-gray-400">{data.stats.totalInactivos}</p>
        </div>
      </div>

      {/* Distribución por categoría */}
      {data.porCategoria.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Distribución por categoría</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.porCategoria.map(cat => (
              <div key={cat.categoria} className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">{cat.categoria}</p>
                <p className="text-lg font-bold text-gray-900">{cat.count}</p>
                <p className="text-xs text-gray-500">{cat.total.toFixed(2)} €/mes</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2">
        {(['activos', 'todos', 'bajas'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtro === f
                ? 'bg-orange-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f === 'activos' ? 'Activos' : f === 'todos' ? 'Todos' : 'Dados de baja'}
          </button>
        ))}
      </div>

      {/* Lista de servicios */}
      <div className="space-y-3">
        {contratosFiltrados.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No hay servicios en esta categoría.</p>
          </div>
        ) : (
          contratosFiltrados.map(c => (
            <div key={c.id} className={`bg-white rounded-xl border p-5 ${c.activo ? 'border-gray-200' : 'border-gray-100 opacity-70'}`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{getCategoriaIcon(c.categoria)}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{c.titulo}</h3>
                      {c.activo ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">Activo</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Baja</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{c.tarifa}</p>
                    {c.telefonosContrato && (
                      <p className="text-xs text-gray-400 mt-1">Tel: {c.telefonosContrato}</p>
                    )}
                    {c.fechaInicio && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Alta: {new Date(c.fechaInicio).toLocaleDateString('es-ES')}
                        {c.fechaBaja && ` · Baja: ${new Date(c.fechaBaja).toLocaleDateString('es-ES')}`}
                      </p>
                    )}
                    {c.permanencia > 0 && c.fechaPermanencia && c.activo && (
                      <p className="text-xs text-orange-600 mt-0.5">
                        Permanencia hasta: {new Date(c.fechaPermanencia).toLocaleDateString('es-ES')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{c.precio.toFixed(2)} €<span className="text-sm font-normal text-gray-500">/mes</span></p>
                  {c.conceptoFacturacion && (
                    <p className="text-xs text-gray-400">{c.conceptoFacturacion}</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
