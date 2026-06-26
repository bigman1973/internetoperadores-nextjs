'use client';

import { useState, useEffect } from 'react';
import { MagnifyingGlassIcon, FunnelIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

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

const CATEGORIAS = [
  'Estructura', 'Operadora', 'Draxton', 'Vola', 'Sotic', 'IMPUESTOS',
  'Sueldos y Salarios', 'Dietas', 'Desplazamientos', 'Gastos Financieros',
  'Comisiones V-Valley', 'Comisiones Draxton', 'Comisiones Bancos',
  'Retenciones', 'Tesoreria', 'Traspaso', 'Proyectos Singulares',
  'ZOOM', 'Hotspot', 'Morosos', 'Oros Gastos', 'Gastos Devoluciones', 'Embargos',
];

const TIPOS_PAGO = ['Factura', 'IVA', 'IRPF', 'SS', 'Nómina', 'Domiciliación', 'Transferencia', 'Débito', 'Confirming'];

export default function MovimientosPage() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ cuentaId: '', categoria: '', conciliado: '', buscar: '' });
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [editando, setEditando] = useState<string | null>(null);

  useEffect(() => {
    fetchCuentas();
  }, []);

  useEffect(() => {
    fetchMovimientos();
  }, [page, filtros]);

  async function fetchCuentas() {
    const res = await fetch('/api/admin/finanzas/cuentas');
    const json = await res.json();
    setCuentas(json.cuentas || []);
  }

  async function fetchMovimientos() {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: '50' });
    if (filtros.cuentaId) params.set('cuentaId', filtros.cuentaId);
    if (filtros.categoria) params.set('categoria', filtros.categoria);
    if (filtros.conciliado) params.set('conciliado', filtros.conciliado);
    
    const res = await fetch(`/api/admin/finanzas/importar-movimientos?${params}`);
    const json = await res.json();
    setMovimientos(json.movimientos || []);
    setTotal(json.total || 0);
    setLoading(false);
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
      </div>

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
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              ) : movimientos.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No hay movimientos. Importa un extracto bancario.</td></tr>
              ) : (
                movimientos.map(mov => (
                  <tr key={mov.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatFecha(mov.fechaOperacion)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{mov.cuenta?.banco}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">{mov.concepto}</td>
                    <td className={`px-4 py-3 text-sm font-medium text-right whitespace-nowrap ${mov.importe >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatEUR(mov.importe)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 text-right whitespace-nowrap">
                      {mov.saldo !== null ? formatEUR(mov.saldo) : '—'}
                    </td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => actualizarMovimiento(mov.id, { conciliado: !mov.conciliado })}
                        title={mov.conciliado ? 'Conciliado' : 'Pendiente'}
                      >
                        {mov.conciliado ? (
                          <CheckCircleIcon className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircleIcon className="h-5 w-5 text-gray-300 hover:text-green-400" />
                        )}
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
