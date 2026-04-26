'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowPathIcon, MagnifyingGlassIcon, ChevronDownIcon, ChevronRightIcon, FunnelIcon, TableCellsIcon, UserGroupIcon } from '@heroicons/react/24/outline'

interface Stats {
  general: {
    total: number
    activos: number
    bajas: number
    facturacion_mensual: number | string
    facturacion_iva: number | string
    clientes_con_servicio: number
  }
  categorias: Array<{
    categoria: string
    total: number
    activos: number
    bajas: number
    facturacion: number | string
  }>
  topClientes: Array<{
    cliente_id: string
    nombre_cliente: string
    contratos_activos: number
    facturacion: number | string
  }>
}

interface Contrato {
  id: number
  isp_gestion_contrato_id: number
  cliente_id: string
  titulo: string
  tarifa: string
  precio: string | number
  importe_remesar: string | number | null
  fecha_inicio: string | null
  fecha_baja: string | null
  causa_baja: string | null
  permanencia: number
  categoria: string | null
  telefonos_contrato: string | null
  observaciones: string | null
  activo: boolean
  nombre_cliente?: string
  cliente_db_id?: number
}

interface ClienteAgrupado {
  cliente_id: string
  nombre_cliente: string
  cliente_db_id: number | null
  email: string | null
  telefono: string | null
  municipio: string | null
  total_contratos: number
  contratos_activos: number
  contratos_bajas: number
  facturacion_mensual: number | string
  contratos: Contrato[]
}

const CATEGORY_COLORS: Record<string, string> = {
  'Internet': 'bg-blue-100 text-blue-800',
  'Móvil': 'bg-purple-100 text-purple-800',
  'Fijo': 'bg-green-100 text-green-800',
  'Centralita': 'bg-yellow-100 text-yellow-800',
  'TV': 'bg-pink-100 text-pink-800',
  'Hosting': 'bg-indigo-100 text-indigo-800',
  'VPN': 'bg-cyan-100 text-cyan-800',
  'default': 'bg-gray-100 text-gray-800',
}

function getCategoryColor(cat: string): string {
  for (const key of Object.keys(CATEGORY_COLORS)) {
    if (cat.toLowerCase().includes(key.toLowerCase())) return CATEGORY_COLORS[key]
  }
  return CATEGORY_COLORS['default']
}

function formatCurrency(val: number | string): string {
  return Number(val).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ContratosView() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [viewMode, setViewMode] = useState<'grouped' | 'list'>('grouped')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [estado, setEstado] = useState('')
  const [categoria, setCategoria] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  // Grouped view data
  const [clientesAgrupados, setClientesAgrupados] = useState<ClienteAgrupado[]>([])
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())
  const [groupedTotal, setGroupedTotal] = useState(0)
  const [groupedTotalPages, setGroupedTotalPages] = useState(1)

  // List view data
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [listTotal, setListTotal] = useState(0)
  const [listTotalPages, setListTotalPages] = useState(1)

  // Fetch stats
  useEffect(() => {
    fetchStats()
  }, [])

  // Fetch data when filters change
  useEffect(() => {
    fetchData()
  }, [viewMode, search, estado, categoria, page])

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/contratos?modo=stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('modo', viewMode)
      params.set('page', String(page))
      if (search) params.set('search', search)
      if (estado) params.set('estado', estado)
      if (categoria) params.set('categoria', categoria)

      const res = await fetch(`/api/admin/contratos?${params}`)
      if (!res.ok) throw new Error('Error fetching data')
      const data = await res.json()

      if (viewMode === 'grouped') {
        setClientesAgrupados(data.clientes || [])
        setGroupedTotal(data.total || 0)
        setGroupedTotalPages(data.totalPages || 1)
      } else {
        setContratos(data.contratos || [])
        setListTotal(data.total || 0)
        setListTotalPages(data.totalPages || 1)
      }
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/sync-contratos', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        alert(`Sincronización exitosa: ${data.upserted} contratos sincronizados (${data.activos} activos, ${data.bajas} dados de baja).`)
        fetchStats()
        fetchData()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (err) {
      alert('Error al conectar con el servidor de sincronización.')
    } finally {
      setSyncing(false)
    }
  }

  const toggleClient = (clienteId: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev)
      if (next.has(clienteId)) next.delete(clienteId)
      else next.add(clienteId)
      return next
    })
  }

  const clearFilters = () => {
    setSearch('')
    setSearchInput('')
    setEstado('')
    setCategoria('')
    setPage(1)
  }

  const total = viewMode === 'grouped' ? groupedTotal : listTotal
  const totalPages = viewMode === 'grouped' ? groupedTotalPages : listTotalPages

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contratos / Servicios</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestión y visualización de todos los servicios contratados
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-x-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-x-2 rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      </div>

      {/* Dashboard Stats */}
      {stats && (
        <>
          {/* Main stats cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-4">
              <dt className="text-xs font-medium text-gray-500 uppercase">Total Contratos</dt>
              <dd className="mt-1 text-2xl font-bold text-gray-900">{stats.general.total}</dd>
            </div>
            <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-4">
              <dt className="text-xs font-medium text-gray-500 uppercase">Activos</dt>
              <dd className="mt-1 text-2xl font-bold text-green-600">{stats.general.activos}</dd>
            </div>
            <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-4">
              <dt className="text-xs font-medium text-gray-500 uppercase">Dados de Baja</dt>
              <dd className="mt-1 text-2xl font-bold text-red-500">{stats.general.bajas}</dd>
            </div>
            <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-4">
              <dt className="text-xs font-medium text-gray-500 uppercase">Facturación Mensual</dt>
              <dd className="mt-1 text-2xl font-bold text-orange-600">{formatCurrency(stats.general.facturacion_mensual)}&euro;</dd>
            </div>
            <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-4">
              <dt className="text-xs font-medium text-gray-500 uppercase">Clientes con Servicio</dt>
              <dd className="mt-1 text-2xl font-bold text-blue-600">{stats.general.clientes_con_servicio}</dd>
            </div>
          </div>

          {/* Category breakdown + Top clients */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Category */}
            <div className="rounded-lg bg-white shadow border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Facturación por Categoría</h3>
              <div className="space-y-2">
                {stats.categorias.map((cat) => {
                  const maxFact = Math.max(...stats.categorias.map(c => Number(c.facturacion)))
                  const pct = maxFact > 0 ? (Number(cat.facturacion) / maxFact) * 100 : 0
                  return (
                    <div key={cat.categoria} className="flex items-center gap-3">
                      <button
                        onClick={() => { setCategoria(cat.categoria === 'Sin categoría' ? '' : cat.categoria); setPage(1) }}
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap cursor-pointer hover:opacity-80 ${getCategoryColor(cat.categoria)}`}
                      >
                        {cat.categoria}
                      </button>
                      <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                        <div className="bg-orange-400 h-2.5 rounded-full" style={{ width: `${pct}%` }}></div>
                      </div>
                      <span className="text-sm font-medium text-gray-700 w-28 text-right">
                        {formatCurrency(cat.facturacion)}&euro;
                      </span>
                      <span className="text-xs text-gray-500 w-16 text-right">
                        {cat.activos} act.
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Top Clients */}
            <div className="rounded-lg bg-white shadow border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Top 15 Clientes por Facturación</h3>
              <div className="overflow-y-auto max-h-64">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase">
                      <th className="text-left py-1 pr-2">#</th>
                      <th className="text-left py-1">Cliente</th>
                      <th className="text-right py-1">Contratos</th>
                      <th className="text-right py-1">Facturación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topClientes.map((client, i) => (
                      <tr key={client.cliente_id} className="border-t border-gray-100">
                        <td className="py-1.5 pr-2 text-gray-400 font-mono text-xs">{i + 1}</td>
                        <td className="py-1.5 text-gray-900 font-medium truncate max-w-[200px]">{client.nombre_cliente}</td>
                        <td className="py-1.5 text-right text-gray-600">{client.contratos_activos}</td>
                        <td className="py-1.5 text-right font-medium text-orange-600">{formatCurrency(client.facturacion)}&euro;</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Filters + View Toggle */}
      <div className="rounded-lg bg-white shadow border border-gray-200 p-5">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Nombre cliente, título, tarifa, teléfono, ID..."
                className="block w-full rounded-md border-gray-300 pl-10 pr-3 py-2 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
              />
            </div>
          </form>

          {/* Estado */}
          <div className="w-full lg:w-40">
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select
              value={estado}
              onChange={(e) => { setEstado(e.target.value); setPage(1) }}
              className="block w-full rounded-md border-gray-300 py-2 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
            >
              <option value="">Todos</option>
              <option value="activo">Activos</option>
              <option value="baja">Dados de Baja</option>
            </select>
          </div>

          {/* Categoría */}
          <div className="w-full lg:w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select
              value={categoria}
              onChange={(e) => { setCategoria(e.target.value); setPage(1) }}
              className="block w-full rounded-md border-gray-300 py-2 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
            >
              <option value="">Todas</option>
              {stats?.categorias.map(cat => (
                <option key={cat.categoria} value={cat.categoria}>{cat.categoria} ({cat.activos})</option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleSearch}
              className="bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-orange-500"
            >
              Buscar
            </button>
            <button
              onClick={clearFilters}
              className="bg-white text-gray-700 px-4 py-2 rounded-md text-sm font-semibold ring-1 ring-gray-300 hover:bg-gray-50"
            >
              Limpiar
            </button>
          </div>

          {/* View mode toggle */}
          <div className="flex rounded-md shadow-sm">
            <button
              onClick={() => { setViewMode('grouped'); setPage(1) }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-l-md border ${
                viewMode === 'grouped'
                  ? 'bg-orange-50 text-orange-700 border-orange-300 z-10'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <UserGroupIcon className="h-4 w-4" />
              Por Cliente
            </button>
            <button
              onClick={() => { setViewMode('list'); setPage(1) }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-r-md border -ml-px ${
                viewMode === 'list'
                  ? 'bg-orange-50 text-orange-700 border-orange-300 z-10'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <TableCellsIcon className="h-4 w-4" />
              Lista Plana
            </button>
          </div>
        </div>

        {/* Active filters */}
        {(search || estado || categoria) && (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-500">Filtros activos:</span>
            {search && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                Búsqueda: &quot;{search}&quot;
                <button onClick={() => { setSearch(''); setSearchInput('') }} className="text-orange-500 hover:text-orange-700">&times;</button>
              </span>
            )}
            {estado && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                Estado: {estado === 'activo' ? 'Activos' : 'Dados de Baja'}
                <button onClick={() => setEstado('')} className="text-blue-500 hover:text-blue-700">&times;</button>
              </span>
            )}
            {categoria && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                Categoría: {categoria}
                <button onClick={() => setCategoria('')} className="text-purple-500 hover:text-purple-700">&times;</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          <span className="ml-3 text-gray-500">Cargando contratos...</span>
        </div>
      ) : (
        <>
          {/* GROUPED VIEW */}
          {viewMode === 'grouped' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">{total} clientes encontrados</p>
              {clientesAgrupados.length === 0 ? (
                <div className="bg-white rounded-lg shadow border border-gray-200 p-8 text-center text-gray-500">
                  No se encontraron clientes con los filtros aplicados.
                </div>
              ) : (
                clientesAgrupados.map((cliente) => (
                  <div key={cliente.cliente_id} className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                    {/* Client header row */}
                    <button
                      onClick={() => toggleClient(cliente.cliente_id)}
                      className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        {expandedClients.has(cliente.cliente_id) ? (
                          <ChevronDownIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRightIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                        )}
                        <div className="text-left min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 truncate">{cliente.nombre_cliente}</span>
                            {cliente.cliente_db_id && (
                              <Link
                                href={`/admin/clientes/${cliente.cliente_db_id}/editar`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-orange-600 hover:text-orange-700 hover:underline"
                              >
                                Ver ficha
                              </Link>
                            )}
                          </div>
                          <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                            {cliente.email && <span>{cliente.email}</span>}
                            {cliente.telefono && <span>Tel: {cliente.telefono}</span>}
                            {cliente.municipio && <span>{cliente.municipio}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 flex-shrink-0 ml-4">
                        <div className="text-right">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-medium">
                              {cliente.contratos_activos} activos
                            </span>
                            {cliente.contratos_bajas > 0 && (
                              <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium">
                                {cliente.contratos_bajas} bajas
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right min-w-[100px]">
                          <p className="text-lg font-bold text-orange-600">{formatCurrency(cliente.facturacion_mensual)}&euro;</p>
                          <p className="text-xs text-gray-500">/mes</p>
                        </div>
                      </div>
                    </button>

                    {/* Expanded contracts */}
                    {expandedClients.has(cliente.cliente_id) && (
                      <div className="border-t border-gray-200 bg-gray-50">
                        {cliente.contratos.length === 0 ? (
                          <p className="px-5 py-4 text-sm text-gray-500">No se encontraron contratos con los filtros actuales.</p>
                        ) : (
                          <div className="divide-y divide-gray-100">
                            {cliente.contratos.map((contrato) => (
                              <div key={contrato.id} className={`px-5 py-3 pl-14 ${!contrato.activo ? 'opacity-60' : ''}`}>
                                <div className="flex items-start justify-between">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                        contrato.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                      }`}>
                                        {contrato.activo ? 'Activo' : 'Baja'}
                                      </span>
                                      {contrato.categoria && (
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getCategoryColor(contrato.categoria)}`}>
                                          {contrato.categoria}
                                        </span>
                                      )}
                                      {contrato.permanencia > 0 && (
                                        <span className="text-xs text-yellow-700 bg-yellow-50 rounded-full px-2 py-0.5">
                                          Perm. {contrato.permanencia}m
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm font-medium text-gray-900 truncate">{contrato.titulo}</p>
                                    <p className="text-xs text-gray-500">{contrato.tarifa}</p>
                                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500">
                                      {contrato.fecha_inicio && (
                                        <span>Inicio: {new Date(contrato.fecha_inicio).toLocaleDateString('es-ES')}</span>
                                      )}
                                      {contrato.fecha_baja && (
                                        <span className="text-red-600">Baja: {new Date(contrato.fecha_baja).toLocaleDateString('es-ES')}
                                          {contrato.causa_baja && ` (${contrato.causa_baja})`}
                                        </span>
                                      )}
                                      {contrato.telefonos_contrato && (
                                        <span>Tel: {contrato.telefonos_contrato}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right ml-4 flex-shrink-0">
                                    <p className="text-sm font-bold text-gray-900">{formatCurrency(contrato.precio)}&euro;</p>
                                    {contrato.importe_remesar && Number(contrato.importe_remesar) > 0 && (
                                      <p className="text-xs text-gray-500">IVA: {formatCurrency(contrato.importe_remesar)}&euro;</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* LIST VIEW */}
          {viewMode === 'list' && (
            <div className="rounded-lg bg-white shadow border border-gray-200 overflow-hidden">
              <p className="px-4 py-2 text-sm text-gray-500 border-b">{total} contratos encontrados</p>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Título / Servicio</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarifa</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Precio</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inicio</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Baja</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teléfonos</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {contratos.map((contrato) => (
                      <tr key={contrato.id} className={contrato.activo ? '' : 'bg-gray-50 opacity-60'}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            contrato.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {contrato.activo ? 'Activo' : 'Baja'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium text-gray-900 truncate max-w-[180px]">{contrato.nombre_cliente}</div>
                          {contrato.cliente_db_id && (
                            <Link href={`/admin/clientes/${contrato.cliente_db_id}/editar`} className="text-xs text-orange-600 hover:underline">
                              Ver ficha
                            </Link>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium max-w-[200px] truncate" title={contrato.titulo}>
                          {contrato.titulo}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-[180px] truncate" title={contrato.tarifa}>
                          {contrato.tarifa}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {contrato.categoria ? (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getCategoryColor(contrato.categoria)}`}>
                              {contrato.categoria}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                          {formatCurrency(contrato.precio)}&euro;
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {contrato.fecha_inicio ? new Date(contrato.fecha_inicio).toLocaleDateString('es-ES') : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {contrato.fecha_baja ? (
                            <span className="text-red-600">
                              {new Date(contrato.fecha_baja).toLocaleDateString('es-ES')}
                              {contrato.causa_baja && <span className="block text-xs">{contrato.causa_baja}</span>}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 max-w-[120px] truncate">
                          {contrato.telefonos_contrato || '-'}
                        </td>
                      </tr>
                    ))}
                    {contratos.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                          No se encontraron contratos con los filtros aplicados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">
                Página {page} de {totalPages} ({total} {viewMode === 'grouped' ? 'clientes' : 'contratos'})
              </p>
              <div className="flex gap-x-2">
                {page > 1 && (
                  <button
                    onClick={() => setPage(page - 1)}
                    className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50"
                  >
                    Anterior
                  </button>
                )}
                {page < totalPages && (
                  <button
                    onClick={() => setPage(page + 1)}
                    className="rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500"
                  >
                    Siguiente
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
