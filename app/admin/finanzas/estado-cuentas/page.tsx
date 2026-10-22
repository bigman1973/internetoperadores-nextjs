'use client';

import { useEffect, useState } from 'react';
import { ArrowPathIcon, CalendarDaysIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import BankImportWarnings, { balanceContinuityLabel, type AvisoSaldo, type ContinuidadSaldo } from '@/components/finanzas/BankImportWarnings';

interface EstadoCuenta {
  id?: string;
  banco: string;
  alias?: string | null;
  activa: boolean;
  ultimoMovimiento: string | null;
  primerMovimiento?: string | null;
  totalMovimientos?: number | null;
  fechaCorteExtracto?: string | null;
  continuidadSaldo?: ContinuidadSaldo | null;
  avisosSaldo?: AvisoSaldo[] | null;
  saldoCorte?: number | null;
  saldoActual?: number | null;
  fechaSaldo?: string | null;
  cobertura?: { continuidadSaldo?: ContinuidadSaldo | null; avisosSaldo?: AvisoSaldo[] | null };
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin datos';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Sin saldo disponible';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}

export default function EstadoCuentasPage() {
  const [cuentas, setCuentas] = useState<EstadoCuenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/finanzas/estado-cuentas');
      if (!response.ok) throw new Error('No se ha podido obtener el estado de las cuentas.');
      const payload = await response.json();
      setCuentas(Array.isArray(payload.estadoCuentas) ? payload.estadoCuentas : []);
    } catch (cause) {
      setCuentas([]);
      setError(cause instanceof Error ? cause.message : 'No se ha podido obtener el estado de las cuentas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div className="p-4 sm:p-6 space-y-4" data-testid="b3-estado-cuentas-page">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">Estado de extractos por cuenta</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-800">
            Consulta hasta qué fecha se han importado movimientos del banco. La fecha del extracto y la comprobación de sus saldos son datos distintos: no es un cierre contable manual ni una fecha de sincronización.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex w-fit items-center gap-2 rounded-lg border-2 border-slate-700 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-100 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2">
          <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Actualizar
        </button>
      </header>

      <div className="rounded-lg border-2 border-blue-700 bg-blue-50 p-4 text-sm text-blue-950">
        <p className="font-bold">Cómo leer esta vista</p>
        <p className="mt-1">La fecha de cobertura indica el último movimiento importado; no prueba que el saldo encadene. Si falta saldo, el orden es ambiguo o hay un hueco, no se inventa un saldo ni se presenta la cuenta como cuadrada. El saldo conocido conserva su propia fecha.</p>
      </div>

      {error && (
        <div role="alert" data-testid="b3-estado-cuentas-error" className="flex gap-2 rounded-lg border-2 border-red-700 bg-red-50 p-4 text-red-950">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="text-sm font-bold">{error} No se muestran importes sustituidos por cero.</p>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-800">Cargando estado de extractos…</div>
      ) : error ? null : cuentas.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-800">No hay cuentas o extractos disponibles.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {cuentas.map((cuenta, index) => {
            const identity = cuenta.alias || cuenta.banco;
            const continuity = cuenta.continuidadSaldo || cuenta.cobertura?.continuidadSaldo || 'SIN_SALDO';
            const warnings = cuenta.avisosSaldo || cuenta.cobertura?.avisosSaldo;
            return (
              <article key={cuenta.id || `${cuenta.banco}-${index}`} data-testid={`b3-cuenta-${index}`} className="rounded-xl border-2 border-slate-300 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CalendarDaysIcon className="h-6 w-6 text-slate-800" aria-hidden="true" />
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">{identity}</h2>
                      {cuenta.alias && <p className="text-xs text-slate-700">{cuenta.banco}</p>}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${cuenta.activa ? 'bg-emerald-100 text-emerald-950' : 'bg-slate-200 text-slate-900'}`}>{cuenta.activa ? 'ACTIVA' : 'INACTIVA'}</span>
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded bg-slate-100 p-3">
                    <dt className="font-semibold text-slate-800">Hasta qué fecha hay movimientos</dt>
                    <dd data-testid="b3-fecha-corte" className="mt-1 font-bold text-slate-950">{formatDate(cuenta.fechaCorteExtracto)}</dd>
                    <p className="mt-1 text-xs text-slate-700">Cobertura del extracto importado</p>
                  </div>
                  <div className="rounded bg-slate-100 p-3">
                    <dt className="font-semibold text-slate-800">Último movimiento importado</dt>
                    <dd className="mt-1 font-bold text-slate-950">{formatDate(cuenta.ultimoMovimiento)}</dd>
                    <p className="mt-1 text-xs text-slate-700">Referencia cronológica del listado bancario</p>
                  </div>
                  <div className="rounded bg-slate-100 p-3">
                    <dt className="font-semibold text-slate-800">Último saldo conocido</dt>
                    <dd className="mt-1 font-bold text-slate-950">{formatMoney(cuenta.saldoActual ?? cuenta.saldoCorte)}</dd>
                    <p className="mt-1 text-xs text-slate-700">Fecha del saldo: {formatDate(cuenta.fechaSaldo)}</p>
                  </div>
                  <div className="rounded bg-slate-100 p-3">
                    <dt className="font-semibold text-slate-800">Movimientos registrados</dt>
                    <dd className="mt-1 font-bold text-slate-950">{cuenta.totalMovimientos === null || cuenta.totalMovimientos === undefined ? 'Sin datos' : cuenta.totalMovimientos.toLocaleString('es-ES')}</dd>
                    <p className="mt-1 text-xs text-slate-700">Estado: {balanceContinuityLabel(continuity)}</p>
                  </div>
                </dl>

                <div className="mt-4">
                  <BankImportWarnings continuidadSaldo={continuity} avisosSaldo={warnings} fechaCorteExtracto={cuenta.fechaCorteExtracto} cuenta={identity} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
