'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChartBarIcon, CheckCircleIcon, ClockIcon, ExclamationTriangleIcon,
  MagnifyingGlassIcon, XMarkIcon, ArrowPathIcon, FunnelIcon
} from '@heroicons/react/24/outline';

interface FacturaAnalitica {
  id: string;
  proveedor: string;
  cif: string | null;
  numFactura: string | null;
  fecha: string;
  base: number;
  total: number;
  concepto: string | null;
  imputacion: string | null;
  clienteImputado: string | null;
  imputadoAVentas: boolean;
  fechaImputacion: string | null;
  numLineas: number;
  lineasConCliente: number;
  estado: string;
  imputacionesCliente: { clienteNombre: string; importe: number; numLineas: number }[];
}

interface KPIs {
  totalFacturas: number;
  imputadas: number;
  clasificadas: number;
  pendientes: number;
  porcentajeImputado: number;
  importeImputado: number;
}

export default function AnaliticaCostesPage() {
  const router = useRouter();
  const [facturas, setFacturas] = useState<FacturaAnalitica[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState<'' | 'imputada' | 'clasificada' | 'pendiente'>('');
  const [buscar, setBuscar] = useState('');
  const [periodoMes, setPeriodoMes] = useState('');
  const [periodoAnio, setPeriodoAnio] = useState(new Date().getFullYear().toString());

  useEffect(() => {
    fetchFacturas();
  }, [page, filtroEstado, periodoMes, periodoAnio]);

  async function fetchFacturas() {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      limit: '50',
    });
    if (filtroEstado) params.set('estadoAnalitica', filtroEstado);
    if (buscar.trim()) params.set('buscar', buscar.trim());

    // Filtro por período
    if (periodoMes && periodoAnio) {
      const mes = parseInt(periodoMes);
      const anio = parseInt(periodoAnio);
      const desde = new Date(anio, mes - 1, 1);
      const hasta = new Date(anio, mes, 0); // último día del mes
      params.set('desde', desde.toISOString().split('T')[0]);
      params.set('hasta', hasta.toISOString().split('T')[0]);
    } else if (periodoAnio && !periodoMes) {
      const anio = parseInt(periodoAnio);
      params.set('desde', `${anio}-01-01`);
      params.set('hasta', `${anio}-12-31`);
    }

    try {
      const res = await fetch(`/api/admin/finanzas/analitica-costes?${params}`);
      const json = await res.json();
      setFacturas(json.facturas || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
      setKpis(json.kpis || null);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  function formatEUR(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function formatFecha(f: string) {
    return new Date(f).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
  }

  function getEstadoAnalitica(f: FacturaAnalitica) {
    if (f.imputadoAVentas) return 'imputada';
    if (f.imputacion) return 'clasificada';
    return 'pendiente';
  }

  function getEstadoBadge(f: FacturaAnalitica) {
    const estado = getEstadoAnalitica(f);
    if (estado === 'imputada') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
          <CheckCircleIcon className="h-3 w-3" />
          Imputada
        </span>
      );
    }
    if (estado === 'clasificada') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
          <ChartBarIcon className="h-3 w-3" />
          Clasificada
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
        <ClockIcon className="h-3 w-3" />
        Pendiente
      </span>
    );
  }

  const meses = [
    { value: '', label: 'Todo el año' },
    { value: '1', label: 'Enero' },
    { value: '2', label: 'Febrero' },
    { value: '3', label: 'Marzo' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Mayo' },
    { value: '6', label: 'Junio' },
    { value: '7', label: 'Julio' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' },
  ];

  const anios = ['2024', '2025', '2026'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analítica de Costes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Control de imputación de costes por factura recibida — asignar líneas a clientes para análisis de rentabilidad
          </p>
        </div>
        <button
          onClick={() => { setPage(1); fetchFacturas(); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <ArrowPathIcon className="h-4 w-4" />
          Actualizar
        </button>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500">Total Facturas</p>
            <p className="text-2xl font-bold text-gray-900">{kpis.totalFacturas}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500">Imputadas a clientes</p>
            <p className="text-2xl font-bold text-green-700">{kpis.imputadas}</p>
            <p className="text-xs text-green-600">{kpis.porcentajeImputado}% del total</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500">Clasificadas (sin líneas)</p>
            <p className="text-2xl font-bold text-blue-700">{kpis.clasificadas}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500">Pendientes</p>
            <p className="text-2xl font-bold text-amber-700">{kpis.pendientes}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500">Importe imputado</p>
            <p className="text-2xl font-bold text-gray-900">{formatEUR(kpis.importeImputado)}</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 items-center flex-wrap">
        {/* Estado analítica */}
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {([
            { value: '', label: 'Todas' },
            { value: 'pendiente', label: 'Pendientes' },
            { value: 'clasificada', label: 'Clasificadas' },
            { value: 'imputada', label: 'Imputadas' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => { setFiltroEstado(opt.value as any); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filtroEstado === opt.value ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Período: Año */}
        <select
          value={periodoAnio}
          onChange={(e) => { setPeriodoAnio(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-1.5 text-sm"
        >
          {anios.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {/* Período: Mes */}
        <select
          value={periodoMes}
          onChange={(e) => { setPeriodoMes(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-1.5 text-sm"
        >
          {meses.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        {/* Buscador */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <MagnifyingGlassIcon className="h-4 w-4 absolute left-2.5 top-2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar proveedor, concepto, factura..."
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchFacturas(); } }}
              className="border rounded-lg pl-8 pr-3 py-1.5 text-sm w-64"
            />
          </div>
          {buscar && (
            <button onClick={() => { setBuscar(''); setTimeout(fetchFacturas, 0); }} className="text-gray-400 hover:text-gray-600">
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">N Factura</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Concepto</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Analítica</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Clientes imputados</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              ) : facturas.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No hay facturas en este período</td></tr>
              ) : (
                facturas.map(f => (
                  <tr
                    key={f.id}
                    className={`hover:bg-blue-50/30 cursor-pointer transition-colors ${
                      f.imputadoAVentas ? 'bg-green-50/30' : !f.imputacion ? 'bg-amber-50/20' : ''
                    }`}
                    onClick={() => router.push(`/admin/finanzas/facturas/${f.id}`)}
                  >
                    <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                      {formatFecha(f.fecha)}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-900 font-medium max-w-[200px] truncate" title={f.proveedor}>
                      {f.proveedor}
                      {f.cif && <span className="text-[10px] text-gray-400 ml-1">{f.cif}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">
                      {f.numFactura || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[200px] truncate" title={f.concepto || ''}>
                      {f.concepto || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-medium text-right text-red-700 whitespace-nowrap">
                      {formatEUR(f.total)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {getEstadoBadge(f)}
                      {f.numLineas > 0 && (
                        <span className="block text-[9px] text-gray-400 mt-0.5">
                          {f.lineasConCliente}/{f.numLineas} líneas
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {f.imputadoAVentas && f.imputacionesCliente.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {f.imputacionesCliente.slice(0, 3).map((imp, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded">
                              {imp.clienteNombre} ({formatEUR(imp.importe)})
                            </span>
                          ))}
                          {f.imputacionesCliente.length > 3 && (
                            <span className="text-[10px] text-gray-400">+{f.imputacionesCliente.length - 3} más</span>
                          )}
                        </div>
                      ) : f.clienteImputado ? (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                          {f.clienteImputado}
                        </span>
                      ) : f.imputacion ? (
                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                          {f.imputacion}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-300">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/admin/finanzas/facturas/${f.id}`); }}
                        className={`text-xs px-3 py-1 rounded-lg font-medium ${
                          f.imputadoAVentas
                            ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                            : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                        }`}
                      >
                        {f.imputadoAVentas ? 'Ver detalle' : 'Imputar'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-xs text-gray-500">
              Mostrando {((page - 1) * 50) + 1}-{Math.min(page * 50, total)} de {total} facturas
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-xs border rounded disabled:opacity-50 hover:bg-gray-100"
              >
                Anterior
              </button>
              <span className="px-3 py-1 text-xs text-gray-600">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-xs border rounded disabled:opacity-50 hover:bg-gray-100"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
