'use client';

import { useState, useEffect } from 'react';
import { BanknotesIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface DashboardData {
  periodo: { year: number; trimestre: number | null; desde: string; hasta: string };
  saldos: { cuentas: any[]; total: number };
  fiscal: { ivaSoportado: number; ivaRepercutidoEstimado: number; ivaAPagar: number; irpfRetenido: number; baseImponibleCompras: number; totalCompras: number };
  flujo: { ingresos: number; gastos: number; neto: number; porMes: Record<string, { ingresos: number; gastos: number }> };
  categorias: Record<string, { ingresos: number; gastos: number; count: number }>;
  conciliacion: { totalMovimientos: number; conciliados: number; pendientes: number; sinCategorizar: number; porcentajeConciliado: number };
  alertas: { facturasPendientes: number; movimientosSinCategorizar: number };
}

export default function FinanzasDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(2026);
  const [trimestre, setTrimestre] = useState<string>('');

  useEffect(() => {
    fetchDashboard();
  }, [year, trimestre]);

  async function fetchDashboard() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: year.toString() });
      if (trimestre) params.set('trimestre', trimestre);
      const res = await fetch(`/api/admin/finanzas/dashboard?${params}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  function formatEUR(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>)}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <div className="p-8 text-red-600">Error cargando datos</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Control Financiero</h1>
          <p className="text-sm text-gray-500 mt-1">Tesorería, IVA/IRPF y conciliación bancaria en tiempo real</p>
        </div>
        <div className="flex gap-2">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
          <select
            value={trimestre}
            onChange={(e) => setTrimestre(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Todo el año</option>
            <option value="1">T1 (Ene-Mar)</option>
            <option value="2">T2 (Abr-Jun)</option>
            <option value="3">T3 (Jul-Sep)</option>
            <option value="4">T4 (Oct-Dic)</option>
          </select>
        </div>
      </div>

      {/* Alertas */}
      {(data.alertas.facturasPendientes > 0 || data.alertas.movimientosSinCategorizar > 10) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600" />
          <div className="text-sm text-amber-800">
            {data.alertas.facturasPendientes > 0 && (
              <span className="mr-4"><strong>{data.alertas.facturasPendientes}</strong> facturas pendientes de revisión</span>
            )}
            {data.alertas.movimientosSinCategorizar > 10 && (
              <span><strong>{data.alertas.movimientosSinCategorizar}</strong> movimientos sin categorizar</span>
            )}
          </div>
        </div>
      )}

      {/* KPIs principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Saldo Total Bancos</p>
            <BanknotesIcon className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatEUR(data.saldos.total)}</p>
          <div className="mt-2 space-y-1">
            {data.saldos.cuentas.map(c => (
              <div key={c.id} className="flex justify-between text-xs text-gray-500">
                <span>{c.alias || c.banco}</span>
                <span>{c.saldo ? formatEUR(c.saldo) : '—'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">IVA Soportado</p>
            <ArrowTrendingDownIcon className="h-5 w-5 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-green-700 mt-2">{formatEUR(data.fiscal.ivaSoportado)}</p>
          <p className="text-xs text-gray-500 mt-1">Base imponible: {formatEUR(data.fiscal.baseImponibleCompras)}</p>
          <p className="text-xs text-gray-500">IRPF retenido: {formatEUR(data.fiscal.irpfRetenido)}</p>
        </div>

        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Flujo Neto</p>
            {data.flujo.neto >= 0 ? (
              <ArrowTrendingUpIcon className="h-5 w-5 text-green-500" />
            ) : (
              <ArrowTrendingDownIcon className="h-5 w-5 text-red-500" />
            )}
          </div>
          <p className={`text-2xl font-bold mt-2 ${data.flujo.neto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {formatEUR(data.flujo.neto)}
          </p>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Ingresos: {formatEUR(data.flujo.ingresos)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Gastos: {formatEUR(data.flujo.gastos)}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Conciliación</p>
            <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${data.conciliacion.porcentajeConciliado > 80 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {data.conciliacion.porcentajeConciliado}%
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{data.conciliacion.conciliados}/{data.conciliacion.totalMovimientos}</p>
          <p className="text-xs text-gray-500 mt-1">{data.conciliacion.pendientes} pendientes · {data.conciliacion.sinCategorizar} sin categorizar</p>
        </div>
      </div>

      {/* Flujo por mes + Categorías */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Flujo mensual */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Flujo de Caja Mensual</h3>
          <div className="space-y-2">
            {Object.entries(data.flujo.porMes).sort().map(([mes, vals]) => {
              const neto = vals.ingresos - vals.gastos;
              return (
                <div key={mes} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-16">{mes}</span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden flex">
                      <div
                        className="bg-green-400 h-full"
                        style={{ width: `${Math.min((vals.ingresos / (vals.ingresos + vals.gastos)) * 100, 100)}%` }}
                      />
                      <div
                        className="bg-red-400 h-full"
                        style={{ width: `${Math.min((vals.gastos / (vals.ingresos + vals.gastos)) * 100, 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-medium w-20 text-right ${neto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatEUR(neto)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Categorías */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Gastos por Categoría</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {Object.entries(data.categorias)
              .filter(([_, v]) => v.gastos > 0)
              .sort((a, b) => b[1].gastos - a[1].gastos)
              .map(([cat, vals]) => (
                <div key={cat} className="flex items-center justify-between py-1 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-400" />
                    <span className="text-sm text-gray-700">{cat}</span>
                    <span className="text-xs text-gray-400">({vals.count})</span>
                  </div>
                  <span className="text-sm font-medium text-red-600">{formatEUR(-vals.gastos)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Previsión fiscal */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Previsión Fiscal {trimestre ? `T${trimestre}` : year}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-600 uppercase font-medium">IVA Repercutido (est.)</p>
            <p className="text-xl font-bold text-blue-800 mt-1">{formatEUR(data.fiscal.ivaRepercutidoEstimado)}</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-xs text-green-600 uppercase font-medium">IVA Soportado</p>
            <p className="text-xl font-bold text-green-800 mt-1">{formatEUR(data.fiscal.ivaSoportado)}</p>
          </div>
          <div className={`text-center p-4 rounded-lg ${data.fiscal.ivaAPagar > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
            <p className={`text-xs uppercase font-medium ${data.fiscal.ivaAPagar > 0 ? 'text-red-600' : 'text-green-600'}`}>
              IVA a {data.fiscal.ivaAPagar > 0 ? 'Pagar' : 'Compensar'}
            </p>
            <p className={`text-xl font-bold mt-1 ${data.fiscal.ivaAPagar > 0 ? 'text-red-800' : 'text-green-800'}`}>
              {formatEUR(Math.abs(data.fiscal.ivaAPagar))}
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3 text-center">* IVA repercutido estimado a partir de ingresos bancarios. Se actualizará con datos reales de ISP Gestión.</p>
      </div>
    </div>
  );
}
