'use client'

import { useState, useEffect } from 'react'
import { RocketLaunchIcon, PlusIcon, DocumentIcon, TrashIcon, PencilIcon, XMarkIcon, EyeIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

interface Documento {
  id: string
  nombre: string
  tipo: 'presupuesto_cliente' | 'pedido_cliente' | 'presupuesto_proveedor' | 'albaran' | 'factura' | 'otro'
  url: string
  fecha: string
  importe?: number
  proveedor?: string
}

interface Proyecto {
  id: string
  contratoDraxtonId: string | null
  contratoDraxton?: { id: string; titulo: string } | null
  responsable?: { id: string; nombreCompleto: string; categoria: string | null } | null
  responsableId: string | null
  titulo: string
  descripcion: string | null
  categoria: string
  estado: string
  impacto: string | null
  ahorroEstimado: number | null
  importeVenta: number | null
  costeProveedores: number | null
  margenEstimado: number | null
  documentosJson: Documento[] | null
  ubicacion: string | null
  fechaInicio: string | null
  fechaFinPrevista: string | null
  fechaFinReal: string | null
  prioridad: string
  orden: number
  activo: boolean
}

const TIPOS_DOCUMENTO: { value: Documento['tipo']; label: string; color: string }[] = [
  { value: 'presupuesto_cliente', label: 'Presupuesto a Cliente', color: 'bg-blue-100 text-blue-700' },
  { value: 'pedido_cliente', label: 'Pedido de Cliente', color: 'bg-green-100 text-green-700' },
  { value: 'presupuesto_proveedor', label: 'Presupuesto Proveedor', color: 'bg-amber-100 text-amber-700' },
  { value: 'albaran', label: 'Albarán', color: 'bg-purple-100 text-purple-700' },
  { value: 'factura', label: 'Factura', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'otro', label: 'Otro', color: 'bg-gray-100 text-gray-600' },
]

const ESTADOS: { value: string; label: string; color: string }[] = [
  { value: 'planificado', label: 'Planificado', color: 'bg-gray-100 text-gray-700' },
  { value: 'en_curso', label: 'En Curso', color: 'bg-blue-100 text-blue-700' },
  { value: 'completado', label: 'Completado', color: 'bg-green-100 text-green-700' },
  { value: 'pausado', label: 'Pausado', color: 'bg-amber-100 text-amber-700' },
]

function formatCurrency(value: number | null | undefined): string {
  if (!value && value !== 0) return '—'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
}

function getEstadoBadge(estado: string) {
  const e = ESTADOS.find(s => s.value === estado)
  return e ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${e.color}`}>{e.label}</span> : <span>{estado}</span>
}

function getTipoDocBadge(tipo: Documento['tipo']) {
  const t = TIPOS_DOCUMENTO.find(td => td.value === tipo)
  return t ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${t.color}`}>{t.label}</span> : <span>{tipo}</span>
}

export default function DraxtonProyectosSingularesPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showDocForm, setShowDocForm] = useState<string | null>(null)

  const emptyForm = {
    titulo: '',
    descripcion: '',
    estado: 'en_curso',
    prioridad: 'media',
    ubicacion: '',
    importeVenta: '',
    costeProveedores: '',
    fechaInicio: '',
    fechaFinPrevista: '',
  }

  const [form, setForm] = useState(emptyForm)

  const [docForm, setDocForm] = useState<Omit<Documento, 'id'>>({
    nombre: '',
    tipo: 'presupuesto_cliente',
    url: '',
    fecha: new Date().toISOString().split('T')[0],
    importe: undefined,
    proveedor: '',
  })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato')
      if (res.ok) {
        const data = await res.json()
        setProyectos(data.filter((p: Proyecto) => p.categoria === 'proyecto'))
      }
    } catch (error) {
      console.error('Error cargando datos:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!form.titulo) {
      alert('El título es obligatorio')
      return
    }

    const margen = form.importeVenta && form.costeProveedores
      ? (parseFloat(form.importeVenta) - parseFloat(form.costeProveedores)).toString()
      : null

    const payload: any = {
      titulo: form.titulo,
      descripcion: form.descripcion || null,
      estado: form.estado,
      prioridad: form.prioridad,
      ubicacion: form.ubicacion || null,
      categoria: 'proyecto',
      importeVenta: form.importeVenta || null,
      costeProveedores: form.costeProveedores || null,
      margenEstimado: margen,
      fechaInicio: form.fechaInicio || null,
      fechaFinPrevista: form.fechaFinPrevista || null,
    }

    if (editingId) payload.id = editingId

    const res = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm)
      fetchData()
    } else {
      const err = await res.json()
      alert('Error: ' + (err.error || 'Error desconocido'))
    }
  }

  const handleEdit = (p: Proyecto) => {
    setForm({
      titulo: p.titulo,
      descripcion: p.descripcion || '',
      estado: p.estado,
      prioridad: p.prioridad,
      ubicacion: p.ubicacion || '',
      importeVenta: p.importeVenta?.toString() || '',
      costeProveedores: p.costeProveedores?.toString() || '',
      fechaInicio: p.fechaInicio?.split('T')[0] || '',
      fechaFinPrevista: p.fechaFinPrevista?.split('T')[0] || '',
    })
    setEditingId(p.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este proyecto?')) return
    const res = await fetch(`/api/admin/clientes/ggcc/draxton/proyectos-contrato?id=${id}`, { method: 'DELETE' })
    if (res.ok) fetchData()
  }

  const handleAddDoc = async (proyectoId: string) => {
    if (!docForm.nombre || !docForm.url) {
      alert('Nombre y URL son obligatorios')
      return
    }

    const proyecto = proyectos.find(p => p.id === proyectoId)
    if (!proyecto) return

    const newDoc: Documento = {
      id: crypto.randomUUID(),
      ...docForm,
      importe: docForm.importe ? Number(docForm.importe) : undefined,
    }

    const docs = [...(proyecto.documentosJson || []), newDoc]

    // Recalcular coste proveedores sumando importes de presupuestos_proveedor
    const costeTotal = docs
      .filter(d => d.tipo === 'presupuesto_proveedor' && d.importe)
      .reduce((sum, d) => sum + (d.importe || 0), 0)

    const importeVenta = proyecto.importeVenta || 0
    const margen = importeVenta > 0 ? importeVenta - costeTotal : null

    const res = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: proyectoId,
        documentosJson: docs,
        costeProveedores: costeTotal > 0 ? costeTotal.toString() : null,
        margenEstimado: margen?.toString() || null,
      }),
    })

    if (res.ok) {
      setShowDocForm(null)
      setDocForm({ nombre: '', tipo: 'presupuesto_cliente', url: '', fecha: new Date().toISOString().split('T')[0], importe: undefined, proveedor: '' })
      fetchData()
    }
  }

  const handleDeleteDoc = async (proyectoId: string, docId: string) => {
    const proyecto = proyectos.find(p => p.id === proyectoId)
    if (!proyecto) return

    const docs = (proyecto.documentosJson || []).filter(d => d.id !== docId)

    const costeTotal = docs
      .filter(d => d.tipo === 'presupuesto_proveedor' && d.importe)
      .reduce((sum, d) => sum + (d.importe || 0), 0)

    const importeVenta = proyecto.importeVenta || 0
    const margen = importeVenta > 0 ? importeVenta - costeTotal : null

    const res = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: proyectoId,
        documentosJson: docs,
        costeProveedores: costeTotal > 0 ? costeTotal.toString() : null,
        margenEstimado: margen?.toString() || null,
      }),
    })

    if (res.ok) fetchData()
  }

  // KPIs
  const totalProyectos = proyectos.length
  const totalVenta = proyectos.reduce((sum, p) => sum + (p.importeVenta || 0), 0)
  const totalCoste = proyectos.reduce((sum, p) => sum + (p.costeProveedores || 0), 0)
  const totalMargen = totalVenta - totalCoste

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RocketLaunchIcon className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Proyectos Singulares</h2>
              <p className="text-sm text-gray-500">Trabajos puntuales adjudicados por Draxton (independientes de contratos recurrentes)</p>
            </div>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm) }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Nuevo Proyecto
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Proyectos</div>
          <div className="text-2xl font-bold text-indigo-700 mt-1">{totalProyectos}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Importe Venta</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalVenta)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Coste Proveedores</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{formatCurrency(totalCoste)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Margen</div>
          <div className={`text-2xl font-bold mt-1 ${totalMargen >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(totalMargen)}</div>
          {totalVenta > 0 && <div className="text-xs text-gray-500 mt-0.5">{((totalMargen / totalVenta) * 100).toFixed(1)}%</div>}
        </div>
      </div>

      {/* Lista de proyectos */}
      {proyectos.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <RocketLaunchIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No hay proyectos singulares registrados.</p>
          <p className="text-gray-400 text-sm mt-1">Haz clic en &quot;Nuevo Proyecto&quot; para crear uno.</p>
        </div>
      )}

      {proyectos.map(p => (
        <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Cabecera del proyecto */}
          <div
            className="px-6 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {expandedId === p.id
                  ? <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                  : <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                }
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{p.titulo}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.ubicacion && <span className="text-xs text-gray-500">{p.ubicacion}</span>}
                    {p.ubicacion && p.fechaInicio && <span className="text-xs text-gray-300">·</span>}
                    {p.fechaInicio && <span className="text-xs text-gray-500">{new Date(p.fechaInicio).toLocaleDateString('es-ES')}</span>}
                  </div>
                </div>
                {getEstadoBadge(p.estado)}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs text-gray-500">Venta</div>
                  <div className="text-sm font-semibold text-gray-900">{formatCurrency(p.importeVenta)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Margen</div>
                  <div className={`text-sm font-semibold ${(p.margenEstimado || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatCurrency(p.margenEstimado)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={e => { e.stopPropagation(); handleEdit(p) }} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded">
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleDelete(p.id) }} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Detalle expandido */}
          {expandedId === p.id && (
            <div className="px-6 py-4 space-y-4">
              {/* Info económica */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="text-xs text-blue-600 font-medium">Importe Venta</div>
                  <div className="text-lg font-bold text-blue-800">{formatCurrency(p.importeVenta)}</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-3">
                  <div className="text-xs text-amber-600 font-medium">Coste Proveedores</div>
                  <div className="text-lg font-bold text-amber-800">{formatCurrency(p.costeProveedores)}</div>
                </div>
                <div className={`rounded-lg p-3 ${(p.margenEstimado || 0) >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className={`text-xs font-medium ${(p.margenEstimado || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>Margen</div>
                  <div className={`text-lg font-bold ${(p.margenEstimado || 0) >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                    {formatCurrency(p.margenEstimado)}
                    {p.importeVenta && p.margenEstimado ? ` (${((p.margenEstimado / p.importeVenta) * 100).toFixed(1)}%)` : ''}
                  </div>
                </div>
              </div>

              {p.descripcion && (
                <p className="text-sm text-gray-600">{p.descripcion}</p>
              )}

              {/* Documentación */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <DocumentIcon className="w-4 h-4" />
                    Documentación ({(p.documentosJson || []).length})
                  </h4>
                  <button
                    onClick={() => setShowDocForm(showDocForm === p.id ? null : p.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100"
                  >
                    <PlusIcon className="w-3 h-3" />
                    Añadir Documento
                  </button>
                </div>

                {/* Form para añadir documento */}
                {showDocForm === p.id && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-3 border border-gray-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del documento *</label>
                        <input
                          type="text"
                          value={docForm.nombre}
                          onChange={e => setDocForm({ ...docForm, nombre: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                          placeholder="Ej: Presupuesto Wifidom PR-2026003422"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Tipo *</label>
                        <select
                          value={docForm.tipo}
                          onChange={e => setDocForm({ ...docForm, tipo: e.target.value as Documento['tipo'] })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        >
                          {TIPOS_DOCUMENTO.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">URL del documento *</label>
                        <input
                          type="url"
                          value={docForm.url}
                          onChange={e => setDocForm({ ...docForm, url: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                          placeholder="https://sharepoint.com/..."
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                          <input
                            type="date"
                            value={docForm.fecha}
                            onChange={e => setDocForm({ ...docForm, fecha: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Importe (€)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={docForm.importe || ''}
                            onChange={e => setDocForm({ ...docForm, importe: e.target.value ? parseFloat(e.target.value) : undefined })}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor (si aplica)</label>
                        <input
                          type="text"
                          value={docForm.proveedor || ''}
                          onChange={e => setDocForm({ ...docForm, proveedor: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                          placeholder="Ej: Wifidom, Sharktek..."
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <button
                          onClick={() => handleAddDoc(p.id)}
                          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => setShowDocForm(null)}
                          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lista de documentos */}
                {(p.documentosJson || []).length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Documento</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Tipo</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Proveedor</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Fecha</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">Importe</th>
                          <th className="text-center px-3 py-2 font-medium text-gray-600">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(p.documentosJson || []).map(doc => (
                          <tr key={doc.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-900">{doc.nombre}</td>
                            <td className="px-3 py-2">{getTipoDocBadge(doc.tipo)}</td>
                            <td className="px-3 py-2 text-gray-600">{doc.proveedor || '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{doc.fecha ? new Date(doc.fecha).toLocaleDateString('es-ES') : '—'}</td>
                            <td className="px-3 py-2 text-right font-medium">{doc.importe ? formatCurrency(doc.importe) : '—'}</td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-indigo-600">
                                  <EyeIcon className="w-4 h-4" />
                                </a>
                                <button onClick={() => handleDeleteDoc(p.id, doc.id)} className="p-1 text-gray-400 hover:text-red-600">
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-4">Sin documentos. Haz clic en &quot;Añadir Documento&quot; para vincular PDFs.</p>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Modal/Form para crear/editar proyecto */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editingId ? 'Editar Proyecto' : 'Nuevo Proyecto Singular'}</h3>
              <button onClick={() => { setShowForm(false); setEditingId(null) }} className="p-1 text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título del proyecto *</label>
                <input
                  type="text"
                  value={form.titulo}
                  onChange={e => setForm({ ...form, titulo: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="Ej: WiFi Industrial Atxondo - Ruckus R650"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación / Planta</label>
                <input
                  type="text"
                  value={form.ubicacion}
                  onChange={e => setForm({ ...form, ubicacion: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="Ej: Draxton Lleida, Draxton Atxondo..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea
                  value={form.descripcion}
                  onChange={e => setForm({ ...form, descripcion: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  rows={3}
                  placeholder="Descripción del proyecto..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select
                    value={form.estado}
                    onChange={e => setForm({ ...form, estado: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    {ESTADOS.map(e => (
                      <option key={e.value} value={e.value}>{e.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
                  <select
                    value={form.prioridad}
                    onChange={e => setForm({ ...form, prioridad: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Importe Venta (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.importeVenta}
                    onChange={e => setForm({ ...form, importeVenta: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="Importe del pedido de cliente"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Coste Proveedores (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.costeProveedores}
                    onChange={e => setForm({ ...form, costeProveedores: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="Suma de presupuestos proveedor"
                  />
                </div>
              </div>

              {form.importeVenta && form.costeProveedores && (
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <span className="text-xs text-green-600 font-medium">Margen estimado: </span>
                  <span className="text-sm font-bold text-green-800">
                    {formatCurrency(parseFloat(form.importeVenta) - parseFloat(form.costeProveedores))}
                    {' '}({(((parseFloat(form.importeVenta) - parseFloat(form.costeProveedores)) / parseFloat(form.importeVenta)) * 100).toFixed(1)}%)
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
                  <input
                    type="date"
                    value={form.fechaInicio}
                    onChange={e => setForm({ ...form, fechaInicio: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha fin prevista</label>
                  <input
                    type="date"
                    value={form.fechaFinPrevista}
                    onChange={e => setForm({ ...form, fechaFinPrevista: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => { setShowForm(false); setEditingId(null) }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  {editingId ? 'Guardar Cambios' : 'Crear Proyecto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
