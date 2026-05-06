'use client'
import { useState, useEffect } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface Subcategoria {
  id: number
  categoriaId: number
  nombre: string
  descripcion: string | null
  orden: number
  activa: boolean
}

interface Categoria {
  id: number
  nombre: string
  descripcion: string | null
  color: string
  orden: number
  activa: boolean
  subcategorias: Subcategoria[]
}

const COLORES = [
  { value: 'blue', label: 'Azul', class: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'green', label: 'Verde', class: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'teal', label: 'Teal', class: 'bg-teal-100 text-teal-800 border-teal-300' },
  { value: 'purple', label: 'Púrpura', class: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'indigo', label: 'Índigo', class: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { value: 'orange', label: 'Naranja', class: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'red', label: 'Rojo', class: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'gray', label: 'Gris', class: 'bg-gray-100 text-gray-800 border-gray-300' },
  { value: 'yellow', label: 'Amarillo', class: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'pink', label: 'Rosa', class: 'bg-pink-100 text-pink-800 border-pink-300' },
]

export default function ConfigCategoriasClient() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form states
  const [showNewCat, setShowNewCat] = useState(false)
  const [newCatForm, setNewCatForm] = useState({ nombre: '', descripcion: '', color: 'gray' })
  const [editingCatId, setEditingCatId] = useState<number | null>(null)
  const [editCatForm, setEditCatForm] = useState({ nombre: '', descripcion: '', color: 'gray' })

  const [showNewSub, setShowNewSub] = useState<number | null>(null)
  const [newSubForm, setNewSubForm] = useState({ nombre: '', descripcion: '' })
  const [editingSubId, setEditingSubId] = useState<number | null>(null)
  const [editSubForm, setEditSubForm] = useState({ nombre: '', descripcion: '' })

  const fetchCategorias = async () => {
    try {
      const res = await fetch('/api/admin/configuracion/categorias')
      if (!res.ok) throw new Error('Error al cargar')
      const data = await res.json()
      setCategorias(data)
    } catch (err) {
      setError('Error al cargar las categorías')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCategorias() }, [])

  const showMessage = (msg: string, type: 'success' | 'error') => {
    if (type === 'success') { setSuccess(msg); setError('') }
    else { setError(msg); setSuccess('') }
    setTimeout(() => { setSuccess(''); setError('') }, 3000)
  }

  // CATEGORÍAS
  const handleCreateCat = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/admin/configuracion/categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newCatForm, orden: categorias.length + 1 }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al crear')
      }
      setShowNewCat(false)
      setNewCatForm({ nombre: '', descripcion: '', color: 'gray' })
      showMessage('Categoría creada correctamente', 'success')
      fetchCategorias()
    } catch (err: any) {
      showMessage(err.message, 'error')
    }
  }

  const handleUpdateCat = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/configuracion/categorias/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editCatForm),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al actualizar')
      }
      setEditingCatId(null)
      showMessage('Categoría actualizada', 'success')
      fetchCategorias()
    } catch (err: any) {
      showMessage(err.message, 'error')
    }
  }

  const handleDeleteCat = async (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar la categoría "${nombre}" y todas sus subcategorías?`)) return
    try {
      const res = await fetch(`/api/admin/configuracion/categorias/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al eliminar')
      }
      showMessage('Categoría eliminada', 'success')
      fetchCategorias()
    } catch (err: any) {
      showMessage(err.message, 'error')
    }
  }

  const handleToggleCat = async (id: number, activa: boolean) => {
    try {
      await fetch(`/api/admin/configuracion/categorias/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activa: !activa }),
      })
      fetchCategorias()
    } catch (err) {
      showMessage('Error al cambiar estado', 'error')
    }
  }

  // SUBCATEGORÍAS
  const handleCreateSub = async (e: React.FormEvent, categoriaId: number) => {
    e.preventDefault()
    try {
      const cat = categorias.find(c => c.id === categoriaId)
      const orden = cat ? cat.subcategorias.length + 1 : 0
      const res = await fetch(`/api/admin/configuracion/categorias/${categoriaId}/subcategorias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newSubForm, orden }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al crear')
      }
      setShowNewSub(null)
      setNewSubForm({ nombre: '', descripcion: '' })
      showMessage('Subcategoría creada', 'success')
      fetchCategorias()
    } catch (err: any) {
      showMessage(err.message, 'error')
    }
  }

  const handleUpdateSub = async (categoriaId: number, subId: number) => {
    try {
      const res = await fetch(`/api/admin/configuracion/categorias/${categoriaId}/subcategorias/${subId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editSubForm),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al actualizar')
      }
      setEditingSubId(null)
      showMessage('Subcategoría actualizada', 'success')
      fetchCategorias()
    } catch (err: any) {
      showMessage(err.message, 'error')
    }
  }

  const handleDeleteSub = async (categoriaId: number, subId: number, nombre: string) => {
    if (!confirm(`¿Eliminar la subcategoría "${nombre}"?`)) return
    try {
      const res = await fetch(`/api/admin/configuracion/categorias/${categoriaId}/subcategorias/${subId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al eliminar')
      }
      showMessage('Subcategoría eliminada', 'success')
      fetchCategorias()
    } catch (err: any) {
      showMessage(err.message, 'error')
    }
  }

  const getColorClass = (color: string) => {
    return COLORES.find(c => c.value === color)?.class || 'bg-gray-100 text-gray-800 border-gray-300'
  }

  if (loading) return <div className="p-6 text-center text-gray-500">Cargando categorías...</div>

  return (
    <div className="space-y-4">
      {/* Mensajes */}
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>}
      {success && <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 border border-green-200">{success}</div>}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Categorías y Subcategorías</h3>
          <p className="text-sm text-gray-500">Gestiona las categorías disponibles para clasificar tarifas</p>
        </div>
        <button
          onClick={() => setShowNewCat(true)}
          className="inline-flex items-center gap-1 rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          <PlusIcon className="h-4 w-4" /> Nueva Categoría
        </button>
      </div>

      {/* Form nueva categoría */}
      {showNewCat && (
        <form onSubmit={handleCreateCat} className="rounded-lg border border-orange-200 bg-orange-50 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Nombre de la categoría"
              value={newCatForm.nombre}
              onChange={e => setNewCatForm({ ...newCatForm, nombre: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500"
              required
            />
            <input
              type="text"
              placeholder="Descripción (opcional)"
              value={newCatForm.descripcion}
              onChange={e => setNewCatForm({ ...newCatForm, descripcion: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500"
            />
            <select
              value={newCatForm.color}
              onChange={e => setNewCatForm({ ...newCatForm, color: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500"
            >
              {COLORES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="inline-flex items-center gap-1 rounded-md bg-orange-600 px-3 py-1.5 text-sm text-white hover:bg-orange-700">
              <CheckIcon className="h-4 w-4" /> Crear
            </button>
            <button type="button" onClick={() => setShowNewCat(false)} className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-300">
              <XMarkIcon className="h-4 w-4" /> Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Lista de categorías */}
      <div className="space-y-2">
        {categorias.map(cat => (
          <div key={cat.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            {/* Cabecera categoría */}
            <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <button onClick={() => setExpandedId(expandedId === cat.id ? null : cat.id)} className="text-gray-400 hover:text-gray-600">
                  {expandedId === cat.id ? <ChevronDownIcon className="h-5 w-5" /> : <ChevronRightIcon className="h-5 w-5" />}
                </button>
                {editingCatId === cat.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editCatForm.nombre}
                      onChange={e => setEditCatForm({ ...editCatForm, nombre: e.target.value })}
                      className="rounded border border-gray-300 px-2 py-1 text-sm w-48"
                    />
                    <select
                      value={editCatForm.color}
                      onChange={e => setEditCatForm({ ...editCatForm, color: e.target.value })}
                      className="rounded border border-gray-300 px-2 py-1 text-sm"
                    >
                      {COLORES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <button onClick={() => handleUpdateCat(cat.id)} className="text-green-600 hover:text-green-800">
                      <CheckIcon className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditingCatId(null)} className="text-gray-400 hover:text-gray-600">
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold border ${getColorClass(cat.color)}`}>
                      {cat.nombre}
                    </span>
                    <span className="text-xs text-gray-500">{cat.subcategorias.length} subcategorías</span>
                    {!cat.activa && <span className="text-xs text-red-500 font-medium">(Inactiva)</span>}
                  </>
                )}
              </div>
              {editingCatId !== cat.id && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditingCatId(cat.id); setEditCatForm({ nombre: cat.nombre, descripcion: cat.descripcion || '', color: cat.color }) }}
                    className="text-gray-400 hover:text-orange-600"
                    title="Editar"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleToggleCat(cat.id, cat.activa)}
                    className={`text-xs px-2 py-0.5 rounded ${cat.activa ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                  >
                    {cat.activa ? 'Activa' : 'Inactiva'}
                  </button>
                  <button
                    onClick={() => handleDeleteCat(cat.id, cat.nombre)}
                    className="text-gray-400 hover:text-red-600"
                    title="Eliminar"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Subcategorías expandidas */}
            {expandedId === cat.id && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                <div className="ml-8 space-y-2">
                  {cat.subcategorias.map(sub => (
                    <div key={sub.id} className="flex items-center justify-between py-1.5 px-3 rounded hover:bg-white">
                      {editingSubId === sub.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editSubForm.nombre}
                            onChange={e => setEditSubForm({ ...editSubForm, nombre: e.target.value })}
                            className="rounded border border-gray-300 px-2 py-1 text-sm w-40"
                          />
                          <button onClick={() => handleUpdateSub(cat.id, sub.id)} className="text-green-600 hover:text-green-800">
                            <CheckIcon className="h-4 w-4" />
                          </button>
                          <button onClick={() => setEditingSubId(null)} className="text-gray-400 hover:text-gray-600">
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-700">{sub.nombre}</span>
                            {!sub.activa && <span className="text-xs text-red-500">(Inactiva)</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { setEditingSubId(sub.id); setEditSubForm({ nombre: sub.nombre, descripcion: sub.descripcion || '' }) }}
                              className="text-gray-400 hover:text-orange-600"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteSub(cat.id, sub.id, sub.nombre)}
                              className="text-gray-400 hover:text-red-600"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {/* Form nueva subcategoría */}
                  {showNewSub === cat.id ? (
                    <form onSubmit={e => handleCreateSub(e, cat.id)} className="flex items-center gap-2 pt-2">
                      <input
                        type="text"
                        placeholder="Nombre subcategoría"
                        value={newSubForm.nombre}
                        onChange={e => setNewSubForm({ ...newSubForm, nombre: e.target.value })}
                        className="rounded border border-gray-300 px-2 py-1 text-sm w-40 focus:border-orange-500 focus:ring-orange-500"
                        required
                        autoFocus
                      />
                      <button type="submit" className="text-green-600 hover:text-green-800">
                        <CheckIcon className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setShowNewSub(null)} className="text-gray-400 hover:text-gray-600">
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => { setShowNewSub(cat.id); setNewSubForm({ nombre: '', descripcion: '' }) }}
                      className="inline-flex items-center gap-1 text-sm text-orange-600 hover:text-orange-800 pt-1"
                    >
                      <PlusIcon className="h-3.5 w-3.5" /> Añadir subcategoría
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {categorias.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No hay categorías configuradas. Crea la primera.
        </div>
      )}
    </div>
  )
}
