'use client'

import { useState, useEffect } from 'react'
import { DocumentChartBarIcon, PlusIcon, EyeIcon, PencilIcon, TrashIcon, CheckCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

interface Informe {
  id: string
  mes: number
  anio: number
  planta: string
  titulo: string
  resumenEjecutivo: string | null
  recomendaciones: string | null
  estado: string
  entregado: boolean
  fechaEntrega: string | null
  creadoPor: string | null
  createdAt: string
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function DraxtonInformesPage() {
  const [informes, setInformes] = useState<Informe[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingInforme, setEditingInforme] = useState<Informe | null>(null)
  const [anioFiltro, setAnioFiltro] = useState(new Date().getFullYear())

  // Form state
  const [formMes, setFormMes] = useState(new Date().getMonth() + 1)
  const [formAnio, setFormAnio] = useState(new Date().getFullYear())
  const [formPlanta, setFormPlanta] = useState('TODAS')
  const [formTitulo, setFormTitulo] = useState('')
  const [formResumen, setFormResumen] = useState('')
  const [formRecomendaciones, setFormRecomendaciones] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchInformes()
  }, [anioFiltro])

  async function fetchInformes() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/clientes/ggcc/draxton/informes?anio=${anioFiltro}`)
      if (res.ok) {
        const data = await res.json()
        setInformes(data)
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  function openNewModal() {
    setEditingInforme(null)
    setFormMes(new Date().getMonth() + 1)
    setFormAnio(new Date().getFullYear())
    setFormPlanta('TODAS')
    setFormTitulo(`Informe de Servicios IT - ${MESES[new Date().getMonth()]} ${new Date().getFullYear()}`)
    setFormResumen('')
    setFormRecomendaciones('')
    setShowModal(true)
  }

  function openEditModal(inf: Informe) {
    setEditingInforme(inf)
    setFormMes(inf.mes)
    setFormAnio(inf.anio)
    setFormPlanta(inf.planta)
    setFormTitulo(inf.titulo)
    setFormResumen(inf.resumenEjecutivo || '')
    setFormRecomendaciones(inf.recomendaciones || '')
    setShowModal(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/clientes/ggcc/draxton/informes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mes: formMes,
          anio: formAnio,
          planta: formPlanta,
          titulo: formTitulo,
          resumenEjecutivo: formResumen || null,
          recomendaciones: formRecomendaciones || null,
        }),
      })
      if (res.ok) {
        setShowModal(false)
        fetchInformes()
      }
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  async function handleToggleEntregado(inf: Informe) {
    try {
      await fetch('/api/admin/clientes/ggcc/draxton/informes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inf.id, entregado: !inf.entregado }),
      })
      fetchInformes()
    } catch (e) { console.error(e) }
  }

  async function handleChangeEstado(inf: Informe, nuevoEstado: string) {
    try {
      await fetch('/api/admin/clientes/ggcc/draxton/informes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inf.id, estado: nuevoEstado }),
      })
      fetchInformes()
    } catch (e) { console.error(e) }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este informe?')) return
    try {
      await fetch(`/api/admin/clientes/ggcc/draxton/informes?id=${id}`, { method: 'DELETE' })
      fetchInformes()
    } catch (e) { console.error(e) }
  }

  function openInformeHTML(inf: Informe) {
    window.open(`/api/admin/clientes/ggcc/draxton/informes/generar?mes=${inf.mes}&anio=${inf.anio}&planta=${inf.planta}`, '_blank')
  }

  function previewInforme() {
    window.open(`/api/admin/clientes/ggcc/draxton/informes/generar?mes=${formMes}&anio=${formAnio}&planta=${formPlanta}`, '_blank')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DocumentChartBarIcon className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Informes Mensuales para Cliente</h2>
              <p className="text-sm text-gray-500">Informes de valor presentados mensualmente a Draxton con resumen de actividad y resultados</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={anioFiltro}
              onChange={(e) => setAnioFiltro(parseInt(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
            <button
              onClick={openNewModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Generar Informe
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de informes */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Informes Generados — {anioFiltro}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Período</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Título</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Planta</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Entregado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha Generación</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400"><ArrowPathIcon className="w-5 h-5 animate-spin inline mr-2" />Cargando...</td></tr>
              ) : informes.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No hay informes generados para {anioFiltro}. Haz clic en &quot;Generar Informe&quot; para crear el primero.</td></tr>
              ) : informes.map(inf => (
                <tr key={inf.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{MESES[inf.mes - 1]} {inf.anio}</td>
                  <td className="px-4 py-3 text-gray-700">{inf.titulo}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{inf.planta}</td>
                  <td className="px-4 py-3 text-center">
                    <select
                      value={inf.estado}
                      onChange={(e) => handleChangeEstado(inf, e.target.value)}
                      className={`text-xs font-medium rounded-full px-3 py-1 border-0 cursor-pointer ${
                        inf.estado === 'borrador' ? 'bg-gray-100 text-gray-600' :
                        inf.estado === 'revisado' ? 'bg-blue-100 text-blue-700' :
                        'bg-green-100 text-green-700'
                      }`}
                    >
                      <option value="borrador">Borrador</option>
                      <option value="revisado">Revisado</option>
                      <option value="entregado">Entregado</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleEntregado(inf)}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                        inf.entregado ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500 hover:bg-green-50'
                      }`}
                    >
                      <CheckCircleIcon className="w-4 h-4" />
                      {inf.entregado ? (inf.fechaEntrega ? new Date(inf.fechaEntrega).toLocaleDateString('es-ES') : 'Sí') : 'No'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(inf.createdAt).toLocaleDateString('es-ES')}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => openInformeHTML(inf)} title="Ver informe" className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg">
                        <EyeIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEditModal(inf)} title="Editar" className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg">
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(inf.id)} title="Eliminar" className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Contenido Automático del Informe</h3>
        <p className="text-xs text-gray-500 mb-4">El informe se genera automáticamente con datos del sistema. Solo necesitas escribir el resumen ejecutivo y las recomendaciones.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
          <ul className="space-y-2">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span className="text-xs">KPIs del periodo (tickets, MTTR, SLA) <span className="text-green-600 font-medium">— automático</span></span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span className="text-xs">Incidencias por categoría <span className="text-green-600 font-medium">— automático</span></span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span className="text-xs">Horas consumidas vs contratadas <span className="text-green-600 font-medium">— automático</span></span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span className="text-xs">Facturación del periodo <span className="text-green-600 font-medium">— automático</span></span>
            </li>
          </ul>
          <ul className="space-y-2">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span className="text-xs">Proyectos en curso y mejoras <span className="text-green-600 font-medium">— automático</span></span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span className="text-xs">Semáforo de KPIs vs objetivos <span className="text-green-600 font-medium">— automático</span></span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
              <span className="text-xs">Resumen ejecutivo <span className="text-indigo-600 font-medium">— manual</span></span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
              <span className="text-xs">Recomendaciones y próximos pasos <span className="text-indigo-600 font-medium">— manual</span></span>
            </li>
          </ul>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingInforme ? 'Editar Informe' : 'Generar Nuevo Informe'}
              </h3>
              <p className="text-sm text-gray-500 mt-1">Los datos de tickets, proyectos y facturación se incluyen automáticamente.</p>
            </div>
            <div className="p-6 space-y-4">
              {/* Periodo */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Mes</label>
                  <select value={formMes} onChange={(e) => setFormMes(parseInt(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Año</label>
                  <select value={formAnio} onChange={(e) => setFormAnio(parseInt(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value={2026}>2026</option>
                    <option value={2025}>2025</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Planta</label>
                  <select value={formPlanta} onChange={(e) => setFormPlanta(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="TODAS">Todas</option>
                    <option value="LLEIDA">Lleida</option>
                    <option value="BCN">Barcelona</option>
                  </select>
                </div>
              </div>

              {/* Título */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Título del informe</label>
                <input
                  type="text"
                  value={formTitulo}
                  onChange={(e) => setFormTitulo(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Informe de Servicios IT - Junio 2026"
                />
              </div>

              {/* Resumen ejecutivo */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Resumen Ejecutivo <span className="text-gray-400">(aparece en la primera página del informe)</span>
                </label>
                <textarea
                  value={formResumen}
                  onChange={(e) => setFormResumen(e.target.value)}
                  rows={5}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Durante el mes de junio se ha mantenido un alto nivel de servicio con una resolución del 98% de los tickets dentro de SLA. Se ha avanzado en el proyecto de migración..."
                />
              </div>

              {/* Recomendaciones */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Recomendaciones y Próximos Pasos <span className="text-gray-400">(aparece en la última página)</span>
                </label>
                <textarea
                  value={formRecomendaciones}
                  onChange={(e) => setFormRecomendaciones(e.target.value)}
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="1. Planificar actualización de firmware en switches de planta.&#10;2. Revisar política de backups con el nuevo volumen de datos.&#10;3. Programar formación EDI para nuevos usuarios."
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={previewInforme}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
              >
                <EyeIcon className="w-4 h-4" />
                Vista previa
              </button>
              <div className="flex items-center gap-3">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formTitulo}
                  className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : (editingInforme ? 'Actualizar' : 'Guardar y Generar')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
