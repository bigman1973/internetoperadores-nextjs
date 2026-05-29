"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';

interface Factura {
  id: number;
  ispGestionId: number;
  serieFactura: string;
  numeroDocumento: string;
  documento: string | null;
  fecha: string;
  base: number;
  totalImpuesto: number;
  total: number;
  situacion: string;
  totalPendiente: number;
  ejercicio: number;
}

interface FacturacionData {
  facturas: Factura[];
  stats: {
    total: number;
    cobradas: number;
    pendientes: number;
    totalFacturado: number;
    totalPendiente: number;
  };
  porMes: Array<{
    mes: string;
    base: number;
    iva: number;
    total: number;
    count: number;
  }>;
  aniosDisponibles: number[];
}

export default function FacturacionPage() {
  const [data, setData] = useState<FacturacionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'todas' | 'cobradas' | 'pendientes'>('todas');

  const fetchData = (year?: string) => {
    setLoading(true);
    const url = year ? `/api/cliente/facturas?year=${year}` : '/api/cliente/facturas';
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (yearFilter) {
      fetchData(yearFilter);
    } else {
      fetchData();
    }
  }, [yearFilter]);

  if (loading && !data) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-red-500">Error al cargar la facturación.</div>;
  }

  const facturasFiltradas = data.facturas.filter(f => {
    if (statusFilter === 'cobradas') return f.situacion === 'COBRADA';
    if (statusFilter === 'pendientes') return f.situacion !== 'COBRADA';
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Facturación</h1>
        <p className="text-gray-500 mt-1">Consulta y descarga tus facturas.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <p className="text-sm text-gray-500">Total facturas</p>
          <p className="text-2xl font-bold text-gray-900">{data.stats.total}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <p className="text-sm text-gray-500">Total facturado</p>
          <p className="text-2xl font-bold text-gray-900">{data.stats.totalFacturado.toFixed(2)} €</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <p className="text-sm text-gray-500">Cobradas</p>
          <p className="text-2xl font-bold text-green-600">{data.stats.cobradas}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <p className="text-sm text-gray-500">Importe pendiente</p>
          <p className="text-2xl font-bold text-red-600">{data.stats.totalPendiente.toFixed(2)} €</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-2">
          {(['todas', 'cobradas', 'pendientes'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === f
                  ? 'bg-orange-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f === 'todas' ? 'Todas' : f === 'cobradas' ? 'Cobradas' : 'Pendientes'}
            </button>
          ))}
        </div>
        {data.aniosDisponibles.length > 0 && (
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white"
          >
            <option value="">Todos los años</option>
            {data.aniosDisponibles.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tabla de facturas */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Documento</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Base</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">IVA</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Pendiente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {facturasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No hay facturas disponibles con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                facturasFiltradas.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">
                        {f.documento || f.numeroDocumento}
                      </span>
                      <span className="block text-xs text-gray-400">{f.serieFactura}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(f.fecha).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{f.base.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-right text-gray-600">{f.totalImpuesto.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{f.total.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        f.situacion === 'COBRADA'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {f.situacion === 'COBRADA' ? 'Pagada' : f.situacion}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {f.totalPendiente > 0 ? (
                        <span className="text-red-600 font-medium">{f.totalPendiente.toFixed(2)} €</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Evolución mensual */}
      {data.porMes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Evolución mensual</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Mes</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Facturas</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Base</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">IVA</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.porMes.map(m => (
                  <tr key={m.mes}>
                    <td className="px-3 py-2 text-gray-900 font-medium">
                      {new Date(m.mes + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">{m.count}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{m.base.toFixed(2)} €</td>
                    <td className="px-3 py-2 text-right text-gray-600">{m.iva.toFixed(2)} €</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{m.total.toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
