'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  CheckBadgeIcon, CheckCircleIcon, XCircleIcon, ClockIcon,
  EyeIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline';

interface Gasto {
  id: string;
  concepto: string;
  importe: number;
  fecha: string;
  tipo: string;
  clienteNombre: string | null;
  proyecto: string | null;
  metodoPago: string;
  comercio: string | null;
  empleado: string | null;
  empleadoId: string | null;
  archivoUrl: string | null;
  archivoNombre: string | null;
  ocrCompletado: boolean;
  estado: string;
  motivoRechazo: string | null;
  aprobadoPor: string | null;
  fechaAprobacion: string | null;
  createdAt: string;
}

export default function AprobarTicketsPage() {
  const { data: session } = useSession();
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [resumen, setResumen] = useState({ pendientes: 0, aprobados: 0, rechazados: 0 });
  const [filtroEstado, setFiltroEstado] = useState('PENDIENTE_APROBACION');
  const [procesando, setProcesando] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [showRechazoModal, setShowRechazoModal] = useState<string | null>(null);

  const fetchGastos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/empleado/gastos/aprobar?estado=${filtroEstado}`);
      const data = await res.json();
      setGastos(data.gastos || []);
      setTotal(data.total || 0);
      setResumen(data.resumen || { pendientes: 0, aprobados: 0, rechazados: 0 });
    } catch (error) {
      console.error('Error cargando tickets:', error);
    }
    setLoading(false);
  }, [filtroEstado]);

  useEffect(() => { fetchGastos(); }, [fetchGastos]);

  async function aprobar(gastoId: string) {
    setProcesando(gastoId);
    try {
      const res = await fetch('/api/empleado/gastos/aprobar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gastoId, accion: 'aprobar' }),
      });
      const data = await res.json();
      if (data.success) fetchGastos();
    } catch (error) {
      console.error('Error aprobando:', error);
    }
    setProcesando(null);
  }

  async function rechazar(gastoId: string) {
    if (!motivoRechazo.trim()) {
      alert('Debe indicar un motivo de rechazo');
      return;
    }
    setProcesando(gastoId);
    try {
      const res = await fetch('/api/empleado/gastos/aprobar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gastoId, accion: 'rechazar', motivo: motivoRechazo }),
      });
      const data = await res.json();
      if (data.success) {
        setShowRechazoModal(null);
        setMotivoRechazo('');
        fetchGastos();
      }
    } catch (error) {
      console.error('Error rechazando:', error);
    }
    setProcesando(null);
  }

  function formatEUR(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function formatFecha(f: string) {
    return new Date(f).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CheckBadgeIcon className="h-7 w-7 text-orange-600" />
          Aprobar Tickets de Gasto
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Revisa y aprueba los tickets de gasto de los empleados
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <button
          onClick={() => setFiltroEstado('PENDIENTE_APROBACION')}
          className={`bg-white rounded-xl border p-4 text-left transition-colors ${filtroEstado === 'PENDIENTE_APROBACION' ? 'ring-2 ring-orange-300' : ''}`}
        >
          <div className="flex items-center gap-2">
            <ClockIcon className="h-5 w-5 text-amber-500" />
            <p className="text-xs text-gray-500">Pendientes</p>
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-1">{resumen.pendientes}</p>
        </button>
        <button
          onClick={() => setFiltroEstado('APROBADO')}
          className={`bg-white rounded-xl border p-4 text-left transition-colors ${filtroEstado === 'APROBADO' ? 'ring-2 ring-orange-300' : ''}`}
        >
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="h-5 w-5 text-green-500" />
            <p className="text-xs text-gray-500">Aprobados</p>
          </div>
          <p className="text-2xl font-bold text-green-600 mt-1">{resumen.aprobados}</p>
        </button>
        <button
          onClick={() => setFiltroEstado('RECHAZADO')}
          className={`bg-white rounded-xl border p-4 text-left transition-colors ${filtroEstado === 'RECHAZADO' ? 'ring-2 ring-orange-300' : ''}`}
        >
          <div className="flex items-center gap-2">
            <XCircleIcon className="h-5 w-5 text-red-500" />
            <p className="text-xs text-gray-500">Rechazados</p>
          </div>
          <p className="text-2xl font-bold text-red-600 mt-1">{resumen.rechazados}</p>
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Empleado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Comercio / Concepto</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Proyecto</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Pago</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Importe</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ticket</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  <ArrowPathIcon className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Cargando...
                </td></tr>
              ) : gastos.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center">
                  <CheckBadgeIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">
                    {filtroEstado === 'PENDIENTE_APROBACION'
                      ? 'No hay tickets pendientes de aprobación'
                      : `No hay tickets ${filtroEstado === 'APROBADO' ? 'aprobados' : 'rechazados'}`
                    }
                  </p>
                </td></tr>
              ) : (
                gastos.map(g => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatFecha(g.fecha)}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{g.empleado || '—'}</p>
                      <p className="text-xs text-gray-400">{g.empleadoId}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-900">{g.comercio || g.concepto}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{g.clienteNombre || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{g.proyecto || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        g.metodoPago === 'DINERO_PROPIO' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {g.metodoPago === 'DINERO_PROPIO' ? 'Propio' : 'Empresa'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-right">
                      {g.importe > 0 ? formatEUR(g.importe) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {g.archivoUrl && (
                        <a href={g.archivoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex p-1.5 rounded hover:bg-gray-100">
                          <EyeIcon className="h-4 w-4 text-gray-500" />
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {g.estado === 'PENDIENTE_APROBACION' ? (
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => aprobar(g.id)}
                            disabled={procesando === g.id}
                            className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => setShowRechazoModal(g.id)}
                            disabled={procesando === g.id}
                            className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-50"
                          >
                            Rechazar
                          </button>
                        </div>
                      ) : g.estado === 'APROBADO' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                          <CheckCircleIcon className="h-4 w-4" />
                          Aprobado
                        </span>
                      ) : g.estado === 'RECHAZADO' ? (
                        <div>
                          <span className="inline-flex items-center gap-1 text-xs text-red-700">
                            <XCircleIcon className="h-4 w-4" />
                            Rechazado
                          </span>
                          {g.motivoRechazo && (
                            <p className="text-xs text-red-500 mt-0.5 max-w-[120px] truncate" title={g.motivoRechazo}>
                              {g.motivoRechazo}
                            </p>
                          )}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de rechazo */}
      {showRechazoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Rechazar ticket</h3>
            <p className="text-sm text-gray-500 mb-4">Indica el motivo del rechazo para que el empleado lo sepa:</p>
            <textarea
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              placeholder="Motivo del rechazo..."
              rows={3}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-200 focus:border-red-400"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setShowRechazoModal(null); setMotivoRechazo(''); }}
                className="flex-1 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => rechazar(showRechazoModal)}
                disabled={!motivoRechazo.trim()}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
