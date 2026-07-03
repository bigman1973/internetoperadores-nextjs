'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ReceiptPercentIcon, CameraIcon, ArrowUpTrayIcon, 
  MagnifyingGlassIcon, CheckCircleIcon, ClockIcon,
  XMarkIcon, ArrowPathIcon, EyeIcon, TrashIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';

interface Gasto {
  id: string;
  concepto: string;
  importe: number;
  fecha: string;
  tipo: string;
  departamento: string | null;
  empleado: string | null;
  empleadoId: string | null;
  comercio: string | null;
  cifComercio: string | null;
  tarjeta: string | null;
  archivoUrl: string | null;
  archivoNombre: string | null;
  ocrCompletado: boolean;
  ocrConfianza: number | null;
  deducibleIva: boolean;
  baseIva: number | null;
  importeIva: number | null;
  tipoIva: number | null;
  deducibleIS: boolean;
  categoriaIS: string | null;
  imputacion: string | null;
  clienteNombre: string | null;
  proyecto: string | null;
  metodoPago: string;
  motivoRechazo: string | null;
  aprobadoPor: string | null;
  estado: string;
  conciliado: boolean;
  movimientos?: { id: string; fechaOperacion: string; importe: number; concepto: string }[];
  createdAt: string;
}

const TIPOS_GASTO: Record<string, { label: string; color: string }> = {
  GASTO_GENERAL: { label: 'General', color: 'bg-gray-100 text-gray-700' },
  DIETA: { label: 'Dieta', color: 'bg-amber-100 text-amber-700' },
  DESPLAZAMIENTO: { label: 'Desplazamiento', color: 'bg-blue-100 text-blue-700' },
  MATERIAL: { label: 'Material', color: 'bg-purple-100 text-purple-700' },
  SUSCRIPCION: { label: 'Suscripción', color: 'bg-indigo-100 text-indigo-700' },
  PERSONAL: { label: 'Personal', color: 'bg-pink-100 text-pink-700' },
  COMBUSTIBLE: { label: 'Combustible', color: 'bg-orange-100 text-orange-700' },
  PARKING: { label: 'Parking', color: 'bg-cyan-100 text-cyan-700' },
  PEAJE: { label: 'Peaje', color: 'bg-teal-100 text-teal-700' },
  MATERIAL_OFICINA: { label: 'Mat. Oficina', color: 'bg-lime-100 text-lime-700' },
  SUMINISTROS: { label: 'Suministros', color: 'bg-emerald-100 text-emerald-700' },
  COMIDA: { label: 'Comida', color: 'bg-red-100 text-red-700' },
  ALOJAMIENTO: { label: 'Alojamiento', color: 'bg-violet-100 text-violet-700' },
  FORMACION: { label: 'Formación', color: 'bg-sky-100 text-sky-700' },
  HERRAMIENTAS: { label: 'Herramientas', color: 'bg-stone-100 text-stone-700' },
  OTROS: { label: 'Otros', color: 'bg-slate-100 text-slate-700' },
};

const ESTADOS_GASTO: Record<string, { label: string; color: string }> = {
  PENDIENTE: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700' },
  PENDIENTE_APROBACION: { label: 'Pte. Aprobación', color: 'bg-amber-100 text-amber-700' },
  APROBADO: { label: 'Aprobado', color: 'bg-green-100 text-green-700' },
  RECHAZADO: { label: 'Rechazado', color: 'bg-red-100 text-red-700' },
  CONTABILIZADO: { label: 'Contabilizado', color: 'bg-blue-100 text-blue-700' },
};

export default function TicketsPage() {
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [resumen, setResumen] = useState({ totalImporte: 0, totalIva: 0, totalBase: 0, numGastos: 0 });
  const [porTipo, setPorTipo] = useState<any[]>([]);
  
  // Filtros
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroConciliado, setFiltroConciliado] = useState('');
  
  // Modal de subida
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  
  // OCR
  const [ocrProcessing, setOcrProcessing] = useState<string | null>(null);
  
  // Detalle
  const [selectedGasto, setSelectedGasto] = useState<Gasto | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const fetchGastos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (filtroTipo) params.set('tipo', filtroTipo);
      if (filtroEstado) params.set('estado', filtroEstado);
      if (filtroConciliado) params.set('conciliado', filtroConciliado);
      
      const res = await fetch(`/api/admin/finanzas/tickets?${params}`);
      const data = await res.json();
      
      setGastos(data.gastos || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setResumen(data.resumen || { totalImporte: 0, totalIva: 0, totalBase: 0, numGastos: 0 });
      setPorTipo(data.porTipo || []);
    } catch (error) {
      console.error('Error cargando gastos:', error);
    }
    setLoading(false);
  }, [page, filtroTipo, filtroEstado, filtroConciliado]);

  useEffect(() => { fetchGastos(); }, [fetchGastos]);

  // Subir ticket
  async function handleUpload(file: File) {
    setUploading(true);
    setUploadProgress('Subiendo archivo...');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('concepto', file.name);
      
      const res = await fetch('/api/admin/finanzas/tickets/upload', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      setUploadProgress('Procesando OCR...');
      
      // Lanzar OCR automáticamente
      const ocrRes = await fetch(`/api/admin/finanzas/tickets/${data.gasto.id}/ocr`, {
        method: 'POST',
      });
      const ocrData = await ocrRes.json();
      
      if (ocrData.success) {
        setUploadProgress('¡Ticket procesado correctamente!');
      } else {
        setUploadProgress('Ticket subido. OCR pendiente de revisión.');
      }
      
      setTimeout(() => {
        setShowUpload(false);
        setUploadProgress('');
        fetchGastos();
      }, 1500);
    } catch (error: any) {
      setUploadProgress(`Error: ${error.message}`);
    }
    setUploading(false);
  }

  // Procesar OCR individual
  async function procesarOcr(gastoId: string) {
    setOcrProcessing(gastoId);
    try {
      const res = await fetch(`/api/admin/finanzas/tickets/${gastoId}/ocr`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        fetchGastos();
      }
    } catch (error) {
      console.error('Error OCR:', error);
    }
    setOcrProcessing(null);
  }

  // Eliminar gasto
  async function eliminarGasto(gastoId: string) {
    if (!confirm('¿Eliminar este ticket/gasto?')) return;
    try {
      await fetch(`/api/admin/finanzas/tickets/${gastoId}`, { method: 'DELETE' });
      fetchGastos();
    } catch (error) {
      console.error('Error eliminando:', error);
    }
  }

  // Buscar movimientos para conciliar
  async function buscarConciliacion(gastoId: string) {
    try {
      const gasto = gastos.find(g => g.id === gastoId);
      if (!gasto) return;
      
      const params = new URLSearchParams({
        importe: String(Math.abs(gasto.importe)),
        fecha: gasto.fecha,
        margen: '3',
      });
      
      const res = await fetch(`/api/admin/finanzas/conciliacion/buscar?${params}`);
      const data = await res.json();
      
      if (data.movimientos && data.movimientos.length > 0) {
        // Conciliar con el primer match
        const mov = data.movimientos[0];
        await fetch('/api/admin/finanzas/conciliacion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ movimientoId: mov.id, gastoId }),
        });
        fetchGastos();
      } else {
        alert('No se encontraron movimientos bancarios coincidentes (±3 días, mismo importe)');
      }
    } catch (error) {
      console.error('Error conciliación:', error);
    }
  }

  function formatEUR(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function formatFecha(f: string) {
    return new Date(f).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ReceiptPercentIcon className="h-7 w-7 text-orange-600" />
            Tickets y Gastos
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestión de tickets de compra, gastos menores y su conciliación bancaria
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            <ArrowUpTrayIcon className="h-5 w-5" />
            Subir Ticket
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Total Gastos</p>
          <p className="text-xl font-bold text-gray-900">{formatEUR(resumen.totalImporte)}</p>
          <p className="text-xs text-gray-400">{total} tickets</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">IVA Soportado</p>
          <p className="text-xl font-bold text-green-700">{formatEUR(resumen.totalIva)}</p>
          <p className="text-xs text-gray-400">Solo con CIF</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Base Deducible IS</p>
          <p className="text-xl font-bold text-blue-700">{formatEUR(resumen.totalImporte)}</p>
          <p className="text-xs text-gray-400">Imp. Sociedades</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Pendientes</p>
          <p className="text-xl font-bold text-amber-600">
            {gastos.filter(g => !g.conciliado).length}
          </p>
          <p className="text-xs text-gray-400">Sin conciliar</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => { setFiltroTipo(''); setFiltroEstado(''); setFiltroConciliado(''); setPage(1); }}
          className={`px-3 py-1.5 text-sm rounded-lg border ${!filtroTipo && !filtroEstado ? 'bg-orange-50 border-orange-200 text-orange-700' : 'text-gray-600'}`}
        >
          Todos ({total})
        </button>
        {Object.entries(TIPOS_GASTO).slice(0, 8).map(([key, val]) => (
          <button
            key={key}
            onClick={() => { setFiltroTipo(key); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-lg border ${filtroTipo === key ? 'bg-orange-50 border-orange-200 text-orange-700' : 'text-gray-600'}`}
          >
            {val.label}
          </button>
        ))}
        <div className="border-l mx-2" />
        <button
          onClick={() => { setFiltroConciliado(filtroConciliado === 'no' ? '' : 'no'); setPage(1); }}
          className={`px-3 py-1.5 text-sm rounded-lg border ${filtroConciliado === 'no' ? 'bg-red-50 border-red-200 text-red-700' : 'text-gray-600'}`}
        >
          Sin conciliar
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Comercio</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Concepto</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Importe</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">IVA</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Empleado</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">OCR</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Banco</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              ) : gastos.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                  No hay tickets. Sube un ticket con el botón superior.
                </td></tr>
              ) : (
                gastos.map(g => {
                  const tipoInfo = TIPOS_GASTO[g.tipo] || TIPOS_GASTO.GASTO_GENERAL;
                  return (
                    <tr key={g.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatFecha(g.fecha)}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{g.comercio || '—'}</div>
                        {g.cifComercio && <div className="text-xs text-gray-400">{g.cifComercio}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">{g.concepto}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${tipoInfo.color}`}>
                          {tipoInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-right">{formatEUR(g.importe)}</td>
                      <td className="px-4 py-3 text-sm text-right text-green-700">
                        {g.importeIva ? formatEUR(g.importeIva) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{g.empleado || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {g.ocrCompletado ? (
                          <CheckCircleIcon className="h-5 w-5 text-green-500 mx-auto" />
                        ) : g.archivoUrl ? (
                          <button
                            onClick={() => procesarOcr(g.id)}
                            disabled={ocrProcessing === g.id}
                            className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                          >
                            {ocrProcessing === g.id ? '...' : 'OCR'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {g.conciliado || (g.movimientos && g.movimientos.length > 0) ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                            <CheckCircleIcon className="h-3.5 w-3.5" />
                            Sí
                          </span>
                        ) : (
                          <button
                            onClick={() => buscarConciliacion(g.id)}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                            title="Buscar movimiento bancario"
                          >
                            <MagnifyingGlassIcon className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-1 justify-center">
                          {g.archivoUrl && (
                            <a
                              href={g.archivoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded hover:bg-gray-100"
                              title="Ver ticket"
                            >
                              <EyeIcon className="h-4 w-4 text-gray-500" />
                            </a>
                          )}
                          <button
                            onClick={() => eliminarGasto(g.id)}
                            className="p-1 rounded hover:bg-red-50"
                            title="Eliminar"
                          >
                            <TrashIcon className="h-4 w-4 text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">
              Página {page} de {totalPages} ({total} tickets)
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
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de subida */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Subir Ticket</h2>
              <button onClick={() => setShowUpload(false)} className="p-1 rounded-full hover:bg-gray-100">
                <XMarkIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {uploadProgress ? (
              <div className="text-center py-8">
                <ArrowPathIcon className={`h-8 w-8 mx-auto mb-3 text-orange-500 ${uploading ? 'animate-spin' : ''}`} />
                <p className="text-sm text-gray-700">{uploadProgress}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Cámara (móvil) */}
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full flex items-center gap-3 p-4 border-2 border-dashed rounded-xl hover:border-orange-300 hover:bg-orange-50 transition-colors"
                >
                  <CameraIcon className="h-8 w-8 text-orange-500" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">Hacer foto</p>
                    <p className="text-xs text-gray-500">Abre la cámara del dispositivo</p>
                  </div>
                </button>

                {/* Archivo (PC) */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 p-4 border-2 border-dashed rounded-xl hover:border-orange-300 hover:bg-orange-50 transition-colors"
                >
                  <DocumentTextIcon className="h-8 w-8 text-orange-500" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">Seleccionar archivo</p>
                    <p className="text-xs text-gray-500">JPG, PNG, WebP, HEIC o PDF</p>
                  </div>
                </button>

                {/* Inputs ocultos */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resumen por tipo (sidebar) */}
      {porTipo.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Desglose por categoría</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {porTipo.map((item: any) => {
              const tipoInfo = TIPOS_GASTO[item.tipo] || TIPOS_GASTO.GASTO_GENERAL;
              return (
                <div key={item.tipo} className="text-center p-2 rounded-lg bg-gray-50">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${tipoInfo.color}`}>
                    {tipoInfo.label}
                  </span>
                  <p className="text-sm font-bold mt-1">{formatEUR(item._sum.importe)}</p>
                  <p className="text-xs text-gray-400">{item._count} tickets</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
