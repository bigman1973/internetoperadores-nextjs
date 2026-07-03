'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import {
  ReceiptPercentIcon, CameraIcon, ArrowUpTrayIcon,
  CheckCircleIcon, ClockIcon, XCircleIcon,
  XMarkIcon, ArrowPathIcon, DocumentTextIcon,
  PlusIcon, EyeIcon,
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
  archivoUrl: string | null;
  archivoNombre: string | null;
  ocrCompletado: boolean;
  estado: string;
  motivoRechazo: string | null;
  empleado: string | null;
  empleadoId: string | null;
  createdAt: string;
}

interface Cliente {
  nombre: string;
  esEstructura: boolean;
}

const ESTADOS: Record<string, { label: string; color: string; icon: any }> = {
  PENDIENTE_APROBACION: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: ClockIcon },
  APROBADO: { label: 'Aprobado', color: 'bg-green-100 text-green-700', icon: CheckCircleIcon },
  RECHAZADO: { label: 'Rechazado', color: 'bg-red-100 text-red-700', icon: XCircleIcon },
  CONTABILIZADO: { label: 'Contabilizado', color: 'bg-blue-100 text-blue-700', icon: CheckCircleIcon },
  PENDIENTE: { label: 'Borrador', color: 'bg-gray-100 text-gray-700', icon: ClockIcon },
};

export default function EmpleadoGastosPage() {
  const { data: session } = useSession();
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [verTodos, setVerTodos] = useState(false);
  const [filtroEmpleado, setFiltroEmpleado] = useState('');
  const [empleados, setEmpleados] = useState<string[]>([]);

  // Modal de subida
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<'form' | 'uploading' | 'done' | 'error'>('form');
  const [uploadMessage, setUploadMessage] = useState('');

  // Formulario
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clienteNombre, setClienteNombre] = useState('');
  const [proyecto, setProyecto] = useState('');
  const [metodoPago, setMetodoPago] = useState('TARJETA_EMPRESA');
  const [concepto, setConcepto] = useState('');

  // Búsqueda de clientes
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSearch, setClienteSearch] = useState('');
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const fetchGastos = useCallback(async () => {
    setLoading(true);
    try {
      const url = filtroEmpleado 
        ? `/api/empleado/gastos?empleado=${encodeURIComponent(filtroEmpleado)}`
        : '/api/empleado/gastos';
      const res = await fetch(url);
      const data = await res.json();
      setGastos(data.gastos || []);
      setTotal(data.total || 0);
      setVerTodos(data.verTodos || false);
      // Extraer lista de empleados únicos para el filtro
      if (data.verTodos && data.gastos) {
        const emails = [...new Set(data.gastos.map((g: Gasto) => g.empleadoId).filter(Boolean))] as string[];
        setEmpleados(prev => {
          const combined = [...new Set([...prev, ...emails])];
          return combined;
        });
      }
    } catch (error) {
      console.error('Error cargando gastos:', error);
    }
    setLoading(false);
  }, [filtroEmpleado]);

  useEffect(() => { fetchGastos(); }, [fetchGastos]);

  // Cargar lista completa de empleados al inicio si es supervisor
  useEffect(() => {
    if (verTodos) {
      fetch('/api/empleado/gastos')
        .then(res => res.json())
        .then(data => {
          if (data.gastos) {
            const emails = [...new Set(data.gastos.map((g: Gasto) => g.empleadoId).filter(Boolean))] as string[];
            setEmpleados(emails);
          }
        })
        .catch(() => {});
    }
  }, [verTodos]);

  // Buscar clientes
  async function buscarClientes(q: string) {
    try {
      const res = await fetch(`/api/empleado/gastos/clientes?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setClientes(data.clientes || []);
    } catch (e) {
      console.error('Error buscando clientes:', e);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      buscarClientes(clienteSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [clienteSearch]);

  // Seleccionar archivo
  function handleFileSelect(file: File) {
    setSelectedFile(file);
  }

  // Enviar formulario
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;
    if (!clienteNombre) {
      alert('Debe seleccionar un cliente');
      return;
    }

    setUploading(true);
    setUploadStep('uploading');
    setUploadMessage('Subiendo ticket...');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('clienteNombre', clienteNombre);
      formData.append('proyecto', proyecto);
      formData.append('metodoPago', metodoPago);
      formData.append('concepto', concepto);

      const res = await fetch('/api/empleado/gastos', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al subir');
      }

      setUploadStep('done');
      setUploadMessage('Ticket subido correctamente. Pendiente de aprobación.');

      setTimeout(() => {
        resetForm();
        fetchGastos();
      }, 2000);
    } catch (error: any) {
      setUploadStep('error');
      setUploadMessage(error.message);
    }
    setUploading(false);
  }

  function resetForm() {
    setShowUpload(false);
    setSelectedFile(null);
    setClienteNombre('');
    setClienteSearch('');
    setProyecto('');
    setMetodoPago('TARJETA_EMPRESA');
    setConcepto('');
    setUploadStep('form');
    setUploadMessage('');
  }

  function formatEUR(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function formatFecha(f: string) {
    return new Date(f).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ReceiptPercentIcon className="h-7 w-7 text-orange-600" />
            {verTodos ? 'Tickets de Gasto - Todos los empleados' : 'Mis Tickets de Gasto'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {verTodos ? 'Vista de supervisor: todos los tickets del equipo' : 'Sube tickets de compra para su aprobación y reembolso'}
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors shadow-sm"
        >
          <PlusIcon className="h-5 w-5" />
          Subir Ticket
        </button>
      </div>

      {/* Filtro por empleado (solo SUPER_ADMIN) */}
      {verTodos && (
        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Filtrar por empleado:</label>
          <select
            value={filtroEmpleado}
            onChange={(e) => setFiltroEmpleado(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 min-w-[250px]"
          >
            <option value="">Todos los empleados</option>
            {empleados.map(email => (
              <option key={email} value={email}>{email}</option>
            ))}
          </select>
          {filtroEmpleado && (
            <button
              onClick={() => setFiltroEmpleado('')}
              className="text-sm text-orange-600 hover:underline"
            >
              Limpiar filtro
            </button>
          )}
        </div>
      )}

      {/* Resumen rápido */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Total subidos</p>
          <p className="text-xl font-bold text-gray-900">{total}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Pendientes</p>
          <p className="text-xl font-bold text-amber-600">
            {gastos.filter(g => g.estado === 'PENDIENTE_APROBACION').length}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Aprobados</p>
          <p className="text-xl font-bold text-green-600">
            {gastos.filter(g => g.estado === 'APROBADO' || g.estado === 'CONTABILIZADO').length}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Rechazados</p>
          <p className="text-xl font-bold text-red-600">
            {gastos.filter(g => g.estado === 'RECHAZADO').length}
          </p>
        </div>
      </div>

      {/* Tabla de tickets */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Comercio</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Proyecto</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Pago</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Importe</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              ) : gastos.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center">
                  <ReceiptPercentIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No tienes tickets de gasto</p>
                  <p className="text-sm text-gray-400 mt-1">Pulsa "Subir Ticket" para empezar</p>
                </td></tr>
              ) : (
                gastos.map(g => {
                  const estadoInfo = ESTADOS[g.estado] || ESTADOS.PENDIENTE;
                  const Icon = estadoInfo.icon;
                  return (
                    <tr key={g.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatFecha(g.fecha)}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{g.comercio || g.concepto}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{g.clienteNombre || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{g.proyecto || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          g.metodoPago === 'DINERO_PROPIO' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {g.metodoPago === 'DINERO_PROPIO' ? 'Mi dinero' : 'Tarjeta empresa'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-right">
                        {g.importe > 0 ? formatEUR(g.importe) : <span className="text-gray-400">OCR...</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${estadoInfo.color}`}>
                          <Icon className="h-3.5 w-3.5" />
                          {estadoInfo.label}
                        </span>
                        {g.estado === 'RECHAZADO' && g.motivoRechazo && (
                          <p className="text-xs text-red-500 mt-1 max-w-[150px] truncate" title={g.motivoRechazo}>
                            {g.motivoRechazo}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {g.archivoUrl && (
                          <a href={g.archivoUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-gray-100 inline-block">
                            <EyeIcon className="h-4 w-4 text-gray-500" />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de subida */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Subir Ticket de Gasto</h2>
              <button onClick={resetForm} className="p-1 rounded-full hover:bg-gray-100">
                <XMarkIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {uploadStep === 'uploading' || uploadStep === 'done' || uploadStep === 'error' ? (
              <div className="text-center py-8">
                <ArrowPathIcon className={`h-10 w-10 mx-auto mb-3 ${
                  uploadStep === 'uploading' ? 'text-orange-500 animate-spin' :
                  uploadStep === 'done' ? 'text-green-500' : 'text-red-500'
                }`} />
                <p className={`text-sm ${
                  uploadStep === 'done' ? 'text-green-700' :
                  uploadStep === 'error' ? 'text-red-700' : 'text-gray-700'
                }`}>{uploadMessage}</p>
                {uploadStep === 'error' && (
                  <button onClick={() => setUploadStep('form')} className="mt-4 text-sm text-orange-600 hover:underline">
                    Reintentar
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Archivo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Foto del ticket *
                  </label>
                  {selectedFile ? (
                    <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <DocumentTextIcon className="h-6 w-6 text-green-600" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-green-800 truncate">{selectedFile.name}</p>
                        <p className="text-xs text-green-600">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <button type="button" onClick={() => setSelectedFile(null)} className="text-green-600 hover:text-green-800">
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-xl hover:border-orange-300 hover:bg-orange-50 transition-colors"
                      >
                        <CameraIcon className="h-8 w-8 text-orange-500" />
                        <span className="text-sm font-medium text-gray-700">Hacer foto</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-xl hover:border-orange-300 hover:bg-orange-50 transition-colors"
                      >
                        <ArrowUpTrayIcon className="h-8 w-8 text-orange-500" />
                        <span className="text-sm font-medium text-gray-700">Archivo</span>
                      </button>
                    </div>
                  )}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                  />
                </div>

                {/* Cliente */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cliente *
                  </label>
                  <input
                    type="text"
                    value={clienteSearch}
                    onChange={(e) => {
                      setClienteSearch(e.target.value);
                      setShowClienteDropdown(true);
                      if (!e.target.value) setClienteNombre('');
                    }}
                    onFocus={() => { setShowClienteDropdown(true); buscarClientes(clienteSearch); }}
                    placeholder="Buscar cliente o seleccionar Internet Operadores..."
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                  />
                  {clienteNombre && (
                    <p className="text-xs text-green-600 mt-1">Seleccionado: {clienteNombre}</p>
                  )}
                  {showClienteDropdown && clientes.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {clientes.map((c, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setClienteNombre(c.nombre);
                            setClienteSearch(c.nombre);
                            setShowClienteDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 ${
                            c.esEstructura ? 'font-medium text-orange-700 bg-orange-25' : 'text-gray-700'
                          }`}
                        >
                          {c.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Proyecto */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Proyecto
                  </label>
                  <input
                    type="text"
                    value={proyecto}
                    onChange={(e) => setProyecto(e.target.value)}
                    placeholder="Nombre del proyecto (opcional)"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                  />
                </div>

                {/* Método de pago */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ¿Cómo has pagado? *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setMetodoPago('TARJETA_EMPRESA')}
                      className={`p-3 rounded-lg border-2 text-center transition-colors ${
                        metodoPago === 'TARJETA_EMPRESA'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <p className="text-sm font-medium">Tarjeta empresa</p>
                      <p className="text-xs mt-0.5 opacity-70">Se concilia con banco</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoPago('DINERO_PROPIO')}
                      className={`p-3 rounded-lg border-2 text-center transition-colors ${
                        metodoPago === 'DINERO_PROPIO'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <p className="text-sm font-medium">Mi dinero</p>
                      <p className="text-xs mt-0.5 opacity-70">Se reembolsa en nómina</p>
                    </button>
                  </div>
                </div>

                {/* Concepto (opcional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Concepto (opcional)
                  </label>
                  <input
                    type="text"
                    value={concepto}
                    onChange={(e) => setConcepto(e.target.value)}
                    placeholder="Breve descripción del gasto"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                  />
                  <p className="text-xs text-gray-400 mt-1">El OCR extraerá el concepto automáticamente si lo dejas vacío</p>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={!selectedFile || !clienteNombre || uploading}
                  className="w-full py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Enviar para aprobación
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
