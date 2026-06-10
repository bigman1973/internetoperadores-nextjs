'use client'

import { useState, useEffect, useCallback } from 'react'

interface ClienteAdamo {
  id: number
  nombre: string
  tarifa: string | null
  direccion: string | null
  municipio: string | null
  fechaAlta: string | null
  precioOperador: number | null
  precioCliente: number | null
  estado: string
  alternativaOfrecida: string | null
  precioAlternativa: number | null
  notas: string | null
  fechaContacto: string | null
  fechaResolucion: string | null
}

interface Stats {
  total: number
  porEstado: { estado: string; _count: { estado: number } }[]
  ingresosMensuales: number
  costeMensual: number
}

const ESTADOS = [
  { value: 'PENDIENTE', label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'CONTACTADO', label: 'Contactado', color: 'bg-blue-100 text-blue-800' },
  { value: 'EN_NEGOCIACION', label: 'En negociación', color: 'bg-purple-100 text-purple-800' },
  { value: 'OFERTA_ENVIADA', label: 'Oferta enviada', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'MIGRADO', label: 'Migrado', color: 'bg-green-100 text-green-800' },
  { value: 'BAJA', label: 'Baja', color: 'bg-red-100 text-red-800' },
]

function getEstadoInfo(estado: string) {
  return ESTADOS.find(e => e.value === estado) || { value: estado, label: estado, color: 'bg-gray-100 text-gray-800' }
}

export default function MigracionAdamoClient() {
  const [clientes, setClientes] = useState<ClienteAdamo[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [municipios, setMunicipios] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtroMunicipio, setFiltroMunicipio] = useState('todos')
  const [buscar, setBuscar] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<ClienteAdamo | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [editNotas, setEditNotas] = useState('')
  const [editAlternativa, setEditAlternativa] = useState('')
  const [editPrecioAlt, setEditPrecioAlt] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filtroEstado !== 'todos') params.set('estado', filtroEstado)
    if (filtroMunicipio !== 'todos') params.set('municipio', filtroMunicipio)
    if (buscar) params.set('buscar', buscar)

    try {
      const res = await fetch(`/api/admin/migracion-adamo?${params.toString()}`)
      const data = await res.json()
      setClientes(data.clientes || [])
      setStats(data.stats || null)
      setMunicipios(data.municipios || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    }
    setLoading(false)
  }, [filtroEstado, filtroMunicipio, buscar])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleUpdateCliente = async (id: number, updates: any) => {
    setSaving(true)
    try {
      await fetch('/api/admin/migracion-adamo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
      await fetchData()
      if (selectedCliente?.id === id) {
        setSelectedCliente(prev => prev ? { ...prev, ...updates } : null)
      }
    } catch (error) {
      console.error('Error updating:', error)
    }
    setSaving(false)
  }

  const handleBulkUpdate = async (estado: string) => {
    if (selectedIds.length === 0) return
    setSaving(true)
    try {
      await fetch('/api/admin/migracion-adamo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, estado }),
      })
      setSelectedIds([])
      await fetchData()
    } catch (error) {
      console.error('Error bulk update:', error)
    }
    setSaving(false)
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === clientes.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(clientes.map(c => c.id))
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const openDetail = (cliente: ClienteAdamo) => {
    setSelectedCliente(cliente)
    setEditNotas(cliente.notas || '')
    setEditAlternativa(cliente.alternativaOfrecida || '')
    setEditPrecioAlt(cliente.precioAlternativa?.toString() || '')
  }

  const getCountByEstado = (estado: string) => {
    if (!stats) return 0
    const found = stats.porEstado.find(s => s.estado === estado)
    return found ? found._count.estado : 0
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Migración ADAMO</h1>
        <p className="text-gray-500 mt-1">Gestión de clientes con interconexión ADAMO que necesitan migración a alternativas</p>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Total</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Pendientes</p>
            <p className="text-2xl font-bold text-yellow-600">{getCountByEstado('PENDIENTE')}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Contactados</p>
            <p className="text-2xl font-bold text-blue-600">{getCountByEstado('CONTACTADO')}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Migrados</p>
            <p className="text-2xl font-bold text-green-600">{getCountByEstado('MIGRADO')}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Ingresos/mes</p>
            <p className="text-2xl font-bold text-gray-900">{Number(stats.ingresosMensuales).toFixed(0)}€</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Coste ADAMO/mes</p>
            <p className="text-2xl font-bold text-red-600">{Number(stats.costeMensual).toFixed(0)}€</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border rounded-lg p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Buscar</label>
            <input
              type="text"
              placeholder="Nombre, dirección, tarifa..."
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Estado</label>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="todos">Todos</option>
              {ESTADOS.map(e => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Municipio</label>
            <select
              value={filtroMunicipio}
              onChange={(e) => setFiltroMunicipio(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="todos">Todos</option>
              {municipios.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            {selectedIds.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleBulkUpdate('CONTACTADO')}
                  disabled={saving}
                  className="px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                >
                  Marcar contactados ({selectedIds.length})
                </button>
                <button
                  onClick={() => handleBulkUpdate('BAJA')}
                  disabled={saving}
                  className="px-3 py-2 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                >
                  Dar de baja ({selectedIds.length})
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabla + Detalle */}
      <div className="flex gap-4">
        {/* Tabla */}
        <div className={`bg-white border rounded-lg overflow-hidden ${selectedCliente ? 'w-2/3' : 'w-full'}`}>
          {loading ? (
            <div className="p-8 text-center text-gray-500">Cargando...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === clientes.length && clientes.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarifa</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Municipio</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clientes.map((cliente) => {
                    const estadoInfo = getEstadoInfo(cliente.estado)
                    return (
                      <tr
                        key={cliente.id}
                        className={`hover:bg-gray-50 cursor-pointer ${selectedCliente?.id === cliente.id ? 'bg-orange-50' : ''}`}
                        onClick={() => openDetail(cliente)}
                      >
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(cliente.id)}
                            onChange={() => toggleSelect(cliente.id)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-gray-900 text-xs">{cliente.nombre}</div>
                          <div className="text-xs text-gray-500 truncate max-w-[200px]">{cliente.direccion}</div>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-700">{cliente.tarifa || '-'}</td>
                        <td className="px-3 py-3 text-xs text-gray-700">{cliente.municipio || '-'}</td>
                        <td className="px-3 py-3 text-xs">
                          <span className="font-medium">{cliente.precioCliente != null ? `${Number(cliente.precioCliente).toFixed(2)}€` : '-'}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${estadoInfo.color}`}>
                            {estadoInfo.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {clientes.length === 0 && (
                <div className="p-8 text-center text-gray-500">No se encontraron clientes con estos filtros</div>
              )}
            </div>
          )}
        </div>

        {/* Panel detalle */}
        {selectedCliente && (
          <div className="w-1/3 bg-white border rounded-lg p-4 sticky top-4 max-h-[calc(100vh-200px)] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-bold text-gray-900 text-sm">{selectedCliente.nombre}</h3>
              <button
                onClick={() => setSelectedCliente(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ×
              </button>
            </div>

            {/* Info actual */}
            <div className="space-y-3 mb-4">
              <div className="bg-gray-50 rounded p-3">
                <p className="text-xs text-gray-500 mb-1">Servicio actual</p>
                <p className="text-sm font-medium">{selectedCliente.tarifa || 'Sin tarifa'}</p>
                <p className="text-xs text-gray-500 mt-1">{selectedCliente.direccion}</p>
                <p className="text-xs text-gray-500">{selectedCliente.municipio}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded p-3">
                  <p className="text-xs text-gray-500">Precio cliente</p>
                  <p className="text-sm font-bold">{selectedCliente.precioCliente != null ? `${Number(selectedCliente.precioCliente).toFixed(2)}€` : '-'}</p>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <p className="text-xs text-gray-500">Coste ADAMO</p>
                  <p className="text-sm font-bold text-red-600">{selectedCliente.precioOperador != null ? `${Number(selectedCliente.precioOperador).toFixed(2)}€` : '-'}</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <p className="text-xs text-gray-500">Fecha alta</p>
                <p className="text-sm">{selectedCliente.fechaAlta ? new Date(selectedCliente.fechaAlta).toLocaleDateString('es-ES') : '-'}</p>
              </div>
            </div>

            {/* Estado */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">Estado</label>
              <select
                value={selectedCliente.estado}
                onChange={(e) => handleUpdateCliente(selectedCliente.id, { estado: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
                disabled={saving}
              >
                {ESTADOS.map(e => (
                  <option key={e.value} value={e.value}>{e.label}</option>
                ))}
              </select>
            </div>

            {/* Alternativa ofrecida */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">Alternativa ofrecida</label>
              <input
                type="text"
                value={editAlternativa}
                onChange={(e) => setEditAlternativa(e.target.value)}
                placeholder="Ej: Fibra 300 Digi, 4G Movistar..."
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>

            {/* Precio alternativa */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">Precio alternativa (sin IVA)</label>
              <input
                type="number"
                step="0.01"
                value={editPrecioAlt}
                onChange={(e) => setEditPrecioAlt(e.target.value)}
                placeholder="0.00"
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>

            {/* Notas */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">Notas internas</label>
              <textarea
                value={editNotas}
                onChange={(e) => setEditNotas(e.target.value)}
                rows={3}
                placeholder="Notas sobre la gestión..."
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>

            {/* Guardar */}
            <button
              onClick={() => handleUpdateCliente(selectedCliente.id, {
                notas: editNotas || null,
                alternativaOfrecida: editAlternativa || null,
                precioAlternativa: editPrecioAlt ? parseFloat(editPrecioAlt) : null,
              })}
              disabled={saving}
              className="w-full bg-orange-600 text-white py-2 rounded text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>

            {/* Fechas de gestión */}
            {(selectedCliente.fechaContacto || selectedCliente.fechaResolucion) && (
              <div className="mt-4 pt-4 border-t space-y-1">
                {selectedCliente.fechaContacto && (
                  <p className="text-xs text-gray-500">Contactado: {new Date(selectedCliente.fechaContacto).toLocaleDateString('es-ES')}</p>
                )}
                {selectedCliente.fechaResolucion && (
                  <p className="text-xs text-gray-500">Resuelto: {new Date(selectedCliente.fechaResolucion).toLocaleDateString('es-ES')}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
