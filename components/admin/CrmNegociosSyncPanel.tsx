'use client'

import { useState } from 'react'
import { ArrowPathIcon, BriefcaseIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useRole } from './RoleContext'

type Preview = {
  pipelines: number
  stages: number
  deals: number
  openDeals: number
  associations: number
  contacts: number
}

export default function CrmNegociosSyncPanel() {
  const { hasAreaAccess, isSuperAdmin, isViewingAs } = useRole()
  const canWrite = !isViewingAs && (isSuperAdmin || hasAreaAccess('admin.crm.contactos', 'escritura'))
  const [loading, setLoading] = useState<'preview' | 'sync' | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const run = async (mode: 'preview' | 'sync') => {
    setLoading(mode)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/crm/negocios/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo completar la operación.')

      if (mode === 'preview') {
        setPreview(data.summary)
        setMessage({ type: 'success', text: `Comprobación completada: ${data.summary.deals.toLocaleString('es-ES')} negocios en ${data.summary.pipelines.toLocaleString('es-ES')} pipelines y ${data.summary.associations.toLocaleString('es-ES')} relaciones con contactos. Todavía no se ha modificado ningún dato local.` })
      } else {
        const result = data.result
        setPreview(null)
        setMessage({ type: 'success', text: `Actualización completada: ${result.negociosDetectados.toLocaleString('es-ES')} negocios, ${result.asociacionesDetectadas.toLocaleString('es-ES')} relaciones y ${result.contactosAsociados.toLocaleString('es-ES')} contactos asociados.${result.contactosNoDisponibles ? ` ${result.contactosNoDisponibles} contactos ya no están disponibles en HubSpot y se conservan como referencia.` : ''}` })
        window.setTimeout(() => window.location.reload(), 900)
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Error inesperado.' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <section className="rounded-xl border border-orange-200 bg-orange-50/70 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-3xl items-start gap-3">
          <div className="rounded-lg bg-white p-2 text-orange-700 shadow-sm"><BriefcaseIcon className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold text-gray-900">Importación final de pipelines y negocios</h2>
            <p className="mt-1 text-sm leading-6 text-gray-600">Comprueba y copia las oportunidades, sus etapas y los contactos asociados. La operación es de solo lectura en el sistema de origen: no cambia negocios ni envía comunicaciones.</p>
          </div>
        </div>
        {canWrite ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => run('preview')} disabled={loading !== null} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm font-semibold text-orange-800 shadow-sm hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60">
              <ArrowPathIcon className={`h-5 w-5 ${loading === 'preview' ? 'animate-spin' : ''}`} />
              {loading === 'preview' ? 'Comprobando…' : 'Comprobar origen'}
            </button>
            {preview && (
              <button type="button" onClick={() => run('sync')} disabled={loading !== null} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60">
                <ArrowPathIcon className={`h-5 w-5 ${loading === 'sync' ? 'animate-spin' : ''}`} />
                {loading === 'sync' ? 'Importando…' : 'Importar negocios'}
              </button>
            )}
          </div>
        ) : (
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-600">Solo lectura</span>
        )}
      </div>

      {preview && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Summary label="Pipelines" value={preview.pipelines} />
          <Summary label="Etapas" value={preview.stages} />
          <Summary label="Negocios" value={preview.deals} />
          <Summary label="Abiertos" value={preview.openDeals} />
          <Summary label="Contactos" value={preview.contacts} />
          <Summary label="Relaciones" value={preview.associations} />
        </div>
      )}

      {message && (
        <div className={`mt-4 flex gap-2 rounded-lg border px-3 py-3 text-sm ${message.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          {message.type === 'success' ? <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0" /> : <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />}
          <p>{message.text}</p>
        </div>
      )}
    </section>
  )
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-orange-100 bg-white px-3 py-2"><p className="text-xs font-medium text-gray-500">{label}</p><p className="mt-0.5 text-lg font-bold text-gray-900">{value.toLocaleString('es-ES')}</p></div>
}
