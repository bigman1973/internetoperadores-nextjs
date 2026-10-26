'use client'

import { useEffect, useState } from 'react'
import { ArrowPathIcon, ChatBubbleLeftEllipsisIcon } from '@heroicons/react/24/outline'

type Conversacion = { id: string; canal: string; estado: string; escaladoMotivo: string | null; mensajes: number; createdAt: string; updatedAt: string; sinFuente: boolean; escalada: boolean }
type Mensaje = { id: string; rol: string; textoAnon: string; fuentes: unknown; sinFuente: boolean; puntuacion: number | null; intent: string | null; createdAt: string; valoracion: { util: boolean; comentarioAnon: string | null; createdAt: string } | null }
type Detalle = { id: string; canal: string; estado: string; escaladoMotivo: string | null; mensajes: number; createdAt: string; updatedAt: string; visitanteHashCorto: string | null; mensajesLista: Mensaje[]; mensajesTruncados: boolean }
const formatos = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' })

export default function ExploradorConversaciones() {
  const [items, setItems] = useState<Conversacion[]>([])
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [filtros, setFiltros] = useState({ canal: '', estado: '', sinFuente: '', escalada: '', fecha: '' })
  const [cargando, setCargando] = useState(true)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [siguienteCursor, setSiguienteCursor] = useState<string | null>(null)

  async function cargar(cursor?: string, acumular = false) {
    setCargando(true); setMensaje('')
    try {
      const parametros = new URLSearchParams({ limit: '20' })
      Object.entries(filtros).forEach(([clave, valor]) => { if (valor) parametros.set(clave, valor) })
      if (cursor) parametros.set('cursor', cursor)
      const respuesta = await fetch(`/api/admin/asistente/conversaciones?${parametros}`, { cache: 'no-store' })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se han podido cargar las conversaciones.')
      setItems((previos) => acumular ? [...previos, ...(datos?.items || [])] : (datos?.items || []))
      setSiguienteCursor(datos?.siguienteCursor || null)
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se han podido cargar las conversaciones.') } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [])

  async function abrir(id: string) {
    setCargandoDetalle(true); setMensaje('')
    try {
      const respuesta = await fetch(`/api/admin/asistente/conversaciones/${id}`, { cache: 'no-store' })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se ha podido abrir la conversación.')
      setDetalle(datos)
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se ha podido abrir la conversación.') } finally { setCargandoDetalle(false) }
  }

  function enviarFiltros(evento: React.FormEvent<HTMLFormElement>) { evento.preventDefault(); setDetalle(null); cargar() }
  function limpiar() { setFiltros({ canal: '', estado: '', sinFuente: '', escalada: '', fecha: '' }); setDetalle(null); window.setTimeout(() => cargar(), 0) }

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-gray-900">Conversaciones</h1><p className="mt-1 text-sm text-gray-600">Mensajes anonimizados y valoraciones; el identificador de visitante se muestra abreviado.</p></div>
    <form onSubmit={enviarFiltros} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><CampoSelect etiqueta="Canal" valor={filtros.canal} opciones={['PUBLICO', 'INTERNO', 'CLIENTE']} alCambiar={(canal) => setFiltros((v) => ({ ...v, canal }))} /><CampoSelect etiqueta="Estado" valor={filtros.estado} opciones={['ABIERTA', 'ESCALADA', 'CERRADA']} alCambiar={(estado) => setFiltros((v) => ({ ...v, estado }))} /><CampoSelect etiqueta="Sin fuente" valor={filtros.sinFuente} opciones={['si', 'no']} etiquetas={{ si: 'Sí', no: 'No' }} alCambiar={(sinFuente) => setFiltros((v) => ({ ...v, sinFuente }))} /><CampoSelect etiqueta="Escalada" valor={filtros.escalada} opciones={['si', 'no']} etiquetas={{ si: 'Sí', no: 'No' }} alCambiar={(escalada) => setFiltros((v) => ({ ...v, escalada }))} /><label className="text-sm font-medium text-gray-700">Fecha<input type="date" value={filtros.fecha} onChange={(evento) => setFiltros((v) => ({ ...v, fecha: evento.target.value }))} className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500" /></label></div><div className="mt-4 flex flex-wrap gap-2"><button className="min-h-11 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500">Aplicar filtros</button><button type="button" onClick={limpiar} className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50">Limpiar</button><button type="button" onClick={() => cargar()} className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-orange-700 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500"><ArrowPathIcon className="h-5 w-5" aria-hidden="true" />Actualizar</button></div></form>
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Canal</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Mensajes</th><th className="px-4 py-3">Señales</th><th className="px-4 py-3">Actualizada</th><th className="px-4 py-3"><span className="sr-only">Abrir</span></th></tr></thead><tbody className="divide-y divide-gray-200">{cargando ? Array.from({ length: 5 }).map((_, indice) => <tr key={indice} className="animate-pulse"><td colSpan={6} className="h-16 px-4"><div className="h-4 w-2/3 rounded bg-gray-200" /></td></tr>) : items.length ? items.map((item) => <tr key={item.id} className="hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-900">{item.canal}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.estado === 'ESCALADA' ? 'bg-amber-100 text-amber-800' : item.estado === 'CERRADA' ? 'bg-gray-100 text-gray-700' : 'bg-emerald-100 text-emerald-800'}`}>{item.estado}</span></td><td className="px-4 py-3 text-gray-700">{item.mensajes}</td><td className="px-4 py-3 text-gray-700">{item.sinFuente ? <span className="mr-2 rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Sin fuente</span> : null}{item.escalada ? <span className="rounded bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800">Escalada</span> : null}{!item.sinFuente && !item.escalada ? '—' : null}</td><td className="px-4 py-3 text-gray-700">{formatos.format(new Date(item.updatedAt))}</td><td className="px-4 py-3"><button onClick={() => abrir(item.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-orange-700 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500"><ChatBubbleLeftEllipsisIcon className="h-5 w-5" aria-hidden="true" />Abrir</button></td></tr>) : <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-600">No hay conversaciones para estos filtros.</td></tr>}</tbody></table></div>{siguienteCursor && <div className="border-t border-gray-200 p-3 text-center"><button disabled={cargando} onClick={() => cargar(siguienteCursor, true)} className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:bg-gray-100">Cargar más</button></div>}</section>
    {(detalle || cargandoDetalle) && <section aria-label="Detalle de conversación" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">{cargandoDetalle ? <div className="h-56 animate-pulse rounded-lg bg-gray-100" /> : detalle && <><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-semibold text-gray-900">Conversación {detalle.canal}</h2><p className="mt-1 text-sm text-gray-600">Estado: {detalle.estado}{detalle.visitanteHashCorto ? ` · Visitante: ${detalle.visitanteHashCorto}…` : ''}</p></div><button onClick={() => setDetalle(null)} className="min-h-11 rounded-md px-3 text-sm font-medium text-gray-700 hover:bg-gray-100">Cerrar</button></div>{detalle.mensajesTruncados && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Se muestran los primeros 50 mensajes de esta conversación.</p>}<div className="mt-4 space-y-3">{detalle.mensajesLista.map((mensaje) => <article key={mensaje.id} className={`rounded-xl p-4 ${mensaje.rol === 'usuario' ? 'ml-auto max-w-3xl bg-orange-600 text-white' : 'max-w-3xl border border-gray-200 bg-gray-50 text-gray-900'}`}><p className="text-xs font-semibold uppercase tracking-wide opacity-75">{mensaje.rol === 'usuario' ? 'Usuario' : 'Asistente'} · {formatos.format(new Date(mensaje.createdAt))}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{mensaje.textoAnon}</p>{mensaje.sinFuente && <span className="mt-3 inline-block rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">Sin fuente</span>}{mensaje.fuentes && Array.isArray(mensaje.fuentes) && mensaje.fuentes.length > 0 && <p className="mt-3 text-xs opacity-80">Incluye fuentes registradas.</p>}{mensaje.valoracion && <p className="mt-3 border-t border-current/20 pt-3 text-xs">Valoración: {mensaje.valoracion.util ? 'Útil' : 'No útil'}{mensaje.valoracion.comentarioAnon ? ` · ${mensaje.valoracion.comentarioAnon}` : ''}</p>}</article>)}</div></>}</section>}
    <p aria-live="polite" className="min-h-5 text-sm text-gray-700">{mensaje}</p>
  </div>
}

function CampoSelect({ etiqueta, valor, opciones, etiquetas, alCambiar }: { etiqueta: string; valor: string; opciones: string[]; etiquetas?: Record<string, string>; alCambiar: (valor: string) => void }) { return <label className="text-sm font-medium text-gray-700">{etiqueta}<select value={valor} onChange={(evento) => alCambiar(evento.target.value)} className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500"><option value="">Todos</option>{opciones.map((opcion) => <option key={opcion} value={opcion}>{etiquetas?.[opcion] || opcion}</option>)}</select></label> }
