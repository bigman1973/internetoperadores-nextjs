'use client';
import { useState, useEffect } from 'react';
import { LinkIcon, MagnifyingGlassIcon, ArrowPathIcon, CheckCircleIcon, XMarkIcon, ArrowsRightLeftIcon, FunnelIcon } from '@heroicons/react/24/outline';

interface Movimiento {
  id: string;
  fechaOperacion: string;
  concepto: string;
  importe: number;
  conciliado: boolean;
  tercero: string | null;
  entidadFiscal: { razonSocial: string } | null;
  cuenta: { banco: string; alias: string };
}

interface FacturaRecibida {
  id: string;
  numFactura: string;
  proveedor: string;
  total: number;
  fecha: string;
  fechaVencimiento: string | null;
  conciliada: boolean;
}

export default function ConciliacionManualPage() {
  // Estado movimientos
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [totalMov, setTotalMov] = useState(0);
  const [pageMov, setPageMov] = useState(1);
  const [buscarMov, setBuscarMov] = useState('');
  const [filtroImporteMov, setFiltroImporteMov] = useState('');
  const [filtroFechaDesdeMov, setFiltroFechaDesdeMov] = useState('');
  const [filtroFechaHastaMov, setFiltroFechaHastaMov] = useState('');
  const [sortMov, setSortMov] = useState<'fecha' | 'importe'>('fecha');
  const [sortDirMov, setSortDirMov] = useState<'asc' | 'desc'>('desc');
  const [loadingMov, setLoadingMov] = useState(false);
  const [selectedMov, setSelectedMov] = useState<Movimiento | null>(null);

  // Estado facturas
  const [facturas, setFacturas] = useState<FacturaRecibida[]>([]);
  const [totalFact, setTotalFact] = useState(0);
  const [pageFact, setPageFact] = useState(1);
  const [buscarFact, setBuscarFact] = useState('');
  const [filtroImporteFact, setFiltroImporteFact] = useState('');
  const [filtroFechaDesdeFact, setFiltroFechaDesdeFact] = useState('');
  const [filtroFechaHastaFact, setFiltroFechaHastaFact] = useState('');
  const [sortFact, setSortFact] = useState<'fecha' | 'importe' | 'vencimiento'>('fecha');
  const [sortDirFact, setSortDirFact] = useState<'asc' | 'desc'>('desc');
  const [loadingFact, setLoadingFact] = useState(false);
  const [selectedFact, setSelectedFact] = useState<FacturaRecibida | null>(null);

  // Estado general
  const [vinculando, setVinculando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [autoConciliando, setAutoConciliando] = useState(false);
  const [autoResultado, setAutoResultado] = useState<any>(null);

  useEffect(() => { fetchMovimientos(); }, [pageMov, sortMov, sortDirMov]);
  useEffect(() => { fetchFacturas(); }, [pageFact, sortFact, sortDirFact]);

  async function fetchMovimientos() {
    setLoadingMov(true);
    const params = new URLSearchParams({
      page: pageMov.toString(),
      limit: '25',
      conciliado: 'false',
      sortBy: sortMov === 'fecha' ? 'fechaOperacion' : 'importe',
      sortDir: sortDirMov,
    });
    if (buscarMov.trim()) params.set('buscar', buscarMov.trim());
    if (filtroImporteMov) params.set('importeExacto', filtroImporteMov);
    if (filtroFechaDesdeMov) params.set('desde', filtroFechaDesdeMov);
    if (filtroFechaHastaMov) params.set('hasta', filtroFechaHastaMov);
    // Solo gastos (pagos a proveedores)
    params.set('tipo', 'gastos');
    try {
      const res = await fetch(`/api/admin/finanzas/movimientos?${params}`);
      const json = await res.json();
      setMovimientos((json.movimientos || []).filter((m: Movimiento) => m.importe < 0));
      setTotalMov(json.total || 0);
    } catch (e) { console.error(e); }
    setLoadingMov(false);
  }

  async function fetchFacturas() {
    setLoadingFact(true);
    const params = new URLSearchParams({
      page: pageFact.toString(),
      limit: '25',
      sinConciliar: 'true',
      sortBy: sortFact === 'fecha' ? 'fecha' : sortFact === 'vencimiento' ? 'fechaVencimiento' : 'total',
      sortDir: sortDirFact,
    });
    if (buscarFact.trim()) params.set('buscar', buscarFact.trim());
    if (filtroImporteFact) params.set('importeExacto', filtroImporteFact);
    if (filtroFechaDesdeFact) params.set('desde', filtroFechaDesdeFact);
    if (filtroFechaHastaFact) params.set('hasta', filtroFechaHastaFact);
    try {
      const res = await fetch(`/api/admin/finanzas/conciliacion/manual?${params}`);
      const json = await res.json();
      setFacturas(json.facturas || []);
      setTotalFact(json.total || 0);
    } catch (e) { console.error(e); }
    setLoadingFact(false);
  }

  async function vincular() {
    if (!selectedMov || !selectedFact) return;
    setVinculando(true);
    try {
      const res = await fetch(`/api/admin/finanzas/movimientos/${selectedMov.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facturaId: selectedFact.id, conciliado: true }),
      });
      if (res.ok) {
        setMensaje({ tipo: 'ok', texto: `Vinculado: ${selectedFact.numFactura} ↔ ${selectedMov.concepto.slice(0, 40)}` });
        setSelectedMov(null);
        setSelectedFact(null);
        fetchMovimientos();
        fetchFacturas();
      } else {
        setMensaje({ tipo: 'error', texto: 'Error al vincular' });
      }
    } catch (e) {
      setMensaje({ tipo: 'error', texto: 'Error de red' });
    }
    setVinculando(false);
    setTimeout(() => setMensaje(null), 4000);
  }

  async function ejecutarAutoConciliacion() {
    setAutoConciliando(true);
    setAutoResultado(null);
    try {
      const res = await fetch('/api/admin/finanzas/conciliacion/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      const json = await res.json();
      setAutoResultado(json);
      fetchMovimientos();
      fetchFacturas();
    } catch (e) {
      setAutoResultado({ error: 'Error de red' });
    }
    setAutoConciliando(false);
  }

  function buscarMovPorImporteFactura() {
    if (selectedFact) {
      setFiltroImporteMov(selectedFact.total.toFixed(2));
      setPageMov(1);
      setTimeout(fetchMovimientos, 100);
    }
  }

  function buscarFactPorImporteMovimiento() {
    if (selectedMov) {
      setFiltroImporteFact(Math.abs(selectedMov.importe).toFixed(2));
      setPageFact(1);
      setTimeout(fetchFacturas, 100);
    }
  }

  const totalPagesMov = Math.ceil(totalMov / 25);
  const totalPagesFact = Math.ceil(totalFact / 25);

  return (
    <div className="p-4 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conciliación Manual</h1>
          <p className="text-sm text-gray-500">Selecciona un movimiento y una factura para vincularlos</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={ejecutarAutoConciliacion}
            disabled={autoConciliando}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 text-sm"
          >
            <ArrowPathIcon className={`w-4 h-4 ${autoConciliando ? 'animate-spin' : ''}`} />
            Auto-conciliar
          </button>
          <a href="/admin/finanzas/conciliacion" className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm">
            ← Conciliación clásica
          </a>
        </div>
      </div>

      {/* Resultado auto-conciliación */}
      {autoResultado && (
        <div className={`mb-4 p-3 rounded-lg ${autoResultado.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
          {autoResultado.error ? (
            <p className="text-red-700 text-sm">{autoResultado.error}</p>
          ) : (
            <div className="text-sm text-green-800">
              <p className="font-semibold">Auto-conciliación completada: {autoResultado.totalConciliados} vinculaciones</p>
              <p>• Por nº factura en concepto: {autoResultado.porNumFactura}</p>
              <p>• Por importe + tercero: {autoResultado.porImporteTercero}</p>
              <p>• Por importe + fecha vencimiento: {autoResultado.porImporteFechaVencimiento}</p>
              <p>• Entidades asignadas a movimientos: {autoResultado.entidadesAsignadas}</p>
            </div>
          )}
        </div>
      )}

      {/* Mensaje de resultado */}
      {mensaje && (
        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${mensaje.tipo === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {mensaje.tipo === 'ok' ? <CheckCircleIcon className="w-5 h-5" /> : <XMarkIcon className="w-5 h-5" />}
          <span className="text-sm">{mensaje.texto}</span>
        </div>
      )}

      {/* Botón vincular central */}
      {selectedMov && selectedFact && (
        <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg flex items-center justify-between">
          <div className="text-sm">
            <span className="font-semibold text-purple-800">Vincular:</span>{' '}
            <span className="text-gray-700">{selectedMov.concepto.slice(0, 50)}</span>
            <span className="mx-2 text-purple-600">↔</span>
            <span className="text-gray-700">{selectedFact.numFactura} ({selectedFact.proveedor.slice(0, 30)})</span>
            <span className="ml-2 text-xs text-gray-500">
              Mov: {Math.abs(selectedMov.importe).toFixed(2)}€ | Fact: {selectedFact.total.toFixed(2)}€
              {Math.abs(Math.abs(selectedMov.importe) - selectedFact.total) > 0.01 && (
                <span className="text-orange-600 font-semibold ml-1">
                  (Diff: {Math.abs(Math.abs(selectedMov.importe) - selectedFact.total).toFixed(2)}€)
                </span>
              )}
            </span>
          </div>
          <button
            onClick={vincular}
            disabled={vinculando}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
          >
            <LinkIcon className="w-4 h-4" />
            {vinculando ? 'Vinculando...' : 'Vincular'}
          </button>
        </div>
      )}

      {/* Vista dual */}
      <div className="grid grid-cols-2 gap-4">
        {/* Panel izquierdo: Movimientos bancarios */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 p-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-800 text-sm">Movimientos Bancarios ({totalMov})</h2>
              {selectedFact && (
                <button onClick={buscarMovPorImporteFactura} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">
                  Buscar {selectedFact.total.toFixed(2)}€
                </button>
              )}
            </div>
            {/* Filtros */}
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                placeholder="Buscar concepto..."
                value={buscarMov}
                onChange={(e) => setBuscarMov(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (setPageMov(1), fetchMovimientos())}
                className="flex-1 min-w-[120px] px-2 py-1 border rounded text-xs text-gray-900"
              />
              <input
                type="text"
                placeholder="Importe"
                value={filtroImporteMov}
                onChange={(e) => setFiltroImporteMov(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (setPageMov(1), fetchMovimientos())}
                className="w-20 px-2 py-1 border rounded text-xs text-gray-900"
              />
              <input
                type="date"
                value={filtroFechaDesdeMov}
                onChange={(e) => { setFiltroFechaDesdeMov(e.target.value); setPageMov(1); }}
                className="px-2 py-1 border rounded text-xs text-gray-900"
              />
              <input
                type="date"
                value={filtroFechaHastaMov}
                onChange={(e) => { setFiltroFechaHastaMov(e.target.value); setPageMov(1); }}
                className="px-2 py-1 border rounded text-xs text-gray-900"
              />
              <button onClick={() => { setPageMov(1); fetchMovimientos(); }} className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300">
                <MagnifyingGlassIcon className="w-3 h-3" />
              </button>
            </div>
            {/* Ordenación */}
            <div className="flex gap-2 mt-2 text-xs">
              <button onClick={() => { setSortMov('fecha'); setSortDirMov(sortMov === 'fecha' ? (sortDirMov === 'desc' ? 'asc' : 'desc') : 'desc'); }}
                className={`px-2 py-0.5 rounded ${sortMov === 'fecha' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                Fecha {sortMov === 'fecha' && (sortDirMov === 'desc' ? '↓' : '↑')}
              </button>
              <button onClick={() => { setSortMov('importe'); setSortDirMov(sortMov === 'importe' ? (sortDirMov === 'desc' ? 'asc' : 'desc') : 'asc'); }}
                className={`px-2 py-0.5 rounded ${sortMov === 'importe' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                Importe {sortMov === 'importe' && (sortDirMov === 'desc' ? '↓' : '↑')}
              </button>
            </div>
          </div>
          {/* Lista movimientos */}
          <div className="overflow-y-auto max-h-[600px]">
            {loadingMov ? (
              <div className="p-4 text-center text-gray-500 text-sm">Cargando...</div>
            ) : movimientos.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">No hay movimientos sin conciliar</div>
            ) : (
              movimientos.map((mov) => (
                <div
                  key={mov.id}
                  onClick={() => setSelectedMov(selectedMov?.id === mov.id ? null : mov)}
                  className={`p-2 border-b cursor-pointer hover:bg-purple-50 transition-colors ${selectedMov?.id === mov.id ? 'bg-purple-100 border-l-4 border-l-purple-500' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{new Date(mov.fechaOperacion).toLocaleDateString('es-ES')}</span>
                    <span className="text-sm font-semibold text-red-600">{Math.abs(mov.importe).toFixed(2)}€</span>
                  </div>
                  <p className="text-xs text-gray-800 truncate mt-0.5">{mov.concepto}</p>
                  {(mov.tercero || mov.entidadFiscal) && (
                    <p className="text-xs text-blue-600 mt-0.5">{mov.entidadFiscal?.razonSocial || mov.tercero}</p>
                  )}
                </div>
              ))
            )}
          </div>
          {/* Paginación */}
          {totalPagesMov > 1 && (
            <div className="p-2 border-t bg-gray-50 flex items-center justify-between text-xs">
              <button disabled={pageMov <= 1} onClick={() => setPageMov(p => p - 1)} className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50">← Ant</button>
              <span className="text-gray-600">{pageMov}/{totalPagesMov}</span>
              <button disabled={pageMov >= totalPagesMov} onClick={() => setPageMov(p => p + 1)} className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50">Sig →</button>
            </div>
          )}
        </div>

        {/* Panel derecho: Facturas recibidas */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 p-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-800 text-sm">Facturas Recibidas sin conciliar ({totalFact})</h2>
              {selectedMov && (
                <button onClick={buscarFactPorImporteMovimiento} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">
                  Buscar {Math.abs(selectedMov.importe).toFixed(2)}€
                </button>
              )}
            </div>
            {/* Filtros */}
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                placeholder="Buscar proveedor/nº factura..."
                value={buscarFact}
                onChange={(e) => setBuscarFact(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (setPageFact(1), fetchFacturas())}
                className="flex-1 min-w-[120px] px-2 py-1 border rounded text-xs text-gray-900"
              />
              <input
                type="text"
                placeholder="Importe"
                value={filtroImporteFact}
                onChange={(e) => setFiltroImporteFact(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (setPageFact(1), fetchFacturas())}
                className="w-20 px-2 py-1 border rounded text-xs text-gray-900"
              />
              <input
                type="date"
                value={filtroFechaDesdeFact}
                onChange={(e) => { setFiltroFechaDesdeFact(e.target.value); setPageFact(1); }}
                className="px-2 py-1 border rounded text-xs text-gray-900"
              />
              <input
                type="date"
                value={filtroFechaHastaFact}
                onChange={(e) => { setFiltroFechaHastaFact(e.target.value); setPageFact(1); }}
                className="px-2 py-1 border rounded text-xs text-gray-900"
              />
              <button onClick={() => { setPageFact(1); fetchFacturas(); }} className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300">
                <MagnifyingGlassIcon className="w-3 h-3" />
              </button>
            </div>
            {/* Ordenación */}
            <div className="flex gap-2 mt-2 text-xs">
              <button onClick={() => { setSortFact('fecha'); setSortDirFact(sortFact === 'fecha' ? (sortDirFact === 'desc' ? 'asc' : 'desc') : 'desc'); }}
                className={`px-2 py-0.5 rounded ${sortFact === 'fecha' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                Fecha {sortFact === 'fecha' && (sortDirFact === 'desc' ? '↓' : '↑')}
              </button>
              <button onClick={() => { setSortFact('importe'); setSortDirFact(sortFact === 'importe' ? (sortDirFact === 'desc' ? 'asc' : 'desc') : 'asc'); }}
                className={`px-2 py-0.5 rounded ${sortFact === 'importe' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                Importe {sortFact === 'importe' && (sortDirFact === 'desc' ? '↓' : '↑')}
              </button>
              <button onClick={() => { setSortFact('vencimiento'); setSortDirFact(sortFact === 'vencimiento' ? (sortDirFact === 'desc' ? 'asc' : 'desc') : 'asc'); }}
                className={`px-2 py-0.5 rounded ${sortFact === 'vencimiento' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                Vencimiento {sortFact === 'vencimiento' && (sortDirFact === 'desc' ? '↓' : '↑')}
              </button>
            </div>
          </div>
          {/* Lista facturas */}
          <div className="overflow-y-auto max-h-[600px]">
            {loadingFact ? (
              <div className="p-4 text-center text-gray-500 text-sm">Cargando...</div>
            ) : facturas.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">No hay facturas sin conciliar</div>
            ) : (
              facturas.map((fact) => (
                <div
                  key={fact.id}
                  onClick={() => setSelectedFact(selectedFact?.id === fact.id ? null : fact)}
                  className={`p-2 border-b cursor-pointer hover:bg-purple-50 transition-colors ${selectedFact?.id === fact.id ? 'bg-purple-100 border-l-4 border-l-purple-500' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{new Date(fact.fecha).toLocaleDateString('es-ES')}</span>
                    <span className="text-sm font-semibold text-gray-800">{fact.total.toFixed(2)}€</span>
                  </div>
                  <p className="text-xs text-gray-800 truncate mt-0.5">{fact.proveedor}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-gray-600">{fact.numFactura}</span>
                    {fact.fechaVencimiento && (
                      <span className="text-xs text-orange-600">Venc: {new Date(fact.fechaVencimiento).toLocaleDateString('es-ES')}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          {/* Paginación */}
          {totalPagesFact > 1 && (
            <div className="p-2 border-t bg-gray-50 flex items-center justify-between text-xs">
              <button disabled={pageFact <= 1} onClick={() => setPageFact(p => p - 1)} className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50">← Ant</button>
              <span className="text-gray-600">{pageFact}/{totalPagesFact}</span>
              <button disabled={pageFact >= totalPagesFact} onClick={() => setPageFact(p => p + 1)} className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50">Sig →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
