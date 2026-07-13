'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  DocumentTextIcon, CheckCircleIcon, ClockIcon, XCircleIcon, 
  ArrowUpTrayIcon, CloudArrowDownIcon, ArrowPathIcon, EyeIcon,
  MagnifyingGlassIcon, XMarkIcon, CalendarDaysIcon, ChevronDownIcon
} from '@heroicons/react/24/outline';

interface Factura {
  id: string;
  proveedor: string;
  cif: string | null;
  numFactura: string | null;
  fecha: string;
  fechaVencimiento: string | null;
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
  ocrCompletado?: boolean;
  ocrConfianza?: number;
  carpetaOrigen?: string;
  archivoOneDrive?: string;
  movimientos?: { id: string; fechaOperacion: string; importe: number; concepto: string }[];
}

interface CarpetaStatus {
  total: number;
  nuevos: number;
  yaImportados: number;
}

interface SyncStatus {
  pendientes: CarpetaStatus;
  materiales: CarpetaStatus;
  trimestre1: CarpetaStatus;
  trimestre2: CarpetaStatus;
  trimestre3: CarpetaStatus;
  trimestre4: CarpetaStatus;
  confirming_draxton: CarpetaStatus;
  totalNuevos: number;
}

const ESTADOS = {
  PENDIENTE_REVISION: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: ClockIcon },
  VALIDADA: { label: 'Validada', color: 'bg-green-100 text-green-700', icon: CheckCircleIcon },
  CONTABILIZADA: { label: 'Contabilizada', color: 'bg-blue-100 text-blue-700', icon: DocumentTextIcon },
  RECHAZADA: { label: 'Rechazada', color: 'bg-red-100 text-red-700', icon: XCircleIcon },
};

export default function FacturasPage() {
  const router = useRouter();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [resumen, setResumen] = useState<any>(null);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroOcr, setFiltroOcr] = useState<'todos' | 'sinOcr' | 'sinImputar'>('todos');
  
  // Filtro por proveedor
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [proveedores, setProveedores] = useState<{nombre: string; facturas: number; total: number}[]>([]);
  const [showProveedorDropdown, setShowProveedorDropdown] = useState(false);
  const [busquedaProveedor, setBusquedaProveedor] = useState('');
  const proveedorRef = useRef<HTMLDivElement>(null);

  // Filtro por conciliación
  const [filtroConciliada, setFiltroConciliada] = useState<'' | 'true' | 'false'>('');

  // Conciliación inline
  const [concilFacturaId, setConcilFacturaId] = useState<string | null>(null);
  const [movCandidatos, setMovCandidatos] = useState<any[]>([]);
  const [loadingConcil, setLoadingConcil] = useState(false);

  // Filtro por fecha
  const [filtroFecha, setFiltroFecha] = useState<'todos' | 'mes' | 'trimestre' | 'anio' | 'personalizado'>('todos');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [mesSeleccionado, setMesSeleccionado] = useState('');
  const [trimestreSeleccionado, setTrimestreSeleccionado] = useState('');
  const [anioSeleccionado, setAnioSeleccionado] = useState('2026');
  const [showFechaDropdown, setShowFechaDropdown] = useState(false);
  const fechaRef = useRef<HTMLDivElement>(null);

  // Sincronización OneDrive
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [checkingSync, setCheckingSync] = useState(false);

  useEffect(() => {
    fetchFacturas();
  }, [page, filtroEstado, filtroOcr, filtroProveedor, fechaDesde, fechaHasta, filtroConciliada]);

  useEffect(() => {
    checkSyncStatus();
    fetchProveedores();
  }, []);

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (proveedorRef.current && !proveedorRef.current.contains(e.target as Node)) {
        setShowProveedorDropdown(false);
      }
      if (fechaRef.current && !fechaRef.current.contains(e.target as Node)) {
        setShowFechaDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function aplicarFiltroFecha(tipo: 'mes' | 'trimestre' | 'anio' | 'personalizado', valor?: string) {
    const anio = anioSeleccionado || '2026';
    let desde = '';
    let hasta = '';

    if (tipo === 'mes' && valor) {
      const mes = parseInt(valor);
      desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
      const ultimoDia = new Date(parseInt(anio), mes, 0).getDate();
      hasta = `${anio}-${String(mes).padStart(2, '0')}-${ultimoDia}`;
      setMesSeleccionado(valor);
      setTrimestreSeleccionado('');
    } else if (tipo === 'trimestre' && valor) {
      const t = parseInt(valor);
      const mesInicio = (t - 1) * 3 + 1;
      const mesFin = t * 3;
      desde = `${anio}-${String(mesInicio).padStart(2, '0')}-01`;
      const ultimoDia = new Date(parseInt(anio), mesFin, 0).getDate();
      hasta = `${anio}-${String(mesFin).padStart(2, '0')}-${ultimoDia}`;
      setTrimestreSeleccionado(valor);
      setMesSeleccionado('');
    } else if (tipo === 'anio') {
      desde = `${anio}-01-01`;
      hasta = `${anio}-12-31`;
      setMesSeleccionado('');
      setTrimestreSeleccionado('');
    }

    setFiltroFecha(tipo);
    setFechaDesde(desde);
    setFechaHasta(hasta);
    setPage(1);
    if (tipo !== 'personalizado') setShowFechaDropdown(false);
  }

  function limpiarFiltroFecha() {
    setFiltroFecha('todos');
    setFechaDesde('');
    setFechaHasta('');
    setMesSeleccionado('');
    setTrimestreSeleccionado('');
    setPage(1);
    setShowFechaDropdown(false);
  }

  function getFechaLabel(): string {
    if (filtroFecha === 'todos') return 'Periodo';
    if (filtroFecha === 'anio') return anioSeleccionado;
    if (filtroFecha === 'trimestre') return `T${trimestreSeleccionado} ${anioSeleccionado}`;
    if (filtroFecha === 'mes') {
      const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      return `${meses[parseInt(mesSeleccionado) - 1]} ${anioSeleccionado}`;
    }
    if (filtroFecha === 'personalizado') return `${fechaDesde} → ${fechaHasta}`;
    return 'Periodo';
  }

  async function fetchProveedores() {
    try {
      const res = await fetch('/api/admin/finanzas/facturas/proveedores');
      if (res.ok) {
        const data = await res.json();
        setProveedores(data.proveedores || []);
      }
    } catch (e) {
      console.error('Error fetching proveedores:', e);
    }
  }

  async function fetchFacturas() {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: '30' });
    if (filtroEstado) params.set('estado', filtroEstado);
    if (filtroOcr === 'sinOcr') params.set('sinOcr', 'true');
    if (filtroOcr === 'sinImputar') params.set('sinImputar', 'true');
    if (filtroProveedor) params.set('proveedor', filtroProveedor);
    if (fechaDesde) params.set('desde', fechaDesde);
    if (fechaHasta) params.set('hasta', fechaHasta);
    if (filtroConciliada) params.set('conciliada', filtroConciliada);
    
    const res = await fetch(`/api/admin/finanzas/facturas?${params}`);
    const json = await res.json();
    setFacturas(json.facturas || []);
    setTotal(json.total || 0);
    setResumen(json.resumenFiscal || null);
    setLoading(false);
  }

  async function checkSyncStatus() {
    setCheckingSync(true);
    try {
      const res = await fetch('/api/admin/finanzas/sincronizar-onedrive');
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch (e) {
      console.error('Error checking sync status:', e);
    }
    setCheckingSync(false);
  }

  async function sincronizarOneDrive(carpeta: string = 'ambas') {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/admin/finanzas/sincronizar-onedrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carpeta, limite: 10 }),
      });
      const data = await res.json();
      setSyncResult(data);
      // Refrescar facturas y estado
      fetchFacturas();
      checkSyncStatus();
    } catch (e: any) {
      setSyncResult({ error: e.message });
    }
    setSyncing(false);
  }

  async function actualizarEstado(id: string, estado: string) {
    await fetch(`/api/admin/finanzas/facturas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    });
    fetchFacturas();
  }

  async function buscarMovCandidatos(facturaId: string) {
    if (concilFacturaId === facturaId) {
      setConcilFacturaId(null);
      setMovCandidatos([]);
      return;
    }
    setConcilFacturaId(facturaId);
    setLoadingConcil(true);
    setMovCandidatos([]);
    try {
      const res = await fetch(`/api/admin/finanzas/facturas/${facturaId}/movimientos-candidatos`);
      const json = await res.json();
      setMovCandidatos(json.candidatos || []);
    } catch (e) {
      console.error(e);
    }
    setLoadingConcil(false);
  }

  async function conciliarDesdeFactura(movimientoId: string, facturaId: string) {
    await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conciliado: true, facturaId }),
    });
    setConcilFacturaId(null);
    setMovCandidatos([]);
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
        <div className="flex gap-2">
          <button 
            onClick={() => sincronizarOneDrive('todas')}
            disabled={syncing}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
            ) : (
              <CloudArrowDownIcon className="h-4 w-4" />
            )}
            {syncing ? 'Sincronizando...' : 'Sincronizar OneDrive'}
          </button>
          <button className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 flex items-center gap-2">
            <ArrowUpTrayIcon className="h-4 w-4" />
            Subir Factura
          </button>
        </div>
      </div>

      {/* Panel de sincronización OneDrive */}
      {syncStatus && syncStatus.totalNuevos > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <CloudArrowDownIcon className="h-6 w-6 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-900">
                  {syncStatus.totalNuevos} facturas nuevas en OneDrive
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {[  
                    syncStatus.pendientes?.nuevos > 0 && `${syncStatus.pendientes.nuevos} Pendientes`,
                    syncStatus.materiales?.nuevos > 0 && `${syncStatus.materiales.nuevos} Materiales`,
                    syncStatus.trimestre1?.nuevos > 0 && `${syncStatus.trimestre1.nuevos} T1`,
                    syncStatus.trimestre2?.nuevos > 0 && `${syncStatus.trimestre2.nuevos} T2`,
                    syncStatus.trimestre3?.nuevos > 0 && `${syncStatus.trimestre3.nuevos} T3`,
                    syncStatus.trimestre4?.nuevos > 0 && `${syncStatus.trimestre4.nuevos} T4`,
                    syncStatus.confirming_draxton?.nuevos > 0 && `${syncStatus.confirming_draxton.nuevos} Confirming`,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => sincronizarOneDrive('todas')}
                disabled={syncing}
                className="text-xs px-3 py-1.5 bg-blue-600 border border-blue-600 rounded-md text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Todas ({syncStatus.totalNuevos})
              </button>
              <button
                onClick={() => sincronizarOneDrive('pendiente')}
                disabled={syncing || !syncStatus.pendientes?.nuevos}
                className="text-xs px-3 py-1.5 bg-white border border-blue-200 rounded-md text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                Pendientes ({syncStatus.pendientes?.nuevos || 0})
              </button>
              <button
                onClick={() => sincronizarOneDrive('materiales')}
                disabled={syncing || !syncStatus.materiales?.nuevos}
                className="text-xs px-3 py-1.5 bg-white border border-blue-200 rounded-md text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                Materiales ({syncStatus.materiales?.nuevos || 0})
              </button>
              <button
                onClick={() => sincronizarOneDrive('trimestre1')}
                disabled={syncing || !syncStatus.trimestre1?.nuevos}
                className="text-xs px-3 py-1.5 bg-white border border-blue-200 rounded-md text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                T1 ({syncStatus.trimestre1?.nuevos || 0})
              </button>
              <button
                onClick={() => sincronizarOneDrive('trimestre2')}
                disabled={syncing || !syncStatus.trimestre2?.nuevos}
                className="text-xs px-3 py-1.5 bg-white border border-blue-200 rounded-md text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                T2 ({syncStatus.trimestre2?.nuevos || 0})
              </button>
              <button
                onClick={() => sincronizarOneDrive('confirming_draxton')}
                disabled={syncing || !syncStatus.confirming_draxton?.nuevos}
                className="text-xs px-3 py-1.5 bg-white border border-purple-200 rounded-md text-purple-700 hover:bg-purple-100 disabled:opacity-50"
              >
                Confirming Draxton ({syncStatus.confirming_draxton?.nuevos || 0})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resultado de sincronización */}
      {syncResult && (
        <div className={`rounded-lg p-4 border ${syncResult.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          {syncResult.error ? (
            <p className="text-sm text-red-700">Error: {syncResult.error}</p>
          ) : (
            <div>
              <p className="text-sm font-medium text-green-800">{syncResult.mensaje}</p>
              {syncResult.resultados && syncResult.resultados.length > 0 && (
                <div className="mt-2 space-y-1">
                  {syncResult.resultados.slice(0, 5).map((r: any, i: number) => (
                    <p key={i} className="text-xs text-green-700">
                      {r.estado === 'ok' ? '✅' : '❌'} {r.archivo} 
                      {r.proveedor && ` → ${r.proveedor}`}
                      {r.total ? ` (${formatEUR(r.total)})` : ''}
                      {r.error && ` - ${r.error}`}
                    </p>
                  ))}
                  {syncResult.resultados.length > 5 && (
                    <p className="text-xs text-green-600">... y {syncResult.resultados.length - 5} más</p>
                  )}
                </div>
              )}
              <button
                onClick={() => setSyncResult(null)}
                className="mt-2 text-xs text-green-600 underline"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Resumen fiscal */}
      {resumen && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500">Nº Facturas</p>
            <p className="text-lg font-bold text-gray-900">{resumen.numFacturas}</p>
          </div>
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

      {/* Filtros: Proveedor + Fecha */}
      <div className="flex gap-4 items-start flex-wrap">

      {/* Filtro por proveedor */}
      <div className="flex gap-3 items-center flex-wrap" ref={proveedorRef}>
        <div className="relative">
          <div className="flex items-center">
            <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-3" />
            <input
              type="text"
              placeholder="Filtrar por proveedor..."
              value={busquedaProveedor}
              onChange={(e) => {
                setBusquedaProveedor(e.target.value);
                setShowProveedorDropdown(true);
              }}
              onFocus={() => setShowProveedorDropdown(true)}
              className="pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg w-64 focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
            />
            {(filtroProveedor || busquedaProveedor) && (
              <button
                onClick={() => { setFiltroProveedor(''); setBusquedaProveedor(''); setPage(1); }}
                className="absolute right-2 text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          {showProveedorDropdown && (
            <div className="absolute z-50 mt-1 w-96 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
              {proveedores
                .filter(p => !busquedaProveedor || p.nombre.toLowerCase().includes(busquedaProveedor.toLowerCase()))
                .slice(0, 20)
                .map(p => (
                  <button
                    key={p.nombre}
                    onClick={() => {
                      setFiltroProveedor(p.nombre);
                      setBusquedaProveedor(p.nombre);
                      setShowProveedorDropdown(false);
                      setPage(1);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-orange-50 flex justify-between items-center ${
                      filtroProveedor === p.nombre ? 'bg-orange-50 text-orange-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    <span className="truncate mr-2">{p.nombre}</span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{p.facturas} fra · {formatEUR(p.total)}</span>
                  </button>
                ))}
              {proveedores.filter(p => !busquedaProveedor || p.nombre.toLowerCase().includes(busquedaProveedor.toLowerCase())).length === 0 && (
                <p className="px-4 py-3 text-sm text-gray-400">No se encontraron proveedores</p>
              )}
            </div>
          )}
        </div>
        {filtroProveedor && (
          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full flex items-center gap-1">
            {filtroProveedor}
            <button onClick={() => { setFiltroProveedor(''); setBusquedaProveedor(''); setPage(1); }}>
              <XMarkIcon className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      {/* Filtro por fecha */}
      <div className="relative" ref={fechaRef}>
        <button
          onClick={() => setShowFechaDropdown(!showFechaDropdown)}
          className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg ${
            filtroFecha !== 'todos' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <CalendarDaysIcon className="h-4 w-4" />
          <span>{getFechaLabel()}</span>
          <ChevronDownIcon className="h-3 w-3" />
        </button>
        {filtroFecha !== 'todos' && (
          <button
            onClick={limpiarFiltroFecha}
            className="absolute -top-1 -right-1 bg-blue-500 text-white rounded-full p-0.5"
          >
            <XMarkIcon className="h-3 w-3" />
          </button>
        )}
        {showFechaDropdown && (
          <div className="absolute z-50 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
            {/* Selector de año */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-500 font-medium">Año:</span>
              {['2025', '2026'].map(a => (
                <button
                  key={a}
                  onClick={() => { setAnioSeleccionado(a); }}
                  className={`px-2 py-1 text-xs rounded ${
                    anioSeleccionado === a ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {a}
                </button>
              ))}
              <button
                onClick={() => aplicarFiltroFecha('anio')}
                className="ml-auto px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Todo {anioSeleccionado}
              </button>
            </div>

            {/* Trimestres */}
            <div className="mb-3">
              <span className="text-xs text-gray-500 font-medium block mb-1">Trimestre:</span>
              <div className="grid grid-cols-4 gap-1">
                {[1, 2, 3, 4].map(t => (
                  <button
                    key={t}
                    onClick={() => aplicarFiltroFecha('trimestre', String(t))}
                    className={`px-2 py-1.5 text-xs rounded border ${
                      trimestreSeleccionado === String(t) && filtroFecha === 'trimestre'
                        ? 'bg-blue-100 border-blue-300 text-blue-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    T{t}
                  </button>
                ))}
              </div>
            </div>

            {/* Meses */}
            <div className="mb-3">
              <span className="text-xs text-gray-500 font-medium block mb-1">Mes:</span>
              <div className="grid grid-cols-6 gap-1">
                {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m, i) => (
                  <button
                    key={m}
                    onClick={() => aplicarFiltroFecha('mes', String(i + 1))}
                    className={`px-1 py-1.5 text-xs rounded border ${
                      mesSeleccionado === String(i + 1) && filtroFecha === 'mes'
                        ? 'bg-blue-100 border-blue-300 text-blue-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Personalizado */}
            <div className="border-t pt-2">
              <span className="text-xs text-gray-500 font-medium block mb-1">Personalizado:</span>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={filtroFecha === 'personalizado' ? fechaDesde : ''}
                  onChange={(e) => {
                    setFechaDesde(e.target.value);
                    setFiltroFecha('personalizado');
                    setMesSeleccionado('');
                    setTrimestreSeleccionado('');
                  }}
                  className="text-xs border border-gray-300 rounded px-2 py-1 w-32"
                />
                <span className="text-xs text-gray-400">a</span>
                <input
                  type="date"
                  value={filtroFecha === 'personalizado' ? fechaHasta : ''}
                  onChange={(e) => {
                    setFechaHasta(e.target.value);
                    setFiltroFecha('personalizado');
                    setMesSeleccionado('');
                    setTrimestreSeleccionado('');
                    setPage(1);
                    setShowFechaDropdown(false);
                  }}
                  className="text-xs border border-gray-300 rounded px-2 py-1 w-32"
                />
              </div>
            </div>

            {/* Limpiar */}
            {filtroFecha !== 'todos' && (
              <button
                onClick={limpiarFiltroFecha}
                className="mt-2 w-full text-xs text-center text-gray-500 hover:text-gray-700 py-1"
              >
                Limpiar filtro de fecha
              </button>
            )}
          </div>
        )}
      </div>

      </div>{/* Cierre del div contenedor de filtros proveedor + fecha */}

      {/* Filtros de estado */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => { setFiltroEstado(''); setFiltroOcr('todos'); setPage(1); }}
          className={`px-3 py-1.5 text-sm rounded-lg border ${!filtroEstado && filtroOcr === 'todos' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'text-gray-600'}`}
        >
          Todas
        </button>
        {Object.entries(ESTADOS).map(([key, val]) => (
          <button
            key={key}
            onClick={() => { setFiltroEstado(key); setFiltroOcr('todos'); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-lg border ${filtroEstado === key && filtroOcr === 'todos' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'text-gray-600'}`}
          >
            {val.label}
          </button>
        ))}
        <span className="border-l mx-1"></span>
        <button
          onClick={() => { setFiltroEstado(''); setFiltroOcr('sinOcr'); setPage(1); }}
          className={`px-3 py-1.5 text-sm rounded-lg border ${filtroOcr === 'sinOcr' ? 'bg-red-50 border-red-200 text-red-700' : 'text-gray-600'}`}
        >
          Sin datos OCR
        </button>
        <button
          onClick={() => { setFiltroEstado(''); setFiltroOcr('sinImputar'); setPage(1); }}
          className={`px-3 py-1.5 text-sm rounded-lg border ${filtroOcr === 'sinImputar' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'text-gray-600'}`}
        >
          Sin imputar
        </button>
        <span className="border-l mx-1"></span>
        <button
          onClick={() => { setFiltroConciliada(filtroConciliada === 'true' ? '' : 'true'); setPage(1); }}
          className={`px-3 py-1.5 text-sm rounded-lg border ${filtroConciliada === 'true' ? 'bg-green-50 border-green-200 text-green-700' : 'text-gray-600'}`}
        >
          Conciliadas
        </button>
        <button
          onClick={() => { setFiltroConciliada(filtroConciliada === 'false' ? '' : 'false'); setPage(1); }}
          className={`px-3 py-1.5 text-sm rounded-lg border ${filtroConciliada === 'false' ? 'bg-red-50 border-red-200 text-red-700' : 'text-gray-600'}`}
        >
          Sin conciliar
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vto.</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nº Factura</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Concepto</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Base</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">IVA</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Imputación</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Carpeta</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase" title="Conciliación bancaria">Banco</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={13} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              ) : facturas.length === 0 ? (
                <tr><td colSpan={13} className="px-4 py-8 text-center text-gray-400">No hay facturas. Sincroniza OneDrive o sube una factura manualmente.</td></tr>
              ) : (
                facturas.map(f => {
                  const estadoInfo = ESTADOS[f.estado as keyof typeof ESTADOS] || ESTADOS.PENDIENTE_REVISION;
                  return (
                    <React.Fragment key={f.id}>
                    <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/admin/finanzas/facturas/${f.id}`)}>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatFecha(f.fecha)}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{f.fechaVencimiento ? formatFecha(f.fechaVencimiento) : '—'}</td>
                      <td className="px-4 py-3">
                        <a href={`/admin/finanzas/facturas/${f.id}`} className="text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline">{f.proveedor}</a>
                        {f.cif && <div className="text-xs text-gray-400">{f.cif}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{f.numFactura || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">{f.concepto || '—'}</td>
                      <td className="px-4 py-3 text-sm text-right">{formatEUR(f.base)}</td>
                      <td className="px-4 py-3 text-sm text-right text-green-700">{formatEUR(f.importeIva)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-right">{formatEUR(f.total)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                          {f.imputacion || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {f.carpetaOrigen && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            f.carpetaOrigen === 'T1' ? 'bg-emerald-50 text-emerald-700' :
                            f.carpetaOrigen === 'T2' ? 'bg-teal-50 text-teal-700' :
                            f.carpetaOrigen === 'Confirming' ? 'bg-purple-50 text-purple-700' :
                            f.carpetaOrigen === 'Materiales' ? 'bg-yellow-50 text-yellow-700' :
                            'bg-gray-50 text-gray-600'
                          }`}>
                            {f.carpetaOrigen}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${estadoInfo.color}`}>
                          {estadoInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        {f.movimientos && f.movimientos.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700" title={`Conciliada: ${f.movimientos[0].concepto}`}>
                            <CheckCircleIcon className="h-3.5 w-3.5" />
                            Sí
                          </span>
                        ) : (
                          <button
                            onClick={() => buscarMovCandidatos(f.id)}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${
                              concilFacturaId === f.id
                                ? 'bg-blue-100 border-blue-300 text-blue-700'
                                : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600'
                            }`}
                            title="Conciliar — Buscar y vincular movimientos bancarios coincidentes"
                          >
                            <MagnifyingGlassIcon className="h-3.5 w-3.5" />
                            Conciliar
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-center">
                          {f.archivoOneDrive && (
                            <a
                              href={`/api/admin/finanzas/facturas/${f.id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-700"
                              title="Ver documento PDF de la factura"
                            >
                              <EyeIcon className="h-5 w-5" />
                            </a>
                          )}
                          {f.estado === 'PENDIENTE_REVISION' && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); actualizarEstado(f.id, 'VALIDADA'); }}
                                className="text-green-600 hover:text-green-800"
                                title="Validar factura — Marcar como revisada y correcta"
                              >
                                <CheckCircleIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); actualizarEstado(f.id, 'RECHAZADA'); }}
                                className="text-red-400 hover:text-red-600"
                                title="Rechazar factura — Marcar como incorrecta o no válida"
                              >
                                <XCircleIcon className="h-5 w-5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {concilFacturaId === f.id && (
                      <tr className="concil-row">
                        <td colSpan={13} className="px-4 py-3 bg-blue-50 border-l-4 border-blue-400">
                          {loadingConcil ? (
                            <p className="text-sm text-gray-500">Buscando movimientos...</p>
                          ) : movCandidatos.length === 0 ? (
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-gray-500">No se encontraron movimientos bancarios coincidentes para esta factura.</p>
                              <button onClick={() => setConcilFacturaId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cerrar</button>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-medium text-blue-800">Movimientos bancarios coincidentes ({movCandidatos.length})</p>
                                <button onClick={() => setConcilFacturaId(null)} className="text-xs text-gray-400 hover:text-gray-600">✕ Cerrar</button>
                              </div>
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {movCandidatos.map(mov => (
                                  <div key={mov.id} className="flex items-center justify-between bg-white rounded px-3 py-2 border border-gray-200">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-3">
                                        <span className="text-xs text-gray-500 whitespace-nowrap">{formatFecha(mov.fechaOperacion)}</span>
                                        <span className="text-xs font-medium text-gray-400">{mov.banco}</span>
                                        <span className="text-sm text-gray-700 truncate max-w-[300px]">{mov.concepto}</span>
                                      </div>
                                      <div className="flex gap-2 mt-0.5">
                                        {mov.reasons.map((r: string, i: number) => (
                                          <span key={i} className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">{r}</span>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3 ml-4">
                                      <span className="text-sm font-bold text-red-600 whitespace-nowrap">{formatEUR(mov.importe)}</span>
                                      <button
                                        onClick={() => conciliarDesdeFactura(mov.id, f.id)}
                                        className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                                      >
                                        Vincular
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
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
