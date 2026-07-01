'use client';

import { useState, useEffect } from 'react';
import { MagnifyingGlassIcon, FunnelIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon, BoltIcon } from '@heroicons/react/24/outline';

interface Movimiento {
  id: string;
  fechaOperacion: string;
  fechaValor: string;
  concepto: string;
  importe: number;
  saldo: number | null;
  categoria: string | null;
  tipoPago: string | null;
  conciliado: boolean;
  cuenta: { banco: string; alias: string };
}

interface EstadoConciliacion {
  totalMovimientos: number;
  conciliados: number;
  sinConciliar: number;
  sinCategorizar: number;
  porcentajeConciliado: number;
}

const CATEGORIAS = [
  'Estructura', 'Operadora', 'Draxton', 'Vola', 'Sotic', 'IMPUESTOS',
  'Sueldos y Salarios', 'Dietas', 'Desplazamientos', 'Gastos Financieros',
  'Comisiones V-Valley', 'Comisiones Draxton', 'Comisiones Bancos',
  'Retenciones', 'Tesoreria', 'Traspaso', 'Proyectos Singulares',
  'ZOOM', 'Hotspot', 'Morosos', 'Otros Gastos', 'Gastos Devoluciones', 'Embargos',
];

const TIPOS_PAGO = ['Factura', 'IVA', 'IRPF', 'IS', 'SS', 'Nómina', 'Domiciliación', 'Transferencia', 'Débito', 'Confirming', 'Remesa', 'Préstamo', 'Comisión', 'Suscripción', 'Devolución'];

export default function MovimientosPage() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ cuentaId: '', categoria: '', conciliado: '', buscar: '', desde: '', hasta: '' });
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [estadoConciliacion, setEstadoConciliacion] = useState<EstadoConciliacion | null>(null);
  const [conciliando, setConciliando] = useState(false);
  const [resultadoConciliacion, setResultadoConciliacion] = useState<any>(null);

  useEffect(() => {
    fetchCuentas();
    fetchEstadoConciliacion();
  }, []);

  useEffect(() => {
    fetchMovimientos();
  }, [page, filtros]);

  async function fetchCuentas() {
    const res = await fetch('/api/admin/finanzas/cuentas');
    const json = await res.json();
    setCuentas(json.cuentas || []);
  }

  async function fetchEstadoConciliacion() {
    try {
      const res = await fetch('/api/admin/finanzas/conciliacion');
      const json = await res.json();
      setEstadoConciliacion(json);
    } catch (e) { /* silencio */ }
  }

  async function fetchMovimientos() {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: '50' });
    if (filtros.cuentaId) params.set('cuentaId', filtros.cuentaId);
    if (filtros.categoria) params.set('categoria', filtros.categoria);
    if (filtros.conciliado) params.set('conciliado', filtros.conciliado);
    if (filtros.desde) params.set('desde', filtros.desde);
    if (filtros.hasta) params.set('hasta', filtros.hasta);
    
    const res = await fetch(`/api/admin/finanzas/importar-movimientos?${params}`);
    const json = await res.json();
    setMovimientos(json.movimientos || []);
    setTotal(json.total || 0);
    setLoading(false);
  }

  async function ejecutarConciliacion(modo: string) {
    setConciliando(true);
    setResultadoConciliacion(null);
    try {
      const res = await fetch('/api/admin/finanzas/conciliacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo }),
      });
      const json = await res.json();
      setResultadoConciliacion(json.resultados);
      fetchMovimientos();
      fetchEstadoConciliacion();
    } catch (e) {
      console.error(e);
    }
    setConciliando(false);
  }

  async function actualizarMovimiento(id: string, data: any) {
    await fetch(`/api/admin/finanzas/movimientos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, crearRegla: true }),
    });
    fetchMovimientos();
    setEditando(null);
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
          <h1 className="text-2xl font-bold text-gray-900">Movimientos Bancarios</h1>
          <p className="text-sm text-gray-500 mt-1">{total} movimientos en total</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => ejecutarConciliacion('clasificar')}
            disabled={conciliando}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-amber-50 border border-amber-200 rounded-lg text-amber-700 hover:bg-amber-100 disabled:opacity-50"
          >
            <BoltIcon className="h-4 w-4" />
            Clasificar
          </button>
          <button
            onClick={() => ejecutarConciliacion('todo')}
            disabled={conciliando}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-50 border border-green-200 rounded-lg text-green-700 hover:bg-green-100 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${conciliando ? 'animate-spin' : ''}`} />
            Conciliar Todo
          </button>
        </div>
      </div>

      {/* Panel de estado de conciliación */}
      {estadoConciliacion && (
        <div className="bg-white rounded-xl border p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-lg font-bold text-gray-900">{estadoConciliacion.totalMovimientos}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Conciliados</p>
              <p className="text-lg font-bold text-green-600">{estadoConciliacion.conciliados}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Pendientes</p>
              <p className="text-lg font-bold text-amber-600">{estadoConciliacion.sinConciliar}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Sin categorizar</p>
              <p className="text-lg font-bold text-red-600">{estadoConciliacion.sinCategorizar}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">% Conciliado</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold text-blue-600">{estadoConciliacion.porcentajeConciliado}%</p>
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${estadoConciliacion.porcentajeConciliado}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resultado de conciliación */}
      {resultadoConciliacion && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-sm font-medium text-green-800">Conciliación completada:</p>
          <div className="flex gap-4 mt-1 text-xs text-green-700">
            <span>{resultadoConciliacion.clasificados} clasificados</span>
            <span>{resultadoConciliacion.conciliadosFacturasRecibidas} facturas recibidas</span>
            <span>{resultadoConciliacion.conciliadosFacturasEmitidas} facturas emitidas</span>
            <span>{resultadoConciliacion.conciliadosConfirming} confirming</span>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center">
        <FunnelIcon className="h-4 w-4 text-gray-400" />
        <select
          value={filtros.cuentaId}
          onChange={(e) => { setFiltros({...filtros, cuentaId: e.target.value}); setPage(1); }}
          className="border rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">Todos los bancos</option>
          {cuentas.map(c => (
            <option key={c.id} value={c.id}>{c.banco} ({c.alias})</option>
          ))}
        </select>
        <select
          value={filtros.categoria}
          onChange={(e) => { setFiltros({...filtros, categoria: e.target.value}); setPage(1); }}
          className="border rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filtros.conciliado}
          onChange={(e) => { setFiltros({...filtros, conciliado: e.target.value}); setPage(1); }}
          className="border rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">Todos</option>
          <option value="true">Conciliados</option>
          <option value="false">Pendientes</option>
        </select>
        <input
          type="date"
          value={filtros.desde}
          onChange={(e) => { setFiltros({...filtros, desde: e.target.value}); setPage(1); }}
          className="border rounded-lg px-3 py-1.5 text-sm"
          placeholder="Desde"
        />
        <input
          type="date"
          value={filtros.hasta}
          onChange={(e) => { setFiltros({...filtros, hasta: e.target.value}); setPage(1); }}
          className="border rounded-lg px-3 py-1.5 text-sm"
          placeholder="Hasta"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Banco</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Concepto</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Importe</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Saldo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Categoría</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">✓</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              ) : movimientos.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No hay movimientos. Importa un extracto bancario.</td></tr>
              ) : (
                movimientos.map(mov => (
                  <tr key={mov.id} className={`hover:bg-gray-50 ${!mov.categoria ? 'bg-yellow-50/30' : ''}`}>
                    <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatFecha(mov.fechaOperacion)}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{mov.cuenta?.banco}</span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-900 max-w-sm truncate" title={mov.concepto}>{mov.concepto}</td>
                    <td className={`px-4 py-2.5 text-sm font-medium text-right whitespace-nowrap ${mov.importe >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatEUR(mov.importe)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 text-right whitespace-nowrap">
                      {mov.saldo !== null ? formatEUR(mov.saldo) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {editando === mov.id ? (
                        <select
                          defaultValue={mov.categoria || ''}
                          onChange={(e) => actualizarMovimiento(mov.id, { categoria: e.target.value || null })}
                          className="border rounded px-2 py-1 text-xs w-full"
                          autoFocus
                          onBlur={() => setEditando(null)}
                        >
                          <option value="">Sin categoría</option>
                          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditando(mov.id)}
                          className={`text-xs px-2 py-0.5 rounded-full ${mov.categoria ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400 hover:bg-blue-50'}`}
                        >
                          {mov.categoria || 'Categorizar'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-gray-500">{mov.tipoPago || '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => actualizarMovimiento(mov.id, { conciliado: !mov.conciliado })}
                        title={mov.conciliado ? 'Clic para marcar como NO conciliado' : 'Clic para marcar como conciliado'}
                        className="group relative"
                      >
                        {mov.conciliado ? (
                          <CheckCircleIcon className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircleIcon className="h-5 w-5 text-gray-300 hover:text-green-400" />
                        )}
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          {mov.conciliado ? 'Desconciliar' : 'Conciliar'}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {total > 50 && (
          <div className="border-t px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Mostrando {(page - 1) * 50 + 1} - {Math.min(page * 50, total)} de {total}
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
                onClick={() => setPage(p => p + 1)}
                disabled={page * 50 >= total}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
