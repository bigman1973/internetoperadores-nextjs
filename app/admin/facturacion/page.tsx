'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface FacturaResumen {
  id: number
  serieFactura: string
  numeroDocumento: string
  documento: string | null
  fecha: string
  codigoCliente: string
  nombreCompleto: string
  nifCif: string | null
  base: number
  totalImpuesto: number
  total: number
  situacion: string
  totalPendiente: number
}

interface RemesaResumen {
  id: number
  nombre: string
  fecha: string
  totalImporte: number
  numeroRegistros: number
  remesado: boolean
  contabilizado: boolean
  ibanAcreedor: string | null
}

interface ResumenMensual {
  mes: string
  totalFacturado: number
  numFacturas: number
  vvalleyFacturado: number
  vvalleyNumFacturas: number
  arrowFacturado: number
  arrowNumFacturas: number
  ipsNorteFacturado: number
  ipsNorteNumFacturas: number
  mayoristasTotal: number
  mayoristasPorcentaje: number
  vvalleyPorcentaje: number
  totalRemesado: number
  numRemesas: number
}

const formatCurrency = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const getMesLabel = (mes: string) =>
  new Date(mes + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

const getMesShort = (mes: string) =>
  new Date(mes + '-01').toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')

export default function FacturacionPage() {
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [activeView, setActiveView] = useState<'facturas' | 'remesas'>('facturas')
  const [data, setData] = useState<any>(null)
  const [facturasFilter, setFacturasFilter] = useState<'todas' | 'cobradas' | 'pendientes'>('todas')
  const [searchTerm, setSearchTerm] = useState('')
  const [serieFilter, setSerieFilter] = useState('')
  const [mesFilter, setMesFilter] = useState('')
  const [serieMesFilter, setSerieMesFilter] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/facturacion')
      if (!res.ok) throw new Error('Error al cargar datos')
      const result = await res.json()
      setData(result)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/sync-facturas', { method: 'POST' })
      const result = await res.json()
      if (result.success) {
        await fetchData()
        alert(`Sincronización completada:\n- ${result.facturas?.upserted || 0} facturas sincronizadas\n- ${result.remesas?.upserted || 0} remesas sincronizadas`)
      } else {
        alert('Error en la sincronización: ' + (result.error || 'Error desconocido'))
      }
    } catch (err) {
      alert('Error de conexión al sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  const stats = data?.stats || {}
  const facturas: FacturaResumen[] = data?.facturas || []
  const remesas: RemesaResumen[] = data?.remesas || []
  const porMes = data?.porMes || []
  const porSerie = data?.porSerie || []
  const resumenMensual: ResumenMensual[] = data?.resumenMensual || []

  // Filtrar facturas
  const filteredFacturas = facturas.filter(f => {
    if (facturasFilter === 'cobradas' && f.situacion !== 'COBRADA') return false
    if (facturasFilter === 'pendientes' && f.situacion !== 'PENDIENTE') return false
    if (searchTerm && !f.nombreCompleto.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !f.documento?.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !f.codigoCliente.includes(searchTerm)) return false
    if (serieFilter && f.serieFactura !== serieFilter) return false
    if (mesFilter && !f.fecha.startsWith(mesFilter)) return false
    return true
  })

  // Calcular totales del resumen
  const totalAnualFacturado = resumenMensual.reduce((s, m) => s + m.totalFacturado, 0)
  const totalAnualVValley = resumenMensual.reduce((s, m) => s + m.vvalleyFacturado, 0)
  const totalAnualArrow = resumenMensual.reduce((s, m) => s + m.arrowFacturado, 0)
  const totalAnualIpsNorte = resumenMensual.reduce((s, m) => s + m.ipsNorteFacturado, 0)
  const totalAnualMayoristas = resumenMensual.reduce((s, m) => s + m.mayoristasTotal, 0)
  const totalAnualRemesado = resumenMensual.reduce((s, m) => s + m.totalRemesado, 0)

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturación y Remesas</h1>
          <p className="text-sm text-gray-500 mt-1">Ejercicio 2026 - Datos sincronizados desde ISP Gestión</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-2 self-start sm:self-auto"
        >
          {syncing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Sincronizando...
            </>
          ) : (
            <>&#x21BB; Sincronizar ISP Gestión</>
          )}
        </button>
      </div>

      {/* Dashboard KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 lg:gap-4 mb-6">
        <div className="rounded-lg bg-white shadow border border-gray-200 px-2 sm:px-3 lg:px-4 py-3 lg:py-4 overflow-hidden">
          <dt className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Total Facturas</dt>
          <dd className="mt-1 text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">{stats.totalFacturas || 0}</dd>
        </div>
        <div className="rounded-lg bg-white shadow border border-gray-200 px-2 sm:px-3 lg:px-4 py-3 lg:py-4 overflow-hidden">
          <dt className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Facturado</dt>
          <dd className="mt-1 text-sm sm:text-base lg:text-xl font-bold text-gray-900">
            {formatCurrency(stats.totalFacturado || 0)}&euro;
          </dd>
        </div>
        <div className="rounded-lg bg-white shadow border border-gray-200 px-2 sm:px-3 lg:px-4 py-3 lg:py-4 overflow-hidden">
          <dt className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Cobrado</dt>
          <dd className="mt-1 text-sm sm:text-base lg:text-xl font-bold text-green-600">
            {formatCurrency(stats.totalCobrado || 0)}&euro;
          </dd>
        </div>
        <div className="rounded-lg bg-white shadow border border-gray-200 px-2 sm:px-3 lg:px-4 py-3 lg:py-4 overflow-hidden">
          <dt className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Pendiente</dt>
          <dd className="mt-1 text-sm sm:text-base lg:text-xl font-bold text-yellow-600">
            {formatCurrency(stats.totalPendiente || 0)}&euro;
          </dd>
        </div>
        <div className="rounded-lg bg-white shadow border border-gray-200 px-2 sm:px-3 lg:px-4 py-3 lg:py-4 overflow-hidden">
          <dt className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Total Remesas</dt>
          <dd className="mt-1 text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">{stats.totalRemesas || 0}</dd>
        </div>
        <div className="rounded-lg bg-white shadow border border-gray-200 px-2 sm:px-3 lg:px-4 py-3 lg:py-4 overflow-hidden">
          <dt className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Remesado</dt>
          <dd className="mt-1 text-sm sm:text-base lg:text-xl font-bold text-blue-600">
            {formatCurrency(stats.totalRemesado || 0)}&euro;
          </dd>
        </div>
      </div>

      {/* Resumen Mensual Unificado */}
      {resumenMensual.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-200 mb-6 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Resumen Mensual 2026</h3>
            <p className="text-xs text-gray-500 mt-0.5">Facturación total, mayoristas (V-Valley + Arrow + IPS Norte) y remesas por mes</p>
          </div>

          {/* Vista Desktop: Tabla */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Mes</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Facturación Total</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Fact.</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-purple-600 uppercase tracking-wider">V-Valley</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-indigo-600 uppercase tracking-wider">Arrow</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-teal-600 uppercase tracking-wider">IPS Norte</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-purple-600 uppercase tracking-wider">% Mayoristas</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-blue-600 uppercase tracking-wider">Remesado</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Rem.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resumenMensual.map((m) => {
                  const maxTotal = Math.max(...resumenMensual.map(x => x.totalFacturado))
                  const barPct = maxTotal > 0 ? (m.totalFacturado / maxTotal) * 100 : 0
                  return (
                    <tr key={m.mes} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900 capitalize">{getMesLabel(m.mes)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <div className="w-24 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className="bg-orange-500 h-full rounded-full" style={{ width: `${barPct}%` }} />
                          </div>
                          <span className="text-sm font-bold text-gray-900 tabular-nums min-w-[100px] text-right">
                            {formatCurrency(m.totalFacturado)}&euro;
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-gray-500">{m.numFacturas}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {m.vvalleyFacturado > 0 ? (
                          <span className="text-sm font-semibold text-purple-700 tabular-nums">
                            {formatCurrency(m.vvalleyFacturado)}&euro;
                          </span>
                        ) : (
                          <span className="text-sm text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {m.arrowFacturado > 0 ? (
                          <span className="text-sm font-semibold text-indigo-700 tabular-nums">
                            {formatCurrency(m.arrowFacturado)}&euro;
                          </span>
                        ) : (
                          <span className="text-sm text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {m.ipsNorteFacturado > 0 ? (
                          <span className="text-sm font-semibold text-teal-700 tabular-nums">
                            {formatCurrency(m.ipsNorteFacturado)}&euro;
                          </span>
                        ) : (
                          <span className="text-sm text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {m.mayoristasPorcentaje > 0 ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                            m.mayoristasPorcentaje > 20 ? 'bg-red-100 text-red-700' :
                            m.mayoristasPorcentaje > 10 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {m.mayoristasPorcentaje.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {m.totalRemesado > 0 ? (
                          <span className="text-sm font-semibold text-blue-700 tabular-nums">
                            {formatCurrency(m.totalRemesado)}&euro;
                          </span>
                        ) : (
                          <span className="text-sm text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-gray-500">{m.numRemesas || '-'}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-4 py-3">
                    <span className="text-sm font-bold text-gray-900">TOTAL 2026</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-gray-900 tabular-nums">
                      {formatCurrency(totalAnualFacturado)}&euro;
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-semibold text-gray-600">{stats.totalFacturas}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-purple-700 tabular-nums">
                      {formatCurrency(totalAnualVValley)}&euro;
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-indigo-700 tabular-nums">
                      {formatCurrency(totalAnualArrow)}&euro;
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-teal-700 tabular-nums">
                      {formatCurrency(totalAnualIpsNorte)}&euro;
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                      (stats.mayoristasPorcentaje || 0) > 20 ? 'bg-red-100 text-red-700' :
                      (stats.mayoristasPorcentaje || 0) > 10 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {(stats.mayoristasPorcentaje || 0).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-blue-700 tabular-nums">
                      {formatCurrency(totalAnualRemesado)}&euro;
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-semibold text-gray-600">{stats.totalRemesas}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Vista Mobile: Cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {resumenMensual.map((m) => {
              const maxTotal = Math.max(...resumenMensual.map(x => x.totalFacturado))
              const barPct = maxTotal > 0 ? (m.totalFacturado / maxTotal) * 100 : 0
              return (
                <div key={m.mes} className="px-4 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-900 capitalize">{getMesLabel(m.mes)}</span>
                    <span className="text-xs text-gray-500">{m.numFacturas} fact.</span>
                  </div>

                  {/* Barra de facturación total */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500 uppercase font-medium">Facturación</span>
                      <span className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(m.totalFacturado)}&euro;</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div className="bg-orange-500 h-full rounded-full" style={{ width: `${barPct}%` }} />
                    </div>
                  </div>

                  {/* Mayoristas */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-purple-600 uppercase font-medium">V-Valley</span>
                    </div>
                    <span className="text-sm font-semibold text-purple-700 tabular-nums">
                      {m.vvalleyFacturado > 0 ? `${formatCurrency(m.vvalleyFacturado)}€` : '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-indigo-600 uppercase font-medium">Arrow</span>
                    </div>
                    <span className="text-sm font-semibold text-indigo-700 tabular-nums">
                      {m.arrowFacturado > 0 ? `${formatCurrency(m.arrowFacturado)}€` : '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-teal-600 uppercase font-medium">IPS Norte</span>
                      {m.mayoristasPorcentaje > 0 && (
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          m.mayoristasPorcentaje > 20 ? 'bg-red-100 text-red-700' :
                          m.mayoristasPorcentaje > 10 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {m.mayoristasPorcentaje.toFixed(1)}% may.
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-teal-700 tabular-nums">
                      {m.ipsNorteFacturado > 0 ? `${formatCurrency(m.ipsNorteFacturado)}€` : '-'}
                    </span>
                  </div>

                  {/* Remesado */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-blue-600 uppercase font-medium">Remesado</span>
                      {m.numRemesas > 0 && (
                        <span className="text-[10px] text-gray-400">{m.numRemesas} rem.</span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-blue-700 tabular-nums">
                      {m.totalRemesado > 0 ? `${formatCurrency(m.totalRemesado)}€` : '-'}
                    </span>
                  </div>
                </div>
              )
            })}

            {/* Total mobile */}
            <div className="px-4 py-4 bg-gray-50 space-y-2">
              <span className="text-sm font-bold text-gray-900">TOTAL 2026</span>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase">Facturado</p>
                  <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(totalAnualFacturado)}&euro;</p>
                </div>
                <div>
                  <p className="text-[10px] text-purple-500 uppercase">Mayoristas</p>
                  <p className="text-sm font-bold text-purple-700 tabular-nums">{formatCurrency(totalAnualMayoristas)}&euro;</p>
                  <p className="text-[10px] font-bold text-purple-500">{(stats.mayoristasPorcentaje || 0).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-blue-500 uppercase">Remesado</p>
                  <p className="text-sm font-bold text-blue-700 tabular-nums">{formatCurrency(totalAnualRemesado)}&euro;</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Facturación por serie */}
      {porSerie.length > 0 && (() => {
        // Calcular porSerie filtrado por mes si hay filtro activo
        const porSerieFiltered = serieMesFilter
          ? (() => {
              const map: Record<string, { total: number; count: number }> = {}
              facturas.filter((f: FacturaResumen) => f.fecha.startsWith(serieMesFilter)).forEach((f: FacturaResumen) => {
                const serie = f.serieFactura || 'Sin serie'
                if (!map[serie]) map[serie] = { total: 0, count: 0 }
                map[serie].total += f.total
                map[serie].count += 1
              })
              return Object.entries(map)
                .map(([serie, data]) => ({ serie, ...data }))
                .sort((a, b) => b.total - a.total)
            })()
          : porSerie

        // Obtener meses disponibles de las facturas
        const mesesDisponibles = Array.from(new Set(facturas.map((f: FacturaResumen) => f.fecha.substring(0, 7))))
          .sort()

        const totalSerieFiltered = porSerieFiltered.reduce((s: number, x: any) => s + x.total, 0)
        const countSerieFiltered = porSerieFiltered.reduce((s: number, x: any) => s + x.count, 0)

        return (
          <div className="bg-white rounded-lg shadow border border-gray-200 p-4 sm:p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Facturación por Serie</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {serieMesFilter
                    ? `${getMesLabel(serieMesFilter)} — ${countSerieFiltered} facturas — ${formatCurrency(totalSerieFiltered)}€`
                    : `Todo el año 2026 — ${countSerieFiltered} facturas — ${formatCurrency(totalSerieFiltered)}€`
                  }
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setSerieMesFilter('')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    serieMesFilter === ''
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Todo 2026
                </button>
                {mesesDisponibles.map(mes => (
                  <button
                    key={mes}
                    onClick={() => setSerieMesFilter(serieMesFilter === mes ? '' : mes)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                      serieMesFilter === mes
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {getMesShort(mes)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {porSerieFiltered.map((s: any) => (
                <button
                  key={s.serie}
                  onClick={() => setSerieFilter(serieFilter === s.serie ? '' : s.serie)}
                  className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                    serieFilter === s.serie
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">{s.serie}</p>
                  <p className="text-xs text-gray-500 mt-1">{s.count} facturas</p>
                  <p className="text-sm font-bold text-orange-600 mt-1">
                    {formatCurrency(s.total)}&euro;
                  </p>
                </button>
              ))}
            </div>
            {porSerieFiltered.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No hay facturas para este mes</p>
            )}
          </div>
        )
      })()}

      {/* Tabs: Facturas / Remesas */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveView('facturas')}
            className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
              activeView === 'facturas'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Facturas ({facturas.length})
          </button>
          <button
            onClick={() => setActiveView('remesas')}
            className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
              activeView === 'remesas'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Remesas ({remesas.length})
          </button>
        </nav>
      </div>

      {/* Vista Facturas */}
      {activeView === 'facturas' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-3 items-center">
            <input
              type="text"
              placeholder="Buscar por cliente, documento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 w-full sm:w-64"
            />
            {(['todas', 'cobradas', 'pendientes'] as const).map((f) => {
              const count = f === 'todas' ? facturas.length :
                f === 'cobradas' ? facturas.filter(fa => fa.situacion === 'COBRADA').length :
                facturas.filter(fa => fa.situacion === 'PENDIENTE').length
              return (
                <button
                  key={f}
                  onClick={() => setFacturasFilter(f)}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    facturasFilter === f
                      ? 'bg-orange-500 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {f === 'todas' ? `Todas (${count})` :
                   f === 'cobradas' ? `Cobradas (${count})` :
                   `Pendientes (${count})`}
                </button>
              )
            })}
            {porMes.length > 0 && (
              <select
                value={mesFilter}
                onChange={(e) => setMesFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900"
              >
                <option value="">Todos los meses</option>
                {porMes.map((m: any) => {
                  const mesLabel = new Date(m.mes + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
                  return <option key={m.mes} value={m.mes}>{mesLabel} ({m.count})</option>
                })}
              </select>
            )}
            {(serieFilter || searchTerm || facturasFilter !== 'todas' || mesFilter) && (
              <button
                onClick={() => { setSerieFilter(''); setSearchTerm(''); setFacturasFilter('todas'); setMesFilter('') }}
                className="text-sm text-orange-600 hover:text-orange-700"
              >
                Limpiar filtros
              </button>
            )}
            <span className="text-sm text-gray-500 ml-auto">
              {filteredFacturas.length} de {facturas.length} facturas
            </span>
          </div>

          {/* Tabla de facturas */}
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Documento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serie</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Base</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">IVA</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pendiente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredFacturas.slice(0, 200).map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{f.documento || f.numeroDocumento}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{new Date(f.fecha).toLocaleDateString('es-ES')}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">{f.nombreCompleto}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{f.serieFactura}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(f.base)}&euro;</td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right">{formatCurrency(f.totalImpuesto)}&euro;</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{formatCurrency(f.total)}&euro;</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        f.situacion === 'COBRADA' ? 'bg-green-100 text-green-800' :
                        f.situacion === 'PENDIENTE' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {f.situacion}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {f.totalPendiente > 0 ? (
                        <span className="text-red-600 font-medium">{formatCurrency(f.totalPendiente)}&euro;</span>
                      ) : (
                        <span className="text-gray-400">0,00&euro;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredFacturas.length > 200 && (
              <div className="px-4 py-3 bg-gray-50 text-sm text-gray-500 text-center">
                Mostrando 200 de {filteredFacturas.length} facturas. Usa los filtros para acotar la búsqueda.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vista Remesas */}
      {activeView === 'remesas' && (
        <div className="space-y-4">
          {/* Remesas por categoría */}
          {data?.remesasPorCategoria?.length > 0 && (
            <div className="bg-white rounded-lg shadow border border-gray-200 p-4 sm:p-6 mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Remesas por Categoría</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {data.remesasPorCategoria.map((cat: any) => (
                  <div key={cat.categoria} className="rounded-lg border border-gray-200 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">{cat.categoria}</p>
                    <p className="text-xs text-gray-500 mt-1">{cat.count} remesas</p>
                    <p className="text-lg font-bold text-blue-600 mt-1">
                      {formatCurrency(cat.total)}&euro;
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabla de remesas */}
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Importe</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Registros</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IBAN</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Remesado</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Contabilizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {remesas.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.nombre}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{new Date(r.fecha).toLocaleDateString('es-ES')}</td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                      {formatCurrency(r.totalImporte)}&euro;
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{r.numeroRegistros}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{r.ibanAcreedor || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        r.remesado ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {r.remesado ? 'Sí' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        r.contabilizado ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {r.contabilizado ? 'Sí' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
