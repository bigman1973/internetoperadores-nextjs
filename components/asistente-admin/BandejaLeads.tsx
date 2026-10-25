'use client'

import { useEffect, useState } from 'react'
import { ArrowPathIcon, InboxStackIcon } from '@heroicons/react/24/outline'

type Contacto = { nombre: string | null; empresa: string | null; email: string | null; telefono: string | null }
type Lead = { id: string; conversacionId: string; tipo: string; codigoPostal: string; urgencia: string; resumen: string | null; necesidades: string | null; servicioRecomendado: string | null; puntuacion: string; estado: string; consentimiento: boolean; contacto: Contacto | null; createdAt: string; updatedAt: string }
type Escalado = { id: string; conversacionId: string; motivo: string; dentroHorario: boolean; preferencia: string | null; franja: string | null; consentimiento: boolean; estado: string; createdAt: string; contacto: Omit<Contacto, 'empresa'> | null }
const fecha = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' })
const ESTADOS_LEAD = ['NUEVO', 'CONTACTADO', 'CERRADO', 'DESCARTADO']
const ESTADOS_ESCALADO = ['PENDIENTE', 'ATENDIDO', 'DESCARTADO']

export default function BandejaLeads({ puedeEscribir }: { puedeEscribir: boolean }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [escalados, setEscalados] = useState<Escalado[]>([])
  const [nuevos, setNuevos] = useState(0)
  const [filtros, setFiltros] = useState({ estado: '', puntuacion: '', tipo: '' })
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState('')

  async function cargar() {
    setCargando(true); setMensaje('')
    try {
      const parametros = new URLSearchParams({ limit: '50' })
      Object.entries(filtros).forEach(([clave, valor]) => { if (valor) parametros.set(clave, valor) })
      const [respuestaLeads, respuestaEscalados] = await Promise.all([fetch(`/api/admin/asistente/leads?${parametros}`, { cache: 'no-store' }), fetch('/api/admin/asistente/escalados?limit=50', { cache: 'no-store' })])
      const datosLeads = await respuestaLeads.json().catch(() => null); const datosEscalados = await respuestaEscalados.json().catch(() => null)
      if (!respuestaLeads.ok) throw new Error(datosLeads?.error || 'No se han podido cargar los leads.')
      if (!respuestaEscalados.ok) throw new Error(datosEscalados?.error || 'No se han podido cargar los escalados.')
      setLeads(datosLeads?.items || []); setNuevos(datosLeads?.nuevos || 0); setEscalados(datosEscalados?.items || [])
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se ha podido cargar la bandeja.') } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [])

  async function cambiarLead(id: string, estado: string) {
    if (!puedeEscribir) return
    setGuardando(id); setMensaje('')
    try {
      const respuesta = await fetch(`/api/admin/asistente/leads/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ estado }) })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se ha podido actualizar el lead.')
      setMensaje('Estado del lead actualizado.'); await cargar()
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se ha podido actualizar el lead.') } finally { setGuardando(null) }
  }
  async function cambiarEscalado(id: string, estado: string) {
    if (!puedeEscribir) return
    setGuardando(id); setMensaje('')
    try {
      const respuesta = await fetch(`/api/admin/asistente/escalados/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ estado }) })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se ha podido actualizar el escalado.')
      setMensaje('Estado del escalado actualizado.'); await cargar()
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se ha podido actualizar el escalado.') } finally { setGuardando(null) }
  }

  return <div className="space-y-6">
    <div className="sm:flex sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><InboxStackIcon className="h-7 w-7 text-orange-600" aria-hidden="true" /><h1 className="text-2xl font-bold text-gray-900">Leads del asistente</h1></div><p className="mt-1 text-sm text-gray-600">Bandeja interna. Los datos de contacto sólo se muestran cuando existe consentimiento.</p></div><div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 sm:mt-0"><p className="text-xs font-medium uppercase tracking-wide text-orange-800">Leads nuevos</p><p className="text-2xl font-bold tabular-nums text-orange-700">{nuevos}</p></div></div>
    {!puedeEscribir && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Tienes acceso de lectura. No puedes modificar los estados.</p>}
    <form onSubmit={(evento) => { evento.preventDefault(); cargar() }} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className="grid gap-3 sm:grid-cols-3"><Select etiqueta="Estado" valor={filtros.estado} opciones={ESTADOS_LEAD} alCambiar={(estado) => setFiltros((v) => ({ ...v, estado }))} /><Select etiqueta="Puntuación" valor={filtros.puntuacion} opciones={['CALIENTE', 'TEMPLADO', 'FRIO']} alCambiar={(puntuacion) => setFiltros((v) => ({ ...v, puntuacion }))} /><Select etiqueta="Tipo" valor={filtros.tipo} opciones={['EMPRESA', 'HOGAR']} alCambiar={(tipo) => setFiltros((v) => ({ ...v, tipo }))} /></div><div className="mt-4 flex flex-wrap gap-2"><button className="min-h-11 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500">Aplicar filtros</button><button type="button" onClick={() => { setFiltros({ estado: '', puntuacion: '', tipo: '' }); window.setTimeout(cargar, 0) }} className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50">Limpiar</button><button type="button" onClick={cargar} className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-orange-700 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500"><ArrowPathIcon className="h-5 w-5" aria-hidden="true" />Actualizar</button></div></form>
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-200 px-4 py-4"><h2 className="font-semibold text-gray-900">Bandeja de leads</h2></div><div className="overflow-x-auto"><table className="min-w-[960px] w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Contacto</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Puntuación</th><th className="px-4 py-3">Resumen</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Acción</th></tr></thead><tbody className="divide-y divide-gray-200">{cargando ? Array.from({ length: 4 }).map((_, i) => <tr key={i} className="animate-pulse"><td colSpan={7} className="h-20 px-4"><div className="h-4 w-3/4 rounded bg-gray-200" /></td></tr>) : leads.length ? leads.map((lead) => <tr key={lead.id} className="align-top hover:bg-gray-50"><td className="px-4 py-3">{lead.contacto ? <><p className="font-medium text-gray-900">{lead.contacto.nombre}</p>{lead.contacto.empresa && <p className="text-xs text-gray-600">{lead.contacto.empresa}</p>}{lead.contacto.email && <p className="text-xs text-gray-600">{lead.contacto.email}</p>}{lead.contacto.telefono && <p className="text-xs text-gray-600">{lead.contacto.telefono}</p>}</> : <span className="text-gray-500">Sin consentimiento de contacto</span>}</td><td className="px-4 py-3 text-gray-700">{lead.tipo}<br /><span className="text-xs">{lead.urgencia}</span></td><td className="px-4 py-3"><EtiquetaPuntuacion valor={lead.puntuacion} /></td><td className="max-w-xs px-4 py-3 text-gray-700">{lead.resumen || lead.necesidades || 'Sin resumen'}</td><td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800">{lead.estado}</span></td><td className="px-4 py-3 text-gray-700">{fecha.format(new Date(lead.createdAt))}</td><td className="px-4 py-3">{puedeEscribir ? <select aria-label={`Estado para lead ${lead.id}`} disabled={guardando === lead.id} value={lead.estado} onChange={(evento) => cambiarLead(lead.id, evento.target.value)} className="min-h-11 rounded-md border-gray-300 text-sm text-gray-900 focus:border-orange-500 focus:ring-orange-500">{ESTADOS_LEAD.map((estado) => <option key={estado}>{estado}</option>)}</select> : '—'}</td></tr>) : <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-600">No hay leads para estos filtros.</td></tr>}</tbody></table></div></section>
    <section id="escalados" className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-200 px-4 py-4"><h2 className="font-semibold text-gray-900">Bandeja de escalados</h2></div><div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Motivo</th><th className="px-4 py-3">Contacto</th><th className="px-4 py-3">Horario</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acción</th></tr></thead><tbody className="divide-y divide-gray-200">{cargando ? Array.from({ length: 3 }).map((_, i) => <tr key={i} className="animate-pulse"><td colSpan={6} className="h-20 px-4"><div className="h-4 w-2/3 rounded bg-gray-200" /></td></tr>) : escalados.length ? escalados.map((escalado) => <tr key={escalado.id} className="hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-900">{escalado.motivo}</td><td className="px-4 py-3 text-gray-700">{escalado.contacto ? <>{escalado.contacto.nombre || 'Sin nombre'}{escalado.contacto.email && <span className="block text-xs">{escalado.contacto.email}</span>}{escalado.contacto.telefono && <span className="block text-xs">{escalado.contacto.telefono}</span>}</> : <span className="text-gray-500">Sin consentimiento de contacto</span>}</td><td className="px-4 py-3 text-gray-700">{escalado.dentroHorario ? 'Dentro de horario' : 'Fuera de horario'}{escalado.franja && <span className="block text-xs">{escalado.franja}</span>}</td><td className="px-4 py-3 text-gray-700">{fecha.format(new Date(escalado.createdAt))}</td><td className="px-4 py-3"><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{escalado.estado}</span></td><td className="px-4 py-3">{puedeEscribir ? <select aria-label={`Estado para escalado ${escalado.id}`} disabled={guardando === escalado.id} value={escalado.estado} onChange={(evento) => cambiarEscalado(escalado.id, evento.target.value)} className="min-h-11 rounded-md border-gray-300 text-sm text-gray-900 focus:border-orange-500 focus:ring-orange-500">{ESTADOS_ESCALADO.map((estado) => <option key={estado}>{estado}</option>)}</select> : '—'}</td></tr>) : <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-600">No hay escalados pendientes.</td></tr>}</tbody></table></div></section>
    <p aria-live="polite" className="min-h-5 text-sm text-gray-700">{mensaje}</p>
  </div>
}
function Select({ etiqueta, valor, opciones, alCambiar }: { etiqueta: string; valor: string; opciones: string[]; alCambiar: (valor: string) => void }) { return <label className="text-sm font-medium text-gray-700">{etiqueta}<select value={valor} onChange={(evento) => alCambiar(evento.target.value)} className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500"><option value="">Todos</option>{opciones.map((opcion) => <option key={opcion}>{opcion}</option>)}</select></label> }
function EtiquetaPuntuacion({ valor }: { valor: string }) { const estilo = valor === 'CALIENTE' ? 'bg-red-100 text-red-800' : valor === 'TEMPLADO' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'; return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${estilo}`}>{valor}</span> }
