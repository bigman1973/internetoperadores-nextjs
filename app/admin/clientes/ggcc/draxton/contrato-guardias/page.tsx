'use client'

import { useState, useEffect, useRef } from 'react'
import { ShieldCheckIcon, PlusIcon, PencilIcon, TrashIcon, UserIcon, ArrowUpTrayIcon, DocumentTextIcon, InformationCircleIcon } from '@heroicons/react/24/outline'

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
  // Campos EML
  emailId: string | null
  emailSubject: string | null
  emailFrom: string | null
  emailDate: string | null
  archivoEml: string | null
  categoria: string | null
  horaInicio: string | null
  horaFin: string | null
  duracionMinutos: number | null
  planta: string | null
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
  const [tab, setTab] = useState<'calendario' | 'incidencias' | 'informes'>('incidencias')

  // Modales
  const [showAddTecnico, setShowAddTecnico] = useState(false)
  const [showAddTarifa, setShowAddTarifa] = useState(false)
  const [showIncidenciaForm, setShowIncidenciaForm] = useState(false)
  const [editingIncidencia, setEditingIncidencia] = useState<Incidencia | null>(null)
  const [editingTecnico, setEditingTecnico] = useState<Tecnico | null>(null)
  const [empleadosDisponibles, setEmpleadosDisponibles] = useState<any[]>([])
  const [showDetalleIncidencia, setShowDetalleIncidencia] = useState<Incidencia | null>(null)

  // Import EML
  const [importando, setImportando] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Tooltips
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null)

  // Forms
  const [formTecnico, setFormTecnico] = useState({ empleadoId: '', nivel: 1, fechaAlta: '' })
  const [formTarifa, setFormTarifa] = useState({ nivel: 1, importeSemana: '', fechaDesde: '' })
  const emptyFormIncidencia = {
    fechaHora: new Date().toISOString().slice(0, 16),
    resumen: '', descripcion: '', avisadoPor: '', departamento: '', zonaAfectada: '',
    urgencia: 'inmediata', tipoResolucion: '', horasDesplazamiento: '',
    costeDesplazamiento: '', importeClienteDesp: '', escaladoInterno: false,
    escaladoCliente: false, detalleEscalado: '', detalleResolucion: '', estado: 'abierta',
    categoria: '', planta: '', horaInicio: '', horaFin: '',
  }
  const [formIncidencia, setFormIncidencia] = useState(emptyFormIncidencia)

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

  const formatCurrency = (n: number | string | null | undefined) => {
    const num = typeof n === 'string' ? parseFloat(n) : n
    if (num == null || isNaN(num)) return '\u2014'
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(num)
  }

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-ES') : '\u2014'

  // Generar semanas del a\u00f1o
  const getSemanasAnio = (year: number) => {
    const semanas: { inicio: Date; fin: Date; num: number }[] = []
    const primerDia = new Date(year, 0, 1)
    let dia = new Date(primerDia)
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

  const toLocalDateStr = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const handleAsignar = async (semanaInicio: Date, semanaFin: Date, tecnicoId: string) => {
    if (!tecnicoId) return
    const tecnico = tecnicos.find(t => t.id === tecnicoId)
    const tarifa = tarifas.find(t => t.nivel === tecnico?.nivel && !t.fechaHasta)
    try {
      await fetch('/api/admin/clientes/ggcc/draxton/guardias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'asignarSemana',
          tecnicoId,
          semanaInicio: toLocalDateStr(semanaInicio),
          semanaFin: toLocalDateStr(semanaFin),
          importeSemana: tarifa?.importeSemana || null,
        })
      })
    } catch (e) { console.error(e) }
    fetchData()
  }

  const handleEliminarAsignacion = async (asignacionId: string) => {
    if (!confirm('\u00bfQuitar la asignaci\u00f3n de esta semana?')) return
    try {
      await fetch(`/api/admin/clientes/ggcc/draxton/guardias?type=asignacion&id=${asignacionId}`, { method: 'DELETE' })
    } catch (e) { console.error(e) }
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
    if (!confirm('\u00bfDar de baja a este t\u00e9cnico del contrato de guardias?')) return
    await fetch('/api/admin/clientes/ggcc/draxton/guardias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'removeTecnico', tecnicoId })
    })
    fetchData()
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
    if (!formIncidencia.resumen) return
    const fecha = new Date(formIncidencia.fechaHora)
    const asig = asignaciones.find(a => {
      const ini = new Date(a.semanaInicio + 'T00:00:00')
      const fin = new Date(a.semanaFin + 'T23:59:59')
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
    setFormIncidencia(emptyFormIncidencia)
    fetchData()
  }

  const handleEditIncidencia = (inc: Incidencia) => {
    setEditingIncidencia(inc)
    setFormIncidencia({
      fechaHora: inc.fechaHora.slice(0, 16),
      resumen: inc.resumen,
      descripcion: inc.descripcion || '',
      avisadoPor: inc.avisadoPor || '',
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
      categoria: inc.categoria || '',
      planta: inc.planta || '',
      horaInicio: inc.horaInicio || '',
      horaFin: inc.horaFin || '',
    })
    setShowIncidenciaForm(true)
  }

  const handleDeleteIncidencia = async (id: string) => {
    if (!confirm('\u00bfEliminar esta incidencia?')) return
    await fetch(`/api/admin/clientes/ggcc/draxton/guardias?type=incidencia&id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  // IMPORTAR EML
  const handleImportEML = async (files: FileList) => {
    setImportando(true)
    setImportResult(null)
    const emlFiles: { filename: string; content: string }[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const content = await file.text()
      emlFiles.push({ filename: file.name, content })
    }

    try {
      const res = await fetch('/api/admin/clientes/ggcc/draxton/guardias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'importarEML', files: emlFiles })
      })
      const data = await res.json()
      setImportResult(data)
      fetchData()
    } catch (e: any) {
      setImportResult({ error: e.message })
    }
    setImportando(false)
  }

  // KPIs
  const totalIncidencias = incidencias.length
  const incResueltas = incidencias.filter(i => i.estado === 'resuelta').length
  const incDesplazamiento = incidencias.filter(i => i.tipoResolucion === 'desplazamiento').length
  const incRemotas = incidencias.filter(i => i.tipoResolucion === 'remoto').length
  const duracionMedia = incidencias.filter(i => i.duracionMinutos).length > 0
    ? Math.round(incidencias.filter(i => i.duracionMinutos).reduce((s, i) => s + (i.duracionMinutos || 0), 0) / incidencias.filter(i => i.duracionMinutos).length)
    : 0

  // Categor\u00edas
  const categorias = incidencias.reduce((acc, i) => {
    const cat = i.categoria || 'general'
    acc[cat] = (acc[cat] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const hoy = new Date()
  const semanaActual = semanas.find(s => hoy >= s.inicio && hoy <= s.fin)

  // Tooltip component
  const Tooltip = ({ id, text }: { id: string; text: string }) => (
    <span className="relative inline-block ml-1">
      <InformationCircleIcon
        className="w-3.5 h-3.5 text-gray-400 hover:text-indigo-500 cursor-help inline"
        onMouseEnter={() => setActiveTooltip(id)}
        onMouseLeave={() => setActiveTooltip(null)}
      />
      {activeTooltip === id && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-[10px] rounded-lg shadow-lg">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  )

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
                {contrato?.titulo || 'Sin configurar'} &middot; {formatDate(contrato?.fechaInicio || null)} &mdash; {formatDate(contrato?.fechaFin || null)}
                {contrato?.importeMensual && <span className="ml-2 font-medium text-indigo-600">{formatCurrency(contrato.importeMensual)}/mes</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={anio} onChange={e => setAnio(parseInt(e.target.value))} className="border rounded px-2 py-1 text-sm text-gray-900">
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border p-4">
          <div className="text-[10px] text-gray-500 uppercase flex items-center">
            Incidencias {anio}
            <Tooltip id="kpi-total" text="Total de incidencias registradas en el a\u00f1o, tanto importadas desde EML como creadas manualmente." />
          </div>
          <div className="text-lg font-bold text-gray-900">{totalIncidencias}</div>
          <p className="text-[10px] text-gray-400">{incResueltas} resueltas</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-[10px] text-gray-500 uppercase flex items-center">
            Remotas
            <Tooltip id="kpi-remotas" text="Incidencias resueltas sin necesidad de desplazamiento f\u00edsico. Cuantas m\u00e1s, mejor para nuestros m\u00e1rgenes." />
          </div>
          <div className="text-lg font-bold text-green-600">{incRemotas}</div>
          <p className="text-[10px] text-gray-400">{totalIncidencias > 0 ? ((incRemotas / totalIncidencias) * 100).toFixed(0) : 0}%</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-[10px] text-gray-500 uppercase flex items-center">
            Desplazamientos
            <Tooltip id="kpi-desp" text="Incidencias que requirieron presencia f\u00edsica. Coste: 0,28\u20ac/km + 18\u20ac/h actuaci\u00f3n." />
          </div>
          <div className="text-lg font-bold text-orange-600">{incDesplazamiento}</div>
          <p className="text-[10px] text-gray-400">{totalIncidencias > 0 ? ((incDesplazamiento / totalIncidencias) * 100).toFixed(0) : 0}%</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-[10px] text-gray-500 uppercase flex items-center">
            Duraci\u00f3n Media
            <Tooltip id="kpi-duracion" text="Tiempo medio de resoluci\u00f3n de las incidencias donde se ha registrado hora de inicio y fin." />
          </div>
          <div className="text-lg font-bold text-blue-600">{duracionMedia} min</div>
          <p className="text-[10px] text-gray-400">{incidencias.filter(i => i.duracionMinutos).length} con datos</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-[10px] text-gray-500 uppercase flex items-center">
            Semanas
            <Tooltip id="kpi-semanas" text="Semanas del a\u00f1o con t\u00e9cnico de guardia asignado. Lo ideal es tener cobertura completa." />
          </div>
          <div className="text-lg font-bold text-indigo-700">{asignaciones.length}</div>
          <p className="text-[10px] text-gray-400">de {semanas.length} semanas</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-[10px] text-gray-500 uppercase flex items-center">
            T\u00e9cnicos
            <Tooltip id="kpi-tecnicos" text="T\u00e9cnicos activos en la rotaci\u00f3n de guardias. Se asignan semanalmente." />
          </div>
          <div className="text-lg font-bold text-gray-900">{tecnicos.filter(t => t.activo).length}</div>
          <p className="text-[10px] text-gray-400">activos en rotaci\u00f3n</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b">
          <button onClick={() => setTab('incidencias')} className={`px-6 py-3 text-sm font-medium ${tab === 'incidencias' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
            Incidencias ({totalIncidencias})
          </button>
          <button onClick={() => setTab('calendario')} className={`px-6 py-3 text-sm font-medium ${tab === 'calendario' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
            Calendario de Guardias
          </button>
          <button onClick={() => setTab('informes')} className={`px-6 py-3 text-sm font-medium ${tab === 'informes' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
            Informes
          </button>
        </div>

        {/* TAB: INCIDENCIAS */}
        {tab === 'incidencias' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-gray-700">Registro de Incidencias</h3>
              <div className="flex items-center gap-2">
                {/* Bot\u00f3n Importar EML */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".eml"
                  multiple
                  className="hidden"
                  onChange={e => e.target.files && handleImportEML(e.target.files)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importando}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                  {importando ? 'Importando...' : 'Importar EML'}
                </button>
                {/* Bot\u00f3n Nueva Incidencia Manual */}
                <button
                  onClick={() => { setEditingIncidencia(null); setFormIncidencia(emptyFormIncidencia); setShowIncidenciaForm(true) }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700"
                >
                  <PlusIcon className="w-3 h-3" /> Nueva Incidencia
                </button>
              </div>
            </div>

            {/* Resultado de importaci\u00f3n */}
            {importResult && (
              <div className={`p-3 rounded-lg border text-sm ${importResult.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                {importResult.error ? (
                  <p>Error: {importResult.error}</p>
                ) : (
                  <div className="flex items-center justify-between">
                    <p>
                      <span className="font-medium">{importResult.importados}</span> importados,{' '}
                      <span className="font-medium">{importResult.duplicados}</span> duplicados,{' '}
                      <span className="font-medium">{importResult.errores}</span> errores
                      {' '}&mdash; Total: {importResult.total} archivos
                    </p>
                    <button onClick={() => setImportResult(null)} className="text-xs underline">Cerrar</button>
                  </div>
                )}
              </div>
            )}

            {/* Categor\u00edas resumen */}
            {Object.keys(categorias).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(categorias).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                  <span key={cat} className="px-2 py-1 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700">
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}: {count}
                  </span>
                ))}
              </div>
            )}

            {incidencias.length === 0 ? (
              <div className="text-center py-12">
                <DocumentTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No hay incidencias registradas en {anio}</p>
                <p className="text-xs text-gray-400 mt-1">Importa archivos EML o crea una incidencia manualmente</p>
              </div>
            ) : (
              <div className="space-y-2">
                {incidencias.map(inc => (
                  <div key={inc.id} className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer" onClick={() => setShowDetalleIncidencia(inc)}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                            inc.estado === 'resuelta' ? 'bg-green-100 text-green-700' :
                            inc.estado === 'en_curso' ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}>{inc.estado === 'resuelta' ? 'Resuelta' : inc.estado === 'en_curso' ? 'En curso' : 'Abierta'}</span>
                          {inc.tipoResolucion && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                              inc.tipoResolucion === 'remoto' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
                            }`}>{inc.tipoResolucion === 'remoto' ? 'Remoto' : 'Desplaz.'}</span>
                          )}
                          {inc.categoria && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-gray-100 text-gray-600">
                              {inc.categoria}
                            </span>
                          )}
                          {inc.planta && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-indigo-50 text-indigo-600">
                              {inc.planta}
                            </span>
                          )}
                          {inc.escaladoInterno && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-purple-50 text-purple-600">Escalado</span>}
                          {inc.emailId && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-sky-50 text-sky-600">EML</span>}
                        </div>
                        <p className="text-sm font-medium text-gray-900 truncate">{inc.resumen}</p>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                          <span>{new Date(inc.fechaHora).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          {inc.horaInicio && inc.horaFin && <span>{inc.horaInicio} - {inc.horaFin}</span>}
                          {inc.duracionMinutos && <span className="font-medium">{inc.duracionMinutos} min</span>}
                          {inc.asignacion && <span>Guardia: {inc.asignacion.tecnico.empleado.nombreCompleto}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
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

        {/* TAB: CALENDARIO */}
        {tab === 'calendario' && (
          <div className="p-6 space-y-6">
            {/* T\u00e9cnicos y Tarifas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">T\u00e9cnicos Asignados</h3>
                  <button onClick={() => { fetchEmpleados(); setShowAddTecnico(true) }} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                    <PlusIcon className="w-3 h-3" /> A\u00f1adir
                  </button>
                </div>
                <div className="space-y-2">
                  {tecnicos.length === 0 ? (
                    <p className="text-sm text-gray-400">No hay t\u00e9cnicos asignados</p>
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
                      {t.historicoNiveles && t.historicoNiveles.length > 0 && (
                        <div className="mt-1.5 ml-6 border-l-2 border-gray-200 pl-2 space-y-0.5">
                          {t.historicoNiveles.map(h => (
                            <div key={h.id} className="text-[10px] text-gray-500">
                              <span className="text-gray-400">{formatDate(h.fechaCambio)}</span>
                              {' '}N{h.nivelAnterior} &rarr; N{h.nivelNuevo}
                              {h.motivo && <span className="ml-1 italic">({h.motivo})</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Niveles y Escalado</h3>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded border bg-blue-50">
                    <span className="font-semibold text-blue-700">Nivel 1</span>
                    <span className="text-gray-600 ml-2">T\u00e9cnico de guardia &mdash; Primera l\u00ednea</span>
                  </div>
                  <div className="p-3 rounded border bg-purple-50">
                    <span className="font-semibold text-purple-700">Nivel 2</span>
                    <span className="text-gray-600 ml-2">Escalado interno &mdash; Alejandro Mart\u00ednez</span>
                  </div>
                  <div className="p-3 rounded border bg-red-50">
                    <span className="font-semibold text-red-700">Nivel 3</span>
                    <span className="text-gray-600 ml-2">Escalado superior &mdash; Joel Benet</span>
                  </div>
                  <div className="p-3 rounded border bg-gray-50 mt-3">
                    <p className="font-semibold text-gray-700 mb-1">Escalado Draxton:</p>
                    <p className="text-gray-600">N1/N2: Alexis Rold\u00e1n &middot; N3: Sergi Tall\u00f3n</p>
                  </div>
                  <div className="p-3 rounded border bg-gray-50">
                    <p className="font-semibold text-gray-700 mb-1">Costes desplazamiento:</p>
                    <p className="text-gray-600">0,28 \u20ac/km + 18 \u20ac/h actuaci\u00f3n presencial</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Calendario semanal */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Asignaci\u00f3n Semanal {anio}</h3>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium text-gray-600 w-16">Sem.</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">Per\u00edodo</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">T\u00e9cnico de Guardia</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-600">Incid.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {semanas.map(sem => {
                      const asig = asignaciones.find(a => {
                        const ai = a.semanaInicio.split('T')[0]
                        return ai === toLocalDateStr(sem.inicio)
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
                            {sem.inicio.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} &mdash; {sem.fin.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className={`border rounded px-1 py-0.5 text-xs w-full max-w-[200px] text-gray-900 ${asig ? 'border-transparent bg-transparent font-medium hover:border-gray-300 hover:bg-white cursor-pointer' : ''}`}
                              value={asig?.tecnicoId || ''}
                              onChange={e => {
                                if (e.target.value === '__eliminar__') {
                                  handleEliminarAsignacion(asig!.id)
                                } else if (e.target.value) {
                                  handleAsignar(sem.inicio, sem.fin, e.target.value)
                                }
                              }}
                            >
                              <option value="">&mdash; Asignar &mdash;</option>
                              {tecnicos.filter(t => t.activo).map(t => (
                                <option key={t.id} value={t.id}>{t.empleado.nombreCompleto} (N{t.nivel})</option>
                              ))}
                              {asig && <option value="__eliminar__">&times; Quitar asignaci\u00f3n</option>}
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {incSemana.length > 0 ? (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">{incSemana.length}</span>
                            ) : (
                              <span className="text-gray-300">&mdash;</span>
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

        {/* TAB: INFORMES */}
        {tab === 'informes' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Informes de Guardias &mdash; {anio}</h3>
              <button onClick={() => window.print()} className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-800 text-white text-xs font-medium rounded-lg hover:bg-gray-900 print:hidden">
                Imprimir
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase">Resumen por Tipo de Resoluci\u00f3n</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Resoluci\u00f3n remota</span><span className="font-bold text-green-600">{incRemotas}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Con desplazamiento</span><span className="font-bold text-orange-600">{incDesplazamiento}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Pendientes/Sin resolver</span><span className="font-bold text-red-600">{totalIncidencias - incResueltas}</span></div>
                  <div className="flex justify-between text-sm border-t pt-2"><span className="text-gray-900 font-medium">Total</span><span className="font-bold text-gray-900">{totalIncidencias}</span></div>
                </div>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase">Por Categor\u00eda</h4>
                <div className="space-y-2">
                  {Object.entries(categorias).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                    <div key={cat} className="flex justify-between text-sm">
                      <span className="text-gray-600 capitalize">{cat}</span>
                      <span className="font-bold text-gray-900">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase">Actividad Operativa</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Semanas cubiertas</span><span className="font-bold text-indigo-700">{asignaciones.length} de {semanas.length}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Duraci\u00f3n media</span><span className="font-bold text-blue-600">{duracionMedia} min</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">T\u00e9cnicos activos</span><span className="font-bold text-gray-900">{tecnicos.filter(t => t.activo).length}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Incidencias con escalado</span><span className="font-bold text-purple-600">{incidencias.filter(i => i.escaladoInterno).length}</span></div>
                </div>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase">Por Planta</h4>
                <div className="space-y-2">
                  {Object.entries(incidencias.reduce((acc, i) => {
                    const p = i.planta || 'Sin especificar'
                    acc[p] = (acc[p] || 0) + 1
                    return acc
                  }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).map(([planta, count]) => (
                    <div key={planta} className="flex justify-between text-sm">
                      <span className="text-gray-600">{planta}</span>
                      <span className="font-bold text-gray-900">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Detalle Incidencia */}
      {showDetalleIncidencia && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto" onClick={() => setShowDetalleIncidencia(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl my-8 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Detalle de Incidencia</h3>
              <button onClick={() => setShowDetalleIncidencia(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  showDetalleIncidencia.estado === 'resuelta' ? 'bg-green-100 text-green-700' :
                  showDetalleIncidencia.estado === 'en_curso' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>{showDetalleIncidencia.estado}</span>
                {showDetalleIncidencia.tipoResolucion && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    showDetalleIncidencia.tipoResolucion === 'remoto' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
                  }`}>{showDetalleIncidencia.tipoResolucion}</span>
                )}
                {showDetalleIncidencia.categoria && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{showDetalleIncidencia.categoria}</span>}
                {showDetalleIncidencia.planta && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">{showDetalleIncidencia.planta}</span>}
                {showDetalleIncidencia.emailId && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-600">Importado desde EML</span>}
              </div>

              <h4 className="text-base font-medium text-gray-900">{showDetalleIncidencia.resumen}</h4>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Fecha:</span>
                  <span className="ml-2 text-gray-900">{new Date(showDetalleIncidencia.fechaHora).toLocaleString('es-ES')}</span>
                </div>
                {showDetalleIncidencia.horaInicio && (
                  <div>
                    <span className="text-gray-500">Hora inicio:</span>
                    <span className="ml-2 text-gray-900">{showDetalleIncidencia.horaInicio}</span>
                  </div>
                )}
                {showDetalleIncidencia.horaFin && (
                  <div>
                    <span className="text-gray-500">Hora fin:</span>
                    <span className="ml-2 text-gray-900">{showDetalleIncidencia.horaFin}</span>
                  </div>
                )}
                {showDetalleIncidencia.duracionMinutos && (
                  <div>
                    <span className="text-gray-500">Duraci\u00f3n:</span>
                    <span className="ml-2 font-medium text-gray-900">{showDetalleIncidencia.duracionMinutos} min</span>
                  </div>
                )}
                {showDetalleIncidencia.asignacion && (
                  <div>
                    <span className="text-gray-500">T\u00e9cnico guardia:</span>
                    <span className="ml-2 text-gray-900">{showDetalleIncidencia.asignacion.tecnico.empleado.nombreCompleto}</span>
                  </div>
                )}
                {showDetalleIncidencia.avisadoPor && (
                  <div>
                    <span className="text-gray-500">Avisado por:</span>
                    <span className="ml-2 text-gray-900">{showDetalleIncidencia.avisadoPor}</span>
                  </div>
                )}
              </div>

              {showDetalleIncidencia.descripcion && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Descripci\u00f3n:</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {showDetalleIncidencia.descripcion}
                  </div>
                </div>
              )}

              {showDetalleIncidencia.emailFrom && (
                <div className="text-xs text-gray-500 border-t pt-3">
                  <p>De: {showDetalleIncidencia.emailFrom}</p>
                  {showDetalleIncidencia.archivoEml && <p>Archivo: {showDetalleIncidencia.archivoEml}</p>}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setShowDetalleIncidencia(null); handleEditIncidencia(showDetalleIncidencia) }} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Editar</button>
              <button onClick={() => setShowDetalleIncidencia(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: A\u00f1adir/Editar T\u00e9cnico */}
      {showAddTecnico && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowAddTecnico(false); setEditingTecnico(null) }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editingTecnico ? 'Editar T\u00e9cnico' : 'A\u00f1adir T\u00e9cnico a Guardias'}</h3>
            <div className="space-y-3">
              {!editingTecnico && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Empleado</label>
                  <select value={formTecnico.empleadoId} onChange={e => setFormTecnico({ ...formTecnico, empleadoId: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                    <option value="">&mdash; Seleccionar &mdash;</option>
                    {empleadosDisponibles.filter((e: any) => !tecnicos.find(t => t.empleadoId === e.id)).map((e: any) => (
                      <option key={e.id} value={e.id}>{e.nombreCompleto} &mdash; {e.categoria || 'Sin categor\u00eda'}</option>
                    ))}
                  </select>
                </div>
              )}
              {editingTecnico && (
                <div className="p-3 bg-gray-50 rounded border">
                  <p className="text-sm font-medium text-gray-900">{editingTecnico.empleado.nombreCompleto}</p>
                  <p className="text-xs text-gray-500">Alta: {formatDate(editingTecnico.fechaAlta)} &mdash; Nivel actual: N{editingTecnico.nivel}</p>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-600">Nivel</label>
                <select value={formTecnico.nivel} onChange={e => setFormTecnico({ ...formTecnico, nivel: parseInt(e.target.value) })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                  <option value={1}>Nivel 1 &mdash; Primera l\u00ednea</option>
                  <option value={2}>Nivel 2 &mdash; Escalado interno</option>
                  <option value={3}>Nivel 3 &mdash; Escalado superior</option>
                </select>
              </div>
              {!editingTecnico && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Fecha Alta</label>
                  <input type="date" value={formTecnico.fechaAlta} onChange={e => setFormTecnico({ ...formTecnico, fechaAlta: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setShowAddTecnico(false); setEditingTecnico(null) }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
              <button onClick={editingTecnico ? handleEditTecnico : handleAddTecnico} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{editingTecnico ? 'Guardar cambios' : 'A\u00f1adir'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: A\u00f1adir Tarifa */}
      {showAddTarifa && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddTarifa(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Nueva Tarifa</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Nivel</label>
                <select value={formTarifa.nivel} onChange={e => setFormTarifa({ ...formTarifa, nivel: parseInt(e.target.value) })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                  <option value={1}>Nivel 1</option>
                  <option value={2}>Nivel 2</option>
                  <option value={3}>Nivel 3</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Importe por Semana (\u20ac)</label>
                <input type="number" step="0.01" value={formTarifa.importeSemana} onChange={e => setFormTarifa({ ...formTarifa, importeSemana: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" placeholder="100.00" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Vigente desde</label>
                <input type="date" value={formTarifa.fechaDesde} onChange={e => setFormTarifa({ ...formTarifa, fechaDesde: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowAddTarifa(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
              <button onClick={handleAddTarifa} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Incidencia (crear/editar) */}
      {showIncidenciaForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto" onClick={() => setShowIncidenciaForm(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editingIncidencia ? 'Editar Incidencia' : 'Nueva Incidencia'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-600">Resumen *</label>
                <input type="text" value={formIncidencia.resumen} onChange={e => setFormIncidencia({ ...formIncidencia, resumen: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" placeholder="Breve descripci\u00f3n de la incidencia" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-600">Descripci\u00f3n detallada</label>
                <textarea value={formIncidencia.descripcion} onChange={e => setFormIncidencia({ ...formIncidencia, descripcion: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" rows={3} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Fecha y Hora</label>
                <input type="datetime-local" value={formIncidencia.fechaHora} onChange={e => setFormIncidencia({ ...formIncidencia, fechaHora: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Avisado por</label>
                <input type="text" value={formIncidencia.avisadoPor} onChange={e => setFormIncidencia({ ...formIncidencia, avisadoPor: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" placeholder="Nombre de quien avisa" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Hora Inicio</label>
                <input type="time" value={formIncidencia.horaInicio} onChange={e => setFormIncidencia({ ...formIncidencia, horaInicio: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Hora Fin</label>
                <input type="time" value={formIncidencia.horaFin} onChange={e => setFormIncidencia({ ...formIncidencia, horaFin: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Categor\u00eda</label>
                <select value={formIncidencia.categoria} onChange={e => setFormIncidencia({ ...formIncidencia, categoria: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                  <option value="">Sin especificar</option>
                  <option value="csoc">CSOC (Seguridad)</option>
                  <option value="usuario">Usuario (Contrase\u00f1as/Accesos)</option>
                  <option value="red">Red (Conectividad)</option>
                  <option value="impresora">Impresora</option>
                  <option value="hardware">Hardware/Servidor</option>
                  <option value="software">Software/Aplicativo</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Planta</label>
                <select value={formIncidencia.planta} onChange={e => setFormIncidencia({ ...formIncidencia, planta: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                  <option value="">Sin especificar</option>
                  <option value="Barcelona">Barcelona</option>
                  <option value="Lleida">Lleida</option>
                  <option value="Atxondo">Atxondo</option>
                  <option value="Binefar">Binefar</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Urgencia</label>
                <select value={formIncidencia.urgencia} onChange={e => setFormIncidencia({ ...formIncidencia, urgencia: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                  <option value="inmediata">Intervenci\u00f3n inmediata</option>
                  <option value="puede_esperar">Puede esperar</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Estado</label>
                <select value={formIncidencia.estado} onChange={e => setFormIncidencia({ ...formIncidencia, estado: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                  <option value="abierta">Abierta</option>
                  <option value="en_curso">En curso</option>
                  <option value="resuelta">Resuelta</option>
                </select>
              </div>

              {/* Resoluci\u00f3n */}
              <div className="md:col-span-2 border-t pt-3 mt-2">
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Resoluci\u00f3n</h4>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Tipo de Resoluci\u00f3n</label>
                <select value={formIncidencia.tipoResolucion} onChange={e => setFormIncidencia({ ...formIncidencia, tipoResolucion: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900">
                  <option value="">&mdash; Pendiente &mdash;</option>
                  <option value="remoto">Remoto</option>
                  <option value="desplazamiento">Desplazamiento</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-600">Detalle de resoluci\u00f3n</label>
                <textarea value={formIncidencia.detalleResolucion} onChange={e => setFormIncidencia({ ...formIncidencia, detalleResolucion: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" rows={2} />
              </div>

              {/* Desplazamiento */}
              {formIncidencia.tipoResolucion === 'desplazamiento' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Horas empleadas</label>
                    <input type="number" step="0.5" value={formIncidencia.horasDesplazamiento} onChange={e => {
                      const horas = parseFloat(e.target.value) || 0
                      const costeCalc = horas * 18
                      setFormIncidencia({
                        ...formIncidencia,
                        horasDesplazamiento: e.target.value,
                        costeDesplazamiento: costeCalc > 0 ? costeCalc.toFixed(2) : formIncidencia.costeDesplazamiento,
                      })
                    }} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" />
                    <p className="text-[9px] text-gray-400 mt-0.5">18\u20ac/h actuaci\u00f3n presencial</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Coste desplazamiento (\u20ac)</label>
                    <input type="number" step="0.01" value={formIncidencia.costeDesplazamiento} onChange={e => setFormIncidencia({ ...formIncidencia, costeDesplazamiento: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Importe a facturar (\u20ac)</label>
                    <input type="number" step="0.01" value={formIncidencia.importeClienteDesp} onChange={e => setFormIncidencia({ ...formIncidencia, importeClienteDesp: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" />
                  </div>
                </>
              )}

              {/* Escalado */}
              <div className="md:col-span-2 border-t pt-3 mt-2">
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Escalado</h4>
              </div>
              <div className="flex items-center gap-4 md:col-span-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={formIncidencia.escaladoInterno} onChange={e => setFormIncidencia({ ...formIncidencia, escaladoInterno: e.target.checked })} className="rounded" />
                  Escalado interno (IO)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={formIncidencia.escaladoCliente} onChange={e => setFormIncidencia({ ...formIncidencia, escaladoCliente: e.target.checked })} className="rounded" />
                  Escalado a Draxton
                </label>
              </div>
              {(formIncidencia.escaladoInterno || formIncidencia.escaladoCliente) && (
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-600">Detalle del escalado</label>
                  <textarea value={formIncidencia.detalleEscalado} onChange={e => setFormIncidencia({ ...formIncidencia, detalleEscalado: e.target.value })} className="w-full border rounded px-3 py-2 text-sm mt-1 text-gray-900" rows={2} placeholder="A qui\u00e9n se escal\u00f3 y por qu\u00e9" />
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
