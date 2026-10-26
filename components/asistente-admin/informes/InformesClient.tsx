'use client'

import { useState } from 'react'

type Propuesta = { id: string; titulo: string; detalle: string; impacto: number; esfuerzo: number; prioridad: number; estado: string }
type DatosInforme = {
  periodo?: { volumen?: Array<{ conversaciones: number; mensajes: number }>; huecosNuevos?: number }
  tendencias?: {
    ultimos7Dias?: { conversionLead?: { porcentaje: number }; satisfaccion?: { porcentajeUtil: number | null } }
    ultimos30Dias?: { conversionLead?: { porcentaje: number }; satisfaccion?: { porcentajeUtil: number | null } }
  }
  temas?: Array<{ preguntaNorm: string; veces: number; ejemploAnonimo: string; canales: string[] }>
  huecos?: Array<{ pregunta: string; propuesta: string; fuentes: Array<{ documentoId: string; titulo: string; fragmento: string; url: string | null }> }>
  serviciosSinOfertaDocumentada?: Array<{ solicitud: string; veces: number; aviso: string }>
  objeciones?: Array<{ categoria: string; total: number; ejemploAnonimo: string }>
  leadsCalientesPendientes?: { total: number; porEstado: Array<{ estado: string; total: number }> }
  salvaguardas?: { nota: string }
}
type Informe = { id: string; tipo: string; fechaLocal: string; periodoInicio: string; periodoFin: string; datos: DatosInforme; createdAt: string; propuestas: Propuesta[] }

const boton = 'min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

function Tarjeta({ etiqueta, valor, ayuda }: { etiqueta: string; valor: string | number; ayuda: string }) {
  return <article className="rounded-lg bg-slate-50 p-3"><p className="text-sm text-slate-600">{etiqueta}</p><p className="mt-1 text-xl font-bold text-slate-900">{valor}</p><p className="mt-1 text-xs text-slate-500">{ayuda}</p></article>
}

export default function InformesClient({ puedeEscribir, informeInicial }: { puedeEscribir: boolean; informeInicial: Informe | null }) {
  const [informe, setInforme] = useState(informeInicial)
  const [mensaje, setMensaje] = useState('')
  const [cargando, setCargando] = useState(false)

  async function generar(tipo: 'DIARIO' | 'SEMANAL' | 'MENSUAL') {
    setCargando(true); setMensaje('')
    try {
      const respuesta = await fetch('/api/admin/asistente/informes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo }) })
      const cuerpo = await respuesta.json()
      if (!respuesta.ok) throw new Error(cuerpo.error || 'No se ha podido generar el informe')
      if (cuerpo.informe) setInforme(cuerpo.informe)
      setMensaje(cuerpo.generado ? 'Informe generado.' : 'Ese informe ya estaba generado.')
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se ha podido generar el informe') } finally { setCargando(false) }
  }

  async function decidir(id: string, estado: 'ACEPTADA' | 'DESCARTADA' | 'HECHA') {
    setCargando(true); setMensaje('')
    try {
      const respuesta = await fetch(`/api/admin/asistente/informes/propuestas/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ estado }) })
      const cuerpo = await respuesta.json()
      if (!respuesta.ok) throw new Error(cuerpo.error || 'No se ha podido guardar la decisión')
      setInforme(anterior => anterior ? { ...anterior, propuestas: anterior.propuestas.map(propuesta => propuesta.id === id ? { ...propuesta, estado } : propuesta) } : anterior)
      setMensaje('Propuesta actualizada. La decisión queda registrada y no se puede sustituir desde este panel.')
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se ha podido guardar la decisión') } finally { setCargando(false) }
  }

  const datos = informe?.datos || {}
  const conversaciones = datos.periodo?.volumen?.reduce((total, fila) => total + fila.conversaciones, 0) || 0
  const utilidad7 = datos.tendencias?.ultimos7Dias?.satisfaccion?.porcentajeUtil
  const utilidad30 = datos.tendencias?.ultimos30Dias?.satisfaccion?.porcentajeUtil

  return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6" aria-labelledby="titulo-informes">
    <header className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-orange-600">Asistente IA</p>
      <h1 id="titulo-informes" className="mt-1 text-2xl font-bold text-slate-900">Informes y propuestas</h1>
      <p className="mt-2 text-sm text-slate-600">Los informes sólo se muestran en este panel. No se envía ningún aviso automáticamente.</p>
      {puedeEscribir && <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={cargando} onClick={() => void generar('DIARIO')} className={`${boton} bg-orange-600 text-white hover:bg-orange-700`}>Generar diario</button>
        <button disabled={cargando} onClick={() => void generar('SEMANAL')} className={`${boton} border border-orange-600 text-orange-700 hover:bg-orange-50`}>Generar semanal</button>
        <button disabled={cargando} onClick={() => void generar('MENSUAL')} className={`${boton} border border-orange-600 text-orange-700 hover:bg-orange-50`}>Generar mensual</button>
      </div>}
    </header>
    <p aria-live="polite" className={mensaje ? 'rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-slate-800' : 'sr-only'}>{mensaje}</p>
    {!informe ? <section className="rounded-xl border bg-white p-5 text-sm text-slate-600">Todavía no hay informes disponibles.</section> : <>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-xl font-bold text-slate-900">Informe {informe.tipo.toLowerCase()}</h2><p className="mt-1 text-sm text-slate-600">Periodo terminado el {new Date(informe.fechaLocal).toLocaleDateString('es-ES')}</p></div>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-700">{informe.propuestas.length} propuesta{informe.propuestas.length === 1 ? '' : 's'}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Tarjeta etiqueta="Conversaciones" valor={conversaciones} ayuda="Recuento del periodo" />
          <Tarjeta etiqueta="Huecos nuevos" valor={datos.periodo?.huecosNuevos || 0} ayuda="Consultas sin fuente suficiente" />
          <Tarjeta etiqueta="Leads calientes pendientes" valor={datos.leadsCalientesPendientes?.total || 0} ayuda="Sólo recuento por estado" />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Temas y ejemplos anonimizados</h2><div className="mt-3 space-y-3">{datos.temas?.length ? datos.temas.map(tema => <div key={tema.preguntaNorm} className="rounded-lg bg-slate-50 p-3"><p className="font-medium text-slate-800">{tema.preguntaNorm} · {tema.veces}</p><p className="mt-1 text-sm text-slate-600">{tema.ejemploAnonimo}</p></div>) : <p className="text-sm text-slate-600">No hay temas pendientes en este periodo.</p>}</div></article>
        <article className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Tendencias de 7 y 30 días</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><Tarjeta etiqueta="Conversión · 7 días" valor={`${datos.tendencias?.ultimos7Dias?.conversionLead?.porcentaje ?? 0} %`} ayuda="Conversaciones con lead" /><Tarjeta etiqueta="Conversión · 30 días" valor={`${datos.tendencias?.ultimos30Dias?.conversionLead?.porcentaje ?? 0} %`} ayuda="Conversaciones con lead" /><Tarjeta etiqueta="Utilidad · 7 días" valor={utilidad7 === null || utilidad7 === undefined ? '—' : `${utilidad7} %`} ayuda="Valoraciones útiles" /><Tarjeta etiqueta="Utilidad · 30 días" valor={utilidad30 === null || utilidad30 === undefined ? '—' : `${utilidad30} %`} ayuda="Valoraciones útiles" /></div></article>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Huecos y respuestas fundamentadas para revisión</h2><p className="mt-1 text-sm text-slate-600">No se publican ni se indexan automáticamente.</p><div className="mt-3 space-y-4">{datos.huecos?.length ? datos.huecos.map((hueco, indice) => <article key={`${hueco.pregunta}-${indice}`} className="rounded-lg border p-4"><h3 className="font-medium text-slate-900">{hueco.pregunta}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{hueco.propuesta}</p>{hueco.fuentes.length ? <ul className="mt-3 space-y-1 text-xs text-slate-600">{hueco.fuentes.map(fuente => <li key={fuente.documentoId}><strong>{fuente.titulo}:</strong> {fuente.fragmento}</li>)}</ul> : <p className="mt-3 text-xs font-medium text-orange-700">Sin fuente pública suficiente: requiere redacción humana.</p>}</article>) : <p className="text-sm text-slate-600">No hay huecos para revisar.</p>}</div></section>

      <section className="grid gap-6 lg:grid-cols-3">
        <article className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Servicios sin oferta documentada</h2>{datos.serviciosSinOfertaDocumentada?.length ? <ul className="mt-3 space-y-3 text-sm">{datos.serviciosSinOfertaDocumentada.map(servicio => <li key={servicio.solicitud}><strong>{servicio.solicitud}</strong> · {servicio.veces}<p className="mt-1 text-slate-600">{servicio.aviso}</p></li>)}</ul> : <p className="mt-3 text-sm text-slate-600">No hay solicitudes sin fuente pública.</p>}</article>
        <article className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Objeciones frecuentes</h2>{datos.objeciones?.length ? <ul className="mt-3 space-y-3 text-sm">{datos.objeciones.map(objecion => <li key={objecion.categoria}><strong>{objecion.categoria}</strong> · {objecion.total}<p className="mt-1 text-slate-600">{objecion.ejemploAnonimo}</p></li>)}</ul> : <p className="mt-3 text-sm text-slate-600">No hay objeciones detectadas.</p>}</article>
        <article className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Leads calientes pendientes</h2><p className="mt-3 text-2xl font-bold text-slate-900">{datos.leadsCalientesPendientes?.total || 0}</p><p className="text-sm text-slate-600">Sólo recuentos por estado; sin datos personales.</p><ul className="mt-3 text-sm text-slate-700">{datos.leadsCalientesPendientes?.porEstado.map(fila => <li key={fila.estado}>{fila.estado}: {fila.total}</li>)}</ul></article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Propuestas de mejora">{informe.propuestas.length ? informe.propuestas.map(propuesta => <article key={propuesta.id} className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><h3 className="font-bold text-slate-900">{propuesta.titulo}</h3><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{propuesta.estado}</span></div><p className="mt-2 text-sm text-slate-600">{propuesta.detalle}</p><p className="mt-3 text-xs text-slate-500">Impacto {propuesta.impacto}/5 · Esfuerzo {propuesta.esfuerzo}/5 · Prioridad {propuesta.prioridad}</p>{puedeEscribir && propuesta.estado === 'PENDIENTE' && <div className="mt-4 flex flex-wrap gap-2"><button disabled={cargando} onClick={() => void decidir(propuesta.id, 'ACEPTADA')} className={`${boton} bg-orange-600 text-white hover:bg-orange-700`}>Aceptar</button><button disabled={cargando} onClick={() => void decidir(propuesta.id, 'DESCARTADA')} className={`${boton} border border-slate-300 text-slate-700 hover:bg-slate-50`}>Descartar</button><button disabled={cargando} onClick={() => void decidir(propuesta.id, 'HECHA')} className={`${boton} border border-orange-600 text-orange-700 hover:bg-orange-50`}>Ya hecho</button></div>}</article>) : <p className="rounded-xl border bg-white p-5 text-sm text-slate-600">No se han detectado propuestas de mejora para este periodo.</p>}</section>
      <p className="text-xs text-slate-500">{datos.salvaguardas?.nota}</p>
    </>}
  </main>
}
