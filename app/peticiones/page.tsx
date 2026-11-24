'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import { filtrarPeticiones } from '@/lib/peticiones-filtros'
import {
  ESTADOS_UI, TIPOS_UI, SECCIONES_UI, NIVELES_UI, BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAMPO_UI,
  CAPTURA_MAX_BYTES, CAPTURA_MIMES, capturaSegura, paginaSegura, formularioVacio, validarFormulario,
  leerRespuesta, mensajeError, etiquetaEstado, etiquetaNivel, etiquetaSeccion, fechaUI,
  estaCerrada, tieneAjustes, puedeRetirar, useDialogoUI, type PeticionUI, type FormularioUI, type UrgenciaUI,
} from '@/lib/area8/ui'

interface FeedbackForm { peticion: PeticionUI; satisfecho: boolean; comentario: string }
interface RespuestaPropia { peticiones: PeticionUI[]; total: number; page: number; hasMore: boolean; isImpersonating?: boolean; usuarioEmail?: string }
interface RespuestaAccion { success: boolean; peticion?: PeticionUI }

export default function PeticionesPage() {
  const [peticiones, setPeticiones] = useState<PeticionUI[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormularioUI>(formularioVacio)
  const [saving, setSaving] = useState(false)
  const [readingCapture, setReadingCapture] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [feedbackForm, setFeedbackForm] = useState<FeedbackForm | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [comentarios, setComentarios] = useState<Record<number, string>>({})
  const [sendingCommentId, setSendingCommentId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [isImpersonating, setIsImpersonating] = useState(false)
  const [viewedEmail, setViewedEmail] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [paginaActual, setPaginaActual] = useState(1)
  const [total, setTotal] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const consultaActual = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const formRef = useDialogoUI(showForm, () => { if (!saving && !readingCapture) setShowForm(false) })
  const feedbackRef = useDialogoUI(Boolean(feedbackForm), () => { if (!saving) setFeedbackForm(null) })

  const fetchData = useCallback(async () => {
    const consulta = ++consultaActual.current
    setLoading(true)
    setError('')
    try {
      const asEmail = new URLSearchParams(window.location.search).get('as')
      const params = new URLSearchParams({ page: String(paginaActual) })
      if (asEmail) params.set('as', asEmail)
      const data = await leerRespuesta<RespuestaPropia>(await fetch(`/api/peticiones?${params.toString()}`, { cache: 'no-store' }), 'No se han podido cargar tus peticiones.')
      if (consulta !== consultaActual.current) return
      setPeticiones(data.peticiones || [])
      setTotal(data.total ?? data.peticiones?.length ?? 0); setHasMore(Boolean(data.hasMore))
      setIsImpersonating(Boolean(data.isImpersonating) || Boolean(asEmail))
      setViewedEmail(data.usuarioEmail || asEmail || '')
    } catch (e: unknown) {
      if (consulta !== consultaActual.current) return
      setError(mensajeError(e, 'No se han podido cargar tus peticiones.'))
    } finally { if (consulta === consultaActual.current) setLoading(false) }
  }, [paginaActual])
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void fetchData() })
    return () => { active = false; consultaActual.current += 1 }
  }, [fetchData])

  function abrirFormulario(peticion?: PeticionUI) {
    if (isImpersonating || loading || (peticion && peticion.estado !== 'nueva')) return
    setError(''); setAviso(''); setEditingId(peticion?.id ?? null)
    setForm(peticion ? {
      tipo: peticion.tipo, seccion: peticion.seccion, titulo: peticion.titulo, descripcion: peticion.descripcion,
      captura: capturaSegura(peticion.captura) || '', paginaUrl: peticion.paginaUrl || '', urgencia: peticion.urgencia || 'media',
    } : formularioVacio())
    setShowForm(true)
  }

  async function handleSubmit() {
    if (isImpersonating || saving || readingCapture) return
    const validacion = validarFormulario(form)
    if (validacion) { setError(validacion); return }
    if (editingId !== null && !peticiones.some(p => p.id === editingId && p.estado === 'nueva')) {
      setError('Solo puedes editar peticiones que siguen en estado Nueva.'); return
    }
    setSaving(true); setError(''); setAviso('')
    try {
      // La urgencia es del solicitante; la prioridad interna nunca se envía desde este formulario.
      const payload = { ...form, titulo: form.titulo.trim(), descripcion: form.descripcion.trim(), paginaUrl: form.paginaUrl.trim() || null }
      await leerRespuesta<RespuestaAccion>(await fetch('/api/peticiones', {
        method: editingId !== null ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId !== null ? { id: editingId, ...payload } : payload),
      }), 'No se ha podido guardar la petición.')
      setShowForm(false); setEditingId(null); setForm(formularioVacio())
      setAviso('Petición guardada. Puedes consultar su seguimiento en esta página.')
      if (editingId === null && paginaActual !== 1) setPaginaActual(1)
      else await fetchData()
    } catch (e: unknown) { setError(mensajeError(e, 'No se ha podido guardar la petición.')) }
    finally { setSaving(false) }
  }

  async function handleEliminar(peticion: PeticionUI) {
    if (isImpersonating || !puedeRetirar(peticion) || deleting !== null || saving) return
    if (!confirm('¿Eliminar esta petición? Esta acción no se puede deshacer.')) return
    setDeleting(peticion.id); setError(''); setAviso('')
    try {
      await leerRespuesta<RespuestaAccion>(await fetch(`/api/peticiones?id=${peticion.id}`, { method: 'DELETE' }), 'No se ha podido eliminar la petición.')
      setAviso('Petición eliminada.'); await fetchData()
    } catch (e: unknown) { setError(mensajeError(e, 'No se ha podido eliminar la petición.')) }
    finally { setDeleting(null) }
  }

  async function handleFeedback() {
    if (isImpersonating || !feedbackForm || saving || feedbackForm.peticion.estado !== 'en_pruebas') return
    if (!feedbackForm.satisfecho && !feedbackForm.comentario.trim()) { setError('Explica qué ajustes necesitas para que podamos revisarlos.'); return }
    if (feedbackForm.comentario.length > 2000) { setError('El comentario no puede superar 2.000 caracteres.'); return }
    setSaving(true); setError(''); setAviso('')
    try {
      const data = await leerRespuesta<RespuestaAccion>(await fetch('/api/peticiones', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: feedbackForm.peticion.id, satisfecho: feedbackForm.satisfecho, comentario: feedbackForm.comentario.trim() }),
      }), 'No se ha podido guardar tu respuesta.')
      setAviso(feedbackForm.satisfecho ? 'Has confirmado tu conformidad. La petición queda hecha.' : 'Tus ajustes han quedado registrados para que el equipo retome el desarrollo.')
      setExpandedId(data.peticion?.id || feedbackForm.peticion.id); setFeedbackForm(null)
      await fetchData()
    } catch (e: unknown) { setError(mensajeError(e, 'No se ha podido guardar tu respuesta.')) }
    finally { setSaving(false) }
  }

  async function handleComentario(peticion: PeticionUI) {
    if (isImpersonating || estaCerrada(peticion.estado) || sendingCommentId !== null) return
    const mensaje = (comentarios[peticion.id] || '').trim()
    if (!mensaje || mensaje.length > 2000) { setError('Escribe un comentario de entre 1 y 2.000 caracteres.'); return }
    setSendingCommentId(peticion.id); setError(''); setAviso('')
    try {
      const data = await leerRespuesta<RespuestaAccion>(await fetch('/api/peticiones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'comentario', id: peticion.id, mensaje }),
      }), 'No se ha podido guardar el comentario.')
      if (data.peticion) setPeticiones(current => current.map(item => item.id === peticion.id ? data.peticion! : item))
      else await fetchData()
      setComentarios(current => ({ ...current, [peticion.id]: '' })); setExpandedId(peticion.id)
      setAviso('Comentario guardado en la conversación. No cambia el estado de la petición.')
    } catch (e: unknown) { setError(mensajeError(e, 'No se ha podido guardar el comentario.')) }
    finally { setSendingCommentId(null) }
  }

  function handleCaptura(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!CAPTURA_MIMES.includes(file.type) || file.size > CAPTURA_MAX_BYTES) {
      setError('La captura debe ser PNG, JPEG o WebP y no superar 5 MiB.'); e.target.value = ''; return
    }
    setReadingCapture(true); setError('')
    const reader = new FileReader()
    reader.onload = () => {
      const captura = capturaSegura(typeof reader.result === 'string' ? reader.result : null)
      if (captura) setForm(current => ({ ...current, captura }))
      else setError('No se ha podido leer la captura como PNG, JPEG o WebP.')
      setReadingCapture(false)
    }
    reader.onerror = () => { setReadingCapture(false); setError('No se ha podido leer la captura. Vuelve a seleccionarla.') }
    reader.readAsDataURL(file)
  }

  const estadoBadge = (estado: string) => {
    const item = ESTADOS_UI.find(value => value.v === estado)
    return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item?.c || 'bg-gray-100 text-gray-700'}`}>{item?.l || 'Estado no disponible'}</span>
  }
  const tipoBadge = (tipo: string) => {
    const item = TIPOS_UI.find(value => value.v === tipo)
    return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item?.c || 'bg-gray-100 text-gray-700'}`}>{item?.l || tipo}</span>
  }
  const viewedName = peticiones[0]?.usuarioNombre || viewedEmail
  const peticionesFiltradas = filtrarPeticiones(peticiones, filtroEstado, filtroTipo)

  return (
    <div className="min-h-screen min-w-0 max-w-full bg-gray-50 text-[#2D2A26] [overflow-wrap:anywhere]" style={{ colorScheme: 'light' }}>
      <div className="mx-auto w-full min-w-0 max-w-5xl p-4 sm:p-6">
        <Link href="/empleado" className={`${BOTON_SECUNDARIO} mb-5 gap-2`}><span aria-hidden="true">←</span> Volver al portal empleado</Link>
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><h1 className="text-2xl font-bold">{isImpersonating ? `Peticiones de ${viewedName}` : 'Mis peticiones'}</h1><p className="mt-1 text-sm text-gray-600">Solicita mejoras, reporta fallos y valida personalmente el resultado.</p></div>
          {!isImpersonating && <button onClick={() => abrirFormulario()} disabled={loading || Boolean(error) || saving || deleting !== null} className={`${BOTON_PRINCIPAL} w-full shrink-0 sm:w-auto`}>Nueva petición</button>}
        </header>

        <div className="mb-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm">
          <p className="font-semibold">{isImpersonating ? `Estás revisando las peticiones de ${viewedName} en modo lectura.` : 'Tú confirmas cuándo una petición está hecha.'}</p>
          <p className="mt-1">{isImpersonating ? 'La conformidad, los ajustes y los comentarios debe enviarlos el propio solicitante desde su sesión.' : 'Cuando el equipo entregue el trabajo, podrás aceptarlo o pedir ajustes. Los cambios de estado se muestran aquí, dentro de la aplicación; no se envían correos.'}</p>
        </div>
        {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}<button onClick={() => { setAviso(''); void fetchData() }} disabled={loading || saving} className="ml-2 min-h-11 underline">Volver a consultar</button></div>}
        {aviso && <p role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">{aviso}</p>}

        <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1"><label htmlFor="peticiones-estado" className="mb-1 block text-sm font-semibold">Estado</label><select id="peticiones-estado" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={CAMPO_UI}><option value="">Todos los estados</option>{ESTADOS_UI.map(item => <option key={item.v} value={item.v}>{item.l}</option>)}</select></div>
            <div className="min-w-0 flex-1"><label htmlFor="peticiones-tipo" className="mb-1 block text-sm font-semibold">Tipo</label><select id="peticiones-tipo" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className={CAMPO_UI}><option value="">Todos los tipos</option>{TIPOS_UI.map(item => <option key={item.v} value={item.v}>{item.l}</option>)}</select></div>
            <button onClick={() => { setFiltroEstado(''); setFiltroTipo('') }} disabled={!filtroEstado && !filtroTipo} className={BOTON_SECUNDARIO}>Limpiar filtros</button>
          </div>
          <p className="mt-3 text-xs text-gray-600" aria-live="polite">{loading ? 'Cargando peticiones…' : error ? 'No se ha podido actualizar la consulta.' : `${peticionesFiltradas.length} de ${peticiones.length} peticiones de esta página. ${total ?? '—'} en total.`}</p>
          <p className="mt-1 text-xs text-gray-600">Los filtros se aplican a la página actual, de hasta 200 peticiones. Usa la paginación para consultar el resto.</p>
          {total !== null && (paginaActual > 1 || hasMore) && <nav aria-label="Páginas de mis peticiones" className="mt-3 flex flex-wrap items-center justify-between gap-2"><button onClick={() => setPaginaActual(current => Math.max(1, current - 1))} disabled={loading || saving || deleting !== null || paginaActual <= 1} className={BOTON_SECUNDARIO}>Anterior</button><span className="text-sm">Página {paginaActual}</span><button onClick={() => setPaginaActual(current => current + 1)} disabled={loading || saving || deleting !== null || !hasMore} className={BOTON_SECUNDARIO}>Siguiente</button></nav>}
        </div>

        {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div ref={formRef} role="dialog" aria-modal="true" aria-labelledby="peticion-form-title" tabIndex={-1} className="max-h-[90dvh] w-full min-w-0 max-w-lg overflow-y-auto rounded-2xl bg-white p-5 sm:p-6">
            <h2 id="peticion-form-title" className="mb-4 text-xl font-bold">{editingId !== null ? 'Editar petición' : 'Nueva petición'}</h2>
            <div className="space-y-4">
              <div><label htmlFor="peticion-form-tipo" className="mb-1 block text-sm font-medium">Tipo</label><select id="peticion-form-tipo" value={form.tipo} onChange={e => setForm(current => ({ ...current, tipo: e.target.value }))} className={CAMPO_UI}>{TIPOS_UI.map(item => <option key={item.v} value={item.v}>{item.l}</option>)}</select></div>
              <div><label htmlFor="peticion-form-seccion" className="mb-1 block text-sm font-medium">Sección afectada</label><select id="peticion-form-seccion" value={form.seccion} onChange={e => setForm(current => ({ ...current, seccion: e.target.value }))} className={CAMPO_UI}>{SECCIONES_UI.map(item => <option key={item.v} value={item.v}>{item.l}</option>)}</select></div>
              <div><label htmlFor="peticion-form-pagina" className="mb-1 block text-sm font-medium">Página donde ocurre (opcional)</label><input id="peticion-form-pagina" type="text" value={form.paginaUrl} onChange={e => setForm(current => ({ ...current, paginaUrl: e.target.value }))} placeholder="/empleado o https://ejemplo.es/pagina" aria-describedby="peticion-pagina-ayuda" className={CAMPO_UI} /><p id="peticion-pagina-ayuda" className="mt-1 text-xs text-gray-600">URL http(s) o ruta relativa. No incluyas credenciales ni datos personales.</p></div>
              <div><label htmlFor="peticion-form-urgencia" className="mb-1 block text-sm font-medium">Urgencia</label><select id="peticion-form-urgencia" value={form.urgencia} onChange={e => setForm(current => ({ ...current, urgencia: e.target.value as UrgenciaUI }))} className={CAMPO_UI}>{NIVELES_UI.map(item => <option key={item.v} value={item.v}>{item.l}</option>)}</select><p className="mt-1 text-xs text-gray-600">Indica el impacto que tiene para ti. La prioridad interna la decide Víctor.</p></div>
              <div><label htmlFor="peticion-form-titulo" className="mb-1 block text-sm font-medium">Título (obligatorio)</label><input id="peticion-form-titulo" required maxLength={200} value={form.titulo} onChange={e => setForm(current => ({ ...current, titulo: e.target.value }))} placeholder="Resume el fallo o la mejora" className={CAMPO_UI} /><p className="mt-1 text-xs text-gray-600">{form.titulo.length}/200 caracteres.</p></div>
              <div><label htmlFor="peticion-form-descripcion" className="mb-1 block text-sm font-medium">Descripción (obligatoria)</label><textarea id="peticion-form-descripcion" required maxLength={10000} value={form.descripcion} onChange={e => setForm(current => ({ ...current, descripcion: e.target.value }))} placeholder="Explica qué ocurre, qué esperabas y cómo reproducirlo." rows={5} className={CAMPO_UI} /><p className="mt-1 text-xs text-gray-600">{form.descripcion.length}/10.000 caracteres.</p></div>
              <div><label htmlFor="peticion-form-captura" className="mb-1 block text-sm font-medium">Captura de pantalla (opcional)</label><input id="peticion-form-captura" ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" disabled={saving || readingCapture} onChange={handleCaptura} className="min-h-11 w-full min-w-0 max-w-full text-sm text-gray-600" aria-describedby="peticion-captura-ayuda" /><p id="peticion-captura-ayuda" className="text-xs text-gray-600">PNG, JPEG o WebP; máximo 5 MiB. Evita datos personales.</p>{readingCapture && <p role="status" className="mt-2 text-sm">Leyendo captura…</p>}{capturaSegura(form.captura) && <div className="mt-2"><img src={capturaSegura(form.captura)!} alt="Vista previa de la captura adjunta" className="max-h-40 max-w-full rounded-lg border object-contain" /><button onClick={() => { setForm(current => ({ ...current, captura: '' })); if (fileRef.current) fileRef.current.value = '' }} disabled={saving} className="mt-2 min-h-11 text-sm text-red-800 underline">Quitar captura</button></div>}</div>
            </div>
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row"><button onClick={() => setShowForm(false)} disabled={saving || readingCapture} className={`${BOTON_SECUNDARIO} flex-1`}>Cancelar</button><button onClick={handleSubmit} disabled={saving || readingCapture} className={`${BOTON_PRINCIPAL} flex-1`}>{saving ? 'Guardando…' : editingId !== null ? 'Guardar cambios' : 'Enviar petición'}</button></div>
          </div>
        </div>}

        {feedbackForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div ref={feedbackRef} role="dialog" aria-modal="true" aria-labelledby="feedback-title" tabIndex={-1} className="max-h-[90dvh] w-full min-w-0 max-w-lg overflow-y-auto rounded-2xl bg-white p-5 sm:p-6">
            <div className="mb-4 rounded-xl bg-orange-50 p-4"><p className="text-xs font-semibold">Petición #{feedbackForm.peticion.id}</p><h2 id="feedback-title" className="mt-1 text-lg font-bold">{feedbackForm.satisfecho ? 'Confirmar que cumple tus requisitos' : 'Indicar los ajustes necesarios'}</h2><p className="mt-1 text-sm">{feedbackForm.peticion.titulo}</p></div>
            <label htmlFor="feedback-comentario" className="mb-1 block text-sm font-medium">{feedbackForm.satisfecho ? 'Comentario (opcional)' : '¿Qué falta o qué debería cambiarse? (obligatorio)'}</label><textarea id="feedback-comentario" value={feedbackForm.comentario} onChange={e => setFeedbackForm(current => current ? { ...current, comentario: e.target.value } : null)} maxLength={2000} required={!feedbackForm.satisfecho} rows={5} className={CAMPO_UI} /><p className="mt-1 text-xs text-gray-600">{feedbackForm.comentario.length}/2.000 caracteres. {feedbackForm.satisfecho ? 'Al confirmar, la petición quedará hecha.' : 'Los ajustes devuelven la petición al equipo de desarrollo.'}</p>
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row"><button onClick={() => setFeedbackForm(null)} disabled={saving} className={`${BOTON_SECUNDARIO} flex-1`}>Cancelar</button><button onClick={handleFeedback} disabled={saving} className={`${BOTON_PRINCIPAL} flex-1`}>{saving ? 'Guardando…' : feedbackForm.satisfecho ? 'Confirmar y cerrar' : 'Enviar ajustes'}</button></div>
          </div>
        </div>}

        {loading ? <div role="status" className="py-12 text-center text-gray-600">Cargando peticiones…</div>
          : error && peticiones.length === 0 ? null
          : peticiones.length === 0 ? <div className="rounded-xl border bg-white px-4 py-12 text-center"><p className="font-semibold">{isImpersonating ? 'Este usuario no tiene peticiones.' : 'No tienes peticiones todavía.'}</p><p className="mt-2 text-sm text-gray-600">{isImpersonating ? 'No hay solicitudes asociadas al usuario seleccionado.' : 'Pulsa “Nueva petición” para reportar un fallo o solicitar una mejora.'}</p></div>
          : peticionesFiltradas.length === 0 ? <div className="rounded-xl border bg-white px-4 py-12 text-center"><p>No hay peticiones con estos filtros.</p><button onClick={() => { setFiltroEstado(''); setFiltroTipo('') }} className={`${BOTON_SECUNDARIO} mt-3`}>Mostrar todas</button></div>
          : <div className="space-y-4">{peticionesFiltradas.map(peticion => {
            const expanded = expandedId === peticion.id
            const captura = capturaSegura(peticion.captura)
            const pagina = paginaSegura(peticion.paginaUrl)
            return <article key={peticion.id} className={`min-w-0 rounded-xl border bg-white p-4 sm:p-5 ${peticion.estado === 'en_pruebas' ? 'border-orange-300 ring-2 ring-orange-100' : ''}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2">{tipoBadge(peticion.tipo)}{estadoBadge(peticion.estado)}<span className="text-xs text-gray-600">#{peticion.id} · {etiquetaSeccion(peticion.seccion)}</span></div><h2 className="font-semibold">{peticion.titulo}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{peticion.descripcion}</p></div>
                <div className="shrink-0"><p className="text-xs text-gray-600">{fechaUI(peticion.createdAt)}</p>{!isImpersonating && peticion.estado === 'nueva' && <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => abrirFormulario(peticion)} disabled={saving || deleting !== null} className={BOTON_SECUNDARIO}>Editar</button>{puedeRetirar(peticion) && <button onClick={() => void handleEliminar(peticion)} disabled={deleting !== null || saving} className={`${BOTON_SECUNDARIO} text-red-800`}>{deleting === peticion.id ? 'Eliminando…' : 'Eliminar'}</button>}</div>}</div>
              </div>
              <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 rounded-lg bg-gray-50 p-3 text-sm sm:grid-cols-2"><div><dt className="font-semibold">Urgencia indicada</dt><dd>{etiquetaNivel(peticion.urgencia)}</dd></div><div><dt className="font-semibold">Responsable</dt><dd>{peticion.responsable?.nombre || 'Sin asignar'}</dd></div><div className="min-w-0 sm:col-span-2"><dt className="font-semibold">Página afectada</dt><dd>{pagina ? <a href={pagina} target="_blank" rel="noopener noreferrer" className="text-orange-800 underline">{peticion.paginaUrl}</a> : peticion.paginaUrl ? 'Enlace no disponible por seguridad.' : 'No indicada'}</dd></div></dl>
              {captura && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Ver captura adjunta</summary><img src={captura} alt={`Captura de la petición ${peticion.id}`} className="mt-2 max-h-80 max-w-full rounded-lg border object-contain" /></details>}
              {peticion.captura && !captura && <p className="mt-3 text-sm text-gray-600">La captura no se muestra: solo se admiten PNG, JPEG y WebP de hasta 5 MiB.</p>}

              <section className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3" aria-labelledby={`avisos-${peticion.id}`}>
                <h3 id={`avisos-${peticion.id}`} className="text-sm font-semibold">Avisos de estado dentro de la aplicación</h3>
                {peticion.eventos?.length ? <ol className="mt-3 space-y-3">{peticion.eventos.map(evento => <li key={evento.id} className="rounded-lg border border-orange-100 bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">{evento.estadoAnterior ? `${etiquetaEstado(evento.estadoAnterior)} → ` : ''}{etiquetaEstado(evento.estadoNuevo)}</p><span className="text-xs text-gray-600">{fechaUI(evento.createdAt, true)}</span></div><p className="mt-1 whitespace-pre-wrap text-sm">{evento.mensaje}</p>{!evento.leidoAt && <span className="mt-2 inline-block rounded-full bg-orange-50 px-2 py-1 text-xs text-orange-900">Sin marcar como leído</span>}</li>)}</ol> : <p className="mt-2 text-sm text-gray-600">Todavía no hay avisos de cambio de estado registrados.</p>}
              </section>

              {peticion.notasAdmin && <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm"><p className="font-semibold">Respuesta del equipo</p><p className="mt-1 whitespace-pre-wrap">{peticion.notasAdmin}</p></div>}
              {peticion.estado === 'en_pruebas' && <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4"><h3 className="font-semibold">{isImpersonating ? `Pendiente de validación por ${peticion.usuarioNombre}` : 'Necesitamos tu validación'}</h3><p className="mt-1 text-sm">{isImpersonating ? 'El solicitante verá aquí las opciones de conformidad al entrar con su propia sesión.' : 'Revisa la entrega y dinos si cumple tus requisitos. Solo se cerrará si lo confirmas.'}</p>{!isImpersonating && <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2"><button onClick={() => { setError(''); setFeedbackForm({ peticion, satisfecho: true, comentario: '' }) }} disabled={saving} className={BOTON_PRINCIPAL}>Sí, cumple mis requisitos</button><button onClick={() => { setError(''); setFeedbackForm({ peticion, satisfecho: false, comentario: '' }) }} disabled={saving} className={BOTON_SECUNDARIO}>Necesita ajustes</button></div>}</div>}
              {tieneAjustes(peticion) && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-semibold">Tus ajustes constan en la conversación</p><p className="mt-1">El equipo revisa la petición en desarrollo. La siguiente entrega para pruebas aparecerá en esta página.</p></div>}
              {peticion.estado === 'hecha' && <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm"><p className="font-semibold">{peticion.feedbackSatisfecho === true ? 'Hecha con tu conformidad' : 'Cierre histórico'}</p><p className="mt-1">{peticion.feedbackSatisfecho === true ? `Confirmaste que cumple tus requisitos${peticion.fechaCierre ? ` el ${fechaUI(peticion.fechaCierre)}` : ''}.` : 'El cierre registrado es anterior al flujo de conformidad actual.'}</p></div>}

              <div className="mt-4 border-t pt-4"><button onClick={() => setExpandedId(expanded ? null : peticion.id)} aria-expanded={expanded} aria-controls={`conversacion-${peticion.id}`} className="min-h-11 text-sm font-semibold text-orange-800 underline">{expanded ? 'Ocultar conversación' : `Abrir conversación (${peticion.mensajes?.length || 0})`}</button>
                {expanded && <div id={`conversacion-${peticion.id}`} className="mt-3"><div className="space-y-3">{peticion.mensajes?.length ? peticion.mensajes.map(mensaje => <div key={mensaje.id} className={`rounded-lg border p-3 ${mensaje.autorTipo === 'solicitante' ? 'border-orange-200 bg-orange-50 sm:ml-12' : 'border-gray-200 bg-gray-50 sm:mr-12'}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">{mensaje.autorNombre} · {mensaje.autorTipo === 'solicitante' ? isImpersonating ? 'Solicitante' : 'Tú' : 'Equipo'}{mensaje.tipo === 'ajustes' ? ' · Ajustes' : ''}</p><span className="text-xs text-gray-600">{fechaUI(mensaje.createdAt, true)}</span></div><p className="mt-1 whitespace-pre-wrap text-sm">{mensaje.mensaje}</p></div>) : <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">Aún no hay comentarios.</p>}</div>
                  {!isImpersonating && !estaCerrada(peticion.estado) && <div className="mt-4 rounded-xl border bg-gray-50 p-3"><label htmlFor={`comentario-${peticion.id}`} className="text-sm font-semibold">Comentar con el equipo</label><textarea id={`comentario-${peticion.id}`} value={comentarios[peticion.id] || ''} onChange={e => setComentarios(current => ({ ...current, [peticion.id]: e.target.value }))} maxLength={2000} rows={3} className={`${CAMPO_UI} mt-2`} /><div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-gray-600">{(comentarios[peticion.id] || '').length}/2.000 caracteres. No cambia el estado.</p><button onClick={() => void handleComentario(peticion)} disabled={sendingCommentId !== null || saving} className={BOTON_PRINCIPAL}>{sendingCommentId === peticion.id ? 'Guardando…' : 'Enviar comentario'}</button></div></div>}
                  {isImpersonating && <p className="mt-3 text-xs text-gray-600">Modo lectura: responde el solicitante desde su sesión.</p>}{estaCerrada(peticion.estado) && <p className="mt-3 text-xs text-gray-600">La conversación quedó cerrada con la petición.</p>}
                </div>}
              </div>
            </article>
          })}</div>}
      </div>
    </div>
  )
}
