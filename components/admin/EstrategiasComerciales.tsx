'use client'
import { useState, useEffect, useMemo } from 'react'
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, PencilIcon, TrashIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface Estrategia {
  id: number
  estrategia: string
  autor: string | null
  createdAt: string
}

interface Producto {
  id: number
  nombre: string
  nombreComercial: string | null
  categoria: string
  subcategoria: string | null
  grupoProducto: string | null
  varianteLabel: string | null
  precioVenta: number
  precioCoste: number | null
  margen: number | null
  unidadesActivas: number
  unidadesTotales: number
  facturacionMensual: number
  publicadoWeb: boolean
  activa: boolean
  ispGestionId: string | null
  estrategias: Estrategia[]
}

interface GrupoAgrupado {
  grupoProducto: string
  productos: Producto[]
  // Datos agregados del grupo
  totalUnidadesActivas: number
  totalFacturacion: number
  estrategias: Estrategia[] // estrategias del primer producto (compartidas)
}

export default function EstrategiasComerciales() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('publicados')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form states
  const [showNewEstrategia, setShowNewEstrategia] = useState<string | null>(null)
  const [newEstrategiaText, setNewEstrategiaText] = useState('')
  const [editingEstrategiaId, setEditingEstrategiaId] = useState<number | null>(null)
  const [editEstrategiaText, setEditEstrategiaText] = useState('')

  const fetchProductos = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ filtro })
      if (categoriaFiltro) params.set('categoria', categoriaFiltro)
      const res = await fetch(`/api/admin/configuracion/estrategias?${params}`)
      if (!res.ok) throw new Error('Error al cargar')
      const data = await res.json()
      setProductos(data)
    } catch (err) {
      setError('Error al cargar los productos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProductos() }, [filtro, categoriaFiltro])

  const showMessage = (msg: string, type: 'success' | 'error') => {
    if (type === 'success') { setSuccess(msg); setError('') }
    else { setError(msg); setSuccess('') }
    setTimeout(() => { setSuccess(''); setError('') }, 3000)
  }

  const handleCreateEstrategia = async (tarifaIds: number[]) => {
    if (!newEstrategiaText.trim()) return
    try {
      // Crear la estrategia para todos los productos del grupo
      for (const tarifaId of tarifaIds) {
        const res = await fetch('/api/admin/configuracion/estrategias', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tarifaId, estrategia: newEstrategiaText, autor: 'Admin' }),
        })
        if (!res.ok) throw new Error('Error al crear')
      }
      setShowNewEstrategia(null)
      setNewEstrategiaText('')
      showMessage('Estrategia añadida a todos los productos del grupo', 'success')
      fetchProductos()
    } catch (err: any) {
      showMessage(err.message, 'error')
    }
  }

  const handleUpdateEstrategia = async (id: number) => {
    if (!editEstrategiaText.trim()) return
    try {
      const res = await fetch(`/api/admin/configuracion/estrategias/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estrategia: editEstrategiaText }),
      })
      if (!res.ok) throw new Error('Error al actualizar')
      setEditingEstrategiaId(null)
      showMessage('Estrategia actualizada', 'success')
      fetchProductos()
    } catch (err: any) {
      showMessage(err.message, 'error')
    }
  }

  const handleDeleteEstrategia = async (id: number) => {
    if (!confirm('¿Eliminar esta estrategia del historial?')) return
    try {
      const res = await fetch(`/api/admin/configuracion/estrategias/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      showMessage('Estrategia eliminada', 'success')
      fetchProductos()
    } catch (err: any) {
      showMessage(err.message, 'error')
    }
  }

  const formatCurrency = (val: number) => val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  // Obtener categorías únicas para el filtro
  const categorias = [...new Set(productos.map(p => p.categoria))].sort()

  // Filtrar por búsqueda
  const productosFiltrados = productos.filter(p => {
    if (!busqueda) return true
    const term = busqueda.toLowerCase()
    return p.nombre.toLowerCase().includes(term) ||
      (p.nombreComercial && p.nombreComercial.toLowerCase().includes(term)) ||
      p.categoria.toLowerCase().includes(term) ||
      (p.grupoProducto && p.grupoProducto.toLowerCase().includes(term))
  })

  // Agrupar productos por grupo_producto (los que tienen grupo se agrupan, los individuales van solos)
  const items = useMemo(() => {
    const grupos: Map<string, Producto[]> = new Map()
    const individuales: Producto[] = []

    productosFiltrados.forEach(p => {
      if (p.grupoProducto) {
        const key = p.grupoProducto
        if (!grupos.has(key)) grupos.set(key, [])
        grupos.get(key)!.push(p)
      } else {
        individuales.push(p)
      }
    })

    const result: Array<{ type: 'grupo'; data: GrupoAgrupado } | { type: 'individual'; data: Producto }> = []

    // Añadir grupos
    grupos.forEach((prods, grupoProducto) => {
      const totalUnidadesActivas = prods.reduce((sum, p) => sum + p.unidadesActivas, 0)
      const totalFacturacion = prods.reduce((sum, p) => sum + p.facturacionMensual, 0)
      // Usar las estrategias del primer producto como representativas del grupo
      const estrategias = prods[0].estrategias
      result.push({
        type: 'grupo',
        data: { grupoProducto, productos: prods, totalUnidadesActivas, totalFacturacion, estrategias }
      })
    })

    // Añadir individuales
    individuales.forEach(p => {
      result.push({ type: 'individual', data: p })
    })

    return result
  }, [productosFiltrados])

  if (loading) return <div className="p-6 text-center text-gray-500">Cargando productos...</div>

  return (
    <div className="space-y-4">
      {/* Mensajes */}
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>}
      {success && <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 border border-green-200">{success}</div>}

      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Estrategias Comerciales por Producto</h3>
        <p className="text-sm text-gray-500">Define y registra la estrategia comercial de cada producto/tarifa. Los productos con el mismo grupo comparten estrategia.</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setFiltro('publicados')}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition ${filtro === 'publicados' ? 'bg-white shadow text-orange-700' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Publicados
          </button>
          <button
            onClick={() => setFiltro('historicos')}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition ${filtro === 'historicos' ? 'bg-white shadow text-orange-700' : 'text-gray-600 hover:text-gray-900'}`}
          >
            No publicados
          </button>
          <button
            onClick={() => setFiltro('todos')}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition ${filtro === 'todos' ? 'bg-white shadow text-orange-700' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Todos
          </button>
        </div>
        <select
          value={categoriaFiltro}
          onChange={e => setCategoriaFiltro(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">Todas las categorías</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="text"
          placeholder="Buscar producto..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm w-64"
        />
        <span className="text-xs text-gray-500 ml-auto">{productosFiltrados.length} productos · {items.length} filas</span>
      </div>

      {/* Tabla de productos */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-8"></th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Producto / Grupo</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">P. Venta</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">P. Coste</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Margen</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Uds. Activas</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Facturación/mes</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Web</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Estrategias</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {items.map(item => {
              if (item.type === 'grupo') {
                const g = item.data
                const key = `grupo-${g.grupoProducto}`
                const isExpanded = expandedId === key
                const firstProduct = g.productos[0]
                return (
                  <>
                    <tr key={key} className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-orange-50' : ''}`} onClick={() => setExpandedId(isExpanded ? null : key)}>
                      <td className="px-3 py-2 text-gray-400">
                        {isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
                            {g.productos.length} variantes
                          </span>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{g.grupoProducto.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                            <div className="text-xs text-gray-500">{g.productos.map(p => p.varianteLabel || p.nombre).join(' · ')}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs text-gray-700">{firstProduct.categoria}</span>
                        {firstProduct.subcategoria && <span className="text-xs text-gray-500 ml-1">/ {firstProduct.subcategoria}</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-gray-500 italic">
                        {formatCurrency(Math.min(...g.productos.map(p => p.precioVenta)))} - {formatCurrency(Math.max(...g.productos.map(p => p.precioVenta)))}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-gray-600">
                        {firstProduct.precioCoste !== null ? formatCurrency(firstProduct.precioCoste) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {firstProduct.margen !== null ? (
                          <span className={`text-sm font-medium ${firstProduct.margen >= 40 ? 'text-green-600' : firstProduct.margen >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
                            {firstProduct.margen.toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-gray-900 font-medium">{g.totalUnidadesActivas}</td>
                      <td className="px-3 py-2 text-right text-sm text-gray-900">{formatCurrency(g.totalFacturacion)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${firstProduct.publicadoWeb ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {firstProduct.publicadoWeb ? '✓' : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${g.estrategias.length > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                          {g.estrategias.length}
                        </span>
                      </td>
                    </tr>
                    {/* Panel expandido del grupo */}
                    {isExpanded && (
                      <tr key={`${key}-expanded`}>
                        <td colSpan={10} className="px-4 py-3 bg-gray-50">
                          <div className="ml-6 space-y-3">
                            {/* Variantes del grupo */}
                            <div className="p-3 bg-white rounded-lg border border-gray-200">
                              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Variantes del grupo (comparten estrategia)</h4>
                              <div className="divide-y divide-gray-100">
                                {g.productos.map(p => (
                                  <div key={p.id} className="flex items-center justify-between py-1.5 text-sm">
                                    <div>
                                      <span className="text-gray-900 font-medium">{p.nombre}</span>
                                      {p.varianteLabel && <span className="text-xs text-gray-500 ml-2">({p.varianteLabel})</span>}
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-gray-600">
                                      <span>{formatCurrency(p.precioVenta)}</span>
                                      <span>{p.unidadesActivas} uds</span>
                                      <span>{formatCurrency(p.facturacionMensual)}/mes</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Historial de estrategias */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-semibold text-gray-700">Historial de Estrategias</h4>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setShowNewEstrategia(key); setNewEstrategiaText('') }}
                                  className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 font-medium"
                                >
                                  <PlusIcon className="h-3.5 w-3.5" /> Nueva estrategia
                                </button>
                              </div>

                              {/* Form nueva estrategia */}
                              {showNewEstrategia === key && (
                                <div className="mb-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                                  <textarea
                                    value={newEstrategiaText}
                                    onChange={e => setNewEstrategiaText(e.target.value)}
                                    placeholder="Describe la estrategia comercial para este grupo de productos..."
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y min-h-[80px] focus:border-orange-500 focus:ring-orange-500"
                                    autoFocus
                                  />
                                  <div className="flex gap-2 mt-2">
                                    <button
                                      onClick={() => handleCreateEstrategia(g.productos.map(p => p.id))}
                                      className="inline-flex items-center gap-1 rounded-md bg-orange-600 px-3 py-1.5 text-xs text-white hover:bg-orange-700"
                                    >
                                      <CheckIcon className="h-3.5 w-3.5" /> Guardar (aplica a {g.productos.length} variantes)
                                    </button>
                                    <button
                                      onClick={() => setShowNewEstrategia(null)}
                                      className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-300"
                                    >
                                      <XMarkIcon className="h-3.5 w-3.5" /> Cancelar
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Lista de estrategias */}
                              {g.estrategias.length > 0 ? (
                                <div className="space-y-2">
                                  {g.estrategias.map(e => (
                                    <div key={e.id} className="p-3 bg-white rounded-lg border border-gray-200">
                                      {editingEstrategiaId === e.id ? (
                                        <div>
                                          <textarea
                                            value={editEstrategiaText}
                                            onChange={ev => setEditEstrategiaText(ev.target.value)}
                                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y min-h-[60px]"
                                          />
                                          <div className="flex gap-2 mt-2">
                                            <button onClick={() => handleUpdateEstrategia(e.id)} className="text-green-600 hover:text-green-800">
                                              <CheckIcon className="h-4 w-4" />
                                            </button>
                                            <button onClick={() => setEditingEstrategiaId(null)} className="text-gray-400 hover:text-gray-600">
                                              <XMarkIcon className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1">
                                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{e.estrategia}</p>
                                            <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                                              <span>{formatDate(e.createdAt)}</span>
                                              <span>·</span>
                                              <span>{e.autor || 'Admin'}</span>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1 ml-3">
                                            <button
                                              onClick={(ev) => { ev.stopPropagation(); setEditingEstrategiaId(e.id); setEditEstrategiaText(e.estrategia) }}
                                              className="text-gray-400 hover:text-orange-600"
                                            >
                                              <PencilIcon className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                              onClick={(ev) => { ev.stopPropagation(); handleDeleteEstrategia(e.id) }}
                                              className="text-gray-400 hover:text-red-600"
                                            >
                                              <TrashIcon className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 italic">Sin estrategias definidas aún</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              } else {
                // Producto individual (sin grupo)
                const p = item.data
                const key = `ind-${p.id}`
                const isExpanded = expandedId === key
                return (
                  <>
                    <tr key={key} className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-orange-50' : ''}`} onClick={() => setExpandedId(isExpanded ? null : key)}>
                      <td className="px-3 py-2 text-gray-400">
                        {isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-sm font-medium text-gray-900">{p.nombre}</div>
                        {p.nombreComercial && p.nombreComercial !== p.nombre && (
                          <div className="text-xs text-gray-500">{p.nombreComercial}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs text-gray-700">{p.categoria}</span>
                        {p.subcategoria && <span className="text-xs text-gray-500 ml-1">/ {p.subcategoria}</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-gray-900">{formatCurrency(p.precioVenta)}</td>
                      <td className="px-3 py-2 text-right text-sm text-gray-600">{p.precioCoste !== null ? formatCurrency(p.precioCoste) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {p.margen !== null ? (
                          <span className={`text-sm font-medium ${p.margen >= 40 ? 'text-green-600' : p.margen >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
                            {p.margen.toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-gray-900 font-medium">{p.unidadesActivas}</td>
                      <td className="px-3 py-2 text-right text-sm text-gray-900">{formatCurrency(p.facturacionMensual)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${p.publicadoWeb ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {p.publicadoWeb ? '✓' : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${p.estrategias.length > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                          {p.estrategias.length}
                        </span>
                      </td>
                    </tr>
                    {/* Panel expandido individual */}
                    {isExpanded && (
                      <tr key={`${key}-expanded`}>
                        <td colSpan={10} className="px-4 py-3 bg-gray-50">
                          <div className="ml-6 space-y-3">
                            {/* KPIs resumen */}
                            <div className="grid grid-cols-5 gap-4 p-3 bg-white rounded-lg border border-gray-200">
                              <div className="text-center">
                                <div className="text-xs text-gray-500">Precio Venta (sin IVA)</div>
                                <div className="text-sm font-bold text-gray-900">{formatCurrency(p.precioVenta)}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-gray-500">Precio Coste (sin IVA)</div>
                                <div className="text-sm font-bold text-gray-900">{p.precioCoste !== null ? formatCurrency(p.precioCoste) : 'No informado'}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-gray-500">Margen Comercial</div>
                                <div className={`text-sm font-bold ${p.margen !== null ? (p.margen >= 40 ? 'text-green-600' : p.margen >= 20 ? 'text-amber-600' : 'text-red-600') : 'text-gray-400'}`}>
                                  {p.margen !== null ? `${p.margen.toFixed(1)}%` : '—'}
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-gray-500">Unidades Vendidas</div>
                                <div className="text-sm font-bold text-gray-900">{p.unidadesActivas} activas / {p.unidadesTotales} total</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-gray-500">Facturación Mensual</div>
                                <div className="text-sm font-bold text-gray-900">{formatCurrency(p.facturacionMensual)}</div>
                              </div>
                            </div>

                            {/* Historial de estrategias */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-semibold text-gray-700">Historial de Estrategias</h4>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setShowNewEstrategia(key); setNewEstrategiaText('') }}
                                  className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 font-medium"
                                >
                                  <PlusIcon className="h-3.5 w-3.5" /> Nueva estrategia
                                </button>
                              </div>

                              {/* Form nueva estrategia */}
                              {showNewEstrategia === key && (
                                <div className="mb-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                                  <textarea
                                    value={newEstrategiaText}
                                    onChange={e => setNewEstrategiaText(e.target.value)}
                                    placeholder="Describe la estrategia comercial para este producto..."
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y min-h-[80px] focus:border-orange-500 focus:ring-orange-500"
                                    autoFocus
                                  />
                                  <div className="flex gap-2 mt-2">
                                    <button
                                      onClick={() => handleCreateEstrategia([p.id])}
                                      className="inline-flex items-center gap-1 rounded-md bg-orange-600 px-3 py-1.5 text-xs text-white hover:bg-orange-700"
                                    >
                                      <CheckIcon className="h-3.5 w-3.5" /> Guardar
                                    </button>
                                    <button
                                      onClick={() => setShowNewEstrategia(null)}
                                      className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-300"
                                    >
                                      <XMarkIcon className="h-3.5 w-3.5" /> Cancelar
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Lista de estrategias */}
                              {p.estrategias.length > 0 ? (
                                <div className="space-y-2">
                                  {p.estrategias.map(e => (
                                    <div key={e.id} className="p-3 bg-white rounded-lg border border-gray-200">
                                      {editingEstrategiaId === e.id ? (
                                        <div>
                                          <textarea
                                            value={editEstrategiaText}
                                            onChange={ev => setEditEstrategiaText(ev.target.value)}
                                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y min-h-[60px]"
                                          />
                                          <div className="flex gap-2 mt-2">
                                            <button onClick={() => handleUpdateEstrategia(e.id)} className="text-green-600 hover:text-green-800">
                                              <CheckIcon className="h-4 w-4" />
                                            </button>
                                            <button onClick={() => setEditingEstrategiaId(null)} className="text-gray-400 hover:text-gray-600">
                                              <XMarkIcon className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1">
                                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{e.estrategia}</p>
                                            <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                                              <span>{formatDate(e.createdAt)}</span>
                                              <span>·</span>
                                              <span>{e.autor || 'Admin'}</span>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1 ml-3">
                                            <button
                                              onClick={(ev) => { ev.stopPropagation(); setEditingEstrategiaId(e.id); setEditEstrategiaText(e.estrategia) }}
                                              className="text-gray-400 hover:text-orange-600"
                                            >
                                              <PencilIcon className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                              onClick={(ev) => { ev.stopPropagation(); handleDeleteEstrategia(e.id) }}
                                              className="text-gray-400 hover:text-red-600"
                                            >
                                              <TrashIcon className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 italic">Sin estrategias definidas aún</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              }
            })}
          </tbody>
        </table>
      </div>

      {items.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">No se encontraron productos con los filtros seleccionados.</div>
      )}
    </div>
  )
}
