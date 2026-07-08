'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  InformationCircleIcon, 
  ChevronDownIcon, 
  ChevronUpIcon,
  BanknotesIcon, 
  ArrowPathIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon,
  XCircleIcon,
  ArrowDownTrayIcon,
  DocumentMagnifyingGlassIcon,
  ClockIcon,
  BuildingLibraryIcon,
  DocumentArrowUpIcon,
} from '@heroicons/react/24/outline';

interface KPIs {
  totalRemesado: number;
  totalCobradoBanco: number;
  diferenciaNeta: number;
  totalDevuelto: number;
  totalRecuperado: number;
  pendienteRecuperar: number;
  numRemesas: number;
  numDevoluciones: number;
  numDevolucionesPendientes: number;
  // Facturas conciliadas
  totalFacturas: number;
  totalFacturasCobradas: number;
  totalFacturasPendientes: number;
}

interface ResumenMensual {
  mes: string;
  totalRemesado: number;
  totalCobradoBanco: number;
  santander: number;
  caixaGuissona: number;
  diferencia: number;
  numMovimientos: number;
  totalDevuelto: number;
  numDevoluciones: number;
}

interface RemesaRow {
  id: number;
  conciliacionId: string | null;
  ispGestionId: number;
  nombre: string;
  fecha: string;
  totalImporte: number;
  numeroRegistros: number;
  estadoConciliacion: string;
  importeBanco: number | null;
  diferencia: number | null;
  numMovimientosBanco: number;
  cobroSantander: number;
  cobroCaixaGuissona: number;
  numDevoluciones: number;
  totalDevoluciones: number;
  recibosRemesados: number | null;
  recibosCobrados: number | null;
  rechazos: number | null;
  // Facturas en nuestra BD
  facturasCobradas: number;
  facturasPendientes: number;
  facturasTotal: number;
}

interface DetalleRemesa {
  remesa: { nombre: string; fecha: string; totalImporte: number; numeroRegistros: number; serie: string };
  resumen: {
    totalFacturas: number;
    facturasCobradas: number;
    facturasPendientes: number;
    facturasConDevolucion: number;
    totalSubRemesas: number;
    subRemesasCobradas: number;
    importeSubRemesasCobradas: number;
    importeSubRemesasPendientes: number;
  };
  facturas: {
    id: number;
    numeroFactura: string;
    cliente: string;
    nifCif: string;
    importe: number;
    situacion: string;
    tieneDevolucion: boolean;
    estadoDevolucion: string | null;
  }[];
  subRemesas: {
    id: string;
    referencia: string;
    fechaVencimiento: string;
    numRecibos: number;
    importe: number;
    cobrado: boolean;
  }[];
  devoluciones: {
    numFactura: string;
    importe: number;
    estado: string;
    cliente: string;
    motivo: string;
    fechaDevolucion: string;
    importeCobrado: number | null;
    fechaCobro: string | null;
  }[];
}

interface DevolucionRow {
  id: string;
  numeroFactura: string;
  referenciaExterna: string | null;
  nombreCliente: string;
  importe: number;
  motivo: string | null;
  motivoBanco: string | null;
  fechaDevolucion: string;
  estado: string;
  conciliadaBanco: boolean;
  importeCobrado: number | null;
  fechaCobro: string | null;
  remesaNombre: string | null;
  facturaSituacion: string | null;
  archivoOrigen: string | null;
}

function formatEUR(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMes(mesKey: string) {
  const [, m] = mesKey.split('-');
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${meses[parseInt(m) - 1]} ${mesKey.split('-')[0]}`;
}

const MESES = [
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

export default function ConciliacionRemesasPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [resumenMensual, setResumenMensual] = useState<ResumenMensual[]>([]);
  const [remesas, setRemesas] = useState<RemesaRow[]>([]);
  const [devoluciones, setDevoluciones] = useState<DevolucionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [year, setYear] = useState(2026);
  const [mes, setMes] = useState('');
  const [vista, setVista] = useState<'resumen' | 'remesas' | 'devoluciones'>('resumen');
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'error' | 'info'; texto: string } | null>(null);
  
  const [mostrarAyuda, setMostrarAyuda] = useState(false);
  
  // Estado para fila expandible de remesas
  const [remesaExpandida, setRemesaExpandida] = useState<number | null>(null);
  const [detalleRemesa, setDetalleRemesa] = useState<Record<number, DetalleRemesa>>({});
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [filtroCliente, setFiltroCliente] = useState('');
  
  // Refs para inputs de archivo
  const fileInputRemesas = useRef<HTMLInputElement>(null);
  const fileInputDevoluciones = useRef<HTMLInputElement>(null);
  const fileInputListaDev = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, [year, mes]);

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: year.toString() });
      if (mes) params.set('mes', mes);
      const res = await fetch(`/api/admin/finanzas/conciliacion-remesas?${params}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setKpis(json.kpis);
      setResumenMensual(json.resumenMensual || []);
      setRemesas(json.remesas);
      setDevoluciones(json.devoluciones);
    } catch (e: any) {
      console.error(e);
      setMensaje({ tipo: 'error', texto: e.message });
    }
    setLoading(false);
  }

  async function ejecutarConciliacion(accion: string) {
    setProcesando(true);
    setMensaje(null);
    try {
      const res = await fetch('/api/admin/finanzas/conciliacion-remesas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, year, mes: mes ? parseInt(mes) : undefined }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      
      const r = json.resultados;
      const partes = [];
      if (r.remesasConciliadas > 0) partes.push(`${r.remesasConciliadas} remesas conciliadas`);
      if (r.remesasConDiferencia > 0) partes.push(`${r.remesasConDiferencia} con diferencia`);
      if (r.devolucionesDetectadasBanco > 0) partes.push(`${r.devolucionesDetectadasBanco} devoluciones detectadas`);
      if (r.pagosPosterioresDetectados > 0) partes.push(`${r.pagosPosterioresDetectados} pagos posteriores`);
      if (r.errores?.length > 0) partes.push(`${r.errores.length} errores`);
      
      setMensaje({ 
        tipo: partes.length > 0 ? 'success' : 'info', 
        texto: partes.length > 0 ? partes.join(', ') : 'No se encontraron nuevos registros para procesar',
      });
      fetchData();
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message });
    }
    setProcesando(false);
  }

  async function marcarCobradas() {
    if (!mes) {
      setMensaje({ tipo: 'error', texto: 'Selecciona un mes para marcar facturas como cobradas' });
      return;
    }
    if (!confirm(`¿Marcar como COBRADAS las facturas de las remesas de ${MESES.find(m => m.value === mes)?.label} ${year}?\n\nSe excluirán las facturas con devolución pendiente.`)) return;
    setProcesando(true);
    setMensaje(null);
    try {
      const res = await fetch('/api/admin/finanzas/conciliacion-remesas/marcar-cobradas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anio: year, mes: parseInt(mes) }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setMensaje({
        tipo: 'success',
        texto: json.mensaje + ' Detalle: ' + json.detalles.map((d: any) => `${d.remesa}: ${d.marcadasCobrada} cobradas, ${d.marcadasPendiente} pdte. devolución, ${d.yaEstaban} ya estaban`).join(' | '),
      });
      fetchData();
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message });
    }
    setProcesando(false);
  }

  async function handleUploadFiles(files: FileList | File[], tipo: 'remesas' | 'recibos_devueltos' | 'devoluciones') {
    setSubiendo(true);
    setMensaje(null);
    try {
      const formData = new FormData();
      // Añadir todos los archivos
      for (let i = 0; i < files.length; i++) {
        formData.append('file', files[i]);
      }
      formData.append('tipo', tipo);

      const res = await fetch('/api/admin/finanzas/conciliacion-remesas/importar-pdf', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      setMensaje({
        tipo: 'success',
        texto: json.mensaje || 'Archivo(s) procesado(s) correctamente',
      });
      fetchData();
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message });
    }
    setSubiendo(false);
    // Reset inputs
    if (fileInputRemesas.current) fileInputRemesas.current.value = '';
    if (fileInputDevoluciones.current) fileInputDevoluciones.current.value = '';
    if (fileInputListaDev.current) fileInputListaDev.current.value = '';
  }

  async function toggleRemesa(remesaId: number, conciliacionId: string | null) {
    if (remesaExpandida === remesaId) {
      setRemesaExpandida(null);
      setFiltroCliente('');
      return;
    }
    setRemesaExpandida(remesaId);
    setFiltroCliente('');
    // Si ya tenemos el detalle cacheado, no recargar
    if (detalleRemesa[remesaId]) return;
    setCargandoDetalle(true);
    try {
      const params = new URLSearchParams();
      if (conciliacionId) params.set('conciliacionId', conciliacionId);
      else params.set('remesaId', remesaId.toString());
      const res = await fetch(`/api/admin/finanzas/conciliacion-remesas/detalle-remesa?${params}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDetalleRemesa(prev => ({ ...prev, [remesaId]: json }));
    } catch (e: any) {
      console.error('Error cargando detalle:', e);
      setMensaje({ tipo: 'error', texto: `Error cargando detalle: ${e.message}` });
    }
    setCargandoDetalle(false);
  }

  function getEstadoBadge(estado: string) {
    switch (estado) {
      case 'CONCILIADA':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircleIcon className="w-3 h-3" /> Conciliada</span>;
      case 'DIFERENCIA':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><ExclamationTriangleIcon className="w-3 h-3" /> Diferencia</span>;
      case 'PENDIENTE':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><ClockIcon className="w-3 h-3" /> Pendiente</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{estado}</span>;
    }
  }

  function getEstadoDevolucionBadge(estado: string) {
    switch (estado) {
      case 'COBRADO_TRANSFERENCIA':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircleIcon className="w-3 h-3" /> Cobrado</span>;
      case 'COBRADO_PARCIAL':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><CheckCircleIcon className="w-3 h-3" /> Parcial</span>;
      case 'INCOBRABLE':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"><XCircleIcon className="w-3 h-3" /> Incobrable</span>;
      case 'PENDIENTE':
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><ClockIcon className="w-3 h-3" /> Pendiente</span>;
    }
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conciliacion de Remesas</h1>
          <p className="text-sm text-gray-500 mt-1">Cruce exacto: remesas ISPGestion vs cobros banco (PDFs del Santander)</p>
        </div>
        <div className="flex gap-2 items-center">
          <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="border rounded-lg px-3 py-1.5 text-sm">
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
          <select value={mes} onChange={e => setMes(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
            {MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {/* Panel de ayuda desplegable */}
      <div className="border border-blue-200 rounded-lg bg-blue-50/50">
        <button
          onClick={() => setMostrarAyuda(!mostrarAyuda)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <span className="flex items-center gap-2">
            <InformationCircleIcon className="w-5 h-5" />
            ¿Cómo funciona la conciliación de remesas?
          </span>
          {mostrarAyuda ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
        </button>
        {mostrarAyuda && (
          <div className="px-4 pb-4 text-sm text-gray-700 space-y-3 border-t border-blue-100 pt-3">
            <div>
              <p className="font-semibold text-gray-900 mb-1">📋 ¿Qué hace esta pantalla?</p>
              <p>Cruza las remesas que enviamos al banco (desde ISPGestión) con los cobros reales que aparecen en el extracto bancario del Santander. Así sabemos exactamente cuánto se ha cobrado, cuánto falta por cobrar y qué recibos se han devuelto.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">🔄 ¿Cómo funciona el cruce?</p>
              <p>El Santander divide cada remesa de ISPGestión en varias sub-remesas según la fecha de vencimiento de los recibos (día 1, día 5, día 15...). El sistema lee el PDF de ISPGestión desde OneDrive para saber qué recibos van a cada fecha, y luego cruza con el XLS del banco para asignar la referencia bancaria correcta a cada sub-remesa.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">📂 Archivos necesarios</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>XLS de remesas</strong> (botón naranja "Subir Remesas"): Los archivos XLS que se descargan del portal del Santander con todas las remesas del mes. Se pueden subir los 2 archivos a la vez.</li>
                <li><strong>XLSX de devoluciones</strong> (botón azul "Listado Devoluciones"): El Excel de devoluciones que proporciona el Santander con el detalle de recibos devueltos.</li>
                <li><strong>XLSX de recibos devueltos</strong> (botón rojo "Recibos Devueltos"): El detalle con nombre de cliente, referencia e importe de cada recibo devuelto.</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">📖 Lectura automática desde OneDrive</p>
              <p>El sistema lee automáticamente de la carpeta de OneDrive (<em>2. Contabilidad y finanzas &gt; 1. Facturas emitidas y remesas &gt; ... &gt; Mes Año</em>):</p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-1">
                <li><strong>PDFs de ISPGestión</strong> (ej: "82- JUNIO 2026 LLEIDA.pdf"): Para obtener el desglose de recibos por fecha de vencimiento.</li>
                <li><strong>PDFs del Santander</strong> (ej: "Santander Empresas_Junio2026_Lleida.pdf"): Para doble cotejo del desglose bancario.</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">📊 ¿Qué significan los estados?</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Conciliada</span> La remesa está totalmente cobrada y los importes cuadran.</li>
                <li><span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Diferencia</span> Se ha cobrado pero hay diferencia de importe (por rechazos/devoluciones).</li>
                <li><span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">Pendiente</span> Alguna sub-remesa aún no tiene movimiento bancario (falta por cobrar).</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">⚡ Flujo de trabajo recomendado</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Asegúrate de que los PDFs de ISPGestión y Santander están en la carpeta de OneDrive del mes.</li>
                <li>Sube el extracto bancario del mes (desde Finanzas &gt; Importar Extracto) para tener los movimientos actualizados.</li>
                <li>Sube los 2 archivos XLS de remesas del Santander con el botón "Subir Remesas (.xls)".</li>
                <li>Sube el listado de devoluciones y recibos devueltos si los tienes.</li>
                <li>Revisa los resultados: cada remesa mostrará sus sub-remesas, lo cobrado y lo pendiente.</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div className={`p-3 rounded-lg text-sm ${
          mensaje.tipo === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 
          mensaje.tipo === 'info' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
          'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {mensaje.texto}
        </div>
      )}

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <BanknotesIcon className="w-4 h-4" />
              Remesado ISP
            </div>
            <div className="text-xl font-bold text-gray-900">{formatEUR(kpis.totalRemesado)}</div>
            <div className="text-xs text-gray-400 mt-1">{kpis.numRemesas} remesas</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <BuildingLibraryIcon className="w-4 h-4 text-green-500" />
              Cobrado Banco
            </div>
            <div className="text-xl font-bold text-green-700">{formatEUR(kpis.totalCobradoBanco)}</div>
            <div className="text-xs text-gray-400 mt-1">
              Dif: <span className={kpis.diferenciaNeta >= 0 ? 'text-green-600' : 'text-red-600'}>{formatEUR(kpis.diferenciaNeta)}</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <XCircleIcon className="w-4 h-4 text-red-500" />
              Devuelto
            </div>
            <div className="text-xl font-bold text-red-700">{formatEUR(kpis.totalDevuelto)}</div>
            <div className="text-xs text-gray-400 mt-1">{kpis.numDevoluciones} devoluciones</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <ArrowPathIcon className="w-4 h-4 text-blue-500" />
              Recuperado
            </div>
            <div className="text-xl font-bold text-blue-700">{formatEUR(kpis.totalRecuperado)}</div>
            <div className="text-xs text-gray-400 mt-1">de {formatEUR(kpis.totalDevuelto)}</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
              Pdte. Recuperar
            </div>
            <div className="text-xl font-bold text-amber-700">{formatEUR(kpis.pendienteRecuperar)}</div>
            <div className="text-xs text-gray-400 mt-1">{kpis.numDevolucionesPendientes} pendientes</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <DocumentMagnifyingGlassIcon className="w-4 h-4 text-purple-500" />
              Facturas BD
            </div>
            <div className="text-xl font-bold text-purple-700">
              {kpis.totalFacturasCobradas}/{kpis.totalFacturas}
            </div>
            <div className="text-xs mt-1">
              {kpis.totalFacturasPendientes > 0 ? (
                <span className="text-amber-600">{kpis.totalFacturasPendientes} pendientes</span>
              ) : (
                <span className="text-green-600">Todas cobradas</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Acciones: Conciliación automática */}
      <div className="flex flex-wrap gap-2 bg-gray-50 rounded-xl p-4 border">
        <button
          onClick={() => ejecutarConciliacion('todo')}
          disabled={procesando}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowPathIcon className={`w-4 h-4 ${procesando ? 'animate-spin' : ''}`} />
          {procesando ? 'Procesando...' : 'Conciliar Todo'}
        </button>
        <button
          onClick={() => ejecutarConciliacion('conciliar')}
          disabled={procesando}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <DocumentMagnifyingGlassIcon className="w-4 h-4" />
          Solo Cruzar Remesas
        </button>
        <button
          onClick={() => ejecutarConciliacion('detectar_devoluciones')}
          disabled={procesando}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <ExclamationTriangleIcon className="w-4 h-4" />
          Detectar Devoluciones Banco
        </button>
        <button
          onClick={() => ejecutarConciliacion('detectar_pagos')}
          disabled={procesando}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <CheckCircleIcon className="w-4 h-4" />
          Detectar Pagos Posteriores
        </button>
        <button
          onClick={marcarCobradas}
          disabled={procesando || !mes}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title={!mes ? 'Selecciona un mes primero' : 'Marca como COBRADA en nuestra BD las facturas de remesas cobradas'}
        >
          <BanknotesIcon className="w-4 h-4" />
          Marcar Cobradas
        </button>

        {/* Separador */}
        <div className="w-px bg-gray-300 mx-1 self-stretch"></div>

        {/* Subir XLS Remesas (múltiples archivos) */}
        <input
          ref={fileInputRemesas}
          type="file"
          accept=".xls,.xlsx"
          multiple
          className="hidden"
          onChange={e => {
            const files = e.target.files;
            if (files && files.length > 0) handleUploadFiles(files, 'remesas');
          }}
        />
        <button
          onClick={() => fileInputRemesas.current?.click()}
          disabled={subiendo}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          <DocumentArrowUpIcon className={`w-4 h-4 ${subiendo ? 'animate-pulse' : ''}`} />
          {subiendo ? 'Subiendo...' : 'Subir Remesas (.xls)'}
        </button>

        {/* Subir XLSX Listado Devoluciones */}
        <input
          ref={fileInputListaDev}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={e => {
            const files = e.target.files;
            if (files && files.length > 0) handleUploadFiles(files, 'devoluciones');
          }}
        />
        <button
          onClick={() => fileInputListaDev.current?.click()}
          disabled={subiendo}
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          <ArrowDownTrayIcon className={`w-4 h-4 ${subiendo ? 'animate-pulse' : ''}`} />
          {subiendo ? 'Subiendo...' : 'Listado Devoluciones (.xlsx)'}
        </button>

        {/* Subir XLSX Recibos Devueltos */}
        <input
          ref={fileInputDevoluciones}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={e => {
            const files = e.target.files;
            if (files && files.length > 0) handleUploadFiles(files, 'recibos_devueltos');
          }}
        />
        <button
          onClick={() => fileInputDevoluciones.current?.click()}
          disabled={subiendo}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
        >
          <DocumentArrowUpIcon className={`w-4 h-4 ${subiendo ? 'animate-pulse' : ''}`} />
          {subiendo ? 'Subiendo...' : 'Recibos Devueltos (.xlsx)'}
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4">
          <button
            onClick={() => setVista('resumen')}
            className={`pb-2 text-sm font-medium border-b-2 ${vista === 'resumen' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Resumen Mensual ({resumenMensual.length})
          </button>
          <button
            onClick={() => setVista('remesas')}
            className={`pb-2 text-sm font-medium border-b-2 ${vista === 'remesas' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Remesas ({remesas.length})
          </button>
          <button
            onClick={() => setVista('devoluciones')}
            className={`pb-2 text-sm font-medium border-b-2 ${vista === 'devoluciones' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Devoluciones ({devoluciones.length})
          </button>
        </nav>
      </div>

      {/* Tabla Resumen Mensual */}
      {vista === 'resumen' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Mes</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Remesado ISP</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Cobrado Banco</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Santander</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Caixa Guissona</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Diferencia</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Movimientos</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Devuelto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {resumenMensual.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No hay datos. Pulsa &quot;Conciliar Todo&quot; para procesar.</td></tr>
                ) : (
                  resumenMensual.map(rm => (
                    <tr key={rm.mes} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{formatMes(rm.mes)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">{formatEUR(rm.totalRemesado)}</td>
                      <td className="px-4 py-3 text-right font-mono text-green-700 font-medium">{formatEUR(rm.totalCobradoBanco)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">{formatEUR(rm.santander)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">
                        {rm.caixaGuissona > 0 ? formatEUR(rm.caixaGuissona) : <span className="text-gray-400">&mdash;</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        <span className={rm.diferencia >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {rm.diferencia >= 0 ? '+' : ''}{formatEUR(rm.diferencia)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{rm.numMovimientos}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {rm.totalDevuelto > 0 ? (
                          <span className="text-red-600">{formatEUR(rm.totalDevuelto)} ({rm.numDevoluciones})</span>
                        ) : (
                          <span className="text-gray-400">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {resumenMensual.length > 0 && (
                <tfoot className="bg-gray-50 border-t font-medium">
                  <tr>
                    <td className="px-4 py-3 text-gray-700">TOTAL</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900">{formatEUR(resumenMensual.reduce((s, r) => s + r.totalRemesado, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">{formatEUR(resumenMensual.reduce((s, r) => s + r.totalCobradoBanco, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600">{formatEUR(resumenMensual.reduce((s, r) => s + r.santander, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600">{formatEUR(resumenMensual.reduce((s, r) => s + r.caixaGuissona, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {(() => {
                        const total = resumenMensual.reduce((s, r) => s + r.diferencia, 0);
                        return <span className={total >= 0 ? 'text-green-600' : 'text-red-600'}>{total >= 0 ? '+' : ''}{formatEUR(total)}</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{resumenMensual.reduce((s, r) => s + r.numMovimientos, 0)}</td>
                    <td className="px-4 py-3 text-right font-mono text-red-600">{formatEUR(resumenMensual.reduce((s, r) => s + r.totalDevuelto, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Tabla Remesas */}
      {vista === 'remesas' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Remesa</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Se Remesaron</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Cobrado Banco</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Diferencia</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Recibos ISP</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Cobrados</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Rechazos</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Devoluciones</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Facturas BD</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {remesas.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">No hay remesas para el periodo seleccionado</td></tr>
                ) : (
                  remesas.map(r => (
                    <React.Fragment key={r.id}>
                    <tr className={`hover:bg-gray-50 cursor-pointer transition-colors ${remesaExpandida === r.id ? 'bg-indigo-50' : ''}`} onClick={() => toggleRemesa(r.id, r.conciliacionId)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform ${remesaExpandida === r.id ? 'rotate-180' : ''}`} />
                          <div>
                            <div className="font-medium text-gray-900">{r.nombre}</div>
                            <div className="text-xs text-gray-400">ISP #{r.ispGestionId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(r.fecha)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900 font-medium">{formatEUR(r.totalImporte)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">
                        {r.importeBanco !== null && !isNaN(r.importeBanco) ? formatEUR(r.importeBanco) : <span className="text-gray-400">&mdash;</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {r.diferencia !== null && !isNaN(r.diferencia) ? (
                          <span className={Math.abs(r.diferencia) < 1 ? 'text-green-600' : r.diferencia > 0 ? 'text-blue-600' : 'text-red-600'}>
                            {r.diferencia > 0 ? '+' : ''}{formatEUR(r.diferencia)}
                          </span>
                        ) : <span className="text-gray-400">&mdash;</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{r.numeroRegistros}</td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {r.recibosCobrados !== null ? (
                          <span className="text-green-700 font-medium">{r.recibosCobrados}</span>
                        ) : <span className="text-gray-400">&mdash;</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.rechazos !== null && r.rechazos > 0 ? (
                          <span className="text-red-600 font-medium">{r.rechazos}</span>
                        ) : r.rechazos === 0 ? (
                          <span className="text-green-600">0</span>
                        ) : <span className="text-gray-400">&mdash;</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.numDevoluciones > 0 ? (
                          <span className="text-red-600 font-medium">{r.numDevoluciones} ({formatEUR(r.totalDevoluciones)})</span>
                        ) : (
                          <span className="text-gray-400">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.facturasTotal > 0 ? (
                          <div>
                            <span className={r.facturasPendientes === 0 ? 'text-green-700 font-medium' : 'text-amber-700 font-medium'}>
                              {r.facturasCobradas}/{r.facturasTotal}
                            </span>
                            {r.facturasPendientes > 0 && (
                              <div className="text-xs text-amber-600">{r.facturasPendientes} pdte.</div>
                            )}
                          </div>
                        ) : <span className="text-gray-400">&mdash;</span>}
                      </td>
                      <td className="px-4 py-3 text-center">{getEstadoBadge(r.estadoConciliacion)}</td>
                    </tr>
                    {/* Panel expandible de detalle */}
                    {remesaExpandida === r.id && (
                      <tr>
                        <td colSpan={11} className="px-0 py-0">
                          <div className="bg-gray-50 border-t border-b border-indigo-100 px-6 py-4">
                            {cargandoDetalle && !detalleRemesa[r.id] ? (
                              <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                Cargando detalle de la remesa...
                              </div>
                            ) : detalleRemesa[r.id] ? (
                              <div className="space-y-4">
                                {/* Resumen del detalle */}
                                <div className="flex items-center justify-between">
                                  <h4 className="text-sm font-semibold text-gray-800">
                                    Detalle: {detalleRemesa[r.id].remesa.nombre} (Serie {detalleRemesa[r.id].remesa.serie})
                                  </h4>
                                  <button onClick={(e) => { e.stopPropagation(); setRemesaExpandida(null); }} className="text-xs text-gray-400 hover:text-gray-600">✕ Cerrar</button>
                                </div>

                                {/* KPIs mini */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <div className="bg-white rounded-lg border px-3 py-2">
                                    <div className="text-xs text-gray-500">Facturas</div>
                                    <div className="text-sm font-semibold">
                                      <span className="text-green-700">{detalleRemesa[r.id].resumen.facturasCobradas}</span>
                                      <span className="text-gray-400"> / {detalleRemesa[r.id].resumen.totalFacturas}</span>
                                    </div>
                                  </div>
                                  <div className="bg-white rounded-lg border px-3 py-2">
                                    <div className="text-xs text-gray-500">Sub-remesas banco</div>
                                    <div className="text-sm font-semibold">
                                      <span className="text-green-700">{detalleRemesa[r.id].resumen.subRemesasCobradas}</span>
                                      <span className="text-gray-400"> / {detalleRemesa[r.id].resumen.totalSubRemesas}</span>
                                    </div>
                                  </div>
                                  <div className="bg-white rounded-lg border px-3 py-2">
                                    <div className="text-xs text-gray-500">Cobrado sub-remesas</div>
                                    <div className="text-sm font-semibold text-green-700">{formatEUR(detalleRemesa[r.id].resumen.importeSubRemesasCobradas)}</div>
                                  </div>
                                  <div className="bg-white rounded-lg border px-3 py-2">
                                    <div className="text-xs text-gray-500">Pendiente sub-remesas</div>
                                    <div className="text-sm font-semibold text-amber-700">{formatEUR(detalleRemesa[r.id].resumen.importeSubRemesasPendientes)}</div>
                                  </div>
                                </div>

                                {/* Sub-remesas del banco */}
                                {detalleRemesa[r.id].subRemesas.length > 0 && (
                                  <div>
                                    <h5 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Sub-remesas del banco</h5>
                                    <div className="bg-white rounded-lg border overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead className="bg-gray-100">
                                          <tr>
                                            <th className="text-left px-3 py-2 font-medium text-gray-600">Referencia</th>
                                            <th className="text-left px-3 py-2 font-medium text-gray-600">Vencimiento</th>
                                            <th className="text-center px-3 py-2 font-medium text-gray-600">Recibos</th>
                                            <th className="text-right px-3 py-2 font-medium text-gray-600">Importe</th>
                                            <th className="text-center px-3 py-2 font-medium text-gray-600">Estado</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                          {detalleRemesa[r.id].subRemesas.map(sr => (
                                            <tr key={sr.id} className="hover:bg-gray-50">
                                              <td className="px-3 py-1.5 font-mono text-gray-700">{sr.referencia}</td>
                                              <td className="px-3 py-1.5 text-gray-600">{formatDate(sr.fechaVencimiento)}</td>
                                              <td className="px-3 py-1.5 text-center text-gray-600">{sr.numRecibos}</td>
                                              <td className="px-3 py-1.5 text-right font-mono font-medium">{formatEUR(sr.importe)}</td>
                                              <td className="px-3 py-1.5 text-center">
                                                {sr.cobrado ? (
                                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                                                    <CheckCircleIcon className="w-3 h-3" /> Cobrada
                                                  </span>
                                                ) : (
                                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                                                    <ClockIcon className="w-3 h-3" /> Pendiente
                                                  </span>
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {/* Devoluciones de esta remesa */}
                                {detalleRemesa[r.id].devoluciones.length > 0 && (
                                  <div>
                                    <h5 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Devoluciones ({detalleRemesa[r.id].devoluciones.length})</h5>
                                    <div className="bg-white rounded-lg border overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead className="bg-red-50">
                                          <tr>
                                            <th className="text-left px-3 py-2 font-medium text-gray-600">Factura</th>
                                            <th className="text-left px-3 py-2 font-medium text-gray-600">Cliente</th>
                                            <th className="text-right px-3 py-2 font-medium text-gray-600">Importe</th>
                                            <th className="text-left px-3 py-2 font-medium text-gray-600">Motivo</th>
                                            <th className="text-center px-3 py-2 font-medium text-gray-600">Estado</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                          {detalleRemesa[r.id].devoluciones.map((d, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                              <td className="px-3 py-1.5 font-mono text-gray-700">{d.numFactura}</td>
                                              <td className="px-3 py-1.5 text-gray-600 max-w-[150px] truncate">{d.cliente}</td>
                                              <td className="px-3 py-1.5 text-right font-mono text-red-600 font-medium">{formatEUR(d.importe)}</td>
                                              <td className="px-3 py-1.5 text-gray-500 max-w-[120px] truncate">{d.motivo || '—'}</td>
                                              <td className="px-3 py-1.5 text-center">{getEstadoDevolucionBadge(d.estado)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {/* Tabla de facturas con buscador */}
                                {detalleRemesa[r.id].facturas.length > 0 && (
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <h5 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                        Facturas ({detalleRemesa[r.id].facturas.length})
                                      </h5>
                                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                                        <input
                                          type="text"
                                          placeholder="Buscar cliente o factura..."
                                          value={filtroCliente}
                                          onChange={(e) => setFiltroCliente(e.target.value)}
                                          className="text-xs border border-gray-300 rounded-md px-3 py-1.5 w-56 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                                        />
                                        {filtroCliente && (
                                          <button
                                            onClick={() => setFiltroCliente('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                                          >
                                            ✕
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    {(() => {
                                      const facturasFiltradas = filtroCliente
                                        ? detalleRemesa[r.id].facturas.filter(f =>
                                            f.cliente.toLowerCase().includes(filtroCliente.toLowerCase()) ||
                                            f.numeroFactura.toLowerCase().includes(filtroCliente.toLowerCase())
                                          )
                                        : detalleRemesa[r.id].facturas;
                                      return (
                                        <>
                                          {filtroCliente && (
                                            <p className="text-xs text-gray-500 mb-1">
                                              Mostrando {facturasFiltradas.length} de {detalleRemesa[r.id].facturas.length} facturas
                                            </p>
                                          )}
                                          <div className="bg-white rounded-lg border overflow-hidden max-h-64 overflow-y-auto">
                                            <table className="w-full text-xs">
                                              <thead className="bg-gray-100 sticky top-0">
                                                <tr>
                                                  <th className="text-left px-3 py-2 font-medium text-gray-600">Factura</th>
                                                  <th className="text-left px-3 py-2 font-medium text-gray-600">Cliente</th>
                                                  <th className="text-right px-3 py-2 font-medium text-gray-600">Importe</th>
                                                  <th className="text-center px-3 py-2 font-medium text-gray-600">Estado BD</th>
                                                  <th className="text-center px-3 py-2 font-medium text-gray-600">Devolución</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y">
                                                {facturasFiltradas.length === 0 ? (
                                                  <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">No se encontraron facturas para "{filtroCliente}"</td></tr>
                                                ) : (
                                                  facturasFiltradas.map(f => (
                                                    <tr key={f.id} className={`hover:bg-gray-50 ${f.tieneDevolucion ? 'bg-red-50/50' : ''}`}>
                                                      <td className="px-3 py-1.5 font-mono text-gray-700">{f.numeroFactura}</td>
                                                      <td className="px-3 py-1.5 text-gray-600 max-w-[180px] truncate">{f.cliente}</td>
                                                      <td className="px-3 py-1.5 text-right font-mono font-medium">{formatEUR(f.importe)}</td>
                                                      <td className="px-3 py-1.5 text-center">
                                                        {f.situacion === 'COBRADA' ? (
                                                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Cobrada</span>
                                                        ) : (
                                                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{f.situacion}</span>
                                                        )}
                                                      </td>
                                                      <td className="px-3 py-1.5 text-center">
                                                        {f.tieneDevolucion ? (
                                                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                                                            {f.estadoDevolucion === 'COBRADO_TRANSFERENCIA' ? 'Recuperada' : 'Devuelta'}
                                                          </span>
                                                        ) : (
                                                          <span className="text-gray-400">—</span>
                                                        )}
                                                      </td>
                                                    </tr>
                                                  ))
                                                )}
                                              </tbody>
                                            </table>
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 py-2">No se pudo cargar el detalle.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabla Devoluciones */}
      {vista === 'devoluciones' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Factura</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Importe</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Motivo Banco</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Remesa</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha Dev.</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Banco</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Estado Dev.</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Factura BD</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cobro</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {devoluciones.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No hay devoluciones para el periodo seleccionado</td></tr>
                ) : (
                  devoluciones.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 font-mono">{d.numeroFactura}</div>
                        {d.referenciaExterna && <div className="text-xs text-gray-400">{d.referenciaExterna}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">{d.nombreCliente}</td>
                      <td className="px-4 py-3 text-right font-mono text-red-600 font-medium">{formatEUR(d.importe)}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-[150px] truncate">
                        {d.motivoBanco || d.motivo || <span className="text-gray-400">&mdash;</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{d.remesaNombre || <span className="text-gray-400">&mdash;</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(d.fechaDevolucion)}</td>
                      <td className="px-4 py-3 text-center">
                        {d.conciliadaBanco ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircleIcon className="w-3 h-3" /> Conciliada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            <ClockIcon className="w-3 h-3" /> Pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">{getEstadoDevolucionBadge(d.estado)}</td>
                      <td className="px-4 py-3 text-center">
                        {d.facturaSituacion === 'COBRADA' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircleIcon className="w-3 h-3" /> Cobrada
                          </span>
                        ) : d.facturaSituacion === 'PENDIENTE' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <ExclamationTriangleIcon className="w-3 h-3" /> Pendiente
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">{d.facturaSituacion || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {d.importeCobrado ? (
                          <div>
                            <div className="text-green-600 font-medium">{formatEUR(d.importeCobrado)}</div>
                            {d.fechaCobro && <div className="text-gray-400">{formatDate(d.fechaCobro)}</div>}
                          </div>
                        ) : <span className="text-gray-400">&mdash;</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {devoluciones.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td className="px-4 py-3 font-semibold text-gray-700" colSpan={2}>TOTAL ({devoluciones.length} devoluciones)</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-red-700">
                      {formatEUR(devoluciones.reduce((sum, d) => sum + d.importe, 0))}
                    </td>
                    <td colSpan={4}></td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-gray-500">
                        {devoluciones.filter(d => d.conciliadaBanco).length}/{devoluciones.length}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-gray-500">
                        {devoluciones.filter(d => d.estado === 'COBRADO_TRANSFERENCIA' || d.estado === 'COBRADO_PARCIAL').length} cobradas
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-green-700">
                      {formatEUR(devoluciones.filter(d => d.importeCobrado).reduce((sum, d) => sum + (d.importeCobrado || 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
