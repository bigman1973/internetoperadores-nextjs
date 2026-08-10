'use client'
import { useState, useEffect, useMemo } from 'react'

interface Planificacion { id: string; titulo: string; descripcion: string | null; prioridad: string; estado: string; fechaPropuesta: string | null; servidoresAfectados: string | null; plantasAfectadas: string | null; solicitadoPor: string | null; tecnicoAsignado: string | null; notas: string | null; ejecuciones: { id: string; fecha: string; horasDedicadas: number }[] }
interface Imputacion { id: string; contratoId: string; horas: number; notas: string | null }
interface Ejecucion { id: string; planificacionId: string | null; fecha: string; tecnicoId: string | null; tecnicoNombre: string | null; nivelTecnico: number; horasDedicadas: number; tipo: string; plantasAfectadas: string | null; descripcion: string | null; costeHora: number | null; costeTotal: number | null; totalImputado: number; pendienteImputar: number | null; imputaciones: Imputacion[]; planificacion: { titulo: string } | null }
interface Contrato { id: string; titulo: string; codigoContrato: string | null; tipo: string; horasContratadas: number; horasImputadasActualizaciones: number; horasDisponibles: number; precioHoraContrato: number | null }
interface TarifaConversion { id: string; concepto: string; factorConversion: number; costeHora: number | null; precioFacturacion: number | null; fechaDesde: string; fechaHasta: string | null; notas: string | null; vigente: boolean }
interface Tecnico { id: string; nombre: string; nivel: number | null }
interface Preview { contrato: string; horasContratadas: number; horasYaImputadas: number; horasAImputar: number; balanceActual: number; balanceDespues: number }
interface KPIs { totalHoras: number; totalCoste: number; horasImputadas: number; horasPendientes: number; totalEjecuciones: number; planificacionesPendientes: number }

export default function ActualizacionesPage() {
  const [tab, setTab] = useState<'planificacion' | 'ejecuciones' | 'imputacion' | 'tarifas'>('ejecuciones')
  const [planificaciones, setPlanificaciones] = useState<Planificacion[]>([])
  const [planHistorico, setPlanHistorico] = useState<Planificacion[]>([])
  const [ejecuciones, setEjecuciones] = useState<Ejecucion[]>([])
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([])
  const [tarifasConversion, setTarifasConversion] = useState<TarifaConversion[]>([])
  const [contratoSugerido, setContratoSugerido] = useState<Contrato | null>(null)
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [loading, setLoading] = useState(true)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [showEjecForm, setShowEjecForm] = useState(false)
  const [editingEjec, setEditingEjec] = useState<Ejecucion | null>(null)
  const [showImputForm, setShowImputForm] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [formPlan, setFormPlan] = useState({ titulo: '', descripcion: '', prioridad: 'normal', fechaPropuesta: '', servidoresAfectados: '', plantasAfectadas: '', solicitadoPor: '', tecnicoAsignado: '', notas: '' })
  const ALEJANDRO_ID = '633e8841-a8d7-429f-a925-1bde822da559'
  const [formEjec, setFormEjec] = useState({ planificacionId: '', fecha: new Date().toISOString().slice(0, 10), tecnicoId: ALEJANDRO_ID, tecnicoNombre: 'MARTINEZ CAYUELAS, ALEJANDRO', nivelTecnico: '2', horasDedicadas: '', tipo: 'remoto', plantasAfectadas: '', descripcion: '', costeHora: '' })
  const [formImput, setFormImput] = useState({ contratoId: '', horas: '', notas: '' })
  const [formTarifa, setFormTarifa] = useState({ concepto: 'n2_remoto', factorConversion: '1', costeHora: '', precioFacturacion: '', fechaDesde: new Date().toISOString().slice(0, 10), notas: '' })
  const [editingPlan, setEditingPlan] = useState<Planificacion | null>(null)

  const fetchData = async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/clientes/ggcc/draxton/actualizaciones?anio=${anio}`)
    const data = await res.json()
    setPlanificaciones(data.planificaciones || [])
    setPlanHistorico(data.planificacionesHistorico || [])
    setEjecuciones(data.ejecuciones || [])
    setContratos(data.contratos || [])
    setTecnicos(data.tecnicos || [])
    setTarifasConversion(data.tarifasConversion || [])
    setContratoSugerido(data.contratoSugerido || null)
    setKpis(data.kpis || null)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [anio])

  // Obtener tarifa vigente para un concepto dado (nivel + tipo)
  const getTarifaVigente = (nivel: string, tipo: string): TarifaConversion | undefined => {
    const concepto = `n${nivel}_${tipo}`
    return tarifasConversion.find(t => t.vigente && t.concepto === concepto)
  }

  // Auto-calcular coste cuando cambia tecnico/nivel/tipo/horas
  const calcularCosteAuto = (nivel: string, tipo: string, horas: string) => {
    const tarifa = getTarifaVigente(nivel, tipo)
    if (tarifa?.costeHora && horas) {
      return (tarifa.costeHora * parseFloat(horas)).toFixed(2)
    }
    return ''
  }

  // Cuando cambia el técnico en el selector, actualizar nivel automáticamente
  const handleTecnicoChange = (tecnicoId: string) => {
    const tec = tecnicos.find(t => t.id === tecnicoId)
    if (tec) {
      const nivel = tec.nivel?.toString() || '2'
      const costeHora = getTarifaVigente(nivel, formEjec.tipo)?.costeHora?.toString() || formEjec.costeHora
      setFormEjec({ ...formEjec, tecnicoId, tecnicoNombre: tec.nombre, nivelTecnico: nivel, costeHora })
    } else {
      setFormEjec({ ...formEjec, tecnicoId, tecnicoNombre: '' })
    }
  }

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
    const action = editingEjec ? 'actualizarEjecucion' : 'crearEjecucion'
    const payload: any = { action, ...formEjec }
    if (editingEjec) payload.ejecucionId = editingEjec.id
    await fetch('/api/admin/clientes/ggcc/draxton/actualizaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    setShowEjecForm(false); setEditingEjec(null)
    setFormEjec({ planificacionId: '', fecha: new Date().toISOString().slice(0, 10), tecnicoId: '', tecnicoNombre: '', nivelTecnico: '2', horasDedicadas: '', tipo: 'remoto', plantasAfectadas: '', descripcion: '', costeHora: '' })
    fetchData()
  }

  const handleEditEjec = (e: Ejecucion) => {
    setEditingEjec(e)
    setFormEjec({
      planificacionId: e.planificacionId || '',
      fecha: e.fecha?.slice(0, 10) || '',
      tecnicoId: e.tecnicoId || '',
      tecnicoNombre: e.tecnicoNombre || '',
      nivelTecnico: e.nivelTecnico?.toString() || '2',
      horasDedicadas: e.horasDedicadas?.toString() || '',
      tipo: e.tipo || 'remoto',
      plantasAfectadas: e.plantasAfectadas || '',
      descripcion: e.descripcion || '',
      costeHora: e.costeHora?.toString() || '',
    })
    setShowEjecForm(true)
    setTimeout(() => document.getElementById('ejec-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const handlePreviewImputacion = async (contratoId: string, horas: string, ejecucionId: string) => {
    if (!contratoId || !horas) { setPreview(null); return }
    const res = await fetch('/api/admin/clientes/ggcc/draxton/actualizaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'previewImputacion', ejecucionId, contratoId, horas })
    })
    const data = await res.json()
    if (data.preview) setPreview(data.preview)
  }

  const handleImputar = async () => {
    if (!showImputForm) return
    await fetch('/api/admin/clientes/ggcc/draxton/actualizaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'imputarHoras', ejecucionId: showImputForm, imputaciones: [{ contratoId: formImput.contratoId, horas: parseFloat(formImput.horas), notas: formImput.notas }] })
    })
    setShowImputForm(null); setFormImput({ contratoId: '', horas: '', notas: '' }); setPreview(null)
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

  const handleSaveTarifa = async () => {
    await fetch('/api/admin/clientes/ggcc/draxton/actualizaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addTarifaConversion', ...formTarifa })
    })
    setFormTarifa({ concepto: 'n2_remoto', factorConversion: '1', costeHora: '', precioFacturacion: '', fechaDesde: new Date().toISOString().slice(0, 10), notas: '' })
    fetchData()
  }

  const handleDeleteTarifa = async (id: string) => {
    if (!confirm('Eliminar esta tarifa?')) return
    await fetch('/api/admin/clientes/ggcc/draxton/actualizaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteTarifaConversion', tarifaId: id })
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

  const handleInforme = () => { window.open(`/api/admin/clientes/ggcc/draxton/actualizaciones/informe?anio=${anio}`, '_blank') }

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-ES') : '-'
  const prioridadColor: Record<string, string> = { urgente: 'bg-red-100 text-red-700', alta: 'bg-orange-100 text-orange-700', normal: 'bg-blue-100 text-blue-700', baja: 'bg-gray-100 text-gray-600' }
  const estadoColor: Record<string, string> = { pendiente: 'bg-yellow-100 text-yellow-700', programada: 'bg-blue-100 text-blue-700', ejecutada: 'bg-green-100 text-green-700', cancelada: 'bg-gray-100 text-gray-500' }
  const conceptoLabels: Record<string, string> = { n1_remoto: 'N1 Remoto', n2_remoto: 'N2 Remoto', n2_presencial: 'N2 Presencial', n3_remoto: 'N3 Remoto', n3_presencial: 'N3 Presencial' }

  // Simulacion de coste para cada contrato
  const simulacionContratos = useMemo(() => {
    const tarifasVigentes = tarifasConversion.filter(t => t.vigente)
    return contratos.map(c => {
      const precioHoraContrato = Number(c.precioHoraContrato) || 0
      return {
        ...c,
        precioHoraContrato,
        simulaciones: tarifasVigentes.map(t => ({
          concepto: t.concepto,
          costeHoraTecnico: t.costeHora || 0,
          // precioFacturacion se calcula como precioH * factor en la tabla
          factorConversion: t.factorConversion,
          costeEfectivoContrato: (t.costeHora || 0) / t.factorConversion, // coste real por hora de contrato consumida
          margen: precioHoraContrato > 0 ? ((precioHoraContrato - ((t.costeHora || 0) / t.factorConversion)) / precioHoraContrato * 100) : 0,
        }))
      }
    })
  }, [contratos, tarifasConversion])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Actualizaciones Programadas</h1>
          <p className="text-sm text-gray-500">Planificacion, ejecucion e imputacion de horas a contratos</p>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={handleInforme} className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700">Informe</button>
          <select value={anio} onChange={e => setAnio(parseInt(e.target.value))} className="border rounded px-3 py-1.5 text-sm text-gray-900">
            {[2023, 2024, 2025, 2026].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          <div className="bg-white border rounded-lg p-3 text-center"><p className="text-[10px] text-gray-500 uppercase">Total Horas</p><p className="text-xl font-bold text-gray-900">{kpis.totalHoras}h</p></div>
          <div className="bg-white border rounded-lg p-3 text-center"><p className="text-[10px] text-gray-500 uppercase">Coste Total</p><p className="text-xl font-bold text-gray-900">{kpis.totalCoste.toFixed(0)} EUR</p></div>
          <div className="bg-white border rounded-lg p-3 text-center"><p className="text-[10px] text-gray-500 uppercase">Imputadas</p><p className="text-xl font-bold text-green-600">{kpis.horasImputadas}h</p></div>
          <div className="bg-white border rounded-lg p-3 text-center"><p className="text-[10px] text-gray-500 uppercase">Pendiente Imputar</p><p className={`text-xl font-bold ${kpis.horasPendientes > 0 ? 'text-red-600' : 'text-green-600'}`}>{kpis.horasPendientes}h</p></div>
          <div className="bg-white border rounded-lg p-3 text-center"><p className="text-[10px] text-gray-500 uppercase">Ejecuciones</p><p className="text-xl font-bold text-gray-900">{kpis.totalEjecuciones}</p></div>
          <div className="bg-white border rounded-lg p-3 text-center"><p className="text-[10px] text-gray-500 uppercase">Planif. Pendientes</p><p className="text-xl font-bold text-orange-600">{kpis.planificacionesPendientes}</p></div>
        </div>
      )}

      {/* Sugerencia */}
      {contratoSugerido && kpis && kpis.horasPendientes > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
          <span className="font-semibold">Sugerencia:</span> Imputar las {kpis.horasPendientes}h pendientes a <span className="font-semibold">{contratoSugerido.titulo}</span> (dispone de {contratoSugerido.horasDisponibles}h libres)
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {[{ key: 'ejecuciones', label: 'Ejecuciones' }, { key: 'planificacion', label: 'Planificacion' }, { key: 'imputacion', label: 'Imputacion a Contratos' }, { key: 'tarifas', label: 'Tarifas Conversion' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {loading ? <p className="text-gray-500 text-sm">Cargando...</p> : (<>
        {/* TAB: EJECUCIONES */}
        {tab === 'ejecuciones' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Ejecuciones {anio}</h2>
              <button onClick={() => { setEditingEjec(null); setFormEjec({ planificacionId: '', fecha: new Date().toISOString().slice(0, 10), tecnicoId: ALEJANDRO_ID, tecnicoNombre: 'MARTINEZ CAYUELAS, ALEJANDRO', nivelTecnico: '2', horasDedicadas: '', tipo: 'remoto', plantasAfectadas: '', descripcion: '', costeHora: '' }); setShowEjecForm(true) }} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">+ Registrar Ejecucion</button>
            </div>

            {showEjecForm && (
              <div id="ejec-form" className="bg-white border-2 border-indigo-200 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{editingEjec ? 'Editar' : 'Nueva'} Ejecucion</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Fecha</label>
                    <input type="date" value={formEjec.fecha} onChange={e => setFormEjec({ ...formEjec, fecha: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Tecnico</label>
                    <select value={formEjec.tecnicoId} onChange={e => handleTecnicoChange(e.target.value)} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                      <option value="">Seleccionar tecnico...</option>
                      {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre} (N{t.nivel || '-'})</option>)}
                    </select>
                    {!formEjec.tecnicoId && formEjec.tecnicoNombre && (
                      <p className="text-[9px] text-gray-400 mt-0.5">Manual: {formEjec.tecnicoNombre}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Nivel</label>
                    <select value={formEjec.nivelTecnico} onChange={e => { const nivel = e.target.value; const coste = getTarifaVigente(nivel, formEjec.tipo)?.costeHora?.toString() || formEjec.costeHora; setFormEjec({ ...formEjec, nivelTecnico: nivel, costeHora: coste }) }} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                      <option value="1">N1</option><option value="2">N2</option><option value="3">N3</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Horas dedicadas</label>
                    <input type="number" step="0.5" value={formEjec.horasDedicadas} onChange={e => setFormEjec({ ...formEjec, horasDedicadas: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" placeholder="Ej: 8" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Tipo</label>
                    <select value={formEjec.tipo} onChange={e => { const tipo = e.target.value; const coste = getTarifaVigente(formEjec.nivelTecnico, tipo)?.costeHora?.toString() || formEjec.costeHora; setFormEjec({ ...formEjec, tipo, costeHora: coste }) }} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                      <option value="remoto">Remoto</option><option value="presencial">Presencial</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Coste/hora (EUR)</label>
                    <input type="number" step="0.01" value={formEjec.costeHora} onChange={e => setFormEjec({ ...formEjec, costeHora: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" placeholder="Auto segun tarifa" />
                    {formEjec.costeHora && formEjec.horasDedicadas && (
                      <p className="text-[9px] text-indigo-600 mt-0.5 font-medium">Coste total: {(parseFloat(formEjec.costeHora) * parseFloat(formEjec.horasDedicadas)).toFixed(2)} EUR</p>
                    )}
                    {getTarifaVigente(formEjec.nivelTecnico, formEjec.tipo) && (
                      <p className="text-[9px] text-gray-400 mt-0.5">Tarifa vigente N{formEjec.nivelTecnico} {formEjec.tipo}: {getTarifaVigente(formEjec.nivelTecnico, formEjec.tipo)?.costeHora} EUR/h</p>
                    )}
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
                  <button onClick={handleSaveEjec} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">{editingEjec ? 'Actualizar' : 'Guardar'}</button>
                  <button onClick={() => { setShowEjecForm(false); setEditingEjec(null) }} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300">Cancelar</button>
                </div>
              </div>
            )}

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
                      <td className="px-3 py-2 text-xs">{e.costeTotal ? `${e.costeTotal.toFixed(0)} EUR` : e.costeHora ? `${e.costeHora} EUR/h` : '-'}</td>
                      <td className="px-3 py-2">
                        {e.totalImputado >= e.horasDedicadas ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600">100%</span>
                          : e.totalImputado > 0 ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-600">{((e.totalImputado / e.horasDedicadas) * 100).toFixed(0)}%</span>
                          : <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">0%</span>}
                      </td>
                      <td className="px-3 py-2 text-right space-x-1">
                        <button onClick={() => handleEditEjec(e)} className="text-[10px] px-2 py-1 bg-gray-50 text-gray-600 rounded hover:bg-gray-100">Editar</button>
                        <button onClick={() => { setShowImputForm(e.id); setFormImput({ contratoId: contratoSugerido?.id || (contratos.length > 0 ? contratos[0].id : ''), horas: ((e.pendienteImputar ?? e.horasDedicadas - e.totalImputado)).toString(), notas: '' }); setPreview(null) }} className="text-[10px] px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100">Imputar</button>
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

        {/* TAB: PLANIFICACION */}
        {tab === 'planificacion' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Actualizaciones Pendientes</h2>
              <button onClick={() => { setEditingPlan(null); setFormPlan({ titulo: '', descripcion: '', prioridad: 'normal', fechaPropuesta: '', servidoresAfectados: '', plantasAfectadas: '', solicitadoPor: '', tecnicoAsignado: '', notas: '' }); setShowPlanForm(true) }} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">+ Nueva Planificacion</button>
            </div>

            {showPlanForm && (
              <div className="bg-white border rounded-lg p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{editingPlan ? 'Editar' : 'Nueva'} Actualizacion</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2"><label className="text-xs font-medium text-gray-600">Titulo</label><input value={formPlan.titulo} onChange={e => setFormPlan({ ...formPlan, titulo: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" /></div>
                  <div className="md:col-span-2"><label className="text-xs font-medium text-gray-600">Descripcion</label><textarea value={formPlan.descripcion} onChange={e => setFormPlan({ ...formPlan, descripcion: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" rows={3} /></div>
                  <div><label className="text-xs font-medium text-gray-600">Prioridad</label><select value={formPlan.prioridad} onChange={e => setFormPlan({ ...formPlan, prioridad: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900"><option value="baja">Baja</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></div>
                  <div><label className="text-xs font-medium text-gray-600">Fecha propuesta</label><input type="date" value={formPlan.fechaPropuesta} onChange={e => setFormPlan({ ...formPlan, fechaPropuesta: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" /></div>
                  <div><label className="text-xs font-medium text-gray-600">Plantas</label><input value={formPlan.plantasAfectadas} onChange={e => setFormPlan({ ...formPlan, plantasAfectadas: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" /></div>
                  <div><label className="text-xs font-medium text-gray-600">Solicitado por</label><input value={formPlan.solicitadoPor} onChange={e => setFormPlan({ ...formPlan, solicitadoPor: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" /></div>
                  <div className="md:col-span-2"><label className="text-xs font-medium text-gray-600">Servidores afectados</label><textarea value={formPlan.servidoresAfectados} onChange={e => setFormPlan({ ...formPlan, servidoresAfectados: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" rows={2} /></div>
                  <div className="md:col-span-2"><label className="text-xs font-medium text-gray-600">Notas</label><textarea value={formPlan.notas} onChange={e => setFormPlan({ ...formPlan, notas: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" rows={2} /></div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={handleSavePlan} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">Guardar</button>
                  <button onClick={() => { setShowPlanForm(false); setEditingPlan(null) }} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300">Cancelar</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {planificaciones.length === 0 && <p className="text-sm text-gray-400">No hay actualizaciones pendientes.</p>}
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
                      {p.servidoresAfectados && <p className="text-[10px] text-gray-400 mt-1 font-mono whitespace-pre-line">{p.servidoresAfectados}</p>}
                    </div>
                    <div className="flex gap-1 ml-3">
                      <button onClick={() => handleMarcarEstado(p.id, 'programada')} className="text-[10px] px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">Programar</button>
                      <button onClick={() => { setFormEjec({ ...formEjec, planificacionId: p.id, descripcion: p.titulo }); setEditingEjec(null); setShowEjecForm(true); setTab('ejecuciones') }} className="text-[10px] px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100">Ejecutar</button>
                      <button onClick={() => handleEditPlan(p)} className="text-[10px] px-2 py-1 bg-gray-50 text-gray-600 rounded hover:bg-gray-100">Editar</button>
                      <button onClick={() => handleDeletePlan(p.id)} className="text-[10px] px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">x</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {planHistorico.length > 0 && (
              <details className="mt-6"><summary className="text-sm text-gray-500 cursor-pointer font-medium">Historico ({planHistorico.length})</summary>
                <div className="mt-2 space-y-2">{planHistorico.map(p => (<div key={p.id} className="bg-gray-50 border rounded p-3 flex justify-between items-center"><span className="text-sm text-gray-700">{p.titulo} <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${estadoColor[p.estado]}`}>{p.estado}</span></span></div>))}</div>
              </details>
            )}
          </div>
        )}

        {/* TAB: IMPUTACION */}
        {tab === 'imputacion' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Imputacion de Horas a Contratos</h2>

            <div className="bg-white border rounded-lg p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Balance de Contratos de Horas</h3>
              <table className="w-full text-sm">
                <thead className="border-b"><tr><th className="text-left py-1 text-[10px] text-gray-500 uppercase">Contrato</th><th className="text-right py-1 text-[10px] text-gray-500 uppercase">Horas/mes</th><th className="text-right py-1 text-[10px] text-gray-500 uppercase">Imputadas Actualiz.</th><th className="text-right py-1 text-[10px] text-gray-500 uppercase">Disponibles</th></tr></thead>
                <tbody>
                  {contratos.map(c => (
                    <tr key={c.id} className="border-b">
                      <td className="py-2 text-gray-700">{c.titulo}</td>
                      <td className="py-2 text-right">{c.horasContratadas}h</td>
                      <td className="py-2 text-right text-orange-600">{c.horasImputadasActualizaciones}h</td>
                      <td className={`py-2 text-right font-semibold ${c.horasDisponibles > 0 ? 'text-green-600' : 'text-red-600'}`}>{c.horasDisponibles}h</td>
                    </tr>
                  ))}
                  {contratos.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-gray-400">No hay contratos de horas activos</td></tr>}
                </tbody>
              </table>
            </div>

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
                    <button onClick={() => { setShowImputForm(e.id); setFormImput({ contratoId: contratoSugerido?.id || (contratos.length > 0 ? contratos[0].id : ''), horas: (e.horasDedicadas - e.totalImputado).toString(), notas: '' }); setPreview(null) }} className="text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">Imputar</button>
                  </div>
                  {e.imputaciones.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {e.imputaciones.map(i => {
                        const c = contratos.find(c => c.id === i.contratoId)
                        return (<div key={i.id} className="flex justify-between items-center text-[10px] bg-green-50 rounded px-2 py-1"><span className="text-green-700">{c?.titulo || 'Contrato'}: {i.horas}h {i.notas && `(${i.notas})`}</span><button onClick={() => handleDeleteImputacion(i.id)} className="text-red-400 hover:text-red-600">x</button></div>)
                      })}
                    </div>
                  )}

                  {showImputForm === e.id && (
                    <div className="mt-3 p-3 bg-gray-50 rounded border">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-500">Contrato (solo de horas)</label>
                          <select value={formImput.contratoId} onChange={ev => { setFormImput({ ...formImput, contratoId: ev.target.value }); handlePreviewImputacion(ev.target.value, formImput.horas, e.id) }} className="w-full border rounded px-2 py-1.5 text-xs text-gray-900">
                            <option value="">Seleccionar contrato...</option>
                            {contratos.map(c => <option key={c.id} value={c.id}>{c.titulo} ({c.horasDisponibles}h disp.)</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500">Horas a imputar</label>
                          <input type="number" step="0.5" value={formImput.horas} onChange={ev => { setFormImput({ ...formImput, horas: ev.target.value }); handlePreviewImputacion(formImput.contratoId, ev.target.value, e.id) }} className="w-full border rounded px-2 py-1.5 text-xs text-gray-900" />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500">Notas</label>
                          <input value={formImput.notas} onChange={ev => setFormImput({ ...formImput, notas: ev.target.value })} className="w-full border rounded px-2 py-1.5 text-xs text-gray-900" placeholder="Opcional" />
                        </div>
                      </div>
                      {preview && (
                        <div className="mt-2 p-2 bg-white border rounded text-xs">
                          <p className="font-semibold text-gray-700 mb-1">Preview del balance:</p>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
                            <div><p className="text-[9px] text-gray-400">Contratadas</p><p className="font-semibold">{preview.horasContratadas}h</p></div>
                            <div><p className="text-[9px] text-gray-400">Ya imputadas</p><p className="font-semibold text-orange-600">{preview.horasYaImputadas}h</p></div>
                            <div><p className="text-[9px] text-gray-400">A imputar ahora</p><p className="font-semibold text-indigo-600">{preview.horasAImputar}h</p></div>
                            <div><p className="text-[9px] text-gray-400">Balance actual</p><p className="font-semibold">{preview.balanceActual}h</p></div>
                            <div><p className="text-[9px] text-gray-400">Balance despues</p><p className={`font-bold ${preview.balanceDespues >= 0 ? 'text-green-600' : 'text-red-600'}`}>{preview.balanceDespues}h</p></div>
                          </div>
                          {preview.balanceDespues < 0 && <p className="text-[10px] text-red-600 mt-1 font-semibold">Atencion: el contrato quedaria en negativo</p>}
                        </div>
                      )}
                      <div className="flex gap-2 mt-2">
                        <button onClick={handleImputar} disabled={!formImput.contratoId || !formImput.horas} className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50">Confirmar Imputacion</button>
                        <button onClick={() => { setShowImputForm(null); setPreview(null) }} className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded">Cancelar</button>
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

        {/* TAB: TARIFAS CONVERSION */}
        {tab === 'tarifas' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Tarifas de Conversion</h2>
            <p className="text-sm text-gray-500 mb-4">El <strong>factor de conversion</strong> determina cuantas horas de contrato equivale 1h de actualizacion. El <strong>precio de facturacion</strong> se calcula automaticamente: precio/hora del contrato x factor.</p>

            {/* Formulario nueva tarifa */}
            <div className="bg-white border rounded-lg p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Anadir Tarifa</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Concepto</label>
                  <select value={formTarifa.concepto} onChange={e => setFormTarifa({ ...formTarifa, concepto: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                    <option value="n1_remoto">N1 Remoto</option>
                    <option value="n2_remoto">N2 Remoto</option>
                    <option value="n2_presencial">N2 Presencial</option>
                    <option value="n3_remoto">N3 Remoto</option>
                    <option value="n3_presencial">N3 Presencial</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Neto tecnico (EUR/h)</label>
                  <input type="number" step="0.01" value={formTarifa.costeHora} onChange={e => setFormTarifa({ ...formTarifa, costeHora: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" placeholder="Ej: 18.00" />
                  <p className="text-[9px] text-gray-400 mt-0.5">Lo que cobra el tecnico (neto). Bruto empresa: x1.35</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Factor conversion</label>
                  <input type="number" step="0.1" value={formTarifa.factorConversion} onChange={e => setFormTarifa({ ...formTarifa, factorConversion: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" placeholder="4" />
                  <p className="text-[9px] text-gray-400 mt-0.5">1h actualiz = Xh contrato</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Vigente desde</label>
                  <input type="date" value={formTarifa.fechaDesde} onChange={e => setFormTarifa({ ...formTarifa, fechaDesde: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" />
                </div>
                <div className="flex items-end">
                  <button onClick={handleSaveTarifa} className="w-full px-3 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">Guardar</button>
                </div>
              </div>
              <p className="text-[9px] text-gray-400 mt-2">Al guardar se crea un registro historico. La tarifa anterior del mismo concepto se cierra automaticamente.</p>
            </div>

            {/* Tarifas vigentes - EDITABLES */}
            {tarifasConversion.filter(t => t.vigente).length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Tarifas vigentes</h3>
                <div className="bg-white border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-3 py-2 text-[10px] text-gray-500 uppercase">Concepto</th>
                        <th className="text-center px-3 py-2 text-[10px] text-gray-500 uppercase">Neto tecnico (EUR/h)</th>
                        <th className="text-center px-3 py-2 text-[10px] text-gray-500 uppercase">Coste bruto empresa (EUR/h)</th>
                        <th className="text-center px-3 py-2 text-[10px] text-gray-500 uppercase">Factor conversion</th>
                        <th className="text-left px-3 py-2 text-[10px] text-gray-500 uppercase">Desde</th>
                        <th className="text-right px-3 py-2 text-[10px] text-gray-500 uppercase"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {tarifasConversion.filter(t => t.vigente).map(t => (
                        <TarifaEditableRow key={t.id} tarifa={t} onUpdate={fetchData} onDelete={() => handleDeleteTarifa(t.id)} conceptoLabels={conceptoLabels} formatDate={formatDate} />
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 bg-gray-50 text-[9px] text-gray-500">
                    Neto = lo que cobra el tecnico. Coste bruto empresa = neto x 1.35 (aprox +30% SS empresa + 5% otros). Haz clic en la fila para editar.
                  </div>
                </div>
              </div>
            )}

            {/* Simulacion: Precio facturacion = precio/h contrato x factor */}
            {contratos.length > 0 && tarifasConversion.filter(t => t.vigente).length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Simulacion: Precio Facturacion por Contrato</h3>
                <p className="text-xs text-gray-500 mb-2">Precio facturacion = Precio/hora contrato x Factor conversion. Muestra cuanto "vale" 1h de actualizacion al imputarla a cada contrato.</p>
                <div className="bg-white border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-3 py-2 text-[10px] text-gray-500 uppercase">Contrato</th>
                        <th className="text-right px-3 py-2 text-[10px] text-gray-500 uppercase">Precio/h contrato</th>
                        {tarifasConversion.filter(t => t.vigente).map(t => (
                          <th key={t.id} className="text-right px-3 py-2 text-[10px] text-gray-500 uppercase">{conceptoLabels[t.concepto]} (x{t.factorConversion})</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contratos.map(c => {
                        const precioH = Number(c.precioHoraContrato) || 0
                        return (
                          <tr key={c.id} className="border-b">
                            <td className="px-3 py-2 text-gray-700 text-xs">{c.titulo}</td>
                            <td className="px-3 py-2 text-right text-xs font-medium">{precioH ? `${precioH.toFixed(2)} EUR` : '-'}</td>
                            {tarifasConversion.filter(t => t.vigente).map(t => {
                              const precioFacturacion = precioH * t.factorConversion
                              const coste = t.costeHora || 0
                              const margen = precioFacturacion > 0 ? ((precioFacturacion - coste) / precioFacturacion * 100) : 0
                              return (
                                <td key={t.id} className="px-3 py-2 text-right text-xs">
                                  <span className="font-semibold">{precioFacturacion.toFixed(2)} EUR</span>
                                  {coste > 0 && <span className={`ml-1 text-[9px] ${margen > 0 ? 'text-green-600' : 'text-red-600'}`}>(margen {margen.toFixed(0)}%)</span>}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 bg-gray-50 text-[9px] text-gray-500">
                    Precio facturacion = Precio/h contrato x Factor. Margen = (Precio facturacion - Coste/h tecnico) / Precio facturacion.
                  </div>
                </div>
              </div>
            )}

            {/* Historico */}
            {tarifasConversion.filter(t => !t.vigente).length > 0 && (
              <details>
                <summary className="text-sm text-gray-500 cursor-pointer">Historico de tarifas anteriores ({tarifasConversion.filter(t => !t.vigente).length})</summary>
                <div className="mt-2 space-y-1">
                  {tarifasConversion.filter(t => !t.vigente).map(t => (
                    <div key={t.id} className="flex items-center justify-between text-xs text-gray-400 bg-gray-50 rounded px-3 py-1.5">
                      <span>{conceptoLabels[t.concepto] || t.concepto}: Coste {t.costeHora || '-'} EUR/h | x{t.factorConversion} (desde {formatDate(t.fechaDesde)} hasta {formatDate(t.fechaHasta)})</span>
                      <button onClick={() => handleDeleteTarifa(t.id)} className="text-red-400 hover:text-red-600">x</button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </>)}
    </div>
  )
}

// Componente para fila editable de tarifa vigente
function TarifaEditableRow({ tarifa, onUpdate, onDelete, conceptoLabels, formatDate }: { tarifa: TarifaConversion; onUpdate: () => void; onDelete: () => void; conceptoLabels: Record<string, string>; formatDate: (d: string | null) => string }) {
  const [editing, setEditing] = useState(false)
  const [costeHora, setCosteHora] = useState(tarifa.costeHora?.toString() || '')
  const [factor, setFactor] = useState(tarifa.factorConversion.toString())
  const [saving, setSaving] = useState(false)

  const costeBruto = tarifa.costeHora ? (tarifa.costeHora * 1.35).toFixed(2) : null
  const costeBrutoEdit = costeHora ? (parseFloat(costeHora) * 1.35).toFixed(2) : '-'

  const handleSave = async () => {
    setSaving(true)
    await fetch('/api/admin/clientes/ggcc/draxton/actualizaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateTarifaConversion', tarifaId: tarifa.id, costeHora, factorConversion: factor })
    })
    setSaving(false)
    setEditing(false)
    onUpdate()
  }

  if (editing) {
    return (
      <tr className="border-b bg-yellow-50">
        <td className="px-3 py-2 font-semibold text-gray-800">{conceptoLabels[tarifa.concepto] || tarifa.concepto}</td>
        <td className="px-3 py-1 text-center"><input type="number" step="0.01" value={costeHora} onChange={e => setCosteHora(e.target.value)} className="w-24 border rounded px-2 py-1 text-sm text-center text-gray-900" placeholder="Neto" /></td>
        <td className="px-3 py-2 text-center text-xs text-gray-500">{costeBrutoEdit} EUR</td>
        <td className="px-3 py-1 text-center"><input type="number" step="0.1" value={factor} onChange={e => setFactor(e.target.value)} className="w-16 border rounded px-2 py-1 text-sm text-center text-gray-900" /></td>
        <td className="px-3 py-2 text-xs text-gray-500">{formatDate(tarifa.fechaDesde)}</td>
        <td className="px-3 py-2 text-right space-x-1">
          <button onClick={handleSave} disabled={saving} className="text-[10px] px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">Guardar</button>
          <button onClick={() => setEditing(false)} className="text-[10px] px-2 py-1 bg-gray-100 text-gray-600 rounded">Cancelar</button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b bg-green-50 hover:bg-green-100 cursor-pointer" onClick={() => setEditing(true)}>
      <td className="px-3 py-2 font-semibold text-green-800">{conceptoLabels[tarifa.concepto] || tarifa.concepto}</td>
      <td className="px-3 py-2 text-center">{tarifa.costeHora ? `${tarifa.costeHora} EUR` : <span className="text-gray-400 italic">sin informar</span>}</td>
      <td className="px-3 py-2 text-center text-xs text-gray-500">{costeBruto ? `${costeBruto} EUR` : '-'}</td>
      <td className="px-3 py-2 text-center font-medium">x{tarifa.factorConversion}</td>
      <td className="px-3 py-2 text-xs text-gray-500">{formatDate(tarifa.fechaDesde)}</td>
      <td className="px-3 py-2 text-right"><button onClick={(e) => { e.stopPropagation(); onDelete() }} className="text-red-500 hover:text-red-700 text-xs">x</button></td>
    </tr>
  )
}
