'use client'
import { useState, useEffect } from 'react'

interface Planificacion { id: string; titulo: string; descripcion: string | null; prioridad: string; estado: string; fechaPropuesta: string | null; servidoresAfectados: string | null; plantasAfectadas: string | null; solicitadoPor: string | null; tecnicoAsignado: string | null; notas: string | null; ejecuciones: { id: string; fecha: string; horasDedicadas: number }[] }
interface Imputacion { id: string; contratoId: string; horas: number; notas: string | null }
interface Ejecucion { id: string; planificacionId: string | null; fecha: string; tecnicoId: string | null; tecnicoNombre: string | null; nivelTecnico: number; horasDedicadas: number; tipo: string; plantasAfectadas: string | null; descripcion: string | null; costeHora: number | null; costeTotal: number | null; totalImputado: number; pendienteImputar: number | null; imputaciones: Imputacion[]; planificacion: { titulo: string } | null }
interface Contrato { id: string; titulo: string; codigoContrato: string | null; tipo: string }
interface KPIs { totalHoras: number; totalCoste: number; horasImputadas: number; horasPendientes: number; totalEjecuciones: number; planificacionesPendientes: number }

export default function ActualizacionesPage() {
  const [tab, setTab] = useState<'planificacion' | 'ejecuciones' | 'imputacion'>('planificacion')
  const [planificaciones, setPlanificaciones] = useState<Planificacion[]>([])
  const [planHistorico, setPlanHistorico] = useState<Planificacion[]>([])
  const [ejecuciones, setEjecuciones] = useState<Ejecucion[]>([])
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [loading, setLoading] = useState(true)
  const [anio, setAnio] = useState(new Date().getFullYear())
  // Forms
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [showEjecForm, setShowEjecForm] = useState(false)
  const [showImputForm, setShowImputForm] = useState<string | null>(null) // ejecucionId
  const [formPlan, setFormPlan] = useState({ titulo: '', descripcion: '', prioridad: 'normal', fechaPropuesta: '', servidoresAfectados: '', plantasAfectadas: '', solicitadoPor: '', tecnicoAsignado: '', notas: '' })
  const [formEjec, setFormEjec] = useState({ planificacionId: '', fecha: new Date().toISOString().slice(0, 10), tecnicoNombre: 'Alejandro Martinez Cayuelas', nivelTecnico: '2', horasDedicadas: '', tipo: 'remoto', plantasAfectadas: '', descripcion: '', costeHora: '' })
  const [formImput, setFormImput] = useState({ contratoId: '', horas: '', notas: '' })
  const [editingPlan, setEditingPlan] = useState<Planificacion | null>(null)

  const fetchData = async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/clientes/ggcc/draxton/actualizaciones?anio=${anio}`)
    const data = await res.json()
    setPlanificaciones(data.planificaciones || [])
    setPlanHistorico(data.planificacionesHistorico || [])
    setEjecuciones(data.ejecuciones || [])
    setContratos(data.contratos || [])
    setKpis(data.kpis || null)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [anio])

  const handleSavePlan = async () => {
    const action = editingPlan ? 'actualizarPlanificacion' : 'crearPlanificacion'
    await fetch('/api/admin/clientes/ggcc/draxton/actualizaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, planificacionId: editingPlan?.id, ...formPlan })
    })
    setShowPlanForm(false); setEditingPlan(null)
    setFormPlan({ titulo: '', descripcion: '', prioridad: 'normal', fechaPropuesta: '', servidoresAfectados: '', plantasAfectadas: '', solicitadoPor: '', tecnicoAsignado: '', notas: '' })
    fetchData()
  }

  const handleSaveEjec = async () => {
    await fetch('/api/admin/clientes/ggcc/draxton/actualizaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'crearEjecucion', ...formEjec, marcarEjecutada: !!formEjec.planificacionId })
    })
    setShowEjecForm(false)
    setFormEjec({ planificacionId: '', fecha: new Date().toISOString().slice(0, 10), tecnicoNombre: 'Alejandro Martinez Cayuelas', nivelTecnico: '2', horasDedicadas: '', tipo: 'remoto', plantasAfectadas: '', descripcion: '', costeHora: '' })
    fetchData()
  }

  const handleImputar = async () => {
    if (!showImputForm) return
    await fetch('/api/admin/clientes/ggcc/draxton/actualizaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'imputarHoras', ejecucionId: showImputForm, imputaciones: [{ contratoId: formImput.contratoId, horas: parseFloat(formImput.horas), notas: formImput.notas }] })
    })
    setShowImputForm(null); setFormImput({ contratoId: '', horas: '', notas: '' })
    fetchData()
  }

  const handleDeleteImputacion = async (impId: string) => {
    if (!confirm('Eliminar esta imputacion?')) return
    await fetch('/api/admin/clientes/ggcc/draxton/actualizaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'eliminarImputacion', imputacionId: impId })
    })
    fetchData()
  }

  const handleEditPlan = (p: Planificacion) => {
    setEditingPlan(p)
    setFormPlan({ titulo: p.titulo, descripcion: p.descripcion || '', prioridad: p.prioridad, fechaPropuesta: p.fechaPropuesta?.slice(0, 10) || '', servidoresAfectados: p.servidoresAfectados || '', plantasAfectadas: p.plantasAfectadas || '', solicitadoPor: p.solicitadoPor || '', tecnicoAsignado: p.tecnicoAsignado || '', notas: p.notas || '' })
    setShowPlanForm(true)
  }

  const handleDeletePlan = async (id: string) => {
    if (!confirm('Eliminar esta planificacion?')) return
    await fetch(`/api/admin/clientes/ggcc/draxton/actualizaciones?type=planificacion&id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  const handleDeleteEjec = async (id: string) => {
    if (!confirm('Eliminar esta ejecucion?')) return
    await fetch(`/api/admin/clientes/ggcc/draxton/actualizaciones?type=ejecucion&id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  const handleMarcarEstado = async (planId: string, estado: string) => {
    await fetch('/api/admin/clientes/ggcc/draxton/actualizaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'actualizarPlanificacion', planificacionId: planId, estado })
    })
    fetchData()
  }

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-ES') : '-'
  const prioridadColor: Record<string, string> = { urgente: 'bg-red-100 text-red-700', alta: 'bg-orange-100 text-orange-700', normal: 'bg-blue-100 text-blue-700', baja: 'bg-gray-100 text-gray-600' }
  const estadoColor: Record<string, string> = { pendiente: 'bg-yellow-100 text-yellow-700', programada: 'bg-blue-100 text-blue-700', ejecutada: 'bg-green-100 text-green-700', cancelada: 'bg-gray-100 text-gray-500' }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Actualizaciones Programadas</h1>
          <p className="text-sm text-gray-500">Planificacion, ejecucion e imputacion de horas de actualizaciones Draxton</p>
        </div>
        <select value={anio} onChange={e => setAnio(parseInt(e.target.value))} className="border rounded px-3 py-1.5 text-sm text-gray-900">
          {[2023, 2024, 2025, 2026].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Total Horas</p>
            <p className="text-xl font-bold text-gray-900">{kpis.totalHoras}h</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Coste Total</p>
            <p className="text-xl font-bold text-gray-900">{kpis.totalCoste.toFixed(0)}EUR</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Horas Imputadas</p>
            <p className="text-xl font-bold text-green-600">{kpis.horasImputadas}h</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Pendiente Imputar</p>
            <p className={`text-xl font-bold ${kpis.horasPendientes > 0 ? 'text-red-600' : 'text-green-600'}`}>{kpis.horasPendientes}h</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Ejecuciones</p>
            <p className="text-xl font-bold text-gray-900">{kpis.totalEjecuciones}</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Planif. Pendientes</p>
            <p className="text-xl font-bold text-orange-600">{kpis.planificacionesPendientes}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {[
          { key: 'planificacion', label: 'Planificacion' },
          { key: 'ejecuciones', label: 'Ejecuciones' },
          { key: 'imputacion', label: 'Imputacion a Contratos' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {loading ? <p className="text-gray-500 text-sm">Cargando...</p> : (<>
        {/* TAB: PLANIFICACION */}
        {tab === 'planificacion' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Actualizaciones Pendientes</h2>
              <button onClick={() => { setEditingPlan(null); setFormPlan({ titulo: '', descripcion: '', prioridad: 'normal', fechaPropuesta: '', servidoresAfectados: '', plantasAfectadas: '', solicitadoPor: '', tecnicoAsignado: '', notas: '' }); setShowPlanForm(true) }} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">+ Nueva Planificacion</button>
            </div>

            {showPlanForm && (
              <div className="bg-white border rounded-lg p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{editingPlan ? 'Editar' : 'Nueva'} Actualizacion Planificada</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-gray-600">Titulo</label>
                    <input value={formPlan.titulo} onChange={e => setFormPlan({ ...formPlan, titulo: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" placeholder="Ej: Parcheos GhostLock CVE-2026-43499" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-gray-600">Descripcion tecnica</label>
                    <textarea value={formPlan.descripcion} onChange={e => setFormPlan({ ...formPlan, descripcion: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" rows={3} placeholder="Detalle de la actualizacion, que se va a hacer..." />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Prioridad</label>
                    <select value={formPlan.prioridad} onChange={e => setFormPlan({ ...formPlan, prioridad: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                      <option value="baja">Baja</option>
                      <option value="normal">Normal</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Fecha propuesta</label>
                    <input type="date" value={formPlan.fechaPropuesta} onChange={e => setFormPlan({ ...formPlan, fechaPropuesta: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Plantas afectadas</label>
                    <input value={formPlan.plantasAfectadas} onChange={e => setFormPlan({ ...formPlan, plantasAfectadas: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" placeholder="Lleida, Teruel, Barcelona..." />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Solicitado por</label>
                    <input value={formPlan.solicitadoPor} onChange={e => setFormPlan({ ...formPlan, solicitadoPor: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" placeholder="Ej: Javier Sanchez" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-gray-600">Servidores afectados</label>
                    <textarea value={formPlan.servidoresAfectados} onChange={e => setFormPlan({ ...formPlan, servidoresAfectados: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" rows={2} placeholder="SRDXNLDA1-2310, SRDXNLDA1-2311..." />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-gray-600">Notas</label>
                    <textarea value={formPlan.notas} onChange={e => setFormPlan({ ...formPlan, notas: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" rows={2} />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={handleSavePlan} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">Guardar</button>
                  <button onClick={() => { setShowPlanForm(false); setEditingPlan(null) }} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300">Cancelar</button>
                </div>
              </div>
            )}

            {/* Lista de planificaciones pendientes */}
            <div className="space-y-3">
              {planificaciones.length === 0 && <p className="text-sm text-gray-400">No hay actualizaciones pendientes de planificar.</p>}
              {planificaciones.map(p => (
                <div key={p.id} className="bg-white border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 text-sm">{p.titulo}</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${prioridadColor[p.prioridad]}`}>{p.prioridad}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${estadoColor[p.estado]}`}>{p.estado}</span>
                      </div>
                      {p.descripcion && <p className="text-xs text-gray-600 mb-1 line-clamp-2">{p.descripcion}</p>}
                      <div className="flex gap-4 text-[10px] text-gray-500">
                        {p.fechaPropuesta && <span>Fecha: {formatDate(p.fechaPropuesta)}</span>}
                        {p.plantasAfectadas && <span>Plantas: {p.plantasAfectadas}</span>}
                        {p.solicitadoPor && <span>Solicitado: {p.solicitadoPor}</span>}
                      </div>
                      {p.servidoresAfectados && <p className="text-[10px] text-gray-400 mt-1 font-mono">{p.servidoresAfectados}</p>}
                    </div>
                    <div className="flex gap-1 ml-3">
                      <button onClick={() => handleMarcarEstado(p.id, 'programada')} className="text-[10px] px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100" title="Marcar como programada">Programar</button>
                      <button onClick={() => { setFormEjec({ ...formEjec, planificacionId: p.id, descripcion: p.titulo }); setShowEjecForm(true); setTab('ejecuciones') }} className="text-[10px] px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100" title="Registrar ejecucion">Ejecutar</button>
                      <button onClick={() => handleEditPlan(p)} className="text-[10px] px-2 py-1 bg-gray-50 text-gray-600 rounded hover:bg-gray-100">Editar</button>
                      <button onClick={() => handleDeletePlan(p.id)} className="text-[10px] px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">x</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Historico de planificaciones */}
            {planHistorico.length > 0 && (
              <details className="mt-6">
                <summary className="text-sm text-gray-500 cursor-pointer font-medium">Historico completadas/canceladas ({planHistorico.length})</summary>
                <div className="mt-2 space-y-2">
                  {planHistorico.map(p => (
                    <div key={p.id} className="bg-gray-50 border rounded p-3 flex justify-between items-center">
                      <div>
                        <span className="text-sm text-gray-700 font-medium">{p.titulo}</span>
                        <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${estadoColor[p.estado]}`}>{p.estado}</span>
                        {p.ejecuciones.length > 0 && <span className="text-[10px] text-gray-400 ml-2">{p.ejecuciones.reduce((s, e) => s + e.horasDedicadas, 0)}h ejecutadas</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* TAB: EJECUCIONES */}
        {tab === 'ejecuciones' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Ejecuciones {anio}</h2>
              <button onClick={() => setShowEjecForm(true)} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">+ Registrar Ejecucion</button>
            </div>

            {showEjecForm && (
              <div className="bg-white border rounded-lg p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Registrar Ejecucion</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Fecha</label>
                    <input type="date" value={formEjec.fecha} onChange={e => setFormEjec({ ...formEjec, fecha: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Tecnico</label>
                    <input value={formEjec.tecnicoNombre} onChange={e => setFormEjec({ ...formEjec, tecnicoNombre: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Nivel</label>
                    <select value={formEjec.nivelTecnico} onChange={e => setFormEjec({ ...formEjec, nivelTecnico: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                      <option value="1">N1</option><option value="2">N2</option><option value="3">N3</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Horas dedicadas</label>
                    <input type="number" step="0.5" value={formEjec.horasDedicadas} onChange={e => setFormEjec({ ...formEjec, horasDedicadas: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" placeholder="Ej: 8" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Tipo</label>
                    <select value={formEjec.tipo} onChange={e => setFormEjec({ ...formEjec, tipo: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                      <option value="remoto">Remoto</option><option value="presencial">Presencial</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Coste/hora (fin de semana)</label>
                    <input type="number" step="0.01" value={formEjec.costeHora} onChange={e => setFormEjec({ ...formEjec, costeHora: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" placeholder="Ej: 25.00" />
                    <p className="text-[9px] text-gray-400 mt-0.5">Coste especial fin de semana (distinto al normal)</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Plantas</label>
                    <input value={formEjec.plantasAfectadas} onChange={e => setFormEjec({ ...formEjec, plantasAfectadas: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" placeholder="Lleida, Teruel" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Vinculada a planificacion</label>
                    <select value={formEjec.planificacionId} onChange={e => setFormEjec({ ...formEjec, planificacionId: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                      <option value="">Sin vincular</option>
                      {planificaciones.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="text-xs font-medium text-gray-600">Descripcion</label>
                    <textarea value={formEjec.descripcion} onChange={e => setFormEjec({ ...formEjec, descripcion: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" rows={2} placeholder="Que se hizo..." />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={handleSaveEjec} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">Guardar</button>
                  <button onClick={() => setShowEjecForm(false)} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300">Cancelar</button>
                </div>
              </div>
            )}

            {/* Tabla de ejecuciones */}
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 text-[10px] text-gray-500 uppercase">Fecha</th>
                    <th className="text-left px-3 py-2 text-[10px] text-gray-500 uppercase">Tecnico</th>
                    <th className="text-left px-3 py-2 text-[10px] text-gray-500 uppercase">Horas</th>
                    <th className="text-left px-3 py-2 text-[10px] text-gray-500 uppercase">Tipo</th>
                    <th className="text-left px-3 py-2 text-[10px] text-gray-500 uppercase">Plantas</th>
                    <th className="text-left px-3 py-2 text-[10px] text-gray-500 uppercase">Descripcion</th>
                    <th className="text-left px-3 py-2 text-[10px] text-gray-500 uppercase">Coste</th>
                    <th className="text-left px-3 py-2 text-[10px] text-gray-500 uppercase">Imputado</th>
                    <th className="text-right px-3 py-2 text-[10px] text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ejecuciones.map(e => (
                    <tr key={e.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs">{formatDate(e.fecha)}</td>
                      <td className="px-3 py-2 text-xs">{e.tecnicoNombre || '-'} <span className="text-gray-400">N{e.nivelTecnico}</span></td>
                      <td className="px-3 py-2 text-xs font-semibold">{e.horasDedicadas}h</td>
                      <td className="px-3 py-2"><span className={`text-[10px] px-1.5 py-0.5 rounded ${e.tipo === 'remoto' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{e.tipo}</span></td>
                      <td className="px-3 py-2 text-xs text-gray-600">{e.plantasAfectadas || '-'}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px] truncate">{e.descripcion || e.planificacion?.titulo || '-'}</td>
                      <td className="px-3 py-2 text-xs">{e.costeTotal ? `${e.costeTotal.toFixed(0)}EUR` : '-'}</td>
                      <td className="px-3 py-2">
                        {e.totalImputado >= e.horasDedicadas ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600">100%</span>
                        ) : e.totalImputado > 0 ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-600">{((e.totalImputado / e.horasDedicadas) * 100).toFixed(0)}%</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">0%</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => { setShowImputForm(e.id); setFormImput({ contratoId: '', horas: (e.horasDedicadas - e.totalImputado).toString(), notas: '' }) }} className="text-[10px] px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 mr-1">Imputar</button>
                        <button onClick={() => handleDeleteEjec(e.id)} className="text-[10px] px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">x</button>
                      </td>
                    </tr>
                  ))}
                  {ejecuciones.length === 0 && <tr><td colSpan={9} className="px-3 py-4 text-center text-gray-400 text-sm">No hay ejecuciones en {anio}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: IMPUTACION */}
        {tab === 'imputacion' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Imputacion de Horas a Contratos</h2>
            <p className="text-sm text-gray-500 mb-4">Reparte las horas de actualizaciones entre los contratos de Draxton para que al final del ano el saldo sea 0.</p>

            {/* Resumen por contrato */}
            <div className="bg-white border rounded-lg p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Horas imputadas por contrato</h3>
              <div className="space-y-2">
                {(() => {
                  const porContrato: Record<string, { nombre: string; horas: number }> = {}
                  ejecuciones.forEach(e => e.imputaciones.forEach(i => {
                    const c = contratos.find(c => c.id === i.contratoId)
                    const key = i.contratoId
                    if (!porContrato[key]) porContrato[key] = { nombre: c?.titulo || 'Contrato desconocido', horas: 0 }
                    porContrato[key].horas += i.horas
                  }))
                  const entries = Object.entries(porContrato).sort((a, b) => b[1].horas - a[1].horas)
                  if (entries.length === 0) return <p className="text-sm text-gray-400">No hay imputaciones todavia.</p>
                  return entries.map(([id, data]) => (
                    <div key={id} className="flex justify-between items-center text-sm border-b pb-1">
                      <span className="text-gray-700">{data.nombre}</span>
                      <span className="font-semibold text-gray-900">{data.horas}h</span>
                    </div>
                  ))
                })()}
              </div>
            </div>

            {/* Ejecuciones pendientes de imputar */}
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Ejecuciones pendientes de imputar</h3>
            <div className="space-y-2">
              {ejecuciones.filter(e => e.totalImputado < e.horasDedicadas).map(e => (
                <div key={e.id} className="bg-white border rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{formatDate(e.fecha)}</span>
                      <span className="text-xs text-gray-500 ml-2">{e.tecnicoNombre} - {e.descripcion || e.planificacion?.titulo}</span>
                      <span className="text-xs font-semibold text-red-600 ml-2">{(e.horasDedicadas - e.totalImputado).toFixed(1)}h pendientes de {e.horasDedicadas}h</span>
                    </div>
                    <button onClick={() => { setShowImputForm(e.id); setFormImput({ contratoId: '', horas: (e.horasDedicadas - e.totalImputado).toString(), notas: '' }) }} className="text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">Imputar</button>
                  </div>
                  {/* Imputaciones existentes */}
                  {e.imputaciones.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {e.imputaciones.map(i => {
                        const c = contratos.find(c => c.id === i.contratoId)
                        return (
                          <div key={i.id} className="flex justify-between items-center text-[10px] bg-green-50 rounded px-2 py-1">
                            <span className="text-green-700">{c?.titulo || 'Contrato'}: {i.horas}h {i.notas && `(${i.notas})`}</span>
                            <button onClick={() => handleDeleteImputacion(i.id)} className="text-red-400 hover:text-red-600">x</button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Form imputar inline */}
                  {showImputForm === e.id && (
                    <div className="mt-3 p-3 bg-gray-50 rounded border">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-500">Contrato</label>
                          <select value={formImput.contratoId} onChange={ev => setFormImput({ ...formImput, contratoId: ev.target.value })} className="w-full border rounded px-2 py-1.5 text-xs text-gray-900">
                            <option value="">Seleccionar contrato...</option>
                            {contratos.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500">Horas</label>
                          <input type="number" step="0.5" value={formImput.horas} onChange={ev => setFormImput({ ...formImput, horas: ev.target.value })} className="w-full border rounded px-2 py-1.5 text-xs text-gray-900" />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500">Notas</label>
                          <input value={formImput.notas} onChange={ev => setFormImput({ ...formImput, notas: ev.target.value })} className="w-full border rounded px-2 py-1.5 text-xs text-gray-900" placeholder="Opcional" />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={handleImputar} disabled={!formImput.contratoId || !formImput.horas} className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50">Imputar</button>
                        <button onClick={() => setShowImputForm(null)} className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded">Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {ejecuciones.filter(e => e.totalImputado < e.horasDedicadas).length === 0 && (
                <p className="text-sm text-green-600 font-medium">Todas las horas estan imputadas. Objetivo cumplido.</p>
              )}
            </div>
          </div>
        )}
      </>)}
    </div>
  )
}
