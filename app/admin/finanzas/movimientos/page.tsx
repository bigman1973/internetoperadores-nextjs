'use client';

import { useEffect, useMemo, useState } from 'react';
import { FunnelIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { CATEGORIAS_MOVIMIENTO, TIPOS_MOVIMIENTO } from '@/lib/finanzas/movement-catalog';
import BankImportWarnings, { type ContinuidadSaldo } from '@/components/finanzas/BankImportWarnings';

interface Movimiento {
  id: string;
  fechaOperacion: string;
  fechaValor?: string | null;
  concepto: string;
  importe: number;
  saldo: number | null;
  categoria: string | null;
  categoriaOriginal?: string | null;
  categoriaNormalizada?: boolean | null;
  tipoPago: string | null;
  tipoPagoOriginal?: string | null;
  tipoPagoNormalizado?: boolean | null;
  conciliado: boolean;
  catalogo?: { categoriaOriginal?: string | null; categoriaEsLegacy?: boolean; tipoPagoOriginal?: string | null; tipoPagoEsLegacy?: boolean };
  cuenta: { banco: string; alias?: string | null };
}

interface CuentaResumen {
  id?: string;
  banco: string;
  alias?: string | null;
  ultimoMovimiento?: string | null;
  fechaCorteExtracto?: string | null;
  continuidadSaldo?: ContinuidadSaldo | null;
  avisosSaldo?: unknown[] | null;
  cobertura?: { continuidadSaldo?: ContinuidadSaldo | null; avisosSaldo?: unknown[] | null };
}

const CATEGORIAS = CATEGORIAS_MOVIMIENTO;
const TIPOS_PAGO = TIPOS_MOVIMIENTO;

function formatEUR(value: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}

function formatFecha(value?: string | null) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
}

function legacyLabel(value: string | null, original?: string | null, normalized?: boolean | null) {
  const raw = original || value;
  const isUnknown = normalized === false || (!value && Boolean(raw));
  return { raw, isUnknown };
}

export default function MovimientosPage() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtros, setFiltros] = useState({ cuentaId: '', categoria: '', conciliado: '', desde: '', hasta: '' });
  const [cuentas, setCuentas] = useState<CuentaResumen[]>([]);
  const [editando, setEditando] = useState<string | null>(null);

  const selectedAccount = useMemo(
    () => cuentas.find(cuenta => cuenta.id === filtros.cuentaId) || null,
    [cuentas, filtros.cuentaId],
  );

  useEffect(() => {
    void fetchCuentas();
  }, []);

  useEffect(() => {
    void fetchMovimientos();
  }, [page, filtros]);

  async function fetchCuentas() {
    try {
      const res = await fetch('/api/admin/finanzas/estado-cuentas');
      if (!res.ok) throw new Error('No se ha podido consultar el estado de los extractos.');
      const json = await res.json();
      setCuentas(Array.isArray(json.estadoCuentas) ? json.estadoCuentas : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se ha podido consultar el estado de los extractos.');
    }
  }

  async function fetchMovimientos() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '50' });
      if (filtros.cuentaId) params.set('cuentaId', filtros.cuentaId);
      if (filtros.categoria) params.set('categoria', filtros.categoria);
      if (filtros.conciliado) params.set('conciliado', filtros.conciliado);
      if (filtros.desde) params.set('desde', filtros.desde);
      if (filtros.hasta) params.set('hasta', filtros.hasta);
      const res = await fetch(`/api/admin/finanzas/movimientos?${params}`);
      if (!res.ok) throw new Error('No se han podido cargar los movimientos.');
      const json = await res.json();
      setMovimientos(Array.isArray(json.movimientos) ? json.movimientos : []);
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (cause) {
      setMovimientos([]);
      setTotal(null);
      setError(cause instanceof Error ? cause.message : 'No se han podido cargar los movimientos.');
    } finally {
      setLoading(false);
    }
  }

  async function actualizarCategoria(id: string, categoria: string) {
    if (!(CATEGORIAS as readonly string[]).includes(categoria)) return;
    try {
      const res = await fetch(`/api/admin/finanzas/movimientos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // B3: edición explícita únicamente; no crea reglas ni vínculos/conciliaciones automáticos.
        body: JSON.stringify({ categoria }),
      });
      if (!res.ok) throw new Error('No se ha podido guardar la categoría.');
      await fetchMovimientos();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se ha podido guardar la categoría.');
    } finally {
      setEditando(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4" data-testid="b3-movimientos-page">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">Movimientos bancarios</h1>
          <p className="mt-1 text-sm text-gray-700">
            {total === null ? 'Total no disponible' : `${total.toLocaleString('es-ES')} movimientos`}
          </p>
        </div>
        <a href="/admin/finanzas/estado-cuentas" className="inline-flex w-fit rounded-lg border-2 border-slate-700 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2">
          Ver cobertura de extractos
        </a>
      </header>

      {selectedAccount && (
        <BankImportWarnings
          continuidadSaldo={selectedAccount.continuidadSaldo || selectedAccount.cobertura?.continuidadSaldo}
          avisosSaldo={(selectedAccount.avisosSaldo || selectedAccount.cobertura?.avisosSaldo) as any}
          fechaCorteExtracto={selectedAccount.fechaCorteExtracto}
          cuenta={selectedAccount.alias || selectedAccount.banco}
          compact
        />
      )}

      {error && (
        <div role="alert" data-testid="b3-movimientos-error" className="rounded-lg border-2 border-red-700 bg-red-50 p-3 text-sm font-semibold text-red-950">
          {error} Los datos no se sustituyen por ceros.
        </div>
      )}

      <section aria-label="Filtros de movimientos" className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4">
        <FunnelIcon className="h-5 w-5 text-slate-700" aria-hidden="true" />
        <label className="sr-only" htmlFor="cuenta">Cuenta</label>
        <select id="cuenta" data-testid="b3-filter-cuenta" value={filtros.cuentaId} onChange={event => { setFiltros({ ...filtros, cuentaId: event.target.value }); setPage(1); }} className="min-w-0 max-w-full w-full sm:w-auto rounded-lg border-2 border-slate-500 px-3 py-2 text-sm text-slate-950">
          <option value="">Todas las cuentas</option>
          {cuentas.map(cuenta => <option key={cuenta.id || cuenta.banco} value={cuenta.id || ''}>{cuenta.banco}{cuenta.alias ? ` (${cuenta.alias})` : ''}</option>)}
        </select>
        <label className="sr-only" htmlFor="categoria">Categoría</label>
        <select id="categoria" data-testid="b3-filter-categoria" value={filtros.categoria} onChange={event => { setFiltros({ ...filtros, categoria: event.target.value }); setPage(1); }} className="min-w-0 max-w-full w-full sm:w-auto rounded-lg border-2 border-slate-500 px-3 py-2 text-sm text-slate-950">
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(categoria => <option key={categoria} value={categoria}>{categoria}</option>)}
        </select>
        <label className="sr-only" htmlFor="conciliado">Estado de conciliación</label>
        <select id="conciliado" value={filtros.conciliado} onChange={event => { setFiltros({ ...filtros, conciliado: event.target.value }); setPage(1); }} className="min-w-0 max-w-full w-full sm:w-auto rounded-lg border-2 border-slate-500 px-3 py-2 text-sm text-slate-950">
          <option value="">Todos los estados</option>
          <option value="true">Conciliados existentes</option>
          <option value="false">Pendientes existentes</option>
        </select>
        <label className="text-sm font-medium text-slate-900" htmlFor="desde">Desde</label>
        <input id="desde" type="date" value={filtros.desde} onChange={event => { setFiltros({ ...filtros, desde: event.target.value }); setPage(1); }} className="rounded-lg border-2 border-slate-500 px-3 py-2 text-sm text-slate-950" />
        <label className="text-sm font-medium text-slate-900" htmlFor="hasta">Hasta</label>
        <input id="hasta" type="date" value={filtros.hasta} onChange={event => { setFiltros({ ...filtros, hasta: event.target.value }); setPage(1); }} className="rounded-lg border-2 border-slate-500 px-3 py-2 text-sm text-slate-950" />
      </section>

      <section className="overflow-hidden rounded-xl border bg-white" aria-label="Listado de movimientos">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b bg-slate-100 text-slate-950">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Cuenta</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Concepto</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase">Importe</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase">Saldo</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Categoría</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-700">Cargando movimientos…</td></tr>
              ) : error ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-red-900">No hay datos que mostrar debido al error de carga.</td></tr>
              ) : movimientos.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-700">No hay movimientos para este filtro.</td></tr>
              ) : movimientos.map(movimiento => {
                const categoria = legacyLabel(movimiento.categoria, movimiento.catalogo?.categoriaOriginal ?? movimiento.categoriaOriginal, movimiento.catalogo?.categoriaEsLegacy === undefined ? movimiento.categoriaNormalizada : !movimiento.catalogo.categoriaEsLegacy);
                const tipo = legacyLabel(movimiento.tipoPago, movimiento.catalogo?.tipoPagoOriginal ?? movimiento.tipoPagoOriginal, movimiento.catalogo?.tipoPagoEsLegacy === undefined ? movimiento.tipoPagoNormalizado : !movimiento.catalogo.tipoPagoEsLegacy);
                return (
                  <tr key={movimiento.id} className="align-top hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-800">{formatFecha(movimiento.fechaOperacion)}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-950">{movimiento.cuenta?.banco || 'Cuenta no disponible'}</span></td>
                    <td className="max-w-sm px-4 py-3 text-slate-950" title={movimiento.concepto}>{movimiento.concepto}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-bold ${movimiento.importe >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>{formatEUR(movimiento.importe)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-900">{movimiento.saldo === null || movimiento.saldo === undefined ? 'Sin saldo' : formatEUR(movimiento.saldo)}</td>
                    <td className="px-4 py-3">
                      {categoria.isUnknown ? (
                        <span data-testid="b3-categoria-historica" className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-950"><InformationCircleIcon className="h-4 w-4" aria-hidden="true" />Histórico sin normalizar: {categoria.raw || 'Sin categoría'}</span>
                      ) : editando === movimiento.id ? (
                        <select aria-label="Categoría cerrada" defaultValue={movimiento.categoria || ''} onChange={event => void actualizarCategoria(movimiento.id, event.target.value)} onBlur={() => setEditando(null)} autoFocus className="w-full rounded border-2 border-slate-600 px-2 py-1 text-xs text-slate-950">
                          <option value="" disabled>Selecciona categoría</option>
                          {CATEGORIAS.map(item => <option key={item} value={item}>{item}</option>)}
                        </select>
                      ) : (
                        <button type="button" onClick={() => setEditando(movimiento.id)} className="rounded bg-blue-100 px-2 py-1 text-xs font-bold text-blue-950 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-800 focus:ring-offset-2">
                          {movimiento.categoria || 'Sin categoría'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">{tipo.isUnknown ? <span data-testid="b3-tipo-historico" className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-950">Histórico sin normalizar: {tipo.raw || 'Sin tipo'}</span> : <span className="text-xs text-slate-900">{movimiento.tipoPago || 'Sin tipo'}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {total !== null && total > 50 && (
          <nav aria-label="Paginación de movimientos" className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-slate-800">Mostrando {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} de {total}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page === 1} className="rounded border-2 border-slate-700 px-3 py-1 text-sm font-semibold disabled:opacity-50">Anterior</button>
              <button type="button" onClick={() => setPage(current => current + 1)} disabled={page * 50 >= total} className="rounded border-2 border-slate-700 px-3 py-1 text-sm font-semibold disabled:opacity-50">Siguiente</button>
            </div>
          </nav>
        )}
      </section>

      <p className="text-xs text-slate-700">Catálogo cerrado de categorías y tipos. Los valores históricos desconocidos se muestran tal como existen y no se convierten ni crean automáticamente.</p>
      <span className="sr-only" data-testid="b3-closed-types">{TIPOS_PAGO.join('|')}</span>
    </div>
  );
}
