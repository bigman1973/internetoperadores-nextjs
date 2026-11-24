'use client'

import { useEffect, useState } from 'react'
import { publicSafeUrl } from '@/lib/area9/core'

type View = 'desarrollos' | 'publicaciones' | 'migraciones'
type Development = { id: number; fecha: string; titulo: string; descripcion: string; tipo: string; estado: string; autor: string | null; commit_hash: string | null; rama: string | null; automatico: boolean }
type Migration = { id?: string; nombre: string; checksum: string | null; aplicadaAt: string | null; estado: string }
type Publication = { id: string; titulo: string; resumen: string; entorno: string; fecha_publicacion: string; commit_hash: string; fuente: string; url: string; migraciones: unknown; total_vinculos: number; vinculos: { peticion_id: number; titulo: string; estado: string | null; fecha: string; confirmado_nombre: string }[] }
type Form = { titulo: string; descripcion: string; tipo: string; estado: string; fecha: string }
export const localDatetime = (instant = new Date()) => new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
const emptyForm = (): Form => ({ titulo: '', descripcion: '', tipo: 'publica', estado: 'completado', fecha: localDatetime() })
const control = 'min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5300]'
const primary = 'min-h-11 rounded-md bg-[#FF5300] px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50'
const date = (value: string | null) => value ? new Date(value).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const labelState: Record<string, string> = { completado: 'Completado', en_progreso: 'En progreso', planificado: 'Planificado', aplicada: 'Aplicada', preparada: 'Preparada, no aplicada', checksum_distinto: 'Aplicada con otro checksum', no_verificable: 'Archivo no verificable' }
function safeHref(value: string) { try { return publicSafeUrl(value) } catch { return null } }
async function responseJson(response: Response) {
  let body: any
  try { body = await response.json() } catch { throw new Error('Respuesta no disponible. Inténtalo de nuevo.') }
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `No se pudo completar la operación (${response.status}).`)
  return body
}

export default function HistorialDesarrollosClient({ canManage = false }: { canManage?: boolean }) {
  const [view, setView] = useState<View>('desarrollos')
  const [developments, setDevelopments] = useState<Development[]>([])
  const [publications, setPublications] = useState<Publication[]>([])
  const [migrations, setMigrations] = useState<Migration[]>([])
  const [prepared, setPrepared] = useState<Migration[]>([])
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [total, setTotal] = useState(0)
  const [preparedTotal, setPreparedTotal] = useState(0)
  const [tipo, setTipo] = useState('')
  const [estado, setEstado] = useState('')
  const [entorno, setEntorno] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [editing, setEditing] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm)
  const [linkPublication, setLinkPublication] = useState<string | null>(null)
  const [requestId, setRequestId] = useState('')
  const [confirmo, setConfirmo] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    const query = new URLSearchParams({ vista: view, page: String(page), limit: String(limit) })
    if (view === 'desarrollos') { if (tipo) query.set('tipo', tipo); if (estado) query.set('estado', estado) }
    if (view === 'publicaciones' && entorno) query.set('entorno', entorno)
    fetch(`/api/admin/historial?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(responseJson).then(data => {
        if (controller.signal.aborted) return
        setTotal(data.total ?? 0); setPreparedTotal(data.totalPreparadas ?? 0)
        if (view === 'desarrollos') setDevelopments(data.registros ?? [])
        if (view === 'publicaciones') setPublications(data.registros ?? [])
        if (view === 'migraciones') { setMigrations(data.registros ?? []); setPrepared(data.preparadas ?? []) }
      }).catch(err => { if (!controller.signal.aborted) { setError(err.message); setDevelopments([]); setPublications([]); setMigrations([]); setPrepared([]); setTotal(0); setPreparedTotal(0) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [view, page, limit, tipo, estado, entorno, refresh])

  function changeView(next: View) { setView(next); setPage(1); setShowForm(false); setLinkPublication(null); setNotice('') }
  function resetForm() { setShowForm(false); setEditing(null); setForm(emptyForm()) }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      // El selector datetime-local usa hora local; el servidor recibe un instante ISO inequívoco.
      await responseJson(await fetch(editing ? `/api/admin/historial/${editing}` : '/api/admin/historial', {
        method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, fecha: new Date(form.fecha).toISOString() }),
      }))
      resetForm(); setNotice('Desarrollo manual guardado. Esto no acredita una publicación.'); setRefresh(n => n + 1)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.') }
    finally { setBusy(false) }
  }
  function edit(row: Development) {
    const instant = new Date(row.fecha)
    const local = localDatetime(instant)
    setEditing(row.id); setForm({ titulo: row.titulo, descripcion: row.descripcion, tipo: row.tipo, estado: row.estado, fecha: local }); setShowForm(true)
  }
  async function remove(row: Development) {
    if (!window.confirm(`¿Eliminar el desarrollo manual «${row.titulo}»?`)) return
    setBusy(true); setError('')
    try { await responseJson(await fetch(`/api/admin/historial/${row.id}`, { method: 'DELETE' })); setNotice('Desarrollo manual eliminado.'); setRefresh(n => n + 1) }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo eliminar.') }
    finally { setBusy(false) }
  }
  async function link(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await responseJson(await fetch('/api/admin/historial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'vincular_peticion', publicacionId: linkPublication, peticionId: Number(requestId), confirmo }) }))
      setLinkPublication(null); setRequestId(''); setConfirmo(false); setNotice('Vínculo confirmado. La petición no ha sido modificada.'); setRefresh(n => n + 1)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo vincular.') }
    finally { setBusy(false) }
  }
  const maxPages = Math.max(1, Math.ceil(Math.max(total, view === 'migraciones' ? preparedTotal : 0) / limit))

  const migrationCards = (rows: Migration[], prefix: string) => rows.length ? rows.map(row => <article key={`${prefix}-${row.id ?? row.nombre}`} className="rounded-lg border border-gray-200 bg-white p-4">
    <h3 className="break-all font-semibold">{row.nombre}</h3>
    <p className={`mt-1 text-sm ${row.estado === 'aplicada' ? 'text-green-700' : 'text-amber-800'}`}>{labelState[row.estado] ?? row.estado}</p>
    <p className="mt-2 text-sm">Fecha de aplicación: {date(row.aplicadaAt)}</p>
    <p className="mt-2 break-all font-mono text-xs text-gray-600">Checksum SHA-256: {row.checksum ?? 'No disponible'}</p>
  </article>) : <p className="rounded-lg border bg-white p-6 text-sm text-gray-500">Sin registros en esta página.</p>

  return <div className="min-w-0 max-w-full space-y-6 text-[#2D2A26] [overflow-wrap:anywhere]">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h1 className="text-2xl font-bold">Historial de desarrollos y publicaciones</h1><p className="mt-2 max-w-3xl text-sm text-gray-600">Un desarrollo terminado no significa que esté publicado. El historial automático solo admite recibos de despliegues realmente publicados; no equivale a un push, un build o una preview.</p></div>
      {canManage && view === 'desarrollos' && <button className={primary} onClick={() => { resetForm(); setShowForm(true) }}>Nuevo desarrollo manual</button>}
    </header>
    <nav aria-label="Vistas del historial" className="flex flex-wrap gap-2">{(['desarrollos', 'publicaciones', 'migraciones'] as View[]).map(item => <button key={item} aria-current={view === item ? 'page' : undefined} onClick={() => changeView(item)} className={`${control} ${view === item ? 'border-[#FF5300] bg-orange-50 font-semibold' : ''}`}>{item === 'desarrollos' ? 'Desarrollos' : item === 'publicaciones' ? 'Publicaciones' : 'Migraciones'}</button>)}</nav>
    {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {notice && <p role="status" className="rounded-md bg-green-50 p-4 text-sm text-green-800">{notice}</p>}
    <div className="flex flex-wrap items-end gap-3">
      {view === 'desarrollos' && <><label className="text-sm">Tipo<select className={`${control} ml-2`} value={tipo} onChange={e => { setTipo(e.target.value); setPage(1) }}><option value="">Todos</option><option value="publica">Web pública</option><option value="privada">Panel admin</option><option value="ambas">Ambas</option></select></label><label className="text-sm">Estado<select className={`${control} ml-2`} value={estado} onChange={e => { setEstado(e.target.value); setPage(1) }}><option value="">Todos</option><option value="completado">Completado</option><option value="en_progreso">En progreso</option><option value="planificado">Planificado</option></select></label></>}
      {view === 'publicaciones' && <label className="text-sm">Entorno<select className={`${control} ml-2`} value={entorno} onChange={e => { setEntorno(e.target.value); setPage(1) }}><option value="">Todos</option><option value="staging">Staging</option><option value="produccion">Producción</option></select></label>}
      <label className="text-sm">Por página<select className={`${control} ml-2`} value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1) }}>{[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <button className={control} disabled={loading || busy} onClick={() => setRefresh(n => n + 1)}>Actualizar</button><span className="text-sm text-gray-500">{total} {view === 'migraciones' ? 'aplicadas' : 'registros'}{view === 'migraciones' ? ` · ${preparedTotal} archivos preparados` : ''}</span>
    </div>
    {showForm && canManage && view === 'desarrollos' && <form onSubmit={save} className="space-y-4 rounded-lg border border-orange-200 bg-white p-5">
      <h2 className="text-lg font-semibold">{editing ? 'Editar desarrollo manual' : 'Nuevo desarrollo manual'}</h2><p className="text-sm text-gray-500">No añade ni modifica publicaciones automáticas. El autor será tu identidad autenticada.</p>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Título<input required maxLength={200} className={`${control} mt-1 w-full`} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} /></label><label className="text-sm">Fecha y hora local<input required type="datetime-local" className={`${control} mt-1 w-full`} value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} /></label><label className="text-sm">Tipo<select className={`${control} mt-1 w-full`} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}><option value="publica">Web pública</option><option value="privada">Panel admin</option><option value="ambas">Ambas</option></select></label><label className="text-sm">Estado<select className={`${control} mt-1 w-full`} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}><option value="completado">Completado</option><option value="en_progreso">En progreso</option><option value="planificado">Planificado</option></select></label></div>
      <label className="block text-sm">Cambios en lenguaje claro<textarea maxLength={20000} rows={4} className={`${control} mt-1 w-full`} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} /></label><div className="flex gap-3"><button disabled={busy} className={primary}>Guardar</button><button disabled={busy} type="button" className={control} onClick={resetForm}>Cancelar</button></div>
    </form>}
    {loading ? <div role="status" aria-live="polite" className="min-h-[20rem] rounded-lg border bg-white p-6">Cargando historial…</div> : error ? null : view === 'desarrollos' ? <div className="space-y-3">{developments.length ? developments.map(row => <article key={row.id} className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="font-semibold">#{row.id} · {row.titulo}</h2><p className="mt-1 text-sm text-gray-500">{date(row.fecha)} · {row.tipo} · {labelState[row.estado] ?? row.estado}</p><p className="mt-1 text-xs text-gray-500">{row.autor ?? 'Autor no indicado'} · {row.automatico ? 'Desarrollo automático, solo lectura' : 'Registro manual'}</p></div>{canManage && !row.automatico && <div className="flex gap-2"><button disabled={busy} className={control} onClick={() => edit(row)} aria-label={`Editar ${row.titulo}`}>Editar</button><button disabled={busy} className={`${control} text-red-700`} onClick={() => remove(row)} aria-label={`Eliminar ${row.titulo}`}>Eliminar</button></div>}</div>
      {row.commit_hash && <p className="mt-3 break-all font-mono text-xs">Commit: {row.commit_hash}{row.rama ? ` · Rama: ${row.rama}` : ''}</p>}<details className="mt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Ver cambios</summary><p className="whitespace-pre-wrap break-words text-sm">{row.descripcion || 'Sin descripción detallada.'}</p></details>
    </article>) : <p className="rounded-lg border bg-white p-6 text-sm text-gray-500">Sin desarrollos para estos filtros.</p>}</div> : view === 'publicaciones' ? <div className="space-y-4">
      <p className="text-sm text-gray-600">Registro automático de solo lectura. Un vínculo requiere una petición ya hecha, conformidad del solicitante y fecha de cierre. No cierra ni modifica la petición.</p>
      {publications.length ? publications.map(row => { const href = safeHref(row.url); const snapshots = Array.isArray(row.migraciones) ? row.migraciones as Migration[] : []; return <article key={row.id} className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="font-semibold">{row.titulo}</h2><p className="text-sm">{date(row.fecha_publicacion)} · {row.entorno === 'produccion' ? 'Producción' : 'Staging'} · Publicación automática</p><p className="break-all font-mono text-xs">Commit: {row.commit_hash}</p><p className="whitespace-pre-wrap break-words text-sm">{row.resumen}</p>{href && <a className="inline-block min-h-11 py-2 text-sm text-orange-700 underline" href={href} target="_blank" rel="noopener noreferrer">Ver despliegue ({row.fuente})</a>}
        <div><h3 className="text-sm font-semibold">Peticiones vinculadas ({row.total_vinculos})</h3>{row.vinculos.length ? <ul className="mt-2 space-y-2 text-sm">{row.vinculos.map(item => <li key={item.peticion_id}><a className="text-orange-700 underline" href={`/admin/peticiones?id=${item.peticion_id}`}>#{item.peticion_id} · {item.titulo}</a><p className="text-xs text-gray-500">{item.estado === 'hecha' ? 'Hecha' : item.estado ?? 'Estado no disponible'} · Vínculo confirmado por {item.confirmado_nombre} el {date(item.fecha)}</p></li>)}</ul> : <p className="mt-1 text-sm text-gray-500">Sin vínculos confirmados.</p>}{row.total_vinculos > row.vinculos.length && <p className="text-xs text-gray-500">Se muestran los últimos 100 vínculos.</p>}</div>
        <div><h3 className="text-sm font-semibold">Migraciones aplicadas acreditadas en el recibo</h3>{snapshots.length ? <ul className="mt-2 space-y-2">{snapshots.map((item, index) => <li key={`${item.nombre}-${index}`} className="break-all text-xs">{String(item.nombre ?? '')} · {date(item.aplicadaAt)}<p className="font-mono">{String(item.checksum ?? '')}</p></li>)}</ul> : <p className="mt-1 text-sm text-gray-500">Sin evidencia de migraciones en este recibo; no implica que no existan.</p>}</div>
        {canManage && <button className={control} onClick={() => { setLinkPublication(row.id); setRequestId(''); setConfirmo(false) }}>Vincular petición ya cerrada</button>}
        {canManage && linkPublication === row.id && <form onSubmit={link} className="space-y-3 rounded-md bg-orange-50 p-4"><label className="block text-sm">ID de la petición ya hecha<input required type="number" min={1} max={2147483647} step={1} value={requestId} className={`${control} mt-1 w-full`} onChange={e => setRequestId(e.target.value)} /></label><label className="flex items-start gap-2 text-sm"><input required type="checkbox" className="mt-1" checked={confirmo} onChange={e => setConfirmo(e.target.checked)} />Confirmo personalmente que esta publicación corresponde a esa petición ya cerrada y aceptada. El vínculo no cambia su estado.</label><div className="flex gap-2"><button className={primary} disabled={busy || !confirmo}>Confirmar vínculo</button><button type="button" className={control} disabled={busy} onClick={() => setLinkPublication(null)}>Cancelar</button></div></form>}
      </article> }) : <p className="rounded-lg border bg-white p-6 text-sm text-gray-500">No hay publicaciones acreditadas con estos filtros. El capturador está preparado, pero no acredita ningún despliegue por sí solo.</p>}
    </div> : <div className="space-y-6"><p className="text-sm text-gray-600">Aplicadas: leídas de _prisma_migrations con fecha de finalización y sin reversión registrada. Preparadas: archivos presentes, no prueba de ejecución. No se muestran SQL ni datos de negocio.</p><section className="space-y-3"><h2 className="text-lg font-semibold">Migraciones realmente aplicadas</h2>{migrationCards(migrations, 'applied')}</section><section className="space-y-3"><h2 className="text-lg font-semibold">Archivos preparados y contraste con la BD</h2>{migrationCards(prepared, 'prepared')}</section></div>}
    <div className="flex flex-wrap items-center justify-between gap-3" aria-label="Paginación"><button className={control} disabled={loading || page <= 1} onClick={() => setPage(n => n - 1)}>Anterior</button><span className="text-sm">Página {page} de {maxPages}</span><button className={control} disabled={loading || page >= maxPages} onClick={() => setPage(n => n + 1)}>Siguiente</button></div>
  </div>
}
