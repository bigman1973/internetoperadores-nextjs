'use client'

import { useState, useEffect, useRef } from 'react'
import { RocketLaunchIcon, PlusIcon, DocumentIcon, TrashIcon, PencilIcon, XMarkIcon, EyeIcon, ChevronDownIcon, ChevronRightIcon, ArrowUpTrayIcon, UserGroupIcon, BuildingOfficeIcon, CurrencyEuroIcon } from '@heroicons/react/24/outline'

// ===== INTERFACES =====
interface Proveedor {
  id: string
  proyectoId: string
  proveedor: string
  concepto: string | null
  importe: number | null
  estado: string
  documentoUrl: string | null
  documentoNombre: string | null
  notas: string | null
}

interface PersonalAsignado {
  id: string
  proyectoId: string
  empleadoId: string
  porcentajeDedicacion: number
  nivelTecnico: number | null
  rol: string | null
  funciones: string | null
  fechaInicio: string | null
  fechaFin: string | null
  activo: boolean
  notas: string | null
  empleado: { id: string; nombreCompleto: string; categoria: string | null; departamento: string | null }
}

interface Documento {
  id: string
  nombre: string
  tipo: 'presupuesto_cliente' | 'pedido_cliente' | 'presupuesto_proveedor' | 'albaran' | 'factura' | 'fin_obra' | 'otro'
  url: string
  fecha: string
  importe?: number
  proveedor?: string
}

interface Proyecto {
  id: string
  contratoDraxtonId: string | null
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
  proveedores: Proveedor[]
  personalAsignado: PersonalAsignado[]
}

// ===== CONSTANTES =====
const TIPOS_DOCUMENTO: { value: Documento['tipo']; label: string; color: string }[] = [
  { value: 'presupuesto_cliente', label: 'Presupuesto a Cliente', color: 'bg-blue-100 text-blue-700' },
  { value: 'pedido_cliente', label: 'Pedido de Cliente', color: 'bg-green-100 text-green-700' },
  { value: 'presupuesto_proveedor', label: 'Presupuesto Proveedor', color: 'bg-amber-100 text-amber-700' },
  { value: 'albaran', label: 'Albarán', color: 'bg-purple-100 text-purple-700' },
  { value: 'factura', label: 'Factura', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'fin_obra', label: 'Fin de Obra', color: 'bg-teal-100 text-teal-700' },
  { value: 'otro', label: 'Otro', color: 'bg-gray-100 text-gray-600' },
]

const ESTADOS: { value: string; label: string; color: string }[] = [
  { value: 'planificado', label: 'Planificado', color: 'bg-gray-100 text-gray-700' },
  { value: 'en_curso', label: 'En Curso', color: 'bg-blue-100 text-blue-700' },
  { value: 'completado', label: 'Completado', color: 'bg-green-100 text-green-700' },
  { value: 'pausado', label: 'Pausado', color: 'bg-amber-100 text-amber-700' },
]

const ESTADOS_PROVEEDOR = [
  { value: 'pendiente', label: 'Pendiente', color: 'bg-gray-100 text-gray-700' },
  { value: 'aceptado', label: 'Aceptado', color: 'bg-green-100 text-green-700' },
  { value: 'rechazado', label: 'Rechazado', color: 'bg-red-100 text-red-700' },
  { value: 'ejecutado', label: 'Ejecutado', color: 'bg-blue-100 text-blue-700' },
]

// ===== HELPERS =====
function formatCurrency(value: number | null | undefined): string {
  if (!value && value !== 0) return '—'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
}

function getEstadoBadge(estado: string) {
  const e = ESTADOS.find(s => s.value === estado)
  return e ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${e.color}`}>{e.label}</span> : <span className="text-xs">{estado}</span>
}

function getTipoDocBadge(tipo: Documento['tipo']) {
  const t = TIPOS_DOCUMENTO.find(td => td.value === tipo)
  return t ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${t.color}`}>{t.label}</span> : <span className="text-xs">{tipo}</span>
}

function getEstadoProvBadge(estado: string) {
  const e = ESTADOS_PROVEEDOR.find(s => s.value === estado)
  return e ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${e.color}`}>{e.label}</span> : <span className="text-xs">{estado}</span>
}

// ===== COMPONENTE PRINCIPAL =====
export default function DraxtonProyectosSingularesPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'datos' | 'proveedores' | 'personal' | 'documentacion'>('datos')
  const [empleados, setEmpleados] = useState<any[]>([])

  // Forms
  const [showProvForm, setShowProvForm] = useState(false)
  const [showPersonalForm, setShowPersonalForm] = useState(false)
  const [showDocForm, setShowDocForm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const emptyForm = {
    titulo: '', descripcion: '', estado: 'en_curso', prioridad: 'media',
    ubicacion: '', importeVenta: '', fechaInicio: '', fechaFinPrevista: '', responsableId: '',
  }
  const [form, setForm] = useState(emptyForm)

  const [provForm, setProvForm] = useState({ proveedor: '', concepto: '', importe: '', estado: 'pendiente', notas: '' })
  const [personalForm, setPersonalForm] = useState({ empleadoId: '', porcentajeDedicacion: '100', nivelTecnico: '', rol: '', funciones: '', fechaInicio: '', fechaFin: '' })
  const [docForm, setDocForm] = useState({ nombre: '', tipo: 'presupuesto_cliente' as Documento['tipo'], fecha: new Date().toISOString().split('T')[0], importe: '', proveedor: '', file: null as File | null })

  // ===== DATA FETCHING =====
  useEffect(() => { fetchData(); fetchEmpleados() }, [])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato')
      if (res.ok) {
        const data = await res.json()
        setProyectos(data.filter((p: Proyecto) => p.categoria === 'proyecto'))
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchEmpleados = async () => {
    try {
      const res = await fetch('/api/admin/empleados?activo=true')
      if (res.ok) {
        const data = await res.json()
        setEmpleados(Array.isArray(data) ? data : data.empleados || [])
      }
    } catch (e) { console.error(e) }
  }

  // ===== PROYECTO CRUD =====
  const handleSave = async () => {
    if (!form.titulo) { alert('El título es obligatorio'); return }
    const payload: any = {
      titulo: form.titulo, descripcion: form.descripcion || null, estado: form.estado,
      prioridad: form.prioridad, ubicacion: form.ubicacion || null, categoria: 'proyecto',
      importeVenta: form.importeVenta || null, responsableId: form.responsableId || null,
      fechaInicio: form.fechaInicio || null, fechaFinPrevista: form.fechaFinPrevista || null,
    }
    if (editingId) payload.id = editingId
    const res = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) { setShowForm(false); setEditingId(null); setForm(emptyForm); fetchData() }
    else { const err = await res.json(); alert('Error: ' + (err.error || 'Error desconocido')) }
  }

  const handleEdit = (p: Proyecto) => {
    setForm({
      titulo: p.titulo, descripcion: p.descripcion || '', estado: p.estado,
      prioridad: p.prioridad, ubicacion: p.ubicacion || '',
      importeVenta: p.importeVenta?.toString() || '', responsableId: p.responsableId || '',
      fechaInicio: p.fechaInicio?.split('T')[0] || '', fechaFinPrevista: p.fechaFinPrevista?.split('T')[0] || '',
    })
    setEditingId(p.id); setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este proyecto?')) return
    await fetch(`/api/admin/clientes/ggcc/draxton/proyectos-contrato?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  // ===== PROVEEDORES =====
  const handleAddProveedor = async (proyectoId: string) => {
    if (!provForm.proveedor) { alert('El nombre del proveedor es obligatorio'); return }
    const res = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-proveedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyectoId, ...provForm }),
    })
    if (res.ok) { setShowProvForm(false); setProvForm({ proveedor: '', concepto: '', importe: '', estado: 'pendiente', notas: '' }); fetchData() }
    else { const err = await res.json(); alert('Error: ' + (err.error || 'Error')) }
  }

  const handleDeleteProveedor = async (id: string) => {
    if (!confirm('¿Eliminar este proveedor?')) return
    await fetch(`/api/admin/clientes/ggcc/draxton/proyectos-proveedores?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  // ===== PERSONAL =====
  const handleAddPersonal = async (proyectoId: string) => {
    if (!personalForm.empleadoId) { alert('Selecciona un empleado'); return }
    const res = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-personal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyectoId, ...personalForm }),
    })
    if (res.ok) { setShowPersonalForm(false); setPersonalForm({ empleadoId: '', porcentajeDedicacion: '100', nivelTecnico: '', rol: '', funciones: '', fechaInicio: '', fechaFin: '' }); fetchData() }
    else { const err = await res.json(); alert('Error: ' + (err.error || 'Error')) }
  }

  const handleDeletePersonal = async (id: string) => {
    if (!confirm('¿Desasignar esta persona?')) return
    await fetch(`/api/admin/clientes/ggcc/draxton/proyectos-personal?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  // ===== DOCUMENTACIÓN =====
  const handleAddDoc = async (proyectoId: string) => {
    if (!docForm.file) { alert('Selecciona un archivo'); return }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', docForm.file)
      const uploadRes = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato/upload', { method: 'POST', body: formData })
      if (!uploadRes.ok) { const err = await uploadRes.json(); alert('Error subiendo: ' + (err.error || 'Error')); setUploading(false); return }
      const uploadData = await uploadRes.json()

      const proyecto = proyectos.find(p => p.id === proyectoId)
      if (!proyecto) { setUploading(false); return }

      const newDoc: Documento = {
        id: crypto.randomUUID(), nombre: docForm.nombre || docForm.file.name,
        tipo: docForm.tipo, url: uploadData.url, fecha: docForm.fecha,
        importe: docForm.importe ? Number(docForm.importe) : undefined,
        proveedor: docForm.proveedor || undefined,
      }
      const docs = [...(proyecto.documentosJson || []), newDoc]

      await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proyectoId, documentosJson: docs }),
      })
      setShowDocForm(false)
      setDocForm({ nombre: '', tipo: 'presupuesto_cliente', fecha: new Date().toISOString().split('T')[0], importe: '', proveedor: '', file: null })
      if (fileInputRef.current) fileInputRef.current.value = ''
      fetchData()
    } catch (error: any) { alert('Error: ' + error.message) }
    finally { setUploading(false) }
  }

  const handleDeleteDoc = async (proyectoId: string, docId: string) => {
    if (!confirm('¿Eliminar este documento?')) return
    const proyecto = proyectos.find(p => p.id === proyectoId)
    if (!proyecto) return
    const docs = (proyecto.documentosJson || []).filter(d => d.id !== docId)
    await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: proyectoId, documentosJson: docs }),
    })
    fetchData()
  }

  // ===== KPIs =====
  const totalProyectos = proyectos.length
  const totalVenta = proyectos.reduce((sum, p) => sum + (p.importeVenta || 0), 0)
  const totalCoste = proyectos.reduce((sum, p) => sum + (p.costeProveedores || 0), 0)
  const totalMargen = totalVenta - totalCoste

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RocketLaunchIcon className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Proyectos Singulares</h2>
              <p className="text-sm text-gray-500">Trabajos puntuales adjudicados por Draxton</p>
            </div>
          </div>
          <button onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm) }} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            <PlusIcon className="w-4 h-4" /> Nuevo Proyecto
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

      {/* Tabla resumen */}
      {proyectos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Proyecto</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Ubicación</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600">Estado</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Venta</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Coste Prov.</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Margen</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600">Proveedores</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600">Personal</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600">Docs</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {proyectos.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 cursor-pointer ${expandedId === p.id ? 'bg-indigo-50' : ''}`} onClick={() => { setExpandedId(expandedId === p.id ? null : p.id); setActiveTab('datos') }}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{p.titulo}</td>
                  <td className="px-4 py-2.5 text-gray-600">{p.ubicacion || '—'}</td>
                  <td className="px-4 py-2.5 text-center">{getEstadoBadge(p.estado)}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-900">{formatCurrency(p.importeVenta)}</td>
                  <td className="px-4 py-2.5 text-right text-red-600">{formatCurrency(p.costeProveedores)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`font-medium ${(p.margenEstimado || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(p.margenEstimado)}
                    </span>
                    {p.importeVenta && p.margenEstimado ? <span className="text-[9px] text-gray-400 block">{((Number(p.margenEstimado) / Number(p.importeVenta)) * 100).toFixed(1)}%</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{p.proveedores?.length || 0}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{p.personalAsignado?.length || 0}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{(p.documentosJson || []).length}</td>
                  <td className="px-4 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleEdit(p)} className="p-1 text-gray-400 hover:text-indigo-600"><PencilIcon className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(p.id)} className="p-1 text-gray-400 hover:text-red-600"><TrashIcon className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {proyectos.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <RocketLaunchIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No hay proyectos singulares registrados.</p>
        </div>
      )}

      {/* ===== FICHA EXPANDIDA ===== */}
      {expandedId && (() => {
        const p = proyectos.find(pr => pr.id === expandedId)
        if (!p) return null
        return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Tabs */}
            <div className="border-b border-gray-200 px-6">
              <nav className="flex gap-6 -mb-px">
                {[
                  { key: 'datos', label: 'Datos Generales', icon: RocketLaunchIcon },
                  { key: 'proveedores', label: `Proveedores (${p.proveedores?.length || 0})`, icon: BuildingOfficeIcon },
                  { key: 'personal', label: `Personal (${p.personalAsignado?.length || 0})`, icon: UserGroupIcon },
                  { key: 'documentacion', label: `Documentación (${(p.documentosJson || []).length})`, icon: DocumentIcon },
                ].map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
                    className={`flex items-center gap-2 py-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    <tab.icon className="w-4 h-4" /> {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-6">
              {/* TAB: DATOS GENERALES */}
              {activeTab === 'datos' && (
                <div className="space-y-4">
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
                        {p.importeVenta && p.margenEstimado ? ` (${((Number(p.margenEstimado) / Number(p.importeVenta)) * 100).toFixed(1)}%)` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-gray-500">Ubicación:</span> <span className="font-medium">{p.ubicacion || '—'}</span></div>
                    <div><span className="text-gray-500">Responsable:</span> <span className="font-medium">{p.responsable?.nombreCompleto || '—'}</span></div>
                    <div><span className="text-gray-500">Fecha inicio:</span> <span className="font-medium">{p.fechaInicio ? new Date(p.fechaInicio).toLocaleDateString('es-ES') : '—'}</span></div>
                    <div><span className="text-gray-500">Fecha fin prevista:</span> <span className="font-medium">{p.fechaFinPrevista ? new Date(p.fechaFinPrevista).toLocaleDateString('es-ES') : '—'}</span></div>
                    <div><span className="text-gray-500">Prioridad:</span> <span className="font-medium capitalize">{p.prioridad}</span></div>
                    <div><span className="text-gray-500">Estado:</span> {getEstadoBadge(p.estado)}</div>
                  </div>
                  {p.descripcion && <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{p.descripcion}</p>}
                </div>
              )}

              {/* TAB: PROVEEDORES */}
              {activeTab === 'proveedores' && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button onClick={() => setShowProvForm(!showProvForm)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100">
                      <PlusIcon className="w-3 h-3" /> Añadir Proveedor
                    </button>
                  </div>

                  {showProvForm && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor *</label>
                          <input type="text" value={provForm.proveedor} onChange={e => setProvForm({ ...provForm, proveedor: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: Wifidom, Sharktek..." />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Concepto</label>
                          <input type="text" value={provForm.concepto} onChange={e => setProvForm({ ...provForm, concepto: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: Equipos Ruckus R650" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Importe (€)</label>
                          <input type="number" step="0.01" value={provForm.importe} onChange={e => setProvForm({ ...provForm, importe: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0,00" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                          <select value={provForm.estado} onChange={e => setProvForm({ ...provForm, estado: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                            {ESTADOS_PROVEEDOR.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                          <input type="text" value={provForm.notas} onChange={e => setProvForm({ ...provForm, notas: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Notas adicionales..." />
                        </div>
                        <div className="col-span-2 flex gap-2">
                          <button onClick={() => handleAddProveedor(p.id)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">Guardar</button>
                          <button onClick={() => setShowProvForm(false)} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300">Cancelar</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {(p.proveedores?.length || 0) > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Proveedor</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Concepto</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">Importe</th>
                          <th className="text-center px-3 py-2 font-medium text-gray-600">Estado</th>
                          <th className="text-center px-3 py-2 font-medium text-gray-600">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {p.proveedores.map(prov => (
                          <tr key={prov.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-900">{prov.proveedor}</td>
                            <td className="px-3 py-2 text-gray-600">{prov.concepto || '—'}</td>
                            <td className="px-3 py-2 text-right font-medium">{prov.importe ? formatCurrency(Number(prov.importe)) : '—'}</td>
                            <td className="px-3 py-2 text-center">{getEstadoProvBadge(prov.estado)}</td>
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => handleDeleteProveedor(prov.id)} className="p-1 text-gray-400 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t">
                        <tr>
                          <td colSpan={2} className="px-3 py-2 text-sm font-semibold text-gray-700">Total Proveedores</td>
                          <td className="px-3 py-2 text-right font-bold text-red-700">{formatCurrency(p.proveedores.reduce((s, pv) => s + (pv.importe ? Number(pv.importe) : 0), 0))}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-6">Sin proveedores asignados.</p>
                  )}
                </div>
              )}

              {/* TAB: PERSONAL */}
              {activeTab === 'personal' && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button onClick={() => setShowPersonalForm(!showPersonalForm)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100">
                      <PlusIcon className="w-3 h-3" /> Asignar Persona
                    </button>
                  </div>

                  {showPersonalForm && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Empleado *</label>
                          <select value={personalForm.empleadoId} onChange={e => setPersonalForm({ ...personalForm, empleadoId: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                            <option value="">Seleccionar...</option>
                            {empleados.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.nombreCompleto}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Rol</label>
                          <input type="text" value={personalForm.rol} onChange={e => setPersonalForm({ ...personalForm, rol: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: Instalador, Responsable..." />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Nivel Técnico</label>
                          <select value={personalForm.nivelTecnico} onChange={e => setPersonalForm({ ...personalForm, nivelTecnico: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                            <option value="">Sin asignar</option>
                            <option value="1">N1 - Básico</option>
                            <option value="2">N2 - Intermedio</option>
                            <option value="3">N3 - Avanzado</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Dedicación %</label>
                          <input type="number" min="1" max="100" value={personalForm.porcentajeDedicacion} onChange={e => setPersonalForm({ ...personalForm, porcentajeDedicacion: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Funciones</label>
                          <input type="text" value={personalForm.funciones} onChange={e => setPersonalForm({ ...personalForm, funciones: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Descripción de funciones..." />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Inicio</label>
                            <input type="date" value={personalForm.fechaInicio} onChange={e => setPersonalForm({ ...personalForm, fechaInicio: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Fin</label>
                            <input type="date" value={personalForm.fechaFin} onChange={e => setPersonalForm({ ...personalForm, fechaFin: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                          </div>
                        </div>
                        <div className="col-span-2 flex gap-2">
                          <button onClick={() => handleAddPersonal(p.id)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">Asignar</button>
                          <button onClick={() => setShowPersonalForm(false)} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300">Cancelar</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {(p.personalAsignado?.length || 0) > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Empleado</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Rol</th>
                          <th className="text-center px-3 py-2 font-medium text-gray-600">Nivel</th>
                          <th className="text-center px-3 py-2 font-medium text-gray-600">Dedicación</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Funciones</th>
                          <th className="text-center px-3 py-2 font-medium text-gray-600">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {p.personalAsignado.map(pa => (
                          <tr key={pa.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-900">{pa.empleado.nombreCompleto}</td>
                            <td className="px-3 py-2 text-gray-600">{pa.rol || '—'}</td>
                            <td className="px-3 py-2 text-center">
                              {pa.nivelTecnico ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${pa.nivelTecnico === 3 ? 'bg-red-100 text-red-700' : pa.nivelTecnico === 2 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>N{pa.nivelTecnico}</span> : '—'}
                            </td>
                            <td className="px-3 py-2 text-center font-medium">{pa.porcentajeDedicacion}%</td>
                            <td className="px-3 py-2 text-gray-600 text-xs">{pa.funciones || '—'}</td>
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => handleDeletePersonal(pa.id)} className="p-1 text-gray-400 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-6">Sin personal asignado.</p>
                  )}
                </div>
              )}

              {/* TAB: DOCUMENTACIÓN */}
              {activeTab === 'documentacion' && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button onClick={() => setShowDocForm(!showDocForm)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100">
                      <PlusIcon className="w-3 h-3" /> Subir Documento
                    </button>
                  </div>

                  {showDocForm && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Archivo *</label>
                          <label className="cursor-pointer">
                            <div className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg ${docForm.file ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-indigo-400'}`}>
                              <ArrowUpTrayIcon className="w-5 h-5 text-gray-400" />
                              <span className="text-sm text-gray-600">{docForm.file ? docForm.file.name : 'Seleccionar archivo...'}</span>
                            </div>
                            <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx" className="hidden"
                              onChange={e => { const file = e.target.files?.[0] || null; setDocForm({ ...docForm, file, nombre: docForm.nombre || (file?.name.replace(/\.[^/.]+$/, '') || '') }) }} />
                          </label>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                          <input type="text" value={docForm.nombre} onChange={e => setDocForm({ ...docForm, nombre: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Nombre del documento" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo *</label>
                          <select value={docForm.tipo} onChange={e => setDocForm({ ...docForm, tipo: e.target.value as Documento['tipo'] })} className="w-full px-3 py-2 border rounded-lg text-sm">
                            {TIPOS_DOCUMENTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                          <input type="date" value={docForm.fecha} onChange={e => setDocForm({ ...docForm, fecha: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Importe (€)</label>
                          <input type="number" step="0.01" value={docForm.importe} onChange={e => setDocForm({ ...docForm, importe: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0,00" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor</label>
                          <input type="text" value={docForm.proveedor} onChange={e => setDocForm({ ...docForm, proveedor: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Si aplica..." />
                        </div>
                        <div className="col-span-2 flex gap-2">
                          <button onClick={() => handleAddDoc(p.id)} disabled={uploading || !docForm.file} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                            {uploading ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> Subiendo...</> : <><ArrowUpTrayIcon className="w-4 h-4" /> Subir y Guardar</>}
                          </button>
                          <button onClick={() => { setShowDocForm(false); setDocForm({ nombre: '', tipo: 'presupuesto_cliente', fecha: new Date().toISOString().split('T')[0], importe: '', proveedor: '', file: null }) }} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300">Cancelar</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {(p.documentosJson || []).length > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Documento</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Tipo</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Proveedor</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">Importe</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Fecha</th>
                          <th className="text-center px-3 py-2 font-medium text-gray-600">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(p.documentosJson || []).map(doc => (
                          <tr key={doc.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-900">{doc.nombre}</td>
                            <td className="px-3 py-2">{getTipoDocBadge(doc.tipo)}</td>
                            <td className="px-3 py-2 text-gray-600">{doc.proveedor || '—'}</td>
                            <td className="px-3 py-2 text-right font-medium">{doc.importe ? formatCurrency(doc.importe) : '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{doc.fecha ? new Date(doc.fecha).toLocaleDateString('es-ES') : '—'}</td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-indigo-600"><EyeIcon className="w-4 h-4" /></a>
                                <button onClick={() => handleDeleteDoc(p.id, doc.id)} className="p-1 text-gray-400 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-6">Sin documentos. Sube presupuestos, pedidos, albaranes o documentación de fin de obra.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ===== MODAL CREAR/EDITAR PROYECTO ===== */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editingId ? 'Editar Proyecto' : 'Nuevo Proyecto Singular'}</h3>
              <button onClick={() => { setShowForm(false); setEditingId(null) }} className="p-1 text-gray-400 hover:text-gray-600"><XMarkIcon className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input type="text" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: WiFi Industrial Atxondo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
                <input type="text" value={form.ubicacion} onChange={e => setForm({ ...form, ubicacion: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: Draxton Lleida" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                    {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
                  <select value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Importe Venta (€)</label>
                  <input type="number" step="0.01" value={form.importeVenta} onChange={e => setForm({ ...form, importeVenta: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Del pedido de cliente" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
                  <select value={form.responsableId} onChange={e => setForm({ ...form, responsableId: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">Sin asignar</option>
                    {empleados.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.nombreCompleto}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
                  <input type="date" value={form.fechaInicio} onChange={e => setForm({ ...form, fechaInicio: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha fin prevista</label>
                  <input type="date" value={form.fechaFinPrevista} onChange={e => setForm({ ...form, fechaFinPrevista: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => { setShowForm(false); setEditingId(null) }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">{editingId ? 'Guardar Cambios' : 'Crear Proyecto'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
