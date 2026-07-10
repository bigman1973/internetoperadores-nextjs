'use client';

import { useState, useEffect } from 'react';
import {
  BanknotesIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';

interface Resumen {
  totalFacturas: number;
  totalBase: number;
  totalTotal: number;
  totalCobrado: number;
  totalPendiente: number;
}

interface MesData {
  mes: string;
  facturas: number;
  base: number;
  total: number;
  cobrado: number;
  pendiente: number;
  porSociedad: Record<string, { facturas: number; base: number; total: number }>;
}

interface SociedadData {
  codigo: string;
  nombre: string;
  facturas: number;
  base: number;
  total: number;
  cobrado: number;
  pendiente: number;
}

interface FacturaDetalle {
  id: number;
  numero: string;
  fecha: string;
  sociedad: string;
  base: number;
  iva: number;
  total: number;
  situacion: string;
  pendiente: number;
}

function formatEur(value: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatEurShort(value: number) {
  if (value >= 1000) {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }
  return formatEur(value);
}

const MESES_NOMBRE: Record<string, string> = {
  '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
  '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
  '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre',
};

export default function DaxtonFinanzasPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [porMes, setPorMes] = useState<MesData[]>([]);
  const [porSociedad, setPorSociedad] = useState<SociedadData[]>([]);
  const [detalle, setDetalle] = useState<FacturaDetalle[]>([]);
  const [showDetalle, setShowDetalle] = useState(false);
  const [filtroSociedad, setFiltroSociedad] = useState('');
  const [ordenDetalle, setOrdenDetalle] = useState<'fecha' | 'total'>('fecha');
  const [ordenDir, setOrdenDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetchData();
  }, [year]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/clientes/ggcc/draxton/finanzas?year=${year}`);
      const data = await res.json();
      setResumen(data.resumen);
      setPorMes(data.porMes || []);
      setPorSociedad(data.porSociedad || []);
      setDetalle(data.detalle || []);
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoading(false);
    }
  }

  // Calcular max para barras
  const maxMes = Math.max(...porMes.map(m => m.base), 1);

  // Filtrar y ordenar detalle
  const detalleFiltrado = detalle
    .filter(f => !filtroSociedad || f.sociedad.includes(filtroSociedad))
    .sort((a, b) => {
      const mult = ordenDir === 'asc' ? 1 : -1;
      if (ordenDetalle === 'fecha') return mult * a.fecha.localeCompare(b.fecha);
      return mult * (a.total - b.total);
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con selector de año */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Finanzas Draxton</h1>
          <p className="text-sm text-gray-500">Facturación, cobros y control financiero</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear(y => y - 1)}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
          >
            &#8592;
          </button>
          <span className="px-4 py-1.5 text-sm font-semibold bg-white border rounded-lg">
            {year}
          </span>
          <button
            onClick={() => setYear(y => y + 1)}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
            disabled={year >= new Date().getFullYear()}
          >
            &#8594;
          </button>
        </div>
      </div>

      {/* KPIs principales */}
      {resumen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <DocumentTextIcon className="h-5 w-5 text-blue-500" />
              <span className="text-xs font-medium text-gray-500">Facturas</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{resumen.totalFacturas}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <BanknotesIcon className="h-5 w-5 text-indigo-500" />
              <span className="text-xs font-medium text-gray-500">Facturado (Base)</span>
            </div>
            <p className="text-2xl font-bold text-indigo-700">{formatEurShort(resumen.totalBase)}</p>
            <p className="text-xs text-gray-400 mt-0.5">Total IVA inc.: {formatEurShort(resumen.totalTotal)}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircleIcon className="h-5 w-5 text-green-500" />
              <span className="text-xs font-medium text-gray-500">Cobrado</span>
            </div>
            <p className="text-2xl font-bold text-green-700">{formatEurShort(resumen.totalCobrado)}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {resumen.totalTotal > 0 ? ((resumen.totalCobrado / resumen.totalTotal) * 100).toFixed(0) : 0}% del total
            </p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <ClockIcon className="h-5 w-5 text-orange-500" />
              <span className="text-xs font-medium text-gray-500">Pendiente Cobro</span>
            </div>
            <p className="text-2xl font-bold text-orange-700">{formatEurShort(resumen.totalPendiente)}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {resumen.totalTotal > 0 ? ((resumen.totalPendiente / resumen.totalTotal) * 100).toFixed(0) : 0}% del total
            </p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowTrendingUpIcon className="h-5 w-5 text-purple-500" />
              <span className="text-xs font-medium text-gray-500">Media Mensual</span>
            </div>
            <p className="text-2xl font-bold text-purple-700">
              {porMes.length > 0 ? formatEurShort(resumen.totalBase / porMes.length) : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{porMes.length} meses con facturación</p>
          </div>
        </div>
      )}

      {/* Tabla de facturación mensual con barras */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-gray-900">Facturación Mensual (Base Imponible)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Mes</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Facturas</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Base Imponible</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Total IVA inc.</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Cobrado</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Pendiente</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-48"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {porMes.map((m) => {
                const mesNum = m.mes.split('-')[1];
                const pctBar = (m.base / maxMes) * 100;
                return (
                  <tr key={m.mes} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {MESES_NOMBRE[mesNum] || mesNum}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{m.facturas}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-indigo-700">
                      {formatEur(m.base)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{formatEur(m.total)}</td>
                    <td className="px-4 py-2.5 text-right text-green-600">{formatEur(m.cobrado)}</td>
                    <td className="px-4 py-2.5 text-right text-orange-600">
                      {m.pendiente > 0 ? formatEur(m.pendiente) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="w-full bg-gray-100 rounded-full h-4 relative overflow-hidden">
                        <div
                          className="bg-indigo-500 h-4 rounded-full transition-all"
                          style={{ width: `${pctBar}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {resumen && (
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-2.5 text-gray-900">TOTAL</td>
                  <td className="px-4 py-2.5 text-right text-gray-900">{resumen.totalFacturas}</td>
                  <td className="px-4 py-2.5 text-right text-indigo-700">{formatEur(resumen.totalBase)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-900">{formatEur(resumen.totalTotal)}</td>
                  <td className="px-4 py-2.5 text-right text-green-700">{formatEur(resumen.totalCobrado)}</td>
                  <td className="px-4 py-2.5 text-right text-orange-700">{formatEur(resumen.totalPendiente)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Desglose por sociedad */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-gray-900">Desglose por Sociedad</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Sociedad</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Facturas</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Base Imponible</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Total IVA inc.</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Cobrado</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Pendiente</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">% del Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {porSociedad.map((s) => (
                <tr key={s.codigo} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{s.nombre}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{s.facturas}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-indigo-700">{formatEur(s.base)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{formatEur(s.total)}</td>
                  <td className="px-4 py-2.5 text-right text-green-600">{formatEur(s.cobrado)}</td>
                  <td className="px-4 py-2.5 text-right text-orange-600">
                    {s.pendiente > 0 ? formatEur(s.pendiente) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500">
                    {resumen && resumen.totalBase > 0
                      ? ((s.base / resumen.totalBase) * 100).toFixed(1) + '%'
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle de facturas (expandible) */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <button
          onClick={() => setShowDetalle(!showDetalle)}
          className="w-full px-4 py-3 border-b flex items-center justify-between hover:bg-gray-50"
        >
          <h2 className="text-sm font-semibold text-gray-900">
            Detalle de Facturas ({detalle.length})
          </h2>
          {showDetalle ? (
            <ChevronUpIcon className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 text-gray-400" />
          )}
        </button>

        {showDetalle && (
          <div>
            {/* Filtros */}
            <div className="px-4 py-2 border-b bg-gray-50 flex items-center gap-3">
              <select
                value={filtroSociedad}
                onChange={(e) => setFiltroSociedad(e.target.value)}
                className="text-xs border rounded-lg px-2 py-1.5"
              >
                <option value="">Todas las sociedades</option>
                {porSociedad.map(s => (
                  <option key={s.codigo} value={s.nombre}>{s.nombre}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  setOrdenDetalle(ordenDetalle === 'fecha' ? 'total' : 'fecha');
                  setOrdenDir('desc');
                }}
                className="text-xs border rounded-lg px-2 py-1.5 hover:bg-white"
              >
                Ordenar por: {ordenDetalle === 'fecha' ? 'Fecha' : 'Importe'}
              </button>
              <button
                onClick={() => setOrdenDir(d => d === 'asc' ? 'desc' : 'asc')}
                className="text-xs border rounded-lg px-2 py-1.5 hover:bg-white"
              >
                {ordenDir === 'desc' ? '↓ Desc' : '↑ Asc'}
              </button>
              <span className="text-xs text-gray-500 ml-auto">
                Mostrando {detalleFiltrado.length} de {detalle.length}
              </span>
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Factura</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Sociedad</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Base</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">IVA</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Total</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-500">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {detalleFiltrado.map((f) => (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-gray-900">{f.numero}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {new Date(f.fecha).toLocaleDateString('es-ES')}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{f.sociedad}</td>
                      <td className="px-3 py-2 text-right text-gray-900">{formatEur(f.base)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{formatEur(f.iva)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatEur(f.total)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          f.situacion === 'COBRADA'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {f.situacion}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
