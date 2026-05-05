'use client'

import { useState, useEffect } from 'react'
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, PencilIcon, TrashIcon, CodeBracketIcon, GlobeAltIcon, LockClosedIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

interface Desarrollo {
  id: number
  fecha: string
  titulo: string
  descripcion: string
  tipo: 'publica' | 'privada' | 'ambas'
  estado: 'completado' | 'en_progreso' | 'planificado'
  autor: string
  created_at: string
  updated_at: string
}

export default function HistorialDesarrollosClient() {
  const [registros, setRegistros] = useState<Desarrollo[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    titulo: '',
    descripcion: '',
    tipo: 'publica',
    estado: 'completado',
    autor: 'Manus AI',
    fecha: new Date().toISOString().slice(0, 16)
  })

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filtroTipo) params.set('tipo', filtroTipo)
      if (filtroEstado) params.set('estado', filtroEstado)
      const res = await fetch(`/api/admin/historial?${params}`)
      if (!res.ok) throw new Error('Error')
      const data = await res.json()
      setRegistros(data.registros || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [filtroTipo, filtroEstado])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const url = editingId ? `/api/admin/historial/${editingId}` : '/api/admin/historial'
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      if (!res.ok) throw new Error('Error al guardar')
      setShowForm(false)
      setEditingId(null)
      setFormData({ titulo: '', descripcion: '', tipo: 'publica', estado: 'completado', autor: 'Manus AI', fecha: new Date().toISOString().slice(0, 16) })
      fetchData()
    } catch (err) {
      alert('Error al guardar el registro')
    }
  }

  const handleEdit = (reg: Desarrollo) => {
    setEditingId(reg.id)
    setFormData({
      titulo: reg.titulo,
      descripcion: reg.descripcion || '',
      tipo: reg.tipo,
      estado: reg.estado,
      autor: reg.autor,
      fecha: new Date(reg.fecha).toISOString().slice(0, 16)
    })
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este registro de desarrollo?')) return
    try {
      await fetch(`/api/admin/historial/${id}`, { method: 'DELETE' })
      fetchData()
    } catch (err) {
      alert('Error al eliminar')
    }
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData({ titulo: '', descripcion: '', tipo: 'publica', estado: 'completado', autor: 'Manus AI', fecha: new Date().toISOString().slice(0, 16) })
  }

  const tipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'publica': return <GlobeAltIcon className="h-4 w-4 text-green-600" />
      case 'privada': return <LockClosedIcon className="h-4 w-4 text-purple-600" />
      case 'ambas': return <CodeBracketIcon className="h-4 w-4 text-blue-600" />
      default: return null
    }
  }

  const tipoBadge = (tipo: string) => {
    switch (tipo) {
      case 'publica': return <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20">Web Pública</span>
      case 'privada': return <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-purple-600/20">Panel Admin</span>
      case 'ambas': return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20">Pública + Admin</span>
      default: return null
    }
  }

  const estadoBadge = (estado: string) => {
    switch (estado) {
      case 'completado': return <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20">Completado</span>
      case 'en_progreso': return <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700 ring-1 ring-yellow-600/20">En progreso</span>
      case 'planificado': return <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-gray-600/20">Planificado</span>
      default: return null
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Historial de Desarrollos</h1>
          <p className="mt-1 text-sm text-gray-500">Registro de todos los desarrollos realizados en la web pública y panel de administración</p>
        </div>
        <button onClick={() => { cancelForm(); setShowForm(true) }}
          className="mt-4 sm:mt-0 inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500">
          <PlusIcon className="h-4 w-4" /> Nuevo Desarrollo
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
          className="rounded-md border-gray-300 text-sm shadow-sm focus:border-orange-500 focus:ring-orange-500">
          <option value="">Todos los tipos</option>
          <option value="publica">Web Pública</option>
          <option value="privada">Panel Admin</option>
          <option value="ambas">Pública + Admin</option>
        </select>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}
          className="rounded-md border-gray-300 text-sm shadow-sm focus:border-orange-500 focus:ring-orange-500">
          <option value="">Todos los estados</option>
          <option value="completado">Completados</option>
          <option value="en_progreso">En progreso</option>
          <option value="planificado">Planificados</option>
        </select>
        <button onClick={fetchData} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-orange-600">
          <ArrowPathIcon className="h-4 w-4" /> Actualizar
        </button>
        <span className="text-sm text-gray-500 ml-auto">{registros.length} registros</span>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="rounded-lg bg-white shadow border border-orange-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{editingId ? 'Editar Desarrollo' : 'Nuevo Desarrollo'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input type="text" required value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-sm"
                  placeholder="Ej: Implementación sección Productos" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y hora</label>
                <input type="datetime-local" value={formData.fecha} onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={formData.tipo} onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-sm">
                  <option value="publica">Web Pública</option>
                  <option value="privada">Panel Admin (Privada)</option>
                  <option value="ambas">Pública + Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select value={formData.estado} onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-sm">
                  <option value="completado">Completado</option>
                  <option value="en_progreso">En progreso</option>
                  <option value="planificado">Planificado</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Autor</label>
                <input type="text" value={formData.autor} onChange={(e) => setFormData({ ...formData, autor: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción detallada</label>
              <textarea rows={5} value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-sm"
                placeholder="Describe en detalle qué se ha desarrollado, qué archivos se han tocado, qué funcionalidades se han añadido..." />
            </div>
            <div className="flex gap-3">
              <button type="submit" className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500">
                {editingId ? 'Guardar cambios' : 'Crear registro'}
              </button>
              <button type="button" onClick={cancelForm} className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de desarrollos */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : registros.length === 0 ? (
        <div className="rounded-lg bg-white shadow border border-gray-200 p-12 text-center">
          <CodeBracketIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">Sin registros</h3>
          <p className="mt-1 text-sm text-gray-500">No hay desarrollos registrados con estos filtros.</p>
        </div>
      ) : (
        <div className="rounded-lg bg-white shadow border border-gray-200 overflow-hidden">
          {/* Cabecera de tabla */}
          <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div className="col-span-1">ID</div>
            <div className="col-span-2">Fecha / Hora</div>
            <div className="col-span-4">Desarrollo</div>
            <div className="col-span-2">Tipo</div>
            <div className="col-span-2">Estado</div>
            <div className="col-span-1">Acciones</div>
          </div>

          {/* Filas */}
          {registros.map((reg) => (
            <div key={reg.id} className="border-b last:border-b-0">
              {/* Fila principal */}
              <div
                className={`grid grid-cols-12 gap-2 px-4 py-3 items-center cursor-pointer hover:bg-orange-50/50 transition-colors ${expandedId === reg.id ? 'bg-orange-50/30' : ''}`}
                onClick={() => setExpandedId(expandedId === reg.id ? null : reg.id)}
              >
                <div className="col-span-1 flex items-center gap-1">
                  {expandedId === reg.id
                    ? <ChevronDownIcon className="h-4 w-4 text-orange-500" />
                    : <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                  }
                  <span className="text-xs font-mono text-gray-500">#{reg.id}</span>
                </div>
                <div className="col-span-2">
                  <div className="text-sm font-medium text-gray-900">{formatDate(reg.fecha)}</div>
                  <div className="text-xs text-gray-500">{formatTime(reg.fecha)}</div>
                </div>
                <div className="col-span-4">
                  <div className="text-sm font-medium text-gray-900 truncate">{reg.titulo}</div>
                  <div className="text-xs text-gray-500 truncate">{reg.autor}</div>
                </div>
                <div className="col-span-2 flex items-center gap-1">
                  {tipoIcon(reg.tipo)}
                  {tipoBadge(reg.tipo)}
                </div>
                <div className="col-span-2">
                  {estadoBadge(reg.estado)}
                </div>
                <div className="col-span-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => handleEdit(reg)} className="p-1 text-gray-400 hover:text-orange-600" title="Editar">
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(reg.id)} className="p-1 text-gray-400 hover:text-red-600" title="Eliminar">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Descripción expandida */}
              {expandedId === reg.id && (
                <div className="px-4 pb-4 pt-1 ml-8 mr-4">
                  <div className="rounded-md bg-gray-50 border border-gray-200 p-4">
                    {reg.descripcion ? (
                      <div className="text-sm text-gray-700 whitespace-pre-wrap">{reg.descripcion}</div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Sin descripción detallada.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
