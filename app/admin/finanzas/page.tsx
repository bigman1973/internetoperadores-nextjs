'use client';

import { useState, useEffect } from 'react';
import { BanknotesIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon, ExclamationTriangleIcon, DocumentTextIcon, CreditCardIcon } from '@heroicons/react/24/outline';

interface DashboardData {
  periodo: { year: number; trimestre: number | null; desde: string; hasta: string };
  saldos: { cuentas: any[]; total: number };
  fiscal: { ivaSoportado: number; ivaRepercutido: number; ivaAPagar: number; irpfRetenido: number; irpfNominas: number; irpfTotal: number; ssEmpresaNominas: number; ssTrabajadorNominas: number; mesesConNominas: number; baseImponibleCompras: number; totalCompras: number; baseImponibleVentas: number; totalVentas: number };
  ventas: { totalFacturado: number; totalCobrado: number; pendienteCobro: number; numFacturas: number; porEstado: Record<string, { count: number; total: number }> };
  flujo: { ingresos: number; gastos: number; salidas: number; neto: number; porMes: Record<string, { ingresos: number; gastos: number }>; desgloseSalidas: { gastosOperativos: number; mayoristas: number; nominas: number; impuestos: number; devoluciones: number; transferenciasInternas: number; otros: number } };
  categorias: Record<string, { ingresos: number; gastos: number; count: number }>;
  gastosPorTipo: Record<string, number>;
  conciliacion: { totalMovimientos: number; conciliados: number; pendientes: number; sinCategorizar: number; porcentajeConciliado: number };
  alertas: { facturasPendientes: number; facturasImpagadas: number; facturasVencidas: number; movimientosSinCategorizar: number };
}

export default function FinanzasDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(2026);
  const [trimestre, setTrimestre] = useState<string>('');
  const [detalleCategoria, setDetalleCategoria] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, [year, trimestre]);

  async function fetchDashboard() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: year.toString() });
      if (trimestre) params.set('trimestre', trimestre);
      const res = await fetch(`/api/admin/finanzas/dashboard?${params}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  function formatEUR(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
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

  if (!data) return <div className="p-8 text-gray-500">Error cargando dashboard</div>;

  // Ordenar categorías de gastos por importe
  const categoriasOrdenadas = Object.entries(data.categorias)
    .filter(([, v]) => v.gastos > 0)
    .sort((a, b) => b[1].gastos - a[1].gastos);

  // Ordenar gastos por tipo
  const tiposGastoOrdenados = Object.entries(data.gastosPorTipo || {})
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="p-6 space-y-6">
      {/* Header con filtros */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Control Financiero</h1>
        <div className="flex gap-2">
          <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="border rounded-lg px-3 py-1.5 text-sm">
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
          <select value={trimestre} onChange={e => setTrimestre(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
            <option value="">Todo el año</option>
            <option value="1">T1 (Ene-Mar)</option>
            <option value="2">T2 (Abr-Jun)</option>
            <option value="3">T3 (Jul-Sep)</option>
            <option value="4">T4 (Oct-Dic)</option>
          </select>
        </div>
      </div>

      {/* Alertas */}
      {(data.alertas.facturasPendientes > 0 || data.alertas.facturasImpagadas > 0 || data.alertas.facturasVencidas > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div className="flex gap-4 text-sm text-amber-800">
            {data.alertas.facturasPendientes > 0 && <span>{data.alertas.facturasPendientes} facturas pendientes de revisión</span>}
            {data.alertas.facturasImpagadas > 0 && <span className="text-red-700 font-medium">{data.alertas.facturasImpagadas} facturas impagadas</span>}
            {data.alertas.facturasVencidas > 0 && <span className="text-red-700">{data.alertas.facturasVencidas} facturas vencidas sin cobrar</span>}
            {data.alertas.movimientosSinCategorizar > 0 && <span>{data.alertas.movimientosSinCategorizar} movimientos sin categorizar</span>}
          </div>
        </div>
      )}

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <BanknotesIcon className="h-4 w-4 text-gray-400" />
            <p className="text-xs text-gray-500">Saldo Total</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatEUR(data.saldos.total)}</p>
          <div className="mt-2 space-y-1">
            {data.saldos.cuentas.map(c => (
              <div key={c.id} className="flex justify-between text-xs">
                <span className="text-gray-500">{c.banco}</span>
                <span className="text-gray-700">{c.saldo ? formatEUR(c.saldo) : '—'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowTrendingUpIcon className="h-4 w-4 text-green-500" />
            <p className="text-xs text-gray-500">Ingresos</p>
          </div>
          <p className="text-xl font-bold text-green-600">{formatEUR(data.flujo.ingresos)}</p>
          <p className="text-xs text-gray-400 mt-1">Neto: {formatEUR(data.flujo.neto)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowTrendingDownIcon className="h-4 w-4 text-red-500" />
            <p className="text-xs text-gray-500">Salidas</p>
          </div>
          <p className="text-xl font-bold text-red-600">{formatEUR(data.flujo.salidas)}</p>
          <p className="text-xs text-gray-400 mt-1">{data.conciliacion.totalMovimientos} movimientos</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <DocumentTextIcon className="h-4 w-4 text-blue-500" />
            <p className="text-xs text-gray-500">Facturado</p>
          </div>
          <p className="text-xl font-bold text-blue-600">{formatEUR(data.ventas.totalFacturado)}</p>
          <p className="text-xs text-amber-600 mt-1">Pte cobro: {formatEUR(data.ventas.pendienteCobro)}</p>
        </div>
      </div>

      {/* Desglose de Salidas */}
      {data.flujo.desgloseSalidas && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Desglose de Salidas</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: 'Gastos Operativos', key: 'gastosOperativos', value: data.flujo.desgloseSalidas.gastosOperativos, color: 'text-red-700', bg: 'hover:bg-red-50' },
              { label: 'Mayoristas', key: 'mayoristas', value: data.flujo.desgloseSalidas.mayoristas, color: 'text-purple-700', bg: 'hover:bg-purple-50' },
              { label: 'Nóminas', key: 'nominas', value: data.flujo.desgloseSalidas.nominas, color: 'text-blue-700', bg: 'hover:bg-blue-50' },
              { label: 'Impuestos', key: 'impuestos', value: data.flujo.desgloseSalidas.impuestos, color: 'text-orange-700', bg: 'hover:bg-orange-50' },
              { label: 'Devoluciones', key: 'devoluciones', value: data.flujo.desgloseSalidas.devoluciones, color: 'text-amber-700', bg: 'hover:bg-amber-50' },
              { label: 'Transf. Internas', key: 'transferenciasInternas', value: data.flujo.desgloseSalidas.transferenciasInternas, color: 'text-gray-500', bg: 'hover:bg-gray-50' },
              { label: 'Otros', key: 'otros', value: data.flujo.desgloseSalidas.otros, color: 'text-gray-700', bg: 'hover:bg-gray-100' },
            ].map(item => (
              <div
                key={item.label}
                className={`text-center cursor-pointer rounded-lg p-2 transition-all ${item.bg} ${detalleCategoria === item.key ? 'ring-2 ring-offset-1 ring-blue-400 bg-blue-50' : ''}`}
                onClick={() => setDetalleCategoria(detalleCategoria === item.key ? null : item.key)}
              >
                <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                <p className={`text-sm font-bold ${item.color}`}>{formatEUR(item.value)}</p>
                <p className="text-[10px] text-gray-400">
                  {data.flujo.salidas > 0 ? ((item.value / data.flujo.salidas) * 100).toFixed(1) : 0}%
                </p>
              </div>
            ))}
          </div>

          {/* Detalle de la categoría seleccionada */}
          {detalleCategoria && (
            <div className="mt-4 pt-4 border-t">
              <DetalleCategoriaSalidas
                categoria={detalleCategoria}
                categorias={data.categorias}
              />
            </div>
          )}
        </div>
      )}

      {/* Fiscal: IVA + IRPF + Ventas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* IVA */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Liquidación IVA</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">IVA Repercutido (ventas)</span>
              <span className="font-medium text-green-700">{formatEUR(data.fiscal.ivaRepercutido)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">IVA Soportado (compras)</span>
              <span className="font-medium text-red-700">-{formatEUR(data.fiscal.ivaSoportado)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between text-sm font-bold">
              <span>IVA a pagar</span>
              <span className={data.fiscal.ivaAPagar >= 0 ? 'text-red-700' : 'text-green-700'}>
                {formatEUR(data.fiscal.ivaAPagar)}
              </span>
            </div>
          </div>
        </div>

        {/* IRPF - Modelo 111 */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">IRPF - Modelo 111</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">IRPF Facturas (profesionales)</span>
              <span className="font-medium text-orange-700">{formatEUR(data.fiscal.irpfRetenido)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">IRPF Nóminas ({data.fiscal.mesesConNominas} meses)</span>
              <span className="font-medium text-orange-700">{formatEUR(data.fiscal.irpfNominas)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between text-sm font-bold">
              <span>IRPF Total a pagar</span>
              <span className="text-red-700">{formatEUR(data.fiscal.irpfTotal)}</span>
            </div>
            {data.fiscal.mesesConNominas === 0 && (
              <p className="text-xs text-amber-600 mt-1">Sin datos de nóminas para este periodo</p>
            )}
          </div>
        </div>

        {/* Ventas */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Facturas Emitidas</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total facturado ({data.ventas.numFacturas} facturas)</span>
              <span className="font-medium">{formatEUR(data.ventas.totalFacturado)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Cobrado</span>
              <span className="font-medium text-green-700">{formatEUR(data.ventas.totalCobrado)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Pendiente de cobro</span>
              <span className="font-medium text-amber-700">{formatEUR(data.ventas.pendienteCobro)}</span>
            </div>
            {Object.entries(data.ventas.porEstado).length > 0 && (
              <div className="border-t pt-2 flex flex-wrap gap-2">
                {Object.entries(data.ventas.porEstado).map(([estado, info]) => (
                  <span key={estado} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {estado}: {info.count}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Flujo mensual */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Flujo de Caja Mensual</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-xs text-gray-500">Mes</th>
                <th className="text-right py-2 text-xs text-gray-500">Ingresos</th>
                <th className="text-right py-2 text-xs text-gray-500">Salidas</th>
                <th className="text-right py-2 text-xs text-gray-500">Neto</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.flujo.porMes).sort().map(([mes, vals]) => (
                <tr key={mes} className="border-b border-gray-50">
                  <td className="py-2 text-gray-700">{mes}</td>
                  <td className="py-2 text-right text-green-700">{formatEUR(vals.ingresos)}</td>
                  <td className="py-2 text-right text-red-700">{formatEUR(vals.gastos)}</td>
                  <td className={`py-2 text-right font-medium ${vals.ingresos - vals.gastos >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatEUR(vals.ingresos - vals.gastos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Salidas por categoría y por tipo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Por categoría */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Salidas por Categoría</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {categoriasOrdenadas.map(([cat, vals]) => {
              const pct = data.flujo.salidas > 0 ? (vals.gastos / data.flujo.salidas * 100) : 0;
              return (
                <div key={cat} className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-700">{cat}</span>
                      <span className="text-gray-500">{formatEUR(vals.gastos)} ({pct.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Por tipo de pago */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Salidas por Tipo de Pago</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {tiposGastoOrdenados.map(([tipo, importe]) => {
              const pct = data.flujo.salidas > 0 ? (importe / data.flujo.salidas * 100) : 0;
              return (
                <div key={tipo} className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-700">{tipo}</span>
                      <span className="text-gray-500">{formatEUR(importe)} ({pct.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Conciliación */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Estado de Conciliación</h3>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">Total movimientos</p>
            <p className="text-lg font-bold">{data.conciliacion.totalMovimientos}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Conciliados</p>
            <p className="text-lg font-bold text-green-600">{data.conciliacion.conciliados}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Pendientes</p>
            <p className="text-lg font-bold text-amber-600">{data.conciliacion.pendientes}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">% Conciliado</p>
            <p className="text-lg font-bold text-blue-600">{data.conciliacion.porcentajeConciliado}%</p>
          </div>
        </div>
        <div className="mt-3 w-full bg-gray-200 rounded-full h-3">
          <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${data.conciliacion.porcentajeConciliado}%` }}></div>
        </div>
      </div>
    </div>
  );
}

// Mapeo de categorías del desglose a categorías de movimientos bancarios
const CATEGORIAS_MAP: Record<string, { titulo: string; categorias: string[] }> = {
  gastosOperativos: {
    titulo: 'Gastos Operativos',
    categorias: ['Estructura', 'Gastos Financieros', 'Oros Gastos', 'Otros Gastos', 'Proyectos Singulares', 'Dietas', 'Desplazamientos'],
  },
  mayoristas: {
    titulo: 'Mayoristas (Operadoras)',
    categorias: ['Operadora', 'Vola', 'Comisiones V-Valley'],
  },
  nominas: {
    titulo: 'N\u00f3minas',
    categorias: ['Sueldos y Salarios'],
  },
  impuestos: {
    titulo: 'Impuestos',
    categorias: ['IMPUESTOS'],
  },
  devoluciones: {
    titulo: 'Devoluciones',
    categorias: ['Morosos'],
  },
  transferenciasInternas: {
    titulo: 'Transferencias Internas',
    categorias: ['Traspaso'],
  },
  otros: {
    titulo: 'Otros (sin categorizar)',
    categorias: [],
  },
};

function DetalleCategoriaSalidas({ categoria, categorias }: { categoria: string; categorias: Record<string, { ingresos: number; gastos: number; count: number }> }) {
  const config = CATEGORIAS_MAP[categoria];
  if (!config) return null;

  // Filtrar las categorías de movimientos que corresponden a este grupo
  let items: { nombre: string; importe: number; count: number }[] = [];

  if (categoria === 'otros') {
    // "Otros" = todas las categorías que NO están en ningún otro grupo
    const todasAsignadas = Object.values(CATEGORIAS_MAP)
      .filter(c => c.categorias.length > 0)
      .flatMap(c => c.categorias);
    items = Object.entries(categorias)
      .filter(([cat]) => !todasAsignadas.includes(cat))
      .filter(([, vals]) => vals.gastos > 0)
      .map(([cat, vals]) => ({ nombre: cat, importe: vals.gastos, count: vals.count }))
      .sort((a, b) => b.importe - a.importe);
  } else {
    items = config.categorias
      .map(cat => {
        const vals = categorias[cat];
        return vals ? { nombre: cat, importe: vals.gastos, count: vals.count } : null;
      })
      .filter((x): x is { nombre: string; importe: number; count: number } => x !== null && x.importe > 0)
      .sort((a, b) => b.importe - a.importe);
  }

  const total = items.reduce((s, i) => s + i.importe, 0);

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-800 mb-2">{config.titulo} — Detalle</h4>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400">No hay movimientos en esta categor\u00eda</p>
      ) : (
        <div className="space-y-1.5">
          {items.map(item => {
            const pct = total > 0 ? (item.importe / total * 100) : 0;
            return (
              <div key={item.nombre} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-700">{item.nombre}</span>
                    <span className="text-gray-500">{formatEUR(item.importe)} ({pct.toFixed(1)}%) — {item.count} mov.</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mt-0.5">
                    <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }}></div>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex justify-between text-xs font-semibold pt-2 border-t mt-2">
            <span>Total</span>
            <span>{formatEUR(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
