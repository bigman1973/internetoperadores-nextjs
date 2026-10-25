'use client'

import { useEffect, useState } from 'react'
import { ArrowPathIcon, InboxStackIcon } from '@heroicons/react/24/outline'

type Escalado = {
  id: string
  motivo: string
  estadoConversacion: string
  dentroHorario: boolean
  createdAt: string
}
type Contacto = { nombre?: string; email?: string; telefono?: string } | null

const formatoFecha = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' })

export default function BandejaEscalados() {
  const [items, setItems] = useState<Escalado[]>([])
  const [cargando, setCargando] = useState(true)
  const [cargandoContacto, setCargandoContacto] = useState<string | null>(null)
  const [contactos, setContactos] = useState<Record<string, Contacto>>({})
  const [mensaje, setMensaje] = useState('')
  const [siguienteCursor, setSiguienteCursor] = useState<string | null>(null)

  async function cargar(cursor?: string, acumular = false) {
    setCargando(true)
    setMensaje('')
    try {
      const parametros = new URLSearchParams({ limit: '20' })
      if (cursor) parametros.set('cursor', cursor)
      const respuesta = await fetch(`/api/admin/asistente/escalados?${parametros}`, { cache: 'no-store' })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se han podido cargar las solicitudes.')
      const nuevos = datos?.items || []
      setItems((previos) => acumular ? [...previos, ...nuevos] : nuevos)
      setSiguienteCursor(datos?.siguienteCursor || null)
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se han podido cargar las solicitudes.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  async function verContacto(id: string) {
    setCargandoContacto(id)
    setMensaje('')
    try {
      const respuesta = await fetch(`/api/admin/asistente/escalados/${id}/contacto`, { cache: 'no-store' })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se puede mostrar el contacto consentido.')
      setContactos((previos) => ({ ...previos, [id]: datos?.contacto || null }))
      if (!datos?.contacto) setMensaje('Esta solicitud no dispone de contacto consentido.')
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se puede mostrar el contacto consentido.')
    } finally {
      setCargandoContacto(null)
    }
  }

  return <section className="space-y-4" aria-labelledby="titulo-escalados">
    <header className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <InboxStackIcon className="mt-0.5 h-6 w-6 shrink-0 text-orange-600" aria-hidden="true" />
        <div>
          <h2 id="titulo-escalados" className="text-xl font-bold text-gray-900">Solicitudes de escalado</h2>
          <p className="mt-1 text-sm text-gray-700">Solicitudes recibidas fuera de un chat en vivo. No implican atención en tiempo real.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => cargar()} disabled={cargando} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:text-gray-500">
          <ArrowPathIcon className="h-5 w-5" aria-hidden="true" />Actualizar
        </button>
      </div>
    </header>

    <div className="space-y-3 sm:hidden">
      {cargando ? Array.from({ length: 3 }).map((_, indice) => <div key={indice} className="h-48 animate-pulse rounded-xl border border-gray-200 bg-gray-100" />) : items.length ? items.map((escalado) => <TarjetaEscalado key={escalado.id} escalado={escalado} contacto={contactos[escalado.id]} cargandoContacto={cargandoContacto === escalado.id} alVerContacto={verContacto} />) : <EstadoVacio />}
    </div>

    <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Motivo</th><th className="px-4 py-3">Conversación</th><th className="px-4 py-3">Horario</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Contacto</th></tr></thead>
          <tbody className="divide-y divide-gray-200">
            {cargando ? Array.from({ length: 4 }).map((_, indice) => <tr key={indice} className="animate-pulse"><td colSpan={5} className="h-20 px-4"><div className="h-4 w-2/3 rounded bg-gray-200" /></td></tr>) : items.length ? items.map((escalado) => <tr key={escalado.id} className="align-top hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-900">{etiquetaMotivo(escalado.motivo)}</td><td className="px-4 py-3 text-gray-700">{etiquetaEstado(escalado.estadoConversacion)}</td><td className="px-4 py-3 text-gray-700">{escalado.dentroHorario ? 'En horario' : 'Fuera de horario'}</td><td className="px-4 py-3 text-gray-700">{formatoFecha.format(new Date(escalado.createdAt))}</td><td className="px-4 py-3"><ContactoConsentido escalado={escalado} contacto={contactos[escalado.id]} cargando={cargandoContacto === escalado.id} alVerContacto={verContacto} /></td></tr>) : <tr><td colSpan={5} className="px-4 py-12"><EstadoVacio /></td></tr>}
          </tbody>
        </table>
      </div>
      {siguienteCursor && <div className="border-t border-gray-200 p-3 text-center"><button type="button" disabled={cargando} onClick={() => cargar(siguienteCursor, true)} className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:bg-gray-100">Cargar más</button></div>}
    </div>

    <p aria-live="polite" className="min-h-5 text-sm text-gray-700">{mensaje}</p>
  </section>
}

function TarjetaEscalado({ escalado, contacto, cargandoContacto, alVerContacto }: { escalado: Escalado; contacto: Contacto | undefined; cargandoContacto: boolean; alVerContacto: (id: string) => void }) {
  return <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <dl className="space-y-3 text-sm"><div><dt className="font-medium text-gray-500">Motivo</dt><dd className="mt-1 font-semibold text-gray-900">{etiquetaMotivo(escalado.motivo)}</dd></div><div><dt className="font-medium text-gray-500">Estado de conversación</dt><dd className="mt-1 text-gray-900">{etiquetaEstado(escalado.estadoConversacion)}</dd></div><div><dt className="font-medium text-gray-500">Horario y fecha</dt><dd className="mt-1 text-gray-900">{escalado.dentroHorario ? 'En horario' : 'Fuera de horario'} · {formatoFecha.format(new Date(escalado.createdAt))}</dd></div><div><dt className="font-medium text-gray-500">Contacto</dt><dd className="mt-1"><ContactoConsentido escalado={escalado} contacto={contacto} cargando={cargandoContacto} alVerContacto={alVerContacto} /></dd></div></dl>
  </article>
}

function ContactoConsentido({ escalado, contacto, cargando, alVerContacto }: { escalado: Escalado; contacto: Contacto | undefined; cargando: boolean; alVerContacto: (id: string) => void }) {
  if (contacto !== undefined) return contacto ? <ContactoVisible contacto={contacto} /> : <span className="text-sm text-gray-600">Sin contacto consentido</span>
  return <button type="button" disabled={cargando} onClick={() => alVerContacto(escalado.id)} className="min-h-11 rounded-md border border-orange-300 bg-white px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-wait disabled:text-gray-500">{cargando ? 'Comprobando consentimiento…' : 'Ver contacto consentido'}</button>
}

function ContactoVisible({ contacto }: { contacto: Exclude<Contacto, null> }) {
  const valores = [['Nombre', contacto.nombre], ['Teléfono', contacto.telefono], ['Correo', contacto.email]].filter(([, valor]) => Boolean(valor))
  return <dl className="space-y-1 text-sm text-gray-900">{valores.map(([etiqueta, valor]) => <div key={etiqueta}><dt className="sr-only">{etiqueta}</dt><dd>{valor}</dd></div>)}</dl>
}

function EstadoVacio() { return <p className="py-4 text-center text-sm text-gray-600">No hay solicitudes de escalado para mostrar.</p> }
function etiquetaMotivo(motivo: string): string { return ({ PETICION: 'Petición de ayuda', ENFADO: 'Conversación difícil', SIN_RESPUESTA: 'Sin respuesta suficiente', OTRO: 'Otro motivo' } as Record<string, string>)[motivo] || 'Otro motivo' }
function etiquetaEstado(estado: string): string { return ({ ABIERTA: 'Abierta', ESCALADA: 'Escalada', CERRADA: 'Cerrada' } as Record<string, string>)[estado] || 'No disponible' }
