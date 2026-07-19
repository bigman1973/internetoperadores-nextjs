'use client'

import { useState, useEffect, Fragment } from 'react'
import { ShieldCheckIcon, PlusIcon, PencilIcon, TrashIcon, ExclamationTriangleIcon, CheckCircleIcon, ClockIcon, UserIcon } from '@heroicons/react/24/outline'

interface HistoricoNivel {
  id: string
  nivelAnterior: number
  nivelNuevo: number
  fechaCambio: string
  motivo: string | null
}

interface Tecnico {
  id: string
  empleadoId: string
  nivel: number
  activo: boolean
  fechaAlta: string
  fechaBaja: string | null
  empleado: { id: string; nombreCompleto: string; categoria: string; estado: string }
  historicoNiveles: HistoricoNivel[]
}

interface Tarifa {
  id: string
  nivel: number
  importeSemana: number
  fechaDesde: string
  fechaHasta: string | null
}

interface Asignacion {
  id: string
  tecnicoId: string
  semanaInicio: string
  semanaFin: string
  importeSemana: number | null
  notas: string | null
  tecnico: { empleado: { nombreCompleto: string } }
}

interface Incidencia {
  id: string
  fechaHora: string
  resumen: string
  descripcion: string | null
  avisadoPor: string
  departamento: string | null
  zonaAfectada: string | null
  urgencia: string
  estado: string
  tipoResolucion: string | null
  fechaResolucion: string | null
  detalleResolucion: string | null
  horasDesplazamiento: number | null
  costeDesplazamiento: number | null
  importeClienteDesp: number | null
  escaladoInterno: boolean
  escaladoCliente: boolean
  detalleEscalado: string | null
  asignacion: { tecnico: { empleado: { nombreCompleto: string } } } | null
}

interface Config {
  id: string
  margenDesplazamiento: number | null
  precioHoraCliente: number | null
  costeHoraTecnico: number | null
  costeDesplazFijo: number | null
  precioDesplazCliente: number | null
  observaciones: string | null
}

interface Contrato {
  titulo: string
  fechaInicio: string
  fechaInicioServicio: string
  fechaFin: string
  importeMensual: string
  estado: string
}

export default function DraxtonContratoGuardiasPage() {
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<Config | null>(null)
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([])
  const [tarifas, setTarifas] = useState<Tarifa[]>([])
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [incidencias, setIncidencias] = useState<Incidencia[]>([])
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [tab, setTab] = useState<'calendario' | 'incidencias' | 'informes'>('calendario')

  // Modales
  const [showAddTecnico, setShowAddTecnico] = useState(false)
  const [showAddTarifa, setShowAddTarifa] = useState(false)
  const [showIncidenciaForm, setShowIncidenciaForm] = useState(false)
  const [editingIncidencia, setEditingIncidencia] = useState<Incidencia | null>(null)
  const [editingTecnico, setEditingTecnico] = useState<Tecnico | null>(null)
  const [empleadosDisponibles, setEmpleadosDisponibles] = useState<any[]>([])

  // Forms
  const [formTecnico, setFormTecnico] = useState({ empleadoId: '', nivel: 1, fechaAlta: '' })
  const [formTarifa, setFormTarifa] = useState({ nivel: 1, importeSemana: '', fechaDesde: '' })
  const [formIncidencia, setFormIncidencia] = useState({
    fechaHora: new Date().toISOString().slice(0, 16),
    resumen: '', descripcion: '', avisadoPor: '', departamento: '', zonaAfectada: '',
    urgencia: 'inmediata', tipoResolucion: '', horasDesplazamiento: '',
    costeDesplazamiento: '', importeClienteDesp: '', escaladoInterno: false,
    escaladoCliente: false, detalleEscalado: '', detalleResolucion: '', estado: 'abierta'
  })

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/clientes/ggcc/draxton/guardias?anio=${anio}`)
      const data = await res.json()
      setConfig(data.config)
      setContrato(data.contrato)
      setTecnicos(data.tecnicos || [])
      setTarifas(data.tarifas || [])
      setAsignaciones(data.asignaciones || [])
      setIncidencias(data.incidencias || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const fetchEmpleados = async () => {
    try {
      const res = await fetch('/api/admin/empleados?estado=todos')
      const data = await res.json()
      setEmpleadosDisponibles(data.empleados || data || [])
    } catch (e) { console.error(e) }
  }

  useEffect(() => { fetchData() }, [anio])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const formatCurrency = (n: number | string | null | undefined) => {
    const num = typeof n === 'string' ? parseFloat(n) : n
    if (num == null || isNaN(num)) return '—'
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(num)
  }

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-ES') : '—'

  // Generar semanas del año
  const getSemanasAnio = (year: number) => {
    const semanas: { inicio: Date; fin: Date; num: number }[] = []
    // Primer lunes del año
    const primerDia = new Date(year, 0, 1)
    let dia = new Date(primerDia)
    // Ir al primer lunes
    while (dia.getDay() !== 1) dia.setDate(dia.getDate() + 1)
    let num = 1
    while (dia.getFullYear() === year || (dia.getFullYear() === year + 1 && dia.getMonth() === 0 && dia.getDate() <= 4)) {
      const inicio = new Date(dia)
      const fin = new Date(dia)
      fin.setDate(fin.getDate() + 6)
      semanas.push({ inicio, fin, num })
      dia.setDate(dia.getDate() + 7)
      num++
      if (num > 53) break
    }
    return semanas
  }

  const semanas = getSemanasAnio(anio)

  const handleAsignar = async (semanaInicio: Date, semanaFin: Date, tecnicoId: string) => {
    if (!tecnicoId) return
    const tecnico = tecnicos.find(t => t.id === tecnicoId)
    const tarifa = tarifas.find(t => t.nivel === tecnico?.nivel && !t.fechaHasta)
    await fetch('/api/admin/clientes/ggcc/draxton/guardias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'asignarSemana',
        tecnicoId,
        semanaInicio: semanaInicio.toISOString().split('T')[0],
        semanaFin: semanaFin.toISOString().split('T')[0],
        importeSemana: tarifa?.importeSemana || null,
      })
    })
    fetchData()
  }

  const handleAddTecnico = async () => {
    if (!formTecnico.empleadoId) return
    await fetch('/api/admin/clientes/ggcc/draxton/guardias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addTecnico', ...formTecnico })
    })
    setShowAddTecnico(false)
    setFormTecnico({ empleadoId: '', nivel: 1, fechaAlta: '' })
    fetchData()
  }

  const handleEditTecnico = async () => {
    if (!editingTecnico) return
    await fetch('/api/admin/clientes/ggcc/draxton/guardias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateTecnico',
        tecnicoId: editingTecnico.id,
        nivel: formTecnico.nivel,
        fechaCambio: new Date().toISOString().split('T')[0],
      })
    })
    setEditingTecnico(null)
    setShowAddTecnico(false)
    fetchData()
  }

  const handleDarBajaTecnico = async (tecnicoId: string) => {
    if (!confirm('¿Dar de baja a este técnico del contrato de guardias?')) return
    await fetch('/api/admin/clientes/ggcc/draxton/guardias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'removeTecnico', tecnicoId })
    })
    fetchData()
  }

  const handlePrintInforme = () => {
    window.print()
  }

  const handleAddTarifa = async () => {
    if (!formTarifa.importeSemana || !formTarifa.fechaDesde) return
    await fetch('/api/admin/clientes/ggcc/draxton/guardias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addTarifa', ...formTarifa })
    })
    setShowAddTarifa(false)
    setFormTarifa({ nivel: 1, importeSemana: '', fechaDesde: '' })
    fetchData()
  }

  const handleCrearIncidencia = async () => {
    if (!formIncidencia.resumen || !formIncidencia.avisadoPor) return
    // Buscar asignación de la semana actual
    const fecha = new Date(formIncidencia.fechaHora)
    const asig = asignaciones.find(a => {
      const ini = new Date(a.semanaInicio)
      const fin = new Date(a.semanaFin)
      return fecha >= ini && fecha <= fin
    })
    await fetch('/api/admin/clientes/ggcc/draxton/guardias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: editingIncidencia ? 'actualizarIncidencia' : 'crearIncidencia',
        incidenciaId: editingIncidencia?.id,
        asignacionId: asig?.id || null,
        ...formIncidencia,
        horasDesplazamiento: formIncidencia.horasDesplazamiento ? parseFloat(formIncidencia.horasDesplazamiento) : null,
        costeDesplazamiento: formIncidencia.costeDesplazamiento ? parseFloat(formIncidencia.costeDesplazamiento) : null,
        importeClienteDesp: formIncidencia.importeClienteDesp ? parseFloat(formIncidencia.importeClienteDesp) : null,
      })
    })
    setShowIncidenciaForm(false)
    setEditingIncidencia(null)
    setFormIncidencia({ fechaHora: new Date().toISOString().slice(0, 16), resumen: '', descripcion: '', avisadoPor: '', departamento: '', zonaAfectada: '', urgencia: 'inmediata', tipoResolucion: '', horasDesplazamiento: '', costeDesplazamiento: '', importeClienteDesp: '', escaladoInterno: false, escaladoCliente: false, detalleEscalado: '', detalleResolucion: '', estado: 'abierta' })
    fetchData()
  }

  const handleEditIncidencia = (inc: Incidencia) => {
    setEditingIncidencia(inc)
    setFormIncidencia({
      fechaHora: inc.fechaHora.slice(0, 16),
      resumen: inc.resumen,
      descripcion: inc.descripcion || '',
      avisadoPor: inc.avisadoPor,
      departamento: inc.departamento || '',
      zonaAfectada: inc.zonaAfectada || '',
      urgencia: inc.urgencia,
      tipoResolucion: inc.tipoResolucion || '',
      horasDesplazamiento: inc.horasDesplazamiento?.toString() || '',
      costeDesplazamiento: inc.costeDesplazamiento?.toString() || '',
      importeClienteDesp: inc.importeClienteDesp?.toString() || '',
      escaladoInterno: inc.escaladoInterno,
      escaladoCliente: inc.escaladoCliente,
      detalleEscalado: inc.detalleEscalado || '',
      detalleResolucion: inc.detalleResolucion || '',
      estado: inc.estado,
    })
    setShowIncidenciaForm(true)
  }

  const handleDeleteIncidencia = async (id: string) => {
    if (!confirm('¿Eliminar esta incidencia?')) return
    await fetch(`/api/admin/clientes/ggcc/draxton/guardias?type=incidencia&id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  // Hoy para resaltar semana actual
  const hoy = new Date()
  const semanaActual = semanas.find(s => hoy >= s.inicio && hoy <= s.fin)

  // KPIs
  const totalIncidencias = incidencias.length
  const incResueltas = incidencias.filter(i => i.estado === 'resuelta').length
  const incDesplazamiento = incidencias.filter(i => i.tipoResolucion === 'desplazamiento').length
  const incRemotas = incidencias.filter(i => i.tipoResolucion === 'remoto').length
  // Costes se gestionan desde el detalle del contrato (no visible para técnicos)

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheckIcon className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Contrato de Guardias</h2>
              <p className="text-sm text-gray-500">
                {contrato?.titulo || 'Sin configurar'} · {formatDate(contrato?.fechaInicio || null)} — {formatDate(contrato?.fechaFin || null)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={anio} onChange={e => setAnio(parseInt(e.target.value))} className="border rounded px-2 py-1 text-sm">
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border p-4">
          <div className="text-[10px] text-gray-500 uppercase">Incidencias {anio}</div>
          <div className="text-lg font-bold text-gray-900">{totalIncidencias}</div>
          <p className="text-[10px] text-gray-400">{incResueltas} resueltas</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-[10px] text-gray-500 uppercase">Remotas</div>
          <div className="text-lg font-bold text-green-600">{incRemotas}</div>
          <p className="text-[10px] text-gray-400">{totalIncidencias > 0 ? ((incRemotas / totalIncidencias) * 100).toFixed(0) : 0}%</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-[10px] text-gray-500 uppercase">Desplazamientos</div>
          <div className="text-lg font-bold text-orange-600">{incDesplazamiento}</div>
          <p className="text-[10px] text-gray-400">{totalIncidencias > 0 ? ((incDesplazamiento / totalIncidencias) * 100).toFixed(0) : 0}%</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-[10px] text-gray-500 uppercase">Semanas Asignadas</div>
          <div className="text-lg font-bold text-indigo-700">{asignaciones.length}</div>
          <p className="text-[10px] text-gray-400">de {semanas.length} semanas</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-[10px] text-gray-500 uppercase">Técnicos</div>
          <div className="text-lg font-bold text-gray-900">{tecnicos.filter(t => t.activo).length}</div>
          <p className="text-[10px] text-gray-400">activos en rotación</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b">
          <button onClick={() => setTab('calendario')} className={`px-6 py-3 text-sm font-medium ${tab === 'calendario' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
            Calendario de Guardias
          </button>
          <button onClick={() => setTab('incidencias')} className={`px-6 py-3 text-sm font-medium ${tab === 'incidencias' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
            Incidencias ({totalIncidencias})
          </button>
          <button onClick={() => setTab('informes')} className={`px-6 py-3 text-sm font-medium ${tab === 'informes' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
            Informes
          </button>
        </div>

        {/* TAB: CALENDARIO */}
        {tab === 'calendario' && (
          <div className="p-6 space-y-6">
            {/* Técnicos y Tarifas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Técnicos */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Técnicos Asignados</h3>
                  <button onClick={() => { fetchEmpleados(); setShowAddTecnico(true) }} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                    <PlusIcon className="w-3 h-3" /> Añadir
                  </button>
                </div>
                <div className="space-y-2">
                  {tecnicos.length === 0 ? (
                    <p className="text-sm text-gray-400">No hay técnicos asignados</p>
                  ) : tecnicos.map(t => (
                    <div key={t.id} className={`p-2 rounded border ${t.activo ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">{t.empleado.nombreCompleto}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${t.nivel === 1 ? 'bg-blue-100 text-blue-700' : t.nivel === 2 ? 'bg-purple-100 text-purple-700' : 'bg-red-100 text-red-700'}`}>
                            N{t.nivel}
                          </span>
                          {!t.activo && <span className="text-[10px] text-red-500">(Baja {formatDate(t.fechaBaja)})</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400">Alta: {formatDate(t.fechaAlta)}</span>
                          {t.activo && (
                            <>
                              <button onClick={() => { setEditingTecnico(t); setFormTecnico({ empleadoId: t.empleadoId, nivel: t.nivel, fechaAlta: t.fechaAlta.split('T')[0] }); setShowAddTecnico(true) }} className="p-1 text-gray-400 hover:text-indigo-600" title="Editar nivel">
                                <PencilIcon className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDarBajaTecnico(t.id)} className="p-1 text-gray-400 hover:text-red-600" title="Dar de baja">
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Histórico de niveles */}
                      {t.historicoNiveles && t.historicoNiveles.length > 0 && (
                        <div className="mt-1.5 ml-6 border-l-2 border-gray-200 pl-2 space-y-0.5">
                          {t.historicoNiveles.map(h => (
                            <div key={h.id} className="text-[10px] text-gray-500">
                              <span className="text-gray-400">{formatDate(h.fechaCambio)}</span>
                              {' '}N{h.nivelAnterior} → N{h.nivelNuevo}
                              {h.motivo && <span className="ml-1 italic">({h.motivo})</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Niveles (sin importes) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Niveles Configurados</h3>
                </div>
                <div className="space-y-2">
                  {[1, 2, 3].map(nivel => (
                    <div key={nivel} className="flex items-center p-2 rounded border bg-white">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${nivel === 1 ? 'bg-blue-100 text-blue-700' : nivel === 2 ? 'bg-purple-100 text-purple-700' : 'bg-red-100 text-red-700'}`}>
                        Nivel {nivel}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">{tecnicos.filter(t => t.nivel === nivel && t.activo).length} técnicos</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Calendario semanal */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Asignación Semanal {anio}</h3>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium text-gray-600 w-16">Sem.</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">Período</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">Técnico de Guardia</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-600">Incid.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {semanas.map(sem => {
                      const asig = asignaciones.find(a => {
                        const ai = new Date(a.semanaInicio)
                        return ai.getTime() === sem.inicio.getTime()
                      })
                      const incSemana = incidencias.filter(i => {
                        const f = new Date(i.fechaHora)
                        return f >= sem.inicio && f <= sem.fin
                      })
                      const esActual = semanaActual && sem.num === semanaActual.num
                      return (
                        <tr key={sem.num} className={`${esActual ? 'bg-indigo-50 font-medium' : 'hover:bg-gray-50'}`}>
                          <td className="px-2 py-1.5 text-gray-500">{sem.num}</td>
                          <td className="px-2 py-1.5 text-gray-700">
                            {sem.inicio.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} — {sem.fin.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                          </td>
                          <td className="px-2 py-1.5">
                            {asig ? (
                              <span className="text-gray-900 font-medium">{asig.tecnico.empleado.nombreCompleto}</span>
                            ) : (
                              <select
                                className="border rounded px-1 py-0.5 text-xs w-full max-w-[200px]"
                                defaultValue=""
                                onChange={e => handleAsignar(sem.inicio, sem.fin, e.target.value)}
                              >
                                <option value="">— Asignar —</option>
                                {tecnicos.filter(t => t.activo).map(t => (
                                  <option key={t.id} value={t.id}>{t.empleado.nombreCompleto} (N{t.nivel})</option>
                                ))}
                              </select>
                            )}
                          </td>

                          <td className="px-2 py-1.5 text-center">
                            {incSemana.length > 0 ? (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">{incSemana.length}</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: INCIDENCIAS */}
        {tab === 'incidencias' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Registro de Incidencias</h3>
              <button onClick={() => { setEditingIncidencia(null); setFormIncidencia({ fechaHora: new Date().toISOString().slice(0, 16), resumen: '', descripcion: '', avisadoPor: '', departamento: '', zonaAfectada: '', urgencia: 'inmediata', tipoResolucion: '', horasDesplazamiento: '', costeDesplazamiento: '', importeClienteDesp: '', escaladoInterno: false, escaladoCliente: false, detalleEscalado: '', detalleResolucion: '', estado: 'abierta' }); setShowIncidenciaForm(true) }}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700">
                <PlusIcon className="w-3 h-3" /> Nueva Incidencia
              </button>
            </div>

            {incidencias.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No hay incidencias registradas en este período</p>
            ) : (
              <div className="space-y-3">
                {incidencias.map(inc => (
                  <div key={inc.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            inc.estado === 'resuelta' ? 'bg-green-100 text-green-700' :
                            inc.estado === 'en_curso' ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}>{inc.estado.replace('_', ' ').toUpperCase()}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            inc.urgencia === 'inmediata' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'
                          }`}>{inc.urgencia === 'inmediata' ? 'Urgente' : 'Puede esperar'}</span>
                          {inc.tipoResolucion && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              inc.tipoResolucion === 'remoto' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
                            }`}>{inc.tipoResolucion === 'remoto' ? 'Remoto' : 'Desplazamiento'}</span>
                          )}
                          {inc.escaladoInterno && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-600">Escalado interno</span>}
                          {inc.escaladoCliente && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-600">Escalado cliente</span>}
                        </div>
                        <p className="text-sm font-medium text-gray-900">{inc.resumen}</p>
                        <div className="flex items-center gap-4 mt-1 text-[11px] text-gray-500">
                          <span>{new Date(inc.fechaHora).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                          <span>Aviso: {inc.avisadoPor}</span>
                          {inc.departamento && <span>Dept: {inc.departamento}</span>}
                          {inc.zonaAfectada && <span>Zona: {inc.zonaAfectada}</span>}
                          {inc.asignacion && <span>Guardia: {inc.asignacion.tecnico.empleado.nombreCompleto}</span>}
                        </div>
                        {inc.tipoResolucion === 'desplazamiento' && (
                          <div className="mt-1 text-[11px] text-orange-700">
                            Horas desplazamiento: {inc.horasDesplazamiento || '—'}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleEditIncidencia(inc)} className="p-1 text-gray-400 hover:text-indigo-600"><PencilIcon className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteIncidencia(inc.id)} className="p-1 text-gray-400 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: INFORMES */}
        {tab === 'informes' && (
          <div className="p-6 space-y-6 print:p-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Informes de Guardias — {anio}</h3>
              <button onClick={handlePrintInforme} className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-800 text-white text-xs font-medium rounded-lg hover:bg-gray-900 print:hidden">
                🖨️ Imprimir Informe
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase">Resumen por Tipo de Resolución</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Resolución remota</span><span className="font-bold text-green-600">{incRemotas}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Con desplazamiento</span><span className="font-bold text-orange-600">{incDesplazamiento}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Pendientes/Sin resolver</span><span className="font-bold text-red-600">{totalIncidencias - incResueltas}</span></div>
                  <div className="flex justify-between text-sm border-t pt-2"><span className="text-gray-900 font-medium">Total</span><span className="font-bold text-gray-900">{totalIncidencias}</span></div>
                </div>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase">Actividad Operativa {anio}</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Semanas cubiertas</span><span className="font-bold text-indigo-700">{asignaciones.length} de {semanas.length}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Horas desplazamiento total</span><span className="font-bold text-orange-600">{incidencias.reduce((s, i) => s + (i.horasDesplazamiento || 0), 0).toFixed(1)}h</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Técnicos activos</span><span className="font-bold text-gray-900">{tecnicos.filter(t => t.activo).length}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Técnicos históricos (baja)</span><span className="font-bold text-gray-500">{tecnicos.filter(t => !t.activo).length}</span></div>
                </div>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase">Escalados</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Escalado interno (IO)</span><span className="font-bold text-purple-600">{incidencias.filter(i => i.escaladoInterno).length}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Escalado a Draxton</span><span className="font-bold text-indigo-600">{incidencias.filter(i => i.escaladoCliente).length}</span></div>
                </div>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase">Urgencia</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Intervención inmediata</span><span className="font-bold text-red-600">{incidencias.filter(i => i.urgencia === 'inmediata').length}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Puede esperar</span><span className="font-bold text-gray-600">{incidencias.filter(i => i.urgencia === 'puede_esperar').length}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Añadir/Editar Técnico */}
      {showAddTecnico && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowAddTecnico(false); setEditingTecnico(null) }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editingTecnico ? 'Editar Técnico' : 'Añadir Técnico a Guardias'}</h3>
            <div className="space-y-3">
              {!editingTecnico && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Empleado</label>
                  <select value={formTecnico.empleadoId} onChange={e => setFormTecnico({ ...formTecnico, empleadoId: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1">
                    <option value="">— Seleccionar —</option>
                    {empleadosDisponibles.filter((e: any) => !tecnicos.find(t => t.empleadoId === e.id)).map((e: any) => (
                      <option key={e.id} value={e.id}>{e.nombreCompleto} — {e.categoria || 'Sin categoría'} {e.estado === 'BAJA' ? '(BAJA)' : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              {editingTecnico && (
                <div className="p-3 bg-gray-50 rounded border">
                  <p className="text-sm font-medium text-gray-900">{editingTecnico.empleado.nombreCompleto}</p>
                  <p className="text-xs text-gray-500">Alta: {formatDate(editingTecnico.fechaAlta)} — Nivel actual: N{editingTecnico.nivel}</p>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-600">Nivel</label>
                <select value={formTecnico.nivel} onChange={e => setFormTecnico({ ...formTecnico, nivel: parseInt(e.target.value) })} className="w-full border rounded px-3 py-2 text-sm mt-1">
                  <option value={1}>Nivel 1</option>
                  <option value={2}>Nivel 2</option>
                  <option value={3}>Nivel 3</option>
                </select>
              </div>
              {!editingTecnico && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Fecha Alta</label>
                  <input type="date" value={formTecnico.fechaAlta} onChange={e => setFormTecnico({ ...formTecnico, fechaAlta: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1" />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setShowAddTecnico(false); setEditingTecnico(null) }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
              <button onClick={editingTecnico ? handleEditTecnico : handleAddTecnico} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{editingTecnico ? 'Guardar cambios' : 'Añadir'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Añadir Tarifa */}
      {showAddTarifa && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddTarifa(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Nueva Tarifa</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Nivel</label>
                <select value={formTarifa.nivel} onChange={e => setFormTarifa({ ...formTarifa, nivel: parseInt(e.target.value) })} className="w-full border rounded px-3 py-2 text-sm mt-1">
                  <option value={1}>Nivel 1</option>
                  <option value={2}>Nivel 2</option>
                  <option value={3}>Nivel 3</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Importe por Semana (€)</label>
                <input type="number" step="0.01" value={formTarifa.importeSemana} onChange={e => setFormTarifa({ ...formTarifa, importeSemana: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="100.00" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Vigente desde</label>
                <input type="date" value={formTarifa.fechaDesde} onChange={e => setFormTarifa({ ...formTarifa, fechaDesde: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowAddTarifa(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
              <button onClick={handleAddTarifa} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Incidencia */}
      {showIncidenciaForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto" onClick={() => setShowIncidenciaForm(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editingIncidencia ? 'Editar Incidencia' : 'Nueva Incidencia'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-600">Resumen *</label>
                <input type="text" value={formIncidencia.resumen} onChange={e => setFormIncidencia({ ...formIncidencia, resumen: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="Breve descripción de la incidencia" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-600">Descripción detallada</label>
                <textarea value={formIncidencia.descripcion} onChange={e => setFormIncidencia({ ...formIncidencia, descripcion: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1" rows={3} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Fecha y Hora</label>
                <input type="datetime-local" value={formIncidencia.fechaHora} onChange={e => setFormIncidencia({ ...formIncidencia, fechaHora: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Avisado por *</label>
                <input type="text" value={formIncidencia.avisadoPor} onChange={e => setFormIncidencia({ ...formIncidencia, avisadoPor: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="Nombre de quien avisa" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Departamento</label>
                <input type="text" value={formIncidencia.departamento} onChange={e => setFormIncidencia({ ...formIncidencia, departamento: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="IT, Producción, etc." />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Zona Afectada</label>
                <input type="text" value={formIncidencia.zonaAfectada} onChange={e => setFormIncidencia({ ...formIncidencia, zonaAfectada: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="Barcelona, Atxondo, etc." />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Urgencia</label>
                <select value={formIncidencia.urgencia} onChange={e => setFormIncidencia({ ...formIncidencia, urgencia: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1">
                  <option value="inmediata">Intervención inmediata</option>
                  <option value="puede_esperar">Puede esperar al siguiente día laborable</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Estado</label>
                <select value={formIncidencia.estado} onChange={e => setFormIncidencia({ ...formIncidencia, estado: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1">
                  <option value="abierta">Abierta</option>
                  <option value="en_curso">En curso</option>
                  <option value="resuelta">Resuelta</option>
                </select>
              </div>

              {/* Resolución */}
              <div className="md:col-span-2 border-t pt-3 mt-2">
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Resolución</h4>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Tipo de Resolución</label>
                <select value={formIncidencia.tipoResolucion} onChange={e => setFormIncidencia({ ...formIncidencia, tipoResolucion: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1">
                  <option value="">— Pendiente —</option>
                  <option value="remoto">Remoto</option>
                  <option value="desplazamiento">Desplazamiento</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-600">Detalle de resolución</label>
                <textarea value={formIncidencia.detalleResolucion} onChange={e => setFormIncidencia({ ...formIncidencia, detalleResolucion: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1" rows={2} />
              </div>

              {/* Desplazamiento */}
              {formIncidencia.tipoResolucion === 'desplazamiento' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Horas empleadas</label>
                    <input type="number" step="0.5" value={formIncidencia.horasDesplazamiento} onChange={e => {
                      const horas = parseFloat(e.target.value) || 0;
                      const costeHora = config?.costeHoraTecnico || 0;
                      const costeFijo = config?.costeDesplazFijo || 0;
                      const precioHoraCliente = config?.precioHoraCliente || 0;
                      const precioFijoCliente = config?.precioDesplazCliente || 0;
                      const costeCalc = (horas * costeHora) + costeFijo;
                      const factCalc = (horas * precioHoraCliente) + precioFijoCliente;
                      setFormIncidencia({
                        ...formIncidencia,
                        horasDesplazamiento: e.target.value,
                        costeDesplazamiento: costeCalc > 0 ? costeCalc.toFixed(2) : formIncidencia.costeDesplazamiento,
                        importeClienteDesp: factCalc > 0 ? factCalc.toFixed(2) : formIncidencia.importeClienteDesp,
                      });
                    }} className="w-full border rounded px-3 py-2 text-sm mt-1" />
                    {config?.costeHoraTecnico && <p className="text-[9px] text-gray-400 mt-0.5">Auto: {config.costeHoraTecnico}€/h + {config.costeDesplazFijo || 0}€ fijo</p>}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Coste desplazamiento (€)</label>
                    <input type="number" step="0.01" value={formIncidencia.costeDesplazamiento} onChange={e => setFormIncidencia({ ...formIncidencia, costeDesplazamiento: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="Coste real del desplazamiento" />
                    <p className="text-[9px] text-gray-400 mt-0.5">Calculado automáticamente o editable manualmente</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Importe a facturar a Draxton (€)</label>
                    <input type="number" step="0.01" value={formIncidencia.importeClienteDesp} onChange={e => setFormIncidencia({ ...formIncidencia, importeClienteDesp: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="Importe con margen" />
                    {config?.precioHoraCliente && <p className="text-[9px] text-gray-400 mt-0.5">Auto: {config.precioHoraCliente}€/h + {config.precioDesplazCliente || 0}€ fijo</p>}
                  </div>
                </>
              )}

              {/* Escalado */}
              <div className="md:col-span-2 border-t pt-3 mt-2">
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Escalado</h4>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formIncidencia.escaladoInterno} onChange={e => setFormIncidencia({ ...formIncidencia, escaladoInterno: e.target.checked })} className="rounded" />
                  Escalado interno (IO)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formIncidencia.escaladoCliente} onChange={e => setFormIncidencia({ ...formIncidencia, escaladoCliente: e.target.checked })} className="rounded" />
                  Escalado a Draxton
                </label>
              </div>
              {(formIncidencia.escaladoInterno || formIncidencia.escaladoCliente) && (
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-600">Detalle del escalado</label>
                  <textarea value={formIncidencia.detalleEscalado} onChange={e => setFormIncidencia({ ...formIncidencia, detalleEscalado: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1" rows={2} placeholder="A quién se escaló y por qué" />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setShowIncidenciaForm(false); setEditingIncidencia(null) }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
              <button onClick={handleCrearIncidencia} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">{editingIncidencia ? 'Guardar cambios' : 'Registrar Incidencia'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
