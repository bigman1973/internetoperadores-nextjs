'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import { BOTON_PRINCIPAL, leerRespuesta, mensajeError } from '@/lib/area8/ui'

interface PeticionPendiente { id: number; titulo: string; fechaResolucion: string | null }
interface ResumenValidacion { peticiones: PeticionPendiente[]; total: number }

export default function PendingPetitionsAlert({ asEmail, asName }: { asEmail?: string | null; asName?: string | null }) {
  const [peticiones, setPeticiones] = useState<PeticionPendiente[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const loading = loadedFor !== (asEmail || '')

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const params = new URLSearchParams({ resumen: 'validacion' })
    if (asEmail) params.set('as', asEmail)
    fetch(`/api/peticiones?${params.toString()}`, { cache: 'no-store', signal: controller.signal })
      .then(response => leerRespuesta<ResumenValidacion>(response, 'No se han podido consultar las peticiones pendientes de validación.'))
      .then(data => { if (active) { setPeticiones(data.peticiones || []); setTotal(data.total ?? data.peticiones?.length ?? 0); setError('') } })
      .catch(e => { if (active) { setPeticiones([]); setTotal(0); setError(mensajeError(e, 'No se han podido consultar las peticiones pendientes de validación.')) } })
      .finally(() => { if (active) setLoadedFor(asEmail || '') })
    return () => { active = false; controller.abort() }
  }, [asEmail])

  const href = asEmail ? `/peticiones?as=${encodeURIComponent(asEmail)}` : '/peticiones'
  if (loading) return null
  if (error) return <div role="status" className="mb-6 min-w-0 max-w-full rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-[#2D2A26] [overflow-wrap:anywhere]"><p>{error}</p><Link href={href} className="mt-2 inline-flex min-h-11 items-center font-semibold text-orange-800 underline">Consultar mis peticiones</Link></div>
  if (total === 0) return null

  return (
    <div className="mb-6 min-w-0 max-w-full rounded-2xl border border-orange-200 bg-orange-50 p-4 text-[#2D2A26] shadow-sm [overflow-wrap:anywhere] sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 rounded-xl bg-white p-2.5"><ChatBubbleLeftRightIcon className="h-6 w-6 text-[#FF5300]" aria-hidden="true" /></div>
          <div className="min-w-0">
            <p className="font-semibold">{asEmail
              ? `${asName || 'Este usuario'} tiene ${total === 1 ? 'una petición pendiente de validar' : `${total} peticiones pendientes de validar`}`
              : total === 1 ? 'Tienes una petición pendiente de validar' : `Tienes ${total} peticiones pendientes de validar`}</p>
            <p className="mt-1 text-sm">{asEmail ? 'Puedes revisar las entregas en modo lectura. La conformidad debe enviarla el propio solicitante.' : 'Revisa lo realizado y confirma si cumple tus requisitos o indica qué ajustes necesitas.'}</p>
            <div className="mt-2 space-y-1">{peticiones.slice(0, 3).map(peticion => <p key={peticion.id} className="text-xs font-medium">#{peticion.id} · {peticion.titulo}</p>)}{total > 3 && <p className="text-xs">Y {total - 3} más pendientes.</p>}</div>
          </div>
        </div>
        <Link href={href} className={`${BOTON_PRINCIPAL} shrink-0 text-center`}>Revisar ahora</Link>
      </div>
    </div>
  )
}
