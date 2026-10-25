'use client'

import { useRef, useState } from 'react'
import { ClipboardDocumentIcon, PaperAirplaneIcon, SparklesIcon } from '@heroicons/react/24/outline'

type Fuente = { n: number; titulo: string; url?: string | null; fragmento?: string }
type Respuesta = { conversacionId: string; respuesta: string; fuentes: Fuente[]; sinFuente: boolean; escalar: boolean; modo: string; motivoEscalado?: string }
type Mensaje = { id: string; rol: 'usuario' | 'asistente'; texto: string; respuesta?: Respuesta }

const MODOS = [
  { valor: 'respuesta_cliente', etiqueta: 'Respuesta a cliente' },
  { valor: 'propuesta', etiqueta: 'Propuesta' },
  { valor: 'resumen_incidencia', etiqueta: 'Resumen de incidencia' },
] as const

export default function ChatInterno({ puedeEscribir }: { puedeEscribir: boolean }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState('')
  const [modoAyuda, setModoAyuda] = useState<(typeof MODOS)[number]['valor']>('respuesta_cliente')
  const [conversacionId, setConversacionId] = useState<string | undefined>()
  const [estado, setEstado] = useState('')
  const [enviando, setEnviando] = useState(false)
  const areaRespuesta = useRef<HTMLDivElement>(null)

  async function copiar(valor: string) {
    try {
      await navigator.clipboard.writeText(valor)
      setEstado('Respuesta copiada al portapapeles.')
    } catch {
      setEstado('No se ha podido copiar. Selecciona el texto y cópialo manualmente.')
    }
  }

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const mensaje = texto.trim()
    if (!mensaje || enviando || !puedeEscribir) return
    setEnviando(true)
    setEstado('Buscando en el conocimiento disponible…')
    setTexto('')
    const idUsuario = `usuario-${Date.now()}`
    setMensajes((previos) => [...previos, { id: idUsuario, rol: 'usuario', texto: mensaje }])
    try {
      const respuesta = await fetch('/api/admin/asistente/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mensaje, conversacionId, modoAyuda }),
      })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok || !datos?.respuesta) throw new Error(datos?.error || 'No se ha podido obtener una respuesta.')
      const resultado = datos as Respuesta
      setConversacionId(resultado.conversacionId)
      setMensajes((previos) => [...previos, { id: `asistente-${Date.now()}`, rol: 'asistente', texto: resultado.respuesta, respuesta: resultado }])
      setEstado(resultado.sinFuente ? 'Respuesta generada sin una fuente disponible.' : 'Respuesta lista con fuentes.')
      window.setTimeout(() => areaRespuesta.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 0)
    } catch (error) {
      const mensajeError = error instanceof Error ? error.message : 'No se ha podido obtener una respuesta.'
      setMensajes((previos) => [...previos, { id: `error-${Date.now()}`, rol: 'asistente', texto: mensajeError }])
      setEstado(mensajeError)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><SparklesIcon className="h-7 w-7 text-orange-600" aria-hidden="true" /><h1 className="text-2xl font-bold text-gray-900">Chat interno</h1></div>
          <p className="mt-1 text-sm text-gray-600">Consulta el conocimiento interno. Las respuestas incluyen las fuentes disponibles.</p>
        </div>
        {!puedeEscribir && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:mt-0">Tienes acceso de lectura. No puedes enviar mensajes.</p>}
      </div>

      <section aria-label="Conversación interna" className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div ref={areaRespuesta} className="min-h-[360px] space-y-4 bg-gray-50 p-4 sm:p-6">
          {mensajes.length === 0 && (
            <div className="flex min-h-[280px] items-center justify-center text-center">
              <div><p className="font-medium text-gray-900">¿Qué necesitas preparar?</p><p className="mt-1 max-w-md text-sm text-gray-600">Pregunta por servicios, procedimientos o redacta una respuesta apoyada en el conocimiento publicado.</p></div>
            </div>
          )}
          {mensajes.map((mensaje) => (
            <article key={mensaje.id} className={`max-w-3xl rounded-xl p-4 ${mensaje.rol === 'usuario' ? 'ml-auto bg-orange-600 text-white' : 'border border-gray-200 bg-white text-gray-900'}`}>
              <p className="whitespace-pre-wrap text-sm leading-6">{mensaje.texto}</p>
              {mensaje.respuesta && (
                <div className="mt-4 border-t border-gray-200 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {mensaje.respuesta.sinFuente ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">Sin fuente</span> : <span className="text-xs font-medium text-emerald-700">Respuesta con fuentes</span>}
                    <button type="button" onClick={() => copiar(mensaje.texto)} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-orange-700 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500"><ClipboardDocumentIcon className="h-5 w-5" aria-hidden="true" />Copiar</button>
                  </div>
                  {mensaje.respuesta.fuentes.length > 0 && <ol className="mt-3 space-y-2" aria-label="Fuentes citadas">
                    {mensaje.respuesta.fuentes.map((fuente) => <li key={`${mensaje.id}-${fuente.n}`} className="rounded-md bg-gray-50 p-3 text-sm text-gray-700"><span className="font-semibold">[{fuente.n}] </span>{fuente.url ? <a href={fuente.url} target="_blank" rel="noreferrer" className="font-medium text-orange-700 underline decoration-orange-300 underline-offset-2 hover:text-orange-800">{fuente.titulo}</a> : <span className="font-medium">{fuente.titulo}</span>}{fuente.fragmento ? <p className="mt-1 text-xs leading-5 text-gray-600">{fuente.fragmento}</p> : null}</li>)}
                  </ol>}
                </div>
              )}
            </article>
          ))}
          {enviando && <div className="max-w-xs rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600" role="status">Preparando la respuesta…</div>}
        </div>
        <form onSubmit={enviar} className="border-t border-gray-200 bg-white p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_210px]">
            <div><label htmlFor="mensaje-chat" className="sr-only">Mensaje para el asistente</label><textarea id="mensaje-chat" value={texto} onChange={(evento) => setTexto(evento.target.value)} maxLength={4000} disabled={!puedeEscribir || enviando} placeholder="Escribe una consulta…" className="block min-h-24 w-full rounded-lg border-gray-300 text-sm text-gray-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100" /></div>
            <div><label htmlFor="modo-ayuda" className="block text-sm font-medium text-gray-700">Modo de ayuda</label><select id="modo-ayuda" value={modoAyuda} onChange={(evento) => setModoAyuda(evento.target.value as typeof modoAyuda)} disabled={!puedeEscribir || enviando} className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-sm focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100">{MODOS.map((modo) => <option key={modo.valor} value={modo.valor}>{modo.etiqueta}</option>)}</select><button type="submit" disabled={!puedeEscribir || enviando || !texto.trim()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-orange-300"><PaperAirplaneIcon className="h-5 w-5" aria-hidden="true" />Enviar</button></div>
          </div>
        </form>
      </section>
      <p aria-live="polite" className="min-h-5 text-sm text-gray-600">{estado}</p>
    </div>
  )
}
