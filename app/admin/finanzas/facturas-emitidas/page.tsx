'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MagnifyingGlassIcon, DocumentTextIcon, CheckBadgeIcon, ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface FacturaEmitida {
  id: string;
  cliente: string;
  cif: string | null;
  numFactura: string;
  serie: string | null;
  fecha: string;
  fechaVencimiento: string | null;
  base: number;
  tipoIva: number;
  importeIva: number;
  total: number;
  concepto: string | null;
  // `estado` and importeCobrado are legacy fiscal metadata; bank collection is below.
  estado: string;
  estadoFiscalLegacy?: string;
  imputacion: string | null;
  formaCobro: string | null;
  importeCobrado: number;
  importeCobradoLegacy?: number | null;
  estadoCobroBanco?: string;
  bankCalculation?: {
    targetCents: number | null;
    paidDocumentaryCents: number | null;
    remainingCents: number | null;
    cashCents: number | null;
    attributableCashDifferenceCents: number | null;
    paymentState: 'COBRADA_CALCULADA' | 'PENDIENTE_COBRO' | 'PENDIENTE_COBRO_REVISION';
    paymentSources: Array<'B4_DIRECTO' | 'B4_REMESA'>;
    reasons: string[];
    unknown: boolean;
  };
}

type ExactMoney = { cents: number | null; exactCents: string | null; unknownInvoiceCount: number };
interface Resumen {
  totalFacturado: ExactMoney;
  totalCobrado: ExactMoney;
  pendienteCobro: ExactMoney;
  diferenciasCaja: { atribuible: ExactMoney; sinAtribuir: ExactMoney };
  count: number;
  cobradasCalculadas: number;
  pendientesCobro: number;
  revisiones: number;
  porEstado: { estado: string; _sum: { totalCents: number | null; exactCents: string | null }; _count: number }[];
}

const ESTADOS = {
  EMITIDA: { label: 'Pendiente de cobro', color: 'bg-blue-100 text-blue-700' },
  PENDIENTE: { label: 'Pendiente de cobro', color: 'bg-blue-100 text-blue-700' },
  COBRADA_PARCIAL: { label: 'Cobro parcial confirmado', color: 'bg-amber-100 text-amber-700' },
  COBRADA: { label: 'Cobrada (banco)', color: 'bg-green-100 text-green-700' },
  VENCIDA: { label: 'Vencida con deuda bancaria', color: 'bg-red-100 text-red-700' },
  PENDIENTE_COBRO_REVISION: { label: 'Pendiente de cobro: requiere revisión bancaria', color: 'bg-amber-100 text-amber-800' },
  ANULADA: { label: 'Anulada fiscal', color: 'bg-gray-100 text-gray-500' },
};

const SERIES = ['CLL', 'INST', 'PROY', 'DRX', 'VOLA'];

export default function FacturasEmitidasPage() {
  const [facturas, setFacturas] = useState<FacturaEmitida[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ estado: '', serie: '', buscar: '', desde: '', hasta: '' });

  useEffect(() => {
    fetchFacturas();
  }, [page, filtros]);

  async function fetchFacturas() {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: '50' });
    if (filtros.estado) params.set('estado', filtros.estado);
    if (filtros.serie) params.set('serie', filtros.serie);
    if (filtros.buscar) params.set('q', filtros.buscar);
    if (filtros.desde) params.set('desde', filtros.desde);
    if (filtros.hasta) params.set('hasta', filtros.hasta);

    const res = await fetch(`/api/admin/finanzas/facturas-emitidas?${params}`);
    const json = await res.json();
    setFacturas(json.facturas || []);
    setTotal(json.total || 0);
    setResumen(json.resumen || null);
    setLoading(false);
  }

  function formatEUR(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  }

  // B7 sends signed, exact cents. Never render null as 0, and do not use Float.
  function formatCents(cents: number | null | undefined) {
    if (!Number.isSafeInteger(cents)) return 'Sin total verificable';
    const sign = cents < 0 ? '-' : '';
    const abs = Math.abs(cents);
    return `${sign}${Math.floor(abs / 100).toLocaleString('es-ES')},${String(abs % 100).padStart(2, '0')} €`;
  }

  function formatMoney(money: ExactMoney | null | undefined) {
    return money ? formatCents(money.cents) : 'Sin total verificable';
  }

  function formatFecha(str: string) {
    return new Date(str).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturas Emitidas</h1>
          <p className="text-sm text-gray-500 mt-1">{total} facturas</p>
        </div>
      </div>

      {/* Reserva la geometría del resumen mientras llega la misma respuesta de servidor. */}
      {(loading || resumen) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="min-h-32 bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">Facturado (fuente FI)</p>
            {resumen ? <><p className="text-xl font-bold text-gray-900">{formatMoney(resumen.totalFacturado)}</p>{resumen.totalFacturado.unknownInvoiceCount > 0 && <p className="mt-1 text-xs text-amber-700">{resumen.totalFacturado.unknownInvoiceCount} sin total verificable</p>}</> : <div aria-busy="true" className="mt-3 h-7 animate-pulse rounded bg-slate-100" />}
          </div>
          <div className="min-h-32 bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">Cobro documental confirmado</p>
            {resumen ? <><p className="text-xl font-bold text-green-600">{formatMoney(resumen.totalCobrado)}</p><p className="mt-1 text-xs text-gray-500">B4/B6; no usa cobro legacy</p></> : <><div aria-busy="true" className="mt-3 h-7 animate-pulse rounded bg-slate-100" /><div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-slate-100" /></>}
          </div>
          <div className="min-h-32 bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">Pendiente no confirmado</p>
            {resumen ? <><p className="text-xl font-bold text-amber-600">{formatMoney(resumen.pendienteCobro)}</p>{resumen.revisiones > 0 && <p className="mt-1 text-xs text-amber-700">{resumen.revisiones} requieren revisión bancaria</p>}</> : <div aria-busy="true" className="mt-3 h-7 animate-pulse rounded bg-slate-100" />}
          </div>
          <div className="min-h-32 bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">Diferencia de caja atribuible</p>
            {resumen ? <><p className="text-xl font-bold text-blue-600">{formatMoney(resumen.diferenciasCaja.atribuible)}</p><p className="mt-1 text-xs text-gray-500">No modifica la deuda documental</p></> : <><div aria-busy="true" className="mt-3 h-7 animate-pulse rounded bg-slate-100" /><div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-slate-100" /></>}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlassIcon className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar cliente, factura, CIF..."
            value={filtros.buscar}
            onChange={(e) => { setFiltros({...filtros, buscar: e.target.value}); setPage(1); }}
            className="min-h-11 w-full border rounded-lg pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={filtros.estado}
          onChange={(e) => { setFiltros({...filtros, estado: e.target.value}); setPage(1); }}
          className="min-h-11 border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={filtros.serie}
          onChange={(e) => { setFiltros({...filtros, serie: e.target.value}); setPage(1); }}
          className="min-h-11 border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todas las series</option>
          {SERIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="date"
          value={filtros.desde}
          onChange={(e) => { setFiltros({...filtros, desde: e.target.value}); setPage(1); }}
          className="min-h-11 border rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={filtros.hasta}
          onChange={(e) => { setFiltros({...filtros, hasta: e.target.value}); setPage(1); }}
          className="min-h-11 border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nº Factura</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Base</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">IVA</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cobro</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">Rentabilidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              ) : facturas.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  <DocumentTextIcon className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                  No hay facturas emitidas. Importa desde ISP Gestión o crea manualmente.
                </td></tr>
              ) : (
                facturas.map(f => {
                  const estadoBanco = f.estadoCobroBanco || 'PENDIENTE_COBRO_REVISION';
                  const estadoInfo = ESTADOS[estadoBanco as keyof typeof ESTADOS] || { label: estadoBanco, color: 'bg-gray-100 text-gray-600' };
                  const calculo = f.bankCalculation;
                  return (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <span className="text-sm font-medium text-gray-900">{f.numFactura}</span>
                        {f.serie && <span className="ml-1 text-xs text-gray-400">{f.serie}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-sm text-gray-900 truncate max-w-[200px]">{f.cliente}</p>
                        {f.cif && <p className="text-xs text-gray-400">{f.cif}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                        {formatFecha(f.fecha)}
                        {f.fechaVencimiento && (
                          <p className="text-gray-400">Venc: {formatFecha(f.fechaVencimiento)}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-700">{formatEUR(f.base)}</td>
                      <td className="px-4 py-2.5 text-xs text-right text-gray-500">{formatEUR(f.importeIva)}</td>
                      <td className="px-4 py-2.5 text-sm font-medium text-right text-gray-900">
                        {calculo ? formatCents(calculo.targetCents) : 'Sin total verificable'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${estadoInfo.color}`}>
                          {estadoInfo.label}
                        </span>
                        {(f.estadoFiscalLegacy || f.estado) === 'ANULADA' && estadoBanco !== 'ANULADA' && (
                          <p className="mt-1 text-xs text-gray-500">Anulada fiscal (metadato)</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {!calculo || calculo.unknown ? (
                          <p className="text-xs text-amber-700">Sin total verificable</p>
                        ) : (
                          <>
                            <p className="text-xs text-gray-700">Documental: {formatCents(calculo.paidDocumentaryCents)}</p>
                            {estadoBanco === 'COBRADA_PARCIAL' && (
                              <p className="text-xs text-amber-700">Resto: {formatCents(calculo.remainingCents)}</p>
                            )}
                            {calculo.paymentSources.length > 0 && <p className="text-xs text-gray-500">{calculo.paymentSources.join(' + ')}</p>}
                          </>
                        )}
                        {estadoBanco === 'PENDIENTE_COBRO_REVISION' && <p className="mt-1 text-xs text-amber-800">Requiere revisión bancaria</p>}
                        {f.formaCobro && <p className="mt-1 text-xs text-gray-400">Forma legacy: {f.formaCobro}</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        {(f.estadoFiscalLegacy || f.estado) === 'ANULADA' ? <span className="text-xs text-slate-600">Anulada fiscal</span> : <Link href={`/admin/finanzas/analitica-costes?ventaId=${encodeURIComponent(f.id)}`} className="inline-flex whitespace-nowrap rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-700">Relacionar compras</Link>}
                      </td>
                    </tr>
                  );
                })
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
                className="min-h-11 px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * 50 >= total}
                className="min-h-11 px-3 py-1 text-sm border rounded disabled:opacity-50"
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
