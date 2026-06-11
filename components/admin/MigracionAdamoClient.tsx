'use client'

import { useState, useEffect, useCallback } from 'react'

interface OtroServicio {
  titulo: string
  precio: number
}

interface ClienteAdamo {
  id: number
  nombre: string
  tarifa: string | null
  direccion: string | null
  municipio: string | null
  fechaAlta: string | null
  precioOperador: number | null
  precioCliente: number | null
  otrosServicios: OtroServicio[] | null
  totalContratos: number
  facturacionMensual: number | null
  prioridad: string
  estado: string
  alternativaOfrecida: string | null
  precioAlternativa: number | null
  notas: string | null
  fechaContacto: string | null
  fechaResolucion: string | null
  emailEnviado: boolean
  fechaEmailEnviado: string | null
  respuestaCliente: string | null
  fechaRespuesta: string | null
}

interface TarifaDisponible {
  id: number
  nombre: string
  precioSinIva: string
  precioConIva: string
  tipoCliente: string
  velocidad: string | null
}

interface Stats {
  total: number
  porEstado: { estado: string; _count: { estado: number } }[]
  ingresosMensuales: number
  costeMensual: number
  totalFacturacion: number
  clientesAlta: number
}

const ESTADOS = [
  { value: 'PENDIENTE', label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'CONTACTADO', label: 'Contactado', color: 'bg-blue-100 text-blue-800' },
  { value: 'EN_NEGOCIACION', label: 'En negociación', color: 'bg-purple-100 text-purple-800' },
  { value: 'OFERTA_ENVIADA', label: 'Oferta enviada', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'MIGRADO', label: 'Migrado', color: 'bg-green-100 text-green-800' },
  { value: 'BAJA', label: 'Baja', color: 'bg-red-100 text-red-800' },
]

const PRIORIDADES = [
  { value: 'ALTA', label: 'Alta', color: 'bg-red-100 text-red-800' },
  { value: 'NORMAL', label: 'Normal', color: 'bg-gray-100 text-gray-800' },
  { value: 'BAJA', label: 'Baja', color: 'bg-green-100 text-green-700' },
]

function getEstadoInfo(estado: string) {
  return ESTADOS.find(e => e.value === estado) || { value: estado, label: estado, color: 'bg-gray-100 text-gray-800' }
}

function getPrioridadInfo(prioridad: string) {
  return PRIORIDADES.find(p => p.value === prioridad) || { value: prioridad, label: prioridad, color: 'bg-gray-100 text-gray-800' }
}

export default function MigracionAdamoClient() {
  const [clientes, setClientes] = useState<ClienteAdamo[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [municipios, setMunicipios] = useState<string[]>([])
  const [tarifas, setTarifas] = useState<TarifaDisponible[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtroMunicipio, setFiltroMunicipio] = useState('todos')
  const [filtroPrioridad, setFiltroPrioridad] = useState('todos')
  const [buscar, setBuscar] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<ClienteAdamo | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [editNotas, setEditNotas] = useState('')
  const [editAlternativa, setEditAlternativa] = useState('')
  const [editPrecioAlt, setEditPrecioAlt] = useState('')
  const [saving, setSaving] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailInput, setEmailInput] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filtroEstado !== 'todos') params.set('estado', filtroEstado)
    if (filtroMunicipio !== 'todos') params.set('municipio', filtroMunicipio)
    if (filtroPrioridad !== 'todos') params.set('prioridad', filtroPrioridad)
    if (buscar) params.set('buscar', buscar)

    try {
      const res = await fetch(`/api/admin/migracion-adamo?${params.toString()}`)
      const data = await res.json()
      setClientes(data.clientes || [])
      setStats(data.stats || null)
      setMunicipios(data.municipios || [])
      setTarifas(data.tarifas || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    }
    setLoading(false)
  }, [filtroEstado, filtroMunicipio, filtroPrioridad, buscar])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleEnviarEmail = async (clienteId: number, emailsRaw: string) => {
    const emails = emailsRaw.split(',').map(e => e.trim()).filter(e => e.includes('@'))
    if (emails.length === 0) {
      alert('Introduce al menos un email válido')
      return
    }
    if (!confirm(`¿Enviar email de migración a: ${emails.join(', ')}?`)) return
    
    setSendingEmail(true)
    let enviados = 0
    let errores = 0
    for (const email of emails) {
      try {
        const res = await fetch('/api/admin/migracion-adamo/enviar-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clienteId, email }),
        })
        if (res.ok) enviados++
        else errores++
      } catch {
        errores++
      }
    }
    if (errores === 0) {
      alert(`✅ Email enviado a ${enviados} destinatario${enviados > 1 ? 's' : ''}`)
    } else {
      alert(`⚠️ Enviados: ${enviados}, Errores: ${errores}`)
    }
    await fetchData()
    setSendingEmail(false)
  }

  const handleResetCliente = async (id: number) => {
    if (!confirm('¿Resetear este cliente? Se borrarán email enviado, respuesta, alternativa y notas.')) return
    setSaving(true)
    try {
      await fetch('/api/admin/migracion-adamo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          estado: 'PENDIENTE',
          emailEnviado: false,
          fechaEmailEnviado: null,
          respuestaCliente: null,
          fechaRespuesta: null,
          token: null,
          alternativaOfrecida: null,
          precioAlternativa: null,
          notas: null,
          fechaContacto: null,
          fechaResolucion: null,
        }),
      })
      setEditNotas('')
      setEditAlternativa('')
      setEditPrecioAlt('')
      setEmailInput('')
      await fetchData()
      setSelectedCliente(null)
      alert('✅ Cliente reseteado')
    } catch {
      alert('❌ Error al resetear')
    }
    setSaving(false)
  }

  const handleUpdateCliente = async (id: number, updates: any) => {
    setSaving(true)
    try {
      await fetch('/api/admin/migracion-adamo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
      await fetchData()
      if (selectedCliente?.id === id) {
        setSelectedCliente(prev => prev ? { ...prev, ...updates } : null)
      }
    } catch (error) {
      console.error('Error updating:', error)
    }
    setSaving(false)
  }

  const handleBulkUpdate = async (estado: string) => {
    if (selectedIds.length === 0) return
    setSaving(true)
    try {
      await fetch('/api/admin/migracion-adamo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, estado }),
      })
      setSelectedIds([])
      await fetchData()
    } catch (error) {
      console.error('Error bulk update:', error)
    }
    setSaving(false)
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === clientes.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(clientes.map(c => c.id))
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const openDetail = (cliente: ClienteAdamo) => {
    setSelectedCliente(cliente)
    setEditNotas(cliente.notas || '')
    setEditAlternativa(cliente.alternativaOfrecida || '')
    setEditPrecioAlt(cliente.precioAlternativa?.toString() || '')
  }

  const getCountByEstado = (estado: string) => {
    if (!stats) return 0
    const found = stats.porEstado.find(s => s.estado === estado)
    return found ? found._count.estado : 0
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Migración ADAMO</h1>
        <p className="text-gray-500 mt-1">Gestión de clientes con interconexión ADAMO que necesitan migración a alternativas</p>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Total</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Pendientes</p>
            <p className="text-2xl font-bold text-yellow-600">{getCountByEstado('PENDIENTE')}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Contactados</p>
            <p className="text-2xl font-bold text-blue-600">{getCountByEstado('CONTACTADO')}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Migrados</p>
            <p className="text-2xl font-bold text-green-600">{getCountByEstado('MIGRADO')}</p>
          </div>
          <div className="bg-white border rounded-lg p-4 border-red-200">
            <p className="text-xs text-gray-500 uppercase">Prioridad Alta</p>
            <p className="text-2xl font-bold text-red-600">{stats.clientesAlta || 0}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Fact. mensual total</p>
            <p className="text-2xl font-bold text-gray-900">{Number(stats.totalFacturacion || 0).toFixed(0)}€</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Coste ADAMO/mes</p>
            <p className="text-2xl font-bold text-red-600">{Number(stats.costeMensual).toFixed(0)}€</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border rounded-lg p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Buscar</label>
            <input
              type="text"
              placeholder="Nombre, dirección, tarifa..."
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Estado</label>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="todos">Todos</option>
              {ESTADOS.map(e => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Municipio</label>
            <select
              value={filtroMunicipio}
              onChange={(e) => setFiltroMunicipio(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="todos">Todos</option>
              {municipios.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Prioridad</label>
            <select
              value={filtroPrioridad}
              onChange={(e) => setFiltroPrioridad(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="todos">Todas</option>
              {PRIORIDADES.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            {selectedIds.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleBulkUpdate('CONTACTADO')}
                  disabled={saving}
                  className="px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                >
                  Contactados ({selectedIds.length})
                </button>
                <button
                  onClick={() => handleBulkUpdate('BAJA')}
                  disabled={saving}
                  className="px-3 py-2 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                >
                  Baja ({selectedIds.length})
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabla + Detalle */}
      <div className="flex gap-4">
        {/* Tabla */}
        <div className={`bg-white border rounded-lg overflow-hidden ${selectedCliente ? 'w-3/5' : 'w-full'}`}>
          {loading ? (
            <div className="p-8 text-center text-gray-500">Cargando...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === clientes.length && clientes.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarifa</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Municipio</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Servicios</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prioridad</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clientes.map((cliente) => {
                    const estadoInfo = getEstadoInfo(cliente.estado)
                    const prioridadInfo = getPrioridadInfo(cliente.prioridad)
                    return (
                      <tr
                        key={cliente.id}
                        className={`hover:bg-gray-50 cursor-pointer ${selectedCliente?.id === cliente.id ? 'bg-orange-50' : ''} ${cliente.prioridad === 'ALTA' ? 'border-l-4 border-l-red-400' : ''}`}
                        onClick={() => openDetail(cliente)}
                      >
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(cliente.id)}
                            onChange={() => toggleSelect(cliente.id)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-gray-900 text-xs">{cliente.nombre}</div>
                          <div className="text-xs text-gray-500 truncate max-w-[180px]">{cliente.direccion}</div>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-700">{cliente.tarifa || '-'}</td>
                        <td className="px-3 py-3 text-xs text-gray-700">{cliente.municipio || '-'}</td>
                        <td className="px-3 py-3 text-xs">
                          <span className="font-medium">{cliente.precioCliente != null ? `${Number(cliente.precioCliente).toFixed(2)}€` : '-'}</span>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {cliente.totalContratos > 1 ? (
                            <div>
                              <span className="font-bold text-orange-600">{cliente.totalContratos}</span>
                              <span className="text-gray-500 ml-1">({Number(cliente.facturacionMensual || 0).toFixed(0)}€/mes)</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">Solo fibra</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${prioridadInfo.color}`}>
                            {prioridadInfo.label}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${estadoInfo.color}`}>
                            {estadoInfo.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {clientes.length === 0 && (
                <div className="p-8 text-center text-gray-500">No se encontraron clientes con estos filtros</div>
              )}
            </div>
          )}
        </div>

        {/* Panel detalle */}
        {selectedCliente && (
          <div className="w-2/5 bg-white border rounded-lg p-4 sticky top-4 max-h-[calc(100vh-200px)] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">{selectedCliente.nombre}</h3>
                {selectedCliente.prioridad === 'ALTA' && (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 mt-1">
                    PRIORIDAD ALTA — Tiene más servicios
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedCliente(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ×
              </button>
            </div>

            {/* Info actual */}
            <div className="space-y-3 mb-4">
              <div className="bg-gray-50 rounded p-3">
                <p className="text-xs text-gray-500 mb-1">Servicio ADAMO afectado</p>
                <p className="text-sm font-medium">{selectedCliente.tarifa || 'Sin tarifa'}</p>
                <p className="text-xs text-gray-500 mt-1">{selectedCliente.direccion}</p>
                <p className="text-xs text-gray-500">{selectedCliente.municipio}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded p-3">
                  <p className="text-xs text-gray-500">Precio cliente</p>
                  <p className="text-sm font-bold">{selectedCliente.precioCliente != null ? `${Number(selectedCliente.precioCliente).toFixed(2)}€` : '-'}</p>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <p className="text-xs text-gray-500">Coste ADAMO</p>
                  <p className="text-sm font-bold text-red-600">{selectedCliente.precioOperador != null ? `${Number(selectedCliente.precioOperador).toFixed(2)}€` : '-'}</p>
                </div>
              </div>
            </div>

            {/* Otros servicios contratados */}
            {selectedCliente.otrosServicios && selectedCliente.otrosServicios.length > 0 && (
              <div className="mb-4">
                <div className="bg-orange-50 border border-orange-200 rounded p-3">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-bold text-orange-800 uppercase">Otros servicios contratados</p>
                    <span className="text-xs font-bold text-orange-600">{Number(selectedCliente.facturacionMensual || 0).toFixed(2)}€/mes total</span>
                  </div>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {selectedCliente.otrosServicios.map((servicio, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="text-gray-700 truncate mr-2">{servicio.titulo}</span>
                        <span className="font-medium text-gray-900 whitespace-nowrap">{servicio.precio.toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Estado */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">Estado</label>
              <select
                value={selectedCliente.estado}
                onChange={(e) => handleUpdateCliente(selectedCliente.id, { estado: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
                disabled={saving}
              >
                {ESTADOS.map(e => (
                  <option key={e.value} value={e.value}>{e.label}</option>
                ))}
              </select>
            </div>

            {/* Selector de tarifa alternativa */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">Tarifa alternativa a ofrecer</label>
              <select
                value={editAlternativa}
                onChange={(e) => {
                  const selected = tarifas.find(t => t.nombre === e.target.value)
                  setEditAlternativa(e.target.value)
                  if (selected) {
                    setEditPrecioAlt(Number(selected.precioSinIva).toFixed(2))
                  }
                }}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="">— Seleccionar tarifa —</option>
                {tarifas.map(t => (
                  <option key={t.id} value={t.nombre}>
                    {t.nombre} — {Number(t.precioSinIva).toFixed(2)}€ (sin IVA) / {Number(t.precioConIva).toFixed(2)}€ (con IVA)
                  </option>
                ))}
                <option value="__otro">Otra alternativa (manual)...</option>
              </select>
              {editAlternativa === '__otro' && (
                <input
                  type="text"
                  value={editAlternativa === '__otro' ? '' : editAlternativa}
                  onChange={(e) => setEditAlternativa(e.target.value)}
                  placeholder="Ej: Fibra 300 Digi, 4G Movistar..."
                  className="w-full border rounded px-3 py-2 text-sm mt-2"
                />
              )}
            </div>

            {/* Precio alternativa + comparativa */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">Precio alternativa (sin IVA)</label>
              <input
                type="number"
                step="0.01"
                value={editPrecioAlt}
                onChange={(e) => setEditPrecioAlt(e.target.value)}
                placeholder="0.00"
                className="w-full border rounded px-3 py-2 text-sm"
              />
              {editPrecioAlt && selectedCliente.precioCliente != null && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Precio actual:</span>
                    <span className="font-medium">{Number(selectedCliente.precioCliente).toFixed(2)}€</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Precio nuevo:</span>
                    <span className="font-medium">{Number(editPrecioAlt).toFixed(2)}€</span>
                  </div>
                  <div className="flex justify-between border-t mt-1 pt-1">
                    <span className="text-gray-500 font-medium">Diferencia:</span>
                    <span className={`font-bold ${Number(editPrecioAlt) > Number(selectedCliente.precioCliente) ? 'text-red-600' : 'text-green-600'}`}>
                      {Number(editPrecioAlt) > Number(selectedCliente.precioCliente) ? '+' : ''}
                      {(Number(editPrecioAlt) - Number(selectedCliente.precioCliente)).toFixed(2)}€/mes
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Notas */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">Notas internas</label>
              <textarea
                value={editNotas}
                onChange={(e) => setEditNotas(e.target.value)}
                rows={3}
                placeholder="Notas sobre la gestión..."
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>

            {/* Guardar */}
            <button
              onClick={() => handleUpdateCliente(selectedCliente.id, {
                notas: editNotas || null,
                alternativaOfrecida: editAlternativa || null,
                precioAlternativa: editPrecioAlt ? parseFloat(editPrecioAlt) : null,
              })}
              disabled={saving}
              className="w-full bg-orange-600 text-white py-2 rounded text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>

            {/* Enviar correo */}
            <div className="mt-4 pt-4 border-t">
              <label className="text-xs text-gray-500 block mb-1">Enviar correo al cliente</label>
              {selectedCliente.emailEnviado && (
                <div className="bg-green-50 border border-green-200 rounded p-3 mb-2">
                  <p className="text-xs text-green-800 font-medium">✅ Último email enviado</p>
                  {selectedCliente.fechaEmailEnviado && (
                    <p className="text-xs text-green-600">{new Date(selectedCliente.fechaEmailEnviado).toLocaleString('es-ES')}</p>
                  )}
                  {selectedCliente.respuestaCliente && (
                    <div className="mt-2 pt-2 border-t border-green-200">
                      <p className="text-xs font-medium text-green-800">Respuesta del cliente:</p>
                      <p className={`text-sm font-bold mt-1 ${
                        selectedCliente.respuestaCliente === 'ACEPTAR' ? 'text-green-700' :
                        selectedCliente.respuestaCliente === 'LLAMAR' ? 'text-orange-700' :
                        'text-red-700'
                      }`}>
                        {selectedCliente.respuestaCliente === 'ACEPTAR' && '✅ Acepta la tarifa'}
                        {selectedCliente.respuestaCliente === 'LLAMAR' && '📞 Quiere que le llamen'}
                        {selectedCliente.respuestaCliente === 'BAJA' && '❌ Quiere dar de baja'}
                      </p>
                      {selectedCliente.fechaRespuesta && (
                        <p className="text-xs text-green-600 mt-1">{new Date(selectedCliente.fechaRespuesta).toLocaleString('es-ES')}</p>
                      )}
                    </div>
                  )}
                  {!selectedCliente.respuestaCliente && (
                    <p className="text-xs text-yellow-700 mt-1">⏳ Pendiente de respuesta</p>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="email@cliente.com, otro@email.com"
                    className="flex-1 border rounded px-3 py-2 text-sm"
                />
                <button
                  onClick={() => handleEnviarEmail(selectedCliente.id, emailInput)}
                  disabled={sendingEmail || !emailInput}
                  className="px-4 py-2 bg-blue-600 text-white text-xs rounded font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {sendingEmail ? '...' : selectedCliente.emailEnviado ? '📧 Reenviar' : '📧 Enviar'}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {editAlternativa && editAlternativa !== '__otro' && editAlternativa !== ''
                  ? `Se enviará con tarifa: ${editAlternativa}`
                  : 'Se enviará email genérico (sin tarifa seleccionada)'
                }
              </p>
            </div>

            {/* Fechas de gestión */}
            {(selectedCliente.fechaContacto || selectedCliente.fechaResolucion) && (
              <div className="mt-4 pt-4 border-t space-y-1">
                {selectedCliente.fechaContacto && (
                  <p className="text-xs text-gray-500">Contactado: {new Date(selectedCliente.fechaContacto).toLocaleDateString('es-ES')}</p>
                )}
                {selectedCliente.fechaResolucion && (
                  <p className="text-xs text-gray-500">Resuelto: {new Date(selectedCliente.fechaResolucion).toLocaleDateString('es-ES')}</p>
                )}
              </div>
            )}

            {/* Resetear */}
            <div className="mt-4 pt-4 border-t">
              <button
                onClick={() => handleResetCliente(selectedCliente.id)}
                disabled={saving}
                className="w-full py-2 border border-red-300 text-red-600 text-xs rounded font-medium hover:bg-red-50 disabled:opacity-50"
              >
                🗑️ Resetear cliente (borrar datos de gestión)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
