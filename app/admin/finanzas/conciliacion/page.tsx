'use client';
import { useState, useEffect, useRef } from 'react';
import { ArrowPathIcon, CheckCircleIcon, XMarkIcon, LinkIcon, BanknotesIcon, DocumentTextIcon, ArrowUturnLeftIcon, MagnifyingGlassIcon, ExclamationTriangleIcon, UserIcon } from '@heroicons/react/24/outline';

interface Movimiento {
  id: string;
  fechaOperacion: string;
  concepto: string;
  importe: number;
  saldo: number | null;
  categoria: string | null;
  tipoPago: string | null;
  conciliado: boolean;
  pendienteFactura: boolean;
  pagoACuentaVola: boolean;
  facturaEmitidaId: string | null;
  notaConciliacion: string | null;
  tipoDocumento: string | null;
  documentoRecibido: boolean | null;
  entregaACuentaEmpleadoId: string | null;
  cuenta: { banco: string; alias: string };
  factura: { id: string; proveedor: string; numFactura: string; total: number } | null;
  facturaEmitida: { id: string; cliente: string; numFactura: string; total: number } | null;
  entregaACuentaEmpleado: { id: string; nombreCompleto: string } | null;
  entidadFiscal: { id: string; razonSocial: string; tipo: string; nifCif: string | null; cuentaContableA3: string | null } | null;
}

interface Sugerencia {
  id: string;
  proveedor?: string;
  cliente?: string;
  numFactura: string;
  fecha: string;
  total: number;
  score: number;
  reasons: string[];
}

interface EmpleadoSimple {
  id: string;
  nombreCompleto: string;
}

interface EstadoConciliacion {
  totalMovimientos: number;
  conciliados: number;
  sinConciliar: number;
  sinCategorizar: number;
  porcentajeConciliado: number;
  conProveedorIdentificado: number;
  conFacturaVinculada: number;
  conFacturaEmitidaVinculada: number;
  sinProveedorGastos: number;
  pendienteFacturaCount: number;
  pagosVolaCount: number;
  pagosVolaImporte: number;
  entregasACuentaCount: number;
  entregasACuentaImporte: number;
  sinDocumentoCount: number;
  facturasRecibidasSinConciliar: number;
}

export default function ConciliacionPage() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState<EstadoConciliacion | null>(null);
  const [conciliando, setConciliando] = useState(false);
  const [resultadoConciliacion, setResultadoConciliacion] = useState<any>(null);
  const [selectedMov, setSelectedMov] = useState<string | null>(null);
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [todasFacturas, setTodasFacturas] = useState<Sugerencia[]>([]);
  const [totalPendientes, setTotalPendientes] = useState(0);
  const [loadingSugerencias, setLoadingSugerencias] = useState(false);
  const [buscarFactura, setBuscarFactura] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'gastos' | 'ingresos' | 'todos'>('gastos');
  const [filtroBanco, setFiltroBanco] = useState('');
  const [filtroConciliado, setFiltroConciliado] = useState<'false' | 'true' | ''>('false');
  const [filtroEspecial, setFiltroEspecial] = useState<'' | 'pendienteFactura' | 'pagoVola' | 'sinDocumento' | 'entregaACuenta' | 'conProveedor' | 'conFacturaRecibida' | 'conFacturaEmitida' | 'sinProveedor'>('');
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [tabSugerencias, setTabSugerencias] = useState<'sugeridas' | 'todas'>('sugeridas');
  const [tipoSugerencia, setTipoSugerencia] = useState<'factura_recibida' | 'factura_emitida'>('factura_recibida');
  // Entrega a cuenta
  const [showEmpleadoSelector, setShowEmpleadoSelector] = useState<string | null>(null);
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState<EmpleadoSimple | null>(null);
  const [empleados, setEmpleados] = useState<EmpleadoSimple[]>([]);
  const [loadingEmpleados, setLoadingEmpleados] = useState(false);
  // Vincular con tercero
  const [showTerceroSelector, setShowTerceroSelector] = useState<string | null>(null);
  const [terceros, setTerceros] = useState<any[]>([]);
  const [loadingTerceros, setLoadingTerceros] = useState(false);
  const [buscarTercero, setBuscarTercero] = useState('');
  // Buscador de movimientos
  const [buscarMovimiento, setBuscarMovimiento] = useState('');
  // Filtro por tipo de documento
  const [filtroDocumento, setFiltroDocumento] = useState<'' | 'factura' | 'ticket' | 'justificante' | 'sinTipoDoc' | 'facturaPendiente'>('');

  useEffect(() => {
    fetchCuentas();
    fetchEstado();
  }, []);

  useEffect(() => {
    fetchMovimientos();
  }, [page, filtroTipo, filtroBanco, filtroConciliado, filtroEspecial, filtroDocumento]);

  async function fetchCuentas() {
    try {
      const res = await fetch('/api/admin/finanzas/cuentas');
      const json = await res.json();
      setCuentas(json.cuentas || []);
    } catch (e) { /* silencio */ }
  }

  async function fetchEstado() {
    try {
      const res = await fetch('/api/admin/finanzas/conciliacion');
      const json = await res.json();
      setEstado(json);
    } catch (e) { /* silencio */ }
  }

  async function fetchMovimientos() {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      limit: '30',
    });
    if (filtroConciliado) params.set('conciliado', filtroConciliado);
    if (filtroBanco) params.set('cuentaId', filtroBanco);
    if (filtroEspecial === 'pendienteFactura') params.set('pendienteFactura', 'true');
    if (filtroEspecial === 'pagoVola') params.set('pagoACuentaVola', 'true');
    if (filtroEspecial === 'sinDocumento') params.set('sinDocumento', 'true');
    if (filtroEspecial === 'entregaACuenta') params.set('entregaACuenta', 'true');
    if (filtroEspecial === 'conProveedor') params.set('conProveedor', 'true');
    if (filtroEspecial === 'conFacturaRecibida') params.set('conFacturaRecibida', 'true');
    if (filtroEspecial === 'conFacturaEmitida') params.set('conFacturaEmitida', 'true');
    if (filtroEspecial === 'sinProveedor') params.set('sinProveedor', 'true');
    if (buscarMovimiento.trim()) params.set('buscar', buscarMovimiento.trim());
    if (filtroDocumento === 'sinTipoDoc') {
      params.set('tipoDocumento', 'null');
    } else if (filtroDocumento === 'facturaPendiente') {
      params.set('tipoDocumento', 'factura');
      params.set('conciliado', 'false');
    } else if (filtroDocumento) {
      params.set('tipoDocumento', filtroDocumento);
    }
    const res = await fetch(`/api/admin/finanzas/movimientos?${params}`);
    const json = await res.json();
    let movs = json.movimientos || [];
    if (filtroTipo === 'gastos') movs = movs.filter((m: Movimiento) => m.importe < 0);
    if (filtroTipo === 'ingresos') movs = movs.filter((m: Movimiento) => m.importe > 0);
    setMovimientos(movs);
    setTotal(json.total || 0);
    setLoading(false);
  }

  async function ejecutarConciliacion() {
    setConciliando(true);
    setResultadoConciliacion(null);
    try {
      const res = await fetch('/api/admin/finanzas/conciliacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: 'todo' }),
      });
      const json = await res.json();
      setResultadoConciliacion(json.resultados);
      fetchMovimientos();
      fetchEstado();
    } catch (e) {
      console.error(e);
    }
    setConciliando(false);
  }

  async function fetchSugerencias(movimientoId: string, buscar?: string) {
    if (selectedMov === movimientoId && !buscar) {
      setSelectedMov(null);
      setSugerencias([]);
      setTodasFacturas([]);
      return;
    }
    setSelectedMov(movimientoId);
    setLoadingSugerencias(true);
    setSugerencias([]);
    setTodasFacturas([]);
    setTabSugerencias('sugeridas');
    setShowEmpleadoSelector(null);
    try {
      const params = new URLSearchParams({ movimientoId });
      if (buscar) params.set('buscar', buscar);
      const res = await fetch(`/api/admin/finanzas/conciliacion/sugerencias?${params}`);
      const json = await res.json();
      setSugerencias(json.sugerencias || []);
      setTodasFacturas(json.todas || []);
      setTotalPendientes(json.totalPendientes || 0);
      setTipoSugerencia(json.tipo || 'factura_recibida');
      if ((json.sugerencias || []).length === 0) {
        setTabSugerencias('todas');
      }
    } catch (e) {
      console.error(e);
    }
    setLoadingSugerencias(false);
    setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }

  async function buscarEnFacturas() {
    if (selectedMov) {
      setLoadingSugerencias(true);
      try {
        const params = new URLSearchParams({ movimientoId: selectedMov });
        if (buscarFactura) params.set('buscar', buscarFactura);
        const res = await fetch(`/api/admin/finanzas/conciliacion/sugerencias?${params}`);
        const json = await res.json();
        setSugerencias(json.sugerencias || []);
        setTodasFacturas(json.todas || []);
        setTotalPendientes(json.totalPendientes || 0);
      } catch (e) {
        console.error(e);
      }
      setLoadingSugerencias(false);
    }
  }

  async function conciliarManual(movimientoId: string, facturaId: string) {
    const mov = movimientos.find(m => m.id === movimientoId);
    const isIngreso = mov && mov.importe > 0;
    
    const body: any = { conciliado: true };
    if (isIngreso) {
      body.facturaEmitidaId = facturaId;
    } else {
      body.facturaId = facturaId;
    }

    const res = await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    
    // Si se vinculó proveedor y hay similares, preguntar si asignar a todos
    if (result.similares && result.similares > 0) {
      const confirmar = window.confirm(
        `Se han encontrado ${result.similares} movimiento(s) con concepto similar.\n\n¿Quieres asignar el mismo proveedor "${result.proveedorNombre}" a todos?`
      );
      if (confirmar) {
        await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asignarProveedorASimilares: true }),
        });
      }
    }
    
    setSelectedMov(null);
    setSugerencias([]);
    setTodasFacturas([]);
    fetchMovimientos();
    fetchEstado();
  }

  async function marcarNoAplica(movimientoId: string, categoria: string) {
    await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conciliado: true, categoria, crearRegla: true }),
    });
    setSelectedMov(null);
    setSugerencias([]);
    setTodasFacturas([]);
    fetchMovimientos();
    fetchEstado();
  }

  async function marcarPendienteFactura(movimientoId: string) {
    await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendienteFactura: true }),
    });
    setSelectedMov(null);
    setSugerencias([]);
    setTodasFacturas([]);
    fetchMovimientos();
  }

  async function quitarPendienteFactura(movimientoId: string) {
    await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendienteFactura: false }),
    });
    fetchMovimientos();
  }

  async function marcarPagoVola(movimientoId: string) {
    if (!confirm('Marcar como pago a cuenta de Vola? Se conciliara automaticamente.')) return;
    await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagoACuentaVola: true }),
    });
    setSelectedMov(null);
    setSugerencias([]);
    setTodasFacturas([]);
    fetchMovimientos();
    fetchEstado();
  }

  async function fetchEmpleados() {
    if (empleados.length > 0) return; // ya cargados
    setLoadingEmpleados(true);
    try {
      const res = await fetch('/api/admin/empleados?estado=ACTIVO');
      const json = await res.json();
      setEmpleados((json.empleados || []).map((e: any) => ({ id: e.id, nombreCompleto: e.nombreCompleto })));
    } catch (e) {
      console.error(e);
    }
    setLoadingEmpleados(false);
  }

  async function marcarEntregaACuenta(movimientoId: string, empleadoId: string, tipoEntrega: 'coste_empresa' | 'anticipo') {
    await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entregaACuentaEmpleadoId: empleadoId, tipoEntrega }),
    });
    setSelectedMov(null);
    setSugerencias([]);
    setTodasFacturas([]);
    setShowEmpleadoSelector(null);
    setEmpleadoSeleccionado(null);
    fetchMovimientos();
    fetchEstado();
  }

  async function desconciliar(movimientoId: string) {
    if (!confirm('Deshacer la conciliacion de este movimiento?')) return;
    await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conciliado: false, facturaId: null, facturaEmitidaId: null, gastoId: null, categoria: null, pagoACuentaVola: false, pendienteFactura: false, tipoDocumento: null, documentoRecibido: null, entregaACuentaEmpleadoId: null, tipoEntrega: null }),
    });
    fetchMovimientos();
    fetchEstado();
  }

  async function marcarTipoDocumento(movimientoId: string, tipo: 'factura' | 'ticket' | 'justificante') {
    const docRecibido = tipo === 'ticket' || tipo === 'justificante' ? true : false;
    await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipoDocumento: tipo, documentoRecibido: docRecibido }),
    });
    fetchMovimientos();
  }

  async function toggleDocumentoRecibido(movimientoId: string, recibido: boolean) {
    await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentoRecibido: recibido }),
    });
    fetchMovimientos();
  }

  async function quitarTipoDocumento(movimientoId: string) {
    await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipoDocumento: null, documentoRecibido: null }),
    });
    fetchMovimientos();
  }

  async function desvincularTercero(movimientoId: string) {
    await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entidadFiscalId: null }),
    });
    fetchMovimientos();
    fetchEstado();
  }

  async function fetchTerceros(buscar?: string) {
    setLoadingTerceros(true);
    try {
      const params = new URLSearchParams({ limit: '20', activo: 'true' });
      if (buscar) params.set('buscar', buscar);
      const res = await fetch(`/api/admin/finanzas/datos-fiscales?${params}`);
      const json = await res.json();
      setTerceros(json.entidades || []);
    } catch (e) { console.error(e); }
    setLoadingTerceros(false);
  }

  async function vincularTercero(movimientoId: string, entidadFiscalId: string) {
    const res = await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entidadFiscalId }),
    });
    const result = await res.json();
    // Sugerir asignar a similares
    if (result.similares && result.similares > 0) {
      const confirmar = window.confirm(
        `Se han encontrado ${result.similares} movimiento(s) con concepto similar.\n\n¿Quieres asignar el mismo tercero a todos?`
      );
      if (confirmar) {
        await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asignarProveedorASimilares: true }),
        });
      }
    }
    setShowTerceroSelector(null);
    setBuscarTercero('');
    setTerceros([]);
    setSelectedMov(null);
    fetchMovimientos();
    fetchEstado();
  }

  function formatEUR(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function formatFecha(str: string) {
    return new Date(str).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
  }

  const porcentaje = estado ? estado.porcentajeConciliado : 0;

  // Renderizar el panel de sugerencias inline
  function renderPanelSugerencias(movId: string) {
    if (selectedMov !== movId) return null;
    const mov = movimientos.find(m => m.id === movId);
    const esIngreso = mov && mov.importe > 0;
    const facturasAMostrar = tabSugerencias === 'sugeridas' ? sugerencias : todasFacturas;

    return (
      <tr key={`panel-${movId}`}>
        <td colSpan={9} className="p-0">
          <div ref={panelRef} className="bg-blue-50 border-t-2 border-b-2 border-blue-300 p-4 space-y-3">
            {/* Header del panel */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DocumentTextIcon className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900 text-sm">
                  {esIngreso ? 'Facturas emitidas candidatas (cobro)' : 'Facturas recibidas candidatas'}
                </h3>
                <span className="text-xs text-gray-500">({totalPendientes} pendientes de vincular)</span>
              </div>
              <button onClick={() => { setSelectedMov(null); setSugerencias([]); setTodasFacturas([]); setShowEmpleadoSelector(null); }} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Sugerencia automatica destacada */}
            {sugerencias.length > 0 && sugerencias[0].score >= 50 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircleIcon className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-900">
                      Sugerencia: {sugerencias[0].proveedor || sugerencias[0].cliente} - {sugerencias[0].numFactura}
                    </p>
                    <p className="text-xs text-green-700">
                      {sugerencias[0].reasons.join(' · ')} · {formatEUR(sugerencias[0].total)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => conciliarManual(movId, sugerencias[0].id)}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                >
                  Aceptar sugerencia
                </button>
              </div>
            )}

            {/* Tabs + Buscador */}
            <div className="flex items-center gap-3">
              <div className="flex bg-white rounded-lg p-0.5 border">
                <button
                  onClick={() => setTabSugerencias('sugeridas')}
                  className={`px-3 py-1 text-xs font-medium rounded-md ${tabSugerencias === 'sugeridas' ? 'bg-blue-100 text-blue-700' : 'text-gray-500'}`}
                >
                  Sugeridas ({sugerencias.length})
                </button>
                <button
                  onClick={() => setTabSugerencias('todas')}
                  className={`px-3 py-1 text-xs font-medium rounded-md ${tabSugerencias === 'todas' ? 'bg-blue-100 text-blue-700' : 'text-gray-500'}`}
                >
                  Todas ({todasFacturas.length})
                </button>
              </div>
              <div className="flex-1 flex items-center gap-2">
                <div className="relative flex-1 max-w-xs">
                  <MagnifyingGlassIcon className="h-4 w-4 absolute left-2.5 top-2 text-gray-400" />
                  <input
                    type="text"
                    placeholder={esIngreso ? "Buscar cliente o n factura..." : "Buscar proveedor o n factura..."}
                    value={buscarFactura}
                    onChange={(e) => setBuscarFactura(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') buscarEnFacturas(); }}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-lg"
                  />
                </div>
                <button
                  onClick={buscarEnFacturas}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Buscar
                </button>
              </div>
            </div>

            {/* Acciones especiales */}
            <div className="flex items-center gap-2 text-xs flex-wrap">
              {!esIngreso && (
                <>
                  <span className="text-gray-500">Sin factura:</span>
                  {['Otros Gastos', 'Estructura', 'Dietas', 'Gastos Financieros', 'Desplazamientos', 'Impuestos'].map(cat => (
                    <button
                      key={cat}
                      onClick={() => marcarNoAplica(movId, cat)}
                      className="px-2 py-1 bg-white border border-gray-200 rounded hover:bg-gray-100 text-gray-600"
                    >
                      {cat}
                    </button>
                  ))}
                  <span className="text-gray-300 mx-1">|</span>
                </>
              )}
              <button
                onClick={() => marcarPendienteFactura(movId)}
                className="px-2 py-1 bg-amber-50 border border-amber-300 rounded hover:bg-amber-100 text-amber-700 font-medium"
              >
                Pendiente factura / Reclamar
              </button>
              {!esIngreso && mov && !mov.tipoDocumento && (
                <>
                  <span className="text-gray-300 mx-1">|</span>
                  <span className="text-gray-500">Tipo:</span>
                  <button
                    onClick={() => marcarTipoDocumento(movId, 'factura')}
                    className="px-2 py-1 bg-blue-50 border border-blue-300 rounded hover:bg-blue-100 text-blue-700 font-medium"
                  >
                    Factura
                  </button>
                  <button
                    onClick={() => marcarTipoDocumento(movId, 'ticket')}
                    className="px-2 py-1 bg-gray-50 border border-gray-300 rounded hover:bg-gray-100 text-gray-600 font-medium"
                  >
                    Ticket
                  </button>
                  <button
                    onClick={() => marcarTipoDocumento(movId, 'justificante')}
                    className="px-2 py-1 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 text-blue-600 font-medium"
                  >
                    Justificante
                  </button>
                </>
              )}
              {!esIngreso && (
                <>
                  <button
                    onClick={() => marcarPagoVola(movId)}
                    className="px-2 py-1 bg-purple-50 border border-purple-300 rounded hover:bg-purple-100 text-purple-700 font-medium"
                  >
                    Pago a cuenta Vola
                  </button>
                  <button
                    onClick={() => {
                      setShowEmpleadoSelector(movId);
                      fetchEmpleados();
                    }}
                    className="px-2 py-1 bg-teal-50 border border-teal-300 rounded hover:bg-teal-100 text-teal-700 font-medium flex items-center gap-1"
                  >
                    <UserIcon className="h-3.5 w-3.5" />
                    Entrega a cuenta
                  </button>
                </>
              )}
              <span className="text-gray-300 mx-1">|</span>
              <button
                onClick={() => {
                  setShowTerceroSelector(movId);
                  fetchTerceros();
                }}
                className="px-2 py-1 bg-indigo-50 border border-indigo-300 rounded hover:bg-indigo-100 text-indigo-700 font-medium flex items-center gap-1"
              >
                <BanknotesIcon className="h-3.5 w-3.5" />
                Vincular con tercero
              </button>
            </div>

            {/* Selector de empleado para entrega a cuenta */}
            {showEmpleadoSelector === movId && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-teal-900 flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    {!empleadoSeleccionado ? 'Paso 1: Seleccionar empleado' : `Paso 2: Tipo de entrega para ${empleadoSeleccionado.nombreCompleto}`}
                  </p>
                  <button onClick={() => { setShowEmpleadoSelector(null); setEmpleadoSeleccionado(null); }} className="text-gray-400 hover:text-gray-600">
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
                {loadingEmpleados ? (
                  <p className="text-xs text-gray-500">Cargando empleados...</p>
                ) : !empleadoSeleccionado ? (
                  <div className="flex flex-wrap gap-2">
                    {empleados.map(emp => (
                      <button
                        key={emp.id}
                        onClick={() => setEmpleadoSeleccionado(emp)}
                        className="px-3 py-1.5 text-xs bg-white border border-teal-200 rounded-lg hover:bg-teal-100 hover:border-teal-400 text-teal-800 font-medium transition-colors"
                      >
                        {emp.nombreCompleto}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => marcarEntregaACuenta(movId, empleadoSeleccionado.id, 'coste_empresa')}
                      className="px-4 py-2 text-sm bg-white border-2 border-teal-300 rounded-lg hover:bg-teal-100 hover:border-teal-500 text-teal-800 font-medium transition-colors"
                    >
                      <span className="block font-semibold">Coste empresa</span>
                      <span className="block text-[10px] text-teal-600 mt-0.5">SS autonomos, seguros... (suma a costes personal)</span>
                    </button>
                    <button
                      onClick={() => marcarEntregaACuenta(movId, empleadoSeleccionado.id, 'anticipo')}
                      className="px-4 py-2 text-sm bg-white border-2 border-amber-300 rounded-lg hover:bg-amber-50 hover:border-amber-500 text-amber-800 font-medium transition-colors"
                    >
                      <span className="block font-semibold">Anticipo / Prestamo</span>
                      <span className="block text-[10px] text-amber-600 mt-0.5">Adelanto nomina (se descuenta despues)</span>
                    </button>
                    <button
                      onClick={() => setEmpleadoSeleccionado(null)}
                      className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
                    >
                      Cambiar empleado
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Selector de tercero (entidad fiscal) */}
            {showTerceroSelector === movId && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-indigo-900 flex items-center gap-2">
                    <BanknotesIcon className="h-4 w-4" />
                    Vincular con tercero (Proveedor / Cliente / AAPP)
                  </p>
                  <button onClick={() => { setShowTerceroSelector(null); setBuscarTercero(''); setTerceros([]); }} className="text-gray-400 hover:text-gray-600">
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Buscar por nombre, NIF o cuenta contable..."
                    value={buscarTercero}
                    onChange={(e) => setBuscarTercero(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') fetchTerceros(buscarTercero); }}
                    className="flex-1 px-3 py-1.5 text-xs border rounded-lg"
                  />
                  <button
                    onClick={() => fetchTerceros(buscarTercero)}
                    className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
                  >
                    Buscar
                  </button>
                </div>
                {loadingTerceros ? (
                  <p className="text-xs text-gray-500">Buscando...</p>
                ) : terceros.length === 0 ? (
                  <p className="text-xs text-gray-500">No se encontraron entidades. Prueba con otro término.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                    {terceros.map((t: any) => (
                      <button
                        key={t.id}
                        onClick={() => vincularTercero(movId, t.id)}
                        className="px-3 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg hover:bg-indigo-100 hover:border-indigo-400 text-indigo-800 font-medium transition-colors"
                        title={`${t.nifCif || ''} · ${t.tipo} · ${t.cuentaContableA3 || 'Sin cuenta A3'}`}
                      >
                        <span>{t.razonSocial}</span>
                        <span className="ml-1 text-[10px] text-indigo-500">
                          ({t.tipo === 'PROVEEDOR' ? 'Prov' : t.tipo === 'CLIENTE' ? 'Cli' : t.tipo === 'PERSONAL' ? 'Pers' : 'AAPP'})
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Lista de facturas */}
            {loadingSugerencias ? (
              <p className="text-sm text-gray-400 py-4 text-center">Buscando facturas...</p>
            ) : facturasAMostrar.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No se encontraron facturas. Prueba con otro termino de busqueda.</p>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {facturasAMostrar.map(sug => (
                  <div
                    key={sug.id}
                    className="flex items-center justify-between p-2.5 bg-white border rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900 truncate">{sug.proveedor || sug.cliente || '—'}</span>
                        <span className="text-xs text-gray-500 flex-shrink-0">{sug.numFactura}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{formatFecha(sug.fecha)}</span>
                      </div>
                      {sug.reasons.length > 0 && (
                        <div className="flex gap-1 mt-0.5">
                          {sug.reasons.map((r, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">{r}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <span className={`text-sm font-medium ${
                        Math.abs(sug.total - Math.abs(movimientos.find(m => m.id === selectedMov)?.importe || 0)) < 0.1 
                          ? 'text-green-700' : 'text-gray-700'
                      }`}>
                        {formatEUR(sug.total)}
                      </span>
                      {sug.score > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          sug.score >= 60 ? 'bg-green-100 text-green-700' :
                          sug.score >= 30 ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {sug.score}
                        </span>
                      )}
                      <button
                        onClick={() => conciliarManual(movId, sug.id)}
                        className="px-2.5 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 font-medium"
                      >
                        Vincular
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conciliacion Bancaria</h1>
          <p className="text-sm text-gray-500 mt-1">
            Vincula movimientos bancarios con facturas
          </p>
        </div>
        <button
          onClick={ejecutarConciliacion}
          disabled={conciliando}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-sm"
        >
          <ArrowPathIcon className={`h-4 w-4 ${conciliando ? 'animate-spin' : ''}`} />
          {conciliando ? 'Conciliando...' : 'Conciliar Automaticamente'}
        </button>
      </div>

      {/* KPIs */}
      {estado && (
        <div className="grid grid-cols-7 gap-3">
          <button
            onClick={() => { setFiltroConciliado(''); setFiltroEspecial(''); setPage(1); }}
            className={`bg-white border rounded-lg p-4 text-left transition-all hover:shadow-md ${
              filtroConciliado === '' && filtroEspecial === '' ? 'ring-2 ring-gray-400 shadow-md' : ''
            }`}
          >
            <p className="text-xs text-gray-500 uppercase">Total Movimientos</p>
            <p className="text-2xl font-bold text-gray-900">{estado.totalMovimientos.toLocaleString()}</p>
          </button>
          <button
            onClick={() => { setFiltroConciliado('true'); setFiltroEspecial(''); setPage(1); }}
            className={`bg-white border rounded-lg p-4 text-left transition-all hover:shadow-md ${
              filtroConciliado === 'true' && filtroEspecial === '' ? 'ring-2 ring-green-400 shadow-md' : ''
            }`}
          >
            <p className="text-xs text-gray-500 uppercase">Conciliados</p>
            <p className="text-2xl font-bold text-green-700">{estado.conciliados.toLocaleString()}</p>
          </button>
          <button
            onClick={() => { setFiltroConciliado('false'); setFiltroEspecial(''); setPage(1); }}
            className={`bg-white border rounded-lg p-4 text-left transition-all hover:shadow-md ${
              filtroConciliado === 'false' && filtroEspecial === '' ? 'ring-2 ring-amber-400 shadow-md' : ''
            }`}
          >
            <p className="text-xs text-gray-500 uppercase">Sin Conciliar</p>
            <p className="text-2xl font-bold text-amber-700">{estado.sinConciliar.toLocaleString()}</p>
          </button>
          <button
            onClick={() => { setFiltroConciliado(''); setFiltroEspecial('pendienteFactura'); setPage(1); }}
            className={`bg-white border rounded-lg p-4 text-left transition-all hover:shadow-md ${
              filtroEspecial === 'pendienteFactura' ? 'ring-2 ring-orange-400 shadow-md' : ''
            }`}
          >
            <p className="text-xs text-orange-600 uppercase font-medium">Reclamar Factura</p>
            <p className="text-2xl font-bold text-orange-700">{estado.pendienteFacturaCount || 0}</p>
            <p className="text-[10px] text-gray-400">Pdte. recibir</p>
          </button>
          <button
            onClick={() => { setFiltroConciliado(''); setFiltroEspecial('pagoVola'); setPage(1); }}
            className={`bg-white border rounded-lg p-4 text-left transition-all hover:shadow-md ${
              filtroEspecial === 'pagoVola' ? 'ring-2 ring-purple-400 shadow-md' : ''
            }`}
          >
            <p className="text-xs text-purple-600 uppercase font-medium">Pagos Vola</p>
            <p className="text-2xl font-bold text-purple-700">{estado.pagosVolaCount || 0}</p>
            <p className="text-[10px] text-gray-400">{estado.pagosVolaImporte ? `${estado.pagosVolaImporte.toLocaleString('es-ES', {style:'currency',currency:'EUR'})}` : 'A cuenta'}</p>
          </button>
          <button
            onClick={() => { setFiltroConciliado(''); setFiltroEspecial('entregaACuenta'); setPage(1); }}
            className={`bg-white border rounded-lg p-4 text-left transition-all hover:shadow-md ${
              filtroEspecial === 'entregaACuenta' ? 'ring-2 ring-teal-400 shadow-md' : ''
            }`}
          >
            <p className="text-xs text-teal-600 uppercase font-medium">Entregas a cuenta</p>
            <p className="text-2xl font-bold text-teal-700">{estado.entregasACuentaCount || 0}</p>
            <p className="text-[10px] text-gray-400">{estado.entregasACuentaImporte ? `${estado.entregasACuentaImporte.toLocaleString('es-ES', {style:'currency',currency:'EUR'})}` : 'Empleados'}</p>
          </button>
          <button
            onClick={() => { setFiltroConciliado(''); setFiltroEspecial('sinDocumento'); setPage(1); }}
            className={`bg-white border rounded-lg p-4 text-left transition-all hover:shadow-md ${
              filtroEspecial === 'sinDocumento' ? 'ring-2 ring-red-400 shadow-md' : ''
            }`}
          >
            <p className="text-xs text-red-600 uppercase font-medium">Sin Documento</p>
            <p className="text-2xl font-bold text-red-700">{estado.sinDocumentoCount || 0}</p>
            <p className="text-[10px] text-gray-400">Facturas por reclamar</p>
          </button>
        </div>
      )}

      {/* KPIs Niveles de Conciliación */}
      {estado && (
        <div className="grid grid-cols-4 gap-3">
          <div onClick={() => { setFiltroEspecial(filtroEspecial === 'conProveedor' ? '' : 'conProveedor'); setFiltroConciliado(''); setPage(1); }} className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${filtroEspecial === 'conProveedor' ? 'border-blue-500 ring-2 ring-blue-200' : 'border-blue-200'}`}>
            <p className="text-xs text-blue-600 uppercase font-medium">Proveedor Identificado</p>
            <p className="text-2xl font-bold text-blue-700">{estado.conProveedorIdentificado || 0}</p>
            <p className="text-[10px] text-gray-400">Nivel 1 — Tercero vinculado</p>
          </div>
          <div onClick={() => { setFiltroEspecial(filtroEspecial === 'conFacturaRecibida' ? '' : 'conFacturaRecibida'); setFiltroConciliado(''); setPage(1); }} className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${filtroEspecial === 'conFacturaRecibida' ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-indigo-200'}`}>
            <p className="text-xs text-indigo-600 uppercase font-medium">Con Factura Recibida</p>
            <p className="text-2xl font-bold text-indigo-700">{estado.conFacturaVinculada || 0}</p>
            <p className="text-[10px] text-gray-400">Nivel 2 — Documento vinculado</p>
          </div>
          <div onClick={() => { setFiltroEspecial(filtroEspecial === 'conFacturaEmitida' ? '' : 'conFacturaEmitida'); setFiltroConciliado(''); setPage(1); }} className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${filtroEspecial === 'conFacturaEmitida' ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-emerald-200'}`}>
            <p className="text-xs text-emerald-600 uppercase font-medium">Con Factura Emitida</p>
            <p className="text-2xl font-bold text-emerald-700">{estado.conFacturaEmitidaVinculada || 0}</p>
            <p className="text-[10px] text-gray-400">Cobros vinculados</p>
          </div>
          <div onClick={() => { setFiltroEspecial(filtroEspecial === 'sinProveedor' ? '' : 'sinProveedor'); setFiltroConciliado(''); setPage(1); }} className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${filtroEspecial === 'sinProveedor' ? 'border-rose-500 ring-2 ring-rose-200' : 'border-rose-200'}`}>
            <p className="text-xs text-rose-600 uppercase font-medium">Sin Proveedor (Gastos)</p>
            <p className="text-2xl font-bold text-rose-700">{estado.sinProveedorGastos || 0}</p>
            <p className="text-[10px] text-gray-400">Pendientes de identificar</p>
          </div>
        </div>
      )}

      {/* Resultado conciliacion automatica */}
      {resultadoConciliacion && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <CheckCircleIcon className="h-5 w-5 text-green-600" />
            <span><strong>{resultadoConciliacion.clasificados}</strong> clasificados</span>
            <span><strong>{resultadoConciliacion.conciliadosFacturasRecibidas}</strong> facturas recibidas</span>
            <span><strong>{resultadoConciliacion.conciliadosFacturasEmitidas}</strong> facturas emitidas</span>
            <span><strong>{resultadoConciliacion.conciliadosConfirming}</strong> confirming</span>
            <span><strong>{resultadoConciliacion.conciliadosTraspasos}</strong> traspasos</span>
          </div>
          <button onClick={() => setResultadoConciliacion(null)} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 items-center">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(['gastos', 'ingresos', 'todos'] as const).map(tipo => (
            <button
              key={tipo}
              onClick={() => { setFiltroTipo(tipo); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filtroTipo === tipo ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tipo === 'gastos' ? 'Gastos' : tipo === 'ingresos' ? 'Ingresos' : 'Todos'}
            </button>
          ))}
        </div>
        <select
          value={filtroBanco}
          onChange={(e) => { setFiltroBanco(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">Todos los bancos</option>
          {cuentas.map(c => (
            <option key={c.id} value={c.id}>{c.banco} - {c.alias}</option>
          ))}
        </select>
        <select
          value={filtroDocumento}
          onChange={(e) => { setFiltroDocumento(e.target.value as any); setPage(1); }}
          className="border rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">Todos los docs</option>
          <option value="factura">Con Factura</option>
          <option value="facturaPendiente">Factura pendiente</option>
          <option value="ticket">Con Ticket</option>
          <option value="justificante">Con Justificante</option>
          <option value="sinTipoDoc">Sin tipo doc</option>
        </select>
        <div className="flex items-center gap-1">
          <input
            type="text"
            placeholder="Buscar concepto, tercero, NIF..."
            value={buscarMovimiento}
            onChange={(e) => setBuscarMovimiento(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchMovimientos(); } }}
            className="border rounded-lg px-3 py-1.5 text-sm w-56"
          />
          {buscarMovimiento && (
            <button onClick={() => { setBuscarMovimiento(''); setTimeout(() => fetchMovimientos(), 0); setPage(1); }} className="text-gray-400 hover:text-gray-600">
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        {filtroEspecial && (
          <span className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg ${
            filtroEspecial === 'sinDocumento' ? 'bg-red-50 border border-red-200 text-red-700' :
            filtroEspecial === 'pagoVola' ? 'bg-purple-50 border border-purple-200 text-purple-700' :
            filtroEspecial === 'entregaACuenta' ? 'bg-teal-50 border border-teal-200 text-teal-700' :
            filtroEspecial === 'conProveedor' ? 'bg-blue-50 border border-blue-200 text-blue-700' :
            filtroEspecial === 'conFacturaRecibida' ? 'bg-indigo-50 border border-indigo-200 text-indigo-700' :
            filtroEspecial === 'conFacturaEmitida' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' :
            filtroEspecial === 'sinProveedor' ? 'bg-rose-50 border border-rose-200 text-rose-700' :
            'bg-amber-50 border border-amber-200 text-amber-700'
          }`}>
            {filtroEspecial === 'pendienteFactura' ? 'Filtrando: Pendiente factura' : 
             filtroEspecial === 'pagoVola' ? 'Filtrando: Pagos Vola' :
             filtroEspecial === 'entregaACuenta' ? 'Filtrando: Entregas a cuenta' :
             filtroEspecial === 'conProveedor' ? 'Filtrando: Con proveedor identificado' :
             filtroEspecial === 'conFacturaRecibida' ? 'Filtrando: Con factura recibida' :
             filtroEspecial === 'conFacturaEmitida' ? 'Filtrando: Con factura emitida' :
             filtroEspecial === 'sinProveedor' ? 'Filtrando: Sin proveedor (gastos)' :
             'Filtrando: Sin documento (reclamar)'}
            <button onClick={() => { setFiltroEspecial(''); setFiltroConciliado('false'); }} className="ml-1 hover:opacity-70">
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>

      {/* Tabla de movimientos */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Banco</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Concepto</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Importe</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tercero</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Categoria</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo Doc</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              ) : movimientos.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No hay movimientos</td></tr>
              ) : (
                movimientos.map(mov => (
                  <>
                    <tr
                      key={mov.id}
                      className={`hover:bg-blue-50/30 cursor-pointer transition-colors ${selectedMov === mov.id ? 'bg-blue-50' : ''} ${mov.pendienteFactura ? 'bg-amber-50/50' : ''} ${mov.pagoACuentaVola ? 'bg-purple-50/50' : ''} ${mov.entregaACuentaEmpleadoId ? 'bg-teal-50/50' : ''}`}
                      onClick={() => fetchSugerencias(mov.id)}
                    >
                      <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatFecha(mov.fechaOperacion)}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{mov.cuenta?.banco}</span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-900 max-w-md truncate" title={mov.concepto}>
                        {mov.concepto}
                        {mov.factura && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded">
                            {mov.factura.proveedor} - {mov.factura.numFactura}
                          </span>
                        )}
                        {mov.facturaEmitida && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
                            {mov.facturaEmitida.cliente} - {mov.facturaEmitida.numFactura}
                          </span>
                        )}
                        {mov.entregaACuentaEmpleado && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded">
                            Entrega: {mov.entregaACuentaEmpleado.nombreCompleto}
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-sm font-medium text-right whitespace-nowrap ${mov.importe >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatEUR(mov.importe)}
                      </td>
                      <td className="px-4 py-2.5">
                        {mov.entidadFiscal ? (
                          <div className="flex items-center gap-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              mov.entidadFiscal.tipo === 'PROVEEDOR' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                              mov.entidadFiscal.tipo === 'CLIENTE' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                              mov.entidadFiscal.tipo === 'PERSONAL' ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                              'bg-red-50 text-red-700 border border-red-200'
                            }`} title={`${mov.entidadFiscal.nifCif || ''} · ${mov.entidadFiscal.cuentaContableA3 || ''}`}>
                              {mov.entidadFiscal.razonSocial}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); desvincularTercero(mov.id); }}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                              title="Quitar tercero"
                            >
                              <XMarkIcon className="h-3 w-3" />
                            </button>
                          </div>
                        ) : mov.entregaACuentaEmpleado ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-teal-50 text-teal-700 border border-teal-200">
                            {mov.entregaACuentaEmpleado.nombreCompleto}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${mov.categoria ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                          {mov.categoria || 'Sin categoria'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {mov.importe < 0 && (
                          <div className="flex items-center justify-center gap-1">
                            {!mov.tipoDocumento ? (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); marcarTipoDocumento(mov.id, 'factura'); }}
                                  className="text-[10px] px-1.5 py-0.5 border border-blue-200 text-blue-600 rounded hover:bg-blue-50"
                                  title="Es una factura"
                                >
                                  Factura
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); marcarTipoDocumento(mov.id, 'ticket'); }}
                                  className="text-[10px] px-1.5 py-0.5 border border-gray-200 text-gray-500 rounded hover:bg-gray-50"
                                  title="Es un ticket (sin IVA deducible)"
                                >
                                  Ticket
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); marcarTipoDocumento(mov.id, 'justificante'); }}
                                  className="text-[10px] px-1.5 py-0.5 border border-blue-200 text-blue-500 rounded hover:bg-blue-50"
                                  title="Justificante bancario (sin factura)"
                                >
                                  Just.
                                </button>
                              </>
                            ) : mov.tipoDocumento === 'factura' ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleDocumentoRecibido(mov.id, !mov.documentoRecibido); }}
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    mov.documentoRecibido
                                      ? 'bg-green-100 text-green-700 border border-green-200'
                                      : 'bg-red-100 text-red-700 border border-red-200'
                                  }`}
                                  title={mov.documentoRecibido ? 'Documento recibido (clic para quitar)' : 'Sin documento (clic para marcar como recibido)'}
                                >
                                  {mov.documentoRecibido ? 'Factura' : 'Sin doc'}
                                </button>
                              </div>
                            ) : mov.tipoDocumento === 'justificante' ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); quitarTipoDocumento(mov.id); }}
                                className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded font-medium hover:bg-blue-100 cursor-pointer"
                                title="Clic para quitar tipo de documento"
                              >Justificante</button>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); quitarTipoDocumento(mov.id); }}
                                className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded hover:bg-gray-200 cursor-pointer"
                                title="Clic para quitar tipo de documento"
                              >Ticket</button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {mov.conciliado && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Conciliado</span>
                          )}
                          {!mov.conciliado && mov.tipoDocumento === 'factura' && !mov.factura && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">Fact. pendiente</span>
                          )}
                          {mov.pendienteFactura && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">Reclamar</span>
                          )}
                          {mov.pagoACuentaVola && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">Vola</span>
                          )}
                          {mov.entregaACuentaEmpleadoId && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded-full font-medium">Entrega</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {mov.conciliado ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); desconciliar(mov.id); }}
                              className="flex items-center gap-1 px-2 py-1 text-xs text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded border border-amber-200"
                              title="Deshacer conciliacion"
                            >
                              <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                              Deshacer
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); fetchSugerencias(mov.id); }}
                                className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded border border-blue-200"
                                title="Buscar facturas candidatas para vincular"
                              >
                                <LinkIcon className="h-3.5 w-3.5" />
                                Vincular
                              </button>
                              {mov.pendienteFactura ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); quitarPendienteFactura(mov.id); }}
                                  className="flex items-center gap-1 px-2 py-1 text-xs text-amber-600 hover:bg-amber-50 rounded border border-amber-200"
                                  title="Quitar marca de reclamar"
                                >
                                  <XMarkIcon className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); marcarNoAplica(mov.id, mov.categoria || 'Otros Gastos'); }}
                                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-green-700 hover:bg-green-50 rounded border border-gray-200"
                                  title="Marcar como conciliado sin factura asociada"
                                >
                                  <CheckCircleIcon className="h-3.5 w-3.5" />
                                  OK
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {renderPanelSugerencias(mov.id)}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginacion */}
        {total > 30 && (
          <div className="border-t px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">Pagina {page} · {total} movimientos</p>
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
