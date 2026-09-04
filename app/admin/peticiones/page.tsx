'use client'

import { useEffect, useState } from 'react'

interface PeticionMensaje {
  id: number
  autorEmail: string
  autorNombre: string
  autorTipo: string
  tipo: string
  mensaje: string
  createdAt: string
}

interface Peticion {
  id: number
  tipo: string
  seccion: string
  titulo: string
  descripcion: string
  prioridad: string
  estado: string
  captura: string | null
  notasAdmin: string | null
  usuarioEmail: string
  usuarioNombre: string
  resueltaPor: string | null
  fechaResolucion: string | null
  feedbackSatisfecho: boolean | null
  fechaFeedback: string | null
  fechaCierre: string | null
  createdAt: string
  updatedAt: string
  mensajes: PeticionMensaje[]
}

const ESTADOS = [
  { v: 'pendiente', l: 'Pendiente', c: 'bg-yellow-100 text-yellow-800' },
  { v: 'aprobada', l: 'Aprobada', c: 'bg-blue-100 text-blue-800' },
  { v: 'en_desarrollo', l: 'En desarrollo', c: 'bg-indigo-100 text-indigo-800' },
  { v: 'pendiente_validacion', l: 'Por validar', c: 'bg-violet-100 text-violet-800' },
  { v: 'ajustes_solicitados', l: 'Requiere ajustes', c: 'bg-amber-100 text-amber-800' },
  { v: 'resuelta', l: 'Cerrada', c: 'bg-green-100 text-green-800' },
  { v: 'descartada', l: 'Descartada', c: 'bg-gray-100 text-gray-600' },
]

const ESTADOS_ADMIN = ESTADOS.filter(item => ['pendiente', 'aprobada', 'en_desarrollo', 'descartada'].includes(item.v))

const TIPOS = [
  { v: 'error', l: 'Error', c: 'bg-red-100 text-red-800' },
  { v: 'mejora', l: 'Mejora', c: 'bg-blue-100 text-blue-800' },
  { v: 'sugerencia', l: 'Sugerencia', c: 'bg-green-100 text-green-800' },
]

const PRIORIDADES = [
  { v: 'baja', l: 'Baja', c: 'text-gray-500' },
  { v: 'media', l: 'Media', c: 'text-yellow-600' },
  { v: 'alta', l: 'Alta', c: 'text-orange-600' },
  { v: 'critica', l: 'Crítica', c: 'text-red-600' },
]

export default function AdminPeticionesPage() {
  const [peticiones, setPeticiones] = useState<Peticion[]>([])
  const [kpis, setKpis] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [detalle, setDetalle] = useState<Peticion | null>(null)
  const [notasEdit, setNotasEdit] = useState('')
  const [mensajeEntrega, setMensajeEntrega] = useState('')
  const [comentario, setComentario] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [error, setError] = useState('')

  async function fetchData() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (filtroEstado) params.set('estado', filtroEstado)
      if (filtroTipo) params.set('tipo', filtroTipo)
      const res = await fetch(`/api/admin/peticiones?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se han podido cargar las peticiones')
      setPeticiones(data.peticiones || [])
      setKpis(data.kpis || {})
      setDetalle(current => {
        if (!current) return null
        return (data.peticiones || []).find((item: Peticion) => item.id === current.id) || current
      })
    } catch (e: any) {
      setError(e.message || 'No se han podido cargar las peticiones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [filtroEstado, filtroTipo])

  async function handleAction(action: string, id: number, extra?: Record<string, unknown>) {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/peticiones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id, ...(extra || {}) }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'No se ha podido completar la acción')
      if (data.peticion) {
        setDetalle(current => current?.id === id ? data.peticion : current)
      }
      if (action === 'enviar_validacion' && data.email?.enviado === false) {
        alert('La petición ha quedado pendiente de validación, pero el correo no ha podido enviarse. El usuario seguirá viendo el aviso al iniciar sesión.')
      }
      await fetchData()
      return true
    } catch (e: any) {
      alert(e.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  function abrirDetalle(peticion: Peticion) {
    setDetalle(peticion)
    setNotasEdit(peticion.notasAdmin || '')
    setMensajeEntrega('')
    setComentario('')
  }

  async function handleGuardarNotas() {
    if (!detalle) return
    const success = await handleAction('notas_admin', detalle.id, { notas: notasEdit })
    if (success) setDetalle(current => current ? { ...current, notasAdmin: notasEdit.trim() || null } : null)
  }

  async function handleEnviarComentario() {
    if (!detalle) return
    if (!comentario.trim()) {
      alert('Escribe un comentario antes de enviarlo')
      return
    }
    setSendingComment(true)
    const success = await handleAction('comentario', detalle.id, { mensaje: comentario })
    if (success) setComentario('')
    setSendingComment(false)
  }

  async function handleEnviarValidacion() {
    if (!detalle) return
    if (!mensajeEntrega.trim()) {
      alert('Explica al solicitante qué se ha realizado antes de enviar a validación')
      return
    }
    const success = await handleAction('enviar_validacion', detalle.id, { mensaje: mensajeEntrega })
    if (success) setMensajeEntrega('')
  }

  const estadoBadge = (estado: string) => {
    const item = ESTADOS.find(value => value.v === estado)
    return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item?.c || 'bg-gray-100 text-gray-700'}`}>{item?.l || estado}</span>
  }

  const tipoBadge = (tipo: string) => {
    const item = TIPOS.find(value => value.v === tipo)
    return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item?.c || 'bg-gray-100 text-gray-700'}`}>{item?.l || tipo}</span>
  }

  const prioridadBadge = (prioridad: string) => {
    const item = PRIORIDADES.find(value => value.v === prioridad)
    return <span className={`text-xs font-semibold ${item?.c || 'text-gray-500'}`}>{item?.l || prioridad}</span>
  }

  const seccionLabel = (seccion: string) => ({
    panel_admin: 'Panel Admin',
    web_publica: 'Web',
    portal_empleado: 'Portal',
  }[seccion] || seccion)

  const estadoLabel = (estado: string) => ESTADOS.find(item => item.v === estado)?.l || estado
  const puedeEnviarValidacion = (estado: string) => ['aprobada', 'en_desarrollo', 'ajustes_solicitados'].includes(estado)

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Peticiones y Mejoras</h1>
        <p className="mt-1 text-sm text-gray-500">Gestiona las peticiones del equipo y solicita la conformidad antes de cerrarlas.</p>
      </div>

      <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
        <p className="font-semibold">El estado “Cerrada” ya no se asigna manualmente.</p>
        <p className="mt-1 text-violet-800">Utiliza la conversación para aclarar requisitos y ajustes. Cuando el trabajo esté listo, envíalo a validación; el cierre se producirá cuando el solicitante confirme su conformidad.</p>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!loading && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <button className="rounded-xl border bg-white p-3 text-left hover:border-yellow-400" onClick={() => setFiltroEstado(filtroEstado === 'pendiente' ? '' : 'pendiente')}>
            <p className="text-xs text-gray-500">Pendientes</p><p className="text-2xl font-bold text-yellow-600">{kpis.pendientes || 0}</p>
          </button>
          <button className="rounded-xl border bg-white p-3 text-left hover:border-blue-400" onClick={() => setFiltroEstado(filtroEstado === 'aprobada' ? '' : 'aprobada')}>
            <p className="text-xs text-gray-500">Aprobadas</p><p className="text-2xl font-bold text-blue-600">{kpis.aprobadas || 0}</p>
          </button>
          <button className="rounded-xl border bg-white p-3 text-left hover:border-indigo-400" onClick={() => setFiltroEstado(filtroEstado === 'en_desarrollo' ? '' : 'en_desarrollo')}>
            <p className="text-xs text-gray-500">En desarrollo</p><p className="text-2xl font-bold text-indigo-600">{kpis.enDesarrollo || 0}</p>
          </button>
          <button className="rounded-xl border bg-white p-3 text-left hover:border-violet-400" onClick={() => setFiltroEstado(filtroEstado === 'pendiente_validacion' ? '' : 'pendiente_validacion')}>
            <p className="text-xs text-gray-500">Por validar</p><p className="text-2xl font-bold text-violet-600">{kpis.porValidar || 0}</p>
          </button>
          <button className="rounded-xl border bg-white p-3 text-left hover:border-amber-400" onClick={() => setFiltroEstado(filtroEstado === 'ajustes_solicitados' ? '' : 'ajustes_solicitados')}>
            <p className="text-xs text-gray-500">Con ajustes</p><p className="text-2xl font-bold text-amber-600">{kpis.conAjustes || 0}</p>
          </button>
          <button className="rounded-xl border bg-white p-3 text-left hover:border-green-400" onClick={() => setFiltroEstado(filtroEstado === 'resuelta' ? '' : 'resuelta')}>
            <p className="text-xs text-gray-500">Cerradas</p><p className="text-2xl font-bold text-green-600">{kpis.resueltas || 0}</p>
          </button>
          <div className="rounded-xl border bg-white p-3">
            <p className="text-xs text-gray-500">Total</p><p className="text-2xl font-bold text-gray-900">{kpis.total || 0}</p>
            <div className="mt-1 flex gap-2"><span className="text-xs text-red-500">{kpis.errores || 0} errores</span><span className="text-xs text-blue-500">{kpis.mejoras || 0} mejoras</span></div>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-col">
          <label className="mb-1 text-xs text-gray-500">Estado</label>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="rounded-lg border px-3 py-2 text-sm text-gray-900">
            <option value="">Todos</option>
            {ESTADOS.map(item => <option key={item.v} value={item.v}>{item.l}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="mb-1 text-xs text-gray-500">Tipo</label>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm text-gray-900">
            <option value="">Todos</option>
            {TIPOS.map(item => <option key={item.v} value={item.v}>{item.l}</option>)}
          </select>
        </div>
        {(filtroEstado || filtroTipo) && <button onClick={() => { setFiltroEstado(''); setFiltroTipo('') }} className="mt-5 text-xs font-medium text-orange-600 hover:text-orange-800">Limpiar filtros</button>}
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500">Cargando...</div>
      ) : peticiones.length === 0 ? (
        <div className="rounded-xl border bg-white py-16 text-center text-gray-500">No hay peticiones con estos filtros</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Título</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Usuario</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Sección</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Prioridad</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {peticiones.map(peticion => {
                const estadoEditable = ESTADOS_ADMIN.some(item => item.v === peticion.estado)
                return (
                  <tr key={peticion.id} className="cursor-pointer hover:bg-gray-50" onClick={() => abrirDetalle(peticion)}>
                    <td className="px-4 py-3 text-xs text-gray-400">#{peticion.id}</td>
                    <td className="px-4 py-3">{tipoBadge(peticion.tipo)}</td>
                    <td className="max-w-xs truncate px-4 py-3 font-medium text-gray-900">{peticion.titulo}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{peticion.usuarioNombre}</td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500">{seccionLabel(peticion.seccion)}</td>
                    <td className="px-4 py-3 text-center">{prioridadBadge(peticion.prioridad)}</td>
                    <td className="px-4 py-3 text-center">{estadoBadge(peticion.estado)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(peticion.createdAt).toLocaleDateString('es-ES')}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <select
                          value={estadoEditable ? peticion.estado : 'bloqueado'}
                          onChange={e => handleAction('cambiar_estado', peticion.id, { estado: e.target.value })}
                          disabled={saving}
                          className="rounded border px-2 py-1 text-xs text-gray-700"
                          title="El cierre solo lo confirma el solicitante"
                        >
                          {!estadoEditable && <option value="bloqueado" disabled>{estadoLabel(peticion.estado)}</option>}
                          {ESTADOS_ADMIN.map(item => <option key={item.v} value={item.v}>{item.l}</option>)}
                        </select>
                        <button onClick={() => abrirDetalle(peticion)} className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">Ver</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetalle(null)}>
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 sm:p-6" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">{tipoBadge(detalle.tipo)}{estadoBadge(detalle.estado)}{prioridadBadge(detalle.prioridad)}<span className="text-xs text-gray-400">{seccionLabel(detalle.seccion)}</span></div>
                <h2 className="text-xl font-bold text-gray-900">#{detalle.id} — {detalle.titulo}</h2>
                <p className="mt-1 text-sm text-gray-500">Por {detalle.usuarioNombre} el {new Date(detalle.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
              </div>
              <button onClick={() => setDetalle(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Cerrar">×</button>
            </div>

            <div className="mb-4 rounded-lg bg-gray-50 p-4"><p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{detalle.descripcion}</p></div>

            {detalle.captura && (
              <div className="mb-4"><p className="mb-2 text-sm font-medium text-gray-700">Captura adjunta</p><img src={detalle.captura} alt="Captura" className="max-h-64 cursor-pointer rounded-lg border" onClick={() => window.open(detalle.captura!, '_blank')} /></div>
            )}

            {detalle.estado === 'pendiente_validacion' && (
              <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900"><p className="font-semibold">Esperando la validación de {detalle.usuarioNombre}</p><p className="mt-1">No se puede cerrar manualmente. El solicitante debe confirmar que la entrega cumple sus requisitos o devolverla con comentarios.</p></div>
            )}

            {detalle.estado === 'ajustes_solicitados' && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">El solicitante ha pedido ajustes</p><p className="mt-1">Revisa el último mensaje de la conversación, aplica los cambios y vuelve a enviar una entrega para validación.</p></div>
            )}

            {detalle.estado === 'resuelta' && detalle.feedbackSatisfecho === true && (
              <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900"><p className="font-semibold">Cerrada con conformidad del solicitante</p><p className="mt-1">{detalle.usuarioNombre} confirmó que cumple sus requisitos{detalle.fechaCierre ? ` el ${new Date(detalle.fechaCierre).toLocaleDateString('es-ES')}` : ''}.</p></div>
            )}

            {detalle.estado === 'resuelta' && detalle.feedbackSatisfecho === null && (
              <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700"><p className="font-semibold">Cierre histórico</p><p className="mt-1">Esta petición se cerró antes de incorporar el nuevo flujo de validación del solicitante.</p></div>
            )}

            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Estado de gestión</label>
                <select
                  value={ESTADOS_ADMIN.some(item => item.v === detalle.estado) ? detalle.estado : 'bloqueado'}
                  onChange={async e => { const success = await handleAction('cambiar_estado', detalle.id, { estado: e.target.value }); if (success) setDetalle(current => current ? { ...current, estado: e.target.value } : null) }}
                  disabled={saving}
                  className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900"
                >
                  {!ESTADOS_ADMIN.some(item => item.v === detalle.estado) && <option value="bloqueado" disabled>{estadoLabel(detalle.estado)}</option>}
                  {ESTADOS_ADMIN.map(item => <option key={item.v} value={item.v}>{item.l}</option>)}
                </select>
                <p className="mt-1 text-xs text-gray-500">“Cerrada” se asigna automáticamente al recibir la conformidad.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Prioridad</label>
                <select value={detalle.prioridad} onChange={async e => { const success = await handleAction('cambiar_prioridad', detalle.id, { prioridad: e.target.value }); if (success) setDetalle(current => current ? { ...current, prioridad: e.target.value } : null) }} disabled={saving} className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900">
                  {PRIORIDADES.map(item => <option key={item.v} value={item.v}>{item.l}</option>)}
                </select>
              </div>
            </div>

            <div className="mb-5">
              <label className="mb-1 block text-xs font-medium text-gray-600">Nota visible para el usuario</label>
              <textarea value={notasEdit} onChange={e => setNotasEdit(e.target.value)} rows={3} placeholder="Información de seguimiento que el usuario podrá consultar..." className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900" />
              <button onClick={handleGuardarNotas} disabled={saving} className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Guardar nota</button>
            </div>

            {puedeEnviarValidacion(detalle.estado) && (
              <div className="mb-5 rounded-xl border border-violet-200 bg-violet-50 p-4">
                <h3 className="font-semibold text-violet-950">Enviar al usuario para validación</h3>
                <p className="mt-1 text-sm text-violet-800">Explica qué se ha realizado. La entrega quedará registrada y enviaremos un correo automático al solicitante para que la revise.</p>
                <textarea value={mensajeEntrega} onChange={e => setMensajeEntrega(e.target.value)} rows={4} placeholder="Ejemplo: Hemos corregido el formulario y verificado que conserva todos los campos. Por favor, comprueba si ahora cumple lo solicitado." className="mt-3 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900" />
                <button onClick={handleEnviarValidacion} disabled={saving} className="mt-3 w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 sm:w-auto">{saving ? 'Enviando...' : 'Enviar para validación'}</button>
              </div>
            )}

            <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h3 className="font-semibold text-gray-900">Conversación con {detalle.usuarioNombre}</h3>
              <p className="mt-1 text-xs text-gray-500">Utiliza este hilo para aclarar requisitos y debatir ajustes. Los comentarios no cambian el estado de la petición.</p>
              <div className="mt-4 space-y-3">
                {detalle.mensajes?.length > 0 ? detalle.mensajes.map(mensaje => (
                  <div key={mensaje.id} className={`rounded-lg border p-3 ${mensaje.autorTipo === 'solicitante' ? 'ml-0 border-orange-200 bg-orange-50 sm:ml-12' : 'mr-0 border-blue-200 bg-blue-50 sm:mr-12'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-gray-800">{mensaje.autorNombre} · {mensaje.autorTipo === 'solicitante' ? 'Solicitante' : 'Equipo'}</p><p className="text-xs text-gray-500">{new Date(mensaje.createdAt).toLocaleString('es-ES')}</p></div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{mensaje.mensaje}</p>
                  </div>
                )) : <p className="rounded-lg bg-white p-3 text-sm text-gray-500">Todavía no hay comentarios. Puedes abrir la conversación con el solicitante.</p>}
              </div>

              {!['resuelta', 'descartada'].includes(detalle.estado) ? (
                <div className="mt-4 border-t pt-4">
                  <label className="text-xs font-semibold text-gray-700">Escribir al solicitante</label>
                  <textarea value={comentario} onChange={e => setComentario(e.target.value)} maxLength={2000} rows={3} placeholder="Escribe una aclaración, pregunta o respuesta sobre los ajustes..." className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900" />
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-gray-500">Máximo 2.000 caracteres.</p>
                    <button onClick={handleEnviarComentario} disabled={saving || sendingComment} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{sendingComment ? 'Enviando...' : 'Enviar comentario'}</button>
                  </div>
                </div>
              ) : <p className="mt-4 border-t pt-3 text-xs text-gray-500">La conversación quedó cerrada con la petición.</p>}
            </div>

            {detalle.notasAdmin && detalle.mensajes?.length === 0 && (
              <div className="mb-5 rounded-lg bg-blue-50 p-3 text-sm text-blue-900"><p className="font-semibold">Respuesta histórica visible</p><p className="mt-1 whitespace-pre-wrap">{detalle.notasAdmin}</p></div>
            )}

            {detalle.resueltaPor && (
              <div className="mb-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">Última entrega registrada por <strong>{detalle.resueltaPor}</strong>{detalle.fechaResolucion ? ` el ${new Date(detalle.fechaResolucion).toLocaleDateString('es-ES')}` : ''}.</div>
            )}

            <div className="flex justify-end border-t pt-4">
              <button onClick={() => { if (confirm('¿Eliminar esta petición?')) { handleAction('eliminar', detalle.id); setDetalle(null) } }} className="text-xs text-red-500 hover:text-red-700">Eliminar petición</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
