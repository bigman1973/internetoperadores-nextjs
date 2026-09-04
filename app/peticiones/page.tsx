'use client'

import { useEffect, useRef, useState } from 'react'

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

interface FeedbackForm {
  peticion: Peticion
  satisfecho: boolean
  comentario: string
}

const ESTADOS: Record<string, { color: string; label: string }> = {
  pendiente: { color: 'bg-yellow-100 text-yellow-800', label: 'Pendiente' },
  aprobada: { color: 'bg-blue-100 text-blue-800', label: 'Aprobada' },
  en_desarrollo: { color: 'bg-indigo-100 text-indigo-800', label: 'En desarrollo' },
  pendiente_validacion: { color: 'bg-violet-100 text-violet-800', label: 'Pendiente de tu validación' },
  ajustes_solicitados: { color: 'bg-amber-100 text-amber-800', label: 'Requiere ajustes' },
  resuelta: { color: 'bg-green-100 text-green-800', label: 'Cerrada' },
  descartada: { color: 'bg-gray-100 text-gray-600', label: 'Descartada' },
}

export default function PeticionesPage() {
  const [peticiones, setPeticiones] = useState<Peticion[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ tipo: 'mejora', seccion: 'panel_admin', titulo: '', descripcion: '', captura: '' })
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [feedbackForm, setFeedbackForm] = useState<FeedbackForm | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [comentarios, setComentarios] = useState<Record<number, string>>({})
  const [sendingCommentId, setSendingCommentId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [isImpersonating, setIsImpersonating] = useState(false)
  const [viewedEmail, setViewedEmail] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function fetchData() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams(window.location.search)
      const asEmail = params.get('as')
      const endpoint = asEmail ? `/api/peticiones?as=${encodeURIComponent(asEmail)}` : '/api/peticiones'
      const res = await fetch(endpoint, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se han podido cargar las peticiones')
      setPeticiones(data.peticiones || [])
      setIsImpersonating(Boolean(data.isImpersonating))
      setViewedEmail(data.usuarioEmail || '')
    } catch (e: any) {
      setError(e.message || 'No se han podido cargar tus peticiones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  async function handleSubmit() {
    if (isImpersonating) return
    if (!form.titulo.trim() || !form.descripcion.trim()) {
      alert('El título y la descripción son obligatorios')
      return
    }
    setSaving(true)
    try {
      const isEdit = editingId !== null
      const res = await fetch('/api/peticiones', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { id: editingId, ...form } : form),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'No se ha podido guardar la petición')

      setShowForm(false)
      setEditingId(null)
      setForm({ tipo: 'mejora', seccion: 'panel_admin', titulo: '', descripcion: '', captura: '' })
      await fetchData()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleFeedback() {
    if (isImpersonating || !feedbackForm) return
    if (!feedbackForm.satisfecho && !feedbackForm.comentario.trim()) {
      alert('Explícanos qué ajustes necesitas para poder revisarlo')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/peticiones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: feedbackForm.peticion.id,
          satisfecho: feedbackForm.satisfecho,
          comentario: feedbackForm.comentario,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'No se ha podido guardar tu respuesta')
      setFeedbackForm(null)
      setExpandedId(data.peticion.id)
      await fetchData()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleComentario(peticion: Peticion) {
    if (isImpersonating) return
    const mensaje = (comentarios[peticion.id] || '').trim()
    if (!mensaje) {
      alert('Escribe un comentario antes de enviarlo')
      return
    }

    setSendingCommentId(peticion.id)
    try {
      const res = await fetch('/api/peticiones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'comentario', id: peticion.id, mensaje }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'No se ha podido enviar el comentario')
      setPeticiones(current => current.map(item => item.id === peticion.id ? data.peticion : item))
      setComentarios(current => ({ ...current, [peticion.id]: '' }))
      setExpandedId(peticion.id)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSendingCommentId(null)
    }
  }

  function handleCaptura(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('La imagen no puede superar 5 MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setForm(current => ({ ...current, captura: reader.result as string }))
    reader.readAsDataURL(file)
  }

  const estadoBadge = (estado: string) => {
    const item = ESTADOS[estado] || { color: 'bg-gray-100 text-gray-800', label: estado }
    return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.color}`}>{item.label}</span>
  }

  const tipoBadge = (tipo: string) => {
    const map: Record<string, { color: string; label: string }> = {
      error: { color: 'bg-red-100 text-red-800', label: 'Error' },
      mejora: { color: 'bg-blue-100 text-blue-800', label: 'Mejora' },
      sugerencia: { color: 'bg-green-100 text-green-800', label: 'Sugerencia' },
    }
    const item = map[tipo] || { color: 'bg-gray-100 text-gray-800', label: tipo }
    return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.color}`}>{item.label}</span>
  }

  const viewedName = peticiones[0]?.usuarioNombre || viewedEmail

  const seccionLabel = (seccion: string) => ({
    panel_admin: 'Panel Admin',
    web_publica: 'Web pública',
    portal_empleado: 'Portal Empleado',
  }[seccion] || seccion)

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isImpersonating ? `Peticiones de ${viewedName}` : 'Mis Peticiones'}</h1>
          <p className="mt-1 text-sm text-gray-500">{isImpersonating ? 'Vista de comprobación del solicitante y sus entregas pendientes.' : 'Solicita mejoras y valida personalmente el resultado antes de que se cierre.'}</p>
        </div>
        {!isImpersonating && (
          <button
            onClick={() => setShowForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 sm:w-auto"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nueva petición
          </button>
        )}
      </div>

      {isImpersonating ? (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Estás comprobando las peticiones de {viewedName}.</p>
          <p className="mt-1 text-amber-800">Puedes revisar las entregas y conversaciones en modo lectura. La conformidad o los ajustes debe enviarlos el propio solicitante al iniciar sesión.</p>
        </div>
      ) : (
        <div className="mb-5 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
          <p className="font-semibold">Tú confirmas cuándo una petición está realmente resuelta.</p>
          <p className="mt-1 text-violet-800">Puedes comentar cualquier detalle con el equipo durante el proceso. Cuando terminemos el trabajo podrás aceptarlo o explicar qué ajustes faltan; no se cerrará sin tu conformidad.</p>
        </div>
      )}

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 sm:p-6">
            <h2 className="mb-4 text-xl font-bold text-gray-900">{editingId ? 'Editar petición' : 'Nueva petición'}</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Tipo</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[
                    { v: 'error', l: 'Error / Incidencia', c: 'border-red-300 bg-red-50 text-red-800' },
                    { v: 'mejora', l: 'Mejora', c: 'border-blue-300 bg-blue-50 text-blue-800' },
                    { v: 'sugerencia', l: 'Sugerencia', c: 'border-green-300 bg-green-50 text-green-800' },
                  ].map(item => (
                    <button key={item.v} onClick={() => setForm(current => ({ ...current, tipo: item.v }))}
                      className={`rounded-lg border-2 px-3 py-2 text-sm font-medium ${form.tipo === item.v ? item.c : 'border-gray-200 bg-white text-gray-600'}`}>
                      {item.l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Sección afectada</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[
                    { v: 'panel_admin', l: 'Panel Admin' },
                    { v: 'web_publica', l: 'Web pública' },
                    { v: 'portal_empleado', l: 'Portal Empleado' },
                  ].map(item => (
                    <button key={item.v} onClick={() => setForm(current => ({ ...current, seccion: item.v }))}
                      className={`rounded-lg border-2 px-3 py-2 text-sm font-medium ${form.seccion === item.v ? 'border-orange-400 bg-orange-50 text-orange-800' : 'border-gray-200 bg-white text-gray-600'}`}>
                      {item.l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Título</label>
                <input type="text" value={form.titulo} onChange={e => setForm(current => ({ ...current, titulo: e.target.value }))}
                  placeholder="Describe brevemente el problema o mejora" className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900" />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Descripción</label>
                <textarea value={form.descripcion} onChange={e => setForm(current => ({ ...current, descripcion: e.target.value }))}
                  placeholder="Explica con detalle lo que ocurre o lo que necesitas..." rows={5} className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900" />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Captura de pantalla (opcional)</label>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleCaptura} className="max-w-full text-sm text-gray-600" />
                {form.captura && (
                  <div className="relative mt-2">
                    <img src={form.captura} alt="Captura" className="max-h-40 rounded-lg border" />
                    <button onClick={() => setForm(current => ({ ...current, captura: '' }))} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-xs text-white">X</button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
              <button onClick={() => { setShowForm(false); setEditingId(null); setForm({ tipo: 'mejora', seccion: 'panel_admin', titulo: '', descripcion: '', captura: '' }) }} className="flex-1 rounded-lg border px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSubmit} disabled={saving} className="flex-1 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Enviar petición'}
              </button>
            </div>
          </div>
        </div>
      )}

      {feedbackForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6">
            <div className={`mb-4 rounded-xl p-4 ${feedbackForm.satisfecho ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'}`}>
              <p className="text-xs font-semibold uppercase tracking-wide">Petición #{feedbackForm.peticion.id}</p>
              <h2 className="mt-1 text-lg font-bold">{feedbackForm.satisfecho ? 'Confirmar que cumple tus requisitos' : 'Indicar los ajustes necesarios'}</h2>
              <p className="mt-1 text-sm">{feedbackForm.peticion.titulo}</p>
            </div>

            <label className="mb-1 block text-sm font-medium text-gray-700">
              {feedbackForm.satisfecho ? 'Comentario (opcional)' : '¿Qué falta o qué debería cambiarse?'}
            </label>
            <textarea
              value={feedbackForm.comentario}
              onChange={e => setFeedbackForm(current => current ? { ...current, comentario: e.target.value } : null)}
              rows={5}
              placeholder={feedbackForm.satisfecho ? 'Si quieres, deja una observación final...' : 'Describe los ajustes con el detalle necesario para que podamos corregirlo...'}
              className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900"
            />
            {!feedbackForm.satisfecho && <p className="mt-1 text-xs text-amber-700">El comentario es obligatorio para que podamos retomar la petición.</p>}

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row">
              <button onClick={() => setFeedbackForm(null)} disabled={saving} className="flex-1 rounded-lg border px-4 py-2.5 text-sm text-gray-700">Cancelar</button>
              <button onClick={handleFeedback} disabled={saving} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${feedbackForm.satisfecho ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
                {saving ? 'Guardando...' : feedbackForm.satisfecho ? 'Confirmar y cerrar' : 'Enviar ajustes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-gray-500">Cargando...</div>
      ) : peticiones.length === 0 ? (
        <div className="rounded-xl border bg-white py-16 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          <p className="mt-3 text-gray-500">{isImpersonating ? 'Este usuario no tiene peticiones' : 'No tienes peticiones todavía'}</p>
          <p className="mt-1 text-sm text-gray-400">{isImpersonating ? 'No hay solicitudes asociadas al correo seleccionado.' : 'Pulsa “Nueva petición” para reportar un error o solicitar una mejora.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {peticiones.map(peticion => {
            const hasConversation = peticion.mensajes?.length > 0
            const expanded = expandedId === peticion.id || peticion.estado === 'pendiente_validacion' || peticion.estado === 'ajustes_solicitados'
            return (
              <article key={peticion.id} className={`rounded-xl border bg-white p-4 sm:p-5 ${peticion.estado === 'pendiente_validacion' ? 'border-violet-300 ring-2 ring-violet-100' : ''}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {tipoBadge(peticion.tipo)}
                      {estadoBadge(peticion.estado)}
                      <span className="text-xs text-gray-400">#{peticion.id} · {seccionLabel(peticion.seccion)}</span>
                    </div>
                    <h3 className="font-semibold text-gray-900">{peticion.titulo}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{peticion.descripcion}</p>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-3 sm:block sm:text-right">
                    <p className="text-xs text-gray-400">{new Date(peticion.createdAt).toLocaleDateString('es-ES')}</p>
                    {!isImpersonating && peticion.estado === 'pendiente' && (
                      <div className="mt-0 flex gap-2 sm:mt-3 sm:justify-end">
                        <button onClick={() => { setEditingId(peticion.id); setForm({ tipo: peticion.tipo, seccion: peticion.seccion, titulo: peticion.titulo, descripcion: peticion.descripcion, captura: peticion.captura || '' }); setShowForm(true) }}
                          className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100">Editar</button>
                        <button onClick={async () => { if (!confirm('¿Eliminar esta petición?')) return; setDeleting(peticion.id); await fetch(`/api/peticiones?id=${peticion.id}`, { method: 'DELETE' }); await fetchData(); setDeleting(null) }}
                          disabled={deleting === peticion.id} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">Eliminar</button>
                      </div>
                    )}
                  </div>
                </div>

                {peticion.captura && (
                  <img src={peticion.captura} alt="Captura" className="mt-3 max-h-40 cursor-pointer rounded-lg border" onClick={() => window.open(peticion.captura!, '_blank')} />
                )}

                {peticion.notasAdmin && !hasConversation && (
                  <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
                    <p className="font-semibold">Respuesta del equipo</p>
                    <p className="mt-1 whitespace-pre-wrap">{peticion.notasAdmin}</p>
                  </div>
                )}

                {peticion.estado === 'pendiente_validacion' && (
                  <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4">
                    <p className="font-semibold text-violet-900">{isImpersonating ? `Pendiente de validación por ${peticion.usuarioNombre}` : 'Necesitamos tu validación'}</p>
                    <p className="mt-1 text-sm text-violet-800">
                      {isImpersonating
                        ? 'Puedes comprobar la entrega en modo lectura. El solicitante verá aquí las opciones de conformidad cuando entre con su propia sesión.'
                        : 'Revisa lo realizado y dinos si cumple tus requisitos. Solo se cerrará si lo confirmas.'}
                    </p>
                    {!isImpersonating && (
                      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button onClick={() => setFeedbackForm({ peticion, satisfecho: true, comentario: '' })} className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700">Sí, cumple mis requisitos</button>
                        <button onClick={() => setFeedbackForm({ peticion, satisfecho: false, comentario: '' })} className="rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-50">Necesita ajustes</button>
                      </div>
                    )}
                  </div>
                )}

                {peticion.estado === 'ajustes_solicitados' && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-semibold">Hemos recibido tus ajustes</p>
                    <p className="mt-1">La petición vuelve al equipo para su revisión. Recibirás una nueva solicitud de validación cuando esté lista.</p>
                  </div>
                )}

                {peticion.estado === 'resuelta' && peticion.feedbackSatisfecho === true && (
                  <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                    <p className="font-semibold">Cerrada con tu conformidad</p>
                    <p className="mt-1">Confirmaste que la entrega cumple tus requisitos{peticion.fechaCierre ? ` el ${new Date(peticion.fechaCierre).toLocaleDateString('es-ES')}` : ''}.</p>
                  </div>
                )}

                <div className="mt-4 border-t pt-4">
                  <button onClick={() => setExpandedId(expanded ? null : peticion.id)} className="text-sm font-semibold text-blue-700 hover:text-blue-900">
                    {expanded ? 'Ocultar conversación' : `Abrir conversación (${peticion.mensajes?.length || 0})`}
                  </button>
                  {expanded && (
                    <div className="mt-3">
                      <div className="space-y-3">
                        {hasConversation ? peticion.mensajes.map(mensaje => (
                          <div key={mensaje.id} className={`rounded-lg border p-3 ${mensaje.autorTipo === 'solicitante' ? 'ml-0 border-orange-200 bg-orange-50 sm:ml-12' : 'mr-0 border-blue-200 bg-blue-50 sm:mr-12'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-gray-800">{mensaje.autorNombre} · {mensaje.autorTipo === 'solicitante' ? (isImpersonating ? 'Solicitante' : 'Tú') : 'Equipo'}</p>
                              <p className="text-xs text-gray-500">{new Date(mensaje.createdAt).toLocaleString('es-ES')}</p>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{mensaje.mensaje}</p>
                          </div>
                        )) : <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">Aún no hay comentarios. Puedes abrir la conversación con el equipo.</p>}
                      </div>

                      {!isImpersonating && !['resuelta', 'descartada'].includes(peticion.estado) && (
                        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <label className="text-xs font-semibold text-gray-700">Comentar con el equipo</label>
                          <textarea
                            value={comentarios[peticion.id] || ''}
                            onChange={e => setComentarios(current => ({ ...current, [peticion.id]: e.target.value }))}
                            maxLength={2000}
                            rows={3}
                            placeholder="Escribe una duda, una aclaración o los detalles que necesites comentar..."
                            className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900"
                          />
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-gray-500">El comentario no cambia el estado de la petición.</p>
                            <button onClick={() => handleComentario(peticion)} disabled={sendingCommentId === peticion.id} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                              {sendingCommentId === peticion.id ? 'Enviando...' : 'Enviar comentario'}
                            </button>
                          </div>
                        </div>
                      )}

                      {isImpersonating && (
                        <p className="mt-3 text-xs text-amber-700">Modo lectura: el comentario debe enviarlo el solicitante desde su propia sesión.</p>
                      )}
                      {['resuelta', 'descartada'].includes(peticion.estado) && (
                        <p className="mt-3 text-xs text-gray-500">La conversación quedó cerrada con la petición.</p>
                      )}
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
