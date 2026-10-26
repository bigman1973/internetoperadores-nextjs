'use client'

import { useCallback, useEffect, useState } from 'react'

type LeadAsistente = {
  id: string
  conversacionId: string
  origen: 'ASISTENTE'
  tipo: 'EMPRESA' | 'HOGAR'
  codigoPostal: string
  urgencia: string
  resumen: string | null
  necesidades: string | null
  servicioRecomendado: string | null
  puntuacion: 'CALIENTE' | 'TEMPLADO' | 'FRIO'
  estado: 'NUEVO' | 'CONTACTADO' | 'CERRADO' | 'DESCARTADO'
  consentimiento: boolean
  createdAt: string
}

type Contacto = { nombre?: string; empresa?: string; email?: string; telefono?: string }

const ESTADOS = ['NUEVO', 'CONTACTADO', 'CERRADO', 'DESCARTADO'] as const
const PUNTUACIONES = ['CALIENTE', 'TEMPLADO', 'FRIO'] as const
const fecha = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' })

function clasePuntuacion(valor: LeadAsistente['puntuacion']): string {
  return valor === 'CALIENTE' ? 'bg-red-100 text-red-800' : valor === 'TEMPLADO' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
}

export default function AsistenteLeadsProjection() {
  const [leads, setLeads] = useState<LeadAsistente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [estado, setEstado] = useState('')
  const [puntuacion, setPuntuacion] = useState('')
  const [contactos, setContactos] = useState<Record<string, Contacto | null>>({})
  const [cargandoContacto, setCargandoContacto] = useState<string | null>(null)
  const [actualizando, setActualizando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    const parametros = new URLSearchParams({ origen: 'ASISTENTE' })
    if (estado) parametros.set('estado', estado)
    if (puntuacion) parametros.set('puntuacion', puntuacion)
    try {
      const respuesta = await fetch(`/api/admin/leads?${parametros}`, { cache: 'no-store' })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se han podido cargar los leads del asistente.')
      setLeads(Array.isArray(datos?.leads) ? datos.leads : [])
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se han podido cargar los leads del asistente.')
    } finally {
      setCargando(false)
    }
  }, [estado, puntuacion])

  useEffect(() => { void cargar() }, [cargar])

  async function verContacto(lead: LeadAsistente) {
    if (contactos[lead.id] !== undefined || cargandoContacto) return
    setCargandoContacto(lead.id)
    setError('')
    try {
      const respuesta = await fetch(`/api/admin/asistente/leads/${lead.id}/contacto`, { cache: 'no-store' })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se ha podido consultar el contacto.')
      setContactos(actual => ({ ...actual, [lead.id]: datos?.contacto || null }))
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se ha podido consultar el contacto.')
    } finally {
      setCargandoContacto(null)
    }
  }

  async function cambiarEstado(lead: LeadAsistente, nuevoEstado: string) {
    setActualizando(lead.id)
    setError('')
    try {
      const respuesta = await fetch(`/api/admin/asistente/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se ha podido actualizar el estado.')
      setLeads(actual => actual.map(item => item.id === lead.id ? { ...item, estado: nuevoEstado as LeadAsistente['estado'] } : item))
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se ha podido actualizar el estado.')
    } finally {
      setActualizando(null)
    }
  }

  return <section aria-labelledby="leads-asistente-titulo" className="space-y-5">
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-800">Origen filtrado</p>
      <h2 id="leads-asistente-titulo" className="mt-1 text-xl font-bold text-gray-900">Leads del asistente</h2>
      <p className="mt-1 text-sm text-gray-700">Proyección del mismo módulo de Leads. Los resúmenes están redactados; el contacto consentido se solicita de forma separada y con autorización granular.</p>
    </div>

    <form onSubmit={(evento) => { evento.preventDefault(); void cargar() }} className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">Puntuación
          <select value={puntuacion} onChange={evento => setPuntuacion(evento.target.value)} className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500">
            <option value="">Todas</option>{PUNTUACIONES.map(valor => <option key={valor}>{valor}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">Estado
          <select value={estado} onChange={evento => setEstado(evento.target.value)} className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500">
            <option value="">Todos</option>{ESTADOS.map(valor => <option key={valor}>{valor}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="min-h-11 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500">Aplicar filtros</button>
        <button type="button" onClick={() => { setEstado(''); setPuntuacion('') }} className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50">Limpiar</button>
      </div>
    </form>

    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="space-y-3">
      {cargando ? <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">Cargando leads del asistente…</div> : leads.length === 0 ? <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">No hay leads del asistente para estos filtros.</div> : leads.map(lead => {
        const contacto = contactos[lead.id]
        return <article key={lead.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-800">ASISTENTE</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${clasePuntuacion(lead.puntuacion)}`}>{lead.puntuacion}</span><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800">{lead.estado}</span></div>
            <time className="text-xs text-gray-500">{fecha.format(new Date(lead.createdAt))}</time>
          </div>
          <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <p className="text-sm font-semibold text-gray-900">{lead.tipo === 'EMPRESA' ? 'Empresa' : 'Hogar'} · urgencia {lead.urgencia.toLowerCase()}</p>
              <p className="mt-1 text-sm text-gray-700">{lead.resumen || lead.necesidades || 'Sin resumen disponible.'}</p>
              {lead.servicioRecomendado && <p className="mt-2 text-xs font-medium text-gray-600">Fuente recomendada: {lead.servicioRecomendado}</p>}
              {lead.consentimiento ? <div className="mt-3">{contacto === undefined ? <button type="button" onClick={() => void verContacto(lead)} disabled={cargandoContacto === lead.id} className="min-h-11 rounded-md border border-orange-300 px-3 text-sm font-semibold text-orange-800 hover:bg-orange-50 disabled:opacity-60">{cargandoContacto === lead.id ? 'Consultando contacto…' : 'Ver contacto consentido'}</button> : contacto ? <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-800"><p className="font-medium">{contacto.nombre || 'Contacto consentido'}</p>{contacto.empresa && <p>{contacto.empresa}</p>}{contacto.email && <p>{contacto.email}</p>}{contacto.telefono && <p>{contacto.telefono}</p>}</div> : <p className="text-sm text-gray-500">No hay contacto disponible.</p>}</div> : <p className="mt-3 text-sm text-gray-500">Sin consentimiento de contacto.</p>}
            </div>
            <label className="text-sm font-medium text-gray-700">Estado
              <select aria-label="Actualizar estado del lead de asistente" disabled={actualizando === lead.id} value={lead.estado} onChange={evento => void cambiarEstado(lead, evento.target.value)} className="mt-1 block min-h-11 min-w-40 rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:opacity-60">{ESTADOS.map(valor => <option key={valor}>{valor}</option>)}</select>
            </label>
          </div>
        </article>
      })}
    </div>
  </section>
}
