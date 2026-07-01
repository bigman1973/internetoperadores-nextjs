'use client';
import { useState, useEffect, useRef } from 'react';
import { ArrowPathIcon, CheckCircleIcon, XMarkIcon, LinkIcon, BanknotesIcon, DocumentTextIcon, ArrowUturnLeftIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface Movimiento {
  id: string;
  fechaOperacion: string;
  concepto: string;
  importe: number;
  saldo: number | null;
  categoria: string | null;
  tipoPago: string | null;
  conciliado: boolean;
  cuenta: { banco: string; alias: string };
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

interface EstadoConciliacion {
  totalMovimientos: number;
  conciliados: number;
  sinConciliar: number;
  sinCategorizar: number;
  porcentajeConciliado: number;
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
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [tabSugerencias, setTabSugerencias] = useState<'sugeridas' | 'todas'>('sugeridas');

  useEffect(() => {
    fetchCuentas();
    fetchEstado();
  }, []);

  useEffect(() => {
    fetchMovimientos();
  }, [page, filtroTipo, filtroBanco, filtroConciliado]);

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
      // Toggle: si ya está seleccionado, cerrar
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
    try {
      const params = new URLSearchParams({ movimientoId });
      if (buscar) params.set('buscar', buscar);
      const res = await fetch(`/api/admin/finanzas/conciliacion/sugerencias?${params}`);
      const json = await res.json();
      setSugerencias(json.sugerencias || []);
      setTodasFacturas(json.todas || []);
      setTotalPendientes(json.totalPendientes || 0);
      // Si no hay sugeridas, mostrar todas directamente
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
    await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conciliado: true, facturaId }),
    });
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

  async function desconciliar(movimientoId: string) {
    if (!confirm('¿Deshacer la conciliación de este movimiento?')) return;
    await fetch(`/api/admin/finanzas/movimientos/${movimientoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conciliado: false, facturaId: null, gastoId: null, categoria: null }),
    });
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
    const facturasAMostrar = tabSugerencias === 'sugeridas' ? sugerencias : todasFacturas;

    return (
      <tr key={`panel-${movId}`}>
        <td colSpan={6} className="p-0">
          <div ref={panelRef} className="bg-blue-50 border-t-2 border-b-2 border-blue-300 p-4 space-y-3">
            {/* Header del panel */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DocumentTextIcon className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900 text-sm">Facturas candidatas</h3>
                <span className="text-xs text-gray-500">({totalPendientes} pendientes de vincular)</span>
              </div>
              <button onClick={() => { setSelectedMov(null); setSugerencias([]); setTodasFacturas([]); }} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

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
                    placeholder="Buscar proveedor o nº factura..."
                    value={buscarFactura}
                    onChange={(e) => setBuscarFactura(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') buscarEnFacturas(); }}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-lg"
                  />
                </div>
                <button
                  onClick={buscarEnFacturas}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Buscar
                </button>
              </div>
            </div>

            {/* Categorías rápidas (sin factura) */}
            <div className="flex items-center gap-2 text-xs">
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
            </div>

            {/* Lista de facturas */}
            {loadingSugerencias ? (
              <p className="text-sm text-gray-400 py-4 text-center">Buscando facturas...</p>
            ) : facturasAMostrar.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No se encontraron facturas. Prueba con otro término de búsqueda.</p>
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
          <h1 className="text-2xl font-bold text-gray-900">Conciliación Bancaria</h1>
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
          {conciliando ? 'Conciliando...' : 'Conciliar Automáticamente'}
        </button>
      </div>

      {/* KPIs - clickables como filtros */}
      {estado && (
        <div className="grid grid-cols-5 gap-3">
          <button
            onClick={() => { setFiltroConciliado(''); setPage(1); }}
            className={`bg-white border rounded-lg p-4 text-left transition-all hover:shadow-md ${
              filtroConciliado === '' ? 'ring-2 ring-gray-400 shadow-md' : ''
            }`}
          >
            <p className="text-xs text-gray-500 uppercase">Total Movimientos</p>
            <p className="text-2xl font-bold text-gray-900">{estado.totalMovimientos.toLocaleString()}</p>
          </button>
          <button
            onClick={() => { setFiltroConciliado('true'); setPage(1); }}
            className={`bg-white border rounded-lg p-4 text-left transition-all hover:shadow-md ${
              filtroConciliado === 'true' ? 'ring-2 ring-green-400 shadow-md' : ''
            }`}
          >
            <p className="text-xs text-gray-500 uppercase">Conciliados</p>
            <p className="text-2xl font-bold text-green-700">{estado.conciliados.toLocaleString()}</p>
          </button>
          <button
            onClick={() => { setFiltroConciliado('false'); setPage(1); }}
            className={`bg-white border rounded-lg p-4 text-left transition-all hover:shadow-md ${
              filtroConciliado === 'false' ? 'ring-2 ring-amber-400 shadow-md' : ''
            }`}
          >
            <p className="text-xs text-gray-500 uppercase">Sin Conciliar</p>
            <p className="text-2xl font-bold text-amber-700">{estado.sinConciliar.toLocaleString()}</p>
          </button>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">% Conciliado</p>
            <div className="flex items-end gap-2">
              <p className="text-2xl font-bold text-blue-700">{porcentaje}%</p>
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden mb-1.5">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: `${porcentaje}%` }} />
              </div>
            </div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Facturas sin vincular</p>
            <p className="text-2xl font-bold text-red-700">{estado.facturasRecibidasSinConciliar}</p>
          </div>
        </div>
      )}

      {/* Resultado conciliación automática */}
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
              {tipo === 'gastos' ? '↓ Gastos' : tipo === 'ingresos' ? '↑ Ingresos' : 'Todos'}
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
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Categoría</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              ) : movimientos.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No hay movimientos</td></tr>
              ) : (
                movimientos.map(mov => (
                  <>
                    <tr
                      key={mov.id}
                      className={`hover:bg-blue-50/30 cursor-pointer transition-colors ${selectedMov === mov.id ? 'bg-blue-50' : ''}`}
                      onClick={() => fetchSugerencias(mov.id)}
                    >
                      <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatFecha(mov.fechaOperacion)}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{mov.cuenta?.banco}</span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-900 max-w-md truncate" title={mov.concepto}>{mov.concepto}</td>
                      <td className={`px-4 py-2.5 text-sm font-medium text-right whitespace-nowrap ${mov.importe >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatEUR(mov.importe)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${mov.categoria ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                          {mov.categoria || 'Sin categoría'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {mov.conciliado ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); desconciliar(mov.id); }}
                              className="flex items-center gap-1 px-2 py-1 text-xs text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded border border-amber-200"
                              title="Deshacer conciliación"
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
                              <button
                                onClick={(e) => { e.stopPropagation(); marcarNoAplica(mov.id, mov.categoria || 'Otros Gastos'); }}
                                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-green-700 hover:bg-green-50 rounded border border-gray-200"
                                title="Marcar como conciliado sin factura asociada"
                              >
                                <CheckCircleIcon className="h-3.5 w-3.5" />
                                OK
                              </button>
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

        {/* Paginación */}
        {total > 30 && (
          <div className="border-t px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">Página {page} · {total} movimientos</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border rounded disabled:opacity-50">Anterior</button>
              <button onClick={() => setPage(p => p + 1)} disabled={movimientos.length < 30} className="px-3 py-1 text-sm border rounded disabled:opacity-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
