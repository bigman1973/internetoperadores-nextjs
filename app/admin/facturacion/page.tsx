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

export default function FacturacionPage() {
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [activeView, setActiveView] = useState<'facturas' | 'remesas'>('facturas')
  const [data, setData] = useState<any>(null)
  const [facturasFilter, setFacturasFilter] = useState<'todas' | 'cobradas' | 'pendientes'>('todas')
  const [searchTerm, setSearchTerm] = useState('')
  const [serieFilter, setSerieFilter] = useState('')
  const [mesFilter, setMesFilter] = useState('')

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

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturación y Remesas</h1>
          <p className="text-sm text-gray-500 mt-1">Ejercicio 2026 - Datos sincronizados desde ISP Gestión</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-2"
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
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-4">
          <dt className="text-xs font-medium text-gray-500 uppercase">Total Facturas</dt>
          <dd className="mt-1 text-2xl font-bold text-gray-900">{stats.totalFacturas || 0}</dd>
        </div>
        <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-4">
          <dt className="text-xs font-medium text-gray-500 uppercase">Facturado</dt>
          <dd className="mt-1 text-xl font-bold text-gray-900">
            {(stats.totalFacturado || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}&euro;
          </dd>
        </div>
        <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-4">
          <dt className="text-xs font-medium text-gray-500 uppercase">Cobrado</dt>
          <dd className="mt-1 text-xl font-bold text-green-600">
            {(stats.totalCobrado || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}&euro;
          </dd>
        </div>
        <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-4">
          <dt className="text-xs font-medium text-gray-500 uppercase">Pendiente</dt>
          <dd className="mt-1 text-xl font-bold text-yellow-600">
            {(stats.totalPendiente || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}&euro;
          </dd>
        </div>
        <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-4">
          <dt className="text-xs font-medium text-gray-500 uppercase">Total Remesas</dt>
          <dd className="mt-1 text-2xl font-bold text-gray-900">{stats.totalRemesas || 0}</dd>
        </div>
        <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-4">
          <dt className="text-xs font-medium text-gray-500 uppercase">Remesado</dt>
          <dd className="mt-1 text-xl font-bold text-blue-600">
            {(stats.totalRemesado || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}&euro;
          </dd>
        </div>
      </div>

      {/* Facturación mensual */}
      {porMes.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Facturación Mensual 2026</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              {porMes.map((m: any) => {
                const maxTotal = Math.max(...porMes.map((x: any) => x.total))
                const pct = maxTotal > 0 ? (m.total / maxTotal) * 100 : 0
                const mesLabel = new Date(m.mes + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
                return (
                  <div key={m.mes} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-32 text-right capitalize">{mesLabel}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden">
                      <div
                        className="bg-orange-500 h-full rounded-full flex items-center justify-end pr-2"
                        style={{ width: `${Math.max(pct, 12)}%` }}
                      >
                        <span className="text-xs font-medium text-white">
                          {m.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}&euro;
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 w-16 text-right">{m.count} fact.</span>
                  </div>
                )
              })}
            </div>
            {/* Remesas por mes */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-3 uppercase">Remesas por Mes</h4>
              {data?.remesasPorMes?.length > 0 ? (
                <div className="space-y-2">
                  {data.remesasPorMes.map((m: any) => {
                    const maxR = Math.max(...data.remesasPorMes.map((x: any) => x.total))
                    const pctR = maxR > 0 ? (m.total / maxR) * 100 : 0
                    const mesLabel = new Date(m.mes + '-01').toLocaleDateString('es-ES', { month: 'long' })
                    return (
                      <div key={m.mes} className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 w-32 text-right capitalize">{mesLabel}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden">
                          <div
                            className="bg-blue-500 h-full rounded-full flex items-center justify-end pr-2"
                            style={{ width: `${Math.max(pctR, 12)}%` }}
                          >
                            <span className="text-xs font-medium text-white">
                              {m.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}&euro;
                            </span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 w-16 text-right">{m.count} rem.</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Sin datos de remesas</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Facturación por serie */}
      {porSerie.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Facturación por Serie</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {porSerie.map((s: any) => (
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
                  {s.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}&euro;
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

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
              className="border border-gray-300 rounded-md px-3 py-2 text-sm w-64"
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
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
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
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{f.base.toLocaleString('es-ES', { minimumFractionDigits: 2 })}&euro;</td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right">{f.totalImpuesto.toLocaleString('es-ES', { minimumFractionDigits: 2 })}&euro;</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{f.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}&euro;</td>
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
                        <span className="text-red-600 font-medium">{f.totalPendiente.toLocaleString('es-ES', { minimumFractionDigits: 2 })}&euro;</span>
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
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Remesas por Categoría</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {data.remesasPorCategoria.map((cat: any) => (
                  <div key={cat.categoria} className="rounded-lg border border-gray-200 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">{cat.categoria}</p>
                    <p className="text-xs text-gray-500 mt-1">{cat.count} remesas</p>
                    <p className="text-lg font-bold text-blue-600 mt-1">
                      {cat.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}&euro;
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
                      {r.totalImporte.toLocaleString('es-ES', { minimumFractionDigits: 2 })}&euro;
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
