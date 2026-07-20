'use client';
import { useState, useEffect, useRef } from 'react';
import { ArrowPathIcon, CheckCircleIcon, XMarkIcon, LinkIcon, BanknotesIcon, DocumentTextIcon, ArrowUturnLeftIcon, MagnifyingGlassIcon, ExclamationTriangleIcon, UserIcon, CalendarDaysIcon, ChevronDownIcon, EyeIcon, PlayCircleIcon } from '@heroicons/react/24/outline';

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
  nominaId: string | null;
  nomina: { id: string; mes: number; anio: number; netoPercibir: number; empleado: { nombreCompleto: string }; movimientos: { id: string; importe: number }[] } | null;
  tercero: string | null;
  traspasoRelacionadoId: string | null;
  traspasoRelacionado: { id: string; fechaOperacion: string; importe: number; concepto: string; cuenta: { banco: string; alias: string } } | null;
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
  archivoUrl?: string;
  archivoOneDrive?: string;
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
  pendienteFacturaImporte: number;
  sinDocumentoCount: number;
  sinDocumentoImporte: number;
  facturasPendientesValidar: { count: number; base: number; iva: number; total: number };
  pagosVolaCount: number;
  pagosVolaImporte: number;
  entregasACuentaCount: number;
  entregasACuentaImporte: number;
  facturasRecibidasSinConciliar: number;
  nominasTotal: number;
  nominasConciliadas: number;
  nominasPendientes: number;
  nominasImporte: number;
  traspasosTotal: number;
  traspasosConContrapartida: number;
  traspasosPendientes: number;
  traspasosImporte: number;
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
  const [filtroEspecial, setFiltroEspecial] = useState<'' | 'pendienteFactura' | 'pdteRecibir' | 'pendientesValidar' | 'pagoVola' | 'sinDocumento' | 'entregaACuenta' | 'conProveedor' | 'conFacturaRecibida' | 'conFacturaEmitida' | 'sinProveedor' | 'traspasoPendiente'>('');
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
  // Ordenación por columnas
  const [sortBy, setSortBy] = useState<'fechaOperacion' | 'importe' | 'tercero' | 'categoria' | 'concepto' | 'banco'>('fechaOperacion');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Buscador de movimientos
  const [buscarMovimiento, setBuscarMovimiento] = useState('');
  // Filtro por tipo de documento
  const [filtroDocumento, setFiltroDocumento] = useState<'' | 'factura' | 'ticket' | 'justificante' | 'traspaso' | 'nomina' | 'sinTipoDoc' | 'facturaPendiente'>('');
  // Modal de vincular nómina
  const [showNominaModal, setShowNominaModal] = useState<string | null>(null); // movimientoId
  const [nominasList, setNominasList] = useState<any[]>([]);
  const [loadingNominas, setLoadingNominas] = useState(false);
  // Modal de vincular con empleado (sin necesidad de entidadFiscal)
  const [showEmpleadoNominaModal, setShowEmpleadoNominaModal] = useState<string | null>(null); // movimientoId
  const [empleadoNominaList, setEmpleadoNominaList] = useState<any[]>([]);
  const [empleadoNominaSeleccionado, setEmpleadoNominaSeleccionado] = useState<any | null>(null);
  const [loadingEmpleadoNomina, setLoadingEmpleadoNomina] = useState(false);
  const [buscarEmpleadoNomina, setBuscarEmpleadoNomina] = useState('');
  // Modal de movimientos similares
  const [showDetalleVinculacion, setShowDetalleVinculacion] = useState<Movimiento | null>(null);

  const [showSimilaresModal, setShowSimilaresModal] = useState(false);
  const [showVideoTutorial, setShowVideoTutorial] = useState(false);
  const [similaresList, setSimilaresList] = useState<any[]>([]);
  const [similaresSeleccionados, setSimilaresSeleccionados] = useState<Set<string>>(new Set());
  const [similaresMovId, setSimilaresMovId] = useState<string | null>(null);
  const [similaresPatron, setSimilaresPatron] = useState('');
  const [similaresModoFactura, setSimilaresModoFactura] = useState(false);

  // Filtro de período
  const [filtroFecha, setFiltroFecha] = useState<'todos' | 'mes' | 'trimestre' | 'anio' | 'personalizado'>('todos');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [mesSeleccionado, setMesSeleccionado] = useState('');
  const [trimestreSeleccionado, setTrimestreSeleccionado] = useState('');
  const [anioSeleccionado, setAnioSeleccionado] = useState('2026');
  const [showFechaDropdown, setShowFechaDropdown] = useState(false);
  const fechaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCuentas();
    fetchEstado();
  }, []);

  useEffect(() => {
    fetchMovimientos();
  }, [page, filtroTipo, filtroBanco, filtroConciliado, filtroEspecial, filtroDocumento, fechaDesde, fechaHasta, sortBy, sortDir]);

  // Cerrar dropdown de fecha al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (fechaRef.current && !fechaRef.current.contains(e.target as Node)) {
        setShowFechaDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    if (filtroEspecial === 'pdteRecibir') params.set('pdteRecibir', 'true');
    if (filtroEspecial === 'pagoVola') params.set('pagoACuentaVola', 'true');
    if (filtroEspecial === 'sinDocumento') params.set('sinDocumento', 'true');
    if (filtroEspecial === 'entregaACuenta') params.set('entregaACuenta', 'true');
    if (filtroEspecial === 'conProveedor') params.set('conProveedor', 'true');
    if (filtroEspecial === 'conFacturaRecibida') params.set('conFacturaRecibida', 'true');
    if (filtroEspecial === 'conFacturaEmitida') params.set('conFacturaEmitida', 'true');
    if (filtroEspecial === 'sinProveedor') params.set('sinProveedor', 'true');
    if (filtroEspecial === 'traspasoPendiente') params.set('traspasoPendiente', 'true');
    if (filtroEspecial === 'pendientesValidar') params.set('pendientesValidar', 'true');
    if (buscarMovimiento.trim()) params.set('buscar', buscarMovimiento.trim());
    if (fechaDesde) params.set('desde', fechaDesde);
    if (fechaHasta) params.set('hasta', fechaHasta);
    if (filtroDocumento === 'sinTipoDoc') {
      params.set('tipoDocumento', 'null');
    } else if (filtroDocumento === 'facturaPendiente') {
      params.set('tipoDocumento', 'factura');
      params.set('conciliado', 'false');
    } else if (filtroDocumento) {
      params.set('tipoDocumento', filtroDocumento);
    }
    if (sortBy !== 'fechaOperacion' || sortDir !== 'desc') {
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
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

  async function marcarTipoDocumento(movimientoId: string, tipo: 'factura' | 'ticket' | 'justificante' | 'traspaso' | 'nomina') {
    const docRecibido = tipo === 'ticket' || tipo === 'justificante' || tipo === 'traspaso' ? true : false;
    // Actualización optimista
    setMovimientos(prev => prev.map(m => m.id === movimientoId ? { ...m, tipoDocumento: tipo, documentoRecibido: docRecibido } : m));
    const res = await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipoDocumento: tipo, documentoRecibido: docRecibido }),
    });
    // Si es factura y hay otros movimientos del mismo tercero sin tipo doc, ofrecer marcar en bloque
    if (tipo === 'factura') {
      const result = await res.json();
      if (result.similaresTercero && result.similaresTercero.length > 0) {
        setSimilaresList(result.similaresTercero);
        setSimilaresSeleccionados(new Set(result.similaresTercero.map((m: any) => m.id)));
        setSimilaresMovId(movimientoId);
        setSimilaresPatron(result.terceroUsado || 'mismo tercero');
        setSimilaresModoFactura(true);
        setShowSimilaresModal(true);
      }
    }
  }

  async function toggleDocumentoRecibido(movimientoId: string, recibido: boolean) {
    // Actualización optimista
    setMovimientos(prev => prev.map(m => m.id === movimientoId ? { ...m, documentoRecibido: recibido } : m));
    fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentoRecibido: recibido }),
    });
  }

  async function quitarTipoDocumento(movimientoId: string) {
    // Actualización optimista
    setMovimientos(prev => prev.map(m => m.id === movimientoId ? { ...m, tipoDocumento: null, documentoRecibido: null } : m));
    fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipoDocumento: null, documentoRecibido: null }),
    });
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
    // Sugerir asignar a similares - abrir modal con lista
    if (result.similares && result.similares > 0 && result.movimientosSimilares) {
      setSimilaresList(result.movimientosSimilares);
      setSimilaresSeleccionados(new Set(result.movimientosSimilares.map((m: any) => m.id)));
      setSimilaresMovId(movimientoId);
      setSimilaresPatron(result.patronUsado || '');
      setShowSimilaresModal(true);
    }
    setShowTerceroSelector(null);
    setBuscarTercero('');
    setTerceros([]);
    setSelectedMov(null);
    fetchMovimientos();
    fetchEstado();
  }

  async function aplicarSimilaresSeleccionados() {
    if (!similaresMovId || similaresSeleccionados.size === 0) return;
    if (similaresModoFactura) {
      // Marcar como factura en bloque
      await fetch(`/api/admin/finanzas/movimientos/${similaresMovId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marcarFacturaASimilares: true, idsSeleccionados: Array.from(similaresSeleccionados) }),
      });
      // Actualización optimista de la lista local
      setMovimientos(prev => prev.map(m => similaresSeleccionados.has(m.id) ? { ...m, tipoDocumento: 'factura', documentoRecibido: false } : m));
    } else {
      await fetch(`/api/admin/finanzas/movimientos/${similaresMovId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asignarProveedorASimilares: true, idsSeleccionados: Array.from(similaresSeleccionados) }),
      });
    }
    setShowSimilaresModal(false);
    setSimilaresList([]);
    setSimilaresSeleccionados(new Set());
    setSimilaresMovId(null);
    setSimilaresModoFactura(false);
    fetchMovimientos();
    fetchEstado();
  }

  function toggleSimilarSeleccion(id: string) {
    setSimilaresSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function fetchNominas(movimientoId: string, entidadFiscalId: string) {
    setShowNominaModal(movimientoId);
    setLoadingNominas(true);
    try {
      const res = await fetch(`/api/admin/finanzas/nominas?entidadFiscalId=${entidadFiscalId}`);
      const data = await res.json();
      setNominasList(data.nominas || []);
    } catch (e) {
      setNominasList([]);
    }
    setLoadingNominas(false);
  }

  async function vincularNomina(movimientoId: string, nominaId: string) {
    await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nominaId }),
    });
    setShowNominaModal(null);
    setNominasList([]);
    setShowEmpleadoNominaModal(null);
    setEmpleadoNominaList([]);
    setEmpleadoNominaSeleccionado(null);
    fetchMovimientos();
    fetchEstado();
  }

  async function fetchEmpleadosNomina(movimientoId: string) {
    setShowEmpleadoNominaModal(movimientoId);
    setEmpleadoNominaSeleccionado(null);
    setBuscarEmpleadoNomina('');
    setLoadingEmpleadoNomina(true);
    try {
      const res = await fetch(`/api/admin/finanzas/nominas/empleados?movimientoId=${movimientoId}`);
      const data = await res.json();
      setEmpleadoNominaList(data.empleados || []);
    } catch (e) {
      setEmpleadoNominaList([]);
    }
    setLoadingEmpleadoNomina(false);
  }

  async function seleccionarEmpleadoNomina(empleado: any) {
    setEmpleadoNominaSeleccionado(empleado);
    // Cargar nóminas de este empleado
    setLoadingNominas(true);
    try {
      const res = await fetch(`/api/admin/finanzas/nominas?empleadoId=${empleado.id}`);
      const data = await res.json();
      setNominasList(data.nominas || []);
    } catch (e) {
      setNominasList([]);
    }
    setLoadingNominas(false);
  }

  const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

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
              <button
                onClick={() => fetchEmpleadosNomina(movId)}
                className="px-2 py-1 bg-purple-50 border border-purple-300 rounded hover:bg-purple-100 text-purple-700 font-medium flex items-center gap-1"
              >
                <UserIcon className="h-3.5 w-3.5" />
                Personal / Nómina
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
                      {(sug.archivoUrl || sug.archivoOneDrive) && (
                        <a
                          href={`/api/admin/finanzas/facturas/${sug.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                          title="Ver PDF de la factura"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </a>
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
    if (filtroFecha === 'personalizado') return `${fechaDesde} \u2192 ${fechaHasta}`;
    return 'Periodo';
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowVideoTutorial(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 font-medium text-sm border border-indigo-200 transition-colors"
            title="Ver videotutorial"
          >
            <PlayCircleIcon className="h-5 w-5" />
            Tutorial
          </button>
          <button
            onClick={ejecutarConciliacion}
            disabled={conciliando}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-sm"
          >
            <ArrowPathIcon className={`h-4 w-4 ${conciliando ? 'animate-spin' : ''}`} />
            {conciliando ? 'Conciliando...' : 'Conciliar Automaticamente'}
          </button>
        </div>
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
            onClick={() => { setFiltroConciliado(''); setFiltroEspecial('pdteRecibir'); setPage(1); }}
            className={`bg-white border rounded-lg p-4 text-left transition-all hover:shadow-md relative group ${
              filtroEspecial === 'pdteRecibir' ? 'ring-2 ring-orange-400 shadow-md' : ''
            }`}
            title="Movimientos marcados como pendientes de recibir factura del proveedor"
          >
            <div className="absolute top-2 right-2 text-gray-300 group-hover:text-gray-500">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 16v-4m0-4h.01" /></svg>
            </div>
            <p className="text-xs text-orange-600 uppercase font-medium">Pdte. Recibir</p>
            <p className="text-2xl font-bold text-orange-700">{(estado.pendienteFacturaCount || 0) + (estado.sinDocumentoCount || 0)}</p>
            <p className="text-[10px] text-gray-400">{((estado.pendienteFacturaImporte || 0) + (estado.sinDocumentoImporte || 0)).toLocaleString('es-ES', {style:'currency',currency:'EUR'})}</p>
            <p className="text-[9px] text-gray-300">Facturas no recibidas del proveedor</p>
          </button>
          <button
            onClick={() => { setFiltroConciliado(''); setFiltroEspecial('pendientesValidar'); setPage(1); }}
            className={`bg-white border rounded-lg p-4 text-left transition-all hover:shadow-md relative group ${
              filtroEspecial === 'pendientesValidar' ? 'ring-2 ring-yellow-400 shadow-md' : ''
            }`}
            title="Facturas recibidas pendientes de revisar/validar (estado PENDIENTE_REVISION)"
          >
            <div className="absolute top-2 right-2 text-gray-300 group-hover:text-gray-500">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 16v-4m0-4h.01" /></svg>
            </div>
            <p className="text-xs text-yellow-600 uppercase font-medium">Pdte. Validar</p>
            <p className="text-2xl font-bold text-yellow-700">{estado.facturasPendientesValidar?.count || 0}</p>
            <div className="text-[10px] text-gray-400 space-y-0">
              <p>Base: {(estado.facturasPendientesValidar?.base || 0).toLocaleString('es-ES', {style:'currency',currency:'EUR'})}</p>
              <p>IVA: {(estado.facturasPendientesValidar?.iva || 0).toLocaleString('es-ES', {style:'currency',currency:'EUR'})}</p>
            </div>
            <p className="text-[9px] text-gray-300">Facturas recibidas sin validar</p>
          </button>
          <button
            onClick={() => { setFiltroConciliado(''); setFiltroEspecial('pagoVola'); setPage(1); }}
            className={`bg-white border rounded-lg p-4 text-left transition-all hover:shadow-md relative group ${
              filtroEspecial === 'pagoVola' ? 'ring-2 ring-purple-400 shadow-md' : ''
            }`}
            title="Movimientos marcados como pagos a cuenta de Vola (anticipos)"
          >
            <div className="absolute top-2 right-2 text-gray-300 group-hover:text-gray-500">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 16v-4m0-4h.01" /></svg>
            </div>
            <p className="text-xs text-purple-600 uppercase font-medium">Pagos Vola</p>
            <p className="text-2xl font-bold text-purple-700">{estado.pagosVolaCount || 0}</p>
            <p className="text-[10px] text-gray-400">{estado.pagosVolaImporte ? `${estado.pagosVolaImporte.toLocaleString('es-ES', {style:'currency',currency:'EUR'})}` : 'A cuenta'}</p>
            <p className="text-[9px] text-gray-300">Anticipos a Vola pendientes de factura</p>
          </button>
          <button
            onClick={() => { setFiltroConciliado(''); setFiltroEspecial('entregaACuenta'); setPage(1); }}
            className={`bg-white border rounded-lg p-4 text-left transition-all hover:shadow-md relative group ${
              filtroEspecial === 'entregaACuenta' ? 'ring-2 ring-teal-400 shadow-md' : ''
            }`}
            title="Entregas a cuenta de empleados (anticipos de gastos)"
          >
            <div className="absolute top-2 right-2 text-gray-300 group-hover:text-gray-500">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 16v-4m0-4h.01" /></svg>
            </div>
            <p className="text-xs text-teal-600 uppercase font-medium">Entregas a cuenta</p>
            <p className="text-2xl font-bold text-teal-700">{estado.entregasACuentaCount || 0}</p>
            <p className="text-[10px] text-gray-400">{estado.entregasACuentaImporte ? `${estado.entregasACuentaImporte.toLocaleString('es-ES', {style:'currency',currency:'EUR'})}` : 'Empleados'}</p>
            <p className="text-[9px] text-gray-300">Anticipos entregados a empleados</p>
          </button>
        </div>
      )}

      {/* KPIs Niveles de Conciliación */}
      {estado && (
        <div className="grid grid-cols-4 gap-3">
          <div onClick={() => { setFiltroEspecial(filtroEspecial === 'conProveedor' ? '' : 'conProveedor'); setFiltroConciliado(''); setPage(1); }} className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md relative group ${filtroEspecial === 'conProveedor' ? 'border-blue-500 ring-2 ring-blue-200' : 'border-blue-200'}`} title="Movimientos con entidad fiscal (proveedor/cliente) identificada y vinculada">
            <div className="absolute top-2 right-2 text-gray-300 group-hover:text-gray-500"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 16v-4m0-4h.01" /></svg></div>
            <p className="text-xs text-blue-600 uppercase font-medium">Proveedor Identificado</p>
            <p className="text-2xl font-bold text-blue-700">{estado.conProveedorIdentificado || 0}</p>
            <p className="text-[10px] text-gray-400">Nivel 1 — Tercero vinculado</p>
          </div>
          <div onClick={() => { setFiltroEspecial(filtroEspecial === 'conFacturaRecibida' ? '' : 'conFacturaRecibida'); setFiltroConciliado(''); setPage(1); }} className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md relative group ${filtroEspecial === 'conFacturaRecibida' ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-indigo-200'}`} title="Movimientos con factura recibida vinculada (gasto documentado)">
            <div className="absolute top-2 right-2 text-gray-300 group-hover:text-gray-500"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 16v-4m0-4h.01" /></svg></div>
            <p className="text-xs text-indigo-600 uppercase font-medium">Con Factura Recibida</p>
            <p className="text-2xl font-bold text-indigo-700">{estado.conFacturaVinculada || 0}</p>
            <p className="text-[10px] text-gray-400">Nivel 2 — Documento vinculado</p>
          </div>
          <div onClick={() => { setFiltroEspecial(filtroEspecial === 'conFacturaEmitida' ? '' : 'conFacturaEmitida'); setFiltroConciliado(''); setPage(1); }} className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md relative group ${filtroEspecial === 'conFacturaEmitida' ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-emerald-200'}`} title="Cobros vinculados a facturas emitidas a clientes">
            <div className="absolute top-2 right-2 text-gray-300 group-hover:text-gray-500"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 16v-4m0-4h.01" /></svg></div>
            <p className="text-xs text-emerald-600 uppercase font-medium">Con Factura Emitida</p>
            <p className="text-2xl font-bold text-emerald-700">{estado.conFacturaEmitidaVinculada || 0}</p>
            <p className="text-[10px] text-gray-400">Cobros vinculados</p>
          </div>
          <div onClick={() => { setFiltroEspecial(filtroEspecial === 'sinProveedor' ? '' : 'sinProveedor'); setFiltroConciliado(''); setPage(1); }} className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md relative group ${filtroEspecial === 'sinProveedor' ? 'border-rose-500 ring-2 ring-rose-200' : 'border-rose-200'}`} title="Gastos sin proveedor identificado (excluye traspasos, nóminas e impuestos)">
            <div className="absolute top-2 right-2 text-gray-300 group-hover:text-gray-500"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 16v-4m0-4h.01" /></svg></div>
            <p className="text-xs text-rose-600 uppercase font-medium">Sin Proveedor (Gastos)</p>
            <p className="text-2xl font-bold text-rose-700">{estado.sinProveedorGastos || 0}</p>
            <p className="text-[10px] text-gray-400">Pendientes de identificar</p>
          </div>
        </div>
      )}

      {/* KPI Traspasos */}
      {estado && (estado.traspasosTotal > 0) && (
        <div className="grid grid-cols-4 gap-3">
          <div onClick={() => { setFiltroDocumento('traspaso'); setFiltroEspecial(''); setFiltroConciliado(''); setPage(1); }} className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md relative group ${filtroDocumento === 'traspaso' ? 'border-cyan-500 ring-2 ring-cyan-200' : 'border-cyan-200'}`} title="Todos los movimientos clasificados como traspaso entre cuentas propias">
            <div className="absolute top-2 right-2 text-gray-300 group-hover:text-gray-500"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 16v-4m0-4h.01" /></svg></div>
            <p className="text-xs text-cyan-600 uppercase font-medium">Total Traspasos</p>
            <p className="text-2xl font-bold text-cyan-700">{estado.traspasosTotal}</p>
            <p className="text-[10px] text-gray-400">{estado.traspasosImporte ? estado.traspasosImporte.toLocaleString('es-ES', {style:'currency',currency:'EUR'}) : ''}</p>
          </div>
          <div className="bg-white border border-cyan-200 rounded-lg p-4 relative group" title="Traspasos con el movimiento del otro banco identificado y vinculado">
            <div className="absolute top-2 right-2 text-gray-300 group-hover:text-gray-500"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 16v-4m0-4h.01" /></svg></div>
            <p className="text-xs text-cyan-600 uppercase font-medium">Con Contrapartida</p>
            <p className="text-2xl font-bold text-green-700">{estado.traspasosConContrapartida}</p>
            <p className="text-[10px] text-gray-400">Par vinculado entre cuentas</p>
          </div>
          <div onClick={() => { setFiltroEspecial(filtroEspecial === 'traspasoPendiente' ? '' : 'traspasoPendiente'); setFiltroConciliado(''); setFiltroDocumento(''); setPage(1); }} className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md relative group ${filtroEspecial === 'traspasoPendiente' ? 'border-amber-500 ring-2 ring-amber-200' : 'border-amber-200'}`} title="Traspasos sin contrapartida: falta importar el extracto del banco destino">
            <div className="absolute top-2 right-2 text-gray-300 group-hover:text-gray-500"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 16v-4m0-4h.01" /></svg></div>
            <p className="text-xs text-amber-600 uppercase font-medium">Pdte. Contrapartida</p>
            <p className="text-2xl font-bold text-amber-700">{estado.traspasosPendientes}</p>
            <p className="text-[10px] text-gray-400">Extracto no importado</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 relative group" title="Porcentaje de traspasos que tienen su par vinculado en el otro banco">
            <div className="absolute top-2 right-2 text-gray-300 group-hover:text-gray-500"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 16v-4m0-4h.01" /></svg></div>
            <p className="text-xs text-gray-500 uppercase font-medium">% Vinculados</p>
            <p className="text-2xl font-bold text-gray-700">{estado.traspasosTotal > 0 ? Math.round((estado.traspasosConContrapartida / estado.traspasosTotal) * 100) : 0}%</p>
            <p className="text-[10px] text-gray-400">Traspasos con par</p>
          </div>
        </div>
      )}

      {/* KPI Nóminas / Personal */}
      {estado && (
        <div className="grid grid-cols-4 gap-3">
          <div onClick={() => { setFiltroDocumento('nomina'); setFiltroEspecial(''); setFiltroConciliado(''); setPage(1); }} className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md relative group ${filtroDocumento === 'nomina' ? 'border-purple-500 ring-2 ring-purple-200' : 'border-purple-200'}`} title="Todos los movimientos clasificados como nómina">
            <p className="text-xs text-purple-600 uppercase font-medium">Total Nóminas</p>
            <p className="text-2xl font-bold text-purple-700">{estado.nominasTotal}</p>
            <p className="text-[10px] text-gray-400">{estado.nominasImporte ? estado.nominasImporte.toLocaleString('es-ES', {style:'currency',currency:'EUR'}) : ''}</p>
          </div>
          <div className="bg-white border border-purple-200 rounded-lg p-4" title="Nóminas conciliadas con documento de nómina del empleado">
            <p className="text-xs text-purple-600 uppercase font-medium">Conciliadas</p>
            <p className="text-2xl font-bold text-green-700">{estado.nominasConciliadas}</p>
            <p className="text-[10px] text-gray-400">Con nómina vinculada</p>
          </div>
          <div onClick={() => { setFiltroDocumento('nomina'); setFiltroEspecial(''); setFiltroConciliado('false'); setPage(1); }} className="bg-white border border-purple-200 rounded-lg p-4 cursor-pointer hover:shadow-md" title="Nóminas pendientes de vincular con documento">
            <p className="text-xs text-orange-600 uppercase font-medium">Pdte. Vincular</p>
            <p className="text-2xl font-bold text-orange-700">{estado.nominasPendientes}</p>
            <p className="text-[10px] text-gray-400">Sin nómina vinculada</p>
          </div>
          <div className="bg-white border border-purple-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase font-medium">% Conciliadas</p>
            <p className="text-2xl font-bold text-gray-700">{estado.nominasTotal > 0 ? Math.round((estado.nominasConciliadas / estado.nominasTotal) * 100) : 0}%</p>
            <p className="text-[10px] text-gray-400">Nóminas con documento</p>
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
        {/* Selector de período */}
        <div className="relative" ref={fechaRef}>
          <button
            onClick={() => setShowFechaDropdown(!showFechaDropdown)}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg ${
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
                {['2024', '2025', '2026'].map(a => (
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
            </div>
          )}
        </div>
        <select
          value={filtroDocumento}
          onChange={(e) => { setFiltroDocumento(e.target.value as any); setPage(1); }}
          className="border rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">Todos los docs</option>
          <option value="factura">Con Factura</option>
          <option value="facturaPendiente">Factura pendiente</option>
          <option value="nomina">Nómina</option>
          <option value="traspaso">Traspaso</option>
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
            filtroEspecial === 'pendienteFactura' ? 'bg-orange-50 border border-orange-200 text-orange-700' :
            filtroEspecial === 'pdteRecibir' ? 'bg-orange-50 border border-orange-200 text-orange-700' :
            filtroEspecial === 'pendientesValidar' ? 'bg-yellow-50 border border-yellow-200 text-yellow-700' :
            filtroEspecial === 'sinDocumento' ? 'bg-red-50 border border-red-200 text-red-700' :
            filtroEspecial === 'pagoVola' ? 'bg-purple-50 border border-purple-200 text-purple-700' :
            filtroEspecial === 'entregaACuenta' ? 'bg-teal-50 border border-teal-200 text-teal-700' :
            filtroEspecial === 'conProveedor' ? 'bg-blue-50 border border-blue-200 text-blue-700' :
            filtroEspecial === 'conFacturaRecibida' ? 'bg-indigo-50 border border-indigo-200 text-indigo-700' :
            filtroEspecial === 'conFacturaEmitida' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' :
            filtroEspecial === 'sinProveedor' ? 'bg-rose-50 border border-rose-200 text-rose-700' :
            filtroEspecial === 'traspasoPendiente' ? 'bg-cyan-50 border border-cyan-200 text-cyan-700' :
            'bg-amber-50 border border-amber-200 text-amber-700'
          }`}>
            {filtroEspecial === 'pendienteFactura' ? 'Filtrando: Pdte. recibir factura' :
             filtroEspecial === 'pdteRecibir' ? 'Filtrando: Pdte. recibir (factura + sin documento)' :
             filtroEspecial === 'pendientesValidar' ? 'Filtrando: Pdte. validar factura' :
             filtroEspecial === 'pagoVola' ? 'Filtrando: Pagos Vola' :
             filtroEspecial === 'entregaACuenta' ? 'Filtrando: Entregas a cuenta' :
             filtroEspecial === 'conProveedor' ? 'Filtrando: Con proveedor identificado' :
             filtroEspecial === 'conFacturaRecibida' ? 'Filtrando: Con factura recibida' :
             filtroEspecial === 'conFacturaEmitida' ? 'Filtrando: Con factura emitida' :
             filtroEspecial === 'sinProveedor' ? 'Filtrando: Sin proveedor (gastos)' :
             filtroEspecial === 'traspasoPendiente' ? 'Filtrando: Traspasos pdte. contrapartida' :
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
                {[
                  { key: 'fechaOperacion', label: 'Fecha', align: 'left' },
                  { key: 'banco', label: 'Banco', align: 'left' },
                  { key: 'concepto', label: 'Concepto', align: 'left' },
                  { key: 'importe', label: 'Importe', align: 'right' },
                  { key: 'tercero', label: 'Tercero', align: 'left' },
                  { key: 'categoria', label: 'Categoría', align: 'left' },
                ].map(col => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-xs font-medium uppercase cursor-pointer select-none hover:bg-gray-100 transition-colors ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    } ${
                      sortBy === col.key ? 'text-blue-700 bg-blue-50/50' : 'text-gray-500'
                    }`}
                    onClick={() => {
                      if (sortBy === col.key) {
                        setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortBy(col.key as any);
                        setSortDir(col.key === 'fechaOperacion' ? 'desc' : 'asc');
                      }
                      setPage(1);
                    }}
                  >
                    <span className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                      {col.label}
                      {sortBy === col.key && (
                        <span className="text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </span>
                  </th>
                ))}
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
                        ) : mov.tercero ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-600 border border-gray-200" title="Tercero extraído del extracto (sin vincular)">
                            {mov.tercero}
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
                                <button
                                  onClick={(e) => { e.stopPropagation(); marcarTipoDocumento(mov.id, 'traspaso'); }}
                                  className="text-[10px] px-1.5 py-0.5 border border-cyan-200 text-cyan-600 rounded hover:bg-cyan-50"
                                  title="Traspaso entre cuentas propias"
                                >
                                  Trasp.
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); marcarTipoDocumento(mov.id, 'nomina'); }}
                                  className="text-[10px] px-1.5 py-0.5 border border-purple-200 text-purple-600 rounded hover:bg-purple-50"
                                  title="Nómina de empleado"
                                >
                                  Nóm.
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
                            ) : mov.tipoDocumento === 'traspaso' ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); quitarTipoDocumento(mov.id); }}
                                className="text-[10px] px-1.5 py-0.5 bg-cyan-100 text-cyan-700 border border-cyan-200 rounded font-medium hover:bg-cyan-200 cursor-pointer"
                                title="Clic para quitar tipo de documento"
                              >Traspaso</button>
                            ) : mov.tipoDocumento === 'nomina' ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); quitarTipoDocumento(mov.id); }}
                                className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 border border-purple-200 rounded font-medium hover:bg-purple-200 cursor-pointer"
                                title="Clic para quitar tipo de documento"
                              >Nómina</button>
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
                          {mov.conciliado && mov.tipoDocumento === 'traspaso' && mov.traspasoRelacionado ? (
                            <span onClick={(e) => { e.stopPropagation(); setShowDetalleVinculacion(mov); }} className="text-[10px] px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded-full font-medium cursor-pointer hover:bg-cyan-200" title={`Traspaso ${mov.importe < 0 ? 'a' : 'de'} ${mov.traspasoRelacionado.cuenta.banco}`}>
                              Traspaso {mov.importe < 0 ? '→' : '←'} {mov.traspasoRelacionado.cuenta.banco}
                            </span>
                          ) : mov.tipoDocumento === 'traspaso' && !mov.traspasoRelacionadoId ? (
                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium" title="Pendiente de importar extracto del otro banco">Pdte. contrapartida</span>
                          ) : mov.conciliado ? (
                            <span onClick={(e) => { e.stopPropagation(); if (mov.nomina || mov.factura || mov.facturaEmitida) setShowDetalleVinculacion(mov); }} className={`text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium ${(mov.nomina || mov.factura || mov.facturaEmitida) ? 'cursor-pointer hover:bg-green-200' : ''}`}>Conciliado</span>
                          ) : null}
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
                          {mov.nominaId && mov.nomina && (
                            <>
                              <span onClick={(e) => { e.stopPropagation(); setShowDetalleVinculacion(mov); }} className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium cursor-pointer hover:bg-indigo-200">Nómina {mov.nomina.mes}/{mov.nomina.anio}</span>
                              {mov.nomina.movimientos && mov.nomina.movimientos.length > 1 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium" title={`${mov.nomina.movimientos.length} pagos vinculados a esta nómina`}>
                                  {mov.nomina.movimientos.length} pagos
                                </span>
                              )}
                              {Math.abs(Math.abs(mov.importe) - mov.nomina.netoPercibir) > 0.05 && mov.nomina.movimientos && mov.nomina.movimientos.length === 1 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-medium" title={`Mov: ${Math.abs(mov.importe).toFixed(2)}€ vs Nómina: ${mov.nomina.netoPercibir.toFixed(2)}€`}>
                                  ⚠️ Importe
                                </span>
                              )}
                            </>
                          )}
                          {mov.factura && (
                            <>
                              {Math.abs(Math.abs(mov.importe) - mov.factura.total) > 0.05 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-medium" title={`Mov: ${Math.abs(mov.importe).toFixed(2)}€ vs Factura: ${mov.factura.total.toFixed(2)}€`}>
                                  ⚠️ Importe
                                </span>
                              )}
                            </>
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
        {total > 0 && (
          <div className="border-t px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Mostrando {(page - 1) * 30 + 1} - {Math.min(page * 30, total)} de {total} movimientos
              {total > 30 && (<span className="ml-2 text-gray-400">· Página {page} de {Math.ceil(total / 30)}</span>)}
            </p>
            {total > 30 && (
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-50">Anterior</button>
                <button onClick={() => setPage(p => p + 1)} disabled={page * 30 >= total} className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-50">Siguiente</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de movimientos similares */}
      {showSimilaresModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{similaresModoFactura ? 'Marcar como Factura en bloque' : 'Movimientos similares encontrados'}</h3>
                <p className="text-sm text-gray-500">{similaresModoFactura ? 'Tercero' : 'Patrón'}: <span className="font-mono bg-gray-100 px-1 rounded">{similaresPatron}</span> · {similaresList.length} movimientos sin tipo doc</p>
              </div>
              <button onClick={() => { setShowSimilaresModal(false); setSimilaresList([]); setSimilaresModoFactura(false); }} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="p-4 border-b flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSimilaresSeleccionados(new Set(similaresList.map(m => m.id)))}
                  className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >Seleccionar todos</button>
                <button
                  onClick={() => setSimilaresSeleccionados(new Set())}
                  className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                >Deseleccionar todos</button>
                <span className="text-sm text-gray-600">{similaresSeleccionados.size} de {similaresList.length} seleccionados</span>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b">
                    <th className="px-2 py-2 text-left w-8"></th>
                    <th className="px-2 py-2 text-left text-xs text-gray-500">Fecha</th>
                    <th className="px-2 py-2 text-left text-xs text-gray-500">Banco</th>
                    <th className="px-2 py-2 text-left text-xs text-gray-500">Concepto</th>
                    <th className="px-2 py-2 text-right text-xs text-gray-500">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {similaresList.map(m => (
                    <tr key={m.id} className={`hover:bg-blue-50/50 cursor-pointer ${similaresSeleccionados.has(m.id) ? 'bg-blue-50' : ''}`} onClick={() => toggleSimilarSeleccion(m.id)}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={similaresSeleccionados.has(m.id)} onChange={() => toggleSimilarSeleccion(m.id)} className="rounded" />
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-600 whitespace-nowrap">{formatFecha(m.fechaOperacion)}</td>
                      <td className="px-2 py-1.5"><span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">{m.cuenta?.banco}</span></td>
                      <td className="px-2 py-1.5 text-xs text-gray-900 max-w-sm truncate" title={m.concepto}>{m.concepto}</td>
                      <td className={`px-2 py-1.5 text-xs font-medium text-right ${m.importe >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatEUR(m.importe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t flex items-center justify-between">
              <button
                onClick={() => { setShowSimilaresModal(false); setSimilaresList([]); setSimilaresModoFactura(false); }}
                className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
              >{similaresModoFactura ? 'Cancelar' : 'Cancelar (no asignar)'}</button>
              <button
                onClick={aplicarSimilaresSeleccionados}
                disabled={similaresSeleccionados.size === 0}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >{similaresModoFactura ? `Marcar como Factura ${similaresSeleccionados.size} movimiento(s)` : `Asignar tercero a ${similaresSeleccionados.size} movimiento(s)`}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de vincular nómina */}
      {showNominaModal && (() => {
        const movActual = movimientos.find(m => m.id === showNominaModal);
        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Vincular con nómina</h3>
                  <p className="text-sm text-gray-500">Selecciona la nómina correspondiente a este movimiento</p>
                </div>
                <button onClick={() => { setShowNominaModal(null); setNominasList([]); }} className="text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              {movActual && (
                <div className="mt-2 px-3 py-2 bg-indigo-50 rounded-lg">
                  <p className="text-xs text-indigo-600">Movimiento: <span className="font-bold">{formatEUR(Math.abs(movActual.importe))}</span> — {movActual.concepto.substring(0, 60)}...</p>
                </div>
              )}
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {loadingNominas ? (
                <p className="text-sm text-gray-500">Cargando nóminas...</p>
              ) : nominasList.length === 0 ? (
                <p className="text-sm text-gray-500">No se encontraron nóminas para este empleado.</p>
              ) : (
                <div className="space-y-2">
                  {nominasList.map((n: any) => (
                    <button
                      key={n.id}
                      onClick={() => vincularNomina(showNominaModal, n.id)}
                      className="w-full text-left px-4 py-3 rounded-lg border transition-colors bg-white border-indigo-200 hover:bg-indigo-50 hover:border-indigo-400 cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-sm text-gray-900">{MESES[n.mes]} {n.anio}</span>
                          <span className="ml-2 text-xs text-gray-500">{n.empleadoNombre}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-sm text-indigo-700">{formatEUR(n.netoPercibir)}</span>
                        </div>
                      </div>
                      {n.numMovimientos > 0 && (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                            {n.numMovimientos} pago(s) vinculado(s): {formatEUR(n.importeVinculado)}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            n.cubierto >= 100 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {n.cubierto}% cubierto
                          </span>
                        </div>
                      )}
                      {n.costeTotalEmpresa && (
                        <p className="text-[11px] text-gray-400 mt-0.5">Coste empresa: {formatEUR(n.costeTotalEmpresa)}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t">
              <button
                onClick={() => { setShowNominaModal(null); setNominasList([]); }}
                className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
              >Cerrar</button>
            </div>
          </div>
        </div>
        );
      })()}
      {/* Modal de vincular con empleado/nómina */}
      {showEmpleadoNominaModal && (() => {
        const movActual = movimientos.find(m => m.id === showEmpleadoNominaModal);
        const empleadosFiltrados = buscarEmpleadoNomina
          ? empleadoNominaList.filter((e: any) => e.nombreCompleto.toLowerCase().includes(buscarEmpleadoNomina.toLowerCase()))
          : empleadoNominaList;
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Vincular con empleado / nómina</h3>
                    <p className="text-sm text-gray-500">{empleadoNominaSeleccionado ? 'Selecciona la nómina a vincular' : 'Selecciona el empleado'}</p>
                  </div>
                  <button onClick={() => { setShowEmpleadoNominaModal(null); setEmpleadoNominaList([]); setEmpleadoNominaSeleccionado(null); setNominasList([]); }} className="text-gray-400 hover:text-gray-600">
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                {movActual && (
                  <div className="mt-2 px-3 py-2 bg-purple-50 rounded-lg">
                    <p className="text-xs text-purple-600">Movimiento: <span className="font-bold">{formatEUR(Math.abs(movActual.importe))}</span> — {movActual.concepto.substring(0, 60)}...</p>
                  </div>
                )}
              </div>
              <div className="overflow-y-auto flex-1 p-4">
                {!empleadoNominaSeleccionado ? (
                  <>
                    <input
                      type="text"
                      placeholder="Buscar empleado..."
                      value={buscarEmpleadoNomina}
                      onChange={(e) => setBuscarEmpleadoNomina(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm mb-3 focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                      autoFocus
                    />
                    {loadingEmpleadoNomina ? (
                      <p className="text-sm text-gray-500">Cargando empleados...</p>
                    ) : empleadosFiltrados.length === 0 ? (
                      <p className="text-sm text-gray-500">No se encontraron empleados.</p>
                    ) : (
                      <div className="space-y-1">
                        {empleadosFiltrados.map((emp: any) => (
                          <button
                            key={emp.id}
                            onClick={() => seleccionarEmpleadoNomina(emp)}
                            className="w-full text-left px-4 py-3 rounded-lg border transition-colors bg-white border-gray-200 hover:bg-purple-50 hover:border-purple-300 cursor-pointer"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-medium text-sm text-gray-900">{emp.nombreCompleto}</span>
                                {emp.departamento && <span className="ml-2 text-xs text-gray-400">{emp.departamento}</span>}
                              </div>
                              <div className="text-right">
                                <span className="text-xs text-purple-600 font-medium">{emp.totalNominas} nóm.</span>
                                {emp.nominasPendientes > 0 && (
                                  <span className="ml-1 text-xs text-amber-600">({emp.nominasPendientes} pdte.)</span>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setEmpleadoNominaSeleccionado(null); setNominasList([]); }}
                      className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800 mb-3"
                    >
                      ← Volver a empleados
                    </button>
                    <div className="px-3 py-2 bg-gray-50 rounded-lg mb-3">
                      <p className="text-sm font-medium text-gray-700">{empleadoNominaSeleccionado.nombreCompleto}</p>
                    </div>
                    {loadingNominas ? (
                      <p className="text-sm text-gray-500">Cargando nóminas...</p>
                    ) : nominasList.length === 0 ? (
                      <p className="text-sm text-gray-500">No se encontraron nóminas para este empleado.</p>
                    ) : (
                      <div className="space-y-2">
                        {nominasList.map((n: any) => (
                          <button
                            key={n.id}
                            onClick={() => vincularNomina(showEmpleadoNominaModal!, n.id)}
                            className={`w-full text-left px-4 py-3 rounded-lg border transition-colors cursor-pointer ${
                              n.vinculada || n.numMovimientos > 0
                                ? 'bg-green-50 border-green-200 hover:bg-green-100'
                                : 'bg-white border-purple-200 hover:bg-purple-50 hover:border-purple-400'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-medium text-sm text-gray-900">{MESES[n.mes]} {n.anio}</span>
                                {n.numMovimientos > 0 && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">ya vinculada</span>}
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-sm text-purple-700">{formatEUR(n.netoPercibir)}</span>
                              </div>
                            </div>
                            {movActual && Math.abs(Math.abs(movActual.importe) - n.netoPercibir) < 5 && (
                              <p className="text-[10px] text-green-600 mt-1 font-medium">✓ Importe coincide</p>
                            )}
                            {n.costeTotalEmpresa && (
                              <p className="text-[11px] text-gray-400 mt-0.5">Coste empresa: {formatEUR(n.costeTotalEmpresa)}</p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="p-4 border-t">
                <button
                  onClick={() => { setShowEmpleadoNominaModal(null); setEmpleadoNominaList([]); setEmpleadoNominaSeleccionado(null); setNominasList([]); }}
                  className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
                >Cerrar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal de detalle de vinculación */}
      {showDetalleVinculacion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDetalleVinculacion(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-gray-900">Detalle de vinculación</h3>
                <button onClick={() => setShowDetalleVinculacion(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
              </div>

              {/* Datos del movimiento */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Movimiento bancario</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">Fecha:</span> <span className="font-medium">{new Date(showDetalleVinculacion.fechaOperacion).toLocaleDateString('es-ES')}</span></div>
                  <div><span className="text-gray-500">Importe:</span> <span className={`font-bold ${showDetalleVinculacion.importe < 0 ? 'text-red-600' : 'text-green-600'}`}>{showDetalleVinculacion.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span></div>
                  <div className="col-span-2"><span className="text-gray-500">Concepto:</span> <span className="font-medium">{showDetalleVinculacion.concepto}</span></div>
                  <div><span className="text-gray-500">Banco:</span> <span className="font-medium">{showDetalleVinculacion.cuenta?.banco}</span></div>
                  {showDetalleVinculacion.entidadFiscal && (
                    <div><span className="text-gray-500">Tercero:</span> <span className="font-medium">{showDetalleVinculacion.entidadFiscal.razonSocial}</span></div>
                  )}
                </div>
              </div>

              {/* Datos del documento vinculado: Nómina */}
              {showDetalleVinculacion.nomina && (
                <div className="bg-indigo-50 rounded-lg p-4 mb-4">
                  <h4 className="text-xs font-semibold text-indigo-600 uppercase mb-2">Nómina vinculada</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">Empleado:</span> <span className="font-medium">{showDetalleVinculacion.nomina.empleado.nombreCompleto}</span></div>
                    <div><span className="text-gray-500">Período:</span> <span className="font-medium">{showDetalleVinculacion.nomina.mes}/{showDetalleVinculacion.nomina.anio}</span></div>
                    <div><span className="text-gray-500">Neto a percibir:</span> <span className="font-bold text-indigo-700">{showDetalleVinculacion.nomina.netoPercibir.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span></div>
                    <div><span className="text-gray-500">Diferencia:</span> <span className={`font-medium ${Math.abs(Math.abs(showDetalleVinculacion.importe) - showDetalleVinculacion.nomina.netoPercibir) < 0.05 ? 'text-green-600' : 'text-red-600'}`}>{(Math.abs(showDetalleVinculacion.importe) - showDetalleVinculacion.nomina.netoPercibir).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span></div>
                  </div>

                  {/* Movimientos vinculados a esta nómina */}
                  {showDetalleVinculacion.nomina.movimientos && showDetalleVinculacion.nomina.movimientos.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-indigo-200">
                      <h5 className="text-xs font-semibold text-indigo-500 mb-2">Movimientos vinculados a esta nómina ({showDetalleVinculacion.nomina.movimientos.length})</h5>
                      <div className="space-y-1">
                        {showDetalleVinculacion.nomina.movimientos.map((m, idx) => (
                          <div key={idx} className={`flex justify-between text-xs px-2 py-1 rounded ${m.id === showDetalleVinculacion.id ? 'bg-indigo-100 font-bold' : 'bg-white'}`}>
                            <span>{m.id === showDetalleVinculacion.id ? '→ Este movimiento' : `Movimiento ${idx + 1}`}</span>
                            <span className="text-red-600">{m.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t border-indigo-200 text-xs font-bold">
                        <span>Total pagos:</span>
                        <span className="text-red-600">{showDetalleVinculacion.nomina.movimientos.reduce((sum, m) => sum + m.importe, 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold">
                        <span>Neto nómina:</span>
                        <span className="text-indigo-700">-{showDetalleVinculacion.nomina.netoPercibir.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold mt-1">
                        <span>% cubierto:</span>
                        <span className={`${Math.abs(showDetalleVinculacion.nomina.movimientos.reduce((sum, m) => sum + m.importe, 0)) >= showDetalleVinculacion.nomina.netoPercibir - 0.05 ? 'text-green-600' : 'text-amber-600'}`}>
                          {((Math.abs(showDetalleVinculacion.nomina.movimientos.reduce((sum, m) => sum + m.importe, 0)) / showDetalleVinculacion.nomina.netoPercibir) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Datos del documento vinculado: Factura recibida */}
              {showDetalleVinculacion.factura && (
                <div className="bg-blue-50 rounded-lg p-4 mb-4">
                  <h4 className="text-xs font-semibold text-blue-600 uppercase mb-2">Factura recibida vinculada</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">Proveedor:</span> <span className="font-medium">{showDetalleVinculacion.factura.proveedor}</span></div>
                    <div><span className="text-gray-500">Nº Factura:</span> <span className="font-medium">{showDetalleVinculacion.factura.numFactura}</span></div>
                    <div><span className="text-gray-500">Total factura:</span> <span className="font-bold text-blue-700">{showDetalleVinculacion.factura.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span></div>
                    <div><span className="text-gray-500">Diferencia:</span> <span className={`font-medium ${Math.abs(Math.abs(showDetalleVinculacion.importe) - showDetalleVinculacion.factura.total) < 0.05 ? 'text-green-600' : 'text-red-600'}`}>{(Math.abs(showDetalleVinculacion.importe) - showDetalleVinculacion.factura.total).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span></div>
                  </div>
                </div>
              )}

              {/* Datos del documento vinculado: Factura emitida */}
              {showDetalleVinculacion.facturaEmitida && (
                <div className="bg-emerald-50 rounded-lg p-4 mb-4">
                  <h4 className="text-xs font-semibold text-emerald-600 uppercase mb-2">Factura emitida vinculada</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">Cliente:</span> <span className="font-medium">{showDetalleVinculacion.facturaEmitida.cliente}</span></div>
                    <div><span className="text-gray-500">Nº Factura:</span> <span className="font-medium">{showDetalleVinculacion.facturaEmitida.numFactura}</span></div>
                    <div><span className="text-gray-500">Total factura:</span> <span className="font-bold text-emerald-700">{showDetalleVinculacion.facturaEmitida.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span></div>
                    <div><span className="text-gray-500">Diferencia:</span> <span className={`font-medium ${Math.abs(Math.abs(showDetalleVinculacion.importe) - showDetalleVinculacion.facturaEmitida.total) < 0.05 ? 'text-green-600' : 'text-red-600'}`}>{(Math.abs(showDetalleVinculacion.importe) - showDetalleVinculacion.facturaEmitida.total).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span></div>
                  </div>
                </div>
              )}

              {/* Datos del traspaso vinculado */}
              {showDetalleVinculacion.traspasoRelacionado && (
                <div className="bg-cyan-50 rounded-lg p-4 mb-4">
                  <h4 className="text-xs font-semibold text-cyan-600 uppercase mb-2">Traspaso entre cuentas propias</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {/* Origen */}
                    <div className="bg-white rounded-lg p-3 border border-cyan-200">
                      <div className="text-xs text-gray-500 mb-1">{showDetalleVinculacion.importe < 0 ? '📤 Salida' : '📥 Entrada'}</div>
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-sm">{showDetalleVinculacion.cuenta?.banco}</span>
                        <span className={`font-bold text-sm ${showDetalleVinculacion.importe < 0 ? 'text-red-600' : 'text-green-600'}`}>{showDetalleVinculacion.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{new Date(showDetalleVinculacion.fechaOperacion).toLocaleDateString('es-ES')}</div>
                    </div>
                    {/* Flecha */}
                    <div className="text-center text-cyan-400 text-lg">↕</div>
                    {/* Destino */}
                    <div className="bg-white rounded-lg p-3 border border-cyan-200">
                      <div className="text-xs text-gray-500 mb-1">{showDetalleVinculacion.importe < 0 ? '📥 Entrada' : '📤 Salida'}</div>
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-sm">{showDetalleVinculacion.traspasoRelacionado.cuenta.banco}</span>
                        <span className={`font-bold text-sm ${showDetalleVinculacion.traspasoRelacionado.importe < 0 ? 'text-red-600' : 'text-green-600'}`}>{showDetalleVinculacion.traspasoRelacionado.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{new Date(showDetalleVinculacion.traspasoRelacionado.fechaOperacion).toLocaleDateString('es-ES')}</div>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-cyan-200 text-xs text-gray-500">
                    <span className="font-medium">Concepto contrapartida:</span> {showDetalleVinculacion.traspasoRelacionado.concepto}
                  </div>
                </div>
              )}

              {/* Sin documento vinculado */}
              {!showDetalleVinculacion.nomina && !showDetalleVinculacion.factura && !showDetalleVinculacion.facturaEmitida && !showDetalleVinculacion.traspasoRelacionado && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4 text-center text-sm text-gray-500">
                  Este movimiento está conciliado pero no tiene documento específico vinculado (justificante, etc.)
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={() => setShowDetalleVinculacion(null)} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal Video Tutorial */}
      {showVideoTutorial && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowVideoTutorial(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <PlayCircleIcon className="h-5 w-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-900">Tutorial: Conciliación Bancaria</h3>
              </div>
              <button onClick={() => setShowVideoTutorial(false)} className="p-1 hover:bg-gray-100 rounded-full">
                <XMarkIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4">
              <video
                controls
                autoPlay
                className="w-full rounded-lg"
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663306876178/xDZYuOYdMKatbZge.mp4"
              >
                Tu navegador no soporta la reproducción de video.
              </video>
              <p className="text-xs text-gray-500 mt-3 text-center">Duración: 2:30 min — Guía rápida de conciliación bancaria</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
