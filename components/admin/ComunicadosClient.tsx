'use client'

import { useState, useEffect, useCallback } from 'react'

interface Comunicado {
  id: number
  tipo: string
  asunto: string
  contenido: string
  destinatarios: string
  filtrosDestinatarios: string | null
  estado: string
  fechaEnvio: string | null
  totalEnviados: number
  creadoPor: string | null
  createdAt: string
}

interface FiltrosState {
  estado: string
  tipo: string
  municipio: string
  tieneFacturacion: string
  tarifa: string
}

interface OpcionesFiltro {
  municipios: { value: string; count: number }[]
  tarifas: { value: string; count: number }[]
  stats: { totalClientes: number; totalActivos: number; totalEmpresas: number; totalParticulares: number; totalConFacturacion: number }
}

const TIPOS = [
  { value: 'MANTENIMIENTO', label: 'Mantenimiento', color: 'bg-amber-100 text-amber-800', icon: '🔧' },
  { value: 'INCIDENCIA', label: 'Incidencia', color: 'bg-red-100 text-red-800', icon: '⚠️' },
  { value: 'NOVEDAD', label: 'Novedad', color: 'bg-blue-100 text-blue-800', icon: '🆕' },
  { value: 'COMERCIAL', label: 'Comercial', color: 'bg-green-100 text-green-800', icon: '📢' },
]

const PLANTILLAS = [
  {
    nombre: 'Mantenimiento programado',
    tipo: 'MANTENIMIENTO',
    asunto: 'Mantenimiento programado — Posible afectación del servicio',
    contenido: `Estimado cliente,

Le informamos de que vamos a realizar labores de mantenimiento programado en nuestra infraestructura.

Fecha: [DÍA] de [MES] de [AÑO]
Horario: desde las [HORA_INICIO] hasta las [HORA_FIN]
Servicios afectados: [SERVICIOS]

Durante este periodo, es posible que experimente una degradación temporal del servicio o breves interrupciones.

Estas tareas de mantenimiento son necesarias para garantizar la calidad y estabilidad de su conexión. Pedimos disculpas por las molestias.

Si tiene cualquier duda, no dude en contactarnos en el 900 730 034 o en comercial@internetoperadores.com.

Atentamente,
El equipo de Internet Operadores`,
  },
  {
    nombre: 'Incidencia en curso',
    tipo: 'INCIDENCIA',
    asunto: 'Incidencia detectada — Estamos trabajando en la solución',
    contenido: `Estimado cliente,

Le informamos de que hemos detectado una incidencia que puede estar afectando a su servicio.

Tipo de incidencia: [DESCRIPCIÓN]
Zona afectada: [ZONA]
Inicio: [FECHA_HORA]

Nuestro equipo técnico ya está trabajando para resolver la situación lo antes posible. Le mantendremos informado de la evolución.

Pedimos disculpas por las molestias ocasionadas.

Si necesita asistencia urgente, puede contactarnos en el 900 730 034.

Atentamente,
El equipo de Internet Operadores`,
  },
  {
    nombre: 'Incidencia resuelta',
    tipo: 'INCIDENCIA',
    asunto: 'Incidencia resuelta — Servicio restablecido',
    contenido: `Estimado cliente,

Le informamos de que la incidencia que estaba afectando al servicio ha sido resuelta satisfactoriamente.

Todos los servicios funcionan con normalidad.

Pedimos disculpas por las molestias ocasionadas y agradecemos su paciencia.

Si detecta cualquier anomalía, no dude en contactarnos en el 900 730 034.

Atentamente,
El equipo de Internet Operadores`,
  },
  {
    nombre: 'Novedad / Mejora',
    tipo: 'NOVEDAD',
    asunto: 'Novedad — [TÍTULO DE LA MEJORA]',
    contenido: `Estimado cliente,

Nos complace informarle de una novedad en nuestros servicios:

[DESCRIPCIÓN DE LA NOVEDAD]

Esta mejora está disponible desde [FECHA] y no requiere ninguna acción por su parte.

Si desea más información o tiene alguna consulta, estamos a su disposición en el 900 730 034 o en comercial@internetoperadores.com.

Atentamente,
El equipo de Internet Operadores`,
  },
]

export default function ComunicadosClient() {
  const [comunicados, setComunicados] = useState<Comunicado[]>([])
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState<'historial' | 'nuevo'>('historial')
  
  // Formulario
  const [tipo, setTipo] = useState('MANTENIMIENTO')
  const [asunto, setAsunto] = useState('')
  const [contenido, setContenido] = useState('')
  
  // Filtros de destinatarios
  const [filtros, setFiltros] = useState<FiltrosState>({
    estado: 'activo',
    tipo: 'todos',
    municipio: '',
    tieneFacturacion: 'todos',
    tarifa: '',
  })
  const [totalDestinatarios, setTotalDestinatarios] = useState<number | null>(null)
  const [muestraDestinatarios, setMuestraDestinatarios] = useState<any[]>([])
  const [opcionesFiltro, setOpcionesFiltro] = useState<OpcionesFiltro | null>(null)
  const [contando, setContando] = useState(false)
  
  // Preview
  const [previewHtml, setPreviewHtml] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  
  // Asistente IA
  const [showIA, setShowIA] = useState(false)
  const [iaInstrucciones, setIaInstrucciones] = useState('')
  const [iaAccion, setIaAccion] = useState<'generar' | 'mejorar'>('generar')
  const [iaLoading, setIaLoading] = useState(false)
  
  // Estados de acción
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)

  const fetchComunicados = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/comunicados')
      const data = await res.json()
      setComunicados(data.comunicados || [])
    } catch (error) {
      console.error('Error:', error)
    }
    setLoading(false)
  }, [])

  const fetchOpciones = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/comunicados/destinatarios')
      const data = await res.json()
      setOpcionesFiltro(data)
    } catch (error) {
      console.error('Error opciones:', error)
    }
  }, [])

  const contarDestinatarios = useCallback(async () => {
    setContando(true)
    try {
      const res = await fetch('/api/admin/comunicados/destinatarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filtros),
      })
      const data = await res.json()
      setTotalDestinatarios(data.total)
      setMuestraDestinatarios(data.muestra || [])
    } catch (error) {
      console.error('Error conteo:', error)
    }
    setContando(false)
  }, [filtros])

  useEffect(() => {
    fetchComunicados()
    fetchOpciones()
  }, [fetchComunicados, fetchOpciones])

  useEffect(() => {
    if (vista === 'nuevo') {
      const timer = setTimeout(() => contarDestinatarios(), 300)
      return () => clearTimeout(timer)
    }
  }, [filtros, vista, contarDestinatarios])

  const handlePlantilla = (plantilla: typeof PLANTILLAS[0]) => {
    setTipo(plantilla.tipo)
    setAsunto(plantilla.asunto)
    setContenido(plantilla.contenido)
  }

  const handlePreview = async () => {
    if (!asunto || !contenido) {
      alert('Rellena el asunto y el contenido primero')
      return
    }
    try {
      const res = await fetch('/api/admin/comunicados/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asunto, contenido, tipo }),
      })
      const data = await res.json()
      setPreviewHtml(data.html)
      setShowPreview(true)
    } catch (error) {
      console.error('Error preview:', error)
    }
  }

  const handleIA = async () => {
    if (!iaInstrucciones.trim()) {
      alert('Escribe las instrucciones para la IA')
      return
    }
    setIaLoading(true)
    try {
      const res = await fetch('/api/admin/comunicados/asistente-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: iaAccion,
          instrucciones: iaInstrucciones,
          contenidoActual: contenido,
          tipo,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        if (data.contenido) setContenido(data.contenido)
        if (data.asunto && iaAccion === 'generar') setAsunto(data.asunto)
        setShowIA(false)
        setIaInstrucciones('')
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      alert('Error al comunicar con la IA')
    }
    setIaLoading(false)
  }

  const handleGuardarBorrador = async () => {
    if (!asunto || !contenido) {
      alert('Rellena el asunto y el contenido')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/comunicados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, asunto, contenido, destinatarios: 'TODOS', filtros }),
      })
      if (res.ok) {
        alert('Comunicado guardado como borrador')
        setVista('historial')
        resetFormulario()
        await fetchComunicados()
      } else {
        alert('Error al guardar')
      }
    } catch {
      alert('Error al guardar')
    }
    setSaving(false)
  }

  const handleGuardarYEnviar = async () => {
    if (!asunto || !contenido) {
      alert('Rellena el asunto y el contenido')
      return
    }
    if (totalDestinatarios === 0) {
      alert('No hay destinatarios con los filtros seleccionados')
      return
    }
    if (!confirm(`¿Enviar este comunicado a ${totalDestinatarios} clientes?\n\nAsunto: ${asunto}\n\nEsta acción no se puede deshacer.`)) return

    setSending(true)
    try {
      // Primero guardar
      const saveRes = await fetch('/api/admin/comunicados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, asunto, contenido, destinatarios: 'TODOS', filtros }),
      })
      if (!saveRes.ok) {
        alert('Error al guardar el comunicado')
        setSending(false)
        return
      }
      const comunicado = await saveRes.json()

      // Luego enviar
      const sendRes = await fetch('/api/admin/comunicados/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comunicadoId: comunicado.id }),
      })
      const sendData = await sendRes.json()

      if (sendRes.ok) {
        alert(sendData.message)
        setVista('historial')
        resetFormulario()
        await fetchComunicados()
      } else {
        alert(`Error al enviar: ${sendData.error || 'Error desconocido'}`)
      }
    } catch (error) {
      alert('Error al enviar')
    }
    setSending(false)
  }

  const handleEnviarBorrador = async (id: number) => {
    const comunicado = comunicados.find(c => c.id === id)
    if (!comunicado) return
    if (!confirm(`¿Enviar el comunicado "${comunicado.asunto}"?`)) return

    setSending(true)
    try {
      const res = await fetch('/api/admin/comunicados/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comunicadoId: id }),
      })
      const data = await res.json()
      if (res.ok) {
        alert(data.message)
        await fetchComunicados()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch {
      alert('Error al enviar')
    }
    setSending(false)
  }

  const resetFormulario = () => {
    setTipo('MANTENIMIENTO')
    setAsunto('')
    setContenido('')
    setFiltros({ estado: 'activo', tipo: 'todos', municipio: '', tieneFacturacion: 'todos', tarifa: '' })
    setShowPreview(false)
    setPreviewHtml('')
    setShowIA(false)
    setIaInstrucciones('')
  }

  const getTipoInfo = (t: string) => TIPOS.find(x => x.value === t) || TIPOS[0]

  const formatFecha = (fecha: string) => {
    return new Date(fecha).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comunicados</h1>
          <p className="text-gray-500 mt-1">Envía comunicados a tus clientes desde los datos reales de ISPGestión</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setVista('historial'); resetFormulario() }}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${vista === 'historial' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Historial
          </button>
          <button
            onClick={() => setVista('nuevo')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${vista === 'nuevo' ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'}`}
          >
            + Nuevo comunicado
          </button>
        </div>
      </div>

      {/* Vista: Nuevo comunicado */}
      {vista === 'nuevo' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna izquierda: Formulario */}
          <div className="lg:col-span-2 space-y-4">
            {/* Tipo */}
            <div className="bg-white border rounded-lg p-4">
              <label className="text-sm font-medium text-gray-700 block mb-2">Tipo de comunicado</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {TIPOS.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTipo(t.value)}
                    className={`p-3 rounded-lg border text-sm font-medium text-center transition-all ${
                      tipo === t.value
                        ? 'border-orange-500 bg-orange-50 text-orange-700 ring-2 ring-orange-200'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-lg block mb-1">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Destinatarios con filtros */}
            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-700">Destinatarios</label>
                <div className="flex items-center gap-2">
                  {contando ? (
                    <span className="text-xs text-gray-400">Contando...</span>
                  ) : totalDestinatarios !== null ? (
                    <span className="text-sm font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full">
                      {totalDestinatarios} clientes
                    </span>
                  ) : null}
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {/* Estado */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Estado</label>
                  <select
                    value={filtros.estado}
                    onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2.5 text-base text-gray-900"
                  >
                    <option value="todos">Todos</option>
                    <option value="activo">Solo activos</option>
                    <option value="baja">Solo dados de baja</option>
                  </select>
                </div>

                {/* Tipo cliente */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Tipo cliente</label>
                  <select
                    value={filtros.tipo}
                    onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2.5 text-base text-gray-900"
                  >
                    <option value="todos">Todos</option>
                    <option value="empresa">Empresas</option>
                    <option value="particular">Particulares</option>
                  </select>
                </div>

                {/* Facturación */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Facturación</label>
                  <select
                    value={filtros.tieneFacturacion}
                    onChange={(e) => setFiltros({ ...filtros, tieneFacturacion: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2.5 text-base text-gray-900"
                  >
                    <option value="todos">Todos</option>
                    <option value="con">Con facturación activa</option>
                    <option value="sin">Sin facturación</option>
                  </select>
                </div>

                {/* Municipio */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Municipio</label>
                  <select
                    value={filtros.municipio}
                    onChange={(e) => setFiltros({ ...filtros, municipio: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2.5 text-base text-gray-900"
                  >
                    <option value="">Todos</option>
                    {opcionesFiltro?.municipios.map(m => (
                      <option key={m.value} value={m.value}>{m.value} ({m.count})</option>
                    ))}
                  </select>
                </div>

                {/* Tarifa / Servicio */}
                <div className="col-span-2 md:col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">Tarifa / Servicio contratado</label>
                  <select
                    value={filtros.tarifa}
                    onChange={(e) => setFiltros({ ...filtros, tarifa: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2.5 text-base text-gray-900"
                  >
                    <option value="">Todas las tarifas</option>
                    {opcionesFiltro?.tarifas.map(t => (
                      <option key={t.value} value={t.value}>{t.value} ({t.count})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Muestra de destinatarios */}
              {muestraDestinatarios.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-gray-500 mb-1">Muestra de destinatarios:</p>
                  <div className="flex flex-wrap gap-1">
                    {muestraDestinatarios.map((d: any) => (
                      <span key={d.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {d.nombre}
                      </span>
                    ))}
                    {totalDestinatarios && totalDestinatarios > 10 && (
                      <span className="text-xs text-gray-400">+{totalDestinatarios - 10} más</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Asunto */}
            <div className="bg-white border rounded-lg p-4">
              <label className="text-sm font-medium text-gray-700 block mb-2">Asunto del email</label>
              <input
                type="text"
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                placeholder="Ej: Mantenimiento programado — 16 de junio"
                className="w-full border rounded-lg px-4 py-2.5 text-base text-gray-900 focus:ring-2 focus:ring-orange-200 focus:border-orange-500"
              />
            </div>

            {/* Contenido + IA */}
            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Contenido del mensaje</label>
                <button
                  onClick={() => setShowIA(!showIA)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    showIA
                      ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-300'
                      : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                  }`}
                >
                  ✨ Asistente IA
                </button>
              </div>

              {/* Panel del Asistente IA */}
              {showIA && (
                <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setIaAccion('generar')}
                      className={`px-3 py-1.5 rounded text-xs font-medium ${
                        iaAccion === 'generar' ? 'bg-purple-600 text-white' : 'bg-white text-purple-700 border border-purple-300'
                      }`}
                    >
                      Generar desde cero
                    </button>
                    <button
                      onClick={() => setIaAccion('mejorar')}
                      className={`px-3 py-1.5 rounded text-xs font-medium ${
                        iaAccion === 'mejorar' ? 'bg-purple-600 text-white' : 'bg-white text-purple-700 border border-purple-300'
                      }`}
                    >
                      Mejorar redactado actual
                    </button>
                  </div>
                  <textarea
                    value={iaInstrucciones}
                    onChange={(e) => setIaInstrucciones(e.target.value)}
                    placeholder={iaAccion === 'generar'
                      ? 'Describe qué quieres comunicar. Ej: "Mañana 16 de junio de 23:00 a 4:00 del 17 haremos mantenimiento, posible degradación del servicio de internet"'
                      : 'Instrucciones para mejorar. Ej: "Hazlo más formal" o "Añade que pueden llamar si tienen dudas"'
                    }
                    rows={3}
                    className="w-full border border-purple-200 rounded-lg px-3 py-2.5 text-base text-gray-900 focus:ring-2 focus:ring-purple-200 focus:border-purple-400 bg-white"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={handleIA}
                      disabled={iaLoading || !iaInstrucciones.trim()}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {iaLoading ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                          Generando...
                        </>
                      ) : (
                        <>✨ {iaAccion === 'generar' ? 'Generar texto' : 'Mejorar texto'}</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              <textarea
                value={contenido}
                onChange={(e) => setContenido(e.target.value)}
                placeholder="Escribe aquí el contenido del comunicado...&#10;&#10;Usa doble salto de línea para separar párrafos."
                rows={14}
                className="w-full border rounded-lg px-4 py-3 text-base text-gray-900 focus:ring-2 focus:ring-orange-200 focus:border-orange-500"
              />
              <p className="text-xs text-gray-400 mt-2">Doble Enter para nuevo párrafo. El formato se aplica automáticamente en el email.</p>
            </div>

            {/* Botones de acción */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={handlePreview}
                className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                Vista previa
              </button>
              <button
                onClick={handleGuardarBorrador}
                disabled={saving}
                className="px-4 py-2.5 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar borrador'}
              </button>
              <button
                onClick={handleGuardarYEnviar}
                disabled={sending || totalDestinatarios === 0}
                className="px-5 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
              >
                {sending ? 'Enviando...' : `Enviar a ${totalDestinatarios || 0} clientes`}
              </button>
            </div>
          </div>

          {/* Columna derecha: Plantillas + Info */}
          <div className="space-y-4">
            {/* Stats rápidos */}
            {opcionesFiltro?.stats && (
              <div className="bg-white border rounded-lg p-4">
                <h3 className="text-sm font-bold text-gray-900 mb-2">Clientes en el panel</h3>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-gray-50 rounded p-2">
                    <p className="text-lg font-bold text-gray-900">{opcionesFiltro.stats.totalActivos}</p>
                    <p className="text-xs text-gray-500">Activos</p>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <p className="text-lg font-bold text-gray-900">{opcionesFiltro.stats.totalClientes}</p>
                    <p className="text-xs text-gray-500">Total</p>
                  </div>
                  <div className="bg-blue-50 rounded p-2">
                    <p className="text-lg font-bold text-blue-700">{opcionesFiltro.stats.totalEmpresas}</p>
                    <p className="text-xs text-gray-500">Empresas</p>
                  </div>
                  <div className="bg-green-50 rounded p-2">
                    <p className="text-lg font-bold text-green-700">{opcionesFiltro.stats.totalParticulares}</p>
                    <p className="text-xs text-gray-500">Particulares</p>
                  </div>
                </div>
              </div>
            )}

            {/* Plantillas */}
            <div className="bg-white border rounded-lg p-4">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Plantillas</h3>
              <div className="space-y-2">
                {PLANTILLAS.map((p, idx) => {
                  const tipoInfo = getTipoInfo(p.tipo)
                  return (
                    <button
                      key={idx}
                      onClick={() => handlePlantilla(p)}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition-all"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${tipoInfo.color}`}>{tipoInfo.label}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-800">{p.nombre}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Consejos */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-bold text-blue-900 mb-2">Consejos</h4>
              <ul className="text-xs text-blue-800 space-y-1.5">
                <li>• Usa el Asistente IA para generar o mejorar textos</li>
                <li>• Filtra destinatarios por tipo, zona o contrato</li>
                <li>• Revisa la vista previa antes de enviar</li>
                <li>• Los emails se envían desde comercial@internetoperadores.com</li>
                <li>• Puedes guardar como borrador y enviar después</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Vista previa modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">Vista previa del email</h3>
              <button onClick={() => setShowPreview(false)} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-100">
              <div className="text-xs text-gray-500 mb-2">
                <strong>De:</strong> Internet Operadores &lt;comercial@internetoperadores.com&gt;<br/>
                <strong>Asunto:</strong> {asunto}<br/>
                <strong>Para:</strong> {totalDestinatarios} clientes
              </div>
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} className="border rounded-lg overflow-hidden" />
            </div>
            <div className="p-4 border-t flex justify-end gap-3">
              <button onClick={() => setShowPreview(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">
                Cerrar
              </button>
              <button
                onClick={() => { setShowPreview(false); handleGuardarYEnviar() }}
                className="px-5 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700"
              >
                Enviar a {totalDestinatarios} clientes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vista: Historial */}
      {vista === 'historial' && (
        <div>
          {loading ? (
            <div className="text-center py-12 text-gray-500">Cargando comunicados...</div>
          ) : comunicados.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No hay comunicados todavía</p>
              <button onClick={() => setVista('nuevo')} className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700">
                Crear primer comunicado
              </button>
            </div>
          ) : (
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Asunto</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Enviados</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {comunicados.map(c => {
                    const tipoInfo = getTipoInfo(c.tipo)
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded font-medium ${tipoInfo.color}`}>
                            {tipoInfo.icon} {tipoInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900 truncate max-w-[300px]">{c.asunto}</p>
                        </td>
                        <td className="px-4 py-3">
                          {c.estado === 'ENVIADO' ? (
                            <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800 font-medium">Enviado</span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 font-medium">Borrador</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {c.fechaEnvio ? formatFecha(c.fechaEnvio) : formatFecha(c.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {c.estado === 'ENVIADO' ? c.totalEnviados : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {c.estado === 'BORRADOR' && (
                            <button
                              onClick={() => handleEnviarBorrador(c.id)}
                              disabled={sending}
                              className="text-xs px-3 py-1.5 bg-orange-600 text-white rounded font-medium hover:bg-orange-700 disabled:opacity-50"
                            >
                              Enviar
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
