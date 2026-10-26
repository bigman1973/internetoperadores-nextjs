'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowPathIcon, CloudArrowUpIcon, DocumentPlusIcon, GlobeAltIcon, PencilSquareIcon } from '@heroicons/react/24/outline'

type Documento = { id: string; titulo: string; espacio: string; tipo: string; origen: string | null; estado: string; versionActual: number; updatedAt: string }
type Detalle = Documento & { contenido: string }
const ESPACIOS = ['TODOS', 'PUBLICO', 'INTERNO'] as const
const TIPOS = ['TODOS', 'WEB', 'FAQ', 'TARIFA', 'PDF', 'DOCX', 'XLSX', 'TXT', 'MD', 'APRENDIZAJE'] as const
const ESTADOS = ['TODOS', 'BORRADOR', 'PUBLICADO', 'ARCHIVADO', 'ERROR'] as const

function formatoFecha(valor: string) { return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor)) }
function claseEstado(estado: string) { return estado === 'PUBLICADO' ? 'bg-emerald-100 text-emerald-800' : estado === 'BORRADOR' ? 'bg-amber-100 text-amber-800' : estado === 'ARCHIVADO' ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-800' }

export default function GestionConocimiento({ puedeEscribir }: { puedeEscribir: boolean }) {
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [espacio, setEspacio] = useState<(typeof ESPACIOS)[number]>('TODOS')
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>('TODOS')
  const [estadoFiltro, setEstadoFiltro] = useState<(typeof ESTADOS)[number]>('TODOS')
  const [busqueda, setBusqueda] = useState('')
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [mostrarFAQ, setMostrarFAQ] = useState(false)
  const [mostrarSubida, setMostrarSubida] = useState(false)
  const [mostrarWeb, setMostrarWeb] = useState(false)

  async function cargar() {
    setCargando(true)
    try {
      const respuesta = await fetch('/api/admin/asistente/conocimiento?limit=50', { cache: 'no-store' })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se ha podido cargar el conocimiento.')
      setDocumentos(datos?.items || [])
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se ha podido cargar el conocimiento.')
    } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [])

  const filtrados = useMemo(() => documentos.filter((documento) => (
    (espacio === 'TODOS' || documento.espacio === espacio)
    && (tipo === 'TODOS' || documento.tipo === tipo)
    && (estadoFiltro === 'TODOS' || documento.estado === estadoFiltro)
    && (!busqueda.trim() || `${documento.titulo} ${documento.origen || ''}`.toLocaleLowerCase('es-ES').includes(busqueda.trim().toLocaleLowerCase('es-ES')))
  )), [documentos, espacio, tipo, estadoFiltro, busqueda])

  async function abrirDetalle(id: string) {
    setMensaje('')
    try {
      const respuesta = await fetch(`/api/admin/asistente/conocimiento/${id}`, { cache: 'no-store' })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se ha podido abrir el documento.')
      setDetalle(datos)
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se ha podido abrir el documento.') }
  }

  async function cambiarEstado(id: string, estado: 'PUBLICADO' | 'ARCHIVADO') {
    if (!puedeEscribir || guardando) return
    const motivoPublicacion = estado === 'PUBLICADO' ? window.prompt('Indica el motivo de la revisión humana antes de publicar (mínimo 3 caracteres):')?.trim() : undefined
    if (estado === 'PUBLICADO' && (!motivoPublicacion || motivoPublicacion.length < 3)) { setMensaje('La publicación requiere confirmación y un motivo de revisión humana.'); return }
    if (estado === 'PUBLICADO' && !window.confirm('Confirmas que has revisado el contenido anonimizado y autorizas su publicación?')) return
    setGuardando(true); setMensaje('')
    try {
      const respuesta = await fetch(`/api/admin/asistente/conocimiento/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ estado, ...(estado === 'PUBLICADO' ? { confirmarPublicacion: true, motivoPublicacion } : {}) }) })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se ha podido actualizar el estado.')
      setMensaje(estado === 'PUBLICADO' ? 'Documento publicado.' : 'Documento archivado.')
      if (detalle?.id === id) setDetalle((previo) => previo ? { ...previo, estado } : previo)
      await cargar()
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se ha podido actualizar el estado.') } finally { setGuardando(false) }
  }

  async function crearFaq(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault(); if (!puedeEscribir || guardando) return
    const form = new FormData(evento.currentTarget)
    setGuardando(true); setMensaje('')
    try {
      const respuesta = await fetch('/api/admin/asistente/conocimiento', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ titulo: form.get('titulo'), contenido: form.get('contenido'), tipo: 'FAQ', espacio: form.get('espacio') || 'INTERNO' }) })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se ha podido crear la FAQ.')
      setMostrarFAQ(false); setMensaje('FAQ creada como borrador. Publícala cuando esté revisada.'); evento.currentTarget.reset(); await cargar()
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se ha podido crear la FAQ.') } finally { setGuardando(false) }
  }

  async function subirArchivo(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault(); if (!puedeEscribir || guardando) return
    setGuardando(true); setMensaje('')
    try {
      const respuesta = await fetch('/api/admin/asistente/conocimiento', { method: 'POST', body: new FormData(evento.currentTarget) })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se ha podido subir el archivo.')
      setMostrarSubida(false); setMensaje('Archivo subido como borrador. Publícalo tras revisarlo.'); evento.currentTarget.reset(); await cargar()
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se ha podido subir el archivo.') } finally { setGuardando(false) }
  }

  async function indexarWeb(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault(); if (!puedeEscribir || guardando) return
    const form = new FormData(evento.currentTarget)
    setGuardando(true); setMensaje('')
    try {
      const respuesta = await fetch('/api/admin/asistente/conocimiento/web-publica', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: form.get('url') }) })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se ha podido indexar la página.')
      setMostrarWeb(false); setMensaje('Página indexada como borrador. Revísala y publícala cuando proceda.'); evento.currentTarget.reset(); await cargar()
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se ha podido indexar la página.') } finally { setGuardando(false) }
  }

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-start sm:justify-between"><div><h1 className="text-2xl font-bold text-gray-900">Conocimiento</h1><p className="mt-1 text-sm text-gray-600">Todo lo nuevo se guarda como borrador hasta su publicación manual.</p></div>{puedeEscribir && <div className="mt-4 flex flex-wrap gap-2 sm:mt-0"><button type="button" onClick={() => setMostrarFAQ((valor) => !valor)} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"><DocumentPlusIcon className="h-5 w-5" aria-hidden="true" />Crear FAQ</button><button type="button" onClick={() => setMostrarSubida((valor) => !valor)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500"><CloudArrowUpIcon className="h-5 w-5" aria-hidden="true" />Subir archivo</button><button type="button" onClick={() => setMostrarWeb((valor) => !valor)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500"><GlobeAltIcon className="h-5 w-5" aria-hidden="true" />Indexar web</button></div>}</div>

      {mostrarFAQ && <form onSubmit={crearFaq} className="rounded-xl border border-orange-200 bg-orange-50 p-4"><h2 className="font-semibold text-gray-900">Nueva FAQ</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">Título<input name="titulo" required minLength={3} maxLength={500} className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500" /></label><label className="text-sm font-medium text-gray-700">Espacio<select name="espacio" defaultValue="INTERNO" className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500"><option value="INTERNO">Interno</option><option value="PUBLICO">Público</option></select></label></div><label className="mt-3 block text-sm font-medium text-gray-700">Contenido<textarea name="contenido" required minLength={1} maxLength={100000} className="mt-1 block min-h-32 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500" /></label><button disabled={guardando} className="mt-3 min-h-11 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:bg-orange-300">Guardar como borrador</button></form>}
      {mostrarSubida && <form onSubmit={subirArchivo} className="rounded-xl border border-orange-200 bg-orange-50 p-4"><h2 className="font-semibold text-gray-900">Subir archivo</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">Título opcional<input name="titulo" maxLength={500} className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500" /></label><label className="text-sm font-medium text-gray-700">Espacio elegible<select name="espacio" defaultValue="INTERNO" className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500"><option value="INTERNO">Interno</option><option value="PUBLICO">Público</option></select></label></div><label className="mt-3 block text-sm font-medium text-gray-700">Archivo<input name="archivo" type="file" required accept=".pdf,.docx,.xlsx,.txt,.md" className="mt-1 block min-h-11 w-full text-sm text-gray-700" /></label><button disabled={guardando} className="mt-3 min-h-11 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:bg-orange-300">Subir como borrador</button></form>}
      {mostrarWeb && <form onSubmit={indexarWeb} className="rounded-xl border border-orange-200 bg-orange-50 p-4"><h2 className="font-semibold text-gray-900">Indexar una página pública</h2><label className="mt-3 block text-sm font-medium text-gray-700">URL pública de Internet Operadores<input name="url" type="url" required maxLength={1000} placeholder="https://www.internetoperadores.com/..." className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500" /></label><button disabled={guardando} className="mt-3 min-h-11 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:bg-orange-300">Indexar como borrador</button></form>}

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-medium text-gray-700">Buscar<input value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500" /></label><Selector etiqueta="Espacio" valor={espacio} valores={ESPACIOS} alCambiar={(valor) => setEspacio(valor as typeof espacio)} /><Selector etiqueta="Tipo" valor={tipo} valores={TIPOS} alCambiar={(valor) => setTipo(valor as typeof tipo)} /><Selector etiqueta="Estado" valor={estadoFiltro} valores={ESTADOS} alCambiar={(valor) => setEstadoFiltro(valor as typeof estadoFiltro)} /></div><div className="mt-3 flex items-center justify-between"><p className="text-sm text-gray-600">{cargando ? 'Cargando documentos…' : `${filtrados.length} documentos visibles`}</p><button type="button" onClick={cargar} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-orange-700 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500"><ArrowPathIcon className="h-5 w-5" aria-hidden="true" />Actualizar</button></div></section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[740px] w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Documento</th><th className="px-4 py-3">Espacio</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Versión</th><th className="px-4 py-3">Actualizado</th><th className="px-4 py-3"><span className="sr-only">Acciones</span></th></tr></thead><tbody className="divide-y divide-gray-200">{cargando ? Array.from({ length: 5 }).map((_, i) => <tr key={i} className="animate-pulse"><td colSpan={7} className="h-16 px-4"><div className="h-4 w-3/4 rounded bg-gray-200" /></td></tr>) : filtrados.length ? filtrados.map((documento) => <tr key={documento.id} className="hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-900">{documento.titulo}</td><td className="px-4 py-3 text-gray-700">{documento.espacio}</td><td className="px-4 py-3 text-gray-700">{documento.tipo}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${claseEstado(documento.estado)}`}>{documento.estado}</span></td><td className="px-4 py-3 text-gray-700">v{documento.versionActual}</td><td className="px-4 py-3 text-gray-700">{formatoFecha(documento.updatedAt)}</td><td className="px-4 py-3"><button type="button" onClick={() => abrirDetalle(documento.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-orange-700 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500"><PencilSquareIcon className="h-5 w-5" aria-hidden="true" />Ver</button></td></tr>) : <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-600">No hay documentos que coincidan con los filtros.</td></tr>}</tbody></table></div></section>

      {detalle && <aside aria-label="Detalle del documento" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-gray-900">{detalle.titulo}</h2><p className="mt-1 text-sm text-gray-600">Versión actual: {detalle.versionActual}. El historial completo se conserva en el repositorio de conocimiento.</p></div><button type="button" onClick={() => setDetalle(null)} className="min-h-11 rounded-md px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500">Cerrar</button></div><pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm leading-6 text-gray-800">{detalle.contenido || 'Sin contenido disponible.'}</pre>{puedeEscribir && <div className="mt-4 flex flex-wrap gap-2">{detalle.estado !== 'PUBLICADO' && <button type="button" disabled={guardando} onClick={() => cambiarEstado(detalle.id, 'PUBLICADO')} className="min-h-11 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:bg-orange-300">Publicar</button>}{detalle.estado !== 'ARCHIVADO' && <button type="button" disabled={guardando} onClick={() => cambiarEstado(detalle.id, 'ARCHIVADO')} className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:bg-gray-100">Archivar</button>}</div>}</aside>}
      <p aria-live="polite" className="min-h-5 text-sm text-gray-700">{mensaje}</p>
    </div>
  )
}

function Selector<T extends string>({ etiqueta, valor, valores, alCambiar }: { etiqueta: string; valor: T; valores: readonly T[]; alCambiar: (valor: T) => void }) {
  return <label className="text-sm font-medium text-gray-700">{etiqueta}<select value={valor} onChange={(evento) => alCambiar(evento.target.value as T)} className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500">{valores.map((opcion) => <option key={opcion} value={opcion}>{opcion === 'TODOS' ? 'Todos' : opcion}</option>)}</select></label>
}
