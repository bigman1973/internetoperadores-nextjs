'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { transicionAdminPermitida } from '@/lib/peticiones-flujo'
import {
  ESTADOS_UI, ESTADOS_GESTION_UI, TIPOS_UI, NIVELES_UI, BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAMPO_UI,
  capturaSegura, paginaSegura, leerRespuesta, mensajeError, etiquetaEstado, etiquetaNivel,
  etiquetaSeccion, fechaUI, estaCerrada, puedeEntregar, tieneAjustes, useDialogoUI,
  type PeticionUI, type ResponsableUI,
} from '@/lib/area8/ui'

interface Capacidades { gestionar: boolean; priorizar: boolean }
interface Kpis {
  total?: number; pendientes?: number; aprobadas?: number; enDesarrollo?: number
  porValidar?: number; conAjustes?: number; resueltas?: number; errores?: number; mejoras?: number
  nuevas?: number; enAnalisis?: number; enPruebas?: number; hechas?: number
}
interface RespuestaAdmin {
  peticiones: PeticionUI[]; kpis: Kpis; responsables: ResponsableUI[]; capacidades: Capacidades
  total: number; page: number; hasMore: boolean
}
interface RespuestaAccion { success: boolean; peticion?: PeticionUI }

export default function AdminPeticionesPage() {
  const [peticiones, setPeticiones] = useState<PeticionUI[]>([])
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [responsables, setResponsables] = useState<ResponsableUI[]>([])
  const [capacidades, setCapacidades] = useState<Capacidades>({ gestionar: false, priorizar: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [detalle, setDetalle] = useState<PeticionUI | null>(null)
  const [notasEdit, setNotasEdit] = useState('')
  const [mensajeEntrega, setMensajeEntrega] = useState('')
  const [comentario, setComentario] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [paginaActual, setPaginaActual] = useState(1)
  const [totalFiltrado, setTotalFiltrado] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const consultaActual = useRef(0)
  const dialogoRef = useDialogoUI(Boolean(detalle), () => { if (!saving) setDetalle(null) })

  const fetchData = useCallback(async () => {
    const consulta = ++consultaActual.current
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ page: String(paginaActual) })
      if (filtroEstado) params.set('estado', filtroEstado)
      if (filtroTipo) params.set('tipo', filtroTipo)
      const data = await leerRespuesta<RespuestaAdmin>(await fetch(`/api/admin/peticiones?${params.toString()}`, { cache: 'no-store' }), 'No se han podido cargar las peticiones.')
      if (consulta !== consultaActual.current) return
      setPeticiones(data.peticiones || []); setKpis(data.kpis || {})
      setTotalFiltrado(data.total ?? data.peticiones?.length ?? 0); setHasMore(Boolean(data.hasMore))
      setResponsables(data.responsables || [])
      setCapacidades({ gestionar: data.capacidades?.gestionar === true, priorizar: data.capacidades?.priorizar === true })
      setDetalle(current => current ? data.peticiones?.find(item => item.id === current.id) || current : null)
    } catch (e: unknown) {
      if (consulta !== consultaActual.current) return
      setError(mensajeError(e, 'No se han podido cargar las peticiones.'))
      setCapacidades({ gestionar: false, priorizar: false })
    } finally { if (consulta === consultaActual.current) setLoading(false) }
  }, [filtroEstado, filtroTipo, paginaActual])
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void fetchData() })
    return () => { active = false; consultaActual.current += 1 }
  }, [fetchData])

  async function handleAction(action: string, id: number, extra?: Record<string, unknown>) {
    if (saving || loading) return false
    if (!capacidades.gestionar || (action === 'cambiar_prioridad' && !capacidades.priorizar)) {
      setError('Tu cuenta no tiene permiso para esta acción.'); return false
    }
    const actual = detalle?.id === id ? detalle : peticiones.find(item => item.id === id)
    if (!actual || estaCerrada(actual.estado)) { setError('La petición está cerrada. Su historial se conserva.'); return false }
    if (action === 'cambiar_estado' && !transicionAdminPermitida(actual.estado, extra?.estado)) { setError('Esta transición no está permitida desde el estado actual.'); return false }
    setSaving(true); setError(''); setAviso('')
    try {
      const data = await leerRespuesta<RespuestaAccion>(await fetch('/api/admin/peticiones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id, ...(extra || {}) }),
      }), 'No se ha podido completar la acción.')
      // La respuesta del servidor es la autoridad: no anticipar estados ni el cierre.
      if (data.peticion) {
        setDetalle(current => current?.id === id ? data.peticion! : current)
        setPeticiones(current => current.map(item => item.id === id ? data.peticion! : item))
      }
      setAviso(action === 'enviar_validacion'
        ? 'Entrega registrada en pruebas. El aviso queda dentro de la aplicación para el solicitante; no se ha enviado ningún correo.'
        : action === 'cambiar_estado' ? 'Estado actualizado. El cambio queda registrado como aviso dentro de la aplicación.'
        : action === 'asignar_responsable' ? 'Responsable actualizado.'
        : 'Cambios guardados.')
      await fetchData()
      return true
    } catch (e: unknown) { setError(mensajeError(e, 'No se ha podido completar la acción.')); return false }
    finally { setSaving(false) }
  }

  function abrirDetalle(peticion: PeticionUI) {
    setDetalle(peticion); setNotasEdit(peticion.notasAdmin || '')
    setMensajeEntrega(''); setComentario(''); setError(''); setAviso('')
  }
  async function handleGuardarNotas() {
    if (!detalle) return
    if (notasEdit.length > 10000) { setError('La nota no puede superar 10.000 caracteres.'); return }
    await handleAction('notas_admin', detalle.id, { notas: notasEdit.trim() })
  }
  async function handleEnviarComentario() {
    if (!detalle || estaCerrada(detalle.estado)) return
    if (!comentario.trim() || comentario.length > 2000) { setError('Escribe un comentario de entre 1 y 2.000 caracteres.'); return }
    if (await handleAction('comentario', detalle.id, { mensaje: comentario.trim() })) setComentario('')
  }
  async function handleEnviarValidacion() {
    if (!detalle || !puedeEntregar(detalle.estado)) return
    if (!mensajeEntrega.trim() || mensajeEntrega.length > 2000) { setError('Explica la entrega con un mensaje de entre 1 y 2.000 caracteres.'); return }
    if (await handleAction('enviar_validacion', detalle.id, { mensaje: mensajeEntrega.trim() })) setMensajeEntrega('')
  }
  async function asignarResponsable(valor: string) {
    if (!detalle) return
    const responsableId = valor === '' ? null : Number(valor)
    if (responsableId !== null && (!Number.isSafeInteger(responsableId) || responsableId <= 0)) { setError('Selecciona un responsable válido o Sin asignar.'); return }
    await handleAction('asignar_responsable', detalle.id, { responsableId })
  }
  const estadoBadge = (estado: string) => {
    const item = ESTADOS_UI.find(value => value.v === estado)
    return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item?.c || 'bg-gray-100 text-gray-700'}`}>{item?.l || 'Estado no disponible'}</span>
  }
  const tipoBadge = (tipo: string) => {
    const item = TIPOS_UI.find(value => value.v === tipo)
    return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item?.c || 'bg-gray-100 text-gray-700'}`}>{item?.l || tipo}</span>
  }
  const estadoEditable = (peticion: PeticionUI) => capacidades.gestionar && !estaCerrada(peticion.estado) && peticion.estado !== 'en_pruebas'
  const tarjetasKpi = kpis ? [
    { estado: 'nueva', nombre: 'Nuevas', valor: kpis.nuevas ?? kpis.pendientes },
    { estado: 'en_analisis', nombre: 'En análisis', valor: kpis.enAnalisis },
    { estado: 'aprobada', nombre: 'Aprobadas', valor: kpis.aprobadas },
    { estado: 'en_desarrollo', nombre: 'En desarrollo', valor: kpis.enDesarrollo },
    { estado: 'en_pruebas', nombre: 'En pruebas', valor: kpis.enPruebas ?? kpis.porValidar },
    { estado: 'hecha', nombre: 'Hechas', valor: kpis.hechas ?? kpis.resueltas },
  ] : []
  const capturaDetalle = capturaSegura(detalle?.captura)
  const paginaDetalle = paginaSegura(detalle?.paginaUrl)

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl p-4 text-[#2D2A26] [overflow-wrap:anywhere] sm:p-6" style={{ colorScheme: 'light' }}>
      <header className="mb-6"><h1 className="text-2xl font-bold">Peticiones y mejoras</h1><p className="mt-1 text-sm text-gray-600">Gestiona las solicitudes del equipo y solicita la conformidad antes de cerrarlas.</p></header>
      <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm"><p className="font-semibold">Solo el solicitante confirma que una petición está hecha.</p><p className="mt-1">Entrega el trabajo en pruebas con una explicación. El cambio queda como aviso dentro de la aplicación. No se envían correos ni notificaciones salientes.</p></div>
      {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}<button onClick={() => { setAviso(''); void fetchData() }} disabled={loading || saving} className="ml-2 min-h-11 underline">Volver a consultar</button></div>}
      {aviso && <p role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">{aviso}</p>}
      {!loading && !error && !capacidades.gestionar && <p className="mb-4 rounded-lg border bg-gray-50 p-3 text-sm">Consulta en modo lectura: esta sesión no puede modificar peticiones.</p>}

      {loading ? <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" aria-busy="true" aria-label="Cargando indicadores">{Array.from({ length: 7 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl border bg-gray-50" />)}</div>
        : kpis && !error && <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{tarjetasKpi.map(item => <button key={item.estado} disabled={saving} aria-pressed={filtroEstado === item.estado} onClick={() => { setPaginaActual(1); setFiltroEstado(filtroEstado === item.estado ? '' : item.estado) }} className={`min-h-24 min-w-0 rounded-xl border bg-white p-3 text-left hover:border-[#FF5300] focus-visible:ring-2 focus-visible:ring-[#FF5300] ${filtroEstado === item.estado ? 'border-[#FF5300] ring-1 ring-[#FF5300]' : 'border-gray-200'}`}><span className="block text-xs text-gray-600">{item.nombre}</span><span className="mt-1 block text-2xl font-bold">{item.valor ?? '—'}</span></button>)}<div className="min-w-0 rounded-xl border bg-white p-3"><p className="text-xs text-gray-600">Total</p><p className="text-2xl font-bold">{kpis.total ?? '—'}</p><p className="mt-1 text-xs text-gray-600">{kpis.errores ?? '—'} errores · {kpis.mejoras ?? '—'} mejoras</p>{kpis.conAjustes !== undefined && <p className="mt-1 text-xs text-gray-600">{kpis.conAjustes} con ajustes</p>}</div></div>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end"><div className="min-w-0 sm:w-60"><label htmlFor="admin-filtro-estado" className="mb-1 block text-sm font-semibold">Estado</label><select id="admin-filtro-estado" value={filtroEstado} onChange={e => { setPaginaActual(1); setFiltroEstado(e.target.value) }} disabled={saving} className={CAMPO_UI}><option value="">Todos los estados</option>{ESTADOS_UI.map(item => <option key={item.v} value={item.v}>{item.l}</option>)}</select></div><div className="min-w-0 sm:w-60"><label htmlFor="admin-filtro-tipo" className="mb-1 block text-sm font-semibold">Tipo</label><select id="admin-filtro-tipo" value={filtroTipo} onChange={e => { setPaginaActual(1); setFiltroTipo(e.target.value) }} disabled={saving} className={CAMPO_UI}><option value="">Todos los tipos</option>{TIPOS_UI.map(item => <option key={item.v} value={item.v}>{item.l}</option>)}</select></div><button onClick={() => { setPaginaActual(1); setFiltroEstado(''); setFiltroTipo('') }} disabled={saving || (!filtroEstado && !filtroTipo)} className={BOTON_SECUNDARIO}>Limpiar filtros</button></div>
      <p className="mb-3 text-xs text-gray-600" aria-live="polite">{loading ? 'Cargando peticiones…' : error ? 'La consulta no se ha podido actualizar.' : `${peticiones.length} de ${totalFiltrado ?? '—'} peticiones en esta consulta.`}</p>
      {totalFiltrado !== null && (paginaActual > 1 || hasMore) && <nav aria-label="Páginas de peticiones del equipo" className="mb-4 flex flex-wrap items-center justify-between gap-2"><button onClick={() => setPaginaActual(current => Math.max(1, current - 1))} disabled={loading || saving || paginaActual <= 1} className={BOTON_SECUNDARIO}>Anterior</button><span className="text-sm">Página {paginaActual}</span><button onClick={() => setPaginaActual(current => current + 1)} disabled={loading || saving || !hasMore} className={BOTON_SECUNDARIO}>Siguiente</button></nav>}

      {loading ? <div role="status" className="rounded-xl border bg-white p-8 text-center text-gray-600">Cargando peticiones…</div>
        : error && peticiones.length === 0 ? null
        : peticiones.length === 0 ? <div className="rounded-xl border bg-white px-4 py-12 text-center text-gray-600">No hay peticiones con estos filtros.</div>
        : <>
          <div className="space-y-3 md:hidden">{peticiones.map(peticion => <article key={peticion.id} className="min-w-0 rounded-xl border bg-white p-4"><div className="mb-2 flex flex-wrap gap-2">{tipoBadge(peticion.tipo)}{estadoBadge(peticion.estado)}</div><h2 className="font-semibold">#{peticion.id} · {peticion.titulo}</h2><p className="mt-1 text-sm text-gray-600">{peticion.usuarioNombre} · {etiquetaSeccion(peticion.seccion)}</p><dl className="mt-3 grid grid-cols-1 gap-2 text-sm"><div><dt className="inline font-semibold">Urgencia: </dt><dd className="inline">{etiquetaNivel(peticion.urgencia)}</dd></div><div><dt className="inline font-semibold">Prioridad interna: </dt><dd className="inline">{etiquetaNivel(peticion.prioridad)}</dd></div><div><dt className="inline font-semibold">Responsable: </dt><dd className="inline">{peticion.responsable?.nombre || 'Sin asignar'}</dd></div></dl><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-gray-600">{fechaUI(peticion.createdAt)}</span><button onClick={() => abrirDetalle(peticion)} className={BOTON_SECUNDARIO} aria-label={`Ver petición ${peticion.id}`}>Ver detalle</button></div></article>)}</div>
          <div className="hidden w-full min-w-0 max-w-full overflow-x-auto rounded-xl border bg-white md:block" role="region" aria-label="Tabla de peticiones; desplazamiento horizontal dentro de la tabla" tabIndex={0}>
            <table className="w-full min-w-[1120px] text-sm"><caption className="sr-only">Peticiones del equipo, urgencia, prioridad interna, responsable y estado</caption><thead className="bg-gray-50"><tr>{['ID', 'Tipo', 'Título', 'Solicitante', 'Urgencia', 'Prioridad interna', 'Responsable', 'Estado', 'Fecha', 'Acciones'].map(label => <th key={label} scope="col" className="px-4 py-3 text-left font-semibold text-gray-600">{label}</th>)}</tr></thead><tbody className="divide-y">{peticiones.map(peticion => <tr key={peticion.id} className="hover:bg-gray-50"><td className="px-4 py-3 text-xs text-gray-600">#{peticion.id}</td><td className="px-4 py-3">{tipoBadge(peticion.tipo)}</td><td className="max-w-xs px-4 py-3 font-medium"><button onClick={() => abrirDetalle(peticion)} className="min-h-11 text-left underline">{peticion.titulo}</button></td><td className="max-w-40 px-4 py-3 text-xs">{peticion.usuarioNombre}</td><td className="px-4 py-3">{etiquetaNivel(peticion.urgencia)}</td><td className="px-4 py-3">{etiquetaNivel(peticion.prioridad)}</td><td className="max-w-40 px-4 py-3 text-xs">{peticion.responsable?.nombre || 'Sin asignar'}</td><td className="px-4 py-3">{estadoBadge(peticion.estado)}</td><td className="px-4 py-3 text-xs text-gray-600">{fechaUI(peticion.createdAt)}</td><td className="px-4 py-3"><button onClick={() => abrirDetalle(peticion)} className={BOTON_SECUNDARIO} aria-label={`Ver petición ${peticion.id}`}>Ver</button></td></tr>)}</tbody></table>
          </div>
        </>}

      {detalle && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { if (!saving) setDetalle(null) }}>
        <div ref={dialogoRef} role="dialog" aria-modal="true" aria-labelledby="admin-peticion-title" tabIndex={-1} className="max-h-[92dvh] w-full min-w-0 max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 sm:p-6" onClick={e => e.stopPropagation()}>
          <div className="mb-4 flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2">{tipoBadge(detalle.tipo)}{estadoBadge(detalle.estado)}</div><h2 id="admin-peticion-title" className="text-xl font-bold">#{detalle.id} — {detalle.titulo}</h2><p className="mt-1 text-sm text-gray-600">Por {detalle.usuarioNombre} el {fechaUI(detalle.createdAt)}</p></div><button onClick={() => setDetalle(null)} disabled={saving} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl hover:bg-gray-100" aria-label="Cerrar detalle">×</button></div>
          {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{aviso && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-900">{aviso}</p>}
          <div className="mb-4 rounded-lg bg-gray-50 p-4"><p className="whitespace-pre-wrap text-sm leading-6">{detalle.descripcion}</p></div>
          <dl className="mb-4 grid min-w-0 grid-cols-1 gap-3 rounded-lg border p-3 text-sm sm:grid-cols-2"><div><dt className="font-semibold">Urgencia del solicitante</dt><dd>{etiquetaNivel(detalle.urgencia)}</dd></div><div><dt className="font-semibold">Sección</dt><dd>{etiquetaSeccion(detalle.seccion)}</dd></div><div className="min-w-0 sm:col-span-2"><dt className="font-semibold">Página afectada</dt><dd>{paginaDetalle ? <a href={paginaDetalle} target="_blank" rel="noopener noreferrer" className="text-orange-800 underline">{detalle.paginaUrl}</a> : detalle.paginaUrl ? 'Enlace no disponible por seguridad.' : 'No indicada'}</dd></div></dl>
          {capturaDetalle && <details className="mb-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Ver captura adjunta</summary><img src={capturaDetalle} alt={`Captura de la petición ${detalle.id}`} className="mt-2 max-h-80 max-w-full rounded-lg border object-contain" /></details>}
          {detalle.captura && !capturaDetalle && <p className="mb-4 text-sm text-gray-600">La captura no se muestra: solo se admiten PNG, JPEG y WebP de hasta 5 MiB.</p>}
          {detalle.estado === 'en_pruebas' && <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm"><p className="font-semibold">Esperando la validación de {detalle.usuarioNombre}</p><p className="mt-1">Solo el solicitante puede confirmar que cumple sus requisitos o pedir ajustes. No se puede cerrar manualmente.</p></div>}
          {tieneAjustes(detalle) && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p className="font-semibold">El solicitante ha pedido ajustes</p><p className="mt-1">Revisa los mensajes de ajustes y vuelve a entregar el trabajo en pruebas cuando esté listo.</p></div>}
          {detalle.estado === 'hecha' && <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm"><p className="font-semibold">{detalle.feedbackSatisfecho === true ? 'Hecha con conformidad del solicitante' : 'Cierre histórico'}</p><p className="mt-1">{detalle.feedbackSatisfecho === true ? `${detalle.usuarioNombre} confirmó que cumple sus requisitos${detalle.fechaCierre ? ` el ${fechaUI(detalle.fechaCierre)}` : ''}.` : 'Esta petición se cerró antes del flujo de validación actual.'}</p></div>}

          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label htmlFor="admin-detalle-estado" className="mb-1 block text-sm font-semibold">Estado de gestión</label><select id="admin-detalle-estado" value={ESTADOS_GESTION_UI.some(item => item.v === detalle.estado) ? detalle.estado : 'bloqueado'} onChange={e => void handleAction('cambiar_estado', detalle.id, { estado: e.target.value })} disabled={saving || loading || !estadoEditable(detalle)} className={CAMPO_UI}>{!ESTADOS_GESTION_UI.some(item => item.v === detalle.estado) && <option value="bloqueado" disabled>{etiquetaEstado(detalle.estado)}</option>}{ESTADOS_GESTION_UI.filter(item => item.v === detalle.estado || transicionAdminPermitida(detalle.estado, item.v)).map(item => <option key={item.v} value={item.v}>{item.l}</option>)}</select><p className="mt-1 text-xs text-gray-600">Solo se ofrecen transiciones permitidas; el servidor vuelve a validarlas. Pruebas requiere entrega y Hecha requiere conformidad.</p></div>
            <div><label htmlFor="admin-detalle-prioridad" className="mb-1 block text-sm font-semibold">Prioridad interna</label>{capacidades.priorizar ? <select id="admin-detalle-prioridad" value={detalle.prioridad || ''} onChange={e => void handleAction('cambiar_prioridad', detalle.id, { prioridad: e.target.value })} disabled={saving || loading || !capacidades.gestionar || estaCerrada(detalle.estado)} className={CAMPO_UI}>{!NIVELES_UI.some(item => item.v === detalle.prioridad) && <option value="" disabled>Sin indicar</option>}{NIVELES_UI.map(item => <option key={item.v} value={item.v}>{item.l}</option>)}</select> : <input id="admin-detalle-prioridad" readOnly value={`${etiquetaNivel(detalle.prioridad)} · Solo lectura`} className={CAMPO_UI} />}<p className="mt-1 text-xs text-gray-600">Distinta de la urgencia. Solo Víctor puede cambiarla con permiso de priorización.</p></div>
            <div className="sm:col-span-2"><label htmlFor="admin-detalle-responsable" className="mb-1 block text-sm font-semibold">Responsable</label><select id="admin-detalle-responsable" value={detalle.responsableId ?? ''} onChange={e => void asignarResponsable(e.target.value)} disabled={saving || loading || !capacidades.gestionar || estaCerrada(detalle.estado)} className={CAMPO_UI}><option value="">Sin asignar</option>{detalle.responsableId && !responsables.some(item => item.id === detalle.responsableId) && <option value={detalle.responsableId} disabled>{detalle.responsable?.nombre || 'Responsable actual no disponible'}</option>}{responsables.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></div>
          </div>

          {capacidades.gestionar && !estaCerrada(detalle.estado) && <div className="mb-5"><label htmlFor="admin-nota" className="mb-1 block text-sm font-semibold">Nota visible para el solicitante</label><textarea id="admin-nota" value={notasEdit} onChange={e => setNotasEdit(e.target.value)} maxLength={10000} rows={3} className={CAMPO_UI} /><p className="mt-1 text-xs text-gray-600">{notasEdit.length}/10.000 caracteres.</p><button onClick={() => void handleGuardarNotas()} disabled={saving || loading} className={`${BOTON_SECUNDARIO} mt-2`}>Guardar nota</button></div>}
          {capacidades.gestionar && puedeEntregar(detalle.estado) && <div className="mb-5 rounded-xl border border-orange-200 bg-orange-50 p-4"><h3 className="font-semibold">Entregar en pruebas para validación</h3><p className="mt-1 text-sm">Explica qué has realizado y cómo comprobarlo. La entrega quedará registrada y el solicitante verá el aviso dentro de la aplicación. No se envía ningún correo.</p><label htmlFor="admin-entrega" className="mt-3 block text-sm font-semibold">Explicación de la entrega (obligatoria)</label><textarea id="admin-entrega" value={mensajeEntrega} onChange={e => setMensajeEntrega(e.target.value)} maxLength={2000} required rows={4} placeholder="Explica los cambios y qué debe revisar el solicitante." className={`${CAMPO_UI} mt-1`} /><p className="mt-1 text-xs text-gray-600">{mensajeEntrega.length}/2.000 caracteres.</p><button onClick={() => void handleEnviarValidacion()} disabled={saving || loading} className={`${BOTON_PRINCIPAL} mt-3 w-full sm:w-auto`}>{saving ? 'Guardando…' : 'Entregar para validación'}</button></div>}

          <section className="mb-5 rounded-xl border bg-gray-50 p-4" aria-labelledby="admin-eventos-title"><h3 id="admin-eventos-title" className="font-semibold">Avisos de cambio de estado</h3><p className="mt-1 text-xs text-gray-600">Registro visible para el solicitante dentro de su petición. Sin envíos externos.</p>{detalle.eventos?.length ? <ol className="mt-3 space-y-3">{detalle.eventos.map(evento => <li key={evento.id} className="rounded-lg border bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">{evento.estadoAnterior ? `${etiquetaEstado(evento.estadoAnterior)} → ` : ''}{etiquetaEstado(evento.estadoNuevo)}</p><span className="text-xs text-gray-600">{fechaUI(evento.createdAt, true)}</span></div><p className="mt-1 whitespace-pre-wrap text-sm">{evento.mensaje}</p></li>)}</ol> : <p className="mt-2 text-sm text-gray-600">Todavía no hay avisos de cambio de estado registrados.</p>}</section>
          <section className="mb-5 rounded-xl border bg-gray-50 p-4" aria-labelledby="admin-conversacion-title"><h3 id="admin-conversacion-title" className="font-semibold">Conversación con {detalle.usuarioNombre}</h3><p className="mt-1 text-xs text-gray-600">Los comentarios aclaran requisitos y ajustes, pero no cambian el estado.</p><div className="mt-4 space-y-3">{detalle.mensajes?.length ? detalle.mensajes.map(mensaje => <div key={mensaje.id} className={`rounded-lg border p-3 ${mensaje.autorTipo === 'solicitante' ? 'border-orange-200 bg-orange-50 sm:ml-12' : 'border-gray-200 bg-white sm:mr-12'}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">{mensaje.autorNombre} · {mensaje.autorTipo === 'solicitante' ? 'Solicitante' : 'Equipo'}{mensaje.tipo === 'ajustes' ? ' · Ajustes' : ''}</p><span className="text-xs text-gray-600">{fechaUI(mensaje.createdAt, true)}</span></div><p className="mt-1 whitespace-pre-wrap text-sm">{mensaje.mensaje}</p></div>) : <p className="rounded-lg bg-white p-3 text-sm text-gray-600">Todavía no hay comentarios.</p>}</div>
            {capacidades.gestionar && !estaCerrada(detalle.estado) && <div className="mt-4 border-t pt-4"><label htmlFor="admin-comentario" className="text-sm font-semibold">Escribir al solicitante</label><textarea id="admin-comentario" value={comentario} onChange={e => setComentario(e.target.value)} maxLength={2000} rows={3} className={`${CAMPO_UI} mt-2`} /><div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-gray-600">{comentario.length}/2.000 caracteres.</p><button onClick={() => void handleEnviarComentario()} disabled={saving || loading} className={BOTON_PRINCIPAL}>{saving ? 'Guardando…' : 'Enviar comentario'}</button></div></div>}{estaCerrada(detalle.estado) && <p className="mt-4 border-t pt-3 text-xs text-gray-600">La conversación quedó cerrada con la petición.</p>}
          </section>
          {detalle.notasAdmin && <div className="mb-5 rounded-lg bg-blue-50 p-3 text-sm"><p className="font-semibold">Nota visible actual</p><p className="mt-1 whitespace-pre-wrap">{detalle.notasAdmin}</p></div>}
          {detalle.resueltaPor && <p className="mb-4 rounded-lg bg-gray-50 p-3 text-sm">Última entrega registrada por <strong>{detalle.resueltaPor}</strong>{detalle.fechaResolucion ? ` el ${fechaUI(detalle.fechaResolucion)}` : ''}.</p>}
          <p className="border-t pt-4 text-xs text-gray-600">Las peticiones tramitadas conservan su historial. Si una petición no procede, utiliza la transición a Descartada cuando esté permitida.</p>
        </div>
      </div>}
    </div>
  )
}
