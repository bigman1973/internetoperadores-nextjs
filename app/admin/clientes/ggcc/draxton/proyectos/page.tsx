'use client'

import { useState, useEffect } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, FunnelIcon } from '@heroicons/react/24/outline'

interface Proyecto {
  id: string
  contratoDraxtonId: string
  contratoDraxton?: { id: string; titulo: string }
  responsableId: string | null
  responsable?: { id: string; nombreCompleto: string } | null
  titulo: string
  descripcion: string | null
  categoria: string
  estado: string
  impacto: string | null
  ahorroEstimado: number | null
  prioridad: string
  fechaInicio: string | null
  fechaFinPrevista: string | null
  orden: number
}

interface Contrato {
  id: string
  titulo: string
}

const CATEGORIAS = [
  { value: 'proyecto', label: 'Proyecto activo', color: 'emerald' },
  { value: 'mejora_ejecutada', label: 'Mejora ejecutada', color: 'blue' },
  { value: 'propuesta_futura', label: 'Propuesta futura', color: 'amber' },
]

const ESTADOS = [
  { value: 'planificado', label: 'Planificado', color: 'amber' },
  { value: 'en_curso', label: 'En curso', color: 'blue' },
  { value: 'completado', label: 'Completado', color: 'green' },
  { value: 'pausado', label: 'Pausado', color: 'gray' },
]

export default function DraxtonProyectosPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [empleados, setEmpleados] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [filtroContrato, setFiltroContrato] = useState<string>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todos')
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [filtroResponsable, setFiltroResponsable] = useState<string>('todos')

  // Formulario
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    titulo: '', descripcion: '', categoria: 'proyecto', estado: 'en_curso',
    impacto: '', ahorroEstimado: '', prioridad: 'media', responsableId: '',
    fechaInicio: '', fechaFinPrevista: '', contratoDraxtonId: '',
  })

  useEffect(() => {
    fetchProyectos()
    fetchContratos()
    fetchEmpleados()
  }, [])

  async function fetchProyectos() {
    try {
      const res = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato')
      if (res.ok) {
        const data = await res.json()
        setProyectos(data)
      }
    } catch (err) {
      console.error('Error al cargar proyectos:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchContratos() {
    try {
      const res = await fetch('/api/admin/clientes/ggcc/draxton/contratos')
      if (res.ok) {
        const data = await res.json()
        setContratos(data)
      }
    } catch (err) {
      console.error('Error al cargar contratos:', err)
    }
  }

  async function fetchEmpleados() {
    try {
      const res = await fetch('/api/admin/empleados?estado=todos&periodo=mes&mes=' + new Date().getMonth())
      if (res.ok) {
        const data = await res.json()
        setEmpleados(data.empleados || [])
      }
    } catch (err) {
      console.error('Error al cargar empleados:', err)
    }
  }

  async function guardarProyecto() {
    if (!form.titulo || !form.contratoDraxtonId) return
    try {
      const method = editingId ? 'PUT' : 'POST'
      const body = editingId
        ? { id: editingId, ...form, ahorroEstimado: form.ahorroEstimado || null }
        : { ...form, ahorroEstimado: form.ahorroEstimado || null }
      await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      resetForm()
      await fetchProyectos()
    } catch (err) {
      console.error('Error guardando proyecto:', err)
    }
  }

  async function eliminarProyecto(id: string) {
    if (!confirm('¿Eliminar este proyecto?')) return
    try {
      await fetch(`/api/admin/clientes/ggcc/draxton/proyectos-contrato?id=${id}`, { method: 'DELETE' })
      await fetchProyectos()
    } catch (err) {
      console.error('Error eliminando proyecto:', err)
    }
  }

  function editarProyecto(proy: Proyecto) {
    setEditingId(proy.id)
    setForm({
      titulo: proy.titulo,
      descripcion: proy.descripcion || '',
      categoria: proy.categoria,
      estado: proy.estado,
      impacto: proy.impacto || '',
      ahorroEstimado: proy.ahorroEstimado ? String(proy.ahorroEstimado) : '',
      prioridad: proy.prioridad,
      responsableId: proy.responsableId || '',
      fechaInicio: proy.fechaInicio ? proy.fechaInicio.split('T')[0] : '',
      fechaFinPrevista: proy.fechaFinPrevista ? proy.fechaFinPrevista.split('T')[0] : '',
      contratoDraxtonId: proy.contratoDraxtonId,
    })
    setShowForm(true)
  }

  function resetForm() {
    setShowForm(false)
    setEditingId(null)
    setForm({ titulo: '', descripcion: '', categoria: 'proyecto', estado: 'en_curso', impacto: '', ahorroEstimado: '', prioridad: 'media', responsableId: '', fechaInicio: '', fechaFinPrevista: '', contratoDraxtonId: '' })
  }

  // Filtrar proyectos
  const proyectosFiltrados = proyectos.filter(p => {
    if (filtroContrato !== 'todos' && p.contratoDraxtonId !== filtroContrato) return false
    if (filtroCategoria !== 'todos' && p.categoria !== filtroCategoria) return false
    if (filtroEstado !== 'todos' && p.estado !== filtroEstado) return false
    if (filtroResponsable !== 'todos' && p.responsableId !== filtroResponsable) return false
    return true
  })

  // KPIs
  const totalProyectos = proyectos.filter(p => p.categoria === 'proyecto').length
  const totalMejoras = proyectos.filter(p => p.categoria === 'mejora_ejecutada').length
  const totalPropuestas = proyectos.filter(p => p.categoria === 'propuesta_futura').length
  const totalAhorro = proyectos.reduce((s, p) => s + (Number(p.ahorroEstimado) || 0), 0)
  const enCurso = proyectos.filter(p => p.estado === 'en_curso').length
  const completados = proyectos.filter(p => p.estado === 'completado').length

  // Responsables únicos para filtro
  const responsablesUnicos = [...new Map(proyectos.filter(p => p.responsable).map(p => [p.responsableId, p.responsable])).values()]

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Proyectos activos</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{totalProyectos}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Mejoras ejecutadas</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{totalMejoras}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Propuestas futuras</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{totalPropuestas}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">En curso</div>
          <div className="text-2xl font-bold text-indigo-700 mt-1">{enCurso}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Completados</div>
          <div className="text-2xl font-bold text-green-700 mt-1">{completados}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Ahorro estimado</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{totalAhorro.toLocaleString('es-ES', { minimumFractionDigits: 0 })}€</div>
        </div>
      </div>

      {/* Filtros + Botón nuevo */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <FunnelIcon className="w-4 h-4 text-gray-400" />
            <select value={filtroContrato} onChange={e => setFiltroContrato(e.target.value)} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5">
              <option value="todos">Todos los contratos</option>
              {contratos.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
            </select>
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5">
              <option value="todos">Todas las categorías</option>
              {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5">
              <option value="todos">Todos los estados</option>
              {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
            <select value={filtroResponsable} onChange={e => setFiltroResponsable(e.target.value)} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5">
              <option value="todos">Todos los responsables</option>
              {responsablesUnicos.map((r: any) => <option key={r.id} value={r.id}>{r.nombreCompleto}</option>)}
            </select>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Nuevo Proyecto
          </button>
        </div>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="bg-white rounded-xl border border-emerald-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">{editingId ? 'Editar Proyecto' : 'Nuevo Proyecto'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600 font-medium block mb-1">Título *</label>
              <input type="text" value={form.titulo} onChange={e => setForm({...form, titulo: e.target.value})} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" placeholder="Nombre del proyecto" />
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">Contrato *</label>
              <select value={form.contratoDraxtonId} onChange={e => setForm({...form, contratoDraxtonId: e.target.value})} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
                <option value="">-- Seleccionar contrato --</option>
                {contratos.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">Categoría</label>
              <select value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">Estado</label>
              <select value={form.estado} onChange={e => setForm({...form, estado: e.target.value})} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
                {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">Prioridad</label>
              <select value={form.prioridad} onChange={e => setForm({...form, prioridad: e.target.value})} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">Responsable</label>
              <select value={form.responsableId} onChange={e => setForm({...form, responsableId: e.target.value})} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
                <option value="">-- Sin asignar --</option>
                {empleados.filter(e => e.estado === 'ACTIVO').map((emp: any) => (
                  <option key={emp.id} value={emp.id}>{emp.nombreCompleto}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">Ahorro estimado (€)</label>
              <input type="number" step="0.01" value={form.ahorroEstimado} onChange={e => setForm({...form, ahorroEstimado: e.target.value})} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">Descripción</label>
              <textarea value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" rows={3} placeholder="Descripción del proyecto..." />
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">Impacto operativo</label>
              <textarea value={form.impacto} onChange={e => setForm({...form, impacto: e.target.value})} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" rows={3} placeholder="Impacto en la operativa..." />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">Fecha inicio</label>
              <input type="date" value={form.fechaInicio} onChange={e => setForm({...form, fechaInicio: e.target.value})} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">Fecha fin prevista</label>
              <input type="date" value={form.fechaFinPrevista} onChange={e => setForm({...form, fechaFinPrevista: e.target.value})} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={guardarProyecto} className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">{editingId ? 'Actualizar' : 'Crear'} Proyecto</button>
            <button onClick={resetForm} className="px-5 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium">Cancelar</button>
          </div>
        </div>
      )}

      {/* Listado agrupado por contrato */}
      {filtroContrato === 'todos' ? (
        // Vista agrupada por contrato
        contratos.filter(c => proyectosFiltrados.some(p => p.contratoDraxtonId === c.id)).map(contrato => (
          <div key={contrato.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800">{contrato.titulo}</h3>
            </div>
            <div className="p-4 space-y-3">
              {['proyecto', 'mejora_ejecutada', 'propuesta_futura'].map(cat => {
                const items = proyectosFiltrados.filter(p => p.contratoDraxtonId === contrato.id && p.categoria === cat)
                if (items.length === 0) return null
                const catInfo = CATEGORIAS.find(c => c.value === cat)!
                const bgColor = cat === 'proyecto' ? 'bg-emerald-50 text-emerald-700' : cat === 'mejora_ejecutada' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                return (
                  <div key={cat}>
                    <p className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${bgColor} mb-2 inline-block`}>{catInfo.label} ({items.length})</p>
                    <div className="space-y-2">
                      {items.map(proy => (
                        <ProyectoCard key={proy.id} proy={proy} onEdit={editarProyecto} onDelete={eliminarProyecto} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      ) : (
        // Vista plana (un solo contrato filtrado)
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 space-y-3">
            {['proyecto', 'mejora_ejecutada', 'propuesta_futura'].map(cat => {
              const items = proyectosFiltrados.filter(p => p.categoria === cat)
              if (items.length === 0) return null
              const catInfo = CATEGORIAS.find(c => c.value === cat)!
              const bgColor = cat === 'proyecto' ? 'bg-emerald-50 text-emerald-700' : cat === 'mejora_ejecutada' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
              return (
                <div key={cat}>
                  <p className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${bgColor} mb-2 inline-block`}>{catInfo.label} ({items.length})</p>
                  <div className="space-y-2">
                    {items.map(proy => (
                      <ProyectoCard key={proy.id} proy={proy} onEdit={editarProyecto} onDelete={eliminarProyecto} showContrato />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {proyectosFiltrados.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-500">No hay proyectos que coincidan con los filtros seleccionados.</p>
        </div>
      )}
    </div>
  )
}

function ProyectoCard({ proy, onEdit, onDelete, showContrato = false }: { proy: Proyecto; onEdit: (p: Proyecto) => void; onDelete: (id: string) => void; showContrato?: boolean }) {
  const estadoInfo = ESTADOS.find(e => e.value === proy.estado)
  const estadoColor = proy.estado === 'completado' ? 'bg-green-100 text-green-700' : proy.estado === 'en_curso' ? 'bg-blue-100 text-blue-700' : proy.estado === 'planificado' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
  const dotColor = proy.estado === 'completado' ? 'bg-green-500' : proy.estado === 'en_curso' ? 'bg-blue-500' : proy.estado === 'planificado' ? 'bg-amber-500' : 'bg-gray-400'

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-3 hover:border-emerald-200 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
            <p className="text-xs font-semibold text-gray-900">{proy.titulo}</p>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${estadoColor}`}>{estadoInfo?.label || proy.estado}</span>
            {proy.prioridad === 'alta' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Alta</span>}
            {showContrato && proy.contratoDraxton && <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">{proy.contratoDraxton.titulo}</span>}
          </div>
          {proy.descripcion && <p className="text-[11px] text-gray-600 mt-1 ml-4">{proy.descripcion}</p>}
          {proy.impacto && <p className="text-[11px] text-emerald-700 mt-0.5 ml-4 italic">→ {proy.impacto}</p>}
          <div className="flex items-center gap-3 mt-1.5 ml-4 flex-wrap">
            {proy.responsable && <span className="text-[10px] text-gray-500">Resp: <strong>{proy.responsable.nombreCompleto}</strong></span>}
            {proy.ahorroEstimado && <span className="text-[10px] text-green-600 font-medium">Ahorro: {Number(proy.ahorroEstimado).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>}
            {proy.fechaInicio && <span className="text-[10px] text-gray-400">Desde: {new Date(proy.fechaInicio).toLocaleDateString('es-ES')}</span>}
            {proy.fechaFinPrevista && <span className="text-[10px] text-gray-400">Hasta: {new Date(proy.fechaFinPrevista).toLocaleDateString('es-ES')}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button onClick={() => onEdit(proy)} className="text-indigo-600 hover:text-indigo-800 p-1.5 rounded hover:bg-indigo-50">
            <PencilIcon className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(proy.id)} className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50">
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

const ESTADOS_ARRAY = [
  { value: 'planificado', label: 'Planificado' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'completado', label: 'Completado' },
  { value: 'pausado', label: 'Pausado' },
]
