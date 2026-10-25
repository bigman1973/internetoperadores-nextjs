'use client'

import { useCallback, useEffect, useState } from 'react'

type Fuente = { documentoId: string; versionId: string; titulo: string; url: string | null; fragmento: string }
type Hueco = { id: string; preguntaNorm: string; pregunta: string; veces: number; canales: string[]; updatedAt: string }
type Propuesta = { id: string; origen: 'HUECO' | 'VALORACION'; huecoId: string | null; valoracionId: string | null; pregunta: string; respuestaPropuesta: string; fuentes: Fuente[]; estado: string; createdAt: string; requiereRedactar: boolean }
type Datos = { huecos: Hueco[]; valoracionesNegativas: Array<{ id: string; comentarioAnon: string | null; createdAt: string; mensaje: { textoAnon: string; conversacion: { canal: string } } }>; propuestas: Propuesta[] }

const boton = 'min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

export default function AprendizajeClient({ puedeEscribir }: { puedeEscribir: boolean }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState('')
  const [enEdicion, setEnEdicion] = useState<Propuesta | null>(null)
  const [pregunta, setPregunta] = useState('')
  const [respuesta, setRespuesta] = useState('')
  const [espacio, setEspacio] = useState<'PUBLICO' | 'INTERNO'>('INTERNO')
  const [accionando, setAccionando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const respuestaHttp = await fetch('/api/admin/asistente/aprendizaje?limit=50', { cache: 'no-store' })
      const cuerpo = await respuestaHttp.json()
      if (!respuestaHttp.ok) throw new Error(cuerpo.error || 'No se ha podido cargar la bandeja')
      setDatos(cuerpo)
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se ha podido cargar la bandeja')
    } finally { setCargando(false) }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function proponer(origen: 'HUECO' | 'VALORACION', id: string) {
    setAccionando(true); setMensaje('')
    try {
      const respuestaHttp = await fetch('/api/admin/asistente/aprendizaje', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(origen === 'HUECO' ? { origen, huecoId: id } : { origen, valoracionId: id }) })
      const cuerpo = await respuestaHttp.json()
      if (!respuestaHttp.ok) throw new Error(cuerpo.error || 'No se ha podido crear la propuesta')
      abrirEdicion(cuerpo.propuesta)
      await cargar()
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se ha podido crear la propuesta') } finally { setAccionando(false) }
  }

  function abrirEdicion(propuesta: Propuesta) {
    setEnEdicion(propuesta); setPregunta(propuesta.pregunta); setRespuesta(propuesta.respuestaPropuesta); setEspacio('INTERNO')
  }

  async function decidir(accion: 'aprobar' | 'descartar') {
    if (!enEdicion) return
    setAccionando(true); setMensaje('')
    try {
      const respuestaHttp = await fetch(`/api/admin/asistente/aprendizaje/${enEdicion.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion, pregunta, respuesta, espacio }) })
      const cuerpo = await respuestaHttp.json()
      if (!respuestaHttp.ok) throw new Error(cuerpo.error || 'No se ha podido guardar la decisión')
      setMensaje(accion === 'aprobar' ? 'Respuesta aprobada e indexada al instante.' : 'Propuesta descartada.')
      setEnEdicion(null)
      await cargar()
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se ha podido guardar la decisión') } finally { setAccionando(false) }
  }

  return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6" aria-labelledby="titulo-aprendizaje">
    <header className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-orange-600">Asistente IA</p>
      <h1 id="titulo-aprendizaje" className="mt-1 text-2xl font-bold text-slate-900">Aprendizaje supervisado</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">Nada se publica automáticamente. Revisa cada propuesta y sus fuentes antes de aprobarla.</p>
    </header>
    <p aria-live="polite" className={mensaje ? 'rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-slate-800' : 'sr-only'}>{mensaje}</p>
    {cargando ? <div className="grid gap-4 md:grid-cols-2" aria-label="Cargando bandeja"><div className="h-48 animate-pulse rounded-xl border bg-slate-100" /><div className="h-48 animate-pulse rounded-xl border bg-slate-100" /></div> : <>
      <section className="rounded-xl border bg-white p-4 shadow-sm" aria-labelledby="huecos-titulo">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 id="huecos-titulo" className="text-lg font-bold text-slate-900">Preguntas pendientes</h2><p className="text-sm text-slate-600">Agrupadas por pregunta normalizada.</p></div><span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-700">{datos?.huecos.length || 0}</span></div>
        <div className="mt-4 divide-y">{datos?.huecos.length ? datos.huecos.map(hueco => <article key={hueco.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-slate-900">{hueco.pregunta}</h3><p className="mt-1 text-sm text-slate-600">{hueco.veces} vez{hueco.veces === 1 ? '' : 'es'} · {hueco.canales.join(', ')}</p></div>{puedeEscribir && <button disabled={accionando} onClick={() => void proponer('HUECO', hueco.id)} className={`${boton} bg-orange-600 text-white hover:bg-orange-700`}>Proponer respuesta</button>}</article>) : <p className="py-5 text-sm text-slate-600">No hay preguntas pendientes.</p>}</div>
      </section>
      <section className="rounded-xl border bg-white p-4 shadow-sm" aria-labelledby="propuestas-titulo"><h2 id="propuestas-titulo" className="text-lg font-bold text-slate-900">Propuestas para revisar</h2><div className="mt-4 grid gap-4 lg:grid-cols-2">{datos?.propuestas.length ? datos.propuestas.map(propuesta => <article key={propuesta.id} className="rounded-xl border p-4"><p className="text-xs font-bold tracking-wide text-orange-700">{propuesta.origen}</p><h3 className="mt-1 font-semibold text-slate-900">{propuesta.pregunta}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{propuesta.respuestaPropuesta || 'No hay fragmentos suficientes: requiere redactar una respuesta.'}</p><p className="mt-3 text-xs text-slate-500">{propuesta.fuentes.length} fuente{propuesta.fuentes.length === 1 ? '' : 's'} citada{propuesta.fuentes.length === 1 ? '' : 's'}</p>{puedeEscribir && <button onClick={() => abrirEdicion(propuesta)} className={`${boton} mt-3 border border-orange-600 text-orange-700 hover:bg-orange-50`}>Revisar propuesta</button>}</article>) : <p className="text-sm text-slate-600">Aún no hay propuestas pendientes.</p>}</div></section>
      <section className="rounded-xl border bg-white p-4 shadow-sm" aria-labelledby="valoraciones-titulo"><h2 id="valoraciones-titulo" className="text-lg font-bold text-slate-900">Valoraciones no útiles recientes</h2><div className="mt-3 divide-y">{datos?.valoracionesNegativas.length ? datos.valoracionesNegativas.map(valoracion => <article key={valoracion.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-slate-900">{valoracion.mensaje.textoAnon}</p>{valoracion.comentarioAnon && <p className="mt-1 text-sm text-slate-600">{valoracion.comentarioAnon}</p>}</div>{puedeEscribir && <button disabled={accionando} onClick={() => void proponer('VALORACION', valoracion.id)} className={`${boton} border border-orange-600 text-orange-700 hover:bg-orange-50`}>Proponer respuesta</button>}</article>) : <p className="py-4 text-sm text-slate-600">No hay valoraciones no útiles recientes.</p>}</div></section>
    </>}
    {enEdicion && <div role="dialog" aria-modal="true" aria-labelledby="editar-propuesta" className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4"><div className="mx-auto my-6 max-w-3xl rounded-xl bg-white p-5 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h2 id="editar-propuesta" className="text-xl font-bold text-slate-900">Revisar propuesta</h2><p className="mt-1 text-sm text-slate-600">La publicación sólo se realiza al aprobar.</p></div><button aria-label="Cerrar" onClick={() => setEnEdicion(null)} className={`${boton} border text-slate-700`}>Cerrar</button></div><label className="mt-5 block text-sm font-semibold text-slate-800">Pregunta<textarea value={pregunta} onChange={evento => setPregunta(evento.target.value)} maxLength={1600} className="mt-1 min-h-20 w-full rounded-lg border p-3 font-normal" /></label><label className="mt-4 block text-sm font-semibold text-slate-800">Respuesta<textarea value={respuesta} onChange={evento => setRespuesta(evento.target.value)} maxLength={6000} className="mt-1 min-h-36 w-full rounded-lg border p-3 font-normal" placeholder="Redacta una respuesta basada en las fuentes revisadas." /></label><label className="mt-4 block text-sm font-semibold text-slate-800">Espacio<select value={espacio} onChange={evento => setEspacio(evento.target.value as 'PUBLICO' | 'INTERNO')} className="mt-1 min-h-11 w-full rounded-lg border bg-white p-2 font-normal"><option value="INTERNO">Interno (predeterminado)</option><option value="PUBLICO">Público</option></select></label><div className="mt-5 rounded-lg bg-slate-50 p-3"><h3 className="font-semibold text-slate-900">Fuentes citadas</h3>{enEdicion.fuentes.length ? <ul className="mt-2 space-y-3">{enEdicion.fuentes.map(fuente => <li key={`${fuente.documentoId}-${fuente.versionId}`} className="text-sm"><p className="font-medium text-slate-800">{fuente.titulo}</p><p className="text-slate-600">{fuente.fragmento}</p></li>)}</ul> : <p className="mt-2 text-sm text-orange-700">No se han encontrado fuentes. Completa la respuesta sólo tras revisarla.</p>}</div><div className="mt-5 flex flex-wrap justify-end gap-3"><button disabled={accionando} onClick={() => void decidir('descartar')} className={`${boton} border border-slate-300 text-slate-700 hover:bg-slate-50`}>Descartar</button><button disabled={accionando || !pregunta.trim() || !respuesta.trim()} onClick={() => void decidir('aprobar')} className={`${boton} bg-orange-600 text-white hover:bg-orange-700`}>Aprobar e indexar</button></div></div></div>}
  </main>
}
