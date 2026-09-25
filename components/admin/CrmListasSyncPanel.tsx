'use client'

import { useState } from 'react'
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useRole } from './RoleContext'

type Preview = {
  total: number
  active: number
  static: number
  contacts: number
  companies: number
  deals: number
}

export default function CrmListasSyncPanel() {
  const { hasAreaAccess, isSuperAdmin, isViewingAs } = useRole()
  const canWrite = !isViewingAs && (isSuperAdmin || hasAreaAccess('admin.crm.listas', 'escritura'))
  const [loading, setLoading] = useState<'preview' | 'sync' | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  if (!canWrite) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-semibold text-gray-900">Consulta en modo lectura</p>
        <p className="mt-1 text-sm leading-6 text-gray-600">Puedes revisar nombres, criterios y miembros. La sincronización está reservada a usuarios con permiso de escritura.</p>
      </div>
    )
  }

  const callSync = async (mode: 'preview' | 'sync') => {
    setLoading(mode)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/crm/listas/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo completar la operación.')

      if (mode === 'preview') {
        setPreview(data.summary)
        setMessage({ type: 'success', text: `Comprobación completada: HubSpot devuelve ${data.summary.total} segmentos. Todavía no se ha modificado ningún dato local.` })
      } else {
        const result = data.result
        setMessage({
          type: result.errores ? 'error' : 'success',
          text: `Sincronización finalizada: ${result.listasDetectadas} listas, ${result.miembrosDetectados.toLocaleString('es-ES')} membresías, ${result.registrosActualizados.toLocaleString('es-ES')} contactos y ${Number(result.propiedadesDetectadas || 0).toLocaleString('es-ES')} campos HubSpot revisados${result.errores ? `, con ${result.errores} avisos` : ''}.`,
        })
        setPreview(null)
        window.setTimeout(() => window.location.reload(), 900)
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Error inesperado.' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <p className="font-semibold text-gray-900">Actualizar desde HubSpot</p>
          <p className="mt-1 text-sm leading-6 text-gray-600">
            Primero comprueba el inventario. Después podrás copiar nombres, tipo, criterios y miembros al CRM. Es una lectura: no cambia listas ni contactos en HubSpot y no envía correos.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => callSync('preview')}
            disabled={loading !== null}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm font-semibold text-orange-800 shadow-sm hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ArrowPathIcon className={`h-5 w-5 ${loading === 'preview' ? 'animate-spin' : ''}`} />
            {loading === 'preview' ? 'Comprobando…' : 'Comprobar cambios'}
          </button>
          {preview && (
            <button
              type="button"
              onClick={() => callSync('sync')}
              disabled={loading !== null}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ArrowPathIcon className={`h-5 w-5 ${loading === 'sync' ? 'animate-spin' : ''}`} />
              {loading === 'sync' ? 'Sincronizando…' : `Sincronizar ${preview.total} listas`}
            </button>
          )}
        </div>
      </div>

      {preview && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Summary label="Total" value={preview.total} />
          <Summary label="Activas" value={preview.active} />
          <Summary label="Estáticas" value={preview.static} />
          <Summary label="Contactos" value={preview.contacts} />
          <Summary label="Otros objetos" value={preview.companies + preview.deals} />
        </div>
      )}

      {message && (
        <div className={`mt-4 flex gap-2 rounded-lg border px-3 py-3 text-sm ${message.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          {message.type === 'success' ? <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0" /> : <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />}
          <p>{message.text}</p>
        </div>
      )}
    </div>
  )
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-orange-100 bg-white px-3 py-2">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-gray-900">{value.toLocaleString('es-ES')}</p>
    </div>
  )
}
