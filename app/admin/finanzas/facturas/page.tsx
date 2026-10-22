'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  DocumentTextIcon, CheckCircleIcon, ClockIcon, XCircleIcon, 
  ArrowUpTrayIcon, CloudArrowDownIcon, ArrowPathIcon, EyeIcon,
  MagnifyingGlassIcon, XMarkIcon, CalendarDaysIcon, ChevronDownIcon
} from '@heroicons/react/24/outline';
import { useRole } from '@/components/admin/RoleContext';
import InvoiceLocationHistory from '@/components/finanzas/InvoiceLocationHistory';
import InvoiceQualityWorkspace from '@/components/finanzas/InvoiceQualityWorkspace';
import FiscalEstimatePanel from '@/components/finanzas/fiscal-estimate/FiscalEstimatePanel';

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
  oneDriveItemId?: string;
  estadoCarpeta?: string;
  etiquetaMateriales?: boolean;
  movimientos?: { id: string; fechaOperacion: string; importe: number; concepto: string }[];
}

type EstadoCarpeta = 'VACIA' | 'SIN_NOVEDADES' | 'CON_NOVEDADES' | 'ERROR';

interface CarpetaStatus {
  estado?: EstadoCarpeta;
  total: number | null;
  nuevos: number | null;
  yaImportados: number | null;
  admitidos: number | null;
  error?: string;
}

interface SyncError {
  carpeta: string;
  error: string;
}

interface SyncStatus {
  [key: string]: unknown;
  pendientes?: unknown;
  pendiente?: unknown;
  materiales?: unknown;
  trimestre1?: unknown;
  trimestre2?: unknown;
  trimestre3?: unknown;
  trimestre4?: unknown;
  confirming_draxton?: unknown;
  raiz?: unknown;
  totalNuevos?: number | null;
  totalArchivos?: number | null;
  totalImportados?: number | null;
  inventarioCompleto?: boolean;
  sandbox?: boolean;
  canWrite?: boolean;
  ubicacion?: {
    siteId?: string;
    siteName?: string;
    driveId?: string;
    driveName?: string;
    rootPath?: string;
  };
  errores?: unknown;
  errors?: unknown;
  error?: string;
}

const SIN_DATO = 'No disponible';

function numeroNullable(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

/** Accepts the B1 contract and the old numeric/object response while never turning failures into zeroes. */
function normalizarCarpeta(valor: unknown): CarpetaStatus {
  if (typeof valor === 'number') {
    return { estado: valor > 0 ? 'CON_NOVEDADES' : 'VACIA', total: null, nuevos: valor, yaImportados: null, admitidos: null };
  }
  if (!valor || typeof valor !== 'object') {
    return { total: null, nuevos: null, yaImportados: null, admitidos: null };
  }

  const datos = valor as Record<string, unknown>;
  const estado = ['VACIA', 'SIN_NOVEDADES', 'CON_NOVEDADES', 'ERROR'].includes(String(datos.estado))
    ? datos.estado as EstadoCarpeta
    : undefined;
  const error = typeof datos.error === 'string' ? datos.error : undefined;
  return {
    estado: estado || (error ? 'ERROR' : undefined),
    total: numeroNullable(datos.total),
    nuevos: numeroNullable(datos.nuevos),
    yaImportados: numeroNullable(datos.yaImportados),
    admitidos: numeroNullable(datos.admitidos),
    error,
  };
}

function normalizarErrores(valor: unknown): SyncError[] {
  if (typeof valor === 'number') {
    return valor > 0 ? [{ carpeta: 'Sincronización', error: `${valor} error${valor === 1 ? '' : 'es'} comunicado${valor === 1 ? '' : 's'}` }] : [];
  }
  if (typeof valor === 'string' && valor) return [{ carpeta: 'Sincronización', error: valor }];
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((item, indice) => {
    if (typeof item === 'string') return [{ carpeta: 'Sincronización', error: item }];
    if (!item || typeof item !== 'object') return [];
    const error = typeof (item as Record<string, unknown>).error === 'string' ? (item as Record<string, unknown>).error as string : null;
    if (!error) return [];
    const carpeta = typeof (item as Record<string, unknown>).carpeta === 'string'
      ? (item as Record<string, unknown>).carpeta as string
      : `Elemento ${indice + 1}`;
    return [{ carpeta, error }];
  });
}

function contador(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? SIN_DATO : String(valor);
}

function sumarSiDisponibles(valores: Array<number | null | undefined>): number | null {
  return valores.every((valor) => valor !== null && valor !== undefined)
    ? valores.reduce((suma, valor) => suma + (valor as number), 0)
    : null;
}

function etiquetaEstado(carpeta: CarpetaStatus): string {
  if (carpeta.error || carpeta.estado === 'ERROR') return 'Error';
  if (carpeta.estado === 'VACIA') return 'Vacía';
  if (carpeta.estado === 'CON_NOVEDADES') return 'Con novedades';
  if (carpeta.estado === 'SIN_NOVEDADES') return 'Sin novedades';
  if (carpeta.nuevos !== null && carpeta.nuevos > 0) return 'Con novedades';
  if (carpeta.total === 0) return 'Vacía';
  return SIN_DATO;
}

const ESTADOS = {
  PENDIENTE_REVISION: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: ClockIcon },
  VALIDADA: { label: 'Validada', color: 'bg-green-100 text-green-700', icon: CheckCircleIcon },
  CONTABILIZADA: { label: 'Contabilizada', color: 'bg-blue-100 text-blue-700', icon: DocumentTextIcon },
  RECHAZADA: { label: 'Rechazada', color: 'bg-red-100 text-red-700', icon: XCircleIcon },
};

export default function FacturasPage() {
  const router = useRouter();
  const { hasAreaAccess } = useRole();
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
  const canWrite = hasAreaAccess('admin.finanzas.facturas', 'escritura') && syncStatus?.canWrite !== false;
  const canSync = canWrite && syncStatus?.canWrite === true && syncStatus?.inventarioCompleto === true;

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
      const data = await res.json();
      if (res.ok) setSyncStatus(data);
      else setSyncStatus({ error: data.error || 'No se pudo leer el inventario de OneDrive' });
    } catch (e) {
      console.error('Error checking sync status:', e);
      setSyncStatus({ error: 'No se pudo leer el inventario de OneDrive' });
    }
    setCheckingSync(false);
  }

  async function sincronizarOneDrive(carpeta: string = 'todas', soloUbicaciones = false) {
    if (!canSync) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const body: Record<string, unknown> = soloUbicaciones
        ? { carpeta: 'todas', soloUbicaciones: true }
        : { carpeta, limite: 10 };
      for (let intento = 0; intento < 2; intento++) {
        const res = await fetch('/api/admin/finanzas/sincronizar-onedrive', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const data = await res.json();
        if (intento === 0 && res.status === 409 && data.requiereConfirmarBiblioteca) {
          const ruta = `${data.ubicacion?.siteName || ''} / ${data.ubicacion?.driveName || ''} / ${data.ubicacion?.rootPath || ''}`;
          if (window.confirm(`${data.cantidad} documentos históricos no conservan el ID de su biblioteca. ¿Confirmas que proceden de esta biblioteca de Internet Operadores?\n\n${ruta}\n\nLa confirmación se registrará con tu usuario. Si no estás seguro, cancela: no se ha modificado ningún dato.`)) {
            body.bibliotecaHistoricaConfirmada = data.driveId;
            continue;
          }
        }
        setSyncResult(res.ok ? data : { ...data, error: data.error || 'No se pudo completar la operación' });
        if (res.ok) fetchFacturas();
        break;
      }
      checkSyncStatus();
    } catch (e: any) {
      setSyncResult({ error: e.message });
    }
    setSyncing(false);
  }

  async function actualizarEstado(id: string, estado: string) {
    if (!canWrite) return;
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
    if (!canWrite) return;
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

  const carpetasOneDrive = syncStatus ? [
    { clave: 'pendiente', nombre: 'Pendiente de contabilizar', estilo: 'text-blue-700', datos: normalizarCarpeta(syncStatus.pendiente ?? syncStatus.pendientes) },
    { clave: 'materiales', nombre: 'Compra de materiales', estilo: 'text-amber-700', datos: normalizarCarpeta(syncStatus.materiales) },
    { clave: 'trimestre1', nombre: 'Trimestre 1', estilo: 'text-emerald-700', datos: normalizarCarpeta(syncStatus.trimestre1) },
    { clave: 'trimestre2', nombre: 'Trimestre 2', estilo: 'text-emerald-700', datos: normalizarCarpeta(syncStatus.trimestre2) },
    { clave: 'trimestre3', nombre: 'Trimestre 3', estilo: 'text-teal-700', datos: normalizarCarpeta(syncStatus.trimestre3) },
    { clave: 'trimestre4', nombre: 'Trimestre 4', estilo: 'text-teal-700', datos: normalizarCarpeta(syncStatus.trimestre4) },
    { clave: 'confirming_draxton', nombre: 'Confirming Draxton', estilo: 'text-purple-700', datos: normalizarCarpeta(syncStatus.confirming_draxton) },
    { clave: 'raiz', nombre: 'Raíz (archivos sueltos)', estilo: 'text-slate-700', datos: normalizarCarpeta(syncStatus.raiz) },
  ] : [];
  const totalDocumentos = syncStatus ? numeroNullable(syncStatus.totalArchivos) ?? sumarSiDisponibles(carpetasOneDrive.map(({ datos }) => datos.total)) : null;
  const totalAdmitidos = syncStatus ? sumarSiDisponibles(carpetasOneDrive.map(({ datos }) => datos.admitidos)) : null;
  const totalImportados = syncStatus ? numeroNullable(syncStatus.totalImportados) ?? sumarSiDisponibles(carpetasOneDrive.map(({ datos }) => datos.yaImportados)) : null;
  const totalNuevos = syncStatus ? numeroNullable(syncStatus.totalNuevos) ?? sumarSiDisponibles(carpetasOneDrive.map(({ datos }) => datos.nuevos)) : null;
  const erroresInventario = syncStatus ? [
    ...normalizarErrores(syncStatus.errores ?? syncStatus.errors),
    ...carpetasOneDrive.flatMap(({ nombre, datos }) => datos.error ? [{ carpeta: nombre, error: datos.error }] : []),
    ...(syncStatus.error ? [{ carpeta: 'Inventario OneDrive', error: syncStatus.error }] : []),
  ].filter((error, indice, lista) => lista.findIndex((otra) => otra.carpeta === error.carpeta && otra.error === error.error) === indice) : [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturas Recibidas</h1>
          <p className="text-sm text-gray-500 mt-1">{total} facturas registradas</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => sincronizarOneDrive('todas')}
            disabled={syncing || !canSync}
            title={!canSync ? 'Se requiere permiso de escritura y un inventario completo verificado' : 'Procesa documentos nuevos con OCR'}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CloudArrowDownIcon className="h-4 w-4" />}
            {syncing ? 'Procesando...' : 'Sincronizar nuevos'}
          </button>
          <button disabled={!canWrite} title={!canWrite ? 'No tienes permiso de escritura en Finanzas' : undefined} className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            <ArrowUpTrayIcon className="h-4 w-4" />
            Subir Factura
          </button>
        </div>
      </div>

      {/* B2: la calidad se consulta con sus endpoints paginados; no se carga detalle por fila. */}
      <InvoiceQualityWorkspace />

      {/* Sólo lectura: recibe el período documental que el usuario ya ha seleccionado. */}
      <FiscalEstimatePanel period={fechaDesde && fechaHasta ? { desde: fechaDesde, hasta: fechaHasta } : null} />

      {/* Inventario OneDrive B1: no transforma errores ni datos no disponibles en ceros. */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3" aria-label="Estado de OneDrive">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <CloudArrowDownIcon className="h-5 w-5 text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-900">Inventario OneDrive</h2>
              {syncStatus?.inventarioCompleto === false && <span className="text-xs rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Inventario parcial</span>}
            </div>
            <p className="mt-1 text-xs text-gray-500">Documentos encontrados, admitidos (PDF/imágenes), ya importados por ID y documentos nuevos.</p>
          </div>
          <button
            onClick={() => sincronizarOneDrive('todas', true)}
            disabled={syncing || !canSync}
            title={!canSync ? 'Se requiere permiso de escritura y un inventario completo verificado' : 'Actualiza ubicaciones en staging; no ejecuta OCR'}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Releer ubicación
          </button>
        </div>

        {syncStatus?.sandbox === true && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>Staging sandbox:</strong> la respuesta procede del entorno de pruebas. No se han enviado notificaciones.
          </div>
        )}

        {erroresInventario.length > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs font-medium text-red-800">No se pudo leer parte del inventario</p>
            <ul className="mt-1 space-y-0.5 text-xs text-red-700">
              {erroresInventario.map((error, indice) => <li key={`${error.carpeta}-${indice}`}><strong>{error.carpeta}:</strong> {error.error}</li>)}
            </ul>
          </div>
        )}

        {syncStatus ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                ['Documentos', totalDocumentos, 'Todos los archivos'],
                ['Admitidos', totalAdmitidos, 'PDF e imágenes'],
                ['Importados', totalImportados, 'IDs ya registrados'],
                ['Nuevos', totalNuevos, 'Admitidos sin importar'],
              ].map(([etiqueta, valor, ayuda]) => (
                <div key={etiqueta as string} className="rounded-lg border bg-gray-50 p-3 text-center">
                  <p className="text-[11px] uppercase font-medium text-gray-500">{etiqueta}</p>
                  <p className={`text-xl font-bold ${etiqueta === 'Nuevos' && typeof valor === 'number' && valor > 0 ? 'text-orange-600' : 'text-gray-900'}`}>{contador(valor as number | null)}</p>
                  <p className="text-[11px] text-gray-400">{ayuda}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
              {carpetasOneDrive.map(({ clave, nombre, estilo, datos }) => (
                <div key={clave} className={`rounded-lg border p-3 ${datos.error || datos.estado === 'ERROR' ? 'border-red-200 bg-red-50' : 'bg-gray-50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs font-semibold ${estilo}`}>{nombre}</p>
                    <span className={`shrink-0 text-[10px] rounded-full px-1.5 py-0.5 ${datos.error || datos.estado === 'ERROR' ? 'bg-red-100 text-red-700' : datos.estado === 'CON_NOVEDADES' || (datos.nuevos !== null && datos.nuevos > 0) ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'}`}>{etiquetaEstado(datos)}</span>
                  </div>
                  <p className="mt-2 text-xs text-gray-600"><strong className="text-gray-900">{contador(datos.total)}</strong> documentos · <strong className="text-gray-900">{contador(datos.admitidos)}</strong> admitidos</p>
                  <p className="mt-0.5 text-xs text-gray-600"><strong className="text-gray-900">{contador(datos.yaImportados)}</strong> importados · <strong className={datos.nuevos !== null && datos.nuevos > 0 ? 'text-orange-700' : 'text-gray-900'}>{contador(datos.nuevos)}</strong> nuevos</p>
                  {datos.error && <p className="mt-1 text-xs text-red-700 line-clamp-2" title={datos.error}>{datos.error}</p>}
                </div>
              ))}
            </div>

            {syncStatus.ubicacion && (
              <details className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <summary className="cursor-pointer font-medium text-gray-700">Ruta resuelta de OneDrive</summary>
                <div className="mt-2 space-y-1">
                  <p><strong>Sitio:</strong> {syncStatus.ubicacion.siteName || SIN_DATO}</p>
                  <p><strong>Biblioteca:</strong> {syncStatus.ubicacion.driveName || SIN_DATO}</p>
                  <p><strong>Ruta:</strong> {syncStatus.ubicacion.rootPath || SIN_DATO}</p>
                  <p className="break-all text-gray-400">IDs: sitio {syncStatus.ubicacion.siteId || SIN_DATO} · biblioteca {syncStatus.ubicacion.driveId || SIN_DATO}</p>
                </div>
              </details>
            )}
          </>
        ) : checkingSync ? (
          <p className="text-sm text-gray-500">Leyendo inventario de OneDrive…</p>
        ) : (
          <p className="text-sm text-gray-500">El inventario no está disponible.</p>
        )}
      </section>

      {/* Resultado de sincronización o de relectura de ubicación */}
      {syncResult && (
        <div className={`rounded-lg p-4 border ${syncResult.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          {syncResult.error ? <p className="text-sm text-red-700">Error: {syncResult.error}</p> : (
            <div>
              <p className="text-sm font-medium text-green-800">{syncResult.mensaje || 'Operación completada'}</p>
              <p className="mt-1 text-xs text-green-700">
                Procesados: {contador(numeroNullable(syncResult.procesados))} · Errores: {Array.isArray(syncResult.errores) ? syncResult.errores.length : contador(numeroNullable(syncResult.errores))} · Ubicaciones actualizadas: {contador(numeroNullable(syncResult.ubicacionesActualizadas))} · Normalizadas: {contador(numeroNullable(syncResult.normalizadas))}
                {typeof syncResult.inventarioCompleto === 'boolean' && ` · Inventario ${syncResult.inventarioCompleto ? 'completo' : 'parcial'}`}
              </p>
              {Array.isArray(syncResult.resultados) && syncResult.resultados.length > 0 && (
                <div className="mt-2 space-y-1">
                  {syncResult.resultados.slice(0, 5).map((resultado: any, indice: number) => <p key={indice} className="text-xs text-green-700">{resultado.estado === 'ok' ? 'Correcto' : 'Revisar'}: {resultado.archivo || resultado.carpeta || 'Elemento'}{resultado.error ? ` — ${resultado.error}` : ''}</p>)}
                  {syncResult.resultados.length > 5 && <p className="text-xs text-green-600">… y {syncResult.resultados.length - 5} más</p>}
                </div>
              )}
              {normalizarErrores(syncResult.errores ?? syncResult.errors).length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-red-700">
                  {normalizarErrores(syncResult.errores ?? syncResult.errors).map((error, indice) => <li key={`${error.carpeta}-${indice}`}><strong>{error.carpeta}:</strong> {error.error}</li>)}
                </ul>
              )}
              <button onClick={() => setSyncResult(null)} className="mt-2 text-xs text-green-700 underline">Cerrar</button>
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
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
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
                        {f.estadoCarpeta && <p className="mt-1 text-xs text-slate-700">{f.estadoCarpeta === 'CONTABILIZADA_GESTORIA' ? 'Circuito gestoría: contabilizada' : f.estadoCarpeta === 'PENDIENTE_CONTABILIZAR' ? 'Circuito gestoría: pendiente' : f.estadoCarpeta === 'CONFIRMING' ? 'Documentación de confirming' : 'Sin clasificar en gestoría'}</p>}
                        {f.etiquetaMateriales && <p className="mt-1 text-xs font-medium text-amber-800">Etiqueta: materiales</p>}
                        {f.oneDriveItemId && <InvoiceLocationHistory facturaId={f.id} />}
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
                            disabled={!canWrite}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${
                              concilFacturaId === f.id
                                ? 'bg-blue-100 border-blue-300 text-blue-700'
                                : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
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
                                disabled={!canWrite}
                                className="text-green-600 hover:text-green-800"
                                title="Validar factura — Marcar como revisada y correcta"
                              >
                                <CheckCircleIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); actualizarEstado(f.id, 'RECHAZADA'); }}
                                disabled={!canWrite}
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
                                        disabled={!canWrite}
                                        className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
