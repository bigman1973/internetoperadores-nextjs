'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'

interface PeticionPendiente {
  id: number
  titulo: string
  fechaResolucion: string | null
}

export default function PendingPetitionsAlert() {
  const [peticiones, setPeticiones] = useState<PeticionPendiente[]>([])

  useEffect(() => {
    let active = true
    fetch('/api/peticiones?resumen=validacion', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'No se pudieron consultar las peticiones')
        if (active) setPeticiones(data.peticiones || [])
      })
      .catch(error => console.error('Error cargando peticiones pendientes de validación:', error))

    return () => { active = false }
  }, [])

  if (peticiones.length === 0) return null

  return (
    <div className="mb-6 rounded-2xl border border-violet-300 bg-violet-50 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-violet-100 p-2.5">
            <ChatBubbleLeftRightIcon className="h-6 w-6 text-violet-700" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-violet-950">
              {peticiones.length === 1 ? 'Tienes una petición pendiente de validar' : `Tienes ${peticiones.length} peticiones pendientes de validar`}
            </p>
            <p className="mt-1 text-sm text-violet-800">Revisa lo realizado y confirma si cumple tus requisitos o indica qué ajustes necesitas.</p>
            <div className="mt-2 space-y-1">
              {peticiones.slice(0, 3).map(peticion => (
                <p key={peticion.id} className="truncate text-xs font-medium text-violet-900">#{peticion.id} · {peticion.titulo}</p>
              ))}
              {peticiones.length > 3 && <p className="text-xs text-violet-700">Y {peticiones.length - 3} más pendientes.</p>}
            </div>
          </div>
        </div>
        <Link href="/peticiones" className="shrink-0 rounded-lg bg-violet-700 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-violet-800">
          Revisar ahora
        </Link>
      </div>
    </div>
  )
}
