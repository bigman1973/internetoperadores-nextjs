'use client';

import { useState, useEffect } from 'react';
import { MagnifyingGlassIcon, DocumentTextIcon, CheckBadgeIcon, ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface FacturaEmitida {
  id: string;
  cliente: string;
  cif: string | null;
  numFactura: string;
  serie: string | null;
  fecha: string;
  fechaVencimiento: string | null;
  base: number;
  tipoIva: number;
  importeIva: number;
  total: number;
  concepto: string | null;
  estado: string;
  imputacion: string | null;
  formaCobro: string | null;
  importeCobrado: number;
}

interface Resumen {
  totalFacturado: number;
  totalCobrado: number;
  pendienteCobro: number;
  count: number;
  porEstado: { estado: string; _sum: { total: number }; _count: number }[];
}

const ESTADOS = {
  EMITIDA: { label: 'Emitida', color: 'bg-blue-100 text-blue-700' },
  ENVIADA: { label: 'Enviada', color: 'bg-indigo-100 text-indigo-700' },
  COBRADA_PARCIAL: { label: 'Cobro parcial', color: 'bg-amber-100 text-amber-700' },
  COBRADA: { label: 'Cobrada', color: 'bg-green-100 text-green-700' },
  IMPAGADA: { label: 'Impagada', color: 'bg-red-100 text-red-700' },
  ANULADA: { label: 'Anulada', color: 'bg-gray-100 text-gray-500' },
};

const SERIES = ['CLL', 'INST', 'PROY', 'DRX', 'VOLA'];

export default function FacturasEmitidasPage() {
  const [facturas, setFacturas] = useState<FacturaEmitida[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ estado: '', serie: '', buscar: '', desde: '', hasta: '' });

  useEffect(() => {
    fetchFacturas();
  }, [page, filtros]);

  async function fetchFacturas() {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: '50' });
    if (filtros.estado) params.set('estado', filtros.estado);
    if (filtros.serie) params.set('serie', filtros.serie);
    if (filtros.buscar) params.set('q', filtros.buscar);
    if (filtros.desde) params.set('desde', filtros.desde);
    if (filtros.hasta) params.set('hasta', filtros.hasta);

    const res = await fetch(`/api/admin/finanzas/facturas-emitidas?${params}`);
    const json = await res.json();
    setFacturas(json.facturas || []);
    setTotal(json.total || 0);
    setResumen(json.resumen || null);
    setLoading(false);
  }

  function formatEUR(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function formatFecha(str: string) {
    return new Date(str).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturas Emitidas</h1>
          <p className="text-sm text-gray-500 mt-1">{total} facturas</p>
        </div>
      </div>

      {/* Resumen */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">Total Facturado</p>
            <p className="text-xl font-bold text-gray-900">{formatEUR(resumen.totalFacturado)}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">Total Cobrado</p>
            <p className="text-xl font-bold text-green-600">{formatEUR(resumen.totalCobrado)}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">Pendiente de Cobro</p>
            <p className="text-xl font-bold text-amber-600">{formatEUR(resumen.pendienteCobro)}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">IVA Repercutido</p>
            <p className="text-xl font-bold text-blue-600">
              {formatEUR(resumen.totalFacturado - resumen.totalFacturado / 1.21)}
            </p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlassIcon className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar cliente, factura, CIF..."
            value={filtros.buscar}
            onChange={(e) => { setFiltros({...filtros, buscar: e.target.value}); setPage(1); }}
            className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={filtros.estado}
          onChange={(e) => { setFiltros({...filtros, estado: e.target.value}); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={filtros.serie}
          onChange={(e) => { setFiltros({...filtros, serie: e.target.value}); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todas las series</option>
          {SERIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="date"
          value={filtros.desde}
          onChange={(e) => { setFiltros({...filtros, desde: e.target.value}); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={filtros.hasta}
          onChange={(e) => { setFiltros({...filtros, hasta: e.target.value}); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nº Factura</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Base</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">IVA</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cobro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              ) : facturas.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  <DocumentTextIcon className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                  No hay facturas emitidas. Importa desde ISP Gestión o crea manualmente.
                </td></tr>
              ) : (
                facturas.map(f => {
                  const estadoInfo = ESTADOS[f.estado as keyof typeof ESTADOS] || { label: f.estado, color: 'bg-gray-100 text-gray-600' };
                  return (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <span className="text-sm font-medium text-gray-900">{f.numFactura}</span>
                        {f.serie && <span className="ml-1 text-xs text-gray-400">{f.serie}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-sm text-gray-900 truncate max-w-[200px]">{f.cliente}</p>
                        {f.cif && <p className="text-xs text-gray-400">{f.cif}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                        {formatFecha(f.fecha)}
                        {f.fechaVencimiento && (
                          <p className="text-gray-400">Venc: {formatFecha(f.fechaVencimiento)}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-700">{formatEUR(f.base)}</td>
                      <td className="px-4 py-2.5 text-xs text-right text-gray-500">{formatEUR(f.importeIva)}</td>
                      <td className="px-4 py-2.5 text-sm font-medium text-right text-gray-900">{formatEUR(f.total)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${estadoInfo.color}`}>
                          {estadoInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {f.formaCobro && <span className="text-xs text-gray-500">{f.formaCobro}</span>}
                        {f.importeCobrado > 0 && f.importeCobrado < f.total && (
                          <p className="text-xs text-amber-600">{formatEUR(f.importeCobrado)} cobrado</p>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {total > 50 && (
          <div className="border-t px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Mostrando {(page - 1) * 50 + 1} - {Math.min(page * 50, total)} de {total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * 50 >= total}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
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
