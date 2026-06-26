'use client';

import { useState, useEffect } from 'react';
import { DocumentTextIcon, CheckCircleIcon, ClockIcon, XCircleIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';

interface Factura {
  id: string;
  proveedor: string;
  cif: string | null;
  numFactura: string | null;
  fecha: string;
  base: number;
  tipoIva: number;
  importeIva: number;
  tipoIrpf: number;
  importeIrpf: number;
  total: number;
  concepto: string | null;
  estado: string;
  imputacion: string | null;
  clienteImputado: string | null;
  departamento: string | null;
  deducibleIva: boolean;
}

const ESTADOS = {
  PENDIENTE_REVISION: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: ClockIcon },
  VALIDADA: { label: 'Validada', color: 'bg-green-100 text-green-700', icon: CheckCircleIcon },
  CONTABILIZADA: { label: 'Contabilizada', color: 'bg-blue-100 text-blue-700', icon: DocumentTextIcon },
  RECHAZADA: { label: 'Rechazada', color: 'bg-red-100 text-red-700', icon: XCircleIcon },
};

export default function FacturasPage() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [resumen, setResumen] = useState<any>(null);
  const [filtroEstado, setFiltroEstado] = useState('');

  useEffect(() => {
    fetchFacturas();
  }, [page, filtroEstado]);

  async function fetchFacturas() {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: '30' });
    if (filtroEstado) params.set('estado', filtroEstado);
    
    const res = await fetch(`/api/admin/finanzas/facturas?${params}`);
    const json = await res.json();
    setFacturas(json.facturas || []);
    setTotal(json.total || 0);
    setResumen(json.resumenFiscal || null);
    setLoading(false);
  }

  async function actualizarEstado(id: string, estado: string) {
    await fetch(`/api/admin/finanzas/facturas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    });
    fetchFacturas();
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
          <h1 className="text-2xl font-bold text-gray-900">Facturas Recibidas</h1>
          <p className="text-sm text-gray-500 mt-1">{total} facturas registradas</p>
        </div>
        <button className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 flex items-center gap-2">
          <ArrowUpTrayIcon className="h-4 w-4" />
          Subir Factura
        </button>
      </div>

      {/* Resumen fiscal */}
      {resumen && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500">Total Base Imponible</p>
            <p className="text-lg font-bold text-gray-900">{formatEUR(resumen.totalBase)}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500">Total IVA Soportado</p>
            <p className="text-lg font-bold text-green-700">{formatEUR(resumen.totalIva)}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500">Total IRPF Retenido</p>
            <p className="text-lg font-bold text-blue-700">{formatEUR(resumen.totalIrpf)}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500">Total Facturado</p>
            <p className="text-lg font-bold text-gray-900">{formatEUR(resumen.totalFacturado)}</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2">
        <button
          onClick={() => { setFiltroEstado(''); setPage(1); }}
          className={`px-3 py-1.5 text-sm rounded-lg border ${!filtroEstado ? 'bg-orange-50 border-orange-200 text-orange-700' : 'text-gray-600'}`}
        >
          Todas
        </button>
        {Object.entries(ESTADOS).map(([key, val]) => (
          <button
            key={key}
            onClick={() => { setFiltroEstado(key); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-lg border ${filtroEstado === key ? 'bg-orange-50 border-orange-200 text-orange-700' : 'text-gray-600'}`}
          >
            {val.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Concepto</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Base</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">IVA</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Imputación</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              ) : facturas.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No hay facturas. Sincroniza OneDrive o sube una factura manualmente.</td></tr>
              ) : (
                facturas.map(f => {
                  const estadoInfo = ESTADOS[f.estado as keyof typeof ESTADOS] || ESTADOS.PENDIENTE_REVISION;
                  return (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatFecha(f.fecha)}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{f.proveedor}</div>
                        {f.cif && <div className="text-xs text-gray-400">{f.cif}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{f.concepto || '—'}</td>
                      <td className="px-4 py-3 text-sm text-right">{formatEUR(f.base)}</td>
                      <td className="px-4 py-3 text-sm text-right text-green-700">{formatEUR(f.importeIva)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-right">{formatEUR(f.total)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                          {f.imputacion || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${estadoInfo.color}`}>
                          {estadoInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {f.estado === 'PENDIENTE_REVISION' && (
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => actualizarEstado(f.id, 'VALIDADA')}
                              className="text-green-600 hover:text-green-800"
                              title="Validar"
                            >
                              <CheckCircleIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => actualizarEstado(f.id, 'RECHAZADA')}
                              className="text-red-400 hover:text-red-600"
                              title="Rechazar"
                            >
                              <XCircleIcon className="h-5 w-5" />
                            </button>
                          </div>
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
        {total > 30 && (
          <div className="border-t px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Mostrando {(page - 1) * 30 + 1} - {Math.min(page * 30, total)} de {total}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border rounded disabled:opacity-50">Anterior</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 30 >= total} className="px-3 py-1 text-sm border rounded disabled:opacity-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
